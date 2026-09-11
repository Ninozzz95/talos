# BC-18 · la scheda «Agenti» e la conversazione che non scorreva — 11/09/2026

Lane `lane/harness-desktop`. Due difetti segnalati dall'owner con una foto sola.
Forma del rapporto: **riproduzione nominata → causa con prova (file:riga) → cura → riverifica coi
numeri**, e in fondo **ciò che NON ho verificato**.

⛔ Il banco è sempre stato **mio**: porta **4178**, con una **copia** dello store dell'owner
(`.sessions-store/` → scratchpad). Il **4174 non è mai stato toccato**, né letto né scritto.

---

## 0. Una correzione alla diagnosi che mi è stata consegnata

La consegna diceva: «la rotta `GET /api/v1/sessions/37e10d21…/children` risponde `{"figli":[]}` per
la sessione **madre** `37e10d21…`, e sul disco nessun `.jsonl` ha `padreId:"37e10d21…"`».

Entrambi i fatti sono veri, e la conclusione era sbagliata: **`37e10d21…` è la FIGLIA, non la madre.**

```
.sessions-store/37e10d21-8e17-4376-9437-250424393936.jsonl, intestazione:
  taskId   = 'delega:8dde6bff-c463-4794-b6b9-7ddb4f5ce885'
  padreId  = '8dde6bff-c463-4794-b6b9-7ddb4f5ce885'
  profonditaDelega = 1
  modello  = 'qwen/qwen3.8-flash'      ← il «qwen3.8-flash» della foto
```

La madre è `8dde6bff…` («genera dentro questa cartella un file html di almeno 1000 righe…», cartella
`Desktop\qwen 3.8 research`). Chiesto l'id giusto, **il server dice il vero**:

```
GET /api/v1/sessions/8dde6bff…/children  →  figli: 1
   37e10d21… | conclusa false | interrotta true | «Devi assemblare e validare un file HTML…»
GET /api/v1/sessions/37e10d21…/children  →  figli: []        ← giusto: una figlia senza figlie
```

⇒ **Il server non ha nessun difetto.** `elencaFigli` (`harness-ui/src/subagent-orchestrator.mjs:178`)
e il ripristino dal disco erano già stati chiusi l'11/09 da `tests/bc03-delega-visibile.test.mjs`.
**In `session-registry.mjs` non ho toccato una riga**, e non ce n'era da toccare.

⛔ La lezione è vecchia e l'ho ripresa in pieno: *chiedere l'id sbagliato fa sembrare rotto il
componente che funziona*. Se avessi accettato la diagnosi, avrei «curato» il registro.

---

## 1. DIFETTO 1 (BC-18) — la scheda «Agenti» vuota mentre la sotto-attività è VIVA

### 1.1 Riproduzione nominata

Banco 4178, copia dello store, Chrome 1440×900, script
`scratchpad/banco-agenti.mjs`. La sequenza è quella vera:

1. la scheda legge `…/children` **nell'istante in cui la figlia non esiste ancora** (nel giro vero è
   il `ToolCallStart` di `delega_sottotask`);
2. la figlia nasce;
3. passa **un giro dell'elenco** — la cadenza che tiene viva la barra a sinistra.

Con il codice di prima:

```
1) scheda: {"card":0,"testo":"Sotto-agenti  Nessun sotto-agente in questa sessione. Quando una delega parte, qui…"}
2) intanto la BARRA: {"righe":13,"figliaMostrata":true}
3) dopo UN giro dell'elenco: {"card":0}          ← e restava 0 per sempre
ESITO: ROSSO
```

È **parola per parola** la foto dell'owner: la barra la disegna, la colonna dice «Nessun
sotto-agente».

### 1.2 Causa, con la prova

Non è il dato: è la **cadenza**. Due viste della stessa verità, due orologi.

| vista | rotta | quando rilegge |
|---|---|---|
| barra a sinistra | `GET /api/v1/sessions` (porta `padreId`) | **ogni 15 s**, `frontend/src/legacy/app.js:18116` |
| scheda «Agenti» | `GET /api/v1/sessions/:id/children` | apertura sessione · `ToolCallStart` di `delega_sottotask` · `ToolCallResult` della stessa |

