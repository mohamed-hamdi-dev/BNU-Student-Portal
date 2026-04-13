import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.deps import get_current_user, get_db, require_role
from models.academic import AcademicState
from models.academic_core import CourseCatalog, College, CollegeTrack, CourseOffering
from models.user import User
from schemas.academic import (
    AcademicStatePayload,
    AcademicStateResponse,
    TrackAssignmentRequest,
    TrackBulkGpaAssignmentRequest,
    TrackCoordinationStatusUpdate,
    TrackPreferencesRequest,
    TrackSelectionRequest,
    TrackSelectionStatusResponse,
    TrackSelectionWindowUpdate,
)


router = APIRouter(prefix="/academic", tags=["academic"])
logger = logging.getLogger(__name__)
COLLEGE_CATALOG_KEY = "collegeCatalog"
DEFAULT_COLLEGES = [
    {"id": "CS", "name": "علوم الحاسب"},
    {"id": "ENG", "name": "الهندسة"},
    {"id": "BUS", "name": "إدارة الأعمال"},
    {"id": "MED", "name": "الطب"},
    {"id": "DEN", "name": "طب الأسنان"},
    {"id": "PHR", "name": "الصيدلة"},
]



DEFAULT_COLLEGE_POLICIES = {
    "cs": {
        "branchingYear": "3",
        "totalYears": 4,
        "yearIds": ["1", "2", "3", "4"],
        "tracks": [{"id": "AI", "name": "AI"}, {"id": "SAD", "name": "SAD"}],
        "levelThresholds": {"1": 0, "2": 33, "3": 66, "4": 99},
    },
    "eng": {
        "branchingYear": "2",
        "totalYears": 5,
        "yearIds": ["1", "2", "3", "4", "5"],
        "tracks": [],
        "levelThresholds": {"1": 0, "2": 36, "3": 72, "4": 108, "5": 144},
    },
    "bus": {
        "branchingYear": "2",
        "totalYears": 4,
        "yearIds": ["1", "2", "3", "4"],
        "tracks": [],
        "levelThresholds": {"1": 0, "2": 30, "3": 60, "4": 90},
    },
}


def _default_state() -> AcademicState:
    return AcademicState(id=1)


def _get_or_create_state(db: Session) -> AcademicState:
    state = db.query(AcademicState).filter(AcademicState.id == 1).first()
    if not state:
        state = _default_state()
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


def _decode_json(raw: str, fallback):
    try:
        return json.loads(raw) if raw else fallback
    except json.JSONDecodeError:
        return fallback


def _normalize_section_token(value: Any) -> str:
    raw = str(value or "").strip().upper()
    if not raw:
        return ""
    cleaned = "".join(ch for ch in raw if ch.isalnum() or ch in {"-", "_"})
    return cleaned


def _parse_group_start(group: dict[str, Any]) -> str | None:
    start = str(group.get("start") or "").strip()
    if start and ":" in start:
        return start[:5]
    time_range = str(group.get("time") or "").strip()
    if "-" in time_range:
        left = time_range.split("-", 1)[0].strip()
        if ":" in left:
            return left[:5]
    return None


def _calc_end_from_start(start: str | None, duration: Any) -> str | None:
    if not start or ":" not in str(start):
        return None
    try:
        hours_text, minutes_text = str(start).split(":", 1)
        hours = int(hours_text)
        minutes = int(minutes_text)
        duration_hours = int(duration) if str(duration or "").strip() else 2
    except Exception:
        return None
    if duration_hours <= 0:
        duration_hours = 2
    end_hours = hours + duration_hours
    return f"{end_hours:02d}:{minutes:02d}"


def _resolve_sync_academic_year_label(
    db: Session,
    registration_settings: dict[str, Any] | None,
) -> str:
    settings = registration_settings if isinstance(registration_settings, dict) else {}
    candidate = str(
        settings.get("activeAcademicYearLabel")
        or settings.get("academicYearLabel")
        or settings.get("activeAcademicYear")
        or ""
    ).strip()
    if re.fullmatch(r"\d{4}\s*-\s*\d{4}", candidate):
        return candidate.replace(" ", "")

    latest_offering_year = db.query(func.max(CourseOffering.academic_year_label)).scalar()
    latest_offering_year = str(latest_offering_year or "").strip()
    if re.fullmatch(r"\d{4}\s*-\s*\d{4}", latest_offering_year):
        return latest_offering_year.replace(" ", "")

    return "2025-2026"


def _sync_core_offerings_from_admin_courses(
    db: Session,
    courses_payload: list[dict[str, Any]],
    academic_year_label: str,
) -> None:
    courses = courses_payload if isinstance(courses_payload, list) else []
    desired_sections_by_term_course: dict[tuple[int, str], set[str]] = {}

    for course_item in courses:
        if not isinstance(course_item, dict):
            continue
        course_code = str(course_item.get("id") or course_item.get("code") or "").strip().upper()
        semester = str(course_item.get("semester") or "").strip().lower()
        if not course_code or not semester:
            continue

        course_row = (
            db.query(CourseCatalog)
            .filter(func.upper(func.trim(CourseCatalog.code)) == course_code)
            .first()
        )
        if not course_row:
            continue

        groups = course_item.get("groups")
        if not isinstance(groups, list):
            groups = []

        term_key = (int(course_row.id), semester)
        desired_sections_by_term_course.setdefault(term_key, set())

        for group in groups:
            if not isinstance(group, dict):
                continue
            section = _normalize_section_token(group.get("name") or group.get("section") or group.get("id"))
            if not section:
                continue
            desired_sections_by_term_course[term_key].add(section)

            day = str(group.get("day") or "").strip() or None
            start = _parse_group_start(group)
            end = _calc_end_from_start(start, group.get("duration"))
            room_name = str(group.get("hall") or "").strip() or None
            target_group_id = str(group.get("targetGroupId") or section).strip() or section
            target_group_name = str(group.get("name") or section).strip() or section
            max_students = None
            try:
                cap = str(group.get("capacity") or "").strip()
                if cap:
                    max_students = int(cap)
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
            if row:
                row.target_group_id = target_group_id
                row.target_group_name = target_group_name
                row.day_of_week = day
                row.start_time = start
                row.end_time = end
                row.room_name = room_name
                row.max_students = max_students if max_students is not None else row.max_students
                row.is_active = True
            else:
                db.add(
                    CourseOffering(
                        course_id=course_row.id,
                        academic_year_label=academic_year_label,
                        semester=semester,
                        section=section,
                        target_group_id=target_group_id,
                        target_group_name=target_group_name,
                        day_of_week=day,
                        start_time=start,
                        end_time=end,
                        room_name=room_name,
                        instructor_user_id=None,
                        max_students=max_students,
                        is_active=True,
                    )
                )

    for (course_id, semester), desired_sections in desired_sections_by_term_course.items():
        stale_rows = (
            db.query(CourseOffering)
            .filter(
                CourseOffering.course_id == course_id,
                CourseOffering.academic_year_label == academic_year_label,
                CourseOffering.semester == semester,
                CourseOffering.is_active == True,  # noqa: E712
            )
            .all()
        )
        for row in stale_rows:
            if row.section not in desired_sections:
                row.is_active = False


