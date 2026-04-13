# 🚀 BNU Student Portal - Setup Instructions

## For Anyone Cloning This Repository

This project has **TWO parts** that need to run simultaneously:
1. **Frontend** (React + Vite) - Port 5173
2. **Backend** (FastAPI + Python) - Port 8001

Both must be running for the application to work!

---

## 📋 Prerequisites

Before starting, make sure you have:

- ✅ **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
- ✅ **Python** (v3.8 or higher) - [Download](https://www.python.org/)
- ✅ **Git** - [Download](https://git-scm.com/)

Check versions:
```bash
node --version
python --version
git --version
```

---

## 🔧 Installation Steps

### Step 1: Clone the Repository
```bash
git clone <your-repo-url>
cd <project-folder>
```

### Step 2: Install Frontend Dependencies
```bash
# Install Node.js packages
npm install
```

### Step 3: Install Backend Dependencies
```bash
# Navigate to backend folder
cd backend

# Install Python packages
pip install -r requirements.txt

# Or if you have issues, install individually:
pip install fastapi uvicorn pydantic python-dotenv email-validator httpx chromadb langchain langchain-community langchain-openai
```

### Step 4: Create Database
```bash
# Still in backend folder
python seed_data.py
```

This creates `Data/db.json` with sample data:
- 3 users (students + admin)
- 5 courses
- 2 grade entries
- 1 quiz

### Step 5: Configure Environment (Optional)
```bash
# Go back to project root
cd ..

# The .env file should already exist with:
# VITE_API_BASE_URL=http://localhost:8001
```

---

## ▶️ Running the Application

You need **TWO terminal windows** open:

### Terminal 1: Start Backend
```bash
cd backend
python full_api.py
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8001
✅ Chatbot initialized successfully
```

**Keep this terminal running!**

### Terminal 2: Start Frontend
```bash
# In project root
npm run dev
```

You should see:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

**Keep this terminal running too!**

---

## 🧪 Verify Everything Works

### Test 1: Backend Health Check
Open browser and visit:
```
http://localhost:8001/api/health
```

Should show:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "chatbot_available": true
}
```

### Test 2: Frontend Loads
Open browser and visit:
```
http://localhost:5173
```

Should show the login page.

### Test 3: Login Works
Use these credentials:
- Username: `1000001`
- Password: `pass123`

Should redirect to student dashboard.

### Test 4: API Test Page
Open `test-api.html` in browser and click test buttons.

---

## 🔑 Test Accounts

| Username | Password | Role    | Description |
|----------|----------|---------|-------------|
| 1000001  | pass123  | student | Has grades in system |
| 2358858  | abcdef   | student | Empty record |
| admin    | admin123 | admin   | Administrator |

---

## 📁 Project Structure

```
project-root/
├── backend/                    # Backend API (Python/FastAPI)
│   ├── full_api.py            # Main API server (RUN THIS!)
│   ├── database.py            # Database handler
│   ├── models.py              # Data models
│   ├── seed_data.py           # Creates sample data
│   ├── requirements.txt       # Python dependencies
│   └── ...
├── Data/
│   └── db.json                # Database file (created by seed_data.py)
├── src/                       # Frontend source (React)
│   ├── pages/                 # Page components
│   ├── services/              # API service layer
│   ├── config/
│   │   └── api.js            # API endpoints configuration
│   └── ...
├── public/                    # Static assets
├── .env                       # Environment variables
├── package.json               # Node.js dependencies
├── vite.config.js            # Vite configuration
└── README.md                  # Project documentation
```

---

## 🐛 Common Issues & Solutions

### Issue 1: "Module not found" (Python)
**Problem**: Missing Python packages
**Solution**:
```bash
cd backend
pip install -r requirements.txt
```

### Issue 2: "Cannot find module" (Node.js)
**Problem**: Missing Node packages
**Solution**:
```bash
npm install
```

### Issue 3: "Port 8001 already in use"
**Problem**: Another process using port 8001
**Solution**:
```bash
# Windows
netstat -ano | findstr :8001
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:8001 | xargs kill -9
```

### Issue 4: "Database not found"
**Problem**: `Data/db.json` doesn't exist
**Solution**:
```bash
cd backend
python seed_data.py
```

### Issue 5: "Failed to fetch" in browser
**Problem**: Backend not running
**Solution**: Make sure backend is running in Terminal 1

### Issue 6: CORS errors
**Problem**: CORS not enabled (shouldn't happen)
**Solution**: Already configured in `backend/full_api.py`

### Issue 7: Login says "wrong password"
**Problem**: Using wrong credentials
**Solution**: Use `1000001` / `pass123`

---

## 🌐 How Frontend & Backend Connect

```
┌─────────────────────────────────────────────────────────┐
│  Browser: http://localhost:5173                         │
│  ┌───────────────────────────────────────────────┐     │
│  │  Frontend (React)                             │     │
│  │  - Login page                                 │     │
│  │  - Dashboard                                  │     │
│  │  - Course pages                               │     │
│  └───────────────────────────────────────────────┘     │
│                      │                                   │
│                      │ HTTP Requests                     │
│                      ▼                                   │
└─────────────────────────────────────────────────────────┘
                       │
                       │ CORS Enabled
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Backend: http://localhost:8001                         │
│  ┌───────────────────────────────────────────────┐     │
│  │  FastAPI Server                               │     │
│  │  - 40+ API endpoints                          │     │
│  │  - Authentication                             │     │
│  │  - Course management                          │     │
│  │  - Payment processing                         │     │
│  └───────────────────────────────────────────────┘     │
│                      │                                   │
│                      ▼                                   │
│  ┌───────────────────────────────────────────────┐     │
│  │  Data/db.json                                 │     │
│  │  - Users, Courses, Grades, Payments           │     │
│  └───────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

**Important**: Both servers must be running simultaneously!

---

## 📚 API Documentation

Once backend is running, visit:
```
http://localhost:8001/docs
```

This shows interactive API documentation (Swagger UI) where you can test all endpoints.

---

## 🔄 Development Workflow

### Starting Work:
1. Open Terminal 1 → `cd backend && python full_api.py`
2. Open Terminal 2 → `npm run dev`
3. Open browser → `http://localhost:5173`

### Making Changes:
- **Frontend changes**: Auto-reload (Vite hot reload)
- **Backend changes**: Restart backend server (Ctrl+C, then run again)

### Stopping:
- Press `Ctrl+C` in both terminals

---

## 📦 What's Included

### Backend Features:
- ✅ User authentication (login, register, forgot password)
- ✅ Student profile management
- ✅ Course registration system
- ✅ Grade tracking with GPA calculation
- ✅ Payment processing with GPA-based discounts
- ✅ Quiz system with auto-grading
- ✅ RAG chatbot integration
- ✅ Admin dashboard

### Frontend Features:
- ✅ Responsive UI (Arabic/English)
- ✅ Student dashboard
- ✅ Course registration
- ✅ Grade viewer
- ✅ Payment calculator
- ✅ Quiz interface
- ✅ Chatbot interface

---

## 🚀 Deployment Notes

For production deployment:

1. **Update API URL** in `.env`:
   ```bash
   VITE_API_BASE_URL=https://your-backend-domain.com
   ```

2. **Build Frontend**:
   ```bash
   npm run build
   ```

3. **Deploy Backend** with proper WSGI server:
   ```bash
   uvicorn full_api:app --host 0.0.0.0 --port 8001
   ```

4. **Update CORS** in `backend/full_api.py`:
   ```python
   allow_origins=["https://your-frontend-domain.com"]
   ```

---

## 📞 Need Help?

If you encounter issues:

1. Check both terminals are running
2. Verify ports 5173 and 8001 are not blocked
3. Check `Data/db.json` exists
4. Try `test-api.html` to test backend directly
5. Check browser console for errors (F12)

---

## ✅ Quick Checklist

Before reporting issues, verify:

- [ ] Node.js installed
- [ ] Python installed
- [ ] `npm install` completed successfully
- [ ] `pip install -r requirements.txt` completed
- [ ] `python seed_data.py` created `Data/db.json`
- [ ] Backend running on port 8001
- [ ] Frontend running on port 5173
- [ ] Can access `http://localhost:8001/api/health`
- [ ] Can access `http://localhost:5173`
- [ ] Tried test credentials: `1000001` / `pass123`

---

## 🎉 Success!

If you can:
1. ✅ See the login page at `http://localhost:5173`
2. ✅ Login with `1000001` / `pass123`
3. ✅ See the student dashboard

**Congratulations! Everything is working!** 🎊

---

## 📖 Additional Documentation

- `FULL_BACKEND_GUIDE.md` - Complete API documentation
- `HOW_TO_USE_API.md` - API usage examples
- `FRONTEND_BACKEND_CONNECTION.md` - Architecture explanation
- `COMPLETE_INTEGRATION_SUMMARY.md` - Integration overview
