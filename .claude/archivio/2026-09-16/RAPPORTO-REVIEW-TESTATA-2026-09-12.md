# BC-30 — la testata Review: le azioni non coprono più le schede

> Corsa del **12/09/2026**, lane `lane/harness-desktop`, `harness-ui/frontend/`.
> Banco su **4186/4187** e poi **4196/4197** (`TALOS_LAB_PORT`/`TALOS_ASPETTO_PORT`): le 4176/4177
> erano occupate da un altro banco vivo. ⛔ **La 4174 non è stata toccata in nessun momento** e non
> è stato fatto **nessun giro col modello**.

## 1. La misura PRIMA — e la cosa che nessuno aveva guardato

`azioni.left − schede.right` sulla testata Review, a passi di 40 px fra 1200 e 1440 più il 1024,
misurato **sulle due pagine insieme** (mockup e app), stessa fixture del cancello:

| viewport | **contenitore** | schede→azioni | largh. azioni | azioni visibili |
|---:|---:|---:|---:|---:|
| 1200 | 924,0 | +67,77 | 204,0 | 5 |
| 1240 | 964,0 | +87,77 | 204,0 | 5 |
| **1280** | **664,0** | **−20,23** ⛔ | 162,0 | 4 |
| **1320** | **704,0** | **−0,23** ⛔ | 162,0 | 4 |
| 1360 | 744,0 | +19,77 | 162,0 | 4 |
| 1400 | 784,0 | +39,77 | 162,0 | 4 |
| 1440 | 824,0 | +59,77 | 162,0 | 4 |
| 1024 | 748,0 | +21,77 | 162,0 | 4 |

Numeri **identici al centesimo** fra mockup e app, come diceva il rapporto del cancello (§5): il
difetto è nel disegno, non una regressione.

⭐ **Quello che il rapporto precedente non aveva visto: la larghezza della finestra non è la misura
giusta, e non è nemmeno monotona.** A 1280 il contenitore della testata vale **664 px**, a 1024 ne
vale **748**: a 1280 la colonna dei dettagli è aperta (340 px) e a 1024 è chiusa. Ecco perché il
rosso stava a 1280 e non a 1024 — non era «più stretto», era **il contenitore**.
⛔ E **1320 era rosso quanto 1280** (−0,23) senza che nessuno lo sapesse: il cancello prova tre
viewport, e la fascia rotta è continua fra le due.

**La causa, in aritmetica.** La testata è una griglia `minmax(0,1fr) auto minmax(0,1fr)`
(`index.css:1881`, owner 06/09 «il segment deve stare sempre al centro»). La colonna delle azioni
può diventare **più stretta del suo contenuto** perché il suo minimo è 0, e con `justify-self:end`
ciò che non ci sta **sborda a sinistra**, cioè sopra le schede centrate:

```
colonna = (contenitore − 36 padding − 344,5 schede − 24 gap) / 2
gap     = 12 + (colonna − larghezza azioni)
contenitore 664 → colonna 129,75 → 12 + (129,75 − 162) = −20,25   (misurato −20,23)
contenitore 704 → colonna 149,75 → 12 + (149,75 − 162) =  −0,25   (misurato  −0,23)
```

⇒ **sotto ~712 px di contenitore la Review si sovrappone**, sempre. È l'unica testata che lo fa
perché è l'unica con una quinta azione (`#copyAllDiffs`): le altre tre viste, sotto gli 820 px di
contenitore, restano a 3 bottoni (120 px) e non sborderebbero prima di ~593.

⛔ **La colonna non si può allargare**: le due colonne laterali devono restare uguali o le schede non
sono più al centro vero — è un'altra asserzione dello stesso cancello (`schede al centro vero`,
tolleranza 1 px). L'unica cura possibile è **stringere ciò che sta dentro**.

## 2. Le fonti, lette PRIMA di scrivere (12/09/2026)

- **Fluent 2 — Toolbar / usage**, letta 12/09/2026:
  <https://fluent2.microsoft.design/components/web/react/core/toolbar/usage> — «A toolbar will grow
  to fit its parent container but will **never wrap onto a second line**. In cases where there are
  more options than can fit, use the `overflow` utility. This changes the last option to an overflow
  menu button that surfaces the rest of the toolbar options» e «**Use a text label along with the
  toolbar item icon in the overflow menu**». ⇒ due vincoli che non avevo: niente `flex-wrap` su una
  toolbar, e dentro il menu le icone vogliono la parola accanto.