E il `ToolCallStart` (`frontend/src/legacy/app.js:13612`,
`if (evento.toolCallName === 'delega_sottotask') void caricaFigliSessione();`) è **l'istante in cui la
figlia non può ancora esistere**. Prova sul disco della sessione vera dell'owner,
`.sessions-store/8dde6bff….jsonl`:

```
riga 33595  {"type":"ToolCallStart","toolCallName":"delega_sottotask","_sequenza":33590}
riga 33596  {"type":"ToolCallArgs","delta":"{\"task\": ","_sequenza":33591}
riga 33597  {"type":"ToolCallArgs","delta":"\"Devi assembl", …}
riga 33598  {"type":"ToolCallArgs","delta":"are e valid", …}
            … e così via, a pezzi, per tutti i 4.776 caratteri del task
```

Gli argomenti arrivano **dopo**: il kernel può chiamare `delegaSottoTask` — cioè creare la sessione
figlia — solo quando l'ultimo pezzo è arrivato. La scheda chiede «hai figlie?» un istante **prima**
che la figlia nasca, si sente rispondere «no» (che in quel momento è la verità) e **non lo richiede
più finché la delega non è FINITA**. Tutto il tempo in cui la figlia è viva — cioè esattamente
quando la si guarda — la colonna è ferma su una risposta scaduta.

### 1.3 Ricerca (11/09/2026, prima di scrivere)

- **openai/codex #38478** — «completed subagents remain shown as running/processing in the summary
  panel», per ore; **#23931**, **#23930** — card di sotto-agenti che restano in una vista e non
  nell'altra, senza modo di riconciliarle; **#38408** — sotto-agenti «stuck as running» dopo un
  riavvio. In tutti e quattro il pannello e l'albero vivo non sono d'accordo: **è un difetto di
  classe, e dai concorrenti è APERTO.**
- **Tacnode, «Incremental Materialized View: How to Keep Derived State Fresh in Real Time»** —
  «multiple materialized views refreshed independently produce inconsistent snapshots when read
  concurrently». Due viste della stessa verità con due aggiornamenti indipendenti **devono**
  divergere: è una proprietà del disegno, non una sfortuna.

⇒ La cura **non** aggiunge un canale né un timer: toglie il **secondo orologio**.

### 1.4 Cura

- `harness-ui/frontend/src/components/inspector.js:400` — `improntaDelega(riga)`: l'impronta di una
  delega per il confronto, `id | conclusa | interrotta`. Lo **stato** entra nell'impronta e non solo
  l'id, perché il verso opposto dello stesso difetto (codex #38478) è una card che resta «In corso»
  su una delega finita.
- `harness-ui/frontend/src/components/inspector.js:413` — `schedaAgentiDaRileggere({elenco,
  sessioneCorrente, figli})`: **pura**, niente rete, niente DOM. Dice se lo snapshot che la barra ha
  appena letto **smentisce** la scheda.
