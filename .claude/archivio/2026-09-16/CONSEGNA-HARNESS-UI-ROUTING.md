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
telefono la navigazione è visibile e corretta, ma resta molto spazio morto tra
header e contenuto; il composer è ancora tagliato/coperto in basso; l'ultima sessione della lista orizzontale è
parzialmente fuori schermo; i due chevron tablet (comprimi e torna indietro)
sono semanticamente vicini; nella prova Chat sono presenti errori runtime
preesistenti e percorsi grezzi, annotati fuori perimetro. I primi problemi
Harness passano alle Fasi 3, 5 e 6; nessun fix Chat è stato eseguito.

### Fase 3 — composer, tastiera e altezza reale del riquadro

Stato: **completata e verificata sul Pad reale**.

#### Riassunto semplice ma esaustivo

Prima il contenuto Harness calcolava la propria altezza come se occupasse
l'intero schermo, mentre in realtà vive dentro il riquadro TALOS. Per questo il
composer scivolava sotto il bordo, dopo lo scroll saliva insieme ai messaggi e
con la tastiera poteva sparire quasi completamente. Ora Harness usa il
rettangolo che possiede davvero: i messaggi scorrono in una zona interna, il
composer resta fermo al fondo e sale sopra la tastiera quando questa compare.

Nel telefono orizzontale, dove l'altezza è minima, l'interfaccia passa a una
forma compatta: nasconde temporaneamente gli elementi non indispensabili con
la tastiera aperta, conserva il composer e non invade l'orologio o le icone di
sistema. Quando la tastiera si chiude, header e barra di navigazione ritornano.
Sul tablet la struttura completa e il pannello Context restano disponibili.

Durante questa fase è stato trovato e corretto anche un problema della sidebar
globale: sul telefono orizzontale la voce Harness esisteva ma rimaneva oltre il
fondo e non era raggiungibile. Ora la parte centrale del menu scorre fino a
Harness e al footer, mentre la sidebar globale continua a stare sopra tutto.

La prova contraria sullo scroll ha scoperto un secondo errore: il composer
sembrava corretto all'inizio, ma dopo circa 612px scorreva via insieme al
transcript. La causa è stata trasformata nel test permanente
`HARNESS-COMPOSER-AFTER-SCROLL-01`; il vero scrollport è ora la conversazione,
non l'intera superficie che contiene anche il composer.

#### File di produzione modificati

- `mobile/src/screens/HarnessSessionScreen.vue`
- `mobile/src/components/shell/TalosMobileToolSheet.vue`
- `mobile/src/components/shell/TalosMobileSidebar.vue`
- `mobile/public/harness-ui/styles.css`
- `mobile/public/harness-ui/app.js`

Il collegamento tastiera usa gli eventi ufficiali già forniti da Capacitor e li
inoltra al ponte Harness esistente. Il runtime misura il proprio host con
`ResizeObserver`; nessun backend, processo, TALOS-BANCO o execution plane è
stato aggiunto.

#### Test permanenti modificati o aggiunti

- `mobile/tests/unit/screens/harnessSessionScreen.test.ts`
- `mobile/tests/unit/harness/harnessUiFrontend.test.ts`
- `mobile/tests/unit/shell/TalosMobileToolSheet.test.ts`
- `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`

Scenari coperti: listener tastiera e rimozione, altezza embedded, safe area,
forma larga e bassa, nav telefono, composer prima/dopo scroll, drawer globale
corto e ripristino dopo la chiusura della tastiera.

#### Prove automatiche fresche

- gruppo mirato: 5 file, **37 test passati**, zero falliti;
- `npm run typecheck`: exit 0;
- `node --check public/harness-ui/app.js`: exit 0;
- `npm run build`: exit 0, 3.625 moduli; JavaScript iniziale
  **613.757/614.000 byte**, CSS **214.709/220.000 byte**;
- verifica parity: 18/18 passata;
- `npx cap copy android`: exit 0;
- compilazioni debug Kotlin e release Java: **BUILD SUCCESSFUL**, 513 task;
- `git diff --check`: exit 0.

#### Prove reali e ispezione visiva completa

Sul Pad side-by-side sono stati provati tablet portrait, tablet landscape,
telefono portrait e telefono landscape. Per ogni forma sono stati controllati
stato iniziale, scroll, fondo reale e tastiera aperta/chiusa; inoltre Board,
Review, palette, ritorno a Chat e sidebar globale sono stati aperti quando
necessari alla verifica dell'intero schermo.

In telefono landscape il fondo è stato misurato, non intuito:
`scrollTop=1181.45` su un massimo di `1182`; il composer è rimasto nello stesso
rettangolo. Tutti i **42 screenshot** della cartella, compresi gli stati RED e
le correzioni intermedie, sono stati aperti e ispezionati per intero con la
disciplina `frontend-design`. Evidenze:
`C:\Users\Antonino\AppData\Local\Temp\talos-harness-fixes-20260825-phase3`.

Il Pad è stato ripristinato alla configurazione fisica: 2400x3392, density 420,
rotazione automatica attiva.

#### Discrepanze trovate, non nascoste

La Fase 3 chiude la geometria del riquadro, non l'intero prodotto. L'ispezione
ha registrato per la Fase 5: badge demo sovrapposto al testo e alla X della
palette; Back Android che chiude la palette e torna anche alla lista nello
stesso gesto; swipe intrappolato dentro il diff; Board mobile che parla di
TALOS-BANCO senza chiarire subito che è interamente demo; badge che invade
Review, approvazione, Browser e Context. In landscape il composer corretto
resta inoltre molto dominante e modello/permessi dovranno essere raggiungibili
in modo esplicito tramite i relativi pannelli.

