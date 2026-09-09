# Taccuino visivo — Harness UI sul Pad

Data: 2026-08-25  
Superficie: TALOS UI mobile, Harness demo debug-only  
Metodo: revisione `frontend-design` in due passaggi, prima composizione e
gerarchia dell'intero schermo, poi tipografia, spaziatura, token, collisioni,
stati, controlli, scroll, tastiera e safe area.

## Riapertura 25/8 — testata instabile durante fling

| ID | Cosa si vede | Viewport/prova | Gravità | Destinazione | Stato |
|---|---|---|---|---|---|
| VIS-TOPBAR-FLAP-01 | Due fling reali consecutivi entrambi verso il basso producono prima la testata nascosta e poi la stessa testata nuovamente visibile. Il secondo stato è falso: non c'è stato alcun gesto verso l'alto. | Pad, tablet landscape, `code-topbar-spasm-before.png`, `code-topbar-spasm-fling-1.png`, `code-topbar-spasm-fling-2.png` | Bloccante | `CODE-TOPBAR-NO-FLAP-01` | Aperto |

Correzione dell'ispezione dopo la fermata owner: rail sessioni e context rail
restano sopra il fondo animato, ma il composer **non** è correttamente ancorato:
si estende sotto l'intera colonna Contesto. La precedente frase «composer
ancorato e intero» era un falso positivo e viene ritirata. Safe area e run strip
non collidono; nessuna scrollbar è visibile. Le regressioni nuove sono quindi
due: la testata che riappare mentre la posizione del transcript continua ad
avanzare e il dock agganciato al contenitore esterno invece che alla sola
conversazione. La
sequenza dimostra anche la causa: il difetto si presenta vicino al fondo, dove
la maggiore altezza disponibile forza il browser a ridurre il massimo di
scroll. Il gate di chiusura richiede la stessa sequenza ripetuta in tutte le
quattro forme e una vera inversione che faccia riapparire la testata una volta
sola.

| ID | Cosa si vede | Viewport/prova | Gravità | Destinazione | Stato |
|---|---|---|---|---|---|
| VIS-COMPOSER-CONTEXT-01 | Il composer condiviso attraversava il bordo fra conversazione e Contesto e occupava quasi tutta la larghezza inferiore del rail. Non era una scelta di densità: il dock usava i confini della tool surface, non quelli della `.workspace-shell`. | RED: `tablet-landscape-open.png`. GREEN solo logico/simulato: `tablet-landscape-context-open.png`, `tablet-landscape-context-closed.png` | Bloccante | `CODE-COMPOSER-CONTEXT-RAIL-01` | GREEN tecnico; landscape fisico ancora rosso |
| VIS-COMPOSER-MAX-WIDTH-01 | Con entrambi i rail chiusi il composer seguiva correttamente la workspace, ma diventava eccessivamente largo rispetto alla colonna conversazione. Ora si ferma al limite già progettato di 920px e resta centrato, senza cambiare componente. | Pad fisicamente landscape: `code-max-width-all-rails-closed.png`, `code-max-width-all-closed-down-1.png`, `-down-2.png`, `-down-3.png`, `code-max-width-all-closed-up.png`, `code-max-width-rails-reopened-final.png` | Bloccante | `CODE-COMPOSER-MAX-WIDTH-01` | GREEN |

La matrice resta sospesa. La prima prova GREEN deve essere nuovamente tablet
landscape con Context rail aperto, chiuso e riaperto; l'intero fotogramma verrà
ispezionato prima di promuovere qualunque altra forma.

### Esito tablet landscape fisico — larghezza massima e stabilità

Il Pad è stato ruotato materialmente; ogni PNG della nuova sequenza è stato
letto dai byte come 3392×2400 e ispezionato per intero. Con entrambi i rail
chiusi il composer visibile misura 920 CSS px dentro una workspace di 1220,19px,
con 150,095px liberi e uguali su entrambi i lati. Visivamente è allineato alla
colonna delle schede e dei messaggi, non ai bordi dell'intero schermo. Con lista
sessioni e Context riaperti torna fluido: 728,19px dentro 752,19px, margini
12/12px, nessuna invasione del rail.

La sonda iniziale aveva letto la prima delle due istanze DOM, il composer Chat
sottostante e nascosto con `visibility:hidden`; per questo riportava
erroneamente 1196,19px e `max-width:none`. L'enumerazione completa ha mostrato
la seconda istanza, visibile e contenuta nel dock Codice, larga esattamente
920px. La sonda è stata quindi ancorata al dock prima di accettare il gate.

Nei tre frame `code-max-width-all-closed-down-1/2/3.png` la testata resta
ritratta senza spasmi; `code-max-width-all-closed-up.png` la ripristina soltanto
dopo la vera risalita. Composer, run strip, sfondo procedurale, consenso e
status bar restano puliti; nessuna scrollbar o contenuto irraggiungibile.
Esito: **GREEN tablet landscape fisico** per
`CODE-COMPOSER-MAX-WIDTH-01`, `CODE-COMPOSER-CONTEXT-RAIL-01` e
`CODE-TOPBAR-NO-FLAP-01`.

### Esito telefono landscape con Pad fisicamente orizzontale

La prima configurazione è stata scartata: su questo Pad ruotato l'OS scambia le
dimensioni richieste e `wm size 2400x1080` aveva prodotto davvero 1080×2400.
Con l'override inverso `wm size 1080x2400`, density 440 e riavvio a freddo, il
PNG è risultato realmente 2400×1080; nav telefono presente e nessun rail tablet
residuo. Tutti i frame sono stati ispezionati per intero.

`phone-landscape-physical-open.png` mostra il composer condiviso nella forma
compatta a una riga, interamente sopra la bottom navigation. Nei tre frame
`phone-landscape-physical-down-1/2/3.png` la testata resta nascosta e il
contenuto passa progressivamente sopra il dock: al secondo scroll il messaggio
utente è intero, al terzo lo è quello assistente. Nessun contenuto resta quindi
irraggiungibile dietro composer o nav. `phone-landscape-physical-up.png`
ripristina la testata soltanto alla vera risalita. Sfondo, status bar, run strip,
testo e azioni restano puliti; nessuna scrollbar visibile.

Esito: **GREEN telefono landscape**. Al termine sono stati eseguiti
`wm size reset` e `wm density reset`; il device riporta nuovamente dimensione
fisica 2400×3392 e density 420.

### Esito viewport landscape simulata dopo la correzione

