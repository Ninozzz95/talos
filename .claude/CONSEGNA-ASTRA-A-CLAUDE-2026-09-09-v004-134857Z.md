# Consegna autosufficiente Astra a Claude — versione 004

Snapshot **2026-09-09T13:48:57Z / 2026-09-09T15:48:57+02:00, Europe/Rome**.
Worktree: `C:/Users/Antonino/Desktop/projects/AVM-context-engine`, branch `codex/talos-context-engine`. HEAD di partenza `cc043212`; implementazione F5a verificata ma ancora NON committata a questo snapshot. Leggere `git status` e i commit successivi prima di applicare questa consegna. I crediti di Astra potrebbero finire improvvisamente: rischio indicato dall'owner, non una lettura della quota residua.

## Ordine owner appena confermato — prevale sul testo storico

Il pulsante attualmente «Comprimi il contesto» deve chiamarsi **Context Manager**, denominazione scelta fra le due autorizzate dall'owner (Context Manager / Context Engine), e deve aprire la modale. Il click non deve avviare una sintesi. L'autocompattazione resta **attiva di default**, con avanzamento nella chat e separatore persistente in stile Claude. Il manuale resta una funzione esplicita dentro la modale, compreso il caso troppo breve già gestito.

Situazione reale: sulle sessioni di prova abilitate il pulsante apre già Context Compactor. Sulle altre esiste ancora un fallback in `compactSession` che, dopo CTX_NOT_ENABLED, chiama direttamente il vecchio POST /compact: deve essere rimosso dal pulsante. Conservare l'API legacy compatibile; le sessioni non abilitate devono aprire il pannello con spiegazione e controlli non disponibili. Non attivare il motore su tutte le chat per nascondere questo caso. Il progresso è attualmente nella modale; il suo collegamento persistente alla chat e la consegna spontanea a modale chiusa sono ancora da completare. Il separatore di versione esiste già ed è verificato al reload.

## F5a implementata e verificata, da committare

`context-engine/src/usage.mjs` esporta `contextUsageFromEvents`, proiezione pura dei consumi ricevuti dal trasporto: protocollo normalizzato OpenAI/camelCase interno, nessuna reinterpretazione delle API native. Dedup per operazione e sessione; campi mancanti/invalidi non diventano consumi inventati. I totali del compattatore non diventano giri della chat.

`sqlite-worker.mjs`: `recordUsage` salva insieme riga e ricevuta outbox, in una transazione SQLite. Identità evento deterministica; ack conservato impedisce una seconda consegna al replay. Recupero delle righe precedenti/importate al primo accesso outbox del worker. Le prove interrompono la transazione prima e dopo l'inserimento outbox: nessuna metà viene pubblicata. Gli originali restano invariati. Il timestamp delle ricevute recuperate indica la creazione dell'evento, non ricostruisce l'ora di un'inferenza non registrata.

`session-registry.mjs`: totale sessione e cache includono le sintesi, mantenendo giri/esecuzioni/ultimaEsecuzione della sola chat. Campo compattazione separato e denominatore prompt_tokens_con_cache calcolato sui soli consumi con cache dichiarata. UI legacy usa la stessa proiezione e conserva la dedup su riconnessione; `chat-foot.js` usa il denominatore esplicito. Nessun prezzo stimato o servizio budget parallelo introdotto.

Prova browser su desktop isolato reale: chat fixture da 120 token più sintesi fixture da 1880 = **2,0k token**, **1 giro**, **cache 40%**; duplicazione della stessa registrazione e reload non cambiano il totale. La finestra del contesto del turno resta distinta. Si tratta di dati controllati e **non di una qualifica LLM**.

## CancellI freschi

| Verifica | Esito |
|---|---|
| Package context-engine | 72/72 |
| Backend completo | 1901 test: 1899 pass, 2 skip, 0 fail |
| Unit frontend | 478/478 |
| Componenti completi | 144/144 |
| Desktop compilato → HTTP → SQLite → SSE → reload | 1/1 |
| Build | 31 asset, nessun cutover |
| git diff --check | pulito prima dell'aggiornamento documentale |

I due skip sono le fixture GGUF non presenti, già dichiarate nella consegna precedente. Non qualificarle come superate. La prima suite backend completa aveva due errori HF-DIRECT: attesa arbitraria 100 ms e stream mock che ignorava AbortSignal. Corrette le sole fixture nel test `hf-direct-transfer.test.mjs`: attesa pubblica TestContext.waitFor, stream controllato e annullabile. Seconda suite completa verde. Log: `harness-ui/artifacts/context-engine/f5a-backend-20260909.log` (insuccesso), `f5a-backend-green-20260909.log`, `f5a-core-20260909.log`; componenti in `harness-ui/frontend/artifacts/context-compactor/f5a-componenti-20260909.log`. Conservare questi dati.

Screenshot guardati personalmente: `.claude/immagini/tcec/desktop-usage-1920x1080.png`, `desktop-usage-2560x1440.png`, `desktop-usage-3840x2160.png`; copie identiche in scratchpad/prove/foto con prefisso tcec-. Ricevute in `.claude/ISPEZIONI-FOTO.md`. Tre colonne integre, contatore sotto composer e separatore singolo. Nessuna prova sul 4174.

## Coda owner non urgente

1. Blocchi di codice: contenitore coerente, niente strisce da inline-code, copia fedele e verifiche streaming/temi/risoluzioni. Screenshot 09/09 11:01:54.
2. Righe degli strumenti: mantenere azione a sinistra; mostrare **esito reale** a destra, non la descrizione duplicata. Errori espliciti, stato in corso prima dell'esito, nessun conteggio inventato, dettaglio/raw preservato. Screenshot `C:/Users/Antonino/Downloads/ScreenShot Tool -20260909132722 (1).png`. Annotato nella CODA-PROPOSTE-OWNER-2026-09-08.md della worktree. Non ancora implementato.

Il resto della coda e il lavoro dall'8 settembre sono riportati integralmente nelle sezioni storiche incorporate qui sotto. Non occorre cercare un'altra consegna per leggere quel contenuto. In caso di differenze prevale questo aggiornamento e, successivamente, ogni nuova istruzione dell'owner.

