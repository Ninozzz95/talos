# I 7 secondi residui erano LAYOUT THRASHING — misura, fonti, cura, misura

**11/09/2026 · lane `lane/harness-desktop` · sessione di prova `8dde6bff-c463-4794-b6b9-7ddb4f5ce885`**

Seguito di `.claude/RAPPORTO-SESSIONE-LENTA-2026-09-11.md` §6: là la cura lato server (coalescenza
del replay SSE, già committata) aveva portato l'apertura da 20.157 a 7.083 ms, e i due diff per
`frontend/src/legacy/app.js` erano **scritti e non applicati**. Qui sono applicati — **adattati**,
perché uno dei due, preso alla lettera, avrebbe **cancellato dalla chat il blocco argomenti di ogni
attrezzo** (§4.2).

**In una riga:** A/B pulito sullo stesso albero, mediana di 3 giri — il main thread bloccato passa da
**3.199 ms a 750 ms (−77%)**, il primo frame stabile da **3.425 a 911 ms (−73%)**, con **a schermo
esattamente lo stesso contenuto** (916.907 caratteri, impronta `cdd64de4`, 213 righe attrezzo, 614
blocchi di codice, 43 collassabili — identici prima e dopo). Nessun errore JavaScript nuovo.

---

## 1. Misura PRIMA — riprodotta oggi, non copiata dal rapporto precedente

### 1.1 Il banco (⛔ mai il 4174)

- Porta **4183** (prima) e **4184** (dopo), `TALOS_HARNESS_UI_SESSIONS_DIR` su una **copia** dello
  store con due sole sessioni: la lunga (**4.636.120 byte, 34.026 righe**) e `da4fe957` (669 righe)
  come parcheggio. `TALOS_HARNESS_UI_PUBLIC_DIR` su bundle costruiti in `%TEMP%`: il `public/` del
  repo **non è mai stato toccato**.
- Chrome **vero** via Playwright (`channel: 'chrome'`, `headless: false`) con
  `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
  --disable-background-timer-throttling`. Viewport **1440×900**. Mediana di **3 giri**.
- Protocollo del rapporto precedente §1.1: si **parcheggia sulla sessione corta** prima del clic
  (altrimenti il clic cade su una sessione già aperta e non riapre niente), e il **silenzio si
  misura DENTRO la pagina** (`performance.now() - ultimoMessaggio`), mai con un orologio esterno.
- Sonde in scratchpad, non nel repo: `sonda-apertura.mjs`, `sonda-profilo.mjs`, `sonda-foto.mjs`.

⛔ **Il bundle servito è quello vero.** Prima di misurare ho verificato che una build pulita di
`frontend/src` è **byte-identica** a `harness-ui/public/` (`app.js` `5190d9d4f508`, `index.html`
`47f517d50000`, `styles.css` `e5a94c4ccfe7`): il banco misura ciò che l'owner apre, non un cugino.

### 1.2 ⛔ Il primo A/B era CONTAMINATO — e l'ho scoperto confrontando i bundle

Il primo giro «dopo» era costruito **12 minuti dopo** quello «prima», e in mezzo un altro agente
aveva cambiato `src/components/ricerca.js`, `sezioni-adattatori.js`, `styles/mockup-td.css` e
aggiunto `ricerca-dettaglio.js`. Confronto degli asset: **`styles.css` DIVERSO** fra i due bundle, e
il bundle `app.js` differiva per **1.564 righe** invece delle ~165 mie.

⇒ Rifatto: `app.js` riportato a `HEAD` per un minuto, build «prima», `app.js` curato rimesso, build
«dopo». Prova che la coppia è pulita: `styles.css`, `avvio.js` e `index.html` **identici** fra i due
bundle. **Tutti i numeri qui sotto sono di questa coppia.**
È la lezione [[il-conteggio-di-una-suite-non-ermetica-non-e-una-prova]] applicata a una misura di
prestazioni: la baseline di stamattina (2.722 ms) e quella pulita (3.283 ms) differiscono del 20%
**senza che nessuna delle due sia sbagliata** — è cresciuto l'albero. Solo un A/B nello stesso
momento ha contenuto.

### 1.3 Dove è il costo — profilo CPU del renderer, non un'ipotesi

`Profiler` via CDP, campionamento **200 µs**, 13.845 campioni su 7,1 s di apertura. Self-time,
escluso l'idle:

