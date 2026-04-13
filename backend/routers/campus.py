"""
Campus Places Router.
Handles CRUD for campus locations using the database.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from core.deps import get_db, require_role
from models.campus import CampusPlace
from schemas.campus import CampusPlaceCreate, CampusPlaceUpdate, CampusPlaceResponse

router = APIRouter(prefix="/campus", tags=["campus"])


def ensure_campus_schema(db: Session) -> None:
    """Schema is managed centrally by ORM metadata creation."""
    return None


# ── 1. List All Places (Public/Auth agnostic) ─────────────────────────
@router.get("/places", response_model=List[CampusPlaceResponse])
async def get_campus_places(
    category: Optional[str] = Query(default=None, description="Filter by category"),
    db: Session = Depends(get_db)
):
    """Return all campus places from database."""
    query = db.query(CampusPlace)
    
    if category:
        normalized_category = category.strip().lower()
        query = query.filter(CampusPlace.category.ilike(f"%{normalized_category}%"))
        
    return query.all()


# ── 2. Get Single Place (Public) ──────────────────────────────────────
@router.get("/places/{place_id}", response_model=CampusPlaceResponse)
async def get_campus_place(place_id: int, db: Session = Depends(get_db)):
    """Return one campus place by its DB id."""
    place = db.query(CampusPlace).filter(CampusPlace.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Campus place not found")
    return place


# ── 3. Create Place (Admin Only) ──────────────────────────────────────
@router.post("/places", response_model=CampusPlaceResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin"))])
async def create_campus_place(place_in: CampusPlaceCreate, db: Session = Depends(get_db)):
    """Add a new place to the campus map."""
    place = CampusPlace(**place_in.model_dump())
    db.add(place)
    db.commit()
    db.refresh(place)
    return place


# ── 4. Update Place (Admin Only) ──────────────────────────────────────
@router.patch("/places/{place_id}", response_model=CampusPlaceResponse, dependencies=[Depends(require_role("admin"))])
async def update_campus_place(place_id: int, place_in: CampusPlaceUpdate, db: Session = Depends(get_db)):
    """Update details of an existing place."""
    place = db.query(CampusPlace).filter(CampusPlace.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Campus place not found")
        
    update_data = place_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(place, field, value)
        
    db.commit()
    db.refresh(place)
    return place


# ── 5. Delete Place (Admin Only) ──────────────────────────────────────
@router.delete("/places/{place_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_role("admin"))])
async def delete_campus_place(place_id: int, db: Session = Depends(get_db)):
    """Remove a place from the campus map."""
    place = db.query(CampusPlace).filter(CampusPlace.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Campus place not found")
        
    db.delete(place)
    db.commit()
    return None
