@echo off
setlocal
set KADMOS_DIR=%~dp0
set PHP_BIN=%KADMOS_DIR%..\.tools\php\php.exe
if not exist "%PHP_BIN%" set PHP_BIN=php
"%PHP_BIN%" "%KADMOS_DIR%kadmos" %*
