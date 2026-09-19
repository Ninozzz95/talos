# Roadmap globale di ripresa — 19 settembre 2026

## Stato gate 2026-09-19T22:35Z

Checkpoint remoto: commit `904244abd5efb03962095d2fb32d2003dfb30f42` pushato su `talos-private/lane/harness-desktop`.

- La regressione percepita durante la rotella è stata ricondotta al solo listener del tasto ritorno: eliminate le letture di layout sul percorso pixel, mantenuti click e scroll. Wheel focused, `scroll-p0` e `chat-lunga-p0` verdi.
- Electron isolato e backend aggiornato verdi; il server 4174 è ancora PID 19300, health 200, bundle `app.js` live aggiornato senza riavvio. Evidenza e backup in `.claude/release-2026-09-19/public-scroll-stream-update.json`.
- R0 resta aperto: la baseline browser completa 711/648/46/17 è storica rispetto agli ultimi test e va rieseguita/classificata. R5 resta aperto per installer, credenziali provider reali e advisory HIGH transitive.
- Prossimo ordine operativo: (1) classificare i 46 fallimenti con un full browser aggiornato; (2) chiudere i percorsi reali D-LAB-03/RUN-560B; (3) ripetere parità mockup testa-a-testa; (4) soltanto dopo comporre il manifest candidato.
- Full browser aggiornato concluso `2026-09-19T22-35-37-174Z-browser-361dcb2d`: 658 pass, 37 fail, 3 skip, 14 non eseguiti. Il primo passo della coda ora è classificare questi 37 fallimenti nominativi e recuperare i 14 casi non eseguiti; il fix wheel/streaming non è tra i fallimenti.

## Preparazione rilascio in corso — 2026-09-19T21:40:30.278989+00:00

Richiesta owner: fare tutto il necessario per il rilascio. HEAD143145103a59dfb8f8411e7cea8610d98bfd0c2c salvato sul privato. Nessun tag. Questo riquadro prevale sui conteggi storici sotto.
- Backend completo nuovo:3916test,3900pass,3fail,13skip (fbbc97a8). Classificazione cleanup replay corretta e focused verde(cb027bd5). I due fallimenti shell marker passano in due repliche isolate(8e4c06a7,b610da00), causa ancora ignota: diagnostica aggiunta ai messaggi di fallimento, serve nuova suite completa.
- Browser completo in corso:2026-09-19T21-32-50-461Z-browser-00ccbf68. Non avviare un secondo full-run contemporaneo. Prove correnti in harness-ui/frontend/artifacts/ripresa; events.jsonl conserva ogni esito anche con interruzione improvvisa.
- Correzioni SOLO di test per ora: writer replay attesi esplicitamente; inventario rispetta eliminazione owner dei quattro riepiloghi e prepara modello locale; sonde HF usano lastModified; test confronto usa SOLO TALOS-Calm-Lab-04.html, che ha3ingressi funzionanti e7voci disabilitate. GREEN browser di queste modifiche ancora da eseguire dopo la baseline.
- Nuovo runner isolato Electron: harness-ui/desktop/scripts/ripresa-desktop-gate.mjs. Solo syntaxcheck per ora; eseguirlo dopo browser. Strumenta SOLO snapshot bootstrap per keyring in memoria; nessuna certificazione installer/credenziali reali implicita.
- Public main13f65c15cdeaf8986b882993a0773cdeafb867d2 verificato. Workflow pubblico più recente: non sovrascriverlo con privato. Provenienza corretta in .claude/release-2026-09-19/public-release-provenance-v2.json (v1 conteneva provider-store assente, non prova valida).
- G10 Evolution: censita nuova PR#37 https://github.com/talos-private/agent-virtual-machine/pull/37, head4175dc760d39d78011fa1e545d7fc9d23049055c; Windows process-tree containment su baseevolution/e0-3-native-rust-workspace. Aperta, nessun merge/import implicito; affianca#34–36 come dipendenza da auditare.
Ledger esatto: .claude/LEDGER-RELEASE-GATE-2026-09-19.md. Nessuna modifica prodotto/deploy4174 in questo lotto. 4174 resta da controllare a fine gate senza riavvio.


> **Riferimenti UI vincolanti confermati dall’owner (19/09):** `C:/Users/Antonino/Downloads/talos-sidebar-calm-review.html` per sidebar DESTRA e grafo; `C:/Users/Antonino/Downloads/TALOS-Calm-Lab-04.html` per Model Lab e impostazioni. **Chat e composer non hanno mockup.** Sidebar SINISTRA: solo sessioni iniziali, zero figli o espansioni. Qualunque proposta storica diversa qui sotto è superata. Hash in `ripresa-2026-09-19/mockup-owner-canonici.json`.

Documento distinto dal piano operativo desktop, avviato immediatamente come richiesto. Stato: riconciliazione in corso; nessun completamento storico riconfermato automaticamente. Non è ancora un ledger di implementazione dei lotti futuri.

Fonti: TABELLA-FASI-COMPLETA-2026-09-13.md, PROPOSTA-FASI-A-B-C-2026-09-17.md, code debiti/owner/bug critici/bug Astra, dossier spawn 17 settembre, PR pubbliche e sorgenti. Occorre conservare ciascun ID canonico e assegnargli un solo lotto; i rimandi non duplicano il requisito.


## Quadro corrente e prossime fasi — aggiornamento 19/09, 20:36 UTC

**Questo quadro prevale sulle fotografie storiche riportate sotto.** I log precedenti sono conservati come prove, non come stato attuale. La tabella canonica del 13/09 rimanda qui per la ripresa; nessun requisito originale viene cancellato. Questo aggiornamento riguarda documentazione e ripristino del server: non introduce nuove correzioni al prodotto né nuovi esiti delle suite.

| Area / requisito già censito | Stato attuale | Cosa resta per chiuderlo |
|---|---|---|
| 4174, affidabilità ambiente R0 | Nuova indisponibilità riscontrata20:34UTC: PID194352 assente, nessun errore fatale nei log. Ripristinata20:35UTC con PID19300, launcher Windows distaccato, HTTP200, 33/33 sessioni; JS/CSS identici ai bundle verificati. Backup prima dell'avvio | Confermare sopravvivenza alla fine del turno e continuità prolungata; attribuire la causa solo con prova. Il ripristino non equivale a diagnosi risolta |
| Chat/composer, ritorno in basso, reset aspetto | Correzioni già consegnate e verificate nei lotti precedenti, compreso overlay trasparente senza fascia in flusso | Regressione cumulativa al gate candidato; nessun mockup chat/composer |
| Model Lab: pagina HF, navigazione, download, filtri/parametri, paginazione; Libera memoria | Collegamenti implementati; sidebar e README960px verificati live; comando unload collegato all'API. Verifiche controllate disponibili | D-LAB-03 aperto: doppia navigazione/densità, dati demo e distinzione stima/misura. Percorsi reali download/provider/unload e filtri su più pagine ancora da certificare |
| R4 / D-VIS-02/03/04 e tracking | Sidebar sinistra solo padri; destra13discendenti/grafo14nodi della sessione osservata. Correzioni clic card, tooltip, stati e Markdown già consegnate | Nuovi spawn multigiro reali, riconnessione e coerenza sotto carico; restante feed PR32 e inspector PR33 |
| D-TIME-01, proprietario G0 per ripresa desktop, raccordo G5 | Replay persistente implementato e verificato: raccolta a grafo chiuso, seek/play/pausa, reload/riavvio; consegnato4174 | Gate con modello reale e storico voluminoso; passato non registrato dichiarato mancante. Nessuna promessa di rewind dei file fisici o delle altre viste |
| D-PAR-04 / G5 | Quattro figli contemporanei provati con runtime controllati; la scelta effettiva del modello non è verificata | Riproduzione reale: richiesta dal composer, quattro avvii sovrapposti, padre operativo, stop/ripresa senza duplicazioni |
| RUN-560B-INTERRUZIONI / G2 | Diagnostica errori migliorata; causa delle interruzioni della sessione560bee09-72ab-4495-a40a-922fe778bf40 ancora ignota | Riprodurre runtime/template/modello/contesto effettivi; fix soltanto sulla causa dimostrata, prova lunga e recovery |
| R0/R1/R3/R4/R5 | Parziali; nessuna candidata dichiarata rilasciabile | Baseline completa, audit release/PR e sicurezza, matrice visuale, integrazioni residue, pacchetto Electron e percorsi reali |
| G3/B, G4/C, G5/D e D-MSG-01 | Requisiti conservati e ordinati; non completati dalle correzioni grafiche | File tools/domande/piano → dati/context/compattazione → workflow persistente/dialogo padre-figlio e fra agenti |

### Sequenza raccomandata, accorpata in lotti verificabili

I numeri seguenti sono ordine di esecuzione, non nuovi ID di requisito. Restano unici i proprietari G0–G10 della matrice. Ogni lotto inizia con isolamento R0 e caratterizzazione R1 dei percorsi toccati; non si rinvia tutto l'audit a dopo i fix. Eventuali vulnerabilità P0 confermate precedono le nuove funzioni e bloccano la candidata.

