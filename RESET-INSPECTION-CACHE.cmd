@echo off
setlocal
echo Removing only the TALOS CLI inspection bootstrap cache...
rmdir /s /q "%LOCALAPPDATA%\TALOS-CLI\inspection-bootstrap" 2>nul
del /q "%~dp0app\.talos-inspection-*" 2>nul
del /q "%~dp0app\vendor\harness-ui\.talos-inspection-*" 2>nul
del /q "%~dp0app\vendor\context-engine\.talos-inspection-*" 2>nul
echo Done. Product user data was not removed.
pause
