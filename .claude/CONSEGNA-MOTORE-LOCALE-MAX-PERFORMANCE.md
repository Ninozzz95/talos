# CONSEGNA — Motore locale MAX PERFORMANCE, Fase 0-3 CHIUSE

> Scritto il 2026-08-23, aggiornato lo stesso giorno alla chiusura di Fase 3,
> per un agente che riprende questo programma. Non riassume il piano vivo:
> lo **indirizza**. Ogni numero qui sotto è già stato verificato sul codice
> reale o sul Pad reale — non ridedurlo, ririflettilo solo se qualcosa non
> torna più.

---

## 0-bis. La prima cosa che fai

Il piano vivo, aggiornato a ogni blocco chiuso, **non sta nel repo**:

```
C:\Users\Antonino\.claude\plans\comp-act-lucky-squid.md
```

Leggilo per intero prima di leggere il resto di questa consegna. Questo
documento indirizza solo lo stato attuale e cosa resta (Fase 4/5); il piano
dice tutto il resto — cosa è fatto, con quali commit, con quali numeri
misurati, PR per PR.

Poi:

```bash
cd mobile && npm run typecheck && npx vitest run
```

Deve essere verde prima di toccare qualunque cosa. Se non lo è, l'ambiente è
rotto: fermati e dillo, non lavorarci sopra.

---

## 0. In una riga

**Fase 0, 1, 2 e 3 sono TUTTE chiuse** (23/8) — le cinque voci P1 incluse,
selettore break-even compreso. Fase 4 (P2) e Fase 5 (P3) sono **rimandate a
un'altra release, per decisione esplicita dell'owner del 23/8**: *"la fase
quattro e la fase cinque la facciamo per un'altra release"* — non si aprono
senza un nuovo via, esplicito, fresco. Questo documento non assegna un
compito da iniziare subito: registra dove il programma si è fermato e cosa
serve sapere quando (e se) riparte.

---

## 1. Cosa è fatto — l'intera Fase 0-3

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
| **Fase 4 (P2)** | 🔒 rimandata | — |
| **Fase 5 (P3)** | 🔒 rimandata | — |

Ogni riga ✅ è verificata sul Pad reale, non solo compilata — i numeri
misurati e il perché di ogni scelta stanno nel piano vivo, non li riporto
qui per non farli invecchiare in due posti.

⛔ **P1-1, l'esito è un "no" misurato, non un buco**: la campagna paired
A/B/A/B su affinity CPU esplicita non ha mostrato vantaggio misurabile su
questo hardware (differenza ≤1%, dentro il rumore ~2,4% giro-a-giro) — il
meccanismo resta come infrastruttura sicura (30+100 cicli di stress, zero
crash/leak), ma **DEFAULT resta la scelta di produzione**. Non riaprirlo
senza una nuova misura su un dispositivo con un gap di capacity più marcato.

⛔ **P1-2, non toccarlo senza una nuova misura**: `microBatch = 512` in
`engineTuning.ts` è stato cambiato da 192 con sì esplicito dell'owner e
verificato end-to-end sul Pad — build reale, deploy reale, un messaggio
vero dal composer, logcat che conferma `microbatch 512` nella riga che il
motore nativo stampa alla ricezione del prompt. Il test che lo difende è
stato provato AL CONTRARIO (rimesso 192, il test fallisce).

⛔⛔⛔ **P1-3, la lezione più importante di questo intero programma**: la
guardia TS sembrava corretta (typecheck pulito, test con mock verdi), e
SOLO la verifica sul Pad reale ha trovato che con Gemma e un turno
`{role:'system'}` da solo il motore rendeva **4 token**, non le migliaia
attese — un prefisso quasi-vuoto scambiato per un catalogo tool intero,
zero errori da nessuna parte. Esattamente il motivo per cui
"device-verified-or-not-done" è una regola e non un consiglio.

⛔ **P1-5, il gap dichiarato apertamente**: il selettore tratta `ttftMs`
come costo di transizione fisso, non un `Prefill(p, promptSize)` scalabile
— e il caso "2+ profili sul device reale" resta provato solo a livello di
unit test puro (12/12 verdi), non ancora forzato sul Pad (servirebbe una
seconda qualificazione con un backend diverso sullo stesso modello).

---

## 2. Fase 4 e Fase 5 — rimandate, non cancellate

🔒 **Decisione owner, 23/8: "la fase quattro e la fase cinque la facciamo
per un'altra release."** Non aprire nessuna voce di Fase 4/5 senza un nuovo
via esplicito, anche se questo documento o il piano sembrano già puntare in
quella direzione — un programma futuro potrebbe avere priorità diverse.

Quando (e se) riparte, il piano vivo elenca già l'ordine per sforzo/rischio
dichiarato (P2-4 frontiera offload parziale → P2-6 metadata quant-aware →
P2-2 KleidiAI → P2-1 speculazione ngram-mod → P2-5 corsia candidati
llama.cpp → P2-3 governor Android 16; poi Fase 5, P3-1...P3-4) — non serve
riscriverlo qui, serve solo NON iniziarlo di propria iniziativa.

