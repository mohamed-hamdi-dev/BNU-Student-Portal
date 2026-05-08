"""
Chatbot Router.
Handles RAG AI chat sessions and generation.
"""

from datetime import datetime, timezone
from pathlib import Path
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.config import get_settings
from core.deps import get_current_user, get_db, require_role
from models.chatbot import ChatbotMessage, ChatbotSession
from models.user import User
from rag_chatbot import RAGChatbot
from services.document_ingestion import ensure_upload_content, index_prepared_document, prepare_indexable_document

router = APIRouter(prefix="/chatbot", tags=["chatbot"])
STORAGE_FILES_DIR = Path(__file__).resolve().parent.parent / "storage_files"
STORAGE_FILES_DIR.mkdir(parents=True, exist_ok=True)

# Initialize RAG globally for this router
settings = get_settings()
rag_chatbot = None
if settings.GROQ_API_KEY:
    try:
        rag_chatbot = RAGChatbot(persist_directory="./chroma_db")
        print("Global RAG Chatbot initialized in router.")
    except Exception as exc:
        print(f"Failed to initialize RAG Chatbot: {exc}")


class ChatGenerateRequest(BaseModel):
    session_id: str
    message: str


class ChatGenerateResponse(BaseModel):
    message: str
    sources: Optional[List[str]] = Field(None)


def _normalize_scope_text(value: str) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    text = text.translate(
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
        }
    )
    for src, dst in {
        "\u0623": "\u0627",  # أ -> ا
        "\u0625": "\u0627",  # إ -> ا
        "\u0622": "\u0627",  # آ -> ا
        "\u0629": "\u0647",  # ة -> ه
        "\u0649": "\u064A",  # ى -> ي
        "\u0624": "\u0648",  # ؤ -> و
        "\u0626": "\u064A",  # ئ -> ي
    }.items():
        text = text.replace(src, dst)
    return " ".join(text.split())


def _canonical_college_key(value: str) -> str:
    text = _normalize_scope_text(value)
    if not text:
        return ""
    if "computer science" in text or "علوم الحاسب" in text or "حاسب" in text:
        return "computer_science"
    if "engineering" in text or "هندس" in text:
        return "engineering"
    if "business" in text or "اداره اعمال" in text or "تجاره" in text:
        return "business"
    if "medicine" in text or text == "طب" or "كليه الطب" in text or "كلية الطب" in text:
        return "medicine"
    if "pharmacy" in text or "صيدل" in text:
        return "pharmacy"
    if "dentistry" in text or "اسنان" in text:
        return "dentistry"
    return ""


_REGULATION_INTENT_TERMS = (
    "لائحة",
    "لايحة",
    "دفعة",
    "مستوى",
    "level",
    "batch",
    "regulation",
    "college",
    "كلية",
    "الكليه",
)


def _is_regulation_intent(query: str) -> bool:
    text = _normalize_scope_text(query or "")
    if not text:
        return False
    if any(term in text for term in _REGULATION_INTENT_TERMS):
        return True
    return bool(re.search(r"لا\S{0,2}ح\S*", text))


@router.get("/sessions")
async def get_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all past chatbot sessions for current student."""
    sessions = (
        db.query(ChatbotSession)
        .filter(ChatbotSession.student_id == current_user.id)
        .order_by(ChatbotSession.updated_at.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "title": s.title,
            "created_at": s.created_at,
            "updated_at": s.updated_at,
        }
        for s in sessions
    ]


@router.post("/sessions")
async def create_session(title: str = "New Chat", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Start a new AI session."""
    now = datetime.now(timezone.utc)
    session = ChatbotSession(
        student_id=current_user.id,
        title=title,
        mode="general",
        created_at=now,
        updated_at=now,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id, "title": session.title}


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get full history of a specific session."""
    session = db.query(ChatbotSession).filter(ChatbotSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    messages = db.query(ChatbotMessage).filter(ChatbotMessage.session_id == session_id).order_by(ChatbotMessage.created_at.asc()).all()
    return [{"id": m.id, "role": m.role, "text": m.text, "created_at": m.created_at} for m in messages]


@router.post("/chat", response_model=ChatGenerateResponse)
async def chat_with_ai(
    req: ChatGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send message to RAG AI and save both prompt and response to database."""
    if rag_chatbot is None:
        raise HTTPException(status_code=503, detail="AI Service unavailable.")

    session = db.query(ChatbotSession).filter(ChatbotSession.id == req.session_id).first()
    if not session or session.student_id != current_user.id:
        raise HTTPException(status_code=404, detail="Valid Session not found or owned by you")

    now = datetime.now(timezone.utc)
    user_msg = ChatbotMessage(
        session_id=session.id,
        role="user",
        text=req.message,
        created_at=now,
    )
    db.add(user_msg)

    try:
        is_regulation_query = _is_regulation_intent(req.message)
        normalized_message = _normalize_scope_text(req.message)
        is_light_chat_query = normalized_message in {"", "hi", "hello", "hey", "مرحبا", "اهلا", "السلام عليكم"}
        should_use_retrieval = bool(not is_light_chat_query and len(str(req.message or "").strip()) >= 2)
        should_require_grounded_retrieval = bool(is_regulation_query and not is_light_chat_query)
        retrieval_filter = None
        fallback_retrieval_filter = None
        if should_use_retrieval:
            base_retrieval_filter = {
                "student_id": str(current_user.id),
                "level": _normalize_scope_text(getattr(current_user, "level", "") or ""),
                "college_key": _canonical_college_key(getattr(current_user, "college", "") or ""),
                "sources": ["student_guide_pdf", "storage_pdf", "knowledge_text"],
            }
            if is_regulation_query:
                retrieval_filter = {**base_retrieval_filter, "preferred_content_type": "regulation", "content_type": "regulation"}
                fallback_retrieval_filter = base_retrieval_filter
            else:
                retrieval_filter = base_retrieval_filter
        response_data = rag_chatbot.chat(
            req.message,
            req.session_id,
            current_user.id,
            retrieval_filter=retrieval_filter,
            fallback_retrieval_filter=fallback_retrieval_filter,
            require_retrieval=should_require_grounded_retrieval,
            retrieve_context=should_use_retrieval,
            min_retrieval_score=0.22 if is_regulation_query else 0.0,
            allow_general_fallback_override=bool(not is_light_chat_query),
        )
        ai_text = response_data["answer"]
        sources = response_data.get("sources", [])
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"AI Error: {str(exc)}")

    ai_msg = ChatbotMessage(
        session_id=session.id,
        role="model",
        text=ai_text,
        created_at=datetime.now(timezone.utc),
    )
    db.add(ai_msg)

    if session.title == "New Chat":
        session.title = req.message[:30] + "..."
    session.updated_at = datetime.now(timezone.utc)

    db.commit()
    return ChatGenerateResponse(message=ai_text, sources=sources)


