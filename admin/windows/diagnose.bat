@echo off
REM Collects what Claude needs to debug the admin on this computer and
REM opens it in Notepad. Nothing is sent anywhere.
cd /d "%~dp0..\.."
set OUT=%USERPROFILE%\Desktop\portfolio-diagnostika.txt
echo Portfolio admin - diagnostika > "%OUT%"
ver >> "%OUT%"
echo. >> "%OUT%"
where node >> "%OUT%" 2>&1
where git >> "%OUT%" 2>&1
node admin\tools\check-setup.js >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo --- git status >> "%OUT%"
git status -sb >> "%OUT%" 2>&1
git log --oneline -5 >> "%OUT%" 2>&1
git config --get-all credential.helper >> "%OUT%" 2>&1
start notepad "%OUT%"
