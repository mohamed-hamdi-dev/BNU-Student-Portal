# IMPORTANT: READ THIS FIRST

## This project needs TWO servers running

If the backend appears "down", usually only the frontend is running.

---

## Quick setup

### 1) Install dependencies
```bash
# from project root
npm install

# backend deps
cd backend
pip install -r requirements.txt
```

### 2) Start both servers (2 terminals)

Terminal 1 (Backend):
```bash
cd backend
python main.py
```
Expected:
- `Uvicorn running on http://0.0.0.0:8000`

Terminal 2 (Frontend):
```bash
# from project root
npm run dev
```
Expected:
- `Local: http://localhost:5173/`

---

## Verify it works

1. Open: `http://localhost:5173`
2. Check backend health: `http://localhost:8000/api/health`
3. You should get JSON like:
```json
{"status":"healthy","rag_chatbot_available":true}
```

---

## Common issue: port already in use

If you see:
- `WinError 10048` on `0.0.0.0:8000`

It means another backend process is already running on port `8000`.

Find process:
```powershell
netstat -ano | findstr :8000
```

Stop process (replace PID):
```powershell
Stop-Process -Id <PID> -Force
```

Then start backend again:
```bash
python main.py
```

---

## Notes

- Default backend port is `8000` (can be changed via `API_PORT` in `.env`).
- Frontend must point to the same backend URL/protocol.
- Do not run multiple backend instances on the same port.

---

## Related docs

- [README.md](./README.md)
- [START_HERE.md](./START_HERE.md)
- [SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md)

