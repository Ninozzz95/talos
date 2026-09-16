# Lo sfondo animato entra nella CHAT, e i temi si allineano al MOBILE — 11/09/2026

Banco: copia costruita (`frontend/dist`) servita su **porta 5310** (statico) e **5311** (server vero,
`TALOS_HARNESS_UI_PUBLIC_DIR` + store di sessioni vuoto). Il 4174 dell'owner non è mai stato
**scritto** né **riavviato** da me, e nessuna misura di questo rapporto viene da lì.
⛔ **Ma l'ho toccato lo stesso, due volte, e senza volerlo: sta nel §7 punto 0, in cima, perché non
lo si scopra in fondo.** I server del banco sono stati spenti a fine lavoro. Nessun `git add`, nessun `git commit`, nessun `git push`: l'albero resta sporco.

Misura: schermo intero, **1440×900 = 1.296.000 px** e **1024×800 = 819.200 px**, confronto pixel a
pixel canale per canale, soglia `delta > 2/255`, tema chiaro e scuro.

⛔ **Lo strumento è scritto a mano e provato su un caso di effetto noto prima di fidarsene**
(`autoProva()`): oro contro verde → 1600 px e delta 89; oro contro se stesso → 0; delta 1 sotto
soglia 2 → 0; contrasto bianco/nero → 21,00; `#767676` su bianco → 4,54. `pixelmatch@7.2.0` aveva già
risposto **0 px** su due schermate visibilmente diverse durante il lavoro di ieri, e non è stato usato.

---

## 1. Come lo fa il MOBILE — la fonte

Letto nel codice a **HEAD** del repo `AVM` (`7537f259`, 11/09 09:09, ramo `lane/voce-personale`), e
verificato con `git show HEAD:` invece che dalla copia di lavoro. ⛔ Controllato anche che non esista
uno stato più recente altrove: il commit più nuovo che tocca i file dei temi e delle scene su
**qualunque ramo** è `d4d5851d` del 23/08, ed è presente su tutti i rami compreso quello attivo.

**Lo sfondo animato NON è dentro la chat: è a livello di shell, sotto tutto.**

- `mobile/src/App.vue:1157-1163` — un `<TalosMobileBackground class="z-0">` è figlio diretto della
  radice, e il contenuto (chat compresa) sta in un `z-10`. È un **canvas 2D** disegnato da un loop
  `requestAnimationFrame` (`mobile/src/motion-v6/renderers/complexRenderer.ts:272-299`), non CSS:
  nel mobile non esiste **nessun** `@keyframes` per lo sfondo e nessun gradiente CSS che lo disegni.
- ⭐ `mobile/src/App.vue:1157-1163` — `:paused="activeRoute === 'chat' && chatHasMessages"`, con la
  ragione scritta a `App.vue:64-67`: *«The animated workspace backdrop is useful on the empty hero,
  but it is pure competition once a real thread is visible: chat scrolling must not share a frame
  budget with a decorative canvas.»* **Sul filo vivo lo sfondo resta, ma si ferma.**
- `mobile/src/motion-v6/scenes/complex/sceneTools.ts:191-195` — l'alfa di **ogni** tratto è
  `base * (0.32 + intensity/100*0.8) * (0.7 + contrast/100*0.46)`. Coi default (intensity 20,
  contrast 80) il fattore vale **0,5126**.
- `mobile/src/motion-v6/scenes/complex/calm.ts` — il campo che respira è dipinto a `alpha(0.018)` =
  **0,0092**; i tratti che si vedono davvero (orizzonte, filamento) stanno fra **0,056 e 0,082**.
  ⇒ **il registro visibile del mobile è ~8%**, non il 17,6% che aveva il desktop.
- Periodo: `breath += dt*0.07` ⇒ **~90 s**; `drift += dt*0.025` ⇒ ~251 s.
- **La leggibilità** nel mobile non viene da un velo generale ma da tre cose: (a) fondo **opaco**
  sulla radice (`App.vue:1123`) più un `data-talos-motion-solid-underlay` opaco dentro lo stage
  (`TalosMotionStage.vue:244-249`); (b) l'alfa bassissima del disegno; (c) **un velo radiale vero, ma
  solo sull'hero della chat vuota** — `mobile/src/screens/ChatScreen.vue:1124-1131`:
  `radial-gradient(ellipse at center, var(--talos-background) 35%, transparent 78%)`, cioè **il fondo
  del tema usato come velo**, che sfuma ai bordi.