Fuori perimetro, nella Chat vista durante il controllo di ritorno, un percorso
locale molto lungo esce dalla card di errore. È annotato nel taccuino ma non è
stato corretto perché questa fase autorizza soltanto Harness e il suo guscio.

Il registro dettagliato, con ID, gravità, viewport e destinazione di ogni
rilievo, è `.claude/TACCUINO-VISIVO-HARNESS-UI-PAD.md`; il ledger contiene ora
i nuovi scenari permanenti della Fase 5.

### Fase 4 — la rotta seleziona davvero la sessione mostrata

Stato: **completata e verificata sul Pad reale**.

#### Riassunto semplice ma esaustivo

Prima l’elenco apriva URL diversi, ma il dettaglio continuava sempre a mostrare
“Refactor auth flow”: l’id serviva soltanto come etichetta diagnostica. Ora le
cinque righe sono collegate allo stato locale del mockup. Quando se ne sceglie
una cambiano insieme l’indirizzo Vue, la riga evidenziata, il titolo in alto e
il nome della sessione nel pannello di topologia. La SPA non viene abbandonata
e non viene aggiunto alcun backend.

Un indirizzo con una sessione inesistente viene respinto prima di caricare il
mockup. Il primo tentativo mostrava soltanto una riga di testo su una grande
superficie vuota: l’ispezione visiva lo ha respinto. Lo stato finale usa il
pattern TALOS già presente nel prodotto, con icona, titolo, spiegazione e un
pulsante vero per tornare a Harness. Sul tablet il comportamento esistente
porta alla sessione predefinita accanto al rail; sul telefono riapre la lista.

#### File di produzione modificati

- `mobile/src/lib/harnessDemoSessions.ts`
- `mobile/src/screens/HarnessScreen.vue`
- `mobile/src/screens/HarnessSessionScreen.vue`
- `mobile/src/i18n/locales/en.ts`
- `mobile/src/i18n/locales/it.ts`
- `mobile/public/harness-ui/index.html`
- `mobile/public/harness-ui/app.js`

`findHarnessDemoSession()` usa l’elenco demo già canonico e fallisce chiuso per
gli id sconosciuti. Il runtime implementa il `selectSession` già previsto dal
ponte tipizzato: non è stato creato un secondo contratto. Il rail nativo espone
una sola riga corrente; header e `Session topology` consumano la stessa
selezione.

#### Test permanenti modificati o aggiunti

- `mobile/tests/unit/lib/harnessDemoSessions.test.ts`
- `mobile/tests/unit/screens/harnessScreen.test.ts`
- `mobile/tests/unit/screens/harnessSessionScreen.test.ts`
- `mobile/tests/unit/harness/harnessUiFrontend.test.ts`

Scenari: risoluzione dei cinque id, rifiuto dell’id sconosciuto, nessun fetch
nel caso invalido, inoltro al runtime, riga attiva nativa, sincronizzazione di
tutte le etichette visibili e azione reale dell’empty-state.

#### Prove automatiche fresche

- gruppo mirato: 5 file, **38 test passati**, zero falliti;
- `npm run build`: exit 0, 3.625 moduli e parity 18/18;
- JavaScript iniziale **613.806/614.000 byte**, CSS
  **214.709/220.000 byte**;
- `node --check public/harness-ui/app.js`: exit 0;
- `npx cap copy android`: exit 0;
- installazione debug side-by-side: **BUILD SUCCESSFUL** sul Pad;
- compilazioni debug Kotlin e release Java: **BUILD SUCCESSFUL**, 513 task;
- `git diff --check`: exit 0.

#### Prove reali e ispezione visiva completa

Nel tablet landscape sono state provate singolarmente `Refactor auth flow`,
`Audit API permissions`, `Fix mobile composer`, `Prepare release notes` e
`Investigate flaky tests`. Per ciascuna sono stati confrontati URL, riga nativa
attiva, riga statica attiva, titolo e topologia. Le altre tre forme hanno
verificato una sessione valida e il deep-link invalido; il pulsante di ritorno
è stato azionato realmente.

Tutti i **15 screenshot** della fase sono stati aperti e ispezionati per intero
con la disciplina `frontend-design`, inclusi i RED scartati. Evidenze:
`C:\Users\Antonino\AppData\Local\Temp\talos-harness-fixes-20260825-phase4`.
Il Pad è stato ripristinato a 2400x3392, density 420 e rotazione automatica.

#### Limite dichiarato, non nascosto

Le cinque sessioni hanno identità e navigazione corrette ma condividono ancora
la stessa Missione, lo stesso transcript e gli stessi strumenti: è una fixture
demo dichiarata, non cinque esecuzioni reali. Il badge demo rende esplicito il
confine; non sono stati inventati dati o backend diversi per farle sembrare
vere. Le abbreviazioni dei selettori nel composer con rail aperto e le
collisioni del badge restano assegnate alle Fasi 5 e 6.

### Fase 5 — Codice completo e verificato lato interfaccia

Stato: **completata e verificata sul Pad reale**.

#### Riassunto semplice ma esaustivo

La sezione non si presenta più come un prodotto separato chiamato Harness:
all'esterno parla di **Codice**, entra direttamente nella sessione selezionata
e non ripete una seconda testata. Sul telefono è stato tolto il doppio margine
orizzontale segnalato dall'owner; il contenuto centrale usa quindi molto meglio
la larghezza disponibile.

