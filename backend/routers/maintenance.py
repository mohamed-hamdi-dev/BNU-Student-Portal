"""
Retention & cleanup router.

Provides:
- CSV report for records that will be deleted (preview before cleanup)
- Cleanup job for old archived/closed conversations (and cascading messages)
- Cleanup job for old feedback records
"""

from datetime import datetime, timedelta, timezone
from io import StringIO
import csv

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.deps import get_db, require_role
from models.conversation import Conversation
from models.feedback import Feedback

router = APIRouter(prefix="/maintenance", tags=["maintenance"], dependencies=[Depends(require_role("admin"))])


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _conversation_candidates(db: Session, conversation_delete_days: int):
    cutoff = _utc_now() - timedelta(days=conversation_delete_days)
    return db.query(Conversation).filter(
        Conversation.status.in_(["closed", "archived"]),
        Conversation.updated_at < cutoff,
    ).all()


def _feedback_candidates(db: Session, feedback_delete_days: int):
    cutoff = _utc_now() - timedelta(days=feedback_delete_days)
    return db.query(Feedback).filter(
        Feedback.created_at < cutoff,
    ).all()


@router.get("/deletion-report.csv")
async def deletion_report_csv(
    conversation_delete_days: int = Query(default=180, ge=7, le=3650),
    feedback_delete_days: int = Query(default=365, ge=7, le=3650),
    db: Session = Depends(get_db),
):
    """
    Export deletion candidates as CSV before running cleanup.
    """
    conversations = _conversation_candidates(db, conversation_delete_days)
    feedback_rows = _feedback_candidates(db, feedback_delete_days)

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["type", "id", "status", "owner_id", "created_at", "updated_at", "preview"])

    for conv in conversations:
        writer.writerow([
            "conversation",
            conv.id,
            conv.status,
            conv.student_id,
            (conv.created_at.isoformat() if conv.created_at else ""),
            (conv.updated_at.isoformat() if conv.updated_at else ""),
            (conv.last_message_text or "")[:160],
        ])

    for fb in feedback_rows:
        writer.writerow([
            "feedback",
            fb.id,
            fb.status,
            fb.user_id,
            (fb.created_at.isoformat() if fb.created_at else ""),
            "",
            (fb.message or "")[:160],
        ])

    output.seek(0)
    filename = f"deletion-report-{_utc_now().date().isoformat()}.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv; charset=utf-8", headers=headers)


@router.post("/run-cleanup")
async def run_cleanup(
    dry_run: bool = Query(default=True),
    conversation_delete_days: int = Query(default=180, ge=7, le=3650),
    feedback_delete_days: int = Query(default=365, ge=7, le=3650),
    db: Session = Depends(get_db),
):
    """
    Execute cleanup job.
    - dry_run=true: preview counts only (no delete)
    - dry_run=false: perform delete
    """
    conversations = _conversation_candidates(db, conversation_delete_days)
    feedback_rows = _feedback_candidates(db, feedback_delete_days)

    conversations_count = len(conversations)
    feedback_count = len(feedback_rows)

    if not dry_run:
        for conv in conversations:
            db.delete(conv)  # Messages are deleted by FK cascade
        for fb in feedback_rows:
            db.delete(fb)
        db.commit()

    return {
        "dry_run": dry_run,
        "conversation_delete_days": conversation_delete_days,
        "feedback_delete_days": feedback_delete_days,
        "conversations_affected": conversations_count,
        "feedback_affected": feedback_count,
        "messages_note": "Messages are removed automatically when conversations are deleted.",
    }
