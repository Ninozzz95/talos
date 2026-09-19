# RIPRESA-HF — collegamento della pagina modello

Sottosistema TALOS UI desktop. Ricognizione R1 pertinente: nella release desktop-v0.1.13 la lista usa app.js:3593/renderizzaHfConMockup → apriDettaglioHf → avviaDownloadHf; scheda-modello.js e pagina-modello.css non esistono nella release. Nel corrente HEAD il pannello mantiene la stessa catena ma la nuova pagina riceve solo apiGet. Quindi è una nuova capacità incompleta; non si elimina il download storico prima di provare il nuovo ingresso. L'audit generale R1 e la baseline completa restano aperti.

## File esatti e simboli

1. `harness-ui/frontend/src/legacy/app.js`: apriPaginaModello, renderizzaHfConMockup, leggiRottaPaginaModello, scriviRottaPaginaModello, chiudiPaginaModello; eventuali helper di stato navigazione nominati in emendamento prima di aggiungerli. Primo sottolotto: soltanto fornire apiPost nel montaggio. Nessun clic lista spostato prima del suo GREEN.
2. `harness-ui/frontend/src/components/scheda-modello.js`: montaSchedaModello, disegnaSceltaFile, scegliVariante, avviaDownload, vaiA; stato/ciclo di vita, messaggio umano senza apiPost, successivo persistere selezione.
3. `harness-ui/frontend/src/components/hf-catalogo.js`: montaSceltaFileHf/aggiornaHf rimangono contratti stabili; cambiare solo se una prova ne dimostra la necessità. Non duplicare gruppi GGUF o controlli.
4. `harness-ui/frontend/src/styles/index.css`: portare le regole #hfFileChoices anche sul gancio data-hf-file-choices conservando l'aside.
5. `harness-ui/frontend/src/styles/pagina-modello.css`: allineare model-glyph--large e contenimento misurato; conservare 978 byte originali.
6. `harness-ui/frontend/tests/browser/lab-pagina-modello.spec.mjs`: conservare PAGINA-13/14, aggiungere RIPRESA-HF-DOWNLOAD-ROUTE attraverso il montaggio reale e poi RIPRESA-HF-DOWNLOAD dalla lista, RIPRESA-HF-RIENTRO, RIPRESA-HF-LAYOUT. Nessuna iniezione di montaSchedaModello nelle nuove prove d'ingresso; stub solo al confine API, limite esplicito rispetto al download upstream reale.

Contratti: #/impostazioni/modelli/scheda/<id>/<card|files|compatibility>, hf:<repo> con revisione, identità download, files/path/bytes/sha256/license, stima/rinomina/elimina esistenti. Nessuna dipendenza né nuova rotta backend.

## Cicli e prove

- RED 1: ingresso con hash reale, Files, selezione variante, bottone disabilitato perché app.js non passa apiPost. GREEN 1: richiesta POST valida e stato leggibile attraverso l'app costruita. Poi soltanto spostare il clic lista.
- RED 2: lista → pagina → variante → POST → coda. Conservare filtri, revisione, selezione, rientro, reload e cronologia; invalidare risposte di repo precedente. ID unici.
- RED 3: stile del selettore reale e glifo misurati; contenitore a 1024 e UI scale, entrambi i temi.
- Ulteriori scenari prima delle correzioni: RIPRESA-HF-DOPPIO (POST in attesa deve disabilitare il secondo invio), RIPRESA-HF-TAB-STATO (stessa variante passando card/files e usando cronologia), RIPRESA-HF-LAYOUT (scala UI xlarge 1.3, pagina e radio senza trabocco, glifo da 70 px prima della scala). Riscontro aggiuntivo: radice del componente priva della classe model-page usata dal CSS; pagina esterna alla talos-shell scalata. Interventi nel file scheda-modello.js limitati alla classe della radice e allo stato inCorso; nel CSS pagina aggiunte dopo il blocco originale conservato. La persistenza e navigazione richiederanno helper nominati prima dell'intervento.
- Gates: nuove spec + PAGINA13/14, suite laboratorio, unit frontend, _fase2-niente-perso con causa baseline accertata, browser completo, parità componenti. Download reale con file/hash/upstream resta gate distinto: fixture di API non basta.
- Mutazione apiPost soltanto in snapshot: baseline verde, writer rimosso, fallimento pertinente, ripristino per hash.
- Review avversariale dello stesso autore: race hashchange/remount, doppio click download, errori e distruzione durante promesse, stato non fidato da URL/storage, focus reale fuori dal velo d'avvio; non indipendente.
- Rollback: diff del sottolotto sui file esatti; public e 4174 non aggiornati.

## Emendamento navigazione — dopo il GREEN del writer

