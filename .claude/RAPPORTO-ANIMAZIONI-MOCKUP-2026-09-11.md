# Le animazioni del mockup, portate nella app — 11/09/2026 (notte)

**Ordine dell'owner:** «fai in modo che le animazioni del mockup siano riportate alla perfezione
nella app».
**Fonte:** `.claude/refactor-ui-owner-2026-09-11/Talos_Desktop_Final_Mockup_Interattivo.html`
(6.325 righe; 4 blocchi `<style>`, 3 `<script>`).
**Banco:** server vero sulla **5463** (mai la 4174) con `TALOS_HARNESS_UI_PUBLIC_DIR=frontend/dist`
e uno store di sessioni vuoto nello scratchpad, più il laboratorio sulla **4186**
(`scripts/serve-lab.mjs`, fixture vere dei componenti). Nessun giro col modello, nessun `git`.

---

## 0. In due righe

Le animazioni del mockup sono **20 `@keyframes` + 71 dichiarazioni `transition`/`animation` in CSS**
e **19 animazioni in JavaScript** (Web Animations API, tutte dal solo `motion()` di
`talos-desktop-study`). Del CSS mancava quasi niente: **1 `@keyframes` e 12 dichiarazioni**, tutte
nello strato `td-*`. Del JavaScript mancava **quasi tutto**: la app ne aveva **due** (cambio pagina
e cassetto), il mockup ne ha diciannove.

Portate: **17 animazioni**. Verificate testa a testa con `getAnimations()`: **durate e fotogrammi
identici** (scarto 0 %, non ±10 %). Restano **due differenze dichiarate** e non sanate, entrambe in
file di altri agenti: il diff è al §7.

---

## 1. Inventario — il mockup, riga per riga, e cosa c'era nella app

Metodo: parser CSS a bilanciamento di graffe sui quattro blocchi `<style>` del mockup e sui 19
fogli di `src/styles/`, poi confronto per selettore+proprietà; per il JavaScript, estrazione dei tre
`<script>` e censimento di ogni chiamata a `motion(...)`. Le durate della colonna «misura» sono
lette da `getAnimations()` in Chrome, **normalizzate al token di base** (il mockup ha in
`localStorage` una scala di movimento al 50 %: i suoi token a schermo valgono 80/90/75 ms invece di
160/180/150 — è **ambiente, non oggetto**, e confrontare i numeri grezzi avrebbe detto «tutto
diverso del 100 %»).

### 1a. CSS — le 20 `@keyframes`

| `@keyframes` | mockup | app prima | esito |
|---|---|---|---|
| `talos-tip-entra`, `talosLineSweep`, `talosLineNodeFill`, `talos-shimmer`, `talos-lampeggio`, `talos-pulse`, `talos-dialog-enter`, `talos-sfuma-schede`, `talosSegnaviaScorre`, `talosSegnaviaNodo`, `talosUscitaVivaCursore`, `talosShellEntra`, `talosAttesaShimmer`, `talosScenaDeriva`, `talosScenaLuce`, `talosEntrataMessaggio`, `talosCursoreScrittura` (17) | sì | **identiche byte per byte** | = |
| `td-track` | riga 4151 | **assente** | **portata** |
| `talos-sheet-enter` | — | solo app (`primitives.css:230`) | in più nella app, lasciata |

### 1b. CSS — le 71 dichiarazioni `transition`/`animation`

**58 uguali, 1 diversa per soli spazi, 12 mancanti.** Tutte e dodici nello strato `td-*`
(righe 4049-4373 del mockup). Dopo il porting:

| superficie | mockup | nella app oggi | esito |
|---|---|---|---|
| barra di avanzamento di una scheda | 4049 `transition:width …surface-enter …ease` | `mockup-animazioni.css:90` | **portata** — misurata `width 0.09s cubic-bezier(0.2,0.7,0.2,1)` |
| divisorio elenco/dettaglio | 4069 `transition: background …control` | c'era già: `mockup-td.css:142` (`::before` invece di `:before`) | = |
| freccia del gruppo della barra | 4107 `transition: rotate …control` | c'era già: `mockup-sidebar.css:61` | = (vedi §6.2) |
| riga che carica | 4150 `animation: td-track 1.2s` | `mockup-animazioni.css:116` | **portata** — misurata `1.2s ease-in-out infinite td-track` |
| niente si anima mentre si trascina | 4153-4154 `:root.td-dragging *` | `mockup-animazioni.css:102` | **portata** — misurata 0 s durante, 0,16 s dopo |
| spegnimenti `:root.td-reduced *` (2) e `@media(prefers-reduced-motion) .td-scope *` (4) | 4152, 4184, 4373 | — | **sostituiti**, vedi §3 |

