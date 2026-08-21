# RITORNO — 0.1.18: la voce personale

> Scritto da questa sessione, aggiornato a fine di ogni blocco. **Fase 1
> chiusa** (§1-7 sotto). **Fase 2 in corso** (§8) — l'owner ha dato il via
> esplicito il 21/8 dopo la chiusura della Fase 1. Fase 3-4 restano roadmap.

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

### 8.4 Cosa NON è ancora fatto in Fase 2

- `TalosVoiceHost` non chiama ancora `TalosMossCodecStream`/`TalosPcmPlayer`
  end-to-end — i due componenti sono provati **separatamente**, non ancora
  cablati in un unico percorso di sintesi in streaming.
- La politica di scorta adattiva (§16.2, 1→2→4→8 frame secondo il ritardo)
  è portata nel codec stream come capacità ma non ancora guidata da una vera
  misura del ritardo di riproduzione (serve `TalosPcmPlayer` collegato).
- Nessuna misura di TTFA reale (tempo al primo audio UDIBILE, non al primo
  campione decodificato).
- `flush()`/`cancel()` non ancora collegati da `TalosVoiceHost` fino a
  `TalosPcmPlayer` — oggi il cancel di Fase 1 ferma solo la generazione TTS,
  non un player che sta già suonando.
- §17.4 (recupero da traccia morta) implementato ma **mai esercitato da un
  guasto vero** — solo dalla lettura del codice.

---

## 9. Prossimo passo

Continuare il cablaggio di Fase 2 (§8.4). Poi, come sempre: cancelli, prova
sul dispositivo, commit, e si chiede il push solo alla fine.
