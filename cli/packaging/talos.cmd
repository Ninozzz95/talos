@echo off
setlocal
set "TALOS_CLI_ROOT=%~dp0.."
"%TALOS_CLI_ROOT%\runtime\node.exe" "%TALOS_CLI_ROOT%\app\dist\main.js" %*
exit /b %ERRORLEVEL%
