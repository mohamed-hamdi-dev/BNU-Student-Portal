"""
Storage Router.
Handles files metadata posted by admins to specific student scopes.
"""

from pathlib import Path
from typing import List
import re
from uuid import uuid4
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text
from fastapi.responses import FileResponse

from core.deps import get_db, get_current_user, require_role, resolve_authenticated_user_from_token, security_scheme
from models.user import User
from models.storage import StorageItem
from models.content import ContentPost
from schemas.storage import StorageCreate, StorageUpdate, StorageResponse
from services.document_ingestion import (
    IMAGE_EXTENSIONS,
    INDEXABLE_EXTENSIONS,
    delete_document_vectors,
    ensure_supported_upload,
    ensure_upload_content,
    index_prepared_document,
    prepare_indexable_document,
    prepare_indexable_document_from_existing,
    save_uploaded_binary,
)

router = APIRouter(prefix="/storage", tags=["storage"])
STORAGE_FILES_DIR = Path(__file__).resolve().parent.parent / "storage_files"
STORAGE_FILES_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_UPLOAD_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".pdf", ".docx"}
PUBLIC_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
_STORAGE_FILE_ROUTE_RE = re.compile(r"/api/storage/files/([^/?#]+)", re.IGNORECASE)


def _rag_retrieval_ready() -> bool:
    try:
        from routers.chatbot import rag_chatbot
    except Exception:
        return False
    return bool(rag_chatbot is not None and getattr(rag_chatbot, "vector_store", None) is not None)


def ensure_storage_schema(db: Session):
    existing = {col["name"] for col in inspect(db.bind).get_columns("storage_items")}
    dialect = str(getattr(db.bind.dialect, "name", "") or "").lower()

    # All columns that might need adding with their DDL types
    new_columns = {
        "file_bytes": "BYTEA" if dialect == "postgresql" else "BLOB",
        "extracted_text": "TEXT",
        "chunks_count": "INTEGER DEFAULT 0",
        "indexing_status": "VARCHAR(32) DEFAULT 'pending'",
        "indexing_error": "TEXT",
        "college": "VARCHAR(200)",
        "program": "VARCHAR(200)",
        "academic_year": "VARCHAR(40)",
        "semester": "VARCHAR(40)",
        "keywords": "VARCHAR(500)",
        "priority": "INTEGER DEFAULT 0",
        "source_type": "VARCHAR(40)",
        "content_type": "VARCHAR(100)",
    }

    for col_name, col_ddl in new_columns.items():
        if col_name not in existing:
            try:
                db.execute(text(f"ALTER TABLE storage_items ADD COLUMN {col_name} {col_ddl}"))
                db.commit()
            except Exception:
                db.rollback()


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


def _extract_level_scope_value(scope: str) -> str:
    raw = str(scope or "").strip()
    if not raw:
        return ""
    english = re.search(r"level\s*:?\s*([^|]+)", raw, re.IGNORECASE)
    if english:
        return (english.group(1) or "").strip()
    arabic = re.search(r"(\u0627\u0644\u0633\u0646\u0629\s+[^\-|]+)", raw)
    if arabic:
        return (arabic.group(1) or "").strip()
    digits = re.search(r"(\d+)", raw)
    if digits:
        return (digits.group(1) or "").strip()
    return ""


def _canonical_level_digits(value: str) -> str:
    normalized = _normalize_scope_text(value or "")
    digits = _digits_only(normalized)
    if digits:
        return digits
    aliases = {
        "السنه الاولي": "1",
        "السنة الاولى": "1",
        "السنة الأولى": "1",
        "الاولى": "1",
        "الأولى": "1",
        "اولى": "1",
        "السنه الثانيه": "2",
        "السنة الثانية": "2",
        "الثانيه": "2",
        "الثانية": "2",
        "ثانيه": "2",
        "السنه الثالثه": "3",
        "السنة الثالثة": "3",
        "الثالثه": "3",
        "الثالثة": "3",
        "ثالثه": "3",
        "السنه الرابعه": "4",
        "السنة الرابعة": "4",
        "الرابعه": "4",
        "الرابعة": "4",
        "رابعه": "4",
    }
    for alias, canonical in aliases.items():
        if alias in normalized:
            return canonical
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


def _infer_access_scope(level_value: str | None) -> str:
    normalized = _normalize_scope_text(level_value or "")
    if not normalized or normalized in {"all", "\u0627\u0644\u0643\u0644", "\u0639\u0627\u0645", "\u062c\u0645\u064a\u0639 \u0627\u0644\u0645\u0633\u062a\u0648\u064a\u0627\u062a"}:
        return "public"
    return "level"


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