- `harness-ui/frontend/src/legacy/app.js:15353-15365` (dentro `aggiornaElencoSessioniReali`) — il
  filo, **quattro righe**: se le due viste non sono d'accordo, `caricaFigliSessione()`. Stessa forma
  della riconciliazione O-48 che sta dieci righe sopra («lo stato lo dice il server, e lo dice a ogni
  giro dell'elenco che passa già di qui»).

`…/children` resta la **fonte** (porta `taskCorto` pulito, `collisioni` fra sorelle,
`evidenzaDelega`: cose che l'elenco non ha); l'elenco è solo la **sveglia**.

⛔ La guardia che conta è al contrario: se lo snapshot **non nomina nemmeno la sessione aperta**
(elenco filtrato, fetch parziale), si tace — altrimenti si rileggerebbe per far **sparire card vere**,
cioè BC-18 al rovescio, con la foto giusta sostituita da quella sbagliata.

### 1.5 Riverifica, coi numeri

Stesso script, stesso banco, dopo la cura:

```
1) prima della nascita: {"card":0}               ← onesto: la figlia non c'è
2) la BARRA: {"righe":13,"figliaMostrata":true}
3) dopo UN giro dell'elenco: {"card":1,"testo":"Devi assemblare e validare un file HTML…"}
4) AL CONTRARIO, tre giri con le due viste d'accordo: letture /children in più = 0
ESITO: VERDE
```

Costo misurato: **una fetch solo quando le due viste non sono d'accordo, zero quando lo sono.**

⛔ Un costo in più c'è, e lo dichiaro: all'**apertura** di una sessione con deleghe le letture di
`…/children` diventano **2 invece di 1** (misurato sul banco). Succede perché `passaASessione`
chiama sia `caricaFigliSessione()` sia `aggiornaElencoSessioniReali()`, e quando il giro dell'elenco
passa la prima fetch non è ancora tornata: le due viste risultano in disaccordo e la sveglia suona a
vuoto. È **una richiesta in più per apertura**, su una rotta che legge una mappa in memoria. Toglierla
vorrebbe dire tenere in `legacy/app.js` uno stato «richiesta in volo»: più superficie nel monolite
condiviso da cinque agenti che risparmio, e ho scelto di non farlo. Dichiarato, non nascosto.

**Prova al verso contrario, nella pagina vera:** rimesso il difetto (`if (false && …)`), ricostruita
la build, rilanciato lo stesso script → `ESITO: ROSSO`, «Nessun sotto-agente in questa sessione» con
la barra che mostra la figlia. Cura rimessa → `ESITO: VERDE`.

### 1.6 Prove automatiche

`harness-ui/frontend/tests/unit/bc18-scheda-agenti-non-diverge.test.mjs` — **10 prove**, tutte verdi:
il caso del bug, le due viste d'accordo, la figlia che ha finito, la figlia interrotta, la figlia
sparita dall'elenco, le figlie di un'altra madre, nessuna sessione aperta, lo snapshot parziale,
l'ordine e i doppioni, le righe malformate.

**Quattro guasti rimessi apposta, e ognuno morde:**

| guasto rimesso | rossi |
|---|---|
| non si rilegge mai (il difetto originale) | **5** |
| l'impronta dimentica lo stato (solo id) | **2** |
| via la guardia sullo snapshot parziale | **1** |
| via il filtro su `padreId` | **1** |
| *(ripristinato)* | **0** |

---

## 2. DIFETTO 2 — la conversazione di un agente non scorreva

### 2.1 Riproduzione nominata

Stesso banco, aperta dalla scheda «Agenti» la conversazione della figlia vera (**100 righe
attrezzo**, task da 4.776 caratteri). `scratchpad/banco-figlia.mjs`. **Prima:**

```
.talos-figlia :  scrollHeight 8688   clientHeight 8688   overflow-y visible
.talos-figlia__corpo: 8552 / 8552    overflow-y visible
catena fino a body: overflow-y visible ovunque (body: hidden) → NESSUN contenitore che scorre
fondo del pannello: +7.921 px SOTTO il bordo della finestra
scrollTop = 99999  →  scrollTop resta 0
```

Non era scomodo da scorrere: **era impossibile**. 7.921 px di conversazione disegnati fuori dallo
schermo e irraggiungibili, in una colonna alta 900.

### 2.2 Causa, con la prova

`harness-ui/frontend/src/legacy/app.js:8380` (`apriConversazioneFiglia`):

```js
const contenitore = document.createElement('div');
contenitore.dataset.c = 'PannelloFiglia';
elenco.parentElement.insertBefore(contenitore, elenco.nextSibling);
elenco.hidden = true;                      // ← `#railAgenti`
```

`#railAgenti` è `.talos-inspector__body` (`frontend/src/styles/index.css:1203`:
`flex:1 1 auto; min-height:0; overflow-y:auto`) — cioè **l'unico contenitore che scorre di tutta la
colonna**. Aprire la conversazione lo **spegne** (`hidden`) e gli mette accanto **un `div` senza
classe**: nessun `overflow`, nessun `min-height:0`. La colonna resta senza nessuno che scorra.

### 2.3 Ricerca (11/09/2026, prima di scrivere)

- **W3C css-flexbox** + **philipwalton/flexbugs #241**: il `min-width/height: auto` di un flex item
  si applica «only when overflow is visible» ⇒ senza `min-height:0` un flex item **non scende sotto
  il proprio contenuto** e l'`overflow` del figlio non entra mai in gioco. Serve a **ogni anello**
  della catena, non solo a chi scorre.
- **axe `scrollable-region-focusable` / WCAG 2.1.1**: un contenitore che scorre va reso
  «programmatically focusable using `tabindex=0`», o frecce e PagGiù non hanno dove agire.
- **MDN `overscroll-behavior`**: `contain` ferma lo **scroll chaining** — arrivati in fondo, la
  rotella non prosegue sul pannello dietro.
- **stackblitz-labs/use-stick-to-bottom**, **CSS-Tricks «Pin Scrolling to Bottom»**, «Intuitive
  Scrolling for Chatbot Message Streaming»: la vista segue il fondo **finché chi legge è al fondo**,
  e si fa da parte **nell'istante in cui risale**.

### 2.4 Cura

- `harness-ui/frontend/src/components/conversazione-figlia.js:558` — il componente **marca il suo
  ospite** (`talos-figlia-ospite`) e `distruggi()` lo **smarca** (`:609`). La classe la mette il
  componente e non chi lo monta: il pannello si apre da `legacy/app.js`, ma anche dal laboratorio e
  dalle prove, e un contratto che vive in uno dei tre chiamanti è un contratto che gli altri due
  rompono senza accorgersene. **Così `legacy/app.js` non ha bisogno di sapere niente di tutto questo.**
- `harness-ui/frontend/src/components/conversazione-figlia.js:406` — `corpo.tabIndex = 0`
  (il `tabindex` sta sul **corpo che scorre**, non sulla card: quella ha `tabIndex = -1` per ricevere
  il fuoco al montaggio, e −1 non entra nel giro del Tab).
- `harness-ui/frontend/src/components/conversazione-figlia.js:478-485, 543-544` — `seguivaIlFondo()`
  misurata **prima** di mutare, e `if (seguiva) corpo.scrollTop = corpo.scrollHeight` **dopo**.
  Geometria sconosciuta (vista non ancora attaccata, DOM finto) = non si tocca lo scorrimento di
  nessuno.
- `harness-ui/frontend/src/styles/index.css:1275-1284` — la catena intera:
  `.talos-figlia-ospite` → `.talos-figlia` → `.talos-figlia__corpo`, tutte con `min-height:0`;
  il corpo con `overflow-y:auto` e `overscroll-behavior:contain`; contorno del fuoco dal tema.

⛔ Fuori da un flex-column alto (laboratorio, pagina statica, prove) queste righe sono **inerti**:
`flex` non fa niente a chi non è un flex item, e la vista cresce come prima.

### 2.5 Riverifica, coi numeri

**1440×900, tema scuro e tema chiaro:**

```
.talos-figlia :  757 px   (prima 8.688)    dentro una colonna di 900
.talos-figlia__corpo:  scrollHeight 8552 / clientHeight 621  →  corsa 7.931 px, overflow-y auto
fondo del pannello: −10 px  (prima +7.921: adesso finisce DENTRO la finestra)
il documento non scorre più: 0  (prima 7.931)
scrollTop:  0 → 2000 → 7931  (i tre valori chiesti, tutti raggiunti)
rotella VERA di 1.200 px dentro il pannello → scrollTop 1.200, documento fermo a 0
tabindex="0" · overscroll-behavior-y: contain
```

**Le altre viewport desktop, in tutt'e due i temi** (a ≤1240 px la colonna è un velo
`.talos-inspector.open`):