| funzione | self-time | il rapporto del 11/09 diceva |
|---|---:|---:|
| `aggiornaSpazioCodaConversazione` (`app.js:704`) | **1.342 ms** | 1.463 ms |
| `fondoConversazioneInVista` (`app.js:8888`) | **586 ms** | 643 ms |
| `querySelectorAll` (nativa) | **489 ms** | 518 ms |

Riprodotto. E l'attribuzione **per chiamante** (che il rapporto precedente non aveva) dice da dove
arrivano davvero:

```
514 ms  fondoConversazioneInVista  <  aggiornaPiedeChatDaStato  <  aggiornaRiassuntoBatch
                                   <  handleRealEvent  <  source.onmessage
489 ms  querySelectorAll           <  vociDaConversazione  <  aggiornaCronologia   (components/, non mio)
```

⇒ Due catene diverse, un principio solo: **si legge il layout una volta per EVENTO invece che una
volta per FOTOGRAMMA**, su un albero da 19.482 nodi appena mutato.

---

## 2. Le fonti (lette l'11/09/2026, prima di scrivere una riga)

- **web.dev, «Avoid large, complex layouts and layout thrashing»** (agg. **07/05/2025**) — verbatim:
  «*you should always batch your style reads and do them first (where the browser can use the
  previous frame's layout values) and then do any writes*». Definisce il *layout thrashing* come più
  reflow sincroni forzati di fila, tipicamente in un ciclo che alterna lettura e scrittura.
- **webperf.tips, «Layout Thrashing and Forced Reflows»** (11/12/2022, agg. 12/12/2022) — «*when
  codepaths perform a forced reflow multiple times in quick succession within a frame*»; fra le
  sorgenti tipiche nomina esplicitamente **i MutationObserver** (oltre a cicli e `useEffect`), e
  indica **`requestAnimationFrame`** come il modo di orchestrare le letture fra i fotogrammi.
- **Paul Irish, «What forces layout/reflow»** (gist, agg. **09/09/2026**) — conferma alla fonte che
  `scrollTop`, `scrollHeight`, `clientHeight` e `offsetTop` forzano il layout **sia in lettura sia
  in scrittura**.

⛔ **Nota onesta sul metodo:** il budget di `WebSearch` della sessione era esaurito (200/200), quindi
le tre fonti sono state prese con `WebFetch` **diretto** sugli URL, non trovate con una ricerca. Le
date sopra sono quelle dichiarate dalle pagine il giorno in cui le ho lette.

---

## 3. La cura — tre interventi, un principio

⛔ File toccati: **solo** `harness-ui/frontend/src/legacy/app.js` (+165 −25) e un test nuovo in
`harness-ui/frontend/tests/unit/`. Nessun `index.template.html`, `components/`, `styles/`, `public/`.

### 3.1 `mantieniFondoDuranteRipristino` (`app.js:15667`) — il diff §6.1, applicato

Il `MutationObserver` chiamava `inFondo` **a ogni mutazione**, e `inFondo` legge `scrollHeight` e
scrive `scrollTop` dentro il callback. Ora il callback **marca soltanto** e la coppia
lettura+scrittura avviene **una volta per fotogramma**:

```js
const chiediFondo = () => {
  if (fondoChiesto || smesso) return;
  fondoChiesto = true;
  window.requestAnimationFrame(() => { fondoChiesto = false; inFondo(); });
};
const osservatore = new MutationObserver(chiediFondo);
```

⭐ Il guadagno non è solo il reflow: **ogni scrittura di `scrollTop` emette un evento `scroll`**, e a
valle quello ridisegna il piede della chat e ricalcola la cronologia. Tagliando le scritture si
taglia tutta la cascata.

⛔ Il fondo **finale** resta sincrono: `scopri()` e le due repliche (rAF + 250 ms) alla fine del
ripristino non sono state toccate — la promessa dell'owner («clicco una sessione e sono già in
fondo») non passa dal fotogramma. Misurato a pagina ferma: `scrollTop 8843 / scrollHeight 9544`,
cioè in fondo.

### 3.2 La rete di sicurezza a 8 s — ⛔ il diff del rapporto era SBAGLIATO, adattato

Il rapporto proponeva `Math.min(20_000, 8_000 + state.realSession.sequenzeViste.size * 2)`.
**Non poteva funzionare:** quell'espressione è valutata **quando si programma il timer**, cioè
all'inizio del ripristino, quando `sequenzeViste` è ancora **vuota** — sarebbe valsa **sempre
8.000**. Adattato con la stessa intenzione, ma misurando davvero:

