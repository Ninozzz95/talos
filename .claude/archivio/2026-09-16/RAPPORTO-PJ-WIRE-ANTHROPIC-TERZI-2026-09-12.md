# P-J — Anthropic Messages verso Z.AI e MiniMax

**Esito della consegna:** implementazione nei file consentiti verificata; **accettazione P-J non chiusa**. Ultimo giro: **178 test, 175 passati, 1 fallito, 2 saltati**. Il solo fallimento è PAR-06: mancano due opzioni in `frontend/index.template.html`, file esplicitamente vietato. È consegnata una patch non applicata, verificata con `git apply --check`. Nessuna chiamata a pagamento, nessun utilizzo della porta 4174, nessun commit.

Data di consultazione e lavoro: 12/09/2026. Base verificata: `81e27a3b49f14a5019cefcc2e991e0243b071e3d`, worktree inizialmente pulito. Sottosistema: integrazione fornitori nell'harness TALOS. Proprietà esclusiva Astra dei file elencati sotto; nessun subagente, nessuna modifica agli altri worktree, nessuna operazione di staging, commit o pubblicazione.

## Ricerca prima del codice

Le fonti sono state aperte il **12/09/2026**, salvo dove si indica lettura del clone locale. Gli estratti dei risultati di ricerca precedenti all'apertura contenevano modelli meno recenti: le decisioni seguono le pagine aperte. Nessuna chiamata autenticata ai fornitori.