- ⛔ **Difetto trovato NEL MOBILE, registrato e non corretto (altra lane):** i due strati
  `.talos-theme-background-glow` e `.talos-theme-background-scrim`
  (`TalosProceduralBackground.vue:146-147`) **non hanno nessuna regola CSS** in tutto il progetto
  (sorgenti e bundle), e le sei variabili che `backgroundPresentation.ts:25-42` calcola per loro
  (`--talos-background-stage-opacity`, `-glow-opacity`, `-scrim-start`, `-scrim-end`,
  `-filter-contrast`, `-filter-saturation`) **non sono lette da nessuno**. Sono inerti.
- ⛔ Le bolle: l'utente ha fondo **opaco** (`var(--talos-accent)`); l'assistente, nello stile di serie
  `sections`, **non ha nessun fondo** — il testo sta direttamente sopra lo sfondo
  (`TalosMobileMessageList.vue:440-453`). Funziona solo perché lo sfondo lì è fermo e quasi invisibile.

**Il sistema dei temi.** `mobile/src/lib/talosThemes.ts` — un preset **non contiene una tavolozza**:
contiene **quattro semi** (`preview.background`, `.accent`, `.secondary`, `.line`), `isLight`, due
font e cinque default di comportamento. Tutti i token si derivano con `color-mix(in srgb, …)`
(`talosThemeModeVariantStyle`, righe 581-691), verbatim:

```
SCURO   background = isLight ? mix(accent,10,'#06080d') : preview.background
        panel = mix(background,86,'#141a24')   panel-soft = mix(panel,74,'#05070b')
        card  = mix(panel,88,'#05070b')        window-bg  = mix(panel,92,'#05070b')
        text  = '#edf2f7'   muted = mix(text,68,background)   border = mix(line,74,'#111827')
CHIARO  background = isLight ? preview.background : (calm ? '#f1f2f4' : mix(accent,5,'#f8fafc'))
        panel = mix(background,92,'#ffffff')
        text  = '#111827'   muted = mix(text,68,background)   border = mix(line,72,'#d7dee8')
        border-strong = mix(line,86,'#9aa7b8')
```

Applicazione: `mobile/src/theme/applyDesignTokens.ts:76-122` scrive `data-talos-theme`,
`data-theme-preset`, `data-theme-mode` e la classe `.dark` su `<html>`, più i token **in linea**.
⛔ **`data-talos-scene` nel mobile NON esiste**: la scena viaggia come proprietà JS
(`scene_override ?? themeId`, `workspaceRuntime.ts:55`) perché la disegna un canvas.

---

## 2. Le incongruenze trovate, una per una, con la misura

### 2.1 ⛔⛔⛔ Lo «sfondo della chat» dipingeva i tre quarti di OGNI schermata

Le due macchie stavano su `body::before/::after`, `position:fixed`, `inset:-18%`: coprivano il
**viewport intero**. Misurato accendendo e spegnendo lo sfondo, 1440×900 scuro:

| schermata | pixel cambiati | % | deltaMax |
|---|---|---|---|
| Impostazioni | **942.179** | 72,70 % | 142 |
| Memoria | **1.025.207** | 79,11 % | 142 |
| Attività | **1.027.807** | 79,31 % | 142 |
| Board | **983.517** | 75,89 % | 142 |

Non era «lo sfondo della conversazione»: era un velo su tutta la pagina, che si vedeva anche dove
non c'è nessuna conversazione. **Corretto** (§3.1). Dopo: **0 px, deltaMax 0** su tutte e quattro.

### 2.2 ⛔⛔ La scena era **2,2 volte** più forte del registro del mobile

Alfa vera dell'accento al centro della macchia: `opacity .22 × color-mix 80%` = **0,176**.
Il mobile, alla stessa intensità, dipinge il campo a **0,0092** e i tratti visibili a **0,056-0,082**.
È esattamente il «velo giallognolo» che l'owner ha visto. **Corretto** (§3.2): ora **0,081**.

### 2.3 ⛔⛔⛔ Accendere lo sfondo cambiava l'ANTIALIASING di tutto il testo della chat

Trovato guardando **dove** cambiano i pixel invece di contarli: il delta massimo (141/255) non stava
nella scena, stava nelle **lettere**. Campionando i pixel di un glifo:

```
spento  [123,31,34]  [30,161,201]   canali sbilanciati = antialiasing SUBPIXEL (LCD)
acceso  [ 89,87,84]  [163,160,154]  canali quasi uguali = antialiasing GRIGIO
```

Causa: per mostrare una scena a `z-index:-1`, il foglio rendeva **trasparenti** `body` e
`.talos-shell`. Chrome non fa subpixel antialiasing sopra una superficie non opaca. Firma misurata
(sbilanciamento medio dei canali sui bordi delle lettere; alto = LCD, basso = grigio), zona dei
messaggi, 1440×900 scuro:

| stato | barra laterale | **chat** | ispettore |
|---|---|---|---|
| prima, sfondo spento | 59,2 | **68,7** | 50,4 |
| prima, sfondo acceso | 59,2 | **22,4** | 50,4 |
| dopo, sfondo acceso | 59,2 | **68,1** | 50,4 |

