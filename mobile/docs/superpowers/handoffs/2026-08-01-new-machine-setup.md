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

## B5 · Autenticarsi su GitHub

**Il repository è privato.** Senza credenziali GitHub risponde `Repository not
found` — un 404, non un "accesso negato", perché a un anonimo non rivela
nemmeno che il repository esiste. È l'errore più fuorviante di tutta questa
procedura: sembra un nome sbagliato e invece è l'autenticazione che manca.

```powershell
winget install --id GitHub.cli -e --scope user
```

Il pacchetto finisce in una cartella che non è nel PATH della finestra in
corso. Aggiungila, anche per le finestre future:

```powershell
$ghDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin"
$env:PATH = "$ghDir;$env:PATH"
$utente = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($utente -notlike "*$ghDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$ghDir;$utente", "User")
}
gh --version
```

**Verifica:** stampa `gh version 2.x`. Se dice che non riconosce il comando, la
cartella del pacchetto ha un altro nome: trovala con
`Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter gh.exe -Recurse`.

```powershell
gh auth login
```

Rispondi: **GitHub.com** → **HTTPS** → **Authenticate Git with your GitHub
credentials? Yes** → **Login with a web browser**. Quel «Yes» è il passaggio
che fa funzionare `git clone`: senza, `gh` è autenticato ma git no.

```powershell
gh auth status
```

**Verifica:** `Logged in to github.com account Ninozzz95`.

## B6 · Clonare il repository

Il progetto può stare dove vuoi. Scegli **una** cartella e incidila in una
variabile d'ambiente: tutti i passi successivi la useranno, così il percorso è
scritto una volta sola e non c'è nulla da adattare a mano.

```powershell
$radice = "$env:USERPROFILE\Desktop\projects"
New-Item -ItemType Directory -Force -Path $radice | Out-Null
cd $radice

git clone --recurse-submodules https://github.com/Ninozzz95/agent-virtual-machine.git AVM
cd AVM
git checkout lane/talos-mobile
# Il checkout del ramo può portare sottomoduli che il clone non conosceva.
git submodule update --init --depth 1

$env:TALOS_HOME = (Get-Location).Path
[Environment]::SetEnvironmentVariable("TALOS_HOME", $env:TALOS_HOME, "User")

git branch --show-current
git log --oneline -1
$env:TALOS_HOME
```

**Verifica:** `lane/talos-mobile`, l'ultimo commit del ramo, e il percorso del
progetto.

Poi verifica il **sottomodulo**, perché senza il motore locale non compila:

```powershell
Test-Path "$env:TALOS_HOME\mobile\third_party\llama.cpp\CMakeLists.txt"
git -C "$env:TALOS_HOME\mobile\third_party\llama.cpp" describe --tags
```

**Verifica:** `True` e `b10218`. Se il primo dà `False`, il clone non ha preso i
sottomoduli: rilancia `git submodule update --init --depth 1`. Sono ~157 MB. Se
manca, l'unico sintomo è un errore di CMake — che ora dice esattamente questo,
perché il `CMakeLists.txt` del motore lo controlla e lo scrive per nome.

Se il checkout del ramo dice `error: pathspec ... did not match`, il fetch non
ha preso il ramo:

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

## B7 · Il file che non arriva col clone

`local.properties` è gitignored, quindi non c'è. Senza, Gradle non sa dove sia
l'SDK e fallisce al primo comando.

```powershell
cd $env:TALOS_HOME\mobile\android
$sdkPath = "$env:LOCALAPPDATA\Android\Sdk" -replace '\\', '/'
Set-Content -Path "local.properties" -Value "sdk.dir=$sdkPath" -Encoding ascii
Get-Content "local.properties"
```

**Verifica:** stampa `sdk.dir=C:/Users/<UTENTE>/AppData/Local/Android/Sdk` —
con le barre **in avanti**.

## B8 · Le dipendenze — sono TRE installazioni, non una

```powershell
cd $env:TALOS_HOME\mobile
npm ci
```

`npm ci`, **non** `npm install`: il primo ricrea `node_modules` esattamente dal
lockfile, il secondo può aggiornarlo e ti ritrovi dipendenze diverse da quelle
su cui girano i gate.

**Verifica:** finisce senza errori. Se si ferma su
`TALOS_RUNTIME_UNSUPPORTED`, la versione di Node è sbagliata — torna a B2.