```js
const reteDiSicurezza = () => {
  if (smesso) return;
  const fermoDa = performance.now() - ultimoEventoNuovo;   // aggiornato dall'intervallo già esistente
  if (fermoDa < 1_000 && performance.now() - inizioRipristino < 20_000) { window.setTimeout(reteDiSicurezza, 500); return; }
  scopri();
};
window.setTimeout(reteDiSicurezza, 8_000);
```

Per una cronologia corta il comportamento è **identico a prima** (a 8 s non arriva più niente da un
pezzo ⇒ si scopre subito); per una lunga si aspetta finché il replay porta eventi, **al massimo 20 s**.
`ultimoEventoNuovo` si aggiorna leggendo `.size` dentro l'intervallo da 200 ms che c'era già:
nessun timer in più.

### 3.3 `case 'ToolCallArgs'` (`app.js:14445`) — il diff §6.2, **NON** applicabile alla lettera

Il rapporto proponeva `if (deferHistoricalRendering) break;` «con il disegno rimandato a
`ToolCallResult`, dove `info.argomenti` è completo».

⛔ **Verificato contro il codice di oggi: `ToolCallResult` non disegna gli argomenti.** L'unico
chiamante di `renderizzaArgomentiAttrezzo` in tutto il file è il ramo `ToolCallArgs`;
`ToolCallResult` **appende** l'esito dentro `info.detail` e basta. Il diff alla lettera avrebbe
tolto il blocco argomenti da **ogni riga attrezzo di ogni sessione conclusa** — cioè avrebbe fatto
sparire 213 righe e 210.691 caratteri dalla chat, esattamente ciò che il verso contrario di §5.1
esiste per impedire. E `info.argomentiParsati`, che `ToolCallResult` usa per il riassunto della
riga, sarebbe rimasto `null`.

Applicato invece lo **stesso principio** in forma sicura (`app.js:14003-14063`):

- il corpo che disegnava a ogni delta è diventato `aggiornaVistaArgomentiAttrezzo(info)` — **identico
  riga per riga**, compreso il ramo PO-06 del comando della persona;
- durante un replay il ramo accumula il testo e chiama `chiediDisegnoArgomentiAttrezzo(info)`, che
  disegna **una volta per fotogramma** tutte le tool-call in attesa (una sola `JSON.parse`, una sola
  ricostruzione del sottoalbero invece di 3.411 per la tool-call più grossa);
- **dal vivo non cambia niente**: senza replay in corso si disegna subito, delta per delta — quella
  grana è il prodotto;
- ⛔ `renderizzaArgomentiAttrezzo` fa `replaceChildren()`: `ToolCallOutput` e `ToolCallResult`
  **saldano la coda** (`disegnaArgomentiSeInAttesa(info)`) **prima** di scrivere in `info.detail`,
  altrimenti un disegno differito in ritardo cancellerebbe l'uscita o l'esito. Non è
  un'ottimizzazione: è la condizione perché a schermo resti lo stesso contenuto.

Inoltre il **secondo** `JSON.parse` è sparito: `renderizzaArgomentiAttrezzo` prende un terzo
parametro opzionale (`argomentiGiaParsati`) e salta il proprio parse quando lo riceve. Chi chiama con
due argomenti continua a funzionare come prima.

### 3.4 `fondoConversazioneInVista` (`app.js:8888`) — la terza cura, **nata dalla misura DOPO**

Applicate le prime due, il profilo ha detto una cosa che nessuno aveva previsto:
`aggiornaSpazioCodaConversazione` era sceso a **3,8 ms** (da 1.342), ma
`fondoConversazioneInVista` era **salita a 1.343 ms** — il costo del reflow non era sparito, si era
**spostato su chi tocca il layout per primo dopo le mutazioni**. Attribuzione: chiamata da
`aggiornaPiedeChatDaStato` ← `aggiornaRiassuntoBatch` (881 ms) e ← `aggiornaComposerUsage` (363 ms),
dentro `handleRealEvent`, cioè **una volta per evento**.

La risposta descrive ciò che la persona **vede**, e fra due letture nello stesso fotogramma la
persona non ha visto niente di nuovo: nessun paint è avvenuto in mezzo. Quindi il valore si calcola
una volta per fotogramma, con la memoria buttata al fotogramma dopo (`requestAnimationFrame`) **e
comunque dopo 250 ms** — la seconda scadenza serve a una scheda in secondo piano, dove il rAF non
arriva e un valore vecchio resterebbe vecchio per sempre. Nessun giro di rAF perpetuo: si prenota
solo quando c'è una risposta da buttare.

