# 🚀 START HERE - Frontend-Backend Integration

Welcome! This guide will get you up and running in 5 minutes.

## ✅ Prerequisites Check

Before starting, make sure you have:

- [ ] **Node.js 18+** installed (`node --version`)
- [ ] **Python 3.11+** installed (`python --version`)
- [ ] **Groq API Key** ([Get one free here](https://console.groq.com/))
- [ ] **Git** installed (optional)

## 🎯 Quick Start (3 Steps)

### Step 1: Backend Setup (2 minutes)

```bash
# Navigate to backend folder
cd backend

# Create virtual environment
python -m venv venv

# Activate it
# Windows PowerShell:
.\venv\Scripts\activate
# Windows CMD:
venv\Scripts\activate.bat
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env

# Edit .env and add your GROQ_API_KEY
# Use notepad, VS Code, or any text editor
notepad .env
```

**In the .env file, add:**
```env
GROQ_API_KEY=your_actual_api_key_here
```

### Step 2: Frontend Setup (1 minute)

```bash
# Go back to root directory
cd ..

# Install dependencies
npm install

# Optional: Create frontend .env
cp .env.example .env
```

### Step 3: Start Everything (30 seconds)

**Option A: Automated (Windows)**
```powershell
.\start-dev.ps1
```

**Option B: Manual (All platforms)**
```bash
# Terminal 1 - Backend
cd backend
python main.py

# Terminal 2 - Frontend (new terminal)
npm run dev
```

## 🎉 You're Done!

Open your browser and visit:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000/docs

## 🧪 Test It Works

### Quick Test (30 seconds)

1. Open http://localhost:5173
2. Click the blue chatbot button (bottom right)
3. Click the "Chat" tab
4. Type "Hello" and press Send
5. You should get a response!

### Detailed Test (2 minutes)

Open `test-integration.html` in your browser and click all test buttons. All should show ✅ green success.

## 📚 What's Next?

### Learn the System
- [INTEGRATION_SUMMARY.md](./INTEGRATION_SUMMARY.md) - What was integrated
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Commands and APIs
- [ARCHITECTURE.md](./ARCHITECTURE.md) - How it works

### Explore Features
- **Chat Tab**: Talk to the AI assistant
- **GPA Tab**: Calculate your GPA
- **Map Tab**: Explore campus map

### Customize
- Modify chat responses in `backend/rag_chatbot.py`
- Update UI in `src/pages/Chatbot.jsx`
- Add new API endpoints in `backend/main.py`

## 🐛 Troubleshooting

### Backend won't start?

```bash
# Check Python version
python --version  # Should be 3.11+

# Reinstall dependencies
pip install -r requirements.txt

# Check if port 8000 is free
# Windows:
netstat -ano | findstr :8000
# Linux/Mac:
lsof -i :8000
```

### Frontend won't start?

```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install

# Check if port 5173 is free
# Windows:
netstat -ano | findstr :5173
# Linux/Mac:
lsof -i :5173
```

### Chat not working?

1. Check backend is running: http://localhost:8000/api/health
2. Verify GROQ_API_KEY in `backend/.env`
3. Check browser console for errors (F12)
4. Check backend terminal for errors

### GPA not calculating?

1. Verify backend is running
2. Check browser console (F12) for errors
3. Make sure you selected a subject name
4. Ensure grades are within valid ranges

## 📞 Need Help?

1. Check [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for detailed docs
2. Check [INTEGRATION_CHECKLIST.md](./INTEGRATION_CHECKLIST.md) for verification
3. Look at [INTEGRATION_FLOW.md](./INTEGRATION_FLOW.md) to understand data flow
4. Review API docs at http://localhost:8000/docs

## 🎓 Understanding the Integration

### How it works (Simple)

```
User clicks button → Frontend sends request → Backend processes → Returns result → Frontend displays
```

### File Structure (Important files)

```
Frontend:
├── src/config/api.js          ← API endpoints
├── src/services/
│   ├── chatService.js         ← Chat API calls
│   └── gpaService.js          ← GPA API calls
└── src/pages/Chatbot.jsx      ← Main UI

Backend:
├── main.py                    ← API server
├── rag_chatbot.py            ← Chat logic
└── gpa_calculator.py         ← GPA logic
```

## ✨ Features Available

- ✅ AI-powered chat assistant
- ✅ Term GPA calculator
- ✅ Accumulative GPA calculator
- ✅ Interactive campus map
- ✅ Voice input (in chat)
- ✅ Conversation history
- ✅ Error handling
- ✅ Loading indicators

## 🚀 Development Tips

### Making Changes

**Frontend changes**: Auto-reload (just save the file)
**Backend changes**: Restart the server (Ctrl+C, then `python main.py`)

### Testing Changes

1. Make your change
2. Save the file
3. Check browser for frontend changes
4. Restart backend for backend changes
5. Test in the UI

### Adding New Features

1. Add backend endpoint in `backend/main.py`
2. Add service function in `src/services/`
3. Use service in your component
4. Test with `test-integration.html`

## 📊 Project Status

✅ Backend API working
✅ Frontend UI working
✅ Integration complete
✅ Documentation ready
✅ Test tools provided
✅ Ready for development

## 🎯 Common Tasks

### Start development
```bash
.\start-dev.ps1  # Windows
# or manually start both servers
```

### Stop servers
```
Press Ctrl+C in each terminal
```

### View API docs
```
http://localhost:8000/docs
```

### Test integration
```
Open test-integration.html in browser
```

### Check backend health
```
http://localhost:8000/api/health
```

## 💡 Pro Tips

1. Keep both terminals visible to see logs
2. Use browser DevTools (F12) to debug frontend
3. Check backend terminal for API errors
4. Use the test page to verify backend quickly
5. Read error messages carefully - they're helpful!

## 🎉 Success Indicators

You'll know everything is working when:

- ✅ No errors in terminals
- ✅ Frontend loads at http://localhost:5173
- ✅ Backend docs at http://localhost:8000/docs
- ✅ Chat responds to messages
- ✅ GPA calculates correctly
- ✅ Map loads and works

## 📝 Quick Commands Reference

```bash
# Start backend
cd backend && python main.py

# Start frontend
npm run dev

# Install backend deps
pip install -r requirements.txt

# Install frontend deps
npm install

# Build for production
npm run build

# Run tests
python backend/test_chatbot.py
```

## 🔗 Important URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:5173 | Main application |
| Backend | http://localhost:8000 | API server |
| API Docs | http://localhost:8000/docs | Swagger UI |
| Health | http://localhost:8000/api/health | Status check |

---

## Ready to Start? 🚀

1. Follow the 3 steps above
2. Open http://localhost:5173
3. Click the chatbot button
4. Start chatting!

**Need more details?** Check [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)

**Having issues?** See [INTEGRATION_CHECKLIST.md](./INTEGRATION_CHECKLIST.md)

**Want to understand the code?** Read [ARCHITECTURE.md](./ARCHITECTURE.md)

---

**Happy coding! 🎉**
