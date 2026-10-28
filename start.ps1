# Urban Platform PowerShell Launcher

# Free port 8000 if already in use
$conn = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}

Write-Host "Starting Urban Service Resolution Platform..." -ForegroundColor Cyan

# 1. Start Backend in separate window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; .\.venv\Scripts\python.exe -m uvicorn api.main:app --reload --port 8000"

# 2. Start Frontend in separate window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"

# 3. Open browser after brief delay
Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"

Write-Host "Running! Check http://localhost:5173 and http://127.0.0.1:8000/docs" -ForegroundColor Green
