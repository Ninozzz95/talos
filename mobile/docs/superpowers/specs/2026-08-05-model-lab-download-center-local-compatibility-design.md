# Model Lab mobile — design tranche correttiva, Download Center e compatibilità

Data: 2026-08-05
Stato: APPROVED FOR IMPLEMENTATION
Lane: `mobile` soltanto
Ricerca: `../research/2026-08-05-model-lab-corrective-tranche-research.md`

## 1. Obiettivo

Chiudere la Fase 4 con una tranche correttiva autonoma prima della Fase 5:

- Model Lab nella posizione corretta sotto account, primo elemento di
  **Intelligenza**;
- Download Center globale, reale e durevole;
- pagina Modelli locali e dettaglio repository più compatti;
- chip filtro sempre su una rail orizzontale single-line;
- apertura dei modelli locali coerente col verdetto Model Lab e con errori
  tipizzati;
- compatibilità GGUF provata famiglia per famiglia sul dispositivo fisico.

OAuth resta fuori scope e `DEFERRED`.

## 2. Architettura risultante

```text
Settings navigation
  Account
  Intelligence
    Model Lab route ───────────────┐
    AI Defaults panel             │
    Agent Tools panel             │
                                    ▼
Shell chrome ──lazy trigger──> modelTransfers store
  classic header                  │
  immersive chrome                ├── modelTransfer service
  mobile drawer                   │       │
  tablet sidebar                  │       ▼
  tool-sheet header               │   Capacitor plugin
                                    │       │
Local list/repo ──start────────────┘       ▼
                                      durable journal
                                      UIDT / foreground service
                                      partial + hash sidecar

Model Lab fit ──localContextPolicy──> local adapter open
                                         │
                                         ▼
                                  typed JNI open result
```

Non esistono più poller di pagina o una richiesta resume soltanto in memoria.

## 3. Settings: un solo modello semantico

### 3.1 Ordine

1. riga Account/nome utente;
2. gruppo Intelligence;
3. Model Lab;
4. AI Defaults;
5. Agent Tools;
6. gruppi restanti invariati.

### 3.2 Semantica

La rail è `nav` sia a compact sia a tablet. Le righe panel sono button che
aprono la pane detail; Model Lab è un `RouterLink`. Non vengono usati
`role=tablist`, `role=tab` o roving tabindex, perché la stessa lista contiene
una route e pannelli.

La pane tablet resta affiancata e usa `role=region`/`aria-labelledby`; sul
telefono sostituisce la lista e usa il Back contestuale esistente.
`aria-current="page"` identifica soltanto la riga inline attiva. Ogni
destinazione conserva il normale ordine Tab.

Il deep link legacy `?tab=models` e la route `/settings/models` restano stabili.

## 4. State machine del trasferimento

### 4.1 Fasi canoniche

```text
idle
  └─ start accepted ─> waiting ─> queued ─> running ─> verifying ─> complete/idle
                         │          │          │            │
                         │          │          ├─ user pause ─> pausing ─> paused
                         │          │          ├─ system stop ─> queued
                         │          │          ├─ failure ─> failed (resumable when safe)
                         │          │          └─ cancel ─> idle + partial removed
                         │          └─ cancel ─> idle
                         └─ promoted only while active slots < 2

paused ── resume ─> queued
failed resumable ── resume ─> queued
```

`active` e `paused` restano proprietà derivate di compatibilità; nessun owner
secondario può scriverle direttamente.

### 4.2 Snapshot durevole

Il journal schema 2 è un registro versionato con array `transfers`. Ogni record
contiene soltanto:

- versione schema;
- ID stabile del trasferimento, job ID Android unico e timestamp di creazione;
- phase e stop cause;
- repo e revision;
- array ordinati di path, byte attesi e SHA-256 nullable;
- model name;
- runner e `networkBound`;
- failure code nullable;
- timestamp di aggiornamento.

Non contiene token, URL firmati, header, contenuto del modello o dati account.
Il token HF continua a essere letto just-in-time dal secure store dal runner.

