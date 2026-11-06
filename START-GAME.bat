@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Bua Com Tinh Nghia - server
where node >nul 2>nul || (echo Can cai Node.js LTS: https://nodejs.org & pause & exit /b 1)
if not exist node_modules\msedge-tts (
  echo Dang cai thu vien...
  call npm install || (pause & exit /b 1)
)
echo Dang build giao dien...
call npm run build || (pause & exit /b 1)
start "" http://127.0.0.1:8787/control
call npm start
pause
