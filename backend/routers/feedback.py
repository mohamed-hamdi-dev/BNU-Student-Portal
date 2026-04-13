"""
Feedback Router.
Handles student complaints and admin reviews.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.deps import get_db, get_current_user, require_role
from models.user import User
from models.feedback import Feedback
from schemas.feedback import FeedbackCreate, FeedbackResponse

router = APIRouter(prefix="/feedback", tags=["feedback"])


# ── 1. Create Feedback (Students Only) ────────────────────────────────
@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
async def create_feedback(
    feedback_in: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Submit a piece of feedback from a student."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can submit feedback")

    fb = Feedback(
        user_id=current_user.id,
        user_name=current_user.full_name,
        level=current_user.level,
        status="NEW",
        message=feedback_in.message,
        is_read=False
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return fb


# ── 2. List Feedback (Admin Only) ─────────────────────────────────────
@router.get("", response_model=List[FeedbackResponse], dependencies=[Depends(require_role("admin"))])
async def list_feedback(
    skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
):
    """List all feedback tickets. Admin only."""
    return db.query(Feedback).order_by(Feedback.created_at.desc()).offset(skip).limit(limit).all()


# ── 3. Mark Feedback Read/Resolved (Admin Only) ───────────────────────
@router.patch("/{feedback_id}/status", response_model=FeedbackResponse, dependencies=[Depends(require_role("admin"))])
async def update_feedback_status(
    feedback_id: int, new_status: str, db: Session = Depends(get_db)
):
    """Update status of a feedback item (e.g. from 'NEW' to 'Resolved'). Admin only."""
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    fb.status = new_status
    if new_status in ["Resolved", "Closed"]:
        fb.is_read = True
    db.commit()
    db.refresh(fb)
    return fb


# ── 4. Delete Feedback (Admin Only) ───────────────────────────────────
@router.delete("/{feedback_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_role("admin"))])
async def delete_feedback(feedback_id: int, db: Session = Depends(get_db)):
    """Delete a feedback item completely. Admin only."""
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    db.delete(fb)
    db.commit()
    return None
