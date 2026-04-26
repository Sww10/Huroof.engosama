@echo off
echo Cleaning up stuck servers...
taskkill /F /IM node.exe >nul 2>&1
echo Starting Game Server...
start /b node server.js
echo.
echo Please wait while the server connects to Ngrok...
echo Your browser will open automatically when ready.
echo.
pause
