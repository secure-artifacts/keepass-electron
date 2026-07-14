@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\repair_and_build.ps1"
if errorlevel 1 (
  echo.
  echo REPAIR BUILD FAILED. Review the first error above.
  pause
  exit /b 1
)
pause
