# Ledger Fase 8B — Laboratorio modelli desktop preparatorio

Data: 2026-08-30  
Ownership: Harness Desktop (`AVM-harness-desktop`) soltanto. La lane mobile è
un riferimento in sola lettura.

## Obiettivo e confine

Portare nel desktop l’intera mappa M01–M52 documentata in
`.claude/INVENTARIO-IMPOSTAZIONI-MOBILE-DESKTOP-2026-08-30.md`, distinguendo:

1. dati reali disponibili ora: capacità macchina e catalogo OpenRouter;
2. preferenze locali non sensibili: ricerca, filtri, vista e modello scelto;
3. funzioni dipendenti dal runtime locale: importazione GGUF, fit, verifica
   header, download, checkpoint, caricamento e inferenza.

Il terzo gruppo deve apparire disabilitato con motivo, mai come funzione attiva.
Nessun segreto entra nel browser. Nessun runtime viene scelto in questa fase.

## Dossier upstream e decisione

- OpenRouter Models API: adottare direttamente il contratto pubblico già usato
  dal server e le proprietà osservate (`architecture`, modalità, parametri,
  contesto e prezzi), senza nuovo SDK:
  <https://openrouter.ai/docs/api/api-reference/models/get-models>.
- Hugging Face Hub API/model card: progettare il read-only detail secondo
  README Markdown + metadata, ma non introdurre ancora fetch/download dal Hub:
  <https://huggingface.co/docs/hub/en/api> e
  <https://huggingface.co/docs/hub/main/model-cards>.
- Hugging Face download/cache: rifiutare un downloader artigianale; la fase
  runtime dovrà adottare `huggingface_hub` o un client upstream equivalente,
  con revisione e cache per commit:
  <https://huggingface.co/docs/huggingface_hub/guides/download>.
- llama.cpp: nessuna scelta anticipata; GGUF è requisito, ma CPU/CUDA/HIP/
  Metal/SYCL/Vulkan e altri backend richiedono una decisione di packaging:
  <https://github.com/ggml-org/llama.cpp/blob/master/README.md>.
- Node.js: adottare `os.totalmem()`/`os.freemem()` e `fs.statfs()` per misure
  reali, senza processi esterni:
  <https://nodejs.org/api/os.html> e <https://nodejs.org/api/fs.html>.

Decisione: **adattare dietro contratti TALOS**. Nessuna dipendenza nuova in
Fase 8B. OpenRouter rimane upstream reale già integrato; capacità macchina usa
solo API Node. Hugging Face e runtime locale restano gated.

## Direzione frontend

- Soggetto: workstation dell’owner che deve distinguere modelli cloud, file
  locali e runtime eseguibile.
- Singolo lavoro della pagina: mostrare immediatamente “misurato, configurato,
  bloccato” senza trasformare il Laboratorio in un catalogo decorativo.
- Linguaggio visivo: token TALOS esistenti, Instrument Sans per gerarchia e
  JetBrains Mono per capacità/ID; nessuna palette nuova.
- Firma: **capability ledger** compatto in testata, con prove misurate e ragioni
  di blocco, seguito da aree master/detail.
- Layout: navigazione orizzontale del Lab → pannello attivo → dettaglio reale o
  stato gated. A 1024×800 le tab possono scorrere orizzontalmente senza tagli.

## File e simboli esatti

### Creare

1. `harness-ui/src/machine-capacity.mjs`
   - `MACHINE_CAPACITY_SCHEMA`;
   - `MachineCapacityError`;
   - `misuraCapacitaMacchina(options)`.
2. `harness-ui/tests/machine-capacity.test.mjs`
   - `MODEL-LAB-CAPACITY-01` calcola RAM e storage reali;
   - `MODEL-LAB-CAPACITY-RESERVE-01` non produce allocabile negativo;
   - `MODEL-LAB-CAPACITY-ERROR-01` fallisce in modo controllato.
3. `harness-ui/tests/http-routes-model-lab.test.mjs`
   - `MODEL-LAB-HTTP-CAPACITY-01` busta API reale;
   - `MODEL-LAB-HTTP-UNAVAILABLE-01` dipendenza assente;
   - `MODEL-LAB-HTTP-QUERY-01` query rifiutata.

