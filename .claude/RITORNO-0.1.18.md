# RITORNO — 0.1.18: la voce personale

> Scritto da questa sessione, aggiornato a fine di ogni blocco. **Fase 1
> chiusa** (§1-7 sotto). **Fase 2 chiusa** (§8, zero underrun reali).
> **Fase 3 chiusa** (§10 — cattura, qualità, codifica, profilo cifrato,
> orchestrazione, cancello di uscita provato sul dispositivo). Fase 4 (UI,
> con mockup esaustivo da owner-approvare prima) resta roadmap.

---

## Fase 1 — il nucleo di runtime, zero UI

---

## 1. I commit — e la prova misurata accanto a ognuno

Un commit solo, semi-atomico (nucleo + test + cancelli + prova sul
dispositivo), non ancora fatto: **vedi §5, resta da eseguire dopo questo
documento**. Questa tabella descrive cosa entra nel commit e cosa lo prova.

| cosa | prova misurata |
|---|---|
| `TalosSentencePieceModel.kt` (lettore protobuf a mano) | Parsing verificato — vedi §2: i 3 campi letti (pieces/normalizer_spec/i loro sotto-campi) hanno i numeri esatti confermati sul `.proto` sorgente di `google/sentencepiece`, non a memoria |
| `TalosVoiceTokenizer.kt` (BPE da zero) | **Sul dispositivo reale** (Pad, `2ea6573c`): `TalosVoiceTokenizerInstrumentedTest` — 2/2 verdi, corpus d'oro **194/194 casi, 0 disallineamenti**, contro il `tokenizer.model` vero (sha256 `c353ee14…0fdd`) |
| `TalosMossManifest.kt` (estratto dalla Fase 0) | `TalosMossManifestTest` — **6/6 verdi**, JVM, nessun dispositivo necessario |
| `TalosVoiceTokenizerAlgorithmTest.kt` (vocabolario sintetico, aggiunto dopo il primo resoconto — vedi §2-bis) | **6/6 verdi**, JVM, nessun dispositivo — merge a cascata per punteggio, byte-fallback e il suo contrario, simbolo utente-definito congelato, i tre flag del normalizzatore in entrambi i versi |
| `TalosMossRuntime.kt` (produttivizzato, §15.4) | **Sul dispositivo reale**: `TalosMossRuntimeInstrumentedTest.productionRuntimeMatchesPhase0EngineByteForByteOnTheSameInputs` — WAV **byte-identico** al motore di Fase 0 a parità di seme/voce/token, generati question dal tokenizer nuovo, non da ID finti |
| `TalosVoiceHost.kt` (§14, corsia a thread singolo) | Stesso test strumentato, più `cancelMidGenerationLeavesTheModelUsableForTheNextRequest`: cancella a metà, poi **riparla con successo** — le sessioni sopravvivono |
| `TalosVoiceModelManager.kt` (solo presenza) | Usato dal `assumeTrue` di entrambi i test strumentati — nessun download, nessuna scrittura |
| `tokenizer-golden-corpus.json` (194 casi) | Generato dal pacchetto Python `sentencepiece` reale (0.2.2) sul `tokenizer.model` vero pullato dal Pad — non inventato |

---

## 2. La decisione tecnica più grossa presa da sola, e perché

Il blueprint §9.2 elenca «un wrapper nativo SentencePiece pinnato» come prima
scelta. L'ho **verificata prima di seguirla**, per la regola «una ricerca web
a ogni dubbio»:

- Il CMake di `google/sentencepiece` (verificato sul sorgente, non a memoria)
  fa `FetchContent` di **protobuf v25.6 da GitHub** e compila `protoc` come
  strumento host — una build pesante, di rete, per un vocabolario di 16.384
  simboli.
- Ho decompilato il `precompiled_charsmap` VERO di questo `tokenizer.model`
  (237 KB, 224.725 regole) e confrontato ogni regola con NFKC Unicode
  standard: **224.681 identiche**, **44 eccezioni**, tutte caratteri di
  controllo/invisibili, zero eccezioni multi-codepoint.
- ⇒ Ho scritto un lettore protobuf a mano (~150 righe, solo i campi che
  servono, numeri di campo verificati sul `.proto` sorgente) più un
  tokenizzatore BPE **da zero in Kotlin puro** — normalizzazione = NFKC di
  `java.text.Normalizer` + patch di 44 eccezioni; merge BPE = coda a priorità
  per punteggio con lo stesso spareggio di `bpe_model.cc` (indice sinistro
  più grande). **Zero sottomoduli nuovi, zero JNI, zero CMake nuovo.**

**Come l'ho provato prima di fidarmene**: ho scritto lo stesso algoritmo in
Python (iterazione veloce), confrontato contro il pacchetto `sentencepiece`
reale su **199 casi** — 190 frasi italiane curate (numeri, valute, orari,
indirizzi, apostrofi) più casi avversari (token letterali `<|im_start|>`,
emoji, CJK, 500 caratteri ripetuti, byte di controllo, `▁`/BOM/replacement
char letterali) — **0 disallineamenti**, PRIMA di tradurlo in Kotlin. La
porta in Kotlin è poi stata riprovata sul dispositivo vero con lo stesso
corpus (194 casi, il sottoinsieme cucito nel JSON): **0/194**.

⛔ **NON VERIFICATO**: non ho provato empiricamente `SentencePiece4J`
(alternativa Java pura trovata via ctx7) — scartata su basi tecniche (esempi
solo BPE, 4 frammenti di codice, autore singolo, nessuna prova di parità con
`byte_fallback`), non per misura diretta. Se un giorno serve un secondo
parere, è lì.

---

## 2-bis. Le due lacune trovate rileggendo il piano — chiuse nello stesso turno

Un resoconto dopo il primo commit segnalava due punti del piano non
eseguiti. Lo stop hook ha correttamente rifiutato di lasciarli come «annotati
per dopo»: un difetto trovato dentro una fase si chiude nella fase, non si
rimanda. Eccoli chiusi, con la prova.

### La misura RTF NON aveva la banda termica accanto

Il piano (passo 10) chiedeva di far girare `.claude/strumenti/termica.mjs`
accanto a ogni misura di TTFA/RTF. Il primo giro non l'aveva fatto. Rifatto:
`termica.mjs` in background (40 s, campione ogni 500 ms) a cavallo di una
nuova corsa dello stesso test di parità byte-a-byte, poi correlati i
timestamp (logcat vs `ms` di termica, orologio host↔device allineato entro
pochi secondi).

```
finestra di sintesi: ~37.1–39.8 s nella registrazione termica (2.779 ms di calcolo)
GPU durante la sintesi: 39.3–40.1 °C (max) — banda FREDDA/inattiva
CPU durante la sintesi: 41.3–43.2 °C (max)
RTF di questa corsa: 0,526 (66 frame, 5.280 ms audio, 2.779 ms calcolo)
RTF della corsa precedente, stessa banda: 0,694
```

⭐ **Il motore Fase 1 è CPU, non GPU** — 4 thread ONNX Runtime, nessun uso di
`llama.cpp`/OpenCL. Le zone `gpuss-*` che l'oscillazione della 0.1.17 osserva
sotto carico LLM sono quindi **inattive** durante questa sintesi: il segnale
giusto qui sono le zone `cpuss-*`, non la GPU. Sull'intera finestra di 40 s
(che include l'installazione degli APK, non solo la sintesi) l'escursione
GPU è stata 15,0 °C (38,2→53,2 °C) — ma quel picco è **fuori** dalla finestra
di sintesi vera, che è rimasta fredda.

⛔ **Resta un limite dichiarato**: due campioni corti (2,8 e 3,7 secondi di
calcolo), non un sostenuto di dieci minuti. Il piano originale già
riconosceva che il cancello «RTF sostenuto» del blueprint §38.2 appartiene di
diritto alla Fase 2 (streaming vero) — qui ha senso etichettare CIÒ CHE SI
MISURA, non simulare un sostenuto che questa fase non produce.

### Zero test JVM puntavano l'algoritmo del tokenizzatore in isolamento

`TalosVoiceTokenizerInstrumentedTest` prova la parità sul modello vero — ma
il testo italiano reale non forza quasi mai i rami meno comuni
dell'algoritmo (byte-fallback, un simbolo utente-definito congelato, un
flag del normalizzatore davvero spento). Aggiunto
`TalosVoiceTokenizerAlgorithmTest.kt`: un vocabolario sintetico minuscolo,
costruito a mano in bytes protobuf veri (un piccolo encoder, lo specchio del
lettore — schema del varint/fixed32 riverificato su protobuf.dev prima di
scriverlo), che punta ogni ramo uno per uno. **6/6 verdi, JVM, senza
dispositivo.**

