# RAPPORTO — spazi e superfici che scorrono (CSS), 11/09/2026

> Lane `lane/harness-desktop`, cartella `harness-ui/frontend/`. Toccati **solo** due fogli di
> `src/styles/`: `index.css` e `foglio-monolite.css`. Nessun `.js`, nessun `index.template.html`,
> nessun file in `harness-ui/src/`. Niente `git add`/`commit`/`push`.
>
> ⛔ **Mai la 4174.** Tutte le misure e tutte le foto vengono da un banco mio: `node scripts/build.mjs`
> e `node ../server.mjs` su **127.0.0.1:4193**, store sessioni in una cartella temporanea vuota
> (`TALOS_HARNESS_UI_SESSIONS_DIR`), spento alla fine. I cancelli sono girati su **4198/4199**.
>
> Le foto stanno in `.claude/prove-css-2026-09-11/` — **24 file**, **tema chiaro e tema scuro**,
> **1440×900 e 1024×800**, e sono state **guardate una per una** (le note dell'ispettore sono in §6).

---

## Ricerca fatta PRIMA di scrivere (fonte + data)

| Cosa mi serviva sapere | Fonte | Letta |
|---|---|---|
| Perché un elemento flex non lascia scorrere il figlio senza `min-height:0` — «automatic minimum size» | W3C css-flexbox §4.5; `philipwalton/flexbugs#241`; bigbinary «Understanding the automatic minimum size of flex items» | 11/09/2026 |
| Se e come si riserva lo spazio della barra di scorrimento in modo simmetrico | MDN «scrollbar-gutter» (`stable`, `stable both-edges`; con barre overlay la proprietà non ha effetto) | 11/09/2026 |
| Perché uno zero **senza unità** dentro `calc()` invalida tutto in silenzio | MDN «calc()»; makandra «Do not use unitless zeros in CSS calc functions» | 11/09/2026 |
| Quale soglia di contrasto vale per il testo di un bottone, e come si misura sui pixel invece che sul computed style | W3C WCAG 2.2 «SC 1.4.3 Contrast (Minimum)», 4,5:1 per il testo normale e 3:1 per quello grande; formula del rapporto di contrasto e della luminanza relativa dalle «WCAG definitions» | 11/09/2026 |

⇒ La terza ricerca ha cambiato il codice: l'annullamento dell'ingombro della barra sotto i 1040 px
è scritto `0px` e non `0`. Con `0` il `calc()` che lo contiene sarebbe diventato invalido **senza un
errore**, e il respiro sinistro sarebbe tornato quello del browser.

---

## 1. DIFETTO 1 (BC-10) — a tutta larghezza la chat sfiorava la barra di navigazione

### Misura PRIMA (pixel, non DOM)

Pagina costruita e servita, markup dimostrativo (conversazione vera, barra di cronologia visibile),
`:root.chat-full-width` acceso. «sinistra» = dal bordo **destro della barra** alla prima lettera;
«destra» = dall'ultima lettera al bordo interno dello scorrevole.

| Viewport / colonna dettagli | sinistra | destra | colonna | composer vs testo |
|---|---|---|---|---|
| 1920×1080, dettagli aperti | **−8 px** | 44 px | 1216 px | 0 |
| 1920×1080, dettagli chiusi | **−8 px** | 44 px | 1556 px | 0 |
| 1440×900, dettagli chiusi | **−8 px** | 44 px | 1076 px | 0 |
| 1440×900, dettagli aperti | **−8 px** | 44 px | 736 px | 0 |
| 1024×800 (barra assente) | **0 px** | 44 px | 704 px | **44 px** |

**−8 px** vuol dire che il testo non sfiorava la barra: le entrava dentro di 8 px. E a 1024 è saltato
fuori un secondo difetto che nessuno aveva chiesto: il **composer partiva 44 px più a destra del
testo** — lo stesso disallineamento che l'owner aveva fatto correggere il 07/9 a 1920.

### Causa (file:riga)

- `harness-ui/frontend/src/styles/index.css:534` — `.talos-cronologia{position:absolute; left:16px; … width:36px}`: la barra occupa da 16 a **52 px** dal bordo dell'area.
- `harness-ui/frontend/src/styles/index.css:576` — `.talos-conversation{… padding:8px 44px 12px}`: il testo comincia a **44 px**. 44 < 52 ⇒ **8 px di sovrapposizione**, mentre a destra i 44 px sono tutti liberi.
- `harness-ui/frontend/src/styles/index.css:735` (prima della cura) — `:root.chat-full-width .talos-conversation__column{max-width:none}`: a tutta larghezza sparisce il tetto della colonna, e quella sovrapposizione — che a colonna centrata era mascherata dal vuoto ai lati — diventa il bordo del testo.
- `harness-ui/frontend/src/styles/index.css:577` (prima della cura) — `@media (max-width:1040px){ .talos-conversation{padding-left:0} }`: sotto i 1040 la barra non c'è e il respiro sinistro veniva **azzerato** invece di restare uguale a quello destro; il piede (`.talos-chat-foot`, padding 44) non seguiva ⇒ i 44 px di scarto del composer.

### Cura

Nessuna costante scritta a mano: **le due misure della barra sono diventate token**, e le leggono sia
la barra sia la conversazione sia il piede.

- `index.css:111-114` — `--talos-cronologia-x:16px`, `--talos-cronologia-w:36px`, `--talos-cronologia-ingombro:calc(x + w)`, `--talos-chat-gutter:44px`.
- `index.css:550`, `:554` — la barra e le sue voci leggono `--talos-cronologia-x` / `--talos-cronologia-w` invece di 16 e 36 riscritti a mano.
- `index.css:587` — **nella stessa regola** che nasconde la barra sotto i 1040, l'ingombro va a `0px`.
- `index.css:592`, `:619` — conversazione e piede leggono `--talos-chat-gutter`; sparisce il `padding-left:0` sotto i 1040 (sostituito da un commento che spiega il perché e il costo).
- `index.css:772-773` — la cura vera:

```css
:root.chat-full-width{--talos-respiro-pieno:clamp(0px, calc((100% - var(--talos-cronologia-ingombro)
  - min(calc(92px + var(--talos-measure-w)), calc(100% - 2 * var(--talos-chat-gutter)))) / 2),
  var(--talos-chat-gutter))}
:root.chat-full-width .talos-conversation, :root.chat-full-width .talos-chat-foot{
  padding-left:calc(var(--talos-cronologia-ingombro) + var(--talos-respiro-pieno));
  padding-right:var(--talos-respiro-pieno)}
```

⛔ **Perché non è un `padding-left:96px`.** A 1440 con la colonna dei dettagli aperta lo spazio utile
è 824 px e la colonna vale già 736, cioè il 100%: togliendole 96+44 sarebbe scesa a **684**, e
«tutta larghezza» sarebbe diventata **più stretta di «normale»**. È la regressione già curata il
06/9 e scritta in quel punto del foglio. Il respiro è quindi **quel che avanza** dopo aver garantito
alla colonna almeno la sua misura normale (`92px + --talos-measure-w`, la stessa della riga 591),
diviso in due parti uguali, col tetto a 44 e il pavimento a 0.

### Misura DOPO

| Viewport / colonna dettagli | sinistra | destra | colonna (prima → dopo) | composer vs testo |
|---|---|---|---|---|
| 1920×1080, dettagli aperti | **44** | **44** | 1216 → 1164 | 0 |
| 1920×1080, dettagli chiusi | **44** | **44** | 1556 → 1504 | 0 |
| 1440×900, dettagli chiusi | **44** | **44** | 1076 → 1024 | 0 |
| 1440×900, dettagli aperti | **18** | **18** | 736 → **736** (invariata) | 0 |
| 1024×800 (barra assente) | **44** | **44** | 704 → 660 | **44 → 0** |

La colonna «normale» resta 860 px ovunque: a tutta larghezza non è mai più stretta di prima.

### Prove AL VERSO CONTRARIO

| Prova | Esito | Numero |
|---|---|---|
| 1a · fuori da «tutta larghezza» il respiro resta 44/44 | VERDE | `44px/44px` |
| 1b · dentro, il sinistro vale ingombro+respiro | VERDE | `96px/44px` |
| 1c · l'ingombro è **letto davvero**: forzato 52→152 px, la colonna si sposta di 100 px | VERDE | x 372 → 472 |
| 1d · con ingombro `0px` (come sotto i 1040) i due lati tornano uguali | VERDE | `44px/44px` |
| 1e · «tutta larghezza» non è mai più stretta di «normale» | VERDE | normale 736 = pieno 736 |

### Foto

`d1-1440x900-{chiaro,scuro}-{prima,dopo}.png` · `d1-1024x800-{chiaro,scuro}-{prima,dopo}.png`.
Le «prima» sono ricostruite rimettendo a mano il CSS di ieri sulla stessa pagina, così il confronto
è a parità di tutto il resto.

---

## 2. DIFETTO 2 — sotto i 1240 px la colonna dei dettagli non si apriva

### Misura PRIMA (app viva, non pagina statica)

Clic sul pulsante Dettagli, build servita sulla 4193, store vuoto:

| Viewport | Cosa scrive il JavaScript | `display` del pannello | Cosa vede la persona |
|---|---|---|---|
| 1024×800 | `open` sull'`<aside>` + `show` sul velo | **`none`** | la app si **sfoca** e non si apre niente |
| 1100×800 | `inspector-collapsed` sulla shell | **`none`** | **niente**, e resta salvato `inspectorCollapsed:true` |
| 1440×900 | `inspector-collapsed` sulla shell | flex → none | corretto (chiude una colonna aperta) |

### Causa (file:riga)

`index.css:1846-1849` (prima della cura) agganciava le quattro regole a **`.talos-shell.details-open`**.
`details-open` **non la scrive nessuna riga di JavaScript**: cercata in tutto il repo, compariva solo
in quelle quattro righe di CSS. Quello che il JavaScript scrive è `open` sul pannello
(`src/legacy/app.js:1527`, dentro `openPanel()`), più `show` su `#overlayBackdrop`.

### Cura

`index.css:1907-1929` — le quattro regole si agganciano a `:root:not([data-vista="pagina"]) .talos-inspector.open`.
Le tre di contorno (pulsante di chiusura, testata, maniglia di ridimensionamento) erano già
**discendenti** dell'`<aside>`: cambia solo l'ancora, non la struttura. Il `:not([data-vista="pagina"])`
serve perché nella vista «pagina» la colonna è tolta di proposito da una regola di specificità 0-2-1,
che senza quel `:not` verrebbe scavalcata.

**In più — il velo era invisibile.** `foglio-monolite.css:199`: `background: var(--scrim)` senza
ripiego, e `--scrim` è dichiarato **solo** dentro il blocco di token dei dialoghi
(`dialog.sheet-dialog, dialog.command-dialog, .ft-actions-menu, .talos-dialog`), di cui questo velo
non è discendente. Misurato: `backgroundColor` = `rgba(0,0,0,0)` con `opacity:1` e
`visibility:visible` — cioè un rettangolo a tutto schermo che sfocava di 2 px e mangiava i clic
**senza dire perché**. Ripiego messo con lo **stesso valore del token**: `var(--scrim, rgba(0,0,0,.54))`.

### Misura DOPO

1024×800: il pannello si apre come strato sopra la app — `x=684`, **340×800**, velo
`rgba(0, 0, 0, 0.54)`. 1440×900 e 1100×800 invariati.

### Prove AL VERSO CONTRARIO

| Prova | Esito | Numero |
|---|---|---|
| 2a · senza `open` il pannello resta chiuso a 1024 | VERDE | `display:none` |
| 2b · il pulsante **X** richiude | **ROSSO** | resta `flex`, la classe `open` non viene tolta |
| 2c · nella vista «pagina» resta chiuso **anche con `open`** | VERDE | `display:none` |
| 2d · il velo richiude | VERDE | flex → none |
| 2e · `Esc` richiude | VERDE | flex → none |

### ⛔ Quello che resta e vuole JavaScript (non l'ho toccato)

1. **La fascia 1041-1240 px.** Il JavaScript sceglie il ramo con `window.innerWidth > 1040`
   (`src/legacy/app.js:1481`, `:1521`, `:18599`, `:18796`) mentre il CSS taglia la colonna a
   **1240** (`src/styles/index.css:1559`). Fra 1041 e 1240 il pulsante scrive `inspector-collapsed`
   su una colonna già invisibile e **salva quello stato nelle preferenze**, così alla prossima
   apertura a 1440 la colonna parte chiusa. ⇒ **Le quattro soglie `1040` vanno portate a `1240`.**
   Il CSS da solo non può farlo: l'assenza di `inspector-collapsed` è anche lo stato di partenza,
   quindi una regola che reagisse a quella aprirebbe il pannello **da sola** al primo caricamento.
2. **Il pulsante X è morto.** `#chiudiDettagli` esiste solo in `index.template.html:1025` e non ha
   **nessun** ascoltatore in tutto il repo (cercato). Cura: aggiungere `data-close-panel` a quel
   bottone (`$$('[data-close-panel]')` è già cablato a `closePanels`, `src/legacy/app.js:17773`).
   Non è una trappola — velo ed `Esc` chiudono — ma un pulsante di chiusura che non chiude è
   peggio di un pulsante assente.

---

## 3. DIFETTO 3 — la spazzata delle superfici che scorrono

**Lo stato: la conversazione della figlia era già curata da un altro agente mentre lavoravo, e
l'ho verificata invece di rifarla.** Quando sono arrivato a `.talos-figlia__corpo` la riga era già
diventata `flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain`, con
`.talos-figlia-ospite` e `.talos-figlia` nuove (`index.css:1275-1283`) e la classe `talos-figlia-ospite`
già messa dal componente (`src/components/conversazione-figlia.js:558`). ⛔ Ho **tolto** la mia cura
prima di scriverla: due agenti sulla stessa regola è esattamente il danno che la memoria registra
(l'ultimo che salva vince, in silenzio). Vedi §7.

### Verifica della cura altrui (la parte che mi spettava)

Riprodotto sul banco ciò che fa il codice vero (`src/legacy/app.js:8385-8390` +
`conversazione-figlia.js:558`), con 60 giri dentro, sulla **scheda Agenti** aperta:

| Viewport / tema | contenuto | finestra | `scrollTop` massimo | sfora dallo schermo |
|---|---|---|---|---|
| 1440×900 chiaro/scuro | 2840 px | 718 px | **2122** | sotto 0 px, a destra 0 px |
| 1024×800 chiaro/scuro | 2840 px | 618 px | **2222** | sotto 0 px, a destra 0 px |

`scrollTop` massimo = contenuto − finestra in tutti e quattro i casi: **scorre davvero**, e il
pannello non sfonda né in basso né a destra. Foto `d3-figlia-*.png`, scattate a metà scorrimento
così si vede che il contenuto è passato sotto la testata.

### La spazzata degli `overflow`

Cercati tutti gli `overflow:hidden` di `index.css` su contenitori di conversazione, pannelli, schermi,
messaggi, attività e terminale: **nessuno è su una superficie che dovrebbe scorrere**. Sono tutti
legittimi — troncamento con i puntini (`__titolo`, `__name`, le schede del terminale), angoli
arrotondati da tagliare (`.talos-activity`, `.talos-approval`, `.talos-dialog`, `.talos-contesto`),
e il `body` che non deve scorrere perché scorrono i suoi riquadri.
Gli scorrevoli veri hanno già la coppia giusta `overflow:auto` + `min-height:0`:
`.talos-conversation` (`:592`), `.talos-inspector__body` (`:1203`), `.talos-cronologia__lista` (`:536`),
`.talos-tool-row__body` (`:712`), `.talos-figlia__corpo` (`:1283`).
⇒ **Nessuna cura da fare qui, e nessuna fatta.**

---

## 4. DIFETTO 4 — il testo di OGNI `.primary-btn` era quasi invisibile, nei due temi

Segnalato e misurato da un'altra corsia (`.claude/RAPPORTO-SELETTORE-E-MODALE-2026-09-11.md` §4.1),
che non poteva toccare `src/styles/**`. **L'ho rimisurato da zero prima di crederci**, e i numeri
coincidono al centesimo.

### Misura PRIMA — sui pixel della foto, non sul computed style

Bottone «Continua nella chat — AVM-harness-desktop» della modale «Nuova sessione», app viva, 1440×900.
La sonda fotografa **il bottone**, rilegge la PNG dentro un canvas e fa l'istogramma della **fascia
centrale** (12-88% in larghezza, 30-70% in altezza): fuori da quella fascia gli angoli arrotondati
lasciano vedere il fondo del dialogo e la riga di luce `inset 0 1px` sta in cima — senza il ritaglio
il «colore più lontano dal fondo» è un **angolo**, non un glifo, e il contrasto esce sbagliato di 1,8
volte (3,47 invece di 1,67: ci sono cascato al primo giro).

| tema | testo (pixel) | fondo (pixel) | contrasto | computed `color` |
|---|---|---|---|---|
| chiaro | `rgb(112,72,20)` | `rgb(155,104,35)` | **1,67 : 1** | `rgb(112, 72, 20)` |
| scuro | `rgb(216,183,134)` | `rgb(192,139,60)` | **1,58 : 1** | `color(srgb 0.847 0.718 0.526)` |

WCAG 1.4.3 chiede **4,5:1**. Riguarda tutti i `.primary-btn` e tutti i `.badge-dot` dei dialoghi.

### Causa (file:riga)

`src/styles/foglio-monolite.css:34` — `--on-accent: var(--talos-accent-text, #151411)`, usato da
`:63` (`.primary-btn`) e `:55` (`.badge-dot`). **`--talos-accent-text` è il token del testo *color*
accento** — quello che si scrive dentro un fondo `accent-soft` — non la tinta da mettere **sopra un
pieno di accento**. Sono due mestieri diversi con un nome simile: nel tema chiaro vale `#704814`
(un marrone), nello scuro `#f0c783` (un beige), e in tutti e due i casi finisce su un fondo che ha
quasi la stessa luminanza.

### Cura — con i token che ci sono già, nessun colore scritto a mano

`foglio-monolite.css:34` → `--on-accent: var(--talos-text-on-accent, #151411)`.
**`--talos-text-on-accent` esiste già ed è esattamente questo mestiere**: è il token che il sistema
di design usa per `.talos-button--primary` (`index.css:256`), per il pulsante d'invio della chat
(`:1226`) e per la spunta della casella (`:335`). È dichiarato in tutti i temi —
`index.css:80` (scuro `#151411`), `:127` (chiaro `#ffffff`), `tokens.css:71`/`:107`,
`temi.css:151`/`:225` per i temi generati, e `tokens.css:156` lo mappa su `HighlightText` nei
**colori forzati** di Windows, dove il vecchio token non aveva risposta.
⛔ Una riga sola, e cambia in tutta la app.

### Misura DOPO

| tema | testo | fondo | contrasto | verdetto WCAG 1.4.3 |
|---|---|---|---|---|
| chiaro | `rgb(255,255,255)` | `rgb(155,104,35)` | **4,77 : 1** | passa (AA) |
| scuro | `rgb(23,24,27)` | `rgb(192,139,60)` | **5,92 : 1** | passa (AA) |

Foto: `d4-primary-btn-1440x900-{chiaro,scuro}-{prima,dopo}.png` e il dettaglio ritagliato del bottone
`d4-primary-btn-dettaglio-*`. Il confronto fra i due dettagli è la prova che si vede a occhio.

### In più — la didascalia che spiega il blocco (§4.2 del rapporto altrui)

`.workspace-chooser-help` e `.workspace-chooser-policy-gate` scrivono a 9 px in `--muted`:
**4,21:1 nel tema chiaro**, sotto la soglia. L'altra corsia aveva messo `--text-2` **in linea** su
due sole righe, dichiarando il debito. Portato nel foglio su **tutte** le istanze
(`foglio-monolite.css:449`, `:463`): `--muted` → `--text-2`, cioè **9,23:1 nel chiaro e 12,82:1
nello scuro**, misurati. È un token del tema, non un colore inventato.

### Le tre regole che stavano INLINE, portate nel foglio

Erano `element.style.*` in `src/legacy/app.js` **solo** per non mettere due mani sullo stesso file:

| Cosa | Dov'era | Dov'è adesso |
|---|---|---|
| `flex-wrap:wrap` + `flex-shrink:0` + `row-gap:2px` sulla striscia delle fonti | `app.js:5369-5371` | `foglio-monolite.css:478` (`.model-picker-sources`) |
| `flex:0 0 auto` sulle schede dei fornitori | `app.js:5454` | `foglio-monolite.css:479` (`.model-picker-source`) |
| `margin-top:0` sulla nota del piede | `app.js:15924` | `foglio-monolite.css:448` (`.workspace-chooser-help.talos-grow`) |
| `color:var(--text-2)` sulla nota del piede e sul `policyGate` | `app.js:15937`, `:15888` | `foglio-monolite.css:449`, `:463` (vale ora per tutte le istanze) |

⛔ **Gli `element.style.*` in `app.js` li ho lasciati dov'erano**: quel file non è mio. Uno stile in
linea batte il foglio, quindi finché ci sono **vincono loro** e a schermo non cambia niente — nessun
rischio di regressione, ma nemmeno il debito è chiuso finché non li cancella chi ha `app.js`.
Per dimostrare che il foglio è pronto a prenderne il posto, la prova 4e qui sotto **toglie gli stili
in linea a runtime e rimisura**: la geometria non si muove di un pixel.

### Prove AL VERSO CONTRARIO

| Prova | Esito | Numero |
|---|---|---|
| 4a · chiaro · il bottone primario passa 4,5:1 | VERDE | 1,67 → **4,77:1** |
| 4b · chiaro · la prova **morde**: rimesso `--talos-accent-text`, il contrasto ricade | VERDE | ricaduto a **1,67:1** |
| 4c · chiaro · il `.badge-dot` (stesso token) sopra 4,5:1 | VERDE | **4,77:1** |
| 4d · chiaro · `.workspace-chooser-help` a 9 px passa 4,5:1 | VERDE | `--muted` 4,21 → `--text-2` **9,23:1** |
| 4e · chiaro · tolti gli stili in linea, il foglio tiene la stessa geometria | VERDE | 5 schede · altezza 73 → 73 · scheda 123,8 → 123,8 |
| 4a · scuro · il bottone primario passa 4,5:1 | VERDE | 1,58 → **5,92:1** |
| 4b · scuro · la prova **morde** | VERDE | ricaduto a **1,58:1** |
| 4c · scuro · il `.badge-dot` | VERDE | **5,92:1** |
| 4d · scuro · `.workspace-chooser-help` | VERDE | 6,37 → **12,82:1** |
| 4e · scuro · geometria invariata senza gli stili in linea | VERDE | altezza 73 → 73 · scheda 123,8 → 123,8 |

---

## 5. Cancelli

| Cancello | Esito |
|---|---|
| `npm run test:unit` (prima delle cure 4) | **635 / 635 verdi**, 2,7 s |
| `npm run test:unit` (dopo tutte le cure) | **679 / 679 verdi**, 3,7 s — i 44 in più arrivano dalle altre corsie |
| `npm run test:unit` (dopo il refactor UI del coordinatore) | **696 / 696 verdi**, 2,1 s |
| `nessun-errore-a-runtime.spec.mjs` (rilanciato dopo il refactor, 4204/4205) | **3 / 3 verdi**, 32,1 s |
| `sfondo-animato-abolito.spec.mjs` (4198/4199) | **12 / 12 verdi** quando esisteva — girato due volte, prima e dopo la cura 4. ⛔ **Poi è stato rimosso**, vedi qui sotto |
| `nessun-errore-a-runtime.spec.mjs` (4198/4199) | **3 / 3 verdi**, 1,1 min — 1440, 1280 e 1024, nessun errore JavaScript ad aprire la app |
| `componenti.spec.mjs` (parità col mockup, 111 prove) | **ROSSO, e non per il CSS** — vedi qui sotto |

⛔ **Il cancello di parità dei componenti è rosso, e non l'ho fatto diventare rosso io.**
Lanciato tre volte (4196/4197, 4198/4199, 4200/4201): le prime 14 prove falliscono tutte, e cinque
di quelle vanno in **timeout da un minuto**, per questo la suite non finisce in dieci minuti.
Aperta una a fondo (`ProviderCard`, 1440×900) per non fermarmi al conteggio: l'asserzione che
cade è **`parole`** — al componente vero mancano tre bottoni che il mockup ha
(«Prova collegamento», «Salva collegamento», «Rimuovi chiave»). **È testo, e il CSS non può
aggiungere o togliere una parola.** In più `ProviderCard` è già nell'elenco dei **10 rossi
preesistenti** scritto stamattina in `.claude/RIPRESA-SESSIONE.md`, e i componenti che falliscono
sono gli stessi che altre corsie stanno riscrivendo adesso.
⛔ Quello che **non** ho fatto, e che sarebbe l'unica prova vera: un **A/B nello stesso momento**
contro il commit di partenza. Senza quello «era già rosso» resta un argomento, non una misura.
Le due prove che il mio lavoro tocca davvero — gli spazi e gli errori a runtime — sono verdi.

---

### ⛔ Il refactor UI arrivato a lavoro finito, e la riverifica

A cure chiuse il coordinatore ha applicato il pacchetto di refactor dell'owner sulla stessa
cartella: ha **tolto le due regole di abolizione dello sfondo** in fondo a `src/styles/aspetto.css`,
ha tolto `sfondo-animato-abolito.spec.mjs` dal `testMatch`, e ha aggiunto
`src/styles/desktop-final.css` (importato **in coda** a `main.css`) e `src/motion/`.
**Non ho ripristinato niente e non ho toccato nessuno di quei file** — `aspetto.css` risulta
modificato, ma non da me.

⛔ Un foglio importato **dopo** i miei può scavalcarli, e la scena di sfondo che torna a dipingere
cambia l'ambiente in cui avevo misurato: **ho rimisurato tutto invece di fidarmi**. Ricostruito,
riacceso il banco sulla 4193 e rigirato ogni cosa:

* **gli spazi**: dodici combinazioni viewport × colonna dettagli × modalità, **numeri identici**
  a quelli della tabella «Misura DOPO», pixel per pixel;
* **le prove al contrario**: 1a-1e e 2a-2c con lo stesso esito di prima (2b resta rossa, ed è il
  pulsante X che vuole JavaScript); 4a-4e tutte verdi con gli stessi contrasti;
* **sulla app VIVA, con la scena riaccesa** (non sulla pagina statica): a 1440 il respiro è
  `96px/44px` (52 d'ingombro + 44 di respiro), a 1024 `44px/44px` con l'ingombro a `0px`, e
  **zero errori JavaScript** nei due temi. La scena e le regole di `desktop-final.css` che
  nominano la conversazione lavorano su `position`/`z-index`/`background`: non spostano un pixel
  di padding;
* **tutte le 24 foto rifatte** sull'albero nuovo, nei due temi e nelle due viewport.

---

## 6. Taccuino dell'ispettore — cosa ho visto nelle foto oltre a ciò che cercavo

1. **Un buco nella conversazione a 1024×800** (`d1-1024x800-*`): fra la scheda «Nota» e la riga
   «Comando nel terminale» ci sono ~60 px vuoti dove a 1440 stanno la testata del secondo giro e la
   scheda «Chiede di scrivere». Strumentato: **nessun elemento è `display:none`** e il giro misura
   **1107 px a 1024 esattamente come a 1440**. ⇒ **Non è causato dalla mia cura** (identico nella
   foto «prima» e in quella «dopo»), e **non l'ho spiegato**. Sta nel markup dimostrativo, quindi
   potrebbe non esistere sulla app vera: da riprendere con una sessione con contenuto vero.
2. **Il suggerimento del pulsante Dettagli** (`d2-*`) copre la riga delle schede: è il puntatore
   rimasto sul bottone dopo il clic della sonda, non un difetto della app. Nelle foto `d3-*` l'ho
   tolto spostando il puntatore prima dello scatto.
3. In tema chiaro il velo a `.54` su una app chiara è **più scuro** che in tema scuro: è lo stesso
   valore che i dialoghi usano già, quindi coerente, ma se l'owner lo trova pesante il posto per
   cambiarlo è **uno solo** (`--scrim`, da dichiarare in `temi.css` — che oggi è di un altro agente).

---

## 7. Cosa NON ho verificato, e cosa ho lasciato agli altri

- **Barre di scorrimento classiche.** Tutte le mie misure hanno `offsetWidth − clientWidth = 0`, cioè
  barre **overlay**. Se il Chrome dell'owner usa quelle classiche, la barra ruba ~15 px al lato destro
  della conversazione e la simmetria misurata qui **non vale più** (destra 29 contro sinistra 44).
  Ho provato a riprodurre la condizione con `--disable-features=OverlayScrollbar,FluentOverlayScrollbar`
  e **non ha avuto effetto**: resta **NON VERIFICATO**. La cura sarebbe `scrollbar-gutter: stable both-edges`
  su `.talos-conversation` (MDN, 11/09/2026) — con barre overlay è inerte, quindi non costa niente
  dove non serve. **Non l'ho messa**: cambia il layout per una condizione che non ho potuto misurare,
  e va decisa guardando il Chrome vero dell'owner.
- **Nessun giro col modello.** Le conversazioni delle foto sono il markup dimostrativo del template e
  una fixture montata dalla sonda. La geometria è quella vera (CSS vero, build vera, server vero),
  il **contenuto** no.
- **1440×900 con la colonna dei dettagli APERTA, fuori da «tutta larghezza»**: lì la sovrapposizione
  di 8 px **resta**, perché la colonna vale già il 100% dello spazio e spostarla vorrebbe dire
  restringere il testo. Dichiarato, non curato.
- **La fascia 1041-1240 px del difetto 2** e **il pulsante X morto**: vogliono JavaScript, §2.
- **La parità col mockup** (`componenti.spec.mjs`): rossa, con l'argomento del §5 ma **senza un A/B**
  contro il commit di partenza. Dichiarata rossa, non attribuita.
- **Gli `element.style.*` di `app.js`**: restano e continuano a vincere sul foglio. Le regole nuove
  sono provate a runtime togliendo quelli in linea (prova 4e), non con il file già ripulito.
- **`.harness-dialog-backdrop`** (`foglio-monolite.css:201`) ha lo **stesso** `var(--scrim)` senza
  ripiego del velo che ho curato, quindi anche lui è trasparente. **Non l'ho toccato**: è il velo
  dei dialoghi, si vede ovunque, e cambiarlo è una decisione di tema — non la mia riga.
- **`src/styles/` non è di una corsia sola.** A fine lavoro `git status` mostra, oltre ai miei due
  fogli, anche `src/styles/main.css` **modificato** e `src/styles/desktop-final.css` **nuovo**, che
  non ho scritto io. Ho controllato se scavalcano le mie regole: `desktop-final.css` è importato
  **per ultimo** da `main.css`, e le uniche righe sue che nominano la conversazione mettono un
  `background` sulla colonna dietro `#schermoChat[data-talos-canvas-motion]` — **nessun padding,
  nessuna larghezza**: non si pestano i piedi con la cura di BC-10. Verificato, non dedotto.
- **Due agenti sullo stesso foglio.** `index.css` è stato modificato da qualcun altro **mentre
  lavoravo** (il blocco `.talos-figlia*`): me ne sono accorto solo perché un `assert` sul testo
  esatto della riga è fallito. Ho scritto sempre con la sequenza leggi→modifica→scrivi nello stesso
  istante, su file temporaneo e con `os.replace`, e alla fine ho riletto: **le due serie di modifiche
  convivono, non ho perso niente di nessuno**. Ma è stata fortuna, non un meccanismo: se i fogli di
  `src/styles/` devono restare «miei in esclusiva», qualcuno sta scrivendoci lo stesso.

---

## 8. Riepilogo veloce

**Cosa devi fare tu**
1. **Fascia 1041-1240 px**: dico a chi ha il JavaScript di portare le quattro soglie `1040` a `1240`
   (`src/legacy/app.js:1481`, `:1521`, `:18599`, `:18796`)? Sì/no/dopo.
2. **Pulsante X dei dettagli**: `data-close-panel` su `index.template.html:1025`. Sì/no/dopo.
3. **Gli `element.style.*` in `app.js`** (`:5369-5371`, `:5454`, `:15888`, `:15924`, `:15937`) ora
   sono doppioni di quello che dice il foglio: li fa cancellare chi ha quel file? Sì/no/dopo.
4. **Velo dei dialoghi** (`.harness-dialog-backdrop`), oggi trasparente come lo era quello del
   pannello: lo rendo visibile anche lì? Sì/no/dopo.
5. **`scrollbar-gutter: stable both-edges`** sulla conversazione, se il tuo Chrome ha le barre
   classiche: dimmi se ce l'hai e la metto.

**Cosa faccio io** — niente che aspetti un tuo sì: BC-10, il pannello dei dettagli a ≤1040, il velo
che era invisibile, il contrasto del bottone primario e delle didascalie, e le regole tolte da
`app.js` sono dentro, provati nei due versi e fotografati nei due temi e nelle due viewport.

**Cosa rimane** — il buco non spiegato a 1024 nel markup dimostrativo (§6.1); la sovrapposizione di
8 px a 1440 con i dettagli aperti fuori da «tutta larghezza» (§7); le barre di scorrimento classiche,
non riprodotte (§7); il ruolo ARIA misto del selettore (§4.3 del rapporto altrui, non toccato: è un
cambio di struttura, non di stile); i quattro punti di JavaScript qui sopra. La consegna in `public/`
**non l'ho fatta**: è tua.