### 1c. JavaScript — le 19 animazioni del mockup

Tutte escono dallo stesso helper: `motion(el, frames, token='surface-enter', factor=1)`, che legge
la durata da `--talos-motion-duration-<token>` e l'easing da `--talos-motion-ease`.

| # | superficie | fotogrammi del mockup | token × fattore | nella app **prima** | oggi |
|---|---|---|---|---|---|
| 1 | pressione di **ogni** pulsante | `scale 1 → .985 → 1` | control ×1 = **160 ms** | assente | `animazioni-mockup.js:91` |
| 2 | cambio pagina | `opacity .4, translateY(5px) → none` | tab-change ×1 = **180 ms** | c'era (`app.js:1140`) | = |
| 3 | gruppo della barra che si apre | `opacity .3, translateY(-4px) → none` | surface-enter ×1 = **180 ms** | assente | `animazioni-mockup.js:121` |
| 4 | pannello delle impostazioni | `opacity .3, translateX(5px) → none` | tab-change ×1 = **180 ms** | assente | `animazioni-mockup.js:134` |
| 5 | pannello di una scheda (tab) | `opacity .4, translateY(4px) → none` | tab-change ×1 = **180 ms** | assente | `animazioni-mockup.js:146` |
| 6 | pannello che si apre (disclosure) | `opacity 0, translateY(-3px) → none` | disclosure ×1 = **180 ms** | assente | `animazioni-mockup.js:158` |
| 7 | collasso della barra | `gridTemplateColumns prima → dopo` | disclosure ×1,2 = **216 ms** | assente | `animazioni-mockup.js:103` |
| 8 | elenco che si riordina, chi si sposta | `translate(dx,dy) → none` | surface-enter ×1,35 = **243 ms** | assente | `sezione-elenco-dettaglio.js:439` (`flipSchede`) |
| 9 | elenco che si riordina, chi è nuovo | `opacity 0, translateY(5px) → none` | surface-enter ×1 = **180 ms** | assente | idem |
| 10 | dettaglio che entra | `opacity 0, translateX(14px) → none` | surface-enter ×1,25 = **225 ms** | assente | `sezione-elenco-dettaglio.js:471` |
| 11 | dettaglio che esce | calcolato → `opacity 0, translateX(10px)` | surface-exit ×1 = **150 ms** | assente | `sezione-elenco-dettaglio.js:493` |
| 12 | dettaglio che si espande | `opacity .65 → 1` | surface-enter ×1 = **180 ms** | assente | `sezione-elenco-dettaglio.js:475` |
| 13 | modale che entra | `opacity 0, translateY(12px) scale(.99) → none` | surface-enter ×1 = **180 ms** | assente | `modale-td.js:107` |
| 14 | modale che esce | `opacity 1 none → opacity 0, translateY(6px)` | surface-exit ×1 = **150 ms** | assente | `modale-td.js:140` |
| 15 | toast che arriva | `opacity 0, translateY(8px) → none` | surface-enter ×1 = **180 ms** | assente | `mockup-animazioni.css:74-79` (CSS) |
| 16 | cassetto della barra (≤ 860 px) | `translateX(-100%) → 0` | surface-enter ×**1,3** = **234 ms** | c'era a ×1 = 180 ms | **DIVERSA**, §7 |
| 17 | vista «sorgenti» | `opacity 0, translateY(8px) → none` | surface-enter ×1 | equivalente CSS (`talos-dialog-enter`) | = |
| 18 | messaggio inserito in chat | `opacity 0, translateY(6px) → none` | message-insert ×1 | equivalente CSS (`talosEntrataMessaggio`) | = |
| 19 | figli di un `<details class="td-source">` | `opacity 0, translateY(-3px) → none` | disclosure ×1 | `.td-source` non è un `<details>` nella app | coperta da #6, non esercitata |

