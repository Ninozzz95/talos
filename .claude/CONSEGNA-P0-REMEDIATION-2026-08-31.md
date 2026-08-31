# Consegna P0 — remediation Harness Desktop — 31/08/2026

## Risultato

La fase P0 è completata sulla sola lane desktop `AVM-harness-desktop`.
Nessun file del mobile, di AVM-harness o di TALOS-BANCO è stato usato come
sorgente runtime o modificato in questa fase.

## Cosa è stato chiuso

1. Audit riproducibile dei finding con classificazione e test.
2. Confini di processo e workspace: percorsi controllati, shell disabilitata,
   ambiente ridotto, timeout e abort condivisi.
3. Contratti runtime versionati e messaggi pubblici comprensibili con link a
   Doctor; nessun percorso assoluto, stack o segreto esposto.
4. Ciclo SSE completo: abort quando il browser chiude, heartbeat, replay con
   `Last-Event-ID`, chiusura idempotente e attesa delle risorse locali allo
   spegnimento.
5. Streaming separato: blocchi `think`/`thinking` e `tool_call` non finiscono
   più nella risposta testuale, anche con delimitatori spezzati fra chunk.
6. Model card Hugging Face: Markdown sicuro e immagini servite dal proxy locale
   con HTTPS, host consentiti, DNS/redirect rivalidati, MIME e byte limitati.
7. Immagini generate: copia durevole locale con sidecar, checksum e rilettura
   da un processo nuovo; se il workspace rifiuta il file, la copia di recupero
   viene rimossa e l'errore resta naturale.
8. UI desktop canonica in `harness-ui/public/`, logo TALOS reale, manifest
   SHA-256 e controllo anti-drift. Il mobile resta reference read-only.

## File principali creati

- `harness-ui/scripts/audit-harness-findings.mjs`
- `harness-ui/scripts/build-ui.mjs`
- `harness-ui/scripts/verify-ui-manifest.mjs`
- `harness-ui/src/generated-image-store.mjs`
- `harness-ui/src/hf-image-proxy.mjs`
- `harness-ui/src/http-lifecycle.mjs`
- `harness-ui/src/process-policy.mjs`
- `harness-ui/src/public-problem.mjs`
- `harness-ui/src/runtime-contract.mjs`
- `harness-ui/src/runtime-owner-adapter.mjs`
- `harness-ui/src/runtime-owner-contract.mjs`
- `harness-ui/src/stream-partition.mjs`
- `harness-ui/src/workspace-disk.mjs`
- `harness-ui/tests/generated-image-store.test.mjs`
- `harness-ui/tests/hf-image-proxy.test.mjs`
- `harness-ui/tests/http-lifecycle.test.mjs`
- `harness-ui/tests/stream-partition.test.mjs`
- `harness-ui/tests/ui-build.test.mjs`
- `harness-ui/tests/ui-untrusted-content.test.mjs`

## File principali aggiornati

- `harness-ui/server.mjs`
- `harness-ui/src/agent-service.mjs`
- `harness-ui/src/config.mjs`
- `harness-ui/src/hf-hub-client.mjs`
- `harness-ui/src/http-app.mjs`
- `harness-ui/src/local-runtime-llama-server.mjs`
- `harness-ui/src/openai-compatible-runtime.mjs`
- `harness-ui/src/session-registry.mjs`
- `harness-ui/src/static-files.mjs`
- `harness-ui/public/index.html`
- `harness-ui/public/app.js`
- `harness-ui/public/styles.css`
- `.gitignore`

## Verifiche eseguite

```text
rtk node --test tests/*.test.mjs                  1132/1132
rtk npm run build:ui                              22 asset
rtk npm run verify:ui                             manifest verificato
rtk git diff --check                              verde
```

Smoke HTTP reale sul server locale `127.0.0.1:4174`:

```text
/                         200
/api/v1/doctor             200
/api/v1/sessions           200
/api/v1/local-models       200
/api/v1/runtime/bootstrap  200
/api/v1/huggingface/image  400 senza URL (rifiuto corretto)
```

## Prova visiva

Ogni screenshot è stato ispezionato integralmente, includendo le zone non
modificate. Le corse hanno coperto 1440×900 e 1024×800 per:

- impostazioni full width, nuova sessione e menu CRUD;
- capacità, runtime, provider, catalogo e filtri;
- modelli installati, Hugging Face e coda download.

Cartelle con screenshot, report e taccuino:

- `harness-ui/.qa-runs/qa-p0-ux-2026-08-31T16-46-48-336Z/`
- `harness-ui/.qa-runs/qa-p0-ux-2026-08-31T16-47-06-069Z/`
- `harness-ui/.qa-runs/qa-settings-model-lab-2026-08-31T16-47-26-635Z/`
- `harness-ui/.qa-runs/qa-settings-model-lab-2026-08-31T16-47-56-880Z/`

Tutte le corse hanno riportato zero eccezioni JavaScript e zero risposte HTTP
fallite. Il taccuino consolidato è
`.claude/QA-VISIVA-HARNESS-2026-08-30.md`.

## Documenti di riferimento

- Piano completo: `C:/Users/Antonino/Desktop/projects/TALOS-RICERCHE/2026-08-31-harness-desktop-remediation-findings-plan.md`
- Ledger esecutivo: `.claude/LEDGER-REMEDIATION-ZIP-2026-08-31.md`
- Taccuino visivo: `.claude/QA-VISIVA-HARNESS-2026-08-30.md`

## Limiti dichiarati

La fase P0 non dichiara conclusi i gate P1 che richiedono un provider reale,
un runtime locale scelto dall'owner o un benchmark upstream. Nessuna chiave,
nessun download e nessun comando esterno reale è stato inventato per chiudere
un test.

## Stato Git

Nessun commit e nessun push sono stati eseguiti. Il worktree contiene anche
modifiche preesistenti di altre sessioni, lasciate intatte.

## Aggiornamento P1.1 — Model Lab (31/08/2026)

Dopo la chiusura P0 sono stati chiusi i primi gap reali del Model Lab desktop:

- ricerca Hugging Face con ordinamento, autore, filtri aggiuntivi e cursore
  di pagina, mantenendo il filtro GGUF e la revisione completa;
- rinomina del nome visualizzato di un modello con scrittura atomica, senza
  cambiare identificativo o percorso;
- rotte locali per rinominare, copiare il percorso relativo e cancellare un
  modello installato;
- barra di avanzamento nella coda download e nel dettaglio della
  quantizzazione, con badge di coda nell'header;
- ricerca dei modelli installati e azioni contestuali con conferma solo per
  l'eliminazione.

Evidenza automatica: `rtk node --test tests/local-model-store.test.mjs
tests/hf-hub-client.test.mjs tests/http-routes-model-lab.test.mjs` — 25/25;
regressione completa backend — 1137/1137; build UI e manifest — 22/22;
`node --check public/app.js` — pass.

Evidenza visiva interamente ispezionata:
`harness-ui/.qa-runs/qa-model-lab-huggingface-download-2026-08-31T18-24-52-032Z/`
(1440×900). Il finding intermedio dei filtri visibili nella scheda Download è
stato corretto con pannelli esclusivi e registrato nel ledger.

Al momento della prima consegna restavano aperti l'import locale e i filtri
semantici; l'import è stato chiuso nel blocco P1.2 qui sotto. Restano aperti
soltanto i filtri semantici (q4, chat, code, licenza, peso) e la prova reale di
reload/offline/disco insufficiente.

## Aggiornamento P1.2 — Importazione GGUF locale sicura (31/08/2026)

L'importazione locale ora usa un canale binario a flusso: il browser invia il
file scelto dall'utente tramite `XMLHttpRequest`, mostrando avanzamento e
annullamento; non invia mai un percorso del computer. Il server controlla nome,
identificativo, dimensione massima, intestazione `GGUF` e hash SHA-256, scrive
prima un file temporaneo e pubblica il manifest solo dopo il controllo completo.
Il vecchio JSON con `sourcePath` è rifiutato.

Prove verdi: import riuscito, file non-GGUF, file oltre il limite, canale
binario HTTP e rifiuto del percorso locale; il test completo desktop è passato
con **1146/1146**. Build e manifest UI sono **22/22**, sintassi JavaScript e
`git diff --check` puliti.

Prova visiva completa e ispezionata a 1440×900:
`harness-ui/.qa-runs/qa-model-lab-huggingface-download-2026-08-31T19-36-32-646Z/`;
la stessa corsa a 1024×800 è in
`harness-ui/.qa-runs/qa-model-lab-huggingface-download-2026-08-31T19-36-53-467Z/`.
Entrambe mostrano Installati con picker/ricerca/azioni e Download senza
controlli estranei; zero eccezioni JavaScript e zero richieste HTTP fallite.

Restano da chiudere: filtri semantici predefiniti (q4/chat/code/licenza/peso),
un gate end-to-end con un file GGUF reale scelto dall'owner e le prove di
interruzione/reload/offline/disco insufficiente. Nessun commit o push è stato
eseguito.
