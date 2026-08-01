# Riprendere TALOS Mobile su un computer nuovo

**Scritto il 2026-08-01.** Comandi letterali, in ordine. Ogni passo finisce con
una **verifica**: se quella non dà il risultato scritto, fermati lì — non
proseguire sperando.

Tutti i comandi sono **PowerShell** (Windows). Dove serve `bash`, è detto.

Sostituisci ovunque `<UTENTE>` col nome utente del computer nuovo. Per saperlo:

```powershell
$env:USERNAME
```

---

# PARTE A — sul computer VECCHIO, prima di spegnerlo

## A1 · Verifica che tutto sia sul remoto

```powershell
cd C:\Users\ninox\Desktop\AVM-lanes\kimi
git status --short
git log --oneline "@{u}..HEAD"
```

**Verifica:** entrambi i comandi non devono stampare **niente**. Se stampano
qualcosa:

```powershell
git add -A
git commit -m "wip: prima del trasloco"
git push origin lane/talos-mobile
git log --oneline "@{u}..HEAD"     # ora deve essere vuoto
```

## A2 · Copia la memoria dell'assistente

Non è in git. Senza, di là si riparte senza le decisioni prese.

```powershell
$sorgente = "C:\Users\ninox\.claude\projects\C--Users-ninox-Desktop-AVM\memory"
$destinazione = "D:\talos-memory"      # <-- chiavetta, OneDrive, quello che vuoi

New-Item -ItemType Directory -Force -Path $destinazione | Out-Null
Copy-Item -Path "$sorgente\*" -Destination $destinazione -Recurse -Force
(Get-ChildItem $destinazione -Filter *.md).Count
```

**Verifica:** l'ultimo comando deve stampare **almeno 40**. Se stampa 0, il
percorso sorgente è sbagliato — controlla che esista con
`Test-Path $sorgente`.

---

# PARTE B — sul computer NUOVO

## B1 · Git

```powershell
winget install --id Git.Git -e --scope user
```

Chiudi e riapri PowerShell, poi:

```powershell
git --version
```

**Verifica:** stampa `git version 2.x`.

## B2 · Node 24

Il progetto **rifiuta** di installarsi con una versione diversa: c'è uno script
`preinstall` che controlla. Non è un fastidio, è voluto.

```powershell
winget install --id OpenJS.NodeJS -e --version 24.18.0 --scope user
```

Chiudi e riapri PowerShell, poi:

```powershell
node --version
npm --version
```

**Verifica:** deve stampare **esattamente** `v24.18.0` e `11.16.0` o superiore
entro i limiti (`node >=24.18.0 <25`, `npm >=11.16.0 <12`). Se node dice v22 o
v26, l'installazione è andata altrove: disinstalla e rifai.

## B3 · JDK 21 — per-utente, non di sistema

Serve **21**. Non 17: Capacitor 8 genera `VERSION_21` per l'app *e per tutti* i
moduli `@capacitor/*`, e col 17 le librerie falliscono con
`invalid source release: 21`.

```powershell
$jdkDir = "$env:LOCALAPPDATA\jdk21"
New-Item -ItemType Directory -Force -Path $jdkDir | Out-Null

$url = "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse"
$zip = "$env:TEMP\jdk21.zip"
Invoke-WebRequest -Uri $url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath $jdkDir -Force
Remove-Item $zip

Get-ChildItem $jdkDir
```

L'ultimo comando stampa il nome della cartella estratta, tipo `jdk-21.0.11+10`.
**Prendine nota** e usalo qui sotto:

```powershell
$env:JAVA_HOME = "$env:LOCALAPPDATA\jdk21\jdk-21.0.11+10"   # <-- il nome vero
& "$env:JAVA_HOME\bin\java.exe" -version
```

**Verifica:** stampa `openjdk version "21.x"`.

Per non rimetterlo a ogni finestra, salvalo per l'utente:

```powershell
[Environment]::SetEnvironmentVariable("JAVA_HOME", "$env:LOCALAPPDATA\jdk21\jdk-21.0.11+10", "User")
```