| viewport | tema | corsa | scrollTop max | fondo fuori | documento |
|---|---|---|---|---|---|
| 1024×800 | scuro | 8.031 | 8.031 | −10 | 0 |
| 1024×800 | chiaro | 8.031 | 8.031 | −10 | 0 |
| 1280×800 | scuro | 8.031 | 8.031 | −10 | 0 |
| 1280×800 | chiaro | 6.657 | 6.657 | −10 | 0 |

**Screenshot ispezionati** (scratchpad): `prima-scuro.png` (il testo che esce dalla finestra e si
taglia), `dopo-scuro.png`, `dopo-chiaro.png`, `v-laptop-1024x800-{scuro,chiaro}.png`,
`v-desktop-1280x800-{scuro,chiaro}.png`. Nelle foto «dopo» si vede che **la testata resta ferma**
(Indietro · compito · stato · Modello · Ha fatto) e scorre **solo la conversazione**: il pulsante
«Indietro» è sempre raggiungibile, cosa che prima si perdeva appena il contenuto cresceva.

### 2.6 Prove automatiche

`harness-ui/frontend/tests/unit/conversazione-figlia.test.mjs` — **6 prove nuove** (il file passa da
15 a **21**, tutte verdi): ospite marcato/smarcato, tastiera sul corpo che scorre, il fondo seguito
se ci si era, **al contrario** chi è risalito non viene riportato giù, **al contrario** geometria
sconosciuta = non si tocca niente, e il **contratto CSS letto nel foglio vero** (i tre `min-height:0`,
`overflow-y:auto`, `overscroll-behavior:contain`).

