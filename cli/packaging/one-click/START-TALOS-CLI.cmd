@echo off
setlocal
set "TALOS_LAUNCHER=%~dp0"
set "TALOS_PROJECT=%CD%"
if not "%~1"=="" set "TALOS_PROJECT=%~f1"
title TALOS CLI
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TALOS_LAUNCHER%bootstrap.ps1" -Project "%TALOS_PROJECT%"
set "TALOS_EXIT=%ERRORLEVEL%"
if not "%TALOS_EXIT%"=="0" (
  echo.
  echo TALOS CLI exited with code %TALOS_EXIT%.
  pause
)
exit /b %TALOS_EXIT%
