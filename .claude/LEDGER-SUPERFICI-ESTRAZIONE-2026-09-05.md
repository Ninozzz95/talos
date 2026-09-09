# LEDGER — Fase 4, l'estrazione modulare: dieci superfici

> Stato al 05/09/2026. Il monolite `public/` è ancora **congelato** e vivo: qui
> non c'è nessun cutover, solo i pezzi che lo sostituiranno. Il cutover aspetta
> un sì dell'owner.

## §1 — Cosa esiste adesso

| # | Superficie | Riga che porta | Commit |
|---|---|---|---|
| 1 | Sidebar | A1-A2, A9 | (precedente) |
| 2 | Conversazione | O-04 (parte UI) | (precedente) |
| 3 | Board | G3-G7 + metriche di W1-02 | `9bdede69` |
| 4 | Barra di stato | **G30** | `19fd9ab4` |
| 5 | Inspector | G11-G13, **G20-G21 = metà UI di W1-02** | `50943748` |
| 6 | Capability | **O-08**, O-06 (parte UI) | `44838e99` |
| 7 | Terminale | G8-G10, sopra il backend di **W1-01** | `7cba9b03` |
| 8 | Topbar | mockup approvato | `4e4a8f67` |
| 9 | Doctor | W0-09 | `02b1b01b` |
| 10 | Impostazioni | D (aspetto/fornitore) | `f12dec71` |

**Manca la Review** (W1-06). Non è un rinvio mio: quella riga non ha ancora un
backend — nessun check per cartella, nessun esito firmato, nessun diff-range.
Montarla adesso vorrebbe dire riempirla di dati finti, che è esattamente ciò
che questo progetto vieta.

## §2 — La regola che attraversa tutte e dieci

**«Misurato» e «non misurato» non si scrivono nello stesso modo.** Nata dai dati
veri della Board (73 sessioni, 60.437 eventi: il tempo al primo token è assente
73 volte su 73), è finita in ogni superficie:

- Board: `0 %` è misurato, `—` più il motivo è non misurato; e chi non ha una
  misura finisce **in fondo in entrambi i versi** dell'ordinamento.
- Barra di stato: `usage: null` ≠ `usage: {tokens: 0}`. G30 chiuso **per
  costruzione** — il consumo vive dentro `execution`, che il reducer azzera a
  ogni cambio di sessione.
- Capability: tre stati sull'offerta al modello (offerto · non offerto · **non
  lo sappiamo**), e un attrezzo senza nome si dichiara invece di mostrare l'id.
- Terminale: tre stati sull'isolamento e tre sulla ripresa della shell.
- Doctor: **un controllo non eseguito non è verde.** La ricerca non ha trovato
  questa regola documentata da nessuna parte: è nostra.
- Inspector: se la guardia non ha potuto valutare il silenzio, lo scrive —
  «nessun allarme» perché non abbiamo guardato non è «nessun allarme».

## §3 — Il giro visivo, e perché è servito

Le otto superfici avevano prove unitarie verdi, laboratorio verde e
`verify:all` verde. **Nessuna era stata guardata.** Aperto il laboratorio
`?component=Surfaces` e fotografate alle tre viewport desktop, i difetti erano
otto — e la causa del primo era una sola: dieci superfici scritte con nomi di
classe nuovi e **nessuna riga di CSS**.

Testo incollato in cinque punti · pallini di lista mai tolti · righe selezionate
fuse in una lastra · un campo di ricerca senza niente di visibile · «1 attrezzi
non hanno ancora un nome» · terminale e barra senza contenitore · schede sopra
il titolo · un percorso troncato **due volte**.

⇒ Una superficie non è finita quando i suoi test passano.

## §4 — I difetti trovati mutando, non rileggendo

- **BARRA-08 non provava niente**: confrontava il testo dell'annuncio, quindi
  non distingueva «non riscritto» da «riscritto identico» — ma nel browser
  riassegnare `textContent` a una regione live è una mutazione, cioè un
  annuncio. Ora il DOM finto conta le scritture.
- **Una prova nel posto sbagliato**: la guardia sul booleano `ripreso` stava nel
  trasporto, ma l'avevo asserita nella superficie, che riceve il valore già
  normalizzato. Mutare il trasporto non faceva rosso.
- **Una mutazione che non era mai entrata nel file** (escape sbagliato nello
  script): sembrava una debolezza della prova, e non lo era.

## §5 — Il DOM finto mentiva in NOVE modi

Tutti trovati montando componenti veri, tutti chiusi, e ora ha **9 prove sue**:
`dataset` e `data-*` come depositi separati · `id` non riflesso sull'attributo ·
`contains` non profondo · eventi che non risalivano (la delega era impossibile
da provare) · `querySelector`/`querySelectorAll`/`closest`/`activeElement`
assenti · `prepend` assente · `parentNode` assente · il distacco che non
azzerava il genitore · **il combinatore discendente mangiato in silenzio**.

Regola del finto, da oggi esplicita: **una forma che non capisce la dichiara e
lancia**. Rispondere `null` farebbe passare una prova mentre nel browser
l'elemento c'è.

⛔ Le prove scritte prima del 05/09 giravano sulla versione vecchia. Passano
tutte anche sulla nuova, più severa (312/312): il dubbio è misurato, non
argomentato.

## §6 — Due buchi nei cancelli, chiusi

1. **Il contratto sui token guardava `primitives.css` PER NOME**: il nuovo
   `surfaces.css` sarebbe entrato senza controlli su colori e durate grezze, e
   il cancello sarebbe rimasto verde mentre lo faceva. Ora enumera la cartella.
2. **La lista delle superfici da fotografare era scritta a mano**: la
   superficie aggiunta subito dopo (il Doctor) non veniva né fotografata né
   controllata. Ora si chiede alla pagina, con un minimo atteso dichiarato.

## §7 — Cosa resta aperto

- 🔜 **La Review (W1-06)**: serve prima il backend. Decide l'owner se metterlo in
  coda.
- 🔜 **Il cutover**: `public/` all'output compilato, scongelando il contratto una
  volta sola. Porta con sé la chiusura della porta legacy del terminale
  (`cartellaStandaloneLegacy` → `null`).
- 🔜 La voce attiva della sidebar somiglia a un campo di testo (stile di
  `nav-item`, precedente a questo giro).
- 🔜 Un processo di prova mio sulla porta 4195 (PID 27040) da spegnere: il
  classificatore ha bloccato il comando e non l'ho aggirato.

## §8 — I numeri

`npm run verify:all` **1643/1643, EXIT:0**, zero menzioni di `Scenario:` o del
4174 nel log · frontend `test:unit` **312/312** · component spec **99/99** alle
tre viewport desktop (1440×900, 1280×800, 1024×800) · foto ispezionate a mano.
