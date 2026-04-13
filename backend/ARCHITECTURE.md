# System Architecture

## Overview

The BNU Student Portal is a full-stack application with a React frontend and FastAPI backend, integrated through RESTful APIs.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                             │
│                     http://localhost:5173                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP Requests
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      REACT FRONTEND                              │
│                         (Vite)                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Pages     │  │ Components  │  │   Assets    │            │
│  │             │  │             │  │             │            │
│  │ • Chatbot   │  │ • Herobaner │  │ • Images    │            │
│  │ • Dashboard │  │ • Common    │  │ • Icons     │            │
│  │ • Login     │  │ • Hooks     │  │             │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐          │
│  │           Service Layer (API Clients)            │          │
│  ├──────────────────────────────────────────────────┤          │
│  │                                                   │          │
│  │  ┌──────────────┐  ┌──────────────┐            │          │
│  │  │ chatService  │  │  gpaService  │            │          │
│  │  │              │  │              │            │          │
│  │  │ • sendChat   │  │ • calculate  │            │          │
│  │  │ • index      │  │ • scoreToGr  │            │          │
│  │  │ • health     │  │              │            │          │
│  │  └──────────────┘  └──────────────┘            │          │
│  │                                                   │          │
│  └───────────────────────┬───────────────────────────┘          │
│                          │                                       │
│  ┌───────────────────────▼───────────────────────┐             │
│  │         API Configuration                     │             │
│  │  • Base URL: http://localhost:8000           │             │
│  │  • Endpoints: /api/chat, /api/gpa/calculate  │             │
│  └───────────────────────────────────────────────┘             │
│                                                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP/JSON
                             │ (CORS Enabled)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     FASTAPI BACKEND                              │
│                   http://localhost:8000                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────┐        │
│  │              API Endpoints (main.py)               │        │
│  ├────────────────────────────────────────────────────┤        │
│  │                                                     │        │
│  │  POST /api/chat                                    │        │
│  │  POST /api/chat/index-documents                    │        │
│  │  POST /api/gpa/calculate                           │        │
│  │  GET  /api/health                                  │        │
│  │  GET  /docs (Swagger UI)                           │        │
│  │  GET  /redoc (ReDoc)                               │        │
│  │                                                     │        │
│  └─────────────────────┬──────────────────────────────┘        │
│                        │                                         │
│  ┌─────────────────────▼──────────────┐  ┌──────────────────┐ │
│  │     RAG Chatbot Module             │  │  GPA Calculator  │ │
│  │   (rag_chatbot.py)                 │  │ (gpa_calculator) │ │
│  ├────────────────────────────────────┤  ├──────────────────┤ │
│  │                                    │  │                  │ │
│  │ • Conversation Management          │  │ • Grade Scale    │ │
│  │ • Message Processing               │  │ • Credit Hours   │ │
│  │ • Context Handling                 │  │ • GPA Formula    │ │
│  │                                    │  │                  │ │
│  └─────────────────┬──────────────────┘  └──────────────────┘ │
│                    │                                            │
│                    │                                            │
└────────────────────┼────────────────────────────────────────────┘
                     │
                     │ API Calls
                     │
┌────────────────────▼────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │    Groq API          │  │  OpenStreetMap       │            │
│  │                      │  │                      │            │
│  │ • LLM Inference      │  │ • Map Tiles          │            │
│  │ • Chat Completions   │  │ • Geocoding          │            │
│  │ • Model: llama-3.1   │  │ • Routing            │            │
│  └──────────────────────┘  └──────────────────────┘            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Chat Flow
```
User Input → ChatTab Component → sendChatMessage()
    ↓
API Request (POST /api/chat)
    ↓
FastAPI Backend → RAGChatbot.chat()
    ↓
Groq API (LLM Processing)
    ↓
Response → Frontend → Display in Chat
```

### GPA Calculation Flow
```
User Input (Grades) → GpaTab Component → calculateGPA()
    ↓
API Request (POST /api/gpa/calculate)
    ↓
FastAPI Backend → calculate_gpa()
    ↓
GPA Calculation (credits × grade points)
    ↓
Response → Frontend → Display Result
```

## Technology Stack