| Fonte ufficiale / riferimento | Riscontro e conseguenza |
|---|---|
| [Z.AI: integrazione](https://docs.z.ai/devpack/tool/others) e [modelli](https://docs.z.ai/devpack/latest-model) | Base Anthropic `https://api.z.ai/api/anthropic`; il piano di programmazione distingue questa porta da `/api/paas/v4`. GLM 5.3 e 5.3 Flash sono documentati sulla porta; gli ID da usare sono `glm-5.3` e `glm-5.3-flash`. La guida descrive `thinking.type` e `output_config.effort`; ammette conversioni automatiche. Il profilo AVM conserva il vincolo esplicito high/max, senza conversioni silenziose. |
| [Z.AI: avvio rapido](https://docs.z.ai/devpack/quick-start) e [indice ufficiale](https://docs.z.ai/llms.txt) | La configurazione ufficiale usa `ANTHROPIC_AUTH_TOKEN`: si sceglie Bearer, senza inviare contemporaneamente `x-api-key`. Nessuna specifica completa separata Messages, nessun GET modelli Anthropic trovato nell'indice. `x-api-key` alternativo, dettagli SSE, `tool_use`, `cache_control` e contatori cache sulla porta non sono attestati singolarmente da queste pagine. Streaming e strumenti restano dichiarazioni di compatibilità, non misure. |
| [Z.AI: cache](https://docs.z.ai/guides/capabilities/cache) | Descrive cache automatica e `usage.prompt_tokens_details.cached_tokens` sull'API OpenAI. Non trasferisco tale promessa alla porta Anthropic: leggo i campi Anthropic se presenti, altrimenti non misurato. |
| [MiniMax: SDK Anthropic](https://platform.minimax.io/docs/api-reference/text-anthropic-api) | Base `https://api.minimax.io/anthropic`. Modelli: M3, M2.7, M2.5, M2.1, M2 e varianti highspeed documentate. Supportati strumenti, risultati, streaming e thinking; conservare i blocchi completi tra turni. M3: thinking spento se omesso, attivazione adaptive; M2.x non lo può spegnere. Stop sequences, top-k, MCP, container e context management risultano ignorati. |
| [MiniMax: Messages](https://platform.minimax.io/docs/api-reference/text-chat-anthropic) e [modelli](https://platform.minimax.io/docs/api-reference/models/anthropic/list-models) | POST `/anthropic/v1/messages`; GET `/anthropic/v1/models`, autenticazione `X-Api-Key`. La seconda chiamata non genera output. Catalogo con `data`, `has_more`, `last_id`; va paginato senza confondere 200 malformato, 401 e 404. Versione Anthropic inviata dall'SDK: `2023-06-01`; l'esempio HTTP MiniMax non ne dichiara l'obbligatorietà. |
| [MiniMax: cache esplicita](https://platform.minimax.io/docs/api-reference/anthropic-api-compatible-cache) | `cache_control`; lettura `cache_read_input_tokens`, scrittura `cache_creation_input_tokens`; totale ingresso = input + lettura + scrittura. Nessun valore inventato quando i campi mancano. Il supporto dichiarato non implica che TALOS abbia attivato marcatori nuovi. |
| [MiniMax: prezzi](https://platform.minimax.io/docs/guides/pricing-paygo) | USD/milione: M2.5, M2.1 e M2 costano 0,30 ingresso / 1,20 uscita / 0,03 lettura cache; M2.7 costa uguale in/out ma 0,06 in cache. M3 fino a 512k ingresso: 0,30/1,20/0,06; oltre 512k: 0,60/2,40/0,12. M2.5 è scelto come ausiliario fra i minimi a pari merito, con strumenti documentati; M3 resta nella riserva. Nessun costo viene attribuito a una corsa senza usage. |
| [Claude Code: collegamento gateway](https://code.claude.com/docs/en/llm-gateway-connect) e [compatibilità](https://code.claude.com/docs/en/llm-gateway-protocol) | `ANTHROPIC_BASE_URL` sceglie l'endpoint, `ANTHROPIC_AUTH_TOKEN` produce Bearer, `ANTHROPIC_API_KEY` produce x-api-key. La verifica proposta è POST `/v1/messages`, un token, messaggio punto. È generazione: qui deve essere richiesta esplicitamente, mai conseguenza del pulsante ordinario. |
| [Claude Code: gateway](https://code.claude.com/docs/en/llm-gateway) | Anthropic documenta il meccanismo, ma non dichiara supportato l'instradamento Claude Code verso modelli non-Claude. Non lo presento come certificazione dei fornitori terzi. |
| Hermes v0.21, clone locale `365e2835d490a053d076daa3b429371d6f35210f` | Il percorso reale è `plugins/model-providers/minimax/__init__.py`: profili internazionale e CN, `anthropic_messages`, chiavi distinte, ausiliario M3. `agent/anthropic_adapter.py` gestisce i client Anthropic e l'autenticazione; il profilo Z.AI resta OpenAI. Il profilo CommandCode separa le due porte: precedente utile per la scelta dei record. Nessun codice Hermes copiato. |
| [models.dev](https://models.dev/api.json), GET pubblico senza chiavi | Identità `minimax`, `minimax-cn`, `zai-coding-plan` e `zai` presenti. Il catalogo MiniMax usa già `@ai-sdk/anthropic` e base con `/anthropic/v1`. SHA-256 acquisizione di ricerca: `741add06396feae1e65041984505273e9192fc095b6ac13df5c3471d9ff2ffc9`. Gli zeri del piano non sono prezzi per token osservati. |
| [Tencent TokenPlan](https://cloud.tencent.com/document/product/1823/130070), aggiornamento fonte 03/09/2026; [CommandCode](https://commandcode.ai/blog/command-code-provider-api) | Altri utilizzatori: Tencent documenta `https://api.lkeap.cloud.tencent.com/plan/anthropic` e Bearer; CommandCode propone l'SDK Anthropic con base `https://api.commandcode.ai/provider`. Nessun record aggiunto per loro. |

## Decisione upstream e scelta delle porte

**Adattare dietro l'adattatore AVM esistente**: `@ai-sdk/anthropic` **4.0.49**, già installato e fissato nel lock, licenza Apache-2.0. Si mantiene `anthropic-version: 2023-06-01`. Il sorgente installato supporta `baseURL`, `apiKey`, `authToken`; aggiunge `/messages`, non `/v1/messages` a una base terza. Perciò i nuovi record conservano la base SDK completa `/anthropic/v1`. L'SDK ufficiale Anthropic e il percorso Python Hermes sono riferimenti; introdurli aggiungerebbe un secondo trasporto e nuove dipendenze senza una capacità necessaria. Package e lock non cambiano.

**Record separato `zai-anthropic`**, etichetta «Z.AI (porta Anthropic)», più `minimax`. Il record `zai` non viene duplicato sotto lo stesso ID né cambia wire; il suo profilo preparatorio rimanda al nuovo record. Una mappa `porte` richiederebbe modificare selettore, persistenza e fallback `{provider, model}` per rendere la porta selezionabile. Il record distinto riusa tali contratti e mantiene pool separati; la chiave Z.AI della porta va inserita esplicitamente oppure tramite `ZAI_ANTHROPIC_API_KEY`. Nessun ripiego su `ANTHROPIC_API_KEY` o sulla credenziale della porta OpenAI. MiniMax usa `MINIMAX_API_KEY`. MiniMax CN resta solo documentato: `https://api.minimaxi.com/anthropic`, con chiave regionale separata nel riferimento Hermes.

## Registro di esecuzione, scritto prima del codice prodotto

| File da creare/modificare | Simboli e intervento autorizzato |
|---|---|
| `src/provider-registry.mjs` | `REGISTRO_FORNITORI.zai.profili`, nuovi `zai-anthropic` e `minimax` in blocchi `// P-J`; proiezioni `ID_NATIVI_SDK`, `ID_CON_CREDENZIALE`, `ID_CATALOGO_IN_UI` derivano senza modifiche. Nessuna nuova classe/schema pubblico. |
| `src/native-provider-adapter.mjs` | `nativeProviderResponse`: selezione factory per wire Anthropic e credenziale del record; `canonicalUsage`: assenza cache terzi distinta dagli zeri SDK; funzione interna `opzioniAnthropicTerzi` per evitare ragionamento/stop ignorati. `stripNativeMetadata`, `toNativeMessages` e firme pubbliche conservate. |
| `src/provider-probe.mjs` | `SONDE_PROVIDER`, `createProviderProbe.prova(provider, {consentiGenerazione})` con opzione additiva; richiesta minima dichiarata e disabilitata per default; `elencaModelli` usa forma/auth del record e catalogo documentato se non esiste una sonda GET. |
| `src/provider-credential-store.mjs` | Solo `leggiScadenzaFornitore`: intestazioni Anthropic derivate dal wire anziché dal nome unico, per i nuovi pool. |
| `frontend/src/components/fonti-modelli.js` | Solo due righe additive in `PROVIDER_DIRETTI`, con etichette umane e `soloSeCollegato`. |
| `tests/provider-pj.test.mjs` | Nuovo banco locale, SDK reale, porte effimere. Scenari PJ-01…PJ-12 descritti sotto. |
| `tests/fixtures/provider-pj-models-dev-2026-09-12.json` | Proiezione indipendente del catalogo pubblico, fonte/data/impronta. |
| `tests/provider-registry-parita.test.mjs` | Fixture pubblica aggiuntiva e aspettativa esplicita dei cinque fornitori SDK. |
| `tests/provider-pg.test.mjs` | PG-01: 20 → 22, motivato solo dai due record nuovi. |
| `frontend/tests/unit/fonti-modelli.test.mjs` | PJ-UI-01: etichette, selezione e chiave assente. |
| `.claude/RAPPORTO-PJ-WIRE-ANTHROPIC-TERZI-2026-09-12.md` | Questo dossier, ledger ed esiti; aggiornamento conclusivo. |
| `.claude/PJ-RED.txt`, `.claude/PJ-GREEN.txt`, `.claude/PJ-REGRESSIONI.txt` | Log mirati dei test con soli dati fittizi. |

Nessuna eliminazione. `src/model-destination.mjs` e `src/runtime-owner-adapter.mjs` già passano chiave/base della destinazione nativa e avvolgono l'SDK nel percorso P-H: inizialmente **nessun edit necessario**. Anche config e lettori cache derivano già dal registro.

RED atteso: PJ-01 record assenti; PJ-02/PJ-03 prefissi nuovi non instradati all'SDK; PJ-04 chiave mancante non associata alla nuova porta; PJ-05/PJ-06 sonde/cataloghi assenti; PJ-07 cache non misurata; PJ-08/PJ-09 round-trip strumenti e streaming; PJ-10 errori/pool; PJ-11 fallback nel kernel; PJ-12 intestazioni reset. PJ-UI-01 fallisce per le etichette assenti. Gli scenari di compatibilità verificano Anthropic vero e il wire OpenAI Z.AI nei due versi.

GREEN focalizzato: `rtk proxy node --test tests/provider-pj.test.mjs frontend/tests/unit/fonti-modelli.test.mjs`.
Regressioni: `tests/provider-registry-parita.test.mjs`, `tests/provider-pg.test.mjs`, `tests/provider-zai.test.mjs`, `tests/native-provider-adapter.test.mjs`, `tests/runtime-owner-adapter-fallback.test.mjs`, `tests/provider-credential-pool.test.mjs`, `tests/http-routes-providers.test.mjs`, più i test direttamente pertinenti a sonda, credenziali, destinazione e cache. `git diff --check` finale.

Cancello upstream: SDK **reale** 4.0.49 contro server HTTP Anthropic-like finto; non equivale a qualificazione dei servizi remoti. Nessuna richiesta a pagamento e nessuna chiave vera. Il gate remoto resta da eseguire dall'owner con autorizzazione di spesa. Prova visibile locale: etichette del selettore, catalogo e risposte/API nei test; percorso completo del composer dal vivo non qualificato in questo lotto.

Rollback proposto, non eseguito: rimuovere solo i blocchi/diff P-J elencati, dopo riconciliazione dell'owner; nessun reset/revert automatico e nessun intervento sui dati utente.

## Esiti

Primo RED: 27 test, 14 passati, 13 falliti, 0 saltati (`PJ-RED.txt`). Prima implementazione: 24 passati, 3 falliti.

### Emendamento prima della correzione cache

PJ-07/PJ-09 sono anche scenari permanenti di regressione: l'esecuzione reale mostra che **anche `result.usage` aggrega e perde `raw`**, mentre `result.steps[].usage` lo conserva. Per lo streaming usare `finish-step.usage`. Nel percorso attuale `stepCountIs(1)` garantisce una sola chiamata: prendere l'unico step evita conteggi inventati, senza leggere nuovamente il flusso né aggiungere un trasporto. La verifica di versione in PJ-02 deve leggere il package installato, non l'User-Agent: il livello `ai` sostituisce quel campo con il proprio identificatore.

PJ-03 diventa scenario permanente dell'isolamento da `ANTHROPIC_BASE_URL`; l'URL del record vince su una variabile globale anche chiamando direttamente l'adattatore. Aggiungere PJ-13 per caratterizzare i vincoli dichiarati di ragionamento/stop e PJ-14 per la rotta HTTP reale con server finto (nessun file HTTP prodotto da modificare).

### Emendamento ambiente e parità, prima di ulteriori modifiche

Il primo giro richiesto si ferma in quattro file perché `../context-engine/src/contracts.mjs` non risolve `zod` nel worktree. Non installo pacchetti e non scrivo fuori dall'harness. Aggiungo `.claude/PJ-RISOLUZIONE-TEST.mjs`, hook di sola risoluzione Node (`registerHooks`, [fonte ufficiale](https://nodejs.org/api/module.html), consultata 12/09/2026, runtime locale 24.18.0): solo l'importazione `zod` da context-engine usa il pacchetto già installato nell'harness. Nessun mock di Zod o del codice prodotto. Aggiungo `.claude/PJ-REGRESSIONI-CON-RISOLUZIONE.txt` e `.claude/PJ-ESTESI.txt` come log separati, conservando l'esito senza hook.

PAR-06 trova due opzioni mancanti nel **vietato** `frontend/index.template.html`. Il test resta integro: non escludo record né salto il controllo. Aggiungo solo `.claude/PJ-TEMPLATE-NON-APPLICATO.patch` da consegnare all'owner. SONDA-01 invece presumeva che nessun record dichiarasse una sonda inattiva: aggiornamento ammesso del test, confrontando ogni proiezione con il dato del registro e provando il caso Z.AI senza rete.

Correzione del dato di licenza dopo lettura del package installato: **Apache-2.0** per `@ai-sdk/anthropic` 4.0.49; la precedente annotazione MIT era errata. Non sono stati introdotti pacchetti né copiate implementazioni esterne.

Con la risoluzione locale: 91 test, 87 passati, 2 falliti, 2 saltati. Oltre a PAR-06, PD-01 conserva l'aspettativa preparatoria della seconda porta. Aggiungo al ledger il file `tests/provider-zai.test.mjs`: aggiornare **solo PD-01**, verificando il riferimento al record separato e mantenendo le asserzioni sul wire/base OpenAI. La dichiarazione di errore incompleto dei nuovi fornitori userà l'etichetta umana nel metodo interno `responseMessage`; Anthropic vero resta invariato.

Gruppo esteso iniziale: 83/83 verdi. Prima della chiusura aggiungo nello stesso file `tests/provider-pj.test.mjs` PJ-15 (429/401/503 con stream, panchina e nessun segreto), PJ-16 (fallback OpenAI ↔ Anthropic con kernel reale e cronologia strumenti), PJ-17 (errore incompleto con nome umano: RED atteso sul vecchio ID tecnico). Nessun nuovo file prodotto. Queste prove completano il verso inverso e gli errori asincroni.

Revisione finale: PJ-17 RED riprodotto e corretto. Aggiungo PJ-18 (base predefinita di ciascun record nell'SDK, con fetch intercettata senza rete). In `nativeProviderResponse` raccolgo l'usage non-stream dall'evento nominato `onStepFinish`, eliminando la lettura per posizione `steps[0]`; il contratto rimane una chiamata/step. Zod reale del banco è **4.5.4**, esattamente la versione richiesta anche da context-engine. La patch HTML a contesto nullo richiedeva `--unidiff-zero`: è stata rigenerata con contesto, e ora `git apply --check` la accetta senza opzioni speciali.

## Comportamento consegnato

La risoluzione resta `prefisso → record → portachiavi/runtime → nativeProviderResponse → createAnthropic`. Il router P-H avvolge la stessa fetch dell'SDK: non occorre modificarlo. Z.AI usa Bearer del proprio record; MiniMax usa x-api-key del proprio record. Le credenziali del kernel/OpenRouter e quelle globali Anthropic non vengono riutilizzate sulle porte terze. Senza chiave si fallisce prima della rete. Tutte le chiamate di generazione, anche streaming e strumenti, passano dall'SDK già presente; solo la sonda minima usa il POST di verifica dichiarato nel modulo sonde, senza diventare un trasporto di chat.

`stripNativeMetadata` e `toNativeMessages` sono invariati. Le firme si conservano dopo serializzazione quando fornitore e modello corrispondono, e non passano a un altro fornitore. La lettura cache Anthropic vera resta quella precedente; per i nuovi record l'assenza nel dato grezzo produce campi canonici assenti, mentre uno zero esplicito resta zero. Il totale SDK include già input non in cache, letture e scritture.

Le sonde MiniMax distinguono 200 con catalogo valido, 401 e 404; un falso 200 non certifica la credenziale. La porta Z.AI senza chiave è «non provabile»; con chiave e sonda ordinaria è «non sondabile», senza misura di durata. La richiesta minima è documentata nel record con `max_tokens: 1`, `stream: false`, messaggio punto; `prova('zai-anthropic', { consentiGenerazione: true })` è l'unico accesso esplicito. La rotta HTTP esistente **non inoltra** questo consenso e non genera. Il catalogo Z.AI viene dalla riserva documentata, con accesso non verificato; MiniMax pagina il catalogo remoto.

I livelli Z.AI fuori da high/max vengono respinti senza rete; MiniMax non dichiara livelli numerici di intensità e quindi li respinge. M3 accetta il controllo booleano del ragionamento tramite adaptive/disabled; M2.x non lo accetta in questo profilo. Le sequenze di arresto MiniMax vengono respinte perché il fornitore dichiara di ignorarle. Non si attivano nuovi marcatori `cache_control`, strumenti remoti del fornitore o download impliciti.

## File effettivamente toccati e punti di riconciliazione

Righe riferite ai file finali su disco; **nessun file eliminato**. I cambiamenti esistenti degli altri worktree non sono stati letti né incorporati.

| Stato | File | Righe e contenuto |
|---|---|---|
| Modificato | `src/provider-registry.mjs` | 227–228: riferimento P-J; 1001–1077: blocco additivo dei due record; `minimax` da 1045. |
| Modificato | `src/native-provider-adapter.mjs` | 6: import; 55–61: cache grezza; 79–83: errore umano; 106–116: factory/auth/base; 120–142: opzioni e usage; 151–174: usage SSE; 184–205: funzione interna `opzioniAnthropicTerzi`. |
| Modificato | `src/provider-probe.mjs` | 22–25: descrizione veritiera; 35/59: derivati; 119–205: sonda esplicita e stati; 231–272: riserva e paginazione/auth del wire. |
| Modificato | `src/provider-credential-store.mjs` | 92–93: reset Anthropic letto per wire. Pool, rotazione, priorità e custodia invariati. |
| Modificato | `frontend/src/components/fonti-modelli.js` | 137–139: sole due voci Diretti, con commento P-J. |
| Modificato | `frontend/tests/unit/fonti-modelli.test.mjs` | 16–27: PJ-UI-01. |
| Nuovo | `tests/provider-pj.test.mjs` | 1–319: banco HTTP locale, PJ-01…PJ-18. |
| Nuovo | `tests/fixtures/provider-pj-models-dev-2026-09-12.json` | 1–31: fonte, data, SHA-256 e quattro ID/tool_call presi dal GET pubblico. |
| Modificato | `tests/provider-registry-parita.test.mjs` | 58–60: fixture; 272–273: cinque fornitori SDK; 371–375: sonda inattiva dichiarata. **PAR-06 a 301–314 non indebolito.** |
| Modificato | `tests/provider-pg.test.mjs` | **46–48**: PG-01, **20 → 22**, esclusivamente per i due record P-J. |
| Modificato | `tests/provider-zai.test.mjs` | 18/25–27: PD-01 qualifica la seconda porta; asserzioni OpenAI conservate. |
| Nuovo | `.claude/RAPPORTO-PJ-WIRE-ANTHROPIC-TERZI-2026-09-12.md` | 1: questo rapporto e ledger con gli emendamenti. |
| Nuovo | `.claude/PJ-RISOLUZIONE-TEST.mjs` | 1: risoluzione Zod reale per il solo context-engine esterno. |
| Nuovo | `.claude/PJ-TEMPLATE-NON-APPLICATO.patch` | 1: due opzioni HTML proposte, non applicate. |
| Nuovo | `.claude/PJ-RED.txt` | 1: RED iniziale, 13 fallimenti attesi. |
| Nuovo | `.claude/PJ-GREEN.txt` | 1: ultimo gruppo mirato. |
| Nuovo | `.claude/PJ-REGRESSIONI.txt` | 1: primo giro richiesto senza risoluzione Zod. |
| Nuovo | `.claude/PJ-REGRESSIONI-CON-RISOLUZIONE.txt` | 1: ultimo giro dei sette file richiesti. |
| Nuovo | `.claude/PJ-ESTESI.txt` | 1: ultimo gruppo delle cinque suite adiacenti. |

Nessun edit a `src/runtime-owner-adapter.mjs`, `src/model-destination.mjs`, `src/config.mjs` o `src/usage-cache.mjs`: derivazione e instradamento già sufficienti. Nessun edit ai file vietati, al lock, a package.json o ai dati del portachiavi reale.

## Test finali e riproduzione

| Gruppo | Totale | Passati | Falliti | Saltati |
|---|---:|---:|---:|---:|
| PJ-01…PJ-18 + unità `fonti-modelli` | 33 | 33 | 0 | 0 |
| Sette file richiesti dall'owner | 91 | 88 | **1** | 2 |
| Destinazione, sonda, custodia, cache, adattatore contesto | 54 | 54 | 0 | 0 |
| **Totale, senza duplicazioni tra i tre gruppi** | **178** | **175** | **1** | **2** |

I due saltati sono **PG-PUB** e **PF-PAR-05**, cancelli opzionali sul catalogo pubblico integrale che richiedono file/variabili esterni. Il GET pubblico per i quattro modelli P-J è invece stato eseguito senza credenziali e archiviato nella fixture. Nessun salto aggiunto ai test per nascondere il template.

Comandi dalla cartella `harness-ui`, Node **24.18.0**:

```powershell
rtk proxy node --import ./.claude/PJ-RISOLUZIONE-TEST.mjs --test tests/provider-pj.test.mjs frontend/tests/unit/fonti-modelli.test.mjs
rtk proxy node --import ./.claude/PJ-RISOLUZIONE-TEST.mjs --test tests/provider-registry-parita.test.mjs tests/provider-pg.test.mjs tests/provider-zai.test.mjs tests/native-provider-adapter.test.mjs tests/runtime-owner-adapter-fallback.test.mjs tests/provider-credential-pool.test.mjs tests/http-routes-providers.test.mjs
rtk proxy node --import ./.claude/PJ-RISOLUZIONE-TEST.mjs --test tests/model-destination.test.mjs tests/provider-probe.test.mjs tests/provider-credential-store.test.mjs tests/usage-cache.test.mjs tests/context-provider-adapter.test.mjs
rtk proxy git diff --check
rtk proxy git apply --check .claude/PJ-TEMPLATE-NON-APPLICATO.patch
```

Il secondo comando **deve attualmente fallire** su PAR-06; il primo e il terzo sono verdi. Gli ultimi due controlli passano. Nessuna misura di latenza del fornitore remoto è stata prodotta: le durate nei log sono quelle misurate dal runner locale.

**Server finto dichiarato:** `node:http`, bind a `127.0.0.1`, `listen(0)`, porta scelta dal sistema e controllata diversa da 4174; chiusura delle connessioni a fine test. Il banco P-J rifiuta origini esterne nella fetch di generazione. Risposte JSON e SSE hanno forma Anthropic; gira l'SDK reale del lock. Gli endpoint predefiniti Anthropic/Z.AI/MiniMax sono verificati intercettando la fetch, senza eseguire quelle richieste su Internet. Sono provati anche kernel reale, storia strumenti con refuso e URL naturale, serializzazione/ricaricamento dello stato, fallback nei due versi, 429/401/500/503 e panchina. Il keyring dei test è una mappa in memoria.

Pin invariato nel lock: `@ai-sdk/anthropic@4.0.49`, tarball `https://registry.npmjs.org/@ai-sdk/anthropic/-/anthropic-4.0.49.tgz`, integrità `sha512-fzy2sLrs3vNsliIgx65fuovsa6a7OTXd6DllKUgLuVmPyqLnvoZCv9NlKgq+krzDzSxLb9d0zTaJJpsjBVLNyA==`. Licenza **Apache-2.0**. Riferimenti di ricerca Hermes: `plugins/model-providers/minimax/__init__.py`, `plugins/model-providers/zai/__init__.py`, `plugins/model-providers/commandcode/__init__.py`, `agent/anthropic_adapter.py`, al commit indicato sopra.

## Diff non applicato e limite della parità

`PJ-TEMPLATE-NON-APPLICATO.patch` aggiunge a **`frontend/index.template.html:1401`**:

```html
<option value="zai-anthropic">Z.AI (porta Anthropic)</option>
<option value="minimax">MiniMax</option>
```

Il controllo di applicabilità è verde, ma il file prodotto non è stato modificato: il divieto viene dal prompt dell'owner, sezione «File che puoi toccare». Finché quel divieto resta, **«parità verde» non è un risultato dichiarabile**. Non ho compensato il template con JavaScript fuori scope, esclusioni dal registro o allentamenti del test. Gli altri worktree aggiungono record: l'owner deve riconciliare questo punto assieme ai loro blocchi, al conteggio PG-01 e alle aspettative della parità.

## Cosa non è stato verificato

- Nessuna generazione o sonda autenticata contro i servizi reali: accesso, fatturazione, DNS/TLS e compatibilità effettiva delle risposte dei fornitori restano da qualificare.
- Nessuna attestazione del supporto Z.AI a x-api-key, `cache_control`, contatori cache o dettagli SSE oltre alla compatibilità dichiarata. Si usa il Bearer documentato. La pagina Z.AI limita il piano agli ambienti elencati e TALOS non compare: **l'idoneità dell'uso TALOS con quel piano non è stata confermata** ([fonte](https://docs.z.ai/devpack/tool/others), 12/09/2026).
- Nessuna misura di cache hit, costo risparmiato, latenza, throughput o miglioramento AVM ON/OFF. I dati numerici nei test sono fixture, non benchmark.
- Nessuna qualifica MiniMax CN, OAuth MiniMax, Tencent o CommandCode; nessun record per questi accessi.
- Nessun percorso completo dal composer in browser desktop/mobile, reload pagina o build UI: il template necessario è fuori scope. Le verifiche UI sono quelle del modulo del selettore; il test HTTP esercita API vere con upstream finto.
- L'opzione di sonda Z.AI con generazione non è esposta dalla rotta HTTP ordinaria. Un'eventuale azione UI esplicita richiede un lotto separato con messaggio sul consumo e autorizzazione prima della richiesta.
- Un ausiliario nel registro indica la scelta documentata, non una qualifica di compattazione dal vivo; i cancelli già esistenti sul contesto restano in vigore.

La pagina chiavi MiniMax nel record è il link ufficiale del catalogo; aperto il 12/09/2026, reindirizza a `https://platform.minimax.io/console/access`. Nessun accesso all'account effettuato.

## Testo di commit proposto, non eseguito

```text
feat(provider): collega Z.AI e MiniMax al wire Anthropic esistente

Seleziona SDK, base e credenziale dal record; mantiene Anthropic e Z.AI OpenAI.
Aggiunge sonde veritiere, cache non misurata, paginazione e pool condiviso P-H.
Copre SDK reale, streaming, strumenti e fallback con server locali finti.

Prima del commit: riconciliare la patch del template e ottenere PAR-06 verde.
Nessuna qualifica remota o chiamata a pagamento inclusa.
```

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** riconciliare i blocchi P-J con P-I/P-K/P-L, applicare o integrare il diff del template nella propria lane e rieseguire PAR-06 e i cancelli elencati. Tenere il pin SDK; collegare le credenziali solo nel portachiavi o nelle variabili dedicate. Autorizzare separatamente l'eventuale qualifica remota e verificarne l'accesso previsto dal fornitore.

**Cosa faccio io:** consegno i 19 file su disco, ricerca, fixture, ledger, prove locali e patch applicabile senza applicarla. Ho completato l'implementazione nel perimetro consentito, conservando il fallimento che segnala il lavoro fuori scope. Nessuno staging, commit, push o intervento sui file vietati.

**Cosa rimane:** parità del template, riconciliazione fra lane e qualifica completa dal composer ai fornitori reali. **P-J non è dichiarato chiuso fino a questi cancelli.**
