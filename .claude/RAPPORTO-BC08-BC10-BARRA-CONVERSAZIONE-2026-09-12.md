# BC-08 e BC-10 — la barra di navigazione della conversazione

**12/09/2026 · ramo `lane/harness-desktop` · agente Opus 5, sforzo high**
Banco: server MIO su **porta 4186**, store sintetico, frontend costruito in `frontend/dist/`.
⛔ Il 4174 dell'owner non è mai stato letto né toccato; nessun giro con provider cloud.

---

## 0. Gli ordini

- **BC-08** (owner 11/09, «importante» il 12/09): «la barretta di conversation navigation mostra
  sempre il messaggio che ho inviato io ad ogni segment anziché quello inviato da lui (ed entrambi).
  Deve includere anche le sue risposte e direzionare a quella se cliccato».
- **BC-10** (owner 11/09, confermato il 12/09 «sì, in modalità chat a tutta larghezza»): «la chat a
  tutta larghezza collide troppo vicina al navigator della conversazione di sinistra, rendi lo spazio
  uguale a quello di destra».

---

## 1. Ricerca — fonti e date (fatta PRIMA di scrivere codice)

⛔ **Dichiarazione onesta sullo strumento**: `WebSearch` era **esaurita per la sessione (200/200)** al
primo tentativo. DuckDuckGo (html e lite) ha risposto con un CAPTCHA, Mojeek con un 403, Bing in
formato RSS ha risposto ma con risultati generici e inutili. La ricerca è quindi stata fatta su
**fonti dirette** (sorgenti, issue, specifiche) e sul **nostro stesso codice**. Nessuna riga di questo
rapporto viene dalla memoria del modello senza una fonte accanto.

### 1.1 Hermes Agent (Nous Research) — per primo, come da regola

`https://hermes-agent.nousresearch.com/` (`hermes.nousresearch.com` reindirizza qui), **letto il
12/09/2026**. La pagina descrive connettori (Telegram, Discord, Slack…), memoria persistente,
automazione e delega di compiti. **Nessuna barra, minimappa o indice di navigazione della
conversazione documentata.** ⇒ Su BC-08 non c'è niente da pareggiare con loro: il confronto utile è
altrove.

### 1.2 LibreChat — la fonte che descrive esattamente BC-08

- **PR #13853 «MessageNav Terminus»**, `danny-avila/LibreChat`, **chiusa e integrata nel ramo `dev` il
  19/06/2026** (46 test unitari).
- **Sorgente `client/src/components/Chat/Messages/MessageNav.tsx`**, ramo `dev`, **letto il 12/09/2026**.

Cosa fa, coi numeri:

| Domanda | Risposta di LibreChat |
|---|---|
| Quali turni indicizza | **utente E assistente** (`isCreatedByUser`, selettore `.user-turn`) |
| Come li etichetta | `aria-label` per voce, `aria-current="true"` sulla corrente, anteprima del testo tagliata a **80 caratteri** (`PREVIEW_LIMIT`) |
| Come distingue i lati | dal ruolo del messaggio; i terminali (inizio/fine) sono un **punto piccolo centrato** invece che una linea |
| Misure | riga ad altezza **fissa 6 px** (`RIB_ROW_HEIGHT`); voce normale `baseW 12 → peakW 39`; corrente `baseW 21` |
| Con 100+ turni | **nessun raggruppamento**: tetto `max-h-[min(24rem,calc(100%-2rem))]` e **scorrimento interno** (`overflow-y-auto`) |
| Come resta agganciata | scroll-spy che ricentra la colonna sulla voce corrente, **congelato durante l'interazione** (`interactingRef`), altrimenti la barra scappa sotto il cursore |
| Magnifier | caduta cosinusoidale su raggio **50 px** (`MAG_INFLUENCE`), spento con reduced-motion |
| Anteprima | ritardo di apertura **60 ms** (`TOOLTIP_OPEN_DELAY`), `role="tooltip"` in un Portal |
| Tastiera | frecce su/giù con **roving tab-stop**, Home/Fine, `Shift+Alt+M`, due chevron con `JUMP_EPS 4`, scroll animato **400 ms** easeOutCubic |