---

## 2. Le fonti (ricerca fatta PRIMA di scrivere)

⚠️ **`WebSearch` era esaurito per la sessione** (200/200 chiamate). Come previsto dal brief l'ho
detto e sono passato a `WebFetch` sulle fonti primarie.

1. **MDN, `@starting-style`** (letto 11/09/2026 via WebFetch) — il modello canonico per animare
   entrata **e uscita** di un `<dialog>`/popover: `transition: … overlay Xs allow-discrete,
   display Xs allow-discrete` più `@starting-style`. Solo `display` e `overlay` vogliono
   `allow-discrete`; `display` tiene visibile l'elemento durante l'uscita, `overlay` rimanda
   l'uscita dal top layer. Baseline «newly available» da **agosto 2024**.
   ⇒ **Vincolo che non conoscevo e che ha cambiato la scelta:** `modale-td.js` rimuove il
   `<dialog>` dentro l'ascoltatore `close`, quindi la via CSS avrebbe richiesto anche di rimandare
   quel `remove()`. Ho preferito la via del mockup (WAAPI prima di `close()`), che è 1:1 con la
   fonte e non introduce due meccanismi diversi per entrata e uscita.
2. **MDN, `grid-template-columns`** (letto 11/09/2026 via WebFetch) — tipo di animazione: «simple
   list of length, percentage, or calc, **provided the only differences are in the values**»; non
   interpola fra `minmax()`/`repeat()` di forma diversa né fra keyword e lunghezze.
   ⇒ **Vincolo decisivo:** la app dichiara `var(--talos-sidebar-w) minmax(0,1fr) …` contro
   `64px minmax(0,1fr) …`. Una `transition` CSS su `grid-template-columns` non era garantita; il
   mockup legge i valori **risolti in pixel** prima e dopo e interpola quelli. Ho fatto lo stesso —
   ed è il motivo per cui il collasso della barra ha bisogno della fase di **cattura** del clic.
3. **Il repo stesso**, letto prima di scrivere (la regola «prima cerca nel PROPRIO codebase»):
   `legacy/app.js` `applicaMovimento` (~12896) azzera i token quando il movimento è spento, con il
   commento che spiega perché non è più una regola CSS universale. È la ragione per cui **ogni**
   animazione nuova prende la durata da un token e non da un numero.

---

## 3. I cancelli — e perché non sono una regola universale

Il 10-11/09 due regole universali con `!important` (`body.reduce-motion *` e
`@media (prefers-reduced-motion){ * }`) spegnevano OGNI animazione della app e sono costate sei cure
su un componente sano. Sono state tolte. Il mockup, che è più vecchio, le ha ancora nella sua forma
`td-*` (`:root.td-reduced *`, `.td-scope *` con `!important`): **non le ho portate**, e questa è
l'unica deviazione voluta dal «tale e quale».

Al loro posto, quattro cancelli che **chiedono** invece di cancellare:

1. **i token** — gratis, già nel prodotto: «Animazioni dell'interfaccia» spento, profilo `off` o
   «Riduci il movimento» ⇒ `--talos-motion-duration-*` = `0s`, e `motion-mockup.js` non avvia
   niente quando la durata risolta è 0 (una WAAPI da 0 ms esisterebbe comunque in `getAnimations()`
   e falserebbe ogni misura successiva);
2. **`prefers-reduced-motion` di sistema** — i token non lo guardano, quindi lo guarda
   `movimentoSpento()`, e per il CSS le variabili `--tam-*` vanno a `0s`;
3. **`interface-motion-off` / `reduce-motion`** sulla radice e sul body;
4. **le tre leve fini** di `aspetto.css` (`motion-navigation-off`, `motion-surfaces-off`,
   `motion-feedback-off`), passate per famiglia.