### Modificare

1. `harness-ui/server.mjs`
   - import `misuraCapacitaMacchina`;
   - dependency `capacitaMacchinaFn` passata a `createHttpApp`.
2. `harness-ui/src/http-app.mjs`
   - parametro pubblico `capacitaMacchinaFn` di `createHttpApp`;
   - rotta `GET /api/v1/model-lab/capacity`.
3. `harness-ui/src/model-catalog.mjs`
   - `normalizza(modelloGrezzo)` preserva capability osservate:
     `inputModalities`, `outputModalities`, `supportedParameters`,
     `description`, `created`;
   - nessuna modifica agli identificatori/prezzi già stabili.
4. `harness-ui/tests/model-catalog.test.mjs`
   - aggiornare le fixture del contratto esistente;
   - `MODEL-LAB-CATALOG-CAPABILITY-01` conserva modalità e parametri.
5. `mobile/public/harness-ui/index.html`
   - card `#modelLabCard` dentro Settings;
   - tab `#modelLabOverviewTab`, `#modelLabProvidersTab`,
     `#modelLabCatalogTab`, `#modelLabInstalledTab`, `#modelLabHfTab`,
     `#modelLabDownloadsTab`;
   - pannelli `#modelLabOverviewPanel`, `#modelLabProvidersPanel`,
     `#modelLabCatalogPanel`, `#modelLabInstalledPanel`, `#modelLabHfPanel`,
     `#modelLabDownloadsPanel`;
   - capacità `#machineCapacityStatus`, `#machineMemoryMetric`,
     `#machineStorageMetric`, `#machineAllocatableMetric`;
   - catalogo `#modelLabSearch`, `#modelLabProviderFilter`,
     `#modelLabCatalogCount`, `#modelLabCatalogList`,
     `#modelLabModelDetail`, `#modelLabRefreshButton`;
   - azioni runtime presenti soltanto come controlli disabled con
     `data-disabled-reason`.
6. `mobile/public/harness-ui/app.js`
   - stato `modelLab` dentro `state`;
   - `formattaByteModelLab(bytes)`;
   - `setModelLabSection(section)`;
   - `caricaCapacitaMacchina()`;
   - `caricaCatalogoModelLab({ forza })`;
   - `filtraCatalogoModelLab()`;
   - `renderizzaCatalogoModelLab()`;
   - `renderizzaDettaglioModelLab(model)`;
   - `inizializzaModelLab()`;
   - `setView('settings')` attiva il caricamento pigro una sola volta;
   - nessuna chiave/token salvata in `talos.harness.desktop.settings.v1`.
7. `mobile/public/harness-ui/styles.css`
   - `.model-lab-card`, `.model-lab-ledger`, `.model-lab-tabs`,
     `.model-lab-panel`, `.model-lab-layout`, `.model-lab-list`,
     `.model-lab-detail`, `.runtime-gate`, `.model-lab-empty`;
   - responsive 1440×900 e 1024×800, focus e reduced-motion.
8. `mobile/tests/unit/harness/harnessUiFrontend.test.ts`
   - `CODE-MODEL-LAB-SHELL-01` copre M01–M52 come area reale o gated;
   - `CODE-MODEL-LAB-CAPACITY-01` renderizza risposta server;
   - `CODE-MODEL-LAB-CATALOG-01` ricerca/filtri/dettaglio da dati reali;
   - `CODE-MODEL-LAB-CATALOG-ERROR-01` errore upstream non diventa vuoto;
   - `CODE-MODEL-LAB-RUNTIME-GATE-01` azioni runtime disabilitate;
   - `CODE-MODEL-LAB-NO-SECRETS-01` nessun campo credenziale persistente.
9. `harness-ui/scripts/qa-visual-pipeline.mjs`
   - scenario `qa-settings-model-lab` con 1440×900 e 1024×800;
   - screenshot Overview, Catalogo, dettaglio, Installati, Hugging Face,
     Download e reload.
