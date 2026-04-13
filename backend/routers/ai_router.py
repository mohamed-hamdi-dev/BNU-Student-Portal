"""
Unified AI Router Entry.

This file is the single entry point for all AI-related routes.
Keep feature routers modular, and aggregate them here so new developers
can discover AI APIs quickly from one place.
"""

from fastapi import APIRouter

from routers.chatbot import router as chatbot_feature_router
from routers.chatbot import rag_chatbot

router = APIRouter(tags=["ai"])

# Current AI features (RAG + chat) are implemented inside chatbot router.
# We keep the same endpoint paths; this is only an organizational facade.
router.include_router(chatbot_feature_router)