def _purge_storage_item(db: Session, item: StorageItem | None, seen_ids: set[int] | None = None):
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
        file_path = (STORAGE_FILES_DIR / stored_name).resolve()
        try:
            if file_path.exists() and str(file_path).startswith(str(STORAGE_FILES_DIR.resolve())):
                file_path.unlink(missing_ok=True)
        except Exception:
            pass

    _delete_storage_vector_document(item_id)
    db.delete(item)


def _matches_scope(user: User, scope_value: str | None) -> bool:
    scope = str(scope_value or "").strip()
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

    user_digits = _canonical_level_digits(user_level)
    scope_digits = _canonical_level_digits(_extract_level_scope_value(scope) or normalized_scope)
    return bool(user_digits and scope_digits and user_digits == scope_digits)


def get_current_user_for_file_access(
    request: Request,
    token: str | None = Query(default=None),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Authenticate file access either by Bearer header or token query param.
    """
    raw_token = credentials.credentials if credentials else (token or "").strip()
    if not raw_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return resolve_authenticated_user_from_token(raw_token, db)


def _is_admin_user(user: User) -> bool:
    return str(getattr(user, "role", "") or "").strip().lower() == "admin"


def _can_access_storage_item_file(user: User, item: StorageItem) -> bool:
    if _is_admin_user(user):
        return True

    owner_id = getattr(item, "owner_id", None)
    if owner_id is not None and str(owner_id) == str(getattr(user, "id", "")):
        return True

    user_role = str(getattr(user, "role", "") or "").strip().lower()
    if user_role == "student":
        return _matches_scope(user, item.level)

    return False


@router.get("", response_model=List[StorageResponse])
async def list_storage(
    level_filter: str | None = None,
    category_filter: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get storage metadata. Students see records matching their scope."""
    ensure_storage_schema(db)
    query = db.query(StorageItem)

    if category_filter:
        query = query.filter(StorageItem.category == category_filter)
    if current_user.role != "student" and level_filter:
        query = query.filter(StorageItem.level == level_filter)

    rows = query.order_by(StorageItem.is_favorite.desc(), StorageItem.created_at.desc()).all()
    if current_user.role == "student":
        rows = [row for row in rows if _matches_scope(current_user, row.level)]

    return rows[skip : skip + limit]


@router.post("", response_model=StorageResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin"))])
async def create_storage_item(
    item_in: StorageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a new storage metadata row."""
    ensure_storage_schema(db)
    item = StorageItem(owner_id=current_user.id, **item_in.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/upload-and-index", dependencies=[Depends(require_role("admin"))], status_code=status.HTTP_201_CREATED)
async def upload_and_index_storage_pdf(
    file: UploadFile = File(...),
    file_name: str | None = Form(None),
    level: str | None = Form(None),
    category: str | None = Form(None),
    is_favorite: bool = Form(False),
    replace_existing: bool = Form(False),
    # Extended metadata fields
    college: str | None = Form(None),
    program: str | None = Form(None),
    academic_year: str | None = Form(None),
    semester: str | None = Form(None),
    keywords: str | None = Form(None),
    priority: int = Form(0),
    content_type: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a storage file, create a storage row, and index PDF/DOCX files for chatbot retrieval.

    Set replace_existing=true to delete old vectors before indexing (Replace mode).
    Images are stored as regular storage items without indexing so they can be previewed/shared later.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    original_name = Path(file.filename).name
    ext = ensure_supported_upload(original_name)

    content = await file.read()
    ensure_upload_content(content)

    ensure_storage_schema(db)
    prepared = None
    if ext in INDEXABLE_EXTENSIONS:
        prepared = prepare_indexable_document(content=content, original_name=original_name, storage_dir=STORAGE_FILES_DIR)
        stored_name = prepared.stored_name
    else:
        stored_name, _ = save_uploaded_binary(content, original_name, STORAGE_FILES_DIR)

    normalized_level = str(level or "").strip() or None
    normalized_college = str(college or "").strip() or None
    normalized_program = str(program or "").strip() or None
    normalized_academic_year = str(academic_year or "").strip() or None
    normalized_semester = str(semester or "").strip() or None
    normalized_keywords = str(keywords or "").strip() or None
    normalized_content_type = str(content_type or "").strip() or None

    item = StorageItem(
        file_name=str(file_name or original_name).strip() or original_name,
        level=normalized_level,
        category=str(category or "").strip() or None,
        is_favorite=bool(is_favorite),
        is_indexed=False,
        indexing_status="pending",
        stored_name=stored_name,
        file_bytes=content,
        owner_id=current_user.id,
        source_type=ext.lstrip(".") if ext else None,
        # Extended metadata
        college=normalized_college,
        program=normalized_program,
        academic_year=normalized_academic_year,
        semester=normalized_semester,
        keywords=normalized_keywords,
        priority=priority,
        content_type=normalized_content_type,
    )

    # Store extracted text for preview
    if prepared:
        item.extracted_text = prepared.extracted_text
        item.chunks_count = len(prepared.documents)

    db.add(item)
    db.commit()
    db.refresh(item)

    if ext in IMAGE_EXTENSIONS:
        item.indexing_status = "indexed"
        db.add(item)
        db.commit()
        db.refresh(item)
        return {
            "item": StorageResponse.model_validate(item),
            "file": {
                "url": f"/api/storage/files/{stored_name}",
                "file_name": original_name,
                "stored_name": stored_name,
                "uploaded_by": current_user.id,
            },
            "pages_indexed": 0,
            "chunks_indexed": 0,
            "source": "storage_image",
            "extraction_warnings": [],
        }

    indexed_now = False
    indexing_message = None
    indexing_error = None
    if _rag_retrieval_ready():
        from routers.chatbot import rag_chatbot

        # Replace mode: delete old vectors first
        if replace_existing:
            document_id = f"storage:{item.id}"
            delete_document_vectors(rag_chatbot, document_id)

        access_scope = _infer_access_scope(normalized_level)
        college_text = normalized_college or _extract_college(normalized_level or "")
        level_scope_value = _extract_level_scope_value(normalized_level or "")
        base_metadata = {
            "document_id": f"storage:{item.id}",
            "source": "storage_pdf",
            "source_type": prepared.source_type,
            "access_scope": access_scope,
            "level": _normalize_scope_text(level_scope_value or normalized_level or "") or None,
            "college": college_text or None,
            "college_key": _canonical_college_key(college_text),
            "category": str(category or "").strip().lower() or None,
            "storage_item_id": item.id,
            "storage_file_name": item.file_name,
            "owner_id": current_user.id,
            "stored_name": stored_name,
            "file_url": f"/api/storage/files/{stored_name}",
            # Extended metadata in vectors
            "program": normalized_program,
            "academic_year": normalized_academic_year,
            "semester": normalized_semester,
            "keywords": normalized_keywords,
            "priority": str(priority),
            "content_type": normalized_content_type,
        }
        # Remove None values from metadata (ChromaDB doesn't accept None)
        base_metadata = {k: v for k, v in base_metadata.items() if v is not None}
        try:
            index_prepared_document(rag_chatbot, prepared, base_metadata)
            indexed_now = True
        except Exception as exc:
            indexed_now = False
            indexing_error = str(exc)
            indexing_message = f"Document uploaded, but indexing failed: {indexing_error}"
    else:
        indexing_message = "Document uploaded, but RAG indexing is not ready yet."

    now = datetime.now(timezone.utc)
    if indexed_now:
        item.is_indexed = True
        item.indexing_status = "indexed"
        item.indexing_error = None
    else:
        item.indexing_status = "failed" if indexing_error else "pending"
        item.indexing_error = indexing_error
    item.updated_at = now
    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "item": StorageResponse.model_validate(item),
        "file": {
            "url": f"/api/storage/files/{stored_name}",
            "file_name": original_name,
            "stored_name": stored_name,
            "uploaded_by": current_user.id,
        },
        "pages_indexed": len(prepared.pages),
        "chunks_indexed": len(prepared.documents) if indexed_now else 0,
        "source": "storage_pdf",
        "indexing_ready": indexed_now,
        "message": indexing_message or "Document uploaded and indexed successfully.",
        "extracted_text_preview": (prepared.extracted_text[:500] + "...") if prepared and len(prepared.extracted_text) > 500 else (prepared.extracted_text if prepared else ""),
        "extraction_warnings": prepared.extraction_warnings if prepared else [],
    }


@router.post("/{item_id}/index", dependencies=[Depends(require_role("admin"))], status_code=status.HTTP_200_OK)
async def index_existing_storage_pdf(
    item_id: int,
    replace_existing: bool = Form(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-index an existing stored PDF/DOCX file. Deletes old vectors by default (replace mode)."""
    ensure_storage_schema(db)
    item = db.query(StorageItem).filter(StorageItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="File not found")

    stored_name = str(item.stored_name or "").strip()
    if not stored_name:
        raise HTTPException(status_code=400, detail="This file has no stored binary reference. Re-upload required.")

    file_path = (STORAGE_FILES_DIR / Path(stored_name).name).resolve()
    if not str(file_path).startswith(str(STORAGE_FILES_DIR.resolve())):
        raise HTTPException(status_code=404, detail="Stored file not found on disk.")
    ext = file_path.suffix.lower()
    content = file_path.read_bytes() if file_path.exists() else (bytes(item.file_bytes) if item.file_bytes else b"")
    if not content:
        raise HTTPException(status_code=404, detail="Stored file not found on disk.")
    if ext == ".doc":
        raise HTTPException(status_code=400, detail="DOC files are not supported. Please re-upload as DOCX or PDF.")
    if ext not in INDEXABLE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PDF or DOCX files can be indexed.")

    try:
        prepared = prepare_indexable_document_from_existing(content=content, original_name=Path(stored_name).name, stored_name=stored_name)
    except Exception as exc:
        item.indexing_status = "failed"
        item.indexing_error = str(exc)
        item.updated_at = datetime.now(timezone.utc)
        db.add(item)
        db.commit()
        db.refresh(item)
        raise HTTPException(status_code=400, detail=f"Text extraction failed: {exc}")

    if not _rag_retrieval_ready():
        raise HTTPException(status_code=409, detail="RAG indexing is not ready yet. Try again after the AI retriever starts.")

    from routers.chatbot import rag_chatbot

    document_id = f"storage:{item.id}"

    # Delete old vectors first (replace mode)
    if replace_existing:
        delete_document_vectors(rag_chatbot, document_id)

    normalized_level = str(item.level or "").strip() or None
    access_scope = _infer_access_scope(normalized_level)
    college_text = str(getattr(item, "college", "") or "").strip() or _extract_college(normalized_level or "")
    level_scope_value = _extract_level_scope_value(normalized_level or "")
    base_metadata = {
        "document_id": document_id,
        "source": "storage_pdf",
        "source_type": prepared.source_type,
        "access_scope": access_scope,
        "level": _normalize_scope_text(level_scope_value or normalized_level or "") or None,
        "college": college_text or None,
        "college_key": _canonical_college_key(college_text),
        "category": str(item.category or "").strip().lower() or None,
        "storage_item_id": item.id,
        "storage_file_name": item.file_name,
        "owner_id": current_user.id,
        "stored_name": stored_name,
        "file_url": f"/api/storage/files/{stored_name}",
        # Extended metadata
        "program": str(getattr(item, "program", "") or "").strip() or None,
        "academic_year": str(getattr(item, "academic_year", "") or "").strip() or None,
        "semester": str(getattr(item, "semester", "") or "").strip() or None,
        "keywords": str(getattr(item, "keywords", "") or "").strip() or None,
        "priority": str(getattr(item, "priority", 0) or 0),
        "content_type": str(getattr(item, "content_type", "") or "").strip() or None,
    }
    # Remove None values
    base_metadata = {k: v for k, v in base_metadata.items() if v is not None}

    try:
        index_prepared_document(rag_chatbot, prepared, base_metadata)
    except Exception as exc:
        item.indexing_status = "failed"
        item.indexing_error = str(exc)
        item.updated_at = datetime.now(timezone.utc)
        db.add(item)
        db.commit()
        db.refresh(item)
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}")

    item.is_indexed = True
    item.indexing_status = "indexed"
    item.indexing_error = None
    item.extracted_text = prepared.extracted_text
    item.chunks_count = len(prepared.documents)
    item.updated_at = datetime.now(timezone.utc)
    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "item": StorageResponse.model_validate(item),
        "pages_indexed": len(prepared.pages),
        "chunks_indexed": len(prepared.documents),
        "source": "storage_pdf",
        "extracted_text_preview": (prepared.extracted_text[:500] + "...") if len(prepared.extracted_text) > 500 else prepared.extracted_text,
        "extraction_warnings": prepared.extraction_warnings,
    }


@router.patch("/{item_id}", response_model=StorageResponse, dependencies=[Depends(require_role("admin"))])
async def update_storage_item(
    item_id: int,
    item_in: StorageUpdate,
    db: Session = Depends(get_db),
):
    """Rename or mark storage item as favorite."""
    ensure_storage_schema(db)
    item = db.query(StorageItem).filter(StorageItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="File not found")

    update_data = item_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_role("admin"))])