| Ordine | Ambito accorpato e priorità | Ingresso | Risultato osservabile / criterio di uscita |
|---|---|---|---|
| 0 | **4174 e banco affidabili** — R0/G0, P0, ora | Processo/log/versioni controllati, archivi salvati, nessuna attività owner interrotta | HTTP e hash corretti anche dopo uscita del launcher e fine turno; banco con tutti gli store isolati; ricorrenze della caduta registrate e riprodotte |
| 1 | **Chiudere Model Lab e parità visiva pertinente** — R2/R3, D-LAB-03, P1 | Banco R0; ledger e ricerca primaria del lotto; due mockup canonici invariati | Navigazione compatta, risultati raggiungibili, nessun dato demo spacciato per misura; filtri combinati + parametri su più pagine HF senza duplicati/stato vecchio; download/annulla/ripresa/installati/MODEL_LOCKED e Libera memoria con API/file reali; screenshot testa a testa chiaro/scuro alle viewport richieste |
| 2 | **Affidabilità chat, agenti e runtime locale** — D-PAR-04, RUN-560B, gate residuo D-TIME-01; G2/G5, P1 | Backend effettivo identificato, modelli/versioni pinned, prompt e workspace isolati, raccolta eventi senza segreti | Padre continua mentre >=4 figli lavorano; tutte le viste concordano al nuovo spawn e dopo riconnessione; replay registra dall'avvio, pausa coerente e recupero. Diagnosi riproducibile delle interruzioni Qwen prima di qualunque tuning; nessun retry cieco degli effetti |
| 3 | **Consolidamento e candidata desktop** — R0/R1/R3/R4/R5 + G1/G8, P0/P1 | Lotti1–2 passati, regressioni e finding nominativi | Censimento release/PR23–36 con SHA effettivi; nessuna perdita irrisolta, chiavi/disinstallazione/proxy e confini reali verificati; feed e inspector residui completati; suite affette complete e matrice visuale; Electron isolato con persistenza/export/shutdown/upgrade. Manifest e impedimenti esatti, nessun tag/pubblicazione automatica |
| 4 | **B: strumenti file, domande alla persona e modalità piano** — G3, P1 | Residui A/A-bis e sicurezza necessari confermati, candidata desktop stabile | File fisici e policy reali; domande riprendono il task; piano resta in sola lettura fino all'approvazione e conserva stato dopo reload. Prove multigiro dal composer |
| 5 | **C: dati, context engine, compattazione** — G4, P1 | Contratti G3 e decisione esplicita sulla fonte kernel; backup/migrazioni | PO26 cartella dati → BC66 context engine → BC65 compattazione: recovery/rollback e budget misurati, sessioni lunghe senza perdita di task o provenienza |
| 6 | **D: workflow e dialogo persistente fra agenti** — G5, PO25/D-MSG-01, P1 | Background del lotto2 + contratti G3/G4, ricerca primaria dedicata su Claude Code/Codex prima del protocollo | Padre↔figlio e agente↔agente dopo il prompt iniziale, durante il lavoro e dopo il risultato; identità, permessi, consegna/risposta, annullamento, crash/restart; richieste utente instradate senza deadlock |
| 7 | **Qualità trasversale e capacità residue** — G6/G7/G8; G9/G10 con confini, P1/P2 | Baseline misurata e dipendenze di ogni requisito soddisfatte | Prestazioni/accessibilità/provider e distribuzione; preferiti/confronto/viste/banco/modello nuove chat con comportamento reale; tutti10finding/33task verificati; mobile/CLI con handoff separato. Evolution contratti/scaffold distinti dal runtime, dopo i prerequisiti |

Accorpare le correzioni dello stesso percorso, poi eseguire un gate integrato per lotto; mantenere comunque RED mirati prima dei fix. Non usare percentuali di completamento finché il censimento R1 non è chiuso. Nessun perfezionamento estetico secondario deve ritardare la diagnosi di perdita/stop delle sessioni.

Prove disponibili, senza promozioni indebite: backend431/431 (c3edafd3), unit frontend1447/1447 (befe5d5c), browser finale8/8 (a73e8728); l'unit precede la sola correzione finale di inquadratura, coperta dai browser finali. Non sono la suite completa del prodotto. Confronti canonici20:00UTC e limiti dettagliati nel registro sotto. Ripristino corrente: `ripresa-2026-09-19/restore-4174-20260919T2034Z/verification.json`.

| Lotto proprietario | Contenuto | Dipendenze/ingresso | Prova di uscita | Priorità motivata |
|---|---|---|---|---|
| G0 / R0–R5 desktop | Ripresa laboratorio, parità release, mockup e sidebar; distribuzione candidata; BC-72 suite browser e BC-74 script di prova | Provenienza, isolamento, inventario R1 | Percorsi reali e pacchetto con artefatti; nessuna regressione ignota | P0: prodotto quotidiano e basi delle verifiche |
| G1 sicurezza / A-bis | BC83 eseguibile git, BC84 trust hook, ambiente spawn, trust plugin al momento d'uso, scanner; audit desktop F01/F04/F07 | Confermare correzioni e confini effettivi per processo | Prove avversariali permanenti, blocco senza fiducia, byte limit, redirect sicuri | P0: autorità e credenziali |
| G2 residui A | BC73, BC76 e confronto PR29, BC79.2, BC77/71/70/68/78, BC82; RUN-560B-INTERRUZIONI: affidabilità modello locale (triage dopo UI) | Equivalenze dei due rami non antenati; kernel canonico | Stessa capacità raggiungibile dal prodotto, tool e recovery reali | P1: chiudere contratti già promessi |
| G3 / B | CLIreq11→10→08→09 file tools, PO28 domande, PO29 modalità piano | G1; API e policy prima della UI | Dialogo multigiro, file fisici, nessuna scrittura in piano non approvato, reload | P1: controllo umano ed effetti verificabili |
| G4 / C | PO26 cartella dati → BC66 context engine → BC65 compattazione con interfaccia | Dati migrabili, fonte kernel unica, G3 | Migrazione e rollback; budget misurato, ripresa senza contesto nascosto | P1: durata e affidabilità delle sessioni |
| G5 / D | Orchestrazione persistente, figli e loro ripresa, dialogo padre/figlio e agente/agente D-MSG-01, ciclo di vita e visibilità agenti D-VIS-01, scelta modello/effort/tipo, prenotazioni file, copie isolate, coda limitata, PO25 workflow agentico (raccordo a PO28 domande e PO29 piano) | G1/G3/G4 e contratti durevoli | Crash/restart, cancellazione, isolamento, ripresa, concorrenza controllata | P1: completamento dell'agente operativo |
| G6 qualità e prodotto | Prestazioni locali (fase4), lingua (5), CRUD liste (6), finestre/terminale (8), provider/context (9), accessibilità | R1 identifica contratti e regressioni; G2/G4 dove necessari | Misure ripetibili, tastiera/scale/reduced-motion, provider veri | P1/P2 per impatto misurato |
| G7 capacità residue | Fase10: computer use, terminale agente, voce, disco; preferiti/confronto/viste/banco/scelta modello chat dai mockup | API, policy e persistenza prima dei controlli UI | Un percorso reale per requisito, stati errore e riavvio | P2 salvo requisito bloccante R1 |
| G8 distribuzione e documenti | Fase7 installer; audit F08 licenze/F09 quickstart/F10 distribuzione non firmata | Candidato R5, provenienza dipendenze e policy firma | Installazione/upgrade/uninstall isolati, guida eseguita da zero, manifest | P1: consegna riproducibile |
| G9 mobile / CLI | Fase11 parità mobile; audit F02 HTTP/F03 SSE/F05 header-deadline/F06 retry; dipendenze CLI | Handoff nominativo separato: nessuna modifica implicita alle corsie | Gate specifici della corsia e conformità contratti condivisi | P1 sicurezza, P2 parità |
| G10 Evolution | PR34 freeze, PR35 protocollo, PR36 scaffold Rust; runtime ancora da provare | Decisioni architetturali e cancelli pre-Evolution canonici; G1/G4/G5 | Conformità contratto, build pinned, poi runtime end-to-end; scaffold non basta | P2 ricerca/contratti, runtime dopo prerequisiti |

## Audit: copertura obbligatoria da riconciliare

T00.1–T00.3 (coordinamento), T01.1–T01.3, T02.1–T02.4, T03.1–T03.3, T04.1–T04.3, T05.1–T05.3, T06.1–T06.4, T07.1–T07.2, T08.1–T08.3, T09.1–T09.3, T10.1–T10.2 sono gli ID rilevati nella tabella. Conteggio verificato sulle righe originali: 33 task distinti, coerente con il titolo; il dubbio preliminare sul totale non è confermato. F01/F04/F07 appartengono G1; F02/F03/F05/F06 G9; F08/F09/F10 G8. T00 appartiene alla gestione delle prove G0. La trascrizione nominativa è riportata sotto; le prove dei singoli task restano da riconfermare.

## Divergenze già accertate

- Gli ID BC non sono globalmente univoci: per esempio BC-07 significa latenza provider in CODA-UNICA-DEBITI e tre rotte in errore in CODA-BUG-CRITICI; BC-08, BC-09, BC-10, BC-11 e BC-12 hanno collisioni analoghe. L'inventario usa `documento:ID` finché una decisione canonica documentata non li riconcilia. Deduplicare sul solo numero perderebbe requisiti.

- La tabella del 13 settembre non descrive le successive PR34–36: «Evolution non iniziato» è superato per contratti/scaffold, non prova un runtime funzionante.
- PR32: head effettivo 69bf67399a41bee167fa489ae6da635495c08aed; testo PR riporta un altro head. Usare quello effettivo nell'audit sorgente.
- PR33: head 55f2d1b26a51aaeaf0bbb3b05b6ea8dad3ffc32f; laboratorio interattivo su fixture, non integrazione backend certificata.
- fase-a-bc73 e fase-a-frontend-2 non sono antenati di HEAD: prima cercare porting/equivalenze; non importare monoliti.
- PR29 e BC76 non sono equivalenti: [confronto sul codice](ripresa-2026-09-19/CONFRONTO-PR29-BC76.md). Il corrente mantiene delega, più runtime e context trial, ma manca il binding al processo esatto; framing e completamento SSE hanno garanzie inferiori. BC81 e i due scenari RIPRESA-SSE-FRAMING/EOF restano aperti in G1/G2, con G1 proprietario delle garanzie e G2 dei percorsi locali.

## Regola di avanzamento

Per ogni requisito ancora da trascrivere: ID e fonte riga, un lotto proprietario, dipendenze, ingresso, file/simboli prima di implementare, test RED e prova reale d'uscita, priorità motivata. «Chiuso» storico rimane storico finché fonte corrente e prova fresca concordano. Un requisito senza collocazione mantiene il censimento aperto. Ricerche/upstream dei lotti futuri saranno verificate alla loro apertura; questo documento non autorizza design di protocolli senza dossier corrente.

## Collocazione nominativa dei 33 task dell'audit

Titoli dalla tabella canonica, righe 794–826. La colonna proprietario assegna un solo lotto coordinatore; le corsie partecipanti rimangono quelle della fonte e richiedono un handoff prima delle modifiche. Tutti gli esiti sono da riconfermare. Le priorità sono quelle dell'audit salvo il cancello iniziale G0, anticipato per rendere le prove attendibili.

