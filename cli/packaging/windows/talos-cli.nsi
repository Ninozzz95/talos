Unicode True
!include "FileFunc.nsh"
!include "WinMessages.nsh"

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!ifndef STAGE_DIR
  !define STAGE_DIR "stage"
!endif

Name "TALOS CLI"
OutFile "TALOS-CLI-Setup-${VERSION}.exe"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\TALOS CLI"

Section "Install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${STAGE_DIR}\*.*"
  nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\bin\path.ps1" add "$INSTDIR\bin"'
  Pop $0
  StrCmp $0 "0" +2 0
    Abort "Could not update the user PATH"
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  CreateShortCut "$SMPROGRAMS\TALOS CLI.lnk" "$INSTDIR\Start TALOS CLI.cmd"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\bin\path.ps1" remove "$INSTDIR\bin"'
  Pop $0
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000

  ${GetParameters} $0
  ${GetOptions} $0 "/PURGE_USER_DATA=" $1
  StrCmp $1 "1" 0 keep_user_data
    RMDir /r "$APPDATA\TALOS-CLI"
    RMDir /r "$LOCALAPPDATA\TALOS-CLI"
  keep_user_data:

  Delete "$SMPROGRAMS\TALOS CLI.lnk"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"
SectionEnd
