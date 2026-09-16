# Rapporto — porting della BARRA dal mockup dell'owner (lotti A, B, D)

**11/09/2026 · agente Opus 5 (effort high) · worktree isolato `agent-a4449944088e86c31` · lane `lane/harness-desktop`**

Fonte: `.claude/refactor-ui-owner-2026-09-11/Talos_Desktop_Final_Mockup_Interattivo.html`
(`navigate` 6091-6097 · `initSidebar` 6098-6102 · `renderSessions` 6103 · `toggleSidebar` 6104-6108 ·
`openDrawer`/`closeDrawer` 6114-6115 · `sessionMenu` 6142 · CSS 4106-4119 e 4141-4178).

**Banco**: porta **5377** (mia), `dist/` servito da uno stub che ha la FORMA delle rotte vere
(`{ok, data, meta}`). ⛔ La 4174 non è mai stata toccata. La 5311 era **già occupata** da un'altra
sessione: cambiata porta invece di riusarla.

**Stato**: `npm run test:unit` **706/706 verdi** (baseline 696 + 10 cancelli nuovi).
`artifacts/prove.mjs` (prove dal vivo, ognuna col suo verso contrario) **24/24 verdi**.
Nessun errore JavaScript a runtime in 30 scatti, chiaro e scuro, a 1440 · 1024 · 800 px.

⛔ **Contiene anche gli agganci dell'ALTRO lotto** (C/E/F/G), chiesti dal coordinatore a lavoro
finito: vedi la sezione «Gli agganci dell'altro lotto» in fondo — tutti e quattro i punti applicati,
più una quinta riga che la loro consegna ha reso necessaria.

---

## Lotto A — la barra a due gruppi e il cassetto

### Cosa fa il mockup
`initSidebar` (6098) cancella il blocco «Luoghi» e il disclosure «Altro» e li rimpiazza con due
gruppi richiudibili — «Spazi di lavoro» (chat · note · attività · libreria · memoria · ricerca ·
progetti · board) e «Strumenti» (modelli · capability · officina · automazioni · doctor) — con
`state.groups = {lavoro:true, strumenti:false}`. `toggleSidebar` (6104) sotto gli 860 px apre un
cassetto invece di comprimere a icone; `openDrawer`/`closeDrawer` (6114-6115) mettono un velo,
animano l'entrata da sinistra e portano il fuoco sulla prima voce.

### Cosa esisteva già nel prodotto (riusato, non duplicato)
| Pezzo | Dove | Come l'ho usato |
|---|---|---|
| L'ascoltatore dei disclosure | `app.js`, «regia del mockup» — ogni `[aria-expanded][aria-controls]` | Le testate di gruppo si aprono e chiudono **senza un ascoltatore nuovo**: ho aggiunto solo la memoria |
| `impostaConteggioNav` / `aggiornaConteggiNav` | `components/nav-item.js` | I badge restano quelli veri; ho aggiunto solo la chiave `progetti` |
| `aggiornaContatoriLuoghi` | `app.js` | Estesa con `/api/v1/projects` (rotta che esisteva già, la legge `caricaPaginaProgetti`) |
| `toggleSessionsPanel` / `#sessionsCollapseBtn` | `app.js` | Sotto gli 860 px ora apre il cassetto; sopra, comportamento invariato |
| `motionMilliseconds`, `--talos-motion-duration-surface-enter` | `app.js` + token | L'entrata del cassetto usa i token del tema, non numeri scritti a mano |
| Il ponte degli id (`#sessionsPanel` = `.talos-sidebar`) | `bridge/legacy-dom.js` | **Non toccato**: il nuovo markup non rompe nessuno dei suoi `uno(...)` |

### Cura
- `index.template.html`: il blocco «Luoghi» + «Altro» (15 righe) sostituito da `.td-sidebar-nav`
  con due `button.td-nav-head` (`aria-expanded` + `aria-controls`) e i due contenitori. **Nessun
  conteggio scritto a mano**: i numeri d'esempio del mockup (43 · 69 · 18 · 7 · 4 · 11 · 6 · 2 · 3)
  erano copiati nel template e restavano a schermo finché una rotta non rispondeva.
- `index.template.html`: il bottone tondo `#apriCassettoBarra`. ⛔ **senza `aria-controls`** — con
  quell'attributo la regia del mockup avrebbe messo `hidden` sulla barra nello stesso clic che la apre.
