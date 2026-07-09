@echo off
setlocal
set TALOS_ROOT=%~dp0
set TALOS_SCRIPT=%TALOS_ROOT%talos

where bash >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    bash "%TALOS_SCRIPT%" %*
    exit /b %ERRORLEVEL%
)

echo talos.cmd requires Git Bash on PATH.
echo Install Git for Windows, then run: talos.cmd up
echo This wrapper delegates to the root talos script, which runs docker compose.
exit /b 1

