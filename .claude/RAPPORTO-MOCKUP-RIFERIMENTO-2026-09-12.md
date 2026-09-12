# BC-31 — il riferimento del cancello torna a essere un FILE

> Corsa del **12/09/2026**, lane `lane/harness-desktop`, cartella `harness-ui/frontend/`.
> Banco su **4246/4247** e poi **4256/4257** (`TALOS_LAB_PORT` / `TALOS_ASPETTO_PORT`): le 4176/4177
> erano occupate da un altro banco vivo, e 4186/4187 le aveva usate il banco di stanotte.
> ⛔ **La 4174 non è stata
> toccata in nessun momento**, **nessun giro col modello**, **nessun file di `src/` modificato**.

## 0. Il debito, in una riga

Stanotte (BC-22) undici componenti rossi erano stati rimessi in verde **riscrivendo il DOM del
mockup dentro la prova**: `tests/parity/componenti.spec.mjs` conteneva un blocco di ~220 righe
(«IL RIFERIMENTO SI AGGIORNA») che, prima di ogni confronto, portava la copia del mockup agli
ordini dell'owner dell'08-11/09. Funzionava, ed era il posto sbagliato: **un riferimento che si
corregge da solo a ogni corsa non è un riferimento**, e chi apre `mockup/talos-mockup.html` — che è
la *fonte del disegno*, non un file di prova — non scopre che la app non gli somiglia più.

Oggi quelle correzioni stanno **nel file**, una per una, ognuna con un commento HTML che dice
l'ordine e la data. Il cancello confronta di nuovo senza toccare niente.

## 1. Chi legge `mockup/talos-mockup.html` — e perché l'ho modificato INVECE di affiancargli un file nuovo

| chi | che cosa ne legge | effetto di una modifica |
|---|---|---|
| `scripts/mockup-to-template.mjs` | **tutto**: genera `index.template.html` e `src/styles/index.css` | è la ragione principale: il mockup **è** la fonte del prodotto |
| `tests/parity/aiuto.mjs` → `MOCKUP` | la pagina intera, servita col doctype davanti | usato da `componenti.spec.mjs` e `review-testata.spec.mjs` |
| `scripts/cancello/statico.mjs` | i fogli interni (`<style>`), per le graffe orfane | riverificato: **0 graffe orfane, 0 blocchi aperti** |
| `tests/unit/icone-ripiego.test.mjs` | `<symbol id="i-ignoto">` deve esistere | intatto |
| `tests/unit/estensioni.test.mjs` | il blocco JSON dei token DTCG | intatto |
| `tests/unit/regole-vincolanti.test.mjs` | solo il **percorso**, come «superficie visibile» | nessuno |
| `src/legacy/app.js` + `harness-ui/public/app.js` | un messaggio d'errore: «disegnalo in mockup/talos-mockup.html» | nessuno |

⇒ **Nessun file nuovo accanto.** `aspetto-non-rende-illeggibile.spec.mjs` nomina il mockup solo in
un commento (legge `index.template.html`), quindi nessun altro cancello dipende dalla versione
vecchia; e una copia affiancata spaccherebbe in due la fonte del disegno, lasciando il generatore
del template a leggere quella vecchia — cioè creerebbe esattamente il problema che questo lavoro
chiude. È anche ciò che ha già fatto BC-30 stamattina (testata Review: «lo stesso markup, byte per
byte» nel template **e** nel mockup).

## 2. Le correzioni portate nel file, una per una

Ogni riga porta nel mockup un commento HTML con l'ordine e la data. «Riferimento» dice **da quale
mockup** viene il disegno di quel componente.