| ID | Requisito | Lotto | Ingresso/dipendenza | Prova di completamento |
|---|---|---|---|---|
| T00.1 | Inventario e provenienza | G0 | Archivi e sorgenti disponibili | SHA effettivi, mappa completa, nessuna riga orfana |
| T00.2 | Riproduzioni sul runtime supportato | G0 | T00.1, runner di ciascuna corsia | Riproduzioni F02–F06 con runtime/versione e log |
| T00.3 | Strumentazione senza payload sensibili | G0 | Inventario confini | Tracce sufficienti alla diagnosi, test assenza segreti |
| T01.1 | Contenimento preview same-origin, P0 | G1 | Riproduzione F01 | Contenuto ostile non chiama API privilegiate |
| T01.2 | Policy provider su due trasporti | G9 | Riproduzione F02 e handoff mobile | Identico deny/allow sui due trasporti reali |
| T01.3 | Framing SSE e tetto byte proxy | G1 | F03/F04; sublotto mobile concordato | Multiline/frame spezzati e buffer oltre soglia falliscono correttamente |
| T02.1 | Preview isolata | G1 | T01.1 e confronto primitive Electron | Pacchetto reale, origine e autorità separate, navigazione usabile |
| T02.2 | Deadline e abort end-to-end | G9 | T01.2, riproduzioni F05/F06 | Header lenti, retry e cancellazione rispettano budget globale |
| T02.3 | Redirect/DNS per client | G1 | F07, elenco client | Redirect/DNS ostili bloccati prima del contatto vietato |
| T02.4 | Confini terminal-ws/kernel/hook/MCP/plugin/keystore | G1 | Inventario privilegi T00.1 | Attacchi permanenti sul confine reale, nessun permesso implicito |
| T03.1 | ADR confini condivisi | G1 | Risultati T02, ricerca standard | ADR e fixture di conformità accettate dalle corsie |
| T03.2 | Estrazione famiglie rotte | G1 | Caratterizzazione API; sicurezza stabile | Contratti HTTP invariati e regressioni complete |
| T03.3 | Duplicazioni canoniche/build-time | G4 | Inventario kernel e asset mobile | Una fonte canonica; divergenza generata fa fallire il gate |
| T04.1 | Backpressure e shutdown SQLite | G4 | Worker e carichi riproducibili | Coda limitata, arresto senza perdita/transazioni sospese |
| T04.2 | Migrazioni, recovery, restore | G4 | PO26 e backup isolato | Migrazioni interrotte/restore e rollback provati |
| T04.3 | Query, export, limiti risorse | G4 | Dataset e budget definiti | Risultati integri, limiti memoria/tempo e file esportati |
| T05.1 | Stato operazione separato dal rendering | G6 | Contratti T02, caratterizzazione | Reload e riapertura ricostruiscono lo stesso stato operativo |
| T05.2 | Invalidazione e concorrenza client | G6 | T05.1 | Risposte fuori ordine/cambio rapido non sovrascrivono stato nuovo |
| T05.3 | Grafo di avvio | G6 | Baseline di cold/warm start | Tracce di avvio e riduzione misurata senza perdita funzioni |
| T06.1 | Destinazione, autorizzazione, reversibilità visibili | G6 | T03.1 e policy reale | Utente identifica effetto/destinazione e usa annulla dove previsto |
| T06.2 | Attesa, retry, recupero | G6 | T02.2/T05.1 | Errori comprensibili, annullamento e ripresa reali senza doppio effetto |
| T06.3 | Design system e accessibilità | G6 | R3 e inventario componenti | Tastiera, contrasto, scale, reduced-motion e viewport rappresentativi |
| T06.4 | Benchmark Android e journey | G9 | Handoff e dispositivo/profilo | Misure dispositivo e percorsi umani, fixture dichiarate |
| T07.1 | Profili operazioni peggiori | G6 | T00.3 e carichi | Profili ripetibili per piattaforma, colli identificati |
| T07.2 | Rendering e I/O mirati | G6 | T07.1 | Prima/dopo a carico identico e regressioni invarianti |
| T08.1 | Gate sicurezza confine reale | G1 | T01/T02 | Pacchetti reali sottoposti agli attacchi, nessun mock come prova finale |
| T08.2 | Conformità, fault injection, API | G0 | Contratti T03, componenti disponibili | Matrice errori/recovery con prove e mutazioni pertinenti |
| T08.3 | Accettazione pacchetti | G8 | R5, T08.1/2, handoff Android | Installazione, avvio, persistenza, export, stop su pacchetti |
| T09.1 | Quick start eseguibile | G8 | Manifest e prerequisiti pinned | Procedura da ambiente pulito, CI equivalente |
| T09.2 | Licenze/notices/distinta | G8 | Inventario dipendenze e asset | Provenienza/versioni/licenze coerenti col pacchetto distribuito |
| T09.3 | Dipendenze e provenienza release | G8 | T09.2 e build candidata | Manifest/hash e procedure upgrade/rollback riproducibili |
| T10.1 | Ottimizzazioni avanzate, P3 | G6 | Baseline stabile, T07.1/2 | Beneficio misurato senza peggioramento compatibilità |
| T10.2 | Chiusura copertura e priorità | G0 | Tutte le righe precedenti valutate | Nessuna omissione; aperti/smentiti/chiusi motivati e owner unico |

## Requisiti fuori tabella: collocazione esplicita

Fonte `CODA-UNICA-DEBITI-2026-09-06.md:471–589`. Le vecchie indicazioni APERTO/CHIUSO non sono nuovi verdetti. Gli ID `EX-*` assegnano identità alla prosa; i requisiti con ID originale lo conservano. La prova di uscita vale sul prodotto corrente con dati controllati, non su una modale montata separatamente. Ingresso comune: R1 per il comportamento e ledger esatto prima di ogni modifica; per effetti esterni servono API/policy e banco isolato R0. G1 è P0 per autorità; G0 P1 per percorso e parità; G4/G6 P1 per dati e comprensibilità; G7 P2 per capacità aggiuntive.