---

## 4. Misura DOPO — A/B pulito, stesso albero, mediana di 3

| | **prima** (`app.js` di HEAD) | **dopo** (solo il mio `app.js`) | |
|---|---:|---:|---:|
| **primo frame stabile** | 3.425 ms | **911 ms** | **−73%** |
| fine del replay | 3.283 ms | **840 ms** | −74% |
| chat scoperta (`is-restoring` via) | 3.386 ms | **859 ms** | −75% |
| **main thread bloccato** (2 long task) | 3.199 ms | **750 ms** | **−77%** |
| long task più lungo | 2.659 ms | **596 ms** | −78% |
| fotogramma peggiore | 2.685,5 ms | **620,3 ms** | −77% |
| messaggi SSE · byte | 1.391 · 1,07 MB | 1.391 · 1,07 MB | = |
| primo messaggio dal clic | 53 ms | 58 ms | = |

Profilo CPU dopo: **nessuna delle tre funzioni compare più in classifica**. La prima voce residua è
`querySelectorAll` **410 ms**, da `vociDaConversazione ← aggiornaCronologia` — cioè
`src/components/`, **non la mia lane oggi** (§7).

### 4.1 ⛔ Il verso contrario che conta: lo stesso contenuto a schermo

Impronta del DOM della conversazione, presa a pagina ferma, **in tutti e sei i giri**:

| | caratteri | hash | testo visibile | righe attrezzo | caratteri argomenti | `<details>` | `<pre>` | nodi |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| prima | 916.907 | `cdd64de4` | 15.887 (`84f2ebe8`) | 213 | 210.691 (`cf66e385`) | 43 | 614 | 19.469/19.482 |
| dopo | **916.907** | **`cdd64de4`** | **15.887 (`84f2ebe8`)** | **213** | **210.691 (`cf66e385`)** | **43** | **614** | 19.482 |

**Identica.** Il conteggio `caratteri` è `textContent` (indipendente dal layout), `testo visibile` è
`innerText` (dipende da ciò che è davvero mostrato): coincidono entrambi, e con loro l'impronta
degli argomenti degli attrezzi — cioè proprio la parte che la cura di §3.3 avrebbe potuto perdere.
I 916.907 caratteri combaciano con quelli misurati dal rapporto precedente su un altro banco.

### 4.2 Foto — tema chiaro E tema scuro (owner 11/09)

