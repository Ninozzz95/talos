# LEDGER — Files tab mockup, cartelle "più usate" finte, la domanda sulla root (30/8)

> Richiesta arrivata dal vivo, owner, fuori dalla sequenza Task 0-14 già
> chiusa (`.claude/QA-VISIVA-HARNESS-2026-08-30.md`). Tre fili distinti
> nello stesso messaggio: un bug confermato (mockup residuo), una
> funzionalità mal etichettata (cartelle frequenti finte), una domanda
> che si è rivelata infondata come bug letterale ma fondata come lacuna
> di design (nessuna sessione "senza cartella"). Tutti e tre investigati
> alla fonte, non presunti.

## Richiesta owner, verbatim

> *"ho anche notato che in una nuova sessione nella sidebar do destra ci
> sono ancora dei componenti mockup, errore fatale devi fare in modo che
> ogni componente abbia uno stato NEW SESSION in cui sia vuoto ma pronto
> da essere utilizzato, per esempio i file tree, come se inizio una nuova
> sessione senza invitare un messaggio, il file tree ha ancora la
> struttura mockup? come mai non ho le cartelle più usate? come mai non
> posso iniziare una nuova sessione senza una directory specifica ma
> dando 'in pasto' al modello tutta la root? analisi competitor punti
> deboli e forti e fai in modo che Talos elimini completamente ogni
> rimanenza di mockup e ripulisci definitivamente in modo prod ready
> queste cose, ad ogni dubbio cerca documentazione hermes"*

## 1 — Files tab: mockup residuo CONFERMATO, causa isolata alla fonte

**Riprodotto dal vivo prima di toccare codice**: primo carico pagina →
tab Files del Context Rail → il markup ERA letteralmente
`index.html:300-302`, un albero finto (`talos/src/components/…`,
`TalosComposer.vue +28 −19`, `ChatShell.vue`, `composer.spec.ts +8 −4`)
— dati di scena mai sostituiti finché nessuna sessione REALE con una
scrittura vera fosse mai esistita.