| # | componente/i toccati | riferimento | che cosa è entrato nel mockup | patch tolta dalla prova |
|---|---|---|---|---|
| 1 | `SessionItem` · `NavItem` · `WorkspaceFooter` (e la barra di **tutti**) | **11/09** — mockup interattivo (`initSidebar` r. 6098, `renderSessions` r. 6103, `openDrawer`/`closeDrawer` r. 6114-6115; CSS r. 4106-4119 e 4141-4178) | il `<nav class="talos-sidebar">` coi due gruppi «Spazi di lavoro»/«Strumenti», la toolbar di selezione col «⋯», il **bottone del cassetto** sotto gli 860 px, e in coda al `<style>` il foglio `mockup-sidebar.css` per intero | `estraiBarra()`, `BARRA_LOTTO_A`, `CSS_BARRA_LOTTO_A` e il blocco 1 di `aggiornaIlRiferimento` |
| 2 | `ChatFooter` · `Conversazione` · `EmptyState` | 07/09 + ordine owner 11/09 | le quattro scritte sotto il composer tolte (il contenitore resta, vuoto, con scritto perché); la stessa riga tolta anche nella chat vuota | blocco 2 |
| 3 | `ChatFooter` | 07/09 + **BC-15** 11/09 | `#miglioraPromptBtn` accanto al «+» **e** il simbolo `#i-sparkles` nello sprite, col commento della ricerca dell'11/09 | blocco 3 e la costante `SIMBOLO_SPARKLES` |
| 4 | `ChatFooter` | 07/09 + **PO-09** 09/09+11/09 | la pill `#pillTerminale` accanto a «Giri» e la `<section id="pannelloTerminale" hidden>` che ospita il terminale | blocco 4 |
| 5 | `ProviderCard` | 07/09 + ordine owner **10/09** | le tre azioni che non chiudono il lavoro sono `hidden` (non cancellate: nel prodotto vivono nel menu «⋯») | blocco 5 |
| 6 | `LibraryRow` (4 righe) | 07/09 + ordine owner **10/09** | `data-modo="normale"`, il modulo di rinomina in linea, la riga del messaggio, il gruppo azioni col «⋯», la conferma d'eliminazione; via l'«Apri» morto `data-richiede="fase3"` | blocco 6 |
| 7 | `Conversazione` · `EmptyState` | 07/09 + cura 11/09 (`index.css` r. 593) | tolta `@media (max-width:1040px){ .talos-conversation{padding-left:0} }`, col perché e la misura (colonna 704 → 660, i due lati 44 e 44) | blocco 8 (il foglio `#bc22-respiro-chat` iniettato in testa) |
| 8 | `Inspector` | 07/09 + `inspector.js` r. 255 | lo stato vuoto dei sotto-agenti dice quello che si vedrà davvero | blocco 9 |
| 9 | `ReportRow` | 07/09 + **L7** 11/09 | le due frasi che sul prodotto erano FALSE (dove vivono i rapporti; «la consultazione non è ancora disponibile») | il blocco `if (comp.nome === 'ReportRow')` nel corpo del test |

### Due correzioni in più, che nessuna prova stava guardando

Non venivano dal blocco della prova: le ho trovate **rigenerando** il template dal mockup in un
temporaneo (`scripts/mockup-to-template.mjs` con le due `writeFile` dirottate) e confrontandolo con
`index.template.html`. Sono cure dell'11/09 arrivate nel prodotto e mai tornate nella fonte:

- **Il velo dei permessi era annidato male.** «Dove girano i comandi» stava **dentro**
  `#veloPermessiScelte`, cioè finiva a schermo come **quinta colonna** della griglia dei permessi.
  Il template l'ha corretto l'11/09; il mockup no. ⛔ Nessun componente del cancello guarda quel
  velo: il verde non lo diceva, e alla prossima rigenerazione il difetto sarebbe tornato nel
  prodotto.
- **La X della colonna dei dettagli non chiudeva.** `#chiudiDettagli` senza `data-close-panel`, che
  è l'unico cablaggio a `closePanels`. Portato nel mockup **byte per byte** come nel template.
- (minore, stessa origine) «i percorsi **C:\\**» invece di «i percorsi C:» nella scelta «Windows».

## 3. Che cosa resta nella prova, e perché non è una patch dimenticata

