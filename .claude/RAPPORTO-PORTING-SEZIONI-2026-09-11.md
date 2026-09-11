# Rapporto — porting del mockup, lotti C · C-bis · E · F · G (11/09/2026)

Agente Opus 5 (effort high), lane `lane/harness-desktop`, cartella `harness-ui/frontend/`.
Fonte: `.claude/refactor-ui-owner-2026-09-11/Talos_Desktop_Final_Mockup_Interattivo.html` (938 KB).
Lotti A, B, D (barra a gruppi, transizione, menu e selezione delle sessioni) sono dell'altro agente,
che ha `legacy/app.js` e `index.template.html` in esclusiva.

⛔ **Non ho toccato `src/legacy/app.js` né `index.template.html`** — `git status --short` lo conferma:
i miei file sono tutti nuovi tranne tre righe in `src/styles/main.css` (un `@import`), l'aggiunta di
`azioneAnnulla()` in `src/components/toast.js` e le voci di laboratorio in `lab/main.js`.
Gli agganci da fare nei due file in esclusiva stanno qui sotto, con il diff esatto.

## Cosa ho scritto

| file | righe | cosa |
|---|---|---|
| `src/styles/mockup-td.css` | 297 | le classi `td-*` del mockup, importato in coda a `main.css` |
| `src/components/sezione-elenco-dettaglio.js` | 541 | l'impianto elenco+dettaglio (lotto C e C-bis) |
| `src/components/sezioni-adattatori.js` | 526 | le sei sezioni coi dati veri |
| `src/components/modale-td.js` | 147 | la modale del mockup come `<dialog>` nativo (lotto G) |
| `src/components/theme-studio.js` | 309 | «Temi e atmosfere» nelle Impostazioni (lotto F) |
| `tests/unit/{sezione-elenco-dettaglio,theme-studio,modale-td}.test.mjs` | 376 | 21 prove nuove |
| `lab/fixtures/{note,progetti}.js`, `lab/main.js` | — | il banco per le foto |

**Suite:** `npm run test:unit` → **724 verdi, 0 rossi** (erano 696 a inizio giornata; +21 miei, +7 di
un altro lotto). **Banco:** `TALOS_FRONTEND_LAB_PORT=4186 node scripts/serve-lab.mjs` — **mai la 4174**.
**Foto:** 40 immagini in `harness-ui/frontend/artifacts/td/`, chiaro E scuro, 1440×900 e 1024×800,
guardate una per una; nessun errore JavaScript a runtime in nessuna delle 40 pagine.

---

## Lotto C — elenco a sinistra, dettaglio a destra, per tutte e sei le pagine

### Cosa fa il mockup
`initSection` (riga 6064) riscrive l'intera schermata; `renderSection` (6065) disegna intro, barra,
filtri coi conteggi, schede o righe; `renderDetail` (6072) il pannello di destra; `selectItem` (6073)
la selezione; `card` (6052, più una v2 a 6297) la scheda; `emptyArt` (6051) il disegno del vuoto.
Le classi sono `td-master`, `td-detail`, `td-workspace`, `td-divider`, `td-card`, `td-empty`
(CSS righe 3979-4195 e 4195-4391).