Poi **chiudi e riapri PowerShell** e verifica:

```powershell
$env:JAVA_HOME
```

## B4 · Android SDK — per-utente

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
New-Item -ItemType Directory -Force -Path "$sdk\cmdline-tools" | Out-Null

$url = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
$zip = "$env:TEMP\cmdline-tools.zip"
Invoke-WebRequest -Uri $url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath "$env:TEMP\cmdline" -Force
Move-Item "$env:TEMP\cmdline\cmdline-tools" "$sdk\cmdline-tools\latest"
Remove-Item $zip, "$env:TEMP\cmdline" -Recurse -Force

Test-Path "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"
```

**Verifica:** stampa `True`. Se `False`, l'archivio si è estratto con un livello
in più: guarda dentro `$env:TEMP\cmdline` e sposta la cartella giusta.

Ora i pacchetti. **Le versioni sono quelle esatte del computer vecchio:**

```powershell
$sdkmanager = "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"
& $sdkmanager --sdk_root="$sdk" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
& $sdkmanager --sdk_root="$sdk" --licenses
```

Al secondo comando rispondi `y` a ogni licenza.

```powershell
Get-ChildItem "$sdk\platforms"
Get-ChildItem "$sdk\build-tools"
```

**Verifica:** devono comparire `android-36` e `36.0.0`.

## B5 · Clonare il repository

```powershell
cd $env:USERPROFILE\Desktop
git clone https://github.com/Ninozzz95/agent-virtual-machine.git AVM
cd AVM
git checkout lane/talos-mobile
git log --oneline -1
```

**Verifica:** l'ultima riga deve essere il commit più recente del ramo. Se dice
`error: pathspec ... did not match`, il fetch non ha preso il ramo:

```powershell
git fetch origin
git checkout -b lane/talos-mobile origin/lane/talos-mobile
```

> Il ramo si chiamava `lane/kimi-mobile` fino al 2026-08-01 — dal nome
> dell'agente a cui la corsia era stata assegnata a luglio, non del prodotto.
> Rinominato in `lane/talos-mobile`; il vecchio non esiste più sul remoto.
>
> Sul computer vecchio il mobile viveva in un *worktree* separato
> (`AVM-lanes/kimi`) perché due agenti lavoravano insieme. **Sul nuovo non
> serve**: cloni e lavori diretto.

## B6 · Il file che non arriva col clone

`local.properties` è gitignored, quindi non c'è. Senza, Gradle non sa dove sia
l'SDK e fallisce al primo comando.

```powershell
cd $env:USERPROFILE\Desktop\AVM\mobile\android
$sdkPath = "$env:LOCALAPPDATA\Android\Sdk" -replace '\\', '/'
Set-Content -Path "local.properties" -Value "sdk.dir=$sdkPath" -Encoding ascii
Get-Content "local.properties"
```

**Verifica:** stampa `sdk.dir=C:/Users/<UTENTE>/AppData/Local/Android/Sdk` —
con le barre **in avanti**.

## B7 · Le dipendenze

```powershell
cd $env:USERPROFILE\Desktop\AVM\mobile
npm ci
```

`npm ci`, **non** `npm install`: il primo ricrea `node_modules` esattamente dal
lockfile, il secondo può aggiornarlo e ti ritrovi dipendenze diverse da quelle
su cui girano i gate.

**Verifica:** finisce senza errori. Se si ferma su
`TALOS_RUNTIME_UNSUPPORTED`, la versione di Node è sbagliata — torna a B2.

## B8 · Rimetti la memoria dell'assistente

Il percorso dipende da **dove hai clonato**: è il percorso del progetto con le
barre sostituite da trattini. Se hai clonato in `C:\Users\<UTENTE>\Desktop\AVM`,
lo slug è `C--Users-<UTENTE>-Desktop-AVM`.

```powershell
$slug = "C--Users-$env:USERNAME-Desktop-AVM"
$destinazione = "$env:USERPROFILE\.claude\projects\$slug\memory"
New-Item -ItemType Directory -Force -Path $destinazione | Out-Null

