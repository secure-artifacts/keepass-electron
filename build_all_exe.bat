@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\build_all.ps1"
if errorlevel 1 (
  echo.
  echo BUILD FAILED. Review the error above.
)
pause
