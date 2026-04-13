# Frontend-Backend Integration Guide

This guide explains how the frontend (React + Vite) integrates with the backend (FastAPI).

## Architecture Overview

```
Frontend (React)          Backend (FastAPI)
    |                          |
    |-- Chat Service --------> /api/chat
    |-- GPA Service ---------> /api/gpa/calculate
    |-- Health Check --------> /api/health
```

## Setup Instructions

### 1. Backend Setup

Navigate to the backend directory and set up the environment:

```bash
cd backend

# Create virtual environment (if not exists)
python -m venv venv

# Activate virtual environment
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env and add your GROQ_API_KEY
```

Start the backend server:

```bash
# Using the provided script (Windows)
.\start_server.ps1

# Or manually
python main.py
```

The backend will run on `http://localhost:8000`

### 2. Frontend Setup

From the root directory:

```bash
# Install dependencies
npm install

# Create environment file (optional)
cp .env.example .env

# Start development server
npm run dev
```

The frontend will run on `http://localhost:5173`

## API Endpoints

### Chat Endpoints

#### POST /api/chat
Send a message to the chatbot.

**Request:**
```json
{
  "message": "What is the GPA requirement?",
  "conversation_id": "optional-conversation-id"
}
```

**Response:**
```json
{
  "response": "The GPA requirement is...",
  "conversation_id": "uuid-string",
  "sources": []
}
```

#### POST /api/chat/index-documents
Index documents for RAG system (requires ChromaDB).

**Request:**
```json
["Document 1 text", "Document 2 text"]
```

### GPA Endpoints

#### POST /api/gpa/calculate
Calculate GPA from courses.

**Request:**
```json
{
  "courses": [
    {
      "name": "Mathematics",
      "credits": 3.0,
      "grade": "A"
    },
    {
      "name": "Physics",
      "credits": 4.0,
      "grade": "B"
    }
  ]
}
```

**Response:**
```json
{
  "gpa": 3.43,
  "total_credits": 7.0,
  "total_points": 24.0
}
```

**Grade Scale:**
- A: 4.0
- B: 3.0
- C: 2.0
- D: 1.0
- F: 0.0

### Health Check

#### GET /api/health
Check backend status.

**Response:**
```json
{
  "status": "healthy",
  "rag_chatbot_available": true
}
```

## Frontend Service Layer

### Chat Service (`src/services/chatService.js`)

```javascript
import { sendChatMessage, indexDocuments, checkHealth } from '../services/chatService';

// Send a chat message
const response = await sendChatMessage("Hello", conversationId);

// Check backend health
const health = await checkHealth();
```

### GPA Service (`src/services/gpaService.js`)

```javascript
import { calculateGPA, scoreToGrade } from '../services/gpaService';

// Calculate GPA
const courses = [
  { name: "Math", credits: 3, grade: "A" },
  { name: "Physics", credits: 4, grade: "B" }
];
const result = await calculateGPA(courses);

// Convert score to grade
const grade = scoreToGrade(85); // Returns "B"
```

## Configuration

### Environment Variables

**Frontend (.env):**
```env
VITE_API_BASE_URL=http://localhost:8000
```

**Backend (backend/.env):**
```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant
GROQ_BASE_URL=https://api.groq.com/openai/v1
```

### Vite Proxy Configuration

The Vite config includes a proxy to avoid CORS issues during development:

```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    }
  }
}
```

## Testing the Integration

### 1. Test Backend Health

```bash
curl http://localhost:8000/api/health
```

### 2. Test Chat Endpoint

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

### 3. Test GPA Calculation

```bash
curl -X POST http://localhost:8000/api/gpa/calculate \
  -H "Content-Type: application/json" \
  -d '{"courses": [{"name": "Math", "credits": 3, "grade": "A"}]}'
```

### 4. Test Frontend

1. Open `http://localhost:5173` in your browser
2. Click the chatbot button (bottom right)
3. Try the Chat tab - send a message
4. Try the GPA tab - calculate term or accumulative GPA

## Troubleshooting

### Backend Not Starting

- Check if port 8000 is already in use
- Verify Python dependencies are installed
- Check GROQ_API_KEY is set in backend/.env

### Frontend Can't Connect to Backend

- Verify backend is running on port 8000
- Check browser console for CORS errors
- Ensure Vite proxy is configured correctly

### Chat Not Working

- Verify GROQ_API_KEY is valid
- Check backend logs for errors
- The chatbot will show a message if the API key is missing

### GPA Calculation Errors

- Verify course data format matches API requirements
- Check that grades are valid (A, B, C, D, F)
- Ensure credits are positive numbers

## Development Workflow

1. Start backend: `cd backend && python main.py`
2. Start frontend: `npm run dev`
3. Make changes to code
4. Frontend hot-reloads automatically
5. Backend requires restart for changes

## Production Deployment

### Backend

1. Set production environment variables
2. Use a production ASGI server (e.g., Gunicorn with Uvicorn workers)
3. Configure proper CORS origins (not "*")

### Frontend

1. Build the frontend: `npm run build`
2. Serve the `dist` folder with a web server
3. Update `VITE_API_BASE_URL` to production backend URL

## API Documentation

Once the backend is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Features Integrated

✅ Chat with RAG-powered assistant
✅ GPA calculation (Term and Accumulative)
✅ Health check endpoint
✅ Error handling and loading states
✅ Service layer architecture
✅ Environment configuration
✅ CORS support
✅ API documentation

## Next Steps

- Add authentication/authorization
- Implement user sessions
- Add more RAG document sources
- Enhance error messages
- Add request caching
- Implement rate limiting
