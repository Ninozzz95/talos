# Ledger esecutivo — Fase Provider/API key desktop — 2026-08-31

## Perimetro e obiettivo

Portare nel desktop Harness UI la gestione degli accessi provider già presente
nel mobile, adattata al server locale: card espandibili per provider, inserimento
e rimozione della chiave, endpoint e timeout, stato leggibile e messaggi naturali.
La chiave deve restare nel processo/server e nel portachiavi del sistema operativo;
il browser riceve solo presenza e stato. Questa fase non abilita nuovi motori
provider: per provider diversi da OpenRouter mostra configurazione reale e dichiara
onestamente quando il collegamento al motore è ancora successivo.

Non si modifica il repository mobile di riferimento. Il bundle in
`mobile/public/harness-ui/` appartiene a questa lane desktop e viene aggiornato
solo per rendere reale la UI servita dal desktop.

## Decisione upstream e confronto

- OpenRouter, OpenAI, DeepSeek, Gemini e Ollama usano autenticazione Bearer/API key
  o endpoint locale secondo le documentazioni ufficiali; i segreti devono restare
  server-side (`OPENROUTER_API_KEY`, OpenAI, DeepSeek, Anthropic, Gemini/Google,
  Ollama, HF come bootstrap).
- Adottiamo `@napi-rs/keyring@1.3.0` (MIT, portachiavi nativo Windows/macOS/Linux)
  dietro un adapter TALOS. Il pin evita dipendenze mobili o browser-specifiche.
- Rifiutiamo `keytar@7.9.0`: repository archiviato e pacchetto non più mantenuto
  come scelta nuova. Non introduciamo un file cifrato proprietario né chiavi in
  `localStorage`; se il portachiavi non è disponibile, la scrittura fallisce in
  modo esplicito e resta possibile il bootstrap da variabili ambiente.
- Hermes/VS Code/Claude Code separano configurazione dal segreto e mostrano stato,
  non il valore. TALOS mantiene quel principio, aggiungendo la grammatica mobile:
  card richiudibili, mascheramento, salva/rimuovi, endpoint e timeout per provider,
  Doctor con dettaglio azionabile e provider-neutral adapter.

Fonti primarie consultate il 2026-08-31:

- https://openrouter.ai/docs/quickstart
- https://openrouter.ai/docs/api/api-reference/api-keys/create-keys
- https://platform.openai.com/docs/api-reference/backward-compatibility?lang=ruby
- https://ai.google.dev/gemini-api/docs/api-key?hl=en
- https://api-docs.deepseek.com/
- https://docs.ollama.com/api/authentication
- https://www.npmjs.com/package/@napi-rs/keyring
- https://github.com/atom/node-keytar (archiviato; alternativa respinta)

## Ledger a livello di codice

### File da creare

1. `harness-ui/src/provider-credential-store.mjs`
   - `PROVIDER_IDS`, `PROVIDER_DEFINITIONS` (openai, deepseek, anthropic, gemini,
     openrouter, ollama, huggingface).
   - `ProviderCredentialError` con codici naturali e non sensibili.
   - `createProviderCredentialStore({ env, keyring, logger })` con `getKey`,
     `setKey`, `clearKey`, `hasKey`, `listPublic`, `getRuntime`, `setRuntime`.
   - Adapter keyring lazy e bootstrap env; nessun log del valore.
   - `normalizeProviderEndpoint` (solo http/https, niente userinfo, slash finale
     normalizzato, host obbligatorio) e timeout 5–300 secondi.
2. `harness-ui/tests/provider-credential-store.test.mjs`
   - RED/GREEN per bootstrap, trim/blank, keyring, rimozione, isolamento dei
     segreti, endpoint non sicuro, timeout e lista pubblica senza valori sensibili.
3. `harness-ui/tests/http-routes-providers.test.mjs`
   - RED/GREEN per elenco, salva/rimuovi chiave, runtime, provider sconosciuto,
     body malformato e assenza della chiave nella risposta/log.

