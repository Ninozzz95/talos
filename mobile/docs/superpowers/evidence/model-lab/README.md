# Model Lab — protocollo evidenze fisiche tracciate

Stato: protocollo attivo dal 2026-08-04. Le directory di fase e i PNG vengono
creati soltanto durante l'implementazione dei rispettivi ledger.

## Regola bloccante dell'owner

Una fase Model Lab non è implementata finché la build corrente non è stata
provata visivamente sul dispositivo Android fisico collegato e gli screenshot
non sono stati ispezionati. Test unitari, Playwright, typecheck, build, DOM
probe, emulatore e screenshot desktop non sostituiscono questa prova.

Per questa tranche i PNG selezionati sono documentazione di accettazione e
devono restare sotto `mobile/docs/superpowers/evidence/model-lab/**`, non
ignorati da Git. Non autorizza il tracking indiscriminato del vecchio archivio
locale di catture.

## Stato formale

```text
PLANNED → RED PROVEN → GREEN AUTOMATED → GREEN UPSTREAM → GREEN DEVICE → IMPLEMENTED
```

Se il device manca, una fase può fermarsi a `GREEN UPSTREAM`. Non si scrive
“implementata”, “finita” o “funziona visivamente”.

## Dispositivo baseline, da riconfermare

Rilevato il 2026-08-04:

- seriale `3B1F6DE8WTX78PET`;
- OnePlus `PJZ110`;
- Android 16 / API 36;
- 1080×2376 pixel;
- density override 480 dpi;
- viewport atteso 360×792 CSS px, DPR 3.

Questi dati non si copiano automaticamente nei manifest futuri: si misurano di
nuovo.

Dal gate Fase 1 l'owner ha sostituito il telefono con un OnePlus OPD2415 fisico
(2400×3392, density 420 native). Sul tablet si prova sia la geometria nativa sia
il target telefono mediante override ADB temporaneo equivalente a 360×792 CSS.
Prima dell'override si registrano size/density; dopo ogni cattura si eseguono
`wm size reset` e `wm density reset` e si riconfermano i valori nativi. Una
cattura tablet senza questa prova non sostituisce il viewport telefono.

## Evidenze prescritte

```text
phase-1/
  storage-first.png
  memory-after-storage.png
  manifest.md
phase-2/
  hub-paper-light.png
  hub-terminal-dark.png
  hub-tablet-native.png
  providers-no-device-duplicate.png
  sidebar-without-model-lab.png
  settings-single-model-lab-entry.png
  manifest.md
phase-3/
  filters-combined-results.png
  filters-empty-provider-stable.png
  hugging-face-access-card.png
  manifest.md
phase-4/
  local-overview-360x792.png
  local-repo-detail-360x792.png
  catalog-initial-40.png
  catalog-after-more.png
  manifest.md
phase-5/
  hf-oauth-ready.png
  hf-oauth-connected.png
  hf-oauth-disconnected.png
  manifest.md
```

Nomi alternativi non soddisfano automaticamente il ledger: prima si emenda
ledger e indice, poi si cattura.

## Build fisica riproducibile

Da `mobile/`, dopo tutti i gate web:

```powershell
npm run build
npx.cmd cap sync android
Push-Location android
.\gradlew.bat testDebugUnitTest assembleDebug -PtalosSideBySide --no-daemon --console=plain
Pop-Location
```

`-PtalosSideBySide` installa `ai.talos.dev` e preserva l'app/dati dell'owner
firmati da un'altra debug key. Non disinstallare l'app principale per far posto
alla build di prova.

Subito dopo `cap sync`, controllare `git status --short`. Un file generato
tracciato e non previsto dal ledger richiede un emendamento prima di proseguire.

## Risoluzione ADB e installazione

ADB non è garantito nel `PATH`. Ricavarlo dall'SDK dichiarato in
`mobile/android/local.properties`; sul baseline era:

```powershell
$adb = 'C:\Users\Antonino\AppData\Local\Android\Sdk\platform-tools\adb.exe'
$apk = Resolve-Path 'android\app\build\outputs\apk\debug\app-debug.apk'
& $adb devices -l
& $adb shell wm size
& $adb shell wm density
& $adb shell getprop ro.product.manufacturer
& $adb shell getprop ro.product.model
& $adb shell getprop ro.build.version.release
& $adb shell getprop ro.build.version.sdk
Get-FileHash -Algorithm SHA256 $apk
& $adb install -r -g $apk
& $adb shell am force-stop ai.talos.dev
& $adb shell am start -W -n ai.talos.dev/ai.talos.MainActivity
```