- `src/styles/mockup-sidebar.css` (foglio NUOVO, importato in coda a `main.css`): testate, chevron
  che ruota, cassetto, velo, bottone tondo, e le regole della riga di sessione.
- `src/legacy/app.js`: `montaGruppiBarra` (memoria in `talos.harness.desktop.barra.gruppi.v1`),
  `apriCassettoBarra` / `chiudiCassettoBarra` / `alternaCassettoBarra`, Esc nella catena degli strati,
  chiusura al resize sopra 860 e a ogni `setView`, e l'eccezione «Modelli».
- `src/components/nav-item.js` + `lab/main.js` + `tests/unit/componenti-sidebar.test.mjs`:
  `LUOGHI`/`LUOGHI_ALTRI` → `SPAZI_DI_LAVORO`/`STRUMENTI`. **Dovuto**: il laboratorio cercava
  `#altroLuoghi`, che non esiste più — senza questa riga la vetrina dei componenti si sarebbe rotta.

### Tre cose trovate misurando, non ragionando
1. **La testata «Strumenti» spariva.** Prima foto a 1440×900: `flex: 0 1 auto` faceva stare il
   blocco in **310 px** contro i **365** che gli servivano, e i 55 px tagliati erano esattamente la
   porta di cinque luoghi. ⇒ `flex: 0 0 auto`, col tetto del 50% come vera guardia.
2. **«Strumenti» aperto mostrava 3 voci su 5.** Il tetto del 50% è giusto (la barra non deve
   mangiarsi le sessioni), ma il gruppo appena aperto finiva sotto il bordo. ⇒ `scrollIntoView`
   (`block:'nearest'`) sul gruppo che si apre.
3. **Il bottone tondo galleggiava sull'angolo del composer** a 800 px. Un bottone sopra un campo di
   testo è un bersaglio che si preme mentre si scrive. ⇒ il piede della chat gli lascia 60 px.

### Una schermata senza porta, trovata strada facendo
`#schermoModelLab` esiste nel template, con tutte e sei le schede, e **non è in
`VISTA_PER_SCHERMATA`**: nessun `data-view`, nessuno la mostra mai. È la stessa famiglia di «Note» e
«Progetti». La voce «Modelli» apre la porta VERA (Impostazioni → «Laboratorio modelli») invece di
una schermata morta, e `syncNavigationState` accende **solo** la voce più precisa — senza,
Impostazioni e Modelli risultavano tutte e due «sei qui».

### Foto
`…/scratchpad/foto/lotti-abd/` — `barra-{1440,1024}-{chiaro,scuro}`, `gruppo-chiuso-*` (gruppo
«Strumenti» aperto), `cassetto-{chiuso,aperto,dopo-escape}-800-{chiaro,scuro}`.

---

## Lotto B — la transizione al cambio pagina

### Cosa fa il mockup
`navigate` (6091-6097): salva `viewScroll` della pagina che lascia, ripristina quello della pagina
che apre, e anima l'ingresso con
`motion(visible,[{opacity:.4,transform:'translateY(5px)'},{opacity:1,transform:'none'}],'tab-change')`.

### Cosa esisteva già
`setView` aveva **già** l'uscita animata (`animateExit` col token `--talos-motion-duration-tab-change`)
e `markMotionEnter`; `motionMilliseconds` torna già 0 con `reduce-motion`; l'interruttore «Animazioni
interfaccia» era già espresso come classe `interface-motion-off` **e** come token azzerati (11/09).
Non ho aggiunto nessun motore di animazione: ho aggiunto l'ingresso che mancava.

### Cura
- `animaCambioPagina(pannello)` in `app.js`, con **tre cancelli** oltre a quello che c'era:
  `matchMedia('(prefers-reduced-motion: reduce)')` (una media query CSS non ferma un'animazione
  WAAPI), `interface-motion-off`, `motion-navigation-off`. Durata dal token, mai un numero qui.
- `ricordaScorrimentoVista` / `ripristinaScorrimentoVista`: al posto di `target.scrollTop = 0`.
  ⛔ La **chat è esclusa di proposito** — la sua regola è l'opposto («deve trovarsi già in fondo»,
  owner 02/09), e lo stesso vale per terminale, review, browser e vista vuota.
- ⛔ La prima versione era **rossa alla prova**: «prima 420, dopo 0». Le pagine si riempiono da una
  rotta DOPO che `setView` è finito, e `replaceChildren` riportava lo scorrimento a zero un attimo
  dopo. Ora si riprova finché il contenuto cresce, con tre freni (1,2 s, cambio vista, primo
  scorrimento della persona) — la stessa forma di `mantieniFondoDuranteRipristino`.