Il blocco si chiama ora **«LO STATO DEL LABORATORIO»** ed è lungo 6.078 byte contro i 18.083 di
prima. Non corregge il riferimento: mette la copia del mockup **nello stesso stato in cui il
laboratorio mette la app**. Una pagina statica non può stare in due stati insieme.

| che cosa | per chi | perché NON può stare nel file |
|---|---|---|
| i nove conteggi delle voci di navigazione | `NavItem` | il mockup **deve** nascere senza (ordine owner 11/09, `index.template.html` r. 296-300: «nessun conteggio scritto a mano»; un numero finto resta a schermo finché una rotta non risponde). Il laboratorio `NavItem` rifà le voci dai dati per **far vedere il badge**; `SessionItem` e `WorkspaceFooter` lasciano il markup statico, senza numero — misurato: mettendo i numeri nel file il cancello torna rosso su **nove nodi** |
| il gruppo «Strumenti» aperto | `NavItem` | nel prodotto nasce **chiuso** per non schiacciare l'elenco delle sessioni; la vetrina lo apre per mostrare cinque voci su tredici |
| la riga «Chi legge i comandi che lanci tu con !» | `ToolList` | la scrive `capability.js` r. 108 a runtime: `ToolList` passa da `aggiornaPaginaCapability` e la riga c'è, i quattro `ExtensionList_*` guardano la **stessa schermata** senza passare di lì e la riga non c'è. Scriverla nel mockup farebbe **quattro rossi** |
| `willChange` sul pannello notifiche | `NotificationPanel` | non è disegno: è **rasterizzazione** (scala di grigi contro subpixel LCD, croma 9,9 contro 54,4 — misura di BC-22). Si applica a **entrambe** le pagine |

⛔ **Nessuna soglia di pixel è stata allargata**: `SOGLIA_PIXEL = 0.12` e `QUOTA_MASSIMA = 0.004`
sono invariati in `tests/parity/aiuto.mjs`, e nessun componente è stato tolto dall'elenco.

## 4. Il conteggio del cancello