L'unico selettore universale del foglio nuovo è quello del mockup: `:root.td-dragging *`. Vive solo
fra `pointerdown` e `pointerup` sul divisorio — **misurato**: durante il trascinamento la
`transition-duration` di una scheda è `0s`, dopo torna `0.16s`, e la classe sparisce.

---

## 4. Cosa ho toccato

| file | cosa |
|---|---|
| **`frontend/src/styles/mockup-animazioni.css`** (NUOVO, 120 righe) | toast che arriva, `.td-progress > i`, `:root.td-dragging *`, `@keyframes td-track` + `.td-loading-line::before`, e le variabili-cancello `--tam-*` |
| **`frontend/src/components/motion-mockup.js`** (NUOVO, 130 righe) | il `motion()` del mockup portato alla lettera + i quattro cancelli + `fermaTutto()` |
| **`frontend/src/components/animazioni-mockup.js`** (NUOVO, 165 righe) | la regia sui clic: pressione dei pulsanti, gruppi della barra, pannelli delle impostazioni, schede, disclosure, collasso della barra |
| `frontend/src/styles/main.css` | `@import './mockup-animazioni.css'` **in coda** (dopo `mockup-td.css`: due regole devono vincere per ordine, non con `!important`) |
| `frontend/src/main.js` | `montaAnimazioniMockup(document)` dopo il monolite |
| `frontend/src/components/sezione-elenco-dettaglio.js` | FLIP, entrata/uscita/espansione del dettaglio; corretta la testata che diceva «niente animazioni in JS» per una ragione che non vale più |
| `frontend/src/components/modale-td.js` | entrata dopo `showModal()`, uscita prima di `close()`, `chiudiModale({immediata})` |
| `frontend/tests/unit/animazioni-mockup.test.mjs` (NUOVO) | l'inventario come cancello + i cancelli del movimento provati al contrario |

**Non toccati** (come da vincolo): `legacy/app.js`, `src/motion/`, `sezioni-adattatori.js`,
`ricerca-dettaglio.js`, `mockup-td.css`, `aspetto.css`.

---

## 5. Le misure testa a testa

Sonda: `Element.prototype.animate` intercettato + `document.getAnimations()` campionato a ogni
frame, sulle **stesse azioni** nel mockup e nella app, stessa viewport 1440×900, `--disable-backgrounding-occluded-windows`
(senza, Chrome strozza `requestAnimationFrame` a ~1/s e ogni misura di fluidità è sospetta).
Durate normalizzate al token di base.

### 5a. Sulla app vera (banco 5463) contro il mockup

| azione | mockup | app | scarto |
|---|---|---|---|
| pressione di un pulsante | `scale 1/.985/1`, **160 ms** | `scale 1/.985/1`, **160 ms** | **0 %** |
| cambio pagina | `opacity .4 translateY(5px)`, **180 ms** | idem, **180 ms** | **0 %** |
| gruppo della barra che si apre | `opacity .3 translateY(-4px)`, **180 ms** | idem, **180 ms** | **0 %** |
| freccia del gruppo | `rotate`, **160 ms** | `rotate`, **160 ms** | 0 % (easing diverso, §6.2) |
| collasso della barra | `276px 1164px → 64px 1376px`, **216 ms** | **gli stessi pixel**, **216 ms** | **0 %** |
| pannello delle impostazioni | `opacity .3 translateX(5px)`, **180 ms** | idem, **180 ms** | **0 %** |
| pannello di una scheda (`railFile`) | `opacity .4 translateY(4px)`, **180 ms** | idem, **180 ms** | **0 %** |

### 5b. Sui componenti veri (laboratorio 4186, fixture con dati)

| azione | misurato | atteso dal mockup |
|---|---|---|
| dettaglio che entra | `opacity 0 translateX(14px)`, **225 ms** | 225 ms ✔ |
| dettaglio che esce | `opacity 0 translateX(10px)`, **150 ms** | 150 ms ✔ |
| dettaglio che si espande | `opacity .65 → 1`, **180 ms** | 180 ms ✔ |
| FLIP (vista, ordine, apertura del dettaglio) | `translate(dx,dy) → none`, **243 ms** | 243 ms ✔ |
| toast che arriva | `tam-toast-entra`, **180 ms** | 180 ms ✔ |
| modale che entra | `opacity 0 translateY(12px) scale(.99)`, **180 ms** | 180 ms ✔ |
| modale che esce | `opacity 1 → 0 translateY(6px)`, **150 ms**, poi `dialog` rimosso (0 in pagina) | 150 ms ✔ |

