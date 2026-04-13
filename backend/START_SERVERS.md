# 🚀 How to Start the Application

## Windows Users

### Option 1: PowerShell Script (Easiest)
```powershell
.\start-dev.ps1
```

### Option 2: Manual (Two Terminals)

**Terminal 1:**
```powershell
cd backend
python full_api.py
```

**Terminal 2:**
```powershell
npm run dev
```

---

## Linux/Mac Users

### Option 1: Create Start Script

Create a file called `start.sh`:
```bash
#!/bin/bash

# Start backend in background
cd backend
python3 full_api.py &
BACKEND_PID=$!

# Go back to root
cd ..

# Start frontend
npm run dev

# When frontend stops, kill backend
kill $BACKEND_PID
```

Make it executable and run:
```bash
chmod +x start.sh
./start.sh
```

### Option 2: Manual (Two Terminals)

**Terminal 1:**
```bash
cd backend
python3 full_api.py
```

**Terminal 2:**
```bash
npm run dev
```

---

## Using tmux (Advanced)

```bash
# Create new tmux session
tmux new -s bnu-portal

# Split window horizontally
Ctrl+B then "

# In first pane (top)
cd backend
python full_api.py

# Switch to second pane (bottom)
Ctrl+B then ↓
npm run dev

# Detach from session: Ctrl+B then D
# Reattach later: tmux attach -t bnu-portal
```

---

## Using screen (Alternative)

```bash
# Start backend in screen
screen -S backend
cd backend
python full_api.py
# Detach: Ctrl+A then D

# Start frontend in another screen
screen -S frontend
npm run dev
# Detach: Ctrl+A then D

# List screens: screen -ls
# Reattach: screen -r backend
```

---

## Docker (Future Enhancement)

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8001:8001"
    volumes:
      - ./Data:/app/Data
    environment:
      - GROQ_API_KEY=${GROQ_API_KEY}

  frontend:
    build: .
    ports:
      - "5173:5173"
    depends_on:
      - backend
    environment:
      - VITE_API_BASE_URL=http://backend:8001
```

Then run:
```bash
docker-compose up
```

---

## Verification

After starting both servers, verify:

1. **Backend**: http://localhost:8001/api/health
   - Should show: `{"status": "healthy"}`

2. **Frontend**: http://localhost:5173
   - Should show login page

3. **Login Test**:
   - Username: `1000001`
   - Password: `pass123`
   - Should redirect to dashboard

---

## Stopping the Servers

### Manual Method
- Press `Ctrl+C` in each terminal

### If Running in Background
```bash
# Find processes
lsof -ti:8001  # Backend
lsof -ti:5173  # Frontend

# Kill them
kill $(lsof -ti:8001)
kill $(lsof -ti:5173)
```

### Windows
```powershell
# Find and kill backend
netstat -ano | findstr :8001
taskkill /PID <PID> /F

# Find and kill frontend
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

---

## Troubleshooting

### "Port already in use"
```bash
# Kill the process using the port
# Linux/Mac:
lsof -ti:8001 | xargs kill -9

# Windows:
netstat -ano | findstr :8001
taskkill /PID <PID> /F
```

### "Module not found"
```bash
# Reinstall dependencies
npm install
cd backend && pip install -r requirements.txt
```

### "Database not found"
```bash
cd backend
python seed_data.py
```

---

## Development Workflow

### Daily Startup
1. Open project in IDE
2. Start backend (Terminal 1)
3. Start frontend (Terminal 2)
4. Open browser to http://localhost:5173

### Making Changes
- **Frontend changes**: Auto-reload (hot module replacement)
- **Backend changes**: Restart backend server (Ctrl+C, then run again)

### Before Committing
1. Test all features
2. Check console for errors
3. Run linter: `npm run lint`
4. Stop both servers

---

## Quick Commands Reference

| Task | Command |
|------|---------|
| Start Backend | `cd backend && python full_api.py` |
| Start Frontend | `npm run dev` |
| Test Backend | `curl http://localhost:8001/api/health` |
| Reset Database | `cd backend && python seed_data.py` |
| Install Deps | `npm install && cd backend && pip install -r requirements.txt` |
| Build Frontend | `npm run build` |
| Check Ports | `lsof -ti:8001,5173` (Mac/Linux) |

---

## Environment Variables

Make sure these are set:

**Frontend (.env):**
```bash
VITE_API_BASE_URL=http://localhost:8001
```

**Backend (backend/.env):**
```bash
GROQ_API_KEY=your_api_key_here
```

---

## Success Indicators

✅ Backend running: See "Uvicorn running on http://0.0.0.0:8001"  
✅ Frontend running: See "Local: http://localhost:5173/"  
✅ Can access login page  
✅ Can login with test credentials  
✅ Dashboard loads with data  

---

**Need more help?** See [SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md)