Copy-Item -Path "D:\talos-memory\*" -Destination $destinazione -Recurse -Force
(Get-ChildItem $destinazione -Filter *.md).Count
```

**Verifica:** stesso numero della copia in A2, almeno 40, e fra questi
`MEMORY.md`.

---

# PARTE C — verificare che tutto funzioni

Nell'ordine. **Se uno fallisce, fermati e risolvi prima di andare avanti.**

```powershell
cd $env:USERPROFILE\Desktop\AVM\mobile
npm run typecheck
```
**Verifica:** nessun errore, exit 0. (~40 secondi)

```powershell
npx vitest run
```
**Verifica:** circa **2973 passed**, 0 failed. (~3 minuti)

```powershell
npm run build
```
**Verifica:** stampa una riga JSON che finisce con `"ok":true`, e dentro
`initial_css_bytes` sotto 150000 e `initial_javascript_bytes` sotto 560000.

```powershell
cd android
.\gradlew.bat :app:testDebugUnitTest
```
**Verifica:** `BUILD SUCCESSFUL`. Circa 121 test Java. (~45 secondi la prima
volta è più lento: Gradle scarica se stesso)

```powershell
.\gradlew.bat assembleDebug
Get-Item "app\build\outputs\apk\debug\app-debug.apk" | Select-Object Length
```
**Verifica:** `BUILD SUCCESSFUL` e un file di circa **46 milioni** di byte.

Se arrivi qui senza errori, **il computer nuovo è operativo**.

---

# PARTE D — solo per la FASE SUCCESSIVA (non serve per ripartire)

La fase 1 è il **motore dei modelli locali**: llama.cpp compilato per Android.

## D1 · NDK

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="$sdk" "ndk;27.0.12077973"
Get-ChildItem "$sdk\ndk"
```
**Verifica:** compare la cartella della versione.

## D2 · Rust coi target Android

```powershell
winget install --id Rustlang.Rustup -e --scope user
```

Chiudi e riapri PowerShell, poi:

```powershell
rustup target add aarch64-linux-android
rustc --version
rustup target list --installed
```
**Verifica:** `rustc 1.x` e nella lista `aarch64-linux-android`.

## D3 · Il telefono

Serve per l'unica prova che non si può simulare: ammazzare il processo a metà
scaricamento e vedere se riprende dal checkpoint.

```powershell
$env:PATH += ";$env:LOCALAPPDATA\Android\Sdk\platform-tools"
adb devices
```
**Verifica:** il telefono compare in elenco come `device`. Se dice
`unauthorized`, sblocca il telefono e accetta il popup del debug USB. Se non
compare, attiva **Opzioni sviluppatore → Debug USB**.

---

# PARTE E — cose che fanno perdere un'ora

- **`npm ci`, mai `npm install`.**
- **`JAVA_HOME` non persiste** fra shell se non l'hai salvato con
  `SetEnvironmentVariable(..., "User")`. Dopo averlo salvato, **riapri**
  PowerShell.
- **`local.properties` va ricreato a mano**, non è nel repository.
- **Le barre in `local.properties` vanno in avanti** (`C:/Users/...`), non
  all'indietro.
- **PowerShell scrive UTF-8 col BOM** usando `Set-Content -Encoding utf8`, e
  `javac` lo rifiuta con `illegal character: '\ufeff'`. Per i file Java usa
  `[System.IO.File]::WriteAllText($percorso, $testo, (New-Object System.Text.UTF8Encoding $false))`.
- **Il catalogo firmato non è configurato**: `TALOS_CATALOGUE_SOURCE` è `null`
  finché non decidi l'URL che lo serve e la chiave che lo firma. Non è un
  guasto, è una decisione aperta.
- **Il primo `gradlew` è lento**: scarica la propria distribuzione. Non è
  bloccato.
