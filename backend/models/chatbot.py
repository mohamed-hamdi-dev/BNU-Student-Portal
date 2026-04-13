from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from core.database import Base

class ChatbotSession(Base):
    __tablename__ = "chatbot_sessions"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), default="New Chat")
    mode = Column(String(20), default="general")
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    messages = relationship("ChatbotMessage", back_populates="session", cascade="all, delete-orphan")


class ChatbotMessage(Base):
    __tablename__ = "chatbot_messages"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(64), ForeignKey("chatbot_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(10), nullable=False) # 'user' or 'model'
    text = Column(Text, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    session = relationship("ChatbotSession", back_populates="messages")
