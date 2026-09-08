# AC-RICERCA-01 — ricognizione prima della scelta dell'engine

08/09/2026. Richiesta owner: ricerca tecnica dei competitor e valutazione autocompact, niente supposizioni. Ambito docs e lettura del runtime. Nessun cambio di comportamento autorizzato da questo ledger.

File di consegna: `.claude/RICERCA-AUTOCOMPACT-ENGINE-2026-09-08.md` e questo ledger. Artefatti di ricerca locali in `scratchpad/prove/autocompact-20260908/`: manifest delle fonti, copie dei sorgenti pubblici consultati. Non sono codice di prodotto e non si installa alcuna dipendenza.

Esito: autocompattazione documentata in tutti i competitor esaminati. Identificati il trigger TALOS ogni 8 giri, sintesi dello storico intero, batch originale da 398 chiamate, comando manuale non persistente e routing globale. Non basta l'operazione di deduplicazione precedentemente proposta.

Decisione upstream proposta: primo candidato Pi 0.85.1, API pubblica `generateSummaryWithUsage` e streamFn dietro adapter; non ancora scelto né integrato. Hermes v2026.9.7, OpenCode v1.18.29 e llama.cpp b10517 fissati nel dossier. Native API, LangChain, LCM e Knowledge Triage valutati con limiti espliciti. Nessun algoritmo è dichiarato superiore senza benchmark.

Verifica: fonti ufficiali aperte, tag risolti tramite GitHub, export e rami di errore letti nel codice. Snapshot storico versione 2 verificato senza mutarlo. Nessun nuovo test prodotto necessario per due documenti; `git diff --check` prima del commit. Nessuna UI modificata, nessuna foto nuova attribuita a una funzione inesistente.

Stato: ricerca consegnata. Implementazione, integrazione upstream, conteggio reale e benchmark NON VERIFICATI. Ripresa lunga ancora aperta. Questa consegna non riapre né cambia le decisioni sul mantenimento della stessa conversazione e sull'autocompact predefinito.

**Cosa deve fare l'owner:** valutare la proposta documentata. **Cosa faccio io dopo:** qualificare il riuso upstream e redigere il ledger implementativo prima di editare il motore. **Cosa rimane:** backend, modale Context Compactor, recupero storico lungo, guardia delle raffiche secondo politica owner e benchmark.