| ID qualificato / fonte | Requisito | Lotto unico | Prova specifica di uscita |
|---|---|---|---|
| T01-nuova-sessione-D1 | Flusso di creazione coerente con la decisione owner corrente | G0 | Percorso da profilo vuoto; conciliare PO24 con successiva rimozione PO27, non reintrodurre automaticamente l'intro |
| T01-nuova-sessione-D2 | Conteggio sessioni per progetto | G0 | Zero/uno/molte, aggiornamento dopo creazione e spostamento |
| T01-nuova-sessione-D3 | Cartella scelta vicina al controllo che la modifica | G0 | Geometria effettiva e tastiera nelle viewport richieste |
| T01-nuova-sessione-D4 | Conteggio file e avviso per radice | G1 | Workspace piccolo/vuoto/radice con policy coerente |
| T01-nuova-sessione-D5 | Informazioni Git del progetto | G0 | Repo/non-repo, errore Git e nessun git.exe del workspace eseguito |
| T01-nuova-sessione-D6 | Eliminare riferimento obsoleto a planner opzionale | G0 | Nessun controllo privo di effetto; modalità piano futura separata |
| T01-nuova-sessione-D7 | Totale attrezzi e costo per giro comprensibili | G6 | Catalogo reale; costo assente dichiarato, mai inventato |
| T02-primo-messaggio-D1 | Costo sessione nel composer | G6 | Dati veri, aggiornamento e persistenza; ignoto distinto da zero |
| T03-permessi-D1 | Tutti gli attrezzi hanno policy visibile | G1 | Inventario corrente completo, override provati nei due versi |
| T03-permessi-D2 | Vietare scrittura non aggirabile tramite shell | G1 | Stesso bersaglio protetto da tool file e comando; nessun effetto prima dell'autorizzazione |
| T04-coda-e-reindirizzo-D1 | Esc permette di fermare il giro | G0 | Dialogo e stop reale, testo nel composer conservato |
| EX-LAB-DOWNLOAD | Download upstream reale | G0 | File fisici/hash, coda, annullo, ripresa e installato |
| EX-LAB-FIT | Stima con esiti compatible/tight/blocked | G0 | Metriche reali e causa visibile in tutti gli esiti |
| EX-LAB-GATED | Repository gated a schermo | G0 | Stato accesso e errore umano, nessun bypass |
| EX-LAB-CONTEXT | Stima comprende contesto e cache oltre ai pesi | G6 | Misura sul runtime confrontata con stima, errore dichiarato |
| T-LUOGHI-02:D7 | Modello ausiliario per mestiere | G7 | Selezione modifica destinazione reale e sopravvive al reload |
| T-LUOGHI-02:D14 | Timeout approvazione | G1 | Scadenza chiude attesa e non esegue l'effetto |
| T-LUOGHI-02:D15 | Redazione segreti | G1 | Segreti sintetici assenti da log, export e UI |
| T-LUOGHI-02:D18 | Checkpoint | G5 | Ripristino reale e conflitti gestiti senza perdere modifiche utente |
| T-LUOGHI-02:D16 | Comandi permessi per progetto | G1 | Allowlist effettiva per workspace, applicata anche dopo reload |
| T-LUOGHI-02:D17 | Indirizzi privati: chiedere ogni volta | G1 | Richiesta e redirect verso rete privata non contattano la destinazione prima della decisione |
| T-LUOGHI-02:D19 | Salute provider | G6 | Sonda reale, dato vecchio/assente distinto da sano |
| T-LUOGHI-02:D27 | Chat archiviate | G6 | Archivia, riapri, ricarica e recupera sessione |
| EX-SETTINGS-CONTEXT | Ripartizione su finestra di contesto vera | G4 | Totale coerente e provenienza dei numeri |
| EX-SETTINGS-COST | Tabelle costo con dati reali | G6 | Totali rispetto al registro e valute/unità esplicite |
| T-LUOGHI-03:C13 | Trasformare lavoro in skill | G7 | Artefatto utilizzabile e trust prima dell'esecuzione |
| T-LUOGHI-03:C21 | Token di un file di Libreria | G4 | File reale, modello/tokenizer noto o stima dichiarata |
| T-LUOGHI-03:C8 | Ordinare strumenti per uso | G6 | Ordine guidato da chiamate registrate, stabilità a parità |
| T-LUOGHI-03:C11 | Strumenti non supportati dal modello | G2 | Nessuna esecuzione inventata, incompatibilità visibile |
| T-LUOGHI-03:C3 | Skill, Connettori, Plugin, Hook | G1 | Elenco → configurazione → fiducia → uso reale → errore/revoca |
| EX-TOOLS-USAGE | Uso registrato per attrezzo | G6 | Conteggio da sessione vera e ripresa |
| EX-NOTIFY-SYSTEM | Notifica sistema con permesso e finestra nascosta | G0 | Notifica del pacchetto Electron osservata |
| EX-NOTIFY-FOCUS | Clic notifica riporta finestra davanti | G0 | Focus sul task corretto nel pacchetto |
| EX-NOTIFY-APPROVAL | Contrassegno approvazione in attesa | G0 | Contatore/riga/pannello concordano fino alla risposta |
| EX-DOCTOR-ONE | Singolare con conteggio uno | G6 | Dato reale 0/1/2 sulle superfici pertinenti |
| T-LUOGHI-05:H6 | Spazio occupato da app e store | G6 | Byte misurati, archivi enumerati, nessuna pulizia implicita |
| T-LUOGHI-05:H9-H10 | Versione pagina/server coerente | G0 | Bundle vecchio rilevato e recupero verificato |
| EX-DOCTOR-REMEDIES | Rimedi Doctor realmente eseguibili | G1 | Policy e destinazione visibili, risultato osservabile |
| T-LUOGHI-05:C22 | Memoria divisa per strati di lavoro, episodica, semantica | G4 | Modello dati e UI concordano; migrazione conserva contenuti e provenienza |
| T-LUOGHI-05:C25 | Autore su ogni riga delle Attività | G6 | Record e UI indicano persona/agente, filtri fondati sul dato |
| EX-NV-C12 | Skill a tre stati | G1 | Tutte le transizioni reali e reload |
| EX-NV-C15-C17 | Connettori MCP | G1 | Connessione, errore, trust e invocazione reale |
| EX-NV-C18-C19 | Plugin | G1 | Installazione, fiducia all'uso, revoca/disinstallazione |
| EX-NV-C26 | Rapporto e fonti della ricerca riapribili | G6 | Ricerca conclusa reale, lettura e riapertura dopo riavvio |
| EX-NV-C27 | Codice completo dell'attrezzo visibile prima di abilitarlo | G1 | Definizione in sola lettura, trust sulla stessa versione mostrata |
| EX-NV-G22-G29 | Attese visibili in riga, pannello e notifica sistema | G0 | Più richieste pendenti, conteggi coerenti e ritorno alla sessione corretta |
| EX-NV-DENSITY | Densità applicata alle pagine | G6 | Tutte le viste, ricarica, nessun testo tagliato |
| EX-NV-OVERLAYS | Veli alle tre viewport originali | G0 | Ispezione individuale e tastiera, integrata con matrice R3 |
| EX-NV-INTRO | Passo Fine e H19 | G0 | Ricondurre all'onboarding corrente dopo PO27; nessuna reintroduzione automatica |
| EX-NV-O28 | Secondo modo O28 su pagina grande | G0 | Documento controllato almeno della taglia originale 438.747 caratteri |
| EX-NV-B29 | Dettatura vocale | G7 | Audio → testo composer, annullamento e stato permesso |
| EX-NV-LIGHT | Ispezione visiva tema chiaro | G0 | Screenshot individuali con geometria e contrasto |
| EX-PROSE-WORKSPACE | Creazione fuori elenco progetti e permesso workspace | G1 | Combinazione scelta utilizzabile o rifiuto prima dell'invio |
| EX-PROSE-GLYPH | Triangolino senza escape CSS difettoso | G0 | Glifo visibile e testo accessibile corretto |
| EX-PROSE-LINKS | Link nelle risposte | G0 | URL naturale cliccabile, protocollo pericoloso rifiutato |
| EX-PROSE-RECONNECT | Server cade, torna, Riprova | G0 | Stessa sessione, nessun evento duplicato, stato coerente |
| EX-PROSE-MULTIWINDOW | Due finestre sulla stessa sessione | G5 | Concorrenza, selezione, ripresa ed effetti senza duplicazioni |
| EX-PROSE-INSTALLED-FIT | Verifica compatibilità da Installati | G0 | Ingresso vero e stima/errori reali |
| EX-PROSE-DESTRUCTIVE | Elimina/svuota/disinstalla/riavvia/installa/scarica/esporta/accedi/termina | G0 | Un caso isolato per ogni effetto e rifiuto; articolare nella matrice R1 |
| EX-PROSE-CONTRAST | Contrasto tema chiaro | G6 | Token e componenti misurati; attenzione al testo muted e piede chat |
| EX-CODE-DUPLICATES | Funzioni doppie per nomi e icone | G6 | Stesso risultato su tutte le superfici, caratterizzazione prima di consolidare |
| EX-CODE-DEAD | Codice e pannelli irraggiungibili, controlli fase3 | G0 | Ogni requisito ricollegato o rimozione con decisione owner documentata |
| EX-CODE-BUILD | Build dal sorgente, verify completo, manifest in runtime | G0 | Clone pulito, sorgente alterato invalida prova, versione servita verificabile |
| EX-CODE-NOTICES | Vendor inutilizzati e notices | G8 | Distinta del pacchetto reale e provenienza pinned |
| EX-CODE-FOCUS | Focus nelle modali | G6 | Tab/ShiftTab, Escape e restituzione focus nel percorso reale |

### Coda Astra e proposte non implicitamente attivate

| Fonte:voce | Lotto | Ingresso | Prova e priorità |
|---|---|---|---|
| CODA-BUG-ASTRA:1 immagini composer | G2 | Capability provider e payload reali | Byte al modello diretto, follow-up e reload; P1 |
| CODA-BUG-ASTRA:2 Full access | G1 | Livelli di accesso documentati | Percorsi assoluti, shell e seguito dopo reload; rispettare la decisione owner sulla trifecta; P0 |
| CODA-BUG-ASTRA:3 engine Autocompact | G4 | Esiti della qualificazione conservata, BC66 | Scelta motivata e nuova qualifica end-to-end; P1 |
| CODA-BUG-ASTRA:4 fallback per tier / 9router | G6 | Ricerca upstream/licenza/pin e decisione architetturale ancora aperta | Quote/reset/guasti distinti, passaggi autorizzati senza doppi effetti; P2 |
| CODA-BUG-ASTRA:5 RTK sui risultati tool | G4 | Dossier upstream e rapporto con Autocompact | ON/OFF su casi identici, originali recuperabili, nessuna perdita di errori/riferimenti; P2 |

Descrizioni D16/D17 recuperate da `taccuini/T-LUOGHI-02-impostazioni.md:81`; C22/C25 da `T-LUOGHI-05-doctor-e-luoghi.md:72`; C26/C27 da `T15-ricerca-e-officina.md`; G22/G29 da `T-LUOGHI-04-notifiche.md:8`. I nomi C22/C25 dei taccuini più recenti indicano invece marchio/browser: anche qui la fonte è parte dell'identità. La riconciliazione completa delle altre righe delle code e dei mockup resta aperta.

## Delta operativo 19/09, 14:20 UTC
Pagina HF collegata end-to-end al confine HTTP con revisione persistente, writer e coda; sidebar shell conservata. Quattro riepiloghi del Model Lab rimossi per decisione owner. Sidebar Agenti: ricerca e filtro conservati; grafo centrale con relazioni backend, Dagre 3.1.1/graphlib 4.0.5 e accesso al dettaglio, prove su fixture HTTP e layout reale. Questi risultati non chiudono feed sinistro PR32, parità completa PR33, orchestrazione reale, replay storico, strumenti, benchmark, preferiti/confronto/viste salvate o distribuzione Electron. Build 49fffdb5 verde 1431/1431. Il residuo R3 è nominativo nel ledger layout e nel rapporto visivo 76fa9ae0, senza spunte verdi generali.

## Requisito owner 19/09 — dialogo persistente fra agenti (lotto successivo)
| ID requisito owner | Lotto unico | Dipendenze | Stato | Prova d’uscita |
|---|---|---|---|---|
| D-MSG-01 — dialogo dopo il prompt iniziale, padre ↔ figlio e agente ↔ agente | G5 / Fase D | Background affidabile; G3 PO28 domande, PO29 piano; PO25 workflow agentico | Pianificato, priorità P1 subito dopo stabilizzazione background | Dialoghi multigiro reali, consegna/correlazione/permessi, annullamento e ripresa, crash/reload senza perdita o destinatario sbagliato |

Unica collocazione: G5 / Fase D; i rimandi a workflow agentico e Fase B plan mode / ask-question-to-user sono dipendenze, non copie del requisito. Non è soddisfatta dalla sola delega iniziale né dal ritorno del risultato finale.
- Padre → figlio: istruzioni aggiuntive, correzione, richiesta stato, pausa/ripresa mentre il figlio lavora e dopo il primo risultato.
- Figlio → padre: domande, impedimenti, evidenze intermedie e risultato, senza contaminare il contesto con output grezzo non fidato.
- Agente → agente: dialogo instradato con identità/permessi/ambito, senza accesso implicito a sessioni estranee.
- Workflow agentico: dipendenze e handoff espliciti; plan mode e ask-question-to-user devono presentare le richieste al destinatario corretto senza blocchi opachi.
Ingresso: contratto background/eventi validato, identità stabile, persistenza di sessioni e coda; ricerca primaria dedicata su Claude Code (agent teams/cross-session messaging) e Codex (documentazione ufficiale e sorgenti) obbligatoria prima del protocollo. La ricerca è un task pianificato, non dichiarata completata qui.
Completamento: multi-turn reale padre/figlio e tra fratelli, messaggi durante esecuzione e dopo fine turno, correlazione risposta/domanda, ordinamento e deduplicazione, destinatario non disponibile, annullamento, reload/restart, nessuna perdita o risposta nella chat sbagliata; UI mostra consegnato/in attesa/risposto e fonte. Registrare prove raw, contratti versionati e test permanenti.
Priorità: alta subito dopo stabilizzazione del background; necessaria per dirigere lavoro lungo e collegare piano/domande al runtime. Non implementare implicitamente nel lotto grafico corrente.

