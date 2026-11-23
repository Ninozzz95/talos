@echo off
setlocal
set "TALOS_LAUNCHER=%~dp0"
set "TALOS_PROJECT=%CD%"
if not "%~1"=="" set "TALOS_PROJECT=%~f1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TALOS_LAUNCHER%bootstrap.ps1" -Project "%TALOS_PROJECT%"
exit /b %ERRORLEVEL%
