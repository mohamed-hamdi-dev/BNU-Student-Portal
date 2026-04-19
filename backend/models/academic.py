from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, Text

from core.database import Base


class AcademicState(Base):
    __tablename__ = "academic_state"

    id = Column(Integer, primary_key=True, autoincrement=False, default=1)
    courses_json = Column(Text, nullable=False, default="[]")
    years_json = Column(Text, nullable=False, default="[]")
    open_semesters_json = Column(Text, nullable=False, default='{"autumn":true,"spring":false,"summer":false}')
    registration_settings_json = Column(Text, nullable=False, default='{"activeAcademicYear":"1","enforcePrerequisites":true,"enforceMaxHours":true}')
    grade_publish_map_json = Column(Text, nullable=False, default="{}")
    student_registrations_json = Column(Text, nullable=False, default="[]")
    academic_records_json = Column(Text, nullable=False, default="[]")
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