Poi le due **installazioni isolate**. Due strumenti hanno un `package.json`
proprio e un `node_modules` proprio, deliberatamente separati da quello
dell'app: il generatore delle risorse Android e il lanciatore di Git Bash. Le
loro dipendenze (`sharp`, `node-pty`) sono binari nativi che non devono finire
nel grafo dell'app, e i test lo verificano — pretendono di risolverli dalla
copia locale della corsia e non da una qualsiasi trovata altrove sul disco.

```powershell
cd $env:TALOS_HOME\mobile\tools\android-assets
npm ci

cd $env:TALOS_HOME\mobile\tools\git-bash-launcher
npm ci
```

**Verifica:**

```powershell
Test-Path "$env:TALOS_HOME\mobile\tools\android-assets\node_modules"
Test-Path "$env:TALOS_HOME\mobile\tools\git-bash-launcher\node_modules\node-pty"
```

Devono stampare **`True` entrambi**. Se li salti, la suite passa comunque per
il 99% e poi crolla con **34 fallimenti** che non nominano mai la causa vera:
`TOOLING_MISSING`, `isolated tooling node_modules not found` e
`Cannot find module 'node-pty'`. Sembrano trentaquattro guasti diversi; sono
due `npm ci` mancanti.

## B9 · Rimetti la memoria dell'assistente

Il percorso dipende da **dove hai clonato**: è il percorso del progetto con
`:` e `\` sostituiti da trattini. Non scriverlo a mano, ricavalo:

```powershell
$slug = $env:TALOS_HOME -replace '[:\\]', '-'
$slug
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
cd $env:TALOS_HOME\mobile
npm run typecheck
```
**Verifica:** nessun errore, exit 0. (~40 secondi)

```powershell
npm run build
```
**Verifica:** stampa una riga JSON che finisce con `"ok":true`, e dentro
`initial_css_bytes` sotto 150000 e `initial_javascript_bytes` sotto 560000.

**Ora Capacitor deve materializzare il progetto Android — e va fatto PRIMA dei
test, non dopo.**

```powershell
npx cap sync android
Test-Path "$env:TALOS_HOME\mobile\android\app\src\main\res\xml\config.xml"
```

**Verifica:** `True`.

Tre file di configurazione dentro `android/` li scrive Capacitor, non git:
`res/xml/config.xml`, `assets/capacitor.config.json`,
`assets/capacitor.plugins.json`. Sono nel `.gitignore` sotto
`# Generated Config files`, quindi un clone non li porta.

Il gate delle risorse Android non è una simulazione: copia **l'albero `res`
vero** in uno spazio usa-e-getta e ci fa girare sopra lo strumento di
produzione. Se `config.xml` non c'è, lo strumento conta 42 file dove ne
pretende 43 e si ferma con `on-disk set mismatch: missing=[xml/config.xml]`.
Cadono **24 test**: 23 di quel gate, più quello di Git Bash — che lancia lo
stesso strumento e aspetta un marcatore che non arriverà mai, quindi non manda
il Ctrl+C e fallisce su `sentCtrlC`. Sembrano due guasti diversi ed è lo
stesso file mancante.

```powershell
npx vitest run
```
**Verifica:** **2973 passed**, 0 failed. (~3 minuti)

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
**Verifica:** `BUILD SUCCESSFUL` e un file di circa **28 milioni** di byte.

> Il numero è cambiato due volte lo stesso giorno, e per ragioni opposte che
> vale la pena saper leggere. Era ~46 M sul computer vecchio e ~40 M al primo
> build qui. Poi il motore locale ha aggiunto `abiFilters 'arm64-v8a'`, che
> toglie dall'APK le copie delle librerie per gli altri ABI, e
> `useLegacyPackaging`, che le comprime invece di lasciarle distese. Il
> risultato è **più piccolo pur contenendo llama.cpp**: l'APK cala, l'ingombro
> *sul telefono* cresce, perché quelle librerie ora vengono estratte
> all'installazione.

Se arrivi qui senza errori, **il computer nuovo è operativo**.

---

# PARTE D — la catena nativa, per la FASE SUCCESSIVA

La fase 1 è il **motore dei modelli locali**: llama.cpp compilato per Android.

> **ESEGUITA il 2026-08-01** sul computer nuovo. D1, D1b e D2 sono fatti e
> **provati** (vedi D4). Resta aperto solo D3, che dipende da un cavo.
>
> Questa parte è stata **corretta mentre la eseguivo**: come era scritta prima
> mancava CMake, cioè lo strumento che compila llama.cpp. Con solo NDK e Rust
> non si costruisce niente.