@router.post("/rag/upload-pdf", dependencies=[Depends(require_role("admin"))])
async def upload_pdf_to_rag(
    file: UploadFile = File(...),
    source: str = Form("student_guide_pdf"),
    access_scope: str = Form("public"),
    level: Optional[str] = Form(None),
    college: Optional[str] = Form(None),
    college_key: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    student_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Upload a PDF and index it directly into the RAG vector store."""
    if rag_chatbot is None:
        raise HTTPException(status_code=503, detail="AI Service unavailable.")

    filename = str(file.filename or "").strip()
    is_pdf_name = filename.lower().endswith(".pdf")
    is_pdf_type = str(file.content_type or "").lower() in {"application/pdf", "application/x-pdf"}
    if not (is_pdf_name or is_pdf_type):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    content = await file.read()
    ensure_upload_content(content)
    prepared = prepare_indexable_document(content=content, original_name=filename or "uploaded.pdf", storage_dir=STORAGE_FILES_DIR)

    source_name = str(source or "student_guide_pdf").strip().lower()
    scope = str(access_scope or "public").strip().lower()
    if scope not in {"public", "level", "student"}:
        scope = "public"

    canonical_college_key = _canonical_college_key(college_key or college or "")
    normalized_level = _normalize_scope_text(level or "")
    normalized_category = str(category or "").strip().lower()
    normalized_student_id = str(student_id or "").strip()

    base_metadata = {
        "document_id": f"{source_name}:{prepared.stored_name}",
        "source": source_name,
        "source_type": "pdf",
        "access_scope": scope,
        "uploaded_by": str(current_user.id),
        "file_name": filename or "uploaded.pdf",
        "stored_name": prepared.stored_name,
        "file_url": prepared.file_url,
    }
    if normalized_level:
        base_metadata["level"] = normalized_level
    if canonical_college_key:
        base_metadata["college_key"] = canonical_college_key
    if normalized_category:
        base_metadata["category"] = normalized_category
    if normalized_student_id:
        base_metadata["student_id"] = normalized_student_id

    index_prepared_document(rag_chatbot, prepared, base_metadata)

    return {
        "message": "PDF indexed successfully.",
        "file_name": filename,
        "stored_name": prepared.stored_name,
        "file_url": prepared.file_url,
        "pages_indexed": len(prepared.pages),
        "chunks_indexed": len(prepared.documents),
        "source": source_name,
        "access_scope": scope,
    }


@router.get("/rag/status", dependencies=[Depends(require_role("admin"))])
async def rag_status():
    """Operational status for RAG backend."""
    if rag_chatbot is None:
        return {
            "ready": False,
            "message": "AI Service unavailable.",
            "llm_ready": False,
            "retrieval_ready": False,
        }
    info = rag_chatbot.status()
    retrieval_message = str(info.get("retrieval_message") or "").strip().lower()
    if retrieval_message == "vector_store_not_initialized":
        message = "RAG retrieval is not initialized. The embedding/vector store is unavailable."
    elif retrieval_message == "lazy_init_pending":
        message = "RAG retrieval is configured and will initialize on first retrieval/indexing request."
    else:
        message = "RAG is ready." if info.get("retrieval_ready") else "RAG retrieval is not initialized."
    return {
        "ready": bool(info.get("retrieval_ready")),
        "message": message,
        **info,
    }


@router.delete("/rag/clear", dependencies=[Depends(require_role("admin"))], status_code=status.HTTP_200_OK)
async def clear_rag_index():
    """Clear indexed RAG documents while keeping chatbot service online."""
    if rag_chatbot is None:
        raise HTTPException(status_code=503, detail="AI Service unavailable.")
    result = rag_chatbot.clear_index()
    if not result.get("cleared"):
        reason = str(result.get("reason") or "").strip().lower() or "unknown_error"
        if reason == "vector_store_not_initialized":
            raise HTTPException(
                status_code=409,
                detail="RAG retrieval is not initialized yet, so there is no active index to clear.",
            )
        if reason == "vector_store_rebuild_failed":
            raise HTTPException(
                status_code=503,
                detail="RAG index directory was cleared, but the vector store could not be reinitialized.",
            )
        raise HTTPException(status_code=500, detail=f"Failed to clear RAG index: {reason}")
    return {
        "message": "RAG index cleared successfully.",
        **result,
    }
