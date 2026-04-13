# Setup script for GPA Calculator & RAG Chatbot Backend
Write-Host "=== Backend Setup Script ===" -ForegroundColor Green
Write-Host ""

# Check Python installation
Write-Host "Checking Python installation..." -ForegroundColor Yellow
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCmd = "py"
} else {
    Write-Host "ERROR: Python not found!" -ForegroundColor Red
    Write-Host "Please install Python from https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

Write-Host "Python found: $pythonCmd" -ForegroundColor Green
& $pythonCmd --version

# Navigate to backend directory
$backendPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $backendPath
Write-Host "Working directory: $backendPath" -ForegroundColor Green
Write-Host ""

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
& $pythonCmd -m pip install --upgrade pip
& $pythonCmd -m pip install -r requirements.txt

if ($LASTEXITCODE -eq 0) {
    Write-Host "Dependencies installed successfully!" -ForegroundColor Green
} else {
    Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Create .env file if it doesn't exist
if (-not (Test-Path ".env")) {
    Write-Host "Creating .env file from template..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host ".env file created!" -ForegroundColor Green
    Write-Host ""
    Write-Host "IMPORTANT: Please edit .env and add your OpenAI API key!" -ForegroundColor Yellow
    Write-Host "Get your API key from: https://platform.openai.com/api-keys" -ForegroundColor Cyan
} else {
    Write-Host ".env file already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Setup Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "To start the server, run:" -ForegroundColor Cyan
Write-Host "  python main.py" -ForegroundColor White
Write-Host ""
Write-Host "Or:" -ForegroundColor Cyan
Write-Host "  uvicorn main:app --reload" -ForegroundColor White
Write-Host ""