**Corretto** (§3.3), e la cura è la stessa regola del mobile.

### 2.4 ⛔⛔ `motionQuality: low` e `motionMode: simple` non hanno MAI tolto lo strato di luce

Trovato provando le leve al **verso contrario** invece che implementandole. La regola che accende la
scena ha specificità **(0,3,2)**; quelle che spengono il secondo strato ne avevano **(0,2,2)** ⇒
`display:block` vinceva su `display:none`, sempre. Vale anche per la forma di ieri (`body::after`):
il difetto è vecchio quanto la scena. **Corretto** (§3.5), provato nei due versi.

### 2.5 ⛔⛔ «Riduci il movimento» dell'utente SPEGNEVA la scena; quello del sistema la lasciava

Due comportamenti diversi per la stessa intenzione, e quello sbagliato era il nostro: la leva utente
passava per `backgroundOff` e toglieva la scena; `@media (prefers-reduced-motion)` la lasciava
visibile e ferma. Il mobile ne ha uno solo — `runtimePolicy.ts:205-217`:
`else if (environment.prefersReducedMotion) { effectiveMode = 'static' }`, cioè **ferma, non spenta**.
**Corretto** (§3.5).

### 2.6 ⛔⛔⛔ Tredici temi su quattordici avevano un accento diverso da quello del mobile

| tema | accento desktop (prima) | accento mobile | | tema | desktop | mobile |
|---|---|---|---|---|---|---|
| forge | `#c08b3c` | `#c98b32` | | signal | `#5ce1e6` | `#ff6f61` ⛔ ciano → corallo |
| paper | `#9b5b2a` | `#a96617` | | violet | `#d3a6ff` | `#b794f6` |
| terminal | `#67d391` | `#63f08e` | | claudius | `#d2a96d` | `#d97757` |
| aurora | `#a995ff` | `#42e7c7` ⛔ viola → verde-acqua | | basicus | `#aeb4c0` | `#1976d2` ⛔ |
| glacier | `#8fd8f3` | `#2367d1` ⛔ | | telemetry | `#75d0a4` | `#6ad4d4` |
| ember | `#ef8b57` | `#ff5c62` | | **calm** | `#c08b3c` | `#c08b3c` ✔ **l'unico identico** |
| atlas | `#74a8ff` | `#d49a52` ⛔ azzurro → bronzo | | noir | `#d4d4d8` | `#f2f2f2` |

E **quattro temi che sul mobile sono chiari** (`isLight: true` — paper, glacier, claudius, basicus)
sul desktop erano **scuri**: tre su quattro sbagliati. Due prodotti che dicono «Aurora» e mostrano
due cose diverse. **Corretto** (§3.6).

### 2.7 ⛔ Il periodo della scena: 36 s contro i ~90 s del mobile

Sul desktop la scena si **notava** mentre si legge. **Corretto** (§3.4).

### 2.8 Incongruenze REGISTRATE e non corrette — decide l'owner

| cosa | desktop | mobile | perché non l'ho toccata |
|---|---|---|---|
| **neutri di `calm`** | panel `#25262a`, text `#f3f0e9`, muted `#9c9da2` | panel `#1d1e22`, text `#edf2f7`, muted `#abaeb3` | i **semi** sono già identici; i derivati no. È il tema di serie, quello che l'owner sta guardando, scritto e approvato a mano. Cambiarlo non è allineare due sistemi: è cambiare il prodotto sotto gli occhi di chi lo usa |
| **`calm` chiaro** | `#ece9e2` (crema, `index.css`) | `#f1f2f4`, con un commento esplicito dell'owner nel mobile: *«calm light surfaces are NEUTRAL grey-white»* | due decisioni d'owner in contraddizione fra i due prodotti: **serve la sua parola**, non la mia |
| **caratteri per tema** | due soli font spediti | Manrope (aurora/atlas/signal), Sora (violet), Source Serif 4 (paper/claudius) | in `dist/fonts/` ci sono **solo** Instrument Sans e JetBrains Mono: scrivere quei nomi darebbe un ripiego di sistema silenzioso, cioè una regressione travestita da allineamento |
| **scala dei raggi** | un valore px per tema (4…18) | tre gradini (`sharp` 0, `balanced` 0.5rem, `soft` 0.75rem) | cambierebbe la forma di ogni scheda, e nessuno l'ha chiesto |
| **accento in CHIARO** | scurito verso l'inchiostro | accento grezzo | ⭐ qui il **desktop è più corretto**: l'accento grezzo di un tema scuro su carta non arriva a 3:1 (WCAG 2.2 SC 1.4.11). Divergenza voluta, dichiarata nel foglio |
| **colori di stato** | `--talos-warning` `#d4a558`, indipendenti dal tema | ambra `#f59e0b`, verde, rosso, blu, ricalcolati per modo | toccano ogni schermata: è una decisione di prodotto |
| **`streamingAnimation`** | `fade` | `typewriter` | default di prodotto |
| **`immersiveHeader`** | `false` | `true` | default di prodotto |
| **`composerShape`** | `standard` | `compact` (owner 17/08: «la forma del compositore a compatto») | default di prodotto |
| **`windowPresentation`** | `drawer` | migrato a `fullscreen` | è una scelta mobile (schermo piccolo) |
| **`chatFullWidth`, `reducedMotion`** | esistono | **non esistono** nel mobile | leve in più del desktop, non un disallineamento |
| **`data-talos-scene`** | esiste | non esiste | forma diversa, semantica identica: lì la scena la disegna un canvas, qui il CSS |
| **velo/scrim inerti nel mobile** | — | due `<div>` e sei variabili senza CSS | ⛔ difetto **del mobile**: registrato, **non corretto** (altra lane) |

