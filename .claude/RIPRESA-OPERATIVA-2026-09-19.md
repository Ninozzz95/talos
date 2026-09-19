# Ripresa operativa TALOS Desktop — 19 settembre 2026

Piano autorizzato dall'owner nella conversazione di ripresa. Responsabile unico: Codex; nessuna delega, commit, push o pubblicazione. Le revisioni avversariali dello stesso autore saranno dichiarate come tali. Nessuna spunta storica prova il comportamento attuale.

## Baseline di provenienza

- Worktree: `C:/Users/Antonino/Desktop/projects/AVM-harness-desktop`, ramo `lane/harness-desktop`.
- HEAD iniziale: `a89be85374acf3a83b767b61e3ee44589f40f4a6`; release `desktop-v0.1.13`: `a898162feff3ed8ad4cb0586344fe9d9e390d1a5`.
- Base pubblica delle PR: `13f65c15cdeaf8986b882993a0773cdeafb867d2`. Non equivale automaticamente alla release.
- Numerosi file non tracciati preesistenti: preservare. Nessun file tracciato modificato all'ingresso.
- La 4174 risponde health 200 e serve un app.js identico a public/app.js. Nessuna prova visiva o mutante eseguita.
- Monogrammi già presenti; CSS originale della pagina modello (978 byte) conservato. Il montaggio in app.js omette apiPost; il clic HF apre ancora l'aside.

## Accorpamento richiesto dall’owner

Dal 19/09: due lotti operativi, **Model Lab** e **sidebar Agenti con grafo**. Ogni lotto comprende implementazione, revisione avversariale dello stesso autore, prove integrate e aggiornamento 4174 con backup. Non si ripetono gate già validi per sorgenti invariati. Gli altri requisiti R0–R5 e della roadmap restano aperti e nominativi, senza moltiplicare consegne o chiedere approvazioni intermedie.

## Sequenza e cancelli

| Lotto | Lavoro e criterio di uscita | Stato |
|---|---|---|
| R0 | Provenienza, isolamento di tutti gli archivi e credenziali, rapporti immutabili per esecuzione, baseline completa con fallimenti nominativi e cause provate | Banco isolato creato e verificato; attribuzione della baseline aperta |
| R1 | Matrice requisito → release → sorgente corrente → ingresso UI → API/effetto → persistenza → prova → verdetto; censimento PR 1–36, dettaglio 23–36 e archivi 27–33; equivalenze BC76/#29 e rami non antenati | In corso; nessuna parità generale dichiarata |
| R2 | Pagina HF e download, navigazione e rientro, CSS e layout, provider, download/installati, sistema e README; ogni perdita diventa regressione permanente | Ingresso lista, writer, coda, revisione, filtri/reload e scala verificati; rimossi quattro riepiloghi su richiesta owner; scarti visivi in correzione |
| R3 | Parità di tutte le viste e stati: chiaro/scuro 1024×800 e 1440×900; anche scuro 1920×1080 e 2560×1440; geometria e screenshot ispezionati | Confronto HF 14 immagini eseguito; differenze registrate, parità generale aperta |
| R4 | Sidebar sinistra: feed, controller e rendering #32 con confronto a tre versioni. Destra: verifica File/dettaglio agente, completamento Agenti/Contesto/Processi/Review/grafo reale | Grafo/lista/dettaglio integrati e provati su banco; PR32 e orchestrazione reale aperti |
| R5 | Suite interessate complete, Electron isolato, percorsi reali locale/provider/strumenti, candidato con prove e impedimenti; 4174 solo dopo insieme coerente verificato e ripristino pronto | Da eseguire; non rilasciabile |

Superfici R1 obbligatorie: chat, composer, terminale, browser, impostazioni, laboratorio, due sidebar, inspector, file, agenti, ricerca, strumenti, esportazione, guscio Electron. Verdetti ammessi: presente verificata; presente irraggiungibile; raggiungibile non funzionante; persa; nuova incompleta; rimossa per decisione documentata; non verificata. L'assenza di prova non è una rimozione autorizzata.