## D1 · NDK

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="$sdk" "ndk;27.0.12077973"
Get-ChildItem "$sdk\ndk"
```
**Verifica:** compare `27.0.12077973`. Sono **2,2 GB** e qualche minuto di
scaricamento. Poi incidi il percorso, che è quello che ogni strumento cerca:

```powershell
$ndk = "$sdk\ndk\27.0.12077973"
[Environment]::SetEnvironmentVariable("ANDROID_NDK_HOME", $ndk, "User")
[Environment]::SetEnvironmentVariable("ANDROID_NDK_ROOT", $ndk, "User")
```

## D1b · CMake e Ninja — **il pezzo che mancava**

llama.cpp si costruisce con CMake, non con l'NDK da solo: l'NDK porta il
compilatore, CMake è chi lo comanda. Il pacchetto dell'SDK porta **CMake e
Ninja insieme**, dentro la cartella dell'SDK, quindi resta per-utente come
tutto il resto.

```powershell
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="$sdk" "cmake;3.31.6"
& "$sdk\cmake\3.31.6\bin\cmake.exe" --version
Test-Path "$sdk\cmake\3.31.6\bin\ninja.exe"
```
**Verifica:** `cmake version 3.31.6` e `True`.

**Perché la 3.31.6 e non la 4.x**, che pure c'è: llama.cpp dichiara
`cmake_minimum_required(VERSION 3.14...3.28)`, e CMake 4 ha tolto la
compatibilità con i progetti che chiedono meno della 3.5 — llama.cpp sta
al sicuro, le sue dipendenze di terze parti non è detto. La 3.31.6 è la più
recente delle 3.x: moderna e senza quella rottura.

## D2 · Rust coi target Android

**Non usare `winget install Rustlang.Rustup`** come diceva la versione
precedente di questa guida: su una macchina senza Visual Studio ti lascia con
un Rust che non riesce a legare niente.

Rust su Windows esiste in due sapori. Quello predefinito (**MSVC**) *pretende
Visual Studio installato* per il suo linker — installazione **di sistema, con
diritti da amministratore**, contro la regola «tutto solo per l'utente
corrente» su una macchina condivisa. Quello **GNU** si porta il linker dietro e
sta tutto in `%USERPROFILE%`. Per compilare verso Android non cambia nulla: il
linker vero lo mette comunque l'NDK.

```powershell
$init = "$env:TEMP\rustup-init.exe"
Invoke-WebRequest -Uri "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-gnu/rustup-init.exe" -OutFile $init
& $init -y --default-host x86_64-pc-windows-gnu --default-toolchain stable --profile minimal
```

Chiudi e riapri PowerShell, poi:

```powershell
rustup target add aarch64-linux-android
rustc --version
rustup show
```
**Verifica:** `rustc 1.x`, `Default host: x86_64-pc-windows-gnu`, e fra i
target installati `aarch64-linux-android`.

> **Limite dichiarato:** con l'host GNU «per l'uso di base non serve altro», ma
> i crate che pretendono un compilatore C *per il computer* (non per il
> telefono) vogliono MSYS2/MinGW. Per la fase 1 non serve — verso Android
> compila l'NDK. Se un giorno un crate si lamenta, è questo il motivo, non un
> guasto.
>
> C'è anche un difetto aperto di Rust su Windows verso Android
> (`rust-lang/rust#113711`, `--version-script` con le barre sbagliate). **Su
> questa macchina non si è presentato** — provato, vedi D4 — ma se ricompare,
> ha un nome.

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

> Sul computer **vecchio** `adb` non partiva affatto (`0xC0000135`, una DLL del
> runtime Visual C++ mancante). **Sul nuovo parte** — verificato 2026-08-01,
> `1.0.41 / 37.0.1`. Quel problema è morto col trasloco: manca solo il cavo.

## D4 · La prova che la catena lega davvero

Che i comandi rispondano non dimostra niente: dimostra che i file esistono.
L'unica prova è **produrre una libreria ARM64 e guardarci dentro**. Due catene
separate, perché sono davvero due — Rust usa il suo linker, CMake usa il
proprio — e la fase 1 le vuole entrambe.

Sonda Rust: un progetto minimo con `crate-type = ["cdylib"]` e una funzione
`extern "C"`, costruito così:

```powershell
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$env:ANDROID_NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin\aarch64-linux-android24-clang.cmd"
cargo build --release --target aarch64-linux-android
```

Sonda CMake: un `CMakeLists.txt` minimo con una `add_library(... SHARED ...)`,
configurato col file-attrezzo dell'NDK:

