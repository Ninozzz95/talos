# Piano completo desktop — stato e lavoro residuo

Data: 31/08/2026  
Lane: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`  
Ownership: desktop; `mobile/` soltanto riferimento read-only.

## Stato attuale

Le Fasi 0–4 sono chiuse nel perimetro desktop: baseline/ricerca, parità
Appearance A01–A35, Model Lab preparatorio, contratti runtime/sicurezza e
percorso Hugging Face → llama.cpp reale. La prova ha usato il repository
`MaziyarPanahi/Qwen3-0.6B-GGUF`, revisione
`16d75108d73a476af91a4f6df4cd77e854b42d04`, con verifica SHA-256, caricamento
llama.cpp `b10517`, stream SSE e stop.

Il commit `98784a9e` ha chiuso il canale di importazione locale Model Lab.
Il lavoro successivo resta nel worktree fino al commit desktop autorizzato
della chiusura dei tre blocchi P1.

## Fasi residue ordinate

## Coda prioritaria aggiunta dall’owner — 31/08/2026

### P0 — Nuova sessione: messaggio comprensibile sulle cartelle

Situazione osservata: quando non esistono cartelle configurate, la modale mostra
il nome della variabile `TALOS_HARNESS_UI_PROJECT_DIRS`, il riavvio del server e
altri dettagli da sviluppatore. Questo viola la regola di linguaggio naturale.

Da correggere nei percorsi esatti:

- `mobile/public/harness-ui/app.js` — testo della modale e renderer degli errori;
- `harness-ui/src/http-app.mjs` — envelope con messaggio naturale, soluzione
  proposta e riferimento diagnostico separato;
- `harness-ui/src/config.mjs` — mantenere il dettaglio tecnico soltanto nel
  log/Doctor, mai nella UI;
- `harness-ui/src/doctor.mjs` — controllo reale della disponibilità delle
  cartelle di progetto e registrazione del motivo tecnico;
- `harness-ui/tests/http-routes-sessions.test.mjs`,
  `harness-ui/tests/http-routes-doctor.test.mjs`,
  `harness-ui/tests/config.test.mjs`,
  `mobile/tests/unit/harness/harnessUiFrontend.test.ts` — RED/GREEN.

Contratto UX: la UI dirà cosa è successo, come risolverlo e offrirà il pulsante
“Apri Doctor”; codici, nomi di variabili, stack e percorsi assoluti saranno
visibili soltanto nel Doctor/log locale.

### P0 — Menu contestuale completo sulle sessioni

Situazione osservata: il tasto destro su una sessione apre direttamente la
conferma di eliminazione. Deve usare lo stesso pattern CRUD già presente nel
menu contestuale dei Files.

File e comportamento:

- `mobile/public/harness-ui/app.js` — sostituire `openSheet('deleteSession')`
  nell’handler `contextmenu` con un menu azioni ancorato alla riga;
- `mobile/public/harness-ui/styles.css` — posizionamento, z-index, chiusura con
  click esterno/Escape e stati focus/pressed;
- `harness-ui/src/http-app.mjs` e `harness-ui/src/session-registry.mjs` —
  mantenere le operazioni reali e i relativi errori naturali;
- `harness-ui/tests/session-registry.test.mjs`,
  `harness-ui/tests/http-routes-sessions.test.mjs`,
  `mobile/tests/unit/harness/harnessUiFrontend.test.ts` — test per apri,
  rinomina, duplica/fork se supportato, elimina con conferma e percorso inverso.

Il menu non deve promettere azioni prive di endpoint: ogni voce non disponibile
deve essere disabilitata con una spiegazione naturale.

### P0 — Impostazioni organizzate per categorie

Decisione UX proposta: layout **list-detail** su desktop, coerente con i layout
canonici Material 3: a sinistra un menu verticale di categorie, a destra una
sola sezione alla volta. Sotto la soglia compatta il menu diventa una barra di
righe/tabs scorrevole; la categoria attiva resta sempre evidente. Questo riduce
lo scroll infinito, conserva la densità da workbench e mantiene la grammatica
mobile senza duplicare pannelli.

Sezioni minime, tutte presenti e ordinate come sul mobile:

1. Aspetto e movimento;
2. Chat e composer;
3. Laboratorio modelli;
4. Provider e accessi;
5. Strumenti agente e permessi;
6. Privacy e dati locali;
7. File e workspace;
8. Account, Doctor e backup.

File candidati:

- `mobile/public/harness-ui/index.html`, `app.js`, `styles.css` — struttura,
  stato selezione, deep-link/reload, tastiera e responsive;
- `mobile/tests/unit/harness/harnessUiFrontend.test.ts` — contratto categorie,
  tab/pannello attivo, reload e stati vuoti;
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md` — screenshot completi desktop e
  confronto con il pannello Settings mobile.