async def delete_storage_item(item_id: int, db: Session = Depends(get_db)):
    """Delete storage item, file binary, vector chunks, and linked content traces."""
    ensure_storage_schema(db)
    item = db.query(StorageItem).filter(StorageItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="File not found")

    linked_posts: list[ContentPost] = []
    current_stored_name = Path(str(item.stored_name or "")).name if str(item.stored_name or "").strip() else ""
    normalized_file_name = str(item.file_name or "").strip()
    for post in db.query(ContentPost).all():
        body_refs = _extract_storage_file_names(getattr(post, "body", None))
        subject_match = (
            normalized_file_name
            and str(post.subject or "").strip() == normalized_file_name
            and str(post.target_level or "").strip() == str(item.level or "").strip()
            and str(post.category or "").strip() == str(item.category or "").strip()
        )
        if (current_stored_name and current_stored_name in body_refs) or subject_match:
            linked_posts.append(post)

    seen_storage_ids: set[int] = set()
    for post in linked_posts:
        for stored_name in _extract_storage_file_names(getattr(post, "body", None)):
            linked_item = db.query(StorageItem).filter(StorageItem.stored_name == Path(stored_name).name).first()
            _purge_storage_item(db, linked_item, seen_storage_ids)
        db.delete(post)

    _purge_storage_item(db, item, seen_storage_ids)
    db.commit()
    return None