### 1.3 Accessibilità

- **WAI-ARIA APG, «Landmarks / Navigation»** — letto il 12/09/2026: `<nav>` è la forma corretta per una
  navigazione; l'etichetta è obbligatoria quando ce n'è più d'una nella pagina. La nostra barra ha già
  `<nav aria-label="Naviga la conversazione">`.
- **MDN, `aria-current`** — letto il 12/09/2026: per **un indice che segue lo scorrimento** il valore è
  **`location`** («la posizione corrente in un ambiente»), non `true`.

### 1.4 Prima di cercare fuori: il nostro stesso codice

`frontend/src/components/inspector.js` → `righeGiri()` **elenca già entrambi i lati** dal 10/09 (D-10A),
e cita nel commento **opencode #25910 «Chat Navigation Index/Sidebar»**. Cioè: la colonna dei dettagli
sapeva quello che la barra non sapeva. Da lì ho **importato** i due selettori del testo
(`SELETTORE_TESTO_UTENTE`, `SELETTORE_RISPOSTA_TURNO`) invece di riscriverli — e con essi la cura del
difetto **CB-03** (`.assistant-copy` da sola pesca il *ragionamento*, non la risposta).

### 1.5 ChatGPT desktop — misura già custodita nel repo

`cronologia.js` porta in testa la misura fatta **dal vivo il 06/09/2026** (avvio con
`--remote-debugging-port`, lettura del solo `nav`): **una voce per messaggio dell'UTENTE soltanto**,
`aria-label="Vai al messaggio dell'utente N"`, voce 36×10 px, lente 26·20·14·10·6, tetto
`min(70vh,40rem)`, maschera sfumata ai bordi. Non ho rifatto quella misura: è recente e documentata.

### 1.6 Confronto

| | Turni indicizzati | Distinzione dei lati | Oltre il tetto | Anteprima | Tastiera |
|---|---|---|---|---|---|
| ChatGPT desktop (06/09) | **solo utente** | — | lista che scorre + sfumatura | no | non misurata |
| LibreChat (19/06) | **utente + assistente** | ruolo + forma | **scorre**, niente gruppi, auto-follow | 80 caratteri | frecce, Home/Fine, roving |
| Hermes Agent | nessuna barra documentata | — | — | — | — |
| **TALOS, prima** | voce = **giro**, testo sempre TUO | nessuna (verde su «utente») | scorre, ma **taglia le PIÙ VECCHIE… tenendo le prime** | sì (nostro +1) | nessuna |
| **TALOS, dopo** | **utente + assistente** | **geometria + colore del sistema di design** | scorre, niente gruppi, **auto-follow congelato durante l'uso** | sì, col capo «Tu» / «TALOS · giri 5-8 · 3 attrezzi» | frecce, Home/Fine, roving, `aria-current="location"` |

---

## 2. Il mockup — c'è, ma non può arbitrare BC-08

`/.claude/refactor-ui-owner-2026-09-11/Talos_Desktop_Final_Mockup_Interattivo.html` contiene la barra
(CSS righe **540-577**, markup riga **4854**), e la copia `harness-ui/frontend/mockup/talos-mockup.html`
pure (CSS **501-587**).

⛔ **Ma è uno snapshot del nostro stesso prodotto**, non una fonte esterna: porta *i nostri* commenti
datati 06/09, 07/09 e 08/09 (compreso quello sui `style=` inline tolti per la CSP) e le tre voci di
esempio `aria-label="Vai al messaggio dell'utente 1 / 2 / 3"`. Il mockup **descrive esattamente il
difetto** che l'owner ha chiesto di correggere.

**Confronto testa a testa (foto affiancate: `prima-1440x900-light-piena-lunga.png` ↔
`dopo-1440x900-light-piena-lunga.png`, stesso tema, stessa larghezza, stessa sessione):**

