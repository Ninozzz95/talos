# Model Lab mobile — ricerca tranche correttiva pre-Fase 5

Data: 2026-08-05
Lane posseduta: `mobile` soltanto
Stato ricerca: COMPLETE — fonti primarie e upstream pin verificati
Fase OAuth: invariata, `DEFERRED` finché non esiste un dominio verificato

## 1. Domande che questa ricerca deve chiudere

Questa tranche nasce da quattro difetti osservati dall'owner sul prodotto vero:

1. Model Lab è sopra la riga account nelle Impostazioni invece che dentro
   **Intelligenza**, subito sotto il nome utente;
2. un download locale è visibile soltanto nella pagina che lo ha avviato e non
   esiste un Download Center globale in chat, drawer, Model Lab e tablet;
3. lista locale e dettaglio repository sono ancora troppo alti e cartacei per
   360×792;
4. una chat con modello locale può terminare con
   `TALOS_LLAMA_OPEN_FAILED`, senza causa né recupero.

L'owner ha aggiunto un contratto esplicito durante l'analisi: i chip filtro non
devono mai andare a capo. Devono restare in una sola riga e scorrere
orizzontalmente.

La ricerca deve inoltre definire una campagna reale, sequenziale e cancellabile
di GGUF Hugging Face, una famiglia alla volta, senza occupare stabilmente lo
storage dell'owner e senza toccare i suoi modelli già installati.

## 2. Evidenza locale prima del progetto

### 2.1 Impostazioni

`TalosMobileSettingsCenter.vue` rende oggi, in quest'ordine:

```text
Model Lab (RouterLink autonomo)
Account / nome utente
Intelligence
  AI Defaults
  Agent Tools
...
```

`TALOS_MOBILE_SETTINGS_GROUPS` esclude intenzionalmente `models`, e due test
permanenti impongono ancora quell'esclusione. Sul tablet le destinazioni inline
sono un `tablist`, mentre Model Lab è un link esterno al tablist.

Mettere semplicemente il link dentro quel `tablist` sarebbe semanticamente
errato: un link che cambia route non controlla un pannello della stessa vista.
La correzione deve quindi usare una sola grammatica di navigazione/list-detail
anche sul tablet: account in testa, gruppi sotto, link route e pulsanti detail
come destinazioni sorelle, `aria-current` per la destinazione inline e normale
ordine Tab. Il pannello resta affiancato alle larghezze ampie; cambia la
semantica della rail, non il layout adattivo.

### 2.2 Trasferimenti

Il download nativo ha già riserva preventiva, Range resume, checkpoint hash,
verifica SHA-256, UIDT da API 34 e foreground service precedente. Il difetto non
è l'assenza di un downloader: è l'assenza di un'unica sorgente durevole del suo
stato.

Fatti trovati nel codice corrente:

- `TalosMobileLocalModels.vue` e `TalosMobileLocalRepoDetail.vue` hanno due
  poller distinti da 1 secondo e due card di progresso duplicate;
- `localModels.ts` conserva la richiesta da riprendere in
  `resumableTransfer`, solo in memoria JavaScript;
- `TalosTransferSession` conserva la richiesta attiva solo in campi statici
  Java;
- i byte e lo stato hash sono durevoli nei sidecar, ma repo, revision, lista
  file, dimensioni, hash, nome, runner e fase non lo sono;
- `stop()` significa contemporaneamente pausa utente e stop di sistema;
- `TalosModelTransferJob.finished("stopped")` chiede sempre retry. Una pausa
  utente può quindi essere rischedulata immediatamente;
- dopo process death il job rischedulato non trova più
  `TalosTransferSession.active()`;
- la notifica chiama l'azione **Stop** benché la promessa UI sia **Pausa**;
- il deep link di completamento usa ancora `/settings?tab=models` invece della
  pagina locale canonica.

Questi sono difetti funzionali, non rifiniture del dropdown. Un Download Center
globale costruito sullo stato attuale renderebbe globale una risposta non
durevole.

### 2.3 UI locale

La prova fisica Fase 4 a 360×792 mostra:

- cinque filtri in due righe alte;
- due select in una terza riga;
- risultati come card separate, con tre righe di metadata e una barra fit;
- dettaglio repository con card README molto alta;
- ogni variante come card grande con due pulsanti full-width in colonna.

Il test `localModelsSection.test.ts` contiene perfino il contratto opposto alla
nuova direttiva: `wraps complete filter labels without a horizontal scrolling
rail`. Questo test va trasformato nel RED permanente della rail single-line.

### 2.4 Runtime locale

La sessione esportata dall'owner contiene due eventi consecutivi:

```text
SYSTEM TALOS_LLAMA_OPEN_FAILED
```

Il percorso del difetto è concreto:

- Model Lab giudica per difetto a `4096` token;
- `localAdapter.ts` apre sempre la chat a `16384` token;
- `TalosLlamaPlugin` traduce qualunque `nativeOpen() == 0` nello stesso
  `TALOS_LLAMA_OPEN_FAILED`;
- il JNI distingue internamente almeno model load, context e sampler, ma perde
  lo stadio al confine JavaScript;
- sul OnePlus il Qwen3.5 4B si apre a entrambe le dimensioni, ma a 16384 ha
  mostrato pressione estrema: circa 4,1 GB PSS e 2,78 GB swap, con circa 1,9 GB
  disponibili.

La spiegazione più probabile del caso utente è quindi una deriva fra il
verdetto a 4096 e l'apertura a 16384, non un'architettura Qwen non supportata.
Il pin llama.cpp corrente dichiara nel codice le architetture `llama`, `qwen3`,
`phi3`, `gemma3`, `granite`, `granitehybrid` e `lfm2`.

## 3. Fonti primarie correnti e decisioni upstream

### 3.1 Settings e layout adattivo