**Cinque guasti rimessi apposta:**

| guasto rimesso | rossi |
|---|---|
| l'ospite non viene più marcato | **1** |
| via il `tabindex` dal corpo | **1** *(vedi sotto)* |
| riporta SEMPRE in fondo | **2** |
| un anello della catena CSS senza `min-height:0` | **1** |
| via `overscroll-behavior` | **1** |
| *(ripristinato)* | **0** |

⛔⛔ **Il guasto sul `tabindex` la prima volta NON ha morso** — 21 verdi col difetto rimesso. Causa:
il DOM finto del file rispondeva `tabIndex: 0` a **qualunque** nodo, e nel DOM vero un `div` senza
`tabindex` risponde **−1**. **Ho corretto il finto, non la prova**
(`tests/unit/conversazione-figlia.test.mjs:42`, col perché scritto lì): il fatto non è cambiato, era
sbagliato il finto. Rimesso il guasto dopo la correzione: **1 rosso**. È la lezione scritta in testa
a quel file stesso — *un finto che risponde plausibile fa passare un componente rotto* — e mi ha
preso in castagna.

### 2.7 Un cancello che NON morde, e va detto

Ho passato `axe-core` (WCAG 2.0/2.1 A + AA + best-practice) sul pannello della figlia, **nei due
temi**: **nessuna violazione**, né prima né dopo.

⛔ Ma quel verde **non prova la cura della tastiera**, e l'ho verificato invece di crederci: tolto
`corpo.tabIndex = 0` e ricostruita la build, **axe resta verde lo stesso** — la regola
`scrollable-region-focusable` si accontenta che dentro la regione ci sia *qualcosa* di focalizzabile,
e qui ci sono il pulsante «Indietro» e i gruppi richiudibili. Quindi: axe dice che non ho **rotto**
niente; a difendere il `tabindex` è la prova unitaria, che morde (§2.6).

Un cancello che non può diventare rosso non è una prova, ed è meglio dirlo che citarlo come tale.

---

## 3. Le suite

Ultimo giro, a lavoro finito:

| suite | esito |
|---|---|
| `cd harness-ui/frontend && npm run test:unit` | **689 pass · 0 fail** |
| `cd harness-ui && node --test tests/*.test.mjs` | **2269 pass · 0 fail** (8 suites) |

⛔ **I conteggi si muovono sotto i piedi, e va detto.** La consegna parlava di 635 e 2203; un'ora
prima avevo misurato 679 e 2239; adesso sono 689 e 2269. In questo checkout lavorano altri quattro
agenti e le loro prove entrano mentre le mie girano. **Le mie sono 16** (10 + 6). Non ho un «prima»
pulito da confrontare, quindi **non attribuisco a me nessuna differenza oltre a quelle 16**: dichiaro
i numeri di adesso, entrambi **senza un rosso**.

⛔ Per lo stesso motivo, i **numeri di riga** di `legacy/app.js` citati qui sopra invecchiano in
fretta (il mio filo è passato da `:15353` a `:15444` mentre scrivevo): il riferimento stabile è il
**nome** — `schedaAgentiDaRileggere`, dentro `aggiornaElencoSessioniReali`.

---

## 4. Che cosa NON ho verificato — dichiarato