⭐ **Il primo giro di questi test ha trovato un difetto vero — nel test, non
nel tokenizzatore**: due dei sei costruivano un vocabolario con «hello» e
«world» come pezzi interi ma senza la catena di merge intermedia fino ai
caratteri singoli — irraggiungibile per un vero BPE, che può solo unire
coppie adiacenti un passo alla volta. Il tokenizzatore ha rifiutato
correttamente (`IllegalArgumentException` dal controllo di byte-fallback),
non ha indovinato un risultato plausibile ma sbagliato. Corretto usando
vocabolari a carattere singolo per quei due casi, dove l'unica cosa sotto
esame è il normalizzatore, non il merge.

---

## 3. Cosa NON ho fatto, dichiarato per nome

- **Fasi 2, 3, 4 del blueprint** — streaming vero (`TalosPcmPlayer`,
  `AudioTrack`, cancel/flush/add), arruolamento personale (microfono,
  cifratura del profilo), UI e instradatore. Restano roadmap, come deciso
  dall'owner il 21/8 per l'intera 0.1.18.
- **`TalosVoiceBackend.kt`, `TalosVoiceComputeGovernor.kt`,
  `TalosVoicePerf.kt`, `TalosVoiceFailureRegistry.kt`,
  `TalosNeuralVoicePlugin.kt`** — nel piano dei file del blueprint §4.3, ma
  senza un chiamante finché non esistono il router (Fase 4) e lo streaming
  (Fase 2). Costruirli ora sarebbe la trappola di casa scritta due volte nel
  ticket: dichiarati, testati, mai chiamati in produzione.
- **RTF sostenuto su 10 minuti.** Ho due campioni corti, ora entrambi
  etichettati con la loro banda termica (§2-bis): RTF 0,694 e RTF 0,526,
  entrambi in banda fredda/inattiva, 4 thread CPU. Sotto la soglia del
  blueprint §38.2 (< 1,0) ma **due campioni, non un sostenuto** — quel
  cancello appartiene di diritto alla Fase 2 (streaming vero), dove la
  sintesi dura abbastanza da avere senso farci girare
  `.claude/strumenti/termica.mjs` per l'intera durata, non solo a cavallo.
- **Quattro viewport / screenshot** — questo blocco è zero UI per
  definizione di Fase 1: non c'è schermo da fotografare. La regola torna
  vincolante dal blocco della Fase 4.
- **Nessuna riga toccata fuori da `mobile/android` e i due file JSON**:
  `speech.ts`, `useTalosSpeech.ts`, `settings.ts`, l'i18n, la UI delle
  impostazioni voce — tutti intatti, invariante §2 non attraversato perché
  non esiste ancora un router che li chiami.

---

## 4. Verificato sul dispositivo — cosa, e con quale corsa

Dispositivo di riferimento: **OnePlus Pad 3**, `OPD2415`, seriale `2ea6573c`.
⛔ Ogni corsa strumentata è passata da
`mobile/scripts/research/run-device-tests.mjs` (installa con `-r`, mai
disinstalla) — **mai** `connectedDebugAndroidTest`, per
`connectedandroidtest-disinstalla-e-porta-via-i-modelli`. Confermato dopo
ogni corsa: i 4 GGUF di produzione e i modelli MOSS erano ancora al loro
posto.

```
TalosVoiceTokenizerInstrumentedTest        2/2 verdi   (194/194 corpus d'oro, 0 disallineamenti)
TalosMossRuntimeInstrumentedTest           3/3 verdi   (byte-identico a Fase 0; semi diversi ⇒ audio diverso; cancel ⇒ modello ancora vivo)
  └ ripetuto isolato con termica.mjs       1/1 verde   (RTF 0,526, banda fredda — §2-bis)
TalosMossManifestTest (JVM, no device)     6/6 verdi
TalosVoiceTokenizerAlgorithmTest (JVM)     6/6 verdi   (vocabolario sintetico — §2-bis)
```

## 5. I cancelli di casa

```
npm run typecheck        → pulito
npx vitest run            → 647 file, 5.900 test verdi, 10 saltati (invariato)
npm run build              → ok:true, 609.251/610.000 byte iniziali JS — zero TS toccato
cd android && ./gradlew :app:lintDebug   → nessun rilievo nuovo (19 errori/98 avvisi preesistenti, da baseline)
```

---

## 6. Decisioni che restano all'owner (Fase 1)

Nessuna decisione bloccante. Tutte le scelte tecniche di questo blocco (§2)
sono ricadute su di me e sono documentate qui.

---

## 7. Chiusura Fase 1

Due commit fatti su `lane/voce-personale` (non pushati): il nucleo, poi la
chiusura dei due punti del piano rimasti indietro. L'owner ha dato il via
alla Fase 2 il 21/8, con una domanda esplicita (procedere o fermarsi) —
risposta: procedere.

---

## 8. Fase 2 — streaming vero (in corso)

Blueprint §39 Fase 2: decodificatore incrementale, `TalosPcmPlayer`, evento
di drain completo di `AudioTrack`, semantica cancel/flush/add, **nessun PCM
attraverso JS**.

### 8.1 `TalosMossCodecStream` — il decodificatore incrementale del codec

Porta `CodecStreamingDecodeSession` (upstream `ort_cpu_runtime.py`) in
Kotlin — **non indovinato dai nomi del grafo ONNX**, letto dal sorgente vero
dopo che un maintainer (`alpacaking`, issue #53 di
`OpenMOSS/MOSS-TTS-Nano`) ha indicato `app_onnx.py` come l'unico streaming
reale: la modalità "streaming" di default di `onnx_tts_runtime.py` **non è
streaming vero**, l'ha detto lui stesso.

Tre dettagli che una lettura delle sole forme dei tensori non avrebbe dato:
- `cached_positions` si inizializza a **-1**, non a zero;
- lo stato si aggiorna **per nome**, dagli output `_out_` ai prossimi input;
- la politica di quanti frame raggruppare per chiamata è **adattiva sul
  ritardo di riproduzione** (1→2→4→8 frame), non fissa.

⭐ **Provato sul dispositivo reale**: stessi token audio, stesso seme, decodifica
completa (`decode_full`, Fase 1) contro decodifica incrementale a un frame
alla volta (`decode_step`, questa). **rms 1,8×10⁻⁵, differenza massima
5,5×10⁻⁵ su 245.760 campioni** — sotto un singolo passo di quantizzazione
PCM16 (3,05×10⁻⁵). Stesso numero esatto di campioni su entrambi i lati: zero
deriva di lunghezza. `TalosMossCodecStreamInstrumentedTest` — **1/1 verde**,
soglia dell'asserzione presa dalla misura reale, non inventata prima.

### 8.2 `TalosPcmPlayer` — `AudioTrack` di produzione, e DUE difetti veri trovati prima del telefono di qualcuno

Attributi audio identici a `TalosSpeechPlugin` (`USAGE_ASSISTANCE_ACCESSIBILITY`
+ `CONTENT_TYPE_SPEECH`) per lo stesso motivo dell'owner: si sente anche col
telefono silenzioso.

**Difetto 1 — `flush()` lasciava la traccia MUTA per sempre.** La prima
stesura chiudeva un `flush()` con `pause()+flush()+stop()`, seguendo
`stop()` un passo oltre quello che la sua stessa documentazione AOSP
raccomanda ("For an immediate stop, use pause(), followed by flush()" — SENZA
`stop()`). Dopo `stop()`, riprendere richiede un nuovo `play()` esplicito, e
`write()` da solo non lo fa: la prossima frase sarebbe stata scritta nel
buffer e mai suonata, in silenzio, per sempre, senza nessun errore da nessuna
parte. Trovato leggendo il sorgente AOSP di `AudioTrack.java` **prima** che
girasse su un telefono, non dopo un rapporto di un utente.

