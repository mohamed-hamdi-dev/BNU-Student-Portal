"""
Re-index the existing DOCX file in ChromaDB with proper Arabic text encoding.
Clears old corrupted chunks and re-indexes using python-docx.
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

from io import BytesIO
from pathlib import Path

from core.database import SessionLocal
from models.storage import StorageItem

STORAGE_FILES_DIR = Path(__file__).resolve().parent / "storage_files"


def reindex():
    db = SessionLocal()
    try:
        from routers.chatbot import rag_chatbot
        if rag_chatbot is None:
            print("ERROR: RAG chatbot is not initialized")
            return

        # Find the DOCX storage item
        item = db.query(StorageItem).filter(StorageItem.id == 1).first()
        if not item:
            print("ERROR: Storage item 1 not found")
            return

        stored_name = str(item.stored_name or "").strip()
        file_path = STORAGE_FILES_DIR / stored_name
        print(f"File: {file_path}")
        print(f"File name: {item.file_name}")

        if not file_path.exists():
            print("ERROR: File not found on disk")
            return

        content = file_path.read_bytes()
        ext = file_path.suffix.lower()

        # Step 1: Delete old corrupted vectors
        print("\n[1/3] Deleting old corrupted vectors...")
        document_id = f"storage:{item.id}"
        try:
            vs = rag_chatbot.vector_store
            if vs and hasattr(vs, "_collection"):
                col = vs._collection
                existing = col.get(where={"document_id": document_id})
                old_count = len(existing.get("ids", []))
                if old_count > 0:
                    col.delete(ids=existing["ids"])
                    print(f"   Deleted {old_count} old chunks")
                else:
                    print("   No old chunks found")
            else:
                print("   Could not access collection directly, trying delete method")
                vs.delete(where={"document_id": document_id})
        except Exception as e:
            print(f"   Warning during deletion: {e}")

        # Step 2: Extract text properly using python-docx
        print("\n[2/3] Extracting text with python-docx...")
        from docx import Document as DocxDocument
        doc = DocxDocument(BytesIO(content))
        paragraphs = []
        for para in doc.paragraphs:
            text = (para.text or "").strip()
            if text:
                paragraphs.append(text)

        merged = "\n".join(paragraphs).strip()
        if not merged:
            print("ERROR: No text extracted")
            return

        print(f"   Extracted {len(paragraphs)} paragraphs, {len(merged)} characters")
        print(f"   First 200 chars: {merged[:200]}")

        # Step 3: Chunk and index
        print("\n[3/3] Chunking and indexing...")
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=900,
            chunk_overlap=120,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        documents = []
        metadatas = []
        chunks = splitter.split_text(merged)
        for chunk_idx, chunk in enumerate(chunks, start=1):
            clean = " ".join(str(chunk or "").split())
            if not clean:
                continue
            documents.append(clean)

            normalized_level = str(item.level or "").strip() or None
            metadatas.append({
                "document_id": document_id,
                "source": "storage_pdf",
                "source_type": "word",
                "access_scope": "level" if normalized_level else "public",
                "level": normalized_level,
                "category": str(item.category or "").strip().lower() or None,
                "storage_item_id": item.id,
                "storage_file_name": item.file_name,
                "stored_name": stored_name,
                "file_url": f"/api/storage/files/{stored_name}",
                "page": 1,
                "chunk": chunk_idx,
            })

        print(f"   Generated {len(documents)} chunks")

        rag_chatbot.index_documents(documents, metadatas)
        rag_chatbot.flush()

        print(f"\nDONE! Re-indexed {len(documents)} chunks with proper Arabic text.")
        print("Restart the backend server to apply changes.")

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    reindex()