I default del **movimento** sono invece già identici, verificati a HEAD
(`mobile/src/motion-v6/defaults.ts`): intensity 20, glow 10, density 100, depth 92, trails 50,
contrast 80, parallax 20, speed 100, quality `adaptive`, `pause_when_hidden` e `respect_data_saver`
a `true`. Uguali anche `messageStyle: sections`, `composerPlus: drawer`, `uiFontScale: default`,
e `chatFontScale: xcompact` (il mobile lo chiama `bubble_scale`).

---

## 3. Cosa ho cambiato, file per file

### `frontend/src/styles/aspetto.css`

**3.1 — la scena si aggancia a `#schermoChat`, non a `body`.** `position: absolute; inset: 0;
z-index: -1`, con `.talos-screen` che è già `position:relative`. Il router mette `#schermoChat` a
`display:none` quando sei su un'altra schermata (verificato sulla pagina viva), quindi la scena
sparisce da sola dove non c'è conversazione. Barra laterale e ispettore restano fuori **per
costruzione**, non perché dipingono opaco.

**3.2 — la forza viene dal mobile.** `--talos-scena-alfa: calc((.32 + intensity * .8) * .21)`. La
curva è quella di `sceneTools.ts:191-195`; il coefficiente `.21` è **tarato** perché ai valori di
serie l'alfa dell'accento al centro valga **0,081** — il registro visibile delle scene del mobile
(orizzonte 0,082, filamento 0,056). ⛔ Il contrasto resta nel `color-mix` e non nella curva: nel
mobile a contrasto 0 la scena non sparisce (il fattore si ferma a 0,7), qui sì — ed è una promessa
che quel cursore fa già. Provato: **contrasto 0 + glow 0 ⇒ 0 px di differenza dallo sfondo spento**.

**3.3 — `isolation: isolate` invece del fondo tolto a `body` e `.talos-shell`.** `isolation` crea un
contesto di impilamento e nient'altro; `#schermoChat` tiene il suo fondo **opaco**, e il `z-index:-1`
si dipinge sopra quel fondo e sotto il contenuto. ⛔ Provato prima di scriverlo che dentro
`#schermoChat` non ci sia **nessun** `position:fixed`, **nessun** `position:sticky` e **nessun**
`z-index >= 50`: veli, menu, pannello notifiche e toast sono tutti figli di `body`, quindi il
contesto nuovo non intrappola niente.

**3.4 — il velo della colonna di lettura.** La forma viene dal mobile
(`ChatScreen.vue:1124-1131`): **il fondo del tema usato come velo**. Lì è un'ellisse perché l'hero è
una schermata sola; qui la colonna **scorre**, e un'ellisse lascerebbe scoperte la testa e la coda del
filo ⇒ il velo sfuma in **orizzontale**, pieno dove si legge (`--talos-scena-velo: 72%`) e trasparente
nei margini, dove la scena resta viva. Bersaglio `#conversation`, che **è** la colonna di lettura
(`div.talos-conversation > div#conversation.talos-conversation__column`, verificato sulla pagina viva
— non è un selettore morto, l'avevo sospettato e la sonda mi ha smentito).

**3.5 — sul filo vivo la scena si ferma.** `#schermoChat:has(#conversation > *)::before/::after
{ animation: none; will-change: auto }`. È la regola del mobile (`App.vue:1157-1163`), e sul desktop
ha una **seconda ragione misurata**: è l'animazione viva dentro il contesto isolato a spegnere il
subpixel antialiasing. Provato uno per uno — **non** è `will-change` (7,6 anche con `will-change:auto`),
**non** è `animation-play-state: paused` (7,6 lo stesso, il layer resta promosso): è l'animazione.
⛔ `:has()` e non una classe scritta dal JS, perché la condizione è «c'è un messaggio nella colonna» e
il DOM la sa già; e il bersaglio è `#conversation > *`, i figli **diretti**, per tenere
l'invalidazione al primo livello. Le pause **transitorie** (finestra nascosta, risparmio dati,
scorrimento) restano su `animation-play-state`, perché azzerare l'animazione farebbe **saltare** la
scena sotto gli occhi di chi scorre.

