@echo off
setlocal
node "%~dp0applica.mjs" --root "%CD%" %*
if errorlevel 1 pause