def _normalize_colleges(raw_colleges: Any) -> list[dict[str, str]]:
    if not isinstance(raw_colleges, list):
        return []
    seen = set()
    rows: list[dict[str, str]] = []
    for item in raw_colleges:
        if not isinstance(item, dict):
            continue
        cid = str(item.get("id") or "").strip().upper()
        name = str(item.get("name") or "").strip()
        if not cid or not name or cid in seen:
            continue
        seen.add(cid)
        rows.append({"id": cid, "name": name})
    return rows


def _get_colleges_from_state(state: AcademicState) -> list[dict[str, str]]:
    settings = _decode_json(state.registration_settings_json, {}) or {}
    if not isinstance(settings, dict):
        settings = {}
    colleges = _normalize_colleges(settings.get(COLLEGE_CATALOG_KEY))
    return colleges or list(DEFAULT_COLLEGES)


def _get_registration_settings(state: AcademicState) -> dict:
    settings = _decode_json(state.registration_settings_json, {}) or {}
    return settings if isinstance(settings, dict) else {}


def _normalize_college_policy(policy: Any) -> dict[str, Any]:
    if not isinstance(policy, dict):
        return {"branchingYear": "", "totalYears": 4, "yearIds": ["1", "2", "3", "4"], "tracks": [], "levelThresholds": {}}

    branching_year = _normalize_year(policy.get("branchingYear"), "")
    total_years_raw = policy.get("totalYears")
    try:
        total_years = int(total_years_raw)
    except (TypeError, ValueError):
        total_years = 4
    total_years = max(1, min(8, total_years))

    year_ids_raw = policy.get("yearIds")
    if isinstance(year_ids_raw, list):
        year_ids = [str(item).strip() for item in year_ids_raw if str(item).strip()]
    else:
        year_ids = []
    if not year_ids:
        year_ids = [str(i) for i in range(1, total_years + 1)]
    year_ids = year_ids[:total_years]

    tracks_raw = policy.get("tracks")
    tracks = []
    seen_tracks = set()
    if isinstance(tracks_raw, list):
        for track in tracks_raw:
            normalized_track = _normalize_track_item(track)
            track_id = str(normalized_track.get("id") or "").strip()
            track_name = str(normalized_track.get("name") or track_id).strip()
            key = _normalize_text_key(track_id or track_name)
            if not key or key in seen_tracks:
                continue
            seen_tracks.add(key)
            tracks.append({"id": track_id or track_name, "name": track_name})

    thresholds_raw = policy.get("levelThresholds")
    thresholds = {}
    if isinstance(thresholds_raw, dict):
        for key, value in thresholds_raw.items():
            year_key = _normalize_year(key, "")
            if not year_key:
                continue
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                continue
            thresholds[year_key] = max(0, numeric)

    return {
        "branchingYear": branching_year,
        "totalYears": total_years,
        "yearIds": year_ids,
        "tracks": tracks,
        "levelThresholds": thresholds,
    }


def _normalize_text_key(value) -> str:
    raw = str(value or "").strip().lower()
    return (
        raw.replace("أ", "ا")
        .replace("إ", "ا")
        .replace("آ", "ا")
        .replace("ة", "ه")
        .replace("ى", "ي")
        .replace("ـ", "")
    )


def _compact_text_key(value) -> str:
    return _normalize_text_key(value).replace(" ", "")


COLLEGE_ALIASES = {
    "cs": ["علوم الحاسب", "حاسبات", "حاسبات ومعلومات", "computer science", "cs"],
    "eng": ["الهندسة", "engineering", "eng"],
    "bus": ["ادارة الاعمال", "إدارة الأعمال", "business", "business administration", "bus"],
    "med": ["الطب", "medicine", "med"],
    "den": ["طب الاسنان", "طب الأسنان", "dentistry", "dental", "den"],
    "phr": ["الصيدلة", "pharmacy", "phr"],
}


def _normalize_college_alias_set(raw_value) -> set[str]:
    normalized = _normalize_text_key(raw_value)
    compact = _compact_text_key(raw_value)
    keys = {k for k in [normalized, compact] if k}
    direct_code = compact.lower()
    if direct_code in COLLEGE_ALIASES:
        for item in COLLEGE_ALIASES[direct_code]:
            keys.add(_normalize_text_key(item))
            keys.add(_compact_text_key(item))

    for code, labels in COLLEGE_ALIASES.items():
        normalized_labels = [_normalize_text_key(item) for item in labels]
        compact_labels = [_compact_text_key(item) for item in labels]
        if normalized in normalized_labels or compact in compact_labels:
            keys.add(code)
            for item in labels:
                keys.add(_normalize_text_key(item))
                keys.add(_compact_text_key(item))
    return {k for k in keys if k}


def _resolve_student_college_keys(current_user: User) -> set[str]:
    keys = set()
    for value in [current_user.college, current_user.major]:
        keys.update(_normalize_college_alias_set(value))
    return keys


def _resolve_college_policy(college_policies: dict, current_user: User):
    if not isinstance(college_policies, dict):
        return None, ""

    policy_map = {}
    for raw_key, value in college_policies.items():
        if not isinstance(value, dict):
            continue
        for key in _normalize_college_alias_set(raw_key):
            policy_map[key] = value

    student_keys = _resolve_student_college_keys(current_user)
    for key in student_keys:
        if key in policy_map:
            return policy_map[key], key
    return None, ""