### Perché non `document.startViewTransition`
La ricerca dell'11/09/2026 dice che l'API non è supportata da Safari e che lì tutto degrada a
navigazione istantanea. Qui il cambio pagina è un `hidden` fra due `<section>` già nel DOM: WAAPI fa
la stessa cosa ovunque.

### Foto
`cambio-pagina-{1440,1024}-{chiaro,scuro}`.

---

## Lotto D — le sessioni nella barra

### Cosa fa il mockup
`renderSessions` (6103) avvolge ogni riga in `.td-session-row`, aggiunge un `.td-session-menu` (tre
puntini) e, in selezione, una casella al suo posto; `sessionMenu` (6142) apre le azioni; il tasto
destro sulla riga apre lo stesso menu (6242).

### Cosa esisteva già (riusato, non riscritto)
Quasi tutto il lotto D **era già nel prodotto**, e non si vedeva:
`apriMenuAzioniSessione` col tasto destro, la selezione multipla completa
(`state.sessionSelection`, caselle, `#sessionSelectionToggle`, «Seleziona tutto», eliminazione in
blocco), l'ordinamento delle sessioni in corso in cima, il pallino di novità e le figlie annidate
sotto la madre (`components/session-item.js`). **Tutto conservato.**

### Cura
- **I tre puntini.** L'involucro `.td-session-row` è obbligatorio: `.talos-session-item` È un
  `<button>`, e un secondo bottone non può starci dentro. Stessa forma del mockup.
- **Il menu è diventato uno solo** (`apriMenuAzioni`), condiviso fra le azioni di una sessione e
  quelle di gruppo, e ha finalmente la **tastiera** che `role="menu"` prometteva: Invio/Spazio
  aprono col fuoco sulla prima voce, frecce e Home/End muovono, Tab esce.
- **Le azioni sono sei, tutte con una rotta vera**: Apri · Rinomina (`/rename`) · Duplica come ramo
  (`/fork`) · Esporta la trascrizione (`/export`) · Copia identificativo · Elimina (`/delete`).
- **`esportaSessioneCorrente` → `esportaTrascrizioneSessione(formato, sessione)`**: prima guardava
  solo `state.realSession.id`, cioè dal menu della riga si poteva esportare unicamente la sessione
  già aperta — l'unica per cui il comando non serve.
- **Le azioni di gruppo**: «Esporta le trascrizioni» (un file solo, non N download che il browser
  blocca), «Copia gli identificativi», «Elimina N sessioni». Il bottone «Elimina» affiancato è
  sparito: la barra ha il conteggio, «Seleziona tutte» e i tre puntini — **mai più di due comandi
  in fila** (owner 10/09).

### Un difetto trovato DAL BANCO, non ipotizzato
Con il menu aperto su una sessione **viva**, `Esc` chiudeva il menu **e apriva** il velo «fermo il
giro?»: due strati smontati con un tasto solo, il secondo dei quali chiede di interrompere lavoro
pagato. La catena di Esc della app è registrata all'avvio, quindi in bolla arriva **prima**; un
`stopPropagation` nel menu sarebbe arrivato tardi. ⇒ l'ascoltatore del menu è passato in fase di
**cattura**, e ora Esc smonta solo lo strato più interno (WAI-ARIA APG).

