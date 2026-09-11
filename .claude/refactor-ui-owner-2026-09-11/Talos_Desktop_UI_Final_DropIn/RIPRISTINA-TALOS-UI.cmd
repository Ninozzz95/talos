@echo off
setlocal
node "%~dp0ripristina.mjs" --root "%CD%" %*
if errorlevel 1 pause