def _normalize_year(value, fallback: str = "1") -> str:
    raw = str(value or "").strip()
    if not raw:
        return fallback
    digit_map = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
    normalized_raw = raw.translate(digit_map)
    normalized_raw = (
        normalized_raw.replace("أ", "ا")
        .replace("إ", "ا")
        .replace("آ", "ا")
        .replace("ة", "ه")
        .replace("ى", "ي")
        .replace("ـ", "")
        .replace("-", " ")
        .replace("_", " ")
    )
    digits = "".join(ch for ch in normalized_raw if ch.isdigit())
    if digits:
        return digits
    lowered = normalized_raw.lower()
    mapping = {
        "first": "1",
        "second": "2",
        "third": "3",
        "fourth": "4",
        "level1": "1",
        "level2": "2",
        "level3": "3",
        "level4": "4",
        "level5": "5",
        "level6": "6",
        "level7": "7",
        "level8": "8",
        "year1": "1",
        "year2": "2",
        "year3": "3",
        "year4": "4",
        "year5": "5",
        "year6": "6",
        "year7": "7",
        "year8": "8",
        "الفرقه الاولي": "1",
        "الفرقه الثانيه": "2",
        "الفرقه الثالثه": "3",
        "الفرقه الرابعه": "4",
        "الفرقه الخامسه": "5",
        "الفرقه السادسه": "6",
        "الفرقه السابعه": "7",
        "الفرقه الثامنه": "8",
        "الفرقه التاسعه": "9",
        "الفرقه العاشره": "10",
        "first year": "1",
        "second year": "2",
        "third year": "3",
        "fourth year": "4",
    }
    for label, resolved in mapping.items():
        if label in lowered:
            return resolved
    return normalized_raw

def _to_year_number(value, fallback: int = 0) -> int:
    normalized = _normalize_year(value, "")
    try:
        return int(normalized)
    except (TypeError, ValueError):
        return fallback


def _normalize_track_item(track) -> dict[str, str]:
    if isinstance(track, str):
        val = track.strip()
        return {"id": val, "name": val}
    if isinstance(track, dict):
        tid = str(track.get("id") or track.get("name") or "").strip()
        tname = str(track.get("name") or track.get("id") or "").strip()
        return {"id": tid, "name": tname}
    return {"id": "", "name": ""}


def _extract_track_window(registration_settings: dict, policy_key: str):
    windows = registration_settings.get("trackSelectionWindows")
    global_window = registration_settings.get("trackSelectionWindow")
    if isinstance(windows, dict) and policy_key and isinstance(windows.get(policy_key), dict):
        return windows.get(policy_key)
    return global_window if isinstance(global_window, dict) else None


