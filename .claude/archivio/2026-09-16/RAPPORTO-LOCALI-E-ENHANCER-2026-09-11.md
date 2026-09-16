# BC-13 (modelli locali istantanei) e BC-15 (prompt enhancer) — 11/09/2026

Lane `lane/harness-desktop`. Il mobile (`C:\Users\Antonino\Desktop\projects\AVM\mobile`) è stato
**solo letto**: nessuna scrittura fuori dalla mia lane.

**File toccati (tutti e soli):**

| file | cosa |
| --- | --- |
| `harness-ui/src/local-model-store.mjs` | BC-13: `list()` in parallelo + cache con due guardie |
| `harness-ui/tests/local-model-store.test.mjs` | BC-13: 8 prove nuove, 5 al verso contrario |
| `harness-ui/src/http-app.mjs` | BC-15: rotta NUOVA `POST /api/v1/sessions/:id/migliora-prompt` (nessuna rotta esistente toccata) |
| `harness-ui/tests/http-routes-migliora-prompt.test.mjs` | BC-15: 12 prove |
| `harness-ui/frontend/src/components/migliora-prompt.js` | BC-15: componente NUOVO |
| `harness-ui/frontend/tests/unit/migliora-prompt.test.mjs` | BC-15: 16 prove |

**Suite:** backend `2239 pass / 0 fail`, frontend `679 pass / 0 fail` (lanciate dopo l'ultima
modifica; il conteggio del backend è salito anche per test di altri agenti che lavorano in
parallelo sullo stesso albero).

⛔ Nessun `git add`, nessun commit, nessun push. La porta 4174 non è stata toccata: tutte le
misure girano su server miei, su porta effimera.

---

## COMPITO 1 — BC-13: i modelli locali istantanei

### Come lo fa il mobile (file:riga veri)

- `AVM/mobile/src/lib/models/localCatalogueSignal.ts:1-89` — il modulo che esiste per una
  frase sola: **«un elenco che non si aggiorna da solo è un elenco che mente finché qualcuno
  non lo interroga»**. Chi cambia il disco lo annuncia (`transfer-finished`, `imported`,
  `deleted`), chi mostra l'elenco rilegge. Owner mobile 05/08: «caricare **immediatamente** i
  modelli locali nel composer appena vengono scaricati, **senza premere refresh**».
  ⭐ E il caveat, scritto lì: *«il disco è l'unica fonte che non può essere in ritardo»* — il
  segnale non trasporta *quale* modello è cambiato, apposta, per non invitare a fidarsi della
  descrizione invece di guardare.
- `AVM/mobile/src/stores/chatController.ts:5500-5502` — l'ascoltatore rilegge **solo il
  fornitore locale**: «un giro su tutti i fornitori costerebbe una chiamata di rete a ciascuno
  per una notizia che riguarda una cartella».
- `AVM/mobile/src/stores/chatController.ts:5516-5518` — `await Promise.all(PROVIDER_IDS.map(…))`:
  **tutti i fornitori in parallelo, ognuno col proprio stato d'errore**. Il locale non sta mai
  dietro a un fornitore di rete.
- `AVM/mobile/src/components/talos/models/TalosMobileLocalModels.vue:572` e
  `TalosMobileModelLabHub.vue:188` — gli ascoltatori dal lato schermo.

⇒ Il principio, in una riga: **l'elenco locale non aspetta la rete, e si aggiorna da sé quando
il disco cambia.**

### Misura PRIMA (mediane; `scratchpad/misura-*.mjs`, macchina dell'owner, 11/09)

**(a) Il costo di leggere i manifest — `localModelStore.list()`**

| modelli | prima (`list()` in serie) |
| --- | --- |
| 2 (i modelli VERI in `.local-models/`) | 8,57 ms alla prima, poi **0,59 ms** |
| 50 (sintetici) | 34,27 / **34,14 ms** |
| 200 (sintetici) | 131,04 / **134,09 ms** |

`list()` faceva `await inspect(id)` dentro un `for`: **una lettura alla volta**, e ogni modello
costa due `readFile` (manifest + `.name.json`). ~0,67 ms per modello, sempre, a ogni richiesta.

**(b) Il costo vero visto dalla persona — la catena della UI**

Questo è il numero che conta, ed è **fuori dal server**. `frontend/src/legacy/app.js:5637-5659`:

```js
5641  const dati = await apiGet(`/api/v1/models${…}`);   // ← OpenRouter, RETE
5643  caricato = true;
5650  apiGet('/api/v1/local-models')                      // ← il disco, solo DOPO
5656  } catch (error) {                                   // ← e qui i locali non partono MAI
```

Misurato con un server mio su porta effimera (`scratchpad/misura-e2e2.mjs`), stessa catena:

| | i locali compaiono dopo |
| --- | --- |
| catalogo OpenRouter **freddo** (primo giro dopo l'avvio del server) | **361 ms** (358 + 3) |
| catalogo caldo (cache 10 min in memoria, `src/model-catalog.mjs:18`) | 6-9 ms |
| `/api/v1/local-models` **da solo** | **2-3 ms** |
| catalogo **irraggiungibile** | **mai** — si entra nel `catch` di riga 5656 e la scheda «Locali» resta su «Leggo i modelli installati…» |

⇒ **La scansione del disco non c'entrava quasi niente. Il tempo è tutto attesa di una chiamata
di rete che i modelli locali non usano** — e in assenza di rete l'attesa è infinita.

### Cura

**Nella mia lane (`src/local-model-store.mjs`), fatta:**

1. **Letture in parallelo, con la concorrenza limitata.** `mappaConLimite(…, 32, …)`.
   Misurato (`scratchpad/misura-concorrenza.mjs`, 10 giri per riga):

   | manifest | 1 | 8 | 16 | **32** | 64 | ∞ |
   | --- | --- | --- | --- | --- | --- | --- |
   | 200 | 119,02 | 24,20 | 22,72 | **22,38** | 22,78 | 25,04 |
   | 1000 | 626,73 | 134,52 | 129,29 | **126,65** | 122,62 | 126,67 |

   L'altopiano arriva già a 16; `Infinity` è perfino **peggio** di 32 su 200 (25,04 contro
   22,38) e sarebbe il modo classico di arrivare a `EMFILE`
   (ricerca 11/09: oneuptime.com «How to Fix Error: EMFILE: too many open files in Node.js»,
   22/01/2026; latchkey.dev «Node.js EMFILE — Fix the File-Descriptor Limit»: la cura è una coda
   a concorrenza limitata, non alzare il tetto dei descrittori).

