; F7-2 (owner 27/09/2026, «NSIS assistito + benvenuto in app», «Mostra l'AGPL con "Avanti"»): l'installer assistito di
; electron-builder 26.16.1 (templates/nsis/assistedInstaller.nsh) — benvenuto, licenza, installazione, fine con «Avvia
; TALOS». Le immagini (assets/installerSidebar.bmp, installerHeader.bmp) le genera scripts/genera-immagini-installer.mjs col
; font e il marchio della app; il testo della licenza scripts/genera-licenza-installer.mjs dal LICENSE del repository.
; Colori: frontend/src/styles/tokens.css (tema Calm scuro), gli stessi del fondo delle immagini.
!define MUI_BGCOLOR "1E1F22"
!define MUI_TEXTCOLOR "F3F1EC"
!define MUI_INSTFILESPAGE_COLORS "C08B3C 1E1F22"
!define MUI_INSTFILESPAGE_PROGRESSBAR "colored"

; La licenza: l'AGPL dà permessi, non è un contratto da accettare. Il pulsante è «Avanti», non «Accetto», e il testo in
; fondo lo dice (Modern UI 2, MUI_LICENSEPAGE_BUTTON / _TEXT_TOP / _TEXT_BOTTOM: definiti PRIMA della pagina, che electron-
; builder inserisce con la sua macro licensePage).
!define MUI_LICENSEPAGE_BUTTON "$(^NextBtn)"
!define MUI_LICENSEPAGE_TEXT_TOP "La licenza di TALOS: in testa un riassunto in italiano, sotto il testo che fa fede."
!define MUI_LICENSEPAGE_TEXT_BOTTOM "TALOS è software libero: questa licenza ti dà dei permessi e non ti chiede di accettare niente per usarlo. Premi Avanti per continuare."
!define MUI_FINISHPAGE_RUN_TEXT "Avvia TALOS"

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Installa TALOS"
  !define MUI_WELCOMEPAGE_TEXT "TALOS si installa solo per il tuo account: non servono permessi di amministratore, e ci vogliono pochi secondi.$\r$\n$\r$\nAl primo avvio ti accoglie la app stessa.$\r$\n$\r$\nPremi Avanti per continuare."
  !insertmacro MUI_PAGE_WELCOME
  ; La testata della pagina DOPO, cioè la licenza (electron-builder la inserisce subito dopo con licensePage): quella di
  ; serie dice «Accordo di licenza · Leggi le condizioni dell'accordo», ma l'AGPL non è un accordo da accettare (foto 28/09).
  !define MUI_PAGE_HEADER_TEXT "Licenza di TALOS"
  !define MUI_PAGE_HEADER_SUBTEXT "Software libero: che cosa puoi fare e che cosa ti chiede."
!macroend

; Solo per l'utente corrente, sempre (per-user installs): in modalità assistita electron-builder mostrerebbe la pagina «per
; me / per tutti» (multiUserUi.nsh, PAGE_INSTALL_MODE); il suo gancio customInstallMode la salta forzando l'utente corrente.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; Il titolo della pagina d'installazione (page-specific di Modern UI 2: va definito subito prima di MUI_PAGE_INSTFILES, ed è
; qui che assistedInstaller.nsh inserisce customPageAfterChangeDir).
!macro customPageAfterChangeDir
  !define MUI_PAGE_HEADER_TEXT "Installazione di TALOS"
  !define MUI_PAGE_HEADER_SUBTEXT "Prepariamo il tuo spazio di lavoro."
!macroend

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
 *
 * ⛔ F7-2 (27/09/2026): l'installer è ora ASSISTITO. Il punto 1 qui sopra descriveva il one-click: in modalità assistita
 * un.onInit non si mette in silenzioso da solo e il disinstallatore ha le sue pagine (benvenuto, avanzamento, fine). La
 * domanda resta un MessageBox in customUnInit, prima delle pagine, e la guardia sulla riga di comando (--updated, /S) resta
 * quella giusta per le stesse ragioni del punto 2.
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
      MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONQUESTION "Eliminare anche i dati utente e le chiavi provider?$\n$\nScegliendo «Sì» si cancellano le chiavi registrate dall'app nel Gestione credenziali di Windows e la cartella dati %APPDATA%\TALOS (sessioni, impostazioni), con la cache del browser interno in %LOCALAPPDATA%\TALOS.$\nLe librerie nei tuoi progetti non vengono mai toccate." IDYES pulisci_dati_si
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
    ; ⛔ Owner, 24/09/2026: la radice dei temporanei (%LOCALAPPDATA%\TALOS\cache\scratch, o quella scelta dal guscio)
    ; si toglie a OGNI disinstallazione, interattiva o /S, FUORI dalla scelta sui dati; non all'aggiornamento
    ; (--updated), che non è una disinstallazione. La toglie il guscio con Node e non RMDir /r: il myDelete di NSIS
    ; (Source/exehead/util.c) scende anche nelle giunzioni. Un fallimento qui non ferma la disinstallazione.
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --talos-pulizia-scratch' $R8
    ClearErrors
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
        ; Owner, 24/09/2026: la sessione di Chromium (cache, localStorage, cookie) vive ora in %LOCALAPPDATA%\TALOS\browser
        ; (desktop/profile.mjs): fa parte dei dati, quindi va via con il «Sì». Poi le cartelle sopra, SOLO se vuote.
        RMDir /r "$LOCALAPPDATA\${APP_FILENAME}\browser"
        RMDir "$LOCALAPPDATA\${APP_FILENAME}\cache"
        RMDir "$LOCALAPPDATA\${APP_FILENAME}"
      ${Else}
        MessageBox MB_OK|MB_ICONSTOP|MB_TOPMOST "La pulizia dei dati utente non è riuscita (codice $R9).$\n$\nI dati utente e le chiavi NON sono stati cancellati. Puoi ritentare la disinstallazione o rimuoverli a mano:$\n- Gestione credenziali di Windows: voci «talos-harness-provider-desktop» e «talos-harness-search-desktop»$\n- cartella %APPDATA%\TALOS"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
