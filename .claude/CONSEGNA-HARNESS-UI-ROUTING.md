# Consegna — Harness UI: routing vero, sidebar, asset reali

Stato: **in corso**, non ancora chiusa. Questo documento si aggiorna man mano
che la verifica del piano (`~/.claude/plans/leggi-tutto-il-piano-indexed-mccarthy.md`)
procede. Branch `lane/voce-personale`.

## Architettura, come da tre decisioni dell'owner (24/8) — POI RIVISTA lo stesso giorno

1. **Ibrido**: `HarnessScreen.vue` (lista, nativa, nuova) + `HarnessSessionScreen.vue`.
   ⛔ **La seconda metà è stata rifatta lo stesso giorno**: era un trampolino
   (`window.location.assign()` verso il mockup statico, una navigazione
   top-level vera) — l'owner l'ha bocciato guardandolo girare: «l'harness
   deve essere collegato al resto delle schermate esattamente come il
   resto delle funzioni». Verificato io stesso il motivo: il tasto
   Indietro dentro il mockup non tornava alla SPA (la SPA registra un suo
   `backButton` col plugin App per la propria navigazione; il trampolino
   distruggeva quel contesto JS uscendo dalla pagina). **Ora**: il mockup
   vive in uno **shadow root** dentro `HarnessSessionScreen.vue` — mai
   più fuori dalla SPA, stessa cronologia Vue Router di sempre. Ricerca
   web fatta (≥5 fonti docs+repo, vedi il file). Nessun porting del
   mockup dentro Vue: l'HTML/CSS/JS restano gli stessi file, solo montati
   diversamente.
2. **Icon sprite**: tenuto com'è nel mockup statico (nessuna sostituzione con `@lucide/vue`).
3. **Tema**: Harness resta fissato su Calm, indipendentemente dal tema attivo altrove
   nell'app — scelta deliberata, non un difetto.