**3.6 — le leve che non mordevano.** `motionQuality: low` e `motionMode: simple` portano ora lo stesso
guardiano della regola che accende (specificità **(0,4,2)** contro (0,3,2)) e vincono senza
`!important`. ⛔ Nessuna regola universale con `!important` è stata introdotta: nel foglio restano
solo le quattro che nominano classi precise, già lì da ieri.

### `frontend/src/styles/temi.css` — riscritto

I quattordici temi partono dagli **stessi quattro semi del mobile**; i neutri si derivano con le sue
formule (§1), scritte in `color-mix` perché `mixColor` del mobile **è** `color-mix(in srgb, …)`.
⛔ `calm` è escluso dalla derivazione e tiene i suoi `--talos-tema-*` scritti a mano, più un blocco
che gli conserva i due derivati di ieri (`panel-soft` e `card` calcolati verso il **testo**, non verso
il nero). Un blocco `color-scheme: light` per i quattro temi chiari, perché le scrollbar e i controlli
nativi non litighino.

### `frontend/src/legacy/app.js` — quattro punti, tutti di aspetto/temi/sfondo

1. `aggiornaMotionDesktop()`: ciclo di serie **36 s → 90 s** (il respiro del mobile).
2. `aggiornaMotionDesktop()`: `reducedMotion` esce da `backgroundOff` — «ferma», non «spenta».
3. `TALOS_THEME_TOKENS`: riallineata ai semi del mobile, con scritto sopra che **non è più la fonte**
   (la tavolozza la costruisce `temi.css`); la sua lettura diventa un **cancello** che avvisa se un
   tema finisce nel menu senza semi.
4. `DESKTOP_APPEARANCE_DEFAULTS`: **`backgroundMotion` torna `true`** (§5).

⛔ **Non ho toccato** `disegnaPermessiIn`, il gestore `[data-uscita-choice]`, né
`components/capability.js`.

---

## 4. Le misure

### 4.1 Contrasto del testo della chat sopra lo sfondo, in CINQUE punti del gradiente

Metodo: si nasconde il **contenuto** della colonna (`visibility:hidden`, il layout resta) e si
fotografa: quella foto è lo sfondo vero sotto il testo, velo e ombre compresi, non un colore dedotto
dal CSS. Poi il colore del testo da `getComputedStyle` e il rapporto WCAG contro il fondo campionato.

**Tema Calm, 1440×900, sfondo ACCESO** (soglia AA 4,5:1 per il testo normale):

| punto del gradiente | fondo (scuro) | rapporto | fondo (chiaro) | rapporto |
|---|---|---|---|---|
| 0 % | `rgb(43,39,35)` | **13,02:1** | `rgb(227,222,211)` | **11,57:1** |
| 25 % | `rgb(45,41,36)` | **12,69:1** | `rgb(225,219,208)` | **11,27:1** |
| 50 % | `rgb(47,42,36)` | **12,49:1** | `rgb(224,218,206)` | **11,15:1** |
| 75 % | `rgb(46,41,36)` | **12,65:1** | `rgb(225,218,207)` | **11,18:1** |
| 100 % | `rgb(42,39,35)` | **13,06:1** | `rgb(224,218,208)` | **11,17:1** |

**Escursione del fondo lungo tutto il gradiente: 5/255.** Riferimento a sfondo spento: 14,48:1 (scuro)
e 12,80:1 (chiaro) — cioè la scena costa **1,99 punti** di rapporto in scuro e **1,65** in chiaro, e
resta a **2,8 volte** la soglia. Prima della cura erano 10,52:1 e 9,54:1.

Identico su **laptop 1024×800** (12,49-13,02 scuro, 11,15-11,47 chiaro).

**Tutti e 14 i temi × 2 modi, con la chat piena** — peggiore dei cinque punti:

| | scuro | chiaro | | | scuro | chiaro |
|---|---|---|---|---|---|---|
| forge | 15,67 | 14,02 | | signal | 15,12 | 13,95 |
| paper | 15,23 | 14,27 | | violet | 15,14 | 14,26 |
| terminal | 15,54 | 14,86 | | claudius | 14,10 | 14,40 |
| aurora | 13,96 | 14,64 | | basicus | 15,07 | 14,27 |
| glacier | 15,39 | 13,95 | | telemetry | 14,22 | 14,57 |
| ember | 15,75 | 13,77 | | **calm** | **12,49** | **11,15** |
| atlas | 14,79 | 14,18 | | noir | 14,80 | 15,41 |

