from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class College(Base):
    __tablename__ = "ac_colleges"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name_ar = Column(String(255), nullable=False)
    name_en = Column(String(255), nullable=True)
    total_years = Column(Integer, nullable=False, default=4)
    branching_start_year = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class CollegeTrack(Base):
    __tablename__ = "ac_college_tracks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(50), nullable=False, index=True)
    name_ar = Column(String(255), nullable=False)
    name_en = Column(String(255), nullable=True)
    starts_at_year = Column(Integer, nullable=True)
    capacity = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    college = relationship("College")


class CurriculumPlan(Base):
    __tablename__ = "ac_curriculum_plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_year = Column(Integer, nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    title = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    college = relationship("College")


class CourseCatalog(Base):
    __tablename__ = "ac_course_catalog"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(50), nullable=False, index=True)
    title_ar = Column(String(255), nullable=False)
    title_en = Column(String(255), nullable=True)

    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="SET NULL"), nullable=True, index=True)
    track_id = Column(Integer, ForeignKey("ac_college_tracks.id", ondelete="SET NULL"), nullable=True, index=True)
    plan_id = Column(Integer, ForeignKey("ac_curriculum_plans.id", ondelete="SET NULL"), nullable=True, index=True)
    study_year = Column(Integer, nullable=True, index=True)
    semester = Column(String(20), nullable=True, index=True)  # autumn/spring/summer

    credit_hours = Column(Float, nullable=False, default=0.0)
    lecture_hours = Column(Float, nullable=False, default=0.0)
    lab_hours = Column(Float, nullable=False, default=0.0)

    max_mid1 = Column(Float, nullable=False, default=0.0)
    max_mid2 = Column(Float, nullable=False, default=0.0)
    max_coursework = Column(Float, nullable=False, default=0.0)
    max_final = Column(Float, nullable=False, default=0.0)
    max_total = Column(Float, nullable=False, default=0.0)
    assessment_template_id = Column(Integer, ForeignKey("ac_assessment_templates.id", ondelete="SET NULL"), nullable=True, index=True)
    allow_assessment_override = Column(Boolean, nullable=False, default=False)
    assessment_override_components_json = Column(Text, nullable=False, default="[]")
    pass_mark = Column(Float, nullable=True)
    grading_scale_id = Column(Integer, ForeignKey("ac_grading_scales.id", ondelete="SET NULL"), nullable=True, index=True)

    is_shared = Column(Boolean, nullable=False, default=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    college = relationship("College")
    track = relationship("CollegeTrack")
    plan = relationship("CurriculumPlan")


class CourseOffering(Base):
    __tablename__ = "ac_course_offerings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("ac_course_catalog.id", ondelete="CASCADE"), nullable=False, index=True)
    academic_year_label = Column(String(30), nullable=False, index=True)  # 2025-2026
    semester = Column(String(20), nullable=False, index=True)
    section = Column(String(50), nullable=False, default="A", index=True)
    target_group_id = Column(String(100), nullable=True, index=True)
    target_group_name = Column(String(255), nullable=True)
    day_of_week = Column(String(20), nullable=True, index=True)
    start_time = Column(String(5), nullable=True)
    end_time = Column(String(5), nullable=True)
    room_name = Column(String(100), nullable=True, index=True)
    instructor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    max_students = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    course = relationship("CourseCatalog")


class StudentAcademicProfile(Base):
    __tablename__ = "ac_student_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="SET NULL"), nullable=True, index=True)
    entry_batch_year = Column(Integer, nullable=True, index=True)
    current_study_year = Column(Integer, nullable=False, default=1)
    current_track_id = Column(Integer, ForeignKey("ac_college_tracks.id", ondelete="SET NULL"), nullable=True, index=True)
    advisor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    gpa = Column(Float, nullable=False, default=0.0)
    passed_hours = Column(Float, nullable=False, default=0.0)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    college = relationship("College", foreign_keys=[college_id])
    track = relationship("CollegeTrack", foreign_keys=[current_track_id])


class StudentFinanceStatus(Base):
    __tablename__ = "ac_student_finance_status"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    status = Column(String(30), nullable=False, default="pending", index=True)  # pending/cleared/blocked
    cleared_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    cleared_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class RegistrationWindow(Base):
    __tablename__ = "ac_registration_windows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="SET NULL"), nullable=True, index=True)
    academic_year_label = Column(String(30), nullable=False, index=True)
    semester = Column(String(20), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="OPEN", index=True)  # OPEN/CLOSED/PENDING_REVIEW/APPROVED/LOCKED
    starts_at = Column(DateTime(timezone=True), nullable=False)
    ends_at = Column(DateTime(timezone=True), nullable=False)
    open_at = Column(DateTime(timezone=True), nullable=True)
    close_at = Column(DateTime(timezone=True), nullable=True)
    allows_self_registration = Column(Boolean, nullable=False, default=True)
    allows_advisor_registration = Column(Boolean, nullable=False, default=True)
    requires_financial_clearance = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    college = relationship("College")


class RegistrationRequest(Base):
    __tablename__ = "ac_registration_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    academic_year_label = Column(String(30), nullable=False, index=True)
    semester = Column(String(20), nullable=False, index=True)
    status = Column(String(30), nullable=False, default="draft", index=True)  # draft/submitted/advisor_approved/locked
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    advisor_approved_at = Column(DateTime(timezone=True), nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    advisor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    requested_note = Column(Text, nullable=True)
    advisor_note = Column(Text, nullable=True)
    requested_at = Column(DateTime(timezone=True), nullable=True, index=True)
    handled_at = Column(DateTime(timezone=True), nullable=True, index=True)
    processed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    submitted_via = Column(String(20), nullable=False, default="self", index=True)  # self/advisor
    is_after_window = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class RegistrationCourseSelection(Base):
    __tablename__ = "ac_registration_selections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    registration_request_id = Column(Integer, ForeignKey("ac_registration_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    offering_id = Column(Integer, ForeignKey("ac_course_offerings.id", ondelete="CASCADE"), nullable=False, index=True)
    student_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="selected", index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    request = relationship("RegistrationRequest")
    offering = relationship("CourseOffering")


class GradeBook(Base):
    __tablename__ = "ac_gradebook"

    id = Column(Integer, primary_key=True, autoincrement=True)
    selection_id = Column(Integer, ForeignKey("ac_registration_selections.id", ondelete="CASCADE"), nullable=False, index=True)
    student_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    offering_id = Column(Integer, ForeignKey("ac_course_offerings.id", ondelete="CASCADE"), nullable=False, index=True)
    mid1 = Column(Float, nullable=True)
    mid2 = Column(Float, nullable=True)
    coursework = Column(Float, nullable=True)
    final = Column(Float, nullable=True)
    component_scores_json = Column(Text, nullable=False, default="{}")
    total = Column(Float, nullable=True)
    grade = Column(String(20), nullable=True)
    import_cycle = Column(String(20), nullable=True, index=True)  # mid1/mid2/coursework/final
    publish_status = Column(String(20), nullable=False, default="draft", index=True)  # draft/reviewed/published
    last_updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    selection = relationship("RegistrationCourseSelection")
    offering = relationship("CourseOffering")


class GradeImportBatch(Base):
    __tablename__ = "ac_grade_import_batches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    offering_id = Column(Integer, ForeignKey("ac_course_offerings.id", ondelete="CASCADE"), nullable=False, index=True)
    import_cycle = Column(String(20), nullable=False, index=True)
    source_file_name = Column(String(255), nullable=True)
    valid_count = Column(Integer, nullable=False, default=0)
    error_count = Column(Integer, nullable=False, default=0)
    errors_json = Column(Text, nullable=False, default="[]")
    status = Column(String(20), nullable=False, default="preview", index=True)  # preview/confirmed/rolled_back
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    offering = relationship("CourseOffering")


class AcademicAuditLog(Base):
    __tablename__ = "ac_audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(String(100), nullable=False, index=True)
    action = Column(String(100), nullable=False, index=True)
    before_json = Column(Text, nullable=True)
    after_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)


class CoursePrerequisite(Base):
    __tablename__ = "ac_course_prerequisites"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("ac_course_catalog.id", ondelete="CASCADE"), nullable=False, index=True)
    prerequisite_course_id = Column(Integer, ForeignKey("ac_course_catalog.id", ondelete="CASCADE"), nullable=False, index=True)
    condition_type = Column(String(50), nullable=False, default="pass")  # pass, co_requisite, min_grade
    min_grade = Column(String(5), nullable=True)  # e.g., "C"
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    course = relationship("CourseCatalog", foreign_keys=[course_id], backref="prerequisites")
    prerequisite_course = relationship("CourseCatalog", foreign_keys=[prerequisite_course_id])


