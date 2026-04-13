# Quick Reference Guide

## 🚀 Starting the Application

### Quick Start (Windows)
```powershell
.\start-dev.ps1
```

### Manual Start
```bash
# Terminal 1 - Backend
cd backend
python main.py

# Terminal 2 - Frontend
npm run dev
```

## 📍 URLs

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:5173 | React application |
| Backend | http://localhost:8000 | FastAPI server |
| API Docs | http://localhost:8000/docs | Swagger UI |
| ReDoc | http://localhost:8000/redoc | Alternative API docs |
| Test Page | test-integration.html | Integration tests |

## 🔑 Environment Variables

### Frontend (.env)
```env
VITE_API_BASE_URL=http://localhost:8000
```

### Backend (backend/.env)
```env
GROQ_API_KEY=your_api_key_here
GROQ_MODEL=llama-3.1-8b-instant
GROQ_BASE_URL=https://api.groq.com/openai/v1
```

## 📡 API Endpoints

### Chat
```javascript
// Send message
POST /api/chat
{
  "message": "Hello",
  "conversation_id": "optional-uuid"
}

// Index documents
POST /api/chat/index-documents
["doc1", "doc2"]
```

### GPA
```javascript
// Calculate GPA
POST /api/gpa/calculate
{
  "courses": [
    { "name": "Math", "credits": 3.0, "grade": "A" }
  ]
}
```

### Health
```javascript
// Check status
GET /api/health
```

## 🛠️ Frontend Services

### Chat Service
```javascript
import { sendChatMessage, checkHealth } from '../services/chatService';

const response = await sendChatMessage("Hello", conversationId);
const health = await checkHealth();
```

### GPA Service
```javascript
import { calculateGPA, scoreToGrade } from '../services/gpaService';

const result = await calculateGPA(courses);
const grade = scoreToGrade(85); // "B"
```

## 📊 Grade Scale

| Grade | Points | Score Range |
|-------|--------|-------------|
| A | 4.0 | 90-100 |
| B | 3.0 | 80-89 |
| C | 2.0 | 70-79 |
| D | 1.0 | 60-69 |
| F | 0.0 | 0-59 |

## 🧪 Testing

### Test Integration
```bash
# Open in browser
test-integration.html
```

### Test Backend Directly
```bash
# Health check
curl http://localhost:8000/api/health

# Chat
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'

# GPA
curl -X POST http://localhost:8000/api/gpa/calculate \
  -H "Content-Type: application/json" \
  -d '{"courses": [{"name": "Math", "credits": 3, "grade": "A"}]}'
```

## 🐛 Common Issues

### Backend won't start
```bash
# Check Python version
python --version  # Should be 3.11+

# Reinstall dependencies
pip install -r requirements.txt

# Check port
netstat -ano | findstr :8000
```

### Frontend can't connect
```bash
# Check backend is running
curl http://localhost:8000/api/health

# Clear cache and restart
rm -rf node_modules
npm install
npm run dev
```

### CORS errors
- Backend has CORS middleware (allows all origins in dev)
- Vite proxy configured for /api routes
- Check both servers are running

### Chat not working
- Verify GROQ_API_KEY in backend/.env
- Check backend logs for errors
- Chatbot shows message if API key missing

## 📦 Dependencies

### Frontend
```bash
npm install  # Install all dependencies
```

Key packages:
- react, react-dom
- react-router-dom
- leaflet, react-leaflet
- lucide-react
- tailwindcss

### Backend
```bash
pip install -r requirements.txt
```

Key packages:
- fastapi
- uvicorn
- httpx
- python-dotenv

## 🔄 Development Workflow

1. Start backend: `cd backend && python main.py`
2. Start frontend: `npm run dev`
3. Make changes
4. Frontend hot-reloads automatically
5. Backend requires restart

## 📝 File Structure

```
src/
├── config/
│   └── api.js              # API endpoints
├── services/
│   ├── chatService.js      # Chat API calls
│   └── gpaService.js       # GPA API calls
├── pages/
│   └── Chatbot.jsx         # Main chatbot component
└── components/             # Reusable components

backend/
├── main.py                 # FastAPI server
├── rag_chatbot.py         # Chatbot logic
├── gpa_calculator.py      # GPA logic
└── .env                   # Environment variables
```

## 🎯 Key Features

- ✅ Chat with AI assistant
- ✅ Calculate term GPA
- ✅ Calculate accumulative GPA
- ✅ Interactive campus map
- ✅ Voice input support
- ✅ Conversation history
- ✅ Error handling
- ✅ Loading states

## 📚 Documentation

- [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Detailed integration docs
- [README.md](./README.md) - Project overview
- http://localhost:8000/docs - API documentation

## 💡 Tips

- Use the test page (test-integration.html) to verify backend
- Check browser console for frontend errors
- Check terminal for backend errors
- API docs at /docs show request/response examples
- Use Vite proxy to avoid CORS during development
