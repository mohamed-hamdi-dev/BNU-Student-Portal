import asyncio
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import os
import re
import uuid
import unicodedata
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime, timezone
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from types import SimpleNamespace

from gpa_calculator import calculate_gpa, GPACourse
from routers import (
    auth_router, users_router, conversations_router, messages_router, 
    dashboard_router, feedback_router, content_router, storage_router, 
    settings_router, campus_router, ai_router, courses_router, quizzes_router, academic_router, academic_core_router, payment_router, maintenance_router, knowledge_router, attendance_router
)
from routers.ai_router import rag_chatbot as router_rag_chatbot
from core.deps import get_current_user, get_db
from models.user import User
from models.content import ContentPost
from models.conversation import Conversation, Message
from models.storage import StorageItem
from models.knowledge import Asset as KnowledgeAsset, ChunkAssetMap
from core.database import create_all_tables
from core.database import SessionLocal
from core.config import get_settings
from routers.academic_core import ensure_academic_core_schema, seed_default_assessment_templates

load_dotenv(Path(__file__).resolve().parent / ".env", override=True)
settings = get_settings()
DEBUG_MODE = True

app = FastAPI(title="BNU Student Portal Backend API", version="2.0.0")

# API Routers (V2 architecture)
app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(conversations_router, prefix="/api")
app.include_router(messages_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")
app.include_router(content_router, prefix="/api")
app.include_router(storage_router, prefix="/api")
app.include_router(settings_router, prefix="/api")

# Application Domain Routers
app.include_router(campus_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(courses_router, prefix="/api")
app.include_router(quizzes_router, prefix="/api")
app.include_router(academic_router, prefix="/api")
app.include_router(academic_core_router, prefix="/api")
app.include_router(payment_router, prefix="/api")
app.include_router(maintenance_router, prefix="/api")
app.include_router(knowledge_router, prefix="/api")
app.include_router(attendance_router, prefix="/api")

# CORS middleware
allowed_origins = {
    "http://localhost:3000",
    "http://localhost:4173",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:4173",
    "http://127.0.0.1:5173",
    "https://localhost:3000",
    "https://localhost:4173",
    "https://localhost:5173",
    "https://127.0.0.1:3000",
    "https://127.0.0.1:4173",
    "https://127.0.0.1:5173",
}
allowed_origins.update(origin.strip() for origin in settings.CORS_ORIGINS if origin and origin.strip())

app.add_middleware(
    CORSMiddleware,
    # Support localhost, LAN dev origins, and Vercel previews/production.
    allow_origins=sorted(allowed_origins),
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|.*\.vercel\.app)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize RAG chatbot
rag_chatbot = router_rag_chatbot

@app.on_event("startup")
async def startup_event():
    # Initialize ORM-managed tables for the configured database engine.
    print(f"Initializing database at: {settings.DATABASE_URL}")
    create_all_tables()
    db = SessionLocal()
    try:
        ensure_academic_core_schema(db)
        seed_default_assessment_templates(db)
    finally:
        db.close()
    print("Database tables ensured.")

    # ── Auto-reindex RAG on startup ──────────────────────────────
    # ChromaDB is local/ephemeral on Railway, so after each deploy
    # the vector store is empty. This reindexes all stored documents
    # and knowledge chunks automatically.
    # Run as background task so FastAPI can start serving immediately.
    asyncio.create_task(_auto_reindex_rag_on_startup())


async def _auto_reindex_rag_on_startup():
    """Re-index all storage documents and knowledge chunks into RAG if the vector store is empty."""
    from routers.chatbot import rag_chatbot as startup_rag_chatbot

    if startup_rag_chatbot is None:
        print("[RAG Startup] RAG chatbot not initialized, skipping auto-reindex.")
        return

    if startup_rag_chatbot.vector_store is None:
        print("[RAG Startup] Vector store not available, skipping auto-reindex.")
        return

    # Check if the vector store already has data
    try:
        col = getattr(startup_rag_chatbot.vector_store, "_collection", None)
        if col is not None:
            existing_count = col.count()
            if existing_count > 0:
                print(f"[RAG Startup] Vector store already has {existing_count} chunks, skipping auto-reindex.")
                return
        print("[RAG Startup] Vector store is empty, starting auto-reindex...")
    except Exception as exc:
        print(f"[RAG Startup] Could not check vector store count: {exc}, proceeding with reindex...")

    db = SessionLocal()
    total_indexed = 0
    try:
        from services.document_ingestion import (
            prepare_indexable_document_from_existing,
            index_prepared_document,
        )
        from routers.storage import (
            _infer_access_scope,
            _extract_college,
            _extract_level_scope_value,
            _normalize_scope_text,
            _canonical_college_key,
            _normalize_document_priority,
            STORAGE_FILES_DIR,
        )

        # ── 1. Re-index StorageItem documents ──
        items = db.query(StorageItem).filter(
            StorageItem.stored_name.isnot(None),
            StorageItem.stored_name != "",
        ).all()

        print(f"[RAG Startup] Found {len(items)} storage items to check for reindex.")

        for item in items:
            stored_name = str(item.stored_name or "").strip()
            if not stored_name:
                continue

            ext = Path(stored_name).suffix.lower()
            if ext not in {".pdf", ".docx"}:
                continue

            file_path = (STORAGE_FILES_DIR / Path(stored_name).name).resolve()

            # Try file on disk first, then file_bytes from DB
            content = None
            if file_path.exists():
                try:
                    content = file_path.read_bytes()
                except Exception:
                    pass
            if not content and item.file_bytes:
                content = bytes(item.file_bytes)
            if not content:
                print(f"[RAG Startup]   ⚠ Skip item {item.id} ({item.file_name}): no file content available")
                continue

            try:
                prepared = prepare_indexable_document_from_existing(
                    content=content,
                    original_name=Path(stored_name).name,
                    stored_name=stored_name,
                )
            except Exception as exc:
                print(f"[RAG Startup]   ⚠ Skip item {item.id} ({item.file_name}): extraction failed: {exc}")
                continue

            normalized_level = str(item.level or "").strip() or None
            access_scope = _infer_access_scope(normalized_level)
            college_text = str(getattr(item, "college", "") or "").strip() or _extract_college(normalized_level or "")
            level_scope_value = _extract_level_scope_value(normalized_level or "")
            normalized_content_type, normalized_priority = _normalize_document_priority(
                file_name=str(item.file_name or stored_name).strip() or stored_name,
                category=str(item.category or "").strip() or None,
                content_type=str(getattr(item, "content_type", "") or "").strip() or None,
                priority=int(getattr(item, "priority", 0) or 0),
                keywords=str(getattr(item, "keywords", "") or "").strip() or None,
            )

            base_metadata = {
                "document_id": f"storage:{item.id}",
                "source": "storage_pdf",
                "source_type": prepared.source_type,
                "access_scope": access_scope,
                "level": _normalize_scope_text(level_scope_value or normalized_level or "") or None,
                "college": college_text or None,
                "college_key": _canonical_college_key(college_text),
                "category": str(item.category or "").strip().lower() or None,
                "storage_item_id": item.id,
                "storage_file_name": item.file_name,
                "owner_id": item.owner_id,
                "stored_name": stored_name,
                "file_url": f"/api/storage/files/{stored_name}",
                "program": str(getattr(item, "program", "") or "").strip() or None,
                "academic_year": str(getattr(item, "academic_year", "") or "").strip() or None,
                "semester": str(getattr(item, "semester", "") or "").strip() or None,
                "keywords": str(getattr(item, "keywords", "") or "").strip() or None,
                "priority": str(normalized_priority),
                "content_type": normalized_content_type,
            }
            base_metadata = {k: v for k, v in base_metadata.items() if v is not None}

            try:
                index_prepared_document(startup_rag_chatbot, prepared, base_metadata)
                total_indexed += len(prepared.documents)
                print(f"[RAG Startup]   ✅ Indexed item {item.id} ({item.file_name}): {len(prepared.documents)} chunks")
            except Exception as exc:
                print(f"[RAG Startup]   ❌ Failed to index item {item.id} ({item.file_name}): {exc}")

        # ── 2. Re-index Knowledge chunks ──
        try:
            from models.knowledge import KnowledgeChunk, KnowledgeDocument, ContentItem as KnowledgeContentItem

            knowledge_chunks = db.query(KnowledgeChunk).all()
            if knowledge_chunks:
                print(f"[RAG Startup] Found {len(knowledge_chunks)} knowledge chunks to reindex.")
                chunk_texts = []
                chunk_metas = []
                for chunk in knowledge_chunks:
                    text = str(chunk.chunk_text or "").strip()
                    if not text:
                        continue
                    chunk_texts.append(text)
                    chunk_metas.append({
                        "document_id": f"knowledge:{chunk.knowledge_document_id}",
                        "source": "knowledge_text",
                        "source_type": "text",
                        "content_item_id": chunk.content_item_id,
                        "knowledge_document_id": chunk.knowledge_document_id,
                        "knowledge_chunk_id": chunk.id,
                        "vector_ref": chunk.vector_ref,
                        "college": chunk.college,
                        "college_key": _canonical_college_key(chunk.college or ""),
                        "level": chunk.year,
                        "category": (chunk.subject or "").strip().lower() or None,
                        "access_scope": "public",
                    })

                if chunk_texts:
                    # Remove None values from all metadata dicts
                    chunk_metas = [{k: v for k, v in m.items() if v is not None} for m in chunk_metas]
                    startup_rag_chatbot.index_documents(chunk_texts, metadatas=chunk_metas)
                    startup_rag_chatbot.flush()
                    total_indexed += len(chunk_texts)
                    print(f"[RAG Startup]   ✅ Indexed {len(chunk_texts)} knowledge chunks")
        except Exception as exc:
            print(f"[RAG Startup]   ⚠ Knowledge reindex skipped: {exc}")

        print(f"[RAG Startup] Auto-reindex complete. Total chunks indexed: {total_indexed}")
    except Exception as exc:
        print(f"[RAG Startup] Auto-reindex failed: {exc}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


# ==================== GPA Calculator Endpoints ====================

class CourseInput(BaseModel):
    name: str = Field(..., description="Course name")
    credits: float = Field(..., gt=0, description="Number of credits")
    grade: str = Field(..., description="Letter grade (A, B, C, D, F)")

class GPARequest(BaseModel):
    courses: List[CourseInput] = Field(..., description="List of courses")

class GPAResponse(BaseModel):
    gpa: float = Field(..., description="Calculated GPA")
    total_credits: float = Field(..., description="Total credits")
    total_points: float = Field(..., description="Total grade points")

class GradeFromScoreItem(BaseModel):
    item_key: str = Field(..., description="Client correlation key")
    total: float = Field(..., ge=0, description="Achieved total score")
    max_total: float = Field(..., gt=0, description="Maximum total score")

class GradeFromScoreRequest(BaseModel):
    entries: List[GradeFromScoreItem] = Field(..., min_length=1, description="Score entries")

class GradeFromScoreResult(BaseModel):
    item_key: str
    total: float
    max_total: float
    percentage: float
    grade: str

class GradeFromScoreResponse(BaseModel):
    results: List[GradeFromScoreResult]

class LegacyChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    conversation_id: Optional[str] = None
    student_id: Optional[str] = None
    mode: Optional[str] = None
    category: Optional[str] = None
    college: Optional[str] = None
    year: Optional[str] = None
    subject: Optional[str] = None


def _resolve_or_create_general_conversation(
    db: Session,
    current_user: User,
    requested_conversation_id: Optional[str] = None,
) -> Conversation:
    conv: Optional[Conversation] = None
    if requested_conversation_id:
        conv = (
            db.query(Conversation)
            .filter(Conversation.id == requested_conversation_id, Conversation.type == "general")
            .first()
        )
        if conv and str(current_user.role or "").lower() == "student" and conv.student_id != current_user.id:
            conv = None

    if conv:
        return conv

    conv_id = requested_conversation_id or str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    conv = Conversation(
        id=conv_id,
        student_id=current_user.id,
        assigned_admin_id=None,
        status="active",
        type="general",
        is_student_online=False,
        unread_for_admin=0,
        unread_for_student=0,
        last_message_text=None,
        last_message_at=None,
        created_at=now,
        updated_at=now,
    )
    db.add(conv)
    db.flush()
    return conv


_HTML_TAG_RE = re.compile(r"<[^>]+>")
_IMG_SRC_RE = re.compile(r"<img[^>]+src=[\"']([^\"']+)[\"']", re.IGNORECASE)
_ANCHOR_HREF_RE = re.compile(r"<a[^>]+href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", re.IGNORECASE | re.DOTALL)
_URL_RE = re.compile(r"(https?://[^\s\"'<>]+)", re.IGNORECASE)
_DATA_PDF_RE = re.compile(r"(data:application/pdf[^\\s\"'<>]+)", re.IGNORECASE)
_STORAGE_FILE_ROUTE_RE = re.compile(r"/api/storage/files/([^/?#]+)", re.IGNORECASE)
_STORAGE_FILES_DIR = Path(__file__).resolve().parent / "storage_files"
_ARABIC_DIGIT_TRANS = str.maketrans(
    {
        "\u0660": "0",
        "\u0661": "1",
        "\u0662": "2",
        "\u0663": "3",
        "\u0664": "4",
        "\u0665": "5",
        "\u0666": "6",
        "\u0667": "7",
        "\u0668": "8",
        "\u0669": "9",
        "\u06F0": "0",
        "\u06F1": "1",
        "\u06F2": "2",
        "\u06F3": "3",
        "\u06F4": "4",
        "\u06F5": "5",
        "\u06F6": "6",
        "\u06F7": "7",
        "\u06F8": "8",
        "\u06F9": "9",
        "\u066C": "",
        ",": "",
        " ": "",
    }
)
_ARABIC_QUERY_DIGIT_TRANS = str.maketrans(
    {
        "\u0660": "0",
        "\u0661": "1",
        "\u0662": "2",
        "\u0663": "3",
        "\u0664": "4",
        "\u0665": "5",
        "\u0666": "6",
        "\u0667": "7",
        "\u0668": "8",
        "\u0669": "9",
        "\u06F0": "0",
        "\u06F1": "1",
        "\u06F2": "2",
        "\u06F3": "3",
        "\u06F4": "4",
        "\u06F5": "5",
        "\u06F6": "6",
        "\u06F7": "7",
        "\u06F8": "8",
        "\u06F9": "9",
    }
)
DISPLAY_INTENT_AR_VERBS = ("اعرض", "وريني", "هات", "افتح", "ابعت", "نزل", "اظهر")
DISPLAY_INTENT_EN_VERBS = ("show", "display", "open", "send", "bring")
DISPLAY_TARGET_MARKERS = (
    "جدول",
    "schedule",
    "guide",
    "دليل",
    "لائحه",
    "لائحة",
    "صوره",
    "صورة",
    "image",
    "pdf",
    "docx",
    "ملف",
    "مستند",
)
DISPLAY_TYPE_HINTS = {
    "جدول": "schedule",
    "schedule": "schedule",
    "timetable": "schedule",
    "guide": "guide",
    "دليل": "guide",
    "لائحه": "guide",
    "لائحة": "guide",
    "صوره": "image",
    "صورة": "image",
    "image": "image",
    "pdf": "pdf",
    "docx": "pdf",
}
PROGRAM_ALIASES = {
    "sad": "SAD",
    "software": "SAD",
    "software development": "SAD",
    "ai": "AI",
    "ml": "AI",
    "cs": "CS",
    "cis": "CS",
    "data science": "DS",
    "ds": "DS",
    "cyber": "CY",
    "cybersecurity": "CY",
}
LEVEL_QUERY_ALIASES = {
    "first": "1",
    "1st": "1",
    "second": "2",
    "2nd": "2",
    "third": "3",
    "3rd": "3",
    "fourth": "4",
    "4th": "4",
    "الاولى": "1",
    "الأولى": "1",
    "اولى": "1",
    "الفرقه الاولى": "1",
    "الفرقة الأولى": "1",
    "الفرقه الاولي": "1",
    "الثانيه": "2",
    "الثانية": "2",
    "ثانيه": "2",
    "الفرقه الثانيه": "2",
    "الفرقة الثانية": "2",
    "الثالثه": "3",
    "الثالثة": "3",
    "ثالثه": "3",
    "الفرقه الثالثه": "3",
    "الفرقة الثالثة": "3",
    "الرابعه": "4",
    "الرابعة": "4",
    "رابعه": "4",
    "الفرقه الرابعه": "4",
    "الفرقة الرابعة": "4",
}


def _storage_file_exists_from_url(url: str) -> bool:
    if not url:
        return False
    if url.startswith("data:application/pdf"):
        return True

    parsed = urlparse(url)
    path_value = parsed.path or url
    route_match = _STORAGE_FILE_ROUTE_RE.search(path_value)
    if not route_match:
        return True

    stored_name = Path(route_match.group(1)).name
    file_path = (_STORAGE_FILES_DIR / stored_name).resolve()
    try:
        return file_path.exists() and str(file_path).startswith(str(_STORAGE_FILES_DIR.resolve()))
    except Exception:
        return False


def _normalize_search_text(value: str) -> str:
    if not value:
        return ""
    # Arabic-friendly normalization for better matching (e.g. ط·آ¯ط¸ظ¾ط·آ¹ط·آ©/ط·آ¯ط¸ظ¾ط·آ¹ط¸â€،, ط¸آ¤/4)
    text = value.translate(_ARABIC_DIGIT_TRANS).lower()
    replacements = {
        "ط·آ£": "ط·آ§",
        "ط·آ¥": "ط·آ§",
        "ط·آ¢": "ط·آ§",
        "ط¸â€°": "ط¸ظ¹",
        "ط·آ©": "ط¸â€،",
        "ط·آ¤": "ط¸ث†",
        "ط·آ¦": "ط¸ظ¹",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return " ".join(text.split())


def _normalize_arabic_query(value: str) -> str:
    text = str(value or "").translate(_ARABIC_QUERY_DIGIT_TRANS)
    text = unicodedata.normalize("NFC", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    replacements = {
        "\u0623": "\u0627",
        "\u0625": "\u0627",
        "\u0622": "\u0627",
        "\u0624": "\u0648",
        "\u0626": "\u064a",
        "\u0649": "\u064a",
        "\u0629": "\u0647",
        "\u0640": "",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    text = re.sub(r"[^0-9A-Za-z\u0600-\u06FF\s\-/|]", " ", text)
    return " ".join(text.lower().split())


def _tokenize_normalized_text(value: str) -> List[str]:
    return [term.strip() for term in re.findall(r"[a-z0-9]+|[\u0600-\u06ff]+", _normalize_arabic_query(value or "")) if len(term.strip()) >= 2]


def _split_tags(value: str) -> List[str]:
    return [item.strip() for item in re.split(r"[,،\n]+", str(value or "")) if item.strip()]


def _strip_html(value: str) -> str:
    if not value:
        return ""
    no_tags = _HTML_TAG_RE.sub(" ", value)
    return " ".join(no_tags.split())


def _extract_image_urls(value: str, max_items: int = 2) -> List[str]:
    if not value:
        return []
    urls: List[str] = []
    for match in _IMG_SRC_RE.finditer(value):
        src = (match.group(1) or "").strip()
        if not src:
            continue
        if src.startswith("data:image/"):
            # Guard response size while still allowing inline images from editor.
            if len(src) <= 300000:
                urls.append(src)
        elif src.startswith("/api/storage/files/"):
            if _storage_file_exists_from_url(src):
                urls.append(src)
        elif src.startswith("http://") or src.startswith("https://"):
            urls.append(src)
        if len(urls) >= max_items:
            break
    return urls


def _extract_file_links(value: str, max_items: int = 3) -> List[dict]:
    if not value:
        return []
    links: List[dict] = []
    seen_urls = set()
    for match in _ANCHOR_HREF_RE.finditer(value):
        href = (match.group(1) or "").strip()
        label = _strip_html(match.group(2) or "").strip() or "Attachment"
        if not href:
            continue
        is_pdf = href.lower().endswith(".pdf") or href.startswith("data:application/pdf")
        is_supported = href.startswith("data:") or href.startswith("http://") or href.startswith("https://") or href.startswith("/")
        if not is_supported:
            continue
        if href in seen_urls:
            continue
        if is_pdf and not _storage_file_exists_from_url(href):
            continue
        seen_urls.add(href)
        links.append({"name": label, "url": href, "is_pdf": is_pdf})
        if len(links) >= max_items:
            break

    # Fallback: if file URL was pasted as plain text (not inside <a>), still expose it.
    if len(links) < max_items:
        text = value or ""
        for pattern in (_DATA_PDF_RE, _URL_RE):
            for raw in pattern.findall(text):
                href = (raw or "").strip()
                if not href or href in seen_urls:
                    continue
                is_pdf = href.lower().endswith(".pdf") or href.startswith("data:application/pdf")
                if not is_pdf:
                    continue
                if not _storage_file_exists_from_url(href):
                    continue
                seen_urls.add(href)
                links.append({"name": "PDF Attachment", "url": href, "is_pdf": True})
                if len(links) >= max_items:
                    break
            if len(links) >= max_items:
                break
    return links


def _digits_only(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit())


def _parse_college_from_scope(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    english = re.search(r"college\s*:\s*([^|]+)", raw, re.IGNORECASE)
    if english:
        return (english.group(1) or "").strip()
    arabic = re.search(r"ط¸ئ’ط¸â€‍ط¸ظ¹ط·آ©\s+([^|\-]+)", raw)
    if arabic:
        return f"ط¸ئ’ط¸â€‍ط¸ظ¹ط·آ© {(arabic.group(1) or '').strip()}".strip()
    return ""


def _expand_numeric_student_query(message: str, current_user: User) -> str:
    raw = str(message or "").strip()
    if not raw:
        return raw
    # Accept Arabic/English digits only (e.g. "1", "2", "?")
    normalized = raw.translate(
            {
                ord("\u0660"): "0",
                ord("\u0661"): "1",
                ord("\u0662"): "2",
                ord("\u0663"): "3",
                ord("\u0664"): "4",
                ord("\u0665"): "5",
                ord("\u0666"): "6",
                ord("\u0667"): "7",
                ord("\u0668"): "8",
                ord("\u0669"): "9",
                ord("\u06F0"): "0",
                ord("\u06F1"): "1",
                ord("\u06F2"): "2",
                ord("\u06F3"): "3",
                ord("\u06F4"): "4",
                ord("\u06F5"): "5",
                ord("\u06F6"): "6",
                ord("\u06F7"): "7",
                ord("\u06F8"): "8",
                ord("\u06F9"): "9",
                ord("\u066C"): "",
                ord(","): "",
                ord(" "): "",
            }
    )
    if not normalized.isdigit():
        return raw

    student_college = str(getattr(current_user, "college", "") or "").strip()
    if student_college:
        return f"ط·آ§ط¸â€‍ط¸â€‍ط·آ§ط·آ¦ط·آ­ط·آ© {normalized} - {student_college}"
    return f"ط·آ§ط¸â€‍ط¸â€‍ط·آ§ط·آ¦ط·آ­ط·آ© {normalized}"


def _canonical_college_key(value: str) -> str:
    text = _normalize_search_text(value or "")
    if not text:
        return ""
    if "computer science" in text or "ط·آ¹ط¸â€‍ط¸ث†ط¸â€¦ ط·آ§ط¸â€‍ط·آ­ط·آ§ط·آ³ط·آ¨" in value or "ط·آ­ط·آ§ط·آ³ط·آ¨" in text:
        return "computer_science"
    if "engineering" in text or "ط¸â€،ط¸â€ ط·آ¯ط·آ³" in text:
        return "engineering"
    if "business" in text or "ط·آ§ط·آ¯ط·آ§ط·آ±ط¸â€، ط·آ§ط·آ¹ط¸â€¦ط·آ§ط¸â€‍" in text or "ط·ع¾ط·آ¬ط·آ§ط·آ±ط¸â€،" in text:
        return "business"
    if "medicine" in text or "ط·آ·ط·آ¨" in text:
        return "medicine"
    if "pharmacy" in text or "ط·آµط¸ظ¹ط·آ¯ط¸â€‍" in text:
        return "pharmacy"
    if "dentistry" in text or "ط·آ§ط·آ³ط¸â€ ط·آ§ط¸â€ " in text:
        return "dentistry"
    return ""


_REGULATION_INTENT_TERMS = (
    "ط¸â€‍ط·آ§ط·آ¦ط·آ­ط¸â€،",
    "ط¸â€‍ط·آ§ط·آ¦ط·آ­ط·آ©",
    "ط·آ¯ط¸ظ¾ط·آ¹ط¸â€،",
    "ط·آ¯ط¸ظ¾ط·آ¹ط·آ©",
    "ط·آ§ط¸â€‍ط¸â€¦ط·آ³ط·ع¾ط¸ث†ط¸â€°",
    "ط¸â€¦ط·آ³ط·ع¾ط¸ث†ط¸â€°",
    "level",
    "batch",
    "regulation",
    "college",
    "ط¸ئ’ط¸â€‍ط¸ظ¹ط·آ©",
    "ط·آ§ط¸â€‍ط¸ئ’ط¸â€‍ط¸ظ¹ط¸â€،",
    "تحويل",
    "التحويل",
    "حذف",
    "اضافة",
    "إضافة",
    "انسحاب",
    "انذار",
    "إنذار",
    "تخرج",
    "graduation",
    "transfer",
    "withdraw",
    "warning",
    "عبء",
    "العبء",
    "العبء الأكاديمي",
    "العبء الاكاديمي",
    "الحد الأقصى",
    "الحد الاقصى",
    "الحد الأدنى",
    "الحد الادنى",
    "معدل تراكمي",
    "المعدل التراكمي",
    "ساعات معتمدة",
    "ساعات معتمده",
)

_AR_LEVEL_WORDS_TO_DIGIT = {
    "ط·آ§ط¸â€‍ط·آ§ط¸ث†ط¸â€‍ط¸â€°": "1",
    "ط·آ§ط¸â€‍ط·آ£ط¸ث†ط¸â€‍ط¸â€°": "1",
    "ط·آ§ط¸ث†ط¸â€‍ط¸â€°": "1",
    "ط·آ§ط¸ث†ط¸â€‍ط¸ظ¹": "1",
    "ط·آ§ط¸â€‍ط·آ§ط¸ث†ط¸â€‍": "1",
    "ط·آ§ط¸â€‍ط·آ«ط·آ§ط¸â€ ط¸ظ¹ط¸â€،": "2",
    "ط·آ§ط¸â€‍ط·آ«ط·آ§ط¸â€ ط¸ظ¹ط·آ©": "2",
    "ط·ع¾ط·آ§ط¸â€ ط¸ظ¹ط¸â€،": "2",
    "ط·آ§ط¸â€‍ط·آ«ط·آ§ط¸â€‍ط·آ«ط¸â€،": "3",
    "ط·آ§ط¸â€‍ط·آ«ط·آ§ط¸â€‍ط·آ«ط·آ©": "3",
    "ط·آ§ط¸â€‍ط·آ±ط·آ§ط·آ¨ط·آ¹ط¸â€،": "4",
    "ط·آ§ط¸â€‍ط·آ±ط·آ§ط·آ¨ط·آ¹ط·آ©": "4",
    "ط·آ§ط¸â€‍ط·آ®ط·آ§ط¸â€¦ط·آ³ط¸â€،": "5",
    "ط·آ§ط¸â€‍ط·آ®ط·آ§ط¸â€¦ط·آ³ط·آ©": "5",
    "ط·آ§ط¸â€‍ط·آ³ط·آ§ط·آ¯ط·آ³ط¸â€،": "6",
    "ط·آ§ط¸â€‍ط·آ³ط·آ§ط·آ¯ط·آ³ط·آ©": "6",
    "ط·آ§ط¸â€‍ط·آ³ط·آ§ط·آ¨ط·آ¹ط¸â€،": "7",
    "ط·آ§ط¸â€‍ط·آ³ط·آ§ط·آ¨ط·آ¹ط·آ©": "7",
    "ط·آ§ط¸â€‍ط·آ«ط·آ§ط¸â€¦ط¸â€ ط¸â€،": "8",
    "ط·آ§ط¸â€‍ط·آ«ط·آ§ط¸â€¦ط¸â€ ط·آ©": "8",
}

_AFFIRMATION_TERMS = {"ط·آ§ط¸â€،", "ط·آ§ط¸â€،ط·آ§", "ط·آ§ط¸ظ¹ط¸ث†ط¸â€،", "ط·آ§ط¸ظ¹ط¸ث†ط·آ©", "ط¸â€ ط·آ¹ط¸â€¦", "yes", "ok", "okay", "ط·ع¾ط¸â€¦ط·آ§ط¸â€¦", "ط¸â€¦ط·آ§ط·آ´ط¸ظ¹"}


_LIGHT_CHAT_EXACT_TERMS = {
    "hi",
    "hello",
    "hey",
    "bye",
    "thanks",
    "thank you",
    "ط·آ¹ط·آ§ط¸â€¦ط¸â€‍ ط·آ§ط¸ظ¹",
    "ط·آ¹ط·آ§ط¸â€¦ط¸â€‍ ط·آ§ط¸ظ¹ط¸â€،",
    "ط·آ§ط·آ²ط¸ظ¹ط¸ئ’",
    "ط·آ§ط¸â€،ط¸â€‍ط·آ§",
    "ط·آ§ط¸â€،ط¸â€‍ط·آ§ ط¸ث†ط·آ³ط¸â€،ط¸â€‍ط·آ§",
    "ط¸â€¦ط·آ±ط·آ­ط·آ¨ط·آ§",
    "ط·آ³ط¸â€‍ط·آ§ط¸â€¦",
    "ط·آ³ط¸â€‍ط·آ§ط¸â€¦ ط·آ¹ط¸â€‍ط¸ظ¹ط¸ئ’ط¸â€¦",
    "ط·آ§ط¸â€‍ط·آ³ط¸â€‍ط·آ§ط¸â€¦ ط·آ¹ط¸â€‍ط¸ظ¹ط¸ئ’ط¸â€¦",
    "ط¸ث†ط·آ¹ط¸â€‍ط¸ظ¹ط¸ئ’ط¸â€¦ ط·آ§ط¸â€‍ط·آ³ط¸â€‍ط·آ§ط¸â€¦",
    "ط·آ¨ط·آ®ط¸ظ¹ط·آ±",
    "ط·آ§ط¸â€‍ط·آ­ط¸â€¦ط·آ¯ ط¸â€‍ط¸â€‍ط¸â€،",
    "ط·آ§ط¸â€‍ط·آ­ط¸â€¦ط·آ¯ ط·آ§ط¸â€‍ط¸â€‍ط¸â€،",
    "ط·ع¾ط¸â€¦ط·آ§ط¸â€¦",
}
_LIGHT_CHAT_CONTAINS_TERMS = (
    "ط¸ئ’ط¸ظ¹ط¸ظ¾ ط·آ­ط·آ§ط¸â€‍ط¸ئ’",
    "ط·آ¹ط·آ§ط¸â€¦ط¸â€‍ ط·آ§ط¸ظ¹",
    "ط·آ¹ط·آ§ط¸â€¦ط¸â€‍ ط·آ§ط¸ظ¹ط¸â€،",
    "ط·آ§ط·آ®ط·آ¨ط·آ§ط·آ±ط¸ئ’",
    "ط·آ§ط¸â€‍ط·آ³ط¸â€‍ط·آ§ط¸â€¦ ط·آ¹ط¸â€‍ط¸ظ¹ط¸ئ’ط¸â€¦",
    "ط¸ث†ط·آ¹ط¸â€‍ط¸ظ¹ط¸ئ’ط¸â€¦ ط·آ§ط¸â€‍ط·آ³ط¸â€‍ط·آ§ط¸â€¦",
    "good morning",
    "good evening",
)


def _is_regulation_intent(query: str) -> bool:
    text = _normalize_search_text(query or "")
    if not text:
        return False
    if any(term in text for term in _REGULATION_INTENT_TERMS):
        return True
    # Common typo-tolerant pattern for "ط¸â€‍ط·آ§ط·آ¦ط·آ­ط·آ© / ط¸â€‍ط·آ§ط¸ظ¹ط·آ­ط·آ© / ط¸â€‍ط·آ§ط¸ظ¹ط·آ¦ط·آ­ط·آ© ..."
    return bool(re.search(r"ط¸â€‍ط·آ§\S{0,2}ط·آ­\S*", text))


def _extract_level_digits_from_text(query: str) -> str:
    raw = str(query or "").strip()
    if not raw:
        return ""
    direct = re.search(r"([0-9ط¸آ -ط¸آ©]+)", raw)
    if direct:
        return _digits_only((direct.group(1) or "").translate(_ARABIC_DIGIT_TRANS))

    normalized = _normalize_search_text(raw)
    for word, digit in _AR_LEVEL_WORDS_TO_DIGIT.items():
        if _normalize_search_text(word) in normalized:
            return digit
    return ""


def _is_affirmation_message(query: str) -> bool:
    text = _normalize_search_text(query or "")
    return text in _AFFIRMATION_TERMS


def _is_light_chat_intent(query: str) -> bool:
    text = _normalize_search_text(query or "")
    if not text:
        return False
    if _is_regulation_intent(text):
        return False
    if text in _LIGHT_CHAT_EXACT_TERMS:
        return True
    return any(term in text for term in _LIGHT_CHAT_CONTAINS_TERMS)


def _fallback_smalltalk_reply(query: str) -> str:
    text = _normalize_search_text(query or "")
    if any(word in text for word in ("ط¸ئ’ط¸ظ¹ط¸ظ¾ ط·آ­ط·آ§ط¸â€‍ط¸ئ’", "ط·آ¹ط·آ§ط¸â€¦ط¸â€‍ ط·آ§ط¸ظ¹", "ط·آ¹ط·آ§ط¸â€¦ط¸â€‍ ط·آ§ط¸ظ¹ط¸â€،", "ط·آ§ط·آ®ط·آ¨ط·آ§ط·آ±ط¸ئ’")):
        return "ط·آ£ط¸â€ ط·آ§ ط·آ¨ط·آ®ط¸ظ¹ط·آ±ط·إ’ ط·آ´ط¸ئ’ط·آ±ط·آ§ط¸â€¹ ط¸â€‍ط¸ئ’. ط¸ئ’ط¸ظ¹ط¸ظ¾ ط·آ£ط¸â€ڑط·آ¯ط·آ± ط·آ£ط·آ³ط·آ§ط·آ¹ط·آ¯ط¸ئ’ط·ع؛"
    if "ط·آ§ط¸â€‍ط·آ³ط¸â€‍ط·آ§ط¸â€¦ ط·آ¹ط¸â€‍ط¸ظ¹ط¸ئ’ط¸â€¦" in text or "ط·آ³ط¸â€‍ط·آ§ط¸â€¦ ط·آ¹ط¸â€‍ط¸ظ¹ط¸ئ’ط¸â€¦" in text:
        return "ط¸ث†ط·آ¹ط¸â€‍ط¸ظ¹ط¸ئ’ط¸â€¦ ط·آ§ط¸â€‍ط·آ³ط¸â€‍ط·آ§ط¸â€¦ ط¸ث†ط·آ±ط·آ­ط¸â€¦ط·آ© ط·آ§ط¸â€‍ط¸â€‍ط¸â€، ط¸ث†ط·آ¨ط·آ±ط¸ئ’ط·آ§ط·ع¾ط¸â€،."
    if any(word in text for word in ("ط·آ´ط¸ئ’ط·آ±ط·آ§", "thanks", "thank you")):
        return "ط·آ¹ط¸â€‍ط¸â€° ط·آ§ط¸â€‍ط·آ±ط·آ­ط·آ¨ ط¸ث†ط·آ§ط¸â€‍ط·آ³ط·آ¹ط·آ©."
    return "ط·آ£ط¸â€،ط¸â€‍ط·آ§ط¸â€¹ ط·آ¨ط¸ئ’. ط¸ئ’ط¸ظ¹ط¸ظ¾ ط·آ£ط¸â€ڑط·آ¯ط·آ± ط·آ£ط·آ³ط·آ§ط·آ¹ط·آ¯ط¸ئ’ط·ع؛"


def _stabilize_smalltalk_reply(query: str, candidate: str, previous_assistant_text: str) -> str:
    text = str(candidate or "").strip()
    previous = str(previous_assistant_text or "").strip()
    if not text:
        return _fallback_smalltalk_reply(query)
    if text == previous:
        return _fallback_smalltalk_reply(query)
    lowered = _normalize_search_text(text)
    if "ط¸â€‍ط·آ§ ط·آ§ط¸â€¦ط¸â€‍ط¸ئ’ ط¸â€¦ط·آ¹ط¸â€‍ط¸ث†ط¸â€¦ط·آ©" in lowered or "ط¸â€‍ط·آ§ ط·آ§ط¸â€¦ط¸â€‍ط¸ئ’ ط¸â€¦ط·آ¹ط¸â€‍ط¸ث†ط¸â€¦ط·آ© ط¸ئ’ط·آ§ط¸ظ¾ط¸ظ¹ط·آ©" in lowered:
        return _fallback_smalltalk_reply(query)
    if "ط¸â€¦ط·آ­ط·ع¾ط¸ث†ط¸â€° ط¸â€¦ط·آ±ط·ع¾ط·آ¨ط·آ· ط¸â€¦ط¸â€  ط¸â€ ط·آ¸ط·آ§ط¸â€¦ ط·آ§ط¸â€‍ط¸ئ’ط¸â€‍ط¸ظ¹ط·آ©" in lowered:
        return _fallback_smalltalk_reply(query)
    return text


def _is_scope_clarification_prompt(text: str) -> bool:
    normalized = _normalize_search_text(text or "")
    return "ط·آ³ط·آ¤ط·آ§ط¸â€‍ط¸ئ’ ط¸â€¦ط·آ­ط·ع¾ط·آ§ط·آ¬ ط·ع¾ط¸ث†ط·آ¶ط¸ظ¹ط·آ­ ط·آ¨ط·آ³ط¸ظ¹ط·آ·" in normalized or "ط·آ§ط¸ئ’ط·ع¾ط·آ¨ط¸â€،ط·آ§ ط·آ¨ط·آ§ط¸â€‍ط·آ´ط¸ئ’ط¸â€‍ ط·آ¯ط¸â€،" in normalized


def _clarification_message_for_scope(current_user: User | None = None) -> str:
    student_college = str(getattr(current_user, "college", "") or "").strip() if current_user else ""
    if student_college:
        return f"ط·آ³ط·آ¤ط·آ§ط¸â€‍ط¸ئ’ ط¸â€¦ط·آ­ط·ع¾ط·آ§ط·آ¬ ط·ع¾ط¸ث†ط·آ¶ط¸ظ¹ط·آ­ ط·آ¨ط·آ³ط¸ظ¹ط·آ·. ط·آ§ط¸ئ’ط·ع¾ط·آ¨ط¸â€،ط·آ§ ط·آ¨ط·آ§ط¸â€‍ط·آ´ط¸ئ’ط¸â€‍ ط·آ¯ط¸â€،: ط·آ§ط¸â€‍ط¸â€‍ط·آ§ط·آ¦ط·آ­ط·آ© 1 - {student_college}."
    return "ط·آ³ط·آ¤ط·آ§ط¸â€‍ط¸ئ’ ط¸â€¦ط·آ­ط·ع¾ط·آ§ط·آ¬ ط·ع¾ط¸ث†ط·آ¶ط¸ظ¹ط·آ­ ط·آ¨ط·آ³ط¸ظ¹ط·آ·. ط¸â€‍ط¸ث† ط·ع¾ط¸â€ڑط·آµط·آ¯ ط·آ§ط¸â€‍ط¸â€‍ط·آ§ط·آ¦ط·آ­ط·آ© ط·آ§ط¸ئ’ط·ع¾ط·آ¨ط¸â€،ط·آ§ ط·آ¨ط·آ§ط¸â€‍ط·آ´ط¸ئ’ط¸â€‍ ط·آ¯ط¸â€،: ط·آ§ط¸â€‍ط¸â€‍ط·آ§ط·آ¦ط·آ­ط·آ© 1 - ط¸ئ’ط¸â€‍ط¸ظ¹ط·آ© ط·آ¹ط¸â€‍ط¸ث†ط¸â€¦ ط·آ§ط¸â€‍ط·آ­ط·آ§ط·آ³ط·آ¨."


def _extract_scope_filters_from_query(query: str, current_user: User) -> dict:
    raw = str(query or "").strip()
    normalized = _normalize_search_text(raw)
    filters = {"level_digits": "", "college_key": ""}

    filters["level_digits"] = _extract_level_digits_from_text(raw)

    # If query is just a number, only treat it as level under regulation intent flow.
    if not filters["level_digits"]:
        digits_only = raw.translate(_ARABIC_DIGIT_TRANS)
        if digits_only.isdigit() and _is_regulation_intent(raw):
            filters["level_digits"] = _digits_only(digits_only)

    ar_college = re.search(r"(?:ط¸ئ’ط¸â€‍ط¸ظ¹ط·آ©|ط·آ§ط¸â€‍ط¸ئ’ط¸â€‍ط¸ظ¹ط¸â€،)\s+([^\|\-ط·إ’,]+)", raw)
    if ar_college:
        candidate = f"ط¸ئ’ط¸â€‍ط¸ظ¹ط·آ© {(ar_college.group(1) or '').strip()}".strip()
        filters["college_key"] = _canonical_college_key(candidate)

    en_college = re.search(r"college\s*[:\-]?\s*([^\|\-ط·إ’,]+)", raw, re.IGNORECASE)
    if en_college and not filters["college_key"]:
        filters["college_key"] = _canonical_college_key((en_college.group(1) or "").strip())

    # Student regulation queries default to student's college when not explicitly provided.
    if not filters["college_key"] and _is_regulation_intent(normalized):
        filters["college_key"] = _canonical_college_key(str(getattr(current_user, "college", "") or ""))

    return filters


def _detect_display_intent(message: str) -> bool:
    text = _normalize_arabic_query(message or "")
    if not text:
        return False
    has_verb = any(marker in text for marker in DISPLAY_INTENT_AR_VERBS) or any(marker in text for marker in DISPLAY_INTENT_EN_VERBS)
    has_target = any(marker in text for marker in DISPLAY_TARGET_MARKERS)
    return has_verb and has_target


def _extract_display_scope(query: str, current_user: User) -> dict:
    normalized = _normalize_arabic_query(query or "")
    tokens = _tokenize_normalized_text(normalized)
    scope_filters = _extract_scope_filters_from_query(query, current_user)

    program = ""
    for alias, canonical in PROGRAM_ALIASES.items():
        if alias in normalized:
            program = canonical
            break
    if not program:
        uppercase_tokens = re.findall(r"\b[A-Z]{2,6}\b", str(query or ""))
        if uppercase_tokens:
            program = uppercase_tokens[0].upper()

    academic_year = ""
    years = re.findall(r"(20\d{2})\s*[-/]\s*(20\d{2})", normalized)
    if years:
        academic_year = f"{years[0][0]}-{years[0][1]}"

    level = str(scope_filters.get("level_digits") or "").strip()
    if not level:
        for alias, canonical in LEVEL_QUERY_ALIASES.items():
            if alias in normalized:
                level = canonical
                break

    hinted_type = ""
    for marker, content_type in DISPLAY_TYPE_HINTS.items():
        if marker in normalized:
            hinted_type = content_type
            break

    return {
        "normalized": normalized,
        "tokens": tokens,
        "college_key": str(scope_filters.get("college_key") or "").strip(),
        "level": level,
        "program": program,
        "academic_year": academic_year,
        "content_type": hinted_type,
    }


def _post_asset_urls(post: ContentPost) -> tuple[str, str]:
    file_url = str(getattr(post, "file_url", "") or "").strip()
    if file_url:
        return file_url, file_url

    body = str(getattr(post, "body", "") or "")
    image_urls = _extract_image_urls(body, max_items=1)
    if image_urls:
        return image_urls[0], image_urls[0]

    file_links = _extract_file_links(body, max_items=1)
    if file_links:
        url = str((file_links[0] or {}).get("url") or "").strip()
        return url, url

    return "", ""


def _build_display_related_item(post: ContentPost, score: float) -> dict:
    preview_url, file_url = _post_asset_urls(post)
    content_type = str(getattr(post, "content_type", "") or "").strip().lower()
    body = str(getattr(post, "body", "") or "")
    image_urls = _extract_image_urls(body, max_items=2)
    file_links = _extract_file_links(body, max_items=3)
    if file_url and not file_links:
        inferred_is_pdf = file_url.lower().endswith(".pdf") or content_type == "pdf"
        file_links = [{"name": str(post.subject or "مرفق").strip(), "url": file_url, "is_pdf": inferred_is_pdf}]
    if preview_url and preview_url not in image_urls and content_type == "image":
        image_urls = [preview_url, *image_urls][:2]

    return {
        "id": post.id,
        "subject": str(post.subject or "").strip(),
        "category": getattr(post, "category", None),
        "target_level": getattr(post, "target_level", None),
        "content_type": content_type or "text",
        "tags": str(getattr(post, "tags", "") or "").strip(),
        "college": getattr(post, "college", None),
        "level": getattr(post, "level", None),
        "program": getattr(post, "program", None),
        "academic_year": getattr(post, "academic_year", None),
        "semester": getattr(post, "semester", None),
        "file_url": file_url or None,
        "preview_url": preview_url or None,
        "snippet": _strip_html(body)[:240],
        "image_urls": image_urls,
        "file_links": file_links,
        "display_score": round(float(score), 2),
    }


def _search_display_content(db: Session, current_user: User, query: str, limit: int = 4) -> List[dict]:
    scope = _extract_display_scope(query, current_user)
    tokens = list(scope["tokens"])
    normalized_query = str(scope["normalized"] or "").strip()
    hinted_type = str(scope["content_type"] or "").strip().lower()
    posts = db.query(ContentPost).order_by(ContentPost.created_at.desc()).limit(300).all()
    matches: List[tuple[float, dict]] = []

    for post in posts:
        if not _is_content_post_visible_to_user(current_user, post):
            continue

        preview_url, file_url = _post_asset_urls(post)
        if not (preview_url or file_url):
            continue

        subject = str(getattr(post, "subject", "") or "")
        tags = str(getattr(post, "tags", "") or "")
        content_type = str(getattr(post, "content_type", "") or "").strip().lower()
        haystack = " ".join(
            filter(
                None,
                [
                    subject,
                    tags,
                    str(getattr(post, "program", "") or ""),
                    str(getattr(post, "college", "") or ""),
                    str(getattr(post, "level", "") or ""),
                    str(getattr(post, "academic_year", "") or ""),
                    str(getattr(post, "semester", "") or ""),
                    str(getattr(post, "category", "") or ""),
                ],
            )
        )
        normalized_haystack = _normalize_arabic_query(haystack)
        subject_normalized = _normalize_arabic_query(subject)
        tag_tokens = {_normalize_arabic_query(item) for item in _split_tags(tags)}

        score = 0.0
        if normalized_query and normalized_query in subject_normalized:
            score += 14
        elif normalized_query and normalized_query in normalized_haystack:
            score += 8

        for token in tokens:
            if token in subject_normalized:
                score += 5
            elif token in normalized_haystack:
                score += 2
            if token in tag_tokens:
                score += 4

        if hinted_type and content_type == hinted_type:
            score += 6
        elif hinted_type and hinted_type == "schedule" and "جدول" in subject_normalized:
            score += 5

        if scope["program"]:
            post_program = str(getattr(post, "program", "") or "").strip().upper()
            if post_program and post_program == str(scope["program"]).upper():
                score += 8
            elif scope["program"].lower() in subject_normalized or scope["program"].lower() in normalized_haystack:
                score += 5

        if scope["level"]:
            post_level = str(getattr(post, "level", "") or "").strip()
            target_scope = str(getattr(post, "target_level", "") or "").strip()
            if post_level == scope["level"] or scope["level"] in _digits_only(target_scope):
                score += 8
            else:
                continue

        if scope["academic_year"]:
            post_year = str(getattr(post, "academic_year", "") or "").strip()
            if post_year and post_year == scope["academic_year"]:
                score += 8
            elif scope["academic_year"] not in normalized_haystack:
                score -= 2

        if scope["college_key"]:
            post_college = str(getattr(post, "college", "") or "") or str(getattr(post, "target_level", "") or "")
            if _canonical_college_key(post_college) == scope["college_key"]:
                score += 8
            else:
                continue

        score += min(max(int(getattr(post, "display_priority", 0) or 0), 0), 25) / 10.0
        if score < 6:
            continue

        matches.append((score, _build_display_related_item(post, score)))

    matches.sort(key=lambda item: (item[0], item[1].get("id") or 0), reverse=True)
    return [item[1] for item in matches[:limit]]


def _build_display_response_payload(match: dict) -> dict:
    return {
        "type": "display",
        "content_type": str(match.get("content_type") or "file").strip(),
        "title": str(match.get("subject") or "محتوى مرتبط").strip(),
        "file_url": str(match.get("file_url") or match.get("preview_url") or "").strip() or None,
        "preview_url": str(match.get("preview_url") or match.get("file_url") or "").strip() or None,
    }


def _is_student_data_query(message: str) -> bool:
    text = _normalize_arabic_query(message or "")
    if not text:
        return False
    markers = ("gpa", "المعدل", "المعدل التراكمي", "موادي", "المواد المسجله", "المواد المسجلة", "رسومي", "الرسوم", "كورساتي", "courses", "registered")
    return any(marker in text for marker in markers)


def _answer_bnu_facts_query(message: str) -> str:
    text = _normalize_search_text(str(message or ""))
    if not text:
        return ""

    asks_about_bnu = any(
        token in text
        for token in (
            "جامعه بنها الاهليه",
            "جامعة بنها الأهلية",
            "بنها",
            "bnu",
            "benha",
            "الاهليه",
            "الأهلية",
        )
    )
    asks_official_site = (
        ("موقع" in text and "رسمي" in text)
        or "الموقع الرسمي" in text
        or "website" in text
        or "official site" in text
    )
    asks_location = any(token in text for token in ("اين", "فين", "مكان", "عنوان", "تقع", "location", "address", "where"))
    asks_type = any(token in text for token in ("نوع", "اهليه ام خاصه", "أهلية أم خاصة", "خاصه", "خاصة", "غير هادفه للربح", "غير هادفة للربح"))

    if asks_about_bnu and asks_official_site:
        return "الموقع الرسمي لجامعة بنها الأهلية هو: https://bnu.edu.eg/"
    if asks_about_bnu and asks_location:
        return (
            "تقع جامعة بنها الأهلية في مدينة العبور بمحافظة القليوبية، "
            "وعنوانها: مبنى الخدمات الطلابية B - جامعة بنها الأهلية - محور العبور الرئيسي - الحي الترفيهي."
        )
    if asks_about_bnu and asks_type:
        return "جامعة بنها الأهلية هي جامعة أهلية غير هادفة للربح."
    return ""


def _answer_student_data_query(current_user: User, message: str) -> str:
    text = _normalize_arabic_query(message or "")
    if "الكليه" in text or "college" in text:
        college = str(getattr(current_user, "college", "") or "").strip()
        if college:
            return f"الكلية المسجلة لك هي: {college}"
    if "المستوي" in text or "السنه" in text or "level" in text:
        level = str(getattr(current_user, "level", "") or "").strip()
        if level:
            return f"المستوى الدراسي المسجل لك هو: {level}"
    if "التخصص" in text or "major" in text:
        major = str(getattr(current_user, "major", "") or "").strip()
        if major:
            return f"التخصص المسجل لك هو: {major}"
    return ""


def _needs_scope_clarification(query: str) -> bool:
    raw = str(query or "").strip()
    if not raw:
        return False
    normalized_digits = raw.translate(_ARABIC_DIGIT_TRANS)
    # Do not auto-assume a regulation from a naked number like "1".
    return normalized_digits.isdigit()


def _post_matches_scope_filters(post: ContentPost, scope_filters: dict) -> bool:
    level_digits = str(scope_filters.get("level_digits") or "").strip()
    college_key = str(scope_filters.get("college_key") or "").strip()

    post_target = str(post.target_level or "")
    post_subject = str(post.subject or "")
    post_body_text = _strip_html(str(post.body or ""))
    normalized_target = _normalize_search_text(post_target)
    normalized_haystack = _normalize_search_text(f"{post_target} {post_subject} {post_body_text}")

    if level_digits:
        target_digits = _digits_only(normalized_target)
        haystack_digits = _digits_only(normalized_haystack)
        if level_digits not in target_digits and level_digits not in haystack_digits:
            return False

    if college_key:
        target_college_key = _canonical_college_key(post_target)
        subject_college_key = _canonical_college_key(post_subject)
        body_college_key = _canonical_college_key(post_body_text)
        if college_key not in {target_college_key, subject_college_key, body_college_key}:
            return False

    return True


def _is_level_match(user_level: str, target_level: str | None, user_college: str | None = None) -> bool:
    target_raw = (target_level or "").strip()
    if not target_raw:
        return True

    normalized_target = _normalize_search_text(target_raw)
    if normalized_target in {"all", "ط·آ§ط¸â€‍ط¸ئ’ط¸â€‍", "ط·آ¹ط·آ§ط¸â€¦", "ط·آ¬ط¸â€¦ط¸ظ¹ط·آ¹ ط·آ§ط¸â€‍ط¸â€¦ط·آ³ط·ع¾ط¸ث†ط¸ظ¹ط·آ§ط·ع¾"}:
        return True

    normalized_user_level = _normalize_search_text(user_level or "")
    if not normalized_user_level:
        return True

    target_college = _normalize_search_text(_parse_college_from_scope(target_raw))
    normalized_user_college = _normalize_search_text(user_college or "")
    if target_college:
        if not normalized_user_college:
            return False
        target_college_key = _canonical_college_key(target_college)
        user_college_key = _canonical_college_key(normalized_user_college)
        if target_college_key and user_college_key:
            if target_college_key != user_college_key:
                return False
        elif normalized_user_college not in target_college and target_college not in normalized_user_college:
            return False

    if normalized_user_level in normalized_target or normalized_target in normalized_user_level:
        return True

    user_digits = _digits_only(normalized_user_level)
    target_digits = _digits_only(normalized_target)
    if user_digits and target_digits and user_digits == target_digits:
        return True

    return False


def _get_related_content(
    db: Session,
    current_user: User,
    query: str,
    limit: int = 2,
) -> List[dict]:
    normalized_query = _normalize_search_text(query)
    tokens = [token for token in normalized_query.split() if len(token.strip()) >= 2]
    query_terms = re.findall(r"[a-z0-9]+|[\u0600-\u06ff]+", normalized_query)
    query_terms = [term.strip() for term in query_terms if len(term.strip()) >= 2]
    if not tokens and not query.strip():
        return []

    posts = db.query(ContentPost).order_by(ContentPost.created_at.desc()).limit(200).all()
    scope_filters = _extract_scope_filters_from_query(query, current_user)
    enforce_scope = bool(scope_filters.get("level_digits") or scope_filters.get("college_key"))

    def _score_posts(scope_enforced: bool) -> List[dict]:
        scored: List[tuple] = []
        lowered_query = normalized_query.strip()
        for post in posts:
            if not _is_content_post_visible_to_user(current_user, post):
                continue
            if scope_enforced and not _post_matches_scope_filters(post, scope_filters):
                continue

            subject = str(post.subject or "")
            body = str(post.body or "")
            body_text = _strip_html(body)
            haystack = _normalize_search_text(
                " ".join(
                    filter(
                        None,
                        [
                            subject,
                            str(post.category or ""),
                            body_text,
                            str(getattr(post, "tags", "") or ""),
                            str(getattr(post, "content_type", "") or ""),
                            str(getattr(post, "college", "") or ""),
                            str(getattr(post, "level", "") or ""),
                            str(getattr(post, "program", "") or ""),
                            str(getattr(post, "academic_year", "") or ""),
                            str(getattr(post, "semester", "") or ""),
                        ],
                    )
                )
            )
            subject_lower = _normalize_search_text(subject)
            haystack_terms = set(re.findall(r"[a-z0-9]+|[\u0600-\u06ff]+", haystack))
            subject_terms = set(re.findall(r"[a-z0-9]+|[\u0600-\u06ff]+", subject_lower))

            score = 0
            if lowered_query and lowered_query in haystack:
                score += 8
            if lowered_query and lowered_query in subject_lower:
                score += 15
            for token in tokens:
                if token in haystack:
                    score += 1
                if token in subject_lower:
                    score += 4

            overlap_count = 0
            for term in query_terms:
                if term in subject_terms:
                    score += 6
                    overlap_count += 1
                    continue
                if term in haystack_terms:
                    score += 2
                    overlap_count += 1

            if overlap_count >= 2:
                score += overlap_count * 2

            if _is_schedule_like_query(query) and "جدول" in subject_lower:
                score += 10
            if "sad" in query_terms and "sad" in subject_terms:
                score += 8

            if score <= 0:
                continue

            snippet = body_text[:240]
            scored.append(
                (
                    score,
                    {
                        "id": post.id,
                        "subject": subject,
                        "category": post.category,
                        "target_level": post.target_level,
                        "content_type": getattr(post, "content_type", None),
                        "tags": getattr(post, "tags", None),
                        "college": getattr(post, "college", None),
                        "level": getattr(post, "level", None),
                        "program": getattr(post, "program", None),
                        "academic_year": getattr(post, "academic_year", None),
                        "semester": getattr(post, "semester", None),
                        "file_url": getattr(post, "file_url", None),
                        "preview_url": getattr(post, "file_url", None),
                        "snippet": snippet,
                        "image_urls": _extract_image_urls(body, max_items=2),
                        "file_links": _extract_file_links(body, max_items=3),
                    },
                )
            )

        scored.sort(key=lambda item: item[0], reverse=True)
        return [item[1] for item in scored[:limit]]

    primary = _score_posts(scope_enforced=enforce_scope)
    if primary:
        return primary

    # Fallback: if strict scope matching produced no hits, retry looser subject/body matching.
    if enforce_scope:
        return _score_posts(scope_enforced=False)
    return []


def _looks_generic_or_ungrounded(answer: str) -> bool:
    text = _normalize_search_text(answer or "")
    if not text:
        return True
    generic_markers = [
        "it seems like",
        "you ve entered a number",
        "can differ by university",
        "ط·ع¾ط·آ®ط·ع¾ط¸â€‍ط¸ظ¾ ط·آ­ط·آ³ط·آ¨ ط·آ§ط¸â€‍ط·آ¬ط·آ§ط¸â€¦ط·آ¹ط·آ©",
        "ط¸â€‍ط·آ§ط·آ¦ط·آ­ط·آ© ط·آ¹ط·آ§ط¸â€¦ط·آ©",
        "ط¸â€ڑط·آ¯ ط·ع¾ط·آ®ط·ع¾ط¸â€‍ط¸ظ¾",
        "i don't know",
        "ط¸â€‍ط·آ§ ط·آ§ط·آ¹ط·آ±ط¸ظ¾",
    ]
    return any(marker in text for marker in generic_markers)


def _build_grounded_answer_from_related(related_content: List[dict]) -> str:
    if not related_content:
        return ""
    primary = related_content[0]
    subject = str(primary.get("subject") or "ط·آ§ط¸â€‍ط¸â€¦ط·آ­ط·ع¾ط¸ث†ط¸â€°")
    snippet = str(primary.get("snippet") or "").strip()
    lines = [f"ط·آ­ط·آ³ط·آ¨ ط¸â€¦ط·آ­ط·ع¾ط¸ث†ط¸â€° ط·آ§ط¸â€‍ط¸ئ’ط¸â€‍ط¸ظ¹ط·آ© ط·آ§ط¸â€‍ط¸â€¦ط·ع¾ط·آ§ط·آ­ط·إ’ {subject}:"]
    if snippet:
        lines.append(snippet)

    file_links = primary.get("file_links") or []
    if file_links:
        lines.append("ط¸ظ¹ط¸ث†ط·آ¬ط·آ¯ ط¸â€¦ط¸â€‍ط¸ظ¾ ط¸â€¦ط·آ±ط¸ظ¾ط¸â€ڑ ط¸ظ¹ط¸â€¦ط¸ئ’ط¸â€  ط·آ§ط¸â€‍ط·آ±ط·آ¬ط¸ث†ط·آ¹ ط·آ¥ط¸â€‍ط¸ظ¹ط¸â€، ط¸â€¦ط¸â€  ط·آ§ط¸â€‍ط·آ±ط·آ³ط·آ§ط¸â€‍ط·آ©.")

    lines.append("ط¸â€‍ط¸ث† ط·ع¾ط·آ±ط¸ظ¹ط·آ¯ط·إ’ ط·آ£ط¸â€ڑط·آ¯ط·آ± ط·آ£ط¸â€‍ط·آ®ط¸â€کط·آµط¸â€،ط·آ§ ط¸â€‍ط¸ئ’ ط¸â€ ط¸â€ڑط·آ·ط·آ© ط·آ¨ط¸â€ ط¸â€ڑط·آ·ط·آ© ط¸â€¦ط¸â€  ط¸â€ ط¸ظ¾ط·آ³ ط·آ§ط¸â€‍ط¸â€‍ط·آ§ط·آ¦ط·آ­ط·آ© ط¸ظ¾ط¸â€ڑط·آ·.")
    return "\n\n".join(lines).strip()


ACADEMIC_TERMS = (
    "جدول", "schedule", "مادة", "مواد", "subject", "course", "courses",
    "امتحان", "امتحانات", "exam", "exams", "لائحة", "regulation",
    "سكشن", "section", "شعبة", "رسوم", "tuition", "تسجيل", "registration",
    "مقرر", "semester", "credit", "credits", "gpa", "كلية", "faculty",
    "ساعة", "ساعات", "معتمدة", "ساعة معتمدة", "ساعات معتمدة",
    "تخرج", "التخرج", "للتخرج", "graduation", "graduate",
    "برنامج", "برامج", "خطة", "الخطة", "متطلبات", "متطلبات التخرج",
    "دليل الطالب", "دليل", "دراسة", "مدة الدراسة",
    "تحويل", "التحويل", "transfer", "عبء", "العبء", "العبء الأكاديمي",
    "حد أدنى", "الحد الأدنى", "حد أقصى", "الحد الأقصى",
    "معدل", "المعدل", "معدل تراكمي", "المعدل التراكمي",
    "حضور", "غياب", "انسحاب", "الحذف", "الإضافة", "الاضافة",
    "إنذار", "انذار", "تقدير", "درجات", "تدريب ميداني", "مشروع التخرج",
    "زائر", "ضيف", "تبادل",
)
SYSTEM_MARKERS = (
    "you are", "task overview", "output format", "strict rules", "system instructions",
    "configuration", "meta text", "###", "```", "{\"type\":",
)


def classify_question(message: str) -> str:
    text = str(message or "").strip()
    if len(text) < 2:
        return "SYSTEM"

    normalized = _normalize_search_text(text)
    lowered = text.lower()
    if _is_index_preview_request(text):
        return "ACADEMIC"
    if _is_campus_location_query(text):
        return "GENERAL"
    if any(marker in lowered for marker in SYSTEM_MARKERS):
        return "SYSTEM"
    if len(text) > 220 and sum(1 for marker in ("###", "*", "{", "}") if marker in text) >= 2:
        return "SYSTEM"

    if any(_normalize_search_text(term) in normalized for term in ACADEMIC_TERMS):
        return "ACADEMIC"
    if _is_strict_academic_query(text):
        return "ACADEMIC"
    return "GENERAL"


def _resolve_chat_mode(request: LegacyChatRequest, message: str) -> str:
    raw_mode = str(getattr(request, "mode", "") or "").strip().upper()
    if raw_mode in {"ACADEMIC", "GENERAL", "SYSTEM", "MISSING_DATA"}:
        return raw_mode
    if raw_mode in {"INDEXING", "ADMIN", "INGESTION"}:
        return "INDEXING"

    category = str(getattr(request, "category", "") or "").strip().lower()
    if category:
        if any(token in category for token in ("اكاد", "أكاد", "academic", "document")):
            return "ACADEMIC"
        if any(token in category for token in ("عام", "general")):
            return "GENERAL"
        if any(token in category for token in ("دعم", "support", "technical", "تقني")):
            return "GENERAL"
        if any(token in category for token in ("system", "meta", "config", "اعداد", "إعداد")):
            return "SYSTEM"

    return classify_question(message)


def _is_index_preview_request(message: str) -> bool:
    text = str(message or "").strip().lower()
    if not text:
        return False
    markers = (
        "من الفهرس",
        "من المستندات",
        "اي حاجه",
        "أي حاجة",
        "ابعتلي حاجه",
        "ابعتلي اي",
        "anything from index",
        "from index",
    )
    return any(marker in text for marker in markers)


def _is_explicit_file_request(message: str) -> bool:
    text = _normalize_search_text(str(message or ""))
    if not text:
        return False
    direct_markers = (
        "pdf",
        "بي دي اف",
        "ملف",
        "الملف",
        "ارسل الملف",
        "ابعت الملف",
        "عرض الملف",
        "افتح الملف",
        "open file",
        "show file",
        "send file",
        "download",
    )
    if any(marker in text for marker in direct_markers):
        return True

    display_verbs = (
        "اعرض",
        "وريني",
        "وريني",
        "هات",
        "ابعت",
        "اظهر",
        "افتح",
        "show me",
        "send me",
        "bring",
        "open",
    )
    display_targets = (
        "الجدول",
        "جدول",
        "الصوره",
        "الصورة",
        "صوره",
        "صورة",
        "الملف",
        "ملف",
        "المستند",
        "مستند",
        "الدليل",
        "اللائحه",
        "اللائحة",
        "pdf",
        "docx",
        "schedule",
        "image",
    )
    return any(verb in text for verb in display_verbs) and any(target in text for target in display_targets)


def _is_strict_academic_query(message: str) -> bool:
    text = _normalize_search_text(str(message or ""))
    if not text:
        return False
    strict_markers = (
        "لائحه",
        "تحويل",
        "خارج الجامعه",
        "العبء",
        "عبء اكاديمي",
        "الحد الاقصى",
        "الحد الادنى",
        "الحذف",
        "الاضافه",
        "الإضافة",
        "انسحاب",
        "انذار",
        "التحويل",
        "معدل",
        "معدل تراكمي",
        "الحضور",
        "الغياب",
        "جدول",
        "ماده",
        "مواد",
        "مقرر",
        "امتحان",
        "تسجيل",
        "رسوم",
        "ساعات معتمده",
        "متطلبات التخرج",
        "التخرج",
        "gpa",
        "credit",
        "credits",
        "course",
        "courses",
        "registration",
        "transfer",
        "withdraw",
        "warning",
        "tuition",
        "semester",
        "faculty",
        "college",
    )
    return any(marker in text for marker in strict_markers)


def _has_query_doc_overlap(message: str, source_name: Optional[str], assets: List[dict]) -> bool:
    query_tokens = [tok for tok in _normalize_search_text(str(message or "")).split() if len(tok) >= 3]
    if not query_tokens:
        return False

    haystack_parts: List[str] = []
    if source_name:
        haystack_parts.append(str(source_name))
    for item in assets or []:
        if not isinstance(item, dict):
            continue
        haystack_parts.append(str(item.get("label") or ""))
        haystack_parts.append(str(item.get("url") or ""))
    haystack = _normalize_search_text(" ".join(haystack_parts))
    if not haystack:
        return False

    overlap = sum(1 for tok in query_tokens if tok in haystack)
    return overlap >= 1


def _is_campus_location_query(message: str) -> bool:
    text = str(message or "").strip().lower()
    if not text:
        return False
    campus_markers = ("جامعة", "جامعه", "بنها", "الاهليه", "الأهلية", "campus", "bnu", "benha")
    location_markers = ("فين", "اين", "مكان", "عنوان", "where", "location", "address", "تقع")
    has_campus = any(token in text for token in campus_markers)
    has_location = any(token in text for token in location_markers)
    return has_campus and has_location


def _contains_arabic(text: str) -> bool:
    return bool(re.search(r"[\u0600-\u06FF]", str(text or "")))


def _extract_primary_source_file(db: Session, sources: List[str]) -> Optional[str]:
    if not sources:
        return None
    first = str(sources[0] or "").strip()
    if not first:
        return None

    if "source=student_guide_pdf" in first:
        return "student_guide_pdf"

    item_match = re.search(r"item=(\d+)", first)
    if item_match:
        item_id = int(item_match.group(1))
        item = db.query(StorageItem).filter(StorageItem.id == item_id).first()
        if item and item.file_name:
            return item.file_name

    source_match = re.search(r"source=([^\|]+)", first)
    if source_match:
        return source_match.group(1).strip()
    return None


def _invoke_general_llm_answer(message: str, conversation_id: str) -> str:
    bnu_facts_answer = _answer_bnu_facts_query(message)
    if bnu_facts_answer:
        return bnu_facts_answer

    llm = getattr(router_rag_chatbot, "llm", None)
    if llm is None:
        return "تعذر توليد الإجابة الآن. حاول مرة أخرى بعد قليل."

    # Keep general answers less biased by previous academic turns.
    history_text = ""
    language_guard = "Respond in Arabic only." if _contains_arabic(message) else "Respond in English only."
    prompt = (
        "You are a helpful assistant for university students.\n"
        "Answer the user naturally and clearly in the same language.\n"
        "This is a GENERAL question, so do not claim it is from official university documents.\n\n"
        f"{language_guard}\n\n"
        f"Conversation summary:\n{history_text}\n\n"
        f"User message:\n{message}\n\n"
        "Answer:"
    )
    try:
        response = llm.invoke(prompt)
        answer = response.content if hasattr(response, "content") else str(response)
        return str(answer or "").strip() or "تعذر توليد الإجابة الآن. حاول مرة أخرى بعد قليل."
    except Exception:
        return "تعذر توليد الإجابة الآن. حاول مرة أخرى بعد قليل."


def _is_not_found_academic_answer(answer: str) -> bool:
    text = str(answer or "").strip().lower()
    if not text:
        return True
    markers = (
        "لا أملك معلومة كافية",
        "لا املك معلومة كافية",
        "المعلومة غير موجودة",
        "غير موجودة في المستندات",
        "not enough information",
        "not found in documents",
        "no sufficient information",
    )
    return any(marker in text for marker in markers)


def _build_pdf_excerpt_from_docs(docs: List[object]) -> str:
    if not docs:
        return ""
    first_doc = docs[0]
    text = str(getattr(first_doc, "page_content", "") or "").strip()
    text = re.sub(r"\s+", " ", text)
    if not text:
        return ""
    excerpt = text[:520].strip()
    return f"تم العثور على محتوى مرتبط في المستندات:\n\n{excerpt}"


def _detect_retrieval_source(compact_sources: List[str]) -> str:
    if not compact_sources:
        return "none"
    first = str(compact_sources[0] or "").lower()
    if "source=storage_pdf" in first:
        return "storage_pdf"
    if "source=student_guide_pdf" in first:
        return "student_guide_pdf"
    return "none"


def _filters_to_debug_list(filters: Optional[dict]) -> List[str]:
    if not isinstance(filters, dict):
        return []
    out: List[str] = []
    for key in ("student_id", "level", "category", "college_key", "sources"):
        if key not in filters:
            continue
        value = filters.get(key)
        if value is None:
            continue
        if isinstance(value, list):
            if not value:
                continue
            out.append(f"{key}:{'|'.join(str(v) for v in value if v is not None)}")
            continue
        text = str(value).strip()
        if text:
            out.append(f"{key}:{text}")
    return out


def _dedupe_assets(assets: List[dict]) -> List[dict]:
    unique: List[dict] = []
    seen = set()
    for item in assets:
        if not isinstance(item, dict):
            continue
        asset_type = str(item.get("type") or "").strip().lower()
        label = str(item.get("label") or "").strip().lower()
        url = str(item.get("url") or "").strip().lower()
        key = (asset_type, label, url)
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def _assets_from_related_content(related_content: List[dict]) -> List[dict]:
    assets: List[dict] = []
    for item in related_content or []:
        image_urls = item.get("image_urls") if isinstance(item, dict) else []
        if isinstance(image_urls, list):
            for img_url in image_urls:
                url = str(img_url or "").strip()
                if not url:
                    continue
                assets.append(
                    {
                        "type": "image",
                        "label": str(item.get("subject") or "صورة مرتبطة").strip(),
                        "url": url,
                    }
                )
        links = item.get("file_links") if isinstance(item, dict) else []
        if not isinstance(links, list):
            continue
        for link in links:
            if not isinstance(link, dict):
                continue
            url = str(link.get("url") or "").strip()
            if not url:
                continue
            is_pdf = bool(link.get("is_pdf"))
            assets.append(
                {
                    "type": "pdf" if is_pdf else "link",
                    "label": str(link.get("name") or "Attachment").strip(),
                    "url": url,
                }
            )
    return _dedupe_assets(assets)


def _assets_from_docs_metadata(db: Session, docs_metadata: List[dict]) -> List[dict]:
    assets: List[dict] = []
    chunk_ids: List[int] = []
    for meta in docs_metadata or []:
        if not isinstance(meta, dict):
            continue
        file_url = str(meta.get("file_url") or "").strip()
        file_name = str(meta.get("storage_file_name") or meta.get("file_name") or "").strip()
        source_name = str(meta.get("source") or "").strip().lower()
        if file_url:
            source_type = str(meta.get("source_type") or "").strip().lower()
            is_pdf_asset = file_url.lower().endswith(".pdf") or source_type == "pdf"
            assets.append(
                {
                    "type": "pdf" if is_pdf_asset else "link",
                    "label": file_name or "مستند مرفق",
                    "url": file_url,
                }
            )
        chunk_id = meta.get("knowledge_chunk_id")
        if chunk_id is not None:
            try:
                chunk_ids.append(int(chunk_id))
            except Exception:
                pass

    if chunk_ids:
        map_rows = (
            db.query(ChunkAssetMap, KnowledgeAsset)
            .join(KnowledgeAsset, KnowledgeAsset.id == ChunkAssetMap.asset_id)
            .filter(ChunkAssetMap.chunk_id.in_(list(set(chunk_ids))))
            .all()
        )
        for _, asset in map_rows:
            assets.append(
                {
                    "type": str(asset.asset_type or "").strip().lower() or "asset",
                    "label": str(asset.label or "Asset").strip(),
                    "url": str(asset.url or "").strip() or None,
                    "payload": asset.display_payload_json,
                }
            )

    return _dedupe_assets(assets)


def _has_openable_asset(assets: List[dict], related_content: List[dict]) -> bool:
    for asset in assets or []:
        if not isinstance(asset, dict):
            continue
        url = str(asset.get("url") or "").strip()
        if url:
            return True
    for item in related_content or []:
        if not isinstance(item, dict):
            continue
        links = item.get("file_links") or []
        if not isinstance(links, list):
            continue
        for link in links:
            if isinstance(link, dict) and str(link.get("url") or "").strip():
                return True
    return False


def _is_content_post_visible_to_user(current_user: User, post: ContentPost) -> bool:
    if str(getattr(current_user, "role", "") or "").lower() != "student":
        return True

    post_level = str(getattr(post, "level", "") or "").strip()
    post_college = str(getattr(post, "college", "") or "").strip()
    user_level = str(getattr(current_user, "level", "") or "").strip()
    user_college = str(getattr(current_user, "college", "") or "").strip()

    if post_college:
        if _canonical_college_key(post_college) and _canonical_college_key(user_college):
            if _canonical_college_key(post_college) != _canonical_college_key(user_college):
                return False
        elif _normalize_arabic_query(post_college) not in _normalize_arabic_query(user_college) and _normalize_arabic_query(user_college) not in _normalize_arabic_query(post_college):
            return False

    if post_level and user_level:
        post_level_digits = _digits_only(_normalize_arabic_query(post_level))
        user_level_digits = _digits_only(_normalize_arabic_query(user_level))
        if post_level_digits and user_level_digits:
            return post_level_digits == user_level_digits
        if _normalize_arabic_query(post_level) == _normalize_arabic_query(user_level):
            return True

    return _is_level_match(user_level, getattr(post, "target_level", None), user_college)


def _has_related_media_or_files(related_content: List[dict]) -> bool:
    for item in related_content or []:
        if not isinstance(item, dict):
            continue
        image_urls = item.get("image_urls") or []
        if isinstance(image_urls, list) and any(str(url or "").strip() for url in image_urls):
            return True
        file_links = item.get("file_links") or []
        if isinstance(file_links, list):
            for link in file_links:
                if isinstance(link, dict) and str(link.get("url") or "").strip():
                    return True
    return False


def _is_schedule_like_query(message: str) -> bool:
    text = _normalize_search_text(str(message or ""))
    if not text:
        return False
    markers = (
        "جدول",
        "schedule",
        "روتين",
        "محاضرات",
        "سكشن",
        "section",
        "مواعيد",
        "timetable",
    )
    return any(marker in text for marker in markers)


def _scope_norm(value: str) -> str:
    normalize_fn = getattr(router_rag_chatbot, "_normalize_scope_text", None)
    if callable(normalize_fn):
        return str(normalize_fn(value or ""))
    return " ".join(str(value or "").strip().lower().split())


def _canonical_level_value(value: Optional[str]) -> str:
    canonical_fn = getattr(router_rag_chatbot, "_canonical_level_value", None)
    if callable(canonical_fn):
        return str(canonical_fn(value or ""))
    return _scope_norm(str(value or ""))


def _resolve_rag_thresholds() -> dict:
    document_score = max(0.05, min(0.95, float(os.getenv("RAG_MIN_DOCUMENT_SCORE", "0.30"))))
    chunk_score = max(0.05, min(document_score, float(os.getenv("RAG_MIN_CHUNK_SCORE", "0.18"))))
    asset_only_score = max(0.05, min(document_score, float(os.getenv("RAG_ASSET_ONLY_SCORE", "0.24"))))
    return {
        "document": document_score,
        "chunk": chunk_score,
        "asset_only": asset_only_score,
    }


def _is_all_year_value(value: Optional[str]) -> bool:
    normalized = _scope_norm(str(value or ""))
    if not normalized:
        return False
    return normalized in {
        "all",
        "all years",
        "all_years",
        "allyears",
        "كل السنين",
        "كل السنوات",
        "جميع السنين",
        "جميع السنوات",
        "كل الدفعات",
    }


def _metadata_matches_retrieval_filter(meta: dict, retrieval_filter: Optional[dict]) -> bool:
    if not isinstance(meta, dict) or not isinstance(retrieval_filter, dict):
        return True

    expected_college = _scope_norm(retrieval_filter.get("college_key") or retrieval_filter.get("college"))
    expected_level = _scope_norm(_canonical_level_value(retrieval_filter.get("level")))
    expected_category = _scope_norm(retrieval_filter.get("category"))
    expected_sources = retrieval_filter.get("sources") or []
    if not isinstance(expected_sources, list):
        expected_sources = [expected_sources]
    expected_sources = [_scope_norm(item) for item in expected_sources if _scope_norm(item)]

    meta_college = _scope_norm(meta.get("college_key") or meta.get("college"))
    meta_level = _scope_norm(_canonical_level_value(meta.get("level")))
    meta_category = _scope_norm(meta.get("category"))
    meta_source = _scope_norm(meta.get("source") or meta.get("source_type"))
    meta_is_all_years = _is_all_year_value(meta_level)
    expected_is_all_years = _is_all_year_value(expected_level)

    if expected_college and meta_college and expected_college != meta_college:
        return False
    if expected_level and meta_level:
        if expected_is_all_years or meta_is_all_years:
            # "ALL years" documents should match per-year queries and vice versa.
            pass
        else:
            level_variants = []
            expand_fn = getattr(router_rag_chatbot, "_expand_level_variants", None)
            if callable(expand_fn):
                level_variants = [str(_scope_norm(v)) for v in (expand_fn(expected_level) or []) if _scope_norm(v)]
            if not level_variants:
                level_variants = [expected_level]
            if meta_level not in level_variants:
                return False
    if expected_category and meta_category and expected_category != meta_category:
        return False
    if expected_sources and meta_source and meta_source not in expected_sources:
        return False
    return True


def _document_group_key(meta: dict) -> str:
    if not isinstance(meta, dict):
        return "unknown"
    for key in ("content_item_id", "document_id", "knowledge_document_id", "storage_item_id", "vector_ref", "file_url"):
        value = meta.get(key)
        if value is not None and str(value).strip():
            return f"{key}:{str(value).strip()}"
    source = str(meta.get("source") or meta.get("source_type") or "unknown").strip()
    page = str(meta.get("page") or "").strip()
    return f"source:{source}|page:{page or 'na'}"


def _rank_document_groups(scored_chunks: List[dict]) -> List[dict]:
    grouped: dict = {}
    for item in scored_chunks or []:
        if not isinstance(item, dict):
            continue
        meta = item.get("metadata") or {}
        group_id = _document_group_key(meta)
        grouped.setdefault(group_id, {"group_id": group_id, "chunks": []})
        grouped[group_id]["chunks"].append(item)

    ranked: List[dict] = []
    for group in grouped.values():
        chunks = sorted(group["chunks"], key=lambda c: float(c.get("score") or 0.0), reverse=True)
        top3 = chunks[:3]
        avg_top3 = sum(float(c.get("score") or 0.0) for c in top3) / max(1, len(top3))
        metadatas = [dict(c.get("metadata") or {}) for c in chunks]
        has_pdf = any(
            str(meta.get("asset_type") or "").strip().lower() == "pdf"
            or str(meta.get("file_url") or "").strip().lower().endswith(".pdf")
            or "storage/files/" in str(meta.get("file_url") or "").strip().lower()
            or str(meta.get("source") or "").strip().lower() in {"storage_pdf", "student_guide_pdf", "knowledge_text"}
            for meta in metadatas
        )
        ranked.append(
            {
                "group_id": group["group_id"],
                "score": avg_top3,
                "chunks": chunks,
                "metadata": metadatas,
                "has_pdf": has_pdf,
            }
        )
    ranked.sort(key=lambda g: float(g.get("score") or 0.0), reverse=True)
    return ranked


def _select_grounded_chunks(chunks: List[dict], min_chunk_score: float, max_chunks: int, max_tokens: int) -> List[dict]:
    selected: List[dict] = []
    token_budget = max(120, int(max_tokens or 1200))
    used = 0
    for item in sorted(chunks or [], key=lambda c: float(c.get("score") or 0.0), reverse=True):
        score = float(item.get("score") or 0.0)
        if score < float(min_chunk_score):
            continue
        doc = item.get("doc")
        text = str(getattr(doc, "page_content", "") or "").strip()
        if not text:
            continue
        token_estimate = max(1, len(text.split()))
        if used + token_estimate > token_budget:
            break
        selected.append(item)
        used += token_estimate
        if len(selected) >= max(1, int(max_chunks or 5)):
            break
    return selected


def _build_sources_from_scored_chunks(scored_chunks: List[dict], max_items: int = 3) -> List[str]:
    out: List[str] = []
    seen = set()
    for item in scored_chunks or []:
        doc = item.get("doc")
        if doc is None:
            continue
        src = router_rag_chatbot._compact_source(doc)
        if src in seen:
            continue
        seen.add(src)
        out.append(src)
        if len(out) >= max_items:
            break
    return out


def _compose_academic_grounded_answer(message: str, scored_chunks: List[dict]) -> str:
    context_blocks: List[str] = []
    for item in scored_chunks or []:
        doc = item.get("doc")
        score = float(item.get("score") or 0.0)
        text = str(getattr(doc, "page_content", "") or "").strip()
        if not text:
            continue
        context_blocks.append(f"[score={score:.3f}] {text}")
    context = "\n\n".join(context_blocks).strip()
    if not context:
        return ""
    prompt = (
        "أنت مساعد أكاديمي جامعي صارم.\n"
        "استخدم فقط المعلومات الموجودة في السياق.\n"
        "لا تضف أي معرفة خارجية.\n"
        "إذا كانت الإجابة غير واضحة من السياق، اكتب: المعلومة غير موجودة في المستندات المتاحة\n\n"
        f"السؤال:\n{message}\n\n"
        f"السياق المسترجع:\n{context}\n\n"
        "الإجابة:"
    )
    try:
        llm = getattr(router_rag_chatbot, "llm", None)
        if llm is None:
            return ""
        response = llm.invoke(prompt)
        answer = response.content if hasattr(response, "content") else str(response)
        return str(answer or "").strip()
    except Exception:
        # Safe fallback: concise extractive answer from top chunk.
        top_doc = scored_chunks[0].get("doc") if scored_chunks else None
        top_text = str(getattr(top_doc, "page_content", "") or "").strip()
        top_text = re.sub(r"\s+", " ", top_text)
        return top_text[:520].strip()


def _extractive_academic_answer(message: str, scored_chunks: List[dict]) -> str:
    if not scored_chunks:
        return ""

    raw_message = str(message or "").strip().lower()
    normalized_message = _normalize_search_text(message or "")
    query_tokens = [tok for tok in normalized_message.split() if len(tok) >= 3]

    wants_duration = any(marker in raw_message for marker in ("مدة الدراسة", "مده الدراسه", "كم سنة", "كم سنه", "سنوات")) or any(
        marker in normalized_message for marker in ("مده الدراسه", "مدة الدراسة", "سنوات", "كم سنه", "كم سنة")
    )
    wants_credit_hours = any(
        marker in raw_message
        for marker in (
            "عدد الساعات المعتمدة",
            "عدد الساعات المعتمده",
            "الساعات المعتمدة",
            "الساعات المعتمده",
            "اجمالي الساعات",
            "إجمالي الساعات",
            "136",
        )
    ) or any(
        marker in normalized_message
        for marker in (
            "عدد الساعات المعتمده",
            "عدد الساعات المعتمدة",
            "الساعات المعتمده",
            "الساعات المعتمدة",
            "136",
        )
    )
    wants_max_load = any(
        marker in raw_message
        for marker in (
            "الحد الأقصى للعبء الأكاديمي",
            "الحد الاقصى للعبء الاكاديمي",
            "حد أقصى",
            "حد اقصى",
            "العبء الأكاديمي",
            "العبء الاكاديمي",
            "max academic load",
        )
    ) or any(
        marker in normalized_message
        for marker in (
            "الحد الاقصى للعبء الاكاديمي",
            "حد اقصى",
            "العبء الاكاديمي",
        )
    )
    wants_min_load = any(
        marker in raw_message
        for marker in (
            "الحد الأدنى للعبء الأكاديمي",
            "الحد الادنى للعبء الاكاديمي",
            "حد أدنى",
            "حد ادنى",
            "min academic load",
        )
    ) or any(
        marker in normalized_message
        for marker in (
            "الحد الادنى للعبء الاكاديمي",
            "حد ادنى",
        )
    )

    prioritized_markers = (
        "مدة الدراسة",
        "عدد الساعات المعتمدة",
        "الساعات المعتمدة",
        "متطلبات التخرج",
        "مشروع التخرج",
        "تدريب ميداني",
        "الفصل الصيفي",
        "الحد الأقصى للعبء الأكاديمي",
        "الحد الأدنى من العبء الأكاديمي",
        "العبء الأكاديمي",
    )

    # Try direct numeric patterns first across the whole retrieved text.
    combined_text = " ".join(
        re.sub(r"\s+", " ", str(getattr(item.get("doc"), "page_content", "") or "")).strip()
        for item in scored_chunks
        if item.get("doc") is not None
    )
    if combined_text:
        if wants_duration:
            direct_duration = re.search(
                r"(?:مد[ةه]\s+الدراس[ةه][^\.:\n]{0,80}?\d+\s*سن(?:ه|ة|وات))",
                combined_text,
                re.IGNORECASE,
            )
            if direct_duration:
                return re.sub(r"\s+", " ", direct_duration.group(0)).strip()[:320]
        if wants_credit_hours:
            direct_hours = re.search(
                r"(?:(?:اجمالي|إجمالي|عدد)\s+الساعات(?:\s+المعتمده|\s+المعتمدة)?[^0-9]{0,30}\d+\s*ساع(?:ه|ة)\s*معتم(?:ده|دة))",
                combined_text,
                re.IGNORECASE,
            )
            if direct_hours:
                return re.sub(r"\s+", " ", direct_hours.group(0)).strip()[:320]
        if wants_max_load:
            direct_max_load = re.search(
                r"(?:الحد\s+الأقصى\s+للعبء\s+الأكاديمي[^\.:\n]{0,180}?\d+\s*ساع(?:ه|ة)\s*معتم(?:ده|دة))",
                combined_text,
                re.IGNORECASE,
            )
            if direct_max_load:
                return re.sub(r"\s+", " ", direct_max_load.group(0)).strip()[:360]
        if wants_min_load:
            direct_min_load = re.search(
                r"(?:الحد\s+الأدنى(?:\s+من)?\s+العبء\s+الأكاديمي[^\.:\n]{0,180}?\d+\s*ساع(?:ه|ة)\s*معتم(?:ده|دة))",
                combined_text,
                re.IGNORECASE,
            )
            if direct_min_load:
                return re.sub(r"\s+", " ", direct_min_load.group(0)).strip()[:360]

    best_line = ""
    best_score = -1

    for item in scored_chunks:
        doc = item.get("doc")
        text = str(getattr(doc, "page_content", "") or "").strip()
        if not text:
            continue
        parts = re.split(r"[\n\r]+|[\u2022\u25aa\u25cf\uf0a7]|(?<=[\.\:\;\،])\s+", text)
        for raw_part in parts:
            candidate = re.sub(r"\s+", " ", str(raw_part or "")).strip(" -:\u2022\u25aa\u25cf\uf0a7")
            if len(candidate) < 6:
                continue
            raw_candidate = candidate.lower()
            normalized_candidate = _normalize_search_text(candidate)

            if wants_duration and (
                "مدة الدراسة" in raw_candidate
                or "مده الدراسه" in raw_candidate
                or "مده الدراسه" in normalized_candidate
            ):
                return candidate[:320].strip()
            if wants_credit_hours and (
                "عدد الساعات المعتمدة" in raw_candidate
                or "عدد الساعات المعتمده" in raw_candidate
                or "إجمالي الساعات" in raw_candidate
                or "اجمالي الساعات" in raw_candidate
                or "136 ساعة معتمدة" in raw_candidate
                or "136 ساعه معتمده" in raw_candidate
                or "عدد الساعات المعتمده" in normalized_candidate
                or "اجمالي الساعات" in normalized_candidate
                or "136 ساعه معتمده" in normalized_candidate
            ):
                return candidate[:320].strip()
            if wants_max_load and (
                "الحد الأقصى للعبء الأكاديمي" in raw_candidate
                or "الحد الاقصى للعبء الاكاديمي" in normalized_candidate
                or ("العبء الاكاديمي" in normalized_candidate and "21" in normalized_candidate)
                or ("العبء الاكاديمي" in normalized_candidate and "18" in normalized_candidate)
            ):
                return candidate[:360].strip()
            if wants_min_load and (
                "الحد الأدنى من العبء الأكاديمي" in raw_candidate
                or "الحد الادنى من العبء الاكاديمي" in normalized_candidate
                or ("العبء الاكاديمي" in normalized_candidate and "9" in normalized_candidate)
            ):
                return candidate[:360].strip()

            overlap = sum(1 for tok in query_tokens if tok in normalized_candidate)
            marker_bonus = sum(2 for marker in prioritized_markers if _normalize_search_text(marker) in normalized_candidate)
            numeric_bonus = 1 if re.search(r"\d", candidate) else 0
            score = overlap + marker_bonus + numeric_bonus
            if score > best_score and overlap > 0:
                best_score = score
                best_line = candidate

    return best_line[:320].strip()


def _regulation_query_markers(message: str) -> List[str]:
    normalized = _normalize_search_text(message or "")
    markers: List[str] = []
    if any(token in normalized for token in ("تخرج", "التخرج", "graduation", "graduate")):
        markers.extend(["التخرج", "متطلبات التخرج", "مشروع التخرج", "تدريب ميداني"])
    if any(token in normalized for token in ("تحويل", "التحويل", "transfer")):
        markers.extend(["التحويل", "الانتقال", "من برنامج إلى آخر", "من تخصص إلى آخر"])
    if any(token in normalized for token in ("حذف", "اضافه", "إضافة", "الاضافه", "الإضافة", "withdraw", "add")):
        markers.extend(["الحذف", "الإضافة", "الاضافة", "الانسحاب", "تسجيل المقررات"])
    if any(token in normalized for token in ("انذار", "إنذار", "warning")):
        markers.extend(["الإنذار", "الانذار", "الفصل", "المعدل التراكمي"])
    if any(token in normalized for token in ("عبء", "العبء", "load", "ساعات معتمده", "ساعات معتمدة")):
        markers.extend(["العبء الأكاديمي", "الحد الأقصى للعبء الأكاديمي", "الحد الأدنى من العبء الأكاديمي", "21ساعة معتمدة", "9 ساعات معتمدة"])
    return markers


def _extract_regulation_section_answer(text: str, message: str) -> str:
    clean_text = re.sub(r"\s+", " ", str(text or "")).strip()
    if not clean_text:
        return ""

    normalized_message = _normalize_search_text(message or "")
    anchors: List[str] = []
    if any(token in normalized_message for token in ("تخرج", "التخرج", "graduation", "graduate")):
        anchors.extend(["متطلبات التخرج", "التخرج", "يتخرج الطالب", "مشروع التخرج"])
    if any(token in normalized_message for token in ("تحويل", "التحويل", "transfer")):
        anchors.extend(["التحويل", "تحويل الطالب", "الانتقال", "من برنامج إلى آخر", "من تخصص إلى آخر"])
    if any(token in normalized_message for token in ("حذف", "اضافه", "إضافة", "الاضافه", "الإضافة", "withdraw", "add")):
        anchors.extend(["الانسحاب", "الحذف", "الإضافة", "الاضافة", "تسجيل المقررات"])
    if any(token in normalized_message for token in ("انذار", "إنذار", "warning")):
        anchors.extend(["الإنذار", "الانذار", "المراقبة", "الفصل"])
    if any(token in normalized_message for token in ("عبء", "العبء", "load", "ساعات معتمده", "ساعات معتمدة")):
        anchors.extend(["الحد الأقصى للعبء الأكاديمي", "الحد الأدنى من العبء الأكاديمي", "العبء الأكاديمي", "يمكن لطلاب السنة النهائية"])

    if not anchors:
        return ""

    for anchor in anchors:
        match = re.search(re.escape(anchor), clean_text, re.IGNORECASE)
        if not match:
            continue

        start = match.start()
        end = min(len(clean_text), start + 720)
        snippet = clean_text[start:end].strip(" |-\n\r\t")
        if len(snippet) < 24:
            continue

        boundary_match = re.search(r"(?:\s[■●•]\s|\sثانيا[:：]|\sثالثا[:：]|\sرابعا[:：])", snippet[80:])
        if boundary_match:
            snippet = snippet[: 80 + boundary_match.start()].strip(" |-\n\r\t")

        if len(snippet) >= 24:
            return snippet[:520].strip()

    return ""


def _split_storage_extracted_text(text: str, chunk_size: int = 850, chunk_overlap: int = 120) -> List[str]:
    normalized_text = str(text or "").replace("\r", "\n")
    raw_parts = [
        re.sub(r"\s+", " ", part).strip()
        for part in re.split(r"\n{2,}|---\s*صفحة\s*\d+\s*---|(?<=[\.\:\;\،])\s+(?=\S)", normalized_text)
        if re.sub(r"\s+", " ", part).strip()
    ]
    if not raw_parts:
        return []

    chunks: List[str] = []
    current = ""
    for part in raw_parts:
        candidate = f"{current} {part}".strip() if current else part
        if len(candidate) <= chunk_size:
            current = candidate
            continue
        if current:
            chunks.append(current)
        if len(part) <= chunk_size:
            current = part
            continue
        start = 0
        while start < len(part):
            end = min(len(part), start + chunk_size)
            slice_text = part[start:end].strip()
            if slice_text:
                chunks.append(slice_text)
            if end >= len(part):
                break
            start = max(0, end - chunk_overlap)
        current = ""
    if current:
        chunks.append(current)
    return chunks


def _retrieve_regulation_chunks_from_storage(
    db: Session,
    message: str,
    retrieval_filter: Optional[dict],
    limit: int = 10,
) -> List[dict]:
    normalized_message = _normalize_search_text(message or "")
    query_tokens = [tok for tok in normalized_message.split() if len(tok) >= 3]
    marker_terms = [_normalize_search_text(item) for item in _regulation_query_markers(message) if _normalize_search_text(item)]
    if not query_tokens and not marker_terms:
        return []

    rows = (
        db.query(StorageItem)
        .filter(
            (StorageItem.content_type == "regulation")
            | (StorageItem.file_name.ilike("%لائ%"))
            | (StorageItem.file_name.ilike("%regulation%"))
        )
        .order_by(StorageItem.priority.desc(), StorageItem.updated_at.desc())
        .all()
    )

    scored_chunks: List[dict] = []
    expected_level = _scope_norm(_canonical_level_value((retrieval_filter or {}).get("level")))
    expected_college = _scope_norm((retrieval_filter or {}).get("college_key") or (retrieval_filter or {}).get("college"))

    for item in rows:
        item_text = str(getattr(item, "extracted_text", "") or "").strip()
        if not item_text:
            continue

        item_level = _scope_norm(_canonical_level_value(getattr(item, "level", "") or ""))
        item_college = _scope_norm(getattr(item, "college", "") or "")
        if expected_level and item_level and not (_is_all_year_value(expected_level) or _is_all_year_value(item_level) or item_level == expected_level):
            continue
        if expected_college and item_college and expected_college != item_college:
            continue

        file_url = f"/api/storage/files/{str(getattr(item, 'stored_name', '') or '').strip()}" if str(getattr(item, "stored_name", "") or "").strip() else ""
        text_chunks = _split_storage_extracted_text(item_text)
        for chunk_index, chunk_text in enumerate(text_chunks, start=1):
            normalized_chunk = _normalize_search_text(chunk_text)
            overlap = sum(1 for tok in query_tokens if tok in normalized_chunk)
            marker_hits = sum(1 for marker in marker_terms if marker in normalized_chunk)
            policy_bonus = sum(1 for marker in ("يجوز", "يشترط", "يجب", "متطلبات", "شروط", "شرط") if _normalize_search_text(marker) in normalized_chunk)
            if overlap <= 0 and marker_hits <= 0:
                continue

            score = min(0.95, (0.12 * overlap) + (0.18 * marker_hits) + (0.04 * policy_bonus))
            metadata = {
                "document_id": f"storage:{item.id}",
                "source": "storage_pdf",
                "source_type": str(getattr(item, "source_type", "") or "word"),
                "storage_item_id": int(getattr(item, "id", 0) or 0),
                "storage_file_name": str(getattr(item, "file_name", "") or "").strip(),
                "stored_name": str(getattr(item, "stored_name", "") or "").strip(),
                "file_url": file_url,
                "content_type": str(getattr(item, "content_type", "") or "").strip().lower() or "regulation",
                "priority": str(getattr(item, "priority", 0) or 0),
                "page": 1,
                "chunk": chunk_index,
                "access_scope": "public" if _is_all_year_value(item_level) or not item_level else "level",
                "level": item_level or "all",
                "college": str(getattr(item, "college", "") or "").strip() or None,
                "category": str(getattr(item, "category", "") or "").strip().lower() or None,
            }
            doc = SimpleNamespace(page_content=chunk_text, metadata={k: v for k, v in metadata.items() if v is not None})
            scored_chunks.append(
                {
                    "doc": doc,
                    "score": score,
                    "base_score": score,
                    "raw_score": score,
                    "score_kind": "storage_text",
                    "metadata": dict(doc.metadata),
                    "applied_filter": dict(retrieval_filter or {}),
                }
            )

    scored_chunks.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)
    return scored_chunks[: max(1, int(limit or 10))]


def _extract_regulation_answer_from_storage(db: Session, message: str, retrieval_filter: Optional[dict]) -> str:
    rows = (
        db.query(StorageItem)
        .filter(
            (StorageItem.content_type == "regulation")
            | (StorageItem.file_name.ilike("%لائ%"))
            | (StorageItem.file_name.ilike("%regulation%"))
        )
        .order_by(StorageItem.priority.desc(), StorageItem.updated_at.desc())
        .all()
    )
    for item in rows:
        section_answer = _extract_regulation_section_answer(
            text=str(getattr(item, "extracted_text", "") or ""),
            message=message,
        )
        if section_answer:
            return section_answer

    storage_chunks = _retrieve_regulation_chunks_from_storage(
        db=db,
        message=message,
        retrieval_filter=retrieval_filter,
        limit=12,
    )
    if not storage_chunks:
        return ""
    answer = _extractive_academic_answer(message, storage_chunks)
    if answer:
        return answer
    top_doc = storage_chunks[0].get("doc")
    top_text = re.sub(r"\s+", " ", str(getattr(top_doc, "page_content", "") or "")).strip()
    return top_text[:420].strip()


def _fees_query_markers(message: str) -> List[str]:
    normalized = _normalize_search_text(message or "")
    markers: List[str] = []
    if any(token in normalized for token in ("مصاريف", "المصاريف", "رسوم", "الرسوم", "fees", "tuition")):
        markers.extend(["المصروفات الدراسية", "مصاريف كلية علوم الحاسب", "75 الف جنية مصري"])
    if any(token in normalized for token in ("منح", "منحه", "scholarship")):
        markers.extend(["المنح الدراسية", "منح التفوق", "منح التفوق الرياضي", "الطلاب المتميزين والمبدعين"])
    if any(token in normalized for token in ("خصم", "تخفيض", "discount")):
        markers.extend(["تخفيضات المصروفات الدراسية", "أبناء الشهداء", "الأخوة", "ذوي الهمم", "أعضاء هيئة التدريس"])
    if any(token in normalized for token in ("دعم اجتماعي", "support")):
        markers.extend(["الدعم الاجتماعي", "فقد عائله"])
    return markers


def _extract_fees_section_answer(text: str, message: str) -> str:
    clean_text = re.sub(r"\s+", " ", str(text or "")).strip()
    if not clean_text:
        return ""

    normalized_message = _normalize_search_text(message or "")

    asks_tuition = any(token in normalized_message for token in ("مصاريف", "المصاريف", "رسوم", "الرسوم", "fees", "tuition"))
    asks_scholarships = any(token in normalized_message for token in ("منح", "منحه", "scholarship"))
    asks_discounts = any(token in normalized_message for token in ("خصم", "تخفيض", "discount"))
    asks_social = any(token in normalized_message for token in ("دعم اجتماعي", "فقد عائله", "فقد عائله", "support"))

    if asks_tuition:
        tuition_match = re.search(
            r"(?:المصروفات\s+الدراسية\s+لكلية\s+علوم\s+الحاسب[^\.:\n]{0,80}?75\s*الف\s*جني[هة]\s*مصري)",
            clean_text,
            re.IGNORECASE,
        )
        if tuition_match:
            return re.sub(r"\s+", " ", tuition_match.group(0)).strip() + "."

    anchors: List[str] = []
    if asks_scholarships:
        anchors.extend(["المنح الدراسية", "منح التفوق", "منح التفوق الرياضي", "الطلاب المتميزين والمبدعين"])
    if asks_discounts:
        anchors.extend(["تخفيضات المصروفات الدراسية", "أبناء الشهداء", "الأخوة", "أعضاء هيئة التدريس", "ذوي الهمم"])
    if asks_social:
        anchors.extend(["الدعم الاجتماعي", "فقد عائله"])
    if asks_tuition and not anchors:
        anchors.extend(["المصروفات الدراسية", "مصاريف كلية علوم الحاسب"])

    for anchor in anchors:
        match = re.search(re.escape(anchor), clean_text, re.IGNORECASE)
        if not match:
            continue
        start = match.start()
        end = min(len(clean_text), start + 700)
        snippet = clean_text[start:end].strip(" |-\n\r\t")
        boundary_match = re.search(r"(?:\sأولاً[:：]|\sثانياً[:：]|\sثالثاً[:：]|\sقواعد عامة)", snippet[40:])
        if boundary_match and anchor not in {"المصروفات الدراسية", "المنح الدراسية"}:
            snippet = snippet[: 40 + boundary_match.start()].strip(" |-\n\r\t")
        if len(snippet) >= 20:
            return snippet[:520].strip()

    return ""


def _retrieve_fee_chunks_from_storage(
    db: Session,
    message: str,
    limit: int = 8,
) -> List[dict]:
    normalized_message = _normalize_search_text(message or "")
    query_tokens = [tok for tok in normalized_message.split() if len(tok) >= 3]
    marker_terms = [_normalize_search_text(item) for item in _fees_query_markers(message) if _normalize_search_text(item)]
    if not query_tokens and not marker_terms:
        return []

    rows = (
        db.query(StorageItem)
        .filter(
            (StorageItem.category == "fees")
            | (StorageItem.file_name.ilike("%مصاريف%"))
            | (StorageItem.file_name.ilike("%رسوم%"))
            | (StorageItem.file_name.ilike("%fees%"))
            | (StorageItem.file_name.ilike("%tuition%"))
        )
        .order_by(StorageItem.priority.desc(), StorageItem.updated_at.desc())
        .all()
    )

    scored_chunks: List[dict] = []
    for item in rows:
        item_text = str(getattr(item, "extracted_text", "") or "").strip()
        if not item_text:
            continue
        file_url = f"/api/storage/files/{str(getattr(item, 'stored_name', '') or '').strip()}" if str(getattr(item, "stored_name", "") or "").strip() else ""
        text_chunks = _split_storage_extracted_text(item_text)
        for chunk_index, chunk_text in enumerate(text_chunks, start=1):
            normalized_chunk = _normalize_search_text(chunk_text)
            overlap = sum(1 for tok in query_tokens if tok in normalized_chunk)
            marker_hits = sum(1 for marker in marker_terms if marker in normalized_chunk)
            if overlap <= 0 and marker_hits <= 0:
                continue
            score = min(0.95, (0.12 * overlap) + (0.20 * marker_hits))
            metadata = {
                "document_id": f"storage:{item.id}",
                "source": "storage_pdf",
                "source_type": str(getattr(item, "source_type", "") or "word"),
                "storage_item_id": int(getattr(item, "id", 0) or 0),
                "storage_file_name": str(getattr(item, "file_name", "") or "").strip(),
                "stored_name": str(getattr(item, "stored_name", "") or "").strip(),
                "file_url": file_url,
                "content_type": str(getattr(item, "content_type", "") or "").strip().lower() or "general",
                "priority": str(getattr(item, "priority", 0) or 0),
                "page": 1,
                "chunk": chunk_index,
                "access_scope": "public",
                "level": "all",
                "category": str(getattr(item, "category", "") or "").strip().lower() or None,
            }
            doc = SimpleNamespace(page_content=chunk_text, metadata={k: v for k, v in metadata.items() if v is not None})
            scored_chunks.append(
                {
                    "doc": doc,
                    "score": score,
                    "base_score": score,
                    "raw_score": score,
                    "score_kind": "storage_text",
                    "metadata": dict(doc.metadata),
                    "applied_filter": {"category": "fees"},
                }
            )

    scored_chunks.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)
    return scored_chunks[: max(1, int(limit or 8))]


def _extract_fees_answer_from_storage(db: Session, message: str) -> str:
    rows = (
        db.query(StorageItem)
        .filter(
            (StorageItem.category == "fees")
            | (StorageItem.file_name.ilike("%مصاريف%"))
            | (StorageItem.file_name.ilike("%رسوم%"))
            | (StorageItem.file_name.ilike("%fees%"))
            | (StorageItem.file_name.ilike("%tuition%"))
        )
        .order_by(StorageItem.priority.desc(), StorageItem.updated_at.desc())
        .all()
    )
    for item in rows:
        answer = _extract_fees_section_answer(str(getattr(item, "extracted_text", "") or ""), message)
        if answer:
            return answer

    storage_chunks = _retrieve_fee_chunks_from_storage(db=db, message=message, limit=10)
    if not storage_chunks:
        return ""
    answer = _extractive_academic_answer(message, storage_chunks)
    if answer:
        return answer
    top_doc = storage_chunks[0].get("doc")
    top_text = re.sub(r"\s+", " ", str(getattr(top_doc, "page_content", "") or "")).strip()
    return top_text[:420].strip()


def _load_all_chunks_for_document(document_id: str) -> List[dict]:
    vector_store = getattr(router_rag_chatbot, "vector_store", None)
    if vector_store is None or not document_id:
        return []

    payload = None
    try:
        getter = getattr(vector_store, "get", None)
        if callable(getter):
            payload = getter(where={"document_id": str(document_id)})
    except Exception:
        payload = None

    if not payload:
        collection = getattr(vector_store, "_collection", None)
        if collection is not None:
            try:
                payload = collection.get(
                    where={"document_id": str(document_id)},
                    include=["documents", "metadatas"],
                )
            except Exception:
                payload = None

    if not payload:
        return []

    documents = list((payload or {}).get("documents") or [])
    metadatas = list((payload or {}).get("metadatas") or [])
    items: List[dict] = []
    for idx, text in enumerate(documents):
        meta = metadatas[idx] if idx < len(metadatas) and isinstance(metadatas[idx], dict) else {}
        doc_obj = type("SimpleDoc", (), {"page_content": str(text or "")})()
        items.append({"doc": doc_obj, "metadata": dict(meta or {}), "score": 0.0})

    items.sort(
        key=lambda item: (
            int((item.get("metadata") or {}).get("page") or 0),
            int((item.get("metadata") or {}).get("chunk") or 0),
        )
    )
    return items


def _grade_from_percentage(percentage: float) -> str:
    if percentage >= 90:
        return "A"
    if percentage >= 80:
        return "B"
    if percentage >= 60:
        return "C"
    if percentage >= 50:
        return "D"
    return "L"

@app.post("/api/gpa/calculate", response_model=GPAResponse)
async def calculate_gpa_endpoint(request: GPARequest):
    """
    Calculate GPA from a list of courses.
    
    Grade scale:
    - A / A+: 4.0
    - B: 3.0
    - C: 2.0
    - D: 1.0
    - L / F: 0.0
    """
    try:
        courses = [GPACourse(name=course.name, credits=course.credits, grade=course.grade.upper()) 
                  for course in request.courses]
        result = calculate_gpa(courses)
        return GPAResponse(
            gpa=result["gpa"],
            total_credits=result["total_credits"],
            total_points=result["total_points"]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/gpa/grade-from-score", response_model=GradeFromScoreResponse)
async def grade_from_score_endpoint(request: GradeFromScoreRequest):
    results: List[GradeFromScoreResult] = []
    for entry in request.entries:
        pct = (float(entry.total) / float(entry.max_total)) * 100.0 if entry.max_total > 0 else 0.0
        pct = max(0.0, min(100.0, pct))
        results.append(
            GradeFromScoreResult(
                item_key=entry.item_key,
                total=round(float(entry.total), 2),
                max_total=round(float(entry.max_total), 2),
                percentage=round(pct, 2),
                grade=_grade_from_percentage(pct),
            )
        )
    return GradeFromScoreResponse(results=results)


# ==================== RAG Chatbot Endpoints ====================
# (RAG endpoints have been migrated to routers/chatbot.py)

@app.post("/api/chat")
async def legacy_chat_endpoint(
    request: LegacyChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Backward-compatible chat endpoint used by existing frontend code.
    """
    if router_rag_chatbot is None:
        raise HTTPException(status_code=503, detail="AI Service unavailable.")

    conv = _resolve_or_create_general_conversation(
        db=db,
        current_user=current_user,
        requested_conversation_id=request.conversation_id,
    )
    now = datetime.now(timezone.utc)
    user_sender_type = "student" if str(current_user.role or "").lower() == "student" else "admin"
    raw_message = str(request.message or "").strip()

    db.add(
        Message(
            id=str(uuid.uuid4()),
            conversation_id=conv.id,
            sender_type=user_sender_type,
            sender_user_id=current_user.id,
            sender_name=getattr(current_user, "full_name", None) or getattr(current_user, "username", None),
            text=raw_message,
            is_read=True,
            created_at=now,
        )
    )
    response_type = _resolve_chat_mode(request, raw_message)
    if response_type != "INDEXING" and _is_index_preview_request(raw_message):
        response_type = "ACADEMIC"
    classified_type = response_type
    response_text = ""
    source_name = None
    actions: List[str] = []
    sources: List[str] = []
    assets: List[dict] = []
    related_content: List[dict] = []
    display_payload: Optional[dict] = None
    retrieval_filter = None
    explicit_file_request = False
    best_retrieval_score = 0.0
    retrieved_docs_metadata: List[dict] = []
    debug_info = {
        "classification": classified_type,
        "retrieval_source_used": "none",
        "retrieved_docs_count": 0,
        "retrieval_score": 0.0,
        "applied_filters": [],
        "threshold_used": 0.0,
        "fallback_triggered": False,
        "grounded": False,
        "decision_reason": "",
    }

    if response_type not in {"INDEXING", "SYSTEM"}:
        bnu_facts_answer = _answer_bnu_facts_query(raw_message)
        if bnu_facts_answer:
            response_type = "GENERAL"
            response_text = bnu_facts_answer
            debug_info["grounded"] = True
            debug_info["fallback_triggered"] = True
            debug_info["decision_reason"] = "Answered from trusted built-in BNU facts before RAG/LLM."

    if not response_text and response_type not in {"INDEXING", "SYSTEM"}:
        fees_answer = _extract_fees_answer_from_storage(db=db, message=raw_message)
        if fees_answer:
            response_type = "ACADEMIC"
            response_text = fees_answer
            source_name = "مصاريف كلية علوم الحاسب"
            actions = ["عرض الملف"]
            debug_info["grounded"] = True
            debug_info["fallback_triggered"] = True
            debug_info["retrieval_source_used"] = "storage_pdf"
            debug_info["decision_reason"] = "Answered directly from indexed fees document before general RAG composition."

    display_intent = response_type != "INDEXING" and _detect_display_intent(raw_message)
    if response_type not in {"INDEXING", "SYSTEM"} and display_intent:
        display_matches = _search_display_content(db=db, current_user=current_user, query=raw_message, limit=3)
        if display_matches:
            top_match = display_matches[0]
            top_score = float(top_match.get("display_score") or 0.0)
            second_score = float((display_matches[1] or {}).get("display_score") or 0.0) if len(display_matches) > 1 else 0.0
            strong_single = top_score >= 10 and (len(display_matches) == 1 or (top_score - second_score) >= 3)
            if strong_single:
                response_type = "DISPLAY"
                display_payload = _build_display_response_payload(top_match)
                response_text = f"تفضل، هذا المحتوى الأقرب لطلبك: {display_payload['title']}"
                source_name = display_payload["title"]
                related_content = [top_match]
                assets = _assets_from_related_content(related_content)
                actions = ["عرض الملف"] if _has_openable_asset(assets, related_content) else []
                debug_info["grounded"] = True
                debug_info["fallback_triggered"] = True
                debug_info["decision_reason"] = "Display intent matched a single strong metadata result before RAG."
            else:
                response_type = "DISPLAY"
                related_content = display_matches[:3]
                assets = _assets_from_related_content(related_content)
                actions = ["عرض الملف"] if _has_openable_asset(assets, related_content) else []
                response_text = "وجدت أكثر من نتيجة قريبة. هل تقصد: " + "، ".join(
                    str(item.get("subject") or "").strip() for item in related_content if str(item.get("subject") or "").strip()
                )
                debug_info["grounded"] = True
                debug_info["fallback_triggered"] = True
                debug_info["decision_reason"] = "Display intent matched multiple close metadata results and requires clarification."

    if not response_text and response_type not in {"INDEXING", "SYSTEM"} and _is_student_data_query(raw_message):
        db_answer = _answer_student_data_query(current_user, raw_message)
        if db_answer:
            response_type = "DB"
            response_text = db_answer
            debug_info["grounded"] = True
            debug_info["fallback_triggered"] = True
            debug_info["decision_reason"] = "Answered from lightweight student DB profile layer before RAG."

    if response_type == "INDEXING":
        response_type = "SYSTEM"
        response_text = "وضع الفهرسة ليس من خلال الشات. استخدم لوحة الإدارة لرفع وفهرسة الملفات."
        debug_info["decision_reason"] = "INDEXING mode was requested on /api/chat and redirected to SYSTEM response."
    elif response_type == "SYSTEM":
        response_text = "ممكن توضح سؤالك أكتر؟"
        debug_info["decision_reason"] = "Message classified as SYSTEM."
    elif response_type in {"DISPLAY", "DB"}:
        pass
    elif response_type == "ACADEMIC":
        explicit_file_request = _is_explicit_file_request(raw_message)
        media_preview_mode = False
        is_regulation_query = _is_regulation_intent(raw_message)
        requested_college = str(request.college or "").strip()
        requested_year = str(request.year or "").strip()
        current_user_level = str(getattr(current_user, "level", "") or "")
        requested_year_for_filter = _canonical_level_value(requested_year or current_user_level)
        if _is_all_year_value(requested_year_for_filter):
            requested_year_for_filter = ""
        requested_subject = str(request.subject or "").strip()
        requested_category = str(request.category or "").strip()
        retrieval_filter = {
            "level": requested_year_for_filter or _canonical_level_value(current_user_level),
            "college_key": _canonical_college_key(requested_college or str(getattr(current_user, "college", "") or "")),
            "category": (requested_subject or requested_category or "").strip().lower() or None,
            "sources": ["storage_pdf", "student_guide_pdf", "knowledge_text"],
        }
        fallback_retrieval_filter = dict(retrieval_filter)
        if is_regulation_query:
            retrieval_filter["preferred_content_type"] = "regulation"
            retrieval_filter["content_type"] = "regulation"
        debug_info["applied_filters"] = _filters_to_debug_list(retrieval_filter)
        query_text = _expand_numeric_student_query(raw_message, current_user)
        thresholds = _resolve_rag_thresholds()
        min_document_score = float(thresholds["document"])
        min_chunk_score = float(thresholds["chunk"])
        min_asset_only_score = float(thresholds["asset_only"])
        if is_regulation_query:
            min_document_score = min(min_document_score, 0.22)
            min_chunk_score = min(min_chunk_score, 0.12)
            min_asset_only_score = min(min_asset_only_score, 0.18)
        max_answer_chunks = max(1, int(os.getenv("RAG_MAX_ANSWER_CHUNKS", "5")))
        max_context_tokens = max(300, int(os.getenv("RAG_MAX_CONTEXT_TOKENS", "1400")))
        debug_info["threshold_used"] = float(min_document_score)
        related_content = _get_related_content(
            db=db,
            current_user=current_user,
            query=raw_message,
            limit=2,
        )

        if _has_related_media_or_files(related_content) and (explicit_file_request or _is_schedule_like_query(raw_message)):
            response_type = "ACADEMIC"
            response_text = "تم العثور على محتوى مرتبط بسؤالك. يمكنك عرضه مباشرة."
            actions = ["عرض الملف"] if _has_openable_asset([], related_content) else []
            source_name = str((related_content[0] or {}).get("subject") or "").strip() or None
            sources = []
            assets = []
            media_preview_mode = True
            debug_info["grounded"] = True
            debug_info["fallback_triggered"] = True
            debug_info["decision_reason"] = "Answered from related media/content preview without RAG retrieval."
        else:
            related_content = []

        if not media_preview_mode:
            try:
                scored_chunks_raw = router_rag_chatbot.retrieve_scored_documents(
                    message=query_text,
                    retrieval_filter=retrieval_filter,
                    k=max(12, max_answer_chunks * 3),
                )
            except Exception:
                scored_chunks_raw = []

            if is_regulation_query and not scored_chunks_raw:
                try:
                    scored_chunks_raw = router_rag_chatbot.retrieve_scored_documents(
                        message=query_text,
                        retrieval_filter=fallback_retrieval_filter,
                        k=max(12, max_answer_chunks * 3),
                    )
                    if scored_chunks_raw:
                        debug_info["fallback_triggered"] = True
                        debug_info["decision_reason"] = "Primary regulation-only retrieval was empty; expanded to general academic sources."
                except Exception:
                    scored_chunks_raw = []

            scored_chunks = [
                item
                for item in (scored_chunks_raw or [])
                if _metadata_matches_retrieval_filter(
                    item.get("metadata") or {},
                    fallback_retrieval_filter if (is_regulation_query and debug_info["fallback_triggered"]) else retrieval_filter,
                )
            ]
            if not scored_chunks and _is_index_preview_request(raw_message):
                # Keep preview requests useful, but still retrieval-only.
                scored_chunks = scored_chunks_raw or []
                debug_info["fallback_triggered"] = True

            if is_regulation_query and (not scored_chunks or max(float(item.get("score") or 0.0) for item in scored_chunks) < min_document_score):
                storage_text_chunks = _retrieve_regulation_chunks_from_storage(
                    db=db,
                    message=query_text,
                    retrieval_filter=fallback_retrieval_filter,
                    limit=max(8, max_answer_chunks * 2),
                )
                if storage_text_chunks:
                    scored_chunks = sorted(
                        [*(scored_chunks or []), *storage_text_chunks],
                        key=lambda item: float(item.get("score") or 0.0),
                        reverse=True,
                    )
                    debug_info["fallback_triggered"] = True
                    debug_info["decision_reason"] = "Used regulation text fallback from storage_items.extracted_text."

            ranked_docs = _rank_document_groups(scored_chunks)
            best_doc = ranked_docs[0] if ranked_docs else None
            best_retrieval_score = float(best_doc.get("score") or 0.0) if best_doc else 0.0
            debug_info["retrieved_docs_count"] = len(scored_chunks)
            debug_info["retrieval_score"] = best_retrieval_score

            if not best_doc:
                if not explicit_file_request and not _is_strict_academic_query(raw_message) and not is_regulation_query:
                    general_answer = _invoke_general_llm_answer(raw_message, conv.id)
                    response_type = "GENERAL"
                    response_text = f"{general_answer}\n\n⚠️ هذه إجابة عامة وليست من مستندات الجامعة"
                    source_name = None
                    sources = []
                    assets = []
                    related_content = []
                    actions = []
                    debug_info["grounded"] = False
                    debug_info["fallback_triggered"] = True
                    debug_info["decision_reason"] = "Academic retrieval had no matches; downgraded to GENERAL for non-strict query."
                else:
                    response_type = "MISSING_DATA"
                    response_text = "المعلومة غير موجودة في المستندات المتاحة"
                    actions = ["رفع مستند"]
                    source_name = None
                    sources = []
                    assets = []
                    related_content = []
                    debug_info["grounded"] = False
                    debug_info["decision_reason"] = "No academic chunks matched retrieval filters."
            else:
                grounded_chunks = _select_grounded_chunks(
                    chunks=best_doc.get("chunks") or [],
                    min_chunk_score=min_chunk_score,
                    max_chunks=max_answer_chunks,
                    max_tokens=max_context_tokens,
                )
                best_doc_metadata = list(best_doc.get("metadata") or [])
                best_document_id = str((best_doc_metadata[0] or {}).get("document_id") or "").strip() if best_doc_metadata else ""
                full_document_chunks = _load_all_chunks_for_document(best_document_id)
                sources = _build_sources_from_scored_chunks(best_doc.get("chunks") or [], max_items=3)
                source_name = _extract_primary_source_file(db, sources)
                retrieved_docs_metadata = [dict(item.get("metadata") or {}) for item in (best_doc.get("chunks") or [])]
                assets = _assets_from_docs_metadata(db, retrieved_docs_metadata)
                debug_info["retrieval_source_used"] = _detect_retrieval_source(sources)

                if best_retrieval_score >= min_document_score and grounded_chunks:
                    response_type = "ACADEMIC"
                    response_text = _compose_academic_grounded_answer(raw_message, grounded_chunks)
                    if not response_text or _is_not_found_academic_answer(response_text):
                        extractive_answer = _extractive_academic_answer(raw_message, grounded_chunks) or _extractive_academic_answer(raw_message, full_document_chunks)
                        if extractive_answer:
                            response_type = "ACADEMIC"
                            response_text = extractive_answer
                            actions = ["عرض الملف"] if _has_openable_asset(assets, related_content) else ["مستندات مرتبطة"]
                            debug_info["grounded"] = True
                            debug_info["fallback_triggered"] = True
                            debug_info["decision_reason"] = "Used extractive fallback from grounded chunks after answer composition was not confident."
                        else:
                            regulation_storage_answer = _extract_regulation_answer_from_storage(
                                db=db,
                                message=raw_message,
                                retrieval_filter=fallback_retrieval_filter,
                            ) if is_regulation_query else ""
                            if regulation_storage_answer:
                                response_type = "ACADEMIC"
                                response_text = regulation_storage_answer
                                actions = ["عرض الملف"] if _has_openable_asset(assets, related_content) else ["مستندات مرتبطة"]
                                debug_info["grounded"] = True
                                debug_info["fallback_triggered"] = True
                                debug_info["decision_reason"] = "Recovered answer from full regulation extracted_text after chunk answer was not confident."
                            else:
                                response_text = "المعلومة غير موجودة في المستندات المتاحة"
                                response_type = "MISSING_DATA"
                                assets = []
                                actions = ["رفع مستند"]
                                source_name = None
                                sources = []
                                debug_info["grounded"] = False
                                debug_info["decision_reason"] = "Grounded chunks existed but answer composition was not confident."
                    else:
                        response_type = "ACADEMIC"
                        actions = ["عرض الملف"] if _has_openable_asset(assets, related_content) else ["مستندات مرتبطة"]
                        debug_info["grounded"] = True
                        debug_info["decision_reason"] = "Selected best document by avg top-3 chunk scores and answered from top confident chunks."
                else:
                    has_pdf_asset = any(str(item.get("type") or "").strip().lower() == "pdf" for item in (assets or []))
                    allow_asset_only = False
                    if has_pdf_asset:
                        doc_overlap = _has_query_doc_overlap(raw_message, source_name, assets)
                        allow_asset_only = explicit_file_request or doc_overlap
                    if is_regulation_query and best_doc.get("chunks"):
                        extractive_answer = _extractive_academic_answer(raw_message, best_doc.get("chunks") or []) or _extractive_academic_answer(raw_message, full_document_chunks)
                        if extractive_answer:
                            response_type = "ACADEMIC"
                            response_text = extractive_answer
                            actions = ["عرض الملف"] if _has_openable_asset(assets, related_content) else ["مستندات مرتبطة"]
                            debug_info["grounded"] = True
                            debug_info["fallback_triggered"] = True
                            debug_info["decision_reason"] = "Regulation query accepted extractive answer from matched document despite low aggregate score."
                            allow_asset_only = False
                        else:
                            allow_asset_only = allow_asset_only
                    if allow_asset_only and best_retrieval_score >= min_asset_only_score:
                        response_type = "ACADEMIC"
                        response_text = "تم العثور على ملف متعلق بسؤالك، يمكنك الاطلاع عليه:"
                        actions = ["عرض الملف"] if _has_openable_asset(assets, []) else ["مستندات مرتبطة"]
                        related_content = []
                        debug_info["grounded"] = False
                        debug_info["fallback_triggered"] = True
                        debug_info["decision_reason"] = "Selected document has a matching PDF asset, but textual grounding confidence was weak."
                    else:
                        extractive_answer = _extractive_academic_answer(raw_message, best_doc.get("chunks") or []) or _extractive_academic_answer(raw_message, full_document_chunks)
                        if extractive_answer:
                            response_type = "ACADEMIC"
                            response_text = extractive_answer
                            actions = ["عرض الملف"] if _has_openable_asset(assets, []) else ["مستندات مرتبطة"]
                            related_content = []
                            debug_info["grounded"] = True
                            debug_info["fallback_triggered"] = True
                            debug_info["decision_reason"] = "Used extractive fallback from the best retrieved document despite weak aggregate score."
                        else:
                            if not explicit_file_request and not _is_strict_academic_query(raw_message):
                                general_answer = _invoke_general_llm_answer(raw_message, conv.id)
                                response_type = "GENERAL"
                                response_text = f"{general_answer}\n\n⚠️ هذه إجابة عامة وليست من مستندات الجامعة"
                                actions = []
                                source_name = None
                                sources = []
                                assets = []
                                related_content = []
                                debug_info["grounded"] = False
                                debug_info["fallback_triggered"] = True
                                debug_info["decision_reason"] = "Academic grounding was weak; downgraded to GENERAL for non-strict query."
                            else:
                                response_type = "MISSING_DATA"
                                response_text = "المعلومة غير موجودة في المستندات المتاحة"
                                actions = ["رفع مستند"]
                                source_name = None
                                sources = []
                                assets = []
                                related_content = []
                                debug_info["grounded"] = False
                                debug_info["fallback_triggered"] = True
                                debug_info["decision_reason"] = "Academic grounding was weak and fallback behavior is disabled."

        # For normal academic Q&A, return text only unless user explicitly asked to open/show files.
        if response_type == "ACADEMIC" and not explicit_file_request and not media_preview_mode:
            actions = [a for a in (actions or []) if str(a or "").strip() != "عرض الملف"]
            assets = []
    else:
        general_answer = _invoke_general_llm_answer(raw_message, conv.id)
        response_text = f"{general_answer}\n\n⚠️ هذه إجابة عامة وليست من مستندات الجامعة"
        response_type = "GENERAL"
        source_name = None
        actions = []
        assets = []
        debug_info["decision_reason"] = "Message classified as GENERAL; response generated by LLM."

    if not str(response_text or "").strip():
        response_text = "تعذر توليد الإجابة الآن. حاول مرة أخرى بعد قليل."

    assistant_created_at = datetime.now(timezone.utc)
    db.add(
        Message(
            id=str(uuid.uuid4()),
            conversation_id=conv.id,
            sender_type="assistant",
            sender_user_id=None,
            sender_name="BNU Assistant",
            text=response_text,
            is_read=True,
            created_at=assistant_created_at,
        )
    )
    conv.status = "active"
    conv.last_message_text = response_text
    conv.last_message_at = assistant_created_at
    conv.updated_at = assistant_created_at
    db.commit()

    response_payload = {
        "type": response_type,
        "answer": response_text,
        "source": source_name,
        "actions": actions,
        "response": response_text,
        "conversation_id": conv.id,
        "sources": sources,
        "assets": _dedupe_assets((assets or []) + _assets_from_related_content(related_content)),
        "related_content": related_content,
        "display": display_payload,
    }
    if "عرض الملف" in response_payload["actions"]:
        if not _has_openable_asset(response_payload.get("assets") or [], related_content):
            response_payload["actions"] = [a for a in response_payload["actions"] if a != "عرض الملف"]
    if DEBUG_MODE:
        debug_info["classification"] = classified_type
        debug_info["retrieval_score"] = float(debug_info.get("retrieval_score") or 0.0)
        debug_info["threshold_used"] = float(debug_info.get("threshold_used") or 0.0)
        debug_info["fallback_triggered"] = bool(debug_info.get("fallback_triggered"))
        debug_info["grounded"] = bool(debug_info.get("grounded"))
        print("[DEBUG]", debug_info)
        response_payload["debug"] = debug_info
    return response_payload


@app.get("/api/chat/history")
async def legacy_chat_history(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    safe_limit = max(1, min(int(limit or 20), 100))
    # Scope history to the current authenticated user only.
    # For this legacy endpoint, we store per-user chatbot threads under student_id.
    query = (
        db.query(Conversation)
        .filter(Conversation.type == "general", Conversation.student_id == current_user.id)
    )

    conversations = query.order_by(Conversation.updated_at.desc()).limit(safe_limit).all()
    payload = []
    for conv in conversations:
        rows = (
            db.query(Message)
            .filter(Message.conversation_id == conv.id)
            .order_by(Message.created_at.asc())
            .all()
        )
        payload.append(
            {
                "conversation_id": conv.id,
                "updated_at": conv.updated_at,
                "status": conv.status,
                "messages": [
                    {
                        "id": row.id,
                        "sender_type": row.sender_type,
                        "sender_name": row.sender_name,
                        "text": row.text,
                        "created_at": row.created_at,
                        "is_read": row.is_read,
                    }
                    for row in rows
                ],
            }
        )
    return payload

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "rag_chatbot_available": rag_chatbot is not None
    }


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("API_HOST", "0.0.0.0")
    # Railway and similar platforms inject PORT dynamically.
    port = int(os.getenv("PORT", os.getenv("API_PORT", "8000")))
    ssl_keyfile = os.getenv("SSL_KEYFILE")
    ssl_certfile = os.getenv("SSL_CERTFILE")
    has_ssl = bool(
        ssl_keyfile
        and ssl_certfile
        and os.path.exists(ssl_keyfile)
        and os.path.exists(ssl_certfile)
    )

    if has_ssl:
        print(f"Starting HTTPS backend on https://{host}:{port}")
        uvicorn.run(
            app,
            host=host,
            port=port,
            ssl_keyfile=ssl_keyfile,
            ssl_certfile=ssl_certfile,
        )
    else:
        print(f"Starting HTTP backend on http://{host}:{port}")
        uvicorn.run(app, host=host, port=port)