### Frontend
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | React 19 | UI components |
| Build Tool | Vite | Fast development & bundling |
| Styling | TailwindCSS | Utility-first CSS |
| Routing | React Router | Navigation |
| Maps | Leaflet + React Leaflet | Interactive maps |
| Icons | Lucide React | Icon library |
| Forms | React Hook Form | Form management |
| HTTP | Fetch API | API requests |

### Backend
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | FastAPI | REST API |
| Server | Uvicorn | ASGI server |
| LLM | Groq API | Chat completions |
| HTTP Client | httpx | External API calls |
| Validation | Pydantic | Data validation |
| Environment | python-dotenv | Config management |

## API Contract

### Request/Response Format

All API endpoints use JSON format:

```json
// Request
{
  "field": "value"
}

// Response (Success)
{
  "data": "result"
}

// Response (Error)
{
  "detail": "error message"
}
```

### Status Codes
- `200` - Success
- `400` - Bad Request (validation error)
- `500` - Internal Server Error
- `503` - Service Unavailable (chatbot not initialized)

## Security Considerations

### Current Implementation (Development)
- CORS: Allows all origins (`*`)
- API Keys: Stored in backend `.env`
- No authentication required

### Production Recommendations
- Restrict CORS to specific domains
- Implement authentication (JWT tokens)
- Use HTTPS for all communications
- Rate limiting on API endpoints
- Input sanitization and validation
- API key rotation policy

## Scalability Considerations

### Current Limitations
- Single server instance
- In-memory conversation storage
- No database persistence
- No caching layer

### Future Improvements
- Database for conversation history
- Redis for caching
- Load balancer for multiple instances
- Message queue for async processing
- CDN for static assets

## Development Workflow

```
Developer
    ↓
Edit Code
    ↓
┌─────────────────┐         ┌─────────────────┐
│   Frontend      │         │    Backend      │
│   (Hot Reload)  │         │  (Manual Restart)│
└─────────────────┘         └─────────────────┘
    ↓                           ↓
Browser Refresh             Server Restart
    ↓                           ↓
Test Changes                Test Changes
    ↓                           ↓
        Commit to Git
```

## Deployment Architecture (Recommended)

```
┌─────────────────────────────────────────────────┐
│              Load Balancer / CDN                │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
┌───────▼────────┐       ┌────────▼───────┐
│  Static Files  │       │   API Gateway  │
│  (Frontend)    │       │                │
└────────────────┘       └────────┬───────┘
                                  │
                         ┌────────┴────────┐
                         │                 │
                  ┌──────▼──────┐   ┌─────▼──────┐
                  │  Backend    │   │  Backend   │
                  │  Instance 1 │   │  Instance 2│
                  └─────────────┘   └────────────┘
                         │                 │
                         └────────┬────────┘
                                  │
                         ┌────────▼────────┐
                         │    Database     │
                         │   (PostgreSQL)  │
                         └─────────────────┘
```

## Monitoring & Logging

### Recommended Tools
- Frontend: Sentry for error tracking
- Backend: FastAPI built-in logging
- Performance: New Relic or DataDog
- Uptime: Pingdom or UptimeRobot

### Key Metrics
- API response times
- Error rates
- User engagement
- Chatbot usage
- GPA calculations per day

## File Organization

```
project/
├── frontend/
│   ├── src/
│   │   ├── config/          # Configuration
│   │   ├── services/        # API clients
│   │   ├── pages/           # Page components
│   │   ├── components/      # Reusable components
│   │   └── css/             # Stylesheets
│   └── public/              # Static assets
│
├── backend/
│   ├── main.py              # API server
│   ├── rag_chatbot.py       # Chatbot logic
│   ├── gpa_calculator.py    # GPA logic
│   └── .env                 # Environment config
│
└── docs/
    ├── INTEGRATION_GUIDE.md
    ├── QUICK_REFERENCE.md
    └── ARCHITECTURE.md
```

## Integration Points

### Frontend → Backend
- HTTP/JSON over REST
- CORS enabled
- Vite proxy for development

### Backend → External Services
- Groq API for LLM
- Environment variables for config
- Error handling and retries

### Frontend → External Services
- OpenStreetMap for maps
- Direct browser API calls
- No backend proxy needed