1. **La barra di scorrimento a schermo.** `frontend/src/styles/index.css:193` dice, misurato il
   06/09, che **headless non disegna affatto le scrollbar**. Le mie foto sono headless: il pannello
   scorre (misurato in pixel, e con una rotella vera), ma **non ho visto con gli occhi** la barra
   custom da 8 px dentro il pannello della figlia. Il foglio la applica con un selettore
   **universale** (`*::-webkit-scrollbar`, righe 205-215), quindi ne eredita la stessa di tutta la
   app — ma è un ragionamento, non una foto. Un giro headed l'ho tentato e la finestra si è chiusa
   prima di arrivare in fondo; non ho insistito per non far comparire finestre sullo schermo
   dell'owner.
2. **Il giro vero con una delega VIVA.** Ho riprodotto la sequenza (figlia che nasce dopo l'ultima
   lettura) intercettando `…/children` nella finestra in cui la figlia non esiste. **Non ho fatto
   partire una delega vera con un modello a pagamento**: le prove sono su una copia dello store e
   sugli eventi già registrati dal giro dell'owner.
3. **Il ritardo residuo della scheda.** Con la cura la scheda si allinea **entro un giro
   dell'elenco**, cioè **≤ 15 s** dalla nascita della figlia (prima: mai, finché la delega non
   finiva). **Non è istantaneo.** Portarlo a zero vorrebbe dire un evento dal server sulla madre
   quando una figlia nasce: è una cosa nuova nel kernel, non l'ho fatta e non l'ho infilata di
   nascosto. Se l'owner la vuole, va aperta come riga sua.
4. **`npm --prefix frontend run verify`** — **lanciato, NON concluso: non ne riporto l'esito.**
   L'ho fatto girare su porte mie (**4186/4187**, perché la 4176 era già occupata da un altro agente)
   e dopo **oltre 50 minuti** non aveva ancora finito: `verify.mjs` incatena build + contratti +
   determinismo + la parità dei componenti su tre viewport, con due server suoi e `workers: 1`.
   L'ho **fermato** invece di lasciarlo appeso, e ho ripulito i due server che erano sopravvissuti
   alla fermata (`serve-lab.mjs` sul 4186, `server.mjs` sul 4187, entrambi verificati per
   riga di comando prima di terminarli). **La 4174 dell'owner e la 4176 dell'altro agente sono
   rimaste su, intatte** (controllate dopo: `200` tutt'e due).
   ⇒ Se qualcuno vuole quel cancello, va rilanciato con calma: le mie due suite dichiarate sono
   verdi, ma **la parità visiva contro il mockup resta non misurata da me**.
5. **`src/kernel/talosHarness.mjs`**: i 3 rossi preesistenti non li ho né guardati né toccati, come
   da consegna.
6. **`harness-ui/src/session-registry.mjs`: non modificato.** La rotta `/children` era ed è corretta
   (§0): non c'era niente da curare, e non ho cambiato niente «per sicurezza».

---

## 5. File toccati

```
harness-ui/frontend/src/components/inspector.js            + improntaDelega, schedaAgentiDaRileggere (86 righe, quasi tutte commento con le prove)
harness-ui/frontend/src/components/conversazione-figlia.js + ospite marcato, tabindex sul corpo, segui-il-fondo (66 righe)
harness-ui/frontend/src/styles/index.css                   + la catena min-height:0 e il corpo che scorre (righe 1264-1284)
harness-ui/frontend/src/legacy/app.js                        1 import + 4 righe di filo in aggiornaElencoSessioniReali (:15353)
harness-ui/frontend/tests/unit/bc18-scheda-agenti-non-diverge.test.mjs   NUOVO, 10 prove
harness-ui/frontend/tests/unit/conversazione-figlia.test.mjs             + 6 prove, e il DOM finto corretto sul tabIndex
```

⛔ Nessun `git add`, nessun `commit`, nessun `push`: committa l'owner.
⛔ In `legacy/app.js` — il file che tutti e cinque gli agenti possono toccare — la mia impronta è
**una riga di import e quattro di filo**: tutta la decisione, e tutte le sue prove, stanno nei
componenti che sono miei in esclusiva.
