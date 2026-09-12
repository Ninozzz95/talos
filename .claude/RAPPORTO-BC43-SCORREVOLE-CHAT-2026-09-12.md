# BC-43 — Scorrevole e colonna della chat

12 settembre 2026 · Astra (Codex) · sottosistema TALOS UI · ramo `lane/harness-desktop` verificato.
Rapporto nella `.claude/` di `harness-ui`: la directory omonima alla radice non è scrivibile in questa sessione. Nessuna operazione Git di scrittura autorizzata o eseguita.

## Ricerca prima del codice

Fonti consultate il **12/09/2026**, prima delle modifiche di comportamento:

- [W3C CSSOM View, versione 16/09/2025](https://www.w3.org/TR/2025/WD-cssom-view-1-20250916/): le API agiscono sul contenitore con una scrolling box; `scrollIntoView` può percorrere più antenati. `auto` dipende anche dal CSS, `instant` forza il movimento immediato.
- [W3C CSS Overflow 3](https://www.w3.org/TR/css-overflow/): `scroll-behavior` riguarda lo scorrimento programmato del contenitore.
- [WAI C39, aggiornata 12/01/2026](https://www.w3.org/WAI/WCAG21/Techniques/css/C39.html): rispettare la richiesta di movimento ridotto e verificarne la soppressione nelle interazioni.
- [Radix Scroll Area](https://www.radix-ui.com/primitives/docs/components/scroll-area) e [implementazione Themes](https://github.com/radix-ui/themes/blob/main/packages/radix-ui-themes/src/components/scroll-area.tsx): distinguono Root e Viewport; il riferimento pubblico è inoltrato al Viewport. Il riferimento esplicito al nodo che scorre è il modello da adattare qui.

Decisione upstream: **adozione diretta delle API native CSSOM View** (contratto fissato alla pubblicazione 2025-09-16), dietro il ponte AVM; **adattamento del principio Root/Viewport** di Radix, senza copiarne codice. Pacchetto React respinto per incompatibilità con il frontend DOM nativo e perché non serve una nuova scrollbar. Nessuna dipendenza aggiunta. Prove sul browser reale tramite `@playwright/test` **1.62.1**, build con `esbuild` **0.28.2**, già fissati nel lockfile. L'implementazione locale da riusare è `contenitoreCheScorre` di `cronologia.js`: il file è vietato e resta intatto.

## Registro esecutivo prima delle modifiche

Proprietà esclusiva, senza agenti delegati; nessuna cancellazione di file:

1. **Creare** `frontend/src/bridge/conversazione-dom.js`: esportare `colonnaConversazione(radice)` e `scorrevoleConversazione(colonna)`, riusando `contenitoreCheScorre` senza duplicarne il selettore.
2. **Modificare** `frontend/src/legacy/app.js`: mantenere le firme `scrollerConversazione`, `scorriInFondoConversazione`, `scorriAllaBollaAppesa`, `appendToolNote`; instradare il risolutore attraverso il ponte e rispettare movimento ridotto di sistema nelle chiamate di scroll della chat. I chiamanti che montano contenuti continuano a ricevere la colonna. Nessuna rinomina di id/classi.
3. **Modificare** `frontend/src/components/conversazione.js`: mantenere `collegaNavigazioneSpina(conversazione)`; separare il nodo dei contenuti dal root dell'IntersectionObserver; indirizzare il clic allo scorrevole e rispettare il movimento ridotto.
4. **Creare** `frontend/tests/unit/bc43-scorrevole-chat.test.mjs`: test permanenti BC43-01 risoluzione separata, BC43-02 autoscroll muove solo lo scorrevole, BC43-03 separatore sulla colonna, BC43-04 viewport della spina, BC43-05 clic sullo scorrevole, BC43-06 movimento ridotto. Il ROSSO atteso è il root sbagliato e lo scroll ancora animato quando il sistema lo vieta.
5. **Creare** `frontend/tests/parity/bc43-scorrevole-chat.spec.mjs`: misure reali prima/dopo, parità DOM, foto e regressioni browser.
6. **Creare** `frontend/tests/bc43/banco.mjs` e `frontend/tests/bc43/playwright.config.mjs`: banco esclusivo con output temporaneo, porta libera, nessun accesso alla 4174, chiusura dei server avviati.
7. **Creare/aggiornare** questo rapporto e gli allegati `foto-bc43-2026-09-12/prima-chiaro-1440x900.png`, `prima-scuro-1440x900.png`, `dopo-chiaro-1440x900.png`, `dopo-scuro-1440x900.png`, `misure-prima.json`, `misure-dopo.json`, `censimento-prima.txt`, `selettori-test.txt`, `test-rosso.txt`, `test-unitari.txt`, `test-browser-prima.txt`, `test-browser-dopo.txt`, `stato-banco.json`. Build e copie dei sorgenti di partenza restano nel Temp dedicato.

Comandi VERDI: test Node dedicato, poi `npm run test:unit`; build di produzione isolata; Playwright BC43 e `tests/parity/nessun-errore-a-runtime.spec.mjs`, senza cambiare quest'ultimo. Regressioni: cronologia, conversazione, separatore, BC41 e suite unitaria completa. Prova umana: stesso gesto, temi chiaro/scuro, 1440×900; aggiungere viewport stretto, ricaricamento, tastiera e movimento ridotto dove pertinenti. Gate upstream: DOM/CSSOM e osservatori nel browser reale, senza simulare la geometria. Nessuna nuova capacità agente, nessuna inferenza richiesta.

Rollback: rimuovere solo gli innesti BC43 nei file esistenti e i nuovi file BC43; confrontare con le copie temporanee iniziali. Non usare reset/revert e non ripristinare interi file se nel frattempo sono cambiati da altri.

## Censimento, prove e consegna

### Emendamento del banco, prima della cura

La build standard isolata fallisce nell'ambiente con `Cannot read directory ../../../../..: Access is denied` prima di risolvere gli entry point (anche con `tsconfigRaw`). Per non modificare script condivisi, il solo `tests/bc43/banco.mjs` userà gli hook ufficiali [esbuild onResolve/onLoad](https://esbuild.github.io/plugins/), consultati il 12/09/2026, per leggere gli stessi sorgenti tramite Node nel perimetro autorizzato. Restano gli entry point di produzione e gli asset originali; output temporaneo. Si registra separatamente il limite della build standard. Il banco usa `createHttpApp` e `createSessionRegistry` esistenti, in sola lettura del codice backend, con copia di uno store sintetico creato nel Temp, nessun provider. Funzioni di banco previste: `costruisci`, `avviaBanco`, `chiudi`; configurazione Playwright dedicata. I test possono importare i componenti veri tramite un entry point ausiliario servito solo dal banco.

**Esito:** corretto il root della spina, unificato l'accesso allo scorrevole e rispettato il movimento ridotto negli scorrimenti della chat toccati. Il separatore del contesto era già sulla colonna giusta. Autoscroll e ripristino avevano già la risalita allo scorrevole: sono compatibilità conservate, non riparazioni rivendicate da BC43.

### Emendamenti delle prove, senza allargare i file di prodotto

- Aggiunti lo scenario permanente **BC43-07** (nota attrezzo collegata/scollegata) e l'allegato `test-rosso-note.txt`. Le due prove sono state confrontate anche con la copia del sorgente originale, senza ripristinare il file di lavoro.
- Il banco iniziale ometteva `catalogoModelliFn`, producendo `GET /api/v1/models` 404. Collegato `createModelCatalog` esistente con trasporto finto dichiarato `{data:[]}`; nessun catalogo remoto o provider. `RUNTIME-01` è rimasto identico.
- Il test di reload scorreva prima della fine del ripristino: ora attende lo stato della colonna e lo scroll iniziale prima della rotella. Le preferenze del test sono installate solo nella finestra principale: le anteprime isolate non ricevono lo script che accede al localStorage. Questi sono aggiustamenti del banco, non difetti corretti nel prodotto.
- La preferenza di sistema è verificata con un'asserzione su `matchMedia` dopo `page.emulateMedia`: non basta dichiararla in configurazione. Le foto finali «prima» sono state rifatte con preferenza effettivamente attiva.
- Per rifare il «prima» dopo la cura, `BC43_RIUSA_BUILD=si` copia i bundle originali già congelati nel Temp. Non si altera il sorgente di lavoro. Nel banco la dicitura del modello è «Modello di prova», senza identificativi tecnici aggiunti a schermo.

## Censimento completo

Ricerca ricorsiva su **tutto `frontend/src/`**: `#conversation|\.conversation|['"]conversation['"]`. `rg` non è disponibile nel PATH; usato `Get-ChildItem -Recurse -File | Select-String`, con output integrale in [censimento-prima.txt](foto-bc43-2026-09-12/censimento-prima.txt). **64 righe** grezze, comprese assegnazioni, CSS, commenti e un falso positivo dello spread JavaScript. Nessun `getElementById('conversation')` o `querySelector('#conversation')` aggiuntivo nascosto negli altri componenti del sorgente iniziale: i componenti ricevono il nodo dal chiamante.

Le righe sotto sono quelle **del sorgente iniziale**, non quelle spostate dall'import nuovo. **C** = `.talos-conversation__column#conversation`; **S** = `.talos-conversation.conversation`. Sul banco a 1440×900: C ha `clientHeight=2841`, S `clientHeight=700`; il fondo di S è `2161`, `C.scrollTop` resta **0**. Nel campione con 12 turni C è alta **4308**, S sempre **700**. Questo prova la distinzione fisica usata per classificare tutti i risolutori; la lettura delle operazioni successive determina ciò che ciascuno si aspetta. Non equivale ad aver eseguito ogni ramo applicativo della tabella.

### Le 33 risoluzioni operative in `legacy/app.js`

| Riga iniziale / chiamante | Si aspetta | Riceve prima | Sbagliato? Prova e decisione |
|---|---|---|---|
| 425 `chatConversation = $('.conversation')` | S per gli header legati allo scroll | S | No: selettore di classe corretto. Ora passa dal ponte comune. |
| 702 default di `scrollerConversazione` | C come ingresso, S come risultato | C → S tramite `closest` | No: già corretto dal 06/09. Tolta la seconda implementazione della risalita. |
| 728 `scrollStreamingOutput` | C per contenuti/coda, S per geometria | C → S a riga 734 | No: scrive già `scroller.scrollTop`. Test BC43-02 conserva il percorso comune della bolla. Streaming del modello non provato qui. |
| 759 `collegaSeguiFondoConversazione` | C per messaggi, S per listener e resize | C → S a riga 761 | No: `scroll` e ResizeObserver sono già su S. |
| 1136 `markMotionEnter` | C per `is-restoring` e `contains` | C | No: controlla lo stato dei messaggi, non una viewport. |
| 1286 `scorriAllaBollaAppesa` | C per ripristino, S per scorrere | C → S a riga 1321 | No scambio di nodo; BC43-02 cambia solo lo scroll di S. Corretta a valle la preferenza di movimento. |
| 1439 badge demo di `.chat-view` | S per anteporre il badge esterno ai messaggi | S con `.conversation` | No: il CSS richiede proprio `.conversation > .demo-surface-badge`; ramo demo non attivato sul banco. |
| 8932 `fondoConversazioneInVista` | C per `paddingBottom`; S è già risolta prima | C | No: il padding è della colonna. Il ritorno in fondo funziona nei due temi e dopo reload. |
| 9001 `giriPerInspector` | C per elencare i turni | C | No: cerca contenuti. Gli indici sono presenti nelle foto. |
| 9483 metadati del giro utente | Discendenti di C | Span dentro C, se corrispondono al selettore | No errore C/S: non legge scroll. Non verificata qui la corrispondenza dei metadati legacy ai nuovi messaggi. |
| 9502 `turnoTalosCorrente` | C per ultimo turno e append | C | No: il replay reale disegna il messaggio in C. |
| 9522 `nellaChat` | C per append dei turni | C | No: contenuti restano figli della colonna. |
| 9554 `segnaGiroNellaSpine` | C per ultimo turno | C | No: operazione sui contenuti. |
| 9564 `aggiornaTickGiro` | C per ultimo turno | C | No: non misura viewport; la cura BC41 rimane intatta. |
| 9600 `appendRealTaskStart` | Riferimento legacy non più usato | C, poi `void conversation` | Nessun effetto: il montaggio passa da `nellaChat`, lo scroll da `scorriAllaBollaAppesa`. |
| 10325 `appendToolNote` | C per `is-restoring` | C | Il selettore è corretto. Il successivo `scrollIntoView` non delimita gli antenati e ignora la preferenza di sistema: sostituito da scroll diretto di S. BC43-07 prova anche il nodo scollegato. |
| 14265 `handleRealEvent` → `aggiornaSeparatoreContesto` | **C per append/deduplicazione** | **C** | **No.** Il componente non legge scrollTop/scrollHeight e non scorre. Misurati 1 separatore per 2 eventi uguali, figlio di C. Ora il nome del getter rende esplicita la scelta. |
| 14997 `RunFinished` → `spegniGiriInCorso` | C per i tick | C | No: firma e testo richiesti dai test BC41 conservati. |
| 15093 `RunError` → `spegniGiriInCorso` | C per i tick | C | No: stessa compatibilità BC41. |
| 15190 azzera avanzamento del contesto | C per rimuovere la riga | C | No: `context-progress.js` cerca e rimuove contenuti, non scorre. |
| 15211 nuova generazione, `replaceChildren` | C | C | No: svuota i messaggi e conserva il contenitore esterno. |
| 15212 nuova generazione, `is-restoring` | C | C | No: stato sulla colonna. |
| 15213 nuova generazione, coda | C per vedere se ha messaggi | C → S dentro `aggiornaSpazioCodaConversazione` | No: la geometria è già letta su S. |
| 15587 `aggiornaContestoChat` | C per avanzamento | C | No: inserimento della riga di stato. |
| 15601 errore del monitor del contesto | C per stato non aggiornato | C | No: aggiornamento contenuti, non viewport. |
| 15859 `mantieniFondoDuranteRipristino` | C per stato/mutazioni, S per scroll | C → S a righe 15875 e 15914 | No: il reload dello store copiato e la navigazione stretta passano. |
| 15989 riclic della sessione corrente | C per coda, S per fondo | C → S a riga 15991 | No: il codice aveva già lo scroll diretto su S. |
| 16012 `passaASessione`, `is-restoring` | C | C | No: la classe descrive il ripristino dei messaggi. |
| 17894 `montaStatoVuoto` | C per sostituire contenuti, S per classe esterna | C e suo antenato | No: due operazioni distinte, entrambe sul nodo pertinente. Stato vuoto non fotografato. |
| 17912 `smontaStatoVuoto` | C e S per le rispettive classi | C e suo antenato | No: non è uno scroll. |
| 20430 ascoltatore del piede | S | C → S prima di aggiungere il listener | No: il bottone di ritorno compare con la rotella e funziona anche da tastiera. |
| 20439 `collegaNavigazioneSpina` | C per contenuti, **S per viewport** | **C usata anche come root dell'IntersectionObserver** | **Sì:** 12/12 turni dichiarati visibili con 4308 px di colonna in 700 px di viewport. Dopo: **2/12**. Corretta la separazione nel componente. |
| 20440 `collegaCronologia` | C per contenuti, S per scroll-spy | C → S dentro `contenitoreCheScorre` | No: è la cura BC08 già presente, riusata senza modificare il file vietato. |

### Ponte, componenti e CSS

| Punto iniziale | Aspettativa / nodo effettivo | Esito |
|---|---|---|
| `bridge/legacy-dom.js:154` | Assegna la classe `conversation` a S | Corretto e invariato. |
| `bridge/legacy-dom.js:155` | Assegna l'id `conversation` a C | Corretto e invariato; rinominarlo romperebbe i chiamanti dei contenuti. |
| `components/conversazione.js:95,98–123` | Documentava C come «contenitore che scorre», poi osservava C | Commento corretto e root passato a S; MutationObserver e click delegato restano su C. Clic di prova: **S.scrollTop=2278**, C, pannello esterno e pagina **0**. |
| `components/cronologia.js:255,269` | Il commento cita `#conversation`; la funzione risale a S | Già corretto, file vietato lasciato intatto. È la funzione riusata dal ponte. |
| `styles/aspetto.css:303` | Sfondo della colonna `#conversation` | C, corretto: superficie di lettura. |
| `styles/aspetto.css:441` | `#schermoChat:has(#conversation > *)::before` | Verifica contenuti di C, corretto. |
| `styles/aspetto.css:442` | Stessa condizione su `::after` | Verifica contenuti di C, corretto. |
| `styles/aspetto.css:482` | `#conversation .motion-enter` | Discendenti di C, corretto. |
| `styles/aspetto.css:486` | Movimento messaggi disabilitato su C | Discendenti di C, corretto. |
| `styles/aspetto.css:487` | Movimento interfaccia disabilitato su C | Discendenti di C, corretto. |
| `styles/foglio-monolite.css:273` | `.chat-view .conversation > .demo-surface-badge` | Figlio di S, coerente con `app.js:1439`; non modificato. |

Le altre righe grezze sono commenti: `app.js:684,696,748,1277,1295,1297,1311,2235,10110,10283,15131,15135,17944,20423`; `aspetto.css:228,342,374,394,434`. Sono incluse nell'allegato, ma non risolvono nodi. `app.js:9525` contiene lo spread `[...conversation.querySelectorAll(...)]`: è un falso positivo lessicale, non un selettore `.conversation`. Le due citazioni dei componenti sono spiegate nella tabella.

### Verifica dei test esistenti prima della scelta

[selettori-test.txt](foto-bc43-2026-09-12/selettori-test.txt) conserva **60 righe** della ricerca nei test. Fra queste: `baseline-shell.spec.mjs` legge/svuota C, `context-compactor.spec.mjs:137,152` conta i separatori in C, `aspetto-non-rende-illeggibile.spec.mjs:199,209` distingue C e il suo antenato; `bc41-giri-in-corso.test.mjs:145,147` verifica esattamente le chiamate `spegniGiriInCorso($('#conversation'))`. Nessuno di questi test è stato modificato. `legacy-dom.js` e `index.template.html` hanno **diff vuoto**.

## Cure riga per riga

Le righe «dopo» sono quelle della consegna; gli spostamenti delle altre righe derivano dai soli innesti descritti.

| File e riga dopo | Prima → dopo | Natura della modifica / prova |
|---|---|---|
| `bridge/conversazione-dom.js:8` | Selettore implicito → `colonnaConversazione(radice)` | Un getter nominato, compatibile con ROOT incorporata e assenza del nodo. |
| `bridge/conversazione-dom.js:13` | Due risalite identiche → `scorrevoleConversazione(colonna)` che chiama `contenitoreCheScorre` | Nessun nuovo selettore di antenato; conserva il vecchio DOM a nodo unico. |
| `legacy/app.js:1,426` | `.conversation` diretto → getter di S passando C/ROOT | Centralizzazione di un chiamante già corretto. |
| `legacy/app.js:703` | Implementazione locale di `closest` → adattatore del getter comune | Conserva il simbolo `scrollerConversazione` e tutti i suoi chiamanti. |
| `legacy/app.js:1333–1334` | Solo classe dell'app, `auto` → sistema o app, `instant` | “Torna in fondo” con movimento ridotto: **0 → 2161** subito, su S. In assenza di preferenza conserva `smooth`. |
| `legacy/app.js:10329–10334` | `article.scrollIntoView` → `scorrevole.scrollTo` | Allinea il fondo dell'elemento alla viewport della chat, include il bordo superiore, evita gli altri antenati e ignora un elemento scollegato. Movimento ridotto anche qui. |
| `legacy/app.js:14271` | `$('#conversation')` → `colonnaConversazione(ROOT())` per il separatore | Nome esplicito; non è una correzione del comportamento del separatore. |
| `legacy/app.js:20445` | `$('#conversation')` → getter di C per la spina | Contratto del contenitore dei messaggi espresso per nome. |
| `components/conversazione.js:97,105` | Documentazione ambigua → C dichiarata, S risolta separatamente | Nessun cambio di firma del componente. |
| `components/conversazione.js:111–115` | `scrollIntoView(auto/smooth)` → `S.scrollTo(instant/smooth)` | Movimento di S soltanto: prova browser a **2278 px**, esterni e C fermi. |
| `components/conversazione.js:124` | `IntersectionObserver.root=C` → `root=S` | Visibilità dei turni **12/12 → 2/12** sul medesimo campione. |

## Verifiche e numeri

Node **24.18.0**, Chrome **153.0.8010.37**, Playwright **1.62.1**. Nessun pacchetto installato o aggiornato. Comandi eseguiti con prefisso RTK; `npm.cmd` è il launcher Windows dello stesso `npm run test:unit`, perché `npm.ps1` è bloccato dalla policy PowerShell.

| Verifica | Esito fresco |
|---|---|
| ROSSO iniziale `node --test frontend/tests/unit/bc43-scorrevole-chat.test.mjs` | **9 test: 2 verdi, 7 rossi**. Due errori per API nuova ancora assente; root errato, due clic che non rispettano il contratto di scroll diretto nel doppio di test e due preferenze di movimento non rispettate. |
| BC43-07 eseguito sulla copia iniziale di `app.js` | **2/2 rossi**, allegato `test-rosso-note.txt`; nessun ripristino del worktree. È una prova unitaria con geometria controllata, non una misura browser del vecchio `scrollIntoView`. |
| Unitarie BC43 definitive | **11/11 verdi**; incluse nella suite completa. |
| `npm.cmd run test:unit` in `frontend` | **997 totali, 994 verdi, 3 rossi**, 0 saltati, **4985,79 ms** riportati dal runner. |
| Build del banco con esbuild e lettura Node | **32 file** fra output e asset; dopo **332,9595 ms**, tempo misurato nel banco. Non è una build standard dichiarata verde. |
| Playwright sul bundle iniziale congelato | **6 test: 3 verdi, 3 rossi attesi**: due temi del ritorno immediato e viewport della spina. Runtime, rete e reload verdi. |
| Playwright sulla cura | **6/6 verdi**, **17,7 s** del runner, uscita processo **0**. Comprende `RUNTIME-01` originale, i due temi, viewport/clic, reload a 390×844 con Invio, diagnostica rete. |
| `git diff --check` sull'intero worktree e controllo degli spazi dei nuovi file BC43 | Verde. |

I tre rossi della suite completa sono **PHASE1-BUILD-PARALLEL-01**, **PHASE1-GRAPH-ISOLATION-01**, **PHASE1-ASSET-ALLOWLIST-01**: tutti si fermano in esbuild con `Cannot read directory "../../../../..": Access is denied` e gli entry point non risolti. Lo stesso blocco è stato riprodotto **prima della cura** nella build standard. Non sono state modificate o indebolite queste prove; la suite completa **non è tutta verde** in questo ambiente. Log integrale in [test-unitari.txt](foto-bc43-2026-09-12/test-unitari.txt).

Gli errori residui del banco sono i **503 dichiarati** di provider non configurato e Context Manager non attivo, registrati in `misure-dopo.json`: nessun errore JavaScript. Il cancello originale tollera già i 503; BC43 non ne ha cambiato il filtro. Il 404 del catalogo visto nel primo giro era un'omissione del banco, risolta configurando il servizio esistente.

## Foto e misure

Quattro foto, **1440×900**, verificate visivamente nei due temi. Stesso gesto sul bottone di ritorno dopo aver risalito la chat, con `prefers-reduced-motion: reduce` verificato e preferenza interna disattivata. Il «prima» fotografa lo scorrimento ancora animato; il «dopo» mostra già gli ultimi passaggi. **Non dimostra che prima il bottone non arrivasse mai al fondo**: il difetto è il movimento non soppresso. La misura immediata è eseguita nella stessa chiamata del clic, la foto segue senza un ritardo artificiale.

| Tema | Prima | Dopo |
|---|---|---|
| Chiaro | [prima-chiaro-1440x900.png](foto-bc43-2026-09-12/prima-chiaro-1440x900.png) | [dopo-chiaro-1440x900.png](foto-bc43-2026-09-12/dopo-chiaro-1440x900.png) |
| Scuro | [prima-scuro-1440x900.png](foto-bc43-2026-09-12/prima-scuro-1440x900.png) | [dopo-scuro-1440x900.png](foto-bc43-2026-09-12/dopo-scuro-1440x900.png) |

[Misure prima](foto-bc43-2026-09-12/misure-prima.json) · [Misure dopo](foto-bc43-2026-09-12/misure-dopo.json). In entrambi i temi: scroll immediato **0 → 2161**; colonna **0 → 0**; geometria identica **2841/700**. Nessun CSS, template, testo o durata di prodotto aggiunti. “Modello di prova” identifica i dati sintetici.

## File lasciati su disco

File di prodotto modificati: `frontend/src/legacy/app.js`, `frontend/src/components/conversazione.js`.

File nuovi: `frontend/src/bridge/conversazione-dom.js`, `frontend/tests/unit/bc43-scorrevole-chat.test.mjs`, `frontend/tests/parity/bc43-scorrevole-chat.spec.mjs`, `frontend/tests/bc43/banco.mjs`, `frontend/tests/bc43/playwright.config.mjs`, questo rapporto e i **14 allegati** nella directory foto: le 4 PNG, i 2 JSON di misure, `censimento-prima.txt`, `selettori-test.txt`, `test-rosso.txt`, `test-rosso-note.txt`, `test-unitari.txt`, `test-browser-prima.txt`, `test-browser-dopo.txt`, `stato-banco.json`.

`legacy-dom.js`, `cronologia.js`, `ricerca*.js`, `fonti-modelli.js`, `index.template.html`, backend e altri sottosistemi non sono stati modificati da BC43. Nessuna operazione Git di staging, commit o push. Le modifiche preesistenti degli altri lavori non sono state ripristinate.

Durante la consegna il rapporto provvisorio e gli allegati sono comparsi nella `.claude/` alla radice e non erano più nel percorso locale: **nessun comando di questa sessione li ha spostati**. Li ho ricopiati nel percorso scrivibile `harness-ui/.claude/` per completare questa versione, senza cancellare o sovrascrivere la copia alla radice. La versione finale di riferimento è **questa in `harness-ui/.claude/`**.

## Cosa non è stato verificato

- Nessuna apertura o richiesta alla **porta 4174**, nessuna sessione reale dell'owner, nessuna inferenza o invio a provider.
- Nessun giro di chat con modello, allegati, approvazioni o attrezzi reali. Le conversazioni sono sintetiche, ma passano dal registro, dal replay SSE e dal render di produzione. La nota attrezzo è coperta da test unitari, non da una prova end-to-end con tool reale.
- Non eseguita l'intera suite Playwright, né una suite di backend/control-plane/mobile: il lavoro è nel frontend desktop. Il viewport stretto verifica il frontend desktop, non l'app `mobile/`.
- Non eseguite tutte le interazioni dei singoli chiamanti corretti censiti. La classificazione C/S combina identità misurata e lettura del codice; le prove vive nominate sopra sono il perimetro verificato.
- Il movimento senza preferenza ridotta è verificato nel contratto unitario (`smooth` conservato), non fotografato. I tick della vecchia spina sono nascosti nel layout desktop corrente: ne sono provati geometria e clic programmatico, non una nuova interazione visibile aggiunta alla UI.
- Nessun risultato positivo dichiarato per la build standard e i tre contratti bloccati dai permessi dell'ambiente. I sorgenti passano la build alternativa del banco e il runtime browser.

## Proposta di testo di commit

```text
fix(chat): distingue colonna e scorrevole e rispetta il movimento ridotto

BC-43: espone colonnaConversazione e scorrevoleConversazione dal ponte,
riusando il risolutore della cronologia senza rinominare id o classi.
La spina osserva la viewport reale; clic e note attrezzo scorrono solo
la chat. Il ritorno in fondo rispetta anche la preferenza di sistema.
Il separatore resta sulla colonna, dove già funzionava.

Prove: 11 test BC43 verdi; browser 6/6 sul banco isolato, incluso
RUNTIME-01; foto chiaro/scuro 1440x900. Suite completa 994/997:
tre contratti build bloccati da Access is denied di esbuild.
```

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** leggere questa versione locale del rapporto e le quattro foto; rieseguire i tre contratti di build in un ambiente con i permessi necessari prima di considerare tutti i gate verdi. Gestire autonomamente l'eventuale commit. Nessun consenso aggiuntivo richiesto per le modifiche già consegnate.

**Cosa faccio io:** lascio i file elencati, la prova del difetto e i risultati. **Server BC43 chiusi**: porte finali **56648** (prima) e **59643** (dopo), entrambe verificate senza listener dopo la chiusura; nessun intervento sui server degli altri lavori. Anche le istanze precedenti del banco sono state fermate. Lo stato finale è registrato in `stato-banco.json`.

**Cosa rimane:** i tre gate di build bloccati dall'ambiente e le verifiche escluse sopra. Non resta una cura pendente del separatore: quel chiamante era già corretto. La `.claude/` alla radice può contenere una copia provvisoria spostata durante il lavoro; la consegna completa è in `harness-ui/.claude/`.