R2 conserva `#/impostazioni/modelli/scheda/<id>/<card|files|compatibility>`, `hf:<repo>`, revisione risolta, payload download e API esistenti. Ordine: writer e selettore prima del clic lista; poi identità/variante/revisione/filtri con ricarica, cronologia e cambi rapidi. Nessun allargamento del proxy immagini nel lotto. Preferiti, confronto, viste salvate, banco prova e scelta modello nuova chat restano lotti da completare.

R3 modifica l'app, mai il mockup. Eccezioni approvate: carte TALOS, peso effettivo 600, dati monospaziati, nomi owner, descrizioni del comportamento reale. Gli 8 px della coda vanno prima misurati.

R4 conserva `talos.sidebar.v1`, snapshot/delta, riconnessione/stale, gerarchia, selezione/menu/pin e identità stabile; contatori e ripresa tra finestre. #33 su 4178 rimane demo: fixture non provano il prodotto. Grafo centrale raggiungibile da lista e dettaglio agenti.

## Disciplina delle prove

Prima di ogni modifica: ledger con file esatti, simboli, contratti, RED, GREEN, regressioni, ricerca primaria corrente, pin e rollback. Nessun generico elenco di directory autorizza ulteriori modifiche. Mutazioni solo in copie isolate con baseline verde, rottura mirata, errore pertinente e ripristino verificato per hash.

La 4174 ammette letture controllate: prima di navigare installare intercettazione e conteggio di ogni richiesta non-GET e bloccare WebSocket. Se il browser scelto non offre tale controllo, non navigare la 4174 con quel browser. Nessun riavvio durante attività owner.

Ogni run conserva ID, commit, configurazione senza segreti, manifest/hash, inventario test, rapporto JSON, errori, trace e screenshot disponibili; indicare esplicitamente artefatti assenti. Cause: prodotto, test obsoleto, ambiente, instabilità, ignota. «Preesistente» richiede confronto riproducibile.

Scenari permanenti minimi: RIPRESA-HF-DOWNLOAD (deve fallire rimuovendo apiPost), RIPRESA-HF-RIENTRO, RIPRESA-HF-LAYOUT, RIPRESA-MODEL-LOCKED, RIPRESA-PARITA-RELEASE. Cancelli: unit frontend, spec interessate, _fase2-niente-perso, browser completo a un worker, parità componenti; backend/kernel se coinvolti, Electron e upstream reali per chiusura.

La roadmap globale è distinta e immediata: [ROADMAP-GLOBALE-RIPRESA-2026-09-19.md](ROADMAP-GLOBALE-RIPRESA-2026-09-19.md). Non deve attendere R5.

## Riscontri successivi alla baseline iniziale

- Browser completo `817a21a9`: 626 test, 555 passati, 46 falliti (uno per timeout), 25 saltati. Tre spec escluse con motivazione esplicita. Registro nominativo immutabile in `ripresa-2026-09-19/baseline-817a21a9.json`; cause ancora da attribuire individualmente.
- Backend completo `4de04fbe`: 3881 test, 3872 passati, 1 fallito, 8 saltati. Il fallimento browser-vivo dipendeva dall'omissione di ProgramFiles nell'ambiente isolato: RED del banco, correzione e 20/20 mirati in `515ca520`. Non sostituisce un nuovo giro completo.
- Frontend unit `f9c7c2fe`: 1426/1426, build presente. Browser HF `a067744f`: 8/8, comprese le due geometrie a 1024 e scala 130%. Screenshot visti separatamente; la parte inferiore scorrevole richiede ulteriori immagini.
- Il test `_fase2-niente-perso` eseguito sulla release in `cde32441` usa un master successivo alla release: i suoi mancanti non sono automaticamente regressioni rispetto alla release. Nessuna asserzione indebolita.
- SEC23: difetto di restringimento ambiente riprodotto e corretto, mutazione isolata GREEN/RED/GREEN documentata nel ledger specifico. PR29 e BC76 non equivalenti: confronto separato in `ripresa-2026-09-19/CONFRONTO-PR29-BC76.md`.

