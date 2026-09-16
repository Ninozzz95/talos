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
