# Start server script
Write-Host "Starting Backend Server..." -ForegroundColor Green
Write-Host ""

# Navigate to backend directory
$backendPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $backendPath

$venvPython = Join-Path $backendPath "venv\Scripts\python.exe"
$pythonCmd = $null
if (Test-Path $venvPython) {
    $pythonCmd = $venvPython
    Write-Host "Using backend virtual environment Python" -ForegroundColor Green
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
    Write-Host "Using system Python" -ForegroundColor Yellow
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCmd = "py"
    Write-Host "Using Python launcher" -ForegroundColor Yellow
} else {
    Write-Host "ERROR: Python not found!" -ForegroundColor Red
    exit 1
}

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