Prove già registrate: a067744f, 8/8 browser; f9c7c2fe, 1426/1426 unit. La 4174, trovata spenta, è stata aggiornata e riavviata su richiesta esplicita dell'owner: backup e riscontri in `ripresa-2026-09-19/live-4174-20260919T130331Z-652a5ad1`. Non vale più il precedente vincolo di rinvio della consegna locale. Restano nessun commit/pubblicazione e nessuna interruzione di attività in corso.

File del sottolotto successivo: esclusivamente `harness-ui/frontend/src/legacy/app.js`, `harness-ui/frontend/src/components/scheda-modello.js`, `harness-ui/frontend/tests/browser/lab-pagina-modello.spec.mjs`. Simboli app aggiunti: `leggiRipresaModelli`, `salvaRipresaModelli`, `salvaSceltaPaginaModello`, `apriPaginaHfDallaLista`, `ripristinaListaHf`; modificati `renderizzaHfConMockup`, `leggiRottaPaginaModello`, `apriPaginaModello`, `chiudiPaginaModello`. Contratto componente additivo: `onScelta`, `apriDownload`, uso del parametro già riservato `inizio`; modificati `caricaRepo`, `scegliVariante`, `disegnaSceltaFile`. Archivio sessionStorage per scheda browser: massimo 20 scelte, validate per id/revisione/variante; nessun segreto o stato operativo del download persistito. Filtri remoti e faccette ripristinati dopo i risultati, non azzerati dal rendering di caricamento. Revisione risolta riutilizzata solo per lo stesso bersaglio.

RED nominativi: `RIPRESA-HF-DOWNLOAD` (clic lista apre ancora aside, non pagina/coda), `RIPRESA-HF-RIENTRO` (variante e lista perse al reload), `RIPRESA-HF-HASH-INVALIDO` (decodeURIComponent genera URIError), `RIPRESA-HF-CAMBIO-RAPIDO` (risposta vecchia non deve sostituire repository corrente; caratterizzazione prima dell'intervento). GREEN con runner browser isolato e filtro RIPRESA-HF, poi tutta la spec pagina e unit/frontend. Pulsante reale verso coda solo dopo risposta positiva al POST; nessun download automatico dalle prove. Test del percorso HTTP con fixture resta distinto dal download upstream reale.

Ricerca primaria aggiuntiva già letta oggi: [sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage), [History](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState). Decisione: adottare storage e cronologia nativi dietro helper TALOS, con errori di storage non bloccanti; nessun router o pacchetto nuovo. Pin invariati. Rollback mediante diff dei tre file, consegna del bundle verificato con backup distinto. Revisione avversariale dello stesso autore, non indipendente: storage alterato, revisione mutata, risposte tardive, doppio invio e ritorno dalla coda.

### Revisione avversariale della navigazione (stesso autore)

Costanti interne: `RIPRESA_MODELLI_KEY`, `CAMPI_RICERCA_RIPRESA`. Caratterizzazioni aggiunte nello stesso file test: `RIPRESA-HF-REVISIONE`, `RIPRESA-HF-SCELTA-ALTERATA`; `RIPRESA-HF-CAMBIO-RAPIDO` aspetta il completamento HTTP e il rendering dopo la risposta tardiva. Nuovo difetto scoperto prima della chiusura: lo storage poteva sostituire anche uno SHA esplicito nell'URL. `RIPRESA-HF-PIN-URL` deve fallire prima di restringere il riuso di inizio.revision in caricaRepo alle sole revisioni simboliche. La scelta di un file deve sempre appartenere alla revisione ricevuta. Nessun nuovo file di prodotto.

### Mutazione di collegamento

File di sola verifica aggiunto: `.claude/ripresa-2026-09-19/mutazione-hf.mjs`. Riusa creaEsecuzione/creaSnapshot/creaAmbienteIsolato di R0, Node 24.18.0 e Playwright 1.62.1. Una sola copia fisica del prodotto, tre esecuzioni con cartelle distinte: baseline verde, rimozione della sola proprietà apiPost nel montaggio app, ripristino identico per SHA-256 e nuovo verde. Il file owner e la 4174 non vengono mutati. La prova selezionata è il percorso dalla lista `RIPRESA-HF-DOWNLOAD`, comprensivo della riga restituita dal GET della coda dopo il POST di fixture. Si richiede fallimento pertinente sul controllo disabilitato; un generico errore del banco non basta.

## Ricerca primaria e upstream — 19 settembre 2026

[Playwright routing](https://playwright.dev/docs/network), [Hugging Face revisioni e download](https://huggingface.co/docs/huggingface_hub/guides/download), [dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), [container query](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40container), [SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), già consultati nella ricognizione corrente. Adottare adapter TALOS e primitive native; Playwright 1.62.1, esbuild 0.28.2. Il proxy immagini non viene ampliato. Scartata riscrittura del selettore: quello condiviso già soddisfa gruppi e payload; manca il collegamento nell'app.
