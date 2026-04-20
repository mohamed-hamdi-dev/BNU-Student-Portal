from __future__ import annotations

from typing import Any


ELIGIBILITY_ALLOWED = "allowed"
ELIGIBILITY_ADVISOR_REQUIRED = "advisor_required"
ELIGIBILITY_ADMIN_OVERRIDE = "admin_override"
ELIGIBILITY_BLOCKED = "blocked"


def _read(source: Any, key: str, default: Any = None) -> Any:
    if isinstance(source, dict):
        return source.get(key, default)
    return getattr(source, key, default)


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def check_hard_blockers(student: Any, course: Any, context: Any, policy: Any) -> dict[str, Any]:
    reasons: list[str] = []
    additional_blockers = _read(context, "additional_blockers", []) or []
    reasons.extend([str(item).strip() for item in additional_blockers if str(item).strip()])

    if not _as_bool(_read(context, "prerequisites_satisfied", True)):
        prereq_reason = str(_read(context, "prerequisite_reason", "") or "").strip()
        reasons.append(prereq_reason or "Prerequisites are not satisfied")

    if _as_bool(_read(context, "already_passed", False)):
        reasons.append("Course was already passed")

    if _as_bool(_read(context, "already_registered_same_term", False)):
        reasons.append("Course is already registered in the same term")

    if not _as_bool(_read(context, "offered_this_term", True)):
        reasons.append("Course is not offered in the current term")

    strict_conflict_check = _as_bool(_read(policy, "strict_conflict_check", True))
    if strict_conflict_check and _as_bool(_read(context, "has_timetable_conflict", False)):
        conflict_reason = str(_read(context, "conflict_reason", "") or "").strip()
        reasons.append(conflict_reason or "Timetable conflict detected")

    blocked = len(reasons) > 0
    return {"blocked": blocked, "reasons": reasons}


def check_policy_rules(student: Any, course: Any, policy: Any) -> dict[str, Any]:
    failed_rules: list[str] = []
    student_gpa = _as_float(_read(student, "gpa", 0.0))
    min_gpa = _as_float(_read(policy, "min_gpa", 0.0))
    if student_gpa < min_gpa:
        failed_rules.append(f"GPA {student_gpa:.2f} is below minimum {min_gpa:.2f}")

    earned_hours = _as_float(_read(student, "earned_hours", 0.0))
    min_earned_hours = _as_float(_read(policy, "min_earned_hours", 0.0))
    if earned_hours < min_earned_hours:
        failed_rules.append(f"Earned hours {earned_hours:.0f} are below minimum {min_earned_hours:.0f}")

    current_year = _as_int(_read(student, "current_year", 0))
    course_year = _as_int(_read(course, "year", current_year))
    max_year_jump = max(_as_int(_read(policy, "max_year_jump", 0)), 0)
    year_jump = max(course_year - current_year, 0)
    if year_jump > max_year_jump:
        failed_rules.append(f"Year jump {year_jump} exceeds allowed max {max_year_jump}")

    return {"passed": len(failed_rules) == 0, "failed_rules": failed_rules}


def evaluate_course_eligibility(student: Any, course: Any, context: Any, policy: Any) -> dict[str, Any]:
    hard = check_hard_blockers(student, course, context, policy)
    if hard["blocked"]:
        return {
            "status": ELIGIBILITY_BLOCKED,
            "reasons": hard["reasons"],
            "warnings": [],
        }

    reasons: list[str] = []
    warnings: list[str] = []
    current_year = _as_int(_read(student, "current_year", 0))
    course_year = _as_int(_read(course, "year", current_year))
    projected_total_credits = _as_float(_read(context, "projected_total_credits", 0.0))
    max_credits_normal = _as_float(_read(policy, "max_credits_normal", 18))
    max_credits_overload = _as_float(_read(policy, "max_credits_overload", max_credits_normal))

    if projected_total_credits > max_credits_overload > 0:
        return {
            "status": ELIGIBILITY_BLOCKED,
            "reasons": [
                f"Projected credits {projected_total_credits:g} exceed overload cap {max_credits_overload:g}"
            ],
            "warnings": [],
        }

    if course_year <= current_year:
        if projected_total_credits > max_credits_normal > 0:
            warnings.append(
                f"Projected credits {projected_total_credits:g} exceed normal load {max_credits_normal:g}"
            )
            return {
                "status": ELIGIBILITY_ADVISOR_REQUIRED,
                "reasons": ["Overload requires advisor approval"],
                "warnings": warnings,
            }
        return {"status": ELIGIBILITY_ALLOWED, "reasons": reasons, "warnings": warnings}

    if not _as_bool(_read(policy, "allow_higher_year", True)):
        return {
            "status": ELIGIBILITY_BLOCKED,
            "reasons": ["Higher-year courses are disabled by policy"],
            "warnings": warnings,
        }

    policy_check = check_policy_rules(student, course, policy)
    if policy_check["passed"]:
        reasons.append("Higher-year course requires advisor approval")
        if projected_total_credits > max_credits_normal > 0:
            warnings.append(
                f"Projected credits {projected_total_credits:g} exceed normal load {max_credits_normal:g}"
            )
        return {
            "status": ELIGIBILITY_ADVISOR_REQUIRED,
            "reasons": reasons,
            "warnings": warnings,
        }

    if _as_bool(_read(policy, "allow_admin_override", True)):
        reasons.extend(policy_check["failed_rules"])
        reasons.append("Admin override is required for this higher-year exception")
        if projected_total_credits > max_credits_normal > 0:
            warnings.append(
                f"Projected credits {projected_total_credits:g} exceed normal load {max_credits_normal:g}"
            )
        return {
            "status": ELIGIBILITY_ADMIN_OVERRIDE,
            "reasons": reasons,
            "warnings": warnings,
        }

    return {
        "status": ELIGIBILITY_BLOCKED,
        "reasons": policy_check["failed_rules"] or ["Higher-year policy requirements were not met"],
        "warnings": warnings,
    }
