# R-03 — Motore dalla macchina · 13 settembre 2026

Registro di esecuzione e rapporto; sottosistema posseduto: TALOS UI desktop e adattatore locale. Base dichiarata `6b3dfa2e`. Nessun commit, staging o push; nessuna porta 4174, modello scaricato, API a pagamento o build frontend. Stato iniziale: solo `.claude/R03-BASE.txt` non tracciato.

## Ricerca bloccante completata prima delle modifiche di comportamento

Consultazione: **13/09/2026**. Pin conservato: **llama.cpp b10517, commit `dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`**, risolto con [API tag ufficiale](https://api.github.com/repos/ggml-org/llama.cpp/git/ref/tags/b10517). Licenza MIT; binari, provenienza e avvisi già gestiti da R-02, nessun aggiornamento dipendenze.

- [arg.cpp al pin](https://github.com/ggml-org/llama.cpp/blob/dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe/common/arg.cpp): `--list-devices` chiama `common_print_available_devices()` e `exit(0)`, anche con `(none)`. `--device none` esclude i dispositivi dall'offload. Leggere il codice di uscita da solo non rileva hardware. Sorgente consultato direttamente via raw GitHub (il motore web non aveva la pagina in cache).
- [ggml-vulkan.cpp al pin](https://github.com/ggml-org/llama.cpp/blob/dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe/ggml/src/ggml-vulkan/ggml-vulkan.cpp): enumerazione vuota stampa `ggml_vulkan: No devices found.`; `ggml_backend_vk_reg()` intercetta `vk::SystemError` e ritorna null. Un ICD incompatibile può quindi lasciare un elenco vuoto con uscita 0; il dettaglio è in log di debug. Mancanza di DLL/loader o crash possono invece impedire di arrivare a `exit(0)`: nessun codice Windows universale promesso senza macchina reale.
- [upstream #16138, 21/09/2025](https://github.com/ggml-org/llama.cpp/discussions/16138), [#17761, 04/12/2025](https://github.com/ggml-org/llama.cpp/issues/17761): casi documentati di build Vulkan senza dispositivi e caricamento CPU. [#11493, 29/01/2025](https://github.com/ggml-org/llama.cpp/issues/11493) documenta invece il vecchio b4549 che abortiva con `vk::IncompatibleDriverError` / `vk::createInstance: ErrorIncompatibleDriver`, anche con `-dev none`. Non attribuito al pin corrente.
- [#16301, 28/09/2025](https://github.com/ggml-org/llama.cpp/issues/16301) e [#13248](https://github.com/ggml-org/llama.cpp/issues/13248): `vk::DeviceLostError`, `vk::Device::waitForFences: ErrorDeviceLost`. Il pin stampa anche `ggml_vulkan: device lost on`, `ggml_vulkan: Compute pipeline creation failed for`. Elenco chiuso per il ripiego: queste firme, `ggml_vulkan: No devices found.`, `no Vulkan device`, `ErrorIncompatibleDriver`, `VK_ERROR_INCOMPATIBLE_DRIVER`, `VK_ERROR_DEVICE_LOST`, `VK_ERROR_INITIALIZATION_FAILED`, `vk::InitializationFailedError`. Mai il semplice prefisso `ggml_vulkan` né qualsiasi errore di caricamento GGUF.
- [#15054, 02/08/2025](https://github.com/ggml-org/llama.cpp/issues/15054), [#5848](https://github.com/ggml-org/llama.cpp/issues/5848), [#9271, 02/09/2024](https://github.com/ggml-org/llama.cpp/issues/9271): `ErrorOutOfDeviceMemory` non prova che la GPU sia assente; può essere VRAM o limite per singola allocazione. Una riga di errore senza morte del processo non basta: #9271 arriva a modello pronto. Decisione AVM: solo dopo morte prima di ready, proporre CPU senza avviarla automaticamente. La persona conferma scegliendo **TALOS → Motore locale → Processore**, quindi ricarica il modello che ha scelto. L'app spiega che può essere molto più lento; non garantisce RAM sufficiente.
- [LM Studio SDK, 2025](https://lmstudio.ai/blog/introducing-lmstudio-sdk): selezione automatica del motore e parametri secondo le risorse. [LM Studio 0.3.14](https://lmstudio.ai/blog/lmstudio-v0.3.14): controlli GPU manuali, riduzione dell'offload per tenere parte dei pesi in RAM. [Preferenze per modello](https://lmstudio.ai/docs/app/advanced/per-model): configurazione persistente. Queste fonti non documentano un riavvio su binario CPU dopo qualsiasi crash: non lo deduciamo.
- [Ollama, Hardware support](https://docs.ollama.com/gpu): GPU e driver supportati; scelta manuale attraverso variabili dispositivi, CPU forzabile, ripiego CPU documentato dopo mancata rilevazione NVIDIA al risveglio Linux. La pagina corrente dichiara Vulkan attivo quando installato e disattivabile; il pianificatore usa la VRAM disponibile. Non dimostra un ripiego universale dopo OOM.
- [Jan, Troubleshooting](https://www.jan.ai/docs/desktop/troubleshooting): rileva hardware e preferisce GPU con almeno 6 GB VRAM; scelta manuale CPU/Vulkan/CUDA. Per guasti driver consiglia cambio backend/driver; per memoria riduzione contesto/livelli. Non documenta un riavvio CPU automatico per ogni crash.

Decisione upstream: **adattare il contratto CLI ufficiale al pin dietro il supervisore AVM esistente**, conservando processo, policy, fitter e cache BC-13. Rifiutata l'integrazione di LM Studio/Ollama/Jan come nuovo processo: duplicazione dello stato e del packaging R-02, nessuna necessità per enumerare i dispositivi dell'eseguibile già incluso. Nessuna euristica per nome GPU, capacità VRAM minima o modello consigliato.

## Ledger prima del codice prodotto

File esatti previsti (nessuna cancellazione):

| File | Simboli e intervento |
| --- | --- |
| `harness-ui/desktop/runtime.mjs` | `scegliMotoreLocale` restituisce `{percorso,variante,dispositivi,motivo}`, opzione `preferenza`; `creaAvvioFiglio` propaga scelta e CPU di riserva senza mutare process.env; `risolviPercorsi` compatibile |
| `harness-ui/desktop/main.mjs` | `avviaGuscio`, `salva`, callback `avviaFiglio`, `creaMenu`, nuova `cambiaMotoreLocale`: preferenza persistente, registro, menu finestra/vassoio, ciclo di riavvio |
| `harness-ui/desktop/window-state.mjs` | `STATO_FINESTRA_DEFAULT`, `leggiStatoFinestra`, `salvaStatoFinestra`: `motoreLocale` con valori auto/vulkan/cpu |
| `harness-ui/desktop/lifecycle.mjs` | `creaCicloDiVita`, nuovo metodo `riavvia`: arresto atteso, invalidazione generazioni e riavvio senza crash artificiale |
| `harness-ui/desktop/tests/runtime.test.mjs` | R03-DISPOSITIVI, R03-NESSUNO, R03-SONDA-GUASTA, R03-MANUALE, R03-AMBIENTE; adeguamento contratto R02 |
| `harness-ui/desktop/tests/window-state.test.mjs` | R03-PREFERENZA: persistenza e valori corrotti |
| `harness-ui/desktop/tests/lifecycle.test.mjs` | R03-RIAVVIO: attesa chiusura, nessun doppio figlio e chiusura durante riavvio |
| `harness-ui/desktop/tests/guscio.spec.mjs` | verifica menu e primo avvio nelle quattro combinazioni tema/viewport, se Electron parte |
| `harness-ui/desktop/README.md` | sezione motore: scelta, ripiego, conferma CPU per memoria |
| `harness-ui/src/config.mjs` | `loadConfig`, `parseLlamaServerPath`: fallback esplicito e scoperta sorgente basata su dispositivi con timeout |
| `harness-ui/src/llama-server-supervisor.mjs` | `createLlamaServerSupervisor`: `fallbackBinaryPath`, `motore`; `status`, `start`, `stop`, `attachProcess`, cache aiuto/fitter per binario; classificatore privato con firme chiuse, un ripiego per caricamento |
| `harness-ui/server.mjs` | solo blocco supervisore: fallback in costruzione e dati motore/modello/contesto in `detect` |
| `harness-ui/tests/llama-server-r03.test.mjs` | fixture processo Node reale attraverso spawn iniettato, errori veri, successo/fallimento CPU, OOM, crash generico, dopo-ready, lock e stop |
| `harness-ui/tests/fixtures/llama-server-r03.cjs` | finto binario Node senza modelli/rete esterna, salute su loopback effimero |
| `harness-ui/tests/config.test.mjs` | R03-CONFIG: fallback e sorgente, assenza variabile |
| `harness-ui/tests/http-app-csp-nonce-e-guardie-hf.test.mjs` | fixture byte e store reali: SHA giusto, SHA sbagliato con byte giusti, byte alterati, troncato con hash del troncato, sha assente prima della rete; GET runtime inoltra motore |
| `harness-ui/frontend/src/components/runtime-modelli.js` | `datiRuntimeModello`, `creaRuntimeModello`, `aggiornaElencoRuntime`, nuova azione `riprovaMotoreGrafico`: nome umano, dispositivo, avviso, chiamate unload/load esistenti |
| `harness-ui/frontend/src/legacy/app.js` | indispensabile e limitato: collegare callback retry e rilettura stato runtime; nessun nuovo endpoint |
| `harness-ui/frontend/tests/unit/runtime-modelli.test.mjs` | R03-UI: CPU/Vulkan/ripiego/OOM e azione con modello/contesto conservati, errore visibile |
| `.claude/RAPPORTO-R03-MOTORE-DALLA-MACCHINA-2026-09-13.md` | questo registro e risultati |

Compatibilità: API start/load/unload/health/request/subscribeLogs, contratto streaming e modelli invariati; nessuna modifica kernel, schema o migrazione. `detect()` viene già inoltrato da GET runtime, quindi non serve modificare `http-app.mjs` né `local-runtime-llama-server.mjs`. OOM mantiene `RUNTIME_PROCESS_FAILED`, già noto al normalizzatore; proposta leggibile nello stato motore. Retry usa esclusivamente unload/load esistenti dopo azione umana.

RED: test nuovi devono fallire per stringa invece di oggetto, assenza preferenza/riavvio/fallback/motore/riga UI. Le prove di integrità possono essere già verdi: caratterizzano guardie esistenti, senza cambiare il trasferimento se non necessario. GREEN focalizzati: `desktop` test runtime/window-state/lifecycle, backend nuovo test R03/config/HF, frontend runtime-modelli. Regressione finale: `desktop npm run test:puri`; backend `node --test tests/local-runtime*.test.mjs tests/llama-server*.test.mjs tests/http-app-csp-nonce-e-guardie-hf.test.mjs tests/config.test.mjs`; frontend `npm run test:unit`. Tutti via `rtk proxy`. Electron: `npm run test:guscio`, senza aggirare crash GPU.

Gate upstream reale: NON eseguibile con i vincoli del brief (no GPU reale/no GGUF); fixture esercitano il processo e le firme ufficiali ma non certificano il motore b10517 su hardware. Prova visibile: screenshot Electron primo avvio chiaro/scuro 1024×800 e 1440×900; se GPU process inutilizzabile, riportare blocco senza simulare foto. Build/copia public e live 4174 solo owner in review.

Rollback: review rimuove esclusivamente il diff R-03 elencato qui; nessuna cancellazione o ripristino automatico del worktree e nessuna modifica dei modelli installati. `motoreLocale` aggiuntivo è ignorabile dal vecchio guscio; variabili fallback aggiuntive non alterano vecchi consumatori.

## Risultati e chiusura

Amendamento dopo RED: le righe stderr possono arrivare spezzate (fixture ha prodotto `No d | evices found.`); scenario permanente R03-RIGHE-SPEZZATE, cattura per stream ricomposta prima della classificazione. Per provare la scoperta sorgente senza avviare binari reali, `loadConfig` aggiunge terzo argomento facoltativo `{ sondaMotore }`; contratti dei due argomenti esistenti conservati. Il supervisore aggiunge le funzioni private `avviaTentativo`, `sbloccaModello`, `terminaProcesso`, `classificaGuastoVulkan`, `leggiDispositiviVulkan`: separazione tentativo/caricamento per tenere lo stesso lock durante il ripiego e cancellare correttamente con stop. `creaCicloDiVita.riavvia` non è invocabile dal menu durante avvio/arresto.

In lavorazione; verranno aggiunti numeri freschi, righe effettive, limiti e consegne.

## Chiusura inline (Claude, 13/09/2026, su ordine dell'owner «B»)

Astra si è fermata per il limite d'uso di Codex con il guscio, `config.mjs`, i test e la fixture
già scritti. Finito qui: supervisore, server, rotta, UI, README, prova dal vivo.

**Supervisore (`src/llama-server-supervisor.mjs`):** `fallbackBinaryPath` e `motore` come
opzioni; `--help` e leve ricordati PER binario; `start()` riparte da `lanciaProcesso()`; se il
processo Vulkan muore prima di essere pronto con una firma dell'elenco chiuso (driver:
«ggml_vulkan: No devices found», `ErrorIncompatibleDriver`, `ErrorInitializationFailed`,
`ErrorLayerNotPresent`; perso: `DeviceLostError`, `ErrorDeviceLost`, «device lost») e c'è la
riserva, riparte UNA volta sulla CPU con `-ngl 0 --device none`, senza KV quantizzata né
speculativa se il binario CPU non la offre; `status().motore = { variante, dispositivi, ripiego,
proposta }`; `ErrorOutOfDeviceMemory` ⇒ nessun ripiego, `proposta.a = 'cpu'`; errore generico ⇒
nessun ripiego; morte dopo `ready` ⇒ nessun riavvio; ogni `start()` ritenta dal binario del
guscio. Righe stderr ricomposte all'a-capo (la fixture le manda spezzate: «No d» + «evices»).
**Server:** `rilevaMotore()` legge anche i nomi dei dispositivi; `detect()` espone `motore` e
`modelId`; `/api/v1/runtime` li inoltra senza modifiche alla rotta.
**UI (`runtime-modelli.js`):** riga «Motore locale: scheda grafica (Vulkan) · <nome>» o
«processore»; avviso sullo stato reale; «Riprova sulla scheda grafica» dopo un ripiego
(app.js: unload + load dello stesso modello, poi rilettura).

**Test:** supervisore 30/30 (R-03 e vecchi, un'attesa aggiornata: il log dichiara il motore),
config e sonda 93/93, guscio 56/56, UI runtime 8/8, frontend unit 999 verdi + 2 rossi
preesistenti fuori da R-03 (`PK-UI-02/03`, `PH-UI-BROWSER`: «Sorgente fuori dal frontend»,
falliscono anche sul worktree di base 6b3dfa2e senza le mie modifiche — da capire a parte).

**Dal vivo, app INSTALLATA (pacchetto ricostruito, Windows 11, RX 9070 XT), profilo di prova con
un solo GGUF da 331 MB (Qwen3-0.6B Q2_K) e manifesto valido, `.claude/foto-r03-2026-09-13/`:**

| giro | motore prima del caricamento | caricamento | scheda nel Laboratorio modelli |
|---|---|---|---|
| automatico | vulkan · AMD Radeon RX 9070 XT | 200 in 1,76 s, `ready`, modello dichiarato | «Motore locale · scheda grafica (Vulkan) · AMD Radeon RX 9070 XT» (chiaro e scuro) |
| preferenza «Processore» (`window-state.json`) | cpu, nessun dispositivo | 200 in 1,76 s, `ready` | «Motore locale · processore» (chiaro e scuro) |

Nessun ripiego su questa macchina (la scheda funziona): il ripiego è provato solo con la fixture
(processo Node vero che stampa le righe del motore e muore). ⛔ Lezione della prova: un installer
NSIS silenzioso avvia l'app a fine installazione; se l'app vecchia resta viva, l'installer
successivo NON sovrascrive i file bloccati e l'installazione risulta «nuova» con dentro il codice
vecchio (server.mjs del 12/09 con l'exe del 13/09). Prima di ogni prova sull'installato: chiudere i
processi `TALOS`, disinstallare fino a cartella vuota, poi installare.

**Non verificato:** una macchina senza driver Vulkan (ripiego vero); `ErrorOutOfDeviceMemory` con
un modello che non entra (proposta a schermo); il pulsante «Riprova sulla scheda grafica» dal vivo
(compare solo dopo un ripiego).