## Prossimi passi, senza ricominciare

1. Committare F5a con ledger e prove, senza push/trailer. Poi F5c: Context Manager, apertura sempre della modale, automazione/progresso in chat e separatore; ricerca e inventario prima edit. Aggiungere prova che nessuna condizione del click chiami /compact o /context/jobs implicitamente.
2. Misura corrente del contesto ancora mancante: derivarla dal corpo completo preparato con strumenti e riserva, non ricalcolare su GET con tools vuoti o presentare un dato storico come attuale. Policy comune di budget ancora da collegare; usagePolicy nel runtime non è una prova che il server la inietti.
3. Impostazioni strict, qualificazione nativa, cambio modello/ragionamento, job tardivi, target e segmenti riusabili. Consegna eventi al termine dei job senza dipendere dall'apertura modale; errori di consegna conservati e ritentabili senza rieseguire inferenze.
4. Recupero automatico, embedding Qwen locale reale, asset originali end-to-end, catalogo strumenti e RTK nel dispatch effettivo. Adapter/unit non equivalgono alla capacità completa.
5. Ripresa JSONL con coda corrotta, append e secondo restart; scheduling locale oltre il mutex in-process. Posizione cronologica dei separatori e richieste concorrenti delle fonti.
6. Qualificazione su entrambi i GGUF, tre repliche, checkpoint 6/406 messaggi, cinque/venti compattazioni, tool/restart/allegati/cambio modello. API separate. Nessuna nuova qualifica reale TCEC è stata eseguita in F5a.
7. Chat naturale dal composer al provider reale, revisione ingegneristica finale e prova owner prima dell'attivazione generale.

Continuare **inline senza nuovi agenti**, come ultima decisione owner sui crediti. Non toccare AGENTS, il 4174, le credenziali o i cambi dell'orchestratore. Source app: `C:/Users/Antonino/Desktop/projects/AVM-harness-desktop`, branch lane/harness-desktop: riceve soltanto copia di questa documentazione, non un merge implicito del codice. Preservare file di prova e snapshot precedenti.

**Owner:** nessuna azione richiesta adesso. **Astra dopo:** commit verificato e completamento dell'interazione Context Manager. **Rimane:** integrazioni elencate, qualificazione reale, revisione finale e attivazione approvata.


---

## Archivio storico incorporato: CONSEGNA-ASTRA-A-CLAUDE-2026-09-09-v001-074805Z.md

# Consegna cumulativa Astra a Claude — versione 001

- Identificativo: ASTRA-CLAUDE-20260909-v001-074805Z.
- Stato congelato: **2026-09-09T07:48:05Z**, cioe **09/09/2026 ore 09:48:05 Europe/Rome (UTC+02:00)**.
- Intervallo: dal ticket owner dell'08/09/2026 `TICKET-CONSEGNA-AD-ASTRA-2026-09-08.md` fino al commit `be324bc4` incluso. Non e una nuova consegna dei mockup del 05/09.
- Richiesta owner: documentare tutto il lavoro dall'inizio di ieri, con data/versione precise, per permettere la ripresa se finiscono i crediti.
- **ATTENZIONE CREDITI: i crediti di Astra potrebbero esaurirsi da un momento all'altro.** E un rischio operativo segnalato dall'owner, non una previsione misurata della quota. Non presumere che Astra possa inviare un ultimo messaggio o chiudere una modifica.
- Questa e una fotografia immutabile. Le versioni successive avranno un nuovo numero e timestamp. Se git mostra lavoro piu recente, prevalgono codice e prove successive.
- Nessuna chiave API o credenziale viene riportata qui.

## 1. Dove riprendere, senza perdere lavoro

**Radice attiva TCEC:** `C:/Users/Antonino/Desktop/projects/AVM-context-engine`.
Branch `codex/talos-context-engine`; HEAD `be324bc4`. Git status pulito al timestamp dello snapshot. L'ultima fetta di codice e stata committata prima di questa consegna.

**Radice desktop owner:** `C:/Users/Antonino/Desktop/projects/AVM-harness-desktop`.
Branch `lane/harness-desktop`; HEAD osservato `f9ec4eaa2162fc1dd93882ff3f195f784e2ee325`.
Contiene le consegne di ieri fino ad Accesso pieno. Ha una modifica preesistente a `.gitignore` e molti file non tracciati, documenti ed evidenze: non eliminarli, non aggiungerli in massa, non interpretarli come spazzatura.

Il Context Engine e **solo nella worktree isolata**. Non e stato unito alla lane desktop, non e stato pubblicato, non e attivo sul 4174. Nessun push effettuato da queste consegne.

Per riprendere:
1. Leggere `git status --short` e `git log -12 --oneline` nella worktree TCEC.
2. Leggere piano, decisioni, contratti e ledger TCEC nella sua `.claude`.
3. Confrontare questo snapshot con l'eventuale versione successiva.
4. Conservare le bozze UI/qualificazione nelle worktree sotto. Sono file reali, non risultati persi.
5. Non avviare due autori sui medesimi file. L'ultima istruzione operativa owner e proseguire inline: root sta lavorando da solo, nessuna nuova delega.
6. Nessuna attivazione generale prima della prova owner. Il 4174 resta separato dai test TCEC; nessun riavvio o scaricamento GPU del prodotto implicito.

## 2. Cronologia delle consegne dell'08/09

Le ore della tabella sono le date autore registrate da git in Europe/Rome. Non sono timestamp inventati del momento in cui e stato ricevuto il prompt.