Tutti i sei PNG sono stati letti dai byte come 3392×2400 e ispezionati per
intero. L'owner ha però chiarito che il Pad era fisicamente verticale: questi
fotogrammi sono quindi prova di layout logico, **non prova reale del tablet
orizzontale**. Con Context aperto il composer ha margini omogenei dentro la sola
workspace e termina prima della linea verticale del rail; Context e sidebar
globale restano completamente liberi. Con Context chiuso il dock si allarga
fino al bordo destro della workspace, conservando lo stesso margine; riaprendo
torna alla misura precedente. Lo sfondo procedurale resta visibile soltanto
come fondale e non altera il contrasto di testo o pannelli.

`tablet-landscape-down-1.png`, `-down-2.png` e `-down-3.png` mostrano la topbar
ritratta e stabile dopo tre fling nella stessa direzione. Run strip, Context
rail e composer non cambiano posizione né larghezza. `tablet-landscape-up.png`
mostra la testata nuovamente visibile dopo una vera risalita. Nessuna scrollbar,
collisione con la barra di sistema, sovrapposizione del composer o ricomparsa
spuria della testata. Esito: **GREEN simulato**; gate del dispositivo
orizzontale ancora rosso e da ripetere dopo rotazione fisica.

### Esito tablet portrait fisico

Il Pad è stato riportato a `wm size reset` e `wm density reset`, nella sua
posizione fisica verticale. I cinque PNG sono 2400×3392:
`tablet-portrait-physical-open.png`, `tablet-portrait-physical-down-1.png`,
`-down-2.png`, `-down-3.png`, `tablet-portrait-physical-up.png`.

La larghezza del composer non viene giudicata qui, perché la regressione owner
si manifesta in landscape. Per `CODE-TOPBAR-NO-FLAP-01`, invece, la prova è
valida: tre fling consecutivi verso il basso mantengono la testata ritratta; la
risalita la ripristina. Sidebar globale, run strip, sfondo procedurale, consenso,
activity feed, composer e barra di sistema sono stati ispezionati per intero:
nessuna scrollbar, sovrapposizione o tremolio. Esito tablet portrait fisico:
**GREEN per la regressione topbar**.

### Esito telefono portrait simulato sul Pad verticale

Dopo un primo override scartato perché il PNG era 2400×1080, il valore è stato
corretto a `wm size 1080x2400`, density 440, con riavvio a freddo. Il byte header
di `phone-portrait-open.png` conferma 1080×2400. Anche
`phone-portrait-down-1.png`, `-down-2.png`, `-down-3.png` e
`phone-portrait-up.png` sono stati ispezionati integralmente.

La topbar resta ritratta in tutti e tre i fling discendenti e torna al gesto
inverso. Il primo frame durante il movimento mostra la parte inferiore del
consenso dietro il composer fisso; il frame successivo porta l'intera card e i
due pulsanti sopra il dock, quindi il contenuto resta raggiungibile e la
clearance non è persa. Safe area, run strip, sfondo, composer e bottom navigation
restano stabili; nessuna scrollbar. Esito telefono portrait: **GREEN per
`CODE-TOPBAR-NO-FLAP-01`**. Nessuna inferenza sulla regressione width landscape.

## Regola di prova

Ogni screenshot deve avere: dimensioni PNG lette dai byte; viewport dichiarato;
stato e gesto che lo hanno prodotto; ispezione dell'intero fotogramma; esito.
Il nome del file non dimostra né orientamento né layout. Dopo un cambio da tablet
a telefono orizzontale si forza il riavvio del processo e si verifica che il
rail tablet sia assente: il guard anti-tastiera può conservare lo split se si
cambia soltanto `wm size` durante lo stesso processo.

## Baseline Fase 1 — set riesaminato integralmente

Prove:
`C:\Users\Antonino\AppData\Local\Temp\talos-harness-fixes-20260825-phase1`.
Tredici PNG riesaminati per intero il 25/8; dimensioni già verificate: tablet
3392x2400/2400x3392, telefono 2400x1080/1080x2400.

### Discrepanze aperte

| ID | Cosa si vede | Viewport/prova | Gravità | Destinazione | Stato |
|---|---|---|---|---|---|
| VIS-RAIL-01 | Il rail delle sessioni Harness occupa sempre tutta la larghezza e non offre un comando di compressione. | Tablet verticale e orizzontale, `*-base.png` | Alta | Fase 2 | Risolta e verificata |
| VIS-COMPOSER-01 | Il composer non resta ancorato al fondo del riquadro: in verticale è tagliato dalla barra inferiore e copre l'ultima parte della risposta. | `tablet-portrait-base.png`, `phone-portrait-base.png` | Critica | Fase 3 | Aperta |
| VIS-KEYBOARD-01 | Con palette e tastiera sul telefono verticale, la metà bassa diventa un blocco uniforme e l'ultima voce della palette resta troncata: stato e uscita non sono leggibili. | `phone-portrait-command-open-fixed.png` | Critica | Fase 3 | Aperta |
| VIS-PALETTE-01 | Badge demo e chiusura della palette sono troppo vicini; sul telefono il controllo di chiusura appare compresso/ambiguo sotto al badge. | Palette tablet e telefono | Alta | Fase 5 | Aperta |
| VIS-STEPS-01 | La timeline dei passi sulla scheda Missione termina con testo parziale (`Re…`) e una scrollbar orizzontale poco esplicita. | `phone-portrait-base.png` | Media | Fase 5 | Aperta |
| VIS-VERTICAL-RHYTHM-01 | Tra header TALOS, intestazione sessione e contenuto Harness resta molto spazio verticale non informativo sul telefono; riduce il contenuto utile prima del composer. | `phone-portrait-base.png` | Media | Fase 3/6 | Aperta |
| VIS-TYPOGRAPHY-01 | Densità, corpo e gerarchia del mockup incorporato appaiono diversi dal guscio TALOS: il passaggio tra rail/header nativi e contenuto è percepibile come due prodotti cuciti. | Tutte le baseline | Alta | Fase 6 | Aperta |
| VIS-DRAWER-SHORT-01 | Nel drawer globale della forma larga e bassa compare l'intestazione `RECENTI` senza righe visibili; gli strumenti proseguono oltre il fondo e richiedono verifica di scroll completo. | `phone-landscape-global-menu-fixed.png` | Media | Fase 5 | Aperta |
| VIS-ANIMATION-CAPTURE-01 | Uno screenshot del drawer verticale è stato catturato durante l'animazione: marchio e contenuti risultano tagliati a sinistra; il file successivo assestato è corretto. | `tablet-portrait-global-menu-fixed.png` vs `*-settled.png` | Procedurale | Tutte le fasi | Gate attivo |
| VIS-VIEWPORT-TRUTH-01 | I due PNG chiamati `phone-landscape-*` mostrano ancora il rail tablet. Il cambio `wm size` è avvenuto nello stesso processo e il guard anti-tastiera ha mantenuto il layout precedente. Non sono prova valida del layout telefono orizzontale. | `phone-landscape-base.png`, `phone-landscape-global-menu-fixed.png` | Critica/procedurale | Rifare da Fase 2 | Risolta proceduralmente; gate permanente |
| VIS-COLLAPSED-CONTENT-01 | Dopo compressione e riavvio, la lista Chat viene montata dentro il rail Harness da 72px: ricerca, date e menu si impilano in una colonna illeggibile. | Fase 2, `phase2-tablet-landscape-persisted.png` | Critica | Fase 2 | Risolta, test permanente |

