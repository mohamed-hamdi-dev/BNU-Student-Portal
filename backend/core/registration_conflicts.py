from __future__ import annotations

from typing import Any


def _normalize_day(value: Any) -> str:
    return str(value or "").strip().lower()


def _parse_time_to_minutes(value: Any) -> int | None:
    raw = str(value or "").strip()
    if not raw or ":" not in raw:
        return None
    try:
        hours_text, minutes_text = raw.split(":", 1)
        hours = int(hours_text)
        minutes = int(minutes_text)
    except Exception:
        return None
    if hours < 0 or hours > 23 or minutes < 0 or minutes > 59:
        return None
    return hours * 60 + minutes


def _format_time_range(start: Any, end: Any) -> str:
    start_text = str(start or "").strip() or "--:--"
    end_text = str(end or "").strip() or "--:--"
    return f"{start_text} - {end_text}"


def _has_overlap(a: dict[str, Any], b: dict[str, Any]) -> bool:
    a_day = _normalize_day(a.get("day"))
    b_day = _normalize_day(b.get("day"))
    if not a_day or not b_day or a_day != b_day:
        return False

    a_start = _parse_time_to_minutes(a.get("start_time"))
    a_end = _parse_time_to_minutes(a.get("end_time"))
    b_start = _parse_time_to_minutes(b.get("start_time"))
    b_end = _parse_time_to_minutes(b.get("end_time"))
    if None in {a_start, a_end, b_start, b_end}:
        return False
    return a_start < b_end and b_start < a_end


def _extract_sessions(item: dict[str, Any]) -> list[dict[str, Any]]:
    explicit = item.get("sessions")
    sessions: list[dict[str, Any]] = []
    if isinstance(explicit, list):
        for session in explicit:
            if not isinstance(session, dict):
                continue
            day = session.get("day") or session.get("day_of_week")
            start_time = session.get("start_time")
            end_time = session.get("end_time")
            if not day or not start_time or not end_time:
                continue
            sessions.append(
                {
                    "day": day,
                    "start_time": start_time,
                    "end_time": end_time,
                    "type": str(session.get("type") or session.get("session_type") or "lecture"),
                }
            )
    if sessions:
        return sessions

    day = item.get("day_of_week")
    start_time = item.get("start_time")
    end_time = item.get("end_time")
    if day and start_time and end_time:
        return [
            {
                "day": day,
                "start_time": start_time,
                "end_time": end_time,
                "type": str(item.get("session_type") or "lecture"),
            }
        ]
    return []


def _conflict_payload(current_item: dict[str, Any], current_session: dict[str, Any], other_item: dict[str, Any], other_session: dict[str, Any]) -> dict[str, Any]:
    current_type = str(current_session.get("type") or current_session.get("session_type") or "lecture").strip().lower()
    conflicting_type = str(other_session.get("type") or other_session.get("session_type") or "lecture").strip().lower()
    start_time = current_session.get("start_time") or other_session.get("start_time")
    end_time = current_session.get("end_time") or other_session.get("end_time")
    return {
        "current_course": str(current_item.get("course_code") or current_item.get("course_title_ar") or "—"),
        "current_section": str(current_item.get("section") or "—"),
        "conflicting_course": str(other_item.get("course_code") or other_item.get("course_title_ar") or "—"),
        "conflicting_section": str(other_item.get("section") or "—"),
        "day": str(current_session.get("day") or other_session.get("day") or "—"),
        "start_time": str(start_time or "").strip(),
        "end_time": str(end_time or "").strip(),
        "time": _format_time_range(start_time, end_time),
        "current_type": current_type,
        "conflicting_type": conflicting_type,
        "type": current_type,
    }


def validate_schedule_conflicts(
    *,
    student_id: int | str,
    term_id: str,
    selected_offerings: list[dict[str, Any]],
    existing_active_selections: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Backend-authoritative schedule conflict detection.

    The payload is intentionally session-oriented so the function is already
    prepared for multiple sessions per offering in future schema updates.
    """
    _ = (student_id, term_id)
    normalized_selected = [item for item in (selected_offerings or []) if isinstance(item, dict)]
    normalized_existing = [item for item in (existing_active_selections or []) if isinstance(item, dict)]
    conflicts: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, ...]] = set()

    for index, current in enumerate(normalized_selected):
        current_sessions = _extract_sessions(current)
        if not current_sessions:
            continue

        # Check conflict within the current selection batch.
        for other in normalized_selected[index + 1 :]:
            other_sessions = _extract_sessions(other)
            if not other_sessions:
                continue
            for current_session in current_sessions:
                for other_session in other_sessions:
                    if not _has_overlap(current_session, other_session):
                        continue
                    payload = _conflict_payload(current, current_session, other, other_session)
                    key = tuple(str(payload.get(field) or "") for field in ["current_course", "current_section", "conflicting_course", "conflicting_section", "day", "time", "type"])
                    reverse_key = tuple(str(payload.get(field) or "") for field in ["conflicting_course", "conflicting_section", "current_course", "current_section", "day", "time", "type"])
                    if key in seen_keys or reverse_key in seen_keys:
                        continue
                    seen_keys.add(key)
                    conflicts.append(payload)

        # Check conflict against existing active selections.
        for existing in normalized_existing:
            existing_sessions = _extract_sessions(existing)
            if not existing_sessions:
                continue
            for current_session in current_sessions:
                for existing_session in existing_sessions:
                    if not _has_overlap(current_session, existing_session):
                        continue
                    payload = _conflict_payload(current, current_session, existing, existing_session)
                    key = tuple(str(payload.get(field) or "") for field in ["current_course", "current_section", "conflicting_course", "conflicting_section", "day", "time", "type"])
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    conflicts.append(payload)

    return conflicts