La scelta list-detail è supportata dai layout canonici Material 3 e dalle
semantiche ARIA `tablist`/`tabpanel`; i menu contestuali useranno invece il
pattern `menu` soltanto per azioni, con Escape che restituisce il focus al
controllo d’origine.

### Fase 5 — completare la parità Model Lab mobile

File candidati, da ledger prima di ogni modifica:

- `mobile/public/harness-ui/index.html`
- `mobile/public/harness-ui/app.js`
- `mobile/public/harness-ui/styles.css`
- `harness-ui/src/http-app.mjs`
- `harness-ui/src/hf-hub-client.mjs`
- `harness-ui/src/local-model-store.mjs`
- `harness-ui/src/local-runtime-probe.mjs`
- `harness-ui/tests/http-routes-model-lab.test.mjs`
- `harness-ui/tests/hf-hub-client.test.mjs`
- `harness-ui/tests/local-model-store.test.mjs`
- `harness-ui/tests/local-runtime-probe.test.mjs`
- `mobile/tests/unit/harness/harnessUiFrontend.test.ts`

Da implementare o dichiarare esplicitamente gated/non applicabile:

1. importazione locale `.gguf` con spazio, formato, permessi, progresso e hash;
2. ricerca/ordinamento/vista dei modelli installati, rinomina, copia percorso e
   cancellazione confermata;
3. filtri HF `fits/chat/code/q4/open-licence`, publisher, fascia peso,
   ordinamento, paginazione e retry;
4. probe header GGUF, template, contesto, fit e resource ledger mostrati nella
   UI prima di `load`;
5. provider configurabili e profili manuali con segreti esclusivamente server-side;
6. model card completa con Markdown sicuro e immagini remote consentite solo
   tramite policy/allowlist, senza trasformare HTML non fidato in markup attivo;
7. modello attivo condiviso con Chat e preferenze persistenti provider-neutral.

Gate: RED per ogni voce, test HTTP/UI, reload, errore e stato gated; E2E reale
desktop a 1440×900 e 1024×800 con screenshot interi.

### Stato consolidato dei tre blocchi P1 — 31/08/2026

| Blocco | Stato | Evidenza |
|---|---|---|
| Model Lab, download e importazione locale | ✅ chiuso | Suite completa, import binario GGUF, hash e QA visiva già registrati nel ledger remediation. |
| Runtime locale e lifecycle/capability | ✅ chiuso nel perimetro software | Adapter llama.cpp/Ollama/LM Studio, supervisor loopback, stream separati, abort, automazioni e orchestrazione: 101 test mirati verdi. Il gate hardware/provider opzionale resta condizionato alla disponibilità dell’owner. |
| Full access su radice `C:\\` | ✅ rischio watcher chiuso; gate modello reale aperto | Il watcher ricorsivo non parte su una radice volume; tree lazy e consenso esplicito restano invariati. Test dedicato e suite completa verdi. |

### Fase 6 — performance e qualità del runtime

File/evidenze:

- `harness-ui/scripts/qa-visual-pipeline.mjs`
- `harness-ui/src/local-runtime-llama-server.mjs`
- `harness-ui/src/llama-server-supervisor.mjs`
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- nuovo raw evidence locale sotto `harness-ui/.qa-runs/` (ignorato)

Misurare con stesso prompt/modello/contesto: cold start, warm start, TTFT,
tok/s, RAM peak, GPU layers/backend, cancel latency e comportamento a 64K.
Ripetere con quantizzazione Q4_K_M o superiore; Q2_K resta solo il fixture di
trasporto. Registrare OS/architettura/build/hash e non pubblicare prompt,
token o path assoluti.

### Fase 7 — provider esterni

Eseguire smoke reali per Ollama e LM Studio solo se installati e raggiungibili
su loopback. Oggi sono `not installed`/non raggiungibili: non sostituire questa
condizione con mock nel gate finale. Conservare adapter provider-neutral e
capability osservate.

### Fase 8 — distribuzione desktop

Progettare installer Windows/Linux/macOS con runtime pinato o bootstrap
verificato, scelta componenti opzionale, aggiornamento, firma, disinstallazione
reversibile e rollback. Prima del codice servono ricerca upstream, matrice
licenze, manifest degli asset e ledger file-per-file.