### Elementi coerenti da preservare

- Drawer globale finalmente sopra station, backdrop e palette Harness.
- Marchio TALOS e iconografia Lucide coerenti nel guscio.
- Dichiarazione `Demo UI · non collegato` sempre visibile nelle prove baseline.
- Palette confinata nel riquadro, senza top layer nativo dopo la cura Fase 1.
- Rail Harness unico: nessuna seconda sidebar interna duplicata.

## Checklist per ogni nuova matrice

1. Fotogramma intero: gerarchia, quantità di spazio utile, continuità col guscio.
2. Intestazioni: status bar, safe area, marchio, ritorno/hamburger, titoli.
3. Rail/drawer: z-order, stato attivo, compressione, scroll, fondo raggiungibile.
4. Harness: badge demo, toolbar, stato esecuzione, missione, transcript, pannelli.
5. Composer/nav: ancoraggio, sovrapposizioni, ultimo controllo, tastiera aperta e chiusa.
6. Tipografia/token: font realmente caricati, scala, contrasto, bordi, ombre e tema live.
7. Interazioni: feedback visibile, stato inverso, chiusura, persistenza e riavvio.
8. Verità del viewport: dimensioni PNG, DOM tablet/phone atteso, screenshot assestato.

Le osservazioni fuori dalla fase corrente restano aperte con il loro ID; non
autorizzano una correzione anticipata e non vengono cancellate da uno screenshot
successivo più favorevole.

## Fase 2 — rail comprimibile, matrice completa

Prove:
`C:\Users\Antonino\AppData\Local\Temp\talos-harness-fixes-20260825-phase2`.
Tredici PNG ispezionati integralmente in due passaggi il 25/8, compresi i tre
fotogrammi che documentano il difetto intermedio e non soltanto gli esiti
favorevoli. Dimensioni lette dai byte:

- tablet orizzontale: 7 fotogrammi da 3392x2400;
- tablet verticale: 2 fotogrammi da 2400x3392;
- telefono orizzontale: 2 fotogrammi da 2400x1080;
- telefono verticale: 2 fotogrammi da 1080x2400.

Il conteggio comprende `phase2-current.png` e lo screenshot Chat; la matrice
Harness finale comprende entrambi gli orientamenti e le due forme. Ogni cambio
tablet/telefono è stato seguito da `force-stop` e riapertura. Il DOM ha
confermato `tablet:false` nelle due forme telefono: i vecchi falsi positivi di
Fase 1 non sono stati riutilizzati.

### Esiti chiusi nella fase

- Rail Harness aperto: elenco completo, controllo di compressione raggiungibile,
  nessuna collisione con header o contenuto.
- Rail Harness compresso: larghezza reale 72px, restano soltanto hamburger ed
  espansione; non vengono montate né la lista Harness né la lista Chat; il
  contenuto centrale usa lo spazio liberato e il divisore superfluo scompare.
- Stato local-first: dopo arresto e riapertura dell'app il DOM resta compresso a
  72px. La prova inversa riapre il rail e restituisce l'elenco completo.
- Chat non è stata coinvolta dalla preferenza Harness: con la preferenza ancora
  `true`, il rail Chat misurato è `collapsed=false`, 323px e mantiene ricerca e
  lista. Il test permanente copre lo stesso contratto.
- Telefono verticale e orizzontale: nessun rail tablet presente. Lista e
  dettaglio restano nel percorso telefono già esistente.

### Discrepanze annotate durante l'intera ispezione

| ID | Cosa si vede | Viewport/prova | Gravità | Destinazione | Stato |
|---|---|---|---|---|---|
| VIS-PHONE-DETAIL-RHYTHM-01 | La freccia indietro e il titolo Harness sono visibili e corretti in entrambe le forme. Il difetto reale è l'ampia fascia verticale vuota tra quell'header TALOS e il contenuto Harness; in landscape sottrae una quota critica a un'altezza già ridotta. | `phase2-phone-portrait-detail-cold.png`, `phase2-phone-landscape-detail-cold.png` | Alta | Fase 3 | Aperta |
| VIS-CHEVRON-SEMANTICS-01 | Nel tablet a rail aperto, il chevron di compressione e la freccia indietro della station appaiono nella stessa fascia superiore e puntano entrambi a sinistra. Le etichette accessibili sono corrette, ma il significato visivo è distinguibile quasi soltanto dal contenitore. | `phase2-tablet-landscape-expanded-fixed.png`, `phase2-tablet-portrait-expanded-fixed.png` | Media | Fase 6 | Aperta |
| VIS-LIST-SCROLL-SHORT-01 | Nella lista telefono orizzontale l'ultima sessione (`Prepare release notes`) resta parzialmente tagliata al bordo inferiore. Occorre provare lo scroll fino alla fine e lasciare visibile l'ultima riga, non dedurlo dal fatto che esista nel DOM. | `phase2-phone-landscape-list-cold.png` | Alta | Fase 5 | Aperta |
| VIS-INCIDENTAL-CHAT-01 | Lo stato Chat usato per provare che il suo rail non cambia mostra due errori `TALOS_LLAMA_NO_CHAT_TEMPLATE` e percorsi grezzi del modello. È una condizione preesistente della Chat, estranea alla Harness e non toccata. | `phase2-tablet-landscape-chat-unaffected.png` | Alta, fuori perimetro | Segnalazione owner | Aperta, non autorizza fix |