### 5c. Le foto, chiaro **e** scuro

32 fotogrammi in `scratchpad/frame/`, mockup e app affiancati, **al 0 %, 34 %, 67 % e 100 % di
avanzamento** dell'animazione, tema chiaro e tema scuro, per il gruppo della barra e il collasso
della barra.
⛔ Il metodo: si scatena l'animazione, si **mette in pausa** tutto ciò che è in volo e si sposta
`currentTime` alla stessa frazione nei due posti. Una foto «a caso mentre scorre» non è
confrontabile — due corse non passano mai per gli stessi millisecondi. L'elenco delle animazioni in
volo è risultato **identico** in tutti e otto i casi (mockup e app, due temi, due superfici).
Guardate a occhio: `collasso-{mockup,app}-scuro-34` (il bordo della barra è alla stessa x in
entrambi) e `gruppo-app-chiaro-34` (freccia a metà rotazione, tema chiaro corretto).

### 5d. La prova al VERSO CONTRARIO

Sette corse, sempre le stesse azioni (dettaglio + FLIP nel laboratorio, toast, pressione e collasso
sulla app vera):

| stato | animazioni nuove | toast (CSS) | note |
|---|---|---|---|
| movimento **acceso** | tutte (12 nel laboratorio, 3 sulla app) | `tam-toast-entra:180` | riferimento |
| `prefers-reduced-motion: reduce` (sistema) | **NESSUNA** | `tam-toast-entra:0` | ✔ |
| `interface-motion-off` | **NESSUNA** | `:0` | ✔ |
| `reduce-motion` | **NESSUNA** | `:0` | ✔ |
| `motion-surfaces-off` | dettaglio e FLIP **spenti**; toast e pressione **accesi** | `:180` | ✔ la leva è fine davvero |
| `motion-feedback-off` | toast **senza animazione**, pressione spenta; dettaglio e FLIP accesi | `(nessuna)` | ✔ |
| `motion-navigation-off` | collasso della barra spento; pressione e dettaglio accesi | `:180` | ✔ |

Più, in unità: il cancello `motion-surfaces-off` **non** deve spegnere `motion-feedback-off` — è la
prova che morde, quella che distingue una leva fine da un interruttore generale con un altro nome.

### 5e. I cancelli

- `npm run test:unit` — **810 test, 810 verdi** (11 sono i miei).
- `tests/parity/nessun-errore-a-runtime.spec.mjs` sul banco 5463 (**mai la 4174**) — **verde**.
- Il cancello nuovo **morde**: durante la scrittura è diventato rosso due volte per davvero, con il
  messaggio giusto («SPARITA l'animazione …», «la forma … non è più nel mockup»).

---

## 6. Differenze residue, dichiarate

1. **Il cassetto della barra (≤ 860 px) dura 180 ms invece di 234.** Il mockup usa
   `surface-enter × 1,3`, la app `× 1`. Scarto **30 %**, sopra la soglia. Sta in `legacy/app.js`,
   che non tocco: diff al §7.
2. **La freccia del gruppo ha un easing diverso.** Mockup: `transition: rotate var(--…-control)`
   senza easing, cioè `ease` di default. App (`mockup-sidebar.css:61`): `var(--talos-motion-ease)`.
   Durata identica (160 ms). **Non l'ho «corretta»**: il foglio della app lo fa apposta e lo
   documenta, e allinearsi al mockup vorrebbe dire peggiorare per fedeltà. Decide l'owner.
3. **La app ha un'uscita al cambio pagina che il mockup non ha** (`translateX(-8px)`, 180 ms,
   `app.js:1524`). Preesistente, non mia, non tolta.
4. **`:root.td-reduced *` e `@media(prefers-reduced-motion) .td-scope *` non sono state portate.**
   Sono le regole universali con `!important` del mockup; nella app `.td-scope` non esiste su
   nessun nodo (misurato: 9 nel mockup, **0** nella app) e `td-reduced` non lo mette nessuno. Al
   loro posto i quattro cancelli del §3, che coprono di più e si vedono.
