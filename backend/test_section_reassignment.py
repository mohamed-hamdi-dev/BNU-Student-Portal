import unittest
from unittest.mock import patch
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
from models.academic_core import (
    College,
    CourseCatalog,
    CourseOffering,
    RegistrationCourseSelection,
    RegistrationRequest,
    StudentAcademicProfile,
)
from models.user import User
_ACADEMIC_CORE_PATH = os.path.join(os.path.dirname(__file__), "routers", "academic_core.py")
_ACADEMIC_CORE_SPEC = importlib.util.spec_from_file_location("academic_core_router", _ACADEMIC_CORE_PATH)
academic_core_router = importlib.util.module_from_spec(_ACADEMIC_CORE_SPEC)
assert _ACADEMIC_CORE_SPEC and _ACADEMIC_CORE_SPEC.loader
_ACADEMIC_CORE_SPEC.loader.exec_module(academic_core_router)

_apply_registration_request_selections = academic_core_router._apply_registration_request_selections
_section_capacity_snapshot = academic_core_router._section_capacity_snapshot
_latest_registration_request = academic_core_router._latest_registration_request


class SectionReassignmentTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        self.db = self.SessionLocal()

        self.advisor = User(
            username="advisor1",
            email="advisor1@test.local",
            password_hash="x",
            full_name="Advisor",
            role="advisor",
            is_active=True,
        )
        self.student1 = User(
            username="student1",
            email="student1@test.local",
            password_hash="x",
            full_name="Student One",
            role="student",
            is_active=True,
        )
        self.student2 = User(
            username="student2",
            email="student2@test.local",
            password_hash="x",
            full_name="Student Two",
            role="student",
            is_active=True,
        )
        self.db.add_all([self.advisor, self.student1, self.student2])
        self.db.flush()

        self.college = College(code="ENG", name_ar="Engineering", name_en="Engineering", total_years=4, is_active=True)
        self.db.add(self.college)
        self.db.flush()

        self.course = CourseCatalog(
            code="BAS120",
            title_ar="Calculus",
            title_en="Calculus",
            college_id=self.college.id,
            study_year=1,
            semester="autumn",
            credit_hours=3,
            is_active=True,
        )
        self.db.add(self.course)
        self.db.flush()

        self.section_open = CourseOffering(
            course_id=self.course.id,
            academic_year_label="2025-2026",
            semester="autumn",
            section="G1",
            max_students=2,
            is_active=True,
        )
        self.section_full = CourseOffering(
            course_id=self.course.id,
            academic_year_label="2025-2026",
            semester="autumn",
            section="G2",
            max_students=1,
            is_active=True,
        )
        self.section_old = CourseOffering(
            course_id=self.course.id,
            academic_year_label="2025-2026",
            semester="autumn",
            section="G3",
            max_students=1,
            is_active=True,
        )
        self.db.add_all([self.section_open, self.section_full, self.section_old])
        self.db.flush()

        self.db.add_all(
            [
                StudentAcademicProfile(student_user_id=self.student1.id, college_id=self.college.id, current_study_year=1, gpa=3.0),
                StudentAcademicProfile(student_user_id=self.student2.id, college_id=self.college.id, current_study_year=1, gpa=3.0),
            ]
        )

        self.req_student1 = RegistrationRequest(
            student_user_id=self.student1.id,
            academic_year_label="2025-2026",
            semester="autumn",
            status="advisor_requested",
            created_by_user_id=self.advisor.id,
        )
        self.req_student2 = RegistrationRequest(
            student_user_id=self.student2.id,
            academic_year_label="2025-2026",
            semester="autumn",
            status="registered",
            created_by_user_id=self.advisor.id,
        )
        self.db.add_all([self.req_student1, self.req_student2])
        self.db.flush()

        self.db.add_all(
            [
                RegistrationCourseSelection(
                    registration_request_id=self.req_student1.id,
                    offering_id=self.section_old.id,
                    student_user_id=self.student1.id,
                    status="selected",
                ),
                RegistrationCourseSelection(
                    registration_request_id=self.req_student2.id,
                    offering_id=self.section_full.id,
                    student_user_id=self.student2.id,
                    status="selected",
                ),
            ]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _apply(self, request_row: RegistrationRequest, offering_ids: list[int]):
        with (
            patch.object(academic_core_router, "_calculate_effective_gpa", return_value=3.0),
            patch.object(academic_core_router, "_resolve_credit_limits", return_value=(0, 30)),
            patch.object(academic_core_router, "_build_passed_course_sets", return_value=(set(), {})),
            patch.object(academic_core_router, "_validate_prerequisites_for_course", return_value=None),
        ):
            return _apply_registration_request_selections(
                db=self.db,
                req=request_row,
                offering_ids=offering_ids,
                actor_user=self.advisor,
                actor_mode="test_reassign",
            )

    def test_section_below_capacity_is_open(self):
        snap = _section_capacity_snapshot(self.db, [self.section_open.id])
        self.assertEqual(snap[self.section_open.id]["section_status"], "OPEN")
        self.assertTrue(snap[self.section_open.id]["is_open"])

    def test_section_at_capacity_is_closed(self):
        snap = _section_capacity_snapshot(self.db, [self.section_full.id])
        self.assertEqual(snap[self.section_full.id]["current_students"], 1)
        self.assertEqual(snap[self.section_full.id]["section_status"], "CLOSED")
        self.assertFalse(snap[self.section_full.id]["is_open"])

    def test_advisor_can_move_student_to_open_section(self):
        self._apply(self.req_student1, [self.section_open.id])
        self.db.commit()

        rows = (
            self.db.query(RegistrationCourseSelection)
            .filter(RegistrationCourseSelection.registration_request_id == self.req_student1.id)
            .all()
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(int(rows[0].offering_id), int(self.section_open.id))

    def test_advisor_cannot_move_student_to_closed_full_section(self):
        with self.assertRaises(HTTPException) as exc:
            self._apply(self.req_student1, [self.section_full.id])
        msg = str(exc.exception.detail or "")
        self.assertIn("This section is full and cannot accept more students.", msg)
        self.assertIn("Only open sections can be assigned.", msg)

    def test_occupancies_update_correctly_after_reassignment(self):
        before = _section_capacity_snapshot(self.db, [self.section_old.id, self.section_open.id])
        self.assertEqual(before[self.section_old.id]["current_students"], 1)
        self.assertEqual(before[self.section_open.id]["current_students"], 0)

        self._apply(self.req_student1, [self.section_open.id])
        self.db.commit()

        after = _section_capacity_snapshot(self.db, [self.section_old.id, self.section_open.id])
        self.assertEqual(after[self.section_old.id]["current_students"], 0)
        self.assertEqual(after[self.section_open.id]["current_students"], 1)

    def test_status_changes_automatically_after_reassignment(self):
        # Move student1 to open section (G1): old section (G3) should become OPEN.
        self._apply(self.req_student1, [self.section_open.id])
        self.db.commit()

        # Add another student to G1 so it reaches capacity (2/2) and becomes CLOSED.
        req_student3 = RegistrationRequest(
            student_user_id=self.student2.id,
            academic_year_label="2025-2026",
            semester="autumn",
            status="advisor_requested",
            created_by_user_id=self.advisor.id,
        )
        self.db.add(req_student3)
        self.db.flush()
        self.db.add(
            RegistrationCourseSelection(
                registration_request_id=req_student3.id,
                offering_id=self.section_open.id,
                student_user_id=self.student2.id,
                status="selected",
            )
        )
        self.db.commit()

        snap = _section_capacity_snapshot(self.db, [self.section_old.id, self.section_open.id])
        self.assertEqual(snap[self.section_old.id]["section_status"], "OPEN")
        self.assertEqual(snap[self.section_open.id]["section_status"], "CLOSED")

    def test_latest_registration_request_is_used_for_same_term(self):
        older = RegistrationRequest(
            student_user_id=self.student1.id,
            academic_year_label="2025-2026",
            semester="autumn",
            status="need_info",
            created_by_user_id=self.advisor.id,
        )
        self.db.add(older)
        self.db.flush()

        latest = RegistrationRequest(
            student_user_id=self.student1.id,
            academic_year_label="2025-2026",
            semester="autumn",
            status="advisor_requested",
            created_by_user_id=self.advisor.id,
        )
        self.db.add(latest)
        self.db.commit()

        resolved = _latest_registration_request(
            self.db,
            student_user_id=self.student1.id,
            academic_year_label="2025-2026",
            semester="autumn",
        )
        self.assertIsNotNone(resolved)
        self.assertEqual(int(resolved.id), int(latest.id))


if __name__ == "__main__":
    unittest.main()