- **MDN — CSS container queries**, letta 12/09/2026:
  <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries> — la soglia
  si legge dal **contenitore** (`container-type:inline-size`), che qui è l'unica misura monotona.
- **W3C WAI-ARIA APG — pattern «Toolbar»**, letta 12/09/2026:
  <https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/> — un bottone che apre un elenco è ammesso in
  una toolbar; il ruolo `menu`, però, porta con sé frecce, roving tabindex e gestione del fuoco.
  ⇒ **non** ho dichiarato `role="menu"`: sarebbe una promessa senza codice dietro. È una
  **divulgazione** di bottoni veri, `role="group" aria-label="Altre azioni"`.

Riuso interno, non ricerca esterna: la coppia **Popover API + ancoraggio CSS** è già in casa
(`.talos-tip`, O-40, `index.css:169-186`), verificata a suo tempo sul Chrome vero dell'owner; e la
regola dell'owner del 10/09 («non mettere i pulsanti uno accanto all'altro, usa i tre puntini +
dropdown») è già applicata alla riga della Libreria (`src/components/libreria.js:123-169`), da cui ho
preso l'icona `#i-more` dello sprite invece di tre puntini scritti a mano.

## 3. La cura, file per file

**Nessun `!important`, nessun token nuovo, nessuna soglia del cancello allargata, zero JavaScript.**
Ogni modifica è fatta **due volte, identica**: nella app e nel riferimento — altrimenti `COMP Review`
(struttura + parole + pixel, tre viewport) diventerebbe rosso di suo.

| file | riga | che cosa |
|---|---:|---|
| `harness-ui/frontend/index.template.html` | **674** | le tre azioni generali (Albero dei rami · Comandi · Context Manager) finiscono dentro `<div class="talos-topbar__raccolte" id="azioniRaccolteReview" popover role="group" aria-label="Altre azioni">`, ognuna col nome per esteso in `<span class="talos-topbar__raccolta-nome">`; dopo «Copia i diff» nasce `#altreAzioniReview` (`popovertarget`, icona `#i-more`, «Altre azioni») |
| `harness-ui/frontend/mockup/talos-mockup.html` | **2585** | lo stesso markup, byte per byte |
| `harness-ui/frontend/src/styles/index.css` | **1936-2000** | il blocco `BC-30`: `display:contents` sopra la soglia, popover ancorato sotto |
| `harness-ui/frontend/mockup/talos-mockup.html` | **1768-1832** | lo stesso blocco CSS, byte per byte |

**Come funziona.** Sopra la soglia il contenitore è `display:contents`: **sparisce dal layout**, i tre
bottoni restano figli della barra, **nello stesso ordine e negli stessi pixel di prima** — a 1440 la
testata è identica a ieri (misurato: +59,77 prima, +59,77 dopo; azioni 162 px in entrambi i casi).
Sotto la soglia il contenitore torna a essere un popover: chiuso, il browser lo toglie dal flusso, e
restano in barra **due azioni più il «⋯»** (120 px). Aperto prende l'aspetto degli altri menu della
app (gli stessi valori di `.talos-menu`) e si àncora sotto il «⋯», allineato al suo bordo destro
(`position-anchor` / `position-area:block-end span-inline-start` / `position-try-fallbacks`).

**Perché la soglia è 760 e non 712.** 712 è il punto in cui **si rompe**: una soglia messa sul punto
di rottura si rompe di nuovo appena le schede cambiano parola o carattere (quei 344,5 px sono testo).
760 tiene **48 px di margine** e mette 1024 (contenitore 748) e 1280 (664) **nello stesso stato** —
sotto una certa larghezza si raccoglie, sopra no: sparisce anche il paradosso «finestra più stretta,
barra più piena» che il difetto originale portava con sé.

