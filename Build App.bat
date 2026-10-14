@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then run this again.
  pause
  exit /b 1
)
echo Closing any running copy of Overnote...
taskkill /f /im "Overnote.exe" >nul 2>nul
taskkill /f /im "Sticky Notes.exe" >nul 2>nul
taskkill /f /im "Overnote-Portable.exe" >nul 2>nul
taskkill /f /im "Sticky-Notes-Portable.exe" >nul 2>nul
echo Installing and building. This takes a few minutes the first time...
call npm install
if errorlevel 1 (pause & exit /b 1)
call npm run build
if errorlevel 1 (pause & exit /b 1)
echo.
echo Done! Installing the new version now (it opens by itself).
start "" "%~dp0dist\Overnote-Setup.exe"
timeout /t 5 >nul