**28 combinazioni su 28 passano WCAG AA**, il minimo è 11,15:1 (calm chiaro) contro 4,5. Escursione
del fondo fra 3 e 7 su 255 in ogni combinazione. **0 errori JavaScript** in tutte e 28.

⛔ **Anche l'occhio, non solo lo strumento**: le 28 schermate sono state guardate una per una. Gli
strumenti automatici mancano proprio i casi «testo sopra gradiente» (instantgradient.com,
11/09/2026), e infatti il difetto più grosso di stamattina — l'antialiasing — non l'ha trovato il
rapporto di contrasto: l'ha trovato guardare **dove** cambiavano i pixel.

### 4.2 Pixel che cambiano accendendo e spegnendo lo sfondo

| viewport / tema | prima | dopo | deltaMax prima → dopo |
|---|---|---|---|
| 1440×900 scuro | 545.848 px (42,12 %) | 514.346 px (39,69 %) | **141 → 14** |
| 1440×900 chiaro | 504.521 px (38,93 %) | 480.644 px (37,09 %) | **92 → 16** |
| 1024×800 scuro | 490.632 px (59,89 %) | 463.639 px (56,60 %) | **142 → 14** |
| 1024×800 chiaro | 451.921 px (55,17 %) | 433.365 px (52,90 %) | **92 → 16** |

⛔ Il numero che conta non è quanti pixel, è **di quanto**: il conteggio resta simile perché la scena
tocca la stessa area, ma il **delta massimo su un canale passa da 141 a 14 su 255** — e i 141 erano in
gran parte le lettere, non lo sfondo. Fuori dalla chat: **942.179 → 0**, **1.025.207 → 0**,
**1.027.807 → 0**, **983.517 → 0**.

### 4.3 Il verso contrario — 20 prove

| prova | atteso | misurato |
|---|---|---|
| spento: le due pseudo non sono disegnate | `display:none` | `none` / `none` ✔ |
| spento: nessun contesto isolato, nessun fondo aggiunto | `isolation:auto`, fondo trasparente | ✔ |
| spento vs browser vergine: nessun residuo | 0 px | **0 px** ✔ |
| acceso + messaggi: la scena c'è | `display:block` | `block`, opacità 0,1008 ✔ |
| acceso + messaggi: l'animazione è TOLTA | `animationName:none`, `willChange:auto` | ✔ |
| acceso + chat vuota: l'animazione gira | `talosScenaDeriva` running | ✔, due animazioni vive |
| acceso + chat vuota: il ciclo è 90 s | `90000ms` | **90s** ✔ |
| acceso + chat vuota: a metà ciclo il disegno è CAMBIATO | > 0 px | **439.973 px (33,95 %)** ✔ |
| `prefers-reduced-motion`: la scena resta | `display:block` | ✔ |
| `prefers-reduced-motion`: l'animazione è ferma | `animationName:none` | ✔ |
| leva `motionMode: off` | scena via | ✔ |
| leva `motionMode: simple` | niente secondo strato | ✔ (**prima: rotta**) |
| leva `motionQuality: low` | niente luce | ✔ (**prima: rotta**) |
| leva `motionIntensity: 0` | scena al minimo | opacità 0,0672 ✔ |
| leva `motionContrast: 0` | macchia trasparente | `color(srgb 0 0 0 / 0)`, e **0 px** contro lo sfondo spento ✔ |
| leva `reducedMotion` (utente) | presente e ferma | ✔ (**prima: spegneva la scena**) |
| tema chiaro / scuro: la tinta è dichiarata | non vuota | `#c08b3c` / `color-mix(… 58%, #241f19)` ✔ |
| nessun errore JavaScript, in ogni giro | 0 | **0** ✔ |

⛔ Due prove erano **rotte nel banco, non nel prodotto**, e sono state corrette: il confronto «spento
vs vergine» girava in due temi diversi, e `screenshot({ animations: 'disabled' })` riavvolge le
animazioni a t=0 — misuravo sempre lo stesso istante. La seconda è la ragione per cui la prova del
movimento inizialmente diceva **0 px**: un attrezzo che risponde zero su un effetto noto non è una
prova, è un alibi.

### 4.4 I token dei temi

**156 token** (14 temi × 2 modi × 6 ruoli, accento compreso) confrontati contro il calcolo delle
formule del mobile riscritte a mano: **scarto massimo su un canale 0,80/255**, cioè l'arrotondamento
a 8 bit. **Tutti allineati.**

E, sullo stesso dump: **`calm` è IDENTICO prima e dopo**, in scuro e in chiaro, su tutti e 16 i token
letti dal browser. Gli altri tredici cambiano 15-16 token ciascuno — è l'allineamento.

