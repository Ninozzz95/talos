# RIPRESA-MODEL-LOCKED — prove del rifiuto di eliminazione

Sottosistemi: deposito modelli desktop e TALOS UI. Nessuna modifica di prodotto prevista prima della prova. Sorgenti letti: createLocalModelStore/remove/lock, renderizzaDownloadConMockup e confermaDialogoModelloLocale. I test AZ esistenti montano azioni scritte nel test: non provano il montaggio app.js.

File esatti di questo passaggio:

- `harness-ui/tests/local-model-store.test.mjs`: aggiungere RIPRESA-MODEL-LOCKED-STORE; usare withStore/valid esistenti. Lock reale, remove rifiutato con MODEL_LOCKED, manifest/nome/pesi conservati; unlock e remove riescono. File esclusivamente nel temp di withStore.
- `harness-ui/frontend/tests/browser/lab-installati-azioni.spec.mjs`: aggiungere RIPRESA-MODEL-LOCKED tramite navigazione effettiva della app e comandi del bundle. Modello importato nel banco isolato; GET coda con fixture riferita a quel modello; POST delete rifiutato al confine HTTP; messaggio leggibile, nessuna falsa eliminazione e modello ancora nell'elenco reale. Nessun import del componente in questa prova, nessuna azione sostitutiva iniettata nel browser.

Contratti stabili: local-models/:id/delete, MODEL_LOCKED, GET elenco, comando in due passi e stato DownloadRow. Scenari nuovi di caratterizzazione; un eventuale fallimento di prodotto richiederà emendamento con file/simboli e RED prima della correzione. La fixture HTTP non certifica il lock di un modello caricato in llama.cpp: quel gate resta distinto.

Gates: runner backend local-model-store.test.mjs; runner browser lab-installati-azioni.spec.mjs; regressioni laboratorio in corso sul precedente snapshot. Ricerca primaria già consultata in R0: Node 24 fs/child_process e Playwright network/locators; nessun protocollo o dipendenza nuovo. Decisione: riuso degli adapter TALOS e fixture HTTP Playwright 1.62.1, nessuna simulazione del deposito. Rollback: rimuovere esclusivamente le due nuove prove mediante diff; nessuna mutazione della 4174.