| misura | prima (stanotte, BC-22) | **dopo** |
|---|---|---|
| `npm run test:componenti` (37 componenti × 3 viewport + i 4 altri file) | 146 passati, 1 fallito | **147 passati, 0 falliti** (3,6 min), sullo stato finale dei file |
| `COMP *` a 1440 · 1280 · 1024 | 111 passati | **111 passati** |
| `RIP-V01` a 1280 | rosso | **verde** (l'ha chiuso BC-30 stamattina, non questo lavoro) |
| `npm run test:unit` | 843 verdi | **895 prove, 893 verdi, 2 rosse** — le due rosse **non sono mie**, §5 |
| `scripts/cancello/statico.mjs` | — | **0 graffe orfane / 0 blocchi CSS non chiusi** nei due fogli e nel mockup |

### Le quattro corse intere, dette per intero

Il cancello l'ho lanciato **quattro volte**, e due non sono state verdi. Le dico tutte perché un
conteggio senza gli insiemi non è una prova (lezione del 02/09):

| corsa | porte | stato dei file | esito |
|---|---|---|---|
| 1 | 4246/4247 | dopo le nove correzioni del §2 | **147/147** |
| 2 | 4246/4247 | + le tre del §2-bis | **146/147** — `COMP LibraryRow` a **1440** soltanto, 24.943 px (2,381%) |
| 3 | 4246/4247 | idem | **48 ok, poi il server del laboratorio è MORTO** (`ERR_CONNECTION_REFUSED` su 4246 per tutto il resto): non è un esito, è il banco caduto. ⭐ `COMP LibraryRow` a 1440 era **verde** in questa corsa |
| **4** | **4256/4257** | idem | **147/147, EXIT 0** |

**Il rosso della corsa 2 non è una divergenza di disegno, ed è documentato qui perché resta aperto.**
Struttura e parole erano **identiche** (le due assert passano prima dei pixel); lanciando lo stesso
componente da solo a 1440 con `--repeat-each=4` è **4 su 4 verde in 11,7 s**; ed è verde a 1280 e a
1024 nella stessa corsa e a 1440 nelle corse 1, 3 e 4. Nel diff (`artifacts/parita/comp-LibraryRow-desktop-1440x900-diff.png`,
copia in `scratchpad/bc/`) **tutto il testo è rosso** e le pillole «Generato» hanno **larghezze
diverse** nelle due immagini: non è antialiasing, sono **metriche di carattere diverse**, cioè una
delle due pagine ha disegnato con un ripiego invece che con Instrument Sans.
**Ipotesi, non verificata:** `apri()` in `tests/parity/aiuto.mjs` inietta gli `@font-face` con
`addStyleTag` **dopo** il `load` e poi aspetta `document.fonts.ready` una volta sola. MDN,
*FontFaceSet.ready* (letta il 12/09/2026,
<https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready>): la promessa si risolve «once
the document has completed loading fonts… and no further font loads are needed», e per una faccia
aggiunta dopo la via documentata è **`FontFaceSet.load()`**. ⛔ Non ho toccato `aiuto.mjs`: non ho
saputo riprodurre il guasto, e una cura non riprodotta è un'ipotesi messa in produzione. È la prima
cosa da fare la prossima volta che quel rosso torna — e va fatta **con la riproduzione**, non prima.

**File toccati:** `mockup/talos-mockup.html` (3.976 → **4.313 righe**, 662.588 → **693.985 byte**) e
`tests/parity/componenti.spec.mjs` (366 → **203 righe**, 34.221 → **19.152 byte**, cioè **−163
righe**). Nessun altro.

## 5. Differenze VERE trovate — e non curate, perché stanno in `src/`

1. **⛔ Due prove unitarie rosse, di un altro lotto.** `C10-DESCRIZIONI` attende **43 attrezzi** e ne
   trova **44**, e `I18N-COPERTURA` dice che a `consegna del rapporto di ricerca` manca l'inglese.
   Vengono da un attrezzo aggiunto oggi in `src/components/nomi-attrezzi.js` senza aggiornare il
   conteggio e la mappa inglese. Verificato che **non leggono il mockup** (`costi-contesto.test.mjs`
   importa solo `src/components/nomi-attrezzi.js`): non sono un effetto di questo lavoro.
2. **⛔⛔⛔ Rigenerare il template oggi CANCELLEREBBE la schermata d'avvio.** Il confronto
   «mockup rigenerato ↔ `index.template.html`» lascia **un solo blocco sostanziale: 131 righe**,
   ed è `#talosAvvio` (velo d'avvio dell'11/09, con il suo `<script src="./avvio.js">` e il suo
   `<style data-talos-nonce>`), scritto direttamente nel template e mai nella fonte. ⛔ E non è una
   dimenticanza da rimediare copiando: `mockup-to-template.mjs` **toglie il primo `<style>`** (è
   quello che diventa `index.css`) e **toglie ogni `<script>` in linea**, quindi il velo non può
   vivere nel mockup nella forma che ha oggi. ⇒ Oggi `node scripts/mockup-to-template.mjs` è un
   comando **distruttivo** e nessuno lo dice: o il generatore impara a preservare la testa del
   template, o quel comando va dietro un cancello che lo rifiuta. **Non l'ho toccato**: è una
   decisione dell'owner.
3. **⛔⛔ Il cancello non misura l'ordine del 10/09 su `ProviderCard`.** Il laboratorio chiama
   `creaProviderCard(PROVIDER_CARD[4], {aperta:true})` **senza `onMenu`**, e il componente crea il
   bottone «⋯» solo `if (typeof onMenu === 'function')` (`provider-card.js` r. 72). Risultato: il
   cancello vede le tre azioni nascoste ma **non vede mai il menu** che l'ordine chiedeva. Metà
   dell'ordine è verificata, metà no. La cura è nel **laboratorio**, non nel prodotto.
4. **⛔⛔⛔ Quattro componenti confrontano una PAGINA CHE IL PRODOTTO NON DISEGNA PIÙ.**
   `LibraryRow`, `ReportRow`, `TaskRow` e `MemoryRow` hanno come selettore l'**intera schermata**
   (`#schermoLibreria`, `#schermoRicerca`, …), e il laboratorio la disegna con i renderer **vecchi**
   (`libreria.js`, `ricerca.js`, `attivita.js`, `memoria.js`). Il prodotto, dall'11/09, monta quelle
   sei pagine con l'elenco+dettaglio del mockup dell'owner: `src/legacy/app.js` r. 24-27 importa
   `aggiornaPaginaLibreria`/`aggiornaPaginaRicerca`/… da `sezioni-adattatori.js` (1.375 righe, più
   `sezione-elenco-dettaglio.js`, 666). **Misura del divario**: `mockup-td.css` definisce **119**
   classi `td-*` distinte; il mockup, dopo questo lavoro, ne conosce **9** — esattamente quelle
   della barra. ⇒ Per le sezioni, il riferimento «11/09» non esiste ancora, e **non basta
   riscrivere il mockup**: prima il laboratorio deve rendere le pagine come le rende il prodotto,
   altrimenti si sposterebbe il rosso invece di toglierlo. È il prossimo lavoro, e va fatto in
   quest'ordine (laboratorio → mockup → cancello), non al contrario.

## 6. Che cosa NON ho verificato

- **Non ho guardato niente a schermo.** Nessuna foto, nessun 4174, nessun giro col modello: questo
  lavoro è tutto sul banco, e non tocca `src/`. Le prove di parità girano **solo in tema scuro**
  (`colorScheme: 'dark'` è imposto da `aiuto.mjs`): il tema chiaro non è passato di qui.
- **Sotto gli 860 px non è misurato.** Il foglio della barra portato nel mockup contiene il cassetto
  e `.talos-chat-foot{padding-left:calc(var(--talos-chat-gutter) + 60px)}`, e
  `--talos-chat-gutter` **non esiste nel mockup** (lì il valore è scritto 44px alla lettera): sotto
  gli 860 px quella dichiarazione è invalida. Le tre viewport del cancello sono 1440/1280/1024,
  quindi oggi non cambia un pixel — ma se un giorno il cancello scenderà a 800, quella riga va
  guardata per prima. Non l'ho «aggiustata» perché avrebbe fatto divergere le due copie del foglio.
- **Il bottone del cassetto** (`#apriCassettoBarra`) è entrato nel mockup ma **non è mai visibile**
  alle viewport del cancello: è markup verificato per struttura, non per aspetto.
- **Le due correzioni in più del §2-bis** (annidamento del velo dei permessi, `data-close-panel`)
  non sono coperte da nessuna prova: le ho verificate **per costruzione**, rigenerando il template e
  osservando che i due blocchi spariscono dal diff. Non le ho viste funzionare.
- **Non ho fatto un A/B** contro il commit di base: nessun `git`, per consegna.
- **Il rosso intermittente di `COMP LibraryRow` non l'ho riprodotto**, quindi non l'ho curato: ho
  solo provato che **non è** una divergenza di disegno (struttura e parole identiche, 4/4 verde in
  isolamento, verde nelle altre tre corse intere) e scritto l'ipotesi con la fonte. Chi la cura deve
  prima farlo tornare.
- **Il banco che è morto nella corsa 3** non l'ho indagato: `scripts/serve-lab.mjs` sulla 4246 ha
  smesso di rispondere a metà corsa dopo che sulla stessa porta avevo lanciato una corsa mirata con
  `npx playwright` poco prima. Cambiando porta (4256) è sparito. Non so se le due cose siano legate.
- **I due rossi unitari del §5.1 non li ho riprodotti a ritroso** (non ho provato a togliere il 44°
  attrezzo per vedere il verde): ho solo provato che quelle due prove non leggono il mockup.
