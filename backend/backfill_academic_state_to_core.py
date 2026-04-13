import json

from core.database import SessionLocal
from models.academic import AcademicState
from models.academic_core import College, CourseOffering, StudentAcademicProfile
from models.user import User
from routers.academic import (
    _normalize_college_alias_set,
    _resolve_sync_academic_year_label,
    _sync_core_offerings_from_admin_courses,
)


def _resolve_college_id(db, user: User | None) -> int | None:
    if not user:
        return None

    lookup = {}
    for college in db.query(College).all():
        keys = set()
        keys.update(_normalize_college_alias_set(college.code))
        keys.update(_normalize_college_alias_set(college.name_en))
        keys.update(_normalize_college_alias_set(college.name_ar))
        for key in keys:
            lookup[key] = college.id

    user_keys = set()
    user_keys.update(_normalize_college_alias_set(user.college))
    user_keys.update(_normalize_college_alias_set(user.major))
    for key in user_keys:
        if key in lookup:
            return lookup[key]
    return None


def main() -> None:
    db = SessionLocal()
    try:
        state = db.query(AcademicState).filter(AcademicState.id == 1).first()
        if not state:
            raise SystemExit("AcademicState row #1 was not found.")

        courses_payload = json.loads(state.courses_json or "[]")
        registration_settings = json.loads(state.registration_settings_json or "{}")
        academic_year_label = _resolve_sync_academic_year_label(db, registration_settings)

        before_count = db.query(CourseOffering).count()
        _sync_core_offerings_from_admin_courses(
            db=db,
            courses_payload=courses_payload if isinstance(courses_payload, list) else [],
            academic_year_label=academic_year_label,
        )

        profile_updates = 0
        profiles = db.query(StudentAcademicProfile).all()
        for profile in profiles:
            if profile.college_id:
                continue
            user = db.query(User).filter(User.id == profile.student_user_id).first()
            college_id = _resolve_college_id(db, user)
            if college_id:
                profile.college_id = college_id
                profile_updates += 1

        db.commit()

        after_count = db.query(CourseOffering).count()
        print(
            json.dumps(
                {
                    "academic_year_label": academic_year_label,
                    "course_offerings_before": before_count,
                    "course_offerings_after": after_count,
                    "course_offerings_added": max(0, after_count - before_count),
                    "student_profiles_college_backfilled": profile_updates,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
