# BC-22 — il cancello dei componenti: da 26/37 a 37/37

> Corsa del 12/09/2026, lane `lane/harness-desktop`, banco su porte **4186/4187**
> (`TALOS_LAB_PORT` / `TALOS_ASPETTO_PORT`): le 4176/4177 erano occupate da un altro banco vivo, e
> il 4174 dell'owner non è stato toccato in nessun momento. Nessun giro col modello.

## 1. Che cosa ha trovato la lettura degli undici rossi

**Una causa sola, undici volte.** Il riferimento del cancello — `harness-ui/frontend/mockup/talos-mockup.html` —
è del **07/09**. Fra l'08 e l'11/09 l'owner ha ordinato una serie di cambiamenti che la app **ha
fatto** e il mockup **non ha**: finché il riferimento resta indietro, il cancello accusa la app di
difetti che sono invece **obbedienza a un ordine**.

Nove degli undici rossi sono questo. Uno (`Browser`) era il laboratorio rimasto indietro rispetto a
un ordine dell'owner. Uno (`NotificationPanel`) non era una differenza di **disegno** ma di
**rasterizzazione**.

⛔ Nessun componente è stato tolto dal cancello e **nessuna tolleranza di pixel è stata allargata**
(`SOGLIA_PIXEL = 0.12`, `QUOTA_MASSIMA = 0.004` invariati in `tests/parity/aiuto.mjs`). Dopo la cura
**dieci componenti su undici coincidono a ZERO pixel**; il residuo è misurato e dichiarato qui sotto.

## 2. La tabella degli undici

| # | Componente | Piano che falliva | Causa | Cura |
|---|---|---|---|---|
| 1 | `ProviderCard` | parole + pixel (674×402 vs 674×364) | **(a)** owner 10/09 «non mettere i pulsanti uno accanto all'altro, usa i tre puntini + dropdown»: la card allineava 4 bottoni, ora ne mostra 1 e gli altri vivono nascosti dietro il «⋯» (commit `c4197896`) | nel riferimento si **nascondono** (non si cancellano) i tre bottoni passati nel menu → **0 px** |
| 2 | `ToolList` | struttura (+3 nodi) + parole (+33) | **(a)** D-10S, owner 11/09 «e anche su capability visto che sono collegati»: il dettaglio di `shell` ha la scelta «Chi legge i comandi che lanci tu con !» (`capability.js:108`), assente dal mockup | si aggiunge la stessa riga al dettaglio del riferimento → **0 px** |
| 3 | `LibraryRow` | struttura (60 vs 96 nodi) | **(a)** owner 10/09, stessa regola: la riga ha «⋯» + modulo di rinomina in linea + riga messaggio + conferma d'eliminazione, tutti nascosti (commit `7d6c0072`); il mockup ha ancora l'«Apri» morto `data-richiede="fase3"` | riferimento aggiornato **+** il laboratorio riceve `sessionId` (senza sessione `azioniLibreria()` torna `null` e la riga non disegnava **nessuna** azione: non era la riga del prodotto) → **0 px** |
| 4 | `SessionItem` | struttura + parole + 6,1% px | **(a)** lotto A, owner 11/09 (mockup interattivo): «Spazi di lavoro» + «Strumenti» al posto di «Luoghi»/«Altro», cassetto sotto gli 860 px (commit `a15b33ad`) | si porta nel riferimento la barra di `index.template.html` + `src/styles/mockup-sidebar.css` → **0 px** |
| 5 | `NavItem` | idem | **(a)** idem | idem, **più** i conteggi del riferimento conservati attraverso il porting e il gruppo «Strumenti» aperto come fa il laboratorio → **0 px** |
| 6 | `WorkspaceFooter` | idem | **(a)** idem | idem → **0 px** |
| 7 | `ChatFooter` | struttura (+6) + parole (−13) + pixel (824×270 vs 824×254) | **(a)** tre ordini insieme: owner 11/09 «TUTTE le scritte sotto il composer, sono ridondanti» (i 4 campi della statusbar tolti dal template, motivo scritto in `index.template.html`); BC-15 11/09 «Migliora il prompt» accanto al «+»; PO-09 09/09+11/09 la pill «Terminale» e il pannello che lo ospita | riferimento aggiornato sui tre punti (+ il simbolo `i-sparkles`, che il mockup non ha nello sprite) → **0 px** |
| 8 | `Conversazione` | pixel (824×571 vs 824×586) | **conseguenza del 7**: struttura e parole erano già identiche; la conversazione era più alta di 15 px perché il piede era più basso di 16 | la stessa cura del piede → **0 px** |
| 9 | `EmptyState` | pixel (824×685 vs 824×708) | **conseguenza del 7**: la riga sotto il composer della chat vuota, tolta anch'essa l'11/09 | idem → **0 px** |
| 10 | `NotificationPanel` | pixel, 581 px (0,642%) — **e 1,0 minuto di timeout nella prima corsa** | **(c)** né disegno né dati: le due pagine sono **identiche fino al centesimo di pixel** (stessa struttura, stesse parole, stessi `getBoundingClientRect` su tutti i figli, stesso font, stesso `color`), ma il testo del mockup esce in **scala di grigi** e quello della app in **subpixel LCD** — croma media **9,9 contro 54,4** | si promuove il pannello a livello suo (`will-change`) su **entrambe** le pagine: stesso raster di qua e di là → **0 px** |
| 11 | `Browser` | parole (−53) + 70,8% px | **(c+a)** il laboratorio chiedeva `modoIniziale:'testo'`, ma dall'ordine dell'owner dell'11/09 (`browser.js`: «la navigazione deve essere sempre in modalità pagina») il modo si **riazzera a “pagina” a ogni cambio di scheda** — e la prima `aggiorna()` È un cambio di scheda. Il laboratorio mostrava la **cornice viva di example.org**, cioè una richiesta di rete dentro il cancello | il laboratorio raggiunge lo stato col **gesto vero**: preme «Testo dell'agente» → **122 px (0,012%)**, residuo spiegato al §5 |

