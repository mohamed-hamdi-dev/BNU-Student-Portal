from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


AttendanceSessionStatus = Literal["open", "closed"]
AttendanceRecordStatus = Literal["present", "absent", "late"]
AttendanceMarkedMethod = Literal["qr", "manual", "system"]


class AttendanceSessionCreate(BaseModel):
    offering_id: int = Field(..., ge=1)
    title: str = Field(..., min_length=1, max_length=255)
    session_date: date
    start_time: str | None = Field(default=None, min_length=4, max_length=5)
    end_time: str | None = Field(default=None, min_length=4, max_length=5)
    qr_expires_at: datetime | None = None


class AttendanceSessionResponse(BaseModel):
    id: int
    offering_id: int
    title: str
    session_date: date
    start_time: str | None
    end_time: str | None
    status: str
    qr_token: str | None
    qr_expires_at: datetime | None
    created_by: int | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AttendanceRecordUpsert(BaseModel):
    student_user_id: int = Field(..., ge=1)
    status: AttendanceRecordStatus
    marked_method: AttendanceMarkedMethod = "manual"


class AttendanceScanPayload(BaseModel):
    student_user_id: int | None = Field(default=None, ge=1)
    student_code: str | None = Field(default=None, min_length=1, max_length=50)
    qr_token: str | None = Field(default=None, min_length=1, max_length=255)


class AttendanceMarkAbsentPayload(BaseModel):
    student_user_id: int | None = Field(default=None, ge=1)


class AttendanceRecordResponse(BaseModel):
    id: int
    session_id: int
    student_user_id: int
    registration_selection_id: int
    status: str
    marked_by: int | None
    marked_method: str
    marked_at: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AttendanceStudentRosterItem(BaseModel):
    student_user_id: int
    student_code: str | None
    student_name: str
    college: str | None
    registration_selection_id: int
    attendance_record_id: int | None = None
    attendance_status: str | None = None
    marked_method: str | None = None
    marked_at: datetime | None = None


class AttendanceSessionDetailResponse(BaseModel):
    session: AttendanceSessionResponse
    offering: dict
    totals: dict


class AttendanceSessionRecordsResponse(BaseModel):
    session: AttendanceSessionResponse
    offering: dict
    records: list[AttendanceStudentRosterItem]
    totals: dict


class AttendanceCourseSummaryItem(BaseModel):
    offering_id: int
    course_id: int | None
    course_code: str | None
    course_title_ar: str | None
    display_title: str | None = None
    academic_year_label: str
    semester: str
    section: str
    total_sessions: int
    present_count: int
    absent_count: int
    late_count: int
    attendance_percentage: float
    absence_percentage: float
    warning: bool


class AttendanceMySummaryResponse(BaseModel):
    items: list[AttendanceCourseSummaryItem]


class AttendanceCourseHistoryItem(BaseModel):
    session_id: int
    title: str
    session_date: date
    start_time: str | None
    end_time: str | None
    status: str
    marked_method: str | None = None
    marked_at: datetime | None = None
    session_status: str


class AttendanceCourseHistoryResponse(BaseModel):
    summary: AttendanceCourseSummaryItem
    history: list[AttendanceCourseHistoryItem]