**Quali due azioni restano in barra, e perché.** «Copia i diff» perché è l'azione **di questa
schermata**; «Mostra o nascondi i dettagli» perché è l'interruttore della colonna che **sta mangiando
la larghezza** — alle larghezze strette è l'unico che cambia il problema. Le tre raccolte sono azioni
generali, presenti in tutte e quattro le viste, e una delle tre ha già un'altra strada (Ctrl K).

### Un difetto trovato PROVANDO, non leggendo

Al primo giro «Comandi (Ctrl K)» era **invisibile anche dentro l'elenco**: la regola
`@container (max-width:820px){ .talos-topbar [data-azione="comandi"]{display:none} }` vale per tutta
la testata, menu compreso. Nascondere una voce **nel menu fatto apposta per ospitarla** è peggio che
non avere il menu. Curato con
`.talos-topbar .talos-topbar__raccolte:popover-open [data-azione="comandi"]{display:inline-flex}`
— specificità (0,4,0) contro (0,2,0): vince senza `!important`.

## 4. La misura DOPO

Stessa sonda, stessa fixture, mockup e app **ancora identici al centesimo**:

| viewport | contenitore | prima | **dopo** | azioni in barra |
|---:|---:|---:|---:|---|
| 1200 | 924,0 | +67,77 | **+67,77** | 5 (invariato) |
| 1240 | 964,0 | +87,77 | **+87,77** | 5 (invariato) |
| **1280** | **664,0** | **−20,23** | **+21,77** ✅ | dettagli · copia · ⋯ |
| **1320** | **704,0** | **−0,23** | **+41,77** ✅ | dettagli · copia · ⋯ |
| 1360 | 744,0 | +19,77 | **+61,77** | dettagli · copia · ⋯ |
| 1400 | 784,0 | +39,77 | **+81,77** | dettagli · copia · ⋯ |
| 1440 | 824,0 | +59,77 | **+59,77** | 4 (invariato) |
| 1024 | 748,0 | +21,77 | **+63,77** | dettagli · copia · ⋯ |

**Il menu, misurato a 1280 (app e mockup, stessi numeri):** si apre, `224×126 px`, angolo in `x=698`
contro il bordo destro dell'ancora a `922` (allineato), `y=52,5` contro il fondo dell'ancora a `46,5`
(6 px sotto), **dentro la finestra**, e **non viene tagliato** dall'`overflow:hidden` della testata —
il livello superiore scavalca il ritaglio, come previsto. Le tre voci sono `210×36` e tutte e tre
**colpibili al centro** (`elementFromPoint`).

**Tastiera e chiusura, provate:** anello di fuoco `solid 2px` sul «⋯»; **Invio** apre; **Tab**
attraversa le tre voci nell'ordine (`Albero dei rami → Comandi (Ctrl K) → Context Manager`) e poi
prosegue dopo l'invocatore, come vuole la specifica; **Esc** chiude; **clic fuori** chiude. Niente
JavaScript nostro: lo fa il browser.

### I cancelli

- `npm run test:unit` → **860 passati, 0 falliti** (erano 843 alla consegna: altri ne hanno aggiunti,
  nessuno rosso). Fra questi `TESTATA-TRE-COLONNE: ogni testata di sessione ha tre figli, non quattro`
  è **verde**: il figlio nuovo sta dentro `__actions`, non nella griglia.
- `playwright.componenti.config.mjs --grep "RIP-V01|COMP Review"` → **9 passati su 9**: `RIP-V01`
  verde su **tutte e tre** le viewport, `COMP Review` verde su tutte e tre.
- L'intero cancello dei componenti, per sicurezza sui 36 componenti che non sono la Review →
  **147 passati, 0 falliti (3,2 min)**, incluso `RUNTIME-01: aprire la app non produce nessun errore
  JavaScript`. ⛔ Due corse precedenti avevano un rosso ciascuna, entrambe con `ERR_CONNECTION_REFUSED`
  / `Test ended` sul laboratorio: **il server del banco moriva**, non il codice — le porte erano
  contese con un altro banco vivo. Rifatta su 4196/4197: 147 su 147. Non ho citato un conteggio senza
  rilanciarlo, come vuole la lezione del 02/09.
- ⛔ **`RIP-V01 al contrario` MORDE ancora**: la prova che rimette la copia estesa riproduce il
  difetto (`actions.left < tabs.right`) e la stessa guardia lo rifiuta — la cura non ha reso inerte
  il cancello.