@router.post("/upload-file", dependencies=[Depends(require_role("admin"))])
async def upload_storage_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a file and return API URL for attachment usage."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    original_name = Path(file.filename).name
    ext = Path(original_name).suffix.lower()
    safe_ext = ext if ext else ".bin"
    stored_name = f"{uuid4().hex}{safe_ext}"
    destination = STORAGE_FILES_DIR / stored_name

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file is not allowed")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File is too large (max 10MB)")

    destination.write_bytes(content)
    return {
        "url": f"/api/storage/files/{stored_name}",
        "file_name": original_name,
        "stored_name": stored_name,
        "uploaded_by": current_user.id,
    }


@router.post("/upload-public")
async def upload_public_storage_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a public attachment for authenticated users (e.g. bank receipts)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    original_name = Path(file.filename).name
    ext = Path(original_name).suffix.lower()
    if ext not in PUBLIC_UPLOAD_ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, PNG, PDF are allowed")

    stored_name = f"{uuid4().hex}{ext}"
    destination = STORAGE_FILES_DIR / stored_name

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file is not allowed")
    if len(content) > PUBLIC_UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File is too large (max 10MB)")

    destination.write_bytes(content)
    return {
        "url": f"/api/storage/files/{stored_name}",
        "file_name": original_name,
        "stored_name": stored_name,
        "uploaded_by": current_user.id,
    }


