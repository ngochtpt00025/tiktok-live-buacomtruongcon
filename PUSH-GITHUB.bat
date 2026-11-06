@echo off
chcp 65001 >nul
cd /d "%~dp0"
set REPO=https://github.com/ngochtpt00025/tiktok-live-buacomtruongcon.git

where git >nul 2>&1 || (echo Chua cai Git. Tai tai https://git-scm.com roi chay lai. & pause & exit /b 1)

if not exist .git (
  git init
  git branch -M main
)

git config user.name >nul 2>&1 || git config user.name "ngochtpt00025"
git config user.email >nul 2>&1 || git config user.email "ngochtpt00025@gmail.com"

git remote get-url origin >nul 2>&1 && git remote set-url origin %REPO% || git remote add origin %REPO%

git add -A
git commit -m "Bua Com Truong Con v0.5" || echo (Khong co thay doi moi de commit)

git fetch origin
git rev-parse --verify origin/main >nul 2>&1 && git pull origin main --allow-unrelated-histories --no-edit

git push -u origin main
if errorlevel 1 (echo. & echo Day len that bai - xem loi o tren.) else (echo. & echo Da day code len %REPO%)
pause
