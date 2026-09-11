@echo off
setlocal
node "%~dp0verifica.mjs" --root "%CD%" %*
exit /b %ERRORLEVEL%