Restano inoltre confermate, non attenuate dalle immagini favorevoli,
`VIS-COMPOSER-01`, `VIS-KEYBOARD-01`, `VIS-STEPS-01`,
`VIS-VERTICAL-RHYTHM-01` e `VIS-TYPOGRAPHY-01`. In particolare il composer è
ancora tagliato/coperto dal bordo inferiore nelle forme telefono e il dettaglio
telefono non usa bene l'altezza disponibile. La freccia indietro è presente:
non va duplicata. Sono il blocco esplicito della Fase 3, non lavoro dichiarato
concluso nella Fase 2.

## Fase 3 — host, composer, tastiera e veri scrollport

Prove:
`C:\Users\Antonino\AppData\Local\Temp\talos-harness-fixes-20260825-phase3`.
Quarantadue PNG sono stati aperti e ispezionati integralmente il 25/8, inclusi
i fotogrammi RED e le correzioni intermedie. Le prove finali coprono tablet e
telefono, portrait e landscape, stato iniziale, fondo reale del transcript e
tastiera nativa. I fotogrammi Board, Review, palette e drawer globale sono
stati controllati anche quando servivano a scoprire problemi di una fase
successiva.

### Esiti chiusi nella fase

- Il contenuto Harness usa l'altezza del riquadro reale, non l'altezza teorica
  dello schermo. Composer e barra inferiore non escono più sotto la station.
- Il composer resta ancorato dopo lo scroll. Nella prova telefono landscape il
  transcript ha raggiunto `1181.45/1182px` e la sua posizione è rimasta
  invariata; sul telefono portrait è stato raggiunto anche il vero ultimo
  messaggio, non soltanto il fondo apparente dentro il diff.
- La tastiera nativa viene comunicata esplicitamente da Capacitor. In portrait
  il composer sale sopra Gboard e la nav ritorna alla chiusura; in landscape
  header, run strip e nav cedono temporaneamente lo spazio necessario e la
  status bar resta libera.
- Il layout telefono largo e basso non cade più nel ramo desktop: mantiene una
  nav touch e un composer compatto. Il drawer globale corto è ora realmente
  scrollabile fino alla voce Harness e al footer.
- Tablet portrait e landscape conservano struttura completa, rail Harness e
  context rail quando lo spazio lo consente. Board e Review restano
  raggiungibili; le loro incongruenze specifiche sono annotate sotto.

### Discrepanze annotate durante l'intera ispezione

| ID | Cosa si vede | Viewport/prova | Gravità | Destinazione | Stato |
|---|---|---|---|---|---|
| VIS-DEMO-BADGE-TEXT-01 | Il badge `Demo UI · non collegato` si sovrappone al testo del transcript in telefono landscape; con la tastiera aperta la collisione è evidente sull'unica riga utile. | `phase3-phone-landscape-scroll-end-final.png`, `phase3-phone-landscape-keyboard-final-scrollfix.png` | Alta | Fase 5 | Aperta |
| VIS-PALETTE-X-COLLISION-01 | Nella palette il badge demo affolla/copre la X di chiusura in landscape, sia con tastiera sia senza. | `phase3-phone-landscape-command-palette.png`, `phase3-phone-landscape-palette-keyboard-hidden.png` | Alta | Fase 5 | Aperta |
| VIS-PALETTE-BACK-01 | Il tasto Back Android chiude la palette ma nello stesso evento torna anche dal dettaglio alla lista Harness. Manca il consumo esclusivo del primo Back. | `phase3-phone-landscape-after-palette-back.png` e navigazione osservata | Alta/funzionale | Fase 5 | Aperta |
| VIS-NESTED-SCROLL-TRAP-01 | Uno swipe che parte dentro il diff non muove il transcript: il codice trattiene il gesto. Lo scroll arriva al fondo soltanto partendo da una riga esterna al `<pre>`. | telefono portrait, confronto `scroll-end*`/`scroll-true-end-final` | Alta | Fase 5 | Aperta |
| VIS-BOARD-HONESTY-01 | La Board mobile parla di campagne TALOS-BANCO, allowlist e server locale non disponibile, ma non dichiara subito che tutta la superficie è demo-only e senza backend mobile. | `phase3-tablet-landscape-board-final.png` | Alta/prodotto | Fase 5 | Aperta |
| VIS-REVIEW-BADGE-BUTTON-01 | Il badge demo invade il margine superiore del pulsante `Approva tutto`. | `phase3-tablet-landscape-review-final.png` | Alta | Fase 5 | Aperta |
| VIS-BADGE-MULTI-SURFACE-01 | Altre collisioni già osservate: badge sul meta del bundle Browser, sull'intestazione `PERMESSO RICHIESTO` e sull'icona link di `Ambiente`. Non è un caso isolato della Chat. | telefono portrait e rail Context durante la matrice | Alta | Fase 5 | Aperta |
| VIS-COMPOSER-LANDSCAPE-DENSITY-01 | Anche corretto, il composer a una riga occupa una quota molto alta della piccola area landscape; è funzionale ma lascia una sola riga di contenuto. Modello e permessi non sono visibili direttamente. | `phase3-phone-landscape-base-final-scrollfix.png` | Media | Fase 5/6 | Aperta; verificare sheet capability |
| VIS-STEPS-CLIP-02 | La timeline `Responsive pass` resta parzialmente tagliata con una scrollbar orizzontale poco leggibile sul telefono portrait. | `phase3-phone-portrait-base-scrollfix-final.png` | Media | Fase 5 | Aperta |
| VIS-CHAT-ERROR-LONG-PATH-01 | Nella Chat estranea alla Harness, il percorso locale del modello esce visivamente dalla card di errore. È stato visto mentre si controllava il ritorno dalla station. | `phase3-tablet-landscape-chat-return.png` | Media, fuori perimetro | Segnalazione owner | Aperta, nessun fix autorizzato |

### Correzioni rispetto alle prime baseline

`VIS-COMPOSER-01`, `VIS-KEYBOARD-01`, `VIS-VERTICAL-RHYTHM-01` e
`VIS-DRAWER-SHORT-01` sono risolte per la geometria coperta dalla Fase 3. La
riduzione dello spazio vuoto non elimina il problema generale di densità e
continuità visiva, che resta correttamente assegnato alla Fase 6. Il badge
demo resta presente e onesto, ma la sua collocazione non è ancora sicura:
visibilità e assenza di collisioni sono requisiti distinti.

## Fase 4 — la rotta e la sessione mostrata coincidono

Prove:
`C:\Users\Antonino\AppData\Local\Temp\talos-harness-fixes-20260825-phase4`.
Quindici PNG sono stati aperti e ispezionati integralmente il 25/8. La matrice
comprende tutte e cinque le sessioni nel tablet landscape, una sessione valida
e il deep-link invalido in tablet portrait, telefono portrait e telefono
landscape, più il ritorno reale dall'empty-state. I due screenshot RED dello
stato invalido grezzo sono conservati e non usati come prova finale.

