# Lo sfondo animato «tagliato, o che parte da molto sotto» — 11/09/2026

Lane `lane/harness-desktop`. Banco proprio (`node ../server.mjs` su **4283**, store vuoto in
`%TEMP%`); **il 4174 non è stato toccato**, nessun giro col modello.
Foto in `.claude/foto-sfondo-2026-09-11/`. Script di misura nello scratchpad di sessione
(`misura3.mjs`, `foto.mjs`).

---

## 0. Il verdetto in una riga

Il canvas **non è tagliato e non è spostato**: è coperto. A coprirlo era un velo introdotto lo
stesso 11/09 per proteggere la leggibilità — `radial-gradient(ellipse 96% 86% at 50% 38%, …62%…)`
sullo scroller della conversazione. Misurato: quel velo è **opaco fino al 91,3% dell'altezza** dello
scroller e lascia sotto il 50% di opacità **l'1,1% della superficie**. La scena sopravviveva solo
negli angoli in basso — esattamente la foto dell'owner.

---

## 1. Riproduzione, con le misure

Banco: chat con **due messaggi**, tema/scena `terminal`, cursori al massimo (intensità 100,
contrasto 100, glow 100, densità 150), preferenze timbrate (`…Versione: 2`), intro saltata,
viewport **1600×794**, `deviceScaleFactor` **1,25** — la finestra dell'owner.

Foto della riproduzione: `RIPRODUZIONE-difetto-owner.png`. È la sua foto: metà alta vuota, i
caratteri del tema Terminal che compaiono solo in basso e sul bordo destro.

### 1.1 La geometria del canvas è CORRETTA — il sospetto del brief è escluso

Sei combinazioni, misurate sulla pagina viva (`getBoundingClientRect` + `canvas.width/height` +
`ctx.getTransform()`):

| viewport | DPR finestra | rect `#schermoChat` | rect canvas | bitmap | atteso rect×dpr | transform (a,d,e,f) |
|---|---|---|---|---|---|---|
| 1600×794 | 1,25 | 984×794 | **984×794** | 1230×993 | 1230×992 | 1,25 · 1,25 · 0 · 0 |
| 1440×900 | 1,00 | 824×900 | **824×900** | 824×900 | 824×900 | 1 · 1 · 0 · 0 |
| 1024×800 | 1,00 | 748×800 | **748×800** | 748×800 | 748×800 | 1 · 1 · 0 · 0 |
| 1440×900 | 1,25 | 824×900 | **824×900** | 1030×1125 | 1030×1125 | 1,25 · 1,25 · 0 · 0 |
| 1600×794 | 2,00 | 984×794 | **984×794** | 1476×1191 | 1476×1191 | **1,5** · 1,5 · 0 · 0 |

- Il rect del canvas **coincide** con quello di `#schermoChat` in tutte e cinque: `#schermoChat` è
  `position: relative` (`index.css:547`), quindi `inset: 0` si aggancia a lui e non a un antenato
  più grande. `contain: strict` non sposta niente.
- `stage.width/height` vengono da `stage.parent.getBoundingClientRect()` e il bitmap è
  `rect × dpr` **con lo stesso `dpr` che finisce in `ctx.setTransform`** (`desktop-background.js:200-219`):
  nessuna discrepanza fra chi dimensiona e chi disegna, `e=f=0` (nessuna traslazione residua).
- A DPR 2 il `dpr` scelto è **1,5** e non 2 — è `MAX_DPR` (`desktop-background.js:15`), applicato
  **anche** alla transform: la scena è meno definita, non spostata. Le scene lavorano in px CSS
  (`makePaletteGeometry` legge `input.viewport` = `stage.width/height`), coerente.

⇒ `prepare()`, il `dpr`, il `setTransform`, il `ResizeObserver` e le 14 scene **non c'entrano**.

### 1.2 Dove finisce la scena: si misura, non si guarda

Metodo: stessa schermata due volte, una col bitmap del canvas pieno e una con lo **stesso bitmap
svuotato** (`ctx.clearRect`), poi diff pixel a pixel con soglia 3 e profilo per riga.

⛔ La prima versione dello strumento **nascondeva l'elemento** (`visibility:hidden`) invece di
svuotarlo, e dava **29.938 px di scena «sotto il testo»** su una colonna opaca — cioè impossibili.
Togliere il canvas dal disegno cambia il livello di composizione e Chrome passa da antialiasing
subpixel a grigio su tutto il testo sopra: stavo misurando **le lettere**. È la stessa trappola già
scritta in `aspetto.css` e me l'ha rifatta lo strumento. Corretto: svuotare il bitmap, l'elemento
resta.

Con lo strumento corretto, tema `terminal`, 1600×794, DPR 1,25, due messaggi:

| | px di scena visibili | prima riga in cui compare |
|---|---|---|
| com'era | **9.810** | **646** su 993 (65% dello schermo) |

---

## 2. La causa, con la prova

### 2.1 Il velo ellittico sullo scroller (`aspetto.css`, «terzo giro»)

```css
body:is(.background-motion-active, …) .talos-conversation:has(#conversation > *) {
  background-image: radial-gradient(ellipse 96% 86% at 50% 38%,
    var(--talos-background) 0%, var(--talos-background) 62%, transparent 100%);
}
```

In `radial-gradient` le due percentuali dopo `ellipse` sono i **raggi**, ciascuno risolto sulla
dimensione corrispondente — MDN «radial-gradient», letto l'11/09/2026: *«The first value represents
the horizontal radius and the second is the vertical radius. Percentage values are relative to the
corresponding dimension of the gradient box.»*

Scroller misurato 984×594. Quindi: `rx = 944,6`, `ry = 510,8`, centro `(492; 225,7)`, pieno fino a
`0,62 × ry = 316,7 px`.

- parte **opaca** in verticale: da `−91` a **`542,4`** su 594 ⇒ **91,3% dell'altezza**;
  alla sfumatura resta l'**8,7% finale**, che cade sopra il composer;
- opacità all'estremo **sinistro della prima riga**: **0,834** (non «il bordo dove la scena
  riemerge»);
- quota di superficie con velo **sotto il 50%** di opacità: **1,1%**.

Non era «pieno al centro e sfumato ai bordi»: era un **muro** con una finestrella negli angoli in
basso. La lettura vale in tutti i temi, perché la geometria non dipende dal colore.

**Prova A/B sulla pagina viva**, stessa schermata, velo tolto via CSSOM:

| caso | con il velo | senza il velo |
|---|---|---|
| terminal 1600×794 DPR 1,25, 2 messaggi | 9.814 px — prima riga 646 | **43.789 px — prima riga 75** |
| aurora 1440×900 DPR 1, 2 messaggi | 1.499 px | **64.223 px** |

### 2.2 La coda della colonna: mezzo schermo di fondo opaco sotto l'ultima riga

`.talos-conversation__column` porta `padding-bottom: var(--stream-follow-space)`
(`index.css:614`), che `aggiornaSpazioCodaConversazione` mette a **metà dell'altezza visibile**
appena c'è un messaggio (`legacy/app.js:704-712`). Misurato a 1600×794: colonna alta **442,2 px**,
di cui **297 di padding vuoto** (`--stream-follow-space: 297px`) — e quel padding era dipinto col
fondo opaco del tema, sopra la scena, dove non c'è **un solo glifo** da proteggere.

Secondo contributo, misurato dopo aver tolto il velo: **43.789 → 131.635 px** (×3,0).
Su una conversazione che riempie lo schermo non cambia nulla (14.723 → 14.723): lì la coda sta
fuori dalla finestra. Cioè morde esattamente nel caso dell'owner — la chat quasi vuota.

### 2.3 Quello che NON era la causa (escluso, non ipotizzato)

- `prepare()` / `dpr` / `setTransform` / scene: §1.1.
- `position` del contenitore, `inset:0` agganciato all'antenato sbagliato: rect coincidenti, §1.1.
- Un `transform` su un antenato: irrilevante qui — il canvas è `position:absolute` e il suo blocco
  contenitore è comunque `#schermoChat`, che è `position: relative`; e non ce n'è.
- Testata e composer opachi (`aspetto.css:211-212`): coprono 60 px in alto e la fascia del
  composer, non metà schermo.

---

## 3. La cura

Due declaration aggiunte a una regola che c'era già, e **una regola tolta**. Tutto in
`src/styles/aspetto.css` (nessun file di altri lotti toccato).

```css
body:is(.background-motion-active, .background-motion-paused):not(.background-motion-off) #conversation {
  background-color: var(--talos-background);
  background-clip: content-box;                      /* +1 */
  box-shadow: 0 0 22px 0 var(--talos-background);    /* +2 */
}
/* TOLTA: body:is(…) .talos-conversation:has(#conversation > *) { background-image: radial-gradient(ellipse 96% 86% …) } */
```

**Perché funziona senza indebolire la garanzia.** La garanzia «la scena non passa mai sotto il
testo» la regge la **colonna opaca** `#conversation`, non il velo: lo diceva già il commento della
seconda stesura («questo strato può solo AGGIUNGERE opacità sopra ciò che la colonna già copre»).
Togliere il velo quindi non toglie niente alla garanzia — e infatti i pixel lo confermano (§4).

1. `background-clip: content-box` — MDN «background-clip», letto l'11/09/2026: *«content-box — The
   background is painted within (clipped to) the content box.»* Il fondo si ferma al contenuto e la
   coda vuota non copre più la scena. ⛔ Per questo la regola usa la longhand `background-color`:
   il `background` **abbreviato** riazzera `background-clip` a `border-box`.
