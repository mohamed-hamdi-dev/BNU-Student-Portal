from datetime import datetime
from typing import List, Dict

from pydantic import BaseModel, ConfigDict, Field


class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    correct: int = 0
    image_url: str | None = Field(default=None, alias="imageUrl")

    model_config = ConfigDict(populate_by_name=True)


class QuizCreate(BaseModel):
    title: str
    duration: int = 15
    course_code: str | None = Field(default=None, alias="courseCode")
    college_id: str | None = Field(default=None, alias="collegeId")
    visibility: str = "college"
    academic_year: str | None = Field(default=None, alias="academicYear")
    term: str | None = None
    section: str | None = None
    start_time: datetime | None = Field(default=None, alias="startTime")
    end_time: datetime | None = Field(default=None, alias="endTime")
    questions: List[QuizQuestion] = []

    model_config = ConfigDict(populate_by_name=True)


class QuizResponse(BaseModel):
    id: str
    title: str
    duration: int
    course_code: str | None = Field(default=None, alias="courseCode")
    college_id: str | None = Field(default=None, alias="collegeId")
    visibility: str = "college"
    academic_year: str | None = Field(default=None, alias="academicYear")
    term: str | None = None
    section: str | None = None
    start_time: datetime | None = Field(default=None, alias="startTime")
    end_time: datetime | None = Field(default=None, alias="endTime")
    questions: List[QuizQuestion]

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class QuizSubmissionCreate(BaseModel):
    answers: Dict[str, int] | None = None
    score: int | None = None


class QuizSubmissionResponse(BaseModel):
    id: str
    quiz_id: str = Field(alias="quizId")
    student_id: int = Field(alias="studentId")
    student_name: str = Field(alias="studentName")
    quiz_title: str = Field(alias="quizTitle")
    course_code: str | None = Field(default=None, alias="courseCode")
    academic_year: str | None = Field(default=None, alias="academicYear")
    term: str | None = None
    section: str | None = None
    status: str = "submitted"
    score: int
    submitted_at: datetime = Field(alias="submittedAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class QuizSubmissionsPageResponse(BaseModel):
    items: List[QuizSubmissionResponse]
    total: int
    page: int
    page_size: int = Field(alias="pageSize")
    total_pages: int = Field(alias="totalPages")
    summary: dict = {}

    model_config = ConfigDict(populate_by_name=True)
