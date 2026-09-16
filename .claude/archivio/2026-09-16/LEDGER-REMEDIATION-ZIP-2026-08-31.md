# Ledger di remediation — Harness Desktop — 2026-08-31

## Perimetro e regole

- Lane proprietaria: `AVM-harness-desktop`, soltanto desktop.
- `mobile/`, `AVM-harness`, `TALOS-BANCO` e checkout fratelli non sono sorgenti
  runtime del prodotto desktop e non vengono modificati.
- Nessun commit o push in questa sessione.
- Ogni comportamento nuovo segue RED → GREEN; la suite completa è il gate di
  regressione prima di aprire il blocco successivo.

## P0.0 — audit riproducibile della consegna

File creati/modificati:

- `harness-ui/scripts/audit-harness-findings.mjs` — classifica i finding in
  `VALIDATED`, `FALSE-POSITIVE`, `ACCEPTED-RISK`, `FIXED`, `REJECTED`.
- `harness-ui/tests/audit-harness-findings.test.mjs` — prova il caso RED dello
  scanner mancante e il caso GREEN con distinzione fra uso di `RegExp.exec` e
  confini reali di processo.

Gate: `rtk node --test tests/audit-harness-findings.test.mjs`.

## P0.1 — separazione dal checkout esterno e process policy

File creati:

- `harness-ui/src/workspace-disk.mjs` — elenco locale di un livello, ordinato,
  con contenimento del percorso.
- `harness-ui/src/process-policy.mjs` — `createProcessPolicy`,
  `runApprovedProcess`, `resolveApprovedExecutable`, `parseProcessCommand` e
  `ProcessPolicyError`.
- `harness-ui/src/runtime-owner-contract.mjs` — envelope iniziale per runtime
  configurato/non configurato.
- `harness-ui/src/runtime-owner-adapter.mjs` — adapter lazy verso il runtime
  owner, senza import statici da checkout fratelli.
- `harness-ui/src/forge-contract.mjs` — interprete locale puro dei contratti
  forge già usati dal servizio, senza esecuzione di processi.

File modificati:

- `harness-ui/src/workspace-tree.mjs` — usa `workspace-disk.mjs`.
- `harness-ui/src/task-catalog.mjs` — provider runtime iniettato; senza
  provider espone `TASK_CATALOG_UNAVAILABLE`, mai fixture.
- `harness-ui/src/session-registry.mjs` — inoltra il provider al catalogo.
- `harness-ui/src/doctor.mjs` — controllo locale dietro process policy.
- `harness-ui/src/agent-service.mjs` — runtime owner lazy e forge locale.
- `harness-ui/src/workspace-context.mjs` — Git dietro process policy.
- `harness-ui/src/workspace-files.mjs` — Explorer dietro process policy.
- `harness-ui/src/hook-registry.mjs` — comando tokenizzato, shell disabilitata,
  allowlist e output bounded.
- `harness-ui/src/plugin-session.mjs` — stessa policy per tool plugin.
- `harness-ui/src/hf-model-transfer.mjs` — Hugging Face CLI dietro policy,
  cwd esplicito.
- `harness-ui/src/llama-server-supervisor.mjs` — llama-server dietro policy,
  shell disabilitata e cwd esplicito.
- `harness-ui/src/config.mjs` — `ownerRuntimeModule` assoluto e verificato.
- `harness-ui/src/http-app.mjs` — `TASK_CATALOG_UNAVAILABLE` è una risposta
  controllata (`503`).
- `harness-ui/server.mjs` — costruisce adapter/provider e li inietta.

Test:

- `harness-ui/tests/workspace-disk.test.mjs`
- `harness-ui/tests/workspace-tree.test.mjs`
- `harness-ui/tests/process-policy.test.mjs`
- `harness-ui/tests/runtime-owner-contract.test.mjs`
- `harness-ui/tests/runtime-owner-adapter.test.mjs`
- `harness-ui/tests/runtime-config.test.mjs`
- aggiornati `task-catalog.test.mjs` e i test di servizio/route collegati.

Invarianti verificate:

- nessun import statico da `AVM-harness` o `TALOS-BANCO` in `harness-ui/src`;
- nessun `node:child_process` fuori da `process-policy.mjs`;
- `shell:false`, argv separati, cwd assoluto e capability esplicita per il
  nuovo percorso `runApprovedProcess`;
