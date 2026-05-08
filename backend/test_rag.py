import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from routers.chatbot import rag_chatbot

def test():
    if not rag_chatbot or not rag_chatbot.vector_store:
        print("RAG not initialized")
        return
        
    query = "متى تم إنشاء جامعة بنها الأهلية؟"
    
    # Try the exact filter used by the chatbot
    retrieval_filter = {
        "student_id": "1",
        "level": "1",
        "college_key": "computer_science",
        "sources": ["student_guide_pdf", "storage_pdf", "knowledge_text"],
    }
    
    try:
        results = rag_chatbot.chat(
            message=query,
            conversation_id="test-session",
            student_id="1",
            retrieval_filter=retrieval_filter,
            retrieve_context=True,
            require_retrieval=False,
            min_retrieval_score=0.0
        )
        print("=== ANSWER ===")
        print(results.get("answer"))
        print("=== SOURCES ===")
        print(results.get("sources"))
    except Exception as e:
        print("ERROR:", e)

if __name__ == "__main__":
    test()