### Fase 9 — README e release evidence

Aggiornare il README desktop solo dopo evidenza TALOS-BANCO riproducibile:
architettura, Model Lab, runtime, benchmark AVM ON/OFF, screenshot approvati,
limiti noti e istruzioni di avvio. Non dichiarare superiorità senza raw logs.

### Fase 10 — gate di pubblicazione

Eseguire suite completa, build, `git diff --check`, controllo segreti/path,
review del diff e verifica degli artefatti ignorati. L’owner autorizza il
commit; il push/release resta una decisione separata.

## Chiusure già verificate

- Backend: `node --test tests/*.test.mjs` → 1058/1058.
- Frontend Harness: `npm exec vitest run tests/unit/harness` → 192/192.
- `npm run typecheck`, `node --check`, `git diff --check` → pass.
- Download reale HF, hash e manifest `ready` → pass.
- Runtime llama.cpp reale, stream SSE, stop e cleanup processo → pass.
- Pausa/ripresa/annullamento reale → pass; `.partial` assente e manifest
  `incomplete` conservato per resume esplicito.
- Screenshot CDP 1440×900 e 1024×800 ispezionati integralmente; nessun overflow,
  sovrapposizione, errore JS o HTTP fallito.

## Addendum P0 UX e Settings full width — stato consolidato (31/08/2026)

La coda P0 è stata eseguita prima di aprire le fasi successive:

| Voce | Stato verificato | Evidenza |
|---|---|---|
| Modale nuova sessione senza cartelle | ✅ chiusa | Copy naturale, soluzione Full access/Doctor, nessun dettaglio tecnico nel testo UI. |
| Menu contestuale sessione | ✅ chiusa | Apri/Rinomina/Fork/Copia identificativo/Elimina, chiusura Escape e click esterno, focus preservato. |
| Settings a sezioni | ✅ chiusa | Otto categorie list-detail, una sola attiva, barra compatta scorrevole. |
| Settings full width | ✅ chiusa | `.view-pane[data-view="settings"] > .generic-shell` è 100% del pannello centrale e non usa il max-width della chat; container query evita griglie compresse. |

File modificati per questo addendum: `mobile/public/harness-ui/app.js`,
`mobile/public/harness-ui/index.html`, `mobile/public/harness-ui/styles.css`,
`mobile/tests/unit/harness/harnessUiFrontend.test.ts` e
`harness-ui/scripts/qa-visual-pipeline.mjs`. Nessun file server nuovo e nessun
endpoint inventato.

Gate: `node --test tests/*.test.mjs` **1.060/1.060**,
`npm exec vitest run tests/unit/harness` **197/197**, typecheck, sintassi dello
scenario QA e `git diff --check` passati. Prove visive complete a 1440×900 e
1024×800 in `.qa-runs/qa-p0-ux-2026-08-31T08-51-42-753Z/` e
`.qa-runs/qa-p0-ux-2026-08-31T08-52-01-511Z/`; ogni corsa: tre screenshot,
zero eccezioni JS, zero richieste fallite.

Il confronto con VS Code/Cursor/Cline/Hermes conferma list-detail per le
impostazioni e menu contestuale per le azioni di riga; il miglioramento TALOS
è il linguaggio naturale in superficie con diagnosi tecnica confinata a Doctor,
più un layout full width che usa tutto il workbench senza rubare spazio alla
chat.

## Documenti di riferimento

- [Ledger Fase 10](./LEDGER-FASE-10-HF-DOWNLOAD-RUNTIME-DESKTOP-2026-08-31.md)
- [Consegna Fase 10](./CONSEGNA-FASE-10-HF-DOWNLOAD-RUNTIME-DESKTOP-2026-08-31.md)
- [Taccuino QA visiva](./QA-VISIVA-HARNESS-2026-08-30.md)
- [Tabella di marcia desktop](./LEDGER-TABELLA-DI-MARCIA-DESKTOP-2026-08-30.md)
- [Inventario impostazioni mobile→desktop](./INVENTARIO-IMPOSTAZIONI-MOBILE-DESKTOP-2026-08-30.md)

## Riepilogo semplice

Il cuore del download e dell’esecuzione locale desktop funziona già davvero.
Prima della release mancano soprattutto la parità completa del Laboratorio
modelli, la misurazione prestazionale con modelli di qualità, i test opzionali
contro Ollama/LM Studio, l’installer multipiattaforma e il README con benchmark
approvati. Questi sono lavori distinti: nessuno va dichiarato chiuso usando
mock o dati inventati.
