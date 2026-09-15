# Fase 3 — piano esecutivo consolidato

Data baseline: 2026-09-15

Ordine approvato: **3A → 3C → 3B → 3D → 3-QA**.

Fuori scope di questa lane: fluidità streaming e Prompt Enhance, in lavorazione separata. `mobile/**` resta fuori scope.

## Regole di esecuzione

- TDD per ogni regressione o nuovo contratto: test RED prima della produzione, poi GREEN.
- Nessun gate indebolito, nessun `|| true`, nessuno sleep arbitrario, nessuno skip generico.
- Prima di 3B e prima di 3-QA: refetch/rebase sul `main` corrente per integrare il lavoro concorrente.
- Nessuna release/version bump finché 3-QA non è completamente chiusa.
- Le API singole e batch devono condividere la stessa semantica; niente seconde implementazioni degli store.

## 3A — Batch API

Endpoint:

```text
POST /api/v1/sessions/:sessionId/:resource/batch
```

Risorse ammesse: `library`, `notes`, `tasks`, `memory`, `research`.

`projects` resta read-only e non deve ricevere una DELETE inventata.

Body:

```json
{
  "azione": "elimina",
  "ids": ["id-1", "id-2"]
}
```

Contratto:

- body massimo 64 KiB, limite applicato soltanto a questa route;
- `ids`: 1..250 stringhe non vuote e uniche;
- validare l'intera richiesta prima di qualsiasi mutazione;
- una volta iniziato il batch, ogni ID è indipendente;
- nessun rollback globale delle cancellazioni già riuscite;
- esiti nello stesso ordine degli ID richiesti;
- input valido: HTTP 200 anche in partial failure, con esiti individuali;
- sessione assente: 404;
- input/risorsa/azione non validi: 400;
- body oltre limite: 413;
- prima implementazione seriale e deterministica; niente concorrenza illimitata su filesystem.

Gate minimi: `FASE3-BATCH-214`, partial failure, 250/251, duplicati, 64 KiB, risorsa/azione invalida, traversal, ordine, equivalenza con DELETE singola.

## 3C — Pagination guard

Non riscrivere i meccanismi di paging esistenti.

Contratti paginabili censiti: `library_list`, `library_search`, `research_list`.

Per `research_list` aggiungere `browse_every_page` opzionale e la policy:

- pagina 1 spontanea: consentita;
- pagina 2 spontanea: consentita;
- pagina 3 spontanea: rifiutata **prima** della callback/store;
- con `browse_every_page:true`: consentita entro i limiti assoluti già esistenti.

Identità semantica della query Research: filtri (es. `status`), non `offset`, non `page_size`, non `browse_every_page`.

Gate: `FASE3-RESEARCH-PAGINATION-GUARD` + test di censimento dei tool paginabili.

## 3B — Multi-select UI

Stato condiviso nell'impianto comune delle sezioni, non cinque implementazioni.

Superfici: Library, Notes, Tasks, Memory, Research. Niente multi-select nuovo su Projects o Board.

Requisiti:

- checkbox nativo separato dall'apertura della voce;
- master checkbox con unchecked / indeterminate / checked;
- azione esplicita **Seleziona visibili**;
- cambio filtro/ricerca rimuove dalla selezione gli elementi diventati invisibili; riordinare non perde la selezione;
- una sola modale di conferma distruttiva;
- una sola POST batch;
- doppio invio impossibile mentre il batch è in corso;
- successi rimossi/deselezionati; falliti restano selezionati con motivo;
- rilettura dal server dopo la mutazione.

Gate browser: una POST, partial failure, Projects senza bulk controls, keyboard/focus, no double-submit.

## 3D — Assistenza grounded/offline

Corpus canonico: `harness-ui/docs/assistenza/**`.

Il corpus deve contenere soltanto funzionalità esistenti, essere versionato e non dipendere dal web o da un provider.

Motore unico `cercaAssistenza()` riusato da route e consumer prodotto.

Risposta ignota, letterale:

```text
non lo so
```

con `fonti: []`.

La route da sola non chiude il requisito prodotto: TALOS deve poter usare lo stesso motore di assistenza in un percorso reale per l'utente.

Packaging: `harness-ui/docs/assistenza/**` deve essere incluso esplicitamente nello staging Desktop e verificato nell'app installata.

## 3-QA — gate bloccante di chiusura

La Fase 3 non è chiusa senza tutti i seguenti elementi:

1. code review indipendente su 3A/3C/3B/3D;
2. mutation/adversarial testing che dimostri che i gate diventano rossi rompendo intenzionalmente i contratti principali;
3. suite automatica completa: server, kernel, parità kernel, frontend, browser, Desktop pure/shell, build e `git diff --check`;
4. classificazione di ogni fallimento: `green`, `preesistente su main`, `regressione introdotta`, `non verificabile`;
5. build Windows e installazione reale dell'EXE;
6. E2E sull'app installata, non soltanto localhost/mockup/dev shell;
7. Playwright trace con rete/request/response per provare, tra l'altro, la singola POST batch;
8. screenshot dell'app installata per stati normali, selezione, conferma, batch in corso, partial failure, assistenza nota/ignota e Projects senza bulk controls;
9. ispezione visuale manuale di ogni screenshot per clipping, overflow, focus, contrasto, sovrapposizioni, scrollbar, temi e testo;
10. screenshot delle superfici critiche in chiaro e scuro, target primario 1280×800 più una seconda dimensione Desktop supportata;
11. restart/persistenza dopo le mutazioni;
12. smoke install/start/health/reload/close/restart/uninstall;
13. artifact CI con screenshot, trace, report test e prova smoke;
14. verifica finale del diff: **nessun file `mobile/**` modificato**.

Se manca la prova installata o la matrice screenshot ispezionata, la Fase 3 resta aperta.