- [Android Settings](https://developer.android.com/design/ui/mobile/guides/patterns/settings)
  richiede raggruppamenti prevedibili e label che corrispondono alla
  destinazione;
- [Android list-detail](https://developer.android.com/develop/adaptive-apps/guides/list-detail)
  usa una pane sulle compact width e due pane sulle larghezze ampie;
- [Android canonical layouts](https://developer.android.com/develop/ui/views/layout/canonical-layouts)
  mantiene il detail raggiungibile anche da deep link.

Decisione: **ADAPT** la rail Settings esistente a navigazione/list-detail
uniforme. Nessun package e nessuna route nuova.

### 3.2 Chip in una sola riga

- [`ChipGroup#setSingleLine`](https://developer.android.com/reference/com/google/android/material/chip/ChipGroup#setSingleLine(boolean))
  dichiara esplicitamente che un gruppo single-line deve essere contenuto in un
  `HorizontalScrollView` per lo scorrimento;
- [`HorizontalScrollView`](https://developer.android.com/reference/android/widget/HorizontalScrollView)
  è il contenitore nativo a figlio singolo per contenuto più largo della
  viewport;
- [WCAG 2.2 — Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
  richiede che un elemento focalizzato non rimanga nascosto.

Decisione: **ADOPT** il pattern single-line + horizontal overflow. Nel WebView:
`flex-nowrap`, `overflow-x-auto`, `overscroll-x-contain`, ogni chip `shrink-0`,
ordine DOM invariato e focus nativo che porta l'opzione in vista. Niente snap
obbligatorio e niente scrollbar decorativa che consumi altezza.

### 3.3 Top app bar e popover

- [Android app bars](https://developer.android.com/develop/ui/views/components/appbar)
  riserva la barra superiore alle azioni importanti e correnti;
- [Reka UI Popover](https://reka-ui.com/docs/components/popover) gestisce
  portale, focus, collisioni, Escape e ritorno del focus per contenuto ricco;
- il pin già installato è `reka-ui@2.10.1`, tag commit
  `e215b6abe3c4f3368ba09aa37449fa0fcd421316`.

Decisione: **ADOPT** il Popover Reka già pin, non un menu ARIA: progresso,
barra, stato e tre azioni non sono una lista di comandi menu. Il trigger compare
soltanto quando esiste un trasferimento pendente/riprendibile. Il componente è
un chunk lazy perché il JS iniziale è 599981/600000 byte; il tetto non verrà
alzato.

### 3.4 Trasferimenti Android

- [Android user-initiated data transfer jobs](https://developer.android.com/develop/background-work/background-tasks/uidt)
  richiede una notifica visibile, controlli di arresto e persistenza perché il
  processo può essere ucciso senza callback dal Task Manager;
- il codice di riferimento corrente di Google AI Edge Gallery, commit
  `fc3ea98a199d3dc599e97e042c3c46fd86015baa` (Apache-2.0), mantiene lo stato
  download in repository/ViewModel condivisi e usa work unico;
- PocketPal AI, commit
  `4f1ba9bdb32b0b4fbb2c0b6bb8f9cbb0b21da1bc` (MIT), persiste in Room URL,
  destinazione, stato, progresso e riattacca gli observer dopo restart.

Decisione: **ADAPT**, senza copiare codice. TALOS conserva UIDT/service,
riserva, sidecar e verifica propri; aggiunge un journal versionato AVM senza
token, una state machine esplicita e uno store Vue condiviso. **REJECT**
WorkManager/Room aggiuntivi: duplicherebbero scheduler e database senza
risolvere meglio il boundary già esistente.

### 3.5 GGUF, template e runtime

- [Hugging Face GGUF](https://huggingface.co/docs/hub/gguf) definisce GGUF come
  formato self-contained con metadata;
- [Hugging Face chat templates](https://huggingface.co/docs/transformers/chat_templating)
  conferma che modelli diversi richiedono formati diversi e che il template è
  parte del contratto;
- [llama.cpp Android](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md)
  raccomanda di partire con contesto 4096 perché contesti più grandi possono
  produrre picchi di memoria e terminare il processo;
- TALOS è pin a llama.cpp `de699957...`, build/tag `b10218`, e usa già
  `common_chat_templates_apply`/`common_chat_parse`.

Decisione: **ADOPT** 4096 come policy canonica iniziale di chat e fit. Un retry
limitato a un contesto inferiore è ammesso soltanto dopo un errore nativo
tipizzato `context`; nessun retry su file assente, model load, architettura,
sampler o template. Lo stadio nativo deve attraversare JNI, Java, Capacitor e
provider error fino a una frase localizzata e azionabile.

## 4. Modello di interazione deciso

### 4.1 Settings

```text
Account / nome utente

INTELLIGENZA
  Model Lab             → /settings/models
  Predefiniti IA        → pannello affiancato/sostitutivo
  Strumenti agente      → pannello affiancato/sostitutivo
```

Model Lab resta un solo ingresso sotto Settings. Non torna nella navigazione
primaria del drawer.

### 4.2 Download Center

Il trigger è un'icona download con indicatore di attività e label accessibile.
È montato nei cinque chrome reali:

1. header chat classico;
2. chrome immersivo;
3. drawer mobile;
4. sidebar tablet;
5. header del tool sheet, quindi anche Model Lab.

Il pannello mostra una lista di trasferimenti indipendenti: nome, fase,
percentuale, byte, caveat rete, errore e azioni Pausa/Riprendi/Annulla vivono
nella stessa riga del modello a cui si applicano. TALOS ammette al massimo due
worker attivi; le richieste ulteriori restano in una coda durevole. Annulla
richiede conferma inline nella sola riga interessata e rimuove soltanto i
partial appartenenti a quell'ID journalizzato. Pausa non cancella né
rischedula quel trasferimento. Stop di sistema torna `queued` e viene ripreso
dal sistema senza alterare gli altri.

### 4.3 Lista e dettaglio locali

- installati: una lista continua con divider, due righe informative e menu
  trailing; niente card annidate per ogni file;
- browse: ricerca, rail filtri single-line, sort/autore in una sola toolbar;
- repository: gruppi continui e righe compatte, con verdict sempre visibile ma
  metadata secondari ridotti;
- dettaglio: header e sommario README compatti; varianti come righe continue;
  label, dimensione e stato sempre visibili, spiegazioni e controlli secondari
  dietro disclosure; download resta un'azione primaria raggiungibile;
- tablet: stessa grammatica, più spazio orizzontale, non una UI desktop
  duplicata.

Tutte le surface modificate entrano nel gate statico Theme Engine. Nessun
colore, raggio, spacing, durata o fallback visuale locale viene introdotto.

## 5. Matrice Hugging Face sequenziale pin

Ogni riga viene scaricata, verificata, spinta nel namespace di campagna,
aperta, templata, fatta generare, chiusa e cancellata prima della successiva.
I modelli dell'owner sotto `files/models/**` non sono target di cancellazione.

| Caso | Repository @ revision | File | Byte | SHA-256 | Famiglia/licenza |
|---|---|---|---:|---|---|
| C1 | `unsloth/SmolLM2-360M-Instruct-GGUF@391ed11137586e383b1be0fab9acf01d282c2e11` | `SmolLM2-360M-Instruct-Q5_K_M.gguf` | 289944160 | `0d3040f47b83cd279fc653877059829cbd6e17f972f82a03f686f7d5f3834440` | llama / Apache-2.0 |
| C2 | `Qwen/Qwen3-0.6B-GGUF@23749fefcc72300e3a2ad315e1317431b06b590a` | `Qwen3-0.6B-Q8_0.gguf` | 639446688 | `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031` | qwen3 / Apache-2.0 |
| C3 | `LiquidAI/LFM2-350M-GGUF@8fdc9d526b7ed346b19257551b05816c7912ecc2` | `LFM2-350M-Q4_K_M.gguf` | 229309376 | `a4d000c7064bd3b2e42c6845836286a899a4e79cf1791da1a6797b58d575957d` | lfm2 / LFM1.0 |
| C4 | `ibm-granite/granite-4.0-350m-GGUF@b8208a86a58427e1739265318028eb5895b74bf2` | `granite-4.0-350m-Q4_K_M.gguf` | 236985760 | `771c588a49607f274a2bba3185733607ebe6f74b996ab90e2d6bee0d98bcec52` | granitehybrid / Apache-2.0 |
| C5 | `microsoft/Phi-3-mini-4k-instruct-gguf@a64113399c2f6b8ad3e11c394733a2ddadaa7f33` | `Phi-3-mini-4k-instruct-q4.gguf` | 2393231072 | `8a83c7fb9049a9b2e92266fa7ad04933bb53aa1e85136b7b30f1b8000ff2edef` | phi3 / MIT |
| C6 | `bartowski/Llama-3.2-1B-Instruct-GGUF@067b946cf014b7c697f3654f621d577a3e3afd1c` | `Llama-3.2-1B-Instruct-Q4_K_M.gguf` | 807694464 | `6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83` | llama / Llama 3.2 |
| C7 gated | `google/gemma-3-1b-it-qat-q4_0-gguf@d1be121d36172a4b0b964657e2ee859d61138593` | `gemma-3-1b-it-q4_0.gguf` | 1003541152 | `95e5b8d891cd6a794f66c2a6fb59a41e9562b4660560b854274eceffb628b22a` | gemma3 / Gemma |

C7 è condizionale: si esegue soltanto se l'owner ha già accettato la licenza e
fornisce un token autorizzato al processo di campagna. Il token non viene
stampato, salvato nel report o letto dal Keystore dell'app. `SKIPPED_GATED` non
diventa un falso PASS.

## 6. Protocollo di compatibilità

Per ogni caso:

1. verificare byte liberi e pavimento di sicurezza;
2. scaricare da URL HF revision-pinned in una directory temporanea unica;
3. calcolare byte e SHA-256 prima del push;
4. usare soltanto `files/talos-compat/talos-compat.gguf` sul package dev;
5. aprire a policy 4096, registrando contesto effettivo e stadio di eventuale
   fallback;
6. applicare il template embedded a system+user;
7. generare una risposta breve, non vuota, con almeno un token;
8. chiudere esplicitamente il motore;
9. cancellare fixture sul device e file temporaneo host;
10. verificare che non resti nessun file nel namespace campagna e che lo
    storage ritorni entro la tolleranza dichiarata;
11. scrivere esito, durata, memoria, contesto, backend e failure stage nel
    report, senza contenuti sensibili.

Concorrenza massima: **1**. Se open/template/generation fallisce, il caso resta
rosso, la pulizia viene comunque eseguita e il ledger viene emendato prima di
qualsiasi upgrade llama.cpp. Nessun modello dell'owner viene cancellato.

Addendum operativo 2026-08-05: l'owner ha eliminato volontariamente tutti i
GGUF, quindi il baseline reale è zero e non viene trattato come difetto. Per
soddisfare il gate visivo sul dispositivo senza raddoppiare lo storage, dopo il
PASS instrumentation la stessa fixture viene spostata atomicamente dal
namespace nativo `files/talos-compat/talos-compat.gguf` al namespace UI
riservato `files/models/__talos_compat__/<case>/talos-compat.gguf`. Il walker
esistente la rende così selezionabile nella chat reale. Il runner allowlista e
pulisce esclusivamente questi due target; nessun glob può raggiungere altri
modelli. Decisione: **ADAPT** il protocollo locale già pianificato con una
proiezione UI transitoria, mantenendo una sola copia e concorrenza uno.

### Addendum scoped-storage 2026-08-05

La prova sul OnePlus Android 16 ha mostrato che una directory creata
direttamente dall'utente `shell` sotto `Android/data/ai.talos.dev/files` non è
un ingresso affidabile per TALOS: il processo app non ha potuto leggerla. È il
comportamento coerente con
[Android app-specific storage](https://developer.android.com/training/data-storage/app-specific),
che assegna all'app `getExternalFilesDir()` e, da Android 11, isola le directory
app-specific dagli altri processi. L'implementazione AOSP di
[`run-as`](https://android.googlesource.com/platform/system/core.git/+/refs/heads/master/run-as/run-as.cpp)
accetta soltanto package installati e debuggable, poi assume UID/GID e contesto
SELinux dell'app. Sul target reale `run-as ai.talos.dev id` ha restituito
`uid=10385(u0_a385)`, lo stesso UID applicativo.

Decisione upstream: **ADAPT per il solo harness debug**. Il runner verifica
prima `run-as`, trasmette lo stream host via stdin direttamente all'unico target
finale app-owned `files/talos-compat/talos-compat.gguf`, senza server HTTP,
shared storage o seconda copia sul device. Byte e SHA vengono ricontrollati
dall'instrumentation prima dell'open. Dopo il PASS, `run-as` esegue soltanto il
`mv` atomico allowlisted verso
`files/models/__talos_compat__/<case>/talos-compat.gguf`; il `finally` rimuove
quei due target nominativi. Questa tecnica non entra nel prodotto release e il
runner deve fallire chiuso se package, UID, path o build debuggable non
corrispondono.

Correzione successiva, basata sul dry-run fisico: sul firmware Android 16 del
device, `run-as` assume l'UID corretto ma il relativo contesto `fromRunAs` non
attraversa il mount FUSE di `getExternalFilesDir()`; anche `rm -f` su un path
inesistente risponde `Permission denied`. La directory non esisteva: non era un
residuo da cancellare. Il percorso stdin via `run-as` è quindi **REJECTED** per
incompatibilità reale col target.

La sostituzione adotta
[`adb reverse`](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/docs/user/adb.1.md),
contratto AOSP che inoltra una socket TCP del device a una socket host. Il
runner apre un server loopback effimero, crea una reverse nominativa, e il test
instrumentation — eseguito nel vero processo target — riceve lo stream e scrive
direttamente con `getExternalFilesDir()`. Lo stesso test verifica byte/SHA,
apre/template/genera/chiude e infine sposta atomicamente l'unica copia nel
namespace UI. Un secondo test instrumentation pulisce soltanto i due path
calcolati da case ID allowlisted. Decisione: **ADOPT ADB REVERSE + ADAPT nel
test harness**; nessun server entra nell'APK prodotto e la reverse viene rimossa
nel `finally` con `adb reverse --remove`.

## 7. Confini e rifiuti espliciti

- nessun file desktop/control-plane/core/validator;
- nessun commit e nessun push;
- nessun innalzamento del budget iniziale;
- nessuna OAuth anticipata e nessun custom scheme provvisorio;
- nessun token nel journal o nei report;
- nessuna concorrenza non limitata: massimo due worker di download;
- nessuna cancellazione tramite glob fuori dal namespace campagna;
- nessuna dichiarazione di compatibilità basata sul solo model load: servono
  template e generazione reali sul dispositivo fisico.

## 8. Conclusione upstream

La tranche integra direttamente ciò che è già maturo e pin (`reka-ui`, UIDT,
llama.cpp, HF revision/SHA) e mantiene TALOS proprietario di policy, journal,
stati, Theme Engine, evidenza e compatibilità. Non serve un nuovo framework.
Il cambiamento decisivo è togliere le divergenze: una rail, uno stato download,
una policy contesto, un errore tipizzato e una matrice fisica ripetibile.

## 9. Addendum chiuso — accordion, route motion e sezione vuota

Tre requisiti osservati dopo la chiusura della Slice A entrano nella Slice C:

1. accesso Hugging Face con la stessa disclosure e gerarchia visuale dei
   provider API key, incluso logo provider appropriato;
2. transizioni percepibili fra le route Model Lab, senza snap e con
   reduced-motion rispettato;
3. sezione `Su questo dispositivo` assente quando una scansione valida trova
   zero modelli e presente quando ne trova almeno uno.

Ricerca primaria chiusa il 2026-08-05 prima dei RED:

- [WAI-ARIA APG — Accordion](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/)
  definisce un `button` nell'heading, `aria-expanded`, `aria-controls`,
  Enter/Space e contenuto panel nel normale ordine Tab;
- [Vue — Transition](https://vuejs.org/guide/built-ins/transition.html)
  documenta il boundary built-in, `mode="out-in"`, key per forzare una vera
  sostituzione e l'uso performante di `transform` + `opacity`;
- [WCAG C39 — `prefers-reduced-motion`](https://www.w3.org/WAI/WCAG22/Techniques/css/C39)
  richiede di sopprimere il motion interattivo quando il sistema lo domanda;
- [Android — State and Jetpack Compose](https://developer.android.com/develop/ui/compose/state)
  conferma la composizione dichiarativa condizionale: se uno stato non deve
  essere mostrato quando il valore è vuoto, la UI va emessa soltanto nel ramo
  corrispondente;
- [Apple HIG — Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles)
  rafforza la decisione multipiattaforma: ogni elemento deve guadagnarsi il
  proprio spazio, contenuto non necessario deve cadere via e aspetto/interazione
  già stabiliti vanno applicati in modo coerente.

Decisioni upstream:

1. **ADOPT** il contratto APG sullo stesso pattern provider già posseduto da
   TALOS. L'header HF diventa il solo button della heading, collapsed di
   default, con logo provider e status persistente; il form sicuro resta nel
   panel e nessuna credenziale cambia store o lifecycle.
2. **ADOPT DIRECTLY** Vue **3.5.40** `<Transition mode="out-in">`, già pin
   esatto. La key è la route Model Lab, si animano soltanto `transform` e
   `opacity` attraverso i token Theme Engine esistenti, non altezza/margini.
   Il media query reduced-motion disabilita trasformazione e durata; focus e
   Back restano contratti router, non side effect dell'animazione.
3. **ADAPT** la composizione condizionale: dopo una scansione valida a zero la
   sezione installati non viene emessa; durante loading/failure si conserva la
   distinzione e l'ultimo elenco valido. Il catalogo sotto resta il percorso
   d'azione, quindi non serve una seconda empty card ridondante.

Nessuna dipendenza nuova. Gate: unit semantici/keyboard/state, E2E route con e
senza reduced motion, screenshot fisico collapsed/expanded, transizione
terminata e local-zero; tutti i file UI toccati entrano nel gate Theme Engine.

## 10. Addendum chiuso — label naturale per `memory_write`

Data verifica fonti: 2026-08-05.

Difetto osservato dall'owner: durante una chiamata del tool di scrittura memoria
la riga di attività della chat espone il wire identifier `memory_write` invece
di una frase naturale localizzata.

Ispezione locale:

- `TalosMobileStreamingReply.vue` risolve già le righe tramite
  `TALOS_TOOL_LABEL_KEYS` e `talosToolActivityLabel(...)`;
- `mobile/src/lib/tools/toolLabels.ts` non contiene `memory_write` in
  `TALOS_TOOL_LABELS`, `TALOS_TOOL_LABEL_KEYS` e `TALOS_TOOL_ICONS`, quindi il
  fallback intenzionale per tool sconosciuti rende l'ID tecnico;
- la guardia `EVERY tool...` di `toolLabels.test.ts` non enumera
  `createTalosMemoryWriteTools(...)`, perciò non ha rilevato la regressione;
- le locale possiedono già il titolo del tool di configurazione, ma non una
  label contestuale per l'attività in corso.

Fonti primarie:

- [Android — Localize your app](https://developer.android.com/guide/topics/resources/localization):
  il testo UI deve vivere nelle risorse localizzate, usare uno stile breve,
  amichevole e coerente e va provato sul dispositivo nelle diverse locale;
- [Vue I18n — Message Format Syntax](https://vue-i18n.intlify.dev/guide/essentials/syntax):
  le stringhe mostrate nell'interfaccia vengono risolte da locale message key;
- [Vue I18n — Fallbacking](https://vue-i18n.intlify.dev/guide/essentials/fallback):
  il fallback di locale è esplicito e non deve essere confuso con il fallback
  applicativo all'identificatore di protocollo;
- [WCAG 2.2 — Understanding 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html):
  una riga che comunica l'avanzamento di un processo è informazione di stato e
  deve conservare sufficiente contesto umano anche per tecnologie assistive.

Decisione upstream: **ADAPT** sul boundary AVM esistente, senza dipendenze
nuove. Si conserva `vue-i18n` **11.4.8**, già pin esatto in `package.json` e
`package-lock.json`; il wire identifier resta nei contratti, log e trace, mentre
la sola presentazione usa una nuova key `toolActivity.memoryWrite` in inglese e
italiano. Gli unknown tool continuano a mostrare il proprio nome per non
diventare righe misteriose.

Gate: RED prima della fix in `toolLabels.test.ts` e `streamingUi.test.ts`, con
la factory memoria inclusa nella guardia completa; GREEN in entrambe le locale,
assenza di `memory_write` nel testo reso e screenshot di una vera chiamata
memory-write sul dispositivo fisico. Nessuna modifica al payload, alla policy di
consenso o alla persistenza memoria.

## 11. Addendum build chiuso — boundary del chrome chat

Data verifica fonte e misura: 2026-08-05. Pin esatto: Vite **7.3.6**, già in
`package.json` e `package-lock.json`.

Il primo build reale con il Download Center correttamente emesso come dynamic
entry ha misurato 600431 byte contro il tetto invariabile di 600000. Condividere
la factory fra i cinque chrome non ha corretto la causa (600436). Il resolver
fine module-preload di Vite, provato confinato al solo chunk, ha recuperato 103
byte ma ha lasciato l'entry a 600328 e introdurrebbe un hook sperimentale.

La misura Rollup `renderedLength` ha trovato nel medesimo grafo
`TalosMobileChatOptionsMenu.vue` a 13625 byte pre-minify. Il menu è un controllo
post-boot e viene già usato come componente identico dai chrome classico e
immersivo; il Download Center usa lo stesso momento e la stessa area.

Fonti primarie:

- [Vite — Dynamic Import](https://vite.dev/guide/features.html#dynamic-import):
  Vite mantiene il code splitting e riscrive i dynamic import con preload degli
  import comuni per evitare round trip seriali;
- [Vite — `build.modulePreload`](https://vite.dev/config/build-options.html#build-modulepreload):
  `resolveDependencies(filename, deps, context)` è il boundary supportato per
  filtrare finemente la lista di preload di un singolo dynamic import.
- [Vue — Async Components](https://vuejs.org/guide/components/async.html):
  `defineAsyncComponent(() => import(...))` crea un bundle split point e il
  wrapper inoltra props e slot al componente risolto.

Decisione upstream: **ADOPT DIRECTLY** il boundary Vue stabile già usato nel
progetto. `TalosMobileChatOptionsMenu` diventa async nei due soli consumer;
nome, props, eventi, focus e contenuto non cambiano. Il componente viene
richiesto appena il chrome che lo rende è montato e gli asset sono locali
nell'APK. Il resolver module-preload sperimentale, `@vite-ignore`, l'aumento del
tetto e Reka/store eager sono rigettati.

Gate: `initialChunkContract.test.ts` rifiuta il menu eager, il manifest deve
mostrarlo come dynamic entry, i test header provano props/eventi dopo la
risoluzione async e il build reale resta JS ≤600000 senza modifica del limite.

## 12. Addendum B5 — capacità plugin, non piattaforma simulata

Data verifica fonte e misura: 2026-08-05. Pin esatto: Capacitor **8.4.2**, già
pin esatto in `package.json`, `package-lock.json` e nel runtime installato.

Il primo harness E2E del Download Center impostava
`CapacitorCustomPlatform.name = "android"` per raggiungere il plugin. La pagina
renderizzava il chrome ma il main thread diventava indisponibile: anche una
semplice `page.evaluate()` scadeva. L'ispezione ha provato che il custom platform
sposta l'intero bootstrap web nei rami nativi (SQLite, lifecycle, framing),
quindi il test non stava isolando il trasferimento ma simulando in modo
incompleto un intero container Android.

Fonte primaria:

- [Capacitor 8.4.2 `runtime.ts`](https://github.com/ionic-team/capacitor/blob/8.4.2/core/src/runtime.ts):
  `isPluginAvailable(name)` restituisce vero per una implementazione JS della
  piattaforma corrente oppure per un `PluginHeader` nativo; `registerPlugin`
  instrada poi i metodi dichiarati nell'header a `nativePromise`;
- [release Capacitor 8.4.2](https://github.com/ionic-team/capacitor/releases/tag/8.4.2):
  conferma il tag upstream esatto usato dal lockfile.

Decisione upstream: **ADOPT DIRECTLY** il capability check ufficiale. Il metodo
pubblico `talosTransfersAreSupported()` usa
`Capacitor.isPluginAvailable('TalosModelTransfer')`, non la categoria generica
`isNativePlatform()`. È più fail-closed anche nell'APK: un container nativo che
non registra la classe non espone falsamente il trasferimento. Il test browser
inietta esclusivamente il `PluginHeader` e `nativePromise` del plugin TALOS;
Preferences, SQLite, lifecycle e framing restano nei normali adapter web.

Gate: un RED unitario prova che “native” senza plugin è `unsupported`; l'E2E
prova pausa → reload → resume → cancel e la raggiungibilità nei cinque chrome
senza `CapacitorCustomPlatform`, senza force-click e con `page.evaluate()`
responsivo. Nessuna dipendenza, wire format o comportamento Android cambia.

### Target fisico B5 sostitutivo, owner-safe

L'ispezione reale del tablet ha trovato fra i quattro GGUF dell'owner proprio
`SmolLM2-360M-Instruct-Q5_K_M.gguf`, il target originariamente previsto. Quel
file non entra nel test e non viene cancellato. Per il solo lifecycle del
Download Center si usa un quinto file distinto e molto più piccolo, verificato
il 2026-08-05 tramite API Hub ufficiale:

- repo: `unsloth/SmolLM2-135M-Instruct-GGUF`;
- revision: `9e6855bc4be717fca1ef21360a1db4b29d5c559a`;
- file: `SmolLM2-135M-Instruct-Q2_K.gguf`;
- bytes: `88201792`;
- LFS SHA-256: `c53fe6626c7165ebfd8de5db22edc3f719b813da001e662bc5cb453f2540a076`;
- license dichiarata: Apache-2.0.

La fonte modello primaria è
[la pagina Hub](https://huggingface.co/unsloth/SmolLM2-135M-Instruct-GGUF) e
la metadata API `?blobs=true`; llama.cpp è indicato direttamente dal model
card. Il file resta temporaneo: pausa, process death, resume e cancel devono
eliminare soltanto i suoi slot/journal, lasciando invariati i quattro owner.

Emendamento dopo la prima prova fisica: il file Q2_K da `88201792` byte è
stato scaricato realmente dal tablet, ma ha completato prima del round-trip
necessario a osservare lo stato `paused`. È stato quindi rimosso tramite il
dialogo nominativo di TALOS e la scansione è tornata esattamente ai quattro
GGUF owner. Per provare il lifecycle senza rallentamenti artificiali si usa,
dallo stesso repository e dalla stessa revisione, il file
`SmolLM2-135M-Instruct-F16.gguf`, `270885952` byte, LFS SHA-256
`5157ca60744d21631818364854ac8e4452e1b8022d2ab4c8a2f9cda2344afb30`.
Il comando di pausa viene impartito immediatamente nello stesso flusso fisico
che avvia il trasferimento; process death, ripristino, resume e cancel restano
obbligatori. La cancellazione continua a essere nominativa e limitata al solo
F16 temporaneo.

## 13. Addendum Slice B — due trasferimenti attivi e coda durevole

Data decisione owner e verifica fonti: 2026-08-05.

L'owner ha richiesto che i controlli Pausa/Riprendi/Annulla siano per riga e ha
esplicitato che possono esistere download simultanei. Ha poi scelto, su
raccomandazione tecnica, **massimo due download attivi**; il terzo e i successivi
restano accettati in una coda durevole e partono quando si libera uno slot.

Ispezione locale bloccante:

- `TalosModelTransferPlugin` usa un solo `JOB_ID = 4712`;
- `TalosTransferJournal` schema 1 contiene un solo oggetto;
- `TalosTransferSession` possiede un solo request, worker e stop cause statici;
- Job, service, notifica, service TypeScript, store e popover proiettano tutti
  un unico trasferimento;
- `localModels.ts` rifiuta qualsiasi nuovo download quando la vista legacy
  `transfer.active` è vera.

Fonti primarie correnti:

- [Android — User-initiated data transfer jobs](https://developer.android.com/develop/background-work/background-tasks/uidt)
  dichiara che più UIDT possono essere eseguiti contemporaneamente, richiede
  una notifica e richiede persistenza perché il processo può essere terminato
  senza callback;
- [Android — JobScheduler](https://developer.android.com/reference/android/app/job/JobScheduler)
  stabilisce che pianificare lo stesso job ID sostituisce quello precedente:
  ogni trasferimento deve quindi avere un job ID persistito e distinto;
- [Android — JobParameters](https://developer.android.com/reference/android/app/job/JobParameters)
  espone quel job ID come identificatore del lavoro consegnato al service;
- [Android — Notification groups](https://developer.android.com/develop/ui/views/notifications/group)
  definisce child notification indipendenti e raggruppate per lavori
  simultanei;
- [Android — WorkManager long-running workers](https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/long-running)
  documenta il consumo di quota da Android 16 e rinvia ai UIDT per trasferimenti
  lunghi avviati dall'utente;
- [WAI-ARIA — Accessible names](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/)
  richiede un nome accessibile a ogni controllo; nei controlli ripetuti il nome
  del modello distingue l'oggetto dell'azione;
- [WCAG 2.2 — Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
  fissa il minimo a 24 CSS px o spazio equivalente; TALOS conserva il proprio
  token touch più ampio.

Decisione upstream: **ADAPT** UIDT/JobScheduler direttamente, senza WorkManager
o database aggiuntivi. Android possiede scheduling e rete; TALOS possiede un
registro atomico schema 2, ID stabili, coda e limite `MAX_ACTIVE_TRANSFERS = 2`.
Ogni record ha job ID unico, stop cause e worker indipendenti. API 34+ usa UIDT
per i due slot avviati mentre l'app è visibile e un job non-UIDT per promuovere
in background una richiesta già accettata; API 26–33 mantiene il foreground
service esistente come host di massimo due worker. WorkManager è rigettato per
quota Android 16, duplicazione dello scheduler e nessun vantaggio sul resumable
runner/hash già posseduto da TALOS.

La fase `waiting` significa coda TALOS non ancora consegnata a un host; `queued`
significa consegnata a JobScheduler/service. Il registro v2 conserva entrambe,
migra atomicamente il vecchio oggetto v1 e assegna al record legacy il job ID
4712, così un job già persistito dal sistema non perde il proprio target.
L'identità del trasferimento deriva dalla richiesta canonica repo/revision/file,
non dal nome visuale; un doppio tap sullo stesso set viene rifiutato come
duplicato, mentre quantizzazioni diverse sono trasferimenti distinti.

Il controllo storage diventa una sezione critica: verifica allocatable e
preallocazione dell'intero set sono serializzate, così due worker non possono
entrambi approvare gli stessi byte liberi. Questo non trasforma la campagna
compatibilità in parallela: la matrice §6 resta `maxConcurrency=1` per isolare
famiglia, memoria, template, pulizia e diagnosi.

Gate aggiuntivo: due record reali sul dispositivo API 36, due righe simultanee,
pausa di una senza variazione di fase dell'altra, cancel confinato, terzo record
`waiting` in prova automatizzata, reload/process recreation e zero residui dei
soli target temporanei. Ogni PNG viene ispezionato a pixel originali anche per
clipping, gerarchia, densità, contrasto, overflow e target.

Target fisici pin della sola prova simultanea, entrambi verificati dalla API
Hub ufficiale `revision/...?...blobs=true` il 2026-08-05:

1. `unsloth/SmolLM2-135M-Instruct-GGUF@9e6855bc4be717fca1ef21360a1db4b29d5c559a` / `SmolLM2-135M-Instruct-F16.gguf`,
   `270885952` byte, SHA-256
   `5157ca60744d21631818364854ac8e4452e1b8022d2ab4c8a2f9cda2344afb30`;
2. `LiquidAI/LFM2-350M-GGUF@8fdc9d526b7ed346b19257551b05816c7912ecc2` / `LFM2-350M-Q4_K_M.gguf`,
   `229309376` byte, SHA-256
   `a4d000c7064bd3b2e42c6845836286a899a4e79cf1791da1a6797b58d575957d`.

Per evitare che una rete veloce renda invisibile la simultaneità, ciascun target
viene avviato e subito messo in pausa separatamente; dal Download Center si
riprendono poi entrambe le righe nello stesso flusso e si acquisisce lo stato
contemporaneo. Non vengono introdotti throttling o file finti.

Correzione di baseline owner, successiva alle prove B5: tutti i file GGUF sono
stati cancellati manualmente dall'owner. Una scansione valida a zero modelli è
quindi stato atteso, non bug e non prova di cancellazione TALOS. I gate futuri
registrano l'inventario immediatamente prima della prova e rimuovono solo gli ID
e i path temporanei nominati dal test, senza assumere più “quattro modelli
owner”.

## 14. Addendum review B — rollback dell'orologio di sistema

Data verifica: 2026-08-05.

La review pre-device ha trovato che `Snapshot.copy()` usa direttamente
`System.currentTimeMillis()` mentre il decoder rifiuta `updatedAtMs <
createdAtMs`. La documentazione primaria [Android SystemClock](https://developer.android.com/reference/android/os/SystemClock)
stabilisce che il wall clock può saltare avanti o indietro in modo imprevedibile
per intervento dell'utente o della rete. `elapsedRealtime()` è monotono ma parte
dal boot, quindi non è un timestamp durevole confrontabile dopo riavvio.

Decisione upstream: **ADAPT**. Il journal continua a conservare epoch millis per
diagnostica persistente, ma ogni transizione applica un clamp non decrescente
`max(previousUpdatedAtMs, System.currentTimeMillis())`. Non si introduce un
clock di intervallo né un listener globale: l'ordine FIFO resta quello atomico
dell'array e un cambio ora non può più far scartare un registro valido.

## 15. Addendum review B — riconciliazione host dopo stop/process death

Data verifica: 2026-08-05.

La documentazione primaria [Android JobScheduler](https://developer.android.com/reference/android/app/job/JobScheduler)
stabilisce che `getAllPendingJobs()` include sia job in attesa sia già avviati e
che `getPendingJob(id)` restituisce `null` quando quell'ID non è più schedulato.
Documenta inoltre `PENDING_JOB_REASON_USER` per force-stop/comandi ADB. La guida
[Android UIDT](https://developer.android.com/develop/background-work/background-tasks/uidt)
richiede esplicitamente stato persistente anche quando `onStopJob()` non arriva
e ripristino al successivo `onStartJob()`.

Decisione upstream: **ADAPT** il lookup ufficiale del scheduler dietro il
dispatcher TALOS. Dopo process recreation un record job in stato moving resta
`queued` soltanto se il suo job ID esiste ancora; se Android non possiede più
l'host torna `waiting` e può essere promosso dall'app visibile. Un orphan del
foreground service torna sempre `waiting`. Per API 26–33 uno stop di sistema
terminato con callback persiste direttamente `waiting`, senza auto-riavviarsi
dal background e senza occupare per sempre uno dei due slot.

## 16. Addendum review C — compatibilità della descrizione tool

Data verifica: 2026-08-05.

La reference primaria [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)
definisce la `description` della function come testo usato dal modello per
decidere se chiamarla. La guida primaria
[Anthropic — Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)
conferma che nome, descrizione e JSON Schema entrano nelle tool definitions del
prompt e indica la descrizione dettagliata come il fattore più importante per il
routing corretto. Quindi lasciare «solo un download» mentre il runtime ne
accetta due non è una compatibilità innocua: impartisce al modello un limite
operativo falso.

Decisione upstream: **ADAPT**, senza introdurre un tool v2. Il nome, lo schema
input, le capability e la conferma per ogni singolo download non cambiano; il
risultato mantiene la proiezione legacy `downloading` e aggiunge `downloads[]` e
`maximumActive`. È quindi una estensione compatibile del comportamento, mentre
la descrizione provider deve essere ripinnata consapevolmente nei tre dialetti.
Il digest del control plane deve restare identico: se cambia, la tranche si
ferma perché sarebbe mutata anche l'autorità del tool.

## 17. Addendum evidenza fisica B — target F16 a durata osservabile

Data verifica primaria: 2026-08-05.

La rete reale completava troppo rapidamente i target più piccoli per catturare
in modo affidabile lo stesso trasferimento dal Model Lab, dalla chat e dal
drawer. È stato quindi usato soltanto come target temporaneo di evidenza UI il
file seguente, senza promuoverlo nella matrice di compatibilità runtime:

- repo: `LiquidAI/LFM2-350M-GGUF`;
- revision risolta e bloccata dall'app:
  `8fdc9d526b7ed346b19257551b05816c7912ecc2`;
- file: `LFM2-350M-F16.gguf`;
- bytes: `711482304`;
- LFS SHA-256:
  `379ffdcbf08147c0313f6f1ce7ff558a2bc935eda633f4b46c52347032419c42`.

Fonte primaria:
[pagina Hugging Face revision-specific del file](https://huggingface.co/LiquidAI/LFM2-350M-GGUF/blob/8fdc9d526b7ed346b19257551b05816c7912ecc2/LFM2-350M-F16.gguf).
La pagina ufficiale conferma file, dimensione e digest LFS; la risoluzione del
repository in TALOS ha conservato la stessa revision pin già usata per il
Q4_K_M della prova simultanea.

Decisione upstream: **ADOPT AS TEMPORARY PHYSICAL-EVIDENCE TARGET ONLY**. Il
file serve a rendere osservabili badge, pausa/ripresa e raggiungibilità del
Centro download sui chrome reali. Non è una dichiarazione di compatibilità
open/template/generate e non altera l'ordine della Slice E. Cleanup nominativo
dal controllo TALOS, verifica finale di zero GGUF/sidecar/journal e nessuna
pulizia per glob sono obbligatori; il gate è stato soddisfatto.

## 18. Addendum review visiva C — descrizione mobile e suffissi backend GGUF

Data verifica primaria e fisica: 2026-08-05.

Il gate fisico a 360×792 CSS ha trovato due difetti che il layout tablet non
rendeva evidenti:

1. il riepilogo README occupava quasi metà viewport prima della prima variante;
2. due file distinti comparivano entrambi come `Q4_K_M`.

La [tree ufficiale LiquidAI su Hugging Face](https://huggingface.co/LiquidAI/LFM2-350M-GGUF/tree/main)
conferma che il repository pubblica sia `LFM2-350M-Q4_K_M.gguf` sia
`LFM2-350M-Q4_K_M-hip-optimized.gguf`, con byte diversi. La
[pagina ufficiale del secondo file](https://huggingface.co/LiquidAI/LFM2-350M-GGUF/blob/main/LFM2-350M-Q4_K_M-hip-optimized.gguf)
conserva esplicitamente il suffisso e il digest proprio; eliminarlo dalla label
TALOS perde quindi informazione upstream reale. La configurazione primaria di
[llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/ggml/CMakeLists.txt)
espone HIP come backend separato (`GGML_HIP`), mentre l'APK TALOS corrente
compila soltanto le varianti CPU arm64.

Decisione upstream: **ADAPT, senza inventare incompatibilità**. Il parser dei
set conserva il suffisso dopo la quantizzazione e lo presenta in forma umana
(`Q4_K_M · HIP optimized`), mantenendo path, hash, byte e possibilità di prova.
Non lo nasconde e non lo disabilita: le fonti primarie dimostrano la specificità
HIP, non che il file sia illeggibile dal backend CPU. La successiva matrice
runtime resta l'autorità per open/template/generate.

Per il riepilogo si adatta il progressive disclosure già scelto nel dossier:
massimo due righe visive sul telefono, mentre il README completo resta
raggiungibile nello stesso `details` nativo da 48 dp. Nessun testo viene
eliminato dal DOM/accessibility tree e nessuna dipendenza viene aggiunta.

## 19. Addendum gate fisico C — plurale del conteggio installati

Data verifica primaria e fisica: 2026-08-05.

La prima cattura con un GGUF reale installato ha mostrato `1 modelli`. Il file
era stato scaricato e verificato dal flusso nativo reale, quindi non si tratta
di uno stato artificiale: la stringa singolare errata è un difetto di prodotto
visibile a ogni prima installazione.

La documentazione primaria corrente di
[Vue I18n — Pluralization](https://vue-i18n.intlify.dev/guide/essentials/pluralization)
definisce il formato a scelte separate da `|`, la selezione tramite `t` in
Composition API e gli argomenti impliciti `{count}`/`{n}`. La soluzione non
richiede una biforcazione manuale nel componente né una nuova dipendenza.

Decisione upstream: **ADOPT DIRECTLY**. `installedCount` usa una forma
singolare e una plurale in entrambe le locale; il componente continua a
passare il conteggio al boundary Vue I18n. Il RED permanente prova `1 model`
e `2 models` nel rendering reale, mentre il gate strutturale i18n impedisce
divergenza tra italiano e inglese. La cattura iniziale è respinta e deve essere
rifatta sul dispositivo dopo build e aggiornamento in-place.

## 20. Addendum gate fisico C — target delle azioni locali

Data verifica primaria e fisica: 2026-08-05.

L'apertura reale del menu e del dialogo Rinomina sul viewport 360×792 ha
misurato 48 px per ciascuna voce del menu e per il campo, ma soltanto 32 px per
`Annulla`, `Salva` e per l'azione Importa della pagina. Il testo era leggibile;
il difetto è la superficie realmente toccabile, non la dimensione dell'icona.

La guida primaria corrente
[Android Developers — Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/apps.html)
raccomanda almeno 48×48 dp per ogni elemento interattivo e precisa che i
controlli custom devono applicare esplicitamente il minimo. La guida di design
[Android accessibility foundations](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility)
conferma lo stesso limite anche quando l'area deve estendersi oltre il visual.

Decisione upstream: **ADOPT DIRECTLY THROUGH TALOS TOKENS**. Importa e le
azioni footer di Rinomina/Elimina ricevono
`min-h-[var(--talos-touch-target)]`; non si introducono `48px`, padding ad hoc,
nuove primitive o modifiche globali al componente Button. I test permanenti
controllano il token sui cinque target. Il gate fisico deve poi misurare 48 px
su ogni target e ricatturare dialogo e conferma prima della cancellazione
nominativa del solo GGUF di prova.

## 21. Addendum gate E2E C — stato Hugging Face nel titolo collapsed mobile

Data verifica primaria ed E2E: 2026-08-05.

Il gate Chromium a 360×792 ha dimostrato che `talos-hf-access-status` esiste nel
DOM ma usa `hidden sm:inline`: proprio sul telefono scompare. Gli altri provider
mantengono invece modello/configurazione nel titolo collapsed, quindi la card
Hugging Face non condivide davvero la loro grammatica di stato.

Il pattern primario [WAI-ARIA APG Accordion](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/)
ammette nel titolo una porzione persistente del contenuto nascosto, purché il
button conservi `aria-expanded` e `aria-controls`. La reference primaria
[Android Material 3 `ListItem`](https://developer.android.com/reference/kotlin/androidx/compose/material3/ListItem.composable)
modella il testo secondario come `supportingContent` sotto il contenuto
principale e riserva il trailing content alle azioni/meta compatte.

Decisione upstream: **ADAPT NEL BOUNDARY TALOS ESISTENTE**. Lo stato token entra
nel blocco testuale della disclosure come supporting line sempre visibile; logo
e chevron restano leading/trailing, descrizione, secure-store e form non
cambiano. Nessuna breakpoint visibility, stringa nuova, dipendenza o colore
letterale. Il RED permanente prova DOM e geometria a 360 px; il gate fisico
richiede screenshot collapsed/expanded sulla build aggiornata.

## 22. Addendum C1 — lingua dichiarata e rifiuto dell'eco del contesto

Data verifica primaria, upstream e device: 2026-08-05.

Il secondo screenshot fisico C1, pur pulito dalla chat precedente, ha mostrato
nel corpo della risposta `TALOS_MEMORY_CONTEXT`, `MEMORY 1` e parte delle
memorie iniettate. L'immagine è rifiutata come prova finale. L'ispezione del
percorso nativo conferma però che `nativeGenerate` azzera il contesto, decodifica
il prompt e aggiunge a `answer` soltanto i token campionati dopo il prompt: non
esiste concatenazione TALOS prompt→reply.

Fonti primarie correnti:

- la [model card originale SmolLM2-360M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct)
  dichiara che il modello comprende e genera principalmente inglese e mostra
  l'uso di `apply_chat_template(..., add_generation_prompt=True)`;
- il
  [`tokenizer_config.json` originale](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/blob/main/tokenizer_config.json)
  definisce ChatML e il marker finale `<|im_start|>assistant\n`;
- il runtime confrontato è il rilascio ufficiale llama.cpp
  [`b10218`](https://github.com/ggml-org/llama.cpp/releases/tag/b10218), commit
  `de699957b92f490efebad149665b0dccf127eaff`, identico al submodule mobile;
- il GGUF confrontato è rimasto il pin C1
  `unsloth/SmolLM2-360M-Instruct-GGUF@391ed11137586e383b1be0fab9acf01d282c2e11`,
  `289944160` byte, SHA-256
  `0d3040f47b83cd279fc653877059829cbd6e17f972f82a03f686f7d5f3834440`.

Il confronto diretto con `llama-cli b10218` e gli stessi parametri di sampling
ha prodotto risposte italiane instabili/incoerenti su tre seed, mentre il task
inglese documentato ha prodotto risposte senza eco dei marker interni. Questo
classifica il primo output come limite di qualità del modello 360M sul task
italiano, non come prompt echo del runtime.

Decisione upstream: **ADAPT NEL SOLO HARNESS**. C1 dichiara nel manifest un
prompt inglese coerente con la model card; gli altri casi mantengono il prompt
di default finché le rispettive fonti non richiedono altro. Il runner rifiuta
automaticamente come evidenza una reply che contenga i marker interni
`TALOS_MEMORY_CONTEXT`, `MEMORY 1` o `USER_TASK`. Non viene introdotto alcun
filtro nel prodotto: alterare o nascondere genericamente output del modello
per rendere bello uno screenshot sarebbe perdita di informazione e coprirebbe
un vero limite di compatibilità.

## 23. Addendum C1 — prompt ordinario compatto per il provider locale

Data verifica device e decisione upstream: 2026-08-05.

Il rerun C1 con task inglese ha superato native, adapter e chat, ma lo screenshot
original-pixel ha mostrato una copia quasi letterale della identity line del
system prompt (`The underlying language model serving this session...`, `When
asked who you are...`). Geometria e controlli sono corretti; il difetto è nel
contratto inviato a un modello 360M, non nel rendering.

La fonte primaria SmolLM2 §22 mostra esempi intenzionalmente minimi: una lista
breve di messaggi e `add_generation_prompt=True`; dichiara inoltre il 360M
principalmente anglofono. Il confronto ufficiale `llama-cli b10218` già
eseguito ha risposto senza eco quando il system prompt è stato ridotto a identità,
task diretto e confine memoria. Non esiste un pacchetto upstream da integrare:
il punto di adattamento corretto è il builder AVM già proprietario del prompt.

Decisione upstream: **ADAPT DIETRO `buildTalosSystemPrompt`**. Solo quando
`identity.provider === 'local'`, il prompt ordinario conserva identità TALOS,
autore AVM, modello attivo, lingua del task, tono scelto, difesa immagini e
confine memoria, ma elimina il protocollo di suggerimento tono e le spiegazioni
ridondanti. I provider remoti e i prompt specialistici di ricerca/tool non
cambiano. Non si post-filtra la reply: il runner amplia soltanto il rifiuto
dell'evidenza alle frasi interne note, così una futura regressione fallisce
visibilmente.

## 24. Addendum C2 — grammatica tool invalida non può attraversare JNI

Data verifica upstream e device: 2026-08-05.

Il caso C2, `Qwen/Qwen3-0.6B-GGUF@23749fefcc72300e3a2ad315e1317431b06b590a`
(`Qwen3-0.6B-Q8_0.gguf`, `639446688` byte, SHA-256
`9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`),
ha superato download, integrità, open, template e generazione nel processo
target. Il percorso chat reale, che offre il toolset TALOS, ha invece chiuso la
WebView. `ApplicationExitInfo` registra `APP CRASH(NATIVE)`, status `6`; il
tombstone registra `SIGABRT` e l'abort message `std::runtime_error: failed to
parse grammar`. I primi frame applicativi sono `common_sampler_init` e
`Java_ai_talos_TalosLlamaNative_nativeApplyChatTemplate`.

Fonti primarie correnti:

- il sorgente ufficiale del commit pinnato
  [`common/sampling.cpp`](https://github.com/ggml-org/llama.cpp/blob/de699957b92f490efebad149665b0dccf127eaff/common/sampling.cpp#L187-L264)
  mostra che una grammatica non compilabile produce `throw
  std::runtime_error("failed to parse grammar")`, non `nullptr`;
- il server ufficiale dello stesso commit
  [`server-context.cpp`](https://github.com/ggml-org/llama.cpp/blob/de699957b92f490efebad149665b0dccf127eaff/tools/server/server-context.cpp#L1807-L1815)
  avvolge `common_sampler_init` in `try/catch` e converte l'eccezione in errore
  di richiesta, senza terminare il processo;
- l'issue upstream aperto
  [#25967](https://github.com/ggml-org/llama.cpp/issues/25967) documenta
  grammatiche GBNF auto-generate invalide con liste ampie di tool e regole
  duplicate; la riproduzione upstream fallisce con lo stesso messaggio e non ha
  ancora una PR associata.

Il controllo `rebuilt == nullptr` attuale in TALOS non implementa quindi il
contratto descritto dal commento locale: l'eccezione esce dalla funzione JNI e
Android abortisce l'intero processo. Un upgrade opportunistico non è accettato:
il difetto dell'autogeneratore è ancora aperto e cambiare il pin allargherebbe
la matrice senza risolvere il confine di sicurezza.

Decisione upstream: **ADAPT DIETRO IL CONFINE JNI**. `applyGrammar` intercetta
ogni `std::exception` di inizializzazione, registra il motivo e ricostruisce il
sampler dai parametri base senza grammatica. Prompt, parser e tool restano
quelli prodotti dal template del modello: si perde soltanto il vincolo GBNF per
quel turno, non la risposta né la possibilità di riconoscere una tool call.
Anche il fallback resta protetto: nessuna eccezione C++ può attraversare JNI.
Il pin llama.cpp `b10218/de699957b` non cambia.

## 25. Addendum C2 — budget del prompt tool e confine asincrono Android

Data verifica primaria e device: 2026-08-05.

Il rerun C2 successivo alla correzione della grammatica dimostra che il primo
difetto è chiuso: il log nativo registra il fallback senza grammatica e il
processo supera `nativeApplyChatTemplate`. Il percorso chat reale incontra poi
un secondo difetto indipendente: il prompt prodotto dal template Qwen con i 20
tool TALOS misura `5779` token contro un contesto aperto a `4096`. Il controllo
corretto in `nativeGenerate` solleva `TALOS_LOCAL_PROMPT_TOO_LONG`, ma
`TalosLlamaPlugin.generate()` esegue il native call in un `ExecutorService`
senza intercettare l'eccezione. Android registra quindi `APP CRASH(EXCEPTION)`
e chiude l'app invece di rifiutare la Promise Capacitor. C3 non è stato avviato.

Fonti primarie correnti:

- la [model card ufficiale Qwen3-0.6B-GGUF](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF)
  dichiara un contesto nativo di `32768` token e supporto agent/tool; `8192` è
  quindi dentro il contratto del modello;
- la guida ufficiale
  [llama.cpp Android](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md)
  raccomanda di iniziare su telefono con un contesto ragionevole, per esempio
  `4096`, perché valori più alti possono produrre picchi di memoria;
- la reference ufficiale
  [llama.cpp context management](https://github.com/ggml-org/llama.cpp/blob/master/tools/completion/README.md#context-management)
  distingue `--ctx-size` dal batch e richiede che input e output condividano la
  stessa finestra;
- la guida ufficiale
  [Capacitor Android Plugin](https://capacitorjs.com/docs/plugins/android#returning-data-back)
  stabilisce che un fallimento del plugin deve terminare con `call.reject()`;
- la reference Android
  [`Thread.UncaughtExceptionHandler`](https://developer.android.com/reference/java/lang/Thread.UncaughtExceptionHandler)
  conferma che un'eccezione non intercettata termina bruscamente il thread;
  nell'app osservata il default handler Android termina l'intero processo.

Decisione upstream: **ADAPT DIETRO I BOUNDARY TALOS ESISTENTI**. Il modello si
apre ancora a `4096`; dopo il template, il native conta gli stessi token che
`nativeGenerate` decodificherà e il bridge restituisce prompt, conteggio e
contesto. Soltanto se prompt più riserva di output non entrano, l'adapter riapre
una volta lo stesso modello al successivo power-of-two, con tetto mobile
`8192`, ricostruisce il prompt e continua. Non si riducono i 20 tool, non si
tronca la conversazione e non si tenta il fallback `2048` quando si sa già che
serve più contesto. Ogni eccezione runtime del worker viene inoltre convertita
in un rifiuto Capacitor tipizzato; nessuna eccezione Java può uscire dal task.
Il pin llama.cpp resta `b10218/de699957b`.

## 26. Addendum sicurezza — payload e credenziali nei log Capacitor

Data scoperta device e verifica upstream: 2026-08-05.

Durante la diagnosi C2, una query Logcat troppo ampia ha mostrato che il bridge
debug scrive integralmente payload plugin e header HTTP. I valori osservati non
sono riportati, copiati o hashati in alcun artefatto. È una regressione di
confidenzialità ad alta priorità: lo storage resta cifrato a riposo, ma una
lettura o richiesta attraversa un canale di log accessibile agli strumenti di
debug del dispositivo.

Fonti primarie correnti e pin esatto:

- TALOS usa Capacitor `8.4.2`, pin diretto in `mobile/package.json`;
- il sorgente ufficiale
  [`Bridge.java@8.4.2`](https://github.com/ionic-team/capacitor/blob/8.4.2/android/capacitor/src/main/java/com/getcapacitor/Bridge.java#L816-L837)
  concatena `call.getData().toString()` al campo `methodData` quando il logger è
  attivo; questo include per costruzione i payload dello storage e gli header
  consegnati ai plugin HTTP;
- il sorgente ufficiale
  [`CapConfig.java@8.4.2`](https://github.com/ionic-team/capacitor/blob/8.4.2/android/capacitor/src/main/java/com/getcapacitor/CapConfig.java)
  usa `debug` come default e traduce `none` in `loggingEnabled=false`;
- la [configurazione ufficiale Capacitor](https://capacitorjs.com/docs/config#schema)
  avverte esplicitamente che il logging può perdere informazioni sul device e
  definisce `none` come “logs are never produced”.

Decisione upstream: **ADOPT DIRECTLY**. TALOS imposta globalmente
`loggingBehavior: 'none'` nella fonte `capacitor.config.ts`; `cap sync` deve
materializzare lo stesso valore nell'asset Android. Non si patcha `node_modules`,
non si mantiene una denylist fragile di nomi header e non si considera il debug
un'eccezione alla protezione dei segreti. Il gate fisico usa soltanto marker
sintetici e conteggi, mai credenziali reali; le chiavi presenti prima della
correzione devono essere considerate esposte al canale di debug e ruotate
dall'owner dopo la consegna.

## 27. Addendum C3 — falso PASS causato dal footer del messaggio

Data scoperta device e verifica primaria: 2026-08-05.

Il primo run C3 LFM2 genera nel corpo soltanto «Calo la risposta che risponde
concettualmente all'utente.»: non contiene il marker richiesto `TALOS`. Il
runner legge però `innerText()` dell'intero `article`; il footer dello stesso
articolo contiene il brand/provider `TALOS`, quindi il report conserva un falso
PASS. Inoltre il runner vieta gli echo interni ma non impone esplicitamente il
marker positivo dichiarato da tutti i prompt della matrice.

Fonte primaria e pin:

- TALOS usa `@playwright/test` `1.61.1`;
- la documentazione ufficiale
  [Playwright Locators](https://playwright.dev/docs/locators) raccomanda
  locatori espliciti, inclusi test id e locatori relativi al contenitore;
- la reference ufficiale
  [`Locator.innerText`](https://playwright.dev/docs/api/class-locator#locator-inner-text)
  chiarisce che il valore è l'`innerText` dell'elemento selezionato: scegliere
  l'intero articolo include quindi per definizione tutti i discendenti visibili;
- il DOM TALOS possiede già il boundary stabile
  `data-testid="talos-mobile-message-content"`, separato da footer e azioni.

Decisione upstream: **ADAPT NEL RUNNER TALOS**. La verifica seleziona il test id
del solo contenuto dentro l'ultimo articolo assistant, normalizza quel testo e
applica sul medesimo valore sia il marker obbligatorio `TALOS` sia la denylist
degli echo. Il report conserva soltanto il corpo modello. Non si altera il DOM,
non si nasconde il footer e non si usa OCR come sostituto del contratto; lo
screenshot fisico rimane il controllo indipendente che ha scoperto il bug.

## 28. Addendum C3/C5 — la lingua del fixture deve stare nel model contract

Data verifica primaria: 2026-08-05.

Il runner usava italiano per ogni caso privo di `prompt`. Questo non è un
contratto portabile fra famiglie: il modello C3 ha fallito due volte il marker
durante una richiesta italiana che il suo upstream non dichiara supportata.

Fonti primarie correnti:

- la [model card LiquidAI LFM2-350M](https://huggingface.co/LiquidAI/LFM2-350M)
  elenca inglese, arabo, cinese, francese, tedesco, giapponese, coreano e
  spagnolo, non italiano; documenta inoltre template e tool-use nativi;
- la [model card IBM Granite 4.0 350M](https://huggingface.co/ibm-granite/granite-4.0-350m)
  include esplicitamente italiano fra le dodici lingue supportate;
- la [model card Microsoft Phi-3 Mini 4K Instruct](https://huggingface.co/microsoft/Phi-3-mini-4k-instruct)
  definisce l'uso primario in inglese e il formato chat Phi-3;
- la [model card Meta Llama 3.2 1B Instruct](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct)
  è il contratto upstream della famiglia C6 e dichiara otto lingue;
- la [model card Google Gemma 3 1B IT](https://huggingface.co/google/gemma-3-1b-it)
  dichiara supporto in oltre 140 lingue.

Decisione upstream: **ADAPT IL FIXTURE, NON IL MODELLO**. Ogni entry pin della
matrice dichiara un prompt non vuoto. C3 e C5 usano inglese; C2, C4, C6 e C7
mantengono italiano perché dentro il relativo contratto; C1 conserva il prompt
inglese già accettato. `validateManifest` rifiuta casi senza prompt e il runner
elimina il fallback linguistico. Nessun system prompt, tool, sampler o modello
viene alterato per far passare il test.

## 29. Addendum C3 — azioni semantiche del composer nel runner

Data scoperta device: 2026-08-05.

Durante il rerun C3 il runner ha riempito il draft, poi ha cercato il primo
`button[aria-haspopup="dialog"]` e infine `textarea + button`. Sul composer
reale il primo pattern può includere «Aggiungi alla chat» e il secondo indica
il controllo destro morfico: quando il draft è vuoto è «Detta», non «Invia».
La prova live mostra infatti welcome vuoto e l'errore «Il riconoscimento vocale
non è riuscito. Riprova.»; nessun messaggio è stato inviato.

Fonte primaria: Playwright `1.61.1`,
[Best Practices](https://playwright.dev/docs/best-practices) e
[Locators](https://playwright.dev/docs/locators), raccomanda locatori orientati
all'utente e ruoli/accessibility name anziché relazioni CSS fragili. Il DOM
TALOS possiede già nomi accessibili localizzati «Choose/Scegli profilo modello»
e «Send/Invia messaggio»; il pulsante destro cambia correttamente nome quando
diventa dettatura.

Decisione upstream: **ADAPT SOLO IL RUNNER**. Aprire il modello tramite ruolo e
nome accessibile supportato dalle due locale TALOS, ricontrollare e ripristinare
il prompt dopo la selezione, poi trovare esclusivamente il button col nome
semantico di invio e verificare che sia unico/abilitato. Il runner non clicca
mai per posizione o adiacenza e non tratta la dettatura come send. Nessuna
modifica UI è necessaria; il test E2E composer esistente continua a presidiare
la persistenza del draft prodotto.

## 30. Addendum C3 — isolamento privacy del banco di compatibilità

Data scoperta device: 2026-08-05.

Il primo C3 arrivato realmente alla chat ha mostrato che una conversazione
ordinaria può selezionare memorie dell'owner e che un modello piccolo può
rifletterne etichette o nomi nel body. La prova è stata invalidata, il report è
stato redatto e lo screenshot contenente contesto potenzialmente identificante
è stato eliminato immediatamente. Nessun valore osservato viene conservato nel
dossier. Il difetto è nel banco: una verifica di runtime non ha alcuna necessità
di accedere alle memorie reali dell'utente.

Fonti primarie congelate:

- [OWASP GenAI LLM02:2025 — Sensitive Information Disclosure](https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/)
  classifica l'esposizione di dati dell'application context e prescrive accesso
  minimo alle fonti, sanitizzazione/redazione e controllo dell'output;
- [NIST AI RMF Core 1.0 — Measure](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
  richiede TEVV documentato, privacy risk misurato e prove in condizioni
  rappresentative senza sacrificare le proprietà di trustworthiness;
- Playwright `1.61.1`, già congelato nei §§27 e 29, fornisce il locator stabile
  `getByTestId` usato per verificare lo stato temporaneo visibile.

Decisione upstream: **ADAPT IL RUNNER CON LEAST PRIVILEGE**. Ogni caso apre una
chat nuova, attiva tramite il contratto UI esistente `talos-make-temporary` e
attende `talos-temporary-chat-badge` prima di selezionare il modello o inviare.
Il body viene validato prima di qualsiasi persistenza o screenshot; il nuovo
marcatore diagnostico osservato viene trattato case-insensitively come echo e
mai registrato. Il prodotto conserva invariata la selezione memoria nelle chat
ordinarie e il runner non introduce un mock né disabilita funzionalità reali.