- ambiente figlio filtrato da allowlist, output limitato, timeout/AbortSignal
  che terminano il processo;
- runtime assente distinto da runtime disponibile ma vuoto.

Gate eseguiti:

```text
rtk node --test tests/process-policy.test.mjs                         8/8
rtk node --test tests/workspace-context.test.mjs tests/workspace-files.test.mjs tests/process-policy.test.mjs 47/47
rtk node --test tests/hook-registry.test.mjs                         15/15
rtk node --test tests/plugin-session.test.mjs                         14/14
rtk node --test tests/hf-model-transfer.test.mjs                      8/8
rtk node --test tests/llama-server-supervisor.test.mjs                 6/6
rtk node --test tests/task-catalog.test.mjs tests/session-registry.test.mjs tests/http-routes-sessions.test.mjs tests/http-app.test.mjs 301/301
rtk node --test tests/*.test.mjs                                      1098/1098
```

## P0.2 â€” contratto runtime, stato freddo ed errori pubblici

File creati/modificati:

- `harness-ui/src/runtime-contract.mjs` â€” schema e parser versionati per il
  bootstrap runtime, risorse e fasi canoniche; nessun elenco inventato quando
  il backend non Ã¨ configurato.
- `harness-ui/contracts/runtime-bootstrap-v1.schema.json`
- `harness-ui/contracts/runtime-event-v1.schema.json`
- `harness-ui/tests/fixtures/runtime-contract-v1.json`
- `harness-ui/src/public-problem.mjs` â€” traduzione in linguaggio naturale,
  riferimento Doctor e dettaglio diagnostico redatto.
- `harness-ui/tests/runtime-contract.test.mjs`,
  `harness-ui/tests/public-problem.test.mjs`, aggiornamenti a
  `harness-ui/tests/http-app.test.mjs`.

Invarianti e gate:

- runtime non configurato: `items: null`; runtime configurato ma senza modelli:
  `items: []`;
- errori HTTP con titolo, spiegazione, azione e riferimento Doctor, senza stack,
  percorsi assoluti, chiavi o variabili sensibili;
- `rtk node --test tests/runtime-contract.test.mjs tests/public-problem.test.mjs tests/runtime-config.test.mjs tests/http-app.test.mjs` â€” verde.

## P0.3 â€” ciclo richiesta/SSE e chiusura risorse

File creati/modificati:

- `harness-ui/src/http-lifecycle.mjs` â€” `createRequestLifecycle`,
  `createSseSession`, `closeRuntimeResources`; abort idempotente, timer
  disinnescati, heartbeat e `Last-Event-ID` rispettati, chiusura asincrona
  delle risorse.
- `harness-ui/src/http-app.mjs` â€” rotta SSE collegata al ciclo condiviso,
  con header di sicurezza e cleanup dell'iscrizione.
- `harness-ui/server.mjs` â€” shutdown idempotente che attende scheduler e
  runtime locali prima di chiudere il server.
- `harness-ui/tests/http-lifecycle.test.mjs` â€” test contrari per disconnect,
  heartbeat, replay e cleanup; test asincrono per risorse che rifiutano.

Gate:

```text
rtk node --test tests/http-lifecycle.test.mjs tests/http-routes-sessions.test.mjs tests/http-app.test.mjs 124/124
rtk node --test tests/*.test.mjs 1115/1115
```

## Decisioni upstream registrate

- Node `child_process`: adattato dietro `process-policy.mjs`; niente shell
  composta (documentazione ufficiale Node).
- SSE/AG-UI e JSON Schema 2020-12 restano i contratti previsti per i blocchi
  successivi; l'adapter owner è lazy per non mascherare un runtime assente.
- Hugging Face Hub CLI e llama.cpp restano integrazioni dirette, ma entrano
  nel prodotto solo dietro allowlist, capability, health e rollback.

## P0.4 — output non fidato, stream e immagini

File creati:

- `harness-ui/src/stream-partition.mjs` — separa testo, ragionamento e tool-call
  anche quando i delimitatori arrivano spezzati fra più chunk.
- `harness-ui/src/hf-image-proxy.mjs` — proxy Hugging Face con HTTPS, host
  consentiti, validazione DNS a ogni redirect, MIME e dimensione limitati.
- `harness-ui/src/generated-image-store.mjs` — copia durevole locale delle
  immagini generate, sidecar con schema/hash e rilettura dopo un nuovo processo.