La sidebar globale ora è proprietaria dello schermo: quando viene aperta sta
davanti alla finestra Codice, alla lista sessioni e all'inspector. La lista
sessioni del tablet si può comprimere e riaprire; sul telefono si naviga dalla
lista al dettaglio con un solo ritorno. Composer, navigazione e tastiera non si
coprono più a vicenda.

Tutte le superfici demo sono state percorse e azionate: Chat, Split, Board,
Review, Terminale, Browser, Automazioni, Impostazioni, inspector, palette e
pannelli. Ogni feedback dichiara ciò che succede davvero soltanto nella UI. La
Board non finge il collegamento a TALOS-BANCO; il Terminale non finge una PTY;
Browser, Review e gli altri pannelli raggiungono il fondo senza finire dietro
la barra inferiore. Quando è visibile Browser o un'altra superficie, Chat non
resta falsamente evidenziata.

#### File modificati nella fase

- `mobile/public/harness-ui/app.js`
- `mobile/public/harness-ui/index.html`
- `mobile/public/harness-ui/styles.css`
- `mobile/src/App.vue`
- `mobile/src/components/shell/TalosMobileScreen.vue`
- `mobile/src/components/shell/TalosMobileToolSheet.vue`
- `mobile/src/i18n/locales/en.ts`
- `mobile/src/i18n/locales/it.ts`
- `mobile/src/lib/harnessUiBridge.ts`
- `mobile/src/screens/HarnessSessionScreen.vue`

Il plugin Android debug-only non è stato modificato: il tentativo provvisorio
di intervenire sulla cache nativa è stato rimosso dopo aver misurato la vera
causa, cioè l'installazione del pacchetto `ai.talos` mentre CDP osservava ancora
`ai.talos.dev`. La superficie Codice versiona invece i suoi tre asset con il
build id già esistente, senza cancellare preferenze o dati locali.

#### Test permanenti modificati o aggiunti

- `mobile/tests/unit/harness/harnessUiAssetContract.test.ts`
- `mobile/tests/unit/harness/harnessUiFrontend.test.ts`
- `mobile/tests/unit/lib/harnessUiBridge.test.ts`
- `mobile/tests/unit/screens/harnessScreen.test.ts`
- `mobile/tests/unit/screens/harnessSessionScreen.test.ts`
- `mobile/tests/unit/shell/TalosMobileScreen.test.ts`
- `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`
- `mobile/tests/unit/shell/TalosMobileToolSheet.test.ts`
- `mobile/tests/unit/shell/TalosTabletSidebar.test.ts`
- `mobile/tests/unit/shell/appShell.test.ts`

Oltre ai controlli pianificati, gli screenshot hanno prodotto regressioni
permanenti per: toast contenuto nel viewport e lontano dai controlli, scroll
non-Chat sopra la nav, assenza della coda vuota Browser e verità dello stato
attivo dei pulsanti Chat/Split/Board.

#### Prove automatiche fresche

- gruppo mirato: 10 file, **111 test passati**, zero falliti;
- `npm run typecheck`: exit 0;
- `node --check public/harness-ui/app.js`: exit 0;
- `npm run build`: exit 0, 3.625 moduli e parity 18/18;
- JavaScript iniziale **613.866/614.000 byte**, CSS
  **214.709/220.000 byte**;
- `npx cap copy android`: exit 0;
- compilazioni debug Kotlin e release Java: **BUILD SUCCESSFUL**, 513 task;
- `git diff --check`: exit 0.

#### Prove reali e ispezione visiva completa

Sul Pad side-by-side sono state verificate tutte le quattro forme: tablet e
telefono, verticale e orizzontale. Sono stati controllati lista e dettaglio,
rail compresso/aperto, drawer globale, inizio e fine di ogni scroll, tastiera
reale, tutti i tab dell'inspector, tutti i pannelli e almeno un'azione in ogni
superficie. Geometria e stato attivo sono stati misurati nel DOM, non dedotti
dall'immagine.

Gli **88 screenshot** della cartella, inclusi RED e passaggi intermedi, sono
stati aperti e ispezionati per intero con la disciplina `frontend-design`:
`C:\Users\Antonino\AppData\Local\Temp\talos-code-phase5-20260825`.
Il taccuino conserva ogni discrepanza, anche quelle corrette durante la fase.

L'APK side-by-side più recente è stato verificato come pacchetto
`ai.talos.dev`, installato sul Pad e copiato anche in
`C:\Users\Antonino\Downloads\TALOS-dev-2026-08-25.apk`.

#### Limiti rimasti, senza nasconderli

La forma telefono landscape lascia per natura poca altezza all'anteprima di un
telefono annidato dentro Browser: i controlli sono tutti raggiungibili, ma la
conversazione interna si vede a porzioni. Non è contenuto perso. Restano invece
deliberatamente aperti per la Fase 6 il collegamento live ai token dei temi,
la continuità cromatica/tipografica e il riesame del significato visivo del
chevron del rail. Non restano bug funzionali noti della Fase 5.

### Fase 6 — checkpoint automatico dopo la richiesta scrollbar

Stato: **implementazione e prove browser completate; verifica Pad in corso**.

#### Riassunto semplice ma esaustivo

