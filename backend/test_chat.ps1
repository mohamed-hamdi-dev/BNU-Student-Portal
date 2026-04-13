# Quick test script for Chat API
param(
    [string]$Question = "What is artificial intelligence?",
    [string]$ConversationId = $null
)

$baseUrl = "http://localhost:8000/api/chat"

Write-Host "Testing Chat API..." -ForegroundColor Cyan
Write-Host ""

# Build request body
$body = @{
    message = $Question
} | ConvertTo-Json

if ($ConversationId) {
    $bodyObj = @{
        message = $Question
        conversation_id = $ConversationId
    } | ConvertTo-Json
    $body = $bodyObj
}

Write-Host "Question: $Question" -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $baseUrl -Method Post -Body $body -ContentType "application/json"
    
    Write-Host "Answer:" -ForegroundColor Green
    Write-Host $response.response -ForegroundColor White
    Write-Host ""
    Write-Host "Conversation ID: $($response.conversation_id)" -ForegroundColor Cyan
    
    if ($response.sources -and $response.sources.Count -gt 0) {
        Write-Host ""
        Write-Host "Sources:" -ForegroundColor Magenta
        foreach ($source in $response.sources) {
            Write-Host "  - $($source.Substring(0, [Math]::Min(100, $source.Length)))..." -ForegroundColor Gray
        }
    }
    
    Write-Host ""
    Write-Host "To continue this conversation, use:" -ForegroundColor Yellow
    Write-Host "  .\test_chat.ps1 -Question 'Your follow-up question' -ConversationId '$($response.conversation_id)'" -ForegroundColor Gray
    
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    if ($_.Exception.Response.StatusCode -eq 503) {
        Write-Host ""
        Write-Host "The RAG chatbot is not initialized. Check your GROQ_API_KEY in .env file." -ForegroundColor Yellow
    } elseif ($_.Exception.Response.StatusCode -eq 0) {
        Write-Host ""
        Write-Host "Could not connect to server. Make sure the server is running:" -ForegroundColor Yellow
        Write-Host "  .\start_server.ps1" -ForegroundColor Gray
    }
}