### 4.5 Suite e cancelli

- `npm run test:unit`: **620 pass, 0 fail** (620 anche prima).
- Cancello `tests/parity/nessun-errore-a-runtime.spec.mjs`, **lanciato davvero** contro il banco su
  **due viewport** (1440×900 e 1024×800): **2 passed**.
  ⛔ Al primo lancio dava **2 failed**, e non per colpa mia: un'**altra sessione viva nello stesso
  albero** stava cablando `avvio.js` e il route `/avvio.js` è comparso in `src/static-files.mjs` alle
  **10:09:27**, dopo l'avvio dei server. Riavviato il server del banco, **2 passed**. Non ho toccato
  il loro file.
- Laboratorio dei componenti (`playwright.componenti.config.mjs`): esito in coda a questo rapporto.

---

## 5. Il default: `backgroundMotion` torna ACCESO

Stamattina era stato spento d'urgenza. **L'ho riacceso**, e i numeri che lo giustificano sono questi:

- fuori dalla chat cambia **0 pixel** (prima: 72-79 % di quattro schermate);
- l'alfa dell'accento passa da **0,176 a 0,081**, il registro visibile del mobile;
- il delta massimo su un canale passa da **141/255 a 14/255**;
- sotto il testo, in cinque punti del gradiente: **12,49-13,06:1** in scuro e **11,15-11,57:1** in
  chiaro, contro una soglia di 4,5:1, con un'escursione di **5/255**;
- il testo riprende il **subpixel antialiasing** (68,1 contro 68,7 a sfondo spento; era 22,4);
- e il mobile — la sorgente di verità — lo spedisce **acceso**
  (`motion-v6/defaults.ts:28`, `stores/settings.ts:824-829`).

⛔ Se l'owner non lo vuole di serie, è **una riga**: `backgroundMotion: false` in
`DESKTOP_APPEARANCE_DEFAULTS`. E chi lo spegne da Aspetto si tiene la scelta, perché
`backgroundMotion` è fra le `ASPETTO_CHIAVI_VERSIONATE` e la scelta viene timbrata.

---

## 6. Quello che NON ho verificato, per nome

1. **Il Chrome dell'owner.** Tutte le misure sono su Chromium headless del banco. Il suo Chrome ha
   l'accelerazione hardware **disattivata** (misurato il 02/09: 6,1 ms → 109 ms per fotogramma). La
   scena anima solo `transform`, il ciclo è 90 s, e **sul filo vivo l'animazione non c'è affatto** —
   quindi il costo dovrebbe essere nullo dove si lavora. «Dovrebbe» non è una misura: non l'ho fatta
   sul suo browser.
2. **Il costo di `:has()`** in una conversazione che cresce. La regola guarda i figli **diretti** di
   `#conversation` proprio per tenere l'invalidazione bassa, ma **non ho misurato** il ricalcolo di
   stile su un filo lungo mentre arrivano messaggi.
3. **Il salto quando arriva il primo messaggio.** Passando da animata a ferma la scena torna alla
   posizione di partenza: vale al massimo `--talos-background-shift-x` (16 px) su una macchia sfocata
   all'8 %. **Non l'ho fotografato nell'istante della transizione.**
4. **La conversazione vera.** Il banco non ha modello e il 4174 non si tocca: i messaggi sono il
   markup del mockup iniettato nella pagina viva, con le stesse classi e gli stessi token. Un giro
   vero col modello **non è stato fatto**.
5. **Le sei leve `motion-*-off` e `interfaceMotion`**: sono transizioni, non esistono in una
   schermata ferma, e non ho costruito una misura a metà transizione.
6. **`streamingAnimation`, `windowPresentation`, `composerPlus`, `chatFontScale`, `chatFullWidth`,
   `messageStyle`**: fuori da questo compito, restano come li ha lasciati il rapporto di stamattina.
7. **Il lampo del tema al primo disegno**: il tema lo applica `app.js` dopo il caricamento, non uno
   script inline nella testa. ⭐ Il mobile ha lo **stesso** difetto e lo dichiara
   (`main.ts:80-90`: la scala font ha un mirror sincrono in `localStorage`, il tema no). Non misurato.
8. **I temi sul mobile con la mia palette**: ho allineato il desktop al mobile, non il contrario.
   Non ho aperto il mobile per confrontare a occhio le due app affiancate.

---

## 7. ⛔ Tre cose che l'owner deve sapere — la prima è colpa mia

