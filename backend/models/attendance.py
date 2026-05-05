from datetime import date, datetime, timezone

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"
    __table_args__ = (
        UniqueConstraint("offering_id", "session_date", "start_time", "title", name="uq_attendance_session_slot"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    offering_id = Column(Integer, ForeignKey("ac_course_offerings.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    session_date = Column(Date, nullable=False, default=date.today, index=True)
    start_time = Column(String(5), nullable=True)
    end_time = Column(String(5), nullable=True)
    status = Column(String(20), nullable=False, default="open", index=True)
    qr_token = Column(String(255), nullable=True, index=True)
    qr_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    offering = relationship("CourseOffering")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("session_id", "student_user_id", name="uq_attendance_record_session_student"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    registration_selection_id = Column(Integer, ForeignKey("ac_registration_selections.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="present", index=True)
    marked_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    marked_method = Column(String(20), nullable=False, default="manual", index=True)
    marked_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    session = relationship("AttendanceSession")
    selection = relationship("RegistrationCourseSelection")