### Esiti chiusi nella fase

- Ogni riga nativa cambia davvero l'URL Vue, la riga evidenziata nel rail, il
  titolo Harness, la selezione del runtime statico e il titolo principale di
  `Session topology`. Le cinque identità sono state misurate nel DOM oltre che
  lette a schermo.
- Il rail tablet mostra una sola riga corrente con evidenziazione e
  `aria-current="page"`; quando l'id è invalido nessuna riga finge di essere
  selezionata.
- Lo stesso componente Vue viene riusato passando da una sessione all'altra:
  il mockup non viene abbandonato e non c'è navigazione top-level.
- Un id sconosciuto non carica né esegue il bundle statico. Mostra un
  empty-state TALOS centrato, con titolo, spiegazione e pulsante reale. Sul
  tablet il ritorno segue il contratto esistente e apre la sessione predefinita
  accanto al rail; sul telefono torna alla lista.
- L'empty-state finale entra interamente nelle quattro forme, non invade safe
  area o bordo e mantiene una gerarchia leggibile anche nel telefono
  landscape.

### Discrepanze e limiti annotati

| ID | Cosa si vede | Viewport/prova | Gravità | Destinazione | Stato |
|---|---|---|---|---|---|
| VIS-UNKNOWN-RAW-01 | Il primo stato invalido era una riga di testo appoggiata sotto l'header, senza gerarchia né azione e con quasi tutto lo schermo vuoto. | `tablet-landscape-unknown-session.png` | Alta | Fase 4 | Risolta e verificata |
| VIS-SESSION-BODY-IDENTICAL-01 | Le cinque identità aggiornano correttamente navigazione e titoli, ma Missione, transcript, branch e strumenti restano la stessa fixture. È una limitazione visibile della demo, non cinque sessioni reali. | Tutti i cinque `tablet-landscape-*.png` validi | Media/prodotto | Contratto demo owner | Accettata finché resta il badge demo; nessun backend finto |
| VIS-SESSION-SELECTOR-TRUNCATION-01 | Con rail tablet aperto, i selettori modello/permessi/branch del composer centrale vengono abbreviati molto; restano toccabili ma la leggibilità del contesto dipende dai relativi sheet. | tablet portrait e landscape validi | Media | Fase 5/6 | Aperta |

Restano confermate le collisioni badge/Context, la timeline troncata e la
densità del composer già assegnate alle Fasi 5 e 6. La Fase 4 non le ha
peggiorate né mascherate. Il fatto che il corpo demo sia condiviso è dichiarato
qui esplicitamente: collegare dati reali o inventare cinque backend diversi è
fuori perimetro e contrario alla decisione owner.

## Fase 5 — Codice completo lato UI, collisioni e verità degli stati

Prove:
`C:\Users\Antonino\AppData\Local\Temp\talos-code-phase5-20260825`.
Gli **88 PNG** presenti nella cartella sono stati aperti e ispezionati per
intero il 25/8, compresi gli stati RED e le correzioni intermedie. La matrice
finale copre tablet e telefono, portrait e landscape, liste, dettagli, inizio e
fine di ogni scroll, tastiera reale, drawer globale, rail sessioni, inspector,
palette e tutte le superfici del mockup.

### Esiti chiusi nella fase

- Ogni testo prodotto visibile usa `Codice` in italiano o `Code` in inglese.
  Gli identificatori tecnici Harness restano interni per non rompere contratti.
- La testata duplicata è stata rimossa: il dettaglio inizia direttamente da
  `Refactor auth flow` o dal titolo della sessione selezionata. Il telefono ha
  un solo ritorno; il tablet non ne duplica uno.
- Il padding esterno della station è stato eliminato soltanto per Codice. La
  Chat centrale usa ora il gutter interno responsive e non appare più come un
  riquadro stretto dentro un secondo riquadro.
- Il drawer globale è realmente sopra contenuto Codice, rail delle sessioni e
  inspector. Le prove tablet portrait e landscape mostrano backdrop e pannello
  davanti a tutta la station, non sotto la finestra centrale.
- Il rail delle sessioni resta comprimibile e riapribile sul tablet. Telefono
  portrait e landscape usano lista e dettaglio, senza rail tablet residuo.
- Composer e navigazione restano ancorati; Gboard sposta il composer sopra la
  tastiera e la chiusura restituisce il layout originario.
- Chat, Split, Board, Review, Terminale, Browser, Automazioni, Impostazioni,
  inspector, palette, pannelli e comandi sono stati azionati. Le azioni demo
  mostrano feedback locale onesto; non fingono processi, rete o salvataggi.
- Board dichiara subito che non usa TALOS-BANCO sul telefono; Terminale mostra
  `pty demo`, non una PTY attiva inesistente. Impostazioni è raggiungibile dal
  pannello di controllo anche quando la sidebar statica non viene montata.
- Palette, badge demo e toast non coprono più X, testo, composer, bottoni o nav.
  Nella forma larga e bassa il toast resta in una riga contenuta nel viewport;
  la prova inversa su Automazioni lascia 8px dal primo controllo.
- Review, Browser e tutte le viste non-Chat raggiungono il loro vero fondo
  senza coda vuota né contenuto nascosto sotto la nav. Gli swipe nel diff non
  intrappolano più lo scroll esterno.
- I tre pulsanti di modalità dichiarano uno stato vero: in Browser, Review,
  Terminale, Automazioni o Impostazioni nessuno finge che Chat sia attiva;
  tornando a Chat, solo Chat torna selezionata e `aria-pressed=true`.
- Il Back Android chiude prima il livello transitorio più interno e non
  attraversa due livelli nello stesso gesto.

### Misure e fotogrammi decisivi

- Toast Chat landscape: `x=484.7–864.7` dentro viewport da 872px;
  `y=148–187.95`, senza collisione con composer o nav.
- Toast Automazioni landscape: fondo `195.95px`; primo controllo a
  `203.73px`, quindi 8px di separazione reale.
- Browser landscape al fondo: preview e shell terminano a `324.81px`, mentre
  la nav inizia a `324.73px`; la piccola sovrapposizione di bordo non nasconde
  contenuto o controlli.
- Palette landscape: fondo elenco raggiunto a `405/405`; ultimo comando e bordo
  del dialog restano dentro il viewport dinamico.