```powershell
& "$sdk\cmake\3.31.6\bin\cmake.exe" -S . -B build -G Ninja `
  -DCMAKE_TOOLCHAIN_FILE="$env:ANDROID_NDK_HOME\build\cmake\android.toolchain.cmake" `
  -DCMAKE_MAKE_PROGRAM="$sdk\cmake\3.31.6\bin\ninja.exe" `
  -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-24 -DCMAKE_BUILD_TYPE=Release
& "$sdk\cmake\3.31.6\bin\cmake.exe" --build build
```

**Verifica, per entrambi:** leggi i primi byte del `.so` prodotto. Il byte 4
dev'essere `2` (ELF a 64 bit) e i byte 18-19 devono valere `0xB7` — che è
`EM_AARCH64`, cioè *ARM a 64 bit*. Se lì trovi `0x3E` hai compilato per il PC
e non te ne saresti accorto in nessun altro modo.

**Esito 2026-08-01: entrambe passate.** Rust ha prodotto 446.496 byte di
ELF64/`EM_AARCH64`; CMake+NDK 6.544 byte, stessa architettura.

---

# PARTE E — cose che fanno perdere un'ora

- **`npm ci`, mai `npm install`.**
- **Le installazioni sono tre**, non una: l'app, `mobile/tools/android-assets`
  e `mobile/tools/git-bash-launcher`. Le ultime due sono isolate apposta e i
  loro `node_modules` sono ignorati da git, quindi un clone non le porta. Chi
  le salta vede 34 test rossi che sembrano un disastro e sono due comandi.
- **Il repository è privato**: `git clone` senza credenziali risponde
  `Repository not found`, che sembra un nome sbagliato e invece è
  autenticazione mancante. Vedi B5.
- **`npx cap sync android` va fatto prima dei test, non dopo.** Tre file di
  configurazione dentro `android/` li genera Capacitor e non stanno in git.
  Senza, 24 test cadono citando `missing=[xml/config.xml]` e un `sentCtrlC`
  che non c'entra nulla.
- **Il numero di build dei `cmdline-tools` in B4 invecchia.** Google ruota
  l'archivio e il vecchio link comincia a dare 404. Se succede, prendi il link
  corrente da <https://developer.android.com/studio#command-line-tools-only>:
  cambia solo il numero nel nome del file.
- **`JAVA_HOME` non persiste** fra shell se non l'hai salvato con
  `SetEnvironmentVariable(..., "User")`. Dopo averlo salvato, **riapri**
  PowerShell.
- **`local.properties` va ricreato a mano**, non è nel repository.
- **Le barre in `local.properties` vanno in avanti** (`C:/Users/...`), non
  all'indietro.
- **PowerShell scrive UTF-8 col BOM** usando `Set-Content -Encoding utf8`, e
  `javac` lo rifiuta con `illegal character: '\ufeff'`. Per i file Java usa
  `[System.IO.File]::WriteAllText($percorso, $testo, (New-Object System.Text.UTF8Encoding $false))`.
- **`git clone` senza `--recurse-submodules` non porta llama.cpp.** Il motore
  locale è un sottomodulo pinnato (`mobile/third_party/llama.cpp`, tag
  `b10218`), e senza di lui la parte nativa non compila. È la quarta cosa che
  non arriva col clone, dopo `local.properties`, i due `node_modules` isolati e
  i file generati da Capacitor.
- **L'APK ha ora un ABI solo (`arm64-v8a`).** Da quando c'è codice nativo, quel
  filtro decide su quali telefoni l'app si installa: i 32 bit restano fuori.
  Scelta presa, non subita — ma è una scelta.
- **La Parte D senza CMake non serve a niente.** L'NDK porta il compilatore, ma
  chi lo comanda per llama.cpp è CMake, e col pacchetto dell'SDK arriva anche
  Ninja. Era il buco della prima stesura di questa guida.
- **Rust: mai la versione MSVC su una macchina senza Visual Studio.** Si
  installa, risponde `rustc --version`, e poi non lega niente perché il linker
  è dentro Visual Studio. Host GNU, e sta tutto in `%USERPROFILE%`.
- **"Il comando risponde" non è una verifica.** Per la catena nativa l'unica
  prova è il byte 18 del `.so`: `0xB7` = ARM64, `0x3E` = hai compilato per il
  PC. Vedi D4.
- **Il catalogo firmato non è configurato**: `TALOS_CATALOGUE_SOURCE` è `null`
  finché non decidi l'URL che lo serve e la chiave che lo firma. Non è un
  guasto, è una decisione aperta.
- **Il primo `gradlew` è lento**: scarica la propria distribuzione. Non è
  bloccato.