Il byte count autorevole dopo restart viene ricostruito dai sidecar
`TalosModelStore.Slot.resume(totalBytes)`, sommando file già completati e
checkpoint. La lunghezza del `.part` non è progresso perché è preallocata.

### 4.3 Cause di stop

- `USER_PAUSE`: journal `paused`, nessun retry scheduler, partial conservato;
- `USER_CANCEL`: runner fermato, partial/sidecar allowlisted eliminati, journal
  cancellato, nessun retry;
- `SYSTEM_STOP`: journal `queued`, request conservata, retry ammesso;
- `PROCESS_DEATH`: lo snapshot `running/verifying` orfano torna `queued` e viene
  rischedulato una sola volta.

La plugin API canonica è `start`, `pause`, `resume`, `cancel`, `status`,
`leftovers`, `discard`. `stop` e `talosStopModelTransfer()` restano alias di
compatibilità verso `pause` durante questa tranche. Le azioni canoniche portano
sempre `id`; l'omissione legacy è accettata soltanto quando il registro contiene
esattamente un record. Lo schema 1 viene migrato atomicamente a schema 2 e
mantiene il job ID legacy 4712.

### 4.4 Limite e dispatch

`MAX_ACTIVE_TRANSFERS = 2`. `waiting` non occupa uno slot; `queued`, `running`,
`pausing` e `verifying` sì. Il dispatcher promuove in ordine di `createdAtMs`,
assegna runner/network binding al momento della promozione e non avvia mai un
terzo worker. Quantizzazioni diverse possono convivere; la stessa richiesta
canonica non può essere duplicata.

API 34+ usa job ID persistiti distinti e UIDT quando la promozione avviene con
l'app visibile; una promozione successiva in background usa il job differito
già previsto dal piano. API 26–33 usa un solo foreground service come host di
massimo due worker e notifiche child indipendenti. Verifica allocatable e
preallocazione dell'intero set sono serializzate per impedire overcommit.

## 5. Store e observer globali

`modelTransfers.ts` è l'unica sorgente Vue reattiva. Espone `items[]`, stato
aggregato readonly e azioni per ID; `localModels.ts` conserva una vista alias e
wrapper di compatibilità, non una copia.

L'observer:

- è idempotente anche se cinque trigger sono montati;
- esegue una lettura immediata;
- polla ogni secondo soltanto mentre esiste una fase pendente;
- riduce la frequenza/si ferma in `idle`;
- esegue refresh al ritorno visibile dell'app;
- conserva l'ultimo stato noto se una lettura fallisce e rende visibile il
  failure, invece di dichiarare falsamente `idle`.

Le pagine locale e repo non creano timer e non rendono una seconda card di
trasferimento.

## 6. Download Center

### 6.1 Trigger

- icona `Download`/attività in alto a destra;
- visibile per `queued`, `running`, `pausing`, `paused`, `verifying` e `failed`
  riprendibile;
- nascosto in `idle` e dopo completion/cancel;
- label localizzata con nome e percentuale quando disponibili;
- badge numerico col numero di record pendenti/riprendibili;
- target minimo `--talos-touch-target`;
- indicatori colore soltanto via Theme Engine;
- chunk lazy con boundary verificato dal build gate.

### 6.2 Pannello

Popover Reka non-modal, collision-aware, con una lista semantica scrollabile:

- titolo localizzato **Centro download** in italiano;
- una riga compatta per ogni record, ordinata per creazione;
- nome/fase e controlli Pausa/Riprendi/Annulla sulla stessa riga superiore;
- progressbar, byte completati/totali e percentuale sotto la propria riga;
- caveat rete e failure confinati al proprio record;
- conferma inline prima di Annulla confinata alla sola riga;
- nome accessibile tradotto di ogni controllo comprensivo del modello;
- `role=status` per aggiornamenti di fase, senza rubare focus;
- Escape chiude e restituisce focus al trigger.

Il pannello non usa `role=menu`; usa `ul/li`, altezza massima e overflow interno.
Lo stato arriva esclusivamente dal registro nativo, quindi non presenta righe
finte o azioni globali che possano colpire il modello sbagliato.

