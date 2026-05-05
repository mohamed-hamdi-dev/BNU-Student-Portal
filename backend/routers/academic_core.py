import json
import csv
import io
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.orm import Session

from core.deps import get_current_user, get_db, require_role
from core.academic_engine import AcademicRegulationsEngine
from core.registration_conflicts import validate_schedule_conflicts
from models.academic_core import (
    AssessmentTemplate,
    AssessmentTemplateComponent,
    AcademicAuditLog,
    College,
    CollegeCreditPolicyTier,
    CollegeTrack,
    CourseCatalog,
    GradingScale,
    GradingScaleItem,
    CourseOffering,
    CoursePrerequisite,
    CurriculumPlan,
    GradeBook,
    ProgramRegulation,
    RegistrationCourseSelection,
    RegistrationRequest,
    RegistrationWindow,
    StudentAcademicProfile,
    StudentFinanceStatus,
    SystemNotification,
)
from models.academic import AcademicState
from models.payment import PaymentRecord, StudentFinanceClearance
from models.user import User
from schemas.academic_core import (
    AssessmentTemplateCreate,
    AssessmentTemplateResponse,
    AuditLogResponse,
    CollegeCreate,
    CollegeResponse,
    CollegeUpdate,
    CreditPolicyTierReplaceRequest,
    CreditPolicyTierResponse,
    CourseCatalogCreate,
    CourseCatalogResponse,
    CoursePrerequisiteCreate,
    CoursePrerequisiteResponse,
    FinanceStatusResponse,
    FinanceStatusUpdate,
    GradeBookResponse,
    GradeEntryUpsert,
    GradePublishUpdate,
    GradingScaleCreate,
    GradingScaleResponse,
    OfferingCreate,
    OfferingUpdate,
    OfferingResponse,
    RegistrationRequestResponse,
    RegistrationSelectionResponse,
    AdvisorRegistrationDecision,
    AdvisorRegistrationRequestCreate,
    AdvisorRegistrationManagePayload,
    RegistrationStatusUpdate,
    RegistrationSubmit,
    RegistrationWindowCreate,
    RegistrationWindowResponse,
    RegistrationWindowUpdate,
    RegistrationWindowStatusUpdate,
    ProgramRegulationCreate,
    ProgramRegulationResponse,
    StudentProfileResponse,
    StudentProfileUpsert,
    StudentEligibilityResponse,
    StudentAcademicMetricsUpdate,
    TrackCreate,
    TrackResponse,
)

router = APIRouter(prefix="/academic-core", tags=["academic-core"])
logger = logging.getLogger(__name__)
REGISTRATION_PERIOD_STATUSES = {"OPEN", "CLOSED", "PENDING_REVIEW", "APPROVED", "LOCKED"}
# Requests that reserve seats in section capacity calculations.
# "rejected" is intentionally excluded, because rejected workflows should not
# consume seats.
SEAT_OCCUPYING_REQUEST_STATUSES = {
    "draft",
    "submitted",
    "advisor_requested",
    "advisor_approved",
    "need_info",
    "registered",
    "locked",
    "approved",
}