- Prove rappresentative finali: `code-phone-landscape-final-chat.png`,
  `code-phone-landscape-final-toast-contained.png`,
  `code-phone-landscape-final-toast-automations.png`,
  `code-phone-landscape-final-browser-no-tail.png`,
  `code-phone-portrait-chat-keyboard2.png`,
  `code-phone-portrait-settings-bottom.png`,
  `code-tablet-portrait-global-sidebar-over2.png`,
  `code-tablet-landscape-global-over-sessions.png` e
  `code-tablet-landscape-browser-mode-truth.png`.

### Registro delle discrepanze della fase

| ID | Cosa è stato osservato | Esito |
|---|---|---|
| VIS-CODE-OUTER-GUTTER-01 | Il dettaglio telefono aveva un padding TALOS esterno più il padding del mockup, restringendo visibilmente la Chat. | Risolta e verificata nelle due forme telefono. |
| VIS-CODE-GLOBAL-Z-01 | Drawer globale dietro finestra centrale, rail o inspector. | Risolta: stack DOM e screenshot provano il drawer sopra tutte e tre le superfici. |
| VIS-CODE-TOAST-OVERFLOW-01 | Dopo aver liberato i controlli, il toast landscape usciva lateralmente dal viewport. | Risolta con larghezza confinata ed ellissi; testo e icona restano leggibili. |
| VIS-CODE-NONCHAT-NAV-01 | Browser e altre viste potevano terminare sotto la bottom nav; Browser conservava anche una coda vuota. | Risolta e provata al fondo reale. |
| VIS-CODE-MODE-LIE-01 | Browser visibile mentre Chat restava evidenziata. | Risolta; test automatico e misura DOM sul Pad. |
| VIS-CODE-NESTED-PHONE-SLICE-01 | Nel telefono landscape, l'anteprima di telefono dentro Browser è inevitabilmente molto bassa: dopo lo scroll tutti i controlli sono raggiungibili, ma la conversazione annidata resta visibile solo a porzioni. | Limite accettato della demo annidata; nessun controllo perso e nessun dato finto. |
| VIS-TYPOGRAPHY-01 | La gerarchia cromatica e tipografica non segue ancora in diretta tutti i temi TALOS. | Aperta, blocco esplicito della Fase 6. |
| VIS-CHEVRON-SEMANTICS-01 | Il chevron del rail e il ritorno possono ancora apparire semanticamente vicini nel tablet. | Aperta per riesame visivo Fase 6; le etichette accessibili sono già distinte. |

Le discrepanze storiche `VIS-DEMO-BADGE-TEXT-01`,
`VIS-PALETTE-X-COLLISION-01`, `VIS-PALETTE-BACK-01`,
`VIS-NESTED-SCROLL-TRAP-01`, `VIS-BOARD-HONESTY-01`,
`VIS-REVIEW-BADGE-BUTTON-01`, `VIS-BADGE-MULTI-SURFACE-01`,
`VIS-STEPS-CLIP-02`, `VIS-LIST-SCROLL-SHORT-01` e
`VIS-DRAWER-SHORT-01` sono chiuse dalla matrice Fase 5. La compattezza dei
selettori nel composer resta accettabile perché i relativi pannelli sono stati
aperti fino al fondo nelle quattro forme; la continuità stilistica resta invece
correttamente separata e assegnata alla Fase 6.

## Fase 6 — prima ispezione scrollbar/composer e RED tastiera

Prove:
`C:\Users\Antonino\AppData\Local\Temp\talos-code-phase6-scrollbar-20260825`.
Screenshot aperti e letti integralmente:
`code-phase6-phone-portrait-top.png` e
`code-phase6-phone-portrait-bottom.png`.

| ID | Cosa è stato osservato | Misura/esito |
|---|---|---|
| VIS-CODE-SCROLLBAR-REMOVED-01 | Nel telefono portrait la barra verticale non è più visibile e lo sfondo TALOS prosegue dietro Codice. Lo scroll raggiunge il vero fondo e il composer condiviso non copre l'ultimo messaggio. | Scroll range 925px, avanzamento 0→160 e fondo 924,73/925; clearance ultimo contenuto→composer 29,60px. Risolta nella build ispezionata. |
| VIS-CODE-INSET-INTERMEDIATE-01 | Dopo aver tolto la barra il bordo destro era 4px mentre il sinistro restava 12px. | Owner ha richiesto 12/12; corretto e verde in browser, nuova APK da verificare. |
| VIS-CODE-PLAN-HORIZONTAL-01 | La quinta fase del piano esce dal primo fotogramma, ma il relativo scroller orizzontale conserva 82px di corsa e raggiunge l'estremo. | Nessun dato perso; la barra resta nascosta per decisione owner. Da riprovare con swipe reale nella matrice finale. |
| VIS-CODE-COMPOSER-KEYBOARD-GAP-01 | Con Gboard aperta il composer condiviso restava sopra una fascia vuota alta quanto la nav nascosta. | RED reale: viewport 544,73px, fondo dock 476,73px, gap 67,27px. Causa: Vue compilava `bottom:0` su `body.keyboard-open`; test compilato e correzione verdi, nuova APK da verificare. |

Il fotogramma alto conferma inoltre che non esiste più una seconda testata
«Harness/Codice», il titolo è direttamente `Fix mobile composer`, lo sfondo
animato è quello della Chat e il composer è visivamente la stessa superficie
TALOS. Nessuno di questi punti è ancora dichiarato chiuso nelle quattro forme:
questa è una prova intermedia, conservata proprio per non cancellare il RED.

`code-phase6-phone-portrait-header-hidden.png` è stato poi ispezionato per
intero. Nuova discrepanza critica `VIS-CODE-TOPBAR-SAFE-AREA-01`: la testata si
ritira davvero (altezza 95→0px e striscia 95→0px), ma «In esecuzione» si
sovrappone a ora, rete e batteria. Inset 12/12 e scrollbar assente restano
corretti. Destinazione immediata: conservare la sola safe-area superiore mentre
si ritira il chrome; nessuna prosecuzione della matrice prima del nuovo GREEN.

### Fase 6 — GREEN Pad telefono portrait

Screenshot aperti e ispezionati integralmente:

- `code-phase6-phone-portrait-top-final.png`;
- `code-phase6-phone-portrait-header-hidden-safe.png`;
- `code-phase6-phone-portrait-header-restored.png`;
- `code-phase6-phone-portrait-keyboard.png`.

