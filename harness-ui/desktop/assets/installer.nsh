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
