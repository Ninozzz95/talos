# RAPPORTO — i quattro residui JS + la parola, 11/09/2026

> Corsia `lane/harness-desktop`. File toccati: `harness-ui/frontend/src/legacy/app.js`,
> `harness-ui/frontend/index.template.html`, `harness-ui/frontend/src/avvio.js`,
> `harness-ui/src/agent-service.mjs` (una parola), `harness-ui/frontend/tests/unit/residui-js-2026-09-11.test.mjs`
> (nuovo), `harness-ui/tests/agent-service.test.mjs` (due asserzioni dentro un test che c'era già),
> e **due righe** di `harness-ui/frontend/src/styles/index.css` (le bandierine che il JavaScript
> legge — §1 — più una riga di larghezza che quella cura avrebbe peggiorato, §1-bis: **è la sola
> cosa che ho fatto fuori dal mandato, ed è isolata in un blocco solo**).
>
> ⛔ **Mai la 4174.** Banco mio: `node scripts/build.mjs` + `node ../server.mjs` su
> **127.0.0.1:4211**, `TALOS_HARNESS_UI_PUBLIC_DIR=frontend/dist`, store sessioni in una cartella
> temporanea vuota, spento alla fine (PID verificato con `Get-CimInstance` prima di `taskkill`).
> Ogni sonda contava i metodi diversi da GET/HEAD con `page.on('request')`: **0 in tutte le corse**.
> ⛔ Niente `git`. Niente `dist/` copiato in `public/`.
>
> Foto in `%TEMP%\talos-banco-4211\` — `foto-avvio-600/` (velo, 3 preset × 2 modi),
> `foto-avvio-prima/` (il prima ricostruito), `foto/` (barra e selettore), `foto-finale/`
> (dettagli a 1100 e 1440, **tema chiaro e scuro**).

---

## Ricerca fatta PRIMA di scrivere (fonte + data)

| Cosa mi serviva sapere | Fonte | Letta |
|---|---|---|
| Se una custom property si può usare nella CONDIZIONE di una media query, e come si legge una soglia del CSS dal JavaScript | MDN «Using CSS custom properties»; tutorialpedia «Why CSS Native Variables Fail in Media Queries»; CSS-Tricks «How to Get All Custom Properties on a Page in JavaScript» | 11/09/2026 |
| Se esiste una via tutta-CSS (invece del ponte JS) per parametrizzare un breakpoint | Piccalilli «A workaround for using custom properties in media queries» — si fa con le **container style query**: niente Firefox, nessuna feature detection per le at-rule, due proprietà registrate per breakpoint, e interroga solo il viewport | 11/09/2026 |
| Quanto pesa uno stile in linea contro una regola del foglio, prima di cancellarne cinque | MDN «Specificity» — l'attributo `style` vale **1-0-0-0** e batte qualunque regola d'autore; si scavalca solo con `!important` | 11/09/2026 |
| Come si evita il lampo del tema sbagliato quando la preferenza sta in `localStorage` | CSS-Tricks «Flash of inAccurate coloR Theme (FART)»; timomeh.de «User-defined color theme in the browser without the initial flash»; dev.to «Why MUI Avoids Theme Flash on First Load» — lo script che stampa l'attributo sulla radice va **nell'head, prima del primo disegno** | 11/09/2026 |

⇒ **La prima ricerca ha cambiato il progetto della cura.** Avevo in mente
`--talos-soglia-inspector: 1240px` letta dal JavaScript: sarebbe stata di nuovo **due numeri** (la
variabile e la condizione della media query, da tenere allineati a mano), cioè il difetto di
partenza travestito. Il verso che regge è l'opposto — la media query DICHIARA, il JavaScript LEGGE.
⇒ **La seconda l'ha esclusa**: la via tutta-CSS esiste ma costa Firefox e due proprietà registrate
per soglia.

---

## 1. FASCIA 1041-1240 px — il pulsante collassava una colonna già invisibile, e SALVAVA

### Riproduzione (misurata, non dedotta)

Banco sulla 4211, store vuoto, tredici larghezze, clic sul pulsante «Dettagli» della testata.
Con la bandierina **forzata a 0** (che è esattamente il codice di ieri, `innerWidth > 1040`) a
1100×800:

| | `display` della colonna | classe sulla shell | `talos-harness-panel-widths` |
|---|---|---|---|
| **prima** (soglia 1040) | `none` → **`none`** | `inspector-collapsed` **aggiunta** | `{"inspectorCollapsed":true}` |
| **dopo** (soglia del foglio) | `none` → **`flex`**, 340×800, velo acceso | nessuna | `{}` |

A schermo, prima: **non succedeva niente**, e alla riapertura a 1440 la colonna partiva chiusa
senza che nessuno l'avesse chiusa.

### Causa (file:riga)

`src/legacy/app.js` aveva **tredici** `window.innerWidth <= 1040` / `> 1040` (righe di ieri 1479,
1484, 1497, 1513, 1524, 18102, 18115, 18651, 19031, 19039, 19217, 19228, 19229, 19257), mentre il
foglio toglie la colonna dei dettagli a **1240** (`src/styles/index.css`, sezione 14) e la barra
delle sessioni a **860**. Due numeri per una decisione sola, e uno dei due sbagliato.
⛔ E lo stesso difetto **specchiato** sulla barra, più largo di quello cercato: fra **861 e 1040 px**
il pulsante della barra apriva uno strato sopra una barra che era lì e visibile.

### Cura — una fonte sola, e il numero resta nella media query

- `src/styles/index.css:1643` — `:root{--talos-inspector-flottante:0; --talos-sidebar-flottante:0}` (il valore di riposo).
- `:1650` — `@media (max-width:1240px){ :root{--talos-inspector-flottante:1} … }`.
- `:1656` — `@media (max-width:860px){ :root{--talos-sidebar-flottante:1} … }`.
- `src/legacy/app.js:1504-1508` — `FLAG_FLOTTANTE` + `pannelloFlottante(quale, calcolato)`; **tutte**
  le tredici soglie sostituite (`:1511`, `:1516`, `:1529`, `:1548`, `:1559`, `:18142`, `:18159`,
  `:19078`, `:19273`, `:19287`, `:19288`, `:19318`), e due guardie **cancellate** invece che
  riscritte, perché la stessa domanda era posta due volte:
  - `:18142` — il delegato di `[data-open-panel]` chiedeva la soglia e poi la richiedeva
    `toggleDesktopInspector()`. Adesso decide una funzione sola.
  - `:18698` — le TRE copie del pulsante «Dettagli» (Terminale, Review, Browser) erano dietro
    `&& innerWidth > 1040`: **sotto quella misura non facevano niente**, nessun ramo le raccoglieva.
    Difetto trovato leggendo, non cercato.
- `:19078` (`onResize`) — la guardia esterna a `loadPanelWidths()` è **sparita**: le due colonne
  hanno soglie diverse e a distinguerle è `loadPanelWidths`, che ha una guardia **per pannello**
  (`:19287`, `:19288`). Con un numero solo, fra 861 e 1240 px la BARRA non veniva più ripristinata.
- ⛔ Costo misurato, non stimato: il punto più caldo è `applyPanelWidth` (gira a ogni `pointermove`
  del trascinamento) e lì `getComputedStyle` **c'era già** per `--talos-sidebar-w`: la lettura è
  una sola, passata (`:19273`).
- ⛔ Ripiego se la bandierina manca (foglio non caricato): «non flottante». Non è un default a caso —
  senza foglio nessuna regola nasconde le colonne, quindi le colonne SONO nella griglia.

### Riverifica (13 larghezze, i confini compresi)

| larghezza | `--talos-inspector-flottante` / `--talos-sidebar-flottante` | clic su «Dettagli» | salvato |
|---|---|---|---|
| 1440 · 1280 · **1241** | `0` / `0` | collassa la colonna (era visibile) | `inspectorCollapsed:true` |
| **1240** · 1180 · 1100 · **1041** · 1040 · 1024 · 900 · **861** | `1` / `0` | apre lo strato 340×800, velo acceso | **`{}`** |
| **860** · 800 | `1` / `1` | idem | `{}` |

Il salto è **esattamente** fra 1241 e 1240, e fra 861 e 860: le due soglie del foglio, non un numero
scritto altrove.

### Prove AL VERSO CONTRARIO

| Prova | Esito | Numero |
|---|---|---|
| 1a · a 1100 con la bandierina **forzata a 0** torna il difetto di ieri | VERDE | `display:none`, `inspector-collapsed`, `inspectorCollapsed:true` salvato |
| 1b · a 1440 con la bandierina **forzata a 1** apre lo strato | VERDE | `display:flex`, velo acceso, niente salvato |
| 1c · la BARRA a 900 (fra le due soglie) **collassa**, non apre uno strato | VERDE | `data-sidebar=icone`, 276 → **64 px**, `sessionsCollapsed:true` |
| 1d · la BARRA a 800 (sotto 860) non collassa: è già fuori dalla griglia | VERDE | `display:none`, niente salvato |
| 1e · il cancello di testo riconosce una soglia rimessa a mano | VERDE | `innerWidth <= 1040` → test rosso, ripristinato → verde |

⇒ 1a e 1b insieme provano che la bandierina è **letta davvero**: forzandola, il comportamento cambia
in tutti e due i versi.

---

## 1-bis. LA COSA FUORI MANDATO — la barra compressa restava larga 276 px

⛔ **Trovata dalla cura, non cercata**, e l'avrei **allargata** tacendo.

La cura del §1 sveglia il pulsante della barra fra 861 e 1040 px. Guardando la foto di quello che
adesso succede lì, la barra «compressa» si svuotava **senza stringersi**: griglia `276px 824px`,
sette icone centrate e **212 px di vuoto** a lato (misurato a 1100×800 e 900×800, nei due temi).

**Causa** (`src/styles/index.css`, riga di ieri 1619): un selettore solo,
`.talos-shell, :root[data-sidebar="icone"] .talos-shell{grid-template-columns:var(--talos-sidebar-w) …}`.
Togliendo la terza colonna si riscriveva anche la **prima**, e la modalità a icone perdeva i suoi
64 px. È un difetto **preesistente** nella fascia 1041-1240 (lì il pulsante collassava già da ieri):
io non l'ho creato, ma senza cura l'avrei esteso di altri 180 px.

**Cura** — due righe invece di una (`:1650`), più `:root[data-sidebar="icone"]` aggiunto all'elenco
della media query a 860 (`:1656`), perché una regola 0-2-0 dentro il blocco a 1240 avrebbe lasciato
una colonna di 64 px a una barra `display:none`.

**Riverifica**: 1100 e 900, chiaro e scuro → griglia `64px 1036px` / `64px 836px`, barra **64 px**,
foto `foto/barra-*-collassata.png`. ⛔ **Se l'owner vuole questa fuori, si toglie da sola**: sono due
righe, in un blocco solo, e non toccano niente del §1.

---

## 2. IL PULSANTE X DEI DETTAGLI ERA MORTO

### Riproduzione

A 1100×800 la colonna si apre come strato sopra la app. Il velo la chiude, `Esc` la chiude, la **X**
no: `open` resta sull'`<aside>`, `display` resta `flex`. È la prova **2b del rapporto CSS**, l'unica
rossa di quella corsia.

### Causa (file:riga)

`index.template.html:1061` — `<button id="chiudiDettagli" …>` senza nessun ascoltatore: cercato
`chiudiDettagli` in tutto `src/`, `scripts/`, `tests/` e nel template, **compariva solo lì**. La
delega `$$('[data-close-panel]')` era già cablata a `closePanels` (`src/legacy/app.js:18147`).

### Cura

`index.template.html:1061` — aggiunto `data-close-panel="inspector"`. Una parola, nessuna riga di
JavaScript nuova. ⛔ Un commento accanto dice **perché** non è decorazione, così nessuno lo toglie
«ripulendo».

### Riverifica

| Prova | Esito | Numero |
|---|---|---|
| 2a · a 1100 la X chiude | VERDE | `flex`/velo acceso → `display:none`, `open` tolta, velo spento |
| 2b · AL CONTRARIO — a 1440 la X non è nemmeno visibile | VERDE | `display:none` (la mostra solo `.talos-inspector.open` sotto i 1240) |
| 2c · cancello di testo | VERDE | tolto l'attributo → test rosso; rimesso → verde |

---

## 3. I CINQUE `element.style.*` CHE ERANO DIVENTATI DOPPIONI

### Riproduzione

La corsia degli stili ha portato quelle regole nel foglio e ha dichiarato il debito: *«finché ci sono
gli stili in linea vincono loro»*. Uno stile in linea pesa **1-0-0-0** (MDN, 11/09/2026) ⇒ le regole
nuove del foglio erano **scritte e inerti**: non sbagliate, proprio senza effetto. Una regola che non
si applica non si può nemmeno cambiare.

### Causa (file:riga, prima della cura)

| Cosa | Dov'era in `app.js` | Regola del foglio che copre |
|---|---|---|
| `flexWrap` + `flexShrink` + `rowGap` sulla striscia delle fonti | dov'è oggi il commento, `:5397` | `foglio-monolite.css:486` |
| `flex:0 0 auto` sulla scheda del fornitore | `:5477` | `:487` |
| `color` sul `policyGate` | dov'è oggi il commento, `:16011` | `:458` |
| `marginTop` + `color` sulla nota del piede | dov'è oggi il commento, `:16058` | `:444`, `:445` |

### Cura

Cancellati tutti e cinque, con un commento che dice dove sta adesso la regola e perché la copia in
linea faceva danno.

### Riverifica — il pixel non si muove, e adesso il foglio MORDE

**Selettore dei modelli**, aperto dal vivo, 1440×900 e 1024×800, tema chiaro e scuro. Geometria
letta **senza** gli stili in linea (com'è adesso) e poi **rimettendoli a runtime** (com'era ieri):

| viewport / tema | striscia | schede (x,y,w,h) | identico? |
|---|---|---|---|
| 1440 chiaro · 1440 scuro · 1024 chiaro · 1024 scuro | 652×39, `wrap` / `shrink:0` / `row-gap:2px` | 123,8 · 76 · 105,5 · 90 · 92,3 (una riga) | **sì, byte per byte** |

⛔ **Un falso allarme, e come l'ho scoperto**: al primo giro il caso 1024-scuro risultava DIVERSO
(tre schede +30 px). Non era il CSS: erano i **conteggi** del catalogo che arrivano dalla rete fra
una misura e l'altra. Misurando **due volte di fila senza toccare niente** (A/B a 1,5 s) i numeri
sono stabili e le quattro combinazioni tornano identiche. *Numeri che cambiano senza causa sono un
allarme; numeri troppo uguali pure.*

**Modale «Nuova sessione»**, 1440×900, chiaro e scuro:

| Prova | Esito | Numero |
|---|---|---|
| 3a · l'attributo `style` delle due note è vuoto | VERDE | `""` per entrambe, nei due temi |
| 3b · colore e margine restano quelli di ieri | VERDE | scuro `srgb .8779 .8696 .8525`, chiaro `rgb(48,49,54)`; nota `margin-top:0px`, gate `8px` |
| 3c · **adesso il foglio morde**: una regola nuova a pari specificità cambia il colore | VERDE | → `rgb(255,0,0)` in tutti e due i temi |
| 3d · AL CONTRARIO — rimesso lo stile in linea, il foglio torna **inerte** | VERDE | il rosso non arriva: colore di nuovo quello del token |

⇒ 3c e 3d insieme sono la prova che la cancellazione non era cosmetica: ha **restituito il comando
al foglio**.

---

## 4. BC-19 — il velo d'avvio conosceva DUE cose su quattordici

### Riproduzione (con `terminal` salvato e timbrato)

| | fondo del velo | tratto del marchio | parola |
|---|---|---|---|
| **prima** (scuro) | `rgb(30,31,34)` — calm | `rgb(192,139,60)` — oro di calm | `rgb(243,240,233)` |
| **dopo** (scuro) | `rgb(2,4,3)` — **il fondo di terminal** | `rgb(99,240,142)` — **il verde di terminal** | `rgb(237,242,247)` |
| **prima** (chiaro) | `rgb(236,233,226)` | `rgb(155,104,35)` | `rgb(35,36,39)` |
| **dopo** (chiaro) | `srgb .9433 .9784 .9667` | `srgb .2548 .4986 .3091` | `rgb(17,24,39)` |

La app dietro è `rgb(2,4,3)`: il velo che esiste **per non far vedere un lampo** ne produceva uno
suo, di 28 punti su un canale, allo scoprirsi — a ogni ricaricamento, per tredici temi su quattordici.
⛔ Il «prima» non è ricostruito a memoria: è misurato sulla stessa pagina **togliendo l'attributo
che il ponte stampa**, che è esattamente lo stato di ieri.

### Causa (file:riga)

- `index.template.html:66-76` — `background-color:#1e1f22` e `#ece9e2` letterali: i due fondi di
  **calm**, giusti per un tema su quattordici. La parola in chiaro era `#2b2a27`, scritto a mano.
- `src/avvio.js` (ponte del tema) — stampava solo `data-theme="light"`: `--talos-accent` restava
  quello di `index.css`, cioè di calm, perché `data-talos-theme` arriva solo quando parte la app.

### Cura

- `src/avvio.js:57-74` — il ponte legge anche `themePreset` e stampa `data-talos-theme` **prima del
  primo disegno**, nell'head, sincrono (la forma che la ricerca dell'11/09 indica per il FOUC).
  ⛔ **Col TIMBRO**: `themePresetVersione === 2`, la stessa regola di `ASPETTO_SCELTA_VERSIONE` in
  `legacy/app.js`. Un ponte che leggesse il tema senza il timbro dipingerebbe un tema che la app poi
  **butta** — cioè lo stesso lampo, al contrario. E i quattordici id sono gli stessi: un tema fuori
  lista `temi.css` non lo conosce.
