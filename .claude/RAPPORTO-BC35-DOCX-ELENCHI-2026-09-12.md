# BC-35 — Titoli Word ed elenchi annidati

Data: 12 settembre 2026. Sottosistema: backend desktop, generazione documenti e ricerca. Nessun commit autorizzato.

## Ricerca completata prima delle modifiche

Fonti consultate il 12 settembre 2026:

- [CommonMark 0.31.2, 28 gennaio 2024, §5.2](https://spec.commonmark.org/0.31.2/#list-items): il contenuto della voce determina il rientro dei figli, mediante larghezza del marcatore più 1–4 spazi. Numeri di 1–9 cifre, delimitatori punto o parentesi; tabulazioni su colonne di quattro spazi.
- [GFM 0.29-gfm, §5.2 e §5.4](https://github.github.com/gfm/#list-items): annidamento e marcatori misti; cambiare carattere o delimitatore separa le liste. La compatibilità richiesta conserva le precedenti semplificazioni degli elenchi piatti, compresi numero iniziale normalizzato, marcatori puntati accorpati e separazione alle righe vuote. Non si dichiara conformità CommonMark completa.
- [Implementazione ufficiale commonmark.js 0.31.2](https://raw.githubusercontent.com/commonmark/commonmark.js/0.31.2/lib/blocks.js): confronto di rientro, larghezza e spaziatura del marcatore. Valutata come riferimento; sostituire l'intero parser violerebbe il mandato di estendere l'esistente e la compatibilità byte per byte.
- [Microsoft Open XML, stili di paragrafo, aggiornamento 21 gennaio 2025](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-create-and-add-a-paragraph-style-to-a-word-processing-document): `w:pPr/w:pStyle` riferisce uno stile di paragrafo definito in `word/styles.xml`; il solo grassetto non crea un titolo.
- [docx, HeadingLevel](https://docx.js.org/api/variables/HeadingLevel.html), [proprietà di paragrafo](https://docx.js.org/api/types/IParagraphPropertiesOptions.html), [livelli numerazione](https://docx.js.org/api/types/ILevelsOptions.html), [sorgente ufficiale fissato a 9.5.1](https://raw.githubusercontent.com/dolanmiu/docx/9.5.1/src/file/paragraph/properties.ts): `heading` scrive lo stile; numerazione con livelli 0–8 e riferimento per lista. Decisione: adozione diretta della dipendenza esistente `docx@9.5.1` (MIT), senza installazioni o variazioni del pin.
- [pdfmake, liste 0.3](https://pdfmake.github.io/docs/0.3/document-definition-object/lists/): liste native `ul`/`ol`, contenuti composti e liste figlie. Decisione: adattamento nel generatore AVM con `pdfmake@0.3.11` già installato (MIT), senza modificare `document-report.mjs`.

## Registro di esecuzione prima del codice

Proprietà esclusiva dei seguenti file, nessun altro file prodotto modificato:

1. `src/research/markdown-server.mjs`: estendere `BloccoMarkdown` con voci stringa oppure `{x, figli}`; introdurre `PROFONDITA_MASSIMA_ELENCHI = 9`, lettura del marcatore e analisi ricorsiva limitata. Conservare le firme pubbliche `analizzaMarkdown`, `analizzaInline`, `escapeHtml`, `hrefSicuro`, `inlineInHtml`, `inlineInTestoSemplice`, `runsDiMarkdown`, `markdownInHtml`, `markdownInBlocchiReport`, `markdownInTestoSemplice`. Adeguare i tre emettitori, lasciando identiche le voci piatte.
2. `src/research/esportazioni.mjs`: `costruisciEsportazione` passa il Markdown al generatore condiviso dopo la sola rimozione del record. Restano stabili classe `EsportazioneRicercaError`, costanti dei formati/toni/dicitura, `nomeSicuroDiEsportazione`, `recordDellaScheda` e contratto di esportazione.
3. `src/document-generator.mjs`: conservare `generateTalosDocument`, `verifyTalosDocument`, `TALOS_SOURCE_TEXT_FORMATS`, `TALOS_DOCUMENT_FORMATS`; aggiungere adattatori privati per DOCX dal parser unico e per liste PDF composte. Veri titoli 1–6; numerazione nativa fino al livello 8; un'unica definizione stili per ricerca e `document_create`.
4. `tests/research/markdown-server.test.mjs`: aggiungere scenari BC35 per tre uscite, compatibilità piatta esatta, rientri insufficienti, tabulazioni, marcatori misti, ritorni al padre, limite e sicurezza.
5. `tests/ricerca-esportazioni-bc35.test.mjs`: creare prove reali di DOCX/ZIP, stili 1/2/3 assenti dai paragrafi, uguaglianza `styles.xml`, livelli e riavvio numerazione, PDF reale con posizioni dei figli.
6. `tests/http-routes-research-esportazioni.test.mjs`: aggiornare solo l'asserzione del vecchio punto letterale nel DOCX per verificare il punto nativo in `numbering.xml` e `w:numPr`; testo e aspetto restano puntati.
7. Questo rapporto: `.claude/RAPPORTO-BC35-DOCX-ELENCHI-2026-09-12.md`, relativo a `harness-ui`, area scrivibile della sessione. La `.claude` alla radice del repository è fuori dall'area scrivibile imposta dall'ambiente.

RED: prima del codice, eseguire i due file BC35; attese liste piatte o testuali e assenza di Heading2/Heading3. GREEN: stessi file; regressioni: `node --test tests/research/*.test.mjs`, file di esportazione e test del generatore pertinente, senza suite completa. Gate upstream: librerie installate reali, ZIP DOCX riaperto, PDF generato e riletto. Prova umana: esportazione diretta del rapporto su disco indicato dall'owner; tentativo di rendering se disponibile. Rollback: rimuovere solo le modifiche BC35 confrontandole con copie iniziali in `%TEMP%/bc35-cxOlZh`, senza ripristini globali. Nessuna modifica ai file di altri agenti; nessuna porta 4174.

Le prove temporanee e le copie iniziali sono in `C:/Users/Antonino/AppData/Local/Temp/bc35-cxOlZh`.

## Risultati

### Emendamento del registro dopo l'ispezione del DOCX reale

Scenario permanente `BC35 — stili Word completi per navigazione e gerarchia visiva`: il controllo dello ZIP ha trovato che `docx@9.5.1` non aggiunge `outlineLvl` ai suoi stili predefiniti. Inoltre specificare solo `run.color` sostituisce l'intera configurazione `run` dello stile, togliendo la dimensione predefinita. Prima di correggere `generaDocx`, aggiungere un test RED in `tests/ricerca-esportazioni-bc35.test.mjs` per livelli 0/1/2, dimensioni e grassetto. Stessi file e stessi confini di proprietà del registro iniziale.

Ricerca aggiuntiva del 12 settembre 2026: [Microsoft, OutlineLevel](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.outlinelevel?view=openxml-3.0.1) definisce `w:outlineLvl` e chiarisce che l'assenza implica nessun livello; [Microsoft, Paragraphs.OutlineLevel](https://learn.microsoft.com/en-us/office/vba/api/word.paragraphs.outlinelevel) descrive il riconoscimento specifico dei titoli in Word. Decisione: esplicitare livello e aspetto tramite le proprietà supportate da `docx@9.5.1`, senza dipendere da inferenze del lettore.

### Esito e file modificati

BC35 corretto e verificato sui confini autorizzati. Il ramo rilevato è `lane/harness-desktop`. L'esportazione della ricerca usava già `generateTalosDocument`: la perdita dei titoli avveniva prima, nella conversione a testo semplice. `document_create` assegnava Heading1 solo al titolo iniziale, lasciando il corpo come righe letterali. Ora entrambi passano dal medesimo parser e dal medesimo adattatore DOCX.

| File relativo a harness-ui | Righe significative | Modifica |
| --- | --- | --- |
| `src/research/markdown-server.mjs` | 75, 97, 104, 118, 204, 409, 487, 532 | Voci annidate `{x, figli}`, calcolo del rientro, limite di nove livelli; emettitori HTML, blocchi rapporto e testo semplice ricorsivi. Le stringhe piatte e `runsDiMarkdown` conservano il contratto precedente. |
| `src/research/esportazioni.mjs` | 475, 544, 548 | Rimozione della conversione prematura a testo semplice per DOCX. Il record recintato continua a essere escluso; avviso per prosa non verificata e nome del download conservati. |
| `src/document-generator.mjs` | 35, 205, 254, 267, 370, 408 | `generaDocx` usa `HeadingLevel`, stili espliciti con livello di struttura, dimensione e grassetto; liste Word native con riferimenti distinti e livelli; `adattaElenchiPdf` promuove le voci composte a liste native pdfmake. |
| `tests/research/markdown-server.test.mjs` | 16–90 | Dieci scenari BC35, oltre ai quindici test precedenti: tre uscite, byte piatti, larghezza del marcatore, tab, righe vuote, marcatori misti, continuazioni, limite, protezioni dei figli. |
| `tests/ricerca-esportazioni-bc35.test.mjs` — nuovo | 30, 73, 91, 97, 112, 124, 132 | Sette test con librerie reali: stili solo sui titoli nei due percorsi, uguaglianza styles.xml, struttura e aspetto dei titoli, numerazioni indipendenti, prosa respinta, PDF riletto con testo e coordinate. |
| `tests/http-routes-research-esportazioni.test.mjs` | 715–722 | Il controllo del punto passa dal carattere letterale nel corpo alla numerazione Word nativa: `w:numPr` nel corpo e punto in numbering.xml. Gli altri controlli del test restano presenti. |
| `.claude/RAPPORTO-BC35-DOCX-ELENCHI-2026-09-12.md` — nuovo | intero file | Ricerca, registro preventivo, emendamento, risultati e consegna. |

Nessun file eliminato, nessuna dipendenza installata o aggiornata. Nessuna riga necessaria altrove, quindi nessun diff esterno da applicare. I file degli altri agenti sono rimasti fuori dalle modifiche BC35. Non sono stati eseguiti `git add`, `git commit` o `git push`.

### Contratto e limite degli elenchi

Nove livelli totali, con la radice al livello zero. Il decimo livello e quelli successivi conservano il contenuto come continuazione della voce più profonda; la ricorsione non cresce ulteriormente. Il test usa 32 livelli in ingresso e verifica che tutti i testi sopravvivano.

I figli si riconoscono dal rientro del contenuto della voce padre, non da un numero fisso di spazi. Un marcatore numerato largo richiede quindi più rientro. Sono coperti puntati dentro numerati e numerati dentro puntati, marcatori `-`, `+`, `*`, `.` e `)`, tabulazioni, righe vuote prima e fra figli, ritorno al padre e testo successivo al figlio. I figli numerati conservano il numero iniziale e hanno numerazione indipendente.

Per il vincolo di compatibilità, le semplificazioni preesistenti delle liste piatte restano deliberate: accorpamento dei diversi marcatori puntati, normalizzazione del primo numero a uno e separazione sulle righe vuote. Anche l'HTML delle liste annidate con righe vuote usa la forma compatta, senza applicare l'intera distinzione CommonMark tra liste compatte e liste con paragrafi separati. Non vengono introdotti un motore CommonMark completo, liste di attività, né tutti i blocchi arbitrari dentro una voce. Il DOCX conserva la precedente resa testuale delle tabelle, separata da punti mediani.

L'adattatore PDF è nel generatore perché `document-report.mjs` tratta ogni voce come `text`: passargli direttamente un oggetto con figli perderebbe la struttura. La promozione avviene per forma del dato (`figli`), senza correlare blocchi per posizione e senza modificare il costruttore condiviso non autorizzato.

### Test eseguiti

Tutti i comandi sono stati avviati tramite `rtk proxy`; `rg` non è disponibile nell'ambiente, quindi la ricerca locale è proseguita con letture mirate. Il wrapper `rtk git` non trova la configurazione Claude in questa sessione: i controlli Git sono stati eseguiti tramite `rtk proxy git`.

| Fase | Comando effettivo del test runner | Esito |
| --- | --- | --- |
| RED iniziale | `node --test tests/research/markdown-server.test.mjs tests/ricerca-esportazioni-bc35.test.mjs` | 31 test: 18 verdi, 13 rossi sui difetti attesi. |
| Primo GREEN | stesso comando | 31/31 verdi. |
| Prima regressione richiesta | `node --test tests/research/*.test.mjs tests/ricerca-esportazioni-bc35.test.mjs tests/http-routes-research-esportazioni.test.mjs tests/document-html-verbatim.test.mjs` | 397/397 verdi. |
| RED dello scenario scoperto nello ZIP | `node --test --test-name-pattern='stili Word completi' tests/ricerca-esportazioni-bc35.test.mjs` | 1 test, rosso per assenza di outlineLvl nello stile. |
| GREEN finale mirato | `node --test tests/research/markdown-server.test.mjs tests/ricerca-esportazioni-bc35.test.mjs` | 32/32 verdi. |
| Regressione finale richiesta | `node --test tests/research/*.test.mjs tests/ricerca-esportazioni-bc35.test.mjs tests/http-routes-research-esportazioni.test.mjs tests/document-html-verbatim.test.mjs` | **398/398 verdi**, zero falliti, saltati o cancellati. |
| Controllo diff | `git diff --check` | Uscita 0; nessun errore di spaziatura. Git segnala soltanto avvisi ambientali su ignore non accessibile e conversione CRLF/LF. |

Il file di esportazione preesistente trovato si chiama `tests/http-routes-research-esportazioni.test.mjs`; non esisteva un file `tests/ricerca-esportazioni*.test.mjs` prima di questo intervento. Il test HTML aggiuntivo esercita un altro ramo dello stesso `document-generator.mjs`. Non sono state eseguite suite complete, build, Playwright o installazioni.

La caratterizzazione separata confronta sei ingressi con AST, HTML, blocchi rapporto serializzati e testo semplice catturati **prima** delle modifiche: **6/6 identici**, senza rigenerare i valori attesi dopo la cura. Il test PDF riapre il documento, decodifica le mappe dei caratteri dei font e verifica che Primo sia a destra di Padre, Nipote a destra di Primo, Secondo torni al rientro di Primo e Fratello a quello di Padre; verifica anche l'ordine verticale. Un PDF semplicemente apribile non sarebbe bastato.

Log completo dell'ultima esecuzione: `C:/Users/Antonino/AppData/Local/Temp/bc35-cxOlZh/test-verifica.log`.

### Prova sul rapporto reale

Sorgente letta: `C:/Users/Antonino/Desktop/.harness-ui-research/2a8ab83b-6fc6-4b07-9b6f-944acbeb18c1/rapporto.md`.

Il file contiene 102.033 byte e 38 affermazioni nel record verificabile. Il campo `terminata` del suo `meta.json` è `done`. La chiamata diretta è stata eseguita dallo script temporaneo `prova-reale.mjs` tramite `costruisciEsportazione({ ricerca, formato: 'docx' })`, usando la funzione vera, senza dipendenze simulate e senza avviare un server.

Ultima generazione: **12 settembre 2026, 11:28:03 UTC**. Artefatto: [ricerca-bc35.docx](C:/Users/Antonino/AppData/Local/Temp/bc35-cxOlZh/ricerca-bc35.docx), **23.782 byte**. Il confronto dello SHA-256 prima e dopo conferma che il rapporto originale non è stato modificato:

`b70237fe08ad932689e2efc0fcd158229fdf65011089dad675e436403fb0c4ed`

`word/document.xml` riaperto tramite JSZip contiene:

| w:pStyle | Occorrenze |
| --- | ---: |
| Heading1 | 3 |
| Heading2 | 10 |
| Heading3 | 38 |
| ListParagraph | 68 |

Totale: **249 paragrafi**, dei quali **51 titoli** e **198 non titoli**; 130 non hanno alcun pStyle esplicito. In `styles.xml`, Heading1, Heading2 e Heading3 hanno rispettivamente `outlineLvl` 0, 1 e 2. Il titolo della domanda compare sia come titolo del documento sia nella prosa originale: la ripetizione preesistente del contenuto non è stata deduplicata da BC35.

Il rapporto reale contiene elenchi piatti, quindi il suo DOCX ha solo `ilvl=0`. La prova distinta [document-create-bc35.docx](C:/Users/Antonino/AppData/Local/Temp/bc35-cxOlZh/document-create-bc35.docx) contiene i livelli **0, 1 e 2**; i test automatici verificano lo stesso annidamento nel percorso della ricerca. I due DOCX hanno **styles.xml identica byte per byte**, SHA-256:

`4fa4d40b36e34af278a1a938925f8a78f72612defb844ff590e473ce8624e6ff`

La stringa `talos-research-report` non compare nel corpo esportato. Lo script, i conteggi e gli artefatti sono conservati nella cartella temporanea:

- `prova-reale.mjs` — script ripetibile senza server.
- `prova-reale.json` — conteggi, hash e campioni dei titoli.
- `ricerca-bc35.docx` e `document-create-bc35.docx` — documenti generati.
- `baseline.json` — sei caratterizzazioni precedenti alla cura.
- `markdown-server.mjs.prima`, `esportazioni.mjs.prima`, `document-generator.mjs.prima`, `markdown-server.test.mjs.prima`, `http-routes-research-esportazioni.test.mjs.prima` — copie iniziali per confronto selettivo.
- `test-verifica.log` — risultato completo dei 398 test finali.

### Cosa non ho verificato

- Nessuna apertura interattiva in Microsoft Word, nessun uso della navigazione o inserimento dell'indice nell'applicazione: il contratto è provato nel contenuto OOXML.
- Nessuna conversione del DOCX reale in PDF o immagini e nessuna foto: non sono esposti il caricatore delle dipendenze della skill documenti né un runtime di rendering gestito; la ricerca locale non trova `python.exe`, `soffice.exe` o `pdftoppm.exe` nel PATH. È stato ispezionato `render_docx.py`, ma non eseguito. Si consegna quindi il conteggio richiesto come alternativa, senza dichiarare verificata l'impaginazione visiva.
- Nessuna conformità completa alla specifica CommonMark/GFM; i limiti del sottoinsieme e le eccezioni di compatibilità sono dichiarati sopra.
- Nessuna chiamata al backend dell'owner sulla porta 4174, nessun POST verso quella porta, nessun riavvio del suo processo. Le rotte sono state esercitate soltanto dai test con porte assegnate dal sistema e chiuse dal loro cleanup. Un test della cache nomina 4174 usando una funzione simulata, senza richieste di rete.
- Nessun giro dal compositore con un modello reale né verifica di UI, ricaricamento o indice Word interattivo. La prova reale richiesta usa direttamente la funzione di esportazione e i dati già sul disco.
- Nessuna valutazione della veridicità delle 38 affermazioni: questa prova verifica struttura e conservazione del documento, non i risultati della ricerca.

### Proposta di testo di commit

`Correggi BC-35: titoli Word e liste annidate nelle esportazioni`

Corpo proposto: `Condividi il rendering DOCX tra document_create e ricerca, con stili di titolo e livelli di struttura espliciti. Conserva fino a nove livelli di liste in HTML, testo, blocchi PDF e DOCX, mantenendo identiche le uscite piatte. Aggiungi prove ZIP e PDF reali; verifica 398 test e il rapporto su disco con 38 affermazioni.`

### Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

- **Cosa deve fare l'owner:** esaminare i sei file di codice/test elencati e aprire i DOCX per controllare navigazione e indice in Word; aggiornare il proprio backend con la propria procedura quando opportuno. Se il rapporto deve stare nella `.claude` alla radice del repository, copiarvi questa copia da `harness-ui/.claude`: la destinazione alla radice è fuori dall'area scrivibile di questa sessione.
- **Cosa faccio io:** consegno i file su disco, il rapporto, le prove ripetibili e i due DOCX; la cura autorizzata e i controlli automatici sono terminati. Non eseguo operazioni Git di pubblicazione né tocco il processo dell'owner.
- **Cosa rimane:** controllo visivo e interattivo in Word, eventuale collocazione del rapporto nella `.claude` di radice e pubblicazione decisa dall'owner. Nessuna modifica di codice BC35 necessaria fuori dai file autorizzati.
