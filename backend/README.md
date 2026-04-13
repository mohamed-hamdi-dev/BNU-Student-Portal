# BNU Student Portal

Comprehensive full-stack student portal with authentication, academic management, payments, and AI chatbot.

## Important: Two Servers Required

Run both services together:
- Frontend (Vite): `http://localhost:5173`
- Backend (FastAPI): `http://localhost:8000` (default)

> Note: backend port can be changed via `API_PORT` (for example `8001`).

---

## Features

### Student
- Authentication and account access
- Profile and personal data
- Course registration
- Grades and GPA tracking
- Tuition and payment workflows
- AI chatbot (RAG)
- Arabic/English support

### Admin
- Dashboard and statistics
- User and account management
- Academic and payment configuration
- Receipt/review workflows

---

## Tech Stack

### Frontend
- React + Vite
- Tailwind CSS
- React Router
- i18next

### Backend
- FastAPI + Uvicorn
- SQLAlchemy + SQLite
- Pydantic
- ChromaDB (RAG)
- Groq API

---

## Quick Start

### Prerequisites
- Node.js 16+
- Python 3.10+

### 1) Install Frontend

```bash
cd frontend
npm install
```

### 2) Install Backend

```bash
cd backend
python -m venv venv
# Windows PowerShell
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 3) Configure Environment

Create/update `backend/.env`:

```env
GROQ_API_KEY=your_key_here
API_HOST=0.0.0.0
API_PORT=8000
```

Create/update `frontend/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### 4) Run Backend

```bash
cd backend
python main.py
```

### 5) Run Frontend

```bash
cd frontend
npm run dev
```

---

## Health Check

```bash
curl http://localhost:8000/api/health
```

Expected response:

```json
{
  "status": "healthy",
  "rag_chatbot_available": true
}
```

---

## API Docs

- Swagger: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## Current Project Structure

```text
PORTAL-STUDENT-BNU/
├── backend/
│   ├── main.py
│   ├── rag_chatbot.py
│   ├── routers/
│   ├── models/
│   ├── schemas/
│   ├── core/
│   ├── bnu_portal.db
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── public/
│   ├── server/
│   ├── package.json
│   └── vite.config.js
└── .gitignore
```

---

## Notes for Developers

- Main backend entry point is `backend/main.py`.
- Database is SQLite (`backend/bnu_portal.db`), not `Data/db.json`.
- AI routes are exposed under `/api` (see `backend/routers/ai_router.py` and `backend/AI_README.md`).

---

## Troubleshooting

### "Failed to fetch"
- Ensure backend is running on the same base URL configured in `frontend/.env`.

### Port conflict
- Change backend port using `API_PORT` and update `VITE_API_BASE_URL` accordingly.

### RAG issues
- Check `GROQ_API_KEY`.
- Confirm backend logs at startup for chatbot initialization.

---

## Useful Docs

- `backend/SETUP_INSTRUCTIONS.md`
- `backend/START_HERE.md`
- `backend/FULL_BACKEND_GUIDE.md`
- `backend/AI_README.md`