### File da modificare

1. `harness-ui/package.json`, `harness-ui/package-lock.json`
   - aggiungere e bloccare `@napi-rs/keyring@1.3.0`, mantenendo le dipendenze
     esistenti e gli avvisi di licenza.
2. `harness-ui/server.mjs`
   - creare il credential store una volta; passarlo a HTTP app, Doctor e registro
     sessioni; mantenere `OPENROUTER_API_KEY` come compatibilità.
3. `harness-ui/src/session-registry.mjs`
   - aggiungere il getter dinamico `chiaveFn` per usare una chiave OpenRouter
     salvata dopo l’avvio; nessuna persistenza della chiave nella sessione/evento.
4. `harness-ui/src/http-app.mjs`
   - iniettare `providerStore` e aggiungere GET `/api/v1/providers`, POST
     `/api/v1/providers/:id/key`, POST `.../key/remove`, GET/POST
     `/api/v1/providers/:id/runtime`; codici errore dedicati e messaggi naturali.
   - rifiutare query inattese, provider non in allowlist, body oltre limite o
     chiavi extra; risposte esclusivamente `{configured, endpointConfigured,
     timeoutSeconds}`.
5. `harness-ui/src/doctor.mjs`
   - mantenere `chiaveApi` retrocompatibile e aggiungere il riepilogo pubblico dei
     provider senza segreti.
6. `mobile/public/harness-ui/index.html`
   - sostituire la scheda statica Provider e accessi con sette card accordion,
     form password, endpoint/timeout e azioni salva/rimuovi/reset; testi naturali.
7. `mobile/public/harness-ui/app.js`
   - stato provider, fetch omogeneo alle API esistenti, render e gestione eventi;
     nessuna chiave in localStorage/sessionStorage/URL/telemetria.
8. `mobile/public/harness-ui/styles.css`
   - stili coerenti con token desktop per accordion, stato, errore e form.
9. `mobile/tests/unit/harness/harnessUiFrontend.test.ts`
   - caratterizzazione UI: card richiudibili, salvataggio/rimozione, mascheramento,
     errore naturale, reload dello stato e assert che il segreto non appare nel DOM
     o nel localStorage.
10. `harness-ui/tests/config.test.mjs`, `harness-ui/tests/doctor.test.mjs`,
    `harness-ui/tests/http-routes-doctor.test.mjs`,
    `harness-ui/tests/session-registry.test.mjs`
    - aggiornare solo le asserzioni rese necessarie dal nuovo riepilogo/getter,
      senza indebolire i contratti esistenti.
11. `.claude/LEDGER-TABELLA-DI-MARCIA-DESKTOP-2026-08-30.md`
    - append dell’esito della fase e dei limiti residui.
12. `.claude/CONSEGNA-FASE-PROVIDER-API-KEY-DESKTOP-2026-08-31.md`
    - consegna con file, test, ricerca, confronto competitor, prove UI e limiti.

### Scenari RED obbligatori

- Tutte le card sono inizialmente richiuse; una sola si apre e torna richiudibile.
- Chiave con spazi viene ripulita; chiave vuota/richiesta sconosciuta fallisce senza
  scrivere nulla.
- Il valore della chiave non compare in JSON, HTML, DOM, storage del browser,
  URL, log o Doctor.
- Bootstrap da ambiente mostra solo `configured: true`; il keyring mantiene il dato
  dopo una nuova istanza del processo quando disponibile.
- Endpoint con schema diverso da http/https, userinfo o host mancante viene rifiutato;
  timeout fuori 5–300 viene rifiutato.
- OpenRouter salvato dopo l’avvio viene usato dalla sessione cloud tramite getter
  dinamico; la chiave non viene salvata nella voce di sessione.
- POST con campo extra, JSON invalido, query inattesa o provider non allowlisted
  produce errore naturale e codice stabile.

### Verifica GREEN e regressioni