| Aspetto | Mockup / prodotto PRIMA | Prodotto DOPO | Perché la differenza |
|---|---|---|---|
| Cosa elenca | solo i messaggi dell'utente (e, nel prodotto, un segmento per *giro*) | il tuo messaggio **e** la risposta | ordine owner BC-08 dell'11/09, ribadito il 12/09 |
| Allineamento del segno | tutti a sinistra | **tuo a destra, sua a sinistra** | rispecchia la chat (`.talos-message--user` è `align-items:flex-end`) |
| Colore a riposo | `--talos-success` (verde) per «utente» | accento per il tuo, neutro per il suo | il verde vuol dire «riuscito»: un tuo messaggio non ha un esito |
| Tetto di altezza, maschera, lente 26·20·14·10·6, fumetto, lampeggio | invariati | **invariati** | nessun motivo di toccarli |
| Larghezza voce 36×10 px | invariata | **invariata** | «niente segmenti schiacciati» |

---

## 3. BC-08 — che cosa era rotto, davvero

Misurato sul banco (60 scambi sintetici, `misure-prima.json`):

- il DOM aveva **120 turni** (60 dell'utente + 60 di TALOS);
- la barra disegnava **179 voci**, perché una voce era un **numero della spine** (un giro), non un
  messaggio: un turno di TALOS con *n* giri produceva *n* voci **con lo stesso elemento** ⇒ *n* clic che
  finiscono nello stesso punto;
- il testo di **ogni** voce era `ultimoDetto`, cioè l'ultimo messaggio della PERSONA. È letteralmente la
  frase dell'owner: «mostra sempre il messaggio che ho inviato io ad ogni segment».

Dopo: **120 voci, 60 tue e 60 sue** (`vociUtente` / `vociTalos` letti da `data-lato` nella pagina vera).

### 3.1 Cosa succede quando le voci non ci stanno — decisione e motivo

Con due lati le voci raddoppiano. Il tetto della lista è `min(70vh, 40rem)`: a 900 px di altezza sono
**630 px**, cioè **63 voci** da 10 px — circa 31 scambi. Sulla sessione lunga il contenuto della lista
misura **1200 px contro 630** disponibili (misurato).

Le forme possibili, viste nella ricerca, sono tre. **Scelta: la terza.**

1. **Schiacciare le righe** — scartata: sotto i 10 px il bersaglio del clic sparisce, e l'owner ha
   chiesto esplicitamente niente segmenti schiacciati.
2. **Raggruppare** (un segmento ogni N scambi) — scartata: nasconderebbe proprio le risposte che BC-08
   chiede di mostrare. LibreChat, che indicizza entrambi i lati, **non raggruppa**.
3. **Riga ad altezza fissa + lista che scorre + la barra che segue la lettura** — adottata. È la forma di
   LibreChat (`RIB_ROW_HEIGHT` fisso, `overflow-y-auto`, scroll-spy), ed è anche quella che la nostra
   barra aveva già a metà: la lista scorreva, ma **nessuno la agganciava alla voce corrente**.

In più, due cure che nascono da lì:

- il tetto `VOCI_MASSIME` era **200 con `slice(0, 200)`**, cioè teneva le voci **PIÙ VECCHIE**: oltre il
  tetto la barra perdeva esattamente la parte di conversazione dove stai leggendo. Ora tiene le
  **ultime**, e sale a **400** perché ogni scambio vale due voci;
- l'auto-follow si **congela** mentre il puntatore è sulla barra o una voce ha il fuoco (`interactingRef`
  di LibreChat): senza quel freno la voce sotto il cursore scivola via mentre stai per cliccarla.

### 3.2 Prova dal vivo dell'aggancio (sessione da 60 scambi, 1440×900, entrambi i temi)

| Dove stai leggendo | `scrollTop` della lista | voce attiva | `aria-current` | fermate di Tab |
|---|---|---|---|---|
| in cima | 0 | 3 | voce 3 | 1 |
| a metà | 170 | 75 | voce 75 | 1 |
| in fondo | 570 (fondo corsa) | 119 | voce 119 | 1 |

### 3.3 Il fumetto porta il testo GIUSTO (letto dalla pagina, non dedotto)

```
voce 116 (tua)   → "TU\nConfronta le due misure e dimmi quale è più stretta (59)"
voce 117 (sua)   → "TALOS · GIRI 176-177 · 2 ATTREZZI\nLa misura a sinistra parte dal bordo della barra…"
```

