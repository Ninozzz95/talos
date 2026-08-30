# Consegna Fase 8B — Laboratorio modelli desktop preparatorio

Data: 2026-08-30  
Lane: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`  
Stato: **completa nel perimetro preparatorio; runtime locale non scelto**

## Cosa trova il main agent

La Settings desktop contiene il Laboratorio modelli M01–M52. Le parti che
possono essere vere oggi sono collegate davvero:

1. capacità RAM e storage misurate dal server locale;
2. stato OpenRouter letto dal Doctor server-side;
3. catalogo OpenRouter reale con ricerca, filtro, dettaglio, capability,
   contesto e prezzi.

Le parti dipendenti dal runtime locale — modelli installati, Hugging Face,
download, import GGUF, fit, caricamento e inferenza — sono visibili ma
disabilitate con motivazione. Non contengono dati finti e non accettano segreti.

## File creati

- `.claude/LEDGER-FASE-8B-MODEL-LAB-DESKTOP-2026-08-30.md`
- `.claude/CONSEGNA-FASE-8B-MODEL-LAB-DESKTOP-2026-08-30.md`
- `harness-ui/src/machine-capacity.mjs`
- `harness-ui/tests/machine-capacity.test.mjs`
- `harness-ui/tests/http-routes-model-lab.test.mjs`

## File modificati

- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- `harness-ui/server.mjs`
- `harness-ui/src/http-app.mjs`
- `harness-ui/src/model-catalog.mjs`
- `harness-ui/tests/model-catalog.test.mjs`
- `harness-ui/scripts/qa-visual-pipeline.mjs`
- `mobile/public/harness-ui/index.html`
- `mobile/public/harness-ui/app.js`
- `mobile/public/harness-ui/styles.css`
- `mobile/tests/unit/harness/harnessUiFrontend.test.ts`

Nessun file è stato eliminato e nessuna dipendenza è stata aggiunta.

## Contratti e regressioni permanenti

- `GET /api/v1/model-lab/capacity` restituisce misure reali in una busta API e
  fallisce in modo controllato.
- `/api/v1/models` conserva il contratto esistente e aggiunge capability
  osservate senza cambiare ID o prezzi.
- `CODE-MODEL-LAB-LAPTOP-01` impedisce il ritorno dell'overflow a 1024 px con
  sidebar persistente.
- Errori di capacità/catalogo restano visibili; non diventano valori finti o
  un ambiguo catalogo vuoto.
- La persistenza browser conserva soltanto preferenze UI non sensibili.

## Prove visive

- 1440×900:
  `harness-ui/.qa-runs/qa-settings-model-lab-2026-08-30T21-04-23-831Z`
- 1024×800:
  `harness-ui/.qa-runs/qa-settings-model-lab-2026-08-30T21-03-46-056Z`

Ogni corsa contiene nove screenshot ispezionati per intero più `report.json` e
`taccuino.md`. Esito comune: zero errori console, zero eccezioni JavaScript,
zero richieste HTTP fallite e nessun overflow dopo il fix laptop.

Verifica automatica finale:

- frontend Harness: 186/186 pass;
- backend Harness: 976/976 pass;
- sintassi JavaScript, typecheck e `git diff --check`: pass.

## Decisione necessaria per la fase successiva

Scegliere e fissare il runtime LLM locale e il relativo confine di packaging.
Solo dopo questa decisione si possono rendere operative importazione GGUF,
compatibilità hardware, cache/download Hugging Face, installazione, loading e
inferenza. Il codice attuale non anticipa questa scelta.

## Riferimenti

- Ledger esecutivo: `.claude/LEDGER-FASE-8B-MODEL-LAB-DESKTOP-2026-08-30.md`
- Taccuino visivo: `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- Inventario mobile→desktop:
  `.claude/INVENTARIO-IMPOSTAZIONI-MOBILE-DESKTOP-2026-08-30.md`

Nessun push è autorizzato o eseguito da questa consegna.
