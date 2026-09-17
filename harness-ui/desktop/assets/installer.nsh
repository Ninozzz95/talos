; Personalizzazione minima sullo script oneClick upstream, senza pagine aggiuntive.
; Il marchio Calm viene fornito con installerHeaderIcon e installerIcon.
; Valori esistenti in frontend/src/styles/tokens.css (tema Calm scuro).
!define MUI_BGCOLOR "1E1F22"
!define MUI_TEXTCOLOR "F3F1EC"
!define MUI_INSTFILESPAGE_COLORS "C08B3C 1E1F22"
!define MUI_INSTFILESPAGE_PROGRESSBAR "colored"
!define MUI_PAGE_HEADER_TEXT "TALOS"
!define MUI_PAGE_HEADER_SUBTEXT "Prepariamo il tuo spazio di lavoro."
!macro customHeader
  BrandingText "TALOS"
!macroend

!macro customInit
  ; L'installazione silenziosa mantiene il comportamento NSIS upstream.
  SetShellVarContext current
!macroend

/*
 * ⛔⛔ (16/09/2026) — LA DOMANDA ALLA DISINSTALLAZIONE: «eliminare anche i dati utente e le
 * chiavi provider?» DEFAULT: MANTENERE. Due fatti misurati sui template dell'electron-builder
 * 26.16.1 installato (desktop/node_modules/app-builder-lib/templates/nsis/) hanno deciso la forma:
 *
 * 1. UNA PAGINA nsDialogs NON È POSSIBILE: in one-click l'uninstaller si mette in silent DA SOLO
 *    dopo un solo MessageBox di conferma (uninstaller.nsh, un.onInit: MB_OKCANCEL + SetSilent
 *    silent) — le pagine custom non girano mai in silent (Manuale NSIS, cap. 4), quindi una
 *    UninstPage custom non comparirebbe MAI, nemmeno nell'interattiva. L'unica domanda possibile
 *    è un MessageBox in customUnInit.
 * 2. IL GUARD NON PUÒ ESSERE ${Silent}: all'altezza di customUnInit, che corre IN FONDO a
 *    un.onInit, SetSilent silent è già stato chiamato anche per l'utente interattivo — ${Silent}
 *    lì è sempre vero. Il segnale vero è la RIGA DI COMANDO ($CMDLINE): l'upgrade esegue il
 *    vecchio uninstaller con «/S --updated /KEEP_APP_DATA» (installUtil.nsh), l'utente che
 *    disinstalla a mano non passa nessuno dei due. Si chiede SOLO se entrambi assenti; per
 *    ribadire la scelta, customUnInstall la ricontrolla (cintura e bretelle).
 *
 * Il default resta «mantieni» in OGNI caso silenzioso: upgrade, CI (ci-smoke.ps1 disinstalla
 * con /S a ogni rilascio) e ogni invocazione /S manuale non vedono la domanda e non perdono dati.
 */
; ⛔ La Var vive SOLO nel compilato che la usa (16/09/2026, cura della release 0.1.12 bruciata).
; Le macro Un qui sotto si espandono SOLO nello stub disinstallatore: installer.nsi include
; uninstaller.nsh solo con BUILD_UNINSTALLER definito, e app-builder-lib 26.16.1 definisce quel
; simbolo per lo stub (NsisTarget.js:364) e lo cancella per il compilato principale (:390).
; Nel compilato principale la macro non si espande mai, quindi una Var globale sarebbe
; «dichiarata e mai usata»: makensis warning 6001, e l'electron-builder tratta OGNI warning
; makensis come errore — la build della 0.1.12 è morta proprio lì.
!ifdef BUILD_UNINSTALLER
Var PulisciDatiUtente
!endif

!macro customUnInit
  StrCpy $PulisciDatiUtente "0"
  ${GetParameters} $R0
  ${GetOptions} $R0 "--updated" $R1
  ${If} ${Errors}
    ${GetOptions} $R0 "/S" $R1
    ${If} ${Errors}
      MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONQUESTION "Eliminare anche i dati utente e le chiavi provider?$\n$\nScegliendo «Sì» si cancellano le chiavi registrate dall'app nel Gestione credenziali di Windows e la cartella dati %APPDATA%\TALOS (sessioni, impostazioni, cache).$\nLe librerie nei tuoi progetti non vengono mai toccate." IDYES pulisci_dati_si
      Goto pulisci_dati_fine
      pulisci_dati_si:
      StrCpy $PulisciDatiUtente "1"
      pulisci_dati_fine:
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  ; ⛔ Doppia guardia anti-upgrade (vedi il racconto sopra): solo una disinstallazione INTERATTIVA
  ; con risposta «Sì» arriva alla pulizia. customUnInstall corre PRIMA della cancellazione dei
  ; file (uninstaller.nsh, sezione un.Uninstall, verificato su 26.16.1): i file dell'app che la
  ; routine usa ($INSTDIR\resources\harness-ui\src\pulizia-dati.mjs) sono ancora al loro posto.
  ${GetParameters} $R0
  ${GetOptions} $R0 "--updated" $R1
  ${If} ${Errors}
    ${GetOptions} $R0 "/S" $R1
    ${If} ${Errors}
    ${AndIf} $PulisciDatiUtente == "1"
      ; La routine gira DENTRO l'eseguibile installato e porta via SOLO il namespace `-desktop`
      ; del portachiavi (le chiavi che l'app installata ha scritto). Il resto — %APPDATA%\TALOS —
      ; lo cancella QUI, solo se la routine esce 0: un fallimento onesto non si nasconde, si
      ; dice e i dati restano intatti (rimovibili a mano o ritentando la disinstallazione).
      ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --talos-pulizia-dati' $R9
      ${If} $R9 == 0
        ; Stessi tre bersagli del blocco delete-app-data di uninstaller.nsh (nome di
        ; installazione, nome di prodotto, nome di pacchetto): app.setName('TALOS') mette tutto
        ; in %APPDATA%\TALOS, ma coprire i tre nomi non costa niente e non lascia residui.
        RMDir /r "$APPDATA\${APP_FILENAME}"
        !ifdef APP_PRODUCT_FILENAME
          RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
        !endif
        RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
      ${Else}
        MessageBox MB_OK|MB_ICONSTOP|MB_TOPMOST "La pulizia dei dati utente non è riuscita (codice $R9).$\n$\nI dati utente e le chiavi NON sono stati cancellati. Puoi ritentare la disinstallazione o rimuoverli a mano:$\n- Gestione credenziali di Windows: voci «talos-harness-provider-desktop» e «talos-harness-search-desktop»$\n- cartella %APPDATA%\TALOS"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