- ⛔ **La misura del cancello non è stata toccata**: `verificaTestata` invariata, `SOGLIA_PIXEL` e
  `QUOTA_MASSIMA` di `aiuto.mjs` invariate, nessun componente tolto dall'elenco.

## 5. Le foto — chiaro E scuro, affiancate al mockup

In `harness-ui/frontend/artifacts/bc30/`, **20 immagini**, nome `<cosa>-<viewport>-<tema>-<app|mockup>.png`:

- `testata-{1440,1280,1024}-{dark,light}-{app,mockup}.png` — la testata da sola, 12 foto;
- `menu-{1280,1024}-{dark,light}-{app,mockup}.png` — la testata **col menu aperto**, 8 foto.

Guardate una per una. A 1440 (chiaro e scuro, app e mockup) la testata è quella di sempre. A 1280 e
1024 le azioni sono `[dettagli] [copia] [⋯]` e fra l'ultima scheda («Browser») e la prima azione c'è
aria vera. Col menu aperto: tre righe icona + nome, riquadro ancorato sotto il «⋯» e allineato a
destra, bordo e ombra del tema — **corretto in tutti e due i temi**, nessun lampo chiaro sullo scuro.
L'unica differenza app/mockup nelle foto è l'**offset verticale** della testata nella pagina (il
mockup ha altro sopra): il cancello ritaglia l'elemento, quindi non conta — e infatti `COMP Review`
passa a pixel su tutte e tre le viewport.

## 6. Che cosa NON ho verificato

- **Non ho aperto il 4174** e non ho guardato la app nel Chrome vero dell'owner: la consegna lo
  vieta. Tutto ciò che dico è misurato sul banco e sul laboratorio dei componenti, in Chrome
  headless. ⛔ Vale la lezione del 02/09 sulla GPU spenta: l'headless non prova niente sulla fluidità
  nel browser dell'owner — qui però non c'è animazione, solo geometria.
- **Nessun giro col modello**, nessuna sessione vera aperta.
- **Il caso fase3 resta aperto.** «Accetta tutto» e «Scarta tutto» (`data-richiede="fase3"`) sono
  `hidden` oggi e il cancello li nasconde; quando arriveranno saranno **due azioni in più** e la barra
  tornerà sopra i 162 px anche sotto la soglia. ⇒ **quando fase3 si accende, vanno raccolte anche
  loro** (o vanno al posto di ciò che resta in barra). Registrato, non implementato: non è questa
  fase, e deciderlo senza vederle a schermo sarebbe indovinare.
- **Le altre tre testate (Chat, Terminale, Browser) non le ho toccate**, e non sono rotte nella fascia
  misurata — ma per costruzione **sborderebbero sotto ~593 px di contenitore**. Il meccanismo
  (`talos-topbar__raccolte` / `talos-topbar__altre`) è scritto generico apposta: si applica a loro
  cambiando solo il markup. **Filo vero trovato per strada, lasciato per un sì separato.**
- **Il «⋯» non ha uno stato visivo di "aperto"**. L'espansione la dichiara il browser dall'invocatore
  `popovertarget`; a schermo non ho aggiunto un `aria-pressed` finto né un fondo acceso, perché non
  esiste un selettore CSS standard per «il mio popover è aperto» e simularlo vorrebbe JavaScript in
  `app.js`, che non posso toccare.
- **Il ritorno del fuoco dopo Esc l'ho provato solo dal caso comune** (fuoco sul «⋯»). Uscendo dal
  menu con Tab e premendo Esc il fuoco resta dov'è: è il comportamento della specifica, ma non l'ho
  confrontato con nessun'altra superficie della app.
- **`dist/` è stato rigenerato** dal cancello (`node scripts/build.mjs` fa parte del `webServer` di
  `playwright.componenti.config.mjs`): non l'ho toccato a mano, ma i suoi file sono cambiati.
- ⛔ **Non ho toccato** `src/legacy/app.js`, `src/components/sezioni-adattatori.js`,
  `src/components/modulo-voce.js`, e non ho eseguito **nessun comando git**.
