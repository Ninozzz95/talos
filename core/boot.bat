@echo off
setlocal
set "CORE_DIR=%~dp0"
set "PHP_BIN=%CORE_DIR%..\.tools\bin\php.cmd"
if not exist "%PHP_BIN%" set "PHP_BIN=php"
"%PHP_BIN%" "%CORE_DIR%talos-boot-anim.php"
exit /b %ERRORLEVEL%
