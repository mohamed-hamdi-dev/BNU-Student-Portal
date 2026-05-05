from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CollegeCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name_ar: str = Field(..., min_length=1, max_length=255)
    name_en: str | None = Field(default=None, max_length=255)
    total_years: int = Field(default=4, ge=1, le=10)
    branching_start_year: int | None = Field(default=None, ge=1, le=10)
    is_active: bool = True


class CollegeUpdate(BaseModel):
    name_ar: str | None = Field(default=None, max_length=255)
    name_en: str | None = Field(default=None, max_length=255)
    total_years: int | None = Field(default=None, ge=1, le=10)
    branching_start_year: int | None = Field(default=None, ge=1, le=10)
    is_active: bool | None = None


class CollegeResponse(BaseModel):
    id: int
    code: str
    name_ar: str
    name_en: str | None
    total_years: int
    branching_start_year: int | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TrackCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name_ar: str = Field(..., min_length=1, max_length=255)
    name_en: str | None = Field(default=None, max_length=255)
    starts_at_year: int | None = Field(default=None, ge=1, le=10)
    capacity: int | None = Field(default=None, ge=1)
    is_active: bool = True


class TrackUpdate(BaseModel):
    code: str | None = Field(default=None, max_length=50)
    name_ar: str | None = Field(default=None, max_length=255)
    name_en: str | None = Field(default=None, max_length=255)
    starts_at_year: int | None = Field(default=None, ge=1, le=10)
    capacity: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


class TrackResponse(BaseModel):
    id: int
    college_id: int
    code: str
    name_ar: str
    name_en: str | None
    starts_at_year: int | None
    capacity: int | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CurriculumPlanCreate(BaseModel):
    batch_year: int = Field(..., ge=2000, le=2100)
    version: int = Field(default=1, ge=1, le=50)
    title: str = Field(..., min_length=1, max_length=255)
    notes: str | None = None
    is_active: bool = True


class CurriculumPlanResponse(BaseModel):
    id: int
    college_id: int
    batch_year: int
    version: int
    title: str
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CourseCatalogCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    title_ar: str = Field(..., min_length=1, max_length=255)
    title_en: str | None = Field(default=None, max_length=255)
    college_id: int | None = None
    track_id: int | None = None
    plan_id: int | None = None
    study_year: int | None = Field(default=None, ge=1, le=10)
    semester: Literal["autumn", "spring", "summer"] | None = None
    credit_hours: float = Field(default=0, ge=0, le=30)
    lecture_hours: float = Field(default=0, ge=0, le=30)
    lab_hours: float = Field(default=0, ge=0, le=30)
    max_mid1: float = Field(default=0, ge=0, le=200)
    max_mid2: float = Field(default=0, ge=0, le=200)
    max_coursework: float = Field(default=0, ge=0, le=200)
    max_final: float = Field(default=0, ge=0, le=200)
    assessment_template_id: int | None = None
    allow_assessment_override: bool = False
    assessment_override_components: list[dict] = Field(default_factory=list)
    pass_mark: float | None = Field(default=None, ge=0)
    grading_scale_id: int | None = None
    is_shared: bool = False
    is_active: bool = True


class CourseCatalogUpdate(BaseModel):
    title_ar: str | None = Field(default=None, max_length=255)
    title_en: str | None = Field(default=None, max_length=255)
    college_id: int | None = None
    track_id: int | None = None
    plan_id: int | None = None
    study_year: int | None = Field(default=None, ge=1, le=10)
    semester: Literal["autumn", "spring", "summer"] | None = None
    credit_hours: float | None = Field(default=None, ge=0, le=30)
    lecture_hours: float | None = Field(default=None, ge=0, le=30)
    lab_hours: float | None = Field(default=None, ge=0, le=30)
    max_mid1: float | None = Field(default=None, ge=0, le=200)
    max_mid2: float | None = Field(default=None, ge=0, le=200)
    max_coursework: float | None = Field(default=None, ge=0, le=200)
    max_final: float | None = Field(default=None, ge=0, le=200)
    assessment_template_id: int | None = None
    allow_assessment_override: bool | None = None
    assessment_override_components: list[dict] | None = None
    pass_mark: float | None = Field(default=None, ge=0)
    grading_scale_id: int | None = None
    is_shared: bool | None = None
    is_active: bool | None = None


