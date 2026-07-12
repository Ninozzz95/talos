@echo off
setlocal
set "TALOS_ROOT=%~dp0"
set "TALOS_SCRIPT=%TALOS_ROOT%talos"
set "GIT_BASH="

if exist "%ProgramFiles%\Git\bin\bash.exe" set "GIT_BASH=%ProgramFiles%\Git\bin\bash.exe"
if not defined GIT_BASH if exist "%LocalAppData%\Programs\Git\bin\bash.exe" set "GIT_BASH=%LocalAppData%\Programs\Git\bin\bash.exe"
if not defined GIT_BASH if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "GIT_BASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not defined GIT_BASH for /f "delims=" %%I in ('where git.exe 2^>nul') do call :resolve_git_bash "%%~fI"

if defined GIT_BASH goto launch

echo TALOS requires Git for Windows for its Bash launcher.
echo Install Git for Windows, then run: talos.cmd up
exit /b 1

:resolve_git_bash
if defined GIT_BASH exit /b 0
for %%D in ("%~1") do set "GIT_CMD_DIR=%%~dpD"
if exist "%GIT_CMD_DIR%..\bin\bash.exe" for %%B in ("%GIT_CMD_DIR%..\bin\bash.exe") do set "GIT_BASH=%%~fB"
exit /b 0

:launch
"%GIT_BASH%" "%TALOS_SCRIPT%" %*
exit /b %ERRORLEVEL%