### Cosa esisteva già, ed è stato RIUSATO (non riscritto)
- `note.js` → `titoloNota`, `quandoNota`, `sommarioNote`;
- `memoria.js` → `genereMemoria`, `testiMemoria`;
- `attivita.js` → `statoAttivita`, `prioritaAttivita`, `testiAttivita`, `riepilogoAttivita`;
- `libreria.js` → `tipoVoceLibreria`, `origineVoceLibreria`, `testiVoceLibreria`, `azioniLibreria`,
  `indirizzoFileLibreria` e **la riga vera `creaLibraryRow`**, che vive dentro il dettaglio con tutte
  e cinque le sue azioni (menu «…», tasto destro, rinomina in linea, conferma d'eliminazione con la
  conseguenza scritta, messaggio d'esito): rifarla avrebbe voluto dire due copie da allineare e, il
  primo giorno che si sbaglia, scendere sotto la UI di ieri;
- `ricerca.js` → `statoRicerca`, `testiRicerca`, `riepilogoRicerche`;
- `progetti.js` → `frasiProgetto`, `sommarioProgetti`, `ultimeSessioni`, `progettiConSessioni`;
- `plurale.js` → il plurale italiano, che resta in un posto solo;
- i **testi** delle pagine: h2, sottotitolo e riga di stato NON sono riscritti, vengono **spostati**
  da `.talos-page__head` dentro `.td-intro` con i loro `data-*` (`data-note-stato`,
  `data-library-esito`, …), così `legacy/app.js` continua a scrivere lì i suoi errori senza sapere
  che la pagina è cambiata.

### La cura
`montaSezione(schermo, config)` sostituisce `.talos-page` con `.td-section` e tiene la topbar del
prodotto. Sei adattatori (`sezioni-adattatori.js`) espongono **le stesse firme di prima**
(`montaNote`, `aggiornaPaginaMemoria`, `aggiornaPaginaAttivita`, `aggiornaPaginaLibreria`,
`aggiornaPaginaRicerca`, `montaProgetti`): per questo l'aggancio è di **sei righe di `import`**.

Scelte che si discostano dal mockup, e perché:
1. **Niente `innerHTML`.** Titoli e testi li scrive un modello o il disco: tutto `createElement`.
2. **Niente animazioni in JS.** Il 10/09 sei cure sono cadute su un componente sano perché
   `body.reduce-motion *` e `@media (prefers-reduced-motion) *` spengono ogni animazione con
   `!important`: un'animazione scritta qui sarebbe morta a valle senza dirlo.
3. **Niente «Modifica», «Crea», «Elimina» nelle cinque sezioni in sola lettura.** Su
   `harness-ui/src/http-app.mjs` (righe 762 e 840) `notes`, `memory`, `tasks`, `research` e
   `projects` espongono **solo GET**: un pulsante lì sarebbe una promessa che nessuna rotta può
   mantenere. L'unica sezione che scrive è la Libreria (PATCH/DELETE/POST), e scrive con la sua riga.
4. **La spunta dell'attività è un TIMBRO, non una casella.** Il mockup mette un `role="checkbox"`
   premibile su ogni scheda; senza rotta di scrittura resterebbe un comando morto. Qui il segno
   compare **solo sulle attività fatte**, e le altre schede non pagano nemmeno il rientro di 52 px.
5. **Il divisorio è un cursore vero.** Ricerca dell'11/09 (UX Patterns Guide «Window Splitter»,
   Telerik Design System «Splitter accessibility», W3C APG): `role="separator"`,
   `aria-orientation="vertical"` (descrive la LINEA, non la disposizione), `aria-valuenow/min/max`,
   frecce con passo dichiarato (**24 px**), Home/End agli estremi (**320**/**700 px**), doppio clic
   torna a **440** — il `--td-detail-width` del mockup. La misura si ricorda per sezione.
6. **Sotto 850 px di SEZIONE** (container query, non larghezza di finestra) il dettaglio prende tutto
   e l'elenco si nasconde: è la stessa regola che rende usabile la vista a 1024 px.

### Difetti trovati guardando le foto, e corretti in batch
| # | trovato | cura |
|---|---|---|
| 1 | **tutte le foto nere**: `#talosAvvio` (il velo d'avvio, nato oggi) nel laboratorio resta acceso — `src/avvio.js` è un entry a parte che il banco non carica — e soprattutto è **senza stile**, perché la regola `#talosAvvio{position:fixed;inset:0}` vive nell'inline `<style>` di `index.template.html` che `lab/index.html` non ha. Fuori dal `position:fixed` diventa un blocco alto **8.697 px** dentro un `body` flex da 900: la shell riceve **0 px** e la app sparisce | tolto in `mostraSchermo` (lab). ⚠️ **vale anche per il cancello di parità dei componenti**, che apre le stesse pagine: vedi «non verificato» |
| 2 | Memoria diceva il genere **due volte** («Regola  [Regola]») | il segno porta il simbolo, l'etichetta la parola |
| 3 | il piede della scheda troncava («Priorità norm…», «Aggiornata il 04/09/2026, 18:…») | nella scheda solo la **data**; l'ora intera resta nel dettaglio |
| 4 | il campo di ricerca si strozzava a 170 px | minimo **220 px**, e la barra manda a capo il resto |
| 5 | la copertina del file leggeva «MDDECISIONI-…» | `display:block` sull'estensione (regola del mockup che avevo perso) |
| 6 | il riquadro «Azioni sul file» usciva **vuoto** | **misurato, non dedotto**: `index.css:876` tiene `.talos-list-row__azioni` a `opacity:0` fino all'hover — giusto in una lista, sbagliato in un dettaglio. Opacità piena lì dentro, e il «…» prende la sua parola («Tutte le azioni») |
| 7 | Progetti ripeteva il conteggio nel corpo e nel piede | nel piede va il **quando** |
| 8 | lo stato vuoto delle Note diceva «0 note» mentre la barra diceva «nessuna nota» | `sommarioStato` fa usare a entrambe `sommarioNote` |
| 9 | Ricerca: barra «5 ricerche elencate», stato «5 rapporti» | una parola sola: «ricerche» |
| 10 | in vista righe la Libreria lasciava una riga di griglia vuota | `align-content:center` |
| 11 | «Aggiorna» compariva anche dove nessuno ricarica (Note, Progetti) | il bottone esiste solo se arriva `onAggiorna` |
| 12 | `larghezzaDettaglio(null)` tornava **320** (il minimo) invece di 440, perché `Number(null)` è 0 | `Number.parseFloat`, che su `null` dice NaN — trovato dal test, non dalla foto |

### Foto (chiaro **e** scuro, guardate una per una)
`artifacts/td/SezioneNote-{1440,1024}-{dark,light}.png`, `SezioneNote_dettaglio-1440-*`,
`SezioneNote_vuota-1440-*`, `SezioneMemoria-{1440,1024}-*`, `SezioneAttivita-1440-*`,
`SezioneLibreria-{1440,1024}-*`, `SezioneRicerca-1440-*`, `SezioneProgetti-1440-*`.

### Aggancio da fare in `legacy/app.js` (diff esatto)
Sei righe di `import`. ⛔ I `crea*Row` restano dove sono: li usano ancora i vecchi fogli laterali
(`rigaVoceLibreria`, `rigaAttivita`, `rigaMemoria`, `creaReportRow`).

```diff
@@ src/legacy/app.js:18-21
-import { creaReportRow, aggiornaPaginaRicerca } from '../components/ricerca.js'; // 05/9 Fase 2: Ricerca
-import { creaLibraryRow, aggiornaPaginaLibreria } from '../components/libreria.js'; // 05/9 Fase 2: Libreria
-import { creaTaskRow, aggiornaPaginaAttivita } from '../components/attivita.js'; // 05/9 Fase 2: Attività
-import { creaMemoryRow, aggiornaPaginaMemoria } from '../components/memoria.js'; // 05/9 Fase 2: Memoria
+import { creaReportRow } from '../components/ricerca.js'; // 05/9 Fase 2: Ricerca (riga del foglio laterale)
+import { creaLibraryRow } from '../components/libreria.js'; // 05/9 Fase 2: Libreria (riga del foglio laterale)
+import { creaTaskRow } from '../components/attivita.js'; // 05/9 Fase 2: Attività (riga del foglio laterale)
+import { creaMemoryRow } from '../components/memoria.js'; // 05/9 Fase 2: Memoria (riga del foglio laterale)
+/* 11/09 lotto C — le PAGINE passano all'elenco+dettaglio del mockup. Stesse firme di prima:
+   cambia l'import, non le chiamate. I sei adattatori riusano i componenti qui sopra. */
+import {
+  aggiornaPaginaRicerca, aggiornaPaginaLibreria, aggiornaPaginaAttivita,
+  aggiornaPaginaMemoria, montaNote, montaProgetti,
+} from '../components/sezioni-adattatori.js';
@@ src/legacy/app.js:55
-import { montaProgetti, progettiConSessioni } from '../components/progetti.js'; // 06/9: la voce «Progetti» aveva un contatore e nessuna pagina
+import { progettiConSessioni } from '../components/progetti.js'; // 06/9: la voce «Progetti» aveva un contatore e nessuna pagina
@@ src/legacy/app.js:59
-import { montaNote } from '../components/note.js'; // 06/9 C24: la pagina delle Note // 06/9 O-22/O-23/O-36: gli errori e i rifiuti detti a una persona
+// 06/9 C24: la pagina delle Note — la monta `sezioni-adattatori.js`, che riusa `note.js`
```

Facoltativo ma consigliato (fa comparire «Aggiorna» dove serve e accende i toast del lotto E):

```diff
@@ src/legacy/app.js:4823 (dentro caricaPannelloLibreria → mostra)
         aggiornaPaginaLibreria(mount, voci, {
           errore, caricamento, sessionId,
+          notifica: toast, // lotto E: la rinomina riuscita esce con «Annulla»
           onAggiorna: () => caricaPannelloLibreria({ pagina: true }),
@@ src/legacy/app.js:1470 (dentro disegnaPaginaNote)
     montaNote(schermo, noteCaricate, {
       cerca,
+      notifica: toast, // lotto E: «Esportata» invece di una nota di stato che nessuno legge
+      onAggiorna: () => void caricaPaginaNote(),
       onCopia: (nota) => copyText(...),
@@ src/legacy/app.js:1435 (dentro caricaPaginaProgetti)
       montaProgetti(schermo, progettiConSessioni(elenco?.items || [], sessioni?.items || []), {
+        onAggiorna: () => void caricaPaginaProgetti(),
         onApriSessione: (s) => { ... },
```

⛔ `caricaPaginaNote()` legge ancora `$('#cercaNota', schermo)?.value`: il campo non esiste più (la
ricerca vive dentro la sezione e **non si azzera** a ogni ridisegno, che è un miglioramento).
`?.value || ''` non lancia — si può lasciare com'è, o togliere le due righe.

### Non verificato
- **col server vero**: tutte le foto vengono dal laboratorio con fixture nella forma esatta delle
  rotte. Le sei pagine non le ho viste sul 4174 con dati veri (il brief vieta di scrivere lì, e gli
  agganci in `app.js` li fa l'altro agente). Va rifatto **un giro vero per sezione** dopo il
  collegamento.
- **la Libreria con le azioni vive**: nel laboratorio `onMenu` è un no-op e le rotte non esistono;
  ho verificato che il menu «…» c'è, ha la sua parola e il suo `aria-label`, non che apra il menu
  vero di `apriMenuAzioniLibreria`.
- **il trascinamento del divisorio**: provato come codice (passo, estremi, `aria-valuenow`,
  persistenza), non con un pointer vero in una foto.
- **tastiera e lettore di schermo**: nessun giro completo con Tab/NVDA.

---

## Lotto C-bis — lo switch righe/schede (aggiunta dell'owner, stessa sera)

**Era già dentro il lotto C**: il mockup lo fa con `data-td="layout"` dentro `initSection`, e qui è il
`div.td-segment` in testa a ogni sezione, due bottoni (`data-vista="elenco"` / `"schede"`) con
`aria-pressed` e `aria-label`. Due azioni sole ⇒ segmento, non menu (la regola del menu scatta da
tre in su).

**Misurato dal vivo sul banco**, non dedotto:

```
1. di serie          : td-grid
2. dopo il clic      : td-list
   in localStorage   : {"note":{"vista":"elenco","ordine":"nuovo","larghezza":440}}
3. dopo il ricarico  : td-list        ← la scelta si ricorda
4. un'ALTRA sezione  : td-grid        ← e non contagia le altre
```

Vale per **tutte e sei** le pagine (è nello scheletro dell'impianto, non in un adattatore). In vista
righe spariscono copertina, chip delle fonti e barra di avanzamento: resta la riga compatta.
Foto: `SezioneNote_elenco-1440-*`, `SezioneLibreria_elenco-{1440,1024}-*`, `SezioneElenco-1440-*`
(Memoria in righe).

⚠️ Accanto allo switch c'è anche l'**ordine** del mockup (`data-section-sort`: «Ultima modifica» /
«Titolo A–Z»), anch'esso ricordato per sezione.

---

## Lotto E — i toast al posto delle note di stato

### Cosa fa il mockup
`toast(text, undo)` (riga 6038): riquadro in basso, **«Annulla»** quando l'azione si può disfare,
al massimo tre in pila, **6.200 ms** senza annullamento e **11.000 ms** con.

### Cosa esisteva già
Un sistema di toast **completo**: `src/components/toast.js` (`creaToast`, `creaPilaToast`), la
regione `#regioneToast`, quattro toni, `role="status"`/`role="alert"`, tre in pila, timer che si
ferma sotto il mouse e col fuoco dentro, e `toast(titolo, messaggio, opzioni)` in `app.js` con 25
punti di chiamata. Mancava **una cosa sola**: l'annullamento.

### La cura
- `azioneAnnulla(esegui)` in `toast.js` (**+21 righe**, nessun secondo sistema): tono «riuscito»,
  azione «Annulla», durata **11.000 ms**.
- L'unica scrittura **reversibile** che il server offre nelle sei sezioni è la **rinomina di un file**
  di Libreria (si rinomina di nuovo col nome di prima). L'adattatore avvolge il servizio che
  `creaLibraryRow` accetta già come iniezione (`azioni`) e, a rinomina riuscita, manda
  «Rinominato — «vecchio» adesso si chiama «nuovo»» con **Annulla**.
- Gli esiti **transitori** delle sezioni (esporta, copia) vanno al toast; quelli **persistenti**
  (caricamento, errore, conteggio) restano nella riga di stato, dove devono stare: un errore che
  sparisce dopo sei secondi è una regressione, non un porting.

Ricerca fatta **prima** (11/09/2026): NN/g «Confirmation Dialogs Can Prevent User Errors» + Joel
Pascual «A UX guide to destructive actions» — **se l'azione è reversibile la conferma va sostituita
dall'annullamento** (la conferma insegna la paura, l'annullamento la sicurezza);
designsystemproblems.com «Toast Notification Accessibility» + WCAG 2.2.1 «Timing Adjustable» — un
toast che porta un'azione deve restare abbastanza da leggerlo **e** premerlo.

⛔ **Cosa NON ho toccato, di proposito**: l'esito delle cinque azioni della Libreria resta scritto
**dentro la riga**, sotto il nome. È una decisione del 10/09 con la sua ricerca dietro
(«l'esito di un'azione non è un toast che passa»): sostituirla con un toast sarebbe stato disfare
una cosa giusta il giorno dopo.

⛔ **La posizione della pila resta in basso a destra** (`#regioneToast`), non al centro come il
mockup: spostarla cambierebbe l'aspetto di tutti e 25 i punti di chiamata esistenti, e l'owner ha
chiesto i toast «dove il mockup li usa», non «dove il mockup li mette». Se li vuole al centro è una
riga sola in `index.css:1906` — **decide lui**.

Foto: `ToastAnnulla-1440-{dark,light}.png`. Aggancio: la riga `notifica: toast` del lotto C.

### Non verificato
Il giro completo «rinomino → premo Annulla → il file torna al nome di prima» con il server vero:
serve una sessione con una Libreria vera. Nel laboratorio ho provato la forma del toast e la
funzione di annullamento (test `TOAST-ANNULLA`), non il viaggio di ritorno sul disco.

---

## Lotto F — «Temi e atmosfere» nelle Impostazioni

### Cosa fa il mockup
`themeChooser` (6312) apre una modale con le quattordici tavolozze come radiogroup, un'anteprima
animata, il selettore chiaro/scuro, tre dettagli (materiale, accento, raggio) e le azioni;
`initAtelier` (6319) aggiunge il pulsante sotto la riga «Tema TALOS» e una scorciatoia nella barra;
`setAppearance` (6314) muove il controllo vero e gli manda un evento.

### Cosa esisteva già
I **quattordici temi** (`temi.css`, riallineati al mobile stamattina), i due modi colore, la
persistenza con il timbro `ASPETTO_SCELTA_VERSIONE`, i nomi nel contratto dei 38 controlli
(`impostazioni-campi.js`), e perfino **l'anteprima animata** delle scene
(`motion/desktop-background.js`, `.talos-motion-preview`, già montata nella pagina Aspetto).

### La cura, e le tre correzioni al mockup
1. **Nessuna quindicesima copia della tavolozza.** Il mockup porta con sé un oggetto
   `atelierThemes` con nome+fondo+accento di ogni tema. Stamattina l'owner ha fatto allineare i temi
   desktop a quelli mobile proprio perché esistevano due copie divergenti: aggiungerne una terza
   sarebbe stato lo stesso difetto il giorno dopo. Qui i **nomi** vengono dal contratto dei controlli
   e i **colori** si **leggono dal foglio che dipinge la app** — le regole
   `:root[data-talos-theme="…"]` e i loro quattro semi. Se domani cambia una tavolozza, il pallino
   cambia da solo. Se il foglio non è leggibile il pallino resta neutro: un colore mancante non
   diventa un colore inventato.
2. **L'evento giusto.** `setAppearance` del mockup manda `input`; `legacy/app.js` ascolta `change`
   per select e checkbox e `input` solo per i `range` (`appearanceControlMap`). Con l'evento del
   mockup **il tema non si sarebbe applicato**, e la cosa non sarebbe saltata fuori subito. Provato
   nei due versi (test `STUDIO-APPLICA`).
3. **Tre modi colore, non due.** Il mockup offre Scuro/Chiaro; la app ha anche «Segui il sistema»,
   che è il default: toglierlo avrebbe spento in silenzio il rispetto della preferenza di sistema.
4. **Anteprima ferma.** Niente secondo runtime Canvas dentro una modale: l'anteprima animata esiste
   già nella pagina Aspetto e la paga la stessa GPU. Qui un riquadro coi semi del tema — dice il
   colore, non finge il moto.

Ricerca fatta prima (11/09/2026): Setproduct «Radio button UI design, from anatomy to accessible
groups» e l'esempio W3C `role="radiogroup"` — scelte esclusive con `aria-checked`, **un solo** stop
del Tab (roving tabindex), frecce che spostano la scelta, e la selezione mai affidata al solo colore
(qui c'è anche la spunta).

Difetto trovato nella foto: la modale dava il fuoco al **primo** controllo utile (Forge) mentre la
spunta era su Calm, quattordicesimo e fuori dalla parte visibile — un anello di fuoco su una voce e
la spunta su un'altra. Curato: fuoco **e** scorrimento vanno sulla voce scelta.

Foto: `ThemeStudio-{1440,1024}-{dark,light}.png`, `ScorciatoiaTemi-1440-*`.

### Aggancio da fare in `legacy/app.js`
```diff
@@ in testa, con gli altri import
+import { montaScorciatoiaTemi } from '../components/theme-studio.js'; // 11/09 lotto F
@@ dopo OGNI `montaImpostazioni($('#schermoImpostazioni'), …)` — righe 3959, 3975, 4126
         montaImpostazioni($('#schermoImpostazioni'), documento.appearance, { recupera: (id) => $('#' + id), cambiaSezione: setSettingsSection });
+        montaScorciatoiaTemi($('#schermoImpostazioni')); // idempotente: `montaImpostazioni` ridisegna le righe
```

### Non verificato
- **il giro vero**: aprire lo studio, scegliere un tema e vedere la app ridipingersi. Nel laboratorio
  `legacy/app.js` non gira, quindi ho provato che lo studio **muove il controllo e manda `change`**,
  non che la app reagisca. È la prima cosa da guardare sul 4174 dopo l'aggancio — con **entrambi** i
  modi colore.
- **i quattordici temi uno per uno**: le foto sono su Calm. La lettura dei semi è provata sui due
  casi limite (tema chiaro con `--talos-seme-fondo-chiaro`, tema scuro senza), non su tutti e 14.

---

## Lotto G — le modali del mockup al posto di quelle attuali

### Cosa fa il mockup, e dove il mockup si usa davvero
`modalShow`/`modalClose` (6039-6040) su un `<div class="td-modal-host">` con `shell.inert` e il
fuoco rimesso a mano. Le 14 chiamate si dividono così:
- **mie e portabili**: `themeChooser` (lotto F) e la conferma distruttiva `deleteItem` (6130);
- **non portabili**: `newItem` (6128) e `sectionMenu` (6141) creano ed esportano **dati demo** —
  senza rotte di scrittura sarebbero pulsanti morti;
- **dell'altro agente**: rinomina sessione, azioni della sessione, elimina sessioni, nuova
  conversazione (lotto D);
- **già esistenti nel prodotto, e migliori**: «Vai a…» è `#veloComandi`, «Notifiche» è
  `#pannelloNotifiche`, «Aggiungi alla conversazione» è `#veloContesto`. I veli del prodotto sono
  **ridimensionabili e ricordati** (`dialoghi.js`, 18 chiavi): sostituirli col `td-modal` sarebbe
  sceso sotto la UI originale.

⇒ Le modali «attuali» che il mockup **davvero** sostituisce sono le **quattro `window.confirm()`**
rimaste in `app.js`: finestre del sistema operativo, fuori dal tema, che bloccano il thread e non
sanno dire una conseguenza. Tre sono nel mio perimetro, la quarta (eliminazione di sessioni, riga
15054) è del lotto D.

### La cura
`modale-td.js`: la modale **È un `<dialog>` nativo** aperto con `showModal()`, il fondo è
`::backdrop`. Ricerca fatta prima (11/09/2026 — MDN `<dialog>`; dfm2html «The Modern Modal in 2026»;
a11y-collective «Mastering Accessible Modals»; accessibility.build «Accessible Dialog & Modal
Guide»): `showModal()` porta già trappola del fuoco, Esc, fondo inerte e **ritorno del fuoco a chi ha
aperto** — le tre righe di regia scritte a mano nel mockup diventano zero righe da mantenere. E non
è un'invenzione nostra: `#commandDialog` e `#sheetDialog` sono già due `<dialog>` nativi.

Due dettagli che una foto non mostra, e che i test provano:
- **Esc si ferma sulla modale**: senza `stopPropagation` il `keydown` risalirebbe alla catena di Esc
  di `app.js` e chiudere una modale potrebbe far comparire «fermo il giro?»;
- **una alla volta**: due `showModal()` impilati lasciano il fuoco nella prima quando si chiude la
  seconda.

`confermaModale({titolo, domanda, conseguenza, etichettaConferma, onConferma})` scrive la
**conseguenza** (non un «sei sicuro?») e mette il fuoco su **«Annulla»**, la via d'uscita: un Invio
di troppo non distrugge niente. Difetto trovato nella foto: il bottone distruttivo era testo rosso
senza bordo, quindi pesava **meno** della via d'uscita — corretto con la variante `--secondary`.

Foto: `ModaleConferma-1440-{dark,light}.png`.

### Aggancio da fare in `legacy/app.js` (diff esatto)
```diff
@@ in testa, con gli altri import
+import { confermaModale } from '../components/modale-td.js'; // 11/09 lotto G: al posto di window.confirm()

@@ riga 3968-3970 — «Ripristina le preferenze»
     $('#settingsRipristina')?.addEventListener('click', () => {
       // ⛔ distruttivo: si chiede prima, e si dice esattamente cosa NON viene toccato.
-      if (!window.confirm('Rimetto tutte le preferenze ai valori iniziali?\n\nTema, densità, lingua, preferenze della chat e cartelle ricordate tornano come appena installato.\nLe conversazioni e i file NON vengono toccati.')) return;
-      try {
+      confermaModale({
+        titolo: 'Rimetto tutte le preferenze ai valori iniziali?',
+        domanda: 'Tema, densità, lingua, preferenze della chat e cartelle ricordate tornano come appena installato.',
+        conseguenza: 'Le conversazioni e i file NON vengono toccati.',
+        etichettaConferma: 'Ripristina',
+        onConferma: () => { ripristinaPreferenze(); },
+      });
+    });
+    function ripristinaPreferenze() {
+      try {
         window.localStorage.removeItem(DESKTOP_SETTINGS_KEY);
         ...
-      } catch (errore) { ... }
-    });
+      } catch (errore) { ... }
+    }

@@ riga 8675 — «Apri come sessione intera»
-          if (!window.confirm('Aprire questa delega come sessione intera? Lasci la conversazione che stai leggendo.')) return;
-          chiudiConversazioneFiglia();
-          passaASessione({ id: figlia.sessionId, modello: figlia.modello || null });
+          confermaModale({
+            titolo: 'Aprire questa delega come sessione intera?',
+            domanda: 'Lasci la conversazione che stai leggendo.',
+            conseguenza: 'La delega continua comunque: cambia solo quello che hai davanti.',
+            etichettaConferma: 'Apri la delega',
+            onConferma: () => { chiudiConversazioneFiglia(); passaASessione({ id: figlia.sessionId, modello: figlia.modello || null }); },
+          });

@@ riga 8689 — «Ferma questa delega»
-          if (!window.confirm('Fermare questa delega? Il lavoro già fatto resta, quello in corso no.')) return;
-          try { await apiPost(...); ... } catch (errore) { ... }
+          confermaModale({
+            titolo: 'Fermare questa delega?',
+            domanda: 'Il lavoro già fatto resta al suo posto.',
+            conseguenza: 'Quello in corso no: il giro si interrompe dove è arrivato.',
+            etichettaConferma: 'Ferma la delega',
+            onConferma: async () => { try { await apiPost(...); ... } catch (errore) { ... } },
+          });
```
⛔ `window.confirm` è **sincrono** e `confermaModale` no: le tre chiamate vanno rigirate su una
callback come sopra, non sostituite in linea.
⛔ La quarta (riga 15054, eliminazione di sessioni selezionate) è del **lotto D**: la stessa funzione
va bene, ma il testo lo scrive chi possiede quella superficie.

### Non verificato
- Le tre conferme **non sono agganciate**: le ho provate nel laboratorio con il testo del ripristino
  delle preferenze, non nel flusso vero.
- `::backdrop` con `--talos-overlay` l'ho visto in foto su Calm chiaro e scuro; non su tutti i temi.

---

## Riepilogo veloce

**Cosa devi fare tu**
1. Dire se i toast devono restare **in basso a destra** (come ora) o passare **al centro** come il
   mockup: una riga di CSS, ma cambia l'aspetto di 25 messaggi già esistenti.
2. Dire se la spunta delle Attività va bene come **timbro sulle fatte** (senza rotta di scrittura non
   può essere un comando) o se vuoi che apra una richiesta di scrittura lato server — che oggi non c'è.
3. Guardare le 40 foto in `harness-ui/frontend/artifacts/td/` e bocciare quello che non ti torna.

**Cosa faccio io**
Niente altro senza un tuo sì: i lotti C, C-bis, E, F, G sono scritti, provati e fotografati. Gli
agganci nei due file in esclusiva li applica l'altro agente con i diff qui sopra; appena sono dentro
rifaccio il giro vero sul 4174, sezione per sezione, chiaro e scuro.

**Cosa rimane**
Il giro col server vero su tutte e sei le pagine; la Libreria con le azioni vive e l'annullamento
della rinomina fino al disco; lo studio dei temi provato su tutti e quattordici i temi; il
trascinamento del divisorio col puntatore; un giro di tastiera/lettore di schermo. E un debito che
non è mio ma riguarda tutti: **il velo d'avvio `#talosAvvio` rende invisibile il laboratorio dei
componenti**, perché `lab/index.html` non porta l'inline `<style>` del template dove sta il suo
`position:fixed` — senza quella riga è un blocco da 8.697 px in un body da 900. Il cancello di parità
apre le stesse pagine: va guardato prima di fidarsi del suo verde.