| Commit | Ora locale | Consegna e confine |
|---|---|---|
| `71d78b50` | 14:24:57 | Ripresa verificata dal ticket e proposte owner salvate. |
| `dc232f6f` | 14:29:54 | Avvisi preventivi effort/Fast e deleghe autorizzate documentati. |
| `dbb062b3` | 14:48:23 | Review: Copia i diff diventa icona quando manca spazio; testata su una riga e schede centrate conservate. |
| `00328868` | 15:27:57 | Attesa/ragionamento ricostruiti al cambio sessione; pulsante torna in fondo. |
| `e7bf5088` | 15:46:48 | Pulsante torna in fondo immobile e senza cambio colore all'hover, come chiesto dall'owner. |
| `18a86bed` | 16:09:01 | Recupero delle chiamate storiche con argomenti incompleti nella stessa conversazione. |
| `6916299a` | 16:19:44 | Ricerca/diagnosi saturazione contesto locale e autocompact. |
| `22b819c2` | 18:13:25 | Banco Autocompact isolato. |
| `b1efa9d3` | 18:48:46 | Guasti, trasporti e misure del banco qualificati. |
| `650716d5` | 19:33:16 | Provenienza e risultati intermedi conservati. |
| `15ab635d` | 20:34:19 | Risultati finali v2 del componente e custodia privata del benchmark. |
| `151ae648` | 22:13:27 | Allegati immagine reali, UI di anteprima e provider OpenAI/Anthropic/Gemini diretti. |
| `f9ec4eaa` | 22:30:36 | Accesso pieno fuori workspace: propagazione permessi, trifecta e percorsi assoluti. |

Non attribuire ad Astra le correzioni precedenti del ticket su cartella deleghe/fork, radice C:, browser o albero sessioni: erano gia presenti e sono state ispezionate come baseline.

### Ripresa e decisioni di prodotto

Il ledger di ripresa registra la lettura integrale di:
- `DOMANDE-REDESIGN-TALOS-2026-09-04.md`: 240 domande, otto categorie.
- `DECISIONI-REDESIGN-TALOS-2026-09-04.md`: risposte definitive, chiarimenti e righe aggiuntive.
- `AUDIT-DECISIONI-2026-09-06.md`: 193 righe dichiarate.

Lettura dei requisiti non equivale a riverifica attuale di tutte le 193 righe. Le risposte definitive e le successive scelte dell'owner prevalgono sulle raccomandazioni del questionario. Nessun AGENTS modificato in queste fasi.

### Review, attesa, scorrimento

Review: sovrapposizione riprodotta e corretta; controllo copia 36 px quando compatto, nome accessibile e tooltip conservati. Test inverso reintroduce il difetto e lo rileva. Sul 4174 separazione positiva misurata a 1440/1280/1024. Ledger `LEDGER-REVIEW-RIP-V01-2026-09-08.md`: 463/463 unitari, 12/12 parita interessata, build e immagini aperte.

Chat: attesa ricostruita senza far apparire un'attesa attiva nelle sessioni concluse. Il replay aveva causato 51 mutazioni DOM contro limite 12: corretto senza allentare la prova. Pulsante torna in fondo, poi fix hover senza spostamento/colore. Ledger `LEDGER-BUG-CHAT-LOCALI-2026-09-08.md`: 9/9 browser mirati, 6/6 parita, 463/463 unitari. Distinguere prove a eventi controllati dalle inferenze vere.

### Recupero locale: cosa risolto e cosa no

Sessione problematica `8407d564-f7a0-4e4c-b737-ca5851046a50`: una chiamata storica elenca aveva argomenti JSON `{`. Recupero persistito in nuovo checkpoint, conservando la cronologia precedente, idempotenza e arresto prima dell'inferenza se persistenza fallisce.

Prova locale reale isolata su 4317: follow-up naturale ricorda Livia; dopo reload legge realmente README.md e risponde sole-47; cambio sessione durante attesa. La cronologia di questa seconda prova era una fixture dichiarata.

**La copia completa della conversazione owner restava fuori finestra:** 30.821 token contro 16.384, non risolta dal solo fix JSON. Nessuna falsificazione di successo. Checkpoint recuperato v6 con 406 messaggi usato nel banco. La vecchia cronologia includeva 398 chiamate/risultati, con 397 elenca identici. Originale owner preservato.

Riferimenti: `LEDGER-RECUPERO-LOCALE-2026-09-08.md`, `LEDGER-RICERCA-AUTOCOMPACT-2026-09-08.md`.
Gates storici: backend 1774/1774, registry 296/296, frontend 463/463, browser 15/15.
Rilievo ancora separato: `LAB-STATO-CARICATO-01`, Installati/Panoramica non concordano sul modello caricato; non corretto da questa consegna.

### Qualificazione Autocompact precedente

Banco realmente eseguito, distinto dal TCEC nuovo. Confronta TALOS precedente, Pi 0.85.1 API pubblica, Hermes v2026.9.7 e Hermes/LCM. Due GGUF, finestra 16.384, output 4096, temperatura 0, seed 193; quattro scenari, tre repliche.

- Matrice definitiva v2: **96 casi selezionati**, **132 risultati grezzi**, **36 esclusioni motivate**. Nessun engine promosso.
- Le riprese TALOS/Pi/Hermes superano la finestra nelle condizioni del banco; sintesi troncate e richiamo imperfetto sono conservati.
- LCM conserva originali, ma il richiamo nel contesto attivo non era affidabile in tutte le repliche. Il tool loop comune non esercitava la ricerca nativa LCM: non dichiarare inefficace quel recupero.
- Host completo Hermes: 12/12 avvii rifiutati dal requisito upstream minimo 64k con quel profilo. Non confondere con il confronto dei compattatori.
- Continuita del banco non prova il riavvio nativo delle app.
- Crash Nemotron e difetti iniziali SSE/UTF-8/scorer documentati, con prove ripetute e originali mantenuti. Nessuna esclusione solo per risultato negativo.
- Hermes scaricato nonostante HTTP429, da GitHub Git/GraphQL; commit `2237be355906fbe6065ce1815711eee52b2d646e`, 12.173 blob verificati. LCM `8d1b1e6d3d63f5fc7b209e8d7ec1dc9b814f2e54`.
- GGUF Nemotron SHA256 `a49ff5da4be50235d5aa6c8b7956ff00cc23968f2853145af84b03b1d44c1a71`; GPT-OSS `c27536640e410032865dc68781d80a08b98f8db5e93575919af8ccc0568aeb4f`. Manifest/configurazioni esatte nel rapporto.

Rapporti nella radice desktop:
`CONSEGNA-QUALIFICAZIONE-AUTOCOMPACT-2026-09-08.md`,
`RISULTATI-QUALIFICAZIONE-AUTOCOMPACT-2026-09-08.md`,
`CUSTODIA-BENCHMARK-AUTOCOMPACT-2026-09-08.md`.

