# Start server script
Write-Host "Starting Backend Server..." -ForegroundColor Green
Write-Host ""

$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCmd = "py"
} else {
    Write-Host "ERROR: Python not found!" -ForegroundColor Red
    exit 1
}

# Navigate to backend directory
$backendPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $backendPath

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "WARNING: .env file not found!" -ForegroundColor Yellow
    Write-Host "The RAG chatbot will not work without an OpenAI API key." -ForegroundColor Yellow
    Write-Host "Create .env file with: OPENAI_API_KEY=your_key_here" -ForegroundColor Yellow
    Write-Host ""
}

# Start server
Write-Host "Server will be available at: http://localhost:8000" -ForegroundColor Cyan
Write-Host "API docs will be at: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

& $pythonCmd main.py