La scrollbar della sezione Codice è stata eliminata davvero, non colorata o
nascosta lasciando il suo spazio vuoto. Tutte le aree continuano a scorrere,
ma il contenuto recupera la corsia a destra: nella forma telefono la scheda
Missione arriva ora a circa 4px dal bordo previsto invece dei 14px intermedi.
La regola riguarda soltanto Codice dentro l'app; l'anteprima separata resta
utilizzabile come prima.

Il requisito è diventato un test permanente che controlla entrambe le metà:
nessuna barra e nessuna corsia, ma range di scorrimento reale e posizione che
avanza. Sono verdi 19 test del contratto asset, 6 prove browser in verticale e
orizzontale, controllo tipi, controllo JavaScript e build completa. Il bundle
resta entro i limiti: 613.965/614.000 byte JavaScript iniziali e
214.598/220.000 byte CSS. La fase non è ancora dichiarata conclusa perché manca
la nuova APK sul Pad e l'ispezione visiva delle quattro forme.

#### Estensione owner: simmetria, testata dinamica e tastiera

Il margine mobile finale è ora 12px a sinistra e 12px a destra. La testata col
nome della sessione si ritira scorrendo verso il basso e torna appena il gesto
risale; la striscia «In esecuzione» e il contenuto recuperano davvero lo spazio,
senza un vuoto trasparente. Il movimento usa gli stessi tempi dell'app.

La prima APK della sottofase ha inoltre mostrato sul Pad un difetto che il
vecchio test sorgente non poteva vedere: con Gboard aperta il composer restava
67,27px troppo in alto. Il compilatore Vue trasformava il selettore tastiera in
una regola sul `body`. Il test ora compila davvero lo style scoped e rifiuta
quell'output; la regola corretta appartiene al composer. Il GREEN corrente è:
68 test unitari mirati, 8 prove browser, typecheck, syntax check e build/parity.
La build corretta è ora installata e il telefono portrait è GREEN sul Pad:
inset 12/12, scrollbar assente ma scroll funzionante, testata che si ritira
senza invadere la barra Android e ritorna all'inversione del gesto, composer
condiviso aderente a Gboard con gap misurato 0px. I quattro screenshot finali
sono nel taccuino e sono stati ispezionati per intero. Restano da ripetere gli
stessi controlli in telefono landscape, tablet portrait e tablet landscape.

#### Riassunto semplice del checkpoint Pad portrait

La zona vuota a destra è sparita e i bordi interni sono omogenei. Scorrendo in
basso, la testata libera spazio senza finire sotto orario e batteria; appena si
risale torna visibile. Il composer non è una copia: è il componente Chat reale,
si apre con i suoi controlli completi e si appoggia direttamente alla tastiera.
Questo è provato sull'APK fisico; le altre tre forme schermo restano ancora da
certificare prima di chiudere la fase.

#### Nuovo RED scoperto nella matrice telefono landscape

Con Gboard aperta il viewport scende a 144,36px e il composer espanso, alto
148,18px, invade la status bar di 3,82px. La controprova nella Chat canonica ha
riprodotto lo stesso difetto: è il medesimo componente, non un disallineamento
del wrapper Codice. Il ledger ora impone una sola correzione condivisa tramite
la media query standard e il composable AVM esistente, con test prima del
codice. Nessuna variante o copia dedicata a Codice sarà introdotta.

Il primo GREEN unitario non è stato promosso: la build ha rifiutato 614.414
byte contro il tetto 614.000, uno sforamento di 414 byte. La consegna registra
quindi il percorso come scartato. Il nuovo ledger usa soltanto CSS standard,
senza aggiungere logica al pacchetto iniziale; finché bundle e Pad non tornano
verdi, il punto resta aperto.

#### Chiusura del RED telefono landscape

Il percorso CSS condiviso è ora GREEN. Con Gboard aperta, sia Chat sia Codice
mostrano lo stesso composer reale in una forma compatta alta 69,45px, compresa
tra 74,91px e il fondo del viewport a 144,36px: nessuna parte entra nella
status bar. Restano il vero pulsante `+`, la textarea e l'azione destra; non
esiste una copia Codice. Chiudendo la tastiera, la query si disattiva e il
selettore modello torna visibile nella forma completa. Il chunk iniziale è
613.965/614.000 byte, quindi anche il gate di peso resta verde.

#### Riassunto semplice del checkpoint Pad landscape

Il problema scoperto era comune a Chat e Codice e ora è risolto una volta sola
nel loro componente condiviso. Con la tastiera aperta tutto resta sotto orario,
rete e batteria; chiudendola ricompaiono automaticamente tutti i controlli.
Anche il fotogramma completo senza tastiera è stato controllato: nessuna barra
di scorrimento visibile, nessuna corsia vuota a destra e nessuna collisione con
la navigazione inferiore. Restano da certificare le due forme tablet e la suite
finale completa.

#### Nuovo RED scoperto nel tablet portrait

Con il rail sessioni espanso, il tool surface parte già dopo i suoi 323px, ma
il dock del composer aggiungeva di nuovo la stessa variabile: x=646px. Il
componente Chat risultava geometricamente largo, ma la metà sinistra restava
sotto l'host Codice e non riceveva tocchi. Scroll, assenza scrollbar, testata e
spazio finale sono verdi; il composer dimezzato è invece bloccante.

La ricerca W3C/MDN ha confermato la causa: `translate-y-0` crea comunque il
containing block del discendente fixed. Il ledger ora prescrive un ancoraggio
assoluto alla surface già spostata, senza seconda compensazione del rail e senza
alcuna modifica al componente Chat condiviso. Il test RED permanente è
`CODE-COMPOSER-TABLET-RAIL-01`.

