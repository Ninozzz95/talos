# Consegna — Provider e accessi desktop

Data: 31 agosto 2026  
Lane: `lane/harness-desktop`  
Perimetro: Harness UI desktop, con il mobile usato solo come riferimento di
parità. TALOS-BANCO, il runtime Android e il repository mobile non sono stati
modificati.

## Risultato

La sezione **Laboratorio modelli → Provider** ora permette di consultare e
gestire gli accessi dal desktop senza portare segreti nel browser. Ogni provider
ha una card richiudibile; l'utente può incollare una chiave, salvarla,
rimuoverla e leggere soltanto lo stato. Gli endpoint e i tempi massimi sono
separati dalla chiave e seguono le capacità già esposte dal mobile.

Sono coperti: OpenRouter, OpenAI, DeepSeek, Anthropic, Google Gemini, Ollama
Local e Hugging Face. OpenRouter resta l'unico provider con esecuzione cloud
collegata in questa fase; gli altri mostrano configurazione reale ma dichiarano
quando il motore è ancora in preparazione.

## File creati o modificati in questa fase

### Codice e dipendenze

- `harness-ui/src/provider-credential-store.mjs` — adapter unico per portachiavi,
  bootstrap ambiente, stato pubblico, validazione endpoint/timeout e persistenza
  non segreta delle preferenze runtime.
- `harness-ui/server.mjs` — costruzione del credential store, keyring lazy,
  getter dinamico della chiave OpenRouter e file runtime locale.
- `harness-ui/src/session-registry.mjs` — uso dinamico della chiave OpenRouter
  senza inserirla nella sessione.
- `harness-ui/src/http-app.mjs` — endpoint GET/POST provider, contratti stretti,
  errori naturali e risposte prive di segreti.
- `harness-ui/src/doctor.mjs` — riepilogo pubblico dello stato provider e
  disponibilità del portachiavi, mantenendo la compatibilità del controllo
  `chiaveApi`.
- `harness-ui/package.json` e `harness-ui/package-lock.json` — pin esatto
  `@napi-rs/keyring@1.3.0`.
- `.gitignore` — esclusione di `harness-ui/.provider-runtime.json` e del file
  temporaneo di sostituzione.
- `mobile/public/harness-ui/index.html` — card accordion e form provider.
- `mobile/public/harness-ui/app.js` — caricamento stato, azioni salva/rimuovi,
  runtime, messaggi e comportamento differenziato per provider.
- `mobile/public/harness-ui/styles.css` — griglia responsive, dettagli realmente
  nascosti e card espansa a tutta larghezza.

### Test e prova visiva

- `harness-ui/tests/provider-credential-store.test.mjs` — store, keyring,
  bootstrap, validazione, segreti, riavvio e file corrotto.
- `harness-ui/tests/http-routes-providers.test.mjs` — contratti HTTP positivi e
  contrari, inclusi Anthropic/Gemini senza endpoint.
- `mobile/tests/unit/harness/harnessUiFrontend.test.ts` — comportamento UI,
  nessun segreto nel DOM/storage, card e layout.
- `harness-ui/scripts/qa-visual-pipeline.mjs` — scenario
  `qa-settings-provider-access` con sei screenshot e raccolta di console,
  eccezioni e richieste fallite.
- `.claude/LEDGER-FASE-PROVIDER-API-KEY-DESKTOP-2026-08-31.md` — ledger
  completo, emendamenti, regressioni permanenti e gate.

## Contratto di sicurezza

La chiave attraversa il boundary HTTP locale solo per arrivare al server e
viene salvata nel portachiavi del sistema operativo. Le risposte contengono
solo `keyConfigured`, `endpointConfigured` e `timeoutSeconds`; il valore non
entra in sessioni, log, Doctor, URL, `localStorage`, `sessionStorage` o HTML.
Le preferenze endpoint/timeout, che non sono segreti, sopravvivono al riavvio in
`.provider-runtime.json` tramite scrittura temporanea e sostituzione atomica.
Un file assente, corrotto o non valido viene ignorato senza fermare l'app.

Se il portachiavi non è disponibile, il salvataggio fallisce apertamente e
indirizza l'utente a Doctor. Non è stato introdotto un archivio web alternativo.

## Parità mobile e confronto esterno

La struttura segue il Laboratorio modelli mobile: card richiudibili, stato senza
segreto, tempo massimo separato e provider dichiarati. Il desktop aggiunge la
persistenza delle sole preferenze runtime dopo riavvio, necessaria perché il
server locale è un processo persistente distinto dal browser.

