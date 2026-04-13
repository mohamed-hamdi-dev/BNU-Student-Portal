# Development Startup Script
# This script starts both frontend and backend servers

Write-Host "🚀 Starting BNU Student Portal Development Environment" -ForegroundColor Cyan
Write-Host ""

# Check if backend is already running
$backendRunning = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($backendRunning) {
    Write-Host "⚠️  Backend already running on port 8000" -ForegroundColor Yellow
} else {
    Write-Host "📦 Starting Backend Server..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; .\start_server.ps1"
    Start-Sleep -Seconds 3
}

# Check if frontend is already running
$frontendRunning = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($frontendRunning) {
    Write-Host "⚠️  Frontend already running on port 5173" -ForegroundColor Yellow
} else {
    Write-Host "🎨 Starting Frontend Server..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"
    Start-Sleep -Seconds 3
}

Write-Host ""
Write-Host "✅ Development environment started!" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "📍 Backend:  http://localhost:8000" -ForegroundColor Cyan
Write-Host "📍 API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
