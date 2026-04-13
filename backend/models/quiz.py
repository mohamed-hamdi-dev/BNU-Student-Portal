from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from core.database import Base


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(String(64), primary_key=True)
    title = Column(String(255), nullable=False)
    duration = Column(Integer, nullable=False, default=15)
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    questions_json = Column(Text, nullable=False, default="[]")
    course_code = Column(String(50), nullable=True, index=True)
    college_id = Column(String(50), nullable=True, index=True)
    visibility = Column(String(20), nullable=False, default="college", index=True)
    academic_year = Column(String(30), nullable=True, index=True)
    term = Column(String(30), nullable=True, index=True)
    section = Column(String(30), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)


class QuizSubmission(Base):
    __tablename__ = "quiz_submissions"

    id = Column(String(64), primary_key=True)
    quiz_id = Column(String(64), ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    student_name = Column(String(255), nullable=False)
    quiz_title = Column(String(255), nullable=False)
    course_code = Column(String(50), nullable=True, index=True)
    academic_year = Column(String(30), nullable=True, index=True)
    term = Column(String(30), nullable=True, index=True)
    section = Column(String(30), nullable=True, index=True)
    score = Column(Integer, nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
