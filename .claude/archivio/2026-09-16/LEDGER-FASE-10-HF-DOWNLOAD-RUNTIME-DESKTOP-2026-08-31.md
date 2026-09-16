# Ledger Fase 10 — download Hugging Face e runtime desktop

## Obiettivo

Chiudere il percorso reale desktop, con semantica uguale al mobile:
ricerca Hub → revisione/file GGUF → set completo → download diretto server-side
→ pausa/ripresa/annullamento → hash → manifest `ready` → verifica compatibilità
→ caricamento `llama.cpp` → generazione locale. Nessun token o percorso assoluto
nel browser; nessun processo avviato dal browser.

## Ricerca upstream e decisioni

- Hugging Face Hub REST/CLI: adottare API ufficiali `/api/models`, `tree`,
  `paths-info`, README e `/resolve/{revision}/{path}`; la revisione resta
  pinnata e il Range viene applicato solo all'URL CDN firmato
  ([download](https://huggingface.co/docs/huggingface_hub/main/package_reference/file_download),
  [gated](https://huggingface.co/docs/hub/en/models-gated),
  [tokens](https://huggingface.co/docs/hub/en/security-tokens)).
- llama.cpp: adattare l'API `/health`, `/v1/models`, `/v1/chat/completions` e
  `/metrics` del pin AVM `dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`
  ([server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)).
  Il pin distribuito è release `b10517`, asset Windows CPU x64 con SHA-256
  `f3fed0673c934ade45663a8e29220a0903b58ad7eff91eeeef606a37061cd031`.
- Sicurezza SSRF: consentire solo HTTPS verso host Hugging Face/CDN ufficiali,
  mai redirect arbitrari, seguendo il principio di allowlist OWASP
  ([SSRF cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)).
- Hermes/Ollama/LM Studio: mantenere un adapter TALOS provider-neutral; nessun
  protocollo vendor diventa il dominio interno. Nessuna nuova dipendenza:
  `fetch`, stream e filesystem Node sono sufficienti.

## File e simboli

### Creare

- `harness-ui/src/hf-hub-client.mjs`: `createHfHubClient`, `searchModels`,
  `describeModel`, `listGgufFiles`, `pathsInfo`, `resolveDownload`.
- `harness-ui/tests/hf-hub-client.test.mjs`: ricerca, gated, revision, CDN,
  redirect/host rejection e no-secret.
- `harness-ui/tests/hf-direct-transfer.test.mjs`: trasferimento diretto,
  range/resume, hash, pause/cancel e set multi-file.
- `harness-ui/tests/http-routes-huggingface.test.mjs`: contratto HTTP completo.
- `.claude/CONSEGNA-FASE-10-HF-DOWNLOAD-RUNTIME-DESKTOP-2026-08-31.md`.
- `.gitignore`: esclude i pesi e manifest generati in
  `harness-ui/.local-models/`.

### Modificare

- `harness-ui/src/hf-model-transfer.mjs`: supporto diretto opzionale, queue,
  stati e verifica senza rompere il percorso CLI/import esistente.
- `harness-ui/src/local-model-store.mjs`: revisioni SHA-1/64 compatibili con
  il contratto mobile; nessun segreto/path assoluto nel manifest pubblico.
- `harness-ui/src/config.mjs`: `HF_TOKEN` server-only e `TALOS_LLAMA_SERVER_PATH`.
- `harness-ui/server.mjs`: istanzia Hub client/transfer e supervisor/runtime
  llama quando il binario è configurato; passa le dipendenze a `createHttpApp`.
- `harness-ui/src/http-app.mjs`: rotte `/api/v1/huggingface/*`, stato download,
  pause/resume/cancel e gestione errori gated/SSRF.
- `mobile/public/harness-ui/index.html`: UI HF, set GGUF, progress e download.
- `mobile/public/harness-ui/app.js`: stato/handler/rendering senza segreti.
- `mobile/public/harness-ui/styles.css`: layout desktop denso e stati download.
- `mobile/tests/unit/harness/harnessUiFrontend.test.ts`: contratti UI HF.
- `harness-ui/scripts/qa-visual-pipeline.mjs`: scenari Hub/download/runtime.
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`: evidenze e confronto competitor.
- `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md`: Task 10.

## Test e gate

- RED prima di ogni modifica: test Hub, transfer diretto, route e UI.
- GREEN mirati: `node --test tests/hf-hub-client.test.mjs tests/hf-direct-transfer.test.mjs tests/http-routes-huggingface.test.mjs`.
- Regressione: `node --test tests/*.test.mjs`; `npm exec vitest run tests/unit/harness`; `npm run typecheck`; `git diff --check`.
- Upstream read-only: metadata reale HF (`/api/models?filter=gguf&limit=1`),
  senza scaricare gigabyte durante la suite; download end-to-end con fixture
  HTTP deterministica e, se disponibile, un file pubblico piccolo approvato.
- Visivo: CDP 1440×900 e 1024×800, ricerca, dettaglio, set incompleto,
  download/progress, pausa/ripresa/annulla, errore gated, installati e reload;
  ogni screenshot ispezionato interamente.
- Rollback: rimuovere solo i file/simboli di questa fase e ripristinare il
  pannello HF disabilitato; non toccare runtime/test già verdi.

## Esito reale 31/08

- Binario ufficiale scaricato/verificato in `harness-ui/.local-runtime/b10517/`.
- Modello reale Qwen3-0.6B Q2_K scaricato dalla UI, hash verificato e manifest
  `ready` persistito in `.local-models/`.
- Caricamento llama.cpp e generazione SSE provati attraverso le rotte TALOS;
  il limite `max_tokens=512` impedisce stream locali senza fine.
- Controllo reale del trasferimento Q3_K_M: pausa, ripresa e annullamento
  confermati; il `.partial` viene rimosso, il manifest resta `incomplete` per
  resume esplicito e nessun file incompleto entra nel catalogo `ready`.
- Scenario CDP aggiunto: `qa-model-lab-runtime-run`, eseguito a 1440×900 e
  1024×800, con screenshot durante streaming e dopo arresto; zero eccezioni JS
  e zero richieste HTTP fallite.

## Known issue aperta - sessione `Full access` su `C:\\` (31/08/2026)

Prova owner: la funzione e stata usata con l'intero disco `C:\\` come radice,
ma il modello e risultato flaky/instabile e non ha risposto correttamente in
modo affidabile. Il caso resta aperto e non va conteggiato fra le funzioni
chiuse della Fase 10.

La prossima sessione deve riprodurre il caso con telemetria completa (richiesta,
giri, tool, cwd/radice, stderr, timeout e stato finale), verificare separatamente
il passaggio Windows->WSL `/mnt/c/` e il limite del disco `discoNode`, quindi
aggiungere una regressione automatica prima di qualsiasi modifica. Fino alla
chiusura e preferibile usare una cartella di progetto stretta o `Full access`
solo per un percorso specifico; non rendere `C:\\` la radice predefinita.
