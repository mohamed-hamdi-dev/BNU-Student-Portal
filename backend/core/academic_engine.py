from sqlalchemy.orm import Session
from sqlalchemy import select, and_

from models.academic_core import (
    StudentAcademicProfile,
    CurriculumPlan,
    ProgramRegulation,
    CourseCatalog,
    CourseOffering,
    CoursePrerequisite,
    GradeBook,
    RegistrationWindow,
    CollegeTrack
)
from schemas.academic_core import (
    StudentEligibilityResponse,
    AllowedCreditHours,
    EvaluatedCourse
)

class AcademicRegulationsEngine:
    def __init__(self, db: Session):
        self.db = db

    def evaluate_student_eligibility(self, student_user_id: int) -> dict:
        # 1) Get Student Profile
        stmt_profile = select(StudentAcademicProfile).where(StudentAcademicProfile.student_user_id == student_user_id)
        profile = self.db.execute(stmt_profile).scalar_one_or_none()
        
        if not profile:
            return self._error_response(student_user_id, "Student Profile not found.")

        # 2) Get active Registration Window (for the current_term)
        # We will assume the most recently created active window for now
        stmt_window = select(RegistrationWindow).where(RegistrationWindow.is_active == True).order_by(RegistrationWindow.id.desc())
        window = self.db.execute(stmt_window).scalar_one_or_none()
        
        if not window:
            return self._error_response(student_user_id, "No active registration window found.")
            
        current_term = f"{window.academic_year_label} ({window.semester})"

        # 3) Get Curriculum Plan & Regulations
        # We find the plan matching the student's college and batch year
        stmt_plan = select(CurriculumPlan).where(
            and_(
                CurriculumPlan.college_id == profile.college_id,
                CurriculumPlan.batch_year == profile.entry_batch_year
            )
        )
        plan = self.db.execute(stmt_plan).scalar_one_or_none()
        
        if not plan:
            return self._error_response(student_user_id, "No matching curriculum plan found for the student's batch.")
            
        stmt_reg = select(ProgramRegulation).where(ProgramRegulation.plan_id == plan.id)
        regulation = self.db.execute(stmt_reg).scalar_one_or_none()
        
        if not regulation:
            return self._error_response(student_user_id, "No regulations defined for the student's curriculum plan.")

        # 4) Get Prior Grades (to know passed courses)
        stmt_grades = select(GradeBook).where(
            and_(
                GradeBook.student_user_id == student_user_id,
                GradeBook.publish_status == "published"
            )
        )
        grades = self.db.execute(stmt_grades).scalars().all()
        
        # Determine passed courses and completed credits
        # Assuming grade != 'F' and total >= 50 means passed. 
        # (A mapping could be more precise, but this serves standard rules)
        passed_course_ids = set()
        failed_course_ids = set()
        completed_credits = 0.0
        
        for g in grades:
            # Course ID is accessed through offering. But if we need it fast, 
            # we should join. For now, lazy loading might trigger, but let's query smartly.
            pass  # We will do a smarter join query instead to get course_ids

        # Smarter Query for passed courses
        # Join GradeBook -> CourseOffering -> CourseCatalog
        stmt_course_grades = select(GradeBook, CourseCatalog.id, CourseCatalog.credit_hours, GradeBook.total, GradeBook.grade).join(
            CourseOffering, GradeBook.offering_id == CourseOffering.id
        ).join(
            CourseCatalog, CourseOffering.course_id == CourseCatalog.id
        ).where(
            and_(
                GradeBook.student_user_id == student_user_id,
                GradeBook.publish_status == "published"
            )
        )
        
        course_grade_results = self.db.execute(stmt_course_grades).all()
        
        passed_course_ids = set()
        completed_credits = 0.0
        
        for record in course_grade_results:
            catalog_course_id = record[1]
            credit_hours = record[2]
            total_marks = record[3]
            letter_grade = record[4]
            
            # Simple pass check:
            if letter_grade and letter_grade.upper() not in ('F', 'FA', 'DN'):
                if catalog_course_id not in passed_course_ids:
                    passed_course_ids.add(catalog_course_id)
                    completed_credits += credit_hours
            elif total_marks and total_marks >= 50.0:
                if catalog_course_id not in passed_course_ids:
                    passed_course_ids.add(catalog_course_id)
                    completed_credits += credit_hours

        # 5) Determine Allowed Credit Hours based on GPA and Regulations
        warnings = []
        is_under_warning = profile.gpa < regulation.warning_gpa_threshold and profile.gpa > 0
        min_credits = regulation.min_credits_per_semester
        
        if is_under_warning:
            max_credits = regulation.max_credits_under_warning
            warnings.append(f"Student is under academic warning (GPA: {profile.gpa} < {regulation.warning_gpa_threshold}). Max credits restricted to {max_credits}.")
        else:
            max_credits = regulation.max_credits_per_semester

        # 6) Evaluate all published CourseOfferings for the current window
        stmt_offerings = select(CourseOffering, CourseCatalog).join(
            CourseCatalog, CourseOffering.course_id == CourseCatalog.id
        ).where(
            and_(
                CourseOffering.academic_year_label == window.academic_year_label,
                CourseOffering.semester == window.semester,
                CourseOffering.is_active == True,
                # Course should belong to the student's plan/college
                CourseCatalog.is_active == True
            )
        )
        offerings_results = self.db.execute(stmt_offerings).all()

        eligible_courses = []
        blocked_courses = []

        seen_catalog_ids = set()

        for offering, catalog in offerings_results:
            # We only evaluate unique catalog courses even if offered in multiple sections
            if catalog.id in seen_catalog_ids:
                continue
            seen_catalog_ids.add(catalog.id)
            
            course_code = catalog.code
            course_name = catalog.title_ar

            # Rule A: Is it in the student's plan? 
            # (assuming plan_id must match OR it's a shared course)
            if catalog.plan_id != plan.id and not catalog.is_shared:
                blocked_courses.append(EvaluatedCourse(
                    course_code=course_code,
                    course_name=course_name,
                    reason="Course not part of the student's curriculum plan."
                ))
                continue
                
            # Rule B: Did the student already pass it?
            if catalog.id in passed_course_ids:
                blocked_courses.append(EvaluatedCourse(
                    course_code=course_code,
                    course_name=course_name,
                    reason="Student has already passed this course."
                ))
                continue

            # Rule C: Prerequisites
            stmt_prereqs = select(CoursePrerequisite).where(CoursePrerequisite.course_id == catalog.id)
            prereqs = self.db.execute(stmt_prereqs).scalars().all()
            
            missing_prereqs = []
            for prereq in prereqs:
                if prereq.condition_type == "pass":
                    if prereq.prerequisite_course_id not in passed_course_ids:
                        # Find prerequisite code just for the message
                        stmt_pc = select(CourseCatalog).where(CourseCatalog.id == prereq.prerequisite_course_id)
                        pc = self.db.execute(stmt_pc).scalar_one_or_none()
                        missing_prereqs.append(pc.code if pc else str(prereq.prerequisite_course_id))

            if missing_prereqs:
                blocked_courses.append(EvaluatedCourse(
                    course_code=course_code,
                    course_name=course_name,
                    reason=f"Missing prerequisites: {', '.join(missing_prereqs)}"
                ))
                continue

            # Rule D: Field Training / Graduation Project hours restriction
            # For this example, let's identify them textually or via a standard code prefix
            # E.g., if code starts with TRN or PRJ
            if "TRN" in course_code.upper() or "TRAIN" in course_name.upper():
                if completed_credits < regulation.field_training_min_credits:
                    blocked_courses.append(EvaluatedCourse(
                        course_code=course_code,
                        course_name=course_name,
                        reason=f"Field training requires {regulation.field_training_min_credits} credits. Student has {completed_credits}."
                    ))
                    continue
                    
            if "PRJ" in course_code.upper() or "GRAD" in course_name.upper():
                if completed_credits < regulation.graduation_project_min_credits:
                    blocked_courses.append(EvaluatedCourse(
                        course_code=course_code,
                        course_name=course_name,
                        reason=f"Graduation project requires {regulation.graduation_project_min_credits} credits. Student has {completed_credits}."
                    ))
                    continue

            # If all passed
            eligible_courses.append(EvaluatedCourse(
                course_code=course_code,
                course_name=course_name,
                reason="All prerequisites and academic rules satisfied."
            ))

        # Format Response
        program_name = plan.title
        
        # Build explanation
        decision_exp = "Evaluation Complete. "
        if is_under_warning:
            decision_exp += "Student is restricted due to academic warning. "
        decision_exp += f"{len(eligible_courses)} courses eligible for registration for {current_term}."

        response = StudentEligibilityResponse(
            student_id=student_user_id,
            program=program_name,
            regulation_year=str(plan.batch_year),
            current_term=current_term,
            current_gpa=float(profile.gpa),
            completed_credits=float(completed_credits),
            allowed_credit_hours=AllowedCreditHours(min=min_credits, max=max_credits),
            eligible_courses=eligible_courses,
            blocked_courses=blocked_courses,
            warnings=warnings,
            decision_explanation=decision_exp
        )

        return response.model_dump()

    def _error_response(self, student_id: int, reason: str) -> dict:
        return {
            "student_id": student_id,
            "program": "Unknown",
            "regulation_year": "Unknown",
            "current_term": "Unknown",
            "current_gpa": 0.0,
            "completed_credits": 0,
            "allowed_credit_hours": {
                "min": 0,
                "max": 0
            },
            "eligible_courses": [],
            "blocked_courses": [],
            "warnings": [reason],
            "decision_explanation": "Cannot determine eligibility due to missing core data."
        }
