@echo off
echo Cleaning up stuck servers...
taskkill /F /IM node.exe >nul 2>&1
echo Starting Game Server...
start /b node server.js
timeout /t 3 >nul
start http://localhost:3000/home.html
pause