`scratchpad/banco/foto/`: `dopo-dark-1200ms.png`, `dopo-dark-ferma.png`, `dopo-light-1200ms.png`,
`dopo-light-ferma.png` (1440×900, durante l'apertura e a pagina ferma). In entrambi i temi la
conversazione è piena, in fondo, con la riga di errore finale leggibile; **zero errori JavaScript**
in pagina.

### 4.3 ⭐ Il difetto §5.3 del rapporto precedente NON c'è più in questo albero

Il rapporto di stamattina segnalava la colonna della chat **alta 42 px** su un contenitore da 806, e
chiedeva all'owner se sul 4174 si vedesse. Misurata oggi la stessa catena, sullo stesso albero:

```
900px  body → 900px #app → 900px #centro → 900px #schermoChat
701px  .talos-conversation        (lo SCROLLER: clientHeight 701, scrollHeight 9544, scrollTop 8843)
9524px #conversation.talos-conversation__column
```

Lo scroller è alto **701 px**, non 42: la chat si vede e sta in fondo. ⇒ La domanda aperta di §8 si
può chiudere. ⭐ **E ha una conseguenza sulle misure:** le mie sono prese su un layout **sano**, con
i 19.482 nodi davvero impaginati e dipinti — non sono il limite inferiore di cui parlava §5.3.

---

## 5. Le prove

- **`npm run test:unit` → 743/743 verdi** (734 di prima + 9 nuovi), 0 rossi.
- **`tests/unit/replay-non-tocca-il-layout-a-ogni-evento.test.mjs`** (nuovo, 9 prove): ⛔ nessun test
  esistente toccato. Copre: il `MutationObserver` che marca invece di leggere-e-scrivere; il fondo
  finale che resta sincrono; la rete di sicurezza non più fissa e col tetto; `ToolCallArgs` che non
  disegna durante un replay **e che dal vivo disegna subito**; `ToolCallOutput`/`ToolCallResult` che
  saldano il disegno differito **prima** di scrivere in `detail`; il secondo `JSON.parse` sparito; la
  memoria per fotogramma con la sua scadenza.
- ⛔ **E che mordano l'ho provato**: ogni prova gira **anche su una copia GUASTA del sorgente** (la
  forma di ieri, rimessa a mano) e deve fallire — `morde(controllo, guasto)`. Un cancello che passa
  sia sul codice curato sia su quello malato non è un cancello.
  ⭐ Trovato così un difetto nel cancello stesso: `case 'ToolCallArgs'` compare **due volte** nel
  file (la prima è l'esportazione in markdown di una conversazione) e la prima stesura guardava
  quello sbagliato.
- **`tests/parity/nessun-errore-a-runtime.spec.mjs`** sul banco (`TALOS_URL_CANCELLO`, mai il 4174):
  **rosso su ENTRAMBE le porte, con gli stessi due identici errori** — `Framing 'https://arxiv.org/'
  violates … frame-ancestors 'none'` e un `400 Bad Request`. Sono **`console`**, non `pageerror`:
  **zero eccezioni JavaScript** prima e dopo. Li causa il contenuto dello store copiato (una sessione
  che apre arxiv.org nel pannello Browser), non il mio codice — il cancello è rosso allo stesso modo
  sul bundle di `HEAD`. **Non l'ho curato**: non è questa lane, ed è una proprietà del banco.

---

## 6. Che cosa NON ho verificato

- **Il 4174 e il Chrome reale dell'owner.** Banco su 4183/4184 con copia dello store, profilo Chrome
  pulito. Le sue preferenze, le sue estensioni e la sua accelerazione hardware spenta non ci sono.
- **Una sessione VIVA mentre il modello scrive.** Che il differimento valga solo per il replay è
  provato dal codice e dal cancello, **non da un giro vero** (nessun giro col modello, come da
  consegna). È il verso contrario che manca: vedere che dal vivo gli argomenti scorrono ancora
  delta per delta.
- **`ToolCallOutput` dal vivo.** La salda-prima-di-scrivere è provata dal cancello, ma in questo file
  di sessione i `ToolCallOutput` sono **zero**: quel ramo non è passato per il giro vero.
- **Una tool-call senza `ToolCallResult`** (sessione interrotta a metà chiamata): il disegno
  differito la copre per costruzione (la coda si svuota al fotogramma dopo, non aspetta l'esito), ma
  non l'ho riprodotta.
- **Le altre cinque sessioni sopra 18.000 righe**: stesso meccanismo, non riaperte una per una.
- **Viewport diverse da 1440×900** (laptop 1024×800 e il resto della matrice desktop).
- **Il costo residuo di `querySelectorAll` (410 ms)**: misurato e attribuito a
  `vociDaConversazione ← aggiornaCronologia` in `src/components/`, **non corretto** — non è la mia
  lane oggi. È l'ultimo pezzo grosso rimasto in apertura.
- **Il «vuoto muto a 3 s»** segnalato dal rapporto precedente: con la chat scoperta a 859 ms il
  vuoto dura ora meno di un secondo, ma **non ho aggiunto nessun segnale di caricamento**.
- **`git`**: nessun `add`, nessun `commit`, nessun `push`. `public/` non toccato.

---

## 7. Riepilogo

**Cosa devi fare tu**
- Dire se i tre interventi passano in commit così come sono, o se vuoi prima vederli girare sul 4174.
- Decidere chi prende il residuo `aggiornaCronologia`/`vociDaConversazione` (410 ms, `components/`):
  non è la mia lane.
- Sapere che la domanda aperta di stamattina (§5.3, chat alta 42 px) **in questo albero non si
  riproduce più**: lo scroller è 701 px su 900 e la chat è in fondo.

**Cosa faccio io**
- Riprendo da solo su ciò che resta nella mia lane, se dai il via.

**Cosa rimane**
- Il replay dal vivo con un modello vero: provato dai cancelli, non da un giro.
- `ToolCallOutput` coalescibile e mai esercitato da dati veri.
- Il segnale di caricamento durante il ripristino: non fatto.
- Il cancello `nessun-errore-a-runtime` è rosso sul banco per due errori **del contenuto dello
  store**, uguali prima e dopo.