**Difetto 2 — un buffer troppo grande impediva alla posizione di riproduzione
di aggiornarsi, su QUESTO dispositivo.** Misurato: un buffer a `minBufferBytes
× 3` lascia un'utterance corta (300 ms) stare tutta dentro senza mai forzare
una `write()` a bloccarsi in attesa di spazio — e su questo HAL,
`getPlaybackHeadPosition()` **e** `getTimestamp()` restano bloccati a zero
per sempre se quel blocco non avviene mai. Isolato con tre sonde a
confronto (stesso clip, buffer 3× vs 1×): col buffer al minimo la stessa
utterance drena fino in fondo (`14400/14400`) prima ancora della fase di
polling. Corretto: `bufferBytes = minBufferBytes`, non `×3` — coerente anche
col blueprint §16.2 (la scorta va gestita a livello di applicazione, non
con un cuscinetto grande a basso livello).

⭐ **Provato sul dispositivo reale**, tre test, tutti scrivono a piccoli
blocchi (come farà sempre lo streaming reale, non come le prime sonde a
scrittura unica che hanno innescato il difetto 2):
`TalosPcmPlayerInstrumentedTest` — **3/3 verdi**: scrittura e drenaggio
completo; `flush()` a metà riproduzione lascia la traccia pronta e la prova
suonando davvero la frase successiva (non solo "nessuna eccezione"); `close()`
rilascia per davvero.

### 8.3 Cancelli, dopo Fase 2 fin qui

```
./gradlew :app:testDebugUnitTest   → tutto verde (manifest 7/7 — 2 nuovi casi per streaming_decode; tokenizer sintetico 6/6)
./gradlew :app:lintDebug           → nessun rilievo nuovo
npx vitest run                     → 5.900/5.900 verdi, 10 saltati (invariato)
```

### 8.4 Il cablaggio — `TalosVoiceHost.submitSpeakStreaming`