Archivio privato:
`C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/evidenze-private/autocompact-2026-09-08-v2.zip`.
SHA256 registrato `a8672a47738203fe7a23813442121f888a1fa91ce0f76cdca4f4ce6b25fe446f`, 2.860 artefatti piu manifest. Questa consegna riporta la verifica precedente, non dichiara di aver ricalcolato oggi l'intero ZIP. v1 conservata. Nessuna pubblicazione; materiale destinabile in futuro alla documentazione tecnica ufficiale solo dopo revisione.

### Immagini e provider

Bug: passava il nome dell'immagine ma non i byte; UI con chip senza contenitore immagine. Correzione completa nel commit immagini, con conservazione/ripresa e anteprima coerente.

Prove reali dal composer della sessione isolata `e66c9fcb-c367-4a97-99b2-609fd2bf7f72`:
- Gemini/OpenRouter: riconoscimento figure e seguito.
- Gemini diretto: figure, lettura reale melograno, firma Google nel checkpoint.
- OpenAI diretto: figure, lettura reale zaffiro, continuita Responses con stato opaco.
- Claude/OpenRouter: figura nuova non descritta, seguito dopo riavvio, lettura giada.
- **Anthropic diretto: API raggiunta ma saldo insufficiente. Inferenza/vision/tool nativi non qualificati sul servizio reale.** Non promettere chiusura di quel gate dai test SDK.

Gates storici: backend 1798/1798, controllo successivo credenziali 9/9; frontend 465/465, componenti 126/126, browser immagini 7/7, kernel 552/552. Screenshot esatti 1080p/1440p/4K aperti, tema chiaro/scuro; directory `.claude/immagini/immagini-chat-2026-09-08/`. Catture 4K tagliate escluse dalle prove valide.

Limiti dichiarati: 5 MiB/immagine, 10/messaggio, 12 MiB risolti/richiesta. Vecchi messaggi con solo nome non ricostruiscono i byte: riallegare. Errori iniziali SSE/native/restart conservati e regressioni permanenti. Due segnalazioni audit preesistenti nella catena pptxgenjs/image-size restano separate.

### Accesso pieno

Owner ha scelto opzione 2: Accesso pieno esplicito non forza conferma aggiuntiva per trifecta. Era mancata propagazione del livello al kernel; corretta. Divieti espliciti, override Chiedi, controlli speciali e floor conservati. Anche discoNode ora risolve un percorso assoluto senza concatenarlo alla cartella del progetto.

Prova reale `2236ac46-59f9-4db6-b0fe-4572807c1b10`: file fuori progetto sul Desktop, lettura/scrittura, due shell, verifica indipendente tormalina; dopo reload nuovo contenuto ametista letto e scritto. Zero REFUSED/ApprovalRequested nel percorso scelto. Primo comando type in Bash WSL2 fallito e conservato, poi percorso /mnt/c riuscito: non conteggiato come successo.
Gates storici: focalizzati 310/310, backend 1803/1803, kernel 552/552; screenshot 1080p/1440p/4K. `CONSEGNA-FULL-ACCESS-2026-09-08.md` e relativo ledger.

## 3. Nuovo TALOS Context Engine: stato reale, non promozione

Piano owner approvato dopo il banco: motore TALOS con archivio SQLite, originali conservati, compattazione segmentata, fatti protetti, ricerca verificabile e UI. Ambito conversazione corrente; niente cloud implicito; chat prioritaria sul locale; modello sintesi segue chat salvo scelta avanzata. Attivazione prima su chat di prova.

Documenti nella worktree TCEC:
- `PIANO-TALOS-CONTEXT-ENGINE-2026-09-08.md`
- `DECISIONI-TALOS-CONTEXT-ENGINE-2026-09-08.md`
- `CONTRATTI-TALOS-CONTEXT-ENGINE-2026-09-08.md`
- `LEDGER-TALOS-CONTEXT-ENGINE-2026-09-08.md`
- `RICERCA-TALOS-CONTEXT-ENGINE-2026-09-08.md`
- `RISULTATI-TALOS-CONTEXT-ENGINE-2026-09-08.md`
- `CONSEGNA-TALOS-CONTEXT-ENGINE-2026-09-08.md`
- `CUSTODIA-BENCHMARK-TALOS-CONTEXT-ENGINE-2026-09-08.md`

| Commit | Contenuto |
|---|---|
| `0e349a67` | Piano, decisioni e contratti congelati. |
| `bbdf9584` | Schemi validati, budget, pianificatore, segmentazione, sintesi e riferimenti. |
| `6d690961` | Adapter provider, contatori, catalogo e compattazione nativa disabilitata senza qualifica. |
| `8c788943` | Ricerca con isolamento sessione, embedding/runtime, asset e filtri RTK dietro adapter. |
| `55e58cc0` | Worker SQLite, WAL/transazioni, originali, import/export, FTS5/sqlite-vec. |
| `3a5559a8` | Controller compattazione, validazione, checkpoint atomico, annullamento/ripresa e gare corrette. |
| `27fadfe4` | Conservazione raw kernel, servizio desktop, rotte context e ricevute idempotenti durevoli. |
| `2ba9d01f` | Registry/agente collegati agli hook; sintesi bounded tramite trasporti esistenti, riserva nel corpo. |
| `94b65167` | Scheduler locale con priorita chat e lease fino al termine stream; composizione runtime isolata. |
| `be324bc4` | Server trial realmente cablato, profili verificati, preparazione identica al conteggio, immagini/reasoning e disabilitazione compressione OpenRouter. |

Base comune del ramo: `f9ec4eaa`. I commit delle worktree agenti possono avere hash diversi per cherry-pick: usare quelli sopra gia integrati, non importarli nuovamente.

### File e responsabilita operative

Nucleo `context-engine/src/engine.mjs`: appendOriginal, prepareForRequest, start/cancel/resume/wait, versioni/restore, fatti, ricerca/export/import. Sintesi senza strumenti eseguibili, citazioni con verifica sorgente, rigetto empty/length/no-reduction, pubblicazione CAS. Originali conservati prima della copia ridotta. Target 55% da completare: ora si verifica fit/riduzione, non ancora l'intero criterio obiettivo.