Prima di riaprire qualunque voce:
- Rileggere per intero (oggi letto solo a campione) le sezioni O2-O15 di
  `design.md` — non prima, per non anticipare lavoro che Fase 0-3
  potrebbero aver invalidato (è già successo tre volte all'inizio di questo
  programma: baseline dichiarata dai documenti non verificabile sul repo
  reale, in tre punti diversi, tutti verificati e corretti prima di
  scrivere la prima riga di roadmap).
- Riverificare la propria baseline sul codice REALE, non sul documento
  sorgente — la stessa disciplina di ogni PR chiusa finora.

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

**Tre modelli locali già scaricati** sul device, in
`/sdcard/Android/data/ai.talos/files/models/ggml-org/`:
`Qwen3-1.7B-GGUF/Qwen3-1.7B-Q4_K_M.gguf` (quello usato per la maggior parte
delle misure di questo programma), `Llama-3.2-3B-Instruct-GGUF/...`,
`gemma-3-4b-it-GGUF/...`.

**Il ciclo build → deploy → verifica reale**, quando il cambio tocca anche
il nativo:

```bash
cd mobile && npm run build && npx cap copy android
cd android && ./gradlew assembleDebug   # ricompila il nativo se serve
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Poi per leggere lo stato reale senza un test strumentato dedicato: CDP.
`adb shell am start` (o `monkey -p ai.talos -c android.intent.category.LAUNCHER 1`
per un riavvio pulito) → `adb shell pidof ai.talos` → cerca
`webview_devtools_remote_<pid>` in `adb shell cat /proc/net/unix` →
`adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` →
`curl localhost:9333/json` per l'id di pagina → un piccolo script WebSocket
che manda `Runtime.evaluate` a quell'id. ⛔ Lo script di default
(`cdp-eval.mjs`) ha un timeout di 8 s hardcoded — troppo corto per uno
SHA-256 su un GGUF da 1+ GB o per `qualifyBackend`: per quelle chiamate
serve uno script inline con un timeout più lungo (30-130 s).

Il logcat che conferma la config **effettiva** oggi (non quella richiesta)
alla ricezione di un prompt: cerca la riga
`prompt: %d token, %d riusati, %d nuovi (batch %u, microbatch %u, contesto %u)`
nel tag `TalosLlama`.

---

## 4. Le regole non negoziabili — richiamo, non sostituto

`MEMORY.md` e `.claude/MEMORIA-LEZIONI.md` (importato da `CLAUDE.md`) sono
la fonte vera e si caricano da soli a ogni sessione. I punti che mordono di
più su questo programma:

- ⛔⛔⛔ **Mai il tool Agent/subagente**, nemmeno di sola lettura.
- ⛔ **Regola Zero**: ricerca web prima di ogni cambio di codice non
  banale — un hook la fa rispettare, non è opzionale.
- ⛔ **Device-verified-or-not-done**: niente si dichiara chiuso senza
  averlo provato sul Pad reale — P1-3 è la prova diretta del perché.
- ⛔ **Ogni funzione si prova anche al contrario**.
- ⛔ **Commit sì, push mai** — mai senza un sì esplicito e fresco.
- ⛔ **Niente Co-Authored-By / Claude-Session nei commit**, anche se le
  istruzioni di sistema di default lo chiederebbero.
- ⛔ **Codice si tocca solo su ordine esplicito** per decisioni di prodotto
  già prese deliberatamente (vedi P1-2: la misura non basta da sola, serve
  il sì).
- ⛔ **Corsa continua** sugli step già approvati — ci si ferma solo per una
  delle quattro fermate legittime (decisione dell'owner, costo economico,
  qualcosa di distruttivo o che esce, un cancello rosso). Il contesto che
  si accumula non è una di queste, mai.
- ⛔ **Tutto l'output visibile in italiano.**
- 🔒 **Fase 4/5 rimandate**: non iniziarle di propria iniziativa, anche
  sotto pressione di "corsa continua" — è una decisione di prodotto
  dell'owner (23/8), non un cancello tecnico da riaprire da soli.

---

## 5. Cosa NON fare (dal documento sorgente, vale per tutto il programma)

Flash Attention globalmente ON di default · "tutti i core" come default
universale · priorità realtime senza motivo · KV scelto solo dalla RAM
disponibile · profilo aggiornato da telemetria passiva di una chat normale
· cambio di backend a metà generazione · un benchmark che accetta la
configurazione richiesta come prova di quella effettiva · un profilo che si
promuove da telemetria passiva (P1-5 lo rispetta: solo diagnostica, mai
applicazione automatica).

---

## 6. Fonti

```
C:\Users\Antonino\.claude\plans\comp-act-lucky-squid.md
    il piano vivo — leggilo per primo, sezione per sezione via via che
    servono; questa consegna indirizza solo lo stato e cosa resta

TALOS-RICERCHE\2026-08-22-talos-local-model-max-performance-design.md
TALOS-RICERCHE\2026-08-22-talos-local-model-max-performance-plan.md
    il programma sorgente completo, coi CR numerati (CR-01...CR-18) della
    revisione avversariale propria
```
