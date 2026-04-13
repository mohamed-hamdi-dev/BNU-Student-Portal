import unittest
import os
import sys
import types
import importlib.util

sys.path.append(os.path.dirname(__file__))

try:
    import jwt  # type: ignore  # noqa: F401
except ModuleNotFoundError:
    fake_jwt = types.ModuleType("jwt")

    class _FakePyJWTError(Exception):
        pass

    fake_jwt.PyJWTError = _FakePyJWTError
    fake_jwt.encode = lambda payload, key, algorithm=None: "fake-token"
    fake_jwt.decode = lambda token, key, algorithms=None: {"sub": 1}
    sys.modules["jwt"] = fake_jwt

try:
    from passlib.context import CryptContext  # type: ignore  # noqa: F401
except ModuleNotFoundError:
    fake_passlib = types.ModuleType("passlib")
    fake_passlib_context = types.ModuleType("passlib.context")

    class _FakeCryptContext:
        def __init__(self, *args, **kwargs):
            pass

        def hash(self, value):
            return f"hashed:{value}"

        def verify(self, plain, hashed):
            return hashed == f"hashed:{plain}"

    fake_passlib_context.CryptContext = _FakeCryptContext
    fake_passlib.context = fake_passlib_context
    sys.modules["passlib"] = fake_passlib
    sys.modules["passlib.context"] = fake_passlib_context

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.database import Base
from models.academic_core import College, CourseCatalog, CourseOffering

_ACADEMIC_CORE_PATH = os.path.join(os.path.dirname(__file__), "routers", "academic_core.py")
_ACADEMIC_CORE_SPEC = importlib.util.spec_from_file_location("academic_core_router", _ACADEMIC_CORE_PATH)
academic_core_router = importlib.util.module_from_spec(_ACADEMIC_CORE_SPEC)
assert _ACADEMIC_CORE_SPEC and _ACADEMIC_CORE_SPEC.loader
_ACADEMIC_CORE_SPEC.loader.exec_module(academic_core_router)

_resolve_offering_payload = academic_core_router._resolve_offering_payload
_validate_offering_schedule_conflicts = academic_core_router._validate_offering_schedule_conflicts


class OfferingScheduleConflictTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        self.db = self.SessionLocal()

        self.college = College(code="CS", name_ar="علوم الحاسب", name_en="CS", total_years=4, is_active=True)
        self.db.add(self.college)
        self.db.flush()

        self.course_a = CourseCatalog(
            code="BAS120",
            title_ar="Calculus",
            title_en="Calculus",
            college_id=self.college.id,
            study_year=1,
            semester="autumn",
            credit_hours=3,
            is_active=True,
        )
        self.course_b = CourseCatalog(
            code="BAS121",
            title_ar="Physics",
            title_en="Physics",
            college_id=self.college.id,
            study_year=1,
            semester="autumn",
            credit_hours=3,
            is_active=True,
        )
        self.db.add_all([self.course_a, self.course_b])
        self.db.flush()

        self.existing = CourseOffering(
            course_id=self.course_a.id,
            academic_year_label="2025-2026",
            semester="autumn",
            section="G1",
            target_group_id="G1",
            target_group_name="Group 1",
            day_of_week="السبت",
            start_time="08:00",
            end_time="10:00",
            room_name="Lab 1",
            instructor_user_id=100,
            max_students=40,
            is_active=True,
        )
        self.db.add(self.existing)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _validate_payload(self, payload: dict):
        resolved = _resolve_offering_payload(None, payload)
        _validate_offering_schedule_conflicts(self.db, resolved, self.course_b)

    def test_same_year_different_group_allowed(self):
        payload = {
            "course_id": self.course_b.id,
            "academic_year_label": "2025-2026",
            "semester": "autumn",
            "section": "G2",
            "target_group_id": "G2",
            "target_group_name": "Group 2",
            "day_of_week": "السبت",
            "start_time": "08:00",
            "end_time": "10:00",
            "room_name": "Lab 2",
            "instructor_user_id": 200,
            "max_students": 40,
            "is_active": True,
        }
        self._validate_payload(payload)

    def test_same_group_overlapping_time_blocked(self):
        payload = {
            "course_id": self.course_b.id,
            "academic_year_label": "2025-2026",
            "semester": "autumn",
            "section": "G2",
            "target_group_id": "G1",
            "target_group_name": "Group 1",
            "day_of_week": "السبت",
            "start_time": "09:00",
            "end_time": "11:00",
            "room_name": "Lab 2",
            "instructor_user_id": 200,
            "max_students": 40,
            "is_active": True,
        }
        with self.assertRaises(HTTPException) as exc:
            self._validate_payload(payload)
        self.assertIn("This student group already has another section at this time.", str(exc.exception.detail))

    def test_same_room_overlapping_time_blocked(self):
        payload = {
            "course_id": self.course_b.id,
            "academic_year_label": "2025-2026",
            "semester": "autumn",
            "section": "G2",
            "target_group_id": "G2",
            "target_group_name": "Group 2",
            "day_of_week": "السبت",
            "start_time": "09:00",
            "end_time": "11:00",
            "room_name": "Lab 1",
            "instructor_user_id": 200,
            "max_students": 40,
            "is_active": True,
        }
        with self.assertRaises(HTTPException) as exc:
            self._validate_payload(payload)
        self.assertIn("This room is already occupied at this time.", str(exc.exception.detail))

    def test_same_instructor_overlapping_time_blocked(self):
        payload = {
            "course_id": self.course_b.id,
            "academic_year_label": "2025-2026",
            "semester": "autumn",
            "section": "G2",
            "target_group_id": "G2",
            "target_group_name": "Group 2",
            "day_of_week": "السبت",
            "start_time": "09:00",
            "end_time": "11:00",
            "room_name": "Lab 2",
            "instructor_user_id": 100,
            "max_students": 40,
            "is_active": True,
        }
        with self.assertRaises(HTTPException) as exc:
            self._validate_payload(payload)
        self.assertIn("This instructor already has a class at this time.", str(exc.exception.detail))

    def test_different_group_room_instructor_allowed(self):
        payload = {
            "course_id": self.course_b.id,
            "academic_year_label": "2025-2026",
            "semester": "autumn",
            "section": "G2",
            "target_group_id": "G2",
            "target_group_name": "Group 2",
            "day_of_week": "السبت",
            "start_time": "08:00",
            "end_time": "10:00",
            "room_name": "Lab 9",
            "instructor_user_id": 909,
            "max_students": 40,
            "is_active": True,
        }
        self._validate_payload(payload)


if __name__ == "__main__":
    unittest.main()
