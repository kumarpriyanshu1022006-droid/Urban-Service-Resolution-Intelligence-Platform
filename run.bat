@echo off
title Urban Service Resolution Platform Launcher
echo ======================================================================
echo   Starting Urban Service Resolution Intelligence Platform
echo ======================================================================

REM Free port 8000 if occupied
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo [1/2] Starting Backend API on http://127.0.0.1:8000 ...
start "Urban API - Backend (Port 8000)" cmd /k "cd /d "%~dp0" && .venv\Scripts\python.exe -m uvicorn api.main:app --reload --port 8000"

echo [2/2] Starting Frontend on http://localhost:5173 ...
start "Urban UI - Frontend (Port 5173)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 /nobreak >nul
start http://localhost:5173

echo ======================================================================
echo Both servers are running!
echo - Web App:  http://localhost:5173
echo - API Docs: http://127.0.0.1:8000/docs
echo Close the opened terminal windows to stop the platform.
echo ======================================================================