- `cd harness-ui && npm test -- --test-name-pattern provider` (test mirati), poi
  `node --test tests/*.test.mjs`.
- `cd mobile && npx vitest run tests/unit/harness/harnessUiFrontend.test.ts` e
  suite harness completa.
- `npm run build`/typecheck già previsti dalla lane, più `git diff --check`.
- Smoke server locale: GET elenco, salva/rimuovi provider, riavvio con env bootstrap,
  avvio sessione cloud OpenRouter senza esporre la chiave.

### Prova visiva e confronto

Browser desktop a 1440×900 e 1024×800, screenshot dell’intera pagina per elenco,
card aperta, errore, salvataggio, rimozione e reload. Controllare spaziatura,
contrasto, focus tastiera e responsive; confrontare card/status con Chat, Doctor,
Hermes e pattern di provider di VS Code/Claude Code. Nessuna prova mobile o Pad in
questa fase: mobile resta riferimento in sola lettura.

### Rollback

Rimuovere i file creati, ripristinare le sole sezioni provider elencate nei file
modificati e togliere il pin `@napi-rs/keyring@1.3.0`; non toccare sorgenti locali
runtime/HF né modifiche preesistenti di altre fasi.

## Stato iniziale

## Emendamento 2 — persistenza runtime e QA provider focalizzata (31/8)

L'ispezione GREEN iniziale ha mostrato un divario rispetto al riferimento mobile:
endpoint e timeout restavano disponibili dopo un reload del browser, ma si
perdevano al riavvio del server. La parità richiesta non consente questo scarto.

- Ricerca upstream aggiuntiva: API `node:fs` ufficiali per lettura/scrittura e
  sostituzione del file tramite `rename`; adozione diretta delle primitive Node,
  dietro il contratto TALOS già esistente, senza una nuova dipendenza.
- `harness-ui/src/provider-credential-store.mjs`: aggiungere l'opzione pubblica
  `runtimeFile`; caricare solo endpoint e timeout validati, scrivere un file
  temporaneo e sostituirlo, ignorare in modo esplicito un file assente o corrotto
  senza mai coinvolgere le chiavi.
- `harness-ui/server.mjs`: passare il percorso locale
  `.provider-runtime.json` al provider store.
- `.gitignore`: ignorare esclusivamente `harness-ui/.provider-runtime.json` e il
  relativo file temporaneo.
- `harness-ui/tests/provider-credential-store.test.mjs`: scenario RED permanente
  `PROVIDER-RUNTIME-RESTART-01`, che salva endpoint/timeout, ricrea lo store sullo
  stesso file e pretende lo stesso stato; inoltre file corrotto e valori non
  validi devono essere ignorati senza includere segreti.
- `harness-ui/scripts/qa-visual-pipeline.mjs`: aggiungere lo scenario focalizzato
  `qa-settings-provider-access`, con prove e screenshot di elenco, card aperta,
  salvataggio, rimozione, errore e reload a 1440×900 e 1024×800. La chiave usata
  è un sentinella sintetico, viene rimossa nella stessa corsa e non compare nei
  report o nel DOM.

Il percorso precedente viene quindi corretto prima di ulteriori modifiche di
prodotto: la prova di reload del browser non è più considerata sufficiente per
la persistenza delle preferenze runtime.

La fase è aperta al 2026-08-31: desktop esponeva solo la presenza di
`OPENROUTER_API_KEY` e una scheda non interattiva. Nessun test o UI provider nuova
è considerato chiuso finché i gate sopra non producono evidenza.

## Chiusura verificata — 31/08/2026

La fase Provider/API key è chiusa sul desktop con i seguenti contratti:

- sette provider censiti con stato pubblico, card richiudibili e grammatica
  coerente con il mobile;
- chiavi inserite/rimosse solo al boundary server e salvate nel portachiavi del
  sistema operativo; il browser riceve esclusivamente presenza e stato;