- `harness-ui/tests/stream-partition.test.mjs`,
  `harness-ui/tests/hf-image-proxy.test.mjs`,
  `harness-ui/tests/generated-image-store.test.mjs`.

File modificati:

- `harness-ui/src/local-runtime-llama-server.mjs` e
  `harness-ui/src/openai-compatible-runtime.mjs` — gli eventi `think` e
  `tool_call` finiscono nei canali AG-UI dedicati, mai nel testo finale.
- `harness-ui/src/hf-hub-client.mjs` — estrae immagini HTML/Markdown della
  model card come descrittori sicuri.
- `harness-ui/src/http-app.mjs` e `harness-ui/server.mjs` — endpoint proxy locale
  per le immagini e collegamento dello store di recupero.
- `harness-ui/src/agent-service.mjs` e `harness-ui/src/session-registry.mjs` —
  persistenza durevole prima della copia nel workspace; rollback della copia
  di recupero se il workspace rifiuta il file.
- `harness-ui/public/app.js` e `harness-ui/public/styles.css` — model card resa
  con nodi DOM e immagini caricate solo dal proxy locale.

Gate RED/GREEN:

```text
rtk node --test tests/stream-partition.test.mjs tests/local-runtime-llama-server.test.mjs tests/openai-compatible-runtime.test.mjs 18/18
rtk node --test tests/hf-image-proxy.test.mjs tests/hf-hub-client.test.mjs tests/http-routes-huggingface.test.mjs 15/15
rtk node --test tests/generated-image-store.test.mjs tests/agent-service.test.mjs tests/image-generator.test.mjs 179/179
```

Invarianti: nessun tag `think`/`tool_call` nel renderer del testo; nessuna
richiesta browser verso URL HF arbitrari; immagini generate verificabili e
riapribili dopo reload; errore di salvataggio esposto in linguaggio naturale.

Confronto competitivo annotato: Hermes/Codex mostrano reasoning e tool come
blocchi distinti, ma non offrono nel perimetro desktop osservato una copia
locale verificabile con checksum. TALOS adotta la separazione AG-UI e aggiunge
proxy locale, sidecar e recovery; il costo è una piccola copia durevole in più,
accettata perché mantiene il comportamento local-first e il recupero dopo
riavvio.

## P0.5 — UI desktop canonica e prova visiva

File creati/modificati:

- `harness-ui/public/index.html`, `harness-ui/public/app.js`,
  `harness-ui/public/styles.css` — copia desktop locale degli asset esistenti,
  con logo TALOS reale e correzione model card; `mobile/` resta read-only.
- `harness-ui/scripts/build-ui.mjs` e
  `harness-ui/scripts/verify-ui-manifest.mjs` — manifest SHA-256 e controllo
  anti-drift/anti-traversal.
- `harness-ui/tests/ui-build.test.mjs` e
  `harness-ui/tests/ui-untrusted-content.test.mjs` — build, hash, contenuti
  esterni e sink HTML non fidati.
- `.gitignore` — `harness-ui/dist/` e `.generated-images/` sono dati generati
  locali, mai sorgente.

Gate reale browser:

- `qa-p0-ux` eseguito e ispezionato a `1440×900` e `1024×800`: impostazioni
  full-width, nuova sessione con errore naturale e soluzione, menu CRUD della
  riga sessione, nessuna eccezione JS o richiesta HTTP fallita.
- `qa-settings-model-lab` eseguito e ispezionato a `1440×900` e `1024×800`:
  capacità, runtime, provider, catalogo, filtri, modelli installati, Hugging
  Face e download; nessuna eccezione JS o richiesta HTTP fallita.
- Screenshot e report sono in
  `harness-ui/.qa-runs/qa-p0-ux-2026-08-31T16-46-48-336Z/`,
  `harness-ui/.qa-runs/qa-p0-ux-2026-08-31T16-47-06-069Z/`,
  `harness-ui/.qa-runs/qa-settings-model-lab-2026-08-31T16-47-26-635Z/` e
  `harness-ui/.qa-runs/qa-settings-model-lab-2026-08-31T16-47-56-880Z/`.

Gate build:

```text
rtk npm run build:ui  — 22 asset nel manifest
rtk npm run verify:ui — manifest verificato
```

## Rischi aperti P0

- Nessun rischio P0 tecnico residuo individuato nei gate automatici o nelle
  prove browser eseguite. Restano da eseguire, quando disponibili, soltanto
  eventuali prove con un provider reale e con il runtime locale scelto
  dall'owner: sono gate di P1, non simulati come completati qui.