---

## 4. BC-10 — la cura dell'11/09 pareggiava la COLONNA, non il TESTO

Il conto aveva **due** termini e ne servivano **tre**. `.talos-turn` è una griglia
`0 minmax(0,1fr) 46px`: a destra di ogni messaggio c'è una **coda vuota di 46 px** (era il posto della
spina dei giri, oggi nascosta), e il piede della chat ci si allinea sopra (`- 46px`, scritto a mano in
due punti). Quel numero **non entrava nel calcolo dei margini**.

```
spazio a sinistra = padding-left − ingombro della barra
spazio a destra   = padding-right + coda del turno
uguali  ⟺  padding-left = ingombro + coda + padding-right
```

⛔ Nota di metodo: **misurare la colonna invece del testo diceva il falso**. La prima stesura della mia
sonda misurava `.talos-conversation__column` e riportava «−8 px» anche a modalità spenta, cioè una
collisione che a schermo non c'è (la colonna è larga quanto lo scroller sempre; il tetto vive su
`.talos-message`). È lo stesso errore che ha prodotto la cura dell'11/09.

### 4.1 Misure, prima e dopo (banco 4186, pagina vera, entrambe le sessioni, entrambi i temi)

**A tutta larghezza** — l'oggetto di BC-10:

| Viewport | Sinistra (dal bordo destro della barra) | Destra | Scarto | Larghezza del testo |
|---|---|---|---|---|
| 1440×900 **prima** | 18 px | 64 px | **46 px** | 690 px |
| 1440×900 **dopo** | **46 px** | **46 px** | **0 px** | 680 px (−10) |
| 1024×800 **prima** | 44 px | 90 px | **46 px** | 614 px |
| 1024×800 **dopo** | **67 px** | **67 px** | **0 px** | **614 px (invariata)** |

**Fuori da «tutta larghezza»** — richiesta: nulla deve cambiare. Misurato:

| Viewport | Sinistra dal bordo | Sinistra dalla barra | Destra | Testo | Colonna |
|---|---|---|---|---|---|
| 1440×900 prima e dopo | 44 · 44 | −8 · −8 | 90 · 90 | 690 · 690 | 736 · 736 |
| 1024×800 prima e dopo | 44 · 44 | 44 · 44 | 90 · 90 | 614 · 614 | 660 · 660 |

**Nessuna cifra cambia.** ✔

Il costo dei 10 px a 1440 è dichiarato e voluto: a quella larghezza, **con la colonna dei dettagli
aperta**, lo spazio utile è 824 px e la simmetria non si può avere gratis. Il `clamp` prende tutto ciò
che avanza (respiro 0 lì, 21 px a 1024, fino al tetto di 44 px sugli schermi larghi), quindi
«tutta larghezza» non restringe mai sotto la misura normale dove c'è spazio — la regressione già
pagata il 06/09.

---

## 5. Che cosa ho cambiato, file per file

### `harness-ui/frontend/src/components/cronologia.js` (+280 righe circa, riscritto nelle parti sotto)

| Dove | Cosa |
|---|---|
| testa del file, righe 24-60 | il blocco BC-08: ordine dell'owner, causa misurata, e le **fonti con la data** (LibreChat, APG, MDN, il nostro `inspector.js`, Hermes) |
| riga 62 | `import { SELETTORE_RISPOSTA_TURNO, SELETTORE_TESTO_UTENTE } from './inspector.js'` — **un solo posto** per i selettori del testo |
| righe 66-73 | `VOCI_MASSIME` 200 → **400**; `TONI` riordinato **dal più grave al più tenue** |
| righe 89-109 | `testoDelTurno()` e `tonoPeggiore()` nuove |
| righe 111-160 | **`vociDaTurni()`** — pura, nessun DOM: una voce per turno, `lato`, giri primo/ultimo, attrezzi sommati, taglio che tiene le **ultime**, rinumerazione, «in corso» solo sull'ultima, testo del vuoto deciso **dopo** il tono |
| righe 160-186 | `vociDaConversazione()` ridotta a **lettore del DOM** che chiama la funzione pura |
| righe 186-222 | `capoFumetto()`, `testoFumetto()`, `etichettaVoce()`, `riempiFumetto()` — «Tu» / «TALOS · giri 5-8 · errore · 3 attrezzi» |
| righe 231-276 | **`scorrimentoPerVedere()`** pura (con la sfumatura da 40 px nel conto) e **`contenitoreCheScorre()`** |
| `aggiornaCronologia()` | `data-lato`, `data-tono` separati; `aria-label` per lato; `aria-current="location"`; **roving tabindex**; auto-follow della lista |
| `collegaCronologia()` | freno `inMano` su puntatore e fuoco; **tastiera** frecce/Home/Fine; ascolto dello scorrimento sul contenitore **giusto**; primo calcolo del segnavia all'aggancio |

