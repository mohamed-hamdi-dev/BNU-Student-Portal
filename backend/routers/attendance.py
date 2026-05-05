import secrets
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.deps import get_current_user, get_db, require_role
from routers.academic_core import ensure_academic_core_schema
from models.academic_core import CourseCatalog, CourseOffering, RegistrationCourseSelection, RegistrationRequest
from models.attendance import AttendanceRecord, AttendanceSession
from models.user import User
from schemas.attendance import (
    AttendanceCourseHistoryItem,
    AttendanceCourseHistoryResponse,
    AttendanceMarkAbsentPayload,
    AttendanceMySummaryResponse,
    AttendanceRecordUpsert,
    AttendanceScanPayload,
    AttendanceSessionCreate,
)

router = APIRouter(prefix="/attendance", tags=["attendance"])

ACTIVE_REGISTRATION_STATUSES = {
    "draft",
    "submitted",
    "advisor_requested",
    "advisor_approved",
    "need_info",
    "registered",
    "locked",
    "approved",
}
ATTENDANCE_STATUSES = {"present", "absent", "late"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_session(row: AttendanceSession) -> dict[str, Any]:
    return {
        "id": int(row.id),
        "offering_id": int(row.offering_id),
        "title": row.title,
        "session_date": row.session_date,
        "start_time": row.start_time,
        "end_time": row.end_time,
        "status": row.status,
        "qr_token": row.qr_token,
        "qr_expires_at": row.qr_expires_at,
        "created_by": row.created_by,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _serialize_offering(offering: CourseOffering, course: CourseCatalog | None) -> dict[str, Any]:
    return {
        "offering_id": int(offering.id),
        "course_id": course.id if course else None,
        "course_code": course.code if course else None,
        "course_title_ar": course.title_ar if course else None,
        "display_title": None,
        "academic_year_label": offering.academic_year_label,
        "semester": offering.semester,
        "section": offering.section,
        "day_of_week": offering.day_of_week,
        "start_time": offering.start_time,
        "end_time": offering.end_time,
        "room_name": offering.room_name,
        "target_group_id": offering.target_group_id,
        "target_group_name": offering.target_group_name,
    }


def _serialize_record(row: AttendanceRecord) -> dict[str, Any]:
    return {
        "id": int(row.id),
        "session_id": int(row.session_id),
        "student_user_id": int(row.student_user_id),
        "registration_selection_id": int(row.registration_selection_id),
        "status": row.status,
        "marked_by": row.marked_by,
        "marked_method": row.marked_method,
        "marked_at": row.marked_at,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _normalize_display_title(value: Any) -> str | None:
    raw = str(value or "").strip()
    return raw or None


def _resolve_offering_display_title(db: Session, offering_id: int) -> str | None:
    row = (
        db.query(RegistrationCourseSelection.display_title)
        .join(RegistrationRequest, RegistrationRequest.id == RegistrationCourseSelection.registration_request_id)
        .filter(
            RegistrationCourseSelection.offering_id == int(offering_id),
            RegistrationRequest.status.in_(ACTIVE_REGISTRATION_STATUSES),
            RegistrationCourseSelection.display_title.isnot(None),
        )
        .order_by(RegistrationCourseSelection.updated_at.desc(), RegistrationCourseSelection.id.desc())
        .first()
    )
    return _normalize_display_title(row[0] if row else None)


def _session_totals(records: list[dict[str, Any]]) -> dict[str, int]:
    totals = {"registered_students": len(records), "present": 0, "absent": 0, "late": 0, "unmarked": 0}
    for item in records:
        status = str(item.get("attendance_status") or "").strip().lower()
        if status in {"present", "absent", "late"}:
            totals[status] += 1
        else:
            totals["unmarked"] += 1
    return totals


def _get_session_or_404(db: Session, session_id: int) -> AttendanceSession:
    row = db.query(AttendanceSession).filter(AttendanceSession.id == int(session_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Attendance session not found")
    return row


def _get_offering_or_404(db: Session, offering_id: int) -> tuple[CourseOffering, CourseCatalog | None]:
    result = (
        db.query(CourseOffering, CourseCatalog)
        .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
        .filter(CourseOffering.id == int(offering_id))
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Course offering not found")
    return result


def _find_registered_selection(
    db: Session,
    *,
    offering_id: int,
    student_user_id: int,
) -> RegistrationCourseSelection | None:
    return (
        db.query(RegistrationCourseSelection)
        .join(RegistrationRequest, RegistrationRequest.id == RegistrationCourseSelection.registration_request_id)
        .filter(
            RegistrationCourseSelection.offering_id == int(offering_id),
            RegistrationCourseSelection.student_user_id == int(student_user_id),
            RegistrationRequest.status.in_(ACTIVE_REGISTRATION_STATUSES),
        )
        .order_by(RegistrationRequest.updated_at.desc(), RegistrationCourseSelection.updated_at.desc())
        .first()
    )


def _registered_roster(db: Session, offering_id: int) -> list[dict[str, Any]]:
    rows = (
        db.query(RegistrationCourseSelection, User)
        .join(RegistrationRequest, RegistrationRequest.id == RegistrationCourseSelection.registration_request_id)
        .join(User, User.id == RegistrationCourseSelection.student_user_id)
        .filter(
            RegistrationCourseSelection.offering_id == int(offering_id),
            RegistrationRequest.status.in_(ACTIVE_REGISTRATION_STATUSES),
        )
        .order_by(User.full_name.asc(), User.id.asc())
        .all()
    )
    seen_student_ids: set[int] = set()
    roster: list[dict[str, Any]] = []
    for selection, student in rows:
        student_id = int(student.id)
        if student_id in seen_student_ids:
            continue
        seen_student_ids.add(student_id)
        roster.append(
            {
                "student_user_id": student_id,
                "student_code": student.student_code,
                "student_name": student.full_name,
                "college": student.college,
                "registration_selection_id": int(selection.id),
            }
        )
    return roster


def _session_records_payload(db: Session, session_row: AttendanceSession) -> dict[str, Any]:
    offering, course = _get_offering_or_404(db, int(session_row.offering_id))
    roster = _registered_roster(db, int(session_row.offering_id))
    display_title = _resolve_offering_display_title(db, int(session_row.offering_id))
    record_rows = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.session_id == int(session_row.id))
        .all()
    )
    records_by_student = {int(item.student_user_id): item for item in record_rows}
    merged: list[dict[str, Any]] = []
    for item in roster:
        record = records_by_student.get(int(item["student_user_id"]))
        merged.append(
            {
                **item,
                "attendance_record_id": int(record.id) if record else None,
                "attendance_status": record.status if record else None,
                "marked_method": record.marked_method if record else None,
                "marked_at": record.marked_at if record else None,
            }
        )
    return {
        "session": _serialize_session(session_row),
        "offering": {**_serialize_offering(offering, course), "display_title": display_title},
        "records": merged,
        "totals": _session_totals(merged),
    }


def _ensure_session_open(session_row: AttendanceSession) -> None:
    if str(session_row.status or "").strip().lower() != "open":
        raise HTTPException(status_code=400, detail="Closed sessions cannot be modified")


def _resolve_student_from_scan_payload(db: Session, payload: AttendanceScanPayload) -> User:
    student_user_id = payload.student_user_id
    student_code = str(payload.student_code or "").trim()
    row = None
    if student_user_id:
        row = db.query(User).filter(User.id == int(student_user_id)).first()
    elif student_code:
        row = db.query(User).filter(User.student_code == student_code).first()
    if not row:
        raise HTTPException(status_code=404, detail="Student not found")
    return row


def _validate_qr_token(session_row: AttendanceSession, qr_token: str | None) -> None:
    token = str(qr_token or "").strip()
    stored = str(session_row.qr_token or "").strip()
    if not stored:
        raise HTTPException(status_code=400, detail="QR is not enabled for this session")
    if not token or token != stored:
        raise HTTPException(status_code=400, detail="Invalid QR token")
    if session_row.qr_expires_at and session_row.qr_expires_at < _now():
        raise HTTPException(status_code=400, detail="QR token has expired")


def _upsert_record(
    db: Session,
    *,
    session_row: AttendanceSession,
    student_user_id: int,
    status_value: str,
    actor_user_id: int | None,
    marked_method: str,
    allow_update: bool,
) -> AttendanceRecord:
    if status_value not in ATTENDANCE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid attendance status")
    _ensure_session_open(session_row)
    selection = _find_registered_selection(
        db,
        offering_id=int(session_row.offering_id),
        student_user_id=int(student_user_id),
    )
    if not selection:
        raise HTTPException(status_code=400, detail="Student is not registered in this offering")

    existing = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.session_id == int(session_row.id),
            AttendanceRecord.student_user_id == int(student_user_id),
        )
        .first()
    )
    if existing:
        if not allow_update:
            raise HTTPException(status_code=400, detail="Student already has an attendance record in this session")
        existing.status = status_value
        existing.marked_by = actor_user_id
        existing.marked_method = marked_method
        existing.marked_at = _now()
        db.commit()
        db.refresh(existing)
        return existing

    row = AttendanceRecord(
        session_id=int(session_row.id),
        student_user_id=int(student_user_id),
        registration_selection_id=int(selection.id),
        status=status_value,
        marked_by=actor_user_id,
        marked_method=marked_method,
        marked_at=_now(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _close_session_and_fill_absences(db: Session, session_row: AttendanceSession, actor_user_id: int | None) -> dict[str, Any]:
    _ensure_session_open(session_row)
    roster = _registered_roster(db, int(session_row.offering_id))
    existing_rows = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.session_id == int(session_row.id))
        .all()
    )
    existing_student_ids = {int(item.student_user_id) for item in existing_rows}
    for item in roster:
        student_user_id = int(item["student_user_id"])
        if student_user_id in existing_student_ids:
            continue
        db.add(
            AttendanceRecord(
                session_id=int(session_row.id),
                student_user_id=student_user_id,
                registration_selection_id=int(item["registration_selection_id"]),
                status="absent",
                marked_by=actor_user_id,
                marked_method="system",
                marked_at=_now(),
            )
        )
    session_row.status = "closed"
    db.commit()
    db.refresh(session_row)
    return _session_records_payload(db, session_row)


def _build_summary_item(
    *,
    offering: CourseOffering,
    course: CourseCatalog | None,
    display_title: str | None,
    totals: dict[str, int],
) -> dict[str, Any]:
    total_sessions = int(totals.get("total_sessions", 0))
    present_count = int(totals.get("present", 0))
    absent_count = int(totals.get("absent", 0))
    late_count = int(totals.get("late", 0))
    attended_count = present_count + late_count
    attendance_percentage = round((attended_count / total_sessions) * 100, 2) if total_sessions > 0 else 0.0
    absence_percentage = round((absent_count / total_sessions) * 100, 2) if total_sessions > 0 else 0.0
    return {
        "offering_id": int(offering.id),
        "course_id": course.id if course else None,
        "course_code": course.code if course else None,
        "course_title_ar": course.title_ar if course else None,
        "display_title": display_title,
        "academic_year_label": offering.academic_year_label,
        "semester": offering.semester,
        "section": offering.section,
        "total_sessions": total_sessions,
        "present_count": present_count,
        "absent_count": absent_count,
        "late_count": late_count,
        "attendance_percentage": attendance_percentage,
        "absence_percentage": absence_percentage,
        "warning": absence_percentage >= 25.0,
    }


@router.get("/offerings", dependencies=[Depends(require_role("admin", "doctor"))])
async def list_attendance_offerings(
    academic_year_label: str | None = None,
    semester: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    ensure_academic_core_schema(db)
    q = (
        db.query(CourseOffering, CourseCatalog, func.count(func.distinct(RegistrationCourseSelection.student_user_id)).label("student_count"))
        .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
        .join(RegistrationCourseSelection, RegistrationCourseSelection.offering_id == CourseOffering.id)
        .join(RegistrationRequest, RegistrationRequest.id == RegistrationCourseSelection.registration_request_id)
        .filter(
            CourseOffering.is_active == True,  # noqa: E712
            RegistrationRequest.status.in_(ACTIVE_REGISTRATION_STATUSES),
        )
    )
    if academic_year_label:
        q = q.filter(CourseOffering.academic_year_label == str(academic_year_label))
    if semester:
        q = q.filter(CourseOffering.semester == str(semester))
    rows = (
        q.group_by(CourseOffering.id, CourseCatalog.id)
        .order_by(CourseCatalog.title_ar.asc(), CourseOffering.section.asc())
        .all()
    )
    items = []
    for offering, course, student_count in rows:
        items.append(
            {
                **_serialize_offering(offering, course),
                "display_title": _resolve_offering_display_title(db, int(offering.id)),
                "registered_students_count": int(student_count or 0),
            }
        )
    return {"items": items}


@router.post("/sessions", dependencies=[Depends(require_role("admin", "doctor"))])
async def create_attendance_session(
    payload: AttendanceSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    offering, _course = _get_offering_or_404(db, int(payload.offering_id))
    roster = _registered_roster(db, int(offering.id))
    if not roster:
        raise HTTPException(status_code=400, detail="No registered students found for this offering")
    normalized_start = str(payload.start_time or "").strip() or None
    normalized_end = str(payload.end_time or "").strip() or None
    if normalized_start and normalized_end and normalized_end <= normalized_start:
        raise HTTPException(status_code=400, detail="Session end time must be after start time")
    existing = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.offering_id == int(payload.offering_id),
            AttendanceSession.session_date == payload.session_date,
            AttendanceSession.start_time == normalized_start,
            AttendanceSession.title == str(payload.title).strip(),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="An attendance session already exists for this slot")

    row = AttendanceSession(
        offering_id=int(payload.offering_id),
        title=str(payload.title).strip(),
        session_date=payload.session_date,
        start_time=normalized_start,
        end_time=normalized_end,
        status="open",
        qr_token=secrets.token_urlsafe(24),
        qr_expires_at=payload.qr_expires_at,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _session_records_payload(db, row)


@router.get("/sessions", dependencies=[Depends(require_role("admin", "doctor"))])
async def list_attendance_sessions(
    offering_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    _get_offering_or_404(db, offering_id)
    rows = (
        db.query(AttendanceSession)
        .filter(AttendanceSession.offering_id == int(offering_id))
        .order_by(AttendanceSession.session_date.desc(), AttendanceSession.start_time.desc(), AttendanceSession.id.desc())
        .all()
    )
    return {"items": [_serialize_session(item) for item in rows]}


@router.get("/sessions/{session_id}", dependencies=[Depends(require_role("admin", "doctor"))])
async def get_attendance_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    row = _get_session_or_404(db, session_id)
    payload = _session_records_payload(db, row)
    return {
        "session": payload["session"],
        "offering": payload["offering"],
        "totals": payload["totals"],
    }


@router.patch("/sessions/{session_id}/close", dependencies=[Depends(require_role("admin", "doctor"))])
async def close_attendance_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_session_or_404(db, session_id)
    return _close_session_and_fill_absences(db, row, current_user.id)


@router.post("/sessions/{session_id}/scan", dependencies=[Depends(require_role("admin", "doctor"))])
async def scan_attendance(
    session_id: int,
    payload: AttendanceScanPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_session_or_404(db, session_id)
    _validate_qr_token(row, payload.qr_token)
    student = _resolve_student_from_scan_payload(db, payload)
    record = _upsert_record(
        db,
        session_row=row,
        student_user_id=int(student.id),
        status_value="present",
        actor_user_id=current_user.id,
        marked_method="qr",
        allow_update=False,
    )
    return {"record": _serialize_record(record), "session_id": int(row.id), "student_user_id": int(student.id)}


@router.post("/sessions/{session_id}/records", dependencies=[Depends(require_role("admin", "doctor"))])
async def upsert_attendance_record(
    session_id: int,
    payload: AttendanceRecordUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_session_or_404(db, session_id)
    _upsert_record(
        db,
        session_row=row,
        student_user_id=int(payload.student_user_id),
        status_value=str(payload.status),
        actor_user_id=current_user.id,
        marked_method=str(payload.marked_method),
        allow_update=True,
    )
    return _session_records_payload(db, row)


@router.post("/sessions/{session_id}/mark-absent", dependencies=[Depends(require_role("admin", "doctor"))])
async def mark_attendance_absent(
    session_id: int,
    payload: AttendanceMarkAbsentPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_session_or_404(db, session_id)
    if payload.student_user_id:
        _upsert_record(
            db,
            session_row=row,
            student_user_id=int(payload.student_user_id),
            status_value="absent",
            actor_user_id=current_user.id,
            marked_method="manual",
            allow_update=True,
        )
        return _session_records_payload(db, row)

    roster = _registered_roster(db, int(row.offering_id))
    existing_student_ids = {
        int(item.student_user_id)
        for item in db.query(AttendanceRecord).filter(AttendanceRecord.session_id == int(row.id)).all()
    }
    for item in roster:
        if int(item["student_user_id"]) in existing_student_ids:
            continue
        _upsert_record(
            db,
            session_row=row,
            student_user_id=int(item["student_user_id"]),
            status_value="absent",
            actor_user_id=current_user.id,
            marked_method="system",
            allow_update=False,
        )
    return _session_records_payload(db, row)


@router.get("/sessions/{session_id}/records", dependencies=[Depends(require_role("admin", "doctor"))])
async def get_attendance_session_records(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    row = _get_session_or_404(db, session_id)
    return _session_records_payload(db, row)


@router.get("/me", response_model=AttendanceMySummaryResponse)
async def get_my_attendance_summary(
    academic_year_label: str | None = Query(default=None),
    semester: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.role or "").strip().lower() != "student":
        raise HTTPException(status_code=403, detail="Students only")
    ensure_academic_core_schema(db)

    q = (
        db.query(RegistrationCourseSelection, CourseOffering, CourseCatalog)
        .join(RegistrationRequest, RegistrationRequest.id == RegistrationCourseSelection.registration_request_id)
        .join(CourseOffering, CourseOffering.id == RegistrationCourseSelection.offering_id)
        .join(CourseCatalog, CourseCatalog.id == CourseOffering.course_id)
        .filter(
            RegistrationCourseSelection.student_user_id == int(current_user.id),
            RegistrationRequest.status.in_(ACTIVE_REGISTRATION_STATUSES),
            CourseOffering.is_active == True,  # noqa: E712
        )
    )
    if academic_year_label:
        q = q.filter(CourseOffering.academic_year_label == str(academic_year_label))
    if semester:
        q = q.filter(CourseOffering.semester == str(semester))

    rows = q.order_by(CourseCatalog.title_ar.asc(), CourseOffering.section.asc()).all()
    offering_map: dict[int, tuple[CourseOffering, CourseCatalog]] = {}
    for _selection, offering, course in rows:
        offering_map[int(offering.id)] = (offering, course)

    if not offering_map:
        return {"items": []}

    session_rows = (
        db.query(AttendanceSession)
        .filter(AttendanceSession.offering_id.in_(list(offering_map.keys())))
        .all()
    )
    total_sessions_by_offering: dict[int, int] = defaultdict(int)
    session_ids: list[int] = []
    for session_row in session_rows:
        total_sessions_by_offering[int(session_row.offering_id)] += 1
        session_ids.append(int(session_row.id))

    counts_by_offering_status: dict[int, dict[str, int]] = defaultdict(lambda: {"present": 0, "absent": 0, "late": 0})
    if session_ids:
        record_rows = (
            db.query(AttendanceRecord, AttendanceSession)
            .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
            .filter(
                AttendanceRecord.student_user_id == int(current_user.id),
                AttendanceRecord.session_id.in_(session_ids),
            )
            .all()
        )
        for record, session_row in record_rows:
            status_key = str(record.status or "").strip().lower()
            if status_key not in ATTENDANCE_STATUSES:
                continue
            counts_by_offering_status[int(session_row.offering_id)][status_key] += 1

    items = []
    for offering_id, (offering, course) in offering_map.items():
        totals = counts_by_offering_status.get(int(offering_id), {"present": 0, "absent": 0, "late": 0}).copy()
        totals["total_sessions"] = int(total_sessions_by_offering.get(int(offering_id), 0))
        selection = next((sel for sel, off, _course in rows if int(off.id) == int(offering_id)), None)
        items.append(
            _build_summary_item(
                offering=offering,
                course=course,
                display_title=_normalize_display_title(getattr(selection, "display_title", None)),
                totals=totals,
            )
        )
    return {"items": items}


@router.get("/me/by-course/{offering_id}", response_model=AttendanceCourseHistoryResponse)
async def get_my_attendance_by_course(
    offering_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.role or "").strip().lower() != "student":
        raise HTTPException(status_code=403, detail="Students only")
    ensure_academic_core_schema(db)

    selection = _find_registered_selection(db, offering_id=int(offering_id), student_user_id=int(current_user.id))
    if not selection:
        raise HTTPException(status_code=404, detail="Registered offering not found for this student")

    offering, course = _get_offering_or_404(db, int(offering_id))
    session_rows = (
        db.query(AttendanceSession)
        .filter(AttendanceSession.offering_id == int(offering_id))
        .order_by(AttendanceSession.session_date.desc(), AttendanceSession.start_time.desc(), AttendanceSession.id.desc())
        .all()
    )
    session_ids = [int(item.id) for item in session_rows]
    records_by_session: dict[int, AttendanceRecord] = {}
    if session_ids:
        record_rows = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.student_user_id == int(current_user.id),
                AttendanceRecord.session_id.in_(session_ids),
            )
            .all()
        )
        records_by_session = {int(item.session_id): item for item in record_rows}

    counts = {"total_sessions": len(session_rows), "present": 0, "absent": 0, "late": 0}
    history: list[AttendanceCourseHistoryItem] = []
    for session_row in session_rows:
        record = records_by_session.get(int(session_row.id))
        derived_status = record.status if record else ("absent" if str(session_row.status or "").lower() == "closed" else "unmarked")
        if derived_status in {"present", "absent", "late"}:
            counts[derived_status] += 1
        history.append(
            {
                "session_id": int(session_row.id),
                "title": session_row.title,
                "session_date": session_row.session_date,
                "start_time": session_row.start_time,
                "end_time": session_row.end_time,
                "status": derived_status,
                "marked_method": record.marked_method if record else None,
                "marked_at": record.marked_at if record else None,
                "session_status": session_row.status,
            }
        )

    return {
        "summary": _build_summary_item(
            offering=offering,
            course=course,
            display_title=_normalize_display_title(selection.display_title),
            totals=counts,
        ),
        "history": history,
    }
