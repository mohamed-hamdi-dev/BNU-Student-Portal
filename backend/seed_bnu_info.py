import os
import sys
from pathlib import Path
from datetime import datetime, timezone
import uuid

# Add the backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from core.database import SessionLocal, create_all_tables
from models.knowledge import ContentItem, KnowledgeDocument, KnowledgeChunk
from routers.chatbot import rag_chatbot

def seed_bnu_info():
    print("Starting BNU info ingestion...")
    db = SessionLocal()
    
    text_content = """إنشاء جامعة بنها الأهلية:

تم إنشاء جامعة بنها الأهلية كجامعة أهلية مصرية حديثة منبثقة من جامعة بنها الحكومية، بهدف تقديم تعليم جامعي متطور يواكب متطلبات سوق العمل والتكنولوجيا الحديثة.

صدر القرار الجمهوري بإنشاء الجامعة رقم 369 لسنة 2022، وبدأت الدراسة بها خلال العام الأكاديمي 2022 / 2023.

الجامعة غير هادفة للربح، وتعتمد على مفاهيم الجامعات الحديثة والجيل الرابع، مع التركيز على:
* التعليم التطبيقي
* البحث العلمي
* التكنولوجيا الحديثة
* الابتكار وريادة الأعمال
* التدريب العملي

تم إنشاء الجامعة بمدينة العبور بمحافظة القليوبية، لتكون امتدادًا أكاديميًا حديثًا لجامعة بنها الحكومية.

بدأت الجامعة بعدد من الكليات مثل:
* كلية علوم الحاسب
* كلية الهندسة
* كلية الاقتصاد وإدارة الأعمال
* كلية الطب البشري

ثم تمت إضافة كليات جديدة لاحقًا ضمن خطة التوسع الأكاديمي للجامعة.

موقع جامعة بنها الأهلية:
تقع جامعة بنها الأهلية في مدينة العبور بمحافظة القليوبية بجمهورية مصر العربية."""

    now = datetime.now(timezone.utc)
    
    try:
        # Create Content Item
        content_item = ContentItem(
            title="معلومات عامة عن جامعة بنها الأهلية",
            subject="معلومات عامة",
            created_at=now,
            updated_at=now,
        )
        db.add(content_item)
        db.flush()
        
        # Create Knowledge Document
        document = KnowledgeDocument(
            content_item_id=content_item.id,
            source_type="text",
            raw_text=text_content,
            language="ar",
            created_at=now,
        )
        db.add(document)
        db.flush()
        
        # Create Chunk
        vector_ref = str(uuid.uuid4())
        chunk = KnowledgeChunk(
            content_item_id=content_item.id,
            knowledge_document_id=document.id,
            chunk_text=text_content,
            chunk_index=1,
            token_count=len(text_content.split()),
            vector_ref=vector_ref,
            created_at=now,
        )
        db.add(chunk)
        db.flush()
        
        # Prepare for ChromaDB
        chunk_texts = [text_content]
        chunk_metas = [{
            "document_id": f"knowledge:{document.id}",
            "source": "knowledge_text",
            "source_type": "text",
            "content_item_id": content_item.id,
            "knowledge_document_id": document.id,
            "knowledge_chunk_id": chunk.id,
            "vector_ref": vector_ref,
            "category": "general",
            "access_scope": "public",
        }]
        
        if rag_chatbot and rag_chatbot.vector_store:
            rag_chatbot.index_documents(chunk_texts, metadatas=chunk_metas)
            rag_chatbot.flush()
            print("Successfully indexed into ChromaDB.")
        else:
            print("RAG Chatbot vector store not available!")
            
        db.commit()
        print("Successfully saved to Database.")
        
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_bnu_info()
