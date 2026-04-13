from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


# Messages
class ChatbotMessageBase(BaseModel):
    role: str
    text: str

class ChatbotMessageCreate(ChatbotMessageBase):
    pass

class ChatbotMessageResponse(ChatbotMessageBase):
    id: str
    session_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# Sessions
class ChatbotSessionBase(BaseModel):
    title: str = "New Chat"
    mode: str = "general"

class ChatbotSessionCreate(ChatbotSessionBase):
    pass

class ChatbotSessionResponse(ChatbotSessionBase):
    id: str
    student_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ChatbotSessionDetailResponse(ChatbotSessionResponse):
    messages: List[ChatbotMessageResponse] = []
