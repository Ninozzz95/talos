# Consegna Fase 10 — Hugging Face diretto e runtime desktop

Data: 2026-08-31  
Lane: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`  
Stato: **chiuso nel perimetro desktop: ricerca, download verificato, installazione e inferenza locale provate**

## Cosa è stato implementato

- Client server-side `harness-ui/src/hf-hub-client.mjs` con ricerca GGUF,
  model card/README, tree, paths-info, revision completa e URL CDN firmati.
- Trasferimento diretto `harness-ui/src/hf-direct-transfer.mjs`: coda,
  progresso, pausa, ripresa, annullamento, file temporanei, rename atomico e
  SHA-256 prima dello stato `ready`.
- Rotte HTTP in `harness-ui/src/http-app.mjs`:
  `GET /api/v1/huggingface/search`, `GET /api/v1/huggingface/repo`,
  `GET /api/v1/huggingface/downloads`, `POST /api/v1/huggingface/download`,
  `POST /api/v1/huggingface/downloads/:id/{pause,resume,cancel}`.
- Wiring in `harness-ui/server.mjs`: token `HF_TOKEN` solo server-side,
  store locale e transfer diretto; `TALOS_LLAMA_SERVER_PATH` abilita il
  runtime llama.cpp quando il binario è realmente presente.
- Laboratorio modelli in `mobile/public/harness-ui/index.html/app.js`: ricerca,
  risultati, dettaglio file GGUF, set shard incompleti disabilitati, download
  e Centro download con controlli reali.
- Revisione store per revisioni SHA-1/64 compatibili col contratto mobile.

## Sicurezza e parità mobile

- Nessun token, path assoluto o stdout arriva al browser.
- Redirect ammessi solo su HTTPS e host Hugging Face/CDN ufficiali; host esterni
  vengono rifiutati.
- Il download usa revisione fissata, file `.partial`, verifica dimensione/hash
  e pubblicazione atomica, come il flusso mobile.
- Repository gated e rate limit diventano errori espliciti, mai cataloghi vuoti.
- Il sidecar llama.cpp resta loopback-only, senza shell e senza tool nativi.
- Il binario ufficiale è il release asset `b10517` per Windows CPU x64, commit
  `dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`, SHA-256
  `f3fed0673c934ade45663a8e29220a0903b58ad7eff91eeeef606a37061cd031`.
  È scaricato in `harness-ui/.local-runtime/` (gitignored) e scoperto
  automaticamente; `TALOS_LLAMA_SERVER_PATH` resta l’override esplicito.

## Test eseguiti

- `node --test tests/hf-hub-client.test.mjs tests/hf-direct-transfer.test.mjs tests/http-routes-huggingface.test.mjs tests/llama-server-supervisor.test.mjs tests/local-runtime-llama-server.test.mjs` → **39/39**.
- `node --test tests/*.test.mjs` → **1058/1058**.
- `npm exec vitest run tests/unit/harness` → **192/192**.
- `npm run typecheck` → pass.
- `node --check` su client Hub, transfer, HTTP app e server → pass.
- `git diff --check` → pass.

## Prova upstream e prova visiva

- Ricerca reale eseguita su Hugging Face per `Qwen3-0.6B-GGUF`; 20 repository
  osservati, model card e file GGUF letti senza token nel client.
- Resolve reale del file `Qwen3-0.6B.Q2_K.gguf`: CDN
  `us.aws.cdn.hf.co`, Range `bytes=0-31`, HTTP 206, 32 byte e magic `GGUF`.
- Screenshot CDP 1440×900:
  `harness-ui/.qa-runs/qa-model-lab-huggingface-download-2026-08-31T03-37-07-836Z`
- Screenshot CDP 1024×800:
  `harness-ui/.qa-runs/qa-model-lab-huggingface-download-2026-08-31T03-37-11-849Z`
- Centro download 1440×900:
  `harness-ui/.qa-runs/qa-model-lab-huggingface-download-2026-08-31T03-40-44-646Z`
- Ogni screenshot è stato ispezionato interamente: nessuna sovrapposizione,
  nessun overflow, nessuna eccezione JS e nessuna risposta HTTP fallita.
- Download reale dall’app completato: repository
  `MaziyarPanahi/Qwen3-0.6B-GGUF`, revisione
  `16d75108d73a476af91a4f6df4cd77e854b42d04`, file Q2_K da 347.288.704 byte;
  digest locale verificato uguale a quello Hub e manifest passato a `ready`.
- Runtime reale caricato sulla porta loopback dinamica; `/v1/models` ha
  restituito il modello installato e una sessione TALOS ha ricevuto 512 eventi
  di testo SSE e `RunFinished`. Il pulsante di arresto è stato provato durante
  una seconda corsa e la sessione è stata chiusa dal controllo applicativo.
- Nuova evidenza visiva completa, ispezionata immagine per immagine:
  `harness-ui/.qa-runs/qa-model-lab-runtime-run-2026-08-31T05-43-37-673Z`
  (1440×900) e
  `harness-ui/.qa-runs/qa-model-lab-runtime-run-2026-08-31T05-43-44-940Z`
  (1024×800); gate, streaming, arresto, sidebar e rail non mostrano overflow o
  sovrapposizioni. Il difetto di larghezza dei select che introduceva una barra
  orizzontale è stato chiuso con `min-width:0`/`max-width:100%`.
- Controprova finale partendo da runtime **scarico**:
  `harness-ui/.qa-runs/qa-model-lab-runtime-run-2026-08-31T05-47-50-117Z`;
  il click UI ha caricato llama.cpp, avviato lo stream e arrestato la prova.
  Dopo il collaudo il runtime è stato scaricato e sono stati misurati zero
  processi figlio residui; il server desktop resta disponibile su loopback.
- Controprova reale dei controlli di trasferimento sul file pubblico
  `Qwen3-0.6B.Q3_K_M.gguf`: avvio → pausa → ripresa → annullamento. Lo stato
  finale è `cancelled` con motivo `CANCELLED_BY_OWNER`; il file `.partial` e il
  file finale non esistono più. Il manifest resta `incomplete` per consentire
  una ripresa esplicita successiva, come nei test di contratto, e non viene mai
  esposto come modello installato/pronto.

## Limiti dichiarati

- Ollama e LM Studio non sono installati sulle porte locali osservate.
- La quantizzazione Q2_K usata per il gate è volutamente piccola e il modello
  ha mostrato testo ripetitivo durante lo streaming: è una caratteristica di
  qualità del checkpoint scelto, non un errore di trasporto/UI. Per uso
  produttivo va offerta una quantizzazione Q4_K_M o superiore, mantenendo lo
  stesso manifest e gli stessi controlli.
- I pesi e i manifest generati localmente sono ora esclusi da Git tramite
  `harness-ui/.local-models/`; il runtime binario resta escluso da
  `harness-ui/.local-runtime/`.

## Rollback

Rimuovere i due moduli HF, le rotte/wiring e i controlli UI di questa fase;
lasciare invariati store/runtime/test precedenti. Nessun commit e nessun push
sono stati eseguiti.

## Coda P0 aggiunta dopo la verifica — non ancora implementata

1. **Nuova sessione/cartelle:** sostituire il testo tecnico oggi mostrato quando
   non esistono cartelle configurate con linguaggio naturale, soluzione proposta
   e pulsante verso Doctor. I dettagli tecnici restano soltanto nel Doctor/log.
2. **Sessioni:** il tasto destro sulla riga deve aprire un menu CRUD completo,
   uguale al pattern Files; la conferma deve apparire soltanto per l’eliminazione.
3. **Impostazioni:** organizzare tutte le categorie in sezioni navigabili con
   layout list-detail desktop e tabs/righe scorrevoli nei viewport compatti,
   mantenendo ordine e contenuti della controparte mobile.

Questi tre punti sono stati aggiunti al [Piano completo desktop](./PIANO-COMPLETO-DESKTOP-2026-08-31.md)
e alla [Tabella di marcia](./LEDGER-TABELLA-DI-MARCIA-DESKTOP-2026-08-30.md).

## Addendum P0 UX — consegna aggiornata (31/08/2026)

Dopo la chiusura della Fase 10 sono stati applicati e verificati i tre P0 UX
richiesti dall’owner e l’adeguamento Settings a tutta larghezza:

- `mobile/public/harness-ui/app.js`: messaggio naturale per cartelle assenti,
  soluzione proposta con Doctor, menu contestuale CRUD condiviso fra sidebar e
  Board, chiusura Escape/click esterno e target corretto per rename/fork.
- `mobile/public/harness-ui/index.html`: otto categorie Settings in list-detail,
  una sezione attiva alla volta, con semantica tab/pannello.
- `mobile/public/harness-ui/styles.css`: `.view-pane[data-view="settings"]
  > .generic-shell` occupa il 100% del pannello centrale senza il margine
  laterale della chat; barra categorie compatta e container query per evitare
  sovrapposizioni.
- `mobile/tests/unit/harness/harnessUiFrontend.test.ts`: contratti P0 e
  regressione full width (`CODE-SETTINGS-CATEGORIES-01/02`).
- `harness-ui/scripts/qa-visual-pipeline.mjs`: scenario `qa-p0-ux` con controlli
  geometrici, copy naturale, menu CRUD e assenza di errori; il controllo di
  sintassi è stato corretto dopo un primo RED isolato della regex.

Evidenza visiva completa, ispezionata immagine per immagine:

- `harness-ui/.qa-runs/qa-p0-ux-2026-08-31T08-51-42-753Z/` (1440×900);
- `harness-ui/.qa-runs/qa-p0-ux-2026-08-31T08-52-01-511Z/` (1024×800).

Entrambe le corse hanno prodotto 3 screenshot, zero eccezioni JavaScript e
zero richieste HTTP fallite. Gate aggiornati: backend **1.060/1.060**,
frontend Harness **197/197**, `npm run typecheck`, sintassi JavaScript e
`git diff --check` passati. Nessun commit o push è stato eseguito.

Il browser integrato risultava non collegato (nessun browser disponibile); la
verifica è stata quindi effettuata con la pipeline Chrome/CDP locale già
versionata, mantenendo report e taccuino sul disco. Il confronto con
VS Code/Cursor/Cline/Hermes conferma il pattern list-detail e il menu azioni;
TALOS mantiene copy naturale, diagnosi separata in Doctor e gating fail-closed.

## Riepilogo semplice

Ora il desktop può cercare modelli GGUF su Hugging Face direttamente dal
Laboratorio modelli, aprire la scheda, vedere i file, scaricarli con pausa,
ripresa, annullamento e verifica hash, installarli e provarli davvero con
llama.cpp. Il browser non riceve token né percorsi locali; il runtime è
loopback-only. Restano osservati come non installati soltanto Ollama e LM
Studio, mentre la scelta di una quantizzazione più grande è una decisione di
qualità del modello, non un blocco tecnico.
