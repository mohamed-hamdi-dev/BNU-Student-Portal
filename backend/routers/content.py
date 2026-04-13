"""
Content Posts Router.
Handles announcements/articles created by admins.
"""

from typing import List
import re
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from core.deps import get_db, get_current_user, require_role
from models.user import User
from models.content import ContentPost
from models.storage import StorageItem
from schemas.content import ContentCreate, ContentUpdate, ContentResponse

router = APIRouter(prefix="/content", tags=["content"])
_STORAGE_FILE_ROUTE_RE = re.compile(r"/api/storage/files/([^/?#]+)", re.IGNORECASE)

CONTENT_SCHEMA_COLUMNS = {
    "content_type": "ALTER TABLE content_posts ADD COLUMN content_type VARCHAR(32)",
    "tags": "ALTER TABLE content_posts ADD COLUMN tags TEXT",
    "college": "ALTER TABLE content_posts ADD COLUMN college VARCHAR(255)",
    "level": "ALTER TABLE content_posts ADD COLUMN level VARCHAR(64)",
    "program": "ALTER TABLE content_posts ADD COLUMN program VARCHAR(128)",
    "file_url": "ALTER TABLE content_posts ADD COLUMN file_url VARCHAR(1024)",
    "academic_year": "ALTER TABLE content_posts ADD COLUMN academic_year VARCHAR(32)",
    "semester": "ALTER TABLE content_posts ADD COLUMN semester VARCHAR(64)",
    "display_priority": "ALTER TABLE content_posts ADD COLUMN display_priority INTEGER NOT NULL DEFAULT 0",
}


def ensure_content_schema(db: Session):
    """Schema is managed centrally by ORM metadata creation."""
    return None