## Rollback

Ripristinare soltanto gli adapter locali e riattivare temporaneamente il
provider precedente tramite configurazione iniettata; non reintrodurre mai
import relativi a checkout esterni e non cancellare modifiche preesistenti.

## P1.1 — Model Lab completo: ricerca, download e modelli installati

Stato iniziale verificato il 31/08/2026: il backend possiede già il percorso
HF diretto, l'import locale e lo store atomico, ma la UI espone solo ricerca
semplice e download; mancano filtri/ordinamento/paginazione, importazione da
file scelto dall'utente, azioni sui modelli installati e la barra di progresso
riusabile nel dettaglio del file.

File esatti da modificare:

- `harness-ui/src/hf-hub-client.mjs` — `searchModels` con sort/author/filter e
  cursore; normalizzazione del cursore restituito dall'Hub.
- `harness-ui/src/local-model-store.mjs` — `rename` con manifest atomico,
  mantenendo `id`/percorso stabili e aggiungendo il nome visualizzato validato.
- `harness-ui/src/hf-model-transfer.mjs` — import locale con verifica file,
  errore di sorgente leggibile e stato coerente.
- `harness-ui/src/http-app.mjs` — query HF estese e rotte `rename`, `copy-path`
  e `delete` per i modelli locali.
- `harness-ui/public/index.html` — controlli filtri, paginazione, picker GGUF e
  contenitore coda globale sopra le sidebar.
- `harness-ui/public/app.js` — stato e rendering dei controlli, azioni installati,
  barra download nel dettaglio e import; nessun percorso/segreto nel DOM.
- `harness-ui/public/styles.css` — layout responsive e barra di progresso.
- `harness-ui/tests/hf-hub-client.test.mjs` — RED per query e cursore.
- `harness-ui/tests/local-model-store.test.mjs` — RED per rinomina atomica.
- `harness-ui/tests/http-routes-model-lab.test.mjs` — RED per CRUD installati e
  query HF.
- `harness-ui/tests/model-lab-e2e.test.mjs` — nuovo percorso completo UI/API,
  reload, errore rete, file mancante e conferma eliminazione.

Ricerca upstream obbligatoria già eseguita prima della modifica:

- Hugging Face file download: revisione fissata, cache/ETag e `dry_run` —
  https://huggingface.co/docs/huggingface_hub/main/package_reference/file_download
- Hugging Face search/list: filtri, ordinamento e limite —
  https://huggingface.co/docs/huggingface_hub/guides/search
- Hugging Face model cards: README come sorgente e immagini esplicite —
  https://huggingface.co/docs/hub/main/model-cards

Decisione upstream: ADAPT. Manteniamo il client `fetch` già presente dietro
un adapter TALOS server-side; adottiamo revisione completa e cursore Hub,
senza introdurre il client Python/CLI nel browser. Il percorso UI resta
provider-neutral e conserva il pin reale già registrato in Fase 10.

RED atteso: i nuovi test devono fallire perché le query vengono ignorate, il
manifest non conserva un nome visualizzato, le rotte CRUD non esistono e la UI
non espone i controlli. GREEN mirato: `rtk node --test` sui quattro file
dedicati; regressione completa `rtk node --test tests/*.test.mjs`, build e
manifest UI, `rtk git diff --check`.

Gate reale: repository HF pubblico pinnato già registrato in Fase 10,
download con pausa/ripresa/annulla, file GGUF locale scelto dall'utente,
reload del browser, hash errato, sorgente mancante, rete assente e disco
insufficiente. Evidenza visiva a 1440×900 e 1024×800 con screenshot ispezionati
per intero; confronto annotato con VS Code/Cursor/Cline/Hermes per lista,
queue e azioni contestuali.

Rollback: disattivare i nuovi controlli UI e rimuovere soltanto le rotte
aggiunte; i manifest precedenti e il trasferimento HF già verde devono restare
leggibili senza migrazioni distruttive.

### Esito P1.1 parziale verificato

RED/GREEN completato per query Hub, cursore, rinomina atomica e rotte CRUD:
25 test dedicati verdi. La coda ora mostra una progress bar anche per gli
stati `ready` e `paused`; il dettaglio HF usa lo stesso controllo per avvio e
progresso. La UI mantiene l'importazione locale esplicitamente non disponibile
finché non viene definito un canale file sicuro e testato: nessun pulsante
attivo promette un'operazione che il browser non può completare.

