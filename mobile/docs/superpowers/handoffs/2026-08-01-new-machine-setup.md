# Riprendere TALOS Mobile su un computer nuovo

**Scritto il 2026-08-01.** Da eseguire nell'ordine. Ogni passo dice *perché*,
così se qualcosa non torna sai dove sei.

---

## 0 · Prima di spegnere il vecchio computer — DUE COSE

Se salti questo capitolo, sul computer nuovo non trovi il lavoro.

### 0.1 · I commit non sono sul remoto

Al momento della scrittura: **148 commit non spinti** sul ramo
`lane/kimi-mobile`, di cui 22 dell'ultima sessione (tutto Hugging Face, il
motore locale, il catalogo firmato, la schermata Locale).

```bash
cd C:/Users/ninox/Desktop/AVM-lanes/kimi
git status                      # deve essere pulito
git log --oneline @{u}..HEAD | wc -l    # quanti ne mancano al remoto
git push origin lane/kimi-mobile
```

Verifica che sia andata:

```bash
git log --oneline @{u}..HEAD | wc -l    # deve dire 0
```

### 0.2 · La memoria dell'assistente NON è nel repository

I file che tengono le decisioni prese — regole vincolanti, ordine delle fasi,
vincoli di prodotto — vivono qui:

```
C:/Users/ninox/.claude/projects/C--Users-ninox-Desktop-AVM/memory/
```

**Non viaggiano con `git clone`.** Su una macchina nuova una sessione nuova
parte senza sapere nulla di quello che avete deciso insieme.

Copia quella cartella su una chiavetta o sul cloud, e sul computer nuovo
rimettila nel percorso equivalente
(`C:/Users/<utente>/.claude/projects/<slug-del-progetto>/memory/`). Lo slug è il
percorso del progetto con le barre sostituite da trattini.

I documenti di progetto (spec, piani, questo file, il mockup di riferimento)
**sono** nel repository e arrivano col clone.

---

## 1 · Clonare

```bash
git clone https://github.com/Ninozzz95/agent-virtual-machine.git AVM
cd AVM
git checkout lane/kimi-mobile
```

> **Attenzione al worktree.** Sul vecchio computer il lavoro mobile vive in un
> *worktree* separato (`AVM-lanes/kimi`) mentre `AVM` è il ramo principale. Sul
> nuovo puoi semplicemente lavorare nel clone con `lane/kimi-mobile` sopra: il
> worktree era un espediente per far lavorare due agenti insieme, non un
> requisito. Se vuoi rifarlo:
> `git worktree add ../AVM-lanes/kimi lane/kimi-mobile`.

---

## 2 · Node e le dipendenze del web

Serve **Node 24** (il progetto blocca la versione e fallisce l'installazione se
non torna — è voluto).

```bash
node --version        # deve essere v24.x
cd mobile
npm ci                # NON `npm install`: `ci` rispetta il lockfile
```

`npm ci` cancella e ricrea `node_modules` dal lock. È la differenza fra "le
stesse dipendenze del vecchio computer" e "quelle di oggi".

---

## 3 · Java, per i test e la build Android

Serve **JDK 21**. Non 17: Capacitor 8 genera `VERSION_21` per l'app *e per tutti
i moduli* `@capacitor/*`, e con il 17 le librerie falliscono con
`invalid source release: 21`.

**Per-utente, mai di sistema** — la macchina è condivisa.

```powershell
# Temurin 21, estratto sotto il profilo utente. Sul vecchio computer stava in:
#   C:/Users/<utente>/AppData/Local/jdk21/jdk-21.0.11+10
$env:JAVA_HOME = "C:/Users/<utente>/AppData/Local/jdk21/jdk-21.0.11+10"
```

Ogni comando Gradle vuole `JAVA_HOME` impostato in quella shell.

---

## 4 · Android SDK

Serve per compilare l'APK, non per i test unitari.

- **cmdline-tools/latest**, **platform-tools**, **platforms;android-36**,
  **build-tools;36.0.0**
- Destinazione per-utente: `C:/Users/<utente>/AppData/Local/Android/Sdk`
- Poi crea `mobile/android/local.properties` (è gitignored, quindi non arriva
  col clone):

```properties
sdk.dir=C:/Users/<utente>/AppData/Local/Android/Sdk
```

Senza quel file Gradle non sa dove sia l'SDK e fallisce subito.

---

## 5 · Verificare che tutto sia a posto

Nell'ordine. Se uno fallisce, fermati lì.

```bash
cd mobile

npm run typecheck        # vue-tsc — deve uscire 0
npx vitest run           # ~2973 test, ~3 minuti
npm run build            # include i gate di peso: CSS 126k/150k, JS 558k/560k
```

```powershell
cd android
$env:JAVA_HOME = "C:/Users/<utente>/AppData/Local/jdk21/jdk-21.0.11+10"
./gradlew.bat :app:testDebugUnitTest     # ~121 test Java, ~45 secondi
./gradlew.bat assembleDebug              # l'APK
```

L'APK esce in `mobile/android/app/build/outputs/apk/debug/app-debug.apk`,
circa 44 MB.

---

## 6 · Quello che serve per la FASE SUCCESSIVA (non per ripartire)

La fase 1 della tabella di marcia è il **motore dei modelli locali**, e vuole
llama.cpp compilato per Android. Due cose che oggi non sono installate:

- **NDK Android** (via SDK Manager, `ndk;<versione>`)
- **Rust** (`rustup`, con i target Android)

**Per-utente**, come tutto il resto. Senza, del motore si può costruire solo la
metà che decide — arbitraggio dei backend, harness del benchmark, catalogo — che
è già fatta e provata sulla JVM.

E per verificare il download nativo serve **un telefono via USB con `adb`**: il
cablaggio del job è letto e non eseguito, e la prova che manca è ammazzare il
processo a metà scaricamento per vedere se riprende dal checkpoint.

---

## 7 · Cose che si dimenticano e fanno perdere un'ora

- **`npm ci`, non `npm install`.** Il secondo aggiorna il lockfile e ti ritrovi
  dipendenze diverse da quelle su cui girano i gate.
- **`JAVA_HOME` non persiste** fra una shell e l'altra: va rimesso, o messo
  nelle variabili d'ambiente dell'utente.
- **`local.properties` non è nel repository.** Va ricreato a mano.
- **PowerShell scrive UTF-8 con BOM** con `Set-Content -Encoding utf8`, e
  `javac` rifiuta il BOM con `illegal character: '\ufeff'`. Se capita, riscrivi
  il file con `System.Text.UTF8Encoding($false)`.
- **Il catalogo firmato non è configurato**: `TALOS_CATALOGUE_SOURCE` è `null`
  finché non si decidono l'URL che lo serve e la chiave che lo firma. Non è un
  guasto, è una decisione aperta.