def ensure_academic_core_schema(db: Session) -> None:
    inspector = inspect(db.bind)
    try:
        columns = {str(col.get("name") or "").strip().lower() for col in inspector.get_columns("ac_registration_selections")}
    except Exception:
        columns = set()
    if "display_title" not in columns:
        dialect = str(getattr(db.bind.dialect, "name", "") or "").lower()
        ddl = "TEXT" if dialect == "sqlite" else "VARCHAR(255)"
        try:
            db.execute(text(f"ALTER TABLE ac_registration_selections ADD COLUMN display_title {ddl}"))
            db.commit()
        except Exception:
            db.rollback()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _safe_json_load(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        parsed = json.loads(value)
        return parsed if parsed is not None else fallback
    except Exception:
        return fallback


def _normalize_section_token(value: Any) -> str:
    raw = str(value or "").strip().upper()
    if not raw:
        return "G1"
    cleaned = "".join(ch for ch in raw if ch.isalnum() or ch in {"-", "_"})
    return cleaned or "G1"


def _sync_offerings_from_academic_state(db: Session, academic_year_label: str, semester: str) -> None:
    state = db.query(AcademicState).order_by(AcademicState.updated_at.desc()).first()
    if not state:
        return
    courses = _safe_json_load(getattr(state, "courses_json", None), [])
    if not isinstance(courses, list) or not courses:
        return

    semester_key = str(semester or "").strip().lower()
    for course_item in courses:
        if not isinstance(course_item, dict):
            continue
        course_sem = str(course_item.get("semester") or "").strip().lower()
        if course_sem and course_sem != semester_key:
            continue
        course_code = str(course_item.get("id") or course_item.get("code") or "").strip().upper()
        if not course_code:
            continue
        course_row = db.query(CourseCatalog).filter(func.upper(CourseCatalog.code) == course_code).first()
        if not course_row:
            continue
        groups = course_item.get("groups")
        if not isinstance(groups, list):
            continue

        desired_sections: set[str] = set()
        for group in groups:
            if not isinstance(group, dict):
                continue
            section = _normalize_section_token(group.get("targetGroupId") or group.get("name") or group.get("id"))
            desired_sections.add(section)
            max_students = group.get("capacity")
            try:
                max_students = int(max_students) if max_students is not None and str(max_students).strip() != "" else None
            except Exception:
                max_students = None

            row = (
                db.query(CourseOffering)
                .filter(
                    CourseOffering.course_id == course_row.id,
                    CourseOffering.academic_year_label == academic_year_label,
                    CourseOffering.semester == semester,
                    CourseOffering.section == section,
                )
                .first()
            )

            start_time = str(group.get("start") or "").strip() or None
            end_time = None
            try:
                duration = int(group.get("duration") or 2) if str(group.get("duration") or "").strip() else 2
                if start_time and ":" in start_time:
                    sh, sm = [int(x) for x in start_time.split(":")]
                    end_time = f"{sh + duration:02d}:{sm:02d}"
            except Exception:
                end_time = None

            if row:
                row.target_group_id = str(group.get("targetGroupId") or section)
                row.target_group_name = str(group.get("name") or section)
                row.day_of_week = str(group.get("day") or row.day_of_week or "")
                row.start_time = start_time or row.start_time
                row.end_time = end_time or row.end_time
                row.room_name = str(group.get("hall") or row.room_name or "")
                row.max_students = max_students if max_students is not None else row.max_students
                row.is_active = True
            else:
                db.add(
                    CourseOffering(
                        course_id=course_row.id,
                        academic_year_label=academic_year_label,
                        semester=semester,
                        section=section,
                        target_group_id=str(group.get("targetGroupId") or section),
                        target_group_name=str(group.get("name") or section),
                        day_of_week=str(group.get("day") or "").strip() or None,
                        start_time=start_time,
                        end_time=end_time,
                        room_name=str(group.get("hall") or "").strip() or None,
                        instructor_user_id=None,
                        max_students=max_students,
                        is_active=True,
                    )
                )

        # If this course has explicit groups in academic_state, keep offerings aligned:
        # deactivate stale sections that are no longer configured in CourseManagement.
        if desired_sections:
            stale_rows = (
                db.query(CourseOffering)
                .filter(
                    CourseOffering.course_id == course_row.id,
                    CourseOffering.academic_year_label == academic_year_label,
                    CourseOffering.semester == semester,
                    CourseOffering.is_active == True,  # noqa: E712
                    ~CourseOffering.section.in_(list(desired_sections)),
                )
                .all()
            )
            for stale in stale_rows:
                stale.is_active = False

    db.flush()


def _log_audit(db: Session, actor_user_id: int | None, entity_type: str, entity_id: str, action: str, before: Any = None, after: Any = None) -> None:
    db.add(
        AcademicAuditLog(
            actor_user_id=actor_user_id,
            entity_type=entity_type,
            entity_id=str(entity_id),
            action=action,
            before_json=_to_json(before) if before is not None else None,
            after_json=_to_json(after) if after is not None else None,
        )
    )


def seed_default_assessment_templates(db: Session) -> None:
    """Seed global default grading scale and assessment templates if missing."""
    default_scale = db.query(GradingScale).filter(GradingScale.code == "DEFAULT_ABCD").first()
    if not default_scale:
        default_scale = GradingScale(
            code="DEFAULT_ABCD",
            name_ar="ط§ظ„ظ†ط¸ط§ظ… ط§ظ„ط§ظپطھط±ط§ط¶ظٹ ظ„ظ„طھظ‚ط¯ظٹط±ط§طھ",
            name_en="Default ABCD Scale",
            is_default=True,
            is_active=True,
        )
        db.add(default_scale)
        db.flush()
        for item in [
            {"grade_code": "A", "label_ar": "ط§ظ…طھظٹط§ط²", "label_en": "Excellent", "min_percentage": 90, "max_percentage": 100, "gpa_points": 4.0, "is_passing": True, "sort_order": 1},
            {"grade_code": "B", "label_ar": "ط¬ظٹط¯ ط¬ط¯ط§", "label_en": "Very Good", "min_percentage": 80, "max_percentage": 89.99, "gpa_points": 3.0, "is_passing": True, "sort_order": 2},
            {"grade_code": "C", "label_ar": "ط¬ظٹط¯", "label_en": "Good", "min_percentage": 70, "max_percentage": 79.99, "gpa_points": 2.0, "is_passing": True, "sort_order": 3},
            {"grade_code": "D", "label_ar": "ظ…ظ‚ط¨ظˆظ„", "label_en": "Pass", "min_percentage": 60, "max_percentage": 69.99, "gpa_points": 1.0, "is_passing": True, "sort_order": 4},
            {"grade_code": "F", "label_ar": "ط±ط§ط³ط¨", "label_en": "Fail", "min_percentage": 0, "max_percentage": 59.99, "gpa_points": 0.0, "is_passing": False, "sort_order": 5},
        ]:
            db.add(GradingScaleItem(scale_id=default_scale.id, **item))

    template_defs = [
        {
            "code": "TEMPLATE_100_DEFAULT",
            "name_ar": "ظ†ط¸ط§ظ… 100 ط¯ط±ط¬ط© (ظ…ظٹط¯1 + ظ…ظٹط¯2 + ط£ط¹ظ…ط§ظ„ ط³ظ†ط© + ظ†ظ‡ط§ط¦ظٹ)",
            "name_en": "100 Marks (mid1+mid2+coursework+final)",
            "components": [
                {"key": "mid1", "label_ar": "ظ…ظٹط¯ 1", "label_en": "Mid 1", "max_marks": 15, "display_order": 1},
                {"key": "mid2", "label_ar": "ظ…ظٹط¯ 2", "label_en": "Mid 2", "max_marks": 15, "display_order": 2},
                {"key": "coursework", "label_ar": "ط£ط¹ظ…ط§ظ„ ط§ظ„ط³ظ†ط©", "label_en": "Coursework", "max_marks": 30, "display_order": 3},
                {"key": "final", "label_ar": "ط§ظ„ظ†ظ‡ط§ط¦ظٹ", "label_en": "Final", "max_marks": 40, "display_order": 4},
            ],
        },
        {
            "code": "TEMPLATE_200_DEFAULT",
            "name_ar": "ظ†ط¸ط§ظ… 200 ط¯ط±ط¬ط© (ظ…ظٹط¯ + ط£ط¹ظ…ط§ظ„ ط³ظ†ط© + ظ†ظ‡ط§ط¦ظٹ)",
            "name_en": "200 Marks (mid+coursework+final)",
            "components": [
                {"key": "mid1", "label_ar": "ظ…ظٹط¯", "label_en": "Mid", "max_marks": 40, "display_order": 1},
                {"key": "coursework", "label_ar": "ط£ط¹ظ…ط§ظ„ ط§ظ„ط³ظ†ط©", "label_en": "Coursework", "max_marks": 60, "display_order": 2},
                {"key": "final", "label_ar": "ط§ظ„ظ†ظ‡ط§ط¦ظٹ", "label_en": "Final", "max_marks": 100, "display_order": 3},
            ],
        },
        {
            "code": "TEMPLATE_250_DEFAULT",
            "name_ar": "ظ†ط¸ط§ظ… 250 ط¯ط±ط¬ط© (ظ…ظٹط¯ + ط¹ظ…ظ„ظٹ + ظ†ظ‡ط§ط¦ظٹ)",
            "name_en": "250 Marks (mid+practical+final)",
            "components": [
                {"key": "mid1", "label_ar": "ظ…ظٹط¯", "label_en": "Mid", "max_marks": 50, "display_order": 1},
                {"key": "practical", "label_ar": "ط¹ظ…ظ„ظٹ", "label_en": "Practical", "max_marks": 75, "display_order": 2},
                {"key": "final", "label_ar": "ط§ظ„ظ†ظ‡ط§ط¦ظٹ", "label_en": "Final", "max_marks": 125, "display_order": 3},
            ],
        },
    ]

    seeded_templates: dict[str, AssessmentTemplate] = {}
    for item in template_defs:
        row = db.query(AssessmentTemplate).filter(AssessmentTemplate.code == item["code"]).first()
        if not row:
            row = AssessmentTemplate(
                code=item["code"],
                name_ar=item["name_ar"],
                name_en=item["name_en"],
                is_default=True,
                is_active=True,
            )
            db.add(row)
            db.flush()
            for comp in item["components"]:
                db.add(
                    AssessmentTemplateComponent(
                        template_id=row.id,
                        key=comp["key"],
                        label_ar=comp["label_ar"],
                        label_en=comp["label_en"],
                        max_marks=float(comp["max_marks"]),
                        weight=float(comp["max_marks"]),
                        is_required=True,
                        display_order=int(comp["display_order"]),
                    )
                )
        seeded_templates[item["code"]] = row

    db.flush()
    # Attach default template/scale to legacy courses that still have fixed columns only.
    legacy_courses = db.query(CourseCatalog).filter(CourseCatalog.assessment_template_id.is_(None)).all()
    for course in legacy_courses:
        max_total = float(course.max_total or 0)
        if max_total <= 0:
            max_total = float((course.max_mid1 or 0) + (course.max_mid2 or 0) + (course.max_coursework or 0) + (course.max_final or 0))
            course.max_total = max_total
        if max_total >= 240:
            template = seeded_templates.get("TEMPLATE_250_DEFAULT")
        elif max_total >= 180:
            template = seeded_templates.get("TEMPLATE_200_DEFAULT")
        else:
            template = seeded_templates.get("TEMPLATE_100_DEFAULT")
        if template:
            course.assessment_template_id = template.id
        if course.grading_scale_id is None and default_scale:
            course.grading_scale_id = default_scale.id

    db.commit()


def _get_student_profile(db: Session, student_user_id: int) -> StudentAcademicProfile:
    row = db.query(StudentAcademicProfile).filter(StudentAcademicProfile.student_user_id == student_user_id).first()
    if not row:
        row = StudentAcademicProfile(student_user_id=student_user_id, current_study_year=1, gpa=0.0, passed_hours=0.0, is_active=True)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _normalize_legacy_student_key(value: Any) -> str:
    return str(value or "").strip().lower()


def _legacy_student_identifier_keys(user: User | None) -> set[str]:
    if not user:
        return set()
    candidates = {
        str(user.id or ""),
        str(user.username or ""),
        str(user.student_code or ""),
        str(user.email or ""),
    }
    return {_normalize_legacy_student_key(item) for item in candidates if str(item or "").strip()}


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        parsed = float(value)
        return parsed if parsed >= 0 else fallback
    except (TypeError, ValueError):
        return fallback


def _load_legacy_student_metrics(db: Session, user: User | None) -> tuple[float, float]:
    keys = _legacy_student_identifier_keys(user)
    if not keys:
        return 0.0, 0.0

    state = db.query(AcademicState).order_by(AcademicState.updated_at.desc()).first()
    if not state:
        return 0.0, 0.0

    records = _safe_json_load(getattr(state, "academic_records_json", None), [])
    if not isinstance(records, list):
        return 0.0, 0.0

    total_points = 0.0
    total_credits = 0.0
    passed_hours = 0.0

    for record in records:
        if not isinstance(record, dict):
            continue
        record_keys = {
            _normalize_legacy_student_key(record.get("studentId")),
            _normalize_legacy_student_key(record.get("student_id")),
            _normalize_legacy_student_key(record.get("studentCode")),
            _normalize_legacy_student_key(record.get("student_code")),
            _normalize_legacy_student_key(record.get("username")),
            _normalize_legacy_student_key(record.get("userId")),
            _normalize_legacy_student_key(record.get("user_id")),
            _normalize_legacy_student_key(record.get("email")),
        }
        record_keys.discard("")
        if not record_keys.intersection(keys):
            continue

        grade = str(record.get("grade") or "").strip().upper()
        credits = _safe_float(record.get("credits"), 0.0)
        if credits <= 0:
            credits = _safe_float(record.get("hours"), 0.0)
        if credits <= 0:
            credits = 3.0

        if grade:
            total_points += (_grade_to_gpa_points(grade, None, None) or 0.0) * credits
            total_credits += credits
            if grade != "F":
                passed_hours += credits

    gpa = round(total_points / total_credits, 2) if total_credits > 0 else 0.0
    return gpa, round(passed_hours, 2)


def _get_live_student_profile(db: Session, student_user_id: int) -> StudentAcademicProfile:
    profile = _get_student_profile(db, student_user_id)
    profile = _sync_student_profile_academic_metrics_from_published_grades(db, profile)
    user = db.query(User).filter(User.id == student_user_id).first()
    legacy_gpa, legacy_passed_hours = _load_legacy_student_metrics(db, user)
    current_gpa = float(profile.gpa or 0.0)
    current_passed_hours = float(getattr(profile, "passed_hours", 0.0) or 0.0)
    if legacy_gpa > 0 and current_gpa <= 0:
        profile.gpa = legacy_gpa
    if legacy_passed_hours > 0 and current_passed_hours <= 0:
        profile.passed_hours = legacy_passed_hours
    if float(profile.gpa or 0.0) != current_gpa or float(getattr(profile, "passed_hours", 0.0) or 0.0) != current_passed_hours:
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def _get_or_create_finance_status(db: Session, student_user_id: int) -> StudentFinanceStatus:
    row = db.query(StudentFinanceStatus).filter(StudentFinanceStatus.student_user_id == student_user_id).first()
    if row:
        return row
    row = StudentFinanceStatus(student_user_id=student_user_id, status="pending")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _is_financially_cleared(
    db: Session,
    student_user_id: int,
    academic_year_label: str | None = None,
    semester: str | None = None,
) -> bool:
    if academic_year_label and semester:
        term_row = (
            db.query(StudentFinanceClearance)
            .filter(
                StudentFinanceClearance.student_user_id == student_user_id,
                StudentFinanceClearance.academic_year_label == academic_year_label,
                StudentFinanceClearance.semester == semester,
            )
            .first()
        )
        if term_row and str(term_row.clearance_status or "").upper() == "CLEARED":
            return True

    row = db.query(StudentFinanceStatus).filter(StudentFinanceStatus.student_user_id == student_user_id).first()
    if row and row.status == "cleared":
        return True
    paid = db.query(PaymentRecord).filter(PaymentRecord.student_user_id == student_user_id, PaymentRecord.status == "paid").first()
    return paid is not None


def _active_window(db: Session, college_id: int | None, academic_year_label: str, semester: str) -> RegistrationWindow | None:
    now = _now()
    return (
        db.query(RegistrationWindow)
        .filter(
            RegistrationWindow.is_active == True,  # noqa: E712
            RegistrationWindow.academic_year_label == academic_year_label,
            RegistrationWindow.semester == semester,
            RegistrationWindow.starts_at <= now,
            RegistrationWindow.ends_at >= now,
            or_(RegistrationWindow.college_id == college_id, RegistrationWindow.college_id.is_(None)),
        )
        .order_by(RegistrationWindow.college_id.desc())
        .first()
    )


def _latest_registration_request(
    db: Session,
    *,
    student_user_id: int,
    academic_year_label: str,
    semester: str,
) -> RegistrationRequest | None:
    return (
        db.query(RegistrationRequest)
        .filter(
            RegistrationRequest.student_user_id == int(student_user_id),
            RegistrationRequest.academic_year_label == str(academic_year_label),
            RegistrationRequest.semester == str(semester),
        )
        .order_by(RegistrationRequest.updated_at.desc(), RegistrationRequest.id.desc())
        .first()
    )


def _normalize_period_status(value: str | None) -> str:
    raw = str(value or "").strip().upper()
    return raw if raw in REGISTRATION_PERIOD_STATUSES else "CLOSED"


def _normalize_dt_for_compare(value: datetime | None) -> datetime | None:
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _effective_window_status(window: RegistrationWindow | None) -> str:
    if not window:
        return "CLOSED"
    now = _now()
    open_at = _normalize_dt_for_compare(getattr(window, "open_at", None) or getattr(window, "starts_at", None))
    close_at = _normalize_dt_for_compare(getattr(window, "close_at", None) or getattr(window, "ends_at", None))
    if open_at and now < open_at:
        return "CLOSED"
    if close_at and now > close_at:
        return "CLOSED"
    status_value = _normalize_period_status(getattr(window, "status", None))
    if status_value != "CLOSED":
        return status_value
    if not bool(window.is_active):
        return "CLOSED"
    return "CLOSED"


def _registration_window_sort_key(window: RegistrationWindow | None) -> tuple[int, int, int, float]:
    if not window:
        return (0, 0, 0, 0.0)
    status_weight = {"OPEN": 5, "PENDING_REVIEW": 4, "APPROVED": 3, "LOCKED": 2, "CLOSED": 1}
    semester_weight = {"autumn": 3, "spring": 2, "summer": 1}
    status_value = _effective_window_status(window)
    label = str(getattr(window, "academic_year_label", "") or "")
    semester = str(getattr(window, "semester", "") or "").strip().lower()
    try:
        year_start = int(label.split("-")[0])
    except Exception:
        year_start = 0
    updated_at = _normalize_dt_for_compare(getattr(window, "updated_at", None))
    updated_ts = updated_at.timestamp() if updated_at else 0.0
    return (
        status_weight.get(status_value, 0),
        year_start,
        semester_weight.get(semester, 0),
        updated_ts,
    )


def _best_registration_window(
    db: Session,
    *,
    college_id: int | None = None,
    academic_year_label: str | None = None,
) -> RegistrationWindow | None:
    q = db.query(RegistrationWindow).filter(RegistrationWindow.is_active == True)  # noqa: E712
    if academic_year_label:
        q = q.filter(RegistrationWindow.academic_year_label == academic_year_label)
    if college_id is not None:
        q = q.filter(or_(RegistrationWindow.college_id == college_id, RegistrationWindow.college_id.is_(None)))
    rows = q.all()
    if not rows and college_id is not None:
        rows = (
            db.query(RegistrationWindow)
            .filter(
                RegistrationWindow.is_active == True,  # noqa: E712
                RegistrationWindow.college_id.is_(None),
            )
            .all()
        )
        if academic_year_label:
            rows = [row for row in rows if str(row.academic_year_label or "") == str(academic_year_label)]
    if not rows:
        return None
    rows.sort(key=_registration_window_sort_key, reverse=True)
    return rows[0]


def _term_window(
    db: Session,
    *,
    college_id: int | None,
    academic_year_label: str,
    semester: str,
) -> RegistrationWindow | None:
    return (
        db.query(RegistrationWindow)
        .filter(
            RegistrationWindow.is_active == True,  # noqa: E712
            RegistrationWindow.academic_year_label == academic_year_label,
            RegistrationWindow.semester == semester,
            or_(RegistrationWindow.college_id == college_id, RegistrationWindow.college_id.is_(None)),
        )
        .order_by(RegistrationWindow.college_id.desc(), RegistrationWindow.updated_at.desc())
        .first()
    )


def _require_open_period(window: RegistrationWindow | None, action_label: str = "This action") -> None:
    status_value = _effective_window_status(window)
    if status_value != "OPEN":
        ar_status = {"CLOSED": "ظ…ط؛ظ„ظ‚", "PENDING_REVIEW": "ظ‚ظٹط¯ ط§ظ„ظ…ط±ط§ط¬ط¹ط©", "APPROVED": "ظ…ط¹طھظ…ط¯", "LOCKED": "ظ…ظ‚ظپظ„"}.get(status_value, status_value)
        raise HTTPException(status_code=400, detail=f"ظپطھط±ط© ط§ظ„طھط³ط¬ظٹظ„ {ar_status} â€” ظ„ط§ ظٹظ…ظƒظ† {action_label}. Registration period status is {status_value}")



def _require_open_or_review_period(window: RegistrationWindow | None, action_label: str = "This action") -> None:
    status_value = _effective_window_status(window)
    if status_value not in {"OPEN", "PENDING_REVIEW"}:
        ar_status = {"CLOSED": "مغلق", "PENDING_REVIEW": "قيد المراجعة", "APPROVED": "معتمد", "LOCKED": "مقفل"}.get(status_value, status_value)
        raise HTTPException(status_code=400, detail=f"فترة التسجيل {ar_status} — لا يمكن {action_label}. Registration period status is {status_value}")


def _section_capacity_snapshot(
    db: Session,
    offering_ids: list[int],
    *,
    exclude_request_id: int | None = None,
) -> dict[int, dict[str, Any]]:
    normalized_ids = sorted({int(x) for x in (offering_ids or []) if int(x) > 0})
    if not normalized_ids:
        return {}

    offerings = (
        db.query(CourseOffering.id, CourseOffering.max_students)
        .filter(CourseOffering.id.in_(normalized_ids))
        .all()
    )
    max_by_id = {int(row.id): (int(row.max_students) if row.max_students is not None else None) for row in offerings}

    occupancy_query = (
        db.query(
            RegistrationCourseSelection.offering_id.label("offering_id"),
            func.count(func.distinct(RegistrationCourseSelection.student_user_id)).label("student_count"),
        )
        .join(RegistrationRequest, RegistrationRequest.id == RegistrationCourseSelection.registration_request_id)
        .filter(
            RegistrationCourseSelection.offering_id.in_(normalized_ids),
            RegistrationRequest.status.in_(SEAT_OCCUPYING_REQUEST_STATUSES),
        )
    )
    if exclude_request_id:
        occupancy_query = occupancy_query.filter(RegistrationCourseSelection.registration_request_id != int(exclude_request_id))
    occupancy_rows = occupancy_query.group_by(RegistrationCourseSelection.offering_id).all()
    occ_by_id = {int(row.offering_id): int(row.student_count or 0) for row in occupancy_rows}

    snapshot: dict[int, dict[str, Any]] = {}
    for offering_id in normalized_ids:
        max_students = max_by_id.get(offering_id)
        current_students = int(occ_by_id.get(offering_id, 0))
        is_open = True if max_students is None else current_students < int(max_students)
        available_seats = None if max_students is None else max(int(max_students) - current_students, 0)
        snapshot[offering_id] = {
            "current_students": current_students,
            "capacity": max_students,
            "available_seats": available_seats,
            "is_open": is_open,
            "section_status": "OPEN" if is_open else "CLOSED",
        }
    return snapshot
def _is_request_locked_for_edit(req: RegistrationRequest) -> bool:
    locked_statuses = {"advisor_approved", "registered", "locked", "approved"}
    return str(req.status or "").strip().lower() in locked_statuses or bool(req.locked_at)


def _can_manage_registration_request(db: Session, request_row: RegistrationRequest, current_user: User) -> bool:
    role = str(current_user.role or "").lower()
    if role == "admin":
        return True
    if role != "advisor":
        return False
    profile = (
        db.query(StudentAcademicProfile)
        .filter(StudentAcademicProfile.student_user_id == request_row.student_user_id)
        .first()
    )
    if not profile:
        return False
    if int(profile.advisor_user_id or 0) == int(current_user.id):
        return True
    advisor_college_ids = _resolve_user_college_ids(db, current_user)
    return bool(profile.college_id and int(profile.college_id) in set(advisor_college_ids))


def _can_manage_student_profile(db: Session, student_user_id: int, current_user: User) -> bool:
    role = str(current_user.role or "").lower()
    if role == "admin":
        return True
    if role != "advisor":
        return False
    profile = (
        db.query(StudentAcademicProfile)
        .filter(StudentAcademicProfile.student_user_id == student_user_id)
        .first()
    )
    if not profile:
        return False
    if int(profile.advisor_user_id or 0) == int(current_user.id):
        return True
    advisor_college_ids = _resolve_user_college_ids(db, current_user)
    return bool(profile.college_id and int(profile.college_id) in set(advisor_college_ids))


def _norm_scope_text(value: Any) -> str:
    return str(value or "").strip().lower().replace(" ", "")


def _resolve_user_college_ids(db: Session, current_user: User) -> list[int]:
    raw_user_college = str(getattr(current_user, "college", "") or "").strip()
    if not raw_user_college:
        return []
    key = _norm_scope_text(raw_user_college)
    if not key:
        return []
    ids: set[int] = set()
    for college in db.query(College).all():
        candidates = {
            _norm_scope_text(college.code),
            _norm_scope_text(college.name_ar),
            _norm_scope_text(college.name_en),
        }
        if key in candidates:
            ids.add(int(college.id))
    return sorted(ids)


def _resolve_fallback_admin_user_id(db: Session) -> int | None:
    """Return an active admin user id to receive requests when no advisor is assigned."""
    admin = (
        db.query(User)
        .filter(User.role == "admin", User.is_active == True)  # noqa: E712
        .order_by(User.id.asc())
        .first()
    )
    return int(admin.id) if admin else None


def _resolve_effective_student_advisor_id(
    db: Session,
    profile: StudentAcademicProfile,
) -> int | None:
    """
    Resolve advisor for a student.
    Priority:
    1) Explicit advisor assigned on student profile.
    2) Fallback to an advisor whose college scope includes student's college.
       - If multiple advisors match, do not auto-pick to avoid wrong assignment.
    """
    explicit = int(profile.advisor_user_id or 0)
    if explicit > 0:
        return explicit

    college_id = int(profile.college_id or 0)
    if college_id <= 0:
        return None

    advisor_ids: list[int] = []
    advisors = db.query(User).filter(User.role == "advisor", User.is_active == True).all()  # noqa: E712
    for advisor in advisors:
        advisor_college_ids = _resolve_user_college_ids(db, advisor)
        if college_id in set(advisor_college_ids):
            advisor_ids.append(int(advisor.id))

    if len(advisor_ids) == 1:
        return advisor_ids[0]
    return None


@router.get("/registration/advisor-students", dependencies=[Depends(require_role("admin", "advisor"))])
async def list_advisor_students(
    college_id: int | None = None,
    study_year: int | None = Query(default=None, ge=1, le=10),
    q: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = str(current_user.role or "").lower()
    query = (
        db.query(StudentAcademicProfile, User, College)
        .select_from(User)
        .outerjoin(StudentAcademicProfile, User.id == StudentAcademicProfile.student_user_id)
        .outerjoin(College, College.id == StudentAcademicProfile.college_id)
        .filter(User.role == "student")
    )

    if role == "advisor":
        advisor_college_ids = _resolve_user_college_ids(db, current_user)
        advisor_scope_filters = [StudentAcademicProfile.advisor_user_id == current_user.id]
        if advisor_college_ids:
            advisor_scope_filters.append(StudentAcademicProfile.college_id.in_(advisor_college_ids))
        query = query.filter(or_(*advisor_scope_filters))

    if college_id:
        query = query.filter(StudentAcademicProfile.college_id == college_id)
    if study_year:
        query = query.filter(StudentAcademicProfile.current_study_year == study_year)

    text_q = str(q or "").strip()
    if text_q:
        like_value = f"%{text_q}%"
        if text_q.isdigit():
            query = query.filter(
                or_(
                    User.username.ilike(like_value),
                    User.full_name.ilike(like_value),
                    User.student_code.ilike(like_value),
                    User.id == int(text_q),
                )
            )
        else:
            query = query.filter(
                or_(
                    User.username.ilike(like_value),
                    User.full_name.ilike(like_value),
                    User.student_code.ilike(like_value),
                )
            )

    rows = query.order_by(User.full_name.asc()).limit(limit).all()
    items = []
    for profile, user, college in rows:
        live_profile = _get_live_student_profile(db, int(user.id)) if profile else None
        live_college = college
        if live_profile and live_profile.college_id and (not college or int(college.id) != int(live_profile.college_id)):
            live_college = db.query(College).filter(College.id == live_profile.college_id).first()
        items.append(
            {
                "student_user_id": int(user.id),
                "username": user.username,
                "full_name": user.full_name,
                "student_code": user.student_code,
                "college_id": live_profile.college_id if live_profile else None,
                "college_name": (live_college.name_ar if live_college else None) or getattr(user, "college", None),
                "study_year": live_profile.current_study_year if live_profile else 1,
                "advisor_user_id": live_profile.advisor_user_id if live_profile else None,
                "gpa": float(live_profile.gpa or 0) if live_profile else 0,
                "passed_hours": float(getattr(live_profile, "passed_hours", 0) or 0) if live_profile else 0,
            }
        )
    return {"items": items}


def _registration_request_payload(row: RegistrationRequest) -> dict[str, Any]:
    return RegistrationRequestResponse.model_validate(row).model_dump(mode="json")


def _normalize_legacy_key(value: Any) -> str:
    return str(value or "").strip().lower()


def _legacy_student_matches(row: dict[str, Any], candidate_keys: set[str]) -> bool:
    row_candidates = [
        row.get("studentId"),
        row.get("student_id"),
        row.get("studentCode"),
        row.get("student_code"),
        row.get("username"),
        row.get("userId"),
        row.get("user_id"),
        row.get("email"),
    ]
    row_keys = {_normalize_legacy_key(v) for v in row_candidates if str(v or "").strip()}
    return bool(row_keys.intersection(candidate_keys))


def _term_sort_key(term_item: dict[str, Any]) -> tuple[int, int]:
    label = str(term_item.get("academic_year_label") or "")
    semester = str(term_item.get("semester") or "").strip().lower()
    try:
        year_start = int(label.split("-")[0])
    except Exception:
        year_start = 0
    semester_weight = {"autumn": 3, "spring": 2, "summer": 1}.get(semester, 0)
    return (year_start, semester_weight)


def _legacy_registration_view_for_student(
    db: Session,
    *,
    student_user_id: int,
    academic_year_label: str,
    semester: str,
) -> list[dict[str, Any]]:
    student = db.query(User).filter(User.id == student_user_id).first()
    candidate_keys = {
        _normalize_legacy_key(student_user_id),
        _normalize_legacy_key(student.username if student else ""),
        _normalize_legacy_key(student.student_code if student else ""),
        _normalize_legacy_key(student.email if student else ""),
    }
    candidate_keys = {k for k in candidate_keys if k}

    legacy_state = db.query(AcademicState).filter(AcademicState.id == 1).first()
    legacy_rows: list[dict[str, Any]] = []
    if legacy_state and str(legacy_state.student_registrations_json or "").strip():
        try:
            decoded = json.loads(legacy_state.student_registrations_json)
            if isinstance(decoded, list):
                legacy_rows = [row for row in decoded if isinstance(row, dict)]
        except Exception:
            legacy_rows = []

    selected_semester = str(semester or "").strip().lower()
    selected_year = str(academic_year_label or "").strip()

    items: list[dict[str, Any]] = []
    for row in legacy_rows:
        if not _legacy_student_matches(row, candidate_keys):
            continue

        row_semester = str(row.get("semester") or "").strip().lower()
        if row_semester != selected_semester:
            continue

        row_year = str(
            row.get("academicYear")
            or row.get("academic_year")
            or row.get("academic_year_label")
            or ""
        ).strip()
        if row_year and row_year != selected_year:
            continue

        selected_group = row.get("selectedGroup") if isinstance(row.get("selectedGroup"), dict) else {}
        lecture = row.get("lecture") if isinstance(row.get("lecture"), dict) else {}

        course_code = str(row.get("id") or row.get("code") or row.get("courseId") or "").strip()
        course_title = str(row.get("name") or row.get("courseName") or course_code or "").strip()
        if not course_code and not course_title:
            continue

        section_name = str(selected_group.get("name") or selected_group.get("hall") or "-").strip() or "-"
        lecture_day = str(lecture.get("day") or "").strip()
        lecture_time = str(lecture.get("time") or "").strip()
        lecture_text = " - ".join([part for part in [lecture_day, lecture_time] if part]).strip()

        items.append(
            {
                "id": -(len(items) + 1),
                "registration_request_id": 0,
                "offering_id": -(len(items) + 1),
                "student_user_id": student_user_id,
                "course_code": course_code,
                "course_title_ar": course_title,
                "credit_hours": int(row.get("hours") or row.get("credits") or 0),
                "section": section_name,
                "legacy_lecture": lecture_text or "---",
                "is_legacy": True,
            }
        )

    return items


def _apply_registration_request_selections(
    *,
    db: Session,
    req: RegistrationRequest,
    offering_ids: list[int],
    actor_user: User,
    actor_mode: str,
    selection_context: list[dict[str, Any]] | None = None,
) -> tuple[float, int, int]:
    profile = _get_student_profile(db, req.student_user_id)
    ensure_academic_core_schema(db)
    _strict_validate_selection_context(
        db=db,
        req=req,
        profile=profile,
        offering_ids=offering_ids,
        selection_context=selection_context,
    )
    unique_offering_ids = [int(x) for x in list(dict.fromkeys(offering_ids or []))]
    selection_display_title_map = _selection_context_display_title_map(selection_context)
    if len(unique_offering_ids) != len(offering_ids):
        raise HTTPException(status_code=400, detail="Duplicate offerings are not allowed")

    existing_selection_offering_ids = [
        int(item[0])
        for item in db.query(RegistrationCourseSelection.offering_id)
        .filter(RegistrationCourseSelection.registration_request_id == req.id)
        .all()
    ]
    lock_offering_ids = sorted(set(unique_offering_ids).union(existing_selection_offering_ids))
    locked_offerings = (
        db.query(CourseOffering)
        .filter(CourseOffering.id.in_(lock_offering_ids))
        .order_by(CourseOffering.id.asc())
        .with_for_update()
        .all()
        if lock_offering_ids
        else []
    )
    locked_by_id = {int(item.id): item for item in locked_offerings}
    offerings_by_id = {offering_id: locked_by_id[offering_id] for offering_id in unique_offering_ids if offering_id in locked_by_id}
    missing_ids = [oid for oid in unique_offering_ids if oid not in offerings_by_id]
    if missing_ids:
        raise HTTPException(status_code=400, detail=f"Offering {missing_ids[0]} not found")

    capacity_snapshot = _section_capacity_snapshot(db, lock_offering_ids, exclude_request_id=req.id)
    for offering_id in unique_offering_ids:
        snapshot = capacity_snapshot.get(int(offering_id)) or {}
        if not bool(snapshot.get("is_open", True)):
            raise HTTPException(
                status_code=400,
                detail="Only open sections can be assigned. This section is full and cannot accept more students.",
            )

    course_map: dict[int, CourseCatalog] = {}
    selected_course_ids: set[int] = set()
    selected_course_offering: dict[int, int] = {}
    total_credit_hours = 0.0
    for offering_id in unique_offering_ids:
        offering = offerings_by_id[offering_id]
        if offering.academic_year_label != req.academic_year_label or offering.semester != req.semester:
            raise HTTPException(status_code=400, detail=f"Offering {offering_id} is outside selected term")
        _validate_offering_for_student(db, offering, profile)
        course = db.query(CourseCatalog).filter(CourseCatalog.id == offering.course_id).first()
        if not course:
            raise HTTPException(status_code=400, detail=f"Offering {offering_id} has no valid course")
        missing_schedule_fields: list[str] = []
        if not str(getattr(offering, "day_of_week", "") or "").strip():
            missing_schedule_fields.append("day_of_week")
        if not str(getattr(offering, "start_time", "") or "").strip():
            missing_schedule_fields.append("start_time")
        if not str(getattr(offering, "end_time", "") or "").strip():
            missing_schedule_fields.append("end_time")
        if missing_schedule_fields:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Selected offering has incomplete schedule: "
                    f"course_code={course.code}, offering_id={offering.id}, "
                    f"missing_fields={','.join(missing_schedule_fields)}"
                ),
            )
        existing_same_course_offering_id = selected_course_offering.get(int(course.id))
        if existing_same_course_offering_id is not None:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Only one section per course can be selected. "
                    f"Course {course.code} was selected more than once."
                ),
            )
        selected_course_offering[int(course.id)] = int(offering_id)
        course_map[offering_id] = course
        selected_course_ids.add(int(course.id))
        total_credit_hours += float(course.credit_hours or 0.0)

    existing_active_rows = (
        db.query(RegistrationCourseSelection, CourseOffering, CourseCatalog)
        .join(RegistrationRequest, RegistrationRequest.id == RegistrationCourseSelection.registration_request_id)
        .join(CourseOffering, CourseOffering.id == RegistrationCourseSelection.offering_id)
        .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
        .filter(
            RegistrationCourseSelection.student_user_id == req.student_user_id,
            RegistrationRequest.academic_year_label == req.academic_year_label,
            RegistrationRequest.semester == req.semester,
            RegistrationRequest.status.in_(SEAT_OCCUPYING_REQUEST_STATUSES),
            RegistrationCourseSelection.registration_request_id != req.id,
        )
        .all()
    )
    existing_active_course_ids: set[int] = {
        int(course.id)
        for _selection, _offering, course in existing_active_rows
        if course and course.id is not None
    }
    duplicate_same_term_course_ids = selected_course_ids.intersection(existing_active_course_ids)
    if duplicate_same_term_course_ids:
        duplicate_course = next(
            (
                course_map[offering_id]
                for offering_id in unique_offering_ids
                if int(course_map[offering_id].id) in duplicate_same_term_course_ids
            ),
            None,
        )
        duplicate_code = duplicate_course.code if duplicate_course else "selected course"
        raise HTTPException(
            status_code=400,
            detail=f"Course {duplicate_code} is already registered in this term",
        )
    selected_offering_payloads = [
        {
            "offering_id": int(offering.id),
            "course_id": int(course.id),
            "course_code": course.code,
            "course_title_ar": course.title_ar,
            "display_title": selection_display_title_map.get(
                (str(course.code or "").strip().upper(), _normalize_section_match_token(offering.section))
            ),
            "section": offering.section,
            "day_of_week": offering.day_of_week,
            "start_time": offering.start_time,
            "end_time": offering.end_time,
            "session_type": "lecture",
        }
        for offering_id, course in course_map.items()
        for offering in [offerings_by_id[offering_id]]
    ]
    existing_active_payloads = [
        {
            "offering_id": int(offering.id),
            "course_id": int(course.id),
            "course_code": course.code,
            "course_title_ar": course.title_ar,
            "display_title": _normalize_display_title(getattr(_selection, "display_title", None)),
            "section": offering.section,
            "day_of_week": offering.day_of_week,
            "start_time": offering.start_time,
            "end_time": offering.end_time,
            "session_type": "lecture",
        }
        for _selection, offering, course in existing_active_rows
    ]
    conflicts = validate_schedule_conflicts(
        student_id=req.student_user_id,
        term_id=f"{req.academic_year_label}:{req.semester}",
        selected_offerings=selected_offering_payloads,
        existing_active_selections=existing_active_payloads,
    )
    if conflicts:
        first = conflicts[0] if conflicts else {}
        first_current = str(first.get("current_course") or "course").strip()
        first_current_section = str(first.get("current_section") or "-").strip()
        first_other = str(first.get("conflicting_course") or "course").strip()
        first_other_section = str(first.get("conflicting_section") or "-").strip()
        first_day = str(first.get("day") or "-").strip()
        first_time = str(first.get("time") or "-").strip()
        raise HTTPException(
            status_code=400,
            detail={
                "code": "SCHEDULE_CONFLICT",
                "message": "يوجد تعارض في الجدول الدراسي بين الشعب المختارة.",
                "message_en": (
                    "Schedule conflict detected. "
                    f"{first_current} ({first_current_section}) conflicts with "
                    f"{first_other} ({first_other_section}) on {first_day} at {first_time}."
                ),
                "conflicts": conflicts,
            },
        )

    current_gpa = _calculate_effective_gpa(db, profile)
    min_credits, max_credits = _resolve_credit_limits(db, profile, current_gpa)
    if total_credit_hours > float(max_credits):
        raise HTTPException(
            status_code=400,
            detail=f"Selected credit hours ({total_credit_hours:g}) exceed allowed max ({max_credits}) for GPA {float(current_gpa or 0.0):.2f}",
        )
    if unique_offering_ids and total_credit_hours < float(min_credits):
        raise HTTPException(
            status_code=400,
            detail=f"Selected credit hours ({total_credit_hours:g}) are below minimum ({min_credits})",
        )

    passed_course_ids, grades_by_course = _build_passed_course_sets(db, req.student_user_id)
    already_passed_course_ids = selected_course_ids.intersection(passed_course_ids)
    if already_passed_course_ids:
        passed_course = next(
            (
                course_map[offering_id]
                for offering_id in unique_offering_ids
                if int(course_map[offering_id].id) in already_passed_course_ids
            ),
            None,
        )
        passed_code = passed_course.code if passed_course else "selected course"
        raise HTTPException(
            status_code=400,
            detail=f"Course {passed_code} was already passed and cannot be registered again",
        )
    for offering_id in unique_offering_ids:
        course = course_map[offering_id]
        _validate_prerequisites_for_course(
            db=db,
            course=course,
            passed_course_ids=passed_course_ids,
            grades_by_course=grades_by_course,
            selected_course_ids=selected_course_ids,
        )

    db.query(RegistrationCourseSelection).filter(RegistrationCourseSelection.registration_request_id == req.id).delete()
    for offering_id in unique_offering_ids:
        offering = offerings_by_id[offering_id]
        course = course_map[offering_id]
        display_title = selection_display_title_map.get(
            (str(course.code or "").strip().upper(), _normalize_section_match_token(offering.section))
        )
        db.add(
            RegistrationCourseSelection(
                registration_request_id=req.id,
                offering_id=offering.id,
                student_user_id=req.student_user_id,
                display_title=display_title,
                status="selected",
            )
        )

    req.submitted_at = _now()
    _log_audit(
        db,
        actor_user.id,
        "registration_request",
        str(req.id),
        "apply_selection",
        None,
        {
            "actor_mode": actor_mode,
            "offering_ids": unique_offering_ids,
            "selected_credit_hours": total_credit_hours,
            "allowed_credit_hours": {"min": min_credits, "max": max_credits},
        },
    )
    return total_credit_hours, min_credits, max_credits


