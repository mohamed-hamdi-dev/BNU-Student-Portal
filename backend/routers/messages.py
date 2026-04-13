"""
Messages Router.
Handles sending and reading messages within a Live Chat Conversation.
"""

from typing import List
from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.deps import get_db, get_current_user
from models.user import User
from models.conversation import Conversation, Message
from schemas.conversation import MessageCreate, MessageResponse

router = APIRouter(prefix="/conversations", tags=["messages"])


# ── Helper to check access ────────────────────────────────────────────
def _get_conversation_with_access(db: Session, conversation_id: str, user: User) -> Conversation:
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.type != "support":
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    if user.role == "student" and conv.student_id != user.id:
        raise HTTPException(status_code=403, detail="You do not have access to this conversation")
        
    return conv


# ── 1. Get Messages ───────────────────────────────────────────────────
@router.get("/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve all messages for a specific conversation."""
    conv = _get_conversation_with_access(db, conversation_id, current_user)

    if conv.status == "archived":
        raise HTTPException(status_code=400, detail="Conversation is archived. Please start a new chat.")
    
    messages = db.query(Message).filter(
        Message.conversation_id == conv.id
    ).order_by(Message.created_at.asc()).all()
    
    return messages


# ── 2. Send Message ───────────────────────────────────────────────────
@router.post("/{conversation_id}/messages", response_model=MessageResponse)
async def send_message(
    conversation_id: str,
    msg_in: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a new message to the conversation."""
    conv = _get_conversation_with_access(db, conversation_id, current_user)
    
    # Optional logic: prevent messaging on closed tickets
    # if conv.status == "closed":
    #     raise HTTPException(status_code=400, detail="Cannot send message to a closed conversation")

    # Determine sender type from role
    # Assuming role is 'student' or 'admin'
    sender_type = "student" if current_user.role == "student" else "admin"

    now = datetime.now(timezone.utc)
    new_msg = Message(
        id=str(uuid.uuid4()),
        conversation_id=conv.id,
        sender_type=sender_type,
        sender_user_id=current_user.id,
        sender_name=current_user.full_name,
        text=msg_in.text,
        is_read=False,
        created_at=now,
    )
    db.add(new_msg)

    # Update conversation denormalized fields
    conv.status = "active"
    conv.last_message_text = msg_in.text
    conv.last_message_at = now
    conv.updated_at = now
    
    if sender_type == "student":
        conv.unread_for_admin += 1
    else:
        conv.unread_for_student += 1
        # If admin replies, assign the admin temporarily or permanently
        if not conv.assigned_admin_id:
            conv.assigned_admin_id = current_user.id

    db.commit()
    db.refresh(new_msg)

    return new_msg


# ── 3. Mark Messages as Read ──────────────────────────────────────────
@router.post("/{conversation_id}/read")
async def mark_messages_read(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark all unread messages in the conversation as read by the caller."""
    conv = _get_conversation_with_access(db, conversation_id, current_user)
    
    # Mark messages read depending on who is calling
    is_teacher = current_user.role in ["admin", "doctor"]
    target_sender_type = "student" if is_teacher else "admin"

    # Find unread messages from the OTHER party
    unread_msgs = db.query(Message).filter(
        Message.conversation_id == conv.id,
        Message.sender_type == target_sender_type,
        Message.is_read == False
    ).all()

    for m in unread_msgs:
        m.is_read = True

    # Reset counter on conversation
    if is_teacher:
        conv.unread_for_admin = 0
    else:
        conv.unread_for_student = 0

    db.commit()
    return {"message": f"Marked {len(unread_msgs)} messages as read"}
