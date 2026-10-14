@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js LTS is required. Install from https://nodejs.org/
  pause
  exit /b 1
)
echo Installing locked dependencies...
call npm ci
if errorlevel 1 (pause & exit /b 1)
echo Running tests...
call npm test
if errorlevel 1 (pause & exit /b 1)
echo Building Overnote for Windows...
call npm run build
if errorlevel 1 (pause & exit /b 1)
echo.
echo Build complete. Find the unsigned installer and portable app in dist\
pause