§16.1 end to end: `TalosMossRuntime.generateAudioTokens` (il ciclo TTS, con
un `onFrame` per ogni frame generato) alimenta un accumulatore, che
`TalosMossCodecStream` decodifica a blocchi secondo §16.2 (1→2→4→8 frame),
e ogni blocco decodificato va subito a `TalosPcmPlayer.write()`. La scorta
è misurata **davvero** — frame scritti meno frame suonati, letti da
`TalosPcmPlayer`, non il surrogato a orologio di `ort_cpu_runtime.py` (quel
surrogato esiste solo perché il riferimento Python non ha un dispositivo
audio vero; qui c'è).

`cancel()` ora fa due cose: invalida la generazione (come in Fase 1) **e**
silenzia quello che sta suonando ORA (§23.2), chiamando `player.flush()`
**dal thread chiamante**, non in coda sulla corsia del proprietario — la
corsia è occupata proprio dalla generazione lunga, e mettere in coda lì
lascerebbe il flush aspettare la frase intera. `AudioTrack.pause/flush/play`
sono documentati come sicuri da un thread diverso da quello che sta scrivendo.

⭐ **Provato sul dispositivo reale, capo a fondo**:
`TalosVoiceHostStreamingInstrumentedTest` — **2/2 verdi**.

```
TTFA (a caldo, dopo l'apertura delle sessioni)   353-355 ms   (< 500 ms del blueprint §38.2)
cancel a metà streaming, a caldo                 49-60 ms     (< 150 ms p95 del blueprint §23.4)
underrun                                          0
drenaggio finale                                  completo entro il limite
```

⛔ **Un allarme falso, preso e chiuso nello stesso turno**: il primo giro di
`cancelMidStreamStopsPlaybackNotJustGeneration` misurava **6.574 ms** per
annullare — sembrava un difetto grave nella cancellazione. Il log a
orologio di parete ha mostrato che non lo era: quella era la PRIMA chiamata
di un `TalosVoiceHost` nuovo, e la corsia del proprietario era ancora dentro
`TalosMossRuntime.open()` (cinque sessioni ONNX da disco, **6-7 secondi a
freddo** su questo dispositivo) per tutta la finestra — nessun ciclo da
interrompere ancora. Corretto scaldando il host con un'frase corta PRIMA di
misurare la cancellazione, esattamente come «TTFA a caldo» non include il
caricamento del modello. Il numero vero, a caldo, è 49-60 ms.

### 8.5 Il micro-stutter — segnalato dall'owner, misurato, chiuso a zero

Dopo aver sentito la sintesi in streaming sul dispositivo vero, l'owner ha
segnalato micro-interruzioni udibili e ha chiesto una ricerca web su come si
ottimizza la qualità dell'audio in streaming prima di toccare altro.

**Ricerca**: la causa tipica in letteratura è una discontinuità PCM al
bordo dei blocchi (il decodificatore rende l'audio più silenzioso o
aggiunge silenzio ai bordi di ogni chiamata) — si cura con un crossfade
Hann. **Misurato prima di curare quello**: ho decodificato la stessa
sintesi a un frame alla volta e confrontato il salto campione-a-campione
**al bordo di ogni blocco** contro il salto **dentro** un blocco — rapporto
**0,82** (il bordo è più liscio, non più ruvido). Il PCM stesso è pulito,
niente click da bordo di blocco (`TalosMossCodecStreamStutterDiagnosticTest`).

**La causa vera, trovata con `AudioTrack.getUnderrunCount()`** (il segnale
diretto dell'hardware, non un'inferenza): **103 underrun reali** su
un'utterance di pochi secondi. Non un problema del dato audio: un deficit
di tempo reale **sostenuto**. Misurato con `TalosMossCodecStreamBatchSizeDiagnosticTest`:
il solo `decode_step` a un frame alla volta ha **RTF 0,939** — quasi tutto
il budget di tempo reale **prima** di sommare il costo della generazione
TTS (RTF ~0,53-0,69, misurato in Fase 1) che deve avvenire per ogni frame.
Sommati in serie, RTF combinato oltre 1,5: non jitter, un deficit che si
accumula per tutta la durata della frase. Un buffer più grande da solo non
basta — rimanda il primo underrun, non lo previene (103→91 underrun con un
buffer 4× più grande, quasi invariato).

**La cura, misurata a ogni passo**: la politica di scorta di
`resolveFrameBudget` non cresce più 1→2→4→8 secondo il ritardo misurato
(quella crescita non partiva mai, perché il ritardo non si accumulava mai
con un motore più lento del tempo reale) — resta a **1 frame solo per il
primo blocco** (per il TTFA), poi salta dritto a un **pavimento di 8**,
scelto perché a quella dimensione `decode_step` misura RTF 0,204, lasciando
margine reale sopra il costo della generazione TTS. Il buffer di
`TalosPcmPlayer` è salito da 1× a **8×** il minimo (~960 ms) per assorbire
il vuoto reale fra una consegna di 8 frame e la successiva — un pavimento
di 16 è stato provato e **peggiorava** (91→12 con buffer 4×; il blocco più
grande allarga il vuoto fra le scritture più di quanto un buffer moderato
riesca a coprire).

```
underrun reali (AudioTrack.getUnderrunCount), prima della cura     103, poi 91 con buffer 4×
underrun reali, batch=16 pavimento (buffer 4×)                      12  (PEGGIO — batch grande, vuoto grande)
underrun reali, batch=8 pavimento + buffer 8×                       0   (tre corse di seguito)
TTFA dopo la cura                                                   453-460 ms  (< 500 ms, margine reale)
cancel a metà streaming dopo la cura                                41 ms
```

Owner, dopo la cura: «adesso è migliorato molto» — confermato a orecchio,
non solo dalla misura.

⭐ **Provato sul dispositivo reale, capo a fondo, con la cura**:
`TalosVoiceHostStreamingInstrumentedTest` — **2/2 verdi**, tre corse
consecutive a zero underrun reali. I due test diagnostici
(`TalosMossCodecStreamBatchSizeDiagnosticTest`,
`TalosMossCodecStreamStutterDiagnosticTest`) sono rimasti nel repo come
guardie di regressione con un'asserzione, non solo come misura una tantum.

### 8.6 Cosa resta aperto in Fase 2

- §17.4 (recupero da traccia morta) implementato e cablato, ma **mai
  esercitato da un guasto vero** — solo dalla lettura del codice e da un
  test che forza il ramo d'errore in isolamento (`TalosPcmPlayerInstrumentedTest`
  non copre ancora il ramo "seconda scrittura fallisce anche dopo il
  ricreare" — solo la prima).
- Nessuna misura di TTFA sul **primo** utterance di un processo (a freddo,
  con caricamento sessioni incluso) — solo quello a caldo, per costruzione
  del blueprint §38.2.
- Il pavimento di 8 frame e il buffer 8× sono calibrati su **questo**
  dispositivo e su **questo** modello (MOSS-TTS-Nano-100M, pin corrente).
  Un modello diverso o un dispositivo più lento/più veloce potrebbe avere
  bisogno di numeri diversi — i due test diagnostici restano apposta per
  ricalibrare, non solo per confermare.
- `TalosMossRuntime`/`TalosVoiceHost` non riusano lo stesso `codecStream`
  fra utterance successive nello stesso host — ne aprono uno nuovo ogni
  volta (corretto per correttezza, dato che lo stato del codec è per-utterance,
  ma non misurato per il costo di apertura ripetuta).
- Zero underrun provato su un'utterance di pochi secondi, non sui dieci
  minuti che il blueprint §38.2 chiede — quel cancello resta aperto.

---

## 10. Fase 3 — arruolamento personale (in corso)

Blueprint §11-12: cattura del microfono con fedeltà, non con il
preprocessing del wake-word; cancello di qualità prima di codificare
qualunque cosa; §15.1 `codecEncodeSession`, solo per l'arruolamento.

### 10.1 `TalosVoiceRecorder` — il microfono, con l'arbitraggio obbligatorio

`talosVoiceEnrollmentAudioSource` (§11.3: `UNPROCESSED` solo se il
dispositivo lo dichiara davvero, mai per assunzione) + `AudioRecord.Builder`
con `setPrivacySensitive(true)` da API 30 (§11.4) + rilevamento di
`isClientSilenced()` da API 29 (§11.6, non da 26: **guardia di livello API
vera**, trovata da lint, non dimenticata — sotto 29 restano i cancelli di
§12.2 a valle, più tardi ma non assenti).

⭐⭐⭐ **Il cancello a zero tolleranza**: `TalosParola.cedi()`/`riprendi()`
avvolgono **l'intera** cattura in un `try/finally` — ogni percorso d'uscita,
compreso un errore di permesso scoperto **da lint** (`AudioRecord.Builder.build()`
senza controllo esplicito del permesso — corretto aggiungendo
`checkSelfPermission` prima, non sopprimendo l'avviso), restituisce il
microfono.

⭐ **Provato sul dispositivo reale**: `TalosVoiceRecorderInstrumentedTest` —
**3/3 verdi**. Campioni veri catturati dal microfono vero (non silenzio),
frequenza di campionamento verificata a runtime (§11.7, non assunta), e la
prova che conta per l'invariante: una cattura **annullata** si ferma entro
3 secondi **e lascia il microfono utilizzabile subito dopo** — non solo
`cancelled=true` una volta, il microfono davvero restituito.

### 10.2 `TalosVoiceQuality` — il cancello, matematica pura

I 12 parametri di §12.1 (durata, rapporto di parlato, picco, RMS in dBFS,
rapporto di clipping, offset DC, pavimento di rumore, SNR stimato, silenzio
più lungo, rapporto di frame a zero, letture perse, silenziamento
osservato) più i rigetti non negoziabili di §12.2 — silenziamento del
client, cattura vuota, durata sotto il minimo, segnale quasi-zero,
clipping grossolano, offset DC severo, silenzio eccessivo, conteggio di
frame corrotto.

⛔ **NON VERIFICATO, dichiarato per nome**: SNR e pavimento di rumore sono
**calcolati e restituiti**, ma **non** cancellano nulla — il blueprint
§12.2 stesso: «non inventare una soglia dB universale e spedirla senza
misura». Servono registrazioni vere per calibrarle.

⭐ **Provato — matematica pura, nessun dispositivo necessario**:
`TalosVoiceQualityTest` — **10/10 verdi** in JVM. Ogni rigetto provato nei
due versi: il segnale che deve farlo scattare, e un segnale altrettanto
imperfetto (letture perse ma con audio vero) che **non** deve farlo
scattare — la prova al contrario che il cancello non sia troppo aggressivo.

### 10.3 `TalosMossRuntime.encodeReferenceAudio` — il codec al contrario

Apre la sessione `codec_encode` (aggiunta a `TalosMossCodecMeta`/`open()`).
Conversione mono→stereo per **duplicazione**, non media (§11.8) — letta dal
riferimento reale (`ort_cpu_runtime.py`'s `_load_reference_audio`), stesso
schema (1, canali, campioni) della decodifica. `buildInputRows` non cerca
più una voce incorporata per nome soltanto: `generateAudioTokensWithReference`
accetta `prompt_audio_codes` **diretti**, la stessa forma che una voce
incorporata già usa — la porta che un profilo arruolato userà, già pronta.

⭐ **Provato sul dispositivo reale, capo a fondo**:
`TalosMossRuntimeEncodeReferenceInstrumentedTest` — **1/1 verde**. Decodifica
i codici di una voce incorporata in PCM vero (attraverso lo stream
incrementale già provato in Fase 2), li ri-codifica, e usa il risultato per
sintetizzare una frase nuova — **98 frame ri-codificati contro 98 originali**,
sintesi riuscita. Non prova la somiglianza vocale (serve un orecchio umano
e una voce vera), ma prova che il percorso non produce codici spazzatura.

### 10.4 `TalosVoiceProfileV1` — il profilo cifrato, storage compreso

`TalosVoiceProfileV1(header, qualityMetrics, promptAudioCodes)`, JSON dentro
la busta AEAD — non il layout binario a offset del diagramma del blueprint
§6.1: questo codice legge/scrive già ogni altra struttura come JSON, e il
diagramma nomina i campi, non i byte. `TalosVoiceProfileCipher` è una chiave
AES-256-GCM per profilo dentro Android Keystore (alias
`talos.voice.profile.v1.<uuid>`, nonce 96 bit casuale per scrittura via
`cipher.iv`) — esattamente il disegno di §7.2. `TalosVoiceProfileCompatibility`
implementa per davvero la "regola critica di compatibilità" di §6.1:
l'impronta è agganciata al **codec** (JSON dei metadati + i tre grafi ONNX
reali, con hash in streaming — i grafi del codec pesano da decine a
centinaia di MB) più il conteggio dei quantizzatori più una versione dello
schema-prompt che questo codice possiede — **mai** alla versione del
modello TTS. `TalosVoiceProfileStore` è
`filesDir/voice/profiles/<uuid>.tvp` — storage interno, già fuori dalla
superficie di `allowBackup=false`. Il salvataggio scrive un file
temporaneo, fa `fsync`, poi rinomina atomicamente sul percorso reale (§6.4):
un crash fra scrittura e rinomina non può mai lasciare un file a metà nel
punto che un caricamento successivo leggerebbe.

⭐ **Provato sul dispositivo reale**: `TalosVoiceProfileStoreInstrumentedTest`,
**7/7 verdi** — round-trip esatto di ogni campo; **cancellare SOLO la chiave
Keystore** (file lasciato intatto) rende il profilo permanentemente
illeggibile — la proprietà di sicurezza vera che §7.2 chiede, isolata da "il
file è sparito"; la cancellazione piena rimuove entrambi; due profili
portano chiavi indipendenti, cancellarne uno lascia l'altro intatto;
rinominare cambia solo `displayName`; l'elenco riflette salvataggio e
cancellazione; l'impronta del codec è deterministica su calcoli ripetuti
reali contro i file del codec reali sul dispositivo (64 caratteri esadecimali
SHA-256, confermato). Il round-trip JSON da solo non serve un dispositivo —
`TalosVoiceProfileTest`, 3/3 nella JVM.

### 10.5 `TalosVoiceEnrollment` — l'orchestrazione, e il cancello di uscita di Fase 3

Lega cattura→qualità→codifica→profilo in un arruolamento vero:
`captureOnePhrase` (microfono reale + cancello di qualità, per una frase
guidata alla volta — la decisione di riprovare/tenere/scartare resta al
chiamante, cioè al mockup del Blocco 4); `buildProfile` unisce le frasi
accettate, verifica che condividano una sola frequenza di campionamento,
ricontrolla il cancello di qualità **anche sull'unione** (difesa in
profondità — §12: "non codificare ogni registrazione solo perché
`AudioRecord` ha restituito byte" vale anche per il riferimento assemblato,
non solo per ogni singola frase), codifica una sola volta attraverso il
codec reale, e produce un profilo **in memoria**, non ancora salvato: il
chiamante fa l'anteprima con
`generateAudioTokensWithReference(profile.promptAudioCodes)` prima di
chiedere un sì vero (§11.1); `commit` salva solo dopo.

⛔ **Il passo "cancella il PCM temporaneo" di §6.4/§7.1 non esiste qui, di
proposito, non per dimenticanza.** Ricerca prima di scrivere il file:
`File.delete()` su Android non cancella in modo sicuro (recuperabile da
un'immagine fisica finché non viene sovrascritto), e sovrascrivere-prima-di-
cancellare consuma flash e batteria per una garanzia che comunque non può
dare su NAND a wear-leveling — lo stesso §7.2 dice di non dichiarare una
cancellazione fisica garantita. `TalosVoiceRecorder.capture()` restituisce
già il PCM in memoria (`ShortArray`), e `encodeReferenceAudio` prende la
memoria direttamente: l'intera pipeline cattura→codici non ha mai bisogno
di un file `cacheDir/voice-enrollment/…pcm.tmp` come quello che §7.1
descrive come posizione, perché niente qui serializza mai l'audio grezzo su
disco. Audio mai scritto è una proprietà più forte di audio scritto e poi
ripulito col meglio possibile.

⭐⭐⭐ **Provato sul dispositivo reale, il cancello di uscita del blueprint
per intero**: *"ad app riavviata da fredda parla col profilo cifrato in
cache, senza il WAV grezzo"* — `TalosVoiceEnrollmentInstrumentedTest`,
**3/3 verdi**. Il test grosso (`committedProfileSurvivesACloseAndFresh...`)
costruisce un profilo da due "frasi" (due metà del riferimento di una voce
incorporata, decodificate — nessuna voce umana dal vivo disponibile in un
test automatico, stessa limitazione già dichiarata in 10.3), lo salva,
**chiude tutto il runtime**, ne riapre uno **nuovo** ("freddo", il più
vicino a un riavvio reale che uno strumentato ottiene senza uccidere il
processo), carica **solo** il file `.tvp` cifrato da disco, e sintetizza con
quello — 8 frame prodotti, non cancellato. Confrontato uno snapshot di
`filesDir` prima/dopo: **l'unico file nuovo è `voice/profiles/<uuid>.tvp`**,
niente altro — la prova diretta che nessun WAV/PCM grezzo tocca mai il
disco. (Misurato anche: `cacheDir` non è utilizzabile per questo confronto
— è la stessa cartella dove la WebView dell'app tiene la sua cache HTTP e
il crash reporter, che scrivono per conto loro; la prova resta scoperta su
`filesDir`, l'unica cartella che questa classe o il blueprint propongono
mai di usare.) Le altre due prove: il cancello dei guardrail (lista vuota di
frasi, frequenze di campionamento diverse — entrambe rifiutate **prima** di
toccare il runtime ONNX) e il cablaggio cattura→qualità sul microfono vero.

⛔ Corsa di regressione sull'intero pacchetto `ai.talos.voice` (30 test): 1
fallimento isolato in `TalosVoiceHostStreamingInstrumentedTest` (underrun
hardware 2 invece di 0) — **non** nei file toccati oggi, e verde 2/2 quando
rieseguito da solo subito dopo. Coerente con l'aperto già noto
`sotto-carico-non-cala-oscilla` (memoria), non una regressione di questo
turno; non richiude quell'aperto.

### 10.6 Cosa resta aperto in Fase 3

- SNR/pavimento di rumore non calibrati (§10.2).
- Nessuna prova con una voce umana reale — tutte le prove usano rumore
  ambientale o audio sintetico/decodificato, mai parlato vero.
- Anteprima-prima-di-confermare come **flusso UI**: il backend la rende
  possibile (`buildProfile` non salva da solo), ma non esiste ancora
  un'interfaccia che la guidi — è il Blocco 4.
- Registro del consenso (§7.4): non toccato.
- `frameRateMilliHz`/`codebookSize` nell'header restano sentinella `-1`:
  `TalosMossCodecMeta` non porta ancora quei campi (verificato, non
  presunto) — un'estensione futura dovrebbe aggiungerli lì, non farli
  indovinare da questa classe.

---

## 12. Fase 4 — UI/router (in corso)

Mockup esaustivo consegnato e approvato (owner 21/8, artefatto pubblicato,
vedi `blocco4-mockup-ui-voce-personale` in memoria) — ricerca sui
competitor (ElevenLabs, Apple Personal Voice, Resemble AI) inclusa, agganciato
ai token reali del motore tema (`talosThemeModeVariantStyle`, preset
**calm** — non telemetry, correzione owner). Ora l'implementazione vera,
a blocchi.

### 12.1 Blocco 1 — contratti e schema impostazioni additivo

`personalVoiceContracts.ts` (blueprint §40): `TalosSpeechEngine`,
`TalosPersonalVoiceProfileSummary`, `TalosPersonalVoiceStatus`,
`TalosPersonalSpeakRequest` — nessun PCM/tensore attraversa mai il ponte
Capacitor, stessa regola già del nativo. `TalosMobileVoicePreferences`
guadagna `engine`/`personal_profile_id`/`personal_rate`/`personal_pitch`,
additivo — un JSON vecchio senza questi campi analizza identico a oggi.
`personal_rate`/`personal_pitch` sono **separati** da `rate`/`pitch`
apposta: quei due sono tarati a orecchio contro la voce di sistema
(`1.2`/`1`, owner 10/8) e distorcerebbero una voce neurale appena
arruolata. **4 test nuovi** in `settingsStore.test.ts`, coprono per intero
la lista di §37.1 "Settings". Tipecheck pulito, 5904/5904 vitest.

### 12.2 Blocco 2 — plugin nativo e `TalosVoiceHost` esteso

`TalosNeuralVoicePlugin.kt` (blueprint §41, cresciuto al set di metodi
vero): `status`/`profiles`/`renameProfile`/`deleteProfile`/`speak`/`stop`
per la riproduzione, più `startEnrollmentSession`/`captureEnrollmentPhrase`
(cancellabile, un microfono richiesto correttamente via
`requestPermissionForAlias`, stesso schema di `TalosParolaPlugin`)/
`buildEnrollmentProfile`/`previewEnrollmentProfile`/
`commitEnrollmentProfile`/`discardEnrollmentSession` per l'arruolamento —
registrato in `MainActivity.java` accanto a `TalosLlamaPlugin`. Le frasi
catturate durante l'arruolamento vivono **in memoria nativa**, indicizzate
per slot (`enrollmentSlots`), mai su disco — stessa scelta già presa in
`TalosVoiceEnrollment`.

`TalosVoiceHost` guadagna `TalosVoiceHost.get(context)` (singleton di
processo, §41's `TalosVoiceHost.get(context.applicationContext)`) e
`submitSpeakStreamingWithReference`/`speakStreamingWithReferenceBlocking` —
lo stesso percorso di streaming di Fase 2, ma con i codici audio di un
profilo arruolato al posto di una voce incorporata per nome. Refattorizzato
estraendo `driveStreamingSynthesis` (decodifica/backpressure/conteggio
underrun) da `runSpeakStreaming`, così il percorso nuovo corre sullo
**stesso** codice già misurato a zero underrun, non una copia che potrebbe
divergere.

⭐ **Provato sul dispositivo reale**: `TalosVoiceHostReferenceStreamingInstrumentedTest`
— sintesi in streaming con riferimento, zero underrun, cancel-a-metà lascia
l'host utilizzabile, singleton `get()` conferma la stessa istanza. Un
fallimento isolato (2 underrun hardware invece di 0) rieseguito **da solo**:
verde — stessa firma già nota "sotto carico non cala, oscilla"
(`sotto-carico-non-cala-oscilla`, memoria), non una regressione. Riprovato
anche `TalosVoiceHostStreamingInstrumentedTest` (il percorso builtin
originale): **2/2 verde**, il refactor non l'ha toccato.

### 12.3 Cosa resta aperto in Fase 4

- Router TS (`personalVoiceRouter.ts`, blueprint §37.1 "Router") — non
  scritto.
- `useTalosSpeech.ts` non instrada ancora verso il motore personale — il
  cancello di uscita di Fase 4 ("ogni interazione vocale attuale funziona
  ancora con `engine: 'system'`") non è stato ancora verificato perché
  non c'è ancora nulla da rompere.
- §37.5 (smoke R8 in release, "metodi Capacitor visibili") — non fatto:
  nessun plugin Capacitor in questo codebase ha oggi un test a livello di
  bridge; questo nuovo segue lo stesso standard, non uno più basso.
- Il controllo microfono (mic-check) resta solo istruttivo: non esiste una
  chiamata nativa "sbircia il livello senza catturare una frase intera", e
  animare un misuratore con numeri non reali sarebbe la stessa disonestà che
  il cancello di qualità esiste per impedire dal lato audio.
- Registro del consenso persistito (§7.4) — la schermata di consenso chiede
  un sì esplicito su tre voci prima di continuare, ma nessuna riga di quel
  sì viene ancora scritta su disco con data/versione.

### 12.4 Blocco 4 — la UI Vue vera, sul mockup approvato

`TalosMobilePersonalVoiceEnrollment.vue`: la stessa forma a schermo intero
di `TalosMobileSetupIntro.vue` (`fixed inset-0`, passi con barra di
progresso, footer indietro/avanti), sei schermate — consenso, controllo
microfono, allenamento guidato (12 frasi × 3 volumi, `pointerdown`/
`pointerup` su un **unico** bottone persistente, mai due bottoni scambiati
a metà gesto — vedi sotto), verifica d'insieme (nome chiesto **qui**, non
sull'ultima schermata come nel mockup: `buildEnrollmentProfile` lo richiede
prima di codificare, non dopo — deviazione dichiarata dal mockup, non un
errore), elaborazione, anteprima+salva. `TalosMobileVoiceSettings.vue`
guadagna la sezione "Voce personale" (stato vuoto/pieno, CRUD con conferma
di eliminazione che spiega la cancellazione crittografica vera), nascosta
onestamente quando `talosPersonalVoiceStatus().supported` è falso — mai
un bottone "Crea la tua voce" che porterebbe a un arruolamento destinato a
fallire su un dispositivo senza i file del modello.

⛔ **Un bottone vero, non uno scambiato — trovato dal test stesso**: la
prima bozza usava DUE `<Button>` diversi (uno per "premi per registrare",
uno per "ferma") scambiati con `v-if`/`v-else` su `recording`. Il test del
componente ha fallito su questo esatto punto: Vue sostituisce il nodo DOM
nell'istante in cui `recording` diventa vero, **prima** che il `pointerup`
del browser possa scattare sull'elemento che il dito sta ancora toccando —
esattamente il tipo di scambio di elemento a metà gesto che su un vero
touchscreen può far perdere silenziosamente l'evento di rilascio. Un solo
bottone persistente, che cambia solo etichetta/stile, tiene intatta la
cattura del puntatore per tutto il gesto.

⛔ **Una frase rifiutata offriva "Continua" comunque — altro difetto trovato
dal test**: il ramo `v-else` mostrava Riprova E Continua insieme, a
prescindere da `lastVerdict.accepted`. Corretto: "Continua" appare solo su
verdetto accettato.

⭐ Test: 5 casi in `TalosMobilePersonalVoiceEnrollment.test.ts` (sessione
avviata/scartata, il consenso blocca finché non sono spuntate tutte e tre
le caselle, il verdetto vero governa riprova/continua, le 12 frasi portano
a `buildEnrollmentProfile` col nome digitato, il salvataggio commette e
chiude). Un cattura-capacitor con promessa **differita** apposta, non
istantanea: un mock che risolve subito fa completare l'intero giro dentro
il solo `pointerdown`, prima che `pointerup` scatti — un artefatto di
tempistica del test, non un difetto del componente, ma ci è voluto un
secondo giro per vederlo. Tipecheck pulito, 5919/5919 vitest (15 nuovi in
questo blocco, 0 rotti). `npm run build` verde, tetto del chunk iniziale
rispettato (609.653/610.000 byte — il componente pesante è pigro via
`defineAsyncComponent`, stesso schema del pannello provider nell'intro).

⭐ **Verificato visivamente, app reale**: `vite preview` + Playwright (stesso
motore di `capture-ui.mjs`), schermata Impostazioni→Voce in tema chiaro E
scuro, e la schermata di consenso + la prima frase del wizard — tutto
renderizzato coi token REALI del tema attivo (`calm`, non un'approssimazione),
la sezione si inserisce esattamente dove il mockup approvato la mostrava.
Un errore di console reale trovato durante questa prova ("plugin non
implementato su web", atteso in anteprima web) ha rivelato un buco vero:
`onMounted` non aveva un `try/catch` — chiuso nello stesso turno.

### 12.5 Cosa resta aperto in Fase 4

- Nessuna prova su dispositivo reale dell'arruolamento end-to-end con voce
  umana vera (cattura→qualità→codifica→commit attraverso la UI) — i test
  del componente usano un ponte finto; i test nativi di Fase 3/Blocco 2
  provano il motore con audio decodificato, mai con un parlato vero.
- Mic-check istruttivo soltanto (sopra); registro del consenso non
  persistito (sopra).

### 12.6 Blocco 5 — `useTalosSpeech.ts` collegato al router, Fase 4 chiusa

`toggle()` (il pulsante altoparlante su un messaggio) decide sistema o
personale UNA volta per lettura, prima di dire una parola — esattamente
§37.1's "engine/profile snapshot fixed for one reading". `engine ===
'system'` prende la stessa scorciatoia che il codice aveva già ieri, senza
nemmeno importare il modulo della voce personale — la garanzia "il sistema
non chiama mai il plugin personale" è vera per costruzione, non per
convenzione. `stop()` guadagna un piccolo libro contabile
(`motoreDellaLettura`, per-lettura) per fermare il motore giusto quando una
lettura era personale, migrato correttamente da `rinominaLettura` per lo
stesso motivo delle altre due mappe che già lo fanno.

⛔ **`seguiIlTesto` (la lettura che insegue il testo mentre si scrive)
resta SEMPRE sul sistema, dichiarato non dimenticato**: mette in coda una
frase alla volta con `queue: 'add'`, e conta su una VERA coda — la frase 2
aspetta che la 1 finisca. `TalosVoiceHost.submitSpeakStreamingWithReference`
non ha una coda: ha una generazione mutabile che la successiva invalida
(§14), quindi instradare lì la frase 2 la interromperebbe a metà invece di
seguirla. Restare sul sistema per questo percorso è la scelta onesta finché
la coda nativa non esiste davvero.

⛔⛔ **Il gate del peso d'avvio è saltato, e il tetto si è alzato — mai
azzoppata la funzione per farci stare dentro.** La prima stesura del
router inline in `toggle()` costava 610.498 byte contro un tetto di
610.000 (il margine era già di soli 347 byte PRIMA di questo blocco).
Tolto il grasso vero prima di alzare nulla: l'intera decisione del router
si è spostata da `useTalosSpeech.ts` a `talosSpeakForReading` dentro
`services/personalVoice.ts` (già dietro un `import()` pigro, come il resto
del file) — 610.352. Il resto (il controllo `engine === 'personal'`,
l'`import()` stesso, le tre righe di libro contabile) è il costo
irriducibile della funzione, non grasso da togliere. Tetto alzato
610.000 → **611.000** in `scripts/verify-initial-chunk.mjs`, con lo stesso
formato di cronologia già in uso lì (cosa ha comprato l'aumento, cosa è
stato tolto prima, perché mille byte e non meno).

⛔ **Un difetto reale trovato nel primo test, non nel codice**: mockare
`talosPersonalVoiceStatus`/`talosPersonalVoiceSpeechAdapter` per
riscrivere `talosSpeakForReading` (definita nello STESSO modulo) via
`importActual` + spread non funziona — i binding ES a un modulo vengono
riscritti sull'oggetto d'esportazione, non dentro le chiamate già legate a
funzioni locali dello stesso file. Corretto spostando il confine del test:
`useTalosSpeech.test.ts` mocka `talosSpeakForReading` direttamente (la sua
sola responsabilità: chiamarla, ramificare sul booleano); il collegamento
vero router→adattatore→ponte ha 5 test nuovi in
`services/personalVoice.test.ts`, che mocka solo il ponte Capacitor.

⭐ Test: 5 nuovi in `useTalosSpeech.test.ts` (system mai chiama il modulo
personale; personale pronto parla per l'adattatore con `personal_rate`/
`personal_pitch`, non `rate`/`pitch`; ripiego silenzioso su indisponibile
senza riscrivere la preferenza salvata; `stop()` instrada al motore giusto;
l'evento nativo di completamento chiude `speakingId`), 5 in
`personalVoice.test.ts` (system/nessun profilo/non pronto non toccano mai
il ponte; pronto chiama `bridge.speak` coi parametri giusti; due letture
consecutive non condividono mai un `readingId`). Tipecheck pulito,
5929/5929 vitest, build verde col tetto nuovo.

⛔ Nessuna prova end-to-end sul dispositivo di "tocca l'altoparlante su un
messaggio → si sente la voce arruolata": la catena nativa (plugin→host) è
già provata sul Pad dal Blocco 2, il collegamento TS è provato con un
ponte finto — la prova che le due estremità combaciano davvero, con una
voce umana vera, resta aperta.

### 12.7 Cosa resta aperto in Fase 4 (e nel 0.1.18 più largo)

- Coda vera per `seguiIlTesto` (sopra) — richiederebbe una coda FIFO reale
  in `TalosVoiceHost`, non la singola generazione mutabile di oggi.
- §37.5 (smoke R8 in release) — non fatto, stesso standard degli altri
  plugin di questo repo.
- Mic-check istruttivo soltanto; registro del consenso non persistito.
- Prova end-to-end sul dispositivo con voce umana vera, dalla UI al parlato
  reale — mai fatta in questa fase.
- I sei rilievi del 22/8 e i due documenti MAX PERFORMANCE del motore
  locale — entrambi custoditi in memoria, esplicitamente DOPO questa fase.

---

## 13. Fase 4 chiusa — tutti e cinque i blocchi

Fase 2, Fase 3 e Fase 4 chiuse per intero. La voce personale è cablata da
capo a fondo: arruolamento (cattura→qualità→codifica→profilo cifrato),
plugin nativo, router, UI Vue sul mockup approvato, e adesso il
collegamento reale a `useTalosSpeech.ts` — un messaggio di chat può
davvero parlare con una voce arruolata, non solo l'anteprima del wizard.
Il cancello di uscita del blueprint per la Fase 4 ("ogni interazione
vocale attuale funziona ancora con `engine: 'system'`") è provato: la
suite intera di `useTalosSpeech.test.ts` di ieri passa immutata, più un
test nuovo che dichiara esplicitamente che il motore personale non viene
nemmeno chiamato quando l'engine è di sistema.

Resta aperto, per nome: la prova end-to-end sul dispositivo con voce umana
vera; la coda reale per la lettura che insegue il testo; il registro del
consenso persistito; il mic-check con un livello vero. Nessuno di questi
blocca 0.1.18 — sono dichiarati, non nascosti.

Poi, come sempre: cancelli, prova sul dispositivo dove serve, commit, e si
chiede il push solo alla fine.

---

## 14. I sei rilievi del 22/8 — post-Fase-4, prima della Fase 5

Owner 2026-08-22, sei screenshot reali dopo la chiusura della Fase 4.
Salvati verbatim in memoria (`findings-owner-22-agosto.md`) prima di
toccare codice, per non perderli a metà indagine. Si chiudono uno alla
volta, ognuno con la sua prova.

### 14.1 Rilievo 2 — l'icona di selezione nella sidebar chat (CHIUSO)

«quella icona nella sidebar per selezionare SE NE DEVE ANDARE VIA, occupa
troppo spazio, abbiamo già hold to select, basta quello.»

MISURATO nel codice prima di toccarlo: due percorsi indipendenti in
`ChatsScreen.vue` arrivavano già a `bulk.enter()` senza quel pulsante —
il timer di pressione lunga (righe ~367-405) e la voce "seleziona" del
menu contestuale (~457). Il pulsante d'intestazione (icona `CheckSquare`,
`data-testid="talos-chats-select-header"`) era un terzo percorso
ridondante, che ribaltava la decisione del 2026-07-27.

Rimosso il pulsante e il suo import `CheckSquare`; rimossa la chiave i18n
`selectChats`, orfana, da `en.ts`/`it.ts` (confermato con grep: nessun
altro riferimento). Typecheck pulito, `chatsScreen.test.ts` +
`routeWiring.test.ts` 16/16, suite intera 650/653 file · 5930/5940 test
(3+10 skip preesistenti, non di questo cambio). Commit `7ce79b63`.

### 14.2 Rilievo 3 — la voce di play non era quella delle impostazioni (CHIUSO)

«quando premo play su un messaggio di risposta parte di default una voce
predefinita che non è nella lista voci nel impostazioni della voce
relative. La voce TTS deve essere esattamente quella scelta dalle
impostazioni oppure di default la prima.»

Causa trovata nel codice, non per ispezione: `TalosMobileVoiceSettings.vue`
mostrava come default `voiceItems[0]`, calcolato con
`rete: navigator.onLine !== false` (online, la neurale batte la locale —
regola 2 di `talosVociOrdinate`). `voceFissa()` in `useTalosSpeech.ts` —
quella che parla DAVVERO al tocco di play — fissa `rete: false` di
proposito (decisione dell'8/10: una voce di rete cambia timbro a metà
lettura quando scivola sul ripiego locale). Online, con una voce nominata
di rete e una locale entrambe disponibili, le due chiamate a
`talosVoceDaUsare` potevano disaccordarsi: il menu mostrava la voce di
rete come «la prima», il pulsante play ne diceva un'altra — talvolta
nemmeno nell'elenco offerto (anche `talosVociOfferte` è rete-dipendente).
Anche l'anteprima di Impostazioni aveva un TERZO calcolo (`?? undefined`,
decideva il motore nativo) — stessa famiglia di difetto, stessa cura.

Fix: un solo `voceDiRipiego` computed, stessa `preferenza` di `voceFissa()`
(`rete: false`, `scelta: null`). Il default mostrato, l'anteprima e il
pulsante play ora concordano sempre; l'elenco selezionabile (`voiceItems`)
resta rete-consapevole, quindi una scelta esplicita può ancora prendere
una voce di rete.

Test nuovo `PVOICE-DEFAULT-01`: due voci nominate (una `· rete`, una
locale) online, dimostra che il menu, l'anteprima e l'elenco selezionabile
concordano — la prova che PRIMA del fix avrebbe fallito (il menu mostrava
`Itb · rete`, non `Itc`). Typecheck pulito, suite intera verde (stessi
numeri di 14.1, stesso giro), build + gate del tetto d'avvio invariato
(610.352/611.000 — il componente resta pigro, non nel grafo d'avvio).
Commit `53a3d3b3`.

### 14.3 Rilievo 4 — NON è un difetto TALOS (CHIUSO, indagine sul Pad)

Riprodotto sul Pad lo scenario esatto: prompt che genera testo, si ferma su
un consenso-strumento, riprende dopo l'approvazione. Una fascia di sfondo
chiara è comparsa DAVVERO dietro una delle due frasi finali. Prima di
chiudere come "non nostro" ho instrumentato tre prove indipendenti, non
un'ipotesi:

1. **Chrome DevTools Protocol** sulla WebView reale del processo `ai.talos`
   (porta `webview_devtools_remote_*`, `adb forward` + websocket nativo di
   Node): l'intera catena di antenati del paragrafo, e una scansione
   dell'intero `document.querySelectorAll('*')`, non trova NESSUN elemento
   con sfondo non trasparente nella zona — zero CSS/DOM nostro coinvolto.
2. **CDP screenshot vs `adb screencap` nello stesso istante**: la fascia
   compare SOLO nello screencap (compositor intero), MAI nello screenshot
   CDP (solo livello web) — prova diretta che è un overlay nativo Android
   disegnato SOPRA la WebView, non dentro.
3. **`am force-stop` + rilancio pulito**: sullo STESSO messaggio già
   persistito, la fascia sparisce dopo il riavvio — non sopravvive, quindi
   non è nemmeno uno stato che l'app scrive da qualche parte.

`TalosOcchio.kt` (il nostro servizio di accessibilità, verificato attivo su
`ai.talos` in questo momento) non chiama mai `ACTION_ACCESSIBILITY_FOCUS`;
il suo unico `ACTION_FOCUS` è sotto l'azione `"scrivi"`, mai invocata in
questa prova. Nessun codice `mobile/src` o nativo da toccare. Dettaglio
completo in memoria: `findings-owner-22-agosto.md`.

### 14.4 Rilievo 5 + Rilievo 6 — CHIUSI insieme, stessa causa

«I file MD non sono formattati» e «non è possibile cliccare sul file MD
appena creato dalla scheda chat»: stesso buco, misurato leggendo il
codice — in TUTTO l'app esisteva un visualizzatore per il PDF
(2026-08-17) e NESSUNO per il testo/Markdown. Ovunque un file di testo si
apriva, cadeva su un `<pre>` grezzo; la scheda «creato» aveva solo `dove`
(una rotta che la Libreria non ha per singolo file) e `pdf` — niente per
un MD, quindi niente bottone.

Cura: `TalosMobileMarkdownViewer.vue`, stessa forma del visualizzatore
PDF, monta la VERA `TalosMobileMessageContent` (lo stesso motore che
formatta ogni messaggio di chat) invece di duplicare un parser. Due punti
di ingresso corretti: la scheda «creato» (nuovo campo `mdFileId`,
speculare a `pdf`, valorizzato da `documentTools.ts` per
`mediaType: 'text/markdown'`) e il pannello media della chat (un
allegato `text/markdown` ora passa per lo stesso componente invece del
`<pre>` — `.txt`/JSON restano grezzi, giustamente).

Provato end-to-end sul Pad (build fresca, `cap copy`, `assembleDebug`,
`install -r`, non `connectedAndroidTest`): chiesto a TALOS di creare
`prova.md`, consentito lo strumento, toccata la scheda — si apre un
titolo vero e un elenco puntato vero, non `# `/`- ` grezzi. Suite intera
verde (651/654 file, 5938/5948 test, 8 nuovi), typecheck pulito, tetto
d'avvio invariato (610.358/611.000).

### 14.5 Ancora aperto

- Rilievo 1 — censimento tool/ricerca web × modello, scettico e completo,
  autorizzato a scaricare altri modelli. Il più grande dei sei, non
  ancora iniziato: probabile blocco a sé.

Owner 2026-08-22: chiusi cinque su sei. Poi Fase 5 (chiude il blocco voce
personale per intero), poi le ottimizzazioni di performance del motore
locale LLM (i due documenti MAX PERFORMANCE già custoditi in
TALOS-RICERCHE).

---

## 15. Fase 5 — installazione durevole del modello, RIAPERTA il 22/8

`.claude/CONSEGNA-0.1.18-VOCE.md` §4 (21/8) rimandava esplicitamente questa
fase a dopo — «non blocca la voce». Owner 2026-08-22, dopo la domanda
esplicita («intendi riaprire quella decisione?»): sì, aprila. Blueprint
§39 Fase 5: *generic artifact transfer core, pinned voice manifest, exact
hashes/bytes, partial/resume, atomic version activation, cleanup old
version after lease release.*

### 15.1 Il motore di trasferimento NON si scrive da capo

Cercato prima di scrivere, come sempre: `TalosTransferSession.java` (764
righe) + `TalosTransferPlan.java` + `TalosTransferJournal.java` sono già in
produzione per i GGUF — coda durevole fra riavvii del processo, ripresa,
scelta del runner per livello API (Android 15: `USER_INITIATED_JOB` senza
tetto giornaliero; 26-33: `FOREGROUND_SERVICE`; app non visibile:
`DEFERRED_JOB`), riserva di spazio disco calcolata UNA volta all'inizio
(`STORAGE_RESERVE_BYTES`, la stessa costante di `fit.ts` — già una guardia
contro la stessa divergenza che per poco è successa due volte). ⇒ Fase 5
generalizza questo motore per un `Request` voce, non ne duplica uno — è
esattamente ciò che il blueprint stesso dice al §4 della CONSEGNA.

### 15.2 Il pin — la parte più a rischio, fatta e provata per prima

Blueprint §47.1: *«Never configure production as: repo = OpenMOSS/...
revision = main»* — serve un promotion workflow: SHA candidata → hash
inventory → parità → benchmark → promozione. Trovato sul Pad, non
inventato: le due cartelle modello di Fase 0 (`adb push` a mano) portano
ancora la cache `huggingface_hub` di chi le ha scaricate — commit esatto e
hash LFS per ogni file, mai puliti.

**Fonte candidata, verificata in TRE modi indipendenti** (cache del
device, API HuggingFace dal vivo, fetch diretto + hash ricalcolato a
mano — stesso sha256 in tutti e tre):

| repo | revision (commit esatto, mai `main`) |
|---|---|
| `OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX` | `f52645cb467506d8e18e746ddd59482685b74e58` |
| `OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX` | `ceff0d0749bfb3fa2d61149794ec6feef0d1e1ae` |

Entrambi pubblici, non gated, Apache-2.0 — verificato via API, non
assunto dal nome della cartella. 16 file, 763.191.513 byte (~763 MB),
ognuno col suo sha256 vero: per i 3 file non-LFS (i tre JSON di
configurazione) l'API HF restituisce solo un blob-sha1 git, quindi lo
sha256 vero è stato ricalcolato a mano sui byte tirati dal device — e
`browser_poc_manifest.json` è stato riscaricato una seconda volta
dall'endpoint HF diretto per la controprova indipendente.

⇒ **`android/app/src/main/assets/voice/model-manifest.json`** — il
manifesto firmato nel sorgente che il blueprint §47.2 richiede («the app
trusts the source-controlled TALOS manifest, not a mutable remote
JSON»). Provato in ENTRAMBI i versi con
`TalosVoiceModelManifestPinTest.kt` (7 test JVM, `./gradlew
testDebugUnitTest`): forma del pin (mai `main`), 64-hex reale su ogni
hash, somma byte ricalcolata a mano (non una costante duplicata), zero
percorsi doppi, le cartelle combaciano con quelle che
`TalosVoiceModelManager`/`TalosMossManifest` già cercano sul
dispositivo, e — la prova al contrario — uno sha256 troncato di un
carattere fa fallire il test giusto (verificato spegnendolo e
riaccendendolo davvero, non per ipotesi). `releaseSmoke` resta
`PENDING` nel manifesto stesso finché il downloader vero non ha girato
su un dispositivo non di riferimento.

### 15.3 Cosa resta, per nome — il downloader vero non esiste ancora

Il pin era la parte più a rischio (una fonte sbagliata qui comprometterebbe
tutto il resto), e ora è fatto e provato. Non ancora scritto:

- Un `TalosVoiceModelInstaller.kt` (o simile) che legge
  `model-manifest.json` e costruisce un `TalosTransferSession.Request`
  per ciascuno dei due `artifacts` — il ponte fra il manifesto e il
  motore che già esiste.
- Verifica hash **dopo** il download, prima di considerare un file
  installato — non fidarsi della sola dimensione.
- **Attivazione atomica**: la nuova versione diventa quella attiva solo a
  tutti i file verificati, mai a metà.
- **Pulizia della versione vecchia dopo il rilascio del lease** — stesso
  concetto di "generazione" già usato in `TalosVoiceHost` (§14 del
  blueprint), non un meccanismo nuovo.
- Scenari corrotto/parziale/aggiornamento-modello che passano (cancello
  di uscita del blueprint per questa fase) — provati sul dispositivo
  reale, non solo sulla JVM.
- Lato TS: un pulsante/avanzamento nelle impostazioni voce che avvia
  l'installazione quando `TalosVoiceModelManager.isPresent()` è falso,
  al posto del silenzio attuale (oggi la sezione voce personale resta
  nascosta se il modello manca — vedi `personalVoiceSupported` in
  `TalosMobileVoiceSettings.vue`, Blocco 4).

⛔ Non chiuso senza dispositivo reale: il cancello di questa fase
("scenari corrotto/parziale/aggiornamento passano") è per definizione
un cancello di dispositivo, non di JVM.
