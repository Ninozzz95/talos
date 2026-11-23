@echo off
setlocal
title TALOS CLI
cd /d "%~dp0"
call "%~dp0bin\talos.cmd" %*
set "TALOS_EXIT=%ERRORLEVEL%"
if not "%TALOS_EXIT%"=="0" (
  echo.
  echo TALOS CLI exited with code %TALOS_EXIT%.
  echo Press any key to close this window.
  pause >nul
)
exit /b %TALOS_EXIT%
