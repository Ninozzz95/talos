@echo off
setlocal

set TALOS_DIR=%~dp0
set PHP_BIN=%TALOS_DIR%..\.tools\php\php.exe

if not exist "%PHP_BIN%" (
    set PHP_BIN=php
)

"%PHP_BIN%" "%TALOS_DIR%talos" %*