## 7. UI locale compatta

### 7.1 Rail filtri bloccante

Il contenitore `talos-models-filters` deve avere simultaneamente:

```text
display:flex
flex-wrap:nowrap
overflow-x:auto
overscroll-behavior-inline:contain
```

Ogni chip è `shrink-0` e `white-space:nowrap`. Nessuna traduzione viene
abbreviata per farla entrare. A 360 px è accettato e desiderato
`scrollWidth > clientWidth`; non è accettato overflow della pagina.

### 7.2 Installati

- un contenitore unico con divider;
- nome/alias e una sola riga dimensione/data/cartella;
- menu trailing non sovrapposto;
- search/sort/layout soltanto con più di un elemento;
- nessun path completo nel body; resta nell'azione Copia percorso;
- azioni rename/delete/copy e ordinamento persistente invariati.

### 7.3 Browse

- search in una riga;
- rail filtri in una riga;
- sort e publisher in una toolbar compatta;
- provider heading sottile;
- risultati come righe continue con titolo, metadata essenziali, fit e
  chevron; dettagli secondari ridotti;
- filtri AND, zero-state, reset, revision e gated marker invariati.

### 7.4 Dettaglio repository

- titolo multilinea compatto;
- autore/licenza e summary prima, README completo dietro `details`;
- varianti in lista continua;
- label, byte e fit sempre visibili;
- warning/verdetto/context e recheck dietro disclosure quando non servono alla
  scansione;
- download resta azione primaria con label accessibile;
- incomplete disabilita soltanto download;
- nessun device card e nessun Back nel body.

## 8. Policy contesto e failure tipizzato

### 8.1 Policy unica

`TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS = 4096` vive in
`localContextPolicy.ts` ed è importata sia da Model Lab sia dalla chat.
`TALOS_DEFAULT_LOCAL_CONTEXT` resta alias di compatibilità.

Candidate di fallback iniziali: `[4096, 2048]`. Una richiesta esplicita più
bassa non viene alzata. Una richiesta più alta resta esplicita e non viene
silenziosamente sostituita prima del primo tentativo.

### 8.2 Failure stage

Il confine nativo restituisce uno dei seguenti stadi stabili:

- `path`;
- `model-load`;
- `context`;
- `sampler`;
- `template`;
- `generation`;
- `unknown`.

`nativeOpen()` continua a restituire handle/0 per compatibilità interna, ma
espone anche l'ultimo failure stage sullo stesso thread. `TalosLlamaEngine`
aggiunge un `OpenAttempt`; il vecchio `open()` delega e conserva la firma.

La plugin Capacitor usa code stabili e metadata non sensibili. TypeScript
normalizza in `TalosLocalEngineOpenError`. Soltanto `stage=context` abilita il
secondo tentativo a 2048.

Se entrambi falliscono, `localAdapter` solleva un
`TalosMobileProviderError(operation='complete')` con messaggio localizzato e
azione concreta. La chat non persiste più il solo codice generico.

## 9. Campagna compatibilità

Il manifest pin è dato dalla ricerca. Il runner host:

- convalida schema e allowlist;
- usa `maxConcurrency=1` per costruzione;
- scarica da revision immutabile;
- verifica byte e SHA-256;
- verifica package dev e test APK, apre un server TCP solo su loopback e crea
  una reverse ADB nominativa; l'instrumentation target riceve lo stream e lo
  scrive direttamente, tramite `getExternalFilesDir()`, al solo
  `files/talos-compat/talos-compat.gguf`; nessun push, shared storage, HTTP o
  duplicato device è ammesso;
- invoca un test instrumentation che fa open → template → generate → close;
- passa `talosModelPath`, `talosExpectedBytes`, `talosExpectedSha256` e
  `talosCaseId`, oltre alla porta effimera `talosHostPort`;
  l'instrumentation ricontrolla identità e integrità prima di caricare il GGUF;
- dopo il PASS sposta atomicamente quella stessa copia, senza duplicarla, in
  `files/models/__talos_compat__/<case>/talos-compat.gguf`, così il modello
  attraversa anche picker, composer, adapter e rendering della chat reale;