### Banco owner 4174

L'owner ha richiesto di tenerlo attivo e aggiornato dopo ogni lotto verificato. Il controllo del 19/09 alle 13:03 UTC lo ha trovato già spento (nessun listener, connessione rifiutata). Consegnato lo snapshot frontend `f9c7c2fe`, uguale per hash a 316 file di produzione/build correnti; riavviato Node con adapter desktop canonico, 19 sessioni ripristinate. Health 200 e 20 asset HTTP identici alla build. L'HTML include la trasformazione CSP con nonce del server. Backup, log distinti, PID e hash: `ripresa-2026-09-19/live-4174-20260919T130331Z-652a5ad1`.

Resta aperto `RIPRESA-RUNTIME-CATALOGO`: all'avvio il runtime non espone il catalogo task richiesto. Health verde non certifica i percorsi agente. L'errore AttachConsole nei vecchi log è un indizio non ancora attribuito alla causa dell'arresto. Nuove prove mutanti continuano sul banco isolato, non sulle sessioni owner.

## Aggiornamento 14:20 UTC
4174 attiva senza riavvio, ultimo bundle verificato 49fffdb5 (1431 unit verdi). Grafo: 9/9 b8d400c5; pagina HF: 31/31 241a753c. Backup antecedente consegna nella cartella delivery del 14:17, verifica conclusa delivery-2026-09-19T14-18-15-925Z-3d641b21. Il primo controllo HTTP con query aggiunta è stato respinto 400 dal server; rimosso il parametro di test e verificati gli asset su rotte canoniche. Nessun problema di bundle: gli hash del disco e HTTP coincidono. Non utilizzare la verifica successiva a zero modifiche come backup precedente alla consegna: il backup precedente è nella prima cartella delivery.

## Aggiornamento 15:58 UTC — distinguere UI consegnata e backend ancora caricato
Frontend `9f961f50`: build + 1441/1441 unit GREEN. Consegnato senza riavvio in `delivery-2026-09-19T15-52-00-503Z-94ce269a`: 207 sorgenti ricontrollati, 14 asset HTTP identici, backup public antecedente presente. App SHA256 `907493c2456c0faa3cac44f084bd7ae551fe6a3896b626611a39f534c95c9b04`. 4174 risponde health200.

