# AI Module Guide

## Single Entry Point
- Main AI router file: `backend/routers/ai_router.py`
- App wiring: `backend/main.py` includes `ai_router` under `/api`

## Current AI Features
- Chat + RAG feature router: `backend/routers/chatbot.py`
- RAG engine/service: `backend/rag_chatbot.py`

## Endpoint Base
- All AI endpoints are exposed under:
  - `/api/chatbot/...`

Examples:
- `POST /api/chatbot/chat`
- `POST /api/chatbot/rag/upload-pdf`
- `GET /api/chatbot/rag/status`
- `DELETE /api/chatbot/rag/clear`

## Why This Structure
- New developers start from **one file** (`ai_router.py`)
- Feature code stays modular and testable
- Endpoint behavior remains unchanged

## Rule For Future Additions
1. Implement feature logic in a dedicated file/service.
2. Add/keep feature router in `routers/`.
3. Aggregate it in `ai_router.py`.
4. Do not put API keys in code. Use environment variables only.

