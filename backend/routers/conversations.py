"""
Conversations Router.
Handles Live Chat sessions between students and admins.
"""

from typing import List
from datetime import datetime, timezone, timedelta
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel

from core.deps import get_db, get_current_user, require_role
from models.user import User
from models.conversation import Conversation
from models.conversation_rating import ConversationRating
from schemas.conversation import ConversationCreate, ConversationResponse

router = APIRouter(prefix="/conversations", tags=["conversations"])
AUTO_CLOSE_AFTER_DAYS = 3
AUTO_ARCHIVE_AFTER_DAYS = 30


class PresenceUpdate(BaseModel):
    is_student_online: bool | None = None


class ConversationRatingBody(BaseModel):
    score: int
    comment: str | None = None


def _auto_close_stale_conversations(db: Session) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=AUTO_CLOSE_AFTER_DAYS)
    stale = db.query(Conversation).filter(
        Conversation.type == "support",
        Conversation.status == "active",
        Conversation.updated_at < cutoff,
    ).all()
    if not stale:
        return
    now = datetime.now(timezone.utc)
    for conv in stale:
        conv.status = "closed"
        conv.is_student_online = False
        conv.updated_at = now
    db.commit()


def _auto_archive_stale_closed_conversations(db: Session) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=AUTO_ARCHIVE_AFTER_DAYS)
    stale = db.query(Conversation).filter(
        Conversation.type == "support",
        Conversation.status == "closed",
        Conversation.updated_at < cutoff,
    ).all()
    if not stale:
        return
    now = datetime.now(timezone.utc)
    for conv in stale:
        conv.status = "archived"
        conv.is_student_online = False
        conv.updated_at = now
    db.commit()


# ── 1. Ensure/Create Conversation (Student Only) ──────────────────────
@router.post("/ensure", response_model=ConversationResponse)
async def ensure_conversation(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get the active conversation for the student, or create one if it doesn't exist.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can initiate support conversations")

    _auto_close_stale_conversations(db)
    _auto_archive_stale_closed_conversations(db)

    # Check for existing active conversation
    conv = db.query(Conversation).filter(
        Conversation.student_id == current_user.id,
        Conversation.status == "active",
        Conversation.type == "support",
    ).first()

    if not conv:
        # Create a new one
        now = datetime.now(timezone.utc)
        conv = Conversation(
            id=str(uuid.uuid4()),
            student_id=current_user.id,
            status="active",
            type="support",
            is_student_online=False,
            unread_for_admin=0,
            unread_for_student=0,
            created_at=now,
            updated_at=now,
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)

    # Attach student name for response convenience
    conv.student_name = current_user.full_name
    conv.student_username = current_user.username
    return conv


# ── 2. Get All Conversations (Admin = All, Student = Own) ─────────────
@router.get("", response_model=List[ConversationResponse])
async def list_conversations(
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List conversations.
    Admin gets all (can filter by status).
    Student gets their own.
    """
    _auto_close_stale_conversations(db)
    _auto_archive_stale_closed_conversations(db)

    query = db.query(
        Conversation,
        User.full_name.label("student_name"),
        User.username.label("student_username"),
        ConversationRating.score.label("rating_score"),
        ConversationRating.comment.label("rating_comment"),
    ).join(
        User, Conversation.student_id == User.id
    ).outerjoin(
        ConversationRating, Conversation.id == ConversationRating.conversation_id
    ).filter(
        Conversation.type == "support"
    )

    if current_user.role == "student":
        query = query.filter(Conversation.student_id == current_user.id)
    else:
        # Admins can filter by status
        if status_filter:
            query = query.filter(Conversation.status == status_filter)

    # Order by last update
    query = query.order_by(Conversation.updated_at.desc())
    results = query.all()

    # Map the join result to the Pydantic schema
    response = []
    for conv, student_name, student_username, rating_score, rating_comment in results:
        conv.student_name = student_name
        conv.student_username = student_username
        conv.rating_score = rating_score
        conv.rating_comment = rating_comment
        response.append(conv)

    return response


# ── 3. Update Conversation Presence (Student) ─────────────────────────
@router.patch("/{conversation_id}/presence")
async def update_presence(
    conversation_id: str,
    payload: PresenceUpdate | None = None,
    is_online: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update student's online presence in the chat."""
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv or conv.type != "support":
        raise HTTPException(status_code=404, detail="Conversation not found")

    if current_user.role == "student" and conv.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your conversation")

    if current_user.role == "student":
        # Backward/forward compatibility:
        # - old clients send ?is_online=true as query
        # - new clients send {"is_student_online": true} as JSON
        online = is_online
        if online is None and payload is not None:
            online = payload.is_student_online
        if online is None:
            raise HTTPException(status_code=422, detail="Missing is_online value")

        conv.is_student_online = bool(online)
        conv.student_last_seen = datetime.now(timezone.utc)
        db.commit()

    return {"message": "Presence updated"}


# ── 4. Admin Mark Chat Closed (Admin Only) ────────────────────────────
@router.patch("/{conversation_id}/close", dependencies=[Depends(require_role("admin"))])
async def close_conversation(
    conversation_id: str,
    db: Session = Depends(get_db)
):
    """Admin manually closes a ticket."""
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv or conv.type != "support":
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv.status = "closed"
    db.commit()
    return {"message": "Conversation closed"}


@router.get("/{conversation_id}/rating")
async def get_conversation_rating(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv or conv.type != "support":
        raise HTTPException(status_code=404, detail="Conversation not found")

    if current_user.role == "student" and conv.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your conversation")

    row = db.query(ConversationRating).filter(ConversationRating.conversation_id == conversation_id).first()
    if not row:
        return None
    return {
        "score": row.score,
        "comment": row.comment,
        "created_at": row.created_at,
    }


@router.post("/{conversation_id}/rating")
async def upsert_conversation_rating(
    conversation_id: str,
    body: ConversationRatingBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can rate conversations")

    if body.score < 1 or body.score > 5:
        raise HTTPException(status_code=400, detail="Score must be between 1 and 5")

    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv or conv.type != "support":
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your conversation")
    if conv.status != "closed":
        raise HTTPException(status_code=400, detail="Conversation must be closed before rating")

    row = db.query(ConversationRating).filter(ConversationRating.conversation_id == conversation_id).first()
    if not row:
        row = ConversationRating(conversation_id=conversation_id, student_id=current_user.id, score=body.score, comment=(body.comment or "").strip() or None)
        db.add(row)
    else:
        row.score = body.score
        row.comment = (body.comment or "").strip() or None
    db.commit()
    db.refresh(row)
    return {
        "score": row.score,
        "comment": row.comment,
        "created_at": row.created_at,
    }
