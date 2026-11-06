@echo off
rem Mo cua so live 9:16 (che do ung dung, khong thanh dia chi) de dua vao TikTok LIVE Studio bang nguon "Cua so".
rem Cac co --disable-* giup cua so van ve khi bi che / thu nho, tranh hinh dung khi live.
set URL=http://127.0.0.1:8787/?size=720
set FLAGS=--app=%URL% --window-size=760,1340 --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --autoplay-policy=no-user-gesture-required --user-data-dir="%LOCALAPPDATA%\BuaComLive"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" %FLAGS% & exit /b)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" %FLAGS% & exit /b)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" %FLAGS% & exit /b)
start "" msedge %FLAGS%