| ID | Cosa è stato osservato | Misura/esito |
|---|---|---|
| VIS-CODE-INSET-FINAL-01 | Dopo la rimozione completa della scrollbar, il contenuto usa lo stesso respiro sui due lati. Nessuna corsia grigia o fascia vuota rimane a destra. | `.conversation` e `.mission-card`: 12px sinistra e 12px destra, con il solo arrotondamento sub-pixel del WebView (meno di un pixel CSS). GREEN. |
| VIS-CODE-TOPBAR-SAFE-AREA-01 | Scorrendo verso il basso, titolo e comandi sessione escono; la striscia «In esecuzione» si ferma sotto orario, rete e batteria. Invertendo il gesto, la testata torna subito. | Stato aperto: topbar/run strip 95/95px. Stato ritratto: track sicuro 39px, topbar traslata fuori, run strip a 39px. Ritorno: 95/95px con scroll ancora a 82,55px. GREEN reale. |
| VIS-CODE-COMPOSER-KEYBOARD-GAP-01 | Il componente condiviso passa alla propria forma completa quando riceve il focus: allegati, modello, invio e grammatica TALOS restano intatti. | Viewport con Gboard 544,73px; fondo composer 544,73px; gap 0px. GREEN reale. |
| VIS-CODE-SCROLLBAR-REMOVED-01 | Lo scroll verticale resta pienamente operativo durante hide/show della testata, senza barra visibile e senza spazio riservato. | Range verticale 925px; gesto reale 0→356→82,55px. GREEN telefono portrait. |

L'ispezione completa non ha trovato collisioni con la status bar, la tastiera o
la bottom navigation. La matrice resta aperta per telefono landscape, tablet
portrait e tablet landscape; questo checkpoint chiude soltanto il caso telefono
portrait e conserva separatamente il precedente RED.

### Fase 6 — RED telefono landscape con Gboard

Screenshot ispezionati integralmente:

- `code-phase6-phone-landscape-keyboard.png`;
- `chat-canonical-phone-landscape-keyboard-red.png`.

`VIS-COMPOSER-LANDSCAPE-IME-SAFE-01` è aperta e bloccante. In entrambe le
superfici, non solo in Codice, il viewport con Gboard è 144,36px ma il dock
espanso è alto 148,18px e parte a -3,82px. Il bordo superiore viene tagliato e
testo/azione destra entrano nella zona di orario, rete e batteria. La prova
inversa conferma che senza tastiera la forma landscape è utilizzabile e la
testata Codice continua a ritirarsi/rientrare correttamente (39px safe-area,
scroll reale 0→92,36→21,09px). La correzione deve appartenere al componente
Chat condiviso, non a Codice.

### Fase 6 — GREEN telefono landscape con Gboard

Screenshot ispezionati integralmente:

- `chat-canonical-phone-landscape-keyboard-green.png`;
- `code-phase6-phone-landscape-keyboard-green.png`;
- `code-phase6-phone-landscape-keyboard-closed-green.png`.

| ID | Cosa è stato osservato | Misura/esito |
|---|---|---|
| VIS-COMPOSER-LANDSCAPE-IME-SAFE-01 | Chat e Codice montano lo stesso componente e, con Gboard aperta, mostrano la stessa forma compatta: `+`, textarea e azione destra reali restano utilizzabili senza entrare nella status bar. | Viewport 144,36px; dock da 74,91px a 144,36px; textarea e `+` alti 48px; collisione 0px. GREEN su entrambe le superfici. |
| VIS-COMPOSER-LANDSCAPE-INVERSE-01 | Chiudendo Gboard la media query short-landscape si disattiva e il composer torna automaticamente alla grammatica completa, compreso il selettore modello. | Viewport 392px; query falsa; model chip `display:flex`; dock 176,55–324,73px. GREEN reale. |
| VIS-CODE-LANDSCAPE-CHROME-01 | Nell'intero fotogramma senza tastiera non compaiono scrollbar, corsie riservate o sovrapposizioni con status bar e bottom navigation. La testata, la striscia di esecuzione, il badge demo e il composer condiviso restano separati. | Screenshot 2400×1080 ispezionato per intero. GREEN. |

La soluzione è CSS nel componente Chat canonico: durante la sola condizione
landscape estremamente bassa riordina i controlli già esistenti, senza creare
un secondo composer e senza cambiare eventi o comportamento. Chiusa la
tastiera, la forma originale ricompare integralmente.

### Fase 6 — RED tablet portrait, rail espanso

Screenshot ispezionati integralmente:

- `code-phase6-tablet-portrait-top.png`;
- `code-phase6-tablet-portrait-scroll-end.png`.

`VIS-COMPOSER-TABLET-RAIL-01` è aperta e bloccante. Il contenuto Codice usa
correttamente 20px per lato, la scrollbar è assente, lo scroll arriva alla fine
e la testata conserva 40px di safe area. Il composer, però, non è interamente
sopra la superficie: tool surface e host iniziano a 323px, mentre il dock
inizia a 646px. Il rettangolo interno dichiara 335–902px, ma l'hit test nella
parte sinistra restituisce l'host Codice; soltanto da circa x=646px il composer
sale realmente sopra. L'ultimo contenuto conserva 12,45px di spazio rispetto
al rettangolo teorico, ma il controllo visibile/toccabile è dimezzato.

Il difetto deriva dal doppio offset del rail e non dal componente Chat. Va
corretto nel solo dock host e poi ricontrollato in tutte le quattro forme.

### Fase 6 — GREEN composer e rail nelle quattro forme

Screenshot ispezionati integralmente:

- `code-phase6-tablet-portrait-composer-green.png`;
- `code-phase6-tablet-portrait-composer-plus-green.png`;
- `code-phase6-tablet-portrait-rail-collapsed-green.png`;
- `code-phase6-tablet-landscape-composer-green.png`;
- `code-phase6-phone-portrait-keyboard-post-rail-fix.png`;
- `code-phase6-phone-landscape-keyboard-post-rail-fix.png`.

