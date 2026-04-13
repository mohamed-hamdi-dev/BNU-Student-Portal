# Integration Flow Diagrams

Visual representation of how the frontend and backend communicate.

## 1. Chat Message Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER ACTION                              │
│                  User types message and clicks Send              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Chatbot.jsx)                        │
│                                                                  │
│  1. User input captured                                         │
│  2. Message added to chat context                               │
│  3. Loading state set to true                                   │
│  4. Call sendChatMessage()                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              SERVICE LAYER (chatService.js)                      │
│                                                                  │
│  sendChatMessage(message, conversationId)                       │
│  {                                                               │
│    method: 'POST',                                              │
│    url: 'http://localhost:8000/api/chat',                      │
│    body: { message, conversation_id }                           │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP POST
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND (main.py)                              │
│                                                                  │
│  @app.post("/api/chat")                                         │
│  async def chat_endpoint(request: ChatRequest)                  │
│  {                                                               │
│    1. Validate request                                          │
│    2. Call rag_chatbot.chat()                                   │
│    3. Return response                                           │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              CHATBOT MODULE (rag_chatbot.py)                     │
│                                                                  │
│  1. Get/create conversation                                     │
│  2. Add user message to history                                 │
│  3. Call Groq API                                               │
│  4. Get AI response                                             │
│  5. Add to conversation history                                 │
│  6. Return response                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ API Call
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GROQ API                                    │
│                                                                  │
│  POST https://api.groq.com/openai/v1/chat/completions          │
│  {                                                               │
│    model: "llama-3.1-8b-instant",                              │
│    messages: [...conversation history]                          │
│  }                                                               │
│                                                                  │
│  Returns: AI-generated response                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Response
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND (main.py)                              │
│                                                                  │
│  Return ChatResponse:                                           │
│  {                                                               │
│    response: "AI answer",                                       │
│    conversation_id: "uuid",                                     │
│    sources: []                                                  │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ JSON Response
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              SERVICE LAYER (chatService.js)                      │
│                                                                  │
│  1. Receive response                                            │
│  2. Parse JSON                                                  │
│  3. Return data to component                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Chatbot.jsx)                        │
│                                                                  │
│  1. Receive response data                                       │
│  2. Update conversation_id                                      │
│  3. Add bot message to chat context                             │
│  4. Set loading state to false                                  │
│  5. Display message in UI                                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         USER SEES                                │
│                    Bot response in chat                          │
└─────────────────────────────────────────────────────────────────┘
```

## 2. GPA Calculation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER ACTION                              │
│          User enters grades and clicks Calculate                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Chatbot.jsx)                        │
│                         GpaTab Component                         │
│                                                                  │
│  1. Collect form data (subjects, grades)                        │
│  2. Calculate total scores (mid1 + mid2 + yw + final)          │
│  3. Convert scores to letter grades                             │
│  4. Prepare courses array                                       │
│  5. Set loading state                                           │
│  6. Call calculateGPA()                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              SERVICE LAYER (gpaService.js)                       │
│                                                                  │
│  calculateGPA(courses)                                          │
│  {                                                               │
│    method: 'POST',                                              │
│    url: 'http://localhost:8000/api/gpa/calculate',            │
│    body: {                                                      │
│      courses: [                                                 │
│        { name: "Math", credits: 3.0, grade: "A" },            │
│        { name: "Physics", credits: 4.0, grade: "B" }          │
│      ]                                                          │
│    }                                                            │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP POST
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND (main.py)                              │
│                                                                  │
│  @app.post("/api/gpa/calculate")                                │
│  async def calculate_gpa_endpoint(request: GPARequest)          │
│  {                                                               │
│    1. Validate request (courses array)                          │
│    2. Convert to GPACourse objects                              │
│    3. Call calculate_gpa()                                      │
│    4. Return result                                             │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│           GPA MODULE (gpa_calculator.py)                         │
│                                                                  │
│  calculate_gpa(courses):                                        │
│    1. Initialize totals                                         │
│    2. For each course:                                          │
│       - Convert grade to points (A=4.0, B=3.0, etc.)           │
│       - Multiply by credits                                     │
│       - Add to total_points                                     │
│       - Add credits to total_credits                            │
│    3. Calculate GPA = total_points / total_credits              │
│    4. Return result                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Calculation Result
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND (main.py)                              │
│                                                                  │
│  Return GPAResponse:                                            │
│  {                                                               │
│    gpa: 3.43,                                                   │
│    total_credits: 7.0,                                          │
│    total_points: 24.0                                           │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ JSON Response
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              SERVICE LAYER (gpaService.js)                       │
│                                                                  │
│  1. Receive response                                            │
│  2. Parse JSON                                                  │
│  3. Return data to component                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Chatbot.jsx)                        │
│                         GpaTab Component                         │
│                                                                  │
│  1. Receive GPA result                                          │
│  2. Update state with GPA value                                 │
│  3. Set loading state to false                                  │
│  4. Display GPA in UI                                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         USER SEES                                │
│                  Calculated GPA: 3.43                            │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    API REQUEST FAILS                             │
│              (Backend down, network error, etc.)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              SERVICE LAYER (chatService.js)                      │
│                                                                  │
│  try {                                                           │
│    const response = await fetch(...)                            │
│    if (!response.ok) throw new Error(...)                       │
│  } catch (error) {                                              │
│    console.error('Error:', error)                               │
│    throw error  // Re-throw to component                        │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Error thrown
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Chatbot.jsx)                        │
│                                                                  │
│  try {                                                           │
│    const data = await sendChatMessage(...)                      │
│  } catch (error) {                                              │
│    // Show error message to user                                │
│    const errorMsg = {                                           │
│      role: "model",                                             │
│      parts: [{                                                  │
│        text: "حدث خطأ في الاتصال..."                           │
│      }]                                                         │
│    }                                                             │
│    setChatContext(prev => [...prev, errorMsg])                  │
│  } finally {                                                    │
│    setIsLoading(false)                                          │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         USER SEES                                │
│              Friendly error message in chat                      │
│         "حدث خطأ في الاتصال بخادم المساعد الذكي"               │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Application Startup Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPER RUNS                                │
│                    .\start-dev.ps1                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│   START BACKEND          │   │   START FRONTEND         │
│   (Port 8000)            │   │   (Port 5173)            │
│                          │   │                          │
│  1. Load .env            │   │  1. Load .env            │
│  2. Initialize FastAPI   │   │  2. Start Vite           │
│  3. Setup CORS           │   │  3. Setup proxy          │
│  4. Initialize chatbot   │   │  4. Compile React        │
│  5. Start Uvicorn        │   │  5. Open browser         │
└────────────┬─────────────┘   └────────────┬─────────────┘
             │                               │
             │                               │
             ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│  Backend Ready           │   │  Frontend Ready          │
│  http://localhost:8000   │   │  http://localhost:5173   │
└──────────────────────────┘   └──────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION READY                             │
│                                                                  │
│  ✅ Backend API available                                       │
│  ✅ Frontend UI accessible                                      │
│  ✅ Integration working                                         │
│  ✅ Ready for development                                       │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Data Transformation Flow

### Score to Grade to GPA

```
User Input (Frontend)
    │
    │ Mid1: 14, Mid2: 13, YW: 28, Final: 38
    │
    ▼
Calculate Total Score
    │
    │ Total = 14 + 13 + 28 + 38 = 93
    │
    ▼
Convert to Letter Grade (Frontend)
    │
    │ scoreToGrade(93) → "A"
    │
    ▼
Prepare API Request
    │
    │ { name: "Math", credits: 3.0, grade: "A" }
    │
    ▼
Send to Backend
    │
    │ POST /api/gpa/calculate
    │
    ▼
Backend Processing
    │
    │ Grade "A" → 4.0 points
    │ Points × Credits = 4.0 × 3.0 = 12.0
    │
    ▼
Calculate GPA
    │
    │ GPA = total_points / total_credits
    │ GPA = 12.0 / 3.0 = 4.0
    │
    ▼
Return to Frontend
    │
    │ { gpa: 4.0, total_credits: 3.0, total_points: 12.0 }
    │
    ▼
Display to User
    │
    │ "Your GPA: 4.0"
    │
    ▼
```

## 6. Configuration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENVIRONMENT FILES                             │
│                                                                  │
│  Frontend: .env                    Backend: backend/.env         │
│  ├─ VITE_API_BASE_URL             ├─ GROQ_API_KEY              │
│                                    ├─ GROQ_MODEL                 │
│                                    └─ GROQ_BASE_URL              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│  Frontend Config         │   │  Backend Config          │
│  (src/config/api.js)     │   │  (load_dotenv())         │
│                          │   │                          │
│  const API_BASE_URL =    │   │  api_key = os.getenv()   │
│    import.meta.env       │   │  model = os.getenv()     │
│      .VITE_API_BASE_URL  │   │  base_url = os.getenv()  │
│    || 'localhost:8000'   │   │                          │
└────────────┬─────────────┘   └────────────┬─────────────┘
             │                               │
             ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│  Used in Services        │   │  Used in Chatbot         │
│  - chatService.js        │   │  - rag_chatbot.py        │
│  - gpaService.js         │   │  - main.py               │
└──────────────────────────┘   └──────────────────────────┘
```

## Key Takeaways

1. **Clean Separation**: Frontend and backend are loosely coupled through REST APIs
2. **Service Layer**: All API calls go through dedicated service modules
3. **Error Handling**: Errors are caught at multiple levels and shown to users
4. **Configuration**: Environment variables control behavior in both layers
5. **Data Flow**: Clear transformation pipeline from user input to display
6. **Async Operations**: Proper handling of asynchronous API calls with loading states

## Testing the Flow

Use `test-integration.html` to verify each step:
1. Health check → Verifies backend is running
2. Chat test → Tests complete chat flow
3. GPA test → Tests complete GPA calculation flow

Each test shows the request/response at each step!