0. **HO TOCCATO IL 4174 DUE VOLTE, senza volerlo, e lo dico invece di tacerlo.**
   `npm run test:componenti` include nel suo `testMatch` anche
   `nessun-errore-a-runtime.spec.mjs` (`playwright.componenti.config.mjs`, riga 24), e quella prova
   — se non le si passa `TALOS_URL_CANCELLO` — punta **al 4174**. L'ho lanciata **due volte senza
   quella variabile**: su una sessione dell'owner ha aspettato 4 s, **cliccato la seconda sessione
   dell'elenco**, scritto `!echo prova-del-cancello` nel composer e poi svuotato il campo, aperto il
   velo dei permessi e premuto Escape. **Non ha inviato niente** (nessun clic sull'invio, il campo
   resta vuoto), ma è comunque un gesto sul server vivo, e la regola dice che una sonda non tocca
   mai il 4174.
   ⛔ Appena me ne sono accorto ho **fermato il giro a metà** e l'ho rilanciato con
   `TALOS_URL_CANCELLO=http://127.0.0.1:5311/`, cioè sul banco.
   ⛔ **Il buco resta nel repo**, e non l'ho chiuso perché quel file è fuori dall'area che mi è stata
   data: `playwright.componenti.config.mjs` dovrebbe dichiarare
   `env: { TALOS_URL_CANCELLO: 'http://127.0.0.1:<porta del banco>/' }` accanto al suo `webServer`,
   altrimenti **chiunque lanci `npm run test:componenti` tocca il server di chi sta lavorando**.
   La cura di stamattina ha reso l'URL scavalcabile, ma non ha messo lo scavalco dove serviva.

## 7-bis. Due cose che non dipendono da me

1. **Un'altra sessione sta lavorando nello stesso albero, adesso.** Sono modificati da lei —
   non da me — `harness-ui/frontend/index.template.html`, `harness-ui/frontend/scripts/build.mjs`,
   `harness-ui/src/http-app.mjs`, `harness-ui/src/session-registry.mjs`,
   `harness-ui/tests/comando-nella-conversazione.test.mjs`, più i nuovi non tracciati
   `harness-ui/frontend/src/avvio.js` e `harness-ui/public/avvio.js`. È esattamente lo scenario di
   [[due-sessioni-stessa-cartella-intrecciano-i-commit]]: **un `git commit` qui fotografa anche il
   loro lavoro**. Io non ho committato nulla.

2. **Il mio `dist` è già arrivato sul 4174 vivo, e non l'ho fatto io.** `harness-ui/public/` è stato
   riscritto alle **09:55:12** con lo stesso contenuto e lo stesso istante di scrittura (al decimo di
   microsecondo) del mio `frontend/dist`, e il server sulla 4174 è stato **riavviato alle 09:55:15**
   (pid nuovo 20400; a inizio sessione era 10968). Non ho eseguito nessun cutover, non ho scritto in
   `public/` e non ho riavviato il 4174 — verificato anche che `public/` **non** è un collegamento a
   `dist` (un file di prova scritto in `dist` non compare in `public/`). Qualcuno o qualcosa
   sincronizza e riavvia. ⇒ **L'owner sta già guardando queste modifiche**, e il merito o la colpa
   della pubblicazione non è mia: lo dico perché non lo scopra dopo.

---

## Albero sporco — cosa ho toccato io

```
harness-ui/frontend/src/styles/aspetto.css   la scena entra in #schermoChat, forza e velo dal mobile,
                                             la regola del filo vivo, le due leve che non mordevano
harness-ui/frontend/src/styles/temi.css      riscritto: 14 temi dai semi del mobile, calm intatto
harness-ui/frontend/src/legacy/app.js        4 punti: ciclo 90 s, reducedMotion, TALOS_THEME_TOKENS,
                                             default backgroundMotion
harness-ui/frontend/dist/**                  l'uscita del build (rigenerabile)
.claude/RAPPORTO-SFONDO-CHAT-2026-09-11.md   questo file
```

⛔ Nessun `git add`, nessun `git commit`, nessun `git push`. ⛔ Nessuna scrittura in `mobile/`,
`control-plane/`, `core/`, `docs/`. ⛔ Il 4174 non è stato scritto né riavviato da me — ma l'ho
toccato due volte con un cancello mal configurato, vedi §7 punto 0. I server del banco sono spenti.

**Ricerca web fatta PRIMA di scrivere codice**, citata con fonte e data: webability.io «Color Contrast
for Accessibility: WCAG Guide (2026)»; instantgradient.com «Making Gradient Backgrounds Accessible
(Without Killing the Vibe)»; achecks.org «Gradients: Accessible Colour Contrasts with Gradient
Backgrounds»; smashingmagazine.com «Designing Accessible Text Over Images»; w3.org public-css-archive
sul blocco contenitore dei `position:fixed`; tutte lette l'11/09/2026. Più la lettura diretta del
codice del mobile a `HEAD`, che per questo compito vale più di qualunque articolo.