| ID | Cosa è stato osservato | Misura/esito |
|---|---|---|
| VIS-COMPOSER-TABLET-RAIL-01 | Nel tablet portrait il dock coincide ora con la tool surface, sia con lista sessioni aperta sia compressa. La metà sinistra riceve davvero gli eventi: il tocco sul `+` apre il drawer canonico «Aggiungi alla chat». | Rail aperto: surface/dock x=323px, composer 335–902px. Rail chiuso: surface/dock x=72px, composer 84–902px. Inset 12/12 e hit test GREEN. |
| VIS-COMPOSER-TABLET-LANDSCAPE-01 | Nel tablet landscape la stessa invariante vale con rail 72px e 323px; composer intero sopra contenuto e Context rail, senza sovrapposizioni laterali. | Rail aperto: surface/dock x=323px, composer 335–1280px. Rail chiuso: surface/dock x=72px, composer 84–1280px. Inset 12/12 e hit test GREEN. |
| VIS-COMPOSER-PHONE-INVERSE-AFTER-RAIL-01 | Il nuovo ancoraggio non regredisce la tastiera. Portrait mantiene il dock al fondo del viewport Gboard; landscape mantiene dock 74,91–144,36px, textarea 48px e model chip nascosto soltanto nello stato corto. | Portrait viewport/dock bottom 544,73px. Landscape viewport/dock bottom 144,36px; chiusura Gboard: query falsa e model chip `display:flex`. GREEN. |
| VIS-CODE-TABLET-SCROLL-END-01 | In entrambi i tablet lo scroll arriva all'ultimo elemento, senza scrollbar; testata ritratta a 40px e ultimo contenuto separato dal composer. | Portrait clearance 12,35–12,45px; landscape 12,54px. Scrollbar occupata 0px. GREEN. |

Il drawer del composer è stato controllato per intero: sfondo e rail Codice
restano sotto il backdrop, la superficie è centrata, non entra nella status bar
e usa la grammatica Chat reale. La chiusura della tastiera lascia ancora il
focus nel textarea: non è una regressione di questo fix, è il debito mobile
separato `DEBT-MOBILE-006`, registrato per il lavoro post-Codice.

## Debito riaperto dal confronto owner — autonomia composer

Le prove precedenti hanno confermato geometria, scroll e riuso del composer
Chat, ma hanno mancato una differenza funzionale visibile rispetto al mockup:
accanto al modello non compare più la pill della policy agente. Il mockup
originale mostra `Workspace write` e apre quattro scelte (`Read only`,
`Workspace write`, `On request`, `Full access`). Va ripristinata e riprovata in
tutta la matrice; fino ad allora la superficie Codice non è chiusa.

## Matrice conclusiva Fase 6

Directory prove:
`C:\Users\Antonino\AppData\Local\Temp\talos-code-phase6-scrollbar-20260825`.

| Forma reale simulata sul Pad | PNG fisico | Esito superfici toccate |
|---|---:|---|
| Telefono portrait | 1080×2400 | inset 12/12; nessuna scrollbar; testata hide/show con safe area 39px; scroll reale; composer Chat vero e Gboard; GREEN. |
| Telefono landscape | 2400×1080 | testata hide/show; composer short-IME 74,91–144,36px; ritorno del model chip alla chiusura; nessuna collisione status bar; GREEN. |
| Tablet portrait | 2400×3392 | rail 323/72px; composer intero 12/12 e drawer `+`; scroll fino al fondo; topbar sicura 40px; GREEN. |
| Tablet landscape | 3392×2400 | rail 323/72px; Chat e Board fino al fondo; Context rail fino al fondo; sidebar globale sopra tutto; composer 12/12; GREEN. |

Sono stati riesaminati per intero anche Board iniziale/fondo, Context rail,
drawer «Aggiungi alla chat», sidebar globale con backdrop, rail sessioni aperto
e compresso e i fotogrammi con tastiera. Nessuna scrollbar embedded è visibile
o riserva spazio; tutti gli scrollport verificati conservano range reale.

Il Pad è stato infine ripristinato a `wm size reset` = 2400×3392 e
`wm density reset` = 420.

## Fase 8 — RED scoperto nel pannello autonomia, telefono portrait

Screenshot ispezionato integralmente:
`code-autonomy-phone-portrait-sheet.png` (1080×2400).

`VIS-CODE-AUTONOMY-PORTRAIT-PAN-01` è bloccante: il dialog permessi è tagliato
a sinistra e una fascia del Context rail compare a destra. La sonda CDP ha
misurato la causa sulla surface globale, non sul dialog: viewport/host
392,73px, tool sheet `scrollWidth=745px`, `clientWidth=393px`,
`scrollLeft=49,09px`; host e dialog risultano quindi da −49,09 a 343,64px.
Chiudere dialog e tastiera non azzera il pan. La matrice non è verde finché la
surface resta scrollabile orizzontalmente o il difetto riappare in una delle
altre tre forme.

## Fase 8 — GREEN autonomia e clipping nelle quattro forme

Directory prove:
`C:\Users\Antonino\AppData\Local\Temp\talos-code-autonomy-20260825`.

Screenshot GREEN ispezionati integralmente dopo la nuova APK:

- `code-autonomy-phone-portrait-sheet-green.png` (1080×2400);
- `code-autonomy-phone-landscape-sheet-green.png` (2400×1080);
- `code-autonomy-tablet-portrait-sheet-green.png` (2400×3392);
- `code-autonomy-tablet-landscape-sheet-green.png` (3392×2400).

| ID | Osservazione completa | Esito |
|---|---|---|
| VIS-CODE-AUTONOMY-PORTRAIT-PAN-01 | Dopo focus e apertura permessi, tool sheet e host restano 0–392,73px; `scrollWidth` resta 745px per il rail fuori schermo ma `overflow:clip` impedisce il pan e `scrollLeft` resta 0. Il dialog occupa esattamente 0–392,73px; nessuna fascia del Context rail è visibile. | GREEN reale sul Pad. |
| VIS-CODE-AUTONOMY-LANDSCAPE-SCROLL-01 | Il pannello basso/orizzontale mostra le quattro policy; uno swipe verticale porta agli scope correnti senza spostare la superficie globale. | GREEN; sheet scorrevole, surface ferma. |
| VIS-CODE-AUTONOMY-TABLET-01 | In portrait e landscape il dialog è centrato, intero, separato da status/navigation bar; backdrop e animazione restano coerenti e il contenuto sottostante non cambia geometria. | GREEN in entrambe le forme. |
| VIS-CODE-AUTONOMY-COMPOSER-01 | Tablet mostra etichetta accanto al modello; telefono portrait riduce la pill alla sola icona con nome accessibile completo; landscape torna alla grammatica estesa quando Gboard si chiude. | GREEN, stesso `TalosMobileComposer.vue`. |

Sono stati controllati anche i percorsi inversi: Back chiude senza cambiare la
policy; la selezione reale `Full access` aggiorna la pill; collasso/riapertura
del rail non perde il valore nella sessione; un riavvio riparte dal dichiarato
default demo `Workspace write`. Il Pad è stato ripristinato a size fisica
2400×3392 e densità 420.