10. `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
    - append della matrice e del confronto competitivo della Fase 8B.

### Eliminare

- Nessun file.

## RED, GREEN e regressione

- RED backend:
  `node --test harness-ui/tests/machine-capacity.test.mjs harness-ui/tests/http-routes-model-lab.test.mjs harness-ui/tests/model-catalog.test.mjs`.
- RED frontend:
  `npm exec vitest run tests/unit/harness/harnessUiFrontend.test.ts` da
  `mobile/`.
- GREEN backend focalizzato: stessi comandi RED.
- GREEN frontend focalizzato: stesso comando RED frontend.
- Regressione backend: `npm test` da `harness-ui/`.
- Regressione frontend: `npm exec vitest run tests/unit/harness` da `mobile/`.
- Static: `node --check mobile/public/harness-ui/app.js` e `git diff --check`.
- Gate reale: server locale + `qa-settings-model-lab` a 1440×900 e 1024×800;
  zero eccezioni/rete fallita, scroll e ogni tab ispezionati per intero.

## Compatibilità, failure e rollback

- `/api/v1/models` conserva campi e significato esistenti; aggiunge soltanto
  proprietà capability.
- Un errore OpenRouter mostra `Catalogo non disponibile` con retry; non mostra
  “0 modelli”.
- Un errore capacità mostra la misura come non disponibile; non inventa valori.
- Reload conserva soltanto preferenze UI non sensibili; non persiste cache,
  chiavi, token, path modello, hash o progress download.
- Rollback: rimuovere card/route/capacity module e i soli campi capability
  aggiunti; preservare picker chat, `/api/v1/models`, Appearance e file tree.

## Condizione di chiusura

La Fase 8B è chiusa quando M01–M52 è visibile in una sezione appropriata e
ogni elemento è reale oppure disabilitato con la dipendenza mancante. Non è
chiusa se un pulsante runtime sembra utilizzabile, se una card mostra numeri
finti o se la UI accetta segreti nel browser.

## Esito finale — 30/08/2026

**Stato: chiusa nel perimetro preparatorio approvato.**

- La capacità macchina è misurata dal server con API Node native; un errore
  resta visibile e non viene sostituito da numeri inventati.
- Lo stato OpenRouter arriva dal Doctor server-side e il catalogo usa
  `/api/v1/models`, con ricerca, filtro, dettaglio, capability, contesto e
  prezzi osservati.
- Installati, Hugging Face e Download sono presenti come superfici complete ma
  disabilitate con una motivazione esplicita: nessun runtime locale è stato
  ancora scelto e nessuna operazione finta viene eseguita.
- Nessun token o segreto viene letto, mostrato o persistito dal browser.

Durante la prova laptop è stata scoperta la regressione permanente
`CODE-MODEL-LAB-LAPTOP-01`: con sidebar persistente, a 1024 px la larghezza
utile era inferiore al breakpoint da 980 px e il master/detail usciva dal
contenitore. Il test è stato scritto RED; il fix GREEN estende soltanto il
breakpoint Model Lab a 1180 px, così catalogo e dettaglio si impilano senza
toccare il layout globale.

Gate automatici finali:

- sintassi bundle: `node --check public/harness-ui/app.js` — pass;
- TypeScript: `npm run typecheck` in `mobile/` — pass;
- frontend Harness: `npx vitest run tests/unit/harness` — 186/186 pass;
- backend Harness: `node --test tests/*.test.mjs` — 976/976 pass;
- igiene diff: `git diff --check` — pass.

Gate visivo finale, ogni immagine ispezionata per intero:

- 1440×900: `harness-ui/.qa-runs/qa-settings-model-lab-2026-08-30T21-04-23-831Z`;
- 1024×800: `harness-ui/.qa-runs/qa-settings-model-lab-2026-08-30T21-03-46-056Z`.

Ogni corsa contiene nove screenshot, `report.json` e `taccuino.md`; entrambe
registrano zero errori console, zero eccezioni JavaScript e zero richieste HTTP
fallite. La sola decisione ancora aperta è il runtime LLM locale: non riapre
questa fase, ma è il gate necessario prima di implementare import GGUF,
download Hugging Face, installazione, caricamento e inferenza.