class ProgramRegulation(Base):
    __tablename__ = "ac_program_regulations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(Integer, ForeignKey("ac_curriculum_plans.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    min_credits_per_semester = Column(Integer, nullable=False, default=12)
    max_credits_per_semester = Column(Integer, nullable=False, default=18)
    max_credits_under_warning = Column(Integer, nullable=False, default=12)
    warning_gpa_threshold = Column(Float, nullable=False, default=2.0)
    field_training_min_credits = Column(Integer, nullable=False, default=90)
    graduation_project_min_credits = Column(Integer, nullable=False, default=120)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    plan = relationship("CurriculumPlan", backref="regulation_rules")


class CollegeCreditPolicyTier(Base):
    __tablename__ = "ac_college_credit_policy_tiers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="CASCADE"), nullable=False, index=True)
    min_gpa = Column(Float, nullable=False, default=0.0)
    max_gpa = Column(Float, nullable=True)
    min_credits = Column(Integer, nullable=False, default=0)
    max_credits = Column(Integer, nullable=False, default=18)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    college = relationship("College")


class AssessmentTemplate(Base):
    __tablename__ = "ac_assessment_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(100), nullable=False, unique=True, index=True)
    name_ar = Column(String(255), nullable=False)
    name_en = Column(String(255), nullable=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="SET NULL"), nullable=True, index=True)
    track_id = Column(Integer, ForeignKey("ac_college_tracks.id", ondelete="SET NULL"), nullable=True, index=True)
    study_year = Column(Integer, nullable=True, index=True)
    semester = Column(String(20), nullable=True, index=True)
    effective_from_year = Column(String(30), nullable=True, index=True)
    is_default = Column(Boolean, nullable=False, default=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    college = relationship("College")
    track = relationship("CollegeTrack")


class AssessmentTemplateComponent(Base):
    __tablename__ = "ac_assessment_template_components"

    id = Column(Integer, primary_key=True, autoincrement=True)
    template_id = Column(Integer, ForeignKey("ac_assessment_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(String(50), nullable=False, index=True)  # mid1, mid2, coursework, final, practical, oral...
    label_ar = Column(String(255), nullable=False)
    label_en = Column(String(255), nullable=True)
    max_marks = Column(Float, nullable=False, default=0.0)
    weight = Column(Float, nullable=True)
    min_pass = Column(Float, nullable=True)
    is_required = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    template = relationship("AssessmentTemplate", backref="components")


class GradingScale(Base):
    __tablename__ = "ac_grading_scales"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(100), nullable=False, unique=True, index=True)
    name_ar = Column(String(255), nullable=False)
    name_en = Column(String(255), nullable=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="SET NULL"), nullable=True, index=True)
    is_default = Column(Boolean, nullable=False, default=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    college = relationship("College")


class GradingScaleItem(Base):
    __tablename__ = "ac_grading_scale_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scale_id = Column(Integer, ForeignKey("ac_grading_scales.id", ondelete="CASCADE"), nullable=False, index=True)
    grade_code = Column(String(20), nullable=False, index=True)
    label_ar = Column(String(255), nullable=True)
    label_en = Column(String(255), nullable=True)
    min_percentage = Column(Float, nullable=False, default=0.0)
    max_percentage = Column(Float, nullable=True)
    gpa_points = Column(Float, nullable=True)
    is_passing = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    scale = relationship("GradingScale", backref="items")

class SystemNotification(Base):
    __tablename__ = "ac_notifications"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), nullable=True, default="info")
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    
    user = relationship("User", backref="notifications")
