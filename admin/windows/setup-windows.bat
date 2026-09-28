@echo off
REM Portfolio admin - setup for Windows. Double-click this file.
REM Uses setup.ps1 next to it; if missing (this file was downloaded alone),
REM downloads it from GitHub first. One-line IFs on purpose: a copy saved
REM from the browser may have Unix line endings, and cmd.exe handles
REM multi-line blocks badly then.
echo Portfolio admin - instalace pro Windows
if exist "%~dp0setup.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if not exist "%~dp0setup.ps1" powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Join-Path $env:TEMP 'portfolio-setup.ps1'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/martinposta/portfolio/main/admin/windows/setup.ps1' -OutFile $p; & $p"
echo.
pause