### «Archivia» NON c'è, e non l'ho finto
Il brief la nominava. `http-app.mjs` non ha nessuna rotta di archiviazione per una sessione
(controllato l'11/09: ci sono `rename`, `delete`, `fork`, `export`, `stop`, `cancel`, `resume`,
`compact`, `settings`, `redirect`, e nient'altro). Una voce di menu che apre un toast «non
collegato» è esattamente la bugia che questa app ha passato mesi a togliere. 🔜 Decide l'owner se la
rotta si fa.

### Foto
`menu-riga-*`, `selezione-*`, `menu-gruppo-*`, nei due temi e alle due larghezze.

---

## Le prove, e ognuna al verso contrario

`harness-ui/frontend/artifacts/prove.mjs` (banco 5377) — **21/21**:

| | |
|---|---|
| A1-A2 | la scelta dei gruppi si scrive e si rilegge al ricaricamento |
| **A3** | *al contrario*: senza scelta salvata vince il default del template |
| A4-A6 | cassetto: velo, fuoco dentro, resto **inert**, Esc chiude e restituisce il fuoco |
| **A7** | *al contrario*: sopra gli 860 px un cassetto aperto si chiude da solo |
| A8 | navigare dal cassetto lo chiude e cambia pagina |
| A9 | «Modelli» apre la sezione vera e accende **solo** la sua voce |
| B1 | la pagina torna dove eri (420 → 420) |
| **B2** | *al contrario*: la chat non ha una colonna da ricordare |
| B3 | il cambio pagina anima |
| **B4** | *al contrario*: `prefers-reduced-motion` ⇒ zero animazioni |
| **B5** | *al contrario*: «Animazioni interfaccia» spento ⇒ zero animazioni |
| D1-D4 | tre puntini su ogni riga; Invio apre col fuoco sulla prima voce; freccia scende; Esc chiude solo il menu; il tasto destro apre lo stesso menu |
| D5-D6 | in selezione i puntini spariscono, la toolbar conta, il menu dice **quante** ne elimina |
| **D7** | *al contrario*: zero selezionate ⇒ menu spento e conteggio nascosto |

Cancelli statici in `tests/unit/barra-gruppi-e-cassetto.test.mjs` (10, due dei quali sono la metà
«al contrario» esplicita): tengono le tre invarianti che **nessuna foto può vedere** — il bottone
del cassetto senza `aria-controls`, `montaGruppiBarra()` dopo la regia, l'Esc del menu in cattura.

---

## Cosa NON ho verificato

- **Nessun giro vero col modello.** Il banco ha uno stub con la forma delle rotte: le sessioni sono
  finte (7 righe, una delega con due figlie). L'ordinamento «le vive salgono in cima» e il pallino
  di novità li ho **conservati**, non rimisurati.
- **`npm run test:componenti` (parità dei componenti contro il mockup)**: lanciata sulle mie porte
  (5381/5382) — la prima corsa, prima della cura di `lab/main.js`, è finita **verde (12 passed,
  12,4 min)**; la seconda era ancora in corso alla consegna. ⛔ Da rilanciare prima del merge.
- **Il tema chiaro/scuro l'ho riprodotto con `addInitScript`** (`colorMode` salvato), non col
  profilo vero dell'owner: è la forma corretta, ma resta una riproduzione.
- **Viewport**: 1440×900, 1024×900 e 800×900. Non ho provato 1280, né altezze basse (< 700 px), dove
  il tetto del 50% sulla navigazione stringe di più.
- **`.talos-sidebar__selezione #sessionSelectionDelete` in `index.css`** è rimasta senza bersaglio
  (il bottone non esiste più). Regola morta, innocua: `index.css` è **generato dal mockup** e non
  l'ho toccato. 🔜 Va via alla prossima rigenerazione.
- **Doctor e Modelli non hanno un badge**: non c'è una lista la cui dimensione significhi qualcosa
  (i controlli di Doctor sarebbero «quanti falliscono», che è un'altra grandezza). Assente è onesto.
- **La parità dei componenti dopo l'unione dei due lotti**: vedi «Gli agganci dell'altro lotto».

---

## I file toccati, e perché

| File | Perché |
|---|---|
| `harness-ui/frontend/index.template.html` | I due gruppi al posto di «Luoghi»+«Altro»; il bottone tondo del cassetto; la barra di selezione con i tre puntini invece del bottone «Elimina» affiancato |
| `harness-ui/frontend/src/styles/mockup-sidebar.css` | **NUOVO** — testate di gruppo, cassetto, velo, bottone tondo, riga di sessione coi tre puntini. Solo token, niente colori a mano |
| `harness-ui/frontend/src/styles/main.css` | Un `@import` in coda: due regole devono battere per **ordine** (non con `!important`) quelle di `index.css` |
| `harness-ui/frontend/src/legacy/app.js` | Lotto A (memoria dei gruppi, cassetto, «Modelli», conteggio progetti, `aria-current`), lotto B (transizione + scorrimento ricordato), lotto D (tre puntini, menu unico con tastiera, azioni di gruppo, export per sessione) |
| `harness-ui/frontend/src/components/nav-item.js` | `LUOGHI`/`LUOGHI_ALTRI` → `SPAZI_DI_LAVORO`/`STRUMENTI`: le liste descrivevano una barra che non esiste più |
| `harness-ui/frontend/lab/main.js` | Il laboratorio cercava `#altroLuoghi`: senza questa cura la vetrina dei componenti si rompeva |
| `harness-ui/frontend/tests/unit/componenti-sidebar.test.mjs` | Il test delle due liste, riscritto sui due gruppi |
| `harness-ui/frontend/tests/unit/barra-gruppi-e-cassetto.test.mjs` | **NUOVO** — 10 cancelli statici sulle invarianti che le foto non vedono |
| `harness-ui/frontend/src/components/{sezioni-adattatori,sezione-elenco-dettaglio,modale-td,theme-studio,toast}.js`, `src/styles/mockup-td.css` | **COPIE** dell'altro lotto (C/E/F/G), portate qui solo per compilare. ⛔ Al merge vincono le sue, non queste |

Non tracciati (fuori dal merge): `harness-ui/frontend/artifacts/` — `foto.mjs`, `prove.mjs`,
`debug-*.mjs`, cioè il banco. `artifacts/` è già in `.gitignore`.

⛔ Nessun `git add`, `git commit`, `git push`: il worktree lo chiude il coordinatore.

---

## Gli agganci dell'altro lotto (C · E · F · G) — chiesti dal coordinatore

Fonte dei diff: `AVM-harness-desktop/.claude/RAPPORTO-PORTING-SEZIONI-2026-09-11.md`.
I moduli nuovi vivono nella lane principale: li ho **copiati nel worktree agli stessi percorsi**
(`src/components/{sezioni-adattatori,sezione-elenco-dettaglio,modale-td,theme-studio,toast}.js`,
`src/styles/mockup-td.css`) perché senza di loro il worktree non compila, e ho aggiunto
`@import './mockup-td.css';` in coda a `main.css` **dopo** il mio `mockup-sidebar.css`.
⛔ Sono copie: **il merge prende i suoi**, non i miei — se divergono, vince la lane principale.

### Applicati: tutti e quattro
| # | Punto | Dove |
|---|---|---|
| 1 | **I sei import.** Le pagine passano a `sezioni-adattatori.js`; i `crea*Row` restano dai vecchi moduli (li usano ancora i fogli laterali); `montaProgetti`/`montaNote` escono da `progetti.js`/`note.js` | `app.js:18-29`, `:63`, `:67` |
| 2 | **I tre facoltativi**: `notifica: toast` sulla Libreria; `notifica: toast` + `onAggiorna` sulle Note; `onAggiorna` sui Progetti | `app.js` — Libreria ~5080, Note ~1627, Progetti ~1592 |
| 3 | **`montaScorciatoiaTemi($('#schermoImpostazioni'))`** dopo **tutti e tre** i `montaImpostazioni` | `app.js:4219`, `:4236`, `:4388` |
| 4 | **Le quattro `window.confirm` → `confermaModale`**, tutte rigirate su callback perché la modale è **asincrona**: ripristino delle preferenze (il corpo è diventato `ripristinaPreferenzeDesktop()`), «Apri come sessione intera», «Ferma questa delega», e la quarta — l'eliminazione delle sessioni selezionate, **mia**, con il mio testo (`chiediEdEliminaSessioniSelezionate`) | `app.js:4232`, `:9016`, `:9035`, `:15477` |

⛔ In `app.js` **non è rimasta nessuna `window.confirm`**: le uniche occorrenze del nome sono nei
commenti che spiegano cosa c'era prima.

### Una quinta riga che il loro lavoro ha reso necessaria
`scrollerDellaVista` (lotto B, memoria dello scorrimento) cercava solo `.talos-page`. Misurato sul
banco **dopo** l'aggancio: tutte e sei le sezioni ora disegnano `.td-master` e **`.talos-page` non
esiste più** in nessuna di loro. Senza la riga, la memoria dello scorrimento sarebbe rimasta accesa
e inerte — il peggiore dei due stati. Ora l'ordine è quello del mockup: `.td-master, .talos-page`.

### Provato, e come
- `npm run build` verde; **`npm run test:unit` 706/706** (i test dell'altro lotto non sono nel mio
  worktree, quindi il numero non cambia).
- `artifacts/prove.mjs` **24/24**, con tre prove nuove:
  **D8** «Elimina» apre la modale nostra e dice *«Eliminare 1 sessione selezionata? Le trascrizioni
  vengono cancellate dal disco. Non si annulla da TALOS.»* — non più il riquadro del sistema;
  **X1** la scorciatoia dei temi (`[data-td-studio-temi]`) è montata nelle Impostazioni;
  **X2** tutte e sei le sezioni disegnano `.td-master`.
- 30 foto rifatte dopo l'aggancio, chiaro e scuro: **nessun errore JavaScript a runtime**.

### NON verificato di questi agganci
- **Le tre conferme dell'altro lotto nel flusso vero**: ho provato che la modale si apre e che il
  testo è quello giusto per la **mia** (eliminazione di sessioni). Il ripristino delle preferenze,
  «Apri come sessione intera» e «Ferma questa delega» li ho agganciati e **non li ho premuti**: il
  primo cancella le preferenze, gli altri due vogliono una delega viva.
- **Lo studio dei temi non l'ho aperto**: X1 prova che il bottone c'è, non che la app si ridipinga.
- **`caricaPaginaNote()` legge ancora `$('#cercaNota', schermo)?.value`** su un campo che non esiste
  più: `?.value || ''` non lancia, l'ho lasciato com'è (è codice dell'altra superficie).
- **La parità dei componenti** (`npm run test:componenti`) **è ROSSA in questo worktree — e lo era
  già prima di noi.** Non la dichiaro verde e non la dichiaro colpa nostra: l'ho **misurata**, con
  un A/B nello stesso momento sulla stessa macchina, invece di attribuirla a naso.

  | Stato dei file | `COMP FonteRicerca` |
  |---|---|
  | tutto com'è adesso (lotti A/B/D + agganci C/E/F/G) | rosso |
  | senza `mockup-td.css` (l'altro lotto) | rosso |
  | senza **nessuno** dei due fogli nuovi | rosso |
  | `index.template.html` **di HEAD** | rosso |
  | **tutti e quattro i file a HEAD** (`index.template.html`, `main.css`, `lab/main.js`, `nav-item.js`) | **rosso** (anche `SettingsNav`) |

  ⇒ Con il worktree riportato allo stato di partenza su tutto ciò che ho toccato, la parità è già
  rossa. Il difetto è **a monte** delle nostre modifiche: nelle immagini salvate
  (`artifacts/parita/comp-FonteRicerca-*`) la foto del mockup è intera e quella della app è
  **inquadrata su un altro punto**, cioè l'elemento sta in una posizione diversa nella pagina del
  laboratorio — non è una differenza di colore o di font.
  🔜 Va capito nella lane principale, con un ambiente pulito. Io l'ho **provato al verso contrario
  quattro volte** e non riesco a farlo diventare verde togliendo il mio lavoro: è quanto posso dire
  onestamente. ⛔ I quattro file sono stati **rimessi a posto** subito dopo la misura (verificato:
  706/706 unit e 24/24 dal vivo dopo il ripristino).

---

## Ricerca web — fonte e data (11/09/2026)

- **Disclosure per una navigazione richiudibile**: 216digital, «Accessible Navigation Design
  Patterns: 2026 Best Practices for WCAG Conformance»; The A11Y Collective, «Practical Guide on
  Implementing aria-expanded»; Intelligence Community Design System, «Side navigation /
  accessibility». ⇒ `button` + `aria-expanded` + `aria-controls`, niente `role="menu"`.
- **Cassetto fuori schermo**: vmitsaras/js-offcanvas; Kahoot! tech blog, «Focus on accessibility —
  accessible menus and modals»; UXPin, «How to Build Accessible Modals with Focus Traps (2026)»;
  Peter Benoit sull'attributo `inert`. ⇒ fuoco dentro, `inert` sul resto, Escape, fuoco restituito:
  «if the menu opens without changing focus, trapping input, or handling escape/close actions, it
  is not ready for production».
- **Transizione di pagina e movimento ridotto**: Smashing Magazine, «The View Transitions API And
  Delightful UI Animations»; dev.to, «Mastering Smooth Page Transitions with the View Transitions
  API in 2026». ⇒ `matchMedia('(prefers-reduced-motion: reduce)').matches` per saltare la
  transizione via codice, e la preferenza è un contratto; View Transitions non è supportata da
  Safari.
- **Menu overflow su una riga di elenco**: Carbon Design System, «Overflow menu / accessibility»;
  dfm2html, «Accessible Drop-Down Menus in 2026 Without a Framework». ⇒ raggiungibile con Tab,
  Invio/Spazio aprono, il fuoco va sulla prima voce, le frecce muovono — più il tasto destro come
  seconda via.
