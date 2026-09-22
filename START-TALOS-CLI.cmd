@echo off
setlocal
title TALOS CLI - Owner Inspection
start "" notepad.exe "%~dp0OWNER-STEP-BY-STEP-CHECKLIST.txt"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap.ps1" -Project "%~1"
set "TALOS_EXIT=%ERRORLEVEL%"
if not "%TALOS_EXIT%"=="0" (
  echo.
  echo TALOS CLI inspection launcher exited with code %TALOS_EXIT%.
  pause
)
exit /b %TALOS_EXIT%
