# Consegna Fase 7 — sessioni runtime locale, policy e fallback

## Stato

Implementazione desktop completata e verificata con test mirati. La sessione
può ora selezionare esplicitamente un runtime locale, ricevere lo stream nel
formato AG-UI già usato dalla UI, interromperlo e mostrare un fallback
OpenRouter dichiarato. `mobile/` non è stato modificato.

Nessun commit o push è stato eseguito in questa fase.

## Cosa è operativo

- `sessionRegistry.avvia()` accetta `provider:'local'`, `runtimeId`, `modelId`
  e `fallbackConsent`.
- La chiave OpenRouter non è richiesta per il percorso locale.
- Testo, ragionamento e tool-call dello stream locale sono tradotti in eventi
  AG-UI separati; il markup nascosto non viene riversato nel testo.
- `ferma()` propaga l'abort al runtime locale e chiude il giro con esito
  `fermato`.
- Un errore locale non passa mai al cloud senza consenso. Con
  `fallbackConsent:true` e chiave configurata viene emesso `RuntimeFallback`
  (`local → openrouter`) e riusato il percorso cloud già esistente.
- Elenco sessioni e persistenza conservano provider, runtimeId, modelId e
  fallback scelto.
- Il server espone:
  - `GET /api/v1/runtime`
  - `GET /api/v1/local-models`
  - `POST /api/v1/local-models/import`
  - `POST /api/v1/runtime/load`
  - `POST /api/v1/runtime/unload`
  - `POST /api/v1/sessions/:id/cancel`
- Il server collega gli adapter reali Ollama e LM Studio tramite loopback; il
  catalogo locale legge i manifest validati dal model store.
- Ollama/LM Studio propagano `AbortSignal` e offrono `cancel(requestId)`.

## File toccati

- `harness-ui/src/session-registry.mjs`
- `harness-ui/src/http-app.mjs`
- `harness-ui/server.mjs`
- `harness-ui/src/openai-compatible-runtime.mjs`
- `harness-ui/src/local-model-store.mjs`
- `harness-ui/tests/session-registry.test.mjs`
- `harness-ui/tests/http-routes-model-lab.test.mjs`
- `harness-ui/tests/openai-compatible-runtime.test.mjs`
- `harness-ui/tests/local-model-store.test.mjs`
- `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md`

## Verifica

Comando eseguito:

```text
node --test harness-ui/tests/session-registry.test.mjs harness-ui/tests/openai-compatible-runtime.test.mjs harness-ui/tests/local-model-store.test.mjs harness-ui/tests/http-routes-model-lab.test.mjs
```

Risultato: **198 test superati, 0 falliti**.

Restano da eseguire prima della chiusura complessiva del programma:

- suite completa `node --test harness-ui/tests/*.test.mjs`;
- smoke reale su porte Ollama `11434` e LM Studio `1234`;
- conformance e prova visiva desktop della Fase 9;
- import Hugging Face reale: la CLI `hf` è ancora gated se non installata.

La suite completa è stata comunque eseguita: **1035 test superati, 1 fallito**.
L'unico fallimento è preesistente e fuori perimetro (`harness-receipt-keypair.test.mjs`:
il test cerca `src/harness-receipt-keypair.mjs`, percorso assente nella lane
desktop); i test della Fase 7 restano tutti verdi e `git diff --check` è pulito.

## Confronto competitivo

Hermes/Ollama privilegiano la semplicità del provider e il fallback rapido;
questa fase conserva quella semplicità ma aggiunge envelope AG-UI, stato
persistito, abort verificabile e consenso esplicito prima di cambiare
provider. LM Studio viene usato solo quando conferma load/unload; nessuna
capability o risposta viene inventata.

## Rollback

Revertire i file elencati sopra. Non cancellare `.local-models/` né
`.sessions-store/`: contengono stato locale dell'owner e sono fuori dal bundle.

## Nota semplice per l'owner

Il desktop ora sa parlare con un modello locale quando Ollama o LM Studio sono
davvero disponibili. Se il runtime locale cade, TALOS si ferma e lo dichiara;
passa a OpenRouter soltanto quando l'owner lo ha autorizzato nella richiesta.
Non è ancora una prova hardware reale: quella appartiene alla fase di
conformance e va fatta dopo aver completato anche la UI del Model Lab.