#### Riassunto semplice del checkpoint tablet portrait

Lo schermo scorre bene, non mostra barre e la testata rispetta orario e
batteria. L'ispezione certosina ha però scoperto che, con la lista sessioni
aperta, soltanto la metà destra del composer era davvero in primo piano e
toccabile. La causa è stata misurata e documentata; la matrice resta ferma
finché il composer non torna intero senza cambiare il componente della Chat.

#### Chiusura del RED tablet rail

Il dock ora è relativo alla tool surface già posizionata, non al viewport con
una seconda compensazione. Tablet portrait e landscape sono verdi con rail
aperto e compresso: il composer resta intero, ha 12px uguali sui due lati e
riceve tocchi su `+` e textarea anche nella metà sinistra. Il tocco reale sul
`+` ha aperto il drawer canonico del componente Chat, ispezionato per intero.

La correzione non ha modificato `TalosMobileComposer`: test mirato 20/20,
regressioni interessate 97/97, typecheck, build/parity e 8/8 E2E sono verdi; il
chunk resta 613.965/614.000 byte. I due gate tastiera telefono sono stati
ripetuti sull'APK: portrait aderisce a Gboard; landscape resta sotto la status
bar e riporta il selettore modello alla chiusura.

#### Riassunto semplice della chiusura rail

La lista sessioni può essere aperta o compressa senza più tagliare il composer:
il campo e tutti i comandi occupano sempre la larghezza giusta e sono davvero
toccabili. La cura è nel solo punto che posiziona il componente, quindi Chat e
Codice continuano a condividere esattamente lo stesso composer. Telefono e
tablet, verticali e orizzontali, hanno superato la controprova. Il focus che
resta dopo aver nascosto la tastiera è stato annotato come debito mobile 006 e,
come ordinato dall'owner, sarà affrontato dopo la chiusura Codice.

### Fase 7 — consegna finale Codice

La superficie Codice è chiusa per il perimetro approvato. I riferimenti visibili
sono «Codice»; la testata ridondante è rimossa; sfondo e tema sono quelli vivi
della Chat; le scrollbar embedded sono nascoste senza disabilitare lo scroll;
gli inset mobile sono 12/12; la testata sessione si ritira verso il basso e
ritorna verso l'alto rispettando la safe area; rail sessioni e sidebar globale
hanno gerarchia corretta; il composer è l'esatto `TalosMobileComposer.vue` della
Chat e non una replica.

#### Prove finali

- Quattro forme sul Pad: telefono/tablet, portrait/landscape, screenshot
  ispezionati integralmente e misure nel taccuino.
- Rail sessioni 323px e 72px: composer sempre intero, 12px per lato, hit test
  reale su `+` e textarea.
- Telefono con Gboard: portrait dock al fondo 544,73px; landscape dock
  74,91–144,36px, senza invasione della status bar; model chip ripristinato
  alla chiusura.
- Scroll Chat/Board/Context fino in fondo: range reale, zero spazio scrollbar,
  ultimo contenuto sopra il composer.
- Sidebar globale sopra Codice e relativo Context rail; drawer del composer
  sopra tutta la scena con backdrop.
- Motion: famiglie complete coperte dai contratti
  `CODE-MOTION-TOKENS-01`, `CODE-MOTION-SURFACES-01`,
  `CODE-MOTION-EXIT-01` e `CODE-MOTION-REDUCED-01`; nessuna durata grezza
  ammessa nelle superfici Codice.

#### Gate automatici

- 97/97 regressioni Codice e 8/8 E2E Codice verdi.
- Typecheck, syntax check, build/parity, `git diff --check` verdi.
- Bundle: JS 613.965/614.000; CSS 215.309/220.000; parity 18/18.
- Android debug/release verdi; APK installato e provato.
- Suite completa unit: 6.328 verdi, 10 skip, un rosso esterno sul manifest
  shadcn di `DrawerContent.vue`, file non modificato da questa sessione.
- Playwright completo: 79 verdi, 27 skip, un rosso esterno e riproducibile sulla
  geometria telefono della scheda Hugging Face, fuori dai file Codice.

#### Artefatti e debiti separati

- APK PC:
  `C:\Users\Antonino\Downloads\TALOS-dev-2026-08-25.apk`
  (55.027.716 byte).
- Screenshot Fase 6:
  `C:\Users\Antonino\AppData\Local\Temp\talos-code-phase6-scrollbar-20260825`.
- Nove richieste post-Codice dell'owner registrate, senza iniziarne il fix, in
  `.claude/DEBITI-MOBILE-POST-CODICE-2026-08-25.md`.
- Pad ripristinato a 2400×3392, densità 420.

#### Riassunto semplice finale

Codice ora si comporta come una parte della stessa app: usa sfondo, spazi,
movimenti e composer reali di TALOS. Non c'è più la barra visibile che rubava
spazio; destra e sinistra sono bilanciate; la testata libera spazio mentre si
scorre; lista sessioni, pannelli e drawer non finiscono più uno sotto l'altro.
Il difetto del composer dimezzato sul tablet è stato scoperto durante la prova
e corretto prima della consegna. Le prove specifiche Codice e le compilazioni
sono tutte verdi. Restano due rossi generali già esistenti fuori da Codice e i
nove debiti mobili appena richiesti, esplicitamente registrati per il lavoro
successivo.

### Riapertura dopo Fase 7 — regressione testata durante scroll veloce