@router.get("/files/{stored_name}")
async def serve_storage_file(
    stored_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_for_file_access),
):
    """Serve uploaded storage files (authenticated users only)."""
    ensure_storage_schema(db)
    file_path = (STORAGE_FILES_DIR / Path(stored_name).name).resolve()
    if not str(file_path).startswith(str(STORAGE_FILES_DIR.resolve())):
        raise HTTPException(status_code=404, detail="File not found")

    item = db.query(StorageItem).filter(StorageItem.stored_name == Path(stored_name).name).first()
    if item is not None and not _can_access_storage_item_file(current_user, item):
        raise HTTPException(status_code=403, detail="You are not allowed to access this file.")

    media_type = None
    if file_path.suffix.lower() == ".pdf":
        media_type = "application/pdf"
    elif file_path.suffix.lower() == ".docx":
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif file_path.suffix.lower() == ".png":
        media_type = "image/png"
    elif file_path.suffix.lower() in {".jpg", ".jpeg"}:
        media_type = "image/jpeg"
    elif file_path.suffix.lower() == ".webp":
        media_type = "image/webp"
    elif file_path.suffix.lower() == ".gif":
        media_type = "image/gif"
    if file_path.exists():
        return FileResponse(
            path=file_path,
            filename=file_path.name,
            media_type=media_type,
            content_disposition_type="inline",
        )

    if item is not None and item.file_bytes:
        return Response(
            content=bytes(item.file_bytes),
            media_type=media_type or "application/octet-stream",
            headers={"Content-Disposition": f'inline; filename="{Path(stored_name).name}"'},
        )

    raise HTTPException(status_code=404, detail="File not found")
