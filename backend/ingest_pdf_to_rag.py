import argparse
import os
from pathlib import Path

from dotenv import load_dotenv

try:
    from langchain_community.document_loaders import PyPDFLoader
except ImportError:
    PyPDFLoader = None

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    try:
        from langchain.text_splitter import RecursiveCharacterTextSplitter
    except ImportError:
        RecursiveCharacterTextSplitter = None

from rag_chatbot import RAGChatbot


def read_pdf_pages(pdf_path: Path):
    if PyPDFLoader is not None:
        loader = PyPDFLoader(str(pdf_path))
        docs = loader.load()
        pages = []
        for i, doc in enumerate(docs, start=1):
            text = str(getattr(doc, "page_content", "") or "").strip()
            if not text:
                continue
            pages.append({"page": i, "text": text})
        return pages

    # Fallback: pypdf direct
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError(
            "PDF loader is unavailable. Install one of: `pip install pypdf` or `pip install langchain-community`."
        ) from exc

    reader = PdfReader(str(pdf_path))
    pages = []
    for idx, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if not text:
            continue
        pages.append({"page": idx, "text": text})
    return pages


def chunk_pages(pages, chunk_size=900, chunk_overlap=120):
    if RecursiveCharacterTextSplitter is None:
        raise RuntimeError(
            "Text splitter is unavailable. Install with: `pip install langchain-text-splitters`."
        )

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    documents = []
    metadatas = []

    def clean_text(value: str) -> str:
        text = str(value or "").replace("\u200f", " ").replace("\u200e", " ")
        return " ".join(text.split())

    for item in pages:
        chunks = splitter.split_text(item["text"])
        for chunk_idx, chunk in enumerate(chunks, start=1):
            clean = clean_text(chunk)
            if not clean:
                continue
            documents.append(clean)
            metadatas.append(
                {
                    "source": "student_guide_pdf",
                    "source_type": "pdf",
                    "access_scope": "public",
                    "page": item["page"],
                    "chunk": chunk_idx,
                }
            )
    return documents, metadatas


def main():
    parser = argparse.ArgumentParser(description="Index a PDF file into RAG Chroma DB.")
    parser.add_argument("--pdf", required=True, help="Absolute or relative path to PDF file")
    parser.add_argument("--persist", default="./chroma_db", help="Chroma persist directory")
    parser.add_argument("--source", default="student_guide_pdf", help="Logical source name used in RAG metadata")
    parser.add_argument("--access-scope", default="public", choices=["public", "level", "student"], help="Scope tag for retrieval filtering")
    parser.add_argument("--student-id", default=None, help="Optional student ID for student-scoped indexing")
    parser.add_argument("--level", default=None, help="Optional level scope (e.g. level 1)")
    parser.add_argument("--college-key", default=None, help="Optional college key (e.g. computer_science)")
    parser.add_argument("--category", default=None, help="Optional category metadata")
    args = parser.parse_args()

    load_dotenv()

    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.exists() or not pdf_path.is_file():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    print(f"[1/3] Reading PDF: {pdf_path}")
    pages = read_pdf_pages(pdf_path)
    if not pages:
        raise RuntimeError("No extractable text found in the PDF.")

    print(f"[2/3] Chunking {len(pages)} pages...")
    documents, metadatas = chunk_pages(pages)
    if not documents:
        raise RuntimeError("No chunks generated from PDF.")

    source_name = str(args.source or "student_guide_pdf").strip().lower()
    base_metadata = {
        "source": source_name,
        "source_type": "pdf",
        "access_scope": str(args.access_scope or "public").strip().lower(),
    }
    if args.student_id:
        base_metadata["student_id"] = str(args.student_id).strip()
    if args.level:
        base_metadata["level"] = str(args.level).strip()
    if args.college_key:
        base_metadata["college_key"] = str(args.college_key).strip()
    if args.category:
        base_metadata["category"] = str(args.category).strip().lower()

    metadatas = [{**meta, **base_metadata} for meta in metadatas]

    print(f"[3/3] Indexing {len(documents)} chunks into {args.persist} ...")
    bot = RAGChatbot(persist_directory=args.persist)
    bot.index_documents(documents, metadatas)
    bot.flush()

    print("Done: PDF has been indexed successfully.")
    print("Restart backend if it's running to make sure the chatbot reloads retriever state.")


if __name__ == "__main__":
    main()