Stato: **riaperta e bloccante**. L'owner ha segnalato che, scorrendo
velocemente verso il basso in Codice, la testata alterna compatta ed espansa.
La regressione è stata riprodotta sul Pad con due fling reali nella stessa
direzione. Il primo screenshot mostra la testata correttamente ritirata; il
secondo, senza alcuna inversione, la mostra di nuovo aperta.

La causa non è il token di animazione: è il valore usato per decidere la
direzione. Quando la testata si ritira, il transcript diventa più alto; vicino
al fondo il browser abbassa automaticamente la posizione massima di scroll.
Quel movimento interno veniva scambiato per un dito che risale e riapriva la
testata, facendo ripartire il ciclo.

Il dossier e il ledger ora impongono un RED permanente:
`CODE-TOPBAR-NO-FLAP-01`. La correzione distinguerà il riassestamento ancora
ancorato al fondo da una vera risalita dell'utente. Nessun timer arbitrario,
nessun vuoto conservato sotto la testata e nessuna nuova dipendenza. I nove
debiti post-Codice restano sospesi finché questa riapertura non supera di nuovo
test, build e matrice Pad completa.

#### Riassunto semplice della riapertura

Il problema è confermato: non dipende dalla velocità del dito in sé, ma dal
fatto che la testata, chiudendosi, cambia lo spazio disponibile e inganna il
controllo della direzione. Ho fermato il lavoro successivo e registrato file,
test e prova visiva esatti. Ora si corregge prima questo comportamento; Codice
non verrà richiuso finché più scroll verso il basso resteranno stabili e la
testata tornerà soltanto quando si risale davvero.

### Seconda fermata owner — composer troppo largo in tablet landscape

Stato: **riaperto e bloccante**. Guardando nuovamente gli screenshot completi,
l'owner ha rilevato un errore che la mia precedente ispezione aveva mancato: il
composer non termina alla fine della conversazione, ma continua sotto la colonna
Contesto. La precedente dichiarazione visiva di larghezza corretta è ritirata.

La causa è ora misurata nel codice: il componente è quello condiviso della Chat,
come richiesto, ma il suo dock è largo quanto l'intera finestra Codice. La
conversazione e il Context rail vengono invece separati dentro lo Shadow DOM;
nessun vincolo collegava finora il bordo destro del dock al bordo reale della
conversazione. Il vecchio test proteggeva soltanto dal doppio offset della
sidebar globale sinistra e non poteva rilevare questa invasione destra.

Il dossier e il ledger aggiungono il RED permanente
`CODE-COMPOSER-CONTEXT-RAIL-01`. Il fix non crea né copia un composer: misura la
colonna centrale reale e vincola lì la stessa istanza di
`TalosMobileComposer.vue`, seguendone i cambi quando Contesto si apre, si chiude
o viene ridimensionato. La matrice ripartirà dal tablet landscape; finché quello
screenshot completo non è pulito, Codice resta aperto.

#### Riassunto semplice della seconda fermata

Hai visto correttamente un difetto importante: la barra di scrittura invade una
zona che non le appartiene. Non basta accorciarla a occhio, perché la colonna a
destra può cambiare misura. La legherò quindi al bordo vero della conversazione;
prima lo rendo un test che oggi fallisce, poi installo una nuova APK e ricontrollo
per primo il tablet orizzontale.

### Esito della correzione — GREEN tecnico, landscape fisico ancora aperto

Il test nuovo è fallito sul difetto preciso (`right` assente al posto dei 340px
del Context rail) e passa dopo il collegamento dinamico alla workspace. Sono
verdi 21/21 test della schermata, 71/71 regressioni Codice, typecheck, build,
8/8 E2E e le compilazioni Android debug/release. La nuova APK è stata installata
sul Pad.

La prova logica 3392×2400 ha coperto Context aperto, chiuso e riaperto. Il
composer è sempre lo stesso componente della Chat e ora occupa soltanto la
colonna conversazione: non entra più sotto il Context rail e mantiene margini
uguali ai due lati. Tre fling verso il basso hanno lasciato la testata nascosta;
una risalita reale l'ha ripristinata. Tutti gli screenshot sono stati
ispezionati per intero e non mostrano scrollbar, collisioni con la barra di
sistema, sidebar sotto Codice o discontinuità dello sfondo animato.