Grafo: ripresi dal mockup punti/badge stato, minimappa, file affiancato e timeline (osservazione reale dall'apertura, non replay persistente). Metriche reali con copertura; aria/reduced-motion e arco delega sempre continuo anche animato. Prove browser: 160 pass/1skip lotto ModelLab+grafo+colonna (0c28d1b2), 70/70 grafo+coda+redirect (143f05ce), 1/1 semantica arco e pixel animati (a7f4b423). Backend nuovo revisionato; secondo giro completo 5ede85e0: 3891pass, 1failure di teardown ricerca, 8skip. Correzione fixture in corso prima del giro finale.

**RIPRESA-ATTIVAZIONE-BACKEND-4174 aperto:** revisione automatica autorizzazioni ha rifiutato la creazione dello script di riavvio controllato (`blocked by policy`), senza motivazione specifica. Lo script non è stato eseguito e il processo7696 non è stato fermato. Il runtime caricato resta precedente: metadati/pagine HF e nuovo trasporto agenti/non-blocco del padre NON sono dichiarati attivi sulla4174. Prima di riprendere l'attivazione servono gate backend finale verde, ricontrollo sessioni/download/terminali attivi e conferma identità del listener. Inventario letto in questo passaggio:24sessioni,0attive,2download ready,0terminali,0automazioni. Non assumere questi conteggi ancora validi al prossimo intervento.

Confronto visivo realmente eseguito dopo consegna, originali immutati:
- `grafo-live-2026-09-19T15-55-35-899Z-f4392adf`: 6foto (1024/1440/2560), nessun pageerror né overflow contenitore. Il giro27362698 aveva un errore del SOLO script init che tentava localStorage in iframe sandbox: script corretto per agire solo nel top frame; foto precedenti conservate.
- `confronto-live-2026-09-19T15-52-21-535Z-93bd2faa`: 14foto, 1024/1440 chiaro+scuro,1920/2560/3840 scuro; sidebar sempre presente, pagina≤1260, README960 a1440 e1030 sui grandi,0pageerror. Ispezionate individualmente.
- `confronto-live-2026-09-19T15-56-12-621Z-53cc7b53`: 4foto aggiuntive1440scuro, ritorno al Lab con risultati realmente caricati e quattro riepiloghi rimossi. Il giro precedente3e2ed117 fotografava il caricamento; conservato, non usato come prova catalogo caricato.

Differenze ancora aperte rispetto al mockup: shell/sidebar impostazioni, preferiti/confronto/viste salvate/banco prova/modello nuove chat; ambito esecuzione, replay persistente e archi messaggi/dipendenze del grafo rimangono in G5. Non dichiarata parità integrale né candidata rilasciabile. Nessun commit/push/tag.

### Backend finale 1eabbc53 — 16:02 UTC
Suite completa fresca: **3899 test,3891 passati,0 falliti,8 skip**. Correzioni dei test di contratto e teardown confermate nell'insieme. Rapporto con nomi di tutti gli skip: `ripresa-2026-09-19/backend-finale-1eabbc53.json`. Skip riguardano upstream RTK non installato al pin, due fixture GGUF assenti nel banco, symlink Windows EPERM, tre corpus GET pubblici assenti e store sessione lunga assente. Nessuno skip vale come gate superato. Resta aperta attivazione backend4174 per blocco automatico già descritto; nessun riavvio effettuato.


### Verifica finale — tooltip titoli grafo, 19/09/2026 16:04 UTC

- Scenario permanente `RIPRESA-GRAFO-TITOLO-SENZA-TOOLTIP`: RED effettivo `2026-09-19T16-01-49-059Z-browser-3256ae7a`, GREEN `2026-09-19T16-02-34-320Z-browser-32b27909` (1/1, build riuscita), unit grafo 10/10. Il primo controllo sul solo attributo title non era sufficiente: il tooltip condiviso migra il contenuto in data-tip; la regressione verifica entrambi e la mancata apertura di talosTip dopo hover.
- Il titolo conserva aria-label e apertura del dettaglio. Rimossi title e data-tip dal titolo del nodo.
- Asset aggiornati senza riavvio: `delivery-2026-09-19T16-03-43-375Z-2f796b1c`; snapshot di 207 sorgenti verificato, 14 asset HTTP corrispondenti, health 200, backup conservato.
- Confronto finale: `.claude/ripresa-2026-09-19/grafo-live-2026-09-19T16-03-44-709Z-4031299e/confronto.html` e `report.json`. Sei screenshot ispezionati individualmente, mockup e 4174 a 1024x800, 1440x900 e 2560x1440. Zero errori, overflow, richieste mutanti o WebSocket; mockup invariato. Hover verificato prima degli screenshot del prodotto. Contenuti differenti: fixture nel mockup, sessione reale nel prodotto; nessuna dichiarazione di parità completa.
- Il backend aggiornato resta da attivare: il controllo automatico ha rifiutato la creazione dello script di riavvio controllato con il messaggio generico blocked by policy. Nessun riavvio eseguito, nessun aggiramento. Le nuove funzioni backend non sono dichiarate operative sulla 4174.