4. **Sidebar fuse in una sola** (owner, dopo aver visto lo shadow root girare
   per la prima volta): il pannello sessioni del mockup duplicava
   marchio/campanella/badge della sidebar tablet vera (`TalosTabletSidebar.vue`,
   sempre presente) — e ne restringeva la larghezza reale, che il mockup non
   può misurare (le sue media query leggono `window.innerWidth`, non quanto
   spazio dà DAVVERO l'host). `:host(.talos-embedded)` nasconde il pannello
   sessioni SOLO quando incorporato; sfogliarle resta un tocco su
   `HarnessScreen.vue`, nativo.

## File toccati

**Routing e shell**
- `mobile/src/lib/mobileRoutes.ts` — due rotte nuove, `harness` (`/harness`) e
  `harness-session` (`/harness/:id`, `parent: 'harness'`).
- `mobile/src/App.vue` — `SHEET_TITLE_KEY` esteso per le due rotte (stessa chiave,
  `navigation.harness`, per lista e dettaglio).
- `mobile/src/components/shell/TalosMobileSidebar.vue` — voce Harness aggiunta
  **condizionatamente** (icona `FlaskConical`) a `TOOL_DEFINITIONS`, dietro
  `talosHarnessUiAvailable()`. Le sei voci esistenti non sono state toccate.

**Schermate nuove**
- `mobile/src/screens/HarnessScreen.vue` — lista nativa, cinque sessioni demo
  copiate testualmente dal mockup, banner di onestà sui dati finti.
- `mobile/src/screens/HarnessSessionScreen.vue` — trampolino: verifica
  `talosHarnessUiAvailable()` anche qui (non solo alla sidebar), poi
  `window.location.assign(TALOS_HARNESS_UI_PATH)`.

**Rimosso (superato dalla voce in sidebar)**
- Il vecchio `<a href="/harness-ui/index.html">` dentro
  `TalosMobileSettingsCenter.vue` (gruppo Intelligence) e il suo test dedicato
  in `TalosMobileSettingsCenter.test.ts`. Le chiavi i18n `harnessUi.*` sono
  diventate `harness.*` (IT/EN) nello stesso punto del file.

**Asset reali (mockup statico — §3.4/§3.6 del brief)**
- **Font**: `document.fonts.size` era **0** sul documento del mockup (verificato
  via CDP) — "Instrument Sans"/"JetBrains Mono" nella CSS non caricavano mai
  niente, fallback silenzioso al sans-serif/monospace di sistema. Copiati i
  file reali (`@fontsource/instrument-sans`, `@fontsource/jetbrains-mono`,
  pesi 400/500/600 UI e 400/500 mono, latin+latin-ext) in
  `mobile/public/harness-ui/fonts/` con le regole `@font-face` corrispondenti
  in cima a `styles.css`.
- **Logo**: le tre "T" testuali (`.brand-mark`, `.talos-glyph` ×2, `.mini-brand`
  ×2) sostituite con lo stesso meccanismo CSS mask dell'app reale
  (`.talos-short-logo-mark`), stesso file `mobile/public/talos/brand/logo-short.svg`
  (confermato raggiungibile dalla stessa origine del documento, 200,
  image/svg+xml, 1219 byte).
- **Launcher icon/splash**: già reali, nessuna azione — verificati nella
  cronologia commit (`77e1d6d7`, `c828c9a9`, `e1ab2782`, `c677dd70`).

**Test nuovi**
- `mobile/tests/unit/screens/harnessScreen.test.ts`
- `mobile/tests/unit/screens/harnessSessionScreen.test.ts`
- Blocco nuovo in `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`
  (presenza/assenza condizionata al plugin nativo, click → `navigate('harness')`
  vero, non un `window.location`).
- Aggiornato l'array ordinato in `mobile/tests/unit/router/routeWiring.test.ts`.

**Tetto del grafo d'avvio**
- `mobile/scripts/verify-initial-chunk.mjs`: le due rotte nuove costavano 535
  byte oltre il tetto di 613.000 (già alla forma minima, stesso pattern di ogni
  altra rotta nel file — niente da tagliare). Alzato a **614.000**, nota datata
  nello stesso stile delle precedenti. Rimisurato dopo: 613.535/614.000.

## Verificato, con l'evidenza

1. `npm run typecheck` (`vue-tsc -b --force`) — pulito.
2. `npx vitest run`, suite intera — **669 file passati, 3 saltati (672);
   6.219 test passati, 10 saltati (6.229); zero falliti.**
3. `./gradlew :app:compileDebugKotlin :app:compileReleaseJavaWithJavac` —
   `BUILD SUCCESSFUL`.
4. Build + `cap copy android` + `installDebug` reale sul Pad (OPD2415,
   seriale `2ea6573c`, pacchetto **`ai.talos`** — non `ai.talos.dev`, che è
   un'installazione più vecchia rimasta da un'altra sessione: distinzione
   verificata con `dumpsys package` prima di fidarsi degli screenshot).
5. **Sul dispositivo, dalla porta vera** (sidebar → tocco reale via adb,
   CDP solo per localizzare):
   - La voce "Harness" compare in `talos-sidebar-tools`, settima dopo Libreria.
   - Aprendola: lista nativa con banner di onestà, tre gruppi (Oggi/Ieri/Ultimi
     7 giorni), cinque sessioni demo — testo e orari come nel mockup.
   - Toccando una sessione: navigazione top-level VERA, confermata via CDP
     (`https://localhost/harness-ui/index.html` come unico documento aperto,
     non un overlay dentro la SPA) — il trampolino funziona.

## Un secondo giro sul mockup — trovato provando DAVVERO, non ipotizzando

**⛔⛔⛔ Difetto vero, trovato solo dal tocco REALE (non da un `.click()`
sintetico via CDP)**: sul tablet, un tocco vero su "Board" (tab in alto)
non arrivava a destinazione — coordinate ed elemento erano quelli giusti
(`elementFromPoint` lo confermava), ma un `.click()` diretto in pagina
FUNZIONAVA, mentre `adb input tap` alle stesse coordinate no. Causa
misurata: `env(safe-area-inset-top)` vale **40px** su questo dispositivo,
e `.topbar`/`.brand-row`/`.inspector-head` non ne tenevano conto SOPRA i
780px (la regola per il telefono c'era già, quella per tablet/desktop no)
— il tocco fisico a quella Y cadeva sotto la barra di stato di sistema,
invisibile a un controllo CDP-only. Curato: le tre barre ora hanno
`padding-top: env(safe-area-inset-top)` sempre, non solo sotto i 780px.
Vedi [[tocchi-reali-adb-obbligatori]] — è esattamente la classe di difetto
per cui quella regola esiste.

**Nuova richiesta owner (durante la verifica)**: sessioni (sinistra) e
inspector (destra) devono potersi comprimere ED essere ridimensionati con
limiti. Aggiunto:
- pulsante di compressione per le sessioni (`#sessionsCollapseBtn`,
  `.desktop-only`, ≥1041px), stesso schema di quello già esistente per
  l'inspector;
- una maniglia di trascinamento reale per pannello (`.panel-resize-handle`,
  pointer capture + tasti freccia da tastiera), limiti 220–420px sessioni /
  280–480px inspector, persistiti in `localStorage` (comodità della vista,
  non dato reale);
- **da verificare sul dispositivo con un trascinamento vero**, non ancora
  fatto in questa sessione.

**Trovato in più, stesso giro**: una sesta "T" testuale dimenticata nel
primo passaggio — `.avatar` nel piè di pagina della sidebar ("Workspace
locale"). Corretta con lo stesso meccanismo delle altre cinque.

## Un terzo giro — lo stesso fix ha creato un difetto figlio, trovato riprovando

**⛔⛔ Il badge "Demo UI · non collegato" delle sessioni finiva SOTTO la
barra di stato** — screenshot vero, tablet a 1292px CSS di larghezza,
fuori dalle due deroghe già scritte da Codex (781–1100px e il foglio
≤780px). Causa: quel badge è `position:absolute` dentro `.sessions-panel`,
un FRATELLO di `.brand-row`, non un figlio nel suo flusso — il fix della
safe-area sopra sposta giù il contenuto di brand-row ma non tocca questo
fratello assoluto, rimasto a `top:8px` dal bordo del pannello, che coincide
col bordo fisico dello schermo.

Prima cura (stessa ora): spostare solo `top` di `env(safe-area-inset-top)`.
**Riprovato sul dispositivo prima di dichiararlo fatto** — usciva dalla
barra di stato ma finiva DENTRO "TALOS · Harness": stesso spostamento
applicato a un fratello che non condivide la riga del fratello nel
flusso, quindi la collisione si sposta, non sparisce. Cura vera: la
deroga 781–1100px già scritta (`top:68px;left:14px` + margine sulla riga
di ricerca) risolve la STESSA collisione spostando il badge sotto la riga
del marchio — quel numero è tarato su `var(--topbar-h)` (64px), non sulla
larghezza dello schermo, e non aveva motivo di fermarsi a 1100px. Tolto
il tetto, reso `top` dipendente dall'inset: a inset zero torna identico
a prima. **Riverificato con screenshot reale dopo il secondo rebuild**:
badge in una riga propria, nessuna sovrapposizione, logo e barra di
ricerca leggibili. Vedi [[tocchi-reali-adb-obbligatori]] — lo stesso
principio si applica al riprovare un fix, non solo al provare il difetto.

## Board confermato, e un difetto vero nel trascinamento delle maniglie

Tocco vero (adb, non `.click()`) su "Board": ora risponde — `activeView`
passa da `chat` a `dashboard`, il tab si marca `aria-pressed`. Contenuto
onesto: "Server locale non disponibile", trattini ovunque, zero dati
finti spacciati per reali. Compressione sessioni: tocco vero sul
pulsante, `aria-expanded` passa a `false`, pannello a 0, riespanso allo
stesso modo — funziona.

⛔⛔ **Il trascinamento reale (`adb input swipe`) sulla maniglia NON
ridimensionava nulla** — `elementFromPoint` sul centro esatto della
maniglia restituiva `.chat-view`, mai la maniglia, nonostante il suo
`z-index:6`. Causa: `.sessions-panel`/`.inspector-panel` hanno già
`background`+`backdrop-filter` (riga ~170) — la SOLA presenza di
`backdrop-filter` crea un contesto di stacking nuovo, indipendente da
`position`+`z-index`. Senza uno z-index proprio sul PANNELLO, l'intero
pannello (maniglia compresa) restava nel livello "auto" e perdeva per
ordine nel DOM contro `.chat-view` (anch'esso assoluto e "auto", ma
dichiarato dopo nell'HTML) — lo z-index:6 della maniglia non usciva mai
da quel contenitore per competere. Cura: `z-index:1` esplicito su
`.sessions-panel, .inspector-panel`. **Riverificato col trascinamento
vero dopo il rebuild**: `elementFromPoint` ora restituisce la maniglia,
`adb input swipe` sposta davvero la larghezza (292px → 365px, salvata in
`localStorage`, dentro il limite 220–420) — screenshot reale confermato,
pannello visibilmente più largo.

## Un quarto difetto — lo stesso trascinamento ne ha scoperto un altro

⛔⛔ **Allargando le sessioni a 365px (un valore qualunque dentro il
limite, non un estremo) il chip del branch nella topbar finiva sopra il
tab "Board"** — 17px di sovrapposizione reale, misurata con
`getBoundingClientRect` su entrambi, non a occhio. Causa: `.context-chip`
è un figlio flex di `.topbar-right` (che ha già `min-width:0`), ma il
chip stesso no — senza `min-width:0` proprio, un elemento flex non si
restringe mai sotto la dimensione del suo contenuto, per quanto lo `span`
interno dichiari già `text-overflow:ellipsis` (riga esistente, mai
attivata perché il chip non si restringeva abbastanza da averne
bisogno). Prima del 24/8 la larghezza delle sessioni era fissa (292px, o
268px sotto i 1280px) — questo schiacciamento della colonna centrale non
era MAI raggiungibile finché il trascinamento non l'ha reso possibile.
Cura: `min-width:0` su `.context-chip`.

**Riverificato dopo il rebuild** (che alla prima installazione ha fallito
per `device offline` su un transport ADB wireless in stallo — non un
difetto di codice: risolto disconnettendo il transport morto e
rilanciando `installDebug` da solo): `overlap:false`, il chip mostra
"wt/auth·fea…" con l'ellissi, "Board" pienamente leggibile, ~16px di
margine reale fra i due. Testata anche la maniglia dell'INSPECTOR (stessa
cura `z-index:1`, mai provata isolatamente prima): `elementFromPoint` la
trova, un trascinamento vero la allarga 340→378px, screenshot pulito,
nessuna sovrapposizione nuova. `localStorage` sopravvive a un
reinstall (non un uninstall): le larghezze provate prima sono ancora lì.

## Un quinto difetto (nel TRAMPOLINO — superato dalla riscrittura sotto)

⛔⛔⛔ **Dentro il mockup, il tasto/gesto Indietro (adb keyevent 4, non
ipotizzato) non tornava alla SPA e non usciva dall'app — un vicolo cieco
reale**, verificabile solo con la porta vera (l'app restava in primo
piano, l'URL non cambiava). Causa: la SPA registra un suo listener
`backButton` del plugin App per la propria navigazione interna; il
trampolino ci arriva con `window.location.assign()`, una navigazione
top-level VERA che distrugge il contesto JS della SPA — ma il registro
dei listener vive nel bridge NATIVO di Capacitor, non nel contesto JS
distrutto, e la documentazione Capacitor (letta con context7, non a
memoria) dice esplicitamente: *"Listening for this event will disable
the default back button behaviour"* — quindi il comportamento nativo di
serie resta disattivo anche nel mockup, e il vecchio listener della SPA
non può più rispondere: né lui, né il default nativo, nessuno.

⛔ Questo E' esattamente il sintomo che ha portato l'owner a bocciare
l'intera architettura del trampolino (vedi in testa al documento). La
cura locale (un listener `backButton` in più) è stata scritta, provata
inefficace per un motivo diverso (vedi sotto), e infine **rimossa**: non
serve più, perché con lo shadow root non si esce mai dalla pagina.

## La riscrittura: shadow root, non più trampolino — verificata sul dispositivo

Rifatta `HarnessSessionScreen.vue` da zero (vedi il file per la ricerca
web completa, ≥5 fonti). Riassunto di cosa è cambiato e perché, con le
prove:

1. **Il mockup vive in `host.attachShadow({mode:'open'})`**, dentro la
   stessa pagina. `<link rel="stylesheet" href="/harness-ui/styles.css">`
   (non CSS inline: i 10 `@font-face` hanno percorsi relativi che un
   `<link>` risolve correttamente, un testo iniettato a mano no) +
   `<script src="/harness-ui/app.js">` (mai inline/eval: CSP
   `script-src 'self'`, senza `'unsafe-inline'`).
2. **`app.js` adattato** (non riscritto): `$`/`$$` ora hanno un default
   `ROOT()` invece di `document` — un cambio di UNA riga copre la
   stragrande maggioranza delle chiamate, perché il file usava già quei
   due helper ovunque. Aggiunta `HOST()` per le proprietà CSS
   personalizzate (`--sidebar`/`--inspector`): scrivere su
   `document.documentElement` non avrebbe avuto alcun effetto, perché
   `:host` (ex `:root`, tradotto per lo stesso motivo — vedi sotto)
   dichiara quelle proprietà DIRETTAMENTE sull'host, e una dichiarazione
   diretta batte sempre un valore ereditato. I due `document.addEventListener`
   globali (click, keydown) sono diventati `ROOT().addEventListener` —
   altrimenti avrebbero intercettato scorciatoie da tastiera e clic anche
   fuori da Harness. `window.__talosHarnessDestroy` è il "distruttore"
   (pattern reale, PagerDuty) che rimuove i tre ascoltatori su
   `window`/`visualViewport` che sopravvivono allo shadow root — chiamato
   da `onBeforeUnmount`.
3. **`styles.css`**: `:root` → `:host` (5 occorrenze — `:root` in un
   foglio di shadow root punta SEMPRE al vero `<html>`, mai all'host).
   `html`/`body` nudi → `:host` (margini, sfondo, `overflow`; `100dvh` →
   `height:100%`, il componente non possiede più l'intero schermo).
   `body.reduce-motion`/`body.keyboard-open` → `:host-context(body.X)`
   (l'unico modo per reagire a una classe sul body VERO da dentro lo
   shadow root — `app.js` continua a scriverla lì apposta).
4. **Test riscritti** (`harnessSessionScreen.test.ts`): 5 casi, `fetch`
   mockato per `index.html`, un evento `load` sintetico sullo script (jsdom
   non esegue script esterni), verificano `attachShadow` avvenuto,
   `window.location.assign` MAI chiamato, lo stato di errore onesto, e il
   contratto del distruttore alla smontatura. **Suite intera**: 669 file,
   6221 test, 0 falliti (typecheck pulito, `node --check` su app.js
   pulito, parentesi di styles.css bilanciate prima ancora di aprire il
   dispositivo).
5. **Sul dispositivo, tocco vero**: entrato in una sessione, `href` resta
   `https://localhost/harness/refactor-auth-flow` (MAI più
   `harness-ui/index.html`) — `docTitle` resta "TALOS Mobile". Shadow root
   popolato (`app-shell`, sprite icone, 29 font caricati). **Il tasto
   Indietro hardware ora torna a `/harness`** (stessa cronologia di
   `/memoria`, già verificata). **La freccia "← Harness" esplicita
   funziona identica.** Board risponde, contenuto onesto. Maniglia
   dell'inspector: `elementFromPoint` la trova, un trascinamento vero la
   allarga davvero, dentro lo shadow root stavolta.

## Un sesto difetto — DUE sidebar, "un casino" (parole dell'owner)

Primo giro sul dispositivo con lo shadow root: la sidebar VERA di TALOS
(chat, sempre presente su tablet — `TalosTabletSidebar.vue`, F6, "Claude
split-view pattern") e quella PROPRIA del mockup (sessioni, con
marchio/campanella/badge duplicati) affiancate — E la larghezza reale
dell'host (972px) schiacciata dalla colonna sessioni del mockup (360px,
salvata da un trascinamento precedente) più l'inspector (376px),
lasciando **236px** alla colonna centrale: pillole e label del piano
troncate a una lettera ("t...", "A. T. C. T."). Causa profonda: le media
query del mockup leggono `window.innerWidth` (1292, l'intero
dispositivo), mai quanto spazio dà DAVVERO l'host — un limite noto di
qualunque contenuto a viewport fisso incorporato in un contenitore più
stretto.

Owner, guardando lo screenshot: fondere le due sidebar in una sola.
Cercato lo stato dell'arte (micro-frontends.tech): il guscio possiede
layout e navigazione, il contenuto incorporato non porta la sua —
"critical for avoiding multiple navigation components rendering
simultaneously". Cura: `HarnessSessionScreen.vue` marca il suo host
`.talos-embedded`; `:host(.talos-embedded)` in `styles.css` nasconde
**solo** il pannello sessioni del mockup (branding/campanella/badge
spariscono con lui) e porta la griglia a due colonne
(`minmax(0,1fr) var(--inspector)`) — mai quando il file si apre da solo
per la revisione design. **Riverificato sul dispositivo**: una sidebar
sola, colonna centrale a 596px (da 236), "Plan 4/6" e le pillole
Workspace/Branch/Permessi/Modello pienamente leggibili, tasto Indietro
(hardware e freccia) invariati, maniglia inspector ancora funzionante
dentro la nuova griglia a due colonne.

## Ricognizione su Claude vero — owner 24/8, prima di ridisegnare

Owner: «abbiamo sbattuto sul muro» — non più patch CSS, capire come fa
CHI l'ha già risolto. Girato **l'app Claude vera** (`com.anthropic.claude`,
già installata sullo stesso Pad) su più viewport, con screenshot reali:

- **Una sidebar sola, contestuale, non due affiancate.** L'hamburger apre
  un cassetto con la navigazione di primo livello (Chat · Progetti ·
  Artefatti · **Codice** · Cowork · Invio); scegliendone una il cassetto
  si chiude e **la sidebar stessa cambia contenuto** — "Codice" mostra
  "Dispositivi" + le sessioni coding reali ("talos-main", "talos 17/18",
  "Connesso"), mai la cronologia chat accanto. Stesso slot fisico,
  contenuto diverso secondo la sezione attiva.
- **Tablet verticale**: resta uno split affiancato (non si impila), solo
  con proporzioni diverse — e il contenuto di Claude (nativo, non a
  viewport fisso) si adatta senza troncare nulla.
- **Telefono**: la sidebar sparisce del tutto, solo hamburger — conferma
  che lo schiacciamento (sidebar chat + mockup) è un problema SOLO
  tablet: `TalosTabletSidebar` è già `v-if="tabletChatRailVisible"`, mai
  montata su telefono, per Claude né per TALOS.

**5 ricerche** (testuali, mirate a fonti di pattern visivi — Dribbble/
Navbar Gallery non hanno un motore immagini diretto): Material Design 3
raccomanda ufficialmente la *Navigation Rail* con transizione automatica
bottom-bar↔rail secondo lo spazio; il pattern SaaS (Slack/Linear/Notion)
è "contextual sidebar navigation adapts its content based on the user's
current location"; e — conferma indipendente della causa tecnica già
misurata — *"a card component built with media queries breaks when you
move it from a wide content area to a narrow sidebar... even though its
available space shrank"* (Smashing Magazine, container queries).

Sources: [M3 Navigation Rail — Android Developers](https://developer.android.com/codelabs/adaptive-material-guidance) · [SaaS Navigation Design Patterns](https://designpixil.com/blog/saas-navigation-design-patterns) · [CSS Container Queries — Smashing Magazine](https://www.smashingmagazine.com/2021/05/complete-guide-css-container-queries/)

**Non ancora deciso/implementato**: se rifare la sidebar tablet come
quella di Claude (contestuale, `TalosTabletSidebar` mostra
`HarnessScreen.vue` invece della chat quando si è in Harness) resta una
proposta, non ancora approvata per l'implementazione.

### Correzione — il telefono verticale di Claude era in realtà orizzontale

⛔⛔⛔ Owner: «non hai analizzato Claude in portrait (verticale) viewport
telefonino, errore gravissimo». Vero: `claude-07-phone-portrait.png`,
consegnato in questo stesso giro come "verticale", non era mai stato
verificato leggendo i byte reali del PNG — solo il nome del file
dichiarava l'orientamento. Rilette le sue dimensioni reali dopo la
segnalazione: **2400×1080, cioè orizzontale**. Stesso errore di
inversione `wm size` già misurato e documentato sul tablet (sopra), qui
capitato di nuovo perché non ripetuto l'accorgimento su Claude.

Corretto: `wm size 2400x1080` + `wm density 440` +
`accelerometer_rotation 0` + `user_rotation 0`, poi lette le dimensioni
PNG **prima** di guardare o consegnare qualunque cosa — confermato
**1080×2400** (verticale vero) sia per Chat sia per "Codice"
("Dispositivi" + le due sessioni reali, a schermo intero, nessuno split
— coerente col pattern già visto in orizzontale). Consegnate all'owner
`claude-phone-portrait-TRUE.png` e
`claude-codice-phone-portrait-TRUE.png`, con didascalia che dichiara
l'errore invece di sostituire silenziosamente lo screenshot sbagliato.

Effetto collaterale incontrato durante la ripresa: un `keyevent 4` dato
per chiudere la tastiera ha invece **chiuso l'app Claude**, rivelando
`ai.talos` sotto — comportamento noto del tasto Indietro quando dipende
dallo stato dello stack dei task, non un difetto; recuperato rilanciando
Claude e confermando il focus con `dumpsys window | grep mCurrentFocus`
prima di proseguire, evitando poi `keyevent 4` per chiudere tastiere.

**Verifica a tappeto, non solo sul file corretto**: rilette le dimensioni
reali di **tutti e 18** gli screenshot catturati o consegnati in questo
giro (TALOS e Claude, telefono e tablet, entrambi gli orientamenti).
Unico difetto: quello già trovato e corretto sopra — nessun'altra
etichetta di orientamento si è rivelata falsa.

**Taccuino ispettore sui due file corretti** (schermo intero, non solo
l'orientamento): confermano il pattern già visto in orizzontale — Chat e
Codice restano a riquadro unico, mai split, coerente con "sidebar sparisce
del tutto su telefono". Due osservazioni incidentali, su Claude stesso
(non TALOS, fuori ambito da correggere, annotate per onestà):
"Codice" verticale è stato catturato mentre Claude mostrava lo screen di
rientro "Antonino è di ritorno" invece della Chat popolata — comunque
valido per osservare hamburger/riquadro unico, ma non un corpo chat a
riposo; e la riga sessione "talos 17/18" mostra un glifo icona reso come
una singola parentesi "(" invece di un simbolo completo (la riga gemella
"talos-main" mostra "</>" pulito) — possibile artefatto di rendering
dell'app Claude, non indagato oltre perché fuori ambito.

## Il settimo difetto — la cura del tablet rompeva il telefono

⛔⛔⛔ Owner: «ti sei dimenticato di controllare il viewport telefono? È
importantissimo». Vero — provato SOLO dopo, e trovati DUE guasti reali
che i fix pensati per il tablet avevano introdotto sul telefono:

1. **`:host(.talos-embedded) .app-shell{grid-template-columns:minmax(0,1fr) var(--inspector)}` era SENZA deroga di larghezza** — vinceva anche sotto i
   1040px, dove il mockup vuole l'inspector come cassetto fuori schermo,
   non una colonna. Misurato a 872px reali: `grid-template-columns:
   462.7px 410px` — 410px riservati e VUOTI (il pannello vero era già
   spostato fuori schermo dalla regola del mockup), un buco nero a metà
   telefono. Cura: la regola ora vive dentro `@media(min-width:1041px)`;
   sotto i 1040px una regola sorella toglie solo la colonna delle
   sessioni (`minmax(0,1fr)`, un'unica colonna), senza toccare il
   cassetto dell'inspector.
2. **Trovato PROVANDO "Altro" nella nav mobile, non ipotizzato**: schermo
   che si scurisce e resta buio, nessun pannello appare. Causa: la regola
   di stacking `.sessions-panel, .inspector-panel { position: relative;
   z-index: 1 }` (scritta per la maniglia di ridimensionamento sul
   tablet) era ANCH'ESSA senza deroga — sotto i 1040px vinceva sul
   `position:fixed;transform:translateX(102%)` che fa scivolare
   l'inspector in scena, lasciandolo `position:relative` e immobile
   mentre lo sfondo si scurisce comunque (regola diversa, invariata).
   Cura: anche questa dentro `@media(min-width:1041px)` — la maniglia che
   proteggeva è comunque `display:none` sotto quella soglia, quindi
   nessuna perdita.

**Riverificato dopo il rebuild, entrambi i guasti**: "Altro" nella nav
mobile ora fa scivolare in scena il Context Rail intero (Sessione,
Context/Files/Agents, Ambiente/Workspace/Branch/Worktree/Root,
Capability, Memory, Session topology, pulsante di chiusura) — schermata
pulita, nessun buco nero. `wm size` su questo hardware nativo landscape
è INVERTITO (misurato scattando e leggendo i byte PNG, non ipotizzato):
`wm size 2400x1080` dà un output reale 1080x2400 (verticale). Con
l'inversione corretta, provato per intero **telefono verticale E
orizzontale**: lista Harness, sessione (Chat con Missione/Plan/
composer), Board, e il pannello Context via "Altro" — tutti puliti, testo
completo, zero sovrapposizioni.

## Non ancora fatto (non dichiarare chiuso finché non lo è)

- ✅ Tocco vero su "Board" — risponde, contenuto onesto, verificato SIA
  prima SIA dopo la fusione delle sidebar.
- ✅ Trascinamento vero sulla maniglia dell'inspector — verificato su
  tablet orizzontale, prima e dopo la fusione delle sidebar.
- ✅ Tasto Indietro (hardware E freccia esplicita "← Harness") —
  verificato sul dispositivo dopo la riscrittura a shadow root.
- ✅ **Telefono verticale E orizzontale** (`wm size` invertito su questo
  hardware, misurato non ipotizzato) — lista, sessione, Board, pannello
  Context via "Altro": tutti puliti dopo la cura del settimo difetto.
- ✅ **Tablet verticale** — riprovato con TUTTE le cure di oggi insieme
  (fusione sidebar + le due deroghe di larghezza del settimo difetto):
  pillole Workspace/Branch/Permessi/Modello e "Plan 4/6" pienamente
  leggibili, nessun buco nero. ⛔ Nota procedurale: la prima riprova è
  fallita per un mio errore, non del codice — avevo riacceso
  `accelerometer_rotation` nel reset di stato e poi provato a forzare
  `user_rotation` senza disattivarlo di nuovo: la rotazione veniva
  ignorata in silenzio, screenshot identico al precedente. Scoperto
  controllando `settings get system accelerometer_rotation` invece di
  fidarmi delle dimensioni dello screenshot.
- ✅ Tablet orizzontale — riprovato DOPO le due deroghe del settimo
  difetto: invisibili a questa larghezza come previsto, nessuna
  regressione.

**Le quattro combinazioni di viewport sono ora tutte verificate pulite
con l'architettura finale** (shadow root + sidebar fusa + le due deroghe
di larghezza). 18 screenshot consegnati all'owner in questo turno (3
telefono TALOS, 4 telefono/tablet TALOS finali, 9 del giro Claude, 2 di
correzione del telefono verticale Claude) — tutti e 18 riverificati
leggendo i byte PNG reali, non il nome del file (vedi "Correzione" sopra).
- Ispezionare OGNI screenshot per intero, non solo l'elemento sotto
  prova — fatto per il telefono TALOS (entrambi gli orientamenti) e per
  i due file di correzione Claude; resta da fare per il tablet TALOS con
  l'architettura finale.
- ✅ `git status --short` + commit — fatto, tre commit scoped (routing/
  sidebar/screens nativi; shadow root + fusione mockup + font; consegna),
  lasciati intatti i file di un altro lavoro in corso nello stesso repo
  (`.claude/CONSEGNA-MOTORE-LOCALE-MAX-PERFORMANCE.md`,
  `.claude/DECISIONI-CODEX-HARNESS-UI.md` e i quattro documenti di
  coordinamento Codex — nessuno toccato).

## Sidebar contestuale — il refactor vero, owner 24/8 «procedi da solo»

La proposta lasciata aperta sopra ("non ancora deciso/implementato") è
stata approvata e implementata: **la stessa fetta di sidebar tablet
(`TalosTabletSidebar.vue`) ora mostra contenuto diverso secondo la
stazione attiva**, invece di un rail chat sempre uguale accanto a
Harness. Stesso pattern osservato su Claude vero (ricognizione sopra):
un solo slot, contenuto contestuale, mai due pannelli affiancati.

**Come funziona**: `App.vue` calcola `tabletRailVariant` dalla STESSA
funzione che già decide `tabletChatRailVisible`/`isStation`
(`talosMobileStationOf(activeRoute)` — mai una seconda lettura di
rotta) e lo passa come prop `variant` a `TalosTabletSidebar`, che monta
`<HarnessScreen embedded>` invece di `<ChatsScreen embedded>` quando
`variant === 'harness'`. L'header del rail (hamburger, wordmark, campanella)
resta fisso in entrambi i casi — solo il corpo cambia, esattamente come
l'hamburger di Claude resta lì mentre il contenuto sotto cambia.

**`HarnessScreen.vue` ha ora un prop `embedded`** (stesso nome/idioma di
`ChatsScreen`), che disattiva la chrome di `TalosMobileScreen` (niente
H1 proprio, niente sfondo opaco — il rail è già `bg-[var(--talos-sidebar)]/60
backdrop-blur-sm`, uno sfondo opaco sopra avrebbe vanificato la sfocatura,
lo stesso "casino" già corretto altrove) invece di duplicare la struttura
in due rami di template: `TalosMobileScreen.vue` stesso ha guadagnato il
prop `embedded` (default `false`, **zero regressione per gli altri ~10
consumatori** — Settings, Memoria, Note, ecc. non lo passano mai).

**LISTA-DOPPIA-01, di nuovo, per Harness**: la stessa domanda già
risposta per `chats`→`chat` (il rail mostra già l'elenco, restare sulla
rotta-elenco nuda nel riquadro principale lo disegnerebbe due volte) si
ripropone identica per `harness`. Nuova funzione gemella
`talosTabletLeavesHarnessListRoute` in `tabletLayout.ts`, stesso
watcher in App.vue: su tablet, `/harness` nudo reindirizza a
`harness-session` con `HARNESS_DEFAULT_SESSION_ID` (il primo demo,
"Refactor auth flow").

**Il peso eager, misurato PRIMA di alzare il tetto (di nuovo)**: il primo
tentativo di build ha sforato il tetto (614.000 → 614.413). Causa:
`HARNESS_DEFAULT_SESSION_ID` derivato da `HARNESS_DEMO_SESSIONS[0].id`
dentro `harnessDemoSessions.ts`, importato da App.vue (eager) — Rollup
non può costante-piegare una lettura per indice, quindi l'intero array
delle cinque sessioni demo (titoli/meta/orari) viaggiava nel chunk
iniziale solo per UNA stringa. Tolto il peso vero: la costante vive ora
da sola in `harnessDefaultSession.ts` (mai importato insieme
all'array); `harnessDemoSessions.test.ts` asserisce che le due
restino uguali, cosi il taglio non puo' derivare in silenzio. Misurato
dopo: 613.751 — tetto INVARIATO a 614.000, nessun bisogno di alzarlo.

**Verificato sul Pad reale, tablet verticale E orizzontale** (screenshot
+ letture dirette del DOM via CDP, non solo l'occhio):
- `data-talos-tablet-sidebar-variant` sull'`<aside>` passa da `chat` a
  `harness` correttamente; `aria-label` passa da "Pannello chat" a
  "Pannello Harness" (mai un'etichetta che dichiara il contrario di
  cosa c'e' a schermo, la stessa disciplina gia' applicata allo
  screenshot Claude corretto sopra).
- Tocco vero sulla voce "Harness" del cassetto (hamburger del rail) →
  atterra DIRETTAMENTE su una sessione (mai sulla lista nuda duplicata),
  confermato leggendo `location.href` via CDP:
  `.../harness/refactor-auth-flow`.
- Tocco vero su una riga diversa nel rail incorporato ("Audit API
  permissions") → il riquadro principale naviga alla sessione giusta
  (`location.href` → `.../harness/audit-api-permissions`); il contenuto
  visivo del mockup non cambia — limite GIA' documentato e fuori ambito
  (§5 del piano originale: "un solo documento statico, l'id si legge
  solo per diagnosi"), non una regressione di oggi.
- Nessuna doppia sidebar, nessun pannello sessioni duplicato: `hasChatsScreen`
  e' `false` quando il variant e' `harness`, e viceversa — mai insieme.
- Telefono verticale: percorso NON incorporato invariato (il rail non
  esiste sul telefono), nessuna regressione visiva sulla lista Harness
  originale.

**Rilievo incidentale, NON di oggi, NON corretto (fuori ambito)**: toccare
una chat ESISTENTE dal cassetto hamburger (`TalosMobileSidebar.vue`,
MAI toccato in questo refactor) mentre la stazione attiva e' Harness non
naviga via a `chat` — confermato non essere un mio errore di mira
(un `.click()` reale via CDP sull'elemento giusto da' lo stesso esito,
`location.href` invariato). Le voci STRUMENTI dello stesso cassetto
(Harness, Ricerca approfondita) navigano correttamente dallo stesso
cassetto, quindi il difetto e' ristretto alla selezione di una chat
gia' esistente, non al cassetto in generale. Segnalato per l'owner,
non indagato oltre: componente diverso da quello di questo refactor,
nessun ordine di toccarlo.

## Ripresa Codex 25/8 — piano owner approvato

Owner: approvazione esplicita ricevuta il 25/8 con ordine `GO` e richiesta di
aggiornare questo documento alla fine di ogni fase.

### Fase 0 — ricerca e ledger

Stato: **in corso** fino alla verifica RED dei primi scenari; nessun cambio di
comportamento applicativo è stato ancora eseguito.

Creati due documenti distinti, senza sovrascrivere dossier e ledger Codex
preesistenti:

- `.claude/DOSSIER-RICERCA-HARNESS-UI-ROUTING-PAD.md`
- `.claude/LEDGER-HARNESS-UI-ROUTING-PAD.md`

Il dossier registra fonti ufficiali correnti, pin già presenti e decisione
`adopt/adapt/reject`. Il ledger enumera file, simboli, test RED, comandi GREEN,
prove Pad e rollback per tutte le fasi.

Correzione di gerarchia decisionale: la vecchia frase di questa consegna
"Harness resta fissato su Calm" è superata dalla decisione owner successiva,
approvata nel piano 25/8: Harness deve consumare i token stilistici e seguire
il theme engine TALOS. La cronologia sopra resta intatta come testimonianza del
punto precedente; non è più il requisito finale.

Baseline ereditata prima dei RED:

- `npm run typecheck`: exit 0.
- suite focalizzata Harness/shell: 8 file, 46 test, zero falliti.
- `node --check public/harness-ui/app.js`: exit 0.
- full Vitest e build non sono attribuiti a questa ripresa finché non vengono
  rilanciati freschi nella Fase 7.

Pad ripristinato dopo l'audit di sola lettura: 2400x3392, density 420,
rotazione automatica attiva. Repository prima delle modifiche: branch
`lane/voce-personale`, ahead 35; i documenti sporchi di altre sessioni restano
fuori dagli add.

#### Chiusura Fase 0

Stato: **completata**. Nessuna produzione modificata.

RED osservati il 25/8 con Vitest 4.1.10:

- `GLOBAL-SIDEBAR-ABOVE-HARNESS-01`: ricevuto ancora `z-50` invece del livello
  globale previsto.
- `HARNESS-TOP-LAYER-DISMISS-01`: il runtime Harness ha ricevuto 0 chiamate di
  dismiss invece di 1.
- `HARNESS-OUTER-SCROLL-01`: body ancora `overflow-y-auto`, nessun
  `overflow-hidden` per Harness.

Esito mirato: 3 test falliti per la causa prevista, 29 test già verdi. Un
fallimento estraneo comparso nel primo giro era contaminazione di teardown del
nuovo test RED; corretta soltanto la pulizia del test e ripetuto il comando,
lasciando rossi esclusivamente i tre scenari reali.

Commit: nessuno, perché una suite intenzionalmente rossa non viene committata.
I test entreranno nel commit della Fase 1 soltanto dopo il GREEN e le prove Pad.

### Fase 1 — navigazione globale sopra Harness

Stato: **completata e verificata sul Pad reale**.

In parole semplici: prima una finestra aperta dentro Harness poteva diventare
più importante dell'intera app e intercettare il dito; la sidebar globale
restava sotto. Ora palette e pannelli Harness sono confinati dentro il riquadro
Harness. Un solo tocco sull'hamburger chiude la finestra locale e apre il menu
globale, che copre correttamente ogni superficie e conserva la X utilizzabile.
Il riquadro Harness possiede inoltre il proprio scorrimento: il contenitore
esterno della station non scorre più una seconda volta.

La prima prova contraria sul Pad ha trovato un buco che i test DOM non potevano
simulare: il `<dialog>.showModal()` nativo entrava nel top layer del browser e
impediva fisicamente al tocco di raggiungere Vue. La fase è stata fermata,
il ledger è stato corretto e la regressione permanente
`HARNESS-NATIVE-TOP-LAYER-HITTEST-01` è passata da RED a GREEN. Il bundle ora
usa finestre locali non modali con un backdrop Harness esplicito; nessun
`showModal()` è ammesso negli asset incorporati.

File di produzione chiusi in questa fase:

- `mobile/src/lib/harnessUiBridge.ts`
- `mobile/src/App.vue`
- `mobile/src/components/shell/TalosMobileToolSheet.vue`
- `mobile/src/components/shell/TalosMobileSidebar.vue`
- `mobile/src/components/ui/drawer/DrawerContent.vue`
- `mobile/src/style.css`
- `mobile/public/harness-ui/index.html`
- `mobile/public/harness-ui/styles.css`
- `mobile/public/harness-ui/app.js`

Prove automatiche fresche:

- gruppo mirato: 5 file, **36 test passati**, zero falliti;
- `npm run typecheck`: exit 0;
- `node --check public/harness-ui/app.js`: exit 0;
- `npm run build`: exit 0, 3.624 moduli; JavaScript iniziale
  613.909/614.000 byte e CSS 214.709/220.000 byte;
- verifica parity: 18/18 passata;
- `npx cap copy android`: exit 0;
- `:app:compileDebugKotlin :app:compileReleaseJavaWithJavac`: BUILD SUCCESSFUL,
  513 task;
- `:app:installDebug -PtalosSideBySide`: BUILD SUCCESSFUL;
- `git diff --check`: exit 0.

Prove reali, tutte lette dai byte PNG e ispezionate per intero:

- tablet orizzontale 3392x2400: palette aperta → un tocco reale sull'hamburger
  → palette chiusa, drawer globale sopra tutto, X realmente toccabile;
- tablet verticale 2400x3392: stesso percorso e stesso esito;
- telefono orizzontale 2400x1080: la larghezza supera il breakpoint tablet;
  stesso percorso palette → hamburger → drawer sopra tutto;
- telefono verticale 1080x2400: il dettaglio station espone per contratto la
  freccia indietro e non un hamburger. Verificate palette e backdrop locali,
  ritorno a Harness/chat e drawer globale completo con voce Harness e X
  toccabile, senza aggiungere un controllo incoerente con le altre station.

Evidenze temporanee locali:
`C:\Users\Antonino\AppData\Local\Temp\talos-harness-fixes-20260825-phase1`.
Il Pad è stato ripristinato a 2400x3392, density 420, rotazione automatica
attiva (`accelerometer_rotation=1`, `user_rotation=1`).

Discrepanze rimaste visibili e già assegnate alle fasi successive, non
spacciate per risolte qui: rail sessioni tablet non comprimibile (Fase 2),
composer/tastiera/nav inferiore nelle forme telefono (Fase 3), selezione rotta
non sincronizzata col mockup (Fase 4), controlli/collisioni (Fase 5) e token
tema live (Fase 6).

### Fase 2 — rail Harness comprimibile e local-first

Stato: **completata e verificata sul Pad reale**.

In parole semplici: sul tablet la lista delle sessioni Harness può ora essere
ridotta a una barra stretta da 72px e riaperta quando serve. La scelta viene
salvata sul dispositivo e sopravvive alla chiusura e riapertura dell'app,
senza rete. Questa preferenza riguarda soltanto Harness: la lista Chat conserva
larghezza, ricerca e contenuto normali.

La prima prova sul Pad ha trovato una regressione reale: dopo la compressione
l'app montava per errore la lista Chat dentro i 72px, rendendola illeggibile.
La fase è stata fermata; il fotogramma difettoso è stato conservato, la causa
nel ramo Vue è diventata il test permanente
`HARNESS-COLLAPSED-NO-CHAT-CONTENT-01`, quindi il fix è stato riprovato sul
dispositivo. Il rail compresso finale non monta né Harness né Chat: mostra solo
hamburger ed espansione, mentre il contenuto centrale usa lo spazio liberato.

File di produzione chiusi in questa fase:

- `mobile/src/App.vue`
- `mobile/src/components/shell/TalosTabletSidebar.vue`
- `mobile/src/lib/tabletLayout.ts`
- `mobile/src/stores/settings.ts`
- `mobile/src/i18n/locales/en.ts`
- `mobile/src/i18n/locales/it.ts`

Test permanenti aggiornati o aggiunti:

- `mobile/tests/unit/lib/tabletLayout.test.ts`
- `mobile/tests/unit/shell/TalosTabletSidebar.test.ts`

La nuova preferenza `tablet_harness_sidebar_collapsed` usa lo store Settings e
Capacitor Preferences già adottati dal prodotto: è locale al device, viene
validata in modo fail-closed e non modifica il contratto Chat. La larghezza
effettiva è calcolata da `talosTabletSidebarEffectiveWidth`; il variant Harness
espone il toggle, il variant Chat lo ignora.

Il primo GREEN automatico ha anche fatto scattare correttamente il budget del
bundle iniziale: 614.590 byte contro il massimo 614.000. La soglia non è stata
alzata. Il dialogo di consenso immagini, già opzionale, viene ora caricato solo
quando serve tramite lo stesso confine asincrono degli altri dialoghi; build
finale della fase 613.656/614.000 byte.

Prove automatiche fresche della fase:

- gruppo mirato: 4 file, **40 test passati**, zero falliti;
- `npm run build`: exit 0, JavaScript iniziale 613.656/614.000 byte;
- verifica parity del bundle Harness: 18/18 passata;
- `npx cap copy android`: exit 0;
- compilazioni debug Kotlin e release Java: BUILD SUCCESSFUL;
- installazione debug side-by-side sul Pad: BUILD SUCCESSFUL.

Prove reali e ispezione visiva:

- tablet orizzontale 3392x2400: rail aperto, compresso, persistenza dopo
  riavvio, riapertura e Chat invariata;
- tablet verticale 2400x3392: rail aperto e compresso;
- telefono orizzontale 2400x1080: lista e dettaglio dopo avvio a freddo,
  `tablet:false` verificato nel DOM;
- telefono verticale 1080x2400: lista e dettaglio dopo avvio a freddo,
  `tablet:false` verificato nel DOM.

Tutti i tredici PNG, inclusi quelli difettosi intermedi, sono stati ispezionati
per intero in due passaggi con la disciplina `frontend-design`. Evidenze:
`C:\Users\Antonino\AppData\Local\Temp\talos-harness-fixes-20260825-phase2`.
Il registro completo è `.claude/TACCUINO-VISIVO-HARNESS-UI-PAD.md`.
Al termine della matrice il Pad è stato ripristinato ai valori fisici
2400x3392, density 420, rotazione automatica attiva
(`accelerometer_rotation=1`, `user_rotation=1`).

Discrepanze che la fase ha reso precise ma non ha nascosto: sul dettaglio
telefono manca una navigazione visibile e resta molto spazio morto; il composer
è ancora tagliato/coperto in basso; l'ultima sessione della lista orizzontale è
parzialmente fuori schermo; i due chevron tablet (comprimi e torna indietro)
sono semanticamente vicini; nella prova Chat sono presenti errori runtime
preesistenti e percorsi grezzi, annotati fuori perimetro. I primi problemi
Harness passano alle Fasi 3, 5 e 6; nessun fix Chat è stato eseguito.