2. **La cache con DUE guardie — il `localCatalogueSignal` del mobile, ridotto all'osso.**
   Qui chi scrive e chi legge sono lo stesso oggetto, quindi l'annuncio è un contatore
   (`revisione`) che `persist()`, `remove()` e `renameModel()` alzano. Per ciò che cambia **da
   fuori** c'è il `mtime` della cartella dei manifest.
   ⛔ Il comportamento del `mtime` è **misurato**, non dedotto (Microsoft Learn «File Times»
   parla dei tempi del FILE, non della cartella) — `scratchpad/misura-varianti.mjs`, NTFS di
   questa macchina:

   | operazione | il mtime della cartella |
   | --- | --- |
   | aggiunta di una voce | **cambia** ✔ |
   | `rename` di una voce dentro | **cambia** ✔ |
   | riscrittura IN LOCO | **non cambia** ✘ |

   Il terzo caso non ci tocca: questo store scrive **sempre** su un temporaneo e poi fa
   `rename` (la scrittura atomica che già c'era). E se un giorno qualcuno riscrivesse in loco
   da dentro, lo prende il contatore: le due guardie coprono buchi diversi.

3. `list({ fresco: true })` salta la cache, per chi ha una ragione che lo store non può
   conoscere.

**Fuori dalla mia lane (DA FARE, descritto qui con file:riga):** vedi §«L'aggancio» qui sotto.

### Misura DOPO

| modelli | prima | dopo (a regime) | fattore |
| --- | --- | --- | --- |
| 2 (reali) | 0,59 ms | **0,04 ms** | 15× |
| 50 | 34,14 ms | **0,13 ms** | 263× |
| 200 | 134,09 ms | **0,39 ms** | 344× |
| 200, cache FREDDA (prima lettura) | 131,04 ms | **26,67 ms** | 4,9× |

Il costo della guardia è **0,03 ms** (uno `stat` della cartella); il `structuredClone`
dell'elenco in cache costa 0,077 ms su 50, 0,297 su 200, 1,678 su 1000 — si paga per non
cambiare il contratto: prima di oggi ogni `list()` consegnava oggetti freschi, e chi chiama ha
il diritto di maneggiarli.

Via HTTP la rotta `/api/v1/local-models` è ora **2-3 ms**, cioè tutto overhead del server HTTP:
il lavoro dello store è sceso sotto il rumore. Ne beneficia anche
`server.mjs:261` (`listModels` del runtime locale), che chiama lo stesso `list()`.

### L'aggancio che serve, e che NON ho fatto (app.js è di un'altra lane oggi)

**`harness-ui/frontend/src/legacy/app.js:5637-5659`, funzione `carica()` del selettore modelli.**
Due modifiche, entrambe di poche righe:

1. **Riga 5641 + 5650 — i locali non aspettano OpenRouter.** Spostare
   `apiGet('/api/v1/local-models')` **prima** dell'`await` del catalogo, cioè partire con le due
   richieste insieme:

   ```js
   const localiInVolo = apiGet('/api/v1/local-models')
     .then((locali) => { modelliLocali = Array.isArray(locali?.items) ? locali.items : []; renderFonti(); if (fonteScelta === 'locali') renderListaLocali(); })
     .catch(() => { modelliLocali = []; renderFonti(); if (fonteScelta === 'locali') renderListaLocali(); });
   try { const dati = await apiGet(`/api/v1/models${forza ? '?forza=1' : ''}`); … }
   ```

   Guadagno misurato: **361 ms → 3 ms** al primo giro, e la scheda «Locali» smette di dipendere
   dalla rete.

2. **Riga 5656 — il `catch` non deve spegnere i locali.** Oggi se `/api/v1/models` fallisce si
   entra nel `catch` e la riga 5650 **non viene mai eseguita**: senza rete, i modelli che girano
   su questo computer non compaiono. Col punto 1 il problema sparisce da sé, ma va detto perché
   è il difetto peggiore dei due (non è lentezza: è assenza).

3. **Facoltativo, il resto del principio mobile:** un ricaricamento dei soli locali quando il
   disco cambia. Sul desktop il segnale c'è già lato server —
   `/api/v1/huggingface/downloads` viene già interrogato in `app.js:3201` e chiama
   `caricaModelliLocaliModelLab()` quando un download è `ready`; basterebbe che quella stessa
   notizia arrivasse anche al selettore.

⚠️ **Coordinamento:** un altro agente sta riscrivendo proprio le schede del selettore
(`harness-ui/frontend/src/components/fonti-modelli.js`, BC-12, «Diretti per fornitore»). Il
punto 1 va applicato insieme a quel lavoro, non in conflitto con esso.

### Cosa NON ho verificato (BC-13)

- **Non ho misurato dal browser vero.** I numeri della catena vengono da un client `fetch` in
  Node contro un server mio; il tempo di `render` del pannello e il costo di parsing dei 443
  modelli OpenRouter **nel browser dell'owner** non sono misurati.
- **Non ho una misura su un parco modelli grande VERO.** Sul disco ce ne sono **2**: 50, 200 e
  1000 sono manifest sintetici. La forma della curva è misurata, il caso reale dell'owner no.
- **La guardia sul `mtime` ha un punto cieco sotto il millisecondo**: due scritture da processi
  diversi nello stesso tick della risoluzione di `mtimeMs` potrebbero non muoverlo. Il contatore
  copre tutto ciò che passa dallo store; questo residuo riguarda solo scritture esterne
  ravvicinate. `BC-13-CACHE-05` (scrittura da fuori) è passato **10 volte su 10**.
- Non ho toccato `local-runtime-*.mjs`: `/api/v1/runtime` (che fa `detect()` + `listModels()`
  per ogni runtime) **non è nella catena della scheda «Locali»** — la usa solo il Laboratorio
  modelli (`app.js:3130`).

---

## COMPITO 2 — BC-15: il prompt enhancer

### Come lo fa il mobile (file:riga veri)

| cosa | dove |
| --- | --- |
| prompt di sistema (inglese, JSON in uscita, «untrusted data to rewrite») | `AVM/mobile/src/lib/chat/promptEnhancement.ts:22-35` |
| payload `enhance_prompt`, tetto 12.000 caratteri | `…/promptEnhancement.ts:126-151` |
| lettura difensiva della risposta (recinto markdown, zod, tetti) | `…/promptEnhancement.ts:153-185` |
| il giro completo, con la chiave oscurata negli errori | `…/promptEnhancement.ts:187-262` |
| i TRE livelli e il perché non è un cursore | `AVM/mobile/src/lib/chat/promptEnhancerDepth.ts:6-17` |
| il livello attaccato **in fondo** al sistema, e perché | `…/promptEnhancerDepth.ts:53-62` |
| pannello: setup → attesa → errore → esito | `AVM/mobile/src/components/chat/TalosMobileEnhancerDrawer.vue:54-98` |
| setup: prima «quanto», poi «chi» | `AVM/mobile/src/components/chat/TalosMobileEnhancerSetup.vue:9-23` |
| esito: provenienza, sintesi a 2 righe, pillole, Annulla/Inserisci/Sostituisci | `AVM/mobile/src/components/chat/TalosMobilePromptEnhancerPopover.vue` |

### Misura prima

Non c'era niente da misurare: sul desktop **il prompt enhancer non esisteva**. Nessuna rotta,
nessun componente, nessun pulsante (`grep -n enhance frontend/index.template.html` → niente).

L'unica traccia era `frontend/src/legacy/app.js:17435`, dentro la tabella dei messaggi delle
superfici **non collegate**:

```js
enhance: ['Miglioramento demo', 'Nessun modello è stato chiamato.'],
'enhance-blocked': ['Miglioramento non collegato', 'Questa superficie resta locale.'],
```

cioè il buco era già **nominato e dichiarato onesto** — nessun pulsante lo raggiungeva. Ora c'è
la cosa vera; quelle due righe restano lì e vanno tolte da chi collega il pulsante, insieme
all'aggancio descritto più sotto.

### Cura

**Rotta nuova — `POST /api/v1/sessions/:id/migliora-prompt`** (`src/http-app.mjs`, subito dopo
`/compact`; inventario rotte aggiornato, `tests/http-inventario-rotte.test.mjs` verde).

- Corpo: `{ prompt, profondita? }` — `profondita` ∈ `concisa|equilibrata|estesa`, e i nomi
  inglesi del mobile (`concise|balanced|extended`) valgono come **sinonimi**, così un client
  condiviso fra desktop e mobile non deve tradurre.
- Risposta: `{ promptMigliorato, sintesi, principi[], promptOriginale, profondita, modello, fornitore }`.
- **Il modello è quello della SESSIONE**, letto da `sessionRegistry.leggiSessioneContesto()`
  (`src/session-registry.mjs:2955`, il lettore «backend-only, nessuna credenziale»). La rotta
  non sceglie niente e non accetta un modello da fuori.
- **Due mondi.** Sessione locale (`provider:'local'` + `runtimeId`) → `localRuntimes[runtimeId].generateStream`,
  senza rete e senza costo. Sessione cloud → OpenRouter, con la chiave presa da `providerStore`
  e mai altrove.
- **Niente stream**: o il prompt riscritto è completo e leggibile, o non serve a niente. Mezzo
  JSON a schermo è il difetto (lezione «lo screenshot va scattato DURANTE», 21/8), non la cura.
- **Niente `response_format: {type:'json_object'}`.** Ricerca 11/09 (dev.to «OpenRouter
  Structured Output Broke Before Translation Quality Did — 3 Layers of Defense for Production»;
  prism-php/prism #644; docs.langchain.com «ChatOpenRouter»): OpenRouter instrada su fornitori
  diversi e con il routing multi-modello **le capacità del backend vero non si conoscono al
  momento della richiesta** — un campo che un fornitore rifiuta trasformerebbe un miglioramento
  in un 400. Si chiede il JSON nel prompt e si legge in modo difensivo: recinto markdown via,
  poi il blocco fra la prima `{` e l'ultima `}`, poi validazione delle chiavi.
- **Il segreto non esce mai**: `messaggioSenzaChiave()` toglie la chiave da qualunque messaggio
  d'errore, anche quando è il fornitore a rimandarla indietro. Provato (`BC-15-06`).

⛔ **Difetto trovato scrivendo il test, e curato:** il limite globale del corpo è
**4.096 byte** (`src/http-app.mjs:21`), quindi il tetto di 12.000 caratteri ereditato dal mobile
era **irraggiungibile** — un prompt lungo moriva con un 413 e la connessione chiusa, molto prima
che qualcuno potesse dirgli «è troppo lungo». Ora la rotta ha il suo limite (64 KB), come già
fanno le immagini (7 MB) e l'albero (16 KB). Il conto vero resta sui **caratteri**.

**Componente nuovo — `frontend/src/components/migliora-prompt.js`.**

Quattro stati in un pannello solo (scelta → attesa → errore → esito), come il drawer mobile.
Tre differenze volute rispetto al mobile:

1. **Niente selettore del modello.** Il modello si **dichiara** («Lo riscrive glm-5.3-flash, il
   modello di questa chat»), non si sceglie: owner 11/09, «mai uno a pagamento scelto da te».
2. **Prima e dopo insieme.** Il mobile mostra solo il riscritto; qui l'originale resta sopra,
   smorzato e accorciato. La domanda vera di chi guarda è «è ancora quello che intendevo?», e
   con l'originale sparito quel confronto tocca farlo a memoria. È l'unica cosa su cui il
   pannello si sbilancia.
3. **Nessuna grammatica nuova**: `talos-tabs--pills`, `talos-badge--sm`, `talos-button--*` e
   **solo** token `--talos-*`. Un test (`MIGLIORA-TEMI`) fallisce se compare un colore scritto a
   mano nel file: è il cancello della regola «tema chiaro e scuro, sempre tutti e due».

**Foto, tema CHIARO e SCURO** — `.claude/prove-bc13-bc15-2026-09-11/` (6 immagini: scelta,
esito, errore × chiaro, scuro; banco proprio su porta effimera, mai il 4174).
Quattro difetti trovati **guardando le immagini**, non dai test, e corretti nello stesso giro:

1. le tre azioni finivano **sotto la piega** (il pannello scorreva tutto intero): chi lo apriva
   vedeva una riscrittura e nessun modo di accettarla;
2. resele `sticky`, i bottoni **coprivano** le pillole dei principi — una cura che sposta il
   difetto di dieci pixel non è una cura;
3. col corpo intero scorrevole, «Cosa è cambiato» e le pillole finivano sotto la piega. Forma
   finale: **scorre solo il testo riscritto**, che è l'unico di lunghezza ignota;
4. i principi usavano `talos-chip`, e **`.talos-chip` non esiste** come regola in `index.css`
   (c'è solo `.talos-chip__label`): a schermo uscivano quattro frasi di fila che si leggevano
   come una. ⇒ `talos-badge talos-badge--sm`, che esiste davvero (`index.css:269,276`).
   ⛔ Una classe che non esiste non fallisce: **disegna male, in silenzio**.

Inoltre: «Chiudi» era color accento e competeva col titolo — ora è quieto.

### L'aggancio nel composer (DA FARE TU — `chat-foot.js` non l'ho toccato)

**Dove va il pulsante:** `harness-ui/frontend/index.template.html:443`, dentro
`<div class="talos-composer__bar">`, **subito dopo** `#capabilityBtn` (il «+») e **prima** della
pillola del modello. Stessa classe degli altri due bottoni-icona della barra:

```html
<button type="button" class="talos-composer__attach" id="miglioraPromptBtn"
        aria-label="Migliora il prompt" aria-expanded="false" aria-controls="miglioraPromptPannello"
        title="Riscrivi il tuo messaggio col modello di questa chat">
  <svg class="i"><use href="#i-edit"/></svg>
</button>
```

⚠️ Nello sprite **non c'è un'icona «scintille»**: le uniche vicine sono `#i-edit` e `#i-bolt`
(`#i-bolt` è già del chip del modello, quindi si esclude). O si riusa `#i-edit`, o se ne aggiunge
una — decidi tu.

**Quale evento, e il cablaggio esatto** (in `legacy/app.js`, dove vivono `apiPost` e
`state.realSession.id`):

```js
import { montaMiglioraPrompt } from '../components/migliora-prompt.js';

const pannelloMigliora = montaMiglioraPrompt({
  modello: state.model,                                   // solo da dichiarare
  leggiPrompt: () => $('#composerInput').value,           // letto ADESSO, non all'apertura
  chiedi: ({ prompt, profondita }) =>
    apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/migliora-prompt`, { prompt, profondita }),
  applica: ({ modo, testo }) => {
    const input = $('#composerInput');
    input.value = modo === 'sostituisci' ? testo : `${input.value.trimEnd()}\n\n${testo}`;
    input.dispatchEvent(new Event('input', { bubbles: true }));  // ⛔ serve: il composer si ridimensiona e abilita «Invia» da qui
    input.focus();
  },
  onChiudi: () => { $('#miglioraPromptBtn')?.setAttribute('aria-expanded', 'false'); },
});
$('#composerForm').append(pannelloMigliora.elemento);
$('#miglioraPromptBtn').addEventListener('click', () => {
  $('#miglioraPromptBtn').setAttribute('aria-expanded', 'true');
  pannelloMigliora.apri();
});
```

Note per chi collega:
- `modello` va **riaggiornato** quando l'owner cambia modello dalla barra: oggi il componente lo
  riceve al montaggio. Se preferisci, rimontalo — oppure dimmelo e lo faccio diventare una
  funzione `() => state.model`, sono due righe nel mio file.
- il pannello è `hidden` finché non si chiama `apri()`, e `Escape` lo chiude da solo.
- serve una sessione **avviata**: la rotta è per sessione. Col composer prima della prima
  sessione (`state.pendingCustomSession`) il pulsante va disabilitato, altrimenti si prende un
  404 onesto ma inutile.

### Cosa NON ho verificato (BC-15)

- **Nessun giro con un modello VERO.** Le 12 prove della rotta usano un `fetch` finto e un
  runtime locale finto. Non ho mai chiamato OpenRouter né acceso `llama-server`: sarebbe stato
  un giro a pagamento (o un'inferenza pesante sulla GPU dell'owner) che nessuno mi ha chiesto.
  ⇒ **Non è dimostrato che `glm-5.3-flash` risponda davvero in JSON valido con questo prompt**,
  né quanto ci metta. Questo va fatto dal vivo, sul 4174, da te.
- **Il pannello non è mai stato visto dentro la app.** Le foto vengono da un banco isolato che
  carica `tokens.css` + `index.css` + `temi.css`: la cornice è reale, il contesto (il composer,
  lo z-index, la posizione rispetto alla barra) no. In particolare **non so dove si posiziona**
  il pannello una volta appeso a `#composerForm`: serve una regola di posizionamento (o un
  `position:absolute` sopra la barra) che decide chi lo aggancia.