Se il seriale non è unico, ogni comando successivo usa `-s <seriale>`. Lo
stato deve essere `device`, non `offline` o `unauthorized`.

## Navigazione e ispezione

Usare tocchi reali o il WebView DevTools/CDP già disponibile. La navigazione
programmatica è accettabile per raggiungere una fixture, ma la prova deve
includere anche l'interazione umana richiesta dal ledger (link, Back, filtro,
Mostra altri, login o disconnect).

Prima di catturare:

1. verificare route visibile e stato dati;
2. registrare tema, mode, density, radius, UI scale e reduced-motion;
3. controllare che nessun overlay, tastiera o toast nasconda il difetto;
4. ispezionare l'intero viewport per overflow, clipping, duplicati, contrasto,
   wrapping e target;
5. ripetere il gesto che il PNG dichiara di provare.

## Cattura PNG senza corrompere i byte

Percorso robusto: cattura sul device, pull, poi rimozione del solo file
temporaneo nominato.

```powershell
$remote = '/sdcard/talos-model-lab-capture.png'
$target = 'docs\superpowers\evidence\model-lab\phase-N\nome-prescritto.png'
& $adb shell screencap -p $remote
& $adb pull $remote $target
& $adb shell rm $remote
Get-FileHash -Algorithm SHA256 $target
```

Non ridimensionare, ricomprimere, annotare o ritoccare il PNG. Se contiene PII
o un segreto, non tracciarlo: correggere lo stato/UI, ripetere la cattura e
verificare il nuovo file. In particolare non catturare token, callback OAuth,
code, state, verifier, username o e-mail.

## Template obbligatorio `manifest.md`

Ogni directory di fase contiene un solo manifest con questa forma, compilata
senza placeholder prima della promozione:

```markdown
# Model Lab physical evidence — Phase N

- Phase status: GREEN DEVICE
- Git HEAD: <full 40-char SHA>
- Dirty paths included in APK: <exact newline-separated paths or "none">
- APK path: <absolute or repo-relative path>
- APK SHA-256: <64 lowercase hex>
- Build command: <exact command>
- Build timestamp UTC: <ISO-8601>
- Package/application ID: ai.talos.dev
- Device serial: <serial>
- Manufacturer/model: <value>
- Android/API: <value>
- Physical pixels: <width>x<height>
- Density: <physical and override>
- CSS viewport/DPR: <width>x<height> / <value>
- Theme preset/mode: <id> / <light|dark>
- Density/radius/UI scale: <values>
- Reduced motion: <on|off>
- Reviewer: <human or agent identifier>

## Scenario: <stable id>

- Route: <canonical route>
- Preconditions: <exact data/state>
- Interaction performed: <exact gesture>
- Expected visible result: <contract>
- Screenshot: <filename>
- Screenshot timestamp UTC: <ISO-8601>
- Screenshot SHA-256: <64 lowercase hex>
- Visual inspection: PASS
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none
```

Il manifest può avere più sezioni scenario. `Defects: none` è una conclusione,
non un default: se esiste un difetto, descriverlo, riportare la fase a RED e non
promuovere il ledger.

## Controlli di integrità

Da root:

```powershell
Get-ChildItem mobile/docs/superpowers/evidence/model-lab -Recurse -Filter *.png |
    Get-FileHash -Algorithm SHA256
git check-ignore -v mobile/docs/superpowers/evidence/model-lab/README.md
git status --short -- mobile/docs/superpowers/evidence/model-lab
git diff --check
```

`git check-ignore` deve restituire exit 1/senza output per ogni file di questa
tranche. Gli hash calcolati devono coincidere byte per byte con i manifest.

## Chiusura e handoff

Una fase viene promossa soltanto dopo:

1. screenshot presenti;
2. manifest completo;
3. ispezione visiva eseguita;
4. hash verificati;
5. file non ignorati;
6. difetti vuoti;
7. ledger e `PASSAGGIO-DI-CONSEGNE.md` aggiornati.

L'owner ha autorizzato un commit locale dopo ogni fase verde. Nessun commit
precede il gate fisico e nessun push remoto è autorizzato.

Alla fine della Fase 5, oltre all'APK sorgente registrata nel manifest, una
copia con nome univoco deve essere lasciata sul Desktop dell'owner. Il manifest
e il passaggio di consegne riportano percorso assoluto, byte, timestamp UTC e
SHA-256; una copia vecchia o non riconducibile al tree verde non soddisfa il
requisito.
