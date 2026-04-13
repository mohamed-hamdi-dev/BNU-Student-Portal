"""Knowledge/Assets router for typed RAG ingestion."""

from datetime import datetime, timezone
from typing import List
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from core.deps import get_current_user, get_db, require_role
from models.knowledge import Asset, ChunkAssetMap, ContentItem, KnowledgeChunk, KnowledgeDocument
from models.user import User
from routers.chatbot import rag_chatbot
from schemas.knowledge import (
    AssetOut,
    ContentAssetsResponse,
    KnowledgeIngestRequest,
    KnowledgeIngestResponse,
)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


def _normalize_scope_text(value: str) -> str:
    if not value:
        return ""
    return " ".join(str(value).strip().lower().split())


def _canonical_college_key(value: str) -> str:
    text = _normalize_scope_text(value or "")
    if not text:
        return ""
    if "computer science" in text or "علوم الحاسب" in text or "حاسب" in text:
        return "computer_science"
    if "engineering" in text or "هندس" in text:
        return "engineering"
    if "business" in text or "اداره اعمال" in text or "تجاره" in text:
        return "business"
    if "medicine" in text or "طب" in text:
        return "medicine"
    if "pharmacy" in text or "صيدل" in text:
        return "pharmacy"
    if "dentistry" in text or "اسنان" in text:
        return "dentistry"
    return ""


def _split_text_chunks(texts: List[str], chunk_size: int = 900, chunk_overlap: int = 120) -> List[str]:
    merged = "\n\n".join(str(item or "").strip() for item in texts if str(item or "").strip()).strip()
    if not merged:
        return []
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
    except Exception:
        try:
            from langchain.text_splitter import RecursiveCharacterTextSplitter
        except Exception:
            # Minimal fallback splitter.
            if len(merged) <= chunk_size:
                return [merged]
            chunks: List[str] = []
            step = max(1, chunk_size - chunk_overlap)
            for start in range(0, len(merged), step):
                chunks.append(merged[start : start + chunk_size])
            return chunks

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return [chunk for chunk in splitter.split_text(merged) if str(chunk or "").strip()]


@router.post(
    "/ingest",
    response_model=KnowledgeIngestResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin"))],
)
async def ingest_knowledge_content(
    payload: KnowledgeIngestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create typed content item (knowledge + assets) and index knowledge chunks into RAG."""
    if rag_chatbot is None:
        raise HTTPException(status_code=503, detail="AI Service unavailable.")

    raw_texts = [str(item or "").strip() for item in payload.knowledge_texts if str(item or "").strip()]
    if not raw_texts:
        raise HTTPException(status_code=400, detail="At least one knowledge_text is required.")

    now = datetime.now(timezone.utc)
    content_item = ContentItem(
        title=str(payload.title or "").strip() or "Untitled",
        college=str(payload.college or "").strip() or None,
        year=str(payload.year or "").strip() or None,
        subject=str(payload.subject or "").strip() or None,
        created_by=current_user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(content_item)
    db.flush()

    document = KnowledgeDocument(
        content_item_id=content_item.id,
        source_type=str(payload.source_type or "text").strip().lower(),
        raw_text="\n\n".join(raw_texts),
        language="ar",
        created_at=now,
    )
    db.add(document)
    db.flush()

    chunks = _split_text_chunks(raw_texts)
    if not chunks:
        raise HTTPException(status_code=400, detail="No knowledge chunks could be generated.")

    chunk_rows: List[KnowledgeChunk] = []
    chunk_texts: List[str] = []
    chunk_metas: List[dict] = []
    for idx, chunk in enumerate(chunks, start=1):
        vector_ref = str(uuid4())
        chunk_row = KnowledgeChunk(
            content_item_id=content_item.id,
            knowledge_document_id=document.id,
            chunk_text=chunk,
            chunk_index=idx,
            token_count=max(1, len(chunk.split())),
            vector_ref=vector_ref,
            college=content_item.college,
            year=content_item.year,
            subject=content_item.subject,
            created_at=now,
        )
        db.add(chunk_row)
        db.flush()
        chunk_rows.append(chunk_row)
        chunk_texts.append(chunk)
        chunk_metas.append(
            {
                "document_id": f"knowledge:{document.id}",
                "source": "knowledge_text",
                "source_type": str(payload.source_type or "text").strip().lower(),
                "content_item_id": content_item.id,
                "knowledge_document_id": document.id,
                "knowledge_chunk_id": chunk_row.id,
                "vector_ref": vector_ref,
                "college": content_item.college,
                "college_key": _canonical_college_key(content_item.college or ""),
                "level": content_item.year,
                "category": (content_item.subject or "").strip().lower() or None,
                "access_scope": "public",
            }
        )

    assets_created = 0
    for item in payload.assets:
        asset_row = Asset(
            content_item_id=content_item.id,
            asset_type=str(item.asset_type or "").strip().lower(),
            label=str(item.label or "").strip() or None,
            url=str(item.url or "").strip() or None,
            mime_type=str(item.mime_type or "").strip() or None,
            display_payload_json=item.display_payload,
            created_at=now,
        )
        db.add(asset_row)
        db.flush()
        assets_created += 1
        for chunk_row in chunk_rows:
            db.add(
                ChunkAssetMap(
                    chunk_id=chunk_row.id,
                    asset_id=asset_row.id,
                    relation_type="supports_answer",
                    weight=1.0,
                    created_at=now,
                )
            )

    # Index only the knowledge layer in vector DB.
    rag_chatbot.index_documents(chunk_texts, metadatas=chunk_metas)
    rag_chatbot.flush()
    db.commit()

    return KnowledgeIngestResponse(
        content_item_id=content_item.id,
        knowledge_document_id=document.id,
        chunks_indexed=len(chunk_rows),
        assets_created=assets_created,
        created_at=now,
    )


@router.get("/content/{content_item_id}/assets", response_model=ContentAssetsResponse)
async def get_content_assets(
    content_item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = db.query(ContentItem).filter(ContentItem.id == content_item_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")

    rows = db.query(Asset).filter(Asset.content_item_id == content_item_id).order_by(Asset.id.asc()).all()
    return ContentAssetsResponse(
        content_item_id=content.id,
        title=content.title,
        assets=[
            AssetOut(
                id=row.id,
                asset_type=row.asset_type,
                label=row.label,
                url=row.url,
                mime_type=row.mime_type,
                display_payload=row.display_payload_json,
            )
            for row in rows
        ],
    )


@router.get("/content")
async def list_content_items(
    college: str | None = Query(default=None),
    year: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ContentItem)
    if college:
        query = query.filter(ContentItem.college == str(college).strip())
    if year:
        query = query.filter(ContentItem.year == str(year).strip())
    if subject:
        query = query.filter(ContentItem.subject == str(subject).strip())
    rows = query.order_by(ContentItem.updated_at.desc(), ContentItem.id.desc()).limit(limit).all()
    return [
        {
            "id": row.id,
            "title": row.title,
            "college": row.college,
            "year": row.year,
            "subject": row.subject,
            "status": row.status,
            "version": row.version,
            "updated_at": row.updated_at,
        }
        for row in rows
    ]