- `index.template.html:67` e `:75-76` — fondo e parola da `--talos-background` / `--talos-text`, coi
  letterali **come ripiego di `var()`** per l'unico caso in cui il velo deve cavarsela da solo
  (`styles.css` non arrivato). ⛔ Colore e immagine restano **separati**: se un giorno il token
  esistesse ma vuoto, la dichiarazione sarebbe «invalid at computed-value time» e in una scorciatoia
  si porterebbe via anche il gradiente.

### Riverifica — foto DURANTE il velo, 3 preset × 2 modi

Scatto a **600 ms** dopo `goto` (il velo dura almeno 650 ms), `waitUntil:'commit'`:

| tema / modo | fondo del velo | fondo della app DOPO | uguali? | tratto |
|---|---|---|---|---|
| calm scuro | `rgb(30,31,34)` | `rgb(30,31,34)` | **sì** | `rgb(192,139,60)` |
| calm chiaro | `rgb(236,233,226)` | `rgb(236,233,226)` | **sì** | `rgb(155,104,35)` |
| forge scuro | `rgb(8,11,17)` | `rgb(8,11,17)` | **sì** | `rgb(201,139,50)` |
| forge chiaro | `srgb .9633 .9586 .9486` | idem | **sì** | `srgb .4388 .3164 .1431` |
| terminal scuro | `rgb(2,4,3)` | `rgb(2,4,3)` | **sì** | `rgb(99,240,142)` |
| terminal chiaro | `srgb .9433 .9784 .9667` | idem | **sì** | `srgb .2548 .4986 .3091` |

