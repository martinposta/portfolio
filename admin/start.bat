@echo off
REM Double-click this file to start the portfolio admin tool on Windows.
REM First time on this computer? Run windows\setup-windows.bat instead.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 echo Node.js neni nainstalovany. Spustte admin\windows\setup-windows.bat & pause & exit /b 1
where git >nul 2>nul
if errorlevel 1 echo Git neni nainstalovany. Spustte admin\windows\setup-windows.bat & pause & exit /b 1
echo Starting Martin Posta portfolio admin tool...
echo Close this window to stop it.
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:4173/admin/"
node server.js
pause