Il confronto con Hermes, VS Code e Claude Code conferma il principio di separare
configurazione e segreto e di mostrare lo stato invece del valore. TALOS mantiene
questo punto forte e conserva la grammatica mobile; il compromesso attuale è che
gli adapter di esecuzione esterni restano esplicitamente in preparazione, quindi
la UI non finge una capacità non collegata.

Decisioni upstream:

- adottato `@napi-rs/keyring@1.3.0` (MIT) come portachiavi nativo dietro
  adapter TALOS;
- rifiutato `keytar`, il cui repository upstream risulta archiviato;
- adottate le primitive ufficiali Node `fs` per file non segreti e sostituzione
  atomica;
- mantenuti gli alias ambiente provider già documentati, senza loggare valori.

Fonti primarie consultate il 31/08/2026:

- [OpenRouter quickstart](https://openrouter.ai/docs/quickstart) e [API keys](https://openrouter.ai/docs/api/api-reference/api-keys/create-keys)
- [OpenAI API reference](https://platform.openai.com/docs/api-reference/backward-compatibility)
- [Google Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key)
- [DeepSeek API docs](https://api-docs.deepseek.com/)
- [Ollama authentication](https://docs.ollama.com/api/authentication)
- [`@napi-rs/keyring`](https://www.npmjs.com/package/@napi-rs/keyring)
- [Node.js file-system promises](https://nodejs.org/api/fs.html#fspromiseswritefilefile-data-options)
- [node-keytar, archiviato](https://github.com/atom/node-keytar)

## Verifica eseguita

- `node --test harness-ui/tests/provider-credential-store.test.mjs harness-ui/tests/http-routes-providers.test.mjs` — **13/13**;
- `npm exec -- vitest run tests/unit/harness/harnessUiFrontend.test.ts` — **58/58**;
- `npm run build` in `mobile` — **verde**, inclusi verifica del chunk iniziale e
  parità del ledger;
- `node --check harness-ui/src/provider-credential-store.mjs` — **verde**;
- `git diff --check` — **verde**.

La pipeline visiva è stata eseguita sul server `http://127.0.0.1:4174` in due
corse separate:

- [QA 1440×900](../harness-ui/.qa-runs/qa-settings-provider-access-2026-08-31T12-57-47-442Z/)
- [QA 1024×800](../harness-ui/.qa-runs/qa-settings-provider-access-2026-08-31T12-57-53-077Z/)

Ogni cartella contiene sei PNG, `report.json` con `difetti: []` e `taccuino.md`.
Sono state ispezionate tutte le dodici immagini a schermo intero. Entrambe le
corse riportano zero righe console, zero eccezioni JavaScript e zero richieste
HTTP fallite. La prova contraria della chiave vuota produce volutamente 422,
viene riconosciuta dalla pipeline e non viene registrata come difetto.

## Limiti e debiti residui

- OpenRouter è l'unico adapter di esecuzione cloud collegato; non è una promessa
  di esecuzione per OpenAI, DeepSeek, Anthropic o Gemini.
- OAuth OpenRouter desktop resta fuori da questa fase.
- La suite Node completa della repository ha 1074/1075: l'unico errore è il
  test preesistente `harness-receipt-keypair.test.mjs`, che cerca
  `src/harness-receipt-keypair.mjs` assente in questa lane.
- La suite Vitest completa ha 6684/6726 (3 file falliti, 32 test) per dipendenze
  o documenti preesistenti fuori dal provider; la suite Harness mirata è verde.
- Restano aperte le fasi Model Lab 5A/5B, performance, provider esterni e
  installer. Il known issue Full access con radice `C:\` resta registrato nel
  ledger e non è stato toccato.

## Riepilogo semplice per l'owner

Ora dal desktop puoi aprire ogni provider, inserire o togliere la chiave e
modificare il tempo massimo senza che la chiave venga mostrata o salvata nel
browser. Le preferenze non segrete restano anche dopo aver riavviato il server.
La grafica è stata controllata a due dimensioni desktop e laptop e non sono
rimasti difetti nelle dodici schermate esaminate. La parte che manca non è stata
nascosta: collegare davvero tutti i motori esterni, completare i modelli locali
e OAuth sono fasi successive.

Nessun commit e nessun push sono stati eseguiti.