def _validate_offering_for_student(db: Session, offering: CourseOffering, profile: StudentAcademicProfile) -> None:
    course = db.query(CourseCatalog).filter(CourseCatalog.id == offering.course_id).first()
    if not course:
        raise HTTPException(status_code=400, detail="Invalid offering course")
    if course.college_id and profile.college_id and course.college_id != profile.college_id:
        raise HTTPException(status_code=400, detail=f"Course {course.code} belongs to another college")
    if (
        course.study_year is not None
        and profile.current_study_year is not None
        and int(course.study_year) > int(profile.current_study_year)
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Course {course.code} is in a future study year and is not yet eligible",
        )

    college = db.query(College).filter(College.id == profile.college_id).first() if profile.college_id else None
    if not college or not college.branching_start_year:
        return
    if profile.current_study_year >= college.branching_start_year:
        if course.track_id and profile.current_track_id and course.track_id != profile.current_track_id:
            raise HTTPException(status_code=400, detail=f"Course {course.code} is for different track")
    elif course.track_id:
        raise HTTPException(status_code=400, detail=f"Course {course.code} is track-specific before branching year")


def _selected_offering_ids_for_student_term(
    db: Session,
    *,
    student_user_id: int,
    academic_year_label: str,
    semester: str,
) -> set[int]:
    rows = (
        db.query(RegistrationCourseSelection.offering_id)
        .join(RegistrationRequest, RegistrationRequest.id == RegistrationCourseSelection.registration_request_id)
        .filter(
            RegistrationCourseSelection.student_user_id == int(student_user_id),
            RegistrationRequest.academic_year_label == str(academic_year_label),
            RegistrationRequest.semester == str(semester),
            RegistrationRequest.status.in_(SEAT_OCCUPYING_REQUEST_STATUSES),
        )
        .all()
    )
    return {int(row[0]) for row in rows if row and row[0] is not None}


def _offering_eligibility_for_student(
    db: Session,
    *,
    offering: CourseOffering,
    course: CourseCatalog | None,
    profile: StudentAcademicProfile,
    passed_course_ids: set[int],
    grades_by_course: dict[int, str],
    selected_offering_ids: set[int],
    seat_snapshot: dict[str, Any] | None,
) -> tuple[str, str | None]:
    if not course:
        return "hidden_invalid", "المادة غير صالحة أو غير مرتبطة بعرض صحيح."

    if int(offering.id or 0) in selected_offering_ids:
        return "selected", None

    if course.college_id and profile.college_id and course.college_id != profile.college_id:
        return "locked_college", "هذه المادة تتبع كلية أخرى."

    if course.id is not None and int(course.id) in passed_course_ids:
        return "locked_passed", "تم اجتياز هذه المادة مسبقًا."

    if (
        course.study_year is not None
        and profile.current_study_year is not None
        and int(course.study_year) > int(profile.current_study_year)
    ):
        return "locked_future_year", f"متاحة بعد الوصول إلى السنة {int(course.study_year)}."

    college = db.query(College).filter(College.id == profile.college_id).first() if profile.college_id else None
    if college and college.branching_start_year:
        if profile.current_study_year >= college.branching_start_year:
            if course.track_id and profile.current_track_id and course.track_id != profile.current_track_id:
                return "locked_track", "هذه المادة خاصة بمسار آخر."
        elif course.track_id:
            return "locked_track_before_branching", "هذه المادة مرتبطة بمسار تخصص وتتاح بعد سنة التشعيب."

    try:
        _validate_prerequisites_for_course(
            db=db,
            course=course,
            passed_course_ids=passed_course_ids,
            grades_by_course=grades_by_course,
            selected_course_ids=set(),
        )
    except HTTPException as exc:
        detail = getattr(exc, "detail", None)
        return "locked_prerequisite", str(detail or "متطلب سابق غير مستوفى.")

    if not (
        str(getattr(offering, "day_of_week", "") or "").strip()
        and str(getattr(offering, "start_time", "") or "").strip()
        and str(getattr(offering, "end_time", "") or "").strip()
    ):
        return "locked_schedule", "جدول هذه الشعبة غير مكتمل حاليًا."

    if seat_snapshot and not bool(seat_snapshot.get("is_open", True)):
        return "locked_full", "هذه الشعبة مغلقة أو ممتلئة."

    return "open", None


def _normalize_section_match_token(value: Any) -> str:
    return (
        str(value or "")
        .strip()
        .lower()
        .replace("section", "")
        .replace("sec", "")
        .replace("سكشن", "")
        .replace("شعبة", "")
        .replace("مجموعة", "")
        .replace("-", "")
        .replace("_", "")
        .replace(" ", "")
    )


def _normalize_display_title(value: Any) -> str | None:
    raw = str(value or "").strip()
    return raw[:255] if raw else None


def _selection_context_display_title_map(
    selection_context: list[dict[str, Any]] | None,
) -> dict[tuple[str, str], str]:
    ctx_list = selection_context if isinstance(selection_context, list) else []
    result: dict[tuple[str, str], str] = {}
    for item in ctx_list:
        if not isinstance(item, dict):
            continue
        course_code = str(item.get("course_code") or "").strip().upper()
        selected_section = _normalize_section_match_token(item.get("selected_section"))
        display_title = _normalize_display_title(item.get("display_title") or item.get("course_title"))
        if not course_code or not selected_section or not display_title:
            continue
        result[(course_code, selected_section)] = display_title
    return result


def _strict_validate_selection_context(
    *,
    db: Session,
    req: RegistrationRequest,
    profile: StudentAcademicProfile,
    offering_ids: list[int],
    selection_context: list[dict[str, Any]] | None,
) -> None:
    ctx_list = selection_context if isinstance(selection_context, list) else []
    if not ctx_list:
        return

    payload_offerings = (
        db.query(CourseOffering, CourseCatalog)
        .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
        .filter(CourseOffering.id.in_([int(x) for x in offering_ids if int(x) > 0]))
        .all()
    )
    payload_map: dict[str, set[str]] = {}
    for offering, course in payload_offerings:
        code_key = str(course.code or "").strip().upper()
        if not code_key:
            continue
        payload_map.setdefault(code_key, set()).add(_normalize_section_match_token(offering.section))

    for item in ctx_list:
        if not isinstance(item, dict):
            continue
        course_code = str(item.get("course_code") or "").strip().upper()
        selected_section_raw = str(item.get("selected_section") or "").strip()
        selected_section = _normalize_section_match_token(selected_section_raw)
        if not course_code:
            continue
        if not selected_section:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "section_required",
                    "course_code": course_code,
                    "selected_section": selected_section_raw or "",
                    "available_sections": [],
                    "message": "Selected section is required for this course.",
                },
            )

        course_row = (
            db.query(CourseCatalog)
            .filter(func.upper(func.trim(CourseCatalog.code)) == course_code)
            .first()
        )
        if not course_row:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "course_not_found",
                    "course_code": course_code,
                    "selected_section": selected_section_raw,
                    "available_sections": [],
                    "message": "Course was not found in this term offerings.",
                },
            )

        course_offerings = (
            db.query(CourseOffering)
            .filter(
                CourseOffering.course_id == course_row.id,
                CourseOffering.academic_year_label == req.academic_year_label,
                CourseOffering.semester == req.semester,
                CourseOffering.is_active == True,  # noqa: E712
            )
            .all()
        )
        seat_snapshot = _section_capacity_snapshot(
            db,
            [int(row.id) for row in course_offerings],
            exclude_request_id=req.id,
        )
        available_sections: list[str] = []
        for offering in course_offerings:
            try:
                _validate_offering_for_student(db, offering, profile)
            except HTTPException:
                continue
            seat = seat_snapshot.get(int(offering.id), {})
            if not bool(seat.get("is_open", True)):
                continue
            available_sections.append(str(offering.section or "").strip())
        available_sections = sorted({row for row in available_sections if row})

        if selected_section_raw and selected_section_raw not in available_sections:
            selected_match = any(
                _normalize_section_match_token(sec) == selected_section for sec in available_sections
            )
            if not selected_match:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "section_unavailable",
                        "course_code": course_code,
                        "selected_section": selected_section_raw,
                        "available_sections": available_sections,
                        "message": "Selected section is no longer available. Please choose another section.",
                    },
                )

        payload_sections = payload_map.get(course_code, set())
        if selected_section not in payload_sections:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "section_unavailable",
                    "course_code": course_code,
                    "selected_section": selected_section_raw,
                    "available_sections": available_sections,
                    "message": "Selected section is no longer available. Please choose another section.",
                },
            )


def _calc_total_grade(row: GradeBook, course: CourseCatalog) -> None:
    total = float((row.mid1 or 0) + (row.mid2 or 0) + (row.coursework or 0) + (row.final or 0))
    row.total = total
    if course.max_total <= 0:
        row.grade = None
        return
    pct = (total / course.max_total) * 100
    if pct >= 90:
        row.grade = "A"
    elif pct >= 80:
        row.grade = "B"
    elif pct >= 70:
        row.grade = "C"
    elif pct >= 60:
        row.grade = "D"
    else:
        row.grade = "F"