## 3. Tre difetti trovati per strada, curati, che nessuno cercava

1. **Il laboratorio del piede svuotava una pill che nessuno riempie.** `lab/main.js` azzerava
   `.talos-chip__label` su **tutte** le pill, compresa quella del Terminale (PO-09), che è statica:
   il cancello lo leggeva come «alla app manca una parola». Ora si svuota solo ciò che
   `aggiornaPiedeChat` riscrive davvero (modello e permesso).
2. **Il laboratorio della Libreria disegnava una riga che nel prodotto non esiste** (nessuna azione,
   gruppo `azioni` vuoto), perché senza `sessionId` il servizio è `null`.
3. **`context-compactor.spec.mjs`: sei prove su sei in TIMEOUT a 60 s** — 6,6 minuti di corsa buttati
   a ogni giro del cancello. Causa: `#talosAvvio`, il velo d'avvio, arriva col template dentro
   `page.setContent` e con `position:fixed;inset:0` copre il bottone `#ctx-open`; il clic non
   arrivava mai («waiting for element to be visible, enabled and stable», 122 tentativi). È lo
   **stesso difetto curato l'11/09 in `lab/main.js`** (commit `6a86658f`), che qui non arrivava
   perché questa prova costruisce la sua pagina da sé. Tolto il velo: **6 verdi in 10 secondi**.

## 4. Conteggio prima / dopo

| Misura | Prima | Dopo |
|---|---|---|
| `COMP *` a **1440×900** | **26 passati, 11 falliti** | **37 passati, 0 falliti** |
| `COMP *` sulle tre viewport (1440 · 1280 · 1024) | non misurato prima (la corsa era stata fermata) | **111 passati, 0 falliti** |
| `context-compactor.spec.mjs` (3 viewport) | 18 falliti (timeout 60 s ciascuno) | **18 passati** |
| `npm run test:componenti` per intero | rosso | **146 passati, 1 fallito** — resta solo `RIP-V01` a 1280 (§5) |
| `npm run test:unit` | — | **843 passati, 0 falliti** |

File toccati: `tests/parity/componenti.spec.mjs` (+248 righe, tutte il blocco «IL RIFERIMENTO SI
AGGIORNA» e i suoi commenti), `lab/main.js` (+10, tre laboratori), `tests/parity/context-compactor.spec.mjs` (+10).
⛔ Non è stato toccato nulla di `src/components/sezioni-adattatori.js`, `src/legacy/app.js`,
`src/components/modulo-voce.js`.

## 5. I due residui, misurati

- **`Browser`: 122 px (0,012%), sotto soglia ma non zero.** Sono i **due `<use>` delle schede**: il
  mockup disegna un mappamondo (`#i-globe`), la app un foglio (`#i-doc`) per una lettura di tipo
  `lettura`. Struttura e parole coincidono, ogni altra geometria coincide. È una divergenza di
  **disegno** vera, piccola: decide l'owner quale delle due è giusta.
- **`RIP-V01: Review mantiene schede e azioni separate`, rosso SOLO a 1280×800.** Deterministico e
  **fuori da BC-22**: le azioni della testata Review **coprono le schede di 20,23 px**. Misurato su
  entrambe le pagine, `azioni.left − schede.right`: **1440 → +59,77 · 1280 → −20,23 · 1024 → +21,77**,
  identico nel mockup e nella app. Cioè è un difetto di **impaginazione a quella larghezza**
  presente già nel disegno, non una regressione di stasera.

## 6. Che cosa NON ho verificato

- **Non ho fatto un A/B** contro il commit di base per `RIP-V01`: il comando che azzera i file
  modificati è stato bloccato dal guardiano del repo, e non l'ho forzato. La ragione per cui **non**
  può essere mia è di costruzione, non di misura: quella prova importa solo `aiuto.mjs` (intatto) e
  apre `?componente=Review`, un laboratorio che non ho toccato. Resta **non provato per misura**.
- **Non ho trovato CHI mette il mockup in un livello composto** nel caso `NotificationPanel`: nessun
  `transform`, `opacity`, `filter`, `will-change`, `backdrop-filter` sul pannello né sui suoi
  antenati, e la Topbar della stessa pagina esce **identica** nei due documenti (2358 pixel colorati
  da una parte e dall'altra). La cura toglie l'artefatto; la causa resta aperta.
- **Non ho guardato a schermo il 4174**: questo lavoro è tutto sul banco. Le cure toccano prove e
  laboratorio, mai il prodotto — **nessun file di `src/` è stato modificato**. Di conseguenza non
  ho nemmeno verificato dal vivo i tre difetti nominati al §3: so che il cancello adesso li vede,
  non che a schermo si comportino come dico.
- **Non ho ri-generato `mockup/talos-mockup.html`**, che è il vero debito: il riferimento nuovo è
  `.claude/refactor-ui-owner-2026-09-11/Talos_Desktop_Final_Mockup_Interattivo.html`. Finché quel
  lavoro non si fa, le correzioni vivono nella prova, ognuna con l'ordine e la data che la
  giustificano. È scritto anche in testa a `componenti.spec.mjs`.
- **Le prove visive sono in tema SCURO soltanto** (`colorScheme: 'dark'` è quello che `aiuto.mjs`
  impone al cancello): il tema chiaro non è passato da qui.
- **Non ho misurato i tempi della app**, né aperto una sessione vera: nessun giro col modello, come
  da consegna.