- acquisisce uno screenshot ADB per ogni famiglia eseguita, lo ispeziona alla
  risoluzione originale e pulisce il namespace UI prima del caso successivo;
- raccoglie backend, contesto effettivo, token, durata, memoria e stage;
- pulisce in `finally` host e entrambi i namespace device allowlisted;
- rifiuta target fuori namespace;
- registra gated skip separatamente.

Il modulo ESM `run-local-model-compatibility.mjs` espone soltanto i due helper
testabili `resolveSelectedCases(manifest, requestedIds)` e
`assertSafeCampaignRelativePath(manifest, relativePath)`; il main CLI resta
protetto da un import guard. Nel device test il metodo pubblico esistente
`appliesEmbeddedTemplateAndGeneratesAVisibleReply()` è il gate della fixture e
riceve/controlla/proietta la fixture; il nuovo test pubblico
`cleansCompatibilityCampaignFiles()` elimina soltanto native target e UI target
del `talosCaseId`. Sono API del solo test APK, non API di prodotto.

Un caso è PASS soltanto se:

1. hash/byte coincidono;
2. open produce un engine;
3. template embedded produce un prompt non vuoto;
4. generation ritorna testo non vuoto e almeno un token;
5. close termina senza crash;
6. namespace campagna è vuoto dopo cleanup.

### 9.1 Qualità minima dell'evidenza chat

Il manifest può dichiarare `prompt` per un caso quando la model card primaria
limita esplicitamente la lingua o il formato accettabile; in assenza del campo
resta il prompt italiano comune. C1 usa un task inglese perché SmolLM2-360M è
dichiarato principalmente anglofono.

La risposta resta output non modificato del prodotto, ma non può diventare
evidenza PASS se riproduce i marker interni `TALOS_MEMORY_CONTEXT`, `MEMORY 1` o
`USER_TASK`: il runner deve fermare quel caso, conservare la diagnosi e non
avanzare al modello successivo. Il prodotto non applica post-filtri o riscritture
per soddisfare questa regola del banco di prova.

### 9.2 Prompt ordinario locale a basso carico

`buildTalosSystemPrompt(tone, identity)` mantiene la forma attuale per ogni
provider non locale. Per `identity.provider === 'local'` produce invece un
prompt compatto che contiene soltanto:

- identità TALOS, autore AVM e nome del modello locale attivo;
- risposta diretta nella lingua dell'ultimo task;
- frammento del tono selezionato;
- immagini e memoria come dati non fidati;
- divieto di ripetere istruzioni di sistema, marker di contesto o memoria salvo
  richiesta esplicita dell'utente.

Non contiene il protocollo `[TONE_SUGGESTION: ...]`; l'estrattore resta
compatibile se un modello lo emette spontaneamente. Il limite testabile è 600
caratteri, senza nuove API pubbliche.

### 9.3 Confine di errore della grammatica tool

`applyGrammar(talos_session *)` non può lasciare attraversare JNI alcuna
eccezione generata da `common_sampler_init`. Il comportamento richiesto è:

1. provare il sampler con grammatica, trigger e token preservati restituiti dal
   template;
2. se l'upstream restituisce `nullptr` o lancia `std::exception`, registrare la
   causa senza includere prompt, schema o dati utente;
3. ricostruire il sampler dai parametri base della sessione, quindi senza
   grammatica, trigger o token preservati;
4. proteggere anche questa seconda inizializzazione; se fallisce, conservare il
   sampler precedente e lasciare comunque vivo il processo;
5. sostituire il sampler precedente soltanto dopo una costruzione completa.

Il fallback non rimuove i tool dal prompt e non disabilita il parser del
template: la chiamata resta riconoscibile se il modello la produce da sé, ma
non è più garantita per costruzione in quel turno. Non cambiano firme JNI/Java,
capability pubbliche o pin llama.cpp.

### 9.4 Piano prompt e rialzo contestuale bounded

Il bridge del template espone un piano non sensibile:

```ts
interface TalosLocalEngineChatPlan {
    prompt: string
    promptTokens: number
    contextTokens: number
}
```

`promptTokens` è contato dal tokenizer del modello con gli stessi flag usati da
`nativeGenerate`; non è una stima da byte o caratteri. Il simbolo esistente
`talosLocalEngineChatPrompt()` resta compatibile e proietta soltanto `prompt`.

La chat apre inizialmente a `4096`. Prima della generazione calcola
`promptTokens + maxTokens + 1`. Se il totale non entra:

1. sceglie il power-of-two successivo;
2. rifiuta se supera `TALOS_LOCAL_MAX_CONTEXT_TOKENS = 8192`;
3. altrimenti riapre esattamente a quel contesto, senza fallback più piccolo;
4. ricostruisce il piano perché template, parser e sampler appartengono alla
   nuova sessione;
5. genera soltanto se il secondo piano entra.

I tool offerti non cambiano. Nessuna schema selection euristica, troncamento
silenzioso o aumento preventivo di memoria è ammesso.

### 9.5 Eccezioni di generazione tipizzate

Il worker Capacitor è un boundary di processo. `TalosLlamaPlugin.generate()`
deve:

- preflightare il budget con `TalosLocalContextBudget`;
- rifiutare `TALOS_LLAMA_CONTEXT_REQUIRED` con soli interi di budget;
- intercettare ogni `RuntimeException` di tokenizzazione/decode/parser e
  rifiutare `TALOS_LLAMA_GENERATION_FAILED` senza prompt o schema;
- fermare e riunire il watcher anche sul fallimento;
- ripristinare `generating=false` in un `finally` esterno;
- non risolvere mai la stessa call dopo averla rifiutata.

TypeScript normalizza questi codici in `TalosLocalEngineGenerationError`; il
provider adapter li traduce in `TalosMobileProviderError` localizzato.

### 9.6 Logging bridge fail-closed

La fonte di verità è `capacitor.config.ts` e dichiara globalmente
`loggingBehavior: 'none'`. L'asset Android è output di `cap sync`, non una
seconda configurazione mantenuta a mano. Il contratto vale anche per build
debug: nessun payload di plugin, valore Secure Storage, header HTTP o console
WebView deve essere scritto da Capacitor in Logcat. I log nativi TALOS possono
continuare a riportare stage, conteggi e codici, mai prompt, schema o segreti.

## 10. Theme Engine, accessibilità e responsive

- nessuna nuova variabile visuale locale;
- i componenti nuovi e le due righe locali entrano in
  `modelLabThemeTokenContract.test.ts`;
- touch target invariato 48dp;
- reduced motion elimina transizioni non essenziali tramite i token esistenti;
- phone gate: dispositivo fisico con override 1080×2376/density 480,
  viewport 360×792/DPR 3;
- tablet gate: geometria nativa 2400×3392/density 420;
- l'override viene sempre ripristinato, anche su errore;
- screenshot e manifest sono tracciati, privi di PII/token e obbligatori per
  ogni slice.

## 11. Stati di completamento

```text
PLANNED
→ RED PROVEN
→ GREEN FOCUSED
→ GREEN REGRESSION
→ GREEN UPSTREAM
→ GREEN DEVICE
→ IMPLEMENTED
```

Nessuna slice è `IMPLEMENTED` senza screenshot del dispositivo fisico. La
campagna modelli non è sostituita da mock, unit test o model load su host.

## 12. Compatibilità e fuori scope

Restano stabili:

- tutte le route Model Lab e il deep link legacy;
- provider key e secure store;
- filtro semantico, fit RAM/disco, revision e SHA;
- massimo due download attivi e coda durevole;
- import, rename, delete, copy path e leftovers;
- tool `local_model_*` e forma canonica delle loro risposte;
- APK side-by-side `ai.talos.dev`;
- budget 600000 JS / 220000 CSS.

Fuori scope: OAuth, desktop, concorrenza oltre due, database nuovo, GPU/Vulkan,
upgrade llama.cpp preventivo e cancellazione di file non nominati dal gate.