def _normalize_scope_text(value: str) -> str:
    if not value:
        return ""
    text = str(value).translate(str.maketrans("\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669", "0123456789")).lower()
    replacements = {
        "\u0623": "\u0627",
        "\u0625": "\u0627",
        "\u0622": "\u0627",
        "\u0649": "\u064a",
        "\u0629": "\u0647",
        "\u0624": "\u0648",
        "\u0626": "\u064a",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return " ".join(text.split())


def _digits_only(value: str) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _extract_college(scope: str) -> str:
    raw = str(scope or "")
    english = re.search(r"college\s*:\s*([^|]+)", raw, re.IGNORECASE)
    if english:
        return (english.group(1) or "").strip()
    arabic = re.search(r"\u0643\u0644\u064a\u0629\s+([^|\-]+)", raw)
    if arabic:
        return f"\u0643\u0644\u064a\u0629 {(arabic.group(1) or '').strip()}".strip()
    return ""


def _canonical_college_key(value: str) -> str:
    text = _normalize_scope_text(value or "")
    raw = str(value or "")
    if not text:
        return ""
    if "computer science" in text or "\u0639\u0644\u0648\u0645 \u0627\u0644\u062d\u0627\u0633\u0628" in raw or "\u062d\u0627\u0633\u0628" in text:
        return "computer_science"
    if "engineering" in text or "\u0647\u0646\u062f\u0633" in text:
        return "engineering"
    if "business" in text or "\u0627\u062f\u0627\u0631\u0647 \u0627\u0639\u0645\u0627\u0644" in text or "\u062a\u062c\u0627\u0631\u0647" in text:
        return "business"
    if "medicine" in text or "\u0637\u0628" in text:
        return "medicine"
    if "pharmacy" in text or "\u0635\u064a\u062f\u0644" in text:
        return "pharmacy"
    if "dentistry" in text or "\u0627\u0633\u0646\u0627\u0646" in text:
        return "dentistry"
    return ""


def _matches_scope(user: User, target_level: str | None) -> bool:
    scope = str(target_level or "").strip()
    if not scope:
        return True

    normalized_scope = _normalize_scope_text(scope)
    if normalized_scope in {"all", "\u0627\u0644\u0643\u0644", "\u0639\u0627\u0645", "\u062c\u0645\u064a\u0639 \u0627\u0644\u0645\u0633\u062a\u0648\u064a\u0627\u062a"}:
        return True

    user_level = _normalize_scope_text(getattr(user, "level", "") or "")
    if not user_level:
        return True

    target_college = _normalize_scope_text(_extract_college(scope))
    user_college = _normalize_scope_text(getattr(user, "college", "") or "")
    if target_college:
        if not user_college:
            return False
        target_college_key = _canonical_college_key(target_college)
        user_college_key = _canonical_college_key(user_college)
        if target_college_key and user_college_key:
            if target_college_key != user_college_key:
                return False
        elif user_college not in target_college and target_college not in user_college:
            return False

    if user_level in normalized_scope or normalized_scope in user_level:
        return True

    user_digits = _digits_only(user_level)
    scope_digits = _digits_only(normalized_scope)
    return bool(user_digits and scope_digits and user_digits == scope_digits)


def _extract_storage_file_names(value: str | None) -> set[str]:
    return {str(match).strip() for match in _STORAGE_FILE_ROUTE_RE.findall(str(value or "")) if str(match).strip()}


def _delete_storage_vector_document(item_id: int):
    try:
        from routers.chatbot import rag_chatbot as global_rag_chatbot
    except Exception:
        return

    if global_rag_chatbot is None or getattr(global_rag_chatbot, "vector_store", None) is None:
        return

    vector_store = global_rag_chatbot.vector_store
    document_id = f"storage:{item_id}"
    try:
        if hasattr(vector_store, "delete"):
            vector_store.delete(where={"document_id": document_id})
    except Exception:
        pass


def _purge_storage_item_for_content(db: Session, item: StorageItem | None, seen_ids: set[int] | None = None):
    if item is None:
        return

    item_id = int(getattr(item, "id", 0) or 0)
    if item_id <= 0:
        return

    if seen_ids is not None:
        if item_id in seen_ids:
            return
        seen_ids.add(item_id)

    stored_name = Path(str(item.stored_name or "")).name if str(item.stored_name or "").strip() else ""
    if stored_name:
        try:
            from routers.storage import STORAGE_FILES_DIR
            file_path = (STORAGE_FILES_DIR / stored_name).resolve()
            if file_path.exists() and str(file_path).startswith(str(STORAGE_FILES_DIR.resolve())):
                file_path.unlink(missing_ok=True)
        except Exception:
            pass

    _delete_storage_vector_document(item_id)
    db.delete(item)


@router.get("", response_model=List[ContentResponse])
async def list_content(
    level_filter: str | None = None,
    category_filter: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all content posts. Students only see posts matching their scope."""
    ensure_content_schema(db)
    query = db.query(ContentPost)

    if category_filter:
        query = query.filter(ContentPost.category == category_filter)
    if current_user.role != "student" and level_filter:
        query = query.filter(ContentPost.target_level == level_filter)

    rows = query.order_by(ContentPost.created_at.desc()).all()
    if current_user.role == "student":
        rows = [row for row in rows if _matches_scope(current_user, row.target_level)]

    return rows[skip : skip + limit]


@router.post(
    "",
    response_model=ContentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin"))],
)
async def create_content(
    content_in: ContentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create new announcement/article."""
    ensure_content_schema(db)
    post = ContentPost(author_id=current_user.id, **content_in.model_dump())
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


@router.patch("/{post_id}", response_model=ContentResponse, dependencies=[Depends(require_role("admin"))])
async def update_content(
    post_id: int,
    content_in: ContentUpdate,
    db: Session = Depends(get_db),
):
    """Update an existing announcement/article."""
    ensure_content_schema(db)
    post = db.query(ContentPost).filter(ContentPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Content post not found")

    update_data = content_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(post, field, value)

    db.commit()
    db.refresh(post)
    return post


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_role("admin"))])
async def delete_content(post_id: int, db: Session = Depends(get_db)):
    """Delete an announcement/article and purge linked storage traces."""
    ensure_content_schema(db)
    post = db.query(ContentPost).filter(ContentPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Content post not found")

    seen_storage_ids: set[int] = set()
    for stored_name in _extract_storage_file_names(getattr(post, "body", None)):
        linked_item = db.query(StorageItem).filter(StorageItem.stored_name == Path(stored_name).name).first()
        _purge_storage_item_for_content(db, linked_item, seen_storage_ids)

    placeholder_item = next(
        (
            item
            for item in db.query(StorageItem).all()
            if str(item.file_name or "").strip() == str(post.subject or "").strip()
            and str(item.level or "").strip() == str(post.target_level or "").strip()
            and str(item.category or "").strip() == str(post.category or "").strip()
        ),
        None,
    )
    _purge_storage_item_for_content(db, placeholder_item, seen_storage_ids)

    db.delete(post)
    db.commit()
    return None