Store `context-engine/src/node/sqlite-store.mjs`, worker e migrazione001: SQLite nel worker, WAL/FULL, blob per hash, original_records, context_versions, jobs/outbox, FTS5/vettori, context_mutations. Backup coerente/export con verifica. Non copiare soltanto il .sqlite mentre WAL e vivo.

Desktop:
- `harness-ui/src/context-desktop-service.mjs`: API/service, import su riapertura, syncOriginals, createKernelHooks, compact, outbox, idempotenza.
- `harness-ui/src/context-runtime.mjs`: composizione runtime/store/scheduler/adapter, selezione chat trial/profili.
- `harness-ui/src/context-inference-scheduler.mjs`: una inferenza per risorsa in questa istanza; chat precede/interrompe la sintesi, attende la vera chiusura.
- `context-provider-adapter.mjs`: neutralizzazione dello stato opaco incompatibile e serializzazione pubblica SDK.
- `context-token-counters.mjs`: contatori reali dove disponibili, fallback dichiarato, builder desktop riusa immagini/schema shell/reasoning.
- `runtime-owner-adapter.mjs`: callContextModel bounded, no retry/tool, routing esistente; plugin OpenRouter context-compression disabled per TCEC.
- `session-registry.mjs`, `agent-service.mjs`, `kernel/talosHarness.mjs`: hook asincroni, cattura raw, output completo e riserva risposta.
- `http-app.mjs`, `server.mjs`, `config.mjs`: rotte e wiring trial.
- Gli altri adapter ricerca/RTK/catalogo esistono ma non costituiscono da soli la loro integrazione nel loop prodotto.

Trial: env backend `TALOS_CONTEXT_TRIAL` JSON con sessionIds e models[{provider,model,windowTokens,responseReserve}], porta esplicita diversa da4174, directory sessioni esplicita. Assenza -> percorso storico. Database sotto directory configurata/context/context.sqlite. Solo chat nominate. Locale richiede modello pronto/identita/n_ctx coerenti col manifest, non usa la finestra di addestramento come dato effettivo.

### Prove TCEC gia eseguite

Fresche al congelamento:
- `rtk proxy npm test` in context-engine: **59/59**.
- Gruppo runtime/counter/integration/owner/config/server: **84/84**.
- Suite ampliata con kernel completo, provider adapter/nativi, model-destination, rotte, servizio e scheduler: **exit0**.
- `git diff --check` e controllo staged verdi prima del commit.
- Server reale: processo Node con porta effimera, copia JSONL temporanea, import, fatto protetto, arresto/riavvio, replay idempotente ed export. **Nessuna chiamata LLM** in questo test.
- SQLite, FTS5, sqlite-vec Windows e filtro RTK esercitati realmente nelle fasi precedenti; scheduler e sintesi usano operazioni/modelli controllati.
- Regressioni registro/agente precedenti 472/472; kernel con nuovi hook 558 prove nell'ultima fase precedente. Non sommare gruppi sovrapposti come test distinti.
- RED osservati su stop/archive, race cancel/resume, receipt/persistence, preflight OPTIONS legacy, response reserve, paused-job, plugin OR, reasoning e directory trial bianca.

**Non esiste ancora una qualifica reale dei modelli sul TCEC.** Il banco reale del giorno08 riguarda i quattro bracci precedenti, non questo codice. Nessuna foto della nuova modale e stata ancora prodotta/approvata.

## 4. Bozze da recuperare inline

UI: `C:/Users/Antonino/Desktop/projects/AVM-context-ui`, branch codex/tcec-ui, HEAD55e58cc0, file non tracciati:
- harness-ui/frontend/src/components/context-compactor.js
- harness-ui/frontend/src/components/context-separator.js
- harness-ui/frontend/src/services/context-client.js
- harness-ui/frontend/tests/unit/context-client.test.mjs
- harness-ui/frontend/tests/unit/context-compactor.test.mjs
- harness-ui/frontend/tests/unit/context-separator.test.mjs

Non committati, non integrati, non certificati. Markup canonico/parity ancora mancanti. Copiare selettivamente dopo review; non merge cieco della worktree. Modale #veloContesto, sheet contextCompactor, riuso dialoghi.js e chiave talos-harness-modal-sizes-v1. UI finale deve stare nella fonte frontend/mockup/talos-mockup.html; generare template/CSS con script, non editarli a mano.

Qualificazione: `C:/Users/Antonino/Desktop/projects/AVM-context-qualification`, branch codex/tcec-qualification, HEADda02b3b7 (copia del controller).
Modificati engines.mjs e qualification.mjs; nuovi context-engine-cases.mjs, context-engine-protocol.json, talos-context-engine.mjs e relativo test sotto harness-ui/benchmarks/autocompact. Sono bozze del nuovo braccio, non misure reali. Non sovrascrivere i risultati vecchi. Rivedere/integrare e rieseguire inline.

Storage/provider/retrieval gia integrati; nessuna nuova delega da avviare.

## 5. Cosa manca davvero, in ordine utile