- **Il percorso «sessione locale» non è mai girato su un motore vero**, solo su un generatore
  finto: la concatenazione degli eventi `text` segue il contratto di
  `local-runtime-llama-server.mjs:124-196`, ma non l'ho vista funzionare su llama-server.
- **Nessuna prova di accessibilità reale** (screen reader, trappola del fuoco). Il pannello
  dichiara `role="dialog"`, `aria-labelledby`, `aria-live` sull'attesa e `role="alert"`
  sull'errore, ma **non ha una trappola del fuoco**: con `Tab` si esce dal pannello.
- **Le viewport desktop (1440×900, 1280×800, 1024×800) non sono state provate**: le foto sono a
  900×760, la misura che mostra il pannello per intero. La larghezza è
  `min(34rem, calc(100vw - 2rem))`, quindi a 1024 non sfonda — ma non l'ho **visto**.
- Il componente non è ancora in nessun `cancello-superfici`/`cancello-*` del frontend: quei
  cancelli leggono il markup del template, dove il pulsante ancora non c'è.

---

## Ricerche fatte PRIMA di scrivere (fonte + data)

| punto | fonte | data |
| --- | --- | --- |
| cache di un elenco su disco, invalidazione | npmjs «stale-while-revalidate-cache»; Node.js fs docs (`fs.watch` vs `fs.watchFile`, confronto `mtime`) | 11/09/2026 |
| concorrenza delle letture / EMFILE | oneuptime.com «How to Fix Error: EMFILE: too many open files in Node.js» (22/01/2026); latchkey.dev «Node.js EMFILE — Fix the File-Descriptor Limit» | 11/09/2026 |
| tempi NTFS | Microsoft Learn «File Times» — **inconcludente sulla cartella**, quindi misurato a mano (`scratchpad/misura-varianti.mjs`) | 11/09/2026 |
| JSON strutturato su OpenRouter | dev.to «OpenRouter Structured Output Broke Before Translation Quality Did — 3 Layers of Defense for Production»; prism-php/prism #644; docs.langchain.com «ChatOpenRouter» | 11/09/2026 |
| disegno | skill `frontend-design` caricata prima di scrivere il componente; sistema esistente letto in `tokens.css`, `temi.css`, `index.css` | 11/09/2026 |
