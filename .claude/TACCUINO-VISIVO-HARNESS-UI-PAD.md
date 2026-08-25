# Taccuino visivo — Harness UI sul Pad

Data: 2026-08-25  
Superficie: TALOS UI mobile, Harness demo debug-only  
Metodo: revisione `frontend-design` in due passaggi, prima composizione e
gerarchia dell'intero schermo, poi tipografia, spaziatura, token, collisioni,
stati, controlli, scroll, tastiera e safe area.

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