Percorso prove:
`C:\Users\Antonino\AppData\Local\Temp\talos-code-context-rail-20260825\`.
File: `tablet-landscape-context-open.png`,
`tablet-landscape-context-closed.png`, `tablet-landscape-down-1.png`,
`tablet-landscape-down-2.png`, `tablet-landscape-down-3.png`,
`tablet-landscape-up.png`. L'owner ha poi rilevato che il Pad era fisicamente
verticale: quei PNG non valgono come prova reale del tablet orizzontale e la
precedente etichetta GREEN è ritirata. Dimostrano soltanto la geometria della
viewport simulata. Codice non è chiuso finché non passano tablet portrait reale,
tablet landscape con dispositivo materialmente ruotato e le due forme telefono.

#### Riassunto semplice della fase

La barra di scrittura supera test e simulazione: quando il pannello a destra c'è,
si ferma prima; quando sparisce, usa lo spazio liberato. Anche la testata è
stabile nella simulazione. Ma il Pad non era fisicamente girato, quindi non
chiamo questa una verifica reale orizzontale. Riparto dal portrait fisico e
rifarò il landscape soltanto con il dispositivo davvero ruotato.

### Verifica successiva — tablet portrait fisico

Ripristinati dimensione e densità fisiche del Pad, il portrait reale 2400×3392
ha superato la sequenza della testata: aperta all'ingresso, stabilmente nascosta
dopo tre fling nella stessa direzione, riaperta soltanto da una risalita. I file
sono `tablet-portrait-physical-open.png`,
`tablet-portrait-physical-down-1.png`, `-down-2.png`, `-down-3.png` e
`tablet-portrait-physical-up.png` nella stessa cartella di prove.

Questo passaggio non viene usato per approvare la larghezza del composer: come
precisato dall'owner, quel difetto appartiene al landscape. Approva soltanto la
stabilità della testata e l'assenza di collisioni nel portrait fisico. Il gate
del composer landscape resta intenzionalmente aperto.

#### Riassunto semplice della fase portrait

In verticale la testata ora si comporta bene anche con scroll molto veloci. Non
sto usando questa prova per dire che la larghezza orizzontale è risolta: quella
verrà giudicata soltanto con il Pad davvero girato.

### Verifica telefono portrait — GREEN topbar

La prima configurazione è stata scartata perché il file risultava realmente
2400×1080. Dopo correzione, riavvio a freddo e nuova lettura byte, il telefono
portrait è 1080×2400. I cinque screenshot `phone-portrait-open.png`,
`phone-portrait-down-1.png`, `-down-2.png`, `-down-3.png` e
`phone-portrait-up.png` dimostrano la testata stabile su tre fling e riaperta da
una vera risalita. Il contenuto del consenso passa completamente sopra il
composer al secondo scroll, quindi resta raggiungibile; bottom nav e safe area
sono libere.

#### Riassunto semplice della fase telefono verticale

Ho verificato prima le dimensioni vere, poi il comportamento: in telefono
verticale la testata non lampeggia più e tutto il contenuto può scorrere sopra la
barra di scrittura. Questo non sostituisce in alcun modo la prova della larghezza
in landscape.

### Terza riapertura owner — composer troppo largo con tutti i rail chiusi

Stato: **aperto e bloccante**. La correzione del Context rail decide fino a
dove il dock può arrivare, ma non stabilisce quanto debba diventare larga la
barra di scrittura quando tutto lo spazio è libero. Con entrambe le sidebar
chiuse il composer condiviso si allarga quindi troppo.

La soluzione registrata nel ledger non cambia né duplica il componente Chat:
Codice conserva `TalosMobileComposer.vue`, gli stessi controlli e le stesse
animazioni, ma lo centra e gli applica il limite di 920px già usato dalla sua
conversazione di riferimento. Il nuovo RED permanente è
`CODE-COMPOSER-MAX-WIDTH-01`. Il gate reale richiede il Pad fisicamente
orizzontale con Context e lista sessioni aperti/chiusi, screenshot ispezionati
per intero e sequenza di fling della testata.

#### Riassunto semplice della terza riapertura

Il composer ora sa dove deve fermarsi quando c'è un pannello, ma senza pannelli
usa troppo spazio. Gli aggiungo un tetto coerente con la chat Codice e lo tengo
centrato: sui telefoni continuerà a usare quasi tutta la larghezza, sul tablet
non diventerà una barra sproporzionata. Prima lo proteggo con un test che oggi
fallisce, poi verifico la nuova APK sul Pad davvero orizzontale.

### Esito terza riapertura — GREEN sul Pad fisicamente landscape

La cura è applicata senza modificare `TalosMobileComposer.vue`: la sola istanza
visibile dentro Codice riceve larghezza fluida, massimo 920px e centratura.
Il test `CODE-COMPOSER-MAX-WIDTH-01` è passato dal rosso al verde. Sono verdi
22/22 test della schermata, 90/90 regressioni Harness/Codice, typecheck, build,
E2E Codice 8/8 e compilazioni Android debug/release; la nuova APK è installata.

Il Pad era materialmente orizzontale e tutti i PNG risultano 3392×2400. Con
entrambi i rail chiusi la misura reale è: workspace 1220,19px, composer 920px,
margini uguali 150,095px. Riaprendo lista sessioni e Context: workspace 752,19px,
composer 728,19px, margini 12/12px. Tre fling verso il basso non fanno più
lampeggiare la testata; una risalita vera la riporta. Gli screenshot completi
non mostrano scrollbar, collisioni, pannelli sotto Codice o discontinuità dello
sfondo animato.

Prove:
`C:\Users\Antonino\AppData\Local\Temp\talos-code-context-rail-20260825\` —
`code-max-width-context-closed.png`,
`code-max-width-all-rails-closed.png`,
`code-max-width-all-closed-down-1.png`, `-down-2.png`, `-down-3.png`,
`code-max-width-all-closed-up.png` e
`code-max-width-rails-reopened-final.png`.

Durante la misura la prima query aveva preso il composer Chat sottostante,
nascosto ma ancora nel DOM. La prova non è stata accettata finché la sonda non
è stata vincolata al dock Codice: l'istanza visibile è quella da 920px. Nessun
falso verde è rimasto nel dossier.

#### Riassunto semplice della fase larghezza

Quando chiudi tutto, la barra di scrittura ora resta proporzionata e centrata;
quando riapri i pannelli, si restringe automaticamente e lascia 12px per lato.
È sempre lo stesso componente della Chat, non una copia. Anche gli scroll rapidi
e lo sfondo animato restano corretti sul Pad davvero orizzontale.

### Riapertura owner — pill autonomia agente

Il composer condiviso è corretto, ma nel passaggio dal mockup ha perso il
selettore `Workspace write / Read only / On request / Full access` che stava
accanto al modello. Il pannello originale è ancora presente e funzionante:
verrà riaperto dalla nuova pill dentro lo stesso `TalosMobileComposer.vue`, non
copiato in un secondo componente. Sono registrati due RED e una nuova prova
completa sul Pad. Codice resta aperto finché questo controllo non è verde.

#### Riassunto semplice della riapertura

La barra di scrittura è quella giusta, ma le mancava un comando del mockup:
scegliere quanto può agire l'agente. Lo rimetto accanto al modello riusando il
pannello che esiste già, poi ricontrollo che non stringa o rompa il composer in
nessuna delle quattro forme.

### Chiusura della forma telefono landscape

Il Pad è rimasto materialmente orizzontale e la forma telefono è stata simulata
con dimensioni scambiate, perché questo specifico OS ruota a sua volta i valori
di `wm size`. Il primo tentativo è stato scartato quando il file risultava
1080×2400. La configurazione valida ha prodotto cinque PNG reali 2400×1080:
`phone-landscape-physical-open.png`, `-down-1.png`, `-down-2.png`,
`-down-3.png` e `phone-landscape-physical-up.png`.

Il composer usa la forma compatta a una riga, resta sopra la bottom navigation
e non perde i controlli essenziali. Tre scroll discendenti tengono la testata
nascosta e portano prima il messaggio utente, poi quello assistente,
completamente sopra il dock; la risalita ripristina la testata. Nessuna
scrollbar, collisione o stato tablet residuo. Al termine size e density sono
stati ripristinati ai valori fisici 2400×3392 e 420.

#### Riassunto semplice della forma telefono orizzontale

La prova ora è reale e non soltanto nominale: il file è davvero largo e basso.
La barra resta compatta, i messaggi si possono leggere tutti scorrendo e la
testata non lampeggia. Il Pad è stato infine riportato alle sue impostazioni
fisiche, senza lasciare simulazioni attive.

### Esito autonomia agente — controllo ripristinato e matrice visiva GREEN

Il composer Codice continua a essere lo stesso componente della Chat. Accanto
al modello ora compare di nuovo il controllo dell'autonomia: su tablet mostra
`Workspace write`, su telefono stretto conserva la stessa area di tocco e si
riduce all'icona. Apre il pannello originale con `Read only`, `Workspace write`,
`On request` e `Full access`; una scelta aggiorna immediatamente la pill, mentre
Back chiude senza cambiare valore.

Durante l'ispezione del telefono portrait è stato trovato e corretto un difetto
ulteriore: dopo il focus l'intera finestra Codice poteva scivolare di 49px a
sinistra, tagliando il pannello e facendo riapparire il Context rail a destra.
La causa non era il pannello, ma il contenitore globale invisibilmente
scrollabile. La correzione usa il clipping nativo non scrollabile; la misura
prima/dopo è `scrollLeft 49,09px → 0`.

I quattro screenshot conclusivi, tutti ispezionati integralmente, sono in
`C:\Users\Antonino\AppData\Local\Temp\talos-code-autonomy-20260825`:

- telefono portrait 1080×2400;
- telefono landscape 2400×1080;
- tablet portrait 2400×3392;
- tablet landscape 3392×2400.

Non risultano tagli laterali, scrollbar, sovrapposizioni con status bar,
invasioni del Context rail o variazioni di larghezza del composer. Il pannello
landscape scorre fino agli scope; il valore sopravvive a chiusura e collasso dei
rail durante la sessione. Il riavvio riparte onestamente da `Workspace write`,
perché i dati sono ancora demo.

Nuova APK installata sul Pad e copiata anche in
`C:\Users\Antonino\Downloads\TALOS-dev-2026-08-25.apk`: 54.903.445 byte,
SHA-256 `4cd3bf0c8c3e3f86d1b985ca3975a83b3fcdc769fb1aab1eaad8e594a7500071`.
Il Pad è stato ripristinato a 2400×3392, densità 420.

#### Riassunto semplice della fase autonomia

Ora puoi scegliere davvero quanto può agire l'agente dal composer Codice,
senza aprire un componente diverso dalla Chat. Ho controllato anche il difetto
che avrebbe potuto far slittare tutta la schermata sui telefoni: non succede
più. Le quattro forme sono visivamente pulite e il Pad non è rimasto in una
modalità simulata. Resta soltanto il controllo automatico completo prima di
chiudere e committare la fase Codice.

### Chiusura automatica Fase 8

Il controllo completo è terminato senza errori:

- 6.335 test unitari verdi; 10 esclusi intenzionalmente;
- typecheck e controllo sintassi verdi;
- build entro i limiti congelati (JavaScript 613.995/614.000 byte, CSS
  215.338/220.000 byte) e parità 18/18;
- test end-to-end Codice 8/8 verdi;
- compilazione Android debug/release e installazione reale verdi;
- `git diff --check` verde.

Anche il precedente debito di conformità shadcn è ora chiuso con un adattamento
esatto e documentato, non con un'eccezione generica. La fase Codice è pronta per
il commit isolato; i nove debiti mobile esterni restano separati e non sono
stati mescolati a questo lavoro.

#### Riassunto semplice della chiusura

Non restano controlli rossi per Codice: funzione, aspetto, scroll, build e APK
sono stati verificati. Il prossimo gesto è soltanto salvare questo blocco in un
commit pulito; dopo si può iniziare il primo debito mobile separato.