- bootstrap da variabili ambiente mantenuto per compatibilità;
- endpoint e timeout validati con limiti espliciti; per Anthropic e Gemini resta
  disponibile solo il timeout, senza un campo indirizzo che il mobile non prevede;
- preferenze non segrete endpoint/timeout ripristinate dopo riavvio del server
  tramite `.provider-runtime.json` ignorato da git e scritto con sostituzione
  atomica; nessuna chiave entra nel file;
- messaggi utente privi di gergo interno; il dettaglio tecnico resta a Doctor.

### Regressioni trovate e trasformate in test permanenti

1. `CODE-PROVIDERS-UI-03`: il browser applicava `display:flex` ai dettagli
   anche quando l'attributo `hidden` era presente, lasciando contenuti chiusi
   nello spazio della griglia; corretto con regole `[hidden]` esplicite e card
   aperta a tutta la griglia.
2. `CODE-PROVIDERS-UI-04`: il campo indirizzo nascosto per Anthropic/Gemini
   manteneva il layout tramite lo stile del controllo; corretto con una regola
   mirata sul field e con testo di aiuto che parla solo della chiave.
3. `PROVIDER-RUNTIME-RESTART-01/02`: le preferenze runtime sopravvivevano al
   reload ma non al riavvio o a un file corrotto; aggiunta persistenza non
   sensibile e recupero sicuro.

### Evidenza finale

- `node --test harness-ui/tests/provider-credential-store.test.mjs harness-ui/tests/http-routes-providers.test.mjs` — **13/13**;
- `npm exec -- vitest run tests/unit/harness/harnessUiFrontend.test.ts` — **58/58**;
- `npm run build` in `mobile` — **verde**, inclusi verifica chunk iniziale e
  parità ledger;
- `node --check harness-ui/src/provider-credential-store.mjs` — verde;
- `git diff --check` — verde;
- QA Chrome dedicata, entrambe senza console, eccezioni o richieste fallite:
  - 1440×900: `harness-ui/.qa-runs/qa-settings-provider-access-2026-08-31T12-57-47-442Z/`;
  - 1024×800: `harness-ui/.qa-runs/qa-settings-provider-access-2026-08-31T12-57-53-077Z/`.

Ogni corsa contiene sei screenshot (`lista`, `card aperta`, `Anthropic solo
timeout`, `chiave vuota`, `chiave salvata`, `chiave rimossa`), `report.json` con
`difetti: []` e `taccuino.md`. Le dodici immagini sono state ispezionate a
schermo intero, non solo tramite asserzioni DOM.

La suite Node completa del repository resta con **1074/1075**: l'unico errore è
il test preesistente `harness-receipt-keypair.test.mjs`, che cerca
`src/harness-receipt-keypair.mjs` non presente in questa lane. La suite Vitest
completa resta con **6684/6726**, con 32 errori preesistenti di `node-pty`,
tooling Android isolato e documento di conformance shadcn; nessuno appartiene
alla superficie provider, che è verde. Non sono stati corretti perché fuori
perimetro.

### Limiti consegnati

- Solo OpenRouter è collegato all'esecuzione cloud; gli altri adapter di
  esecuzione restano nella fase Provider successiva e sono dichiarati in
  preparazione.
- OAuth OpenRouter desktop non è parte di questa fase.
- Se il portachiavi non è disponibile il salvataggio viene rifiutato con una
  proposta di controllo in Doctor; non viene usato un archivio web di ripiego.
- Nessun commit o push è stato eseguito in questa chiusura.

### Amend del ledger (prima del codice)

L’ispezione ha mostrato che `config.mjs` valida la configurazione generale ma non
deve contenere né propagare mappe di segreti. Gli alias ambiente e i default non
sensibili restano quindi confinati in `provider-credential-store.mjs`; non viene
aggiunto alcun campo segreto al contratto di configurazione. Questa correzione è
registrata prima delle modifiche di comportamento e non amplia nessun altro
percorso.
