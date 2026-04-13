"""
Admin Dashboard Router.
Calculates metrics and statistics from the database securely.
"""

from typing import Dict, List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from core.deps import get_db, require_role
from models.user import User
from models.conversation import Conversation
from models.feedback import Feedback
from schemas.dashboard import DashboardMetrics

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(require_role("admin"))])


@router.get("/metrics", response_model=DashboardMetrics)
async def get_dashboard_metrics(db: Session = Depends(get_db)):
    """Fetch high-level statistics for the admin dashboard."""
    
    # 1. Total users
    total_users = db.query(func.count(User.id)).scalar() or 0

    # 2. Active students
    active_students = db.query(func.count(User.id)).filter(
        User.role == "student", 
        User.is_active == True
    ).scalar() or 0

    # 3. Active conversations
    active_conversations = db.query(func.count(Conversation.id)).filter(
        Conversation.status == "active"
    ).scalar() or 0

    # 4. Pending feedback (Assuming 'NEW' or 'unread' status)
    pending_feedback = db.query(func.count(Feedback.id)).filter(
        Feedback.status == "NEW"
    ).scalar() or 0

    # 5. Users by college breakdown
    colleges_query = db.query(User.college, func.count(User.id)).filter(
        User.role == "student",
        User.college.isnot(None)
    ).group_by(User.college).all()

    users_by_college = {college: count for college, count in colleges_query}

    return DashboardMetrics(
        total_users=total_users,
        active_students=active_students,
        active_conversations=active_conversations,
        pending_feedback=pending_feedback,
        users_by_college=users_by_college
    )