class CourseCatalogResponse(BaseModel):
    id: int
    code: str
    title_ar: str
    title_en: str | None
    college_id: int | None
    track_id: int | None
    plan_id: int | None
    study_year: int | None
    semester: str | None
    credit_hours: float
    lecture_hours: float
    lab_hours: float
    max_mid1: float
    max_mid2: float
    max_coursework: float
    max_final: float
    max_total: float
    assessment_template_id: int | None
    allow_assessment_override: bool
    assessment_override_components_json: str
    pass_mark: float | None
    grading_scale_id: int | None
    is_shared: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OfferingCreate(BaseModel):
    course_id: int
    academic_year_label: str = Field(..., min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"]
    section: str = Field(default="A", min_length=1, max_length=50)
    target_group_id: str = Field(..., min_length=1, max_length=100)
    target_group_name: str | None = Field(default=None, max_length=255)
    day_of_week: str = Field(..., min_length=1, max_length=20)
    start_time: str = Field(..., min_length=4, max_length=5)
    end_time: str = Field(..., min_length=4, max_length=5)
    room_name: str | None = Field(default=None, max_length=100)
    instructor_user_id: int | None = None
    max_students: int | None = Field(default=None, ge=1)
    is_active: bool = True


class OfferingUpdate(BaseModel):
    course_id: int | None = None
    academic_year_label: str | None = Field(default=None, min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"] | None = None
    section: str | None = Field(default=None, min_length=1, max_length=50)
    target_group_id: str | None = Field(default=None, min_length=1, max_length=100)
    target_group_name: str | None = Field(default=None, max_length=255)
    day_of_week: str | None = Field(default=None, min_length=1, max_length=20)
    start_time: str | None = Field(default=None, min_length=4, max_length=5)
    end_time: str | None = Field(default=None, min_length=4, max_length=5)
    room_name: str | None = Field(default=None, max_length=100)
    instructor_user_id: int | None = None
    max_students: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


class OfferingResponse(BaseModel):
    id: int
    course_id: int
    academic_year_label: str
    semester: str
    section: str
    target_group_id: str | None
    target_group_name: str | None
    day_of_week: str | None
    start_time: str | None
    end_time: str | None
    room_name: str | None
    instructor_user_id: int | None
    max_students: int | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudentProfileUpsert(BaseModel):
    student_user_id: int
    college_id: int | None = None
    entry_batch_year: int | None = Field(default=None, ge=2000, le=2100)
    current_study_year: int = Field(default=1, ge=1, le=10)
    current_track_id: int | None = None
    advisor_user_id: int | None = None
    gpa: float = Field(default=0, ge=0, le=4)
    passed_hours: float = Field(default=0, ge=0)


class StudentAcademicMetricsUpdate(BaseModel):
    gpa: float = Field(..., ge=0, le=4)
    passed_hours: float = Field(..., ge=0)


class StudentProfileResponse(BaseModel):
    id: int
    student_user_id: int
    college_id: int | None
    entry_batch_year: int | None
    current_study_year: int
    current_track_id: int | None
    advisor_user_id: int | None
    gpa: float
    passed_hours: float
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FinanceStatusUpdate(BaseModel):
    status: Literal["pending", "cleared", "blocked"]
    notes: str | None = None


class FinanceStatusResponse(BaseModel):
    id: int
    student_user_id: int
    status: str
    cleared_by_user_id: int | None
    cleared_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RegistrationWindowCreate(BaseModel):
    college_id: int | None = None
    academic_year_label: str = Field(..., min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"]
    status: Literal["OPEN", "CLOSED", "PENDING_REVIEW", "APPROVED", "LOCKED"] = "OPEN"
    starts_at: datetime
    ends_at: datetime
    open_at: datetime | None = None
    close_at: datetime | None = None
    allows_self_registration: bool = True
    allows_advisor_registration: bool = True
    requires_financial_clearance: bool = True
    is_active: bool = True


class RegistrationWindowStatusUpdate(BaseModel):
    status: Literal["OPEN", "CLOSED", "PENDING_REVIEW", "APPROVED", "LOCKED"]


class RegistrationWindowUpdate(BaseModel):
    college_id: int | None = None
    academic_year_label: str | None = Field(default=None, min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"] | None = None
    status: Literal["OPEN", "CLOSED", "PENDING_REVIEW", "APPROVED", "LOCKED"] | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    open_at: datetime | None = None
    close_at: datetime | None = None
    allows_self_registration: bool | None = None
    allows_advisor_registration: bool | None = None
    requires_financial_clearance: bool | None = None
    is_active: bool | None = None


class RegistrationWindowResponse(BaseModel):
    id: int
    college_id: int | None
    academic_year_label: str
    semester: str
    status: str
    starts_at: datetime
    ends_at: datetime
    open_at: datetime | None
    close_at: datetime | None
    allows_self_registration: bool
    allows_advisor_registration: bool
    requires_financial_clearance: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RegistrationSubmit(BaseModel):
    academic_year_label: str = Field(..., min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"]
    offering_ids: list[int] = Field(default_factory=list)
    selection_context: list[dict] = Field(default_factory=list)


class AdvisorRegistrationRequestCreate(BaseModel):
    academic_year_label: str = Field(..., min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"]
    offering_ids: list[int] = Field(default_factory=list, min_length=1)
    requested_note: str = Field(..., min_length=3, max_length=2000)


class AdvisorRegistrationDecision(BaseModel):
    status: Literal["advisor_approved", "rejected", "need_info"]
    advisor_note: str | None = Field(default=None, max_length=2000)


class AdvisorRegistrationManagePayload(BaseModel):
    student_user_id: int
    academic_year_label: str = Field(..., min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"]
    offering_ids: list[int] = Field(default_factory=list, min_length=1)
    requested_note: str | None = Field(default=None, max_length=2000)


class RegistrationStatusUpdate(BaseModel):
    status: Literal["draft", "submitted", "advisor_requested", "advisor_approved", "need_info", "rejected", "registered", "locked"]


class RegistrationRequestResponse(BaseModel):
    id: int
    student_user_id: int
    academic_year_label: str
    semester: str
    status: str
    submitted_at: datetime | None
    advisor_approved_at: datetime | None
    locked_at: datetime | None
    created_by_user_id: int | None
    advisor_user_id: int | None
    requested_note: str | None
    advisor_note: str | None
    requested_at: datetime | None
    handled_at: datetime | None
    processed_by_user_id: int | None
    submitted_via: str
    is_after_window: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RegistrationSelectionResponse(BaseModel):
    id: int
    registration_request_id: int
    offering_id: int
    student_user_id: int
    display_title: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GradeEntryUpsert(BaseModel):
    selection_id: int
    import_cycle: Literal["mid1", "mid2", "coursework", "final"]
    mid1: float | None = Field(default=None, ge=0)
    mid2: float | None = Field(default=None, ge=0)
    coursework: float | None = Field(default=None, ge=0)
    final: float | None = Field(default=None, ge=0)


class GradePublishUpdate(BaseModel):
    publish_status: Literal["draft", "reviewed", "published"]


class GradeBookResponse(BaseModel):
    id: int
    selection_id: int
    student_user_id: int
    offering_id: int
    mid1: float | None
    mid2: float | None
    coursework: float | None
    final: float | None
    component_scores_json: str
    total: float | None
    grade: str | None
    import_cycle: str | None
    publish_status: str
    last_updated_by_user_id: int | None
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GradeImportPreviewRequest(BaseModel):
    offering_id: int
    import_cycle: Literal["mid1", "mid2", "coursework", "final"]
    source_file_name: str | None = None
    rows: list[dict]


class GradeImportBatchResponse(BaseModel):
    id: int
    offering_id: int
    import_cycle: str
    source_file_name: str | None
    valid_count: int
    error_count: int
    errors_json: str
    status: str
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    id: int
    actor_user_id: int | None
    entity_type: str
    entity_id: str
    action: str
    before_json: str | None
    after_json: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class CoursePrerequisiteCreate(BaseModel):
    prerequisite_course_id: int
    condition_type: Literal["pass", "co_requisite", "min_grade"] = "pass"
    min_grade: str | None = None


class CoursePrerequisiteResponse(BaseModel):
    id: int
    course_id: int
    prerequisite_course_id: int
    condition_type: str
    min_grade: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProgramRegulationCreate(BaseModel):
    min_credits_per_semester: int = Field(default=12, ge=0)
    max_credits_per_semester: int = Field(default=18, ge=0)
    max_credits_under_warning: int = Field(default=12, ge=0)
    warning_gpa_threshold: float = Field(default=2.0, ge=0.0, le=4.0)
    field_training_min_credits: int = Field(default=90, ge=0)
    graduation_project_min_credits: int = Field(default=120, ge=0)


class ProgramRegulationResponse(BaseModel):
    id: int
    plan_id: int
    min_credits_per_semester: int
    max_credits_per_semester: int
    max_credits_under_warning: int
    warning_gpa_threshold: float
    field_training_min_credits: int
    graduation_project_min_credits: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CreditPolicyTierInput(BaseModel):
    min_gpa: float = Field(..., ge=0.0, le=4.0)
    max_gpa: float | None = Field(default=None, ge=0.0, le=4.0)
    min_credits: int = Field(default=0, ge=0, le=30)
    max_credits: int = Field(default=18, ge=0, le=30)


class CreditPolicyTierReplaceRequest(BaseModel):
    tiers: list[CreditPolicyTierInput] = Field(default_factory=list, min_length=1, max_length=10)


class CreditPolicyTierResponse(BaseModel):
    id: int
    college_id: int
    min_gpa: float
    max_gpa: float | None
    min_credits: int
    max_credits: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AssessmentTemplateComponentCreate(BaseModel):
    key: str = Field(..., min_length=1, max_length=50)
    label_ar: str = Field(..., min_length=1, max_length=255)
    label_en: str | None = Field(default=None, max_length=255)
    max_marks: float = Field(default=0, ge=0, le=1000)
    weight: float | None = Field(default=None, ge=0, le=1000)
    min_pass: float | None = Field(default=None, ge=0, le=1000)
    is_required: bool = True
    display_order: int = Field(default=1, ge=1, le=100)


class AssessmentTemplateCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=100)
    name_ar: str = Field(..., min_length=1, max_length=255)
    name_en: str | None = Field(default=None, max_length=255)
    college_id: int | None = None
    track_id: int | None = None
    study_year: int | None = Field(default=None, ge=1, le=10)
    semester: Literal["autumn", "spring", "summer"] | None = None
    effective_from_year: str | None = Field(default=None, max_length=30)
    is_default: bool = False
    is_active: bool = True
    notes: str | None = None
    components: list[AssessmentTemplateComponentCreate] = Field(default_factory=list)


class AssessmentTemplateComponentResponse(BaseModel):
    id: int
    template_id: int
    key: str
    label_ar: str
    label_en: str | None
    max_marks: float
    weight: float | None
    min_pass: float | None
    is_required: bool
    display_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AssessmentTemplateResponse(BaseModel):
    id: int
    code: str
    name_ar: str
    name_en: str | None
    college_id: int | None
    track_id: int | None
    study_year: int | None
    semester: str | None
    effective_from_year: str | None
    is_default: bool
    is_active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime
    components: list[AssessmentTemplateComponentResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class GradingScaleItemCreate(BaseModel):
    grade_code: str = Field(..., min_length=1, max_length=20)
    label_ar: str | None = Field(default=None, max_length=255)
    label_en: str | None = Field(default=None, max_length=255)
    min_percentage: float = Field(..., ge=0, le=100)
    max_percentage: float | None = Field(default=None, ge=0, le=100)
    gpa_points: float | None = Field(default=None, ge=0, le=4)
    is_passing: bool = True
    sort_order: int = Field(default=1, ge=1, le=100)


class GradingScaleCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=100)
    name_ar: str = Field(..., min_length=1, max_length=255)
    name_en: str | None = Field(default=None, max_length=255)
    college_id: int | None = None
    is_default: bool = False
    is_active: bool = True
    items: list[GradingScaleItemCreate] = Field(default_factory=list)


class GradingScaleItemResponse(BaseModel):
    id: int
    scale_id: int
    grade_code: str
    label_ar: str | None
    label_en: str | None
    min_percentage: float
    max_percentage: float | None
    gpa_points: float | None
    is_passing: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GradingScaleResponse(BaseModel):
    id: int
    code: str
    name_ar: str
    name_en: str | None
    college_id: int | None
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    items: list[GradingScaleItemResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class AllowedCreditHours(BaseModel):
    min: int
    max: int


class EvaluatedCourse(BaseModel):
    course_code: str
    course_name: str
    reason: str


class StudentEligibilityResponse(BaseModel):
    student_id: int
    program: str
    regulation_year: str
    current_term: str
    current_gpa: float
    completed_credits: float
    allowed_credit_hours: AllowedCreditHours
    eligible_courses: list[EvaluatedCourse]
    blocked_courses: list[EvaluatedCourse]
    warnings: list[str]
    decision_explanation: str