1. Rifinire backend: contabilità con il servizio comune della sessione; consegna outbox AG-UI persistente; stato/misura leggibile dalla UI.
2. Invalidare candidati su cambio modello/reasoning/impostazioni; verificare le gare HTTP cancel/resume/idempotenza. Rafforzare forme input e gate native.
3. Collegare archivio byte allegati a import/sync/export reale; recupero automatico fonti e tool context_search/context_read; catalogo attraverso identico dispatch/policy; RTK dopo cattura integrale.
4. Completare profilo target55%, protezione materiale obbligatorio, riuso segmenti verificati tra lavori, ripresa merge intermedi, pulizia runningMap.
5. Coordinamento risorse: scheduler attuale solo in-process. Non certifica esclusione GPU tra server, percorsi locali legacy/non-trial o cambio modello. Anche branch locale legacy del registry e inferenze preparatorie kernel richiedono audit.
6. Collegare UI bozza: modale, auto default, fatti/versioni/fonti/avanzate, progress/cancel/resume, separatore persistente senza duplicati, focus/reload/cambio sessione e resize comune.
7. Qualificare embedding Qwen e runtime CPU; download guidato e verifica hash; ricerca lessicale utilizzabile senza questo download. Nessuna promessa semantica dal solo adapter.
8. Integrare il nuovo braccio benchmark, eseguire due GGUF uno alla volta, almeno tre repliche; recupero406, memoria5/20, tool, restart, allegati/cambio modello, guasti e pressione prolungata.
9. Prove reali da composer con frasi naturali/refusi/stop/reload; screenshot personalmente ispezionati 1920x1080,2560x1440,3840x2160. Account senza credito/credenziali restano non qualificati.
10. Revisione ingegneristica finale richiesta owner: requisiti contro codice/test, sicurezza, perdita dati, crash, concorrenza, permessi, regressioni e packaging. Nessuna dichiarazione di copertura di tutti i casi possibili.
11. Backup verificato chat prova, prova owner e soltanto dopo sua approvazione attivazione generale.

Da ricontrollare esplicitamente: uso di usage dopo risposta nativa troncata; equivalenza corpo conteggiato/inviato su tutti i provider; storico canonico TCEC contro riparazioni legacy dopo restart; profondita copertura dei test di fault injection rispetto a vero crash/disco pieno.

## 6. Proposte e debiti che non vanno dimenticati

Coda owner in desktop: `CODA-PROPOSTE-OWNER-2026-09-08.md`, `CODA-BUG-ASTRA-2026-09-08.md`.
- OAuth OpenAI/Anthropic: ricerca tecnica/licenze/modalita consentite, non ancora implementato. API key dirette non equivalgono a OAuth.
- Computer use integrato TALOS: ricognizione tecnica reale e piano dettagliato, nessuna supposizione sulle implementazioni private dei competitor.
- Suite file Word/PDF/CSV/PPTX/XLSX/TXT e download diretto in chat: requisiti in coda, non dichiarati completi.
- Bash dal composer con prefisso !: ricerca/permessi/output/sandbox e integrazione da fare.
- Fallback a tier definiti dall'utente, riferimento9router: separato dal compattatore; nessuna scelta/attivazione implicita.
- RTK scelto nel piano TCEC dietro adapter per output gia catturati; risparmio20-40% non misurato su TALOS.
- Riga subagente nel pannello destro apre la conversazione con indietro alla lista: richiesta registrata, non implementata in TCEC.
- Pannello destro del ticket originale (attivita/tool/output, consumi e dati reali) e verifica integrale pre-release restano da riconciliare dopo priorita successive, non considerarli chiusi dai fix chat.
- Discrepanza Installati/Panoramica locale e gate Anthropic saldo restano aperti.

## 7. Regole operative per la ripresa

Ricerca primaria corrente prima di ogni edit, ledger file/simboli/RED/GREEN prima del codice. Scelte fondamentali all'owner; l'approvazione del piano copre la sua esecuzione, non cambi architetturali impliciti. Non chiedere nuovamente permessi gia acquisiti.

Astra xhigh per nucleo/integrazione gia annunciato; Fast non usato. Ultimo steering: lavorare inline per consumo crediti. Nessun agente deve modificare file condivisi in parallelo.

Originali mai eliminati automaticamente; nessun cloud implicito dal profilo locale; nessuna promessa di superiorita senza AVM ON/OFF comparabile ed evidenze. Segreti solo portachiavi/config backend, mai doc/commit/raw pubblico.

Shell tramite rtk. Commit autorizzati, senza Co-Authored-By/Claude-Session; push separatamente autorizzato. Non modificare AGENTS. Non riattivare test:lab/playwright.lab rimossi: pipeline frontend attuale.

I numeri di questa consegna sono riferimenti a prove datate, non garanzia che un checkout cambiato domani passi ancora. Per chiudere una fase: test freschi + diff-check + ledger + consegna.

**Cosa deve fare l'owner:** nessuna azione adesso; se Astra si interrompe, passare questo snapshot a Claude e verificare l'eventuale versione successiva.
**Cosa fa Astra dopo:** proseguire inline sui collegamenti backend restanti, poi UI e banco; aggiornare la versione a ogni consegna.
**Cosa rimane:** elenco operativo del paragrafo5, proposte separate e approvazione dell'attivazione generale.


---

## Archivio storico incorporato: CONSEGNA-ASTRA-A-CLAUDE-2026-09-09-v002-081706Z.md

# Consegna Astra a Claude — versione 002

Snapshot: **2026-09-09T08:17:06Z / 2026-09-09T10:17:06+02:00 (Europe/Rome)**.
Codice: **d0c3bbee**, branch `codex/talos-context-engine`, worktree `C:/Users/Antonino/Desktop/projects/AVM-context-engine`.

**I crediti di Astra potrebbero terminare improvvisamente.** Rischio segnalato dall'owner; non e una misura della quota residua. Questa consegna permette la ripresa dal disco.

## Resoconto cumulativo

Questa versione comprende il resoconto storico immutabile [v001, 07:48:05Z](./CONSEGNA-ASTRA-A-CLAUDE-2026-09-09-v001-074805Z.md): tutto il lavoro dal ticket originario dell'8 settembre, fix Review/chat/ripresa, banco Autocompact con insuccessi, immagini/provider, Accesso pieno, backlog e TCEC. Leggere v001 insieme a questo aggiornamento. Nessun risultato storico riscritto o promosso.

## Aggiornamento

- `8c164325`: consegna v001 salvata e copiata identica nella worktree desktop.
- `d0c3bbee`: eventi di versione TCEC collegati al registro. AG-UI CUSTOM, nome talos.context, payload ContextEventV1. Outbox SQLite confermata dopo append JSONL con flush. Retry serializzato per sessione, consegne concorrenti e replay duplicato coperti da test. Server isolato collegato a pubblicaEventoContesto.
- ID uguale con payload diverso rifiutato. Retry in memoria senza seconda trasmissione; replay dopo riavvio elimina copie identiche. Non e una garanzia exactly-once della rete. La UI puo ricevere l'evento prima del flush JSONL, dopo il commit SQLite autorevole.
- Corretto soltanto il generatore di URL del test inventario: un gruppo regex catturante facoltativo diventava un URL inesistente. Nuovo CTX-ROUTE-SAMPLE. Nessuna apertura aggiuntiva nelle rotte di produzione.

