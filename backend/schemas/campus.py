from typing import Optional
from pydantic import BaseModel


class CampusPlaceBase(BaseModel):
    name: str
    name_ar: Optional[str] = None
    building_code: Optional[str] = None
    category: Optional[str] = None
    icon_key: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    description_ar: Optional[str] = None


class CampusPlaceCreate(CampusPlaceBase):
    pass


class CampusPlaceUpdate(CampusPlaceBase):
    name: Optional[str] = None


class CampusPlaceResponse(CampusPlaceBase):
    id: int

    class Config:
        from_attributes = True
