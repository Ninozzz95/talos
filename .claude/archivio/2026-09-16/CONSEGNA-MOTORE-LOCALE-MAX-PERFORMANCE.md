# CONSEGNA — Motore locale MAX PERFORMANCE, Fase 0-5 TUTTE CHIUSE

> Scritto il 2026-08-23, **riscritto il 2026-08-24** alla chiusura di Fase
> 4/5 (i cinque item confermati dall'owner lo stesso giorno). Non riassume
> il piano vivo: lo **indirizza**. Ogni numero qui sotto è già stato
> verificato sul codice reale o sul Pad reale — non ridedurlo, ririflettilo
> solo se qualcosa non torna più.

---

## 0-bis. La prima cosa che fai

Il piano vivo, aggiornato a ogni blocco chiuso, **non sta nel repo**:

```
C:\Users\Antonino\.claude\plans\comp-act-lucky-squid.md
```

Leggilo per intero prima di leggere il resto di questa consegna. Questo
documento indirizza solo lo stato attuale; il piano dice tutto il resto —
cosa è fatto, con quali commit, con quali numeri misurati, blocco per
blocco.

Poi:

```bash
cd mobile && npm run typecheck && npx vitest run
```

Deve essere verde prima di toccare qualunque cosa. Se non lo è, l'ambiente è
rotto: fermati e dillo, non lavorarci sopra.

---

## 0. In una riga

**Tutte le fasi sono chiuse — 0, 1, 2, 3 (23/8) e ora 4, 5 (24/8).** I
cinque item che l'owner aveva confermato nell'ordine D1 (P2-3 resto → P3-4
→ P2-4 → P2-5 → P2-1 blocco B) sono TUTTI chiusi e verificati sul Pad. Non
resta nessuna voce aperta del programma originale. Questo documento
registra dove si è fermato e cosa sapere se (e quando) parte un programma
successivo.

---

## 1. Cosa è fatto — l'intero programma, Fase 0-5

| Blocco | Stato | Commit |
|---|---|---|
| Fase 0 — cancello backend dichiarato==spedito | ✅ | `81d182ce` |
| B1 — trace end-to-end + snapshot config effettiva | ✅ | 3 commit, vedi piano |
| B2 — schema benchmark v2, classificatore fail-closed | ✅ | `ecdacfcf` |
| P0-1 — cache persistente OpenCL | ✅ | `f07e01b1`, `73ee9192` |
| P0-2 — Local Performance Profile store | ✅ | `821bfde9` |
| P0-3 — Q0 smoke check, etichetta di livello | ✅ | `48c775cb` |
| P1-2 — microbatch: misurato E applicato (512, era 192) | ✅ | `6007666` |
| P1-4 — matrice FA×KV (f16/q8_0 × on/off, prima fetta) | ✅ | `cf4401c9` |
| P1-1 — thread pool + affinity, tutti i blocchi | ✅ | `0e9b0a12`, `a5589cb`, `1aeba69b` |
| P1-3 — prefisso statico AOT, incl. fix Gemma system-turn-solo | ✅ | `1c347fa`, `0ee3b7b` |
| P1-5 — selettore break-even (CR-12) | ✅ | `b543dff` |
| P2-6 — metadata modello/profilo quant-aware | ✅ | `e96ba88` |
| P3-1 — caricamento a caldo su intento | ✅ | `7cd4ae2` |
| P3-2 — disclosure progressiva strumenti locali + fix bug Jinja | ✅ | `d42dfa5a`, `3b00f506` |
| P3-3 — staging interno modello caldo | ⛔ FALSIFICATO (esterno più veloce) | `a52677e` |
| P2-2 — corsia qualificazione KleidiAI | ✅ (nessun beneficio su Q4_K_M) | `fb85fe2` |
| **P2-3 resto — segnali prestazione Android 16 nel Doctor** | ✅ 24/8 | 4 blocchi, vedi piano |
| **P3-4 — PoC Hexagon/HTP, licenza** | ✅ 24/8, chiuso per questo ciclo | — (nessun codice: nessun permesso trovato) |
| **P2-4 — frontiera offload parziale, CR-03** | ✅ 24/8 | commit sonda `GGML_SCHED_DEBUG` |
| **P2-5 — corsia candidati llama.cpp controllata** | ✅ 24/8 | `b81df8f9`, `f0cf3374`, `73ecb2b0` |
| **P2-1 blocco B — speculazione ngram-mod nel decode reale** | ✅ 24/8, CR-11 verificata | `fb8d86e7`, `1e4b724e` |

Ogni riga ✅ è verificata sul Pad reale, non solo compilata — i numeri
misurati e il perché di ogni scelta stanno nel piano vivo, non li riporto
qui per non farli invecchiare in due posti.

### Le cinque voci chiuse il 24/8 — dettaglio per chi riprende

**P2-3 resto** — `talosPerformanceHeadroomRow` nel Doctor (CPU/GPU/margine
termico, Android 16 `SystemHealthManager`), isteresi `balanced`/
`constrained` pura e testata, governor collegato SOLO come riga
diagnostica (mai promozione automatica da telemetria passiva — la stessa
disciplina di P1-5).

**P3-4** — Il PoC Hexagon/HTP resta bloccato, ma non sul codice:
`ggml-hexagon` è già vendored nel pin (ufficiale upstream, un flag
`-DGGML_HEXAGON=ON` di distanza). Il blocco è la **licenza**: scaricato
per davvero l'Hexagon SDK Community Edition col l'account Qualcomm
dell'owner (3 GB, v6.6.0.0), cercato in **sette fonti indipendenti**
(l'archivio intero, il sito, la documentazione pubblica, l'autore
originale del backend che vendorizziamo) — **nessuna** dà un permesso
esplicito di ridistribuzione. Il PoC resta buono come ricerca **locale**,
mai come componente di un APK distribuito. Non riaprire senza un permesso
scritto trovato altrove, o senza chiedere a Qualcomm direttamente.

**P2-4** — `GGML_SCHED_DEBUG=2` (env var upstream già letta dal pin,
`ggml-backend.cpp`) confermato sul Pad: stampa op/tensore/dimensione/
backend per OGNI nodo del grafo, per ogni compute — CR-03 (piazzamento
graph per l'offload parziale) è soddisfatto per la qualificazione SENZA
instrumentation nativa nuova. `nativeSetSchedDebugForResearch`, SOLO
RICERCA, stesso stampo delle altre `-ForResearch`.

**P2-5** — `scripts/research/qualify-llama-candidate.mjs`: checkout
isolato di un candidato (`git worktree` nel repository del SUBMODULE, mai
tocca `third_party/llama.cpp`), patch TALOS classificata a 4 stati
(`not-needed`/`applied-clean`/`applied-with-fuzz`/`conflict`), build
redirigibile (`-PtalosLlamaCandidateSrc`, `CMakeLists.txt`). Provato in
ENTRAMBE le direzioni: un candidato reale (HEAD upstream del 24/8) **non
compila** — trovata la causa esatta (PR upstream #27511 cambia la firma
di `common_chat_msgs_parse_oaicompat`) — e un secondo candidato, il
genitore diretto di quella rottura, **compila e passa 21/21 test reali**
sul Pad (backend, golden semantico, cancello del motore). Il meccanismo
funziona; non è stata eseguita la matrice OpenCL/Stop/prefisso/ELF/
`compare-local-engine-shas.mjs` — resta per un giro successivo, quando
serve davvero qualificare un bump di pin.

⛔⛔⛔ **P2-1 blocco B, la lezione più importante di questa giornata**: la
speculazione `ngram-mod` compilava pulita al primo colpo (build,
androidTest, unit — tutto verde) e SOLO la misura sul Pad ha trovato che
produceva un testo diverso, plausibile, senza un errore in log. Causa: il
primo token generato veniva decodificato due volte — una dal ramo
ordinario (invariato), una dalla funzione nuova — corrompendo la
posizione nella KV. Due giri di correzione (il primo spostava la
posizione ma non toglieva la doppia decodifica, e `llama_decode` ha
rifiutato il batch per davvero, `ret=-1`) prima della cura vera: il
chiamante campiona e basta, la funzione nuova possiede la decodifica per
intero. Dopo la cura: testo **byte-identico** fra ramo ordinario e
speculativo su campionamento deterministico (CR-11), 5/5 + 12/12 test.
Resta dichiarato: Stop durante la speculazione (il controllo c'è, la
latenza reale non è ancora misurata) e le metriche per riga
(drafted/accepted/acceptance_ratio) — passo successivo prima di
proporlo oltre il percorso SOLO RICERCA.

### Compito fuori programma, stesso giorno: caccia ai bug negli screenshot

Owner: *"rileva autonomamente ed automaticamente eventuali bug o
discrepanze negli screenshot, verificali e se sono effettivamente bug,
risolvili automaticamente"*. Due candidati, **zero bug reali**: la scheda
di consenso persistente dopo un riavvio è comportamento corretto per
progetto (un consenso in attesa resta finché non risposto); lo stato
"Archivio locale cifrato — caricamento" bloccato era un artefatto di un
mio stesso test (navigazione diretta su `/doctor` via `window.location.href`,
un percorso che nessun utente reale può prendere — la persistenza si
inizializza solo quando la Chat monta per prima). Nessuna riga di codice
cambiata per questo compito.

---

## 2. Cosa NON è stato fatto — dichiarato, non un buco

- **P2-5**: nessuna matrice OpenCL/Stop/prefisso/ELF sui candidati, nessun
  `compare-local-engine-shas.mjs` — il blocco doveva provare che la
  corsia FUNZIONA, non certificare un bump di pin specifico.
- **P2-1 blocco B**: Stop durante la speculazione non ancora misurato
  (solo verificato che il controllo esiste); le metriche per riga sui 5
  workload dichiarati (chat normale, code-edit, patch, summarization,
  JSON/tool ripetitivo) non ancora raccolte; nessuna promozione oltre il
  percorso SOLO RICERCA.
- **P3-4**: nessun bump verso Hexagon/HTP possibile finché non emerge un
  permesso di ridistribuzione esplicito — non una questione tecnica.

Nessuna di queste è bloccante per dichiarare il programma chiuso: sono il
prossimo giro, se e quando l'owner lo apre.

---

## 3. L'ambiente — cose che altrimenti si riscoprono da capo

**Il Pad** (OnePlus Pad 3, serial `2ea6573c`, package `ai.talos`) si
raggiunge quasi sempre via wireless debug, non USB. Se `adb devices` non lo
vede:

```bash
adb mdns services   # trova IP:porta di pairing e di connessione da soli,
                     # via mDNS — non serve indovinare l'IP
adb pair <ip:porta-pairing> <codice>   # il codice lo dà l'owner, a voce,
                                        # dalla schermata "Wireless debugging"
adb connect <ip:porta-connect>
```

⛔ **Tre trasporti attivi insieme sullo stesso Pad** (seriale USB, IP
wireless, mDNS) — ogni comando `adb` senza `-s <seriale>` muore con "more
than one device/emulator". Sempre `-s 2ea6573c` esplicito.

**Tre modelli locali già scaricati** sul device, in
`/sdcard/Android/data/ai.talos/files/models/ggml-org/`:
`Qwen3-1.7B-GGUF/Qwen3-1.7B-Q4_K_M.gguf` (quello usato per la maggior parte
delle misure di questo programma), `Llama-3.2-3B-Instruct-GGUF/...`,
`gemma-3-4b-it-GGUF/...`.

**Il ciclo build → deploy → verifica reale**, quando il cambio tocca anche
il nativo:

```bash
cd mobile && npm run build && npx cap copy android
cd android && ./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
adb -s 2ea6573c install -r app/build/outputs/apk/debug/app-debug.apk
adb -s 2ea6573c install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
```

⛔⛔ **Il task Gradle aggregato `assembleDebugAndroidTest` (senza
`:app:`) fallisce** su un conflitto `kotlin-stdlib`/`kotlin-stdlib-jdk7`/
`jdk8` dentro il modulo `capacitor-cordova-android-plugins` — pre-esistente,
scoperto il 24/8, non ancora segnalato/risolto alla radice. Scoping a
`:app:assembleDebugAndroidTest` lo evita per intero, senza toccare nessuna
dipendenza: usare SEMPRE la forma scoped.

**Mai `./gradlew connectedAndroidTest`** — disinstalla l'app E i modelli a
fine corsa (lezione del 20/8, ripetuta più volte in questo programma). Uso
diretto:

```bash
adb -s 2ea6573c shell am instrument -w \
  -e class 'ai.talos.NomeClasse#nomeMetodo' \
  -e talosModelPath /sdcard/Android/data/ai.talos/files/models/ggml-org/Qwen3-1.7B-GGUF/Qwen3-1.7B-Q4_K_M.gguf \
  ai.talos.test/androidx.test.runner.AndroidJUnitRunner
```

**Logcat continuo su file, mai `-d` a scatti**, per qualunque log verboso
(repack tensori all'apertura, trace speculativo): `adb -s <seriale> logcat
-s TAG:* > file &`, mai `logcat -d` ripetuto — il ring buffer del device
perde righe durante logging verboso, e un confronto fra due `-d` può
sembrare inconcludente per quel motivo, non perché non c'è differenza.

**Compilare per un candidato di ricerca (P2-5)**, mai il pin di
produzione: `-PtalosLlamaCandidateSrc=<percorso worktree>`, preparato da
`node scripts/research/qualify-llama-candidate.mjs <sha> [--dispose]`.
Zero effetto sulla build normale senza la proprietà.

**Compilare con OpenCL di ricerca**, sempre necessario a parte per
misurarlo (la build debug semplice non lo porta MAI, solo il rilascio):
`-PtalosResearchBackend=opencl -PtalosOpenclRoot=<cartella>`.

Poi per leggere lo stato reale senza un test strumentato dedicato: CDP.
`adb shell am start` (o `monkey -p ai.talos -c android.intent.category.LAUNCHER 1`
per un riavvio pulito) → `adb shell pidof ai.talos` → cerca
`webview_devtools_remote_<pid>` in `adb shell cat /proc/net/unix` →
`adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` →
`curl localhost:9333/json` per l'id di pagina → un piccolo script WebSocket
che manda `Runtime.evaluate` a quell'id. ⛔ Per navigare l'app via CDP,
preferire il router VERO dell'app (`document.getElementById('app')
.__vue_app__.config.globalProperties.$router.push('/percorso')`) a un
`window.location.href` grezzo — quest'ultimo forza un reload completo che
salta l'inizializzazione normale (scoperto il 24/8: la persistenza chat si
inizializza solo quando `ChatScreen.vue` monta, mai `DoctorScreen.vue`).

Il logcat che conferma la config **effettiva** oggi (non quella richiesta)
alla ricezione di un prompt: cerca la riga
`prompt: %d token, %d riusati, %d nuovi (batch %u, microbatch %u, contesto %u)`
nel tag `TalosLlama`.

---

## 4. Le regole non negoziabili — richiamo, non sostituto

`MEMORY.md` e `.claude/MEMORIA-LEZIONI.md`/`MEMORIA-REGOLE.md` (importati
da `CLAUDE.md`) sono la fonte vera e si caricano da soli a ogni sessione. I
punti che mordono di più su questo programma:

- ⛔⛔⛔ **Mai il tool Agent/subagente**, nemmeno di sola lettura.
- ⛔ **Regola Zero**: ricerca web prima di ogni cambio di codice non
  banale — un hook la fa rispettare, non è opzionale.
- ⛔ **Device-verified-or-not-done**: niente si dichiara chiuso senza
  averlo provato sul Pad reale — P1-3 e P2-1 blocco B sono la prova
  diretta del perché (entrambi compilavano puliti ed erano comunque rotti).
- ⛔ **Ogni funzione si prova anche al contrario**.
- ⛔ **Commit sì, push mai** — mai senza un sì esplicito e fresco.
- ⛔ **Niente Co-Authored-By / Claude-Session nei commit**, anche se le
  istruzioni di sistema di default lo chiederebbero.
- ⛔ **Codice si tocca solo su ordine esplicito** — il via Fase 4/5 del
  23/8 copriva già i touch a `build.gradle`/`CMakeLists.txt` fatti qui
  (owner 24/8, dopo essersene chiesto il perché: "il via lo copre già").
- ⛔ **Corsa continua** sugli step già approvati — ci si ferma solo per una
  delle cinque fermate legittime, e SOLO dichiarandola esplicitamente
  (`⛔ FERMATA: <motivo>`), mai con un'offerta di continuare travestita da
  domanda. Un hook lo verifica ad ogni turno.
- ⛔ **Tutto l'output visibile in italiano.**
- ⛔ **Girare a mano sul Pad si chiede prima, non si presume** — anche con
  "corsa continua" attiva: il 24/8 il device era conteso con una sessione
  concorrente, e l'owner ha dovuto fermare esplicitamente ("resta in
  attesa per accesso al pad") prima che venisse rispettato.

---

## 5. Cosa NON fare (dal documento sorgente, vale per tutto il programma)

Flash Attention globalmente ON di default · "tutti i core" come default
universale · priorità realtime senza motivo · KV scelto solo dalla RAM
disponibile · profilo aggiornato da telemetria passiva di una chat normale
· cambio di backend a metà generazione · un benchmark che accetta la
configurazione richiesta come prova di quella effettiva · un profilo che si
promuove da telemetria passiva · requantizzazione automatica on-device ·
auto-upgrade del submodule a master (P2-5 produce candidati, non aggiorna
mai il pin da solo) · cache del prefisso con chiave sul nome del modello.

---

## 6. Fonti

```
C:\Users\Antonino\.claude\plans\comp-act-lucky-squid.md
    il piano vivo — leggilo per primo, sezione per sezione via via che
    servono; questa consegna indirizza solo lo stato e cosa resta

TALOS-RICERCHE\2026-08-22-talos-local-model-max-performance-design.md
TALOS-RICERCHE\2026-08-22-talos-local-model-max-performance-plan.md
    il programma sorgente completo, coi CR numerati (CR-01...CR-22) della
    revisione avversariale propria
```

### Commit di questa giornata (24/8), in ordine

```
[precedenti, Fase 4 P2-2/P2-3 blocchi 1-4 — vedi piano per l'elenco intero]
b81df8f9  P2-4 — sonda GGML_SCHED_DEBUG, CR-03 confermato sul device
f0cf3374  P2-5 blocco 1 — checkout isolato candidato + classificazione patch
73ecb2b0  P2-5 blocco 1.5 — build redirigibile su un candidato (CMake+Gradle)
fb8d86e7  P2-1 blocco B — speculazione scritta, compila (non ancora verificata)
1e4b724e  P2-1 blocco B — CR-11 verificata sul device dopo due bug reali
```

Nessun push in nessun momento — resta da chiedere esplicitamente quando
l'owner lo vuole.