### Ricerca primaria iniziale verificata il 19/09/2026
- [Claude Code: agent teams](https://code.claude.com/docs/en/agent-teams): distingue ritorno al chiamante, messaggi fra agenti nominati e coordinamento tramite task condivisi; documenta cambiamenti di protocollo dalla v2.1.178. Non assumere che un vecchio TeamCreate sia ancora il contratto corrente.
- [Claude Code: ripresa dei subagent](https://code.claude.com/docs/en/sub-agents#resume-subagents): SendMessage può riprendere lo stesso agente con cronologia; cancellazione esplicita e identità del destinatario richiedono trattamento distinto. Verificare versione precisa quando parte il lotto.
- [Codex: orchestrazione e controlli dei thread](https://learn.chatgpt.com/docs/agent-configuration/subagents): la documentazione conferma spawn, instradamento di istruzioni successive, attesa e chiusura; non stabilisce da sola tutte le garanzie peer-to-peer/durabilità richieste da TALOS. Dossier di protocollo e pin del sorgente upstream restano ingresso obbligatorio.
Decisione preliminare: adattare i requisiti osservati a contratti TALOS versionati; non copiare il protocollo privato di un prodotto. Confrontare adapter/protocolli supportati prima di scegliere l'implementazione. Questa ricognizione aggiorna la roadmap, non dichiara consegnato il dialogo persistente.

### Residui UI grafo verificati contro PR33 — collocazione unica G5
Il richiamo dell'owner alla fedeltà al mockup richiede di preservare esplicitamente: ambito **Esecuzione** (identità run canonica), replay storico persistente (oltre i 120 stati osservati dall'apertura), archi di dipendenza e messaggio (eventi canonici correlati, legati a D-MSG-01). Queste tre capacità restano in G5; non vanno duplicate nelle fasi UI e non sono esclusioni definitive. Ingresso: orchestrazione persistente, identità stabile run/agente e protocollo messaggi autorizzato. Prova: riapertura/restart, relazione esatta degli archi e replay senza inventare attività o contenuti dei file storici. Priorità P1 dopo il lotto di esecuzione in background: servono a ricostruire il lavoro, non soltanto a visualizzarlo mentre la finestra è aperta. Mappatura degli elementi già collegati nel ledger AGENTI-GRAFO.


### Riconciliazione del 19/09, secondo passaggio
Inventario strutturato canonical-phase-requirements-v2.json: 55 righe della tabella canonica, 55 ID distinti, tutte con lotto/ingresso/prova/priorità. Questo conteggio riguarda le righe estratte: non certifica copertura completa della prosa, delle code o dei mockup. I 33 task audit conservano collocazione nominativa sopra.
R4 / G0: PR32 resta un lotto aperto completo: feed revisionato, lifecycle/reconnect/stale, DOM stabile, pin, contatori multi-finestra e stabilità albero. Identità/gerarchia REST già presenti non sostituiscono questi requisiti. Dettaglio nominativo LEFT-01-ID/DOM/PIN/STABILITY e LEFT-02-FEED/RECONNECT/FRESHNESS/ACTIVITY/RESOURCES/TRANSPORT nella matrice di parità. Priorità P1 dopo correzioni confermate HF e cold-start: base della navigazione durante lavoro concorrente. Nessuna importazione dei workflow temporanei di pubblicazione PR32.


## Debito urgente — RUN-560B-INTERRUZIONI (segnalato owner 19/09/2026)
- Sessione reale 4174: `560bee09-72ab-4495-a40a-922fe778bf40`; interruzioni frequenti segnalate dall’owner, causa NON ancora accertata.
- Modello indicato, da verificare nei log: DASLab `Qwen3.8-27B-GSQ-RCO-IQ3_S.gguf`. La recente pubblicazione/quantizzazione è un’ipotesi, non una diagnosi.
- Collocazione unica: G2, affidabilità runtime locale/backend (confine BC79.2), con dipendenze G0 evidenze, G4 contesto e G5 workflow agentico. Priorità alta: blocca continuità del lavoro reale.
- Ingresso: leggere eventi/errori e configurazione effettiva senza mutare la sessione; fissare modello, template, versione runtime, stop reason, contesto/token e tempi. Ricerca primaria su upstream e issue pertinenti.
- Uscita: riproduzione isolata con stesso runtime/modello, test permanente sulla causa, ripresa e annullamento verificati; nessun retry cieco di strumenti con effetti, nessun dato perso e nessuna sostituzione modello implicita.
- Sequenza: dopo le correzioni UI in corso SOLO se la diagnosi identifica una correzione breve e verificabile; altrimenti lotto backend dedicato con stima e dipendenze motivate. Nessun presunto fix mediante tecniche avanzate prima della diagnosi.
- Stato: APERTO / ricerca e raccolta prove in corso. 4174 resta attiva; nessun riavvio o azione nella sessione owner per questa ricognizione.

### RUN-560B — prima ricognizione e ricerca primaria
Prova: `.claude/ripresa-2026-09-19/run-560b-diagnosi-20260919.json` (hash del log, soli errori/contatori, senza prompt o credenziali). Tre RunError: due PROVIDER_REQUEST_ERROR, uno LOCAL_ENGINE_REJECTED_REQUEST (seq 539), con un giro concluso fra gli errori. Modello confermato; processo attuale b10517-vulkan, Jinja, contesto 16384, KV f16, ngram-mod. Non prova che i parametri fossero identici durante ogni arresto.
La somma tokenDentro 22442 su due richieste NON è un prompt da 22442: vietato dedurre overflow dalla somma. Il backend scarta il corpo del secondo rifiuto; la diagnosi deve distinguere contesto, template, parametri, trasporto e memoria.
Ricerca 19/09: card ufficiale ISTA-DASLab https://huggingface.co/ISTA-DASLab/Qwen3.8-27B-GSQ-RCO-GGUF/blob/main/README.md ; llama.cpp tool calling https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md ; issue https://github.com/ggml-org/llama.cpp/issues/27588 e fix merge 1729ed5 https://github.com/ggml-org/llama.cpp/pull/27626 (rifiuto esplicito del prefill assistant con tool_calls, non cura universale); runtime osservato https://github.com/ggml-org/llama.cpp/releases/tag/b10517 .
Decisione: adattare contratti ufficiali di template/tool e budgeting contesto dietro adapter TALOS; nessun nuovo framework o retry automatico generico. Dopo UI, breve triage isolato; correzione breve solo con RED riproducibile. Upgrade runtime/compattazione e recupero persistente eventualmente lotto dedicato. Stima di fix non affidabile finché manca il motivo HTTP preciso. Nessuna modifica runtime eseguita.

Pin verificato con `llama-server.exe --version` senza caricare il modello: `0.1.2-dev`, build `10517`, commit `dc72703fc`, Clang 20.1.8 Windows x86_64. Nessun processo owner interrotto.


## D-VIS-01 — cicli successivi di delega nella stessa chat (owner 19/09/2026)
Collocazione unica G5/D; dipendenze D-MSG-01 e R4 identità/feed/sidebar, raccordo PO25 workflow e PO29 piano. Priorità P1: evitare accumulo e disaccordo tra le tre viste durante lavoro multigiro.
Richiesta: decidere come mostrare gli agenti nuovi rispetto a quelli dei giri precedenti nel rail Agenti, nel grafo e nel sottoalbero sinistro. Debito APERTO; ricerca primaria in corso, nessuna modifica di visibilità/archiviazione già applicata.
Proposta da validare: attivi e in attesa di intervento sempre in vista; conclusi raggruppati per giro/delega in «Conclusi» comprimibile, senza cancellazione o archiviazione automatica della sessione. Errori/non letti visibili fino alla presa visione. Filtro coerente Attivi / Richiedono attenzione / Tutti e conteggi separati, selezione aperta mai scompare; grafo mantiene antenati necessari e collega il conteggio dei conclusi alla loro espansione. Un agente ripreso torna negli attivi con la stessa identità; nuovo incarico distinto ha identità propria e riferimento al giro.
Ingresso: inventario stati reali (run vs sessione vs delega), contratto di terminalità e ripresa; confrontare fonti upstream e gesti del mockup. Evitare di equiparare inattivo, concluso, archiviato ed errore.
Uscita: due cicli di spawn nella stessa chat, figlio/nipote, conclusione/errore/attesa/ripresa, cambio sessione e reload; le tre viste mostrano conteggi coerenti, storico recuperabile, nessun nodo orfano, nessun agente perso. Archiviare rimane un’azione esplicita separata dalla compressione visiva.
Coda: definizione dopo lotto UI e triage RUN-560B; implementazione insieme a R4/G5, prima della crescita dei workflow agentici. Non infilare una nuova regola di cancellazione nei fix UI attuali.

### D-VIS-01 — confronto primario verificato il 19/09/2026
- Claude Code, docs agent teams (v2.1.199): mantiene righe dei colleghi inattivi finché altri lavorano; raggruppa oltre tre inattivi; quando tutti inattivi nasconde dopo 30s, lasciandoli indirizzabili. Attivi, falliti e selezionato restano visibili. Fonte https://code.claude.com/docs/en/agent-teams . Adattare compressione e protezione del selezionato; NON importare alla cieca il timer che fa sparire righe.
- Paperclip distingue agente tornato idle e run completata conservata nella cronologia: https://docs.paperclip.ing/guides/getting-started/watching-agents-work/ ; dashboard attività e attenzione: https://docs.paperclip.ing/guides/day-to-day/dashboard/ . Adattare distinzione identità/run e storico, non la gerarchia aziendale.
- Codex App Server distingue thread persistente, ripresa/fork/archiviazione e cronologia eventi: https://openai.com/index/unlocking-the-codex-harness/ . Adattare la separazione archivio/stato d’esecuzione dietro contratto TALOS; non equiparare conclusione run e archiviazione thread.
Proposta TALOS motivata (non comportamento attribuito ai competitor): mostrare per default il lavoro corrente e l’attenzione; gruppo comprimibile dei conclusi con conteggio e «Mostra tutti», senza sparizione temporizzata né archiviazione automatica. Finché un lotto è in corso, conservare anche i risultati conclusi del medesimo lotto; comprimere prima i giri precedenti. Stato unknown/stale mai trasformato in concluso. Decisione implementativa da fissare nel ledger R4/G5 prima del codice.

### D-VIS-01 — vincolo sidebar sinistra da screenshot owner 18:54
Evidenza: `C:/Users/Antonino/Downloads/ScreenShot Tool -20260919185446.png`. Una sola chat con deleghe di giri differenti monopolizza la lista delle sessioni, con più livelli e titoli troncati indistinguibili.
Proposta specifica: padre sempre visibile con contatori distinti; al massimo 3 righe figlie in evidenza (attenzione prima, poi attivi); una riga «Mostra tutti gli agenti (N)» verso rail/grafo. Nessuna espansione ricorsiva automatica di nipoti; niente scroll annidato. Il conteggio riepiloga anche gli agenti non mostrati. Selezionato attuale sempre identificabile tramite padre/breadcrumb, senza far esplodere il limite. Gerarchia completa e storico nelle viste dedicate, stessa fonte dati e identità. Il limite di 3 è una proposta TALOS da confermare, non una restrizione del runtime né perdita di dati.
Gate aggiuntivo: 50 deleghe su 4 livelli e più giri; massimo 3 figli + 1 riga riepilogo per padre nella vista compatta, gli altri padri restano navigabili, tastiera e focus stabili a ogni evento. Nessuna archiviazione/cancellazione automatica.


## D-PAR-04 — Almeno quattro agenti richiesti, due soli osservati in parallelo
Segnalazione owner 19/09/2026 durante il lotto UI atomico. Stato: **da riprodurre, causa ignota**. La persona osserva al massimo due agenti simultanei quando ne richiede quattro o più. Non equivale ancora alla prova di un limite fisso del runtime.
Collocazione unica: G5 / fase D, orchestrazione persistente e workflow agentico; dopo il lotto UI e insieme alla diagnosi di scheduling, prima di dichiarare completata l’esecuzione parallela. Collegato a D-VIS-01 per visibilità, senza confondere righe mostrate e agenti effettivamente in esecuzione.
Ingresso: riproduzione in profilo isolato con prompt che richiede esplicitamente quattro compiti indipendenti e log completo di tool call, richieste accettate, accodate, avvii e conclusioni. Confrontare limite configurato, scheduler/kernel, semantica blocking/nonblocking dello strumento, limiti provider e decisioni del modello. Provare sia tool call dirette sia percorso dal composer; 1, 2, 4 e 6 figli, inclusa gerarchia annidata e cancellazione. Nessuna inferenza onerosa nell’istanza owner.
Prova di completamento: scenario permanente RIPRESA-AGENTI-PARALLELO-4 con almeno quattro intervalli reali di lavoro sovrapposti quando configurazione e risorse lo consentono; altrimenti limite esplicito, coda e motivazione visibili, senza promessa di parallelismo inesistente. Il padre resta utilizzabile, sidebar e grafo mostrano stato reale senza riaprire la chat. Registrare pin runtime/provider e configurazione, nessuna rimozione indiscriminata dei limiti di sicurezza o di risorse.


## D-VIS-02 — Otto discendenti a sinistra, quattro agenti a destra
Owner 19/09/2026, screenshot C:/Users/Antonino/Downloads/ScreenShot Tool -20260919190628.png. Stato: discrepanza visibile segnalata, causa da verificare. La sidebar destra dichiara «4 di 4 agenti» mentre il sottoalbero sinistro mostra otto sub-sessioni. Ipotesi suggerita dalla gerarchia visibile: quattro figli diretti contro otto discendenti complessivi; non chiamare i quattro mancanti cancellati o inesistenti senza confronto degli ID/API.
Collocazione unica G5 / R4, collegata a D-VIS-01, prima di chiudere la parità delle due sidebar e del grafo. Distinta da D-PAR-04: conteggio mostrato non prova il numero di esecuzioni contemporanee.
Ingresso: confrontare ID, parentSessionId, radice, profondità e stato restituiti dagli endpoint della stessa sessione, a filtri azzerati, e dopo SSE/reload. Prova RIPRESA-AGENTI-DISCENDENZA-8: quattro figli più quattro nipoti identificabili in tutte le superfici; totale esplicito figli/discendenti, filtro gerarchico comprensibile e accesso a ogni agente, senza duplicati o troncamento silenzioso. Coprire nuovi nipoti in tempo reale, conclusi, errori e riconnessione. Compatibile con sidebar sinistra compatta: riepilogo e porta «Mostra tutti» conservano il totale e i riferimenti, non eliminano sessioni.


## D-TIME-01 — Rewind completo e deterministico del grafo dal primo spawn
Owner 19/09/2026: la barra temporale è instabile e deve ricostruire tutta l’attività degli agenti, dal primo figlio del padre, con navigazione temporale precisa paragonabile al rewind di un video. Priorità alta G5 / fase D, prerequisito per dichiarare operativo il tracking storico nel grafo. Collegato D-VIS-01/02 ma collocazione unica qui. Non confondere campionamenti visivi mentre il grafo è aperto con una cronologia completa.
Contratto: dati persistiti, inizio effettivo al primo spawn della radice, discendenti a ogni profondità, ordinamento stabile con sequenze e timestamp, stati/operazioni/call e risultati ricostruiti all’istante scelto. Nessun dato del futuro deve contaminare il passato. Rewind, avanti, pausa e ritorno al vivo devono funzionare anche dopo reload, navigazione o riconnessione. Gli eventi arrivati mentre si osserva il passato si conservano senza spostare il cursore. Mostrare lacune/retention/timestamp mancanti esplicitamente; non inventare eventi o promettere precisione assente nei dati.
Gate RIPRESA-GRAFO-REWIND-COMPLETO: avviare deleghe prima di aprire il grafo; quattro figli e nipoti con attività intercalata, errori/retry/cancellazione; verificare snapshot a istanti/sequence noti, stessa ricostruzione dopo reload, trascinamenti rapidi e inversi, nuovi eventi durante rewind, ritorno al vivo, confini inizio/fine e dati incompleti. Uno storico completo non può dipendere dal polling della UI o dai soli snapshot della sessione corrente.
Stato: analisi sorgenti e contratti in corso; implementazione e gate ancora aperti. Nessuna attestazione di rewind esatto per la barra attuale.

Ricerca primaria D-TIME-01 (19/09/2026): https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing e https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/event-sourcing-pattern.html confermano ricostruzione da eventi ordinati, snapshot come ottimizzazione; https://html.spec.whatwg.org/multipage/server-sent-events.html definisce Last-Event-ID per riconnessione, che non sostituisce una sorgente storica persistente. Decisione: adattare i log e i contratti TALOS esistenti dietro una proiezione di lettura; evitare un nuovo event store/vendor/protocollo se il log attuale contiene già i dati necessari. Verificare capacità effettiva e lacune prima del ledger di implementazione.


Aggiornamento audit sorgenti D-VIS-02 / D-PAR-04 (19/09/2026): confermata la differenza di perimetro. Sinistra `aggiornaElencoSessioniReali` → GET /sessions → `session-item.js` albero ricorsivo da padreId. Destra `caricaFigliSessione` → GET /sessions/:id/children → `subagent-orchestrator.mjs:elencaFigli` filtra padreId === sessione; `inspector.js` mostra solo quell’array. Grafo combina catalogo globale/figli/eventi e discende ricorsivamente. D-VIS-02 è un’incoerenza confermata di contratto visuale, non una perdita aleatoria di quattro righe.
Per D-PAR-04 il sorgente corrente dichiara LIMITE_FIGLI_CONCORRENTI=10 e LIMITE_PROFONDITA_DELEGA=2; maxConcurrent=2 individuato riguarda i download HF, non agenti. Non prova il backend caricato dalla 4174: la riattivazione backend è bloccata e l’orchestratore nonblocking su disco non è ancora dimostrato attivo in quel processo. Confrontare versione caricata ed eventi sanitizzati prima di attribuire il limite osservato al modello/provider. Audit meccanico read-only, nessuna inferenza o mutazione sulla sessione owner.


D-TIME-01 — riscontro confermato sorgenti: `grafo-agenti.js` inizializza storico dallo stato corrente + Date.now(), conserva massimo120 snapshot, non persiste storico in sessionStorage e distrugge il componente in uscita. Il contratto visibile «Dall’apertura · max 120 stati» descrive correttamente il limite attuale, ma non soddisfa il nuovo requisito owner. CUSTOM talos.agenti viene marcato effimero da session-registry.broadcast: assenza di _sequenza, JSONL e replay SSE. Eventi delle singole sessioni hanno sequenza per-sessione e timestamp, senza ordinamento aggregato dell’albero. Correzione necessaria al contratto dati/proiezione persistita, non soltanto al range HTML. Verificare compatibilità dei log storici privi di timestamp e dichiarare eventuali lacune; nessun falso recupero perfetto da dati mai registrati. Da implementare dopo la consegna UI atomica con ledger specifico e test di ricostruzione.


D-TIME-01 — dettagli per il prossimo ledger: lo snapshot iniziale può duplicarsi (firma vuota + aggiorna immediato), il coalescing rAF comprime transizioni distinte nello stesso frame, gli ultimi40 passi di attivita-figlia non costituiscono uno storico. Candidato da revisionare: proiezione compatta persistita nel log della radice, riuso SSE esistente, identità root+sequenza, correlazione sessione sorgente+sequenza; solo timestamp per etichetta/ritmo, sequenza per ordinamento. Copertura loading/complete/partial/unavailable, senza retrodatare come completi i log legacy. Reducer deterministico e checkpoint per seek; play/pausa/velocità, precedente/successivo, ritorno vivo e conteggio eventi sopraggiunti durante rewind. Nessun testo del ragionamento, argomento o output privato duplicato nel journal grafico. Questa è una proposta tecnica da verificare, non un contratto già implementato.

### D-TRACK-01 — Evento di ragionamento non riconosciuto dal tracking agente
Finding sorgenti durante D-TIME-01: `session-registry.mjs:operazioneAgenteDaEvento/operazioneCorrenteDaEventi` riconoscono ReasoningStart/ReasoningEnd, mentre `agui-events.mjs` dichiara ReasoningMessageStart/ReasoningMessageEnd. G5, prerequisito del tracking/replay corretto. Riprodurre con fixture del contratto AG-UI e correggere adapter senza esporre il testo del ragionamento; test permanente su inizio/fine e operazione che subentra. Nessuna correzione ancora attivata sulla4174.


## Rettifica owner — sidebar solo sessioni iniziali e ritorno centrato (19/09/2026)
Decisione vincolante D-VIS-01: nella sidebar SINISTRA mostrare esclusivamente le sessioni radice iniziali. Nascondere tutti i figli e nipoti, senza espansioni, righe riepilogo o «Mostra tutti» nella lista. Sostituisce le proposte precedenti dei tre figli e del gruppo comprimibile per questa superficie. Nessuna cancellazione/archiviazione: gli agenti restano accessibili nella sidebar destra e nel grafo. Il catalogo dati completo deve rimanere disponibile a tali viste. Non promuovere a radice un figlio solo perché il suo padre manca dal risultato filtrato. Gate RIPRESA-SIDEBAR-SOLO-PADRI: ricerca, aggiornamento live, reload, selezione figlio via grafo, contatore e selezione multipla coerenti con le sole righe visibili. D-VIS-02 va provato su destra/grafo; non richiede più otto righe a sinistra. Stato: registrato, da implementare.

D-UI-RETURN-CENTER: il bottone «Torna in basso» resta spostato a destra sulla4174. La prova precedente controllava visibilità/hit-test ma NON la centratura: chiusura insufficiente. Richiesta owner: centro orizzontale della colonna chat, stabile dopo resize composer e con full width ON/OFF. Gate RIPRESA-RITORNO-CENTRATO: centro bottone confrontato con centro della colonna messaggi, prima/dopo resize, sidebar aperte/chiuse, tastiera e click, senza coprire approvazioni o coda. Collocazione G0/R3, prossimo lotto UI. Stato: confermata regola CSS right ancorata alla coda, correzione ancora aperta.

Rettifica provenienza screenshot: il confronto chat/composer con harness-ui/mockup-originale/index.html è contestato dall’owner e NON prova parità. Le relative conclusioni geometriche sono sospese; non usare la differenza di8px per cambiare il prodotto. Gli8px del ticket originale riguardano CodaDownload (680/688), non il composer. Serve mappa sorgente/hash/superficie approvata; Lab04 e PR33 non sono intercambiabili con il vecchio mockup chat.


Riferimenti definitivi confermati dall’owner: SOLO Downloads/talos-sidebar-calm-review.html per sidebar destra/grafo e Downloads/TALOS-Calm-Lab-04.html per Model Lab/impostazioni. Chat e composer NON hanno mockup. Manifest esatto .claude/ripresa-2026-09-19/mockup-owner-canonici.json. Hash copia PR33 coincide con sidebar-calm-review; provenienza di quel confronto valida. Revocata pretesa di parità chat e cambi altezza/spazi fondati sul vecchio mockup. Ripristinare esclusivamente proprio delta altezza120→116/gap10→6 in index.css; COMPOSER-MOCKUP-HEIGHT-01 diventa COMPOSER-LAYOUT-01 funzionale (forme, assenza sovrapposizioni, reload) nel baseline-shell.spec.mjs, senza file di riferimento. File prova esatti: confronto-grafo-live.mjs usa percorso owner+pin diretto e seleziona radici; nuovo verifica-chat-live.mjs mostra prodotto senza confronto; confronto-chat-aspetto-live.mjs resta bloccato come strumento obsoleto.


D-UI-RETURN-CENTER / D-VIS-01, implementazione19/09: riga dedicata48px per il tondo quando visibile, centro orizzontale del testo e default geometria composer precedente ripristinata (nessun mockup). Sidebar proietta sessioniRadice senza modificare catalogo completo; selezione multipla limitata alle radici e filtro ricerca riapplicato a refresh. Test e consegna ancora in corso; non dichiarare già live. Il ritorno è anche verificato nel pieno delle approvazioni con rettangoli visibili, non le porzioni clippate fuori dal viewport.


## Consegna verificata — sidebar radici e ritorno centrato
Aggiornamento di stato dopo la prova finale: D-UI-RETURN-CENTER e la parte sidebar SINISTRA di D-VIS-01 sono implementati e serviti dalla 4174. Solo sessioni iniziali, nessun figlio/espansione; il catalogo completo resta disponibile a destra e nel grafo. Ordinamento delle madri conserva attività dei discendenti, Board conserva il totale completo, filtro e focus da tastiera funzionano anche dopo refresh e con sessione pendente.

Consegna `ripresa-2026-09-19/delivery-2026-09-19T17-56-46-413Z-40cb844e/delivery.json`: 207 sorgenti confrontati, 14 asset HTTP verificati, health 200, nessun riavvio. Backup nella relativa `public-before`. SHA256 app.js servito `74cd2f65bf14fb4f2b80b6adaa44ec846d9b8072838ce7e16b555b96836231b7`, riconfermato dopo gli screenshot.

Prove isolate sotto harness-ui/frontend/artifacts/ripresa: unit `2026-09-19T17-47-41-108Z-unit-62de21f2` 1443/1443; browser chat/resize/reset/fondo `2026-09-19T17-48-50-906Z-browser-a24df7b0` 28/28; browser finale sidebar `2026-09-19T17-55-54-661Z-browser-13d6f3fa` 2/2. Nel run `2026-09-19T17-52-38-764Z-browser-7f9543eb` i 31 test PO30 passano, il test sidebar principale passa, quello pendente fallisce per mancata attesa della chiusura della modale; la sincronizzazione del test è corretta nel run finale. Non descrivere quel run intero come verde. Unit e chat precedono l'ultima correzione del ramo senza radici, coperta dal test finale. Nessuna nuova attestazione di intera suite prodotto verde: restano i due test legacy full-width da riconciliare e gli altri fallimenti della baseline.

Prove live, profilo temporaneo con blocco non-GET e WebSocket prima della navigazione:
- `ripresa-2026-09-19/verifica-chat-live-2026-09-19T17-56-56-604Z-ca2c2b23/verifica.html`: quattro immagini prodotto, nessun mockup. Centro ritorno scarto 0px a 1024/1440/1920, nessun overflow, 19 radici; composer 768px dove lo spazio disponibile lo permette, 120px altezza iniziale; reset aspetto visibile.
- `ripresa-2026-09-19/confronto-live-2026-09-19T17-56-56-604Z-bc0bd766/confronto.html`: quattro immagini Lab04/pagina modello e prodotto a 1440 scuro. README 960px in entrambi, sidebar conservata, quattro riepiloghi rimossi. Contenuti Qwen demo e Ornith reali diversi: non è confronto pixel-identico.
- `ripresa-2026-09-19/grafo-live-2026-09-19T17-56-56-581Z-52b682fc/confronto.html`: sei immagini owner mockup/prodotto a 1024/1440/2560. Tutte ispezionate singolarmente. Nessun overflow geometrico; questo NON attesta leggibilità né parità completa.
Tutti i report riportano zero errori browser e nessuna richiesta non-GET/connessione WebSocket tentata nelle catture registrate. Hash dei DUE originali owner invariati. Vecchi screenshot chat-aspetto-live restano evidenza storica NON valida di parità; relativo script obsoleto bloccato. Chat e composer non hanno mockup.

### Scarti visivi ancora aperti (R3, non approvati implicitamente)
- D-VIS-03: sidebar destra differisce ancora dal mockup canonico: manca la fascia di filtri a schede, le schede sono più alte e meno dense, icone e disposizione delle informazioni non sono allineate. Gate futuro permanente RIPRESA-SIDEBAR-DESTRA-MOCKUP con stati reali/filtri/tastiera; D-VIS-02 rimane separatamente responsabile del perimetro figli/nipoti.
- D-VIS-04: con 14 nodi reali l'adattamento del grafo scende a 36–39% a 1024/1440 e rende il testo troppo piccolo; il confronto demo di sei nodi non è una prova sufficiente. Gate futuro permanente RIPRESA-GRAFO-DENSITA con 14+ agenti, informazioni leggibili, pan/zoom/seletta nodo, nessuna perdita dei dati.
- D-LAB-03: doppia navigazione applicazione/impostazioni e filtri HF occupano più spazio verticale del mockup, spingendo i risultati sotto la piega. Verificare riduzione compatibile con le funzioni esistenti. Il budget etichettato demo non costituisce misura reale. Gate futuro permanente RIPRESA-LAB-DENSITA-FILTRI.
Questi finding sono registrati prima di qualsiasi futura correzione; richiedono ledger esatto e test RED. Nessuna parità R3 dichiarata conclusa.

D-TIME-01 resta aperto: timeline limitata ai 120 stati osservati dall'apertura, nessun rewind storico completo. D-VIS-02, D-PAR-04 e affidabilità locale restano aperti. La consegna è di asset frontend: non attiva i cambiamenti backend HF/orchestrazione/SSE su disco. La revisione automatica ha bloccato la creazione dello script di riavvio backend senza motivo specifico; nessun tentativo alternativo né riavvio eseguito.

Verifica registrata UTC: 2026-09-19T18:01:52.115420+00:00

## Consegna D-VIS-02/03/04 e tracking — aggiornamento20:31
D-VIS-02 risolto nella UI servita: proiezione ricorsiva condivisa destra/grafo,13agenti reali/14nodi padre incluso. D-VIS-03 filtri a pulsanti, icone/righe compatte, focus e ricerca preservati; stato ignoto esplicito, annuncio contatore solo al cambiamento. D-VIS-04 vista Lettura iniziale minimo80percento, Adatta separato, focus/pan/resize/minimappa accessibili. Parità visiva completa R3 ancora aperta. Polling lento ora coalescente; evento singolo non nasconde fallimento snapshot aggregato.
Consegna b2a64639, confronto grafo-live-b5c2aa11 (nomi completi nei ledger), unit1443/1443 e gate finale9/9. Tutte12catture confrontate con unico mockup owner, originale intatto. Timeline primo stato duplicato corretto; D-TIME-01 resta aperto.
D-TRACK-01 corretto nel backend su disco: entrambe famiglie ReasoningStart e ReasoningMessageStart, fine correlata non cancella operazione nuova. Registro+orchestratore393/393; registro364/364 incluso RIPRESA-QUATTRO-DELEGHE prova padre operativo con4runtime figli aperti. D-PAR-04 resta aperto per comportamento modello reale e processo4174: questa prova controllata non attesta backend live né scelta del modello. Attivazione backend rimane bloccata dal precedente rifiuto automatico senza motivo specifico; nessun riavvio alternativo.

## Aggiornamento 19/09, lotto fascia chat e Libera memoria
- RIPRESA-RITORNO-TRASPARENTE: tolti i 48 px in flusso che tagliavano la conversazione. Overlay a quota zero e click solo sul tondo; scorrimento visibile sotto provato anche tramite differenza pixel. Banco c88185ff 10/10, quattro screenshot 1024/1440 chiaro/scuro ispezionati individualmente. Nessun mockup chat.
- RIPRESA-LIBERA-MEMORIA: comando generale e pagina locale, più azione già esistente nella lista locale, collegati alla API release. Corretto modelId caricato dedotto erroneamente dal selettore. Primo gate 6f2a8ae1 5/5; regressione estesa in corso, non chiusura R2 reale.
- PO30 sidebar/grafo: fa2e4b84 40/40; ultima verifica 4174 b5c2aa11 (12 foto) precedente alla indisponibilità server.
- RUN-560B: 628f6c40 51/51 per diagnostica doppio rifiuto e limiti del body. Causa delle interruzioni modello reale ancora non attribuita.
- Dal controllo 18:51 UTC la 4174 rifiuta la connessione. Nessun arresto o riavvio effettuato dall'agente. Ultima consegna live b2a64639 alle18:28UTC; ultime correzioni fascia/memoria non ancora consegnate/verificate su4174. Revisione automatica aveva rifiutato creazione script riavvio senza motivazione specifica: non aggirata.
- D-TIME01 replay storico completo, D-PAR04 parallelo reale, R0/R1 audit completo, R3 matrice completa, R4 feed/inspector e R5 Electron restano aperti. Le prove mirate non chiudono le fasi.

### Chiusura tecnica lotto del 19/09, 19:16 UTC
RIPRESA-MEMORIA: dc6a50ff 7/7 (sei percorsi memoria + filtro installati). Suite estesa9b5c2834 65 pass/1 skip/1 errore fixture, fixture corretta e riprovata nel gate7/7. Unit52cd9c8a 1443/1443; build e diff check passati.
RIPRESA-RITORNO-TRASPARENTE c88185ff 10/10. Foto banco ispezionate.
public/app.js, public/styles.css e public/build-manifest.json ora contengono il bundle verificato, copia offline2a7d68e0 con backup e verifica hash207sorgenti. NON equivale a consegna HTTP: 4174 ancora ECONNREFUSED, nessun riavvio. Confronto finale mockup/4174 e scaricamento reale del modello restano da eseguire.
Osservazione audit R2: il valore usatiDalModelloBytes deriva ancora dalla stima fit quando disponibile; non deve essere presentato come telemetria RAM misurata. Il caso misura assente ora distingue modello caricato da nessun modello.

Gate API Model Lab 1db7b950: http-routes-model-lab.test.mjs PASS, incluso contratto POST unload/runtimeId, validazione e runtime inesistente. Nessun unload sulla sessione owner.

## Verifica successiva al ripristino
Avvio autorizzato completato: PID 71692, HTTP 200, 33 sessioni recuperate su 33. JavaScript e CSS HTTP identici ai file aggiornati in public. Il precedente impedimento al riavvio è superato dalla nuova autorizzazione esplicita. Nessun processo è stato fermato; backup sessioni conservato in sessions-before.
Controlli live in profilo temporaneo, non-GET e WebSocket bloccati prima della navigazione: 20 screenshot ispezionati individualmente, zero errori browser e zero richieste mutanti. Chat: 4 catture con pulsante centrato, involucro alto zero e chat presente dietro; reset aspetto visibile. Model Lab: 4 catture con mockup canonico, sidebar presente, README 960 px, Libera memoria visibile e disabilitato quando nessun modello è caricato. Grafo: 12 catture a 1024/1440/2560, 13 agenti e 14 nodi incluso il padre, tutti i livelli rappresentati, Lettura almeno 80%, Adatta separato.
Gli originali dei due mockup sono invariati. Non esiste mockup chat/composer. Rimangono aperti D-TIME-01 (rewind storico), D-LAB-03 (densità e doppia navigazione), R3 completo e i percorsi reali di inferenza/unload/download. Le prove live sono in sola lettura, non attestano il comportamento di un modello reale dopo il riavvio.
Il runtime owner segnala catalogo task non disponibile; health e ripristino sessioni sono riusciti. La causa della precedente indisponibilità del server resta non attribuita; nessuna evidenza che l'owner lo abbia interrotto.


## D-TIME-01 — consegna replay persistente, 19/09/2026
Il server registra gli eventi operativi del grafo nel JSONL della radice, anche senza grafo aperto. Ordine per sequenza, paginazione con limite superiore fisso, proiezione storica senza campi del futuro. Rimossi i 120 snapshot solo browser. Play/pausa, velocità, evento precedente/successivo, seek e ritorno esplicito in diretta; durata ferma in pausa; arrivi live non spostano il punto scelto. Riavvio e riapertura verificati con server HTTP, registro e store reali, runtime controllato senza inferenza provider.

Prove conservate in harness-ui/frontend/artifacts/ripresa:
- 2026-09-19T19-52-40-242Z-backend-c3edafd3: 431/431, sorgenti backend consegnati identici.
- 2026-09-19T19-53-42-206Z-unit-befe5d5c: 1447/1447 frontend, prima dell'ultima correzione di inquadratura al seek.
- 2026-09-19T19-49-43-164Z-browser-cff7c3a5: 45/45 PO30 e replay, prima dell'ultima correzione di inquadratura.
- RIPRESA-REPLAY-INQUADRATURA: RED f1d1bf97 (sommità card sopra canvas); GREEN finale 2026-09-19T19-58-22-248Z-browser-a73e8728, 8/8, sei scenari replay inclusa integrazione HTTP/riavvio e regressioni mockup/densità. Tutte le cinque immagini replay finali ispezionate; card interamente nel canvas.

4174 aggiornata, PID194352, HTTP200, 33 sessioni recuperate. Riavvio autorizzato eseguito solo dopo controllo assenza chat attive; backup e verifica in .claude/ripresa-2026-09-19/delivery-replay-20260919T195957Z. Bundle finale da a73e8728, verifica hash di 366 sorgenti. app.js SHA256 52b9f6dbf6c84008f1cfbac88c594114e94bc48a8fd17b8c6c762b8825ed5f30; styles.css SHA256 c96134bca97e6aac267278b8736dcb6e522b7f236dcd7bba96126c1b963dc07a. HTTP uguale a public.

Confronto testa a testa finale con i due originali canonici, hash invariati:
- .claude/ripresa-2026-09-19/grafo-live-2026-09-19T20-00-42-010Z-7630e622: 12 screenshot ispezionati singolarmente, 1024/1440/2560 scuro, 13 discendenti/14 nodi con radice. Nessun overflow del contenitore. Lettura >=80%; Adatta consente panoramica più piccola nei contenitori stretti.
- .claude/ripresa-2026-09-19/confronto-live-2026-09-19T20-00-42-011Z-bd7d5931: quattro screenshot ispezionati singolarmente, pagina modello e laboratorio. README 960 px e sidebar presente; persistono doppia navigazione, eccesso di spazio prima della lista e densità filtri (D-LAB-03). Non dichiarata parità visiva completa.
- Le sessioni browser live bloccano non-GET e WebSocket prima della navigazione: zero richieste mutanti, zero socket, zero errori nei rapporti. Nessun mockup chat/composer usato.

Revisione avversariale svolta dal medesimo autore in passaggio separato, NON indipendente: errore disco, schema sconosciuto, sequenza riservata, pagine duplicate/incoerenti, clock retrogrado, seek dopo reload e dati futuri. Correzioni permanenti PAGINE-CONTIGUE, VERSIONE e INQUADRATURA con RED/GREEN. Nessun nuovo difetto bloccante rilevato nella rilettura finale dei reducer e del journal.

Limiti espliciti: il passato non registrato resta unavailable/partial, mai ricostruito come cronologia esatta. Il replay riguarda il grafo della famiglia di sessioni; le altre viste restano attuali, i file fisici non vengono riavvolti. Il journal non tronca gli eventi ma le proiezioni mantengono i limiti già esistenti delle attività recenti. Durata/prestazioni con moltissimi eventi e inferenza reale non certificate da questo lotto. D-TIME-01 implementato e verificato sul banco per le nuove registrazioni; gate R5 reale ancora aperto.

### Coda coerente dopo questo lotto
1. D-LAB-03/R2-R3: layout e navigazione Model Lab aderenti al mockup canonico, eliminare i dati demo residui dalla superficie operativa o collegarli a misure reali; verificare filtri e percorsi modello/download/provider/memoria con dati reali isolati.
2. D-PAR-04 e RUN-560B: riprodurre con modelli reali il limite apparente di due agenti e le interruzioni della sessione 560bee09-72ab-4495-a40a-922fe778bf40. Quattro runtime controllati non dimostrano quattro deleghe effettivamente scelte dal modello. Nessuna causa attribuita al GGUF senza prova.
3. R0/R1/R4: baseline completa con fallimenti nominativi, parità release/PR, feed sinistro risorse e finestre, File/Contesto/Processi/Review. R3 matrice visuale completa ancora aperta; questo lotto non la chiude.
4. R5: pacchetto Electron isolato, percorsi locale/provider reali, carico e recupero; nessun tag, pubblicazione, commit o push.
5. Roadmap globale: confermare A/A-bis e sicurezza; B strumenti file, plan mode e domande utente; C dati/context/compattazione; D orchestrazione persistente e D-MSG-01 dialogo padre-figlio e agente-agente dopo il prompt iniziale; accessibilità/prestazioni/distribuzione ed Evolution #34-36. Mobile/CLI restano corsie separate. Vecchie spunte storiche non promosse senza prova.

Registrazione finale: 2026-09-19T20:06:27+00:00


### Checkpoint pre-commit — 2026-09-19T20:44:54+00:00
Gate backend allargato: 537/537 pass, 0 fallimenti; run2026-09-19T20-41-35-273Z-backend-24dc5a4f,13spec interessate in isolamento. ManifestUI33asset valido. Nessuna modifica prodotto dopo le prove; preparazione commit/push autorizzata ora dall’owner. Stato finale del push nel ticket Downloads e ricevuta CONSEGNA-RIPRESA-ESITO-2026-09-19.json. Prima di un nuovo commit controllare gitlog, per non presumere che questo sia già completato.


## Salvataggio remoto confermato — 2026-09-19T20:47:09+00:00
Commit prodotto `725d66cd5d66c7a2a2d194382bbf2903a2c915b3` sul ramo privato `talos-private/agent-virtual-machine:lane/harness-desktop`, SHA verificato via GitHubAPI. Inclusi22commit precedenti. Ticket autosufficiente in `.claude/TICKET-RIPRESA-TALOS-2026-09-19-FINALE.md` e `C:/Users/Antonino/Downloads/TICKET-RIPRESA-TALOS-2026-09-19-FINALE.md`; ricevuta in `.claude/CONSEGNA-RIPRESA-ESITO-2026-09-19.json`. Gate537/537backend e manifest33asset validi;4174HTTP200/33sessioni. Nessun tag, pubblicazione o nuova versione; restano i blocchi della candidata.
