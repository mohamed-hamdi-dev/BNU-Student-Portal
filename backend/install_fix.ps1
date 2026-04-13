# Fix installation script for Python 3.14 compatibility
Write-Host "=== Fixing Dependencies Installation ===" -ForegroundColor Green
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

Write-Host "Installing numpy first (latest version with pre-built wheels)..." -ForegroundColor Yellow
& $pythonCmd -m pip install --upgrade pip
& $pythonCmd -m pip install numpy --only-binary :all: --upgrade

if ($LASTEXITCODE -ne 0) {
    Write-Host "Trying alternative: installing latest numpy..." -ForegroundColor Yellow
    & $pythonCmd -m pip install numpy --upgrade
}

Write-Host ""
Write-Host "Installing remaining dependencies..." -ForegroundColor Yellow
& $pythonCmd -m pip install fastapi uvicorn[standard] pydantic python-dotenv
& $pythonCmd -m pip install langchain langchain-openai langchain-community
& $pythonCmd -m pip install chromadb sentence-transformers openai pandas

Write-Host ""
if ($LASTEXITCODE -eq 0) {
    Write-Host "=== Installation Complete! ===" -ForegroundColor Green
} else {
    Write-Host "Some packages may have failed. Check the output above." -ForegroundColor Yellow
}