def _validate_template_components(components: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    seen_keys: set[str] = set()
    total = 0.0
    for idx, comp in enumerate(components or [], start=1):
        key = str(comp.get("key") or "").strip().lower()
        if not key:
            raise HTTPException(status_code=400, detail=f"Template component #{idx} key is required")
        if key in seen_keys:
            raise HTTPException(status_code=400, detail=f"Template component key '{key}' is duplicated")
        seen_keys.add(key)
        max_marks = float(comp.get("max_marks") or 0)
        if max_marks < 0:
            raise HTTPException(status_code=400, detail=f"Template component '{key}' max_marks cannot be negative")
        total += max_marks
        normalized.append(comp)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Template total marks must be greater than zero")
    return normalized


def _validate_student_profile_payload(db: Session, payload: StudentProfileUpsert) -> None:
    if payload.college_id is None:
        if payload.current_track_id is not None:
            raise HTTPException(status_code=400, detail="Track requires a college")
        return

    college = db.query(College).filter(College.id == payload.college_id, College.is_active == True).first()  # noqa: E712
    if not college:
        raise HTTPException(status_code=400, detail="Invalid college_id")

    if payload.current_study_year < 1 or payload.current_study_year > int(college.total_years or 1):
        raise HTTPException(status_code=400, detail=f"Study year must be between 1 and {college.total_years}")

    if payload.current_track_id is not None:
        track = db.query(CollegeTrack).filter(CollegeTrack.id == payload.current_track_id, CollegeTrack.is_active == True).first()  # noqa: E712
        if not track:
            raise HTTPException(status_code=400, detail="Invalid specialization/track")
        if track.college_id != payload.college_id:
            raise HTTPException(status_code=400, detail="Specialization must belong to the same college")

    branching = int(college.branching_start_year or 0)
    if branching > 0 and payload.current_study_year < branching and payload.current_track_id is not None:
        raise HTTPException(status_code=400, detail="General years cannot have specialization")

    if branching > 0 and payload.current_study_year >= branching:
        has_tracks = (
            db.query(CollegeTrack)
            .filter(CollegeTrack.college_id == payload.college_id, CollegeTrack.is_active == True)  # noqa: E712
            .first()
        )
        if has_tracks and payload.current_track_id is None:
            raise HTTPException(status_code=400, detail="Specialization is required from branching year")


PASSING_GRADES = {"A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "P"}


def _validate_credit_policy_tiers(payload_tiers: list[dict]) -> list[dict]:
    tiers = sorted(payload_tiers, key=lambda item: float(item["min_gpa"]))
    previous_max = None
    has_open_ended_before = False
    for idx, tier in enumerate(tiers):
        min_gpa = float(tier["min_gpa"])
        if has_open_ended_before:
            raise HTTPException(status_code=400, detail=f"Tier {idx + 1}: cannot come after an open-ended GPA tier")
        max_gpa = tier.get("max_gpa")
        if max_gpa is not None:
            max_gpa = float(max_gpa)
            if max_gpa < min_gpa:
                raise HTTPException(status_code=400, detail=f"Tier {idx + 1}: max_gpa must be >= min_gpa")
            tier["max_gpa"] = max_gpa
        if int(tier["min_credits"]) > int(tier["max_credits"]):
            raise HTTPException(status_code=400, detail=f"Tier {idx + 1}: min_credits must be <= max_credits")
        if previous_max is not None and min_gpa < previous_max:
            raise HTTPException(status_code=400, detail=f"Tier {idx + 1}: GPA ranges overlap")
        if max_gpa is not None:
            previous_max = max_gpa
        else:
            has_open_ended_before = True
    return tiers


def _resolve_credit_limits_from_policy(db: Session, profile: StudentAcademicProfile, current_gpa: float) -> tuple[int, int] | None:
    if not profile.college_id:
        return None
    tiers = (
        db.query(CollegeCreditPolicyTier)
        .filter(
            CollegeCreditPolicyTier.college_id == profile.college_id,
            CollegeCreditPolicyTier.is_active == True,  # noqa: E712
        )
        .order_by(CollegeCreditPolicyTier.min_gpa.desc())
        .all()
    )
    if not tiers:
        return None
    gpa = float(current_gpa or 0.0)
    for tier in tiers:
        min_gpa = float(tier.min_gpa or 0.0)
        max_gpa = float(tier.max_gpa) if tier.max_gpa is not None else None
        if gpa < min_gpa:
            continue
        if max_gpa is not None and gpa > max_gpa:
            continue
        return int(tier.min_credits or 0), int(tier.max_credits or 0)
    fallback = tiers[-1]
    return int(fallback.min_credits or 0), int(fallback.max_credits or 0)


def _resolve_credit_limits_from_regulation(db: Session, profile: StudentAcademicProfile, current_gpa: float) -> tuple[int, int] | None:
    if not profile.college_id:
        return None
    if profile.entry_batch_year:
        plan = (
            db.query(CurriculumPlan)
            .filter(
                CurriculumPlan.college_id == profile.college_id,
                CurriculumPlan.batch_year == profile.entry_batch_year,
            )
            .order_by(CurriculumPlan.version.desc())
            .first()
        )
    else:
        plan = (
            db.query(CurriculumPlan)
            .filter(CurriculumPlan.college_id == profile.college_id, CurriculumPlan.is_active == True)  # noqa: E712
            .order_by(CurriculumPlan.batch_year.desc(), CurriculumPlan.version.desc())
            .first()
        )
    if not plan:
        return None
    regulation = db.query(ProgramRegulation).filter(ProgramRegulation.plan_id == plan.id).first()
    if not regulation:
        return None
    min_credits = int(regulation.min_credits_per_semester or 0)
    gpa = float(current_gpa or 0.0)
    if gpa > 0 and gpa < float(regulation.warning_gpa_threshold or 0.0):
        return min_credits, int(regulation.max_credits_under_warning or 0)
    return min_credits, int(regulation.max_credits_per_semester or 0)


def _resolve_credit_limits(db: Session, profile: StudentAcademicProfile, current_gpa: float) -> tuple[int, int]:
    # First-registration students (no earned hours and no GPA history)
    # should use the normal semester cap, not GPA warning tiers.
    passed_hours = float(getattr(profile, "passed_hours", 0.0) or 0.0)
    if float(current_gpa or 0.0) <= 0.0 and passed_hours <= 0.0:
        from_regulation = _resolve_credit_limits_from_regulation(db, profile, current_gpa)
        if from_regulation is not None:
            return from_regulation

    from_policy = _resolve_credit_limits_from_policy(db, profile, current_gpa)
    if from_policy is not None:
        return from_policy
    from_regulation = _resolve_credit_limits_from_regulation(db, profile, current_gpa)
    if from_regulation is not None:
        return from_regulation
    return 0, 21


def _grade_to_gpa_points(grade: str | None, total: float | None = None, max_total: float | None = None) -> float | None:
    grade_map = {
        "A+": 4.0,
        "A": 4.0,
        "A-": 3.7,
        "B+": 3.3,
        "B": 3.0,
        "B-": 2.7,
        "C+": 2.3,
        "C": 2.0,
        "C-": 1.7,
        "D+": 1.3,
        "D": 1.0,
        "P": 1.0,
        "F": 0.0,
    }
    normalized = (grade or "").strip().upper()
    if normalized in grade_map:
        return grade_map[normalized]

    if total is None:
        return None
    maxv = float(max_total or 100.0)
    if maxv <= 0:
        maxv = 100.0
    pct = (float(total) / maxv) * 100.0
    if pct >= 90:
        return 4.0
    if pct >= 80:
        return 3.0
    if pct >= 70:
        return 2.0
    if pct >= 60:
        return 1.0
    return 0.0


def _calculate_effective_gpa(db: Session, profile: StudentAcademicProfile) -> float:
    rows = (
        db.query(GradeBook.grade, GradeBook.total, CourseCatalog.credit_hours, CourseCatalog.max_total)
        .join(CourseOffering, CourseOffering.id == GradeBook.offering_id)
        .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
        .filter(
            GradeBook.student_user_id == profile.student_user_id,
            GradeBook.publish_status == "published",
        )
        .all()
    )
    if not rows:
        return float(profile.gpa or 0.0)

    total_points = 0.0
    total_credits = 0.0
    for grade, total, credit_hours, max_total in rows:
        credits = float(credit_hours or 0.0)
        if credits <= 0:
            continue
        points = _grade_to_gpa_points(grade, total, max_total)
        if points is None:
            continue
        total_points += points * credits
        total_credits += credits

    if total_credits <= 0:
        return float(profile.gpa or 0.0)
    return round(total_points / total_credits, 2)


def _sync_student_profile_academic_metrics_from_published_grades(
    db: Session,
    profile: StudentAcademicProfile,
) -> StudentAcademicProfile:
    rows = (
        db.query(CourseOffering.course_id, GradeBook.grade, GradeBook.total, CourseCatalog.credit_hours, CourseCatalog.max_total)
        .join(CourseOffering, CourseOffering.id == GradeBook.offering_id)
        .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
        .filter(
            GradeBook.student_user_id == profile.student_user_id,
            GradeBook.publish_status == "published",
        )
        .all()
    )
    if not rows:
        return profile

    total_points = 0.0
    total_credits = 0.0
    passed_course_ids: set[int] = set()
    passed_hours = 0.0

    for course_id, grade, total, credit_hours, max_total in rows:
        credits = float(credit_hours or 0.0)
        if credits > 0:
            points = _grade_to_gpa_points(grade, total, max_total)
            if points is not None:
                total_points += points * credits
                total_credits += credits

        if course_id is None or int(course_id) in passed_course_ids:
            continue
        normalized_grade = (grade or "").strip().upper()
        is_passed = normalized_grade in PASSING_GRADES or (total is not None and float(total) >= 50.0)
        if not is_passed:
            continue
        passed_course_ids.add(int(course_id))
        passed_hours += credits

    next_gpa = round(total_points / total_credits, 2) if total_credits > 0 else float(profile.gpa or 0.0)
    next_passed_hours = round(float(passed_hours or 0.0), 2)
    if float(profile.gpa or 0.0) == next_gpa and float(getattr(profile, "passed_hours", 0.0) or 0.0) == next_passed_hours:
        return profile

    profile.gpa = next_gpa
    profile.passed_hours = next_passed_hours
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def _build_passed_course_sets(db: Session, student_user_id: int) -> tuple[set[int], dict[int, str]]:
    rows = (
        db.query(CourseOffering.course_id, GradeBook.grade, GradeBook.total)
        .join(CourseOffering, CourseOffering.id == GradeBook.offering_id)
        .filter(
            GradeBook.student_user_id == student_user_id,
            GradeBook.publish_status == "published",
        )
        .all()
    )
    passed_course_ids: set[int] = set()
    grades_by_course: dict[int, str] = {}
    for course_id, grade, total in rows:
        if course_id is None:
            continue
        normalized_grade = (grade or "").strip().upper()
        is_passed = normalized_grade in PASSING_GRADES or (total is not None and float(total) >= 50.0)
        if is_passed:
            passed_course_ids.add(int(course_id))
            if normalized_grade:
                grades_by_course[int(course_id)] = normalized_grade
    return passed_course_ids, grades_by_course


def _grade_points(grade: str | None) -> int:
    rank = {
        "A+": 12,
        "A": 11,
        "A-": 10,
        "B+": 9,
        "B": 8,
        "B-": 7,
        "C+": 6,
        "C": 5,
        "C-": 4,
        "D+": 3,
        "D": 2,
        "P": 1,
        "F": 0,
    }
    return rank.get((grade or "").strip().upper(), -1)


def _validate_prerequisites_for_course(
    db: Session,
    course: CourseCatalog,
    passed_course_ids: set[int],
    grades_by_course: dict[int, str],
    selected_course_ids: set[int],
) -> None:
    prereqs = db.query(CoursePrerequisite).filter(CoursePrerequisite.course_id == course.id).all()
    for prereq in prereqs:
        prereq_course = db.query(CourseCatalog).filter(CourseCatalog.id == prereq.prerequisite_course_id).first()
        prereq_name = prereq_course.code if prereq_course else str(prereq.prerequisite_course_id)
        condition = (prereq.condition_type or "pass").strip().lower()

        if condition == "co_requisite":
            if prereq.prerequisite_course_id in passed_course_ids or prereq.prerequisite_course_id in selected_course_ids:
                continue
            raise HTTPException(status_code=400, detail=f"Course {course.code} requires co-requisite {prereq_name}")

        if prereq.prerequisite_course_id not in passed_course_ids:
            raise HTTPException(status_code=400, detail=f"Course {course.code} requires prerequisite {prereq_name}")

        if condition == "min_grade" and prereq.min_grade:
            student_grade = grades_by_course.get(prereq.prerequisite_course_id)
            if _grade_points(student_grade) < _grade_points(prereq.min_grade):
                raise HTTPException(
                    status_code=400,
                    detail=f"Course {course.code} requires minimum grade {prereq.min_grade} in {prereq_name}",
                )


@router.post("/colleges", response_model=CollegeResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin"))])
async def create_college(payload: CollegeCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if db.query(College).filter(College.code == payload.code.strip()).first():
        raise HTTPException(status_code=400, detail="College code already exists")
    row = College(**payload.model_dump())
    db.add(row)
    db.flush()
    _log_audit(db, current_user.id, "college", str(row.id), "create", None, payload.model_dump())
    db.commit()
    db.refresh(row)
    return row


@router.post("/bootstrap/default-colleges", dependencies=[Depends(require_role("admin"))])
async def bootstrap_default_colleges(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    defaults = [
        {"code": "CS", "name_ar": "ط¹ظ„ظˆظ… ط§ظ„ط­ط§ط³ط¨", "name_en": "Computer Science", "total_years": 4, "branching_start_year": 3},
        {"code": "DENT", "name_ar": "ط·ط¨ ط§ظ„ط£ط³ظ†ط§ظ†", "name_en": "Dentistry", "total_years": 5, "branching_start_year": None},
    ]
    created = 0
    for item in defaults:
        existing = db.query(College).filter(College.code == item["code"]).first()
        if existing:
            continue
        row = College(**item, is_active=True)
        db.add(row)
        db.flush()
        _log_audit(db, current_user.id, "college", str(row.id), "bootstrap_create", None, item)
        created += 1
    db.commit()
    return {"created": created, "total_defaults": len(defaults)}


@router.get("/colleges", response_model=list[CollegeResponse])
async def list_colleges(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(College).order_by(College.name_ar.asc()).all()


@router.patch("/colleges/{college_id}", response_model=CollegeResponse, dependencies=[Depends(require_role("admin"))])
async def patch_college(college_id: int, payload: CollegeUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = db.query(College).filter(College.id == college_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="College not found")
    before = {"name_ar": row.name_ar, "total_years": row.total_years, "branching_start_year": row.branching_start_year, "is_active": row.is_active}
    patch = payload.model_dump(exclude_unset=True)
    for k, v in patch.items():
        setattr(row, k, v)
    _log_audit(db, current_user.id, "college", str(row.id), "update", before, patch)
    db.commit()
    db.refresh(row)
    return row


@router.get("/colleges/{college_id}/credit-policies", response_model=list[CreditPolicyTierResponse])
async def list_credit_policies(college_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if not db.query(College).filter(College.id == college_id).first():
        raise HTTPException(status_code=404, detail="College not found")
    return (
        db.query(CollegeCreditPolicyTier)
        .filter(
            CollegeCreditPolicyTier.college_id == college_id,
            CollegeCreditPolicyTier.is_active == True,  # noqa: E712
        )
        .order_by(CollegeCreditPolicyTier.min_gpa.asc())
        .all()
    )


@router.put("/colleges/{college_id}/credit-policies", response_model=list[CreditPolicyTierResponse], dependencies=[Depends(require_role("admin"))])
async def replace_credit_policies(
    college_id: int,
    payload: CreditPolicyTierReplaceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.query(College).filter(College.id == college_id).first():
        raise HTTPException(status_code=404, detail="College not found")

    tiers = _validate_credit_policy_tiers([item.model_dump() for item in payload.tiers])
    db.query(CollegeCreditPolicyTier).filter(CollegeCreditPolicyTier.college_id == college_id).delete()
    for tier in tiers:
        db.add(
            CollegeCreditPolicyTier(
                college_id=college_id,
                min_gpa=tier["min_gpa"],
                max_gpa=tier.get("max_gpa"),
                min_credits=tier["min_credits"],
                max_credits=tier["max_credits"],
                is_active=True,
            )
        )
    _log_audit(
        db,
        current_user.id,
        "college_credit_policy",
        str(college_id),
        "replace",
        None,
        {"tiers": tiers},
    )
    db.commit()
    return (
        db.query(CollegeCreditPolicyTier)
        .filter(
            CollegeCreditPolicyTier.college_id == college_id,
            CollegeCreditPolicyTier.is_active == True,  # noqa: E712
        )
        .order_by(CollegeCreditPolicyTier.min_gpa.asc())
        .all()
    )


@router.get("/registration/credit-policy/me")
async def my_credit_policy(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")
    profile = _get_student_profile(db, current_user.id)
    current_gpa = _calculate_effective_gpa(db, profile)
    limits = _resolve_credit_limits(db, profile, current_gpa)
    tiers = []
    if profile.college_id:
        tiers = (
            db.query(CollegeCreditPolicyTier)
            .filter(
                CollegeCreditPolicyTier.college_id == profile.college_id,
                CollegeCreditPolicyTier.is_active == True,  # noqa: E712
            )
            .order_by(CollegeCreditPolicyTier.min_gpa.asc())
            .all()
        )
    return {
        "student_user_id": current_user.id,
        "gpa": float(current_gpa or 0.0),
        "allowed_credit_hours": {"min": int(limits[0]), "max": int(limits[1])},
        "tiers": [CreditPolicyTierResponse.model_validate(item).model_dump(mode="json") for item in tiers],
    }


@router.post("/colleges/{college_id}/tracks", response_model=TrackResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin"))])
async def create_track(college_id: int, payload: TrackCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not db.query(College).filter(College.id == college_id).first():
        raise HTTPException(status_code=404, detail="College not found")
    row = CollegeTrack(college_id=college_id, **payload.model_dump())
    db.add(row)
    db.flush()
    _log_audit(db, current_user.id, "track", str(row.id), "create", None, payload.model_dump())
    db.commit()
    db.refresh(row)
    return row


@router.get("/colleges/{college_id}/tracks", response_model=list[TrackResponse])
async def list_tracks(college_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(CollegeTrack).filter(CollegeTrack.college_id == college_id, CollegeTrack.is_active == True).order_by(CollegeTrack.name_ar.asc()).all()  # noqa: E712


@router.post(
    "/assessment-templates",
    response_model=AssessmentTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin"))],
)
async def create_assessment_template(payload: AssessmentTemplateCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    code = payload.code.strip().upper()
    if db.query(AssessmentTemplate).filter(AssessmentTemplate.code == code).first():
        raise HTTPException(status_code=400, detail="Assessment template code already exists")
    _validate_template_components([item.model_dump() for item in payload.components])

    row = AssessmentTemplate(
        code=code,
        name_ar=payload.name_ar,
        name_en=payload.name_en,
        college_id=payload.college_id,
        track_id=payload.track_id,
        study_year=payload.study_year,
        semester=payload.semester,
        effective_from_year=payload.effective_from_year,
        is_default=payload.is_default,
        is_active=payload.is_active,
        notes=payload.notes,
    )
    db.add(row)
    db.flush()

    for item in payload.components:
        db.add(AssessmentTemplateComponent(template_id=row.id, **item.model_dump()))
    _log_audit(db, current_user.id, "assessment_template", str(row.id), "create", None, payload.model_dump())
    db.commit()
    db.refresh(row)
    return row


@router.get("/assessment-templates", response_model=list[AssessmentTemplateResponse])
async def list_assessment_templates(
    college_id: int | None = None,
    track_id: int | None = None,
    study_year: int | None = None,
    semester: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(AssessmentTemplate).filter(AssessmentTemplate.is_active == True)  # noqa: E712
    if college_id is not None:
        q = q.filter(or_(AssessmentTemplate.college_id == college_id, AssessmentTemplate.college_id.is_(None)))
    if track_id is not None:
        q = q.filter(or_(AssessmentTemplate.track_id == track_id, AssessmentTemplate.track_id.is_(None)))
    if study_year is not None:
        q = q.filter(or_(AssessmentTemplate.study_year == study_year, AssessmentTemplate.study_year.is_(None)))
    if semester:
        q = q.filter(or_(AssessmentTemplate.semester == semester, AssessmentTemplate.semester.is_(None)))
    return q.order_by(AssessmentTemplate.is_default.desc(), AssessmentTemplate.code.asc()).all()


@router.post(
    "/grading-scales",
    response_model=GradingScaleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin"))],
)
async def create_grading_scale(payload: GradingScaleCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    code = payload.code.strip().upper()
    if db.query(GradingScale).filter(GradingScale.code == code).first():
        raise HTTPException(status_code=400, detail="Grading scale code already exists")
    if not payload.items:
        raise HTTPException(status_code=400, detail="Grading scale must include at least one item")

    row = GradingScale(
        code=code,
        name_ar=payload.name_ar,
        name_en=payload.name_en,
        college_id=payload.college_id,
        is_default=payload.is_default,
        is_active=payload.is_active,
    )
    db.add(row)
    db.flush()
    for item in payload.items:
        db.add(GradingScaleItem(scale_id=row.id, **item.model_dump()))
    _log_audit(db, current_user.id, "grading_scale", str(row.id), "create", None, payload.model_dump())
    db.commit()
    db.refresh(row)
    return row


@router.get("/grading-scales", response_model=list[GradingScaleResponse])
async def list_grading_scales(
    college_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(GradingScale).filter(GradingScale.is_active == True)  # noqa: E712
    if college_id is not None:
        q = q.filter(or_(GradingScale.college_id == college_id, GradingScale.college_id.is_(None)))
    return q.order_by(GradingScale.is_default.desc(), GradingScale.code.asc()).all()


@router.post("/catalog", response_model=CourseCatalogResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin"))])
async def create_catalog(payload: CourseCatalogCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    template_total = None
    if payload.assessment_template_id is not None:
        template = db.query(AssessmentTemplate).filter(AssessmentTemplate.id == payload.assessment_template_id).first()
        if not template:
            raise HTTPException(status_code=400, detail="Invalid assessment_template_id")
        components = (
            db.query(AssessmentTemplateComponent)
            .filter(AssessmentTemplateComponent.template_id == template.id)
            .all()
        )
        if not components:
            raise HTTPException(status_code=400, detail="Selected assessment template has no components")
        template_total = float(sum(float(item.max_marks or 0) for item in components))

    if payload.grading_scale_id is not None:
        if not db.query(GradingScale).filter(GradingScale.id == payload.grading_scale_id).first():
            raise HTTPException(status_code=400, detail="Invalid grading_scale_id")

    assessment_override_components = payload.assessment_override_components or []
    if payload.allow_assessment_override and assessment_override_components:
        _validate_template_components(assessment_override_components)

    max_total = payload.max_mid1 + payload.max_mid2 + payload.max_coursework + payload.max_final
    if template_total is not None and max_total <= 0:
        max_total = template_total

    row = CourseCatalog(
        code=payload.code,
        title_ar=payload.title_ar,
        title_en=payload.title_en,
        college_id=payload.college_id,
        track_id=payload.track_id,
        plan_id=payload.plan_id,
        study_year=payload.study_year,
        semester=payload.semester,
        credit_hours=payload.credit_hours,
        lecture_hours=payload.lecture_hours,
        lab_hours=payload.lab_hours,
        max_mid1=payload.max_mid1,
        max_mid2=payload.max_mid2,
        max_coursework=payload.max_coursework,
        max_final=payload.max_final,
        max_total=max_total,
        assessment_template_id=payload.assessment_template_id,
        allow_assessment_override=payload.allow_assessment_override,
        assessment_override_components_json=_to_json(assessment_override_components),
        pass_mark=payload.pass_mark,
        grading_scale_id=payload.grading_scale_id,
        is_shared=payload.is_shared,
        is_active=payload.is_active,
    )
    db.add(row)
    db.flush()
    _log_audit(db, current_user.id, "course_catalog", str(row.id), "create", None, payload.model_dump())
    db.commit()
    db.refresh(row)
    return row


@router.get("/catalog", response_model=list[CourseCatalogResponse])
async def list_catalog(
    college_id: int | None = None,
    semester: str | None = None,
    study_year: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(CourseCatalog).filter(CourseCatalog.is_active == True)  # noqa: E712
    if college_id is not None:
        q = q.filter(or_(CourseCatalog.college_id == college_id, CourseCatalog.college_id.is_(None)))
    if semester:
        q = q.filter(CourseCatalog.semester == semester)
    if study_year is not None:
        q = q.filter(CourseCatalog.study_year == study_year)
    return q.order_by(CourseCatalog.code.asc()).all()


@router.get("/catalog/{course_id}/prerequisites", response_model=list[CoursePrerequisiteResponse])
async def list_course_prerequisites(course_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if not db.query(CourseCatalog).filter(CourseCatalog.id == course_id).first():
        raise HTTPException(status_code=404, detail="Course not found")
    return db.query(CoursePrerequisite).filter(CoursePrerequisite.course_id == course_id).all()


@router.post(
    "/catalog/{course_id}/prerequisites",
    response_model=CoursePrerequisiteResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin"))],
)
async def create_course_prerequisite(
    course_id: int,
    payload: CoursePrerequisiteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if course_id == payload.prerequisite_course_id:
        raise HTTPException(status_code=400, detail="A course cannot require itself")
    if not db.query(CourseCatalog).filter(CourseCatalog.id == course_id).first():
        raise HTTPException(status_code=404, detail="Course not found")
    if not db.query(CourseCatalog).filter(CourseCatalog.id == payload.prerequisite_course_id).first():
        raise HTTPException(status_code=404, detail="Prerequisite course not found")
    existing = (
        db.query(CoursePrerequisite)
        .filter(
            CoursePrerequisite.course_id == course_id,
            CoursePrerequisite.prerequisite_course_id == payload.prerequisite_course_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Prerequisite already exists")
    row = CoursePrerequisite(course_id=course_id, **payload.model_dump())
    db.add(row)
    db.flush()
    _log_audit(
        db,
        current_user.id,
        "course_prerequisite",
        str(row.id),
        "create",
        None,
        {"course_id": course_id, **payload.model_dump()},
    )
    db.commit()
    db.refresh(row)
    return row


@router.delete("/catalog/{course_id}/prerequisites/{prerequisite_id}", dependencies=[Depends(require_role("admin"))])
async def delete_course_prerequisite(
    course_id: int,
    prerequisite_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(CoursePrerequisite)
        .filter(CoursePrerequisite.id == prerequisite_id, CoursePrerequisite.course_id == course_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Prerequisite not found")
    before = {
        "course_id": row.course_id,
        "prerequisite_course_id": row.prerequisite_course_id,
        "condition_type": row.condition_type,
        "min_grade": row.min_grade,
    }
    db.delete(row)
    _log_audit(db, current_user.id, "course_prerequisite", str(prerequisite_id), "delete", before, None)
    db.commit()
    return {"deleted": True}


@router.get("/plans/{plan_id}/regulation", response_model=ProgramRegulationResponse)
async def get_program_regulation(plan_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    row = db.query(ProgramRegulation).filter(ProgramRegulation.plan_id == plan_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Regulation not found")
    return row


@router.put("/plans/{plan_id}/regulation", response_model=ProgramRegulationResponse, dependencies=[Depends(require_role("admin"))])
async def upsert_program_regulation(
    plan_id: int,
    payload: ProgramRegulationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.query(CurriculumPlan).filter(CurriculumPlan.id == plan_id).first():
        raise HTTPException(status_code=404, detail="Plan not found")
    if payload.max_credits_per_semester < payload.min_credits_per_semester:
        raise HTTPException(status_code=400, detail="max_credits_per_semester must be >= min_credits_per_semester")
    if payload.max_credits_under_warning > payload.max_credits_per_semester:
        raise HTTPException(status_code=400, detail="max_credits_under_warning must be <= max_credits_per_semester")
    row = db.query(ProgramRegulation).filter(ProgramRegulation.plan_id == plan_id).first()
    incoming = payload.model_dump()
    if row:
        before = ProgramRegulationResponse.model_validate(row).model_dump(mode="json")
        for key, value in incoming.items():
            setattr(row, key, value)
        action = "update"
    else:
        row = ProgramRegulation(plan_id=plan_id, **incoming)
        db.add(row)
        db.flush()
        before = None
        action = "create"
    _log_audit(db, current_user.id, "program_regulation", str(plan_id), action, before, incoming)
    db.commit()
    db.refresh(row)
    return row


def _normalize_schedule_key(value: Any) -> str:
    return str(value or "").strip().lower()


def _to_time_minutes(value: Any) -> tuple[str, int]:
    text_value = str(value or "").strip()
    chunks = text_value.split(":")
    if len(chunks) != 2:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM.")
    try:
        hour = int(chunks[0])
        minute = int(chunks[1])
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM.") from exc
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM.")
    return f"{hour:02d}:{minute:02d}", (hour * 60) + minute


def _resolve_offering_payload(row: CourseOffering | None, payload_data: dict[str, Any]) -> dict[str, Any]:
    def _pick(name: str) -> Any:
        if name in payload_data:
            return payload_data[name]
        return getattr(row, name, None) if row is not None else None

    resolved = {
        "course_id": _pick("course_id"),
        "academic_year_label": str(_pick("academic_year_label") or "").strip(),
        "semester": str(_pick("semester") or "").strip().lower(),
        "section": str(_pick("section") or "").strip() or "A",
        "target_group_id": str(_pick("target_group_id") or "").strip(),
        "target_group_name": str(_pick("target_group_name") or "").strip() or None,
        "day_of_week": str(_pick("day_of_week") or "").strip(),
        "start_time": _pick("start_time"),
        "end_time": _pick("end_time"),
        "room_name": str(_pick("room_name") or "").strip() or None,
        "instructor_user_id": _pick("instructor_user_id"),
        "max_students": _pick("max_students"),
        "is_active": _pick("is_active") if _pick("is_active") is not None else True,
    }
    if not resolved["course_id"]:
        raise HTTPException(status_code=400, detail="course_id is required")
    if not resolved["target_group_id"]:
        raise HTTPException(status_code=400, detail="target_group_id is required")
    if not resolved["day_of_week"]:
        raise HTTPException(status_code=400, detail="day_of_week is required")
    if not resolved["academic_year_label"] or not resolved["semester"]:
        raise HTTPException(status_code=400, detail="academic_year_label and semester are required")

    start_text, start_minutes = _to_time_minutes(resolved["start_time"])
    end_text, end_minutes = _to_time_minutes(resolved["end_time"])
    if not (start_minutes < end_minutes):
        raise HTTPException(status_code=400, detail="End time must be after start time.")
    resolved["start_time"] = start_text
    resolved["end_time"] = end_text
    resolved["start_minutes"] = start_minutes
    resolved["end_minutes"] = end_minutes
    return resolved


def _validate_offering_schedule_conflicts(
    db: Session,
    resolved_payload: dict[str, Any],
    course: CourseCatalog,
    exclude_offering_id: int | None = None,
) -> None:
    candidate_rows = (
        db.query(CourseOffering, CourseCatalog)
        .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
        .filter(
            CourseOffering.is_active == True,  # noqa: E712
            CourseOffering.academic_year_label == resolved_payload["academic_year_label"],
            CourseOffering.semester == resolved_payload["semester"],
            CourseOffering.day_of_week == resolved_payload["day_of_week"],
        )
        .all()
    )
    room_key = _normalize_schedule_key(resolved_payload.get("room_name"))
    instructor_user_id = resolved_payload.get("instructor_user_id")
    target_group_key = _normalize_schedule_key(resolved_payload.get("target_group_id"))
    current_scope_key = (
        int(course.college_id or 0),
        int(course.track_id or 0),
        int(course.study_year or 0),
    )
    found_room_conflict = False
    found_instructor_conflict = False
    found_group_conflict = False

    for offering, offering_course in candidate_rows:
        if exclude_offering_id is not None and int(offering.id) == int(exclude_offering_id):
            continue
        if not offering.start_time or not offering.end_time:
            continue
        try:
            _, existing_start = _to_time_minutes(offering.start_time)
            _, existing_end = _to_time_minutes(offering.end_time)
        except HTTPException:
            continue
        # Overlap formula: new_start < existing_end && new_end > existing_start
        if not (resolved_payload["start_minutes"] < existing_end and resolved_payload["end_minutes"] > existing_start):
            continue

        existing_room_key = _normalize_schedule_key(offering.room_name)
        if room_key and existing_room_key and room_key == existing_room_key:
            found_room_conflict = True

        existing_instructor = offering.instructor_user_id
        if instructor_user_id is not None and existing_instructor is not None and int(instructor_user_id) == int(existing_instructor):
            found_instructor_conflict = True

        existing_group_key = _normalize_schedule_key(offering.target_group_id)
        existing_scope_key = (
            int(offering_course.college_id or 0),
            int(offering_course.track_id or 0),
            int(offering_course.study_year or 0),
        )
        if target_group_key and existing_group_key and target_group_key == existing_group_key and current_scope_key == existing_scope_key:
            found_group_conflict = True

    messages: list[str] = []
    if found_room_conflict:
        messages.append("This room is already occupied at this time.")
    if found_instructor_conflict:
        messages.append("This instructor already has a class at this time.")
    if found_group_conflict:
        messages.append("This student group already has another section at this time.")
    if messages:
        raise HTTPException(status_code=400, detail=" ".join(messages))


@router.post("/offerings", response_model=OfferingResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin"))])
async def create_offering(payload: OfferingCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = db.query(CourseCatalog).filter(CourseCatalog.id == payload.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    resolved = _resolve_offering_payload(None, payload.model_dump())
    _validate_offering_schedule_conflicts(db, resolved, course)
    row = CourseOffering(
        course_id=int(resolved["course_id"]),
        academic_year_label=resolved["academic_year_label"],
        semester=resolved["semester"],
        section=resolved["section"],
        target_group_id=resolved["target_group_id"],
        target_group_name=resolved["target_group_name"],
        day_of_week=resolved["day_of_week"],
        start_time=resolved["start_time"],
        end_time=resolved["end_time"],
        room_name=resolved["room_name"],
        instructor_user_id=resolved["instructor_user_id"],
        max_students=resolved["max_students"],
        is_active=bool(resolved["is_active"]),
    )
    db.add(row)
    db.flush()
    _log_audit(db, current_user.id, "offering", str(row.id), "create", None, payload.model_dump())
    db.commit()
    db.refresh(row)
    return row


@router.patch("/offerings/{offering_id}", response_model=OfferingResponse, dependencies=[Depends(require_role("admin"))])
async def update_offering(
    offering_id: int,
    payload: OfferingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(CourseOffering).filter(CourseOffering.id == offering_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Offering not found")
    before = OfferingResponse.model_validate(row).model_dump(mode="json")
    payload_data = payload.model_dump(exclude_unset=True)
    resolved = _resolve_offering_payload(row, payload_data)
    course = db.query(CourseCatalog).filter(CourseCatalog.id == int(resolved["course_id"])).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    _validate_offering_schedule_conflicts(db, resolved, course, exclude_offering_id=offering_id)

    row.course_id = int(resolved["course_id"])
    row.academic_year_label = resolved["academic_year_label"]
    row.semester = resolved["semester"]
    row.section = resolved["section"]
    row.target_group_id = resolved["target_group_id"]
    row.target_group_name = resolved["target_group_name"]
    row.day_of_week = resolved["day_of_week"]
    row.start_time = resolved["start_time"]
    row.end_time = resolved["end_time"]
    row.room_name = resolved["room_name"]
    row.instructor_user_id = resolved["instructor_user_id"]
    row.max_students = resolved["max_students"]
    row.is_active = bool(resolved["is_active"])

    _log_audit(
        db,
        current_user.id,
        "offering",
        str(row.id),
        "update",
        before,
        payload_data,
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/offerings", response_model=list[OfferingResponse])
async def list_offerings(academic_year_label: str, semester: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return (
        db.query(CourseOffering)
        .filter(CourseOffering.academic_year_label == academic_year_label, CourseOffering.semester == semester, CourseOffering.is_active == True)  # noqa: E712
        .all()
    )


@router.post("/student-profiles", response_model=StudentProfileResponse, dependencies=[Depends(require_role("admin"))])
async def upsert_profile(payload: StudentProfileUpsert, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _validate_student_profile_payload(db, payload)
    row = db.query(StudentAcademicProfile).filter(StudentAcademicProfile.student_user_id == payload.student_user_id).first()
    incoming = payload.model_dump()
    if row:
        for k, v in incoming.items():
            if k != "student_user_id":
                setattr(row, k, v)
    else:
        row = StudentAcademicProfile(**incoming)
        db.add(row)
        db.flush()
    _log_audit(db, current_user.id, "student_profile", str(row.id), "upsert", None, incoming)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/student-profiles/{student_user_id}/academic-metrics", response_model=StudentProfileResponse, dependencies=[Depends(require_role("admin", "advisor"))])
async def update_student_academic_metrics(
    student_user_id: int,
    payload: StudentAcademicMetricsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_student_profile(db, student_user_id, current_user):
        raise HTTPException(status_code=403, detail="You cannot manage this student")

    row = _get_student_profile(db, student_user_id)
    before = {
        "gpa": float(row.gpa or 0.0),
        "passed_hours": float(getattr(row, "passed_hours", 0.0) or 0.0),
    }
    normalized_gpa = float(payload.gpa or 0.0)
    normalized_gpa = max(0.0, min(4.0, normalized_gpa))
    normalized_gpa = round(normalized_gpa, 2)

    normalized_passed_hours = float(payload.passed_hours or 0.0)
    normalized_passed_hours = max(0.0, normalized_passed_hours)
    normalized_passed_hours = float(round(normalized_passed_hours))

    row.gpa = normalized_gpa
    row.passed_hours = normalized_passed_hours
    _log_audit(
        db,
        current_user.id,
        "student_profile",
        str(row.id),
        "update_academic_metrics",
        before,
        {"gpa": row.gpa, "passed_hours": row.passed_hours},
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/student-profiles/{student_user_id}", response_model=StudentProfileResponse, dependencies=[Depends(require_role("admin", "advisor"))])
async def get_student_profile_for_staff(
    student_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_student_profile(db, student_user_id, current_user):
        raise HTTPException(status_code=403, detail="You cannot manage this student")
    return _get_live_student_profile(db, student_user_id)


@router.get("/student-profiles/me", response_model=StudentProfileResponse)
async def my_profile(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")
    profile = _get_student_profile(db, current_user.id)
    return _sync_student_profile_academic_metrics_from_published_grades(db, profile)


@router.post("/tracks/select/{track_id}", response_model=StudentProfileResponse)
async def select_track(track_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")
    profile = _get_student_profile(db, current_user.id)
    track = db.query(CollegeTrack).filter(CollegeTrack.id == track_id, CollegeTrack.is_active == True).first()  # noqa: E712
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if profile.college_id != track.college_id:
        raise HTTPException(status_code=400, detail="Track is outside your college")
    college = db.query(College).filter(College.id == profile.college_id).first()
    if college and college.branching_start_year and profile.current_study_year < college.branching_start_year:
        raise HTTPException(status_code=400, detail=f"Track selection opens from year {college.branching_start_year}")
    profile.current_track_id = track.id
    _log_audit(db, current_user.id, "student_profile", str(profile.id), "select_track", None, {"track_id": track.id})
    db.commit()
    db.refresh(profile)
    return profile


@router.patch("/finance/{student_user_id}", response_model=FinanceStatusResponse, dependencies=[Depends(require_role("admin"))])
async def patch_finance(student_user_id: int, payload: FinanceStatusUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = _get_or_create_finance_status(db, student_user_id)
    row.status = payload.status
    row.notes = payload.notes
    if payload.status == "cleared":
        row.cleared_by_user_id = current_user.id
        row.cleared_at = _now()
    _log_audit(db, current_user.id, "finance_status", str(row.id), "update", None, payload.model_dump())
    db.commit()
    db.refresh(row)
    return row


@router.post("/registration-windows", response_model=RegistrationWindowResponse, dependencies=[Depends(require_role("admin"))])
async def create_window(payload: RegistrationWindowCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=400, detail="Invalid window interval")
    row = RegistrationWindow(**payload.model_dump())
    if not row.open_at:
        row.open_at = row.starts_at
    if not row.close_at:
        row.close_at = row.ends_at
    row.status = _normalize_period_status(row.status)
    db.add(row)
    db.flush()
    _log_audit(db, current_user.id, "registration_window", str(row.id), "create", None, payload.model_dump(mode="json"))
    db.commit()
    db.refresh(row)
    return row


@router.get("/registration-windows", response_model=list[RegistrationWindowResponse], dependencies=[Depends(require_role("admin", "advisor"))])
async def list_windows(db: Session = Depends(get_db)):
    return db.query(RegistrationWindow).order_by(RegistrationWindow.starts_at.desc()).all()


@router.patch("/registration-windows/{window_id}/status", response_model=RegistrationWindowResponse, dependencies=[Depends(require_role("admin"))])
async def patch_window_status(
    window_id: int,
    payload: RegistrationWindowStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(RegistrationWindow).filter(RegistrationWindow.id == window_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Registration window not found")
    before = RegistrationWindowResponse.model_validate(row).model_dump(mode="json")
    row.status = _normalize_period_status(payload.status)
    _log_audit(
        db,
        current_user.id,
        "registration_window",
        str(row.id),
        "status_update",
        before,
        {"status": row.status},
    )
    db.commit()
    db.refresh(row)
    return row


@router.patch("/registration-windows/{window_id}", response_model=RegistrationWindowResponse, dependencies=[Depends(require_role("admin"))])
async def patch_registration_window(
    window_id: int,
    payload: RegistrationWindowUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(RegistrationWindow).filter(RegistrationWindow.id == window_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Registration window not found")

    before = RegistrationWindowResponse.model_validate(row).model_dump(mode="json")
    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates:
        updates["status"] = _normalize_period_status(updates["status"])

    starts_at_before = row.starts_at
    ends_at_before = row.ends_at
    starts_at = updates.get("starts_at", row.starts_at)
    ends_at = updates.get("ends_at", row.ends_at)
    if starts_at is not None and ends_at is not None and ends_at <= starts_at:
        raise HTTPException(status_code=400, detail="Invalid window interval")

    for key, value in updates.items():
        setattr(row, key, value)

    # Keep effective timing always in sync when admin edits main interval.
    # If UI does not send open_at/close_at explicitly, mirror starts_at/ends_at updates.
    if "starts_at" in updates and "open_at" not in updates:
        row.open_at = row.starts_at
    if "ends_at" in updates and "close_at" not in updates:
        row.close_at = row.ends_at

    if "open_at" not in updates and row.open_at is None:
        row.open_at = row.starts_at
    if "close_at" not in updates and row.close_at is None:
        row.close_at = row.ends_at

    _log_audit(
        db,
        current_user.id,
        "registration_window",
        str(row.id),
        "update",
        before,
        updates,
    )
    db.commit()
    db.refresh(row)
    return row

@router.delete("/registration-windows/{window_id}", dependencies=[Depends(require_role("admin"))])
async def delete_registration_window(
    window_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(RegistrationWindow).filter(RegistrationWindow.id == window_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Registration window not found")
    before = RegistrationWindowResponse.model_validate(row).model_dump(mode="json")
    db.delete(row)
    _log_audit(db, current_user.id, "registration_window", str(row.id), "delete", before, None)
    db.commit()
    return {"ok": True, "message": "Window deleted successfully"}


@router.get("/registration/current-period-status", dependencies=[Depends(require_role("admin", "advisor", "student"))])
async def get_current_period_status(
    academic_year_label: str,
    semester: str,
    student_user_id: int | None = None,
    college_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = str(current_user.role or "").lower()
    effective_college_id = college_id
    skip_manage_check = False
    if role == "student":
        if student_user_id and int(student_user_id) != int(current_user.id):
            raise HTTPException(status_code=403, detail="You cannot access another student period status")
        effective_college_id = _get_student_profile(db, current_user.id).college_id
        student_user_id = current_user.id
        skip_manage_check = True
    if student_user_id:
        if (not skip_manage_check) and (not _can_manage_student_profile(db, student_user_id, current_user)):
            raise HTTPException(status_code=403, detail="You cannot manage this student")
        effective_college_id = _get_student_profile(db, student_user_id).college_id

    window = _term_window(
        db,
        college_id=effective_college_id,
        academic_year_label=academic_year_label,
        semester=semester,
    )
    status_value = _effective_window_status(window)
    return {
        "status": status_value,
        "is_open": status_value == "OPEN",
        "window": RegistrationWindowResponse.model_validate(window).model_dump(mode="json") if window else None,
    }


@router.get("/registration/active-term", dependencies=[Depends(require_role("admin", "advisor", "student"))])
async def get_active_registration_term(
    academic_year_label: str | None = None,
    student_user_id: int | None = None,
    college_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = str(current_user.role or "").lower()
    effective_college_id = college_id
    skip_manage_check = False
    if role == "student":
        if student_user_id and int(student_user_id) != int(current_user.id):
            raise HTTPException(status_code=403, detail="You cannot access another student active term")
        profile = _get_student_profile(db, current_user.id)
        effective_college_id = profile.college_id
        student_user_id = current_user.id
        skip_manage_check = True
    if student_user_id:
        if (not skip_manage_check) and (not _can_manage_student_profile(db, student_user_id, current_user)):
            raise HTTPException(status_code=403, detail="You cannot manage this student")
        effective_college_id = _get_student_profile(db, student_user_id).college_id

    window = _best_registration_window(
        db,
        college_id=effective_college_id,
        academic_year_label=academic_year_label,
    )
    status_value = _effective_window_status(window)
    return {
        "academic_year_label": getattr(window, "academic_year_label", None),
        "semester": getattr(window, "semester", None),
        "status": status_value,
        "is_open": status_value == "OPEN",
        "window": RegistrationWindowResponse.model_validate(window).model_dump(mode="json") if window else None,
    }


@router.get("/offerings/me-available")
async def my_available_offerings(academic_year_label: str, semester: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")
    profile = _get_student_profile(db, current_user.id)
    offerings = db.query(CourseOffering).filter(CourseOffering.academic_year_label == academic_year_label, CourseOffering.semester == semester, CourseOffering.is_active == True).all()  # noqa: E712
    capacity_snapshot = _section_capacity_snapshot(db, [int(item.id) for item in offerings])
    passed_course_ids, grades_by_course = _build_passed_course_sets(db, current_user.id)
    selected_offering_ids = _selected_offering_ids_for_student_term(
        db,
        student_user_id=current_user.id,
        academic_year_label=academic_year_label,
        semester=semester,
    )
    items: list[dict[str, Any]] = []
    excluded_incomplete_schedule = 0
    for offering in offerings:
        seat = capacity_snapshot.get(int(offering.id), {})
        course = db.query(CourseCatalog).filter(CourseCatalog.id == offering.course_id).first()
        eligibility_status, eligibility_reason = _offering_eligibility_for_student(
            db,
            offering=offering,
            course=course,
            profile=profile,
            passed_course_ids=passed_course_ids,
            grades_by_course=grades_by_course,
            selected_offering_ids=selected_offering_ids,
            seat_snapshot=seat,
        )
        if eligibility_status == "hidden_invalid":
            continue
        if eligibility_status == "locked_schedule":
            excluded_incomplete_schedule += 1
            continue
        if eligibility_status not in {"open", "selected"}:
            continue
        items.append(
            {
                "offering_id": offering.id,
                "section": offering.section,
                "course_id": course.id if course else None,
                "course_code": course.code if course else None,
                "course_title_ar": course.title_ar if course else None,
                "credit_hours": course.credit_hours if course else 0,
                "study_year": course.study_year if course else None,
                "current_students": seat.get("current_students", 0),
                "capacity": seat.get("capacity"),
                "available_seats": seat.get("available_seats"),
                "is_open": bool(seat.get("is_open", True)),
                "section_status": seat.get("section_status", "OPEN"),
                "eligibility_status": eligibility_status,
                "eligibility_reason": eligibility_reason,
                "is_selected": int(offering.id) in selected_offering_ids,
                "day_of_week": offering.day_of_week,
                "start_time": offering.start_time,
                "end_time": offering.end_time,
                "room_name": offering.room_name,
            }
        )
    missing_schedule_count = sum(
        1
        for offering in offerings
        if not str(getattr(offering, "day_of_week", "") or "").strip()
        or not str(getattr(offering, "start_time", "") or "").strip()
    )
    logger.info(
        "offerings.me_available user_id=%s ay=%s semester=%s total_items=%s missing_schedule_count=%s excluded_incomplete_schedule=%s",
        current_user.id,
        academic_year_label,
        semester,
        len(items),
        missing_schedule_count,
        excluded_incomplete_schedule,
    )
    return {"items": items}


@router.get("/offerings/by-student", dependencies=[Depends(require_role("admin", "advisor"))])
async def offerings_for_student(
    student_user_id: int,
    academic_year_label: str,
    semester: str,
    open_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_student_profile(db, student_user_id, current_user):
        raise HTTPException(status_code=403, detail="You cannot manage this student")

    profile = _get_student_profile(db, student_user_id)
    period = _term_window(
        db,
        college_id=profile.college_id,
        academic_year_label=academic_year_label,
        semester=semester,
    )
    _require_open_or_review_period(period, "Load offerings")
    offerings = (
        db.query(CourseOffering)
        .filter(
            CourseOffering.academic_year_label == academic_year_label,
            CourseOffering.semester == semester,
            CourseOffering.is_active == True,  # noqa: E712
        )
        .all()
    )
    capacity_snapshot = _section_capacity_snapshot(db, [int(item.id) for item in offerings])
    passed_course_ids, grades_by_course = _build_passed_course_sets(db, student_user_id)
    selected_offering_ids = _selected_offering_ids_for_student_term(
        db,
        student_user_id=student_user_id,
        academic_year_label=academic_year_label,
        semester=semester,
    )
    items: list[dict[str, Any]] = []
    excluded_incomplete_schedule = 0
    for offering in offerings:
        seat = capacity_snapshot.get(int(offering.id), {})
        course = db.query(CourseCatalog).filter(CourseCatalog.id == offering.course_id).first()
        eligibility_status, eligibility_reason = _offering_eligibility_for_student(
            db,
            offering=offering,
            course=course,
            profile=profile,
            passed_course_ids=passed_course_ids,
            grades_by_course=grades_by_course,
            selected_offering_ids=selected_offering_ids,
            seat_snapshot=seat,
        )
        if eligibility_status == "hidden_invalid":
            continue
        if eligibility_status == "locked_schedule":
            excluded_incomplete_schedule += 1
            continue
        if open_only and eligibility_status not in {"open", "selected"}:
            continue
        items.append(
            {
                "offering_id": offering.id,
                "section": offering.section,
                "course_id": course.id if course else None,
                "course_code": course.code if course else None,
                "course_title_ar": course.title_ar if course else None,
                "credit_hours": course.credit_hours if course else 0,
                "study_year": course.study_year if course else None,
                "current_students": seat.get("current_students", 0),
                "capacity": seat.get("capacity"),
                "available_seats": seat.get("available_seats"),
                "is_open": bool(seat.get("is_open", True)),
                "section_status": seat.get("section_status", "OPEN"),
                "eligibility_status": eligibility_status,
                "eligibility_reason": eligibility_reason,
                "is_selected": int(offering.id) in selected_offering_ids,
                "day_of_week": offering.day_of_week,
                "start_time": offering.start_time,
                "end_time": offering.end_time,
                "room_name": offering.room_name,
            }
        )
    missing_schedule_count = sum(
        1
        for offering in offerings
        if not str(getattr(offering, "day_of_week", "") or "").strip()
        or not str(getattr(offering, "start_time", "") or "").strip()
    )
    logger.info(
        "offerings.by_student actor_user_id=%s student_user_id=%s ay=%s semester=%s total_items=%s open_only=%s missing_schedule_count=%s excluded_incomplete_schedule=%s",
        current_user.id,
        student_user_id,
        academic_year_label,
        semester,
        len(items),
        bool(open_only),
        missing_schedule_count,
        excluded_incomplete_schedule,
    )
    return {"items": items}


@router.post("/registration/submit", response_model=RegistrationRequestResponse)
async def submit_registration(payload: RegistrationSubmit, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")
    profile = _get_student_profile(db, current_user.id)
    effective_advisor_user_id = _resolve_effective_student_advisor_id(db, profile)
    effective_reviewer_user_id = effective_advisor_user_id or _resolve_fallback_admin_user_id(db)
    if not effective_reviewer_user_id:
        raise HTTPException(status_code=400, detail="ظ„ط§ ظٹظˆط¬ط¯ ظ…ط±ط´ط¯ ط£ظƒط§ط¯ظٹظ…ظٹ ط£ظˆ ط£ط¯ظ…ظ† ظ…طھط§ط­ ظ„ط§ط³طھظ„ط§ظ… ط§ظ„ط·ظ„ط¨.")
    window = _term_window(
        db,
        college_id=profile.college_id,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
    )
    if not window:
        raise HTTPException(status_code=400, detail="No registration period found for this term")
    _require_open_period(window, "Registration submit")
    if not window.allows_self_registration:
        raise HTTPException(status_code=400, detail="Registration is advisor-only in this period")
    if window.requires_financial_clearance and not _is_financially_cleared(
        db,
        current_user.id,
        payload.academic_year_label,
        payload.semester,
    ):
        raise HTTPException(status_code=400, detail="Financial clearance is required")

    req = _latest_registration_request(
        db,
        student_user_id=current_user.id,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
    )
    if not req:
        req = RegistrationRequest(
            student_user_id=current_user.id,
            academic_year_label=payload.academic_year_label,
            semester=payload.semester,
            status="draft",
            created_by_user_id=current_user.id,
            submitted_via="self",
            is_after_window=False,
        )
        db.add(req)
        db.flush()
    if _is_request_locked_for_edit(req):
        current_status = str(req.status or "").strip().lower() or "locked"
        raise HTTPException(
            status_code=400,
            detail=f"Registration is locked for this term (current status: {current_status}).",
        )
    total_credit_hours, min_credits, max_credits = _apply_registration_request_selections(
        db=db,
        req=req,
        offering_ids=payload.offering_ids,
        actor_user=current_user,
        actor_mode="self_submit",
        selection_context=payload.selection_context,
    )
    # Student "save registration" goes directly to advisor queue.
    req.status = "advisor_requested"
    req.advisor_user_id = effective_reviewer_user_id
    req.submitted_via = "self"
    req.is_after_window = False
    req.submitted_at = _now()
    req.requested_at = _now()
    req.requested_note = None
    req.advisor_note = None
    req.handled_at = None
    req.processed_by_user_id = None

    if req.advisor_user_id:
        notif = SystemNotification(
            user_id=req.advisor_user_id,
            title="طلب تسجيل جديد",
            message=f"قام الطالب بإرسال طلب تسجيل جديد لمراجعته.",
            type="registration"
        )
        db.add(notif)
    _log_audit(
        db,
        current_user.id,
        "registration_request",
        str(req.id),
        "submit",
        None,
        {
            "offering_ids": payload.offering_ids,
            "selected_credit_hours": total_credit_hours,
            "allowed_credit_hours": {"min": min_credits, "max": max_credits},
        },
    )
    db.commit()
    db.refresh(req)
    return req


@router.post("/registration/advisor-request", response_model=RegistrationRequestResponse)
async def submit_advisor_registration_request(
    payload: AdvisorRegistrationRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")

    profile = _get_student_profile(db, current_user.id)
    effective_advisor_user_id = _resolve_effective_student_advisor_id(db, profile)
    effective_reviewer_user_id = effective_advisor_user_id or _resolve_fallback_admin_user_id(db)
    if not effective_reviewer_user_id:
        raise HTTPException(status_code=400, detail="ظ„ط§ ظٹظˆط¬ط¯ ظ…ط±ط´ط¯ ط£ظƒط§ط¯ظٹظ…ظٹ ط£ظˆ ط£ط¯ظ…ظ† ظ…طھط§ط­ ظ„ط§ط³طھظ„ط§ظ… ط§ظ„ط·ظ„ط¨.")
    window = _term_window(
        db,
        college_id=profile.college_id,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
    )
    if not window:
        raise HTTPException(status_code=400, detail="No registration period found for this term")
    _require_open_period(window, "Advisor request submit")
    if not window.allows_advisor_registration:
        raise HTTPException(status_code=400, detail="Advisor registration is not allowed in this period")
    if window.allows_self_registration:
        raise HTTPException(status_code=400, detail="Advisor registration starts after self-registration is closed")

    req = _latest_registration_request(
        db,
        student_user_id=current_user.id,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
    )
    if not req:
        req = RegistrationRequest(
            student_user_id=current_user.id,
            academic_year_label=payload.academic_year_label,
            semester=payload.semester,
            status="draft",
            created_by_user_id=current_user.id,
            submitted_via="advisor",
            is_after_window=not bool(window.allows_self_registration),
        )
        db.add(req)
        db.flush()

    if _is_request_locked_for_edit(req):
        current_status = str(req.status or "").strip().lower() or "locked"
        raise HTTPException(
            status_code=400,
            detail=f"Registration is locked for this term (current status: {current_status}).",
        )

    _apply_registration_request_selections(
        db=db,
        req=req,
        offering_ids=payload.offering_ids,
        actor_user=current_user,
        actor_mode="advisor_request_submit",
    )

    req.status = "advisor_requested"
    req.advisor_user_id = effective_reviewer_user_id
    req.requested_note = payload.requested_note.strip()
    req.requested_at = _now()
    req.submitted_via = "advisor"
    req.is_after_window = not bool(window.allows_self_registration)
    req.advisor_note = None
    req.handled_at = None
    req.processed_by_user_id = None

    _log_audit(
        db,
        current_user.id,
        "registration_request",
        str(req.id),
        "submit_advisor_request",
        None,
        {
            "offering_ids": payload.offering_ids,
            "requested_note": req.requested_note,
            "is_after_window": req.is_after_window,
        },
    )
    db.commit()
    db.refresh(req)
    return req


@router.post(
    "/registration/advisor-manage",
    response_model=RegistrationRequestResponse,
    dependencies=[Depends(require_role("admin", "advisor"))],
)
async def advisor_manage_registration_for_student(
    payload: AdvisorRegistrationManagePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_student_profile(db, payload.student_user_id, current_user):
        raise HTTPException(status_code=403, detail="You cannot manage this student")

    profile = _get_student_profile(db, payload.student_user_id)
    window = _term_window(
        db,
        college_id=profile.college_id,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
    )
    if not window:
        raise HTTPException(status_code=400, detail="ظ„ط§ طھظˆط¬ط¯ ظپطھط±ط© طھط³ط¬ظٹظ„ ظ„ظ‡ط°ط§ ط§ظ„ط¹ط§ظ… ط§ظ„ط£ظƒط§ط¯ظٹظ…ظٹ / ط§ظ„طھط±ظ…. No registration period found for this term")
    _require_open_or_review_period(window, "تسجيل المرشد الأكاديمي / Advisor manage registration")
    if not window.allows_advisor_registration:
        raise HTTPException(status_code=400, detail="طھط³ط¬ظٹظ„ ط§ظ„ظ…ط±ط´ط¯ ط§ظ„ط£ظƒط§ط¯ظٹظ…ظٹ ط؛ظٹط± ظ…ط³ظ…ظˆط­ ظپظٹ ظ‡ط°ظ‡ ط§ظ„ظپطھط±ط©. Advisor registration is not allowed in this period")

    req = _latest_registration_request(
        db,
        student_user_id=payload.student_user_id,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
    )
    if not req:
        req = RegistrationRequest(
            student_user_id=payload.student_user_id,
            academic_year_label=payload.academic_year_label,
            semester=payload.semester,
            status="draft",
            created_by_user_id=current_user.id,
            submitted_via="advisor",
            is_after_window=True,
        )
        db.add(req)
        db.flush()

    if _is_request_locked_for_edit(req):
        raise HTTPException(status_code=400, detail="ط§ظ„طھط³ط¬ظٹظ„ ظ…ط¹طھظ…ط¯ ط£ظˆ ظ…ظ‚ظپظ„ ظˆظ„ط§ ظٹظ…ظƒظ† طھط¹ط¯ظٹظ„ظ‡. Registration is approved/locked and cannot be modified")

    _apply_registration_request_selections(
        db=db,
        req=req,
        offering_ids=payload.offering_ids,
        actor_user=current_user,
        actor_mode="advisor_manage_for_student",
    )

    req.status = "advisor_requested"
    req.requested_note = (payload.requested_note or "").strip() or None
    req.requested_at = _now()
    req.submitted_via = "advisor"
    req.is_after_window = True
    if str(current_user.role or "").lower() == "advisor":
        req.advisor_user_id = current_user.id
    else:
        req.advisor_user_id = profile.advisor_user_id or req.advisor_user_id
    req.advisor_note = None
    req.advisor_approved_at = None
    req.handled_at = None
    req.processed_by_user_id = None
    req.locked_at = None

    _log_audit(
        db,
        current_user.id,
        "registration_request",
        str(req.id),
        "advisor_manage_for_student",
        None,
        {
            "student_user_id": payload.student_user_id,
            "offering_ids": payload.offering_ids,
            "requested_note": req.requested_note,
        },
    )
    db.commit()
    db.refresh(req)
    return req


@router.get("/registration/requests/my")
async def my_registration_requests(
    academic_year_label: str | None = None,
    semester: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")
    q = db.query(RegistrationRequest).filter(RegistrationRequest.student_user_id == current_user.id)
    if academic_year_label:
        q = q.filter(RegistrationRequest.academic_year_label == academic_year_label)
    if semester:
        q = q.filter(RegistrationRequest.semester == semester)
    rows = q.order_by(RegistrationRequest.updated_at.desc()).all()
    return {"items": [_registration_request_payload(row) for row in rows]}


@router.get("/registration/requests", dependencies=[Depends(require_role("admin", "advisor"))])
async def list_registration_requests(
    status: str | None = None,
    academic_year_label: str | None = None,
    semester: str | None = None,
    student_user_id: int | None = None,
    advisor_user_id: int | None = None,
    submitted_via: str | None = None,
    is_after_window: bool | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(RegistrationRequest)
    role = str(current_user.role or "").lower()
    if role == "advisor":
        advisor_college_ids = _resolve_user_college_ids(db, current_user)
        assigned_student_ids = [
            int(item[0])
            for item in db.query(StudentAcademicProfile.student_user_id)
            .filter(StudentAcademicProfile.advisor_user_id == current_user.id)
            .all()
        ]
        college_student_ids = []
        if advisor_college_ids:
            college_student_ids = [
                int(item[0])
                for item in db.query(StudentAcademicProfile.student_user_id)
                .filter(StudentAcademicProfile.college_id.in_(advisor_college_ids))
                .all()
            ]
        advisor_scope_filters = [RegistrationRequest.advisor_user_id == current_user.id]
        if assigned_student_ids:
            advisor_scope_filters.append(RegistrationRequest.student_user_id.in_(assigned_student_ids))
        if college_student_ids:
            advisor_scope_filters.append(RegistrationRequest.student_user_id.in_(college_student_ids))
        q = q.filter(or_(*advisor_scope_filters))
    if status:
        q = q.filter(RegistrationRequest.status == status)
    if academic_year_label:
        q = q.filter(RegistrationRequest.academic_year_label == academic_year_label)
    if semester:
        q = q.filter(RegistrationRequest.semester == semester)
    if student_user_id:
        q = q.filter(RegistrationRequest.student_user_id == student_user_id)
    if advisor_user_id:
        q = q.filter(RegistrationRequest.advisor_user_id == advisor_user_id)
    if submitted_via:
        q = q.filter(RegistrationRequest.submitted_via == submitted_via)
    if is_after_window is not None:
        q = q.filter(RegistrationRequest.is_after_window == is_after_window)
    rows = q.order_by(RegistrationRequest.updated_at.desc()).all()
    if not rows:
        return {"items": []}

    student_ids = list({int(row.student_user_id) for row in rows if row.student_user_id})
    users_by_id = {
        int(user.id): user
        for user in db.query(User).filter(User.id.in_(student_ids)).all()
    }
    profiles_by_student = {
        int(profile.student_user_id): profile
        for profile in db.query(StudentAcademicProfile).filter(StudentAcademicProfile.student_user_id.in_(student_ids)).all()
    }
    college_ids = list(
        {
            int(profile.college_id)
            for profile in profiles_by_student.values()
            if getattr(profile, "college_id", None)
        }
    )
    colleges_by_id = {
        int(college.id): college
        for college in (db.query(College).filter(College.id.in_(college_ids)).all() if college_ids else [])
    }

    request_ids = [int(row.id) for row in rows]
    selections_raw = (
        db.query(RegistrationCourseSelection, CourseOffering, CourseCatalog)
        .join(CourseOffering, CourseOffering.id == RegistrationCourseSelection.offering_id)
        .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
        .filter(RegistrationCourseSelection.registration_request_id.in_(request_ids))
        .all()
    )
    selections_by_request: dict[int, list[dict[str, Any]]] = {}
    for selection, offering, course in selections_raw:
        req_id = int(selection.registration_request_id)
        selections_by_request.setdefault(req_id, []).append(
            {
                "selection_id": int(selection.id),
                "offering_id": int(offering.id),
                "course_id": int(course.id),
                "course_code": course.code,
                "course_title_ar": course.title_ar,
                "display_title": _normalize_display_title(selection.display_title),
                "credit_hours": float(course.credit_hours or 0),
                "section": offering.section,
                "study_year": course.study_year,
            }
        )

    items: list[dict[str, Any]] = []
    for row in rows:
        payload = _registration_request_payload(row)
        student_id = int(row.student_user_id)
        student = users_by_id.get(student_id)
        profile = profiles_by_student.get(student_id)
        college = colleges_by_id.get(int(profile.college_id)) if profile and profile.college_id else None
        selected_offerings = selections_by_request.get(int(row.id), [])
        payload.update(
            {
                "student_full_name": student.full_name if student else None,
                "student_username": student.username if student else None,
                "student_code": student.student_code if student else None,
                "student_study_year": int(profile.current_study_year) if profile and profile.current_study_year is not None else None,
                "student_college_name": college.name_ar if college else None,
                "student_gpa": float(profile.gpa or 0) if profile else 0,
                "student_passed_hours": float(getattr(profile, "passed_hours", 0) or 0) if profile else 0,
                "selected_offerings": selected_offerings,
                "selected_total_hours": float(sum(item.get("credit_hours", 0) for item in selected_offerings)),
            }
        )
        items.append(payload)

    return {"items": items}


@router.get("/registration/sections-report.csv", dependencies=[Depends(require_role("admin", "advisor"))])
async def export_registration_sections_report_csv(
    academic_year_label: str | None = None,
    semester: str | None = None,
    status: str | None = Query(default="registered"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_statuses = [item.strip().lower() for item in str(status or "").split(",") if item.strip()]
    if not selected_statuses:
        selected_statuses = ["registered"]

    payload = await list_registration_requests(
        status=None,
        academic_year_label=academic_year_label,
        semester=semester,
        student_user_id=None,
        advisor_user_id=None,
        submitted_via=None,
        is_after_window=None,
        db=db,
        current_user=current_user,
    )
    rows = payload.get("items", [])
    rows = [row for row in rows if str(row.get("status") or "").lower() in selected_statuses]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "academic_year",
        "semester",
        "request_status",
        "college",
        "study_year",
        "course_code",
        "course_title",
        "section",
        "credit_hours",
        "student_full_name",
        "student_username",
        "student_code",
        "student_gpa",
        "student_passed_hours",
        "request_id",
    ])

    for row in rows:
        offerings = row.get("selected_offerings") or []
        if not offerings:
            writer.writerow([
                row.get("academic_year_label") or "",
                row.get("semester") or "",
                row.get("status") or "",
                row.get("student_college_name") or "",
                row.get("student_study_year") or "",
                "",
                "",
                "",
                "",
                row.get("student_full_name") or "",
                row.get("student_username") or "",
                row.get("student_code") or "",
                row.get("student_gpa") or 0,
                row.get("student_passed_hours") or 0,
                row.get("id") or "",
            ])
            continue

        for item in offerings:
            writer.writerow([
                row.get("academic_year_label") or "",
                row.get("semester") or "",
                row.get("status") or "",
                row.get("student_college_name") or "",
                row.get("student_study_year") or "",
                item.get("course_code") or "",
                item.get("course_title_ar") or "",
                item.get("section") or "",
                item.get("credit_hours") or 0,
                row.get("student_full_name") or "",
                row.get("student_username") or "",
                row.get("student_code") or "",
                row.get("student_gpa") or 0,
                row.get("student_passed_hours") or 0,
                row.get("id") or "",
            ])

    filename_year = (academic_year_label or "all-years").replace("/", "-").replace("\\", "-").replace(" ", "_")
    filename_semester = (semester or "all-semesters").replace("/", "-").replace("\\", "-").replace(" ", "_")
    filename = f"registration-sections-report-{filename_year}-{filename_semester}.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv; charset=utf-8", headers=headers)


@router.get("/registration/student-terms", dependencies=[Depends(require_role("admin", "advisor"))])
async def list_student_registration_terms(
    student_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_student_profile(db, student_user_id, current_user):
        raise HTTPException(status_code=403, detail="You cannot manage this student")

    terms_map: dict[tuple[str, str], dict[str, Any]] = {}

    core_rows = (
        db.query(RegistrationRequest)
        .filter(RegistrationRequest.student_user_id == student_user_id)
        .order_by(RegistrationRequest.updated_at.desc())
        .all()
    )
    for row in core_rows:
        ay = str(row.academic_year_label or "").strip()
        sem = str(row.semester or "").strip().lower()
        if not ay or not sem:
            continue
        key = (ay, sem)
        item = terms_map.get(key)
        if not item:
            terms_map[key] = {
                "academic_year_label": ay,
                "semester": sem,
                "courses_count": 0,
                "source": "core",
                "last_updated": row.updated_at,
            }
        if not terms_map[key]["courses_count"]:
            terms_map[key]["courses_count"] = int(
                db.query(RegistrationCourseSelection)
                .filter(RegistrationCourseSelection.registration_request_id == row.id)
                .count()
            )

    items = list(terms_map.values())
    items.sort(key=_term_sort_key, reverse=True)

    return {
        "items": [
            {
                "academic_year_label": str(item["academic_year_label"]),
                "semester": str(item["semester"]),
                "courses_count": int(item.get("courses_count") or 0),
                "source": str(item.get("source") or "core"),
                "last_updated": item.get("last_updated"),
            }
            for item in items
        ]
    }


@router.patch("/registration/requests/{request_id}/advisor-decision", response_model=RegistrationRequestResponse, dependencies=[Depends(require_role("admin", "advisor"))])
async def advisor_decision_on_registration_request(
    request_id: int,
    payload: AdvisorRegistrationDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req = db.query(RegistrationRequest).filter(RegistrationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if not _can_manage_registration_request(db, req, current_user):
        raise HTTPException(status_code=403, detail="You cannot manage this request")
    if req.status == "locked":
        raise HTTPException(status_code=400, detail="Request is locked")
    profile = _get_student_profile(db, req.student_user_id)
    period = _term_window(
        db,
        college_id=profile.college_id,
        academic_year_label=req.academic_year_label,
        semester=req.semester,
    )
    period_status = _effective_window_status(period)
    current_status = str(req.status or "").strip().lower()
    target_status = str(payload.status or "").strip().lower()
    reopen_from_final = target_status == "need_info" and current_status in {"advisor_approved", "registered"}
    if period_status not in {"OPEN", "PENDING_REVIEW"} and not reopen_from_final:
        raise HTTPException(status_code=400, detail=f"Decision is blocked. Registration period status is {period_status}")

    req.status = payload.status
    req.advisor_note = (payload.advisor_note or "").strip() or None
    req.handled_at = _now()
    req.processed_by_user_id = current_user.id
    if payload.status == "advisor_approved":
        # Approval is a separate step from execution (advisor-register endpoint).
        req.advisor_user_id = current_user.id
        req.advisor_approved_at = _now()
    elif payload.status == "need_info":
        # Reopen request for student correction/review.
        req.locked_at = None
        req.advisor_approved_at = None

    _log_audit(
        db,
        current_user.id,
        "registration_request",
        str(req.id),
        "advisor_decision",
        None,
        payload.model_dump(),
    )
    db.commit()
    db.refresh(req)
    return req


@router.post("/registration/requests/{request_id}/advisor-register", response_model=RegistrationRequestResponse, dependencies=[Depends(require_role("admin", "advisor"))])
async def advisor_register_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req = db.query(RegistrationRequest).filter(RegistrationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if not _can_manage_registration_request(db, req, current_user):
        raise HTTPException(status_code=403, detail="You cannot manage this request")
    profile = _get_student_profile(db, req.student_user_id)
    period = _term_window(
        db,
        college_id=profile.college_id,
        academic_year_label=req.academic_year_label,
        semester=req.semester,
    )
    period_status = _effective_window_status(period)
    if period_status not in {"OPEN", "PENDING_REVIEW"}:
        raise HTTPException(status_code=400, detail=f"Register action is blocked. Registration period status is {period_status}")
    if req.status not in {"advisor_requested", "advisor_approved", "need_info"}:
        raise HTTPException(status_code=400, detail="Request is not in a registrable advisor state")

    selection_ids = [
        int(item.offering_id)
        for item in db.query(RegistrationCourseSelection.offering_id)
        .filter(RegistrationCourseSelection.registration_request_id == req.id)
        .all()
    ]
    if not selection_ids:
        raise HTTPException(status_code=400, detail="No selected offerings found for this request")

    _apply_registration_request_selections(
        db=db,
        req=req,
        offering_ids=selection_ids,
        actor_user=current_user,
        actor_mode="advisor_register",
    )
    req.status = "registered"
    req.submitted_via = "advisor"
    req.advisor_user_id = current_user.id
    req.advisor_approved_at = req.advisor_approved_at or _now()
    req.handled_at = _now()
    req.processed_by_user_id = current_user.id
    req.locked_at = None
    _log_audit(
        db,
        current_user.id,
        "registration_request",
        str(req.id),
        "advisor_register",
        None,
        {"status": req.status},
    )
    db.commit()
    db.refresh(req)
    return req


@router.get("/registration/doctor-oversight", dependencies=[Depends(require_role("admin"))])
async def doctor_registration_oversight(
    status: str | None = None,
    academic_year_label: str | None = None,
    semester: str | None = None,
    advisor_user_id: int | None = None,
    student_user_id: int | None = None,
    is_after_window: bool | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(RegistrationRequest).filter(RegistrationRequest.submitted_via == "advisor")
    if status:
        q = q.filter(RegistrationRequest.status == status)
    if academic_year_label:
        q = q.filter(RegistrationRequest.academic_year_label == academic_year_label)
    if semester:
        q = q.filter(RegistrationRequest.semester == semester)
    if advisor_user_id:
        q = q.filter(RegistrationRequest.advisor_user_id == advisor_user_id)
    if student_user_id:
        q = q.filter(RegistrationRequest.student_user_id == student_user_id)
    if is_after_window is not None:
        q = q.filter(RegistrationRequest.is_after_window == is_after_window)

    rows = q.order_by(RegistrationRequest.updated_at.desc()).all()
    return {"items": [_registration_request_payload(row) for row in rows]}


@router.get("/registration/me")
async def my_registration(academic_year_label: str, semester: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")
    logger.info(
        "registration.me start user_id=%s username=%s student_code=%s ay=%s semester=%s",
        current_user.id,
        current_user.username,
        current_user.student_code,
        academic_year_label,
        semester,
    )
    req = _latest_registration_request(
        db,
        student_user_id=current_user.id,
        academic_year_label=academic_year_label,
        semester=semester,
    )
    if not req:
        logger.info(
            "registration.me no_request user_id=%s ay=%s semester=%s",
            current_user.id,
            academic_year_label,
            semester,
        )
        return {"request": None, "selections": []}
    selections = (
        db.query(RegistrationCourseSelection, CourseOffering, CourseCatalog)
        .join(CourseOffering, CourseOffering.id == RegistrationCourseSelection.offering_id)
        .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
        .filter(
            RegistrationCourseSelection.registration_request_id == req.id,
            RegistrationCourseSelection.student_user_id == current_user.id,
            CourseOffering.academic_year_label == academic_year_label,
            CourseOffering.semester == semester,
            CourseOffering.is_active == True,  # noqa: E712
        )
        .all()
    )
    items = []
    for selection, offering, course in selections:
        item = RegistrationSelectionResponse.model_validate(selection).model_dump(mode="json")
        item.update(
            {
                "course_id": course.id,
                "course_code": course.code,
                "course_title_ar": course.title_ar,
                "display_title": _normalize_display_title(selection.display_title),
                "credit_hours": course.credit_hours,
                "section": offering.section,
                "day_of_week": offering.day_of_week,
                "start_time": offering.start_time,
                "end_time": offering.end_time,
                "room_name": offering.room_name,
            }
        )
        items.append(item)
    missing_schedule_count = sum(
        1
        for row in items
        if not str(row.get("day_of_week") or "").strip() or not str(row.get("start_time") or "").strip()
    )
    logger.info(
        "registration.me result user_id=%s request_id=%s request_status=%s selections=%s missing_schedule_count=%s",
        current_user.id,
        req.id,
        req.status,
        len(items),
        missing_schedule_count,
    )
    return {
        "request": RegistrationRequestResponse.model_validate(req).model_dump(mode="json"),
        "source": "core",
        "selections": items,
    }


@router.delete("/registration/my-selection")
async def delete_my_registration_selection(
    academic_year_label: str,
    semester: str,
    course_code: str,
    student_id_hint: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")

    normalized_code = str(course_code or "").strip().upper()
    if not normalized_code:
        raise HTTPException(status_code=400, detail="Course code is required")
    logger.info(
        "registration.delete start user_id=%s username=%s student_code=%s student_id_hint=%s ay=%s semester=%s course_code=%s",
        current_user.id,
        current_user.username,
        current_user.student_code,
        student_id_hint,
        academic_year_label,
        semester,
        normalized_code,
    )

    def _remove_from_legacy_state() -> int:
        legacy_state = db.query(AcademicState).filter(AcademicState.id == 1).first()
        if not legacy_state or not str(legacy_state.student_registrations_json or "").strip():
            return 0
        try:
            decoded = json.loads(legacy_state.student_registrations_json)
            legacy_rows = decoded if isinstance(decoded, list) else []
        except Exception:
            legacy_rows = []

        candidate_keys = {
            _normalize_legacy_key(current_user.id),
            _normalize_legacy_key(current_user.username),
            _normalize_legacy_key(current_user.student_code),
            _normalize_legacy_key(current_user.email),
            _normalize_legacy_key(student_id_hint),
        }
        candidate_keys = {key for key in candidate_keys if key}
        semester_key = str(semester or "").strip().lower()
        academic_year_key = str(academic_year_label or "").strip()

        filtered_legacy_rows = []
        removed_legacy_count = 0
        for row in legacy_rows:
            if not isinstance(row, dict):
                filtered_legacy_rows.append(row)
                continue

            row_course_code = str(row.get("id") or row.get("code") or row.get("courseId") or "").strip().upper()
            row_semester = str(row.get("semester") or "").strip().lower()
            row_year = str(
                row.get("academicYear")
                or row.get("academic_year")
                or row.get("academic_year_label")
                or ""
            ).strip()

            should_remove = (
                _legacy_student_matches(row, candidate_keys)
                and row_course_code == normalized_code
                and row_semester == semester_key
                and (not row_year or row_year == academic_year_key)
            )
            if should_remove:
                removed_legacy_count += 1
                continue
            filtered_legacy_rows.append(row)

        if removed_legacy_count > 0:
            legacy_state.student_registrations_json = json.dumps(filtered_legacy_rows, ensure_ascii=False)
            legacy_state.updated_at = _now()
        logger.info(
            "registration.delete legacy_scan user_id=%s course_code=%s removed_legacy_count=%s candidate_keys=%s",
            current_user.id,
            normalized_code,
            removed_legacy_count,
            sorted(candidate_keys),
        )
        return removed_legacy_count

    term_requests = (
        db.query(RegistrationRequest)
        .filter(
            RegistrationRequest.student_user_id == current_user.id,
            RegistrationRequest.academic_year_label == academic_year_label,
            RegistrationRequest.semester == semester,
        )
        .order_by(RegistrationRequest.id.desc())
        .all()
    )

    if not term_requests:
        # Fallback delete by offering term even when request row is missing.
        # This handles inconsistent/migrated data where selections exist but
        # the expected term request cannot be resolved by label.
        fallback_selections = (
            db.query(RegistrationCourseSelection)
            .join(CourseOffering, CourseOffering.id == RegistrationCourseSelection.offering_id)
            .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
            .filter(
                RegistrationCourseSelection.student_user_id == current_user.id,
                func.upper(func.trim(CourseCatalog.code)) == normalized_code,
                CourseOffering.academic_year_label == academic_year_label,
                CourseOffering.semester == semester,
            )
            .all()
        )
        if fallback_selections:
            touched_request_ids = sorted(
                {
                    int(sel.registration_request_id)
                    for sel in fallback_selections
                    if int(sel.registration_request_id or 0) > 0
                }
            )
            for selection in fallback_selections:
                logger.info(
                    "registration.delete no_request_fallback_match user_id=%s selection_id=%s request_id=%s offering_id=%s course_code=%s",
                    current_user.id,
                    selection.id,
                    selection.registration_request_id,
                    selection.offering_id,
                    normalized_code,
                )
                db.delete(selection)
            legacy_deleted_count = _remove_from_legacy_state()
            db.commit()
            logger.info(
                "registration.delete committed user_id=%s ay=%s semester=%s course_code=%s matched_rows=%s deleted_rows=%s touched_request_ids=%s final_deleted_count=%s legacy_deleted_count=%s reason=%s",
                current_user.id,
                academic_year_label,
                semester,
                normalized_code,
                len(fallback_selections),
                len(fallback_selections),
                touched_request_ids,
                len(fallback_selections),
                legacy_deleted_count,
                "no_request_fallback_deleted",
            )
            return {
                "deleted": True,
                "deleted_count": len(fallback_selections),
                "remaining_count": 0,
                "remaining_same_course_count": 0,
                "db_verified_deleted": True,
                "legacy_deleted_count": legacy_deleted_count,
                "reason": "no_request_fallback_deleted",
                "request": None,
            }

        # Last-resort fallback: delete same course code for this student across terms.
        # This handles badly-mismatched term labels between UI and stored rows.
        broad_fallback_selections = (
            db.query(RegistrationCourseSelection)
            .join(CourseOffering, CourseOffering.id == RegistrationCourseSelection.offering_id)
            .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
            .filter(
                RegistrationCourseSelection.student_user_id == current_user.id,
                func.upper(func.trim(CourseCatalog.code)) == normalized_code,
            )
            .all()
        )
        if broad_fallback_selections:
            touched_request_ids = sorted(
                {
                    int(sel.registration_request_id)
                    for sel in broad_fallback_selections
                    if int(sel.registration_request_id) > 0
                }
            )
            for selection in broad_fallback_selections:
                logger.info(
                    "registration.delete broad_fallback_match user_id=%s selection_id=%s request_id=%s offering_id=%s course_code=%s",
                    current_user.id,
                    selection.id,
                    selection.registration_request_id,
                    selection.offering_id,
                    normalized_code,
                )
                db.delete(selection)

            # Reset touched requests to draft after student-side deletion.
            if touched_request_ids:
                touched_requests = (
                    db.query(RegistrationRequest)
                    .filter(
                        RegistrationRequest.id.in_(touched_request_ids),
                        RegistrationRequest.student_user_id == current_user.id,
                    )
                    .all()
                )
                for row_req in touched_requests:
                    row_req.status = "draft"
                    row_req.requested_at = None
                    row_req.submitted_at = None
                    row_req.handled_at = None
                    row_req.advisor_note = None
                    row_req.processed_by_user_id = None
                    row_req.advisor_approved_at = None
                    row_req.locked_at = None

            legacy_deleted_count = _remove_from_legacy_state()
            db.commit()
            logger.info(
                "registration.delete committed user_id=%s ay=%s semester=%s course_code=%s matched_rows=%s deleted_rows=%s touched_request_ids=%s final_deleted_count=%s legacy_deleted_count=%s reason=%s",
                current_user.id,
                academic_year_label,
                semester,
                normalized_code,
                len(broad_fallback_selections),
                len(broad_fallback_selections),
                touched_request_ids,
                len(broad_fallback_selections),
                legacy_deleted_count,
                "no_request_broad_fallback_deleted",
            )
            return {
                "deleted": True,
                "deleted_count": len(broad_fallback_selections),
                "remaining_count": 0,
                "remaining_same_course_count": 0,
                "db_verified_deleted": True,
                "legacy_deleted_count": legacy_deleted_count,
                "reason": "no_request_broad_fallback_deleted",
                "request": None,
            }

        legacy_deleted_count = _remove_from_legacy_state()
        logger.info(
            "registration.delete no_term_requests user_id=%s ay=%s semester=%s legacy_deleted_count=%s",
            current_user.id,
            academic_year_label,
            semester,
            legacy_deleted_count,
        )
        if legacy_deleted_count > 0:
            db.commit()
            logger.info(
                "registration.delete legacy_cleanup_only user_id=%s ay=%s semester=%s course_code=%s matched_rows=%s deleted_rows=%s touched_request_ids=%s final_deleted_count=%s legacy_deleted_count=%s",
                current_user.id,
                academic_year_label,
                semester,
                normalized_code,
                0,
                0,
                [],
                0,
                legacy_deleted_count,
            )
            return {
                "deleted": False,
                "deleted_count": 0,
                "legacy_deleted_count": legacy_deleted_count,
                "remaining_count": 0,
                "reason": "legacy_cleanup_only",
                "request": None,
            }
        return {"deleted": False, "reason": "request_not_found"}

    deleted_count = 0
    touched_request_ids: list[int] = []
    for row_req in term_requests:
        selections = (
            db.query(RegistrationCourseSelection)
            .join(CourseOffering, CourseOffering.id == RegistrationCourseSelection.offering_id)
            .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
            .filter(
                RegistrationCourseSelection.registration_request_id == row_req.id,
                RegistrationCourseSelection.student_user_id == current_user.id,
                func.upper(func.trim(CourseCatalog.code)) == normalized_code,
            )
            .all()
        )
        if not selections:
            continue
        for selection in selections:
            logger.info(
                "registration.delete match_detail user_id=%s request_id=%s selection_id=%s offering_id=%s course_code=%s",
                current_user.id,
                row_req.id,
                selection.id,
                selection.offering_id,
                normalized_code,
            )
            db.delete(selection)
            deleted_count += 1
        touched_request_ids.append(int(row_req.id))
        logger.info(
            "registration.delete matched_request user_id=%s request_id=%s matched_selections=%s course_code=%s",
            current_user.id,
            row_req.id,
            len(selections),
            normalized_code,
        )

    latest_req = term_requests[0] if term_requests else None
    if deleted_count == 0:
        # Fallback: delete by offering term + course code directly.
        # This guards against request-term mismatches where selections exist
        # under a request row not perfectly aligned with the incoming term labels.
        fallback_selections = (
            db.query(RegistrationCourseSelection)
            .join(CourseOffering, CourseOffering.id == RegistrationCourseSelection.offering_id)
            .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
            .filter(
                RegistrationCourseSelection.student_user_id == current_user.id,
                func.upper(func.trim(CourseCatalog.code)) == normalized_code,
                CourseOffering.academic_year_label == academic_year_label,
                CourseOffering.semester == semester,
            )
            .all()
        )
        if fallback_selections:
            for selection in fallback_selections:
                if int(selection.registration_request_id) not in touched_request_ids:
                    touched_request_ids.append(int(selection.registration_request_id))
                logger.info(
                    "registration.delete fallback_match user_id=%s selection_id=%s request_id=%s offering_id=%s course_code=%s",
                    current_user.id,
                    selection.id,
                    selection.registration_request_id,
                    selection.offering_id,
                    normalized_code,
                )
                db.delete(selection)
                deleted_count += 1

    if deleted_count == 0:
        legacy_deleted_count = _remove_from_legacy_state()
        logger.info(
            "registration.delete no_db_matches user_id=%s ay=%s semester=%s course_code=%s legacy_deleted_count=%s",
            current_user.id,
            academic_year_label,
            semester,
            normalized_code,
            legacy_deleted_count,
        )
        if legacy_deleted_count > 0:
            db.commit()
            logger.info(
                "registration.delete legacy_cleanup_only user_id=%s ay=%s semester=%s course_code=%s matched_rows=%s deleted_rows=%s touched_request_ids=%s final_deleted_count=%s legacy_deleted_count=%s",
                current_user.id,
                academic_year_label,
                semester,
                normalized_code,
                0,
                0,
                touched_request_ids,
                0,
                legacy_deleted_count,
            )
            return {
                "deleted": False,
                "deleted_count": 0,
                "legacy_deleted_count": legacy_deleted_count,
                "remaining_count": 0,
                "reason": "legacy_cleanup_only",
                "request": RegistrationRequestResponse.model_validate(latest_req).model_dump(mode="json") if latest_req else None,
            }
        return {"deleted": False, "reason": "selection_not_found"}

    legacy_deleted_count = _remove_from_legacy_state()

    db.flush()
    remaining_count = 0
    for row_req in term_requests:
        remaining_count += int(
            db.query(RegistrationCourseSelection)
            .filter(RegistrationCourseSelection.registration_request_id == row_req.id)
            .count()
        )
    remaining_same_course_count = (
        db.query(RegistrationCourseSelection)
        .join(CourseOffering, CourseOffering.id == RegistrationCourseSelection.offering_id)
        .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
        .filter(
            RegistrationCourseSelection.registration_request_id.in_([row.id for row in term_requests]),
            RegistrationCourseSelection.student_user_id == current_user.id,
            func.upper(func.trim(CourseCatalog.code)) == normalized_code,
        )
        .count()
    )

    # Always reset touched requests to draft when student modifies term selections.
    for row_req in term_requests:
        if int(row_req.id) not in touched_request_ids:
            continue
        row_req.status = "draft"
        row_req.requested_at = None
        row_req.submitted_at = None
        row_req.handled_at = None
        row_req.advisor_note = None
        row_req.processed_by_user_id = None
        row_req.advisor_approved_at = None
        row_req.locked_at = None

    _log_audit(
        db,
        current_user.id,
        "registration_request",
        str(latest_req.id if latest_req else "none"),
        "student_remove_selection",
        None,
        {
            "course_code": normalized_code,
            "deleted_count": deleted_count,
            "legacy_deleted_count": legacy_deleted_count,
            "remaining_count": remaining_count,
            "remaining_same_course_count": remaining_same_course_count,
            "touched_request_ids": touched_request_ids,
        },
    )
    db.commit()
    if latest_req:
        db.refresh(latest_req)
    logger.info(
        "registration.delete committed user_id=%s ay=%s semester=%s course_code=%s deleted_count=%s remaining_same_course_count=%s remaining_count=%s touched_request_ids=%s legacy_deleted_count=%s",
        current_user.id,
        academic_year_label,
        semester,
        normalized_code,
        deleted_count,
        remaining_same_course_count,
        remaining_count,
        touched_request_ids,
        legacy_deleted_count,
    )
    return {
        "deleted": bool(deleted_count),
        "deleted_count": deleted_count,
        "remaining_count": remaining_count,
        "remaining_same_course_count": remaining_same_course_count,
        "db_verified_deleted": remaining_same_course_count == 0,
        "legacy_deleted_count": legacy_deleted_count,
        "request": RegistrationRequestResponse.model_validate(latest_req).model_dump(mode="json") if latest_req else None,
    }


@router.get("/registration/by-student", dependencies=[Depends(require_role("admin", "advisor"))])
async def registration_by_student(
    student_user_id: int,
    academic_year_label: str,
    semester: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_student_profile(db, student_user_id, current_user):
        raise HTTPException(status_code=403, detail="You cannot manage this student")

    profile = _get_live_student_profile(db, student_user_id)
    req = _latest_registration_request(
        db,
        student_user_id=student_user_id,
        academic_year_label=academic_year_label,
        semester=semester,
    )
    if not req:
        return {
            "request": None,
            "selections": [],
            "student_profile": StudentProfileResponse.model_validate(profile).model_dump(mode="json"),
        }

    selections = (
        db.query(RegistrationCourseSelection, CourseOffering, CourseCatalog)
        .join(CourseOffering, CourseOffering.id == RegistrationCourseSelection.offering_id)
        .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
        .filter(
            RegistrationCourseSelection.registration_request_id == req.id,
            RegistrationCourseSelection.student_user_id == student_user_id,
            CourseOffering.academic_year_label == academic_year_label,
            CourseOffering.semester == semester,
            CourseOffering.is_active == True,  # noqa: E712
        )
        .all()
    )
    items = []
    for selection, offering, course in selections:
        item = RegistrationSelectionResponse.model_validate(selection).model_dump(mode="json")
        item.update(
            {
                "course_code": course.code,
                "course_title_ar": course.title_ar,
                "display_title": _normalize_display_title(selection.display_title),
                "credit_hours": course.credit_hours,
                "section": offering.section,
                "day_of_week": offering.day_of_week,
                "start_time": offering.start_time,
                "end_time": offering.end_time,
                "room_name": offering.room_name,
            }
        )
        items.append(item)
    missing_schedule_count = sum(
        1
        for row in items
        if not str(row.get("day_of_week") or "").strip() or not str(row.get("start_time") or "").strip()
    )
    logger.info(
        "registration.by_student actor_user_id=%s student_user_id=%s ay=%s semester=%s request_id=%s selections=%s missing_schedule_count=%s",
        current_user.id,
        student_user_id,
        academic_year_label,
        semester,
        req.id,
        len(items),
        missing_schedule_count,
    )

    return {
        "request": RegistrationRequestResponse.model_validate(req).model_dump(mode="json"),
        "is_locked": _is_request_locked_for_edit(req),
        "source": "core",
        "selections": items,
        "student_profile": StudentProfileResponse.model_validate(profile).model_dump(mode="json"),
    }


@router.patch("/registration/{request_id}/status", response_model=RegistrationRequestResponse, dependencies=[Depends(require_role("admin", "advisor"))])
async def patch_registration_status(request_id: int, payload: RegistrationStatusUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = db.query(RegistrationRequest).filter(RegistrationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if not _can_manage_registration_request(db, req, current_user):
        raise HTTPException(status_code=403, detail="You cannot manage this request")
    req.status = payload.status
    if payload.status == "advisor_approved":
        req.advisor_user_id = current_user.id
        req.advisor_approved_at = _now()
    if payload.status in {"rejected", "need_info", "registered"}:
        req.processed_by_user_id = current_user.id
        req.handled_at = _now()
    if payload.status == "locked":
        req.locked_at = _now()
    _log_audit(db, current_user.id, "registration_request", str(req.id), "status_change", None, payload.model_dump())
    db.commit()
    db.refresh(req)
    return req


@router.post("/grades/upsert", response_model=GradeBookResponse, dependencies=[Depends(require_role("admin", "doctor"))])
async def upsert_grade(payload: GradeEntryUpsert, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    selection = db.query(RegistrationCourseSelection).filter(RegistrationCourseSelection.id == payload.selection_id).first()
    if not selection:
        raise HTTPException(status_code=404, detail="Selection not found")
    offering = db.query(CourseOffering).filter(CourseOffering.id == selection.offering_id).first()
    course = db.query(CourseCatalog).filter(CourseCatalog.id == offering.course_id).first() if offering else None
    if not offering or not course:
        raise HTTPException(status_code=404, detail="Offering/course not found")
    row = db.query(GradeBook).filter(GradeBook.selection_id == selection.id).first()
    if not row:
        row = GradeBook(selection_id=selection.id, student_user_id=selection.student_user_id, offering_id=selection.offering_id)
        db.add(row)
        db.flush()

    max_map = {"mid1": course.max_mid1, "mid2": course.max_mid2, "coursework": course.max_coursework, "final": course.max_final}
    patch = payload.model_dump(exclude_unset=True)
    for field in ["mid1", "mid2", "coursework", "final"]:
        if field in patch and patch[field] is not None and patch[field] > max_map[field]:
            raise HTTPException(status_code=400, detail=f"{field} exceeds max {max_map[field]}")
        if field in patch:
            setattr(row, field, patch[field])
    row.import_cycle = payload.import_cycle
    row.last_updated_by_user_id = current_user.id
    _calc_total_grade(row, course)
    _log_audit(db, current_user.id, "gradebook", str(row.id), "upsert", None, patch)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/grades/{gradebook_id}/publish", response_model=GradeBookResponse, dependencies=[Depends(require_role("admin", "doctor"))])
async def patch_grade_publish(gradebook_id: int, payload: GradePublishUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = db.query(GradeBook).filter(GradeBook.id == gradebook_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Grade row not found")
    row.publish_status = payload.publish_status
    row.published_at = _now() if payload.publish_status == "published" else None
    _log_audit(db, current_user.id, "gradebook", str(row.id), "publish_status", None, payload.model_dump())
    db.commit()
    db.refresh(row)
    return row


@router.get("/audit-logs", response_model=list[AuditLogResponse], dependencies=[Depends(require_role("admin", "doctor"))])
async def list_audit_logs(entity_type: str | None = None, limit: int = Query(default=200, ge=1, le=1000), db: Session = Depends(get_db)):
    q = db.query(AcademicAuditLog)
    if entity_type:
        q = q.filter(AcademicAuditLog.entity_type == entity_type)
    return q.order_by(AcademicAuditLog.created_at.desc()).limit(limit).all()


@router.get("/student-profiles/{student_user_id}/eligibility", response_model=StudentEligibilityResponse)
async def check_student_eligibility(
    student_user_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # Only the student themselves or an admin/doctor/advisor can check eligibility
    if current_user.role == "student" and current_user.id != student_user_id:
        raise HTTPException(status_code=403, detail="You can only view your own eligibility.")
        
    engine = AcademicRegulationsEngine(db)
    result = engine.evaluate_student_eligibility(student_user_id)
    
    return result

@router.get("/notifications/my")
async def get_my_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notifs = db.query(SystemNotification).filter(
        SystemNotification.user_id == current_user.id,
        SystemNotification.is_read == False
    ).order_by(SystemNotification.created_at.desc()).all()
    
    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "type": n.type,
            "created_at": n.created_at.isoformat()
        } for n in notifs
    ]

@router.patch("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notif = db.query(SystemNotification).filter(
        SystemNotification.id == notif_id,
        SystemNotification.user_id == current_user.id
    ).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"status": "success"}
    GradingScaleCreate,
    GradingScaleResponse,


