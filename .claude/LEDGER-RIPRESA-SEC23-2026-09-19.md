# RIPRESA-SEC23 — restringimento ambiente per richiesta

Sottosistema security/backend desktop. Emendamento R1: il confronto con PR23 ha trovato nel sorgente corrente la stessa doppia costruzione dell'ambiente. La seconda usa la policy generale e può reintrodurre variabili escluse dalla richiesta. La sicurezza precede l'avanzamento delle nuove funzioni; prima riprodurre, poi correggere nel piccolo lotto.

## File esatti

- Modificare `harness-ui/src/process-policy.mjs`: `createProcessPolicy`, interne `prepare` e `prepareApprovedProcess`; costruire una volta con l'intersezione effettiva. Nessuna modifica alle firme pubbliche `runApprovedProcess`, `spawn`, `execFile`, `execFileSync`. Preservare `finestreVisibili` introdotto dopo la PR.
- Creare `harness-ui/tests/process-policy-env-narrowing.test.mjs`: adottare integralmente i 15 test upstream, Git blob verificato contro PR23. Nessun altro sorgente prodotto.

Contratti: envKeys assente conserva default; array vuoto non inoltra variabili; una richiesta può restringere e mai ampliare; override solo per chiavi consentite; input malformati prima dello spawn; argv/cwd/signal/timeout/captureLimit e visibilità finestre invariati.

## RED / GREEN / regressioni

Scenario permanente RIPRESA-SEC23: `request subset does not reintroduce a policy-only parent variable` e `real child process observes the narrowed environment` nella suite upstream (nomi esatti confermati all'import). RED atteso sul codice corrente: variabili TALOS_TEST_ENV_* escluse ricompaiono. Si osservano solo valori sintetici.

GREEN: `rtk proxy node --test tests/process-policy.test.mjs tests/process-policy-env-narrowing.test.mjs`; regressioni hook/plugin/doctor/process policy pertinenti, poi backend completo isolato e `rtk git diff --check`. Verifica umana: rapporto per scenario che mostra esclusione effettiva nel processo Node figlio, non una dichiarazione UI. Nessuna pretesa di sandbox OS, né chiusura Electron basata su queste prove.

Mutazione: copia dei due file e della suite in directory nuova; verde, ripristino del doppio filtro, rosso pertinente, ritorno ai byte verdi verificato con SHA256. Non mutare il worktree owner.

Rollback: riportare solo le righe aggiunte in process-policy al contenuto d'ingresso registrato e rimuovere il solo nuovo test se richiesto; non sostituire il file intero con la versione della PR. Nessun commit, bundle, restart o pubblicazione.

## Ricerca primaria e decisione — 19 settembre 2026

- [PR23](https://github.com/Ninozzz95/talos/pull/23), head `3393cb42ead7be536a5cee4a88c53a1cbae34d1f`, base `13f65c15cdeaf8986b882993a0773cdeafb867d2`: patch e test letti tramite API GitHub, prove storiche non assunte valide qui.
- [Node child_process](https://nodejs.org/api/child_process.html): `env` default process.env, semantica e peculiarità Windows. Runtime locale Node 24.18.0. Il tentativo di aprire docs/latest-v24.x è fallito; fonte ufficiale corrente e fonte PR consultate, nessuna memoria sostitutiva.

Decisione: adattare direttamente la patch upstream già richiesta nell'audit, dietro l'adapter AVM esistente, preservando le modifiche locali. Nessuna dipendenza nuova. Provenienza/license: stesso repository TALOS e relativa licenza; non importare documentazione storica con numeri di test come attestazione del run corrente.