**Causa esatta**: `renderizzaAlberoReale()` (`app.js`) — l'UNICA
funzione che sostituisce quel markup — richiede `state.realSession.id`,
che non esiste finché il PRIMO messaggio non viene inviato (la sessione
resta "pendente" dopo il foglio "Nuova sessione", per design — vedi
`avviaSessionePendente()`). Il 29/8 un difetto GEMELLO era già stato
corretto per Terminale/Browser/Review (`resettaSuperficiRealiDedicate()`,
commento a riga 3608 di `app.js`, owner: *"in una sessione vuota la tab
files ha ancora la scritta demo UI non collegato"*) — ma quella cura
copriva SOLO il caso "sessione con id ma senza un giro", non il caso
PRIMA (nessun id, o il conto alla rovescia fra "Nuova" e il primo
messaggio). Stesso difetto, un passo più a monte, mai chiuso davvero.

**Fix**: stessa famiglia della cura del 29/8, estesa al tab Files.
- `index.html`: il markup finto sostituito da un placeholder onesto
  (`<p class="board-empty" id="fileTreeEmptyState">`).
- `resettaSuperficiRealiDedicate()` (`app.js`): nuovo blocco che
  ripristina quel placeholder a OGNI reset di sessione (stesso punto
  che già lo fa per Browser/Review) — copre "primo carico pagina" E
  "nuova sessione dopo una vecchia".
- `avviaSessionePendente()`: quando la cartella è già nota (sheet
  compilato, nessun messaggio ancora inviato — il buco ESATTO segnalato
  dall'owner) il placeholder nomina la cartella scelta invece di restare
  generico: *"Cartella scelta: crm-contatti. I file appariranno qui
  appena TALOS inizia a lavorare."*
- `renderizzaAlberoReale()` resta INVARIATA: sostituisce questo
  placeholder per intero appena una sessione vera ha una radice, come
  già faceva.

## 2 — "Cartelle più usate": esistevano, ma non erano MAI davvero usate

**Investigato PRIMA di scrivere qualunque fix** (mai un bug ipotizzato):
`frequent-dirs.mjs` esiste dal 28/8 (owner, coda: *"directory più usate,
tipo desktop downloads"*), e le chip COMPARIVANO nel foglio "Nuova
sessione" — ma `cartelleFrequenti()` calcolava SEMPRE le stesse tre
cartelle standard di Windows (`os.homedir()/Desktop`, `/Downloads`,
`/Documents`), MAI dalla cronologia reale. "Frequenti" era un nome
sbagliato per "esistono su ogni installazione Windows" — confermato
dal vivo: `GET /api/v1/frequent-dirs` tornava `Desktop/Download/
Documenti` anche con **162 sessioni reali già nella cronologia**, quasi
tutte su progetti specifici (`magazzino_py`, `crm-contatti`, ecc.) che
NON hanno mai la minima possibilità di comparire.

**Fix**: nuovo metodo `session-registry.mjs#cartellePiuUsate()` —
aggrega `voce.cartella` per OGNI sessione conosciuta (vive + ripristinate
da `.sessions-store/` al boot, stessa fonte già in uso da `elenca()`),
conteggio + ultima volta, SOLO l'aggregato (mai una mappa
sessione→cartella, stesso principio di privacy già dichiarato sopra
`elenca()`). `frequent-dirs.mjs#cartelleFrequenti()` ora preferisce
questa fonte VERA (top 6, filtrate per esistenza reale sul disco — una
copia usa-e-getta del corpus benchmark ripulita non deve comparire come
scorciatoia verso il nulla, stesso principio già in uso per le tre
cartelle Windows); le tre cartelle standard restano SOLO il ripiego
onesto per l'avvio a freddo (zero sessioni mai partite), MAI mescolate
con la cronologia reale quando esiste.

**Verificato dal vivo dopo riavvio del server** (necessario: modulo
server-side): `GET /api/v1/frequent-dirs` torna ORA
`magazzino_py · crm-contatti · api-contatti · preventivo-html` — nomi
di progetto veri, percorsi assoluti veri. Foglio "Nuova sessione"
screenshottato: le chip mostrano questi quattro nomi, non più
Desktop/Download/Documenti.

## 3 — "Perché non posso iniziare senza una cartella, e mi tocca dare tutta la root?"

**Investigato, non presunto vero né falso.** Il codice ATTUALE (client
E server) rifiuta esplicitamente una cartella vuota:
- Client (`app.js`, submit del foglio): `if (!cartellaLibera) {
  inputCartellaLibera.focus(); return; }` — non sottomette nemmeno.
- Server (`custom-task.mjs#preparaEsecuzioneLibera`): `if ((cartellaId
  && cartellaLibera) || (!cartellaId && !cartellaLibera)) throw new
  CustomTaskError('serve ESATTAMENTE uno fra cartellaId e
  cartellaLibera', ...)`.

⇒ **Non esiste, letteralmente, un percorso che "dia in pasto tutta la
root"** — nessun fallback a un percorso ampio da nessuna parte in
questo codice. La premessa letterale del dubbio non regge, verificato
alla fonte.

**Ma la frustrazione sottostante è fondata**: non esistendo un modo di
dire "nessuna cartella, chat generica", chi vuole una sessione non
legata a UN progetto preciso è COSTRETTO a scegliere qualcosa — e prima
del fix del punto 2, gli UNICI suggerimenti erano cartelle ampie e
generiche (Desktop, l'intera cartella Download), non progetti precisi:
scegliere quella per abitudine avrebbe dato al modello un ambito
enormemente più largo di quanto serva. Il fix del punto 2 già riduce
questa spinta (i suggerimenti ora sono progetti specifici, mai cartelle
ampie).

### Ricerca competitor — Hermes (sorgente locale, non solo documentazione)

Per il vincolo "ad ogni dubbio cerca documentazione Hermes" e per
[[harness-da-battere-uno-a-uno]]: letto `apps/desktop/src/store/
projects.ts` in `C:\Users\Antonino\AppData\Local\hermes\hermes-agent\`
(il vero desktop app di Hermes, non solo la CLI/dashboard web già nota).

- **Hermes ha una modalità "nessuna cartella" DI PROPOSITO**, un bucket
  chiamato "Home" (`NO_PROJECT_ID`): *"Inside Home, 'no folder' is the
  point: a new chat must stay detached rather than silently attaching
  to the configured default dir and leaving Home"* — commento letterale
  nel loro sorgente, `resolveNewSessionCwd()`.
- La priorità di scelta della cartella per una sessione nuova
  (`resolveNewSessionCwd`) è: (1) lo scope di progetto esplicito, (2) la
  cartella della sessione GIÀ a schermo (continuità), (3) un default
  configurato — **mai** un fallback a qualcosa di ampio: se nessuna
  regola si applica, resta `''` (detached), mai una root.
- Hermes ha "Projects" di prima classe: workspace nominati, multi-
  cartella, con auto-scoperta di repo git veri sotto radici configurate
  (`repo_scan_roots`, `scanAndRecordRepos`) — un modello più ricco di
  "una cartella, un percorso a piacere".

⭐⭐⭐ **Verdetto**: la domanda dell'owner era tecnicamente infondata come
BUG (non esiste un difetto che feed la root oggi) ma fondata come
LACUNA rispetto al concorrente da battere per primo — Hermes tratta
"nessuna cartella" come una scelta di prodotto deliberata, TALOS non ha
equivalente.

### Perché questo NON è stato costruito in questo giro

Una modalità "sessione generica" costruita bene (senza toccare il
kernel: una cartella scratch dedicata, creata fresca per sessione,
usata come `cartellaLibera` esattamente come qualunque altra — nessun
cambiamento di `talosHarness.mjs`, nessuna nuova semantica di
disponibilità degli attrezzi) è tecnicamente a basso rischio e
fattibile. Ma è una superficie di prodotto NUOVA (nome, copia UX,
politica di pulizia delle cartelle scratch abbandonate, dove va nel
foglio "Nuova sessione") — non un bug da correggere meccanicamente
come i punti 1 e 2. Registrata qui con le prove (letteratura Hermes
inclusa) per una decisione esplicita, stessa disciplina già in uso per
Finding A e per la tabella di marcia
([[LEDGER-TABELLA-DI-MARCIA-DESKTOP-2026-08-30]]) — non costruita
unilateralmente.

## Verificato

- Backend: 960/960 (`node --test tests/**/*.test.mjs`, +7 test nuovi:
  4 in `frequent-dirs.test.mjs`, 3 in `session-registry.test.mjs`,
  entrambi i versi — reale-vince-sul-ripiego E AL CONTRARIO —
  cartella-nella-cronologia-ma-sparita-dal-disco, avvio-a-freddo,
  tetto-massimo-rispettato, privacy-mai-un-sessionId-esposto).
- Frontend harness-scope: 168/168 invariati (nessun nuovo test unit —
  il fix è comportamento DOM/browser dal vivo, verificato via pipeline
  CDP come da prassi di questa sessione per questa classe di difetto).
- Dal vivo (`qa-mockup-files-tab-e-cartelle-frequenti`,
  `qa-visual-pipeline.mjs`): 3 screenshot, tutti ispezionati (non solo
  il controllo automatico) — primo carico pagina onesto, foglio nuova
  sessione con le 4 chip reali, tab Files con sessione pendente che
  nomina la cartella scelta. Zero eccezioni JS, zero richieste fallite
  (a parte il consueto favicon).
- Server riavviato con le stesse variabili d'ambiente della sessione
  (`TALOS_HARNESS_UI_PROJECT_DIRS`, `TALOS_BANCO_DIR`) — 162/164
  sessioni ripristinate, `/api/v1/projects` invariato (stessi 6
  progetti), confermando che il riavvio non ha perso nulla.

## Stato

✅ **Punti 1 e 2: chiusi, verificati dal vivo, committati in locale**
(commit da fare in coda a questo giro).
🔜 **Punto 3: risposto con prove, NON implementato** — proposta concreta
(cartella scratch dedicata, zero rischio kernel) pronta se l'owner la
autorizza; nessun bug reale trovato nella premessa letterale.