5. **`.td-loading-line` non è disegnata da nessuna superficie**, né nella app né nel mockup
   (misurato: zero nodi in entrambi). La regola e la `@keyframes` sono entrate lo stesso — costano
   due righe e il giorno che qualcuno disegna quella riga si muove come deve.

---

## 7. Diff proposti per i file di altri agenti (NON applicati)

### `frontend/src/legacy/app.js` — il cassetto deve durare quanto nel mockup

Riga ~1824-1825, dentro `apriCassettoBarra()`:

```diff
-      const durata = motionMilliseconds('--talos-motion-duration-surface-enter', 180);
-      if (durata > 0) barra.animate([{ transform: 'translateX(-100%)' }, { transform: 'none' }], { duration: durata, easing: … });
+      /* ⛔ ×1,3 come nel mockup (`openDrawer`: `motion(…, 'surface-enter', 1.3)`): un pannello che
+         entra da fuori schermo percorre più strada di una superficie che appare sul posto, e alla
+         stessa durata sembra sbattere. Misurato l'11/09: senza il fattore, 180 ms contro 234. */
+      const durata = motionMilliseconds('--talos-motion-duration-surface-enter', 180) * 1.3;
+      if (durata > 0) barra.animate([{ transform: 'translateX(-100%)' }, { transform: 'none' }], { duration: durata, easing: … });
```

(`easing` invariato.) Nessun altro diff proposto: `mockup-td.css` e `aspetto.css` non hanno bisogno
di modifiche — tutto ciò che serviva è entrato nel foglio nuovo, che vince per ordine.

---

## 8. Cosa NON ho verificato

1. **Toast, modale, dettaglio e FLIP sulla app VERA con dati veri.** Misurati nel laboratorio, che
   monta gli **stessi componenti** con fixture. Sul banco non li ho esercitati perché creare una
   nota o un file avrebbe scritto in `harness-ui/.notes-store`, cioè **nei dati dell'owner**: una
   sonda non tocca uno store che non ha creato.
2. **Il cassetto sotto gli 860 px** — non misurato in questo giro (la differenza del §6.1 è
   ricavata dal codice e dal fattore del mockup, non da una corsa a 800 px).
3. **`.td-progress > i` e `.td-loading-line` in una superficie reale**: nessuna fixture li disegna.
   Verificato che la **regola** arriva e si spegne, iniettando i due nodi nella pagina viva del
   banco (`width 0.09s cubic-bezier(0.2,0.7,0.2,1)` / `1.2s ease-in-out infinite td-track`, e
   rispettivamente `0s` / `none` con movimento ridotto).
4. **I figli di `<details class="td-source">`** (animazione #19): nella app `.td-source` non è un
   `<details>`, quindi la regola generica del disclosure c'è ma non l'ho vista scattare.
5. **Le foto** coprono due superfici (gruppo della barra, collasso) in due temi. Per le altre
   quindici la verifica è **numerica** (`getAnimations()`), non fotografica.
6. **`npm run test:componenti` per intero** non è stato lanciato: accende i suoi server su 4176/4177
   e altri agenti stanno lavorando adesso. Ho lanciato il cancello che il brief chiedeva
   (`nessun-errore-a-runtime`) puntandolo al mio banco.

## 9. Trovato per strada (taccuino, fuori dal compito)

- Nella foto `gruppo-app-chiaro-34` la voce «Note» in cima alla navigazione resta mezza coperta dal
  campo di ricerca: `.td-sidebar-nav` ha `max-height: 50%` e `overflow-y: auto`, e quando è scorsa
  non c'è niente che dica che sopra c'è dell'altro. Non è mio e non l'ho toccato.
- Il mockup gira con la scala di movimento al **50 %** salvata in `localStorage`
  (`talosMotionMode: adaptive`, token a 80/90/75 ms). Chi confronta il mockup con la app **senza
  normalizzare** vedrà «tutto diverso del 100 %» e starà misurando l'ambiente, non l'oggetto.