def _is_window_open(window: dict | None):
    if not window:
        return True, False, None, None
    if not bool(window.get("enabled", True)):
        return False, True, window.get("startsAt"), window.get("endsAt")
    starts_raw = window.get("startsAt")
    ends_raw = window.get("endsAt")
    if not starts_raw or not ends_raw:
        return True, False, starts_raw, ends_raw
    try:
        starts_at = datetime.fromisoformat(str(starts_raw).replace("Z", "+00:00"))
        ends_at = datetime.fromisoformat(str(ends_raw).replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        if starts_at.tzinfo is None:
            starts_at = starts_at.replace(tzinfo=timezone.utc)
        if ends_at.tzinfo is None:
            ends_at = ends_at.replace(tzinfo=timezone.utc)
        return starts_at <= now <= ends_at, True, starts_raw, ends_raw
    except ValueError:
        return True, False, starts_raw, ends_raw


def _pick_track_by_input(tracks: list[dict[str, str]], candidate: str) -> dict[str, str] | None:
    normalized = _normalize_text_key(candidate)
    for track in tracks:
        track_id = _normalize_text_key(track.get("id"))
        track_name = _normalize_text_key(track.get("name"))
        if normalized and (normalized == track_id or normalized == track_name):
            return track
    return None


def _grade_to_points(value: str) -> float:
    grade = str(value or "").strip().upper()
    points_map = {
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
        "F": 0.0,
    }
    return float(points_map.get(grade, 0.0))


def _safe_float(value, fallback: float = 0.0) -> float:
    try:
        parsed = float(value)
        return parsed if parsed >= 0 else fallback
    except (TypeError, ValueError):
        return fallback


def _student_identifier_keys(user: User) -> set[str]:
    candidates = {
        str(user.id),
        str(user.username or ""),
        str(user.student_code or ""),
        str(user.email or ""),
    }
    return {_normalize_text_key(item) for item in candidates if str(item or "").strip()}


def _calculate_student_gpa_from_state(state: AcademicState, user: User) -> float:
    records = _decode_json(state.academic_records_json, [])
    if not isinstance(records, list):
        return 0.0
    keys = _student_identifier_keys(user)
    if not keys:
        return 0.0

    total_points = 0.0
    total_credits = 0.0
    for record in records:
        if not isinstance(record, dict):
            continue
        student_fields = [
            record.get("studentId"),
            record.get("student_id"),
            record.get("studentCode"),
            record.get("student_code"),
            record.get("username"),
            record.get("userId"),
            record.get("user_id"),
            record.get("email"),
        ]
        rec_keys = {_normalize_text_key(v) for v in student_fields if str(v or "").strip()}
        if not rec_keys.intersection(keys):
            continue

        grade = str(record.get("grade") or "").strip()
        if not grade:
            continue
        credits = _safe_float(record.get("credits"), 0.0)
        if credits <= 0:
            credits = _safe_float(record.get("hours"), 0.0)
        if credits <= 0:
            credits = 3.0

        total_points += _grade_to_points(grade) * credits
        total_credits += credits
    if total_credits <= 0:
        return 0.0
    return round(total_points / total_credits, 3)


def _get_track_state_for_user(state: AcademicState, current_user: User) -> TrackSelectionStatusResponse:
    registration_settings = _decode_json(state.registration_settings_json, {}) or {}
    college_policies = registration_settings.get("collegePolicies") if isinstance(registration_settings, dict) else {}
    policy, policy_key = _resolve_college_policy(college_policies if isinstance(college_policies, dict) else {}, current_user)

    current_study_year = _normalize_year(current_user.level, "1")
    if not policy:
        return TrackSelectionStatusResponse(
            policyFound=False,
            currentStudyYear=current_study_year,
            message="لا توجد سياسة تشعيب مضافة لهذه الكلية من لوحة الأدمن.",
        )

    tracks = [_normalize_track_item(track) for track in (policy.get("tracks") if isinstance(policy, dict) else [])]
    tracks = [track for track in tracks if track.get("id") or track.get("name")]
    branching_year = _normalize_year(policy.get("branchingYear"), "")
    is_branching_open = bool(branching_year and _to_year_number(current_study_year, 0) >= _to_year_number(branching_year, 0))

    pref_store = registration_settings.get("studentTrackPreferences") if isinstance(registration_settings, dict) else {}
    pref_store = pref_store if isinstance(pref_store, dict) else {}
    raw_preferences = pref_store.get(str(current_user.id))
    raw_preferences = raw_preferences if isinstance(raw_preferences, list) else []
    preferences = []
    seen_pref_ids = set()
    for item in raw_preferences:
        if not isinstance(item, dict):
            continue
        pref_id = str(item.get("trackId") or "").strip()
        if not pref_id:
            continue
        matched = _pick_track_by_input(tracks, pref_id)
        canonical_id = str((matched or {}).get("id") or pref_id).strip()
        canonical_name = str((matched or {}).get("name") or item.get("trackName") or canonical_id).strip()
        normalized_id = _normalize_text_key(canonical_id)
        if normalized_id in seen_pref_ids:
            continue
        seen_pref_ids.add(normalized_id)
        pref_order = item.get("preferenceOrder")
        if not isinstance(pref_order, int):
            pref_order = len(preferences) + 1
        preferences.append(
            {
                "preferenceOrder": pref_order,
                "trackId": canonical_id,
                "trackName": canonical_name,
            }
        )
    preferences = sorted(preferences, key=lambda item: int(item.get("preferenceOrder") or 0))

    final_store = registration_settings.get("studentFinalTrackAssignments") if isinstance(registration_settings, dict) else {}
    final_store = final_store if isinstance(final_store, dict) else {}
    final_raw = final_store.get(str(current_user.id))
    final_raw = final_raw if isinstance(final_raw, dict) else {}
    final_track_id = str(final_raw.get("trackId") or "").strip()
    final_track_name = str(final_raw.get("trackName") or "").strip()

    if not final_track_id:
        # Backward compatibility with legacy lock model.
        selections = registration_settings.get("studentTrackSelections") if isinstance(registration_settings, dict) else {}
        selections = selections if isinstance(selections, dict) else {}
        selected = selections.get(str(current_user.id)) if isinstance(selections.get(str(current_user.id)), dict) else {}
        final_track_id = str(selected.get("trackId") or "").strip()
        final_track_name = str(selected.get("trackName") or "").strip()

    if final_track_id and not final_track_name:
        picked = _pick_track_by_input(tracks, final_track_id)
        final_track_name = str((picked or {}).get("name") or final_track_id)

    status_store = registration_settings.get("studentTrackCoordinationStatuses") if isinstance(registration_settings, dict) else {}
    status_store = status_store if isinstance(status_store, dict) else {}
    status_override = _normalize_text_key(status_store.get(str(current_user.id)))

    window = _extract_track_window(registration_settings if isinstance(registration_settings, dict) else {}, policy_key)
    window_open, window_configured, starts_at, ends_at = _is_window_open(window)

    if not is_branching_open:
        # Before branching year, student must not appear as finally assigned,
        # even if legacy data exists from older flows.
        final_track_id = ""
        final_track_name = ""
        coordination_status = "not_eligible"
        msg = f"لم تصل بعد إلى سنة التخصص. بداية التشعيب من السنة {branching_year}."
    elif final_track_id:
        coordination_status = "final_assigned"
        msg = f"تم اعتماد التخصص النهائي: {final_track_name or final_track_id}."
    elif preferences:
        if status_override in {"under_review", "preferences_submitted"}:
            coordination_status = status_override
        else:
            coordination_status = "preferences_submitted"
        msg = "تم استلام رغباتك، وجارٍ مراجعتها من الإدارة."
    else:
        coordination_status = "eligible_for_specialization"
        if window_configured and not window_open:
            msg = "وصلت إلى سنة التخصص، لكن فترة التقديم في التنسيق غير مفتوحة الآن."
        else:
            msg = "أنت مؤهل الآن للتقديم في التنسيق الداخلي وإدخال رغبات التخصص."

    if coordination_status == "under_review":
        msg = "الرغبات تحت المراجعة الآن من الإدارة."

    return TrackSelectionStatusResponse(
        policyFound=True,
        branchingYear=branching_year,
        isBranchingOpen=is_branching_open,
        currentStudyYear=current_study_year,
        coordinationStatus=coordination_status,
        tracks=tracks,
        preferences=preferences,
        finalAssignedTrackId=final_track_id,
        finalAssignedTrackName=final_track_name,
        selectedTrackId=final_track_id,
        selectedTrackName=final_track_name,
        selectionLocked=bool(final_track_id),
        windowConfigured=window_configured,
        windowOpen=window_open,
        windowStartsAt=starts_at,
        windowEndsAt=ends_at,
        message=msg,
    )


def _serialize_state(state: AcademicState) -> AcademicStateResponse:
    return AcademicStateResponse(
        courses=_decode_json(state.courses_json, []),
        years=_decode_json(state.years_json, []),
        openSemesters=_decode_json(state.open_semesters_json, {"autumn": True, "spring": False, "summer": False}),
        registrationSettings=_decode_json(
            state.registration_settings_json,
            {"activeAcademicYear": "1", "enforcePrerequisites": True, "enforceMaxHours": True},
        ),
        studentRegistrations=_decode_json(state.student_registrations_json, []),
        academicRecords=_decode_json(state.academic_records_json, []),
        updatedAt=state.updated_at or datetime.now(timezone.utc),
    )


def _serialize_public_catalog(state: AcademicState) -> dict[str, Any]:
    settings = _get_registration_settings(state)
    years = _decode_json(state.years_json, [])
    return {
        "colleges": _get_colleges_from_state(state),
        "years": years if isinstance(years, list) else [],
        "registrationSettings": settings if isinstance(settings, dict) else {},
    }


@router.get("/state", response_model=AcademicStateResponse)
async def get_academic_state(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Auth required; state is shared for app modules.
    state = _get_or_create_state(db)
    response = _serialize_state(state)

    # ── Merge courses from the normalized ac_course_catalog table ──
    try:
        catalog_rows = db.query(CourseCatalog).filter(CourseCatalog.is_active == True).all()  # noqa: E712
        if catalog_rows:
            existing_codes = set()
            if isinstance(response.courses, list):
                for c in response.courses:
                    code = str(c.get("id", "") if isinstance(c, dict) else "").strip().upper()
                    if code:
                        existing_codes.add(code)

            # Preload college & track lookups
            college_map = {}
            for college in db.query(College).all():
                college_map[college.id] = college
            track_map = {}
            for track in db.query(CollegeTrack).all():
                track_map[track.id] = track

            catalog_courses = []
            for row in catalog_rows:
                code_upper = (row.code or "").strip().upper()
                if code_upper in existing_codes:
                    continue  # Already in state JSON, skip
                college_obj = college_map.get(row.college_id)
                track_obj = track_map.get(row.track_id) if row.track_id else None
                catalog_courses.append({
                    "id": row.code,
                    "name": row.title_ar or row.title_en or row.code,
                    "year": str(row.study_year or "1"),
                    "semester": row.semester or "autumn",
                    "hours": int(row.credit_hours or 3),
                    "category": "تخصص" if track_obj else "إجباري",
                    "collegeId": college_obj.code if college_obj else "",
                    "college": college_obj.name_ar if college_obj else "",
                    "trackId": track_obj.code if track_obj else "",
                    "trackName": track_obj.name_ar if track_obj else "",
                    "lecture": {"day": "", "time": "", "start": "", "hall": ""},
                    "groups": [],
                    "_source": "catalog",
                })

            if catalog_courses:
                merged = list(response.courses or []) + catalog_courses
                response.courses = merged
    except Exception:
        pass  # If catalog query fails, just return the original state

    return response


@router.get("/public-catalog")
async def get_public_catalog(
    db: Session = Depends(get_db),
):
    # Public endpoint for pre-login forms (account request / recovery).
    state = _get_or_create_state(db)
    return _serialize_public_catalog(state)


@router.put("/state", response_model=AcademicStateResponse)
async def put_academic_state(
    payload: AcademicStatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Admin can persist full academic state.
    # Non-admin users are restricted to their own registration/record rows only.
    state = _get_or_create_state(db)
    is_admin = (current_user.role or "").lower() == "admin"
    logger.info(
        "academic.state.put start user_id=%s role=%s incoming_student_regs=%s incoming_records=%s",
        current_user.id,
        current_user.role,
        len(payload.studentRegistrations if isinstance(payload.studentRegistrations, list) else []),
        len(payload.academicRecords if isinstance(payload.academicRecords, list) else []),
    )
    if is_admin:
        next_registration_settings = payload.registrationSettings if isinstance(payload.registrationSettings, dict) else {}
        state.courses_json = json.dumps(payload.courses, ensure_ascii=False)
        state.years_json = json.dumps(payload.years, ensure_ascii=False)
        state.open_semesters_json = json.dumps(payload.openSemesters, ensure_ascii=False)
        state.registration_settings_json = json.dumps(next_registration_settings, ensure_ascii=False)
        state.student_registrations_json = json.dumps(payload.studentRegistrations, ensure_ascii=False)
        state.academic_records_json = json.dumps(payload.academicRecords, ensure_ascii=False)
        active_year = _resolve_sync_academic_year_label(db, next_registration_settings)
        try:
            _sync_core_offerings_from_admin_courses(
                db=db,
                courses_payload=payload.courses if isinstance(payload.courses, list) else [],
                academic_year_label=active_year,
            )
        except Exception:
            logger.exception(
                "academic.state.put offering_sync_failed user_id=%s active_year=%s",
                current_user.id,
                active_year,
            )
    else:
        existing_registration_settings = _decode_json(state.registration_settings_json, {}) or {}
        if not isinstance(existing_registration_settings, dict):
            existing_registration_settings = {}

        # Non-admin cannot alter global config/state.
        existing_courses = _decode_json(state.courses_json, [])
        existing_years = _decode_json(state.years_json, [])
        existing_open_semesters = _decode_json(state.open_semesters_json, {"autumn": True, "spring": False, "summer": False})
        existing_regs = _decode_json(state.student_registrations_json, [])
        existing_records = _decode_json(state.academic_records_json, [])
        incoming_regs = payload.studentRegistrations if isinstance(payload.studentRegistrations, list) else []
        incoming_records = payload.academicRecords if isinstance(payload.academicRecords, list) else []
        owner_keys = _student_identifier_keys(current_user)

        def _is_owned_row(row: dict) -> bool:
            if not isinstance(row, dict):
                return False
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
            row_keys = {_normalize_text_key(v) for v in row_candidates if str(v or "").strip()}
            return bool(row_keys.intersection(owner_keys))

        def _reg_row_key(row: dict) -> str:
            return "__".join(
                [
                    str(row.get("studentId") or row.get("student_id") or "").strip(),
                    str(row.get("id") or row.get("code") or row.get("courseId") or "").strip(),
                    str(row.get("semester") or "").strip(),
                ]
            )

        def _record_row_key(row: dict) -> str:
            return "__".join(
                [
                    str(row.get("studentId") or row.get("student_id") or "").strip(),
                    str(row.get("code") or row.get("courseCode") or "").strip(),
                    str(row.get("semester") or "").strip(),
                    str(row.get("academicYear") or row.get("academic_year") or "").strip(),
                ]
            )

        preserved_other_regs = [row for row in (existing_regs if isinstance(existing_regs, list) else []) if not _is_owned_row(row)]
        owned_incoming_regs = [row for row in incoming_regs if _is_owned_row(row)]
        merged_regs_map = {}
        for row in preserved_other_regs:
            merged_regs_map[_reg_row_key(row)] = row
        for row in owned_incoming_regs:
            merged_regs_map[_reg_row_key(row)] = row
        next_regs = list(merged_regs_map.values())

        preserved_other_records = [row for row in (existing_records if isinstance(existing_records, list) else []) if not _is_owned_row(row)]
        owned_incoming_records = [row for row in incoming_records if _is_owned_row(row)]
        merged_records_map = {}
        for row in preserved_other_records:
            merged_records_map[_record_row_key(row)] = row
        for row in owned_incoming_records:
            merged_records_map[_record_row_key(row)] = row
        next_records = list(merged_records_map.values())

        state.courses_json = json.dumps(existing_courses, ensure_ascii=False)
        state.years_json = json.dumps(existing_years, ensure_ascii=False)
        state.open_semesters_json = json.dumps(existing_open_semesters, ensure_ascii=False)
        state.registration_settings_json = json.dumps(existing_registration_settings, ensure_ascii=False)
        state.student_registrations_json = json.dumps(next_regs, ensure_ascii=False)
        state.academic_records_json = json.dumps(next_records, ensure_ascii=False)
        logger.info(
            "academic.state.put merge user_id=%s owner_keys=%s existing_regs=%s owned_incoming_regs=%s preserved_other_regs=%s next_regs=%s",
            current_user.id,
            sorted(owner_keys),
            len(existing_regs if isinstance(existing_regs, list) else []),
            len(owned_incoming_regs),
            len(preserved_other_regs),
            len(next_regs),
        )

    state.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(state)
    logger.info(
        "academic.state.put committed user_id=%s role=%s stored_student_regs=%s",
        current_user.id,
        current_user.role,
        len(_decode_json(state.student_registrations_json, [])),
    )
    return _serialize_state(state)


@router.get("/colleges")
async def get_colleges(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    # Auth required. Reuse shared academic_state as storage.
    state = _get_or_create_state(db)
    return {"colleges": _get_colleges_from_state(state)}


@router.put("/colleges", dependencies=[Depends(require_role("admin"))])
async def put_colleges(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    state = _get_or_create_state(db)
    settings = _decode_json(state.registration_settings_json, {}) or {}
    if not isinstance(settings, dict):
        settings = {}
    colleges = _normalize_colleges(payload.get("colleges"))
    if not colleges:
        raise HTTPException(status_code=400, detail="At least one valid college is required")
    settings[COLLEGE_CATALOG_KEY] = colleges
    state.registration_settings_json = json.dumps(settings, ensure_ascii=False)
    state.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(state)
    return {"colleges": colleges}


@router.get("/college-policies")
async def get_college_policies(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    state = _get_or_create_state(db)
    settings = _get_registration_settings(state)
    raw_policies = settings.get("collegePolicies")
    policies = raw_policies if isinstance(raw_policies, dict) else {}
    normalized = {
        _normalize_text_key(key): _normalize_college_policy(value)
        for key, value in policies.items()
        if str(key).strip()
    }
    return {"collegePolicies": normalized}


@router.put("/college-policies/{college_key}", dependencies=[Depends(require_role("admin"))])
async def put_college_policy(
    college_key: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
):
    normalized_key = _normalize_text_key(college_key)
    if not normalized_key:
        raise HTTPException(status_code=400, detail="Invalid college key")

    state = _get_or_create_state(db)
    settings = _get_registration_settings(state)
    policies = settings.get("collegePolicies")
    if not isinstance(policies, dict):
        policies = {}

    incoming_policy = payload.get("policy")
    policies[normalized_key] = _normalize_college_policy(incoming_policy)
    settings["collegePolicies"] = policies

    state.registration_settings_json = json.dumps(settings, ensure_ascii=False)
    state.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(state)

    return {"collegeKey": normalized_key, "policy": policies[normalized_key]}


@router.post("/college-policies/bootstrap/defaults", dependencies=[Depends(require_role("admin"))])
async def bootstrap_default_college_policies(
    db: Session = Depends(get_db),
):
    state = _get_or_create_state(db)
    settings = _get_registration_settings(state)
    policies = settings.get("collegePolicies")
    if not isinstance(policies, dict):
        policies = {}

    changed = False
    for key, policy in DEFAULT_COLLEGE_POLICIES.items():
        normalized_key = _normalize_text_key(key)
        current = policies.get(normalized_key)
        if isinstance(current, dict) and current:
            continue
        policies[normalized_key] = _normalize_college_policy(policy)
        changed = True

    if changed:
        settings["collegePolicies"] = policies
        state.registration_settings_json = json.dumps(settings, ensure_ascii=False)
        state.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(state)

    normalized = {
        _normalize_text_key(key): _normalize_college_policy(value)
        for key, value in policies.items()
        if str(key).strip()
    }
    return {"ok": True, "changed": changed, "collegePolicies": normalized}


@router.get("/track-selection/me", response_model=TrackSelectionStatusResponse)
async def get_my_track_selection_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").lower() != "student":
        raise HTTPException(status_code=403, detail="Students only")
    state = _get_or_create_state(db)
    return _get_track_state_for_user(state, current_user)


@router.post("/track-selection/select", response_model=TrackSelectionStatusResponse)
async def select_my_track(
    payload: TrackSelectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Backward-compatible route: convert single track choice to preference order #1.
    return await submit_track_preferences(
        TrackPreferencesRequest(trackIds=[payload.trackId]),
        db=db,
        current_user=current_user,
    )


@router.post("/track-selection/preferences", response_model=TrackSelectionStatusResponse)
async def submit_track_preferences(
    payload: TrackPreferencesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").lower() != "student":
        raise HTTPException(status_code=403, detail="Students only")

    state = _get_or_create_state(db)
    registration_settings = _decode_json(state.registration_settings_json, {}) or {}
    if not isinstance(registration_settings, dict):
        registration_settings = {}

    status_view = _get_track_state_for_user(state, current_user)
    if not status_view.policyFound:
        raise HTTPException(status_code=400, detail="لا توجد سياسة تشعيب لهذه الكلية")
    if not status_view.isBranchingOpen:
        raise HTTPException(status_code=400, detail=status_view.message)
    if status_view.windowConfigured and not status_view.windowOpen:
        raise HTTPException(status_code=400, detail="فترة التقديم في التنسيق غير مفتوحة")
    if status_view.finalAssignedTrackId:
        raise HTTPException(status_code=409, detail="تم اعتماد التخصص النهائي بالفعل")

    candidate_ids = [str(item or "").strip() for item in (payload.trackIds or []) if str(item or "").strip()]
    if not candidate_ids:
        raise HTTPException(status_code=400, detail="يجب اختيار رغبة واحدة على الأقل")
    if len(candidate_ids) > 3:
        raise HTTPException(status_code=400, detail="الحد الأقصى 3 رغبات")

    normalized_seen = set()
    normalized_candidates = []
    for item in candidate_ids:
        normalized = _normalize_text_key(item)
        if normalized in normalized_seen:
            raise HTTPException(status_code=400, detail="لا يمكن تكرار نفس التخصص في الرغبات")
        normalized_seen.add(normalized)
        normalized_candidates.append(item)

    preferences_payload = []
    for idx, candidate in enumerate(normalized_candidates, start=1):
        picked = _pick_track_by_input(status_view.tracks, candidate)
        if not picked:
            raise HTTPException(status_code=400, detail=f"التخصص غير متاح: {candidate}")
        preferences_payload.append(
            {
                "preferenceOrder": idx,
                "trackId": str(picked.get("id") or "").strip(),
                "trackName": str(picked.get("name") or picked.get("id") or "").strip(),
                "academicYearId": status_view.currentStudyYear,
                "submittedAt": datetime.now(timezone.utc).isoformat(),
            }
        )

    pref_store = registration_settings.get("studentTrackPreferences")
    if not isinstance(pref_store, dict):
        pref_store = {}
    pref_store[str(current_user.id)] = preferences_payload
    registration_settings["studentTrackPreferences"] = pref_store

    statuses = registration_settings.get("studentTrackCoordinationStatuses")
    if not isinstance(statuses, dict):
        statuses = {}
    statuses[str(current_user.id)] = "preferences_submitted"
    registration_settings["studentTrackCoordinationStatuses"] = statuses

    state.registration_settings_json = json.dumps(registration_settings, ensure_ascii=False)
    state.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(state)
    return _get_track_state_for_user(state, current_user)


@router.get("/track-selection/admin/students", dependencies=[Depends(require_role("admin"))])
async def list_track_selection_students(
    college: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    students = db.query(User).filter(User.role == "student").all()
    state = _get_or_create_state(db)
    result = []
    normalized_college = _normalize_text_key(college)
    normalized_status = _normalize_text_key(status)
    for student in students:
        student_view = _get_track_state_for_user(state, student)
        student_gpa = _calculate_student_gpa_from_state(state, student)
        if normalized_college and normalized_college != _normalize_text_key(student.college):
            continue
        if normalized_status and normalized_status != _normalize_text_key(student_view.coordinationStatus):
            continue
        result.append(
            {
                "studentId": student.id,
                "studentName": student.full_name,
                "username": student.username,
                "studentCode": student.student_code,
                "college": student.college,
                "level": student.level,
                "gpa": student_gpa,
                "coordinationStatus": student_view.coordinationStatus,
                "preferences": student_view.preferences,
                "finalAssignedTrackId": student_view.finalAssignedTrackId,
                "finalAssignedTrackName": student_view.finalAssignedTrackName,
            }
        )
    return {"items": result}


@router.patch("/track-selection/admin/status", dependencies=[Depends(require_role("admin"))], response_model=TrackSelectionStatusResponse)
async def patch_track_coordination_status(
    payload: TrackCoordinationStatusUpdate,
    db: Session = Depends(get_db),
):
    student = db.query(User).filter(User.id == payload.studentId, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    state = _get_or_create_state(db)
    registration_settings = _decode_json(state.registration_settings_json, {}) or {}
    if not isinstance(registration_settings, dict):
        registration_settings = {}

    status_view = _get_track_state_for_user(state, student)
    if not status_view.policyFound:
        raise HTTPException(status_code=400, detail="لا توجد سياسة تشعيب لهذه الكلية")
    if payload.coordinationStatus == "final_assigned" and not status_view.finalAssignedTrackId:
        raise HTTPException(status_code=400, detail="لا يمكن تحويل الحالة إلى final_assigned بدون اعتماد تخصص نهائي")

    statuses = registration_settings.get("studentTrackCoordinationStatuses")
    if not isinstance(statuses, dict):
        statuses = {}
    statuses[str(student.id)] = payload.coordinationStatus
    registration_settings["studentTrackCoordinationStatuses"] = statuses

    state.registration_settings_json = json.dumps(registration_settings, ensure_ascii=False)
    state.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(state)
    return _get_track_state_for_user(state, student)


@router.post("/track-selection/admin/assign", dependencies=[Depends(require_role("admin"))], response_model=TrackSelectionStatusResponse)
async def assign_final_track_for_student(
    payload: TrackAssignmentRequest,
    db: Session = Depends(get_db),
):
    student = db.query(User).filter(User.id == payload.studentId, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    state = _get_or_create_state(db)
    registration_settings = _decode_json(state.registration_settings_json, {}) or {}
    if not isinstance(registration_settings, dict):
        registration_settings = {}

    status_view = _get_track_state_for_user(state, student)
    if not status_view.policyFound:
        raise HTTPException(status_code=400, detail="لا توجد سياسة تشعيب لهذه الكلية")
    if not status_view.isBranchingOpen:
        raise HTTPException(status_code=400, detail="الطالب لم يصل إلى سنة التشعيب بعد")

    picked = _pick_track_by_input(status_view.tracks, payload.trackId)
    if not picked:
        raise HTTPException(status_code=400, detail="التخصص غير متاح لهذه الكلية")

    final_store = registration_settings.get("studentFinalTrackAssignments")
    if not isinstance(final_store, dict):
        final_store = {}
    final_store[str(student.id)] = {
        "trackId": str(picked.get("id") or "").strip(),
        "trackName": str(picked.get("name") or picked.get("id") or "").strip(),
        "assignedAt": datetime.now(timezone.utc).isoformat(),
    }
    registration_settings["studentFinalTrackAssignments"] = final_store

    # Keep legacy key synchronized for old UI consumers.
    legacy_store = registration_settings.get("studentTrackSelections")
    if not isinstance(legacy_store, dict):
        legacy_store = {}
    legacy_store[str(student.id)] = {
        "trackId": str(picked.get("id") or "").strip(),
        "trackName": str(picked.get("name") or picked.get("id") or "").strip(),
        "selectedAt": datetime.now(timezone.utc).isoformat(),
    }
    registration_settings["studentTrackSelections"] = legacy_store

    statuses = registration_settings.get("studentTrackCoordinationStatuses")
    if not isinstance(statuses, dict):
        statuses = {}
    statuses[str(student.id)] = "final_assigned"
    registration_settings["studentTrackCoordinationStatuses"] = statuses

    student.major = str(picked.get("name") or picked.get("id") or "").strip() or student.major

    state.registration_settings_json = json.dumps(registration_settings, ensure_ascii=False)
    state.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(state)
    db.refresh(student)
    return _get_track_state_for_user(state, student)


@router.post("/track-selection/admin/assign-by-gpa", dependencies=[Depends(require_role("admin"))])
async def assign_tracks_by_gpa(
    payload: TrackBulkGpaAssignmentRequest,
    db: Session = Depends(get_db),
):
    state = _get_or_create_state(db)
    registration_settings = _decode_json(state.registration_settings_json, {}) or {}
    if not isinstance(registration_settings, dict):
        registration_settings = {}

    students_query = db.query(User).filter(User.role == "student")
    students = students_query.all()
    college_filter = _normalize_text_key(payload.college)

    candidates: list[dict] = []
    for student in students:
        if college_filter and college_filter != _normalize_text_key(student.college):
            continue
        status_view = _get_track_state_for_user(state, student)
        if not status_view.policyFound or not status_view.isBranchingOpen:
            continue
        if status_view.coordinationStatus == "final_assigned":
            continue
        if not isinstance(status_view.tracks, list) or len(status_view.tracks) == 0:
            continue
        gpa = _calculate_student_gpa_from_state(state, student)
        candidates.append({"user": student, "status": status_view, "gpa": gpa})

    candidates.sort(key=lambda item: (-float(item.get("gpa") or 0.0), int(item["user"].id)))

    normalized_capacity = {}
    for key, value in (payload.capacities or {}).items():
        cap = int(value) if isinstance(value, int) or (isinstance(value, str) and str(value).isdigit()) else 0
        normalized_capacity[_normalize_text_key(key)] = max(cap, 0)

    final_store = registration_settings.get("studentFinalTrackAssignments")
    if not isinstance(final_store, dict):
        final_store = {}
    legacy_store = registration_settings.get("studentTrackSelections")
    if not isinstance(legacy_store, dict):
        legacy_store = {}
    statuses = registration_settings.get("studentTrackCoordinationStatuses")
    if not isinstance(statuses, dict):
        statuses = {}

    def _can_take(track_id: str) -> bool:
        if not normalized_capacity:
            return True
        key = _normalize_text_key(track_id)
        if key not in normalized_capacity:
            return True
        return normalized_capacity[key] > 0

    def _consume(track_id: str):
        if not normalized_capacity:
            return
        key = _normalize_text_key(track_id)
        if key in normalized_capacity and normalized_capacity[key] > 0:
            normalized_capacity[key] -= 1

    assigned_count = 0
    fallback_count = 0
    rows = []
    for item in candidates:
        student: User = item["user"]
        status_view: TrackSelectionStatusResponse = item["status"]

        pref_ids = []
        for pref in status_view.preferences or []:
            pref_id = str(pref.get("trackId") or "").strip()
            if pref_id and _normalize_text_key(pref_id) not in {_normalize_text_key(x) for x in pref_ids}:
                pref_ids.append(pref_id)

        picked = None
        picked_from_preference = False
        for pref_id in pref_ids:
            track = _pick_track_by_input(status_view.tracks, pref_id)
            if not track:
                continue
            track_id = str(track.get("id") or "").strip()
            if not track_id:
                continue
            if _can_take(track_id):
                picked = track
                picked_from_preference = True
                break

        if not picked:
            for track in status_view.tracks:
                track_id = str(track.get("id") or "").strip()
                if not track_id:
                    continue
                if _can_take(track_id):
                    picked = track
                    break

        if not picked and status_view.tracks:
            picked = status_view.tracks[0]

        if not picked:
            continue

        track_id = str(picked.get("id") or "").strip()
        track_name = str(picked.get("name") or picked.get("id") or "").strip()
        _consume(track_id)

        final_store[str(student.id)] = {
            "trackId": track_id,
            "trackName": track_name,
            "assignedAt": datetime.now(timezone.utc).isoformat(),
            "assignedBy": "gpa_bulk",
        }
        legacy_store[str(student.id)] = {
            "trackId": track_id,
            "trackName": track_name,
            "selectedAt": datetime.now(timezone.utc).isoformat(),
        }
        statuses[str(student.id)] = "final_assigned"
        student.major = track_name or student.major

        assigned_count += 1
        if not picked_from_preference:
            fallback_count += 1

        rows.append(
            {
                "studentId": student.id,
                "studentName": student.full_name,
                "studentCode": student.student_code,
                "gpa": item["gpa"],
                "assignedTrackId": track_id,
                "assignedTrackName": track_name,
                "assignedFromPreference": picked_from_preference,
            }
        )

    registration_settings["studentFinalTrackAssignments"] = final_store
    registration_settings["studentTrackSelections"] = legacy_store
    registration_settings["studentTrackCoordinationStatuses"] = statuses

    state.registration_settings_json = json.dumps(registration_settings, ensure_ascii=False)
    state.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(state)

    return {
        "ok": True,
        "candidates": len(candidates),
        "assigned": assigned_count,
        "fallbackAssigned": fallback_count,
        "items": rows,
    }


@router.patch("/track-selection/window", dependencies=[Depends(require_role("admin"))])
async def upsert_track_selection_window(
    payload: TrackSelectionWindowUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.endsAt <= payload.startsAt:
        raise HTTPException(status_code=400, detail="Invalid window interval")

    state = _get_or_create_state(db)
    registration_settings = _decode_json(state.registration_settings_json, {}) or {}
    if not isinstance(registration_settings, dict):
        registration_settings = {}

    window_payload = {
        "enabled": bool(payload.enabled),
        "startsAt": payload.startsAt.isoformat(),
        "endsAt": payload.endsAt.isoformat(),
    }
    policy_key = _normalize_text_key(payload.collegeKey)
    if policy_key:
        windows = registration_settings.get("trackSelectionWindows")
        if not isinstance(windows, dict):
            windows = {}
        windows[policy_key] = window_payload
        registration_settings["trackSelectionWindows"] = windows
    else:
        registration_settings["trackSelectionWindow"] = window_payload

    state.registration_settings_json = json.dumps(registration_settings, ensure_ascii=False)
    state.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}