## Evidenza fresca

`node --test tests/*.test.mjs` da harness-ui: **1899 totali, 1897 pass, zero fail, due skipped**, 20391.5342 ms. Skip: GGUF/sottomodulo assenti nella worktree, verificati nella suite dedicata (14 pass, 2 skip). Nessuna qualifica dei modelli implicata.

Eventi/servizio/server: **12/12**. SQLite, JSONL e processo server reali, incluso secondo avvio. Versione controllata, nessuna inferenza. Mutation test rimuovendo onEvent: RED zero eventi; ripristino GREEN. ENOSPC iniettato, conflitto durante consegna e doppio replay RED/GREEN. Diff e staged check verdi prima del commit. Ricerca primaria del 9 settembre: AG-UI events, Node appendFile/flush, ECMA262 Pattern. Dettagli in LEDGER, RISULTATI, RICERCA TCEC.

## Ripresa

1. Verificare git status preservando modifiche posteriori allo snapshot.
2. Continuare inline la modale Context Compactor. Bozze non integrate in `C:/Users/Antonino/Desktop/projects/AVM-context-ui`; nessun nuovo agente. Canonico frontend/mockup/talos-mockup.html; generatore mockup-to-template.mjs. Bozze da revisionare, non consegna utilizzabile.
3. Collegare Compatta, polling, fatti, versioni, fonti e separatore CUSTOM. Riutilizzare dialoghi.js e talos-harness-modal-sizes-v1. Verificare focus, Escape, riapertura, cambio sessione, risposte tardive e guasti.
4. Completare punti aperti di v001: contatori visibili/usage comune, recupero automatico e asset, catalogo/RTK, invalidazioni modello/impostazioni, obiettivo e coda corrotta, scheduler reale. Ricontrollare nel codice prima di chiudere ogni punto.
5. Qualifica reale con entrambi i GGUF, tre repliche e casi 406/memoria/tool/riavvio; provider separati. Custodire originali, manifest e insuccessi.
6. Doppia revisione ingegneristica, prove naturali dal composer, screenshot 1920x1080, 2560x1440 e 3840x2160, poi approvazione owner.

## Confini

TCEC isolato, **4174 invariato**, nessun merge in lane/harness-desktop, nessun push. La copia del documento nella worktree desktop cambia solo documentazione. Benchmark precedenti immutabili. Nessuna pubblicazione o credenziale nei documenti. Non modificare AGENTS.

**Owner:** nessuna azione ora.
**Io dopo:** modale e percorso visibile, quindi nuova versione della consegna.
**Rimane:** integrazione completa, qualificazione reale, revisione finale e approvazione dell'attivazione.


---

## Archivio storico incorporato: CONSEGNA-ASTRA-A-CLAUDE-2026-09-09-v003-090454Z.md

# Consegna Astra a Claude — versione 003

Snapshot: **2026-09-09T09:04:54Z / 2026-09-09T11:04:54+02:00, Europe/Rome**.
Codice consegnato: **7cf21930**, branch `codex/talos-context-engine`, worktree `C:/Users/Antonino/Desktop/projects/AVM-context-engine`.

**I crediti di Astra potrebbero terminare improvvisamente.** È il rischio segnalato dall'owner, non una misura della quota residua. Riprendere dal codice e da questa consegna senza presumere che il lavoro sia terminato.

## Resoconto cumulativo da leggere

Questa versione include per riferimento il resoconto storico immutabile [v001](CONSEGNA-ASTRA-A-CLAUDE-2026-09-09-v001-074805Z.md) e l'aggiornamento [v002](CONSEGNA-ASTRA-A-CLAUDE-2026-09-09-v002-081706Z.md). V001 copre il lavoro dall'8 settembre: Review, attesa/scroll/ripresa chat, checkpoint recuperato, banco con fallimenti, immagini e provider diretti, Accesso pieno, backlog e prima implementazione TCEC. V002 aggiunge gli eventi durevoli. Nessun risultato storico è stato riscritto o promosso.

## Novità verificate in 7cf21930

La modale **Context Compactor** è nel mockup canonico e nella build desktop, collegata al pulsante Compatta per le sessioni di prova abilitate. Riusa dialoghi e persistenza delle misure `talos-harness-modal-sizes-v1`, chiave `sheet:context`. Gestisce automazione, avvio/annullamento/ripresa, fatti protetti, conflitti, versioni con conferma di ripristino, consultazione fonti e impostazioni avanzate. Il client usa revisioni e chiavi di idempotenza, senza retry implicito delle mutazioni.

Polling, chiusura, cambio sessione e risposte tardive hanno controlli di generazione. Focus, Escape e ripristino del focus corretti anche quando un controllo viene disabilitato durante una richiesta. Un caricamento di stato fallito disabilita le mutazioni; una risposta tardiva non riscrive la nuova chat. L'avanzamento usa segmenti misurati o stato indeterminato, mai una percentuale inventata. I contatori non disponibili sono dichiarati tali: **il collegamento delle misure correnti resta da completare**.

Gli eventi AG-UI CUSTOM `talos.context` producono un separatore della versione, distinto per sessione e versione, con apertura della modale. La prova desktop verifica persistenza SQLite, replay SSE, un solo separatore dopo reload e fonte originale consultabile. La versione usata per questa parte della prova è una fixture dichiarata; non è una sintesi generata da un LLM.

Le sessioni escluse dalla sperimentazione mantengono la compattazione legacy soltanto su `CTX_NOT_ENABLED`; altri errori non attivano una compattazione alternativa. Il vecchio toast fittizio con numeri di token è stato rimosso per assenza di sessione.

## Nuova richiesta owner: contesto troppo piccolo

Corretto `selectClosedPrefix(force:true)`: il fallback poteva tagliare fra l'ultima domanda e la risposta. Ora mantiene intero l'ultimo scambio. Se manca materiale precedente, `startCompaction` risponde `CTX_NOTHING_TO_COMPACT` prima di risolvere/caricare il modello; originali, job e versione restano invariati. La UI mostra una spiegazione informativa, non un errore generico o un progresso finto.

