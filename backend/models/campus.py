from sqlalchemy import Column, Integer, String, Float, Text, DateTime
from sqlalchemy.sql import func
from core.database import Base

class CampusPlace(Base):
    __tablename__ = "campus_places"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), index=True, nullable=False)
    name_ar = Column(String(255))
    building_code = Column(String(20), nullable=True)
    category = Column(String(100), index=True)
    icon_key = Column(String(100), nullable=True)
    latitude = Column(Float)
    longitude = Column(Float)
    description = Column(Text)
    description_ar = Column(Text)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
