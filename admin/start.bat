@echo off
REM Double-click this file to start the portfolio admin tool on Windows.
cd /d "%~dp0"
echo Starting Martin Posta portfolio admin tool...
start /min cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:4173/admin/"
node server.js
pause