2. `box-shadow: 0 0 22px 0` — è l'unico lavoro utile che faceva il velo (smussare il bordo netto
   della colonna), ma **attaccato all'oggetto invece che alla finestra**. Un'ombra esterna si
   disegna fuori dal border box (CSS Backgrounds 3 §6.1.1 «Shadow Shape, Spread, and Knockout»;
   MDN «box-shadow», letto l'11/09/2026: il blur è *«a color transition the length of the blur
   distance … perpendicular to and centered on the shadow's edge»*), quindi non può aggiungere un
   pixel sopra il testo.
   ⛔ `22px 0` e non `40px 18px`: lo spazio da sfumare è il margine da 44 px della conversazione
   (`index.css:592`), e 40+18 se lo mangia tutto — su conversazione piena **14.723 → 7.667 px**
   di scena (−48%) contro **12.882** (−12,5%) con `22px 0`. Una sfumatura che cancella ciò che deve
   sfumare non è una sfumatura.

Ricerca fatta **prima** di scrivere: MDN `radial-gradient`, MDN `background-clip`, MDN `box-shadow`,
W3C CSS Backgrounds 3 — tutti letti l'11/09/2026. ⛔ Il budget di `WebSearch` della sessione era
esaurito: le fonti sono state prese **direttamente alla sorgente** con `WebFetch`, non a memoria.

---

## 4. Riverifica, coi numeri

Tutto su build ricostruita e servita dal banco (non su patch CSSOM). A/B nella **stessa pagina**:
si misura lo stato curato, poi si rimette lo stato vecchio via CSSOM e si rimisura.

`px` = pixel in cui la scena si vede · `1ª riga` = prima riga dello schermo in cui compare ·
`sotto-testo` = pixel di scena dentro i rettangoli dei glifi (**dev'essere 0**).

| # | scena · tema · viewport · DPR · chat | com'era (px / 1ª riga) | con la cura (px / 1ª riga) | guadagno | sotto-testo prima → dopo |
|---|---|---|---|---|---|
| AB1 | terminal · 1600×794 · 1,25 · 2 messaggi | 9.810 / **646** su 993 | **127.521 / 75** | ×13,0 | 0 → 0 |
| AB2 | **aurora** · 1440×900 · 1,0 · 2 messaggi | 1.499 / 60 (copertura 4,8%) | **161.777 / 60** (61,1%) | ×108 | 0 → 0 |
| AB3 | **ember** · 1024×800 · 1,0 · 2 messaggi | 19.348 / **561** su 800 | **193.501 / 213** | ×10,0 | 0 → 0 |
| AB4 | **paper** · 1440×900 · 1,25 · chiaro | 28.536 / **843** su 1125 | **495.900 / 75** | ×17,4 | 0 → 0 |
| AB5 | terminal · 1440×900 · 1,0 · conversazione piena | 5.179 / **595** su 900 | **12.882 / 60** | ×2,5 | 0 → 0 |
| AB6 | terminal · 1600×794 · 1,25 · senza coda | 9.810 / 646 | **128.623 / 75** | ×13,1 | 0 → 0 |

Quattro scene diverse delle 14 (`terminal`, `aurora`, `ember`, `paper`), tema chiaro e scuro, tre
viewport, tre DPR. **La prima riga passa dal 65-75% dello schermo al 6-8%**: è la frase dell'owner,
rovesciata.

### 4.1 Al contrario — nessuna combinazione che prima andava e ora no

La chat **vuota** era l'unico stato che il velo non toccava (`:has(#conversation > *)`). Misurata
con la cura e poi togliendo **solo** le mie due declaration:

| caso | con la cura | senza le due declaration |
|---|---|---|
| terminal · 1600×794 · 1,25 · vuota | 232.085 px | 232.082 px |
| paper · 1440×900 · 1,0 · chiaro · vuota | 403.060 px | 403.060 px |
| glacier · 1024×800 · 1,0 · vuota | 88.443 px | 88.443 px |

Differenza **0-3 px su 232.000**: lo stato che funzionava è rimasto identico.

### 4.2 Al contrario — la misura della garanzia MORDE

Un «0 px sotto il testo» non vale niente se lo strumento non sa dire «più di 0». Reso trasparente
il fondo della colonna, stessa schermata: **16.641 px di scena dentro i rettangoli dei glifi**
(contro 0 con la cura). La misura vede il difetto che deve vedere.

### 4.3 Cancelli

- `npm run test:unit` → **763 pass, 0 fail** (3,1 s).
- `tests/parity/nessun-errore-a-runtime.spec.mjs` sul banco 4283 → **1 passed**, nessun errore
  JavaScript. Nessun `pageerror` neppure nelle 16 foto della §5.

---

## 5. Foto — tema chiaro E scuro

16 foto in `.claude/foto-sfondo-2026-09-11/`: `{terminal, calm} × {dark, light} × {1440×900,
1024×800} × {DPR 1, 1,25}`, chat con un messaggio e coda attiva.
Più: `RIPRODUZIONE-difetto-owner.png`, `PRIMA-riferimento-AB1-com-era.png`,
`PRIMA-riferimento-AB1-dopo-cura.png`.

Guardate una per una: la scena copre tutta la chat in entrambi i temi, la colonna di lettura resta
un piano pieno, non c'è più nessun bordo netto attorno a essa e non c'è nessun confine orizzontale
a metà schermo.

---

## 6. Cosa NON ho verificato — dichiarato, non nascosto

1. **Il 4174 e il Chrome dell'owner.** Tutto sul banco 4283 in Chrome headless con
   `reducedMotion: 'reduce'` (serve a congelare le altre animazioni della app, altrimenti il diff
   misura anche loro). La resa a schermo pieno sulla sua macchina, e il costo di ridisegno del
   `box-shadow` mentre si scorre **con la sua GPU**, non li ho misurati. Il `box-shadow` è statico e
   di colore pieno, ma il commento del «terzo giro» diffidava esplicitamente delle ombre sfocate
   per il caso «accelerazione hardware spenta»: se quel caso torna, va misurato.
2. **Scene non provate**: 9 delle 14 (`forge`, `glacier` solo a chat vuota, `atlas`, `noir`,
   `signal`, `violet`, `claudius`, `basicus`, `telemetry`). La cura è indipendente dalla scena
   (agisce su chi la copre), ma l'ho provata su 4 + 1.
3. **Scorrimento.** Le misure sono a `scrollTop = 0`. Una conversazione scorsa a metà non l'ho
   misurata.
4. **Sessione vera.** La conversazione è la fixture del mockup iniettata in `#conversation`, con
   `--stream-follow-space` impostato a `clientHeight/2` **a mano** per riprodurre ciò che fa
   `aggiornaSpazioCodaConversazione`. Non ho aperto una sessione vera (niente giri col modello).
5. **`npm run test:componenti`** (parità coi mockup, 3 viewport) non l'ho lanciato: avrebbe
   ricostruito e acceso due server suoi. La cura tocca solo regole sotto il guardiano
   `background-motion-active`, che nel laboratorio è spento per costruzione — ma è un ragionamento,
   non una misura.

---

## 7. Fili trovati per strada — registrati, non corretti

1. ⛔ **Due regole dicono la stessa cosa sul fondo della colonna, e una userebbe la shorthand.**
   `desktop-final.css:46-48` ha `#schermoChat[data-talos-canvas-motion] .talos-conversation__column
   { background: var(--talos-background); }` — specificità (1,2,0) — contro
   `aspetto.css` `body:is(…):not(…) #conversation` — (1,2,1). Oggi vince `aspetto.css`, quindi il
   mio `background-clip` regge (verificato sulla pagina: `background-clip: content-box`). ⛔ Ma è una
   trappola: chi domani toglie il `body` da quel selettore, o alza la specificità di
   `desktop-final.css`, riazzera `background-clip` a `border-box` **in silenzio** e la coda torna a
   coprire la scena. Diff proposto, non applicato (è una regola di un altro lotto, appena aggiunta):
   ```diff
   -#schermoChat[data-talos-canvas-motion] .talos-conversation__column {
   -  background: var(--talos-background);
   -}
   +#schermoChat[data-talos-canvas-motion] .talos-conversation__column {
   +  background-color: var(--talos-background);
   +  background-clip: content-box;
   +}
   ```
2. ⛔ **La garanzia «mai sotto il testo» non ha un cancello acceso.**
   `tests/parity/aspetto-non-rende-illeggibile.spec.mjs` è **fuori** dal `testMatch` di
   `playwright.componenti.config.mjs` (tolto l'11/09 quando la scena era stata abolita), e
   `sfondo-animato-abolito.spec.mjs` presidia il fatto **opposto** a quello di oggi (che la scena
   non si disegni). Oggi la scena si disegna di nuovo: la garanzia l'ho verificata io a mano, non
   c'è un cancello che la tenga. Va rimessa in suite — è il +1 misurabile dichiarato contro Hermes.
3. La scena `calm` con conversazione piena e ispettore aperto dà **0 px** visibili: le sue forme
   stanno al centro e nei 44-62 px di margine non disegna niente. Non è un effetto della cura
   (prima erano 0 lo stesso); è la composizione di quella scena.
4. `scripts/build.mjs` scrive anche in `harness-ui/public/` (`styles.css`, `build-manifest.json`):
   nel worktree risultano modificati. È l'uscita del build di questa lane, non una modifica a mano.