Regressione visiva registrata: i controlli avanzati erano stati inseriti in
una posizione globale e apparivano nella scheda Download. Sono stati spostati
nei pannelli corretti e il CSS ora forza la visibilità di una sola scheda
Model Lab alla volta. Screenshot corretti:
`harness-ui/.qa-runs/qa-model-lab-huggingface-download-2026-08-31T18-24-52-032Z/`.

## P1.2 — Importazione GGUF locale dal browser, senza percorsi del computer

Motivo: l'importazione locale è ancora disattivata nella UI. L'attuale rotta
JSON con `sourcePath` accetterebbe un percorso del computer del server e non è
un canale adatto al browser; non deve essere riattivata così.

File esatti:

- `harness-ui/src/hf-direct-transfer.mjs` — nuovo metodo pubblico
  `importStream(readable, metadata)`: stream binario locale, limite di byte,
  controllo `GGUF` sui primi quattro byte, hash SHA-256, file temporaneo e
  pubblicazione atomica del manifest.
- `harness-ui/src/http-app.mjs` — rotta `POST /api/v1/local-models/import`
  binaria con intestazioni metadata; rifiuto esplicito del vecchio JSON
  `sourcePath`, messaggi naturali e nuovi codici di errore.
- `harness-ui/public/app.js` — picker `.gguf`, upload XHR con avanzamento,
  annulla lato UI e aggiornamento della lista; nessun percorso assoluto nel
  DOM o nella richiesta.
- `harness-ui/public/styles.css` — stato e barra di avanzamento importazione.
- `harness-ui/tests/hf-direct-transfer.test.mjs` — RED per magic errato,
  hash/byte count, limite e pubblicazione atomica.
- `harness-ui/tests/http-routes-model-lab.test.mjs` — RED per canale binario,
  rifiuto `sourcePath` e metadata mancanti.
- `harness-ui/tests/model-lab-e2e.test.mjs` — nuovo test di contratto UI/API per
  picker, progresso, errore e reload.

Ricerca upstream e decisione: ADAPT. La File API del browser espone i file
scelti dall'utente senza rivelare un percorso locale; MDN indica `XMLHttpRequest`
per l'avanzamento upload perché Fetch non espone ancora un evento upload
standard ([File API](https://developer.mozilla.org/en-US/docs/Web/API/File_API),
[upload progress](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload)).
Il formato GGUF è accettato solo se il magic iniziale è `GGUF`, come definito
dal sorgente canonico ggml-org/llama.cpp
([gguf.h](https://github.com/ggml-org/llama.cpp/blob/master/ggml/include/gguf.h)).

RED atteso: il metodo di import non esiste, la rotta rifiuta il binario e il
picker resta disabilitato. GREEN mirato: test transfer + rotte, poi suite
completa, build/manifest UI, `git diff --check` e pipeline visiva a 1440×900 e
1024×800 (Installati, Importazione in corso, errore, Download senza controlli
estranei). Gate reale: un GGUF di prova, file non-GGUF, dimensione oltre il
limite, interruzione, reload e collisione id. Rollback: mantenere il picker
disabilitato e rimuovere soltanto la rotta binaria/metodo, lasciando intatto il
download HF già verde.

### Esito P1.2 verificato

RED/GREEN completato: `importStream` usa il flusso HTTP senza `sourcePath`,
applica limite, controllo magic GGUF, conteggio byte, SHA-256 e rename
atomico; il manifest locale è pubblicato soltanto dopo la verifica. La UI
offre picker, avanzamento, annullamento e aggiornamento della lista. Test
dedicati P1.2 verdi (22/22 insieme a rotte e contratto UI); suite completa
desktop **1146/1146**; build/manifest **22/22**; `node --check` e
`git diff --check` verdi.

QA visiva integrale: corse 1440×900 e 1024×800 nelle cartelle
`harness-ui/.qa-runs/qa-model-lab-huggingface-download-2026-08-31T19-36-32-646Z/`
e `harness-ui/.qa-runs/qa-model-lab-huggingface-download-2026-08-31T19-36-53-467Z/`;
zero eccezioni e zero HTTP fallite. Residui dichiarati: gate con file GGUF
reale dell'owner e prove di interruzione/reload/offline/disco pieno; filtri
semantici predefiniti ancora da implementare.