**Sei su sei: il velo e la app dietro hanno lo stesso fondo, quindi allo scoprirsi non cambia un
pixel di sfondo.** E mai `rgba(0,0,0,0)`: il timore scritto nel template non si avvera.

### Prove AL VERSO CONTRARIO

| Caso salvato | Velo | App dopo | Coerenti? |
|---|---|---|---|
| `terminal` **senza** `themePresetVersione` (residuo) | calm, `rgb(30,31,34)` | calm | **sì** |
| `terminal` con versione **1** (timbro vecchio) | calm | calm | **sì** |
| `terminal` con versione **2** | terminal, `rgb(2,4,3)` | terminal | **sì** |
| tema **inventato** col timbro giusto | calm | calm | **sì** |
| **nessuna** preferenza salvata | calm | calm | **sì** |

⇒ In nessuno dei cinque il velo dipinge un tema che la app poi scarta.

---

## 5. LA PAROLA — `html` non è accodabile, e il rifiuto lo suggeriva

`harness-ui/src/agent-service.mjs:1099`. Il rifiuto per un formato binario diceva
«use a text format (**md, html**, txt, or a source format)», mentre sei righe sopra
`formatoAccodabile` (`:1074`) ammette `TALOS_SOURCE_TEXT_FORMATS` più `md` e `csv`, e `html` **non è
in nessuno dei due** — il commento a `:1062-1072` lo spiegava già per esteso. Il messaggio mandava il
modello dritto sull'errore che stava rifiutando.