### `harness-ui/frontend/src/styles/index.css`

| Righe | Cosa |
|---|---|
| **115-121** | nuovo token `--talos-turno-coda: 46px`, col perché |
| **572-589** | BC-08: `[data-lato="utente"]` allineato a destra e in accento; tolta la regola verde `[data-tono="utente"]`; la regola della voce attiva passa a **doppia classe** (altrimenti `[data-lato]` pesa di più e il segnavia spariva su metà delle voci) |
| **649** | `.talos-chat-foot > *`: `- 46px` → `- var(--talos-turno-coda)` |
| **681** | `.talos-turn`: `grid-template-columns: 0 minmax(0,1fr) var(--talos-turno-coda)` (valore identico, fonte unica) |
| **795-817** | BC-10: il blocco di commento con la misura, la formula nuova di `--talos-respiro-pieno` e il `padding-left` con **tre** termini |

### `harness-ui/frontend/tests/unit/cronologia.test.mjs`

Da **5** prove a **18**, con la metà «al contrario» dove serve.

### Non toccati

`legacy/app.js` **non è stato modificato**: la cura dello scroll-spy sta nel componente
(`contenitoreCheScorre`), perché è il componente a sapere di che cosa ha bisogno.
`index.template.html`, `desktop-final.css`, `theme-studio.js`, `avvio-sessione.js`, `fonti-modelli.js`,
`mockup-td.css`, `harness-ui/src/`, `mobile/`, `control-plane/`, `core/`, `docs/`: **intatti**.
`git status` mostra **tre soli file modificati**.

---

## 6. Test

| Cosa | Comando | Esito |
|---|---|---|
| Suite unitaria del frontend | `npm run test:unit` | **947 verdi su 947**, 0 rossi, 5,5 s |
| Prove della cronologia | incluse sopra | **18 verdi** (erano 5) |
| Cancello errori a runtime | `nessun-errore-a-runtime.spec.mjs` sul **banco 4186** | **rosso, per un difetto NON mio** — vedi sotto |

Le prove nuove, nei due versi:

- una voce per **turno**, i due lati, ognuna col **testo suo** (e «diverso da quello dell'altro»);
- **dal DOM**: tre turni → tre voci; i due giri del turno di TALOS **non** fanno due voci; il
  ragionamento **non** finisce nel fumetto (CB-03); gli attrezzi sono la somma dei giri;
- **al contrario**: una nota di sistema e una bolla d'attesa **non** diventano voci; una chat senza turni
  non inventa niente;
- il taglio tiene le **ultime** voci e le rinumera (con le prime, rosso);
- «in corso» solo sull'**ultima** voce, e chi lo perde non resta a dire «sta rispondendo»;
- `scorrimentoPerVedere` sotto, sopra, fermo, senza niente da scorrere, ai due fondi corsa, con misure
  assurde;
- lo scroll-spy si aggancia al **contenitore che scorre**, e senza antenato ricade su quello che c'è;
- il DOM finto **lancia** su un selettore che non conosce: un finto permissivo avrebbe fatto passare
  proprio il tipo di difetto che stiamo curando.

### Il cancello rosso, per intero

`RUNTIME-01` fallisce sul banco con due righe per caricamento:

```
console: Failed to load resource: the server responded with a status of 400 (Bad Request)
→ GET /api/v1/sessions/<id>/tree?percorso=      (parametro VUOTO)
```

⛔ **Non è un errore JavaScript e non è mio.** Misurato nei due giri del banco, con lo stesso filtro:
**prima 16 rilevazioni, dopo 16 rilevazioni, identiche; `pageerror` = 0 in entrambi.**
Non ho ammorbidito il cancello e non ho toccato quella rotta.

---

## 7. Foto — `.claude/foto-bc08-bc10-2026-09-12/` (29 immagini + 2 file di misure)

Tutte scattate sul banco 4186, temi **chiaro e scuro**, **1440×900** e **1024×800**, sessione **corta**
(3 scambi) e **lunga** (60 scambi), modalità **normale** e **a tutta larghezza**.

- `dopo-<viewport>-<tema>-<larghezza>-<sessione>.png` — le 16 viste dopo la cura;
- `prima-…-piena-lunga.png` (4) e `prima-1440x900-light-normale-lunga.png` — per il confronto;
- `barra-{dark,light}.png` — la barra da vicino, scala 3;
- `fumetto-{tua,sua}-{dark,light}.png` — il fumetto su una voce tua e su una sua;
- `segue-la-lettura-{dark,light}.png` — la barra dopo aver scorso la chat;
- `misure-prima.json`, `misure-dopo.json` — tutte le misure grezze.

### Quello che ho visto guardandole, **compreso fuori dal mio tema**

**Del mio lavoro**

1. ✔ La «treccia» si legge: a riposo i segni tuoi stanno a destra e i suoi a sinistra, 20 px di
   distanza su una pista di 26 — si capisce chi parla senza leggere niente.
2. ✔ A tutta larghezza i due vuoti sono uguali a occhio, e la misura lo conferma (46/46, 67/67).
3. ⚠️ In **tema scuro** il segno tuo (accento `#c08b3c` al 50%) è **leggermente meno presente** di quello
   di TALOS (`#9c9da2` al 50%): a parità di opacità l'accento affonda di più sul fondo `#1e1f22`.
   Leggibile, ma se l'owner lo vuole più marcato basta portare il tuo al 65-70% — **non l'ho fatto** per
   non alterare il linguaggio a riposo del sistema di design senza il suo sì.
4. ⚠️ Il fumetto di una voce **in fondo** alla barra copre il compositore (è centrato sulla voce e la
   voce sta in basso). Non è nuovo e non nasconde nulla di interattivo mentre il mouse è lì, ma su una
   finestra bassa potrebbe uscire dal viewport: **non verificato** sotto gli 800 px di altezza.

**Fuori dal mio tema (registrati, NON corretti)**

5. ⛔ Il piede della barra laterale scrive `C:UsersAntoninoDesktopprojectsharness-desktop`: **i
   backslash del percorso spariscono**. Visibile in tutte le 16 foto.
6. ⛔ A 1440×900 **fuori** da «tutta larghezza», con la colonna dei dettagli aperta, il testo entra
   **8 px DENTRO** l'area della barra (sinistra dalla barra = **−8 px**, destra = 90 px). È lo stesso
   difetto di BC-10 nell'altra modalità. L'ordine del 12/09 dice «in modalità chat a tutta larghezza»,
   e la consegna chiede che fuori da lì **nulla cambi**: l'ho misurato, non l'ho toccato.
7. ⛔ «Indice dei giri» nella colonna dei dettagli scrive `0 attrezzi` su quasi tutte le righe di
   risposta, e alterna `tuo messaggio` / `Risposta` — leggibile ma povero rispetto al fumetto nuovo.

---

## 8. Difetti veri trovati per strada (registrati, non chiusi)

1. ⛔⛔ **Una sessione conclusa si ridisegna con decine di giri «in corso».**
   Misurato sul banco sintetico: **59 tick `--current` su 60 turni**. Poi verificato su una **sessione
   VERA dell'owner** (copia in uno store a parte, porta 4187, **nessuna foto**, copia cancellata subito
   dopo): **21 tick `--current` su 56**. Causa: a `RunFinished`, `aggiornaTickGiro()` tocca solo
   `conversation.lastElementChild`, e nel replay gli altri turni restano com'erano.
   Curato **solo a valle**, nella barra («in corso» vale solo per l'ultimo turno): senza quella riga il
   colore «in corso» copriva quasi tutte le voci di TALOS e cancellava la distinzione fra i lati, cioè
   proprio BC-08. **La cura a monte è in `app.js` e vuole un sì dell'owner.**
2. ⛔⛔ **`#conversation` è la COLONNA, non lo scorrevole.** `bridge/legacy-dom.js` righe 154-155 dà la
   **classe** `conversation` allo scorrevole e l'**id** `conversation` alla colonna. Conseguenza misurata:
   `nav.dataset.attivaVera` è rimasto **`undefined` per tutta la vita di questa barra** — il segnavia non
   ha mai seguito la lettura, si muoveva solo col clic e col passaggio del mouse. Curato nel componente.
   ⚠️ **Altri chiamanti di `$('#conversation')` che si aspettano lo scorrevole vanno riguardati** — per
   esempio `app.js:14181` (`aggiornaSeparatoreContesto`). Non l'ho fatto: fuori dal mandato.
3. ⛔ `GET /api/v1/sessions/:id/tree?percorso=` parte con il **parametro vuoto** e prende **400** a ogni
   apertura di sessione. Rende rosso `RUNTIME-01` su qualunque banco.
4. ⛔ Il selettore `.talos-conversation` combacia con **due** elementi (la chat e lo stato vuoto): chi
   scrive sonde deve usare `.talos-conversation.conversation`. Mi ha fatto fallire una sonda.
5. ℹ️ Il percorso del piede della sidebar senza backslash (punto 5 sopra).

---

## 9. Cosa NON ho verificato

- **Nessun giro vero col modello**: niente provider cloud, per ordine. Tutte le sessioni del banco sono
  sintetiche, scritte da me (`genera-sessioni.mjs`), con la FORMA degli eventi campionata dai file veri.
- **Il 4174 dell'owner non è mai stato aperto**: la cura non è stata vista sulla sua app.
- **La tastiera non è stata provata a schermo.** Ho verificato dal vivo che ci sia **una sola fermata di
  Tab** e che `aria-current` segua la lettura; frecce, Home e Fine sono coperte solo dal codice e dalla
  lettura del sorgente, **non da un gesto vero**.
- **`prefers-reduced-motion`**: il codice lo rispetta come prima, ma non ho fotografato quella modalità.
- **Sessioni con allegati, approvazioni, diff, artefatti, immagini**: il banco sintetico ha solo testo e
  attrezzi. Il comportamento della barra su quei blocchi non è stato osservato.
- **Altezze di finestra sotto 800 px** e larghezze sopra 1440: non misurate.
- **`npm run verify:all` e `test:componenti`**: non lanciati (fuori consegna).
- Il **conteggio di partenza** della suite unitaria prima delle mie modifiche non l'ho preso: posso dire
  947/947 verdi dopo, e 5→18 prove nel file della cronologia, non «+N sul totale».

## 10. Nota sul banco (da sapere)

La cartella di scratch `…/scratchpad/banco/` era **preesistente**, usata da sessioni precedenti, e il suo
`store/` conteneva già **due copie di sessioni vere dell'owner** (`8dde6bff…`, `da4fe957…`). Le ho tolte
dal mio store per non fotografare il suo contenuto; **gli originali in `harness-ui/.sessions-store/` non
sono stati toccati** (lì ho solo letto). Il server del banco è stato **fermato** (PID 20560 su 4186, e PID
33568 su 4187 per la verifica sulla sessione vera): nessun processo mio è rimasto acceso.
⚠️ Sulla porta **4177** c'è un server di **un'altra sessione** (PID 22504): non l'ho toccato.

---

## 11. Proposta di messaggio di commit

```
fix(barra): la navigazione della conversazione elenca anche le sue risposte, e i due margini tornano uguali

BC-08 — una voce era un GIRO, non un messaggio: un turno di TALOS con n giri dava n voci
con lo stesso elemento e tutte col testo della PERSONA (misurato: 179 voci per 120 turni).
Ora una voce = un turno, i due lati si distinguono per geometria (il tuo segno a destra, il
suo a sinistra, come nella chat) e per colore (accento contro neutro; via il verde, che vuol
dire «riuscito» su un messaggio che non ha esito), il clic porta a QUEL messaggio e il
fumetto ne mostra le prime parole. Quando le voci non ci stanno: riga fissa, lista che
scorre e barra agganciata alla lettura — niente gruppi, niente segmenti schiacciati.
Il tetto teneva le voci PIÙ VECCHIE: ora tiene le ultime, e sale a 400.

BC-10 — la cura dell'11/09 pareggiava la colonna, non il testo: `.talos-turn` tiene a destra
una coda vuota di 46 px che non entrava nel conto. Il numero diventa un token e i margini lo
leggono. Misurato a 1440x900 a tutta larghezza: 18/64 -> 46/46; a 1024x800: 44/90 -> 67/67,
testo invariato. Fuori da «tutta larghezza» nessuna misura cambia.

Trovati misurando, curati a valle o registrati: lo scroll-spy era attaccato alla COLONNA
(`#conversation` è la colonna, la classe `conversation` è lo scorrevole — legacy-dom 154-155),
quindi il segnavia non ha mai seguito la lettura; e una sessione conclusa si ridisegna con
decine di giri «in corso» (21 su 56 su una sessione vera) — qui «in corso» vale solo per
l'ultimo turno, la cura a monte resta aperta.

Fonti (lette il 12/09/2026): LibreChat, client/src/components/Chat/Messages/MessageNav.tsx
(ramo dev) e PR #13853 «MessageNav Terminus», chiusa il 19/06/2026 — indicizza utente E
assistente, riga fissa RIB_ROW_HEIGHT 6, tetto min(24rem,…) con overflow-y-auto, nessun
raggruppamento, scroll-spy congelato durante l'interazione (interactingRef), roving tab-stop
+ Home/End; WAI-ARIA APG «Landmarks/Navigation»; MDN «aria-current» (location per uno
scroll-spy); nel repo, inspector.js/righeGiri() che elenca entrambi i lati da D-10A (10/09,
opencode #25910); Hermes Agent (Nous Research), pagina di prodotto: nessuna barra di
navigazione documentata. ⛔ WebSearch esaurita per la sessione (200/200): fonti dirette.

Prove: 947/947 unitarie verdi; nella cronologia da 5 a 18 prove, nei due versi.
Banco su porta 4186 con store sintetico, mai il 4174. Rapporto e 29 foto (chiaro e scuro,
1440x900 e 1024x800, sessione corta e lunga, normale e a tutta larghezza) in
.claude/RAPPORTO-BC08-BC10-BARRA-CONVERSAZIONE-2026-09-12.md
```

---

## 12. Chiusura

**Cosa deve fare l'owner**

1. Guardare `dopo-1440x900-dark-piena-lunga.png` e `dopo-1440x900-light-piena-lunga.png` accanto alle
   `prima-…` e dire **sì o no** sulla treccia (tuo a destra in accento, suo a sinistra in neutro).
2. Dire se vuole il segno **tuo più marcato** in tema scuro (65-70% invece di 50%): **sì / no / dopo**.
3. Dare il via — o no — su **due cose fuori dal mandato**: (a) la cura a monte dei giri «in corso» in
   `app.js`; (b) i **−8 px** di collisione che restano **fuori** da «tutta larghezza» a 1440×900.
4. Dire quando fare **commit e push**: non ho fatto né l'uno né l'altro.

**Cosa faccio io**

Niente, finché non risponde: la riga è finita, misurata e provata, i file sono su disco e il banco è
spento. Al suo sì applico la variante del colore e/o le due cure fuori mandato, con la stessa misura
prima/dopo.

**Cosa rimane**

Il giro vero col modello e la verifica sul 4174 (non autorizzati qui). La tastiera provata solo nel
codice, non con un gesto. Le sessioni con allegati, approvazioni e diff mai osservate nella barra.
I cinque difetti del §8, tutti aperti tranne i due curati a valle. E `RUNTIME-01` resta rosso finché
qualcuno corregge `?percorso=` vuoto.