La compattazione manuale continua a funzionare sotto la soglia automatica e con automazione spenta. Se la sintesi ingrandisce il contesto, resta respinta da `CTX_NO_REDUCTION`; nessun ciclo della stessa richiesta. Istruzioni lunghe con cronologia breve non bloccano l'anticipo automatico se la richiesta entra ancora nella finestra; un overflow effettivo resta un errore esplicito.

Ricerca richiesta dall'owner: [dossier del mese](RICERCA-CONTEXT-ENGINEERING-ULTIMO-MESE-2026-09-09.md), pubblicazioni 9 agosto–9 settembre 2026, quattro paper con limiti espliciti, documentazione ufficiale e codice Hermes/Pi/Codex fissato. Nessuna nuova dipendenza né promessa di superiorità. Criteri aggiuntivi per la qualificazione: stato corrente contro decisioni revocate, risposte senza fonti, conservazione e comportamento misurati separatamente.

## Prove e limiti dei numeri

| Cancello | Risultato |
|---|---|
| Package context-engine completo dopo caso breve | 64/64 |
| Unit frontend dopo patch | 477/477 |
| Componenti completi prima dell'aggiunta del caso breve | 141/141 |
| Browser compattatore dopo caso breve, tre viewport | 18/18 |
| Desktop UI compilata → HTTP → SQLite → SSE, reload | 1/1 |
| Backend desktop-service/routes/server/integration/events/runtime | 30/30 |
| Regressioni attesa/scroll/immagini/cambio sessione sulla build nuova | 22/22 |
| Build frontend | 31 asset, nessun cutover |

RED osservati prima delle correzioni: taglio scambio, caricamento modello su cronologia vuota, alert generico del caso breve, anticipo che bloccava un contesto ancora valido; anche focus/Escape, stato indisponibile e percorso vecchio del pulsante durante l'integrazione UI. Dossier e ledger conservano i dettagli. Nessuna inferenza reale TCEC in questi cancelli; **i modelli non sono ancora qualificati**. Il backend completo 1897 pass/2 skip appartiene allo snapshot precedente, non è stato falsamente dichiarato rieseguito dopo questa patch.

Screenshot guardati personalmente e versionati in `.claude/immagini/tcec/`: contesto standard e caso breve a 1920×1080, 2560×1440, 3840×2160, più regressione 1024×800. Le immagini `desktop-small-*` provengono dal processo desktop isolato reale con chat fixture. Copie identiche in `scratchpad/prove/foto/tcec-desktop-small-*` e annotazioni in `.claude/ISPEZIONI-FOTO.md`. Il primo commit era stato rifiutato perché il cancello cercava le foto solo nello scratchpad: ricevuta regolarizzata dopo vere catture e ispezioni, hook invariato. Ordine owner rispettato: nessuna prova sul 4174.

## Nuovo debito non urgente

Owner, screenshot `C:/Users/Antonino/Downloads/ScreenShot Tool -20260909110154.png`: migliorare la UI dei blocchi di codice. Il multilinea appare a strisce simili a codice inline, separato dalla barra lingua/Copia. Registrato nella `CODA-PROPOSTE-OWNER-2026-09-08.md` di questa worktree. Richiesta: contenitore unico coerente, evidenziazione/tipografia/contrasto/spaziatura, copia fedele, righe lunghe, streaming e verifica nei due temi e tre risoluzioni. **Non urgente, non implementato; non interrompere TCEC.** Prima dell'edit richiede ricerca, ispezione della causa e ledger.

## Lavoro ancora aperto — non dichiarare completo

1. Collegare misure correnti della richiesta e consumi al servizio comune di sessione, senza doppio conteggio; verificare corpo effettivo del provider.
2. Chiudere la revisione di impostazioni, cambi modello/ragionamento, job tardivi, annullamento/ripresa idempotenti, gate native e obiettivo del contesto ricostruito. Verificare riuso segmenti e pulizia dei job in memoria.
3. Collegare recupero automatico, embedding locale qualificato, allegati end-to-end, catalogo tool e RTK al dispatch reale con identiche politiche. Gli adapter presenti non provano da soli la capacità completa.
4. Rivedere ripresa legacy, coda JSONL corrotta con nuovo append e secondo restart, sincronizzazione originali e costo delle sintesi interrotte; scheduling locale anche con processi concorrenti. Nessuna garanzia GPU multiprocesso dedotta dal mutex in-process.
5. Rivedere la posizione cronologica dei separatori con messaggi arrivati durante il lavoro, linguaggi/errore UI e risposte tardive nelle fonti. Prove complete stop, modello diverso, reload, ripristino con suffisso.
6. Qualificare entrambi i GGUF, tre repliche, 406 messaggi, cinque e venti compattazioni, tool, riavvio, allegati e cambi provider; prove API separate. Un modello locale alla volta. Custodire manifest e insuccessi senza riscrivere il vecchio banco.
7. Percorso naturale dal composer al provider effettivo, double check ingegneristico, poi prova dell'owner prima dell'attivazione generale.

Riprendere inline, **senza nuovi agenti**, come ultima istruzione dell'owner. Non ricominciare il piano né dichiarare mancanti file che sono ora committati. Eseguire `git status` prima di ogni ripresa e preservare modifiche posteriori. Residui locali previsti: `harness-ui/frontend/test-results-context/`, `scratchpad/` e artifact ignorati; contengono prove, non modifiche produttive da eliminare indiscriminatamente.

## Confini della consegna

Nessun push, nessun merge in `lane/harness-desktop`, nessun cambio a 4174, AGENTS o credenziali. Tutto TCEC resta nella worktree isolata. Le copie della consegna nella worktree desktop sono documentazione soltanto. V001 e V002 restano immutabili. L'owner ha già autorizzato commit delle consegne; non serve richiederglieli di nuovo.

**Owner:** nessuna azione adesso. **Io dopo:** completare misure/consumi e integrazioni aperte. **Rimane:** qualificazione reale, revisione finale e approvazione dell'attivazione.