**Cura**: tolto `html`. **Riverifica**: `tests/agent-service.test.mjs` — nel test che già esisteva
(«un formato BINARIO rifiuta l'aggiunta PRIMA di scrivere») due asserzioni nuove che **non guardano
la stringa** (cambierebbe a ogni riscrittura): estraggono i formati nominati e chiedono che ognuno
sia davvero accodabile. **192/192 verdi**; rimettendo `html` il test diventa rosso con
«il rifiuto suggerisce «html», che non è accodabile» — provato e ripristinato.

⛔ **Visto e NON fatto**: `csv` **è** accodabile e nella frase non c'è. Aggiungerlo è corretto ma è
un'aggiunta, non la rimozione chiesta: lo segnalo invece di farlo.

---

## 6. Cancelli

| Cancello | Esito |
|---|---|
| `npm run test:unit` (frontend) | **703 / 703 verdi**, 2,9 s — erano 696, i 7 in più sono il cancello nuovo |
| `tests/unit/residui-js-2026-09-11.test.mjs` (nuovo) | **7 / 7**, e **ognuno provato al contrario sul file vero**: rimessa la soglia → rosso; tolto `data-close-panel` → rosso; rimesso uno stile in linea → rosso; tolto il ponte del tema → rosso. Ripristinati, 7/7 |
| `node --test tests/agent-service.test.mjs` (backend) | **192 / 192 verdi**, 17,6 s |
| `nessun-errore-a-runtime.spec.mjs` su **cinque** viewport (1440 · 1280 · **1100** · 1024 · **900**) | **5 / 5 verdi**, 40 s — zero errori JavaScript in tutta la fascia toccata |
| `scripts/cancello/statico.mjs` | uscita **0**: 0 simboli mai disegnati, 0 graffe orfane, 7 funzioni morte e 131 classi sospette **tutte preesistenti** (nessuna nata da queste cure) |
| `npm run verify` | **NON girato**: il suo `webServer` vuole la **4176**, occupata da un'altra corsia. Non l'ho forzata né spenta |

---

## 7. Taccuino dell'ispettore — cosa ho visto oltre a ciò che cercavo

1. **La barra compressa larga 276 px** (§1-bis): il difetto più grosso della giornata, e non era nel
   mandato. L'ho curato perché la mia cura lo avrebbe allargato.
2. **Le tre copie del pulsante «Dettagli» erano morte sotto i 1040** (`app.js:18698`): nessun ramo le
   raccoglieva. Curato nello stesso giro, perché è la stessa riga.
3. **Il marchio del velo in tema CHIARO è molto pallido**: l'esagono ha `stroke-opacity:.18` e sui
   temi chiari l'accento è già smorzato — a occhio sfiora il fondo. **Non l'ho toccato**: il valore
   è quello di prima e alzarlo è una decisione di disegno, non una cura. Foto
   `foto-avvio-600/avvio-terminal-light.png`.
4. **`aria-expanded` del pulsante Dettagli dice `true` anche quando lo strato è chiuso** (a colonna
   flottante `expanded = flottante || !collassato`). È il comportamento di ieri, solo spostato di
   soglia: **non l'ho cambiato** per non toccare la semantica ARIA in un giro che non la riguarda.
   Va deciso a parte — è una riga.
5. **`DIALOG_RESIZE_BREAKPOINT = 780`** (`app.js:1598`) è la stessa classe di doppione del §1: quel
   numero sta anche in `foglio-monolite.css:253`. Lì però è già una **costante con un nome**, e
   riguarda i dialoghi, non le colonne: segnalato, non toccato.
6. In tema **chiaro** il velo dei pannelli a `.54` fa la app dietro molto scura — è la stessa nota
   §6.3 del rapporto CSS, e il posto per cambiarlo resta uno solo (`--scrim`).

---

## 8. Cosa NON ho verificato

- **Nessun giro col modello**: lo store delle sessioni del banco era vuoto per costruzione. La
  geometria, i temi e gli eventi sono veri (build vera, server vero, app viva); il **contenuto** no.
  Le misure del §1 e del §2 non dipendono da una conversazione, quelle del §3 sì per il **numero**
  delle schede del selettore (cinque, col catalogo di OpenRouter caricato).
- **La consegna in `public/`**: non fatta, come chiesto. Finché non la fa qualcuno, sul 4174 gira il
  build di prima e **nessuna di queste cure si vede lì**.
- **`npm run verify`** e la parità dei componenti: non girati (porta 4176 occupata da un'altra
  corsia). Il cancello che tocca davvero il mio lavoro — gli errori a runtime — è verde su cinque
  viewport.
- **Barre di scorrimento classiche**: come nel rapporto CSS, tutte le mie misure hanno barre overlay.
- **Il tocco vero dell'owner**: tutto è passato da Playwright sul mio banco. Sul 4174 non ho fatto
  nemmeno una GET.
- **Gli altri undici temi**: il §4 è provato su **tre** preset (calm, forge, terminal) nei due modi,
  scelti perché coprono i tre casi diversi (tema di serie · tema scuro derivato · tema con accento
  lontanissimo). Gli altri undici passano dalla stessa riga di `temi.css` ma **non li ho fotografati**.

---

## 9. Riepilogo veloce

**Cosa devi fare tu**
1. **La riga fuori mandato** (§1-bis, la barra compressa a 64 px invece di 276): la tengo o la
   tolgo? Sì/no. Sono due righe in `index.css`, isolate.
2. **`csv` nel suggerimento dell'accodamento** (§5): lo aggiungo? Sì/no/dopo.
3. **`aria-expanded` del pulsante Dettagli** quando lo strato è chiuso (§7.4): lo rendo veritiero?
   Sì/no/dopo.
4. **Il marchio pallido del velo in tema chiaro** (§7.3): alzo `stroke-opacity` dell'esagono? Sì/no/dopo.
5. **La consegna in `public/`**: è tua — finché non c'è, sul 4174 non cambia niente.

**Cosa faccio io** — niente che aspetti un tuo sì: i quattro residui e la parola sono dentro,
provati **nei due versi**, fotografati **in tema chiaro e scuro**, con un cancello nuovo che li
tiene chiusi e che ho fatto **mordere uno per uno** sui file veri.

**Cosa rimane** — `npm run verify` e la parità dei componenti non girati (porta di un'altra corsia);
gli undici temi non fotografati; nessun giro col modello; `DIALOG_RESIZE_BREAKPOINT` segnalato e non
toccato; la consegna in `public/`.
