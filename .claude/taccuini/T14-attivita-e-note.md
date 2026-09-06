# T14-attivita-e-note — Attività e Note: due luoghi separati (C24), con l autore su ogni riga (C25)

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:24

## Passi

- **apro Attività** ✅
  - atteso: schermo proprio
  - visto: schermo=schermoAttivita
- **apro Note** ❌
  - atteso: C24: Note e Attività restano SEPARATE — quindi uno schermo DIVERSO
  - visto: schermo=schermoAttivita

> ⛔ **T14-attivita-e-note-D1** (grave): cliccando «Note» nella barra laterale si apre lo schermo delle ATTIVITÀ (`schermoAttivita`): i due luoghi che C24 vuole separati sono la stessa pagina — prova: voce "Note1" → schermo schermoAttivita
- **l'attività scritta dall agente** ✅
  - atteso: compare in elenco
  - visto: Attività1 aperta · 0 fatte AttivitàCose con uno statoDa fare, in corso o fatte. Priorità e dettagli restano visibili; l’autore viene indicato quando è registrato.1 attività TutteDa fareIn corsoFatteMieDell’agenteAggiorna
- **la nota scritta dall agente** ❌
  - atteso: compare in elenco
  - visto: Attività1 aperta · 0 fatte AttivitàCose con uno statoDa fare, in corso o fatte. Priorità e dettagli restano visibili; l’autore viene indicato quando è registrato.1 attività TutteDa fareIn corsoFatteMieDell’agenteAggiorna

> ⛔ **T14-attivita-e-note-D2** (grave): la nota creata dall agente non compare da nessuna parte — prova: Attività1 aperta · 0 fatte AttivitàCose con uno statoDa fare, in corso o fatte. Priorità e dettagli restano visibili; l’autore viene indicato quando è registrato.1 attività TutteDa fareIn corsoFatteMi
- **l'autore su ogni riga** ❌
  - atteso: C25: tu o l agente, su OGNI riga (non solo come filtro)
  - visto: filtri=true · sulle righe=false

> ⛔ **T14-attivita-e-note-D3** (grave): le Attività hanno i filtri «Mie / Dell’agente» ma NESSUNA riga dichiara l autore (C25): il filtro non ha un dato da filtrare — sul disco il record non ha nemmeno il campo (`.tasks-store/*.json`: id, titolo, descrizione, priorita, stato, creataAlle, aggiornataAlle) — prova: ["Rivedere il diff di src/lista.mjsPriorità alta · Autore non registratoDa fareLeggi"]

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 3 (T14-attivita-e-note-D1, T14-attivita-e-note-D2, T14-attivita-e-note-D3).

> ⚠️ **Il verdetto vale per il codice alla base `c1984d79`.** Un altro agente sta riscrivendo queste
> superfici in parallelo.

## ⛔⛔ «Note» è una voce di menu SENZA PAGINA — provato tre volte, in tre modi

La prima corsa diceva che «Note» apriva lo schermo delle **Attività**. Rifatta con un **clic vero del
mouse** sulle coordinate della voce (`T14b-note.mjs`), il risultato è peggiore:

```
VOCI      [... "4:Attività1", "5:Altro", "6:Note1", "7:Ricerca approfondita0" ...]
BOX NOTE  {"x":137.5,"y":440.5}
DOPO      {"schermi":["schermoChat"], "testo":"Fai queste tre cose… progetto-5 Chat Terminale Review Browser…"}
```

Cliccando «Note» si finisce **nella chat**. E il motivo si legge nel sorgente: nel template la voce è

```html
<button class="talos-nav-item" data-c="NavItem" data-conteggio="note">…<span>Note</span>…</button>
```

— **nessuna destinazione**, solo un contatore. E fra i sedici `id="schermo…"` del template
(`schermoAttivita`, `schermoAutomazioni`, `schermoBoard`, `schermoBrowser`, `schermoCapability`,
`schermoChat`, `schermoDoctor`, `schermoImpostazioni`, `schermoLibreria`, `schermoMemoria`,
`schermoModelLab`, `schermoOfficina`, `schermoReview`, `schermoRicerca`, `schermoTerminale`,
`schermoVuota`) **non esiste nessuno `schermoNote`**.

> ⛔ **T14-attivita-e-note-D4** (grave): la barra laterale mostra **«Note 1»** — contatore vivo, la
> nota c'è davvero sul disco (`.notes-store/ee395ffe….json`, «Appunti su lista.mjs») — ma **la pagina
> non esiste**. Il numero promette un posto dove non si può andare. C2 elenca Note fra le sei
> destinazioni e C24 la vuole **separata** dalle Attività: qui non è separata, è **assente**
> — prova: `foto/T14-attivita-e-note/03-note-clic-mouse.png`, `frontend/index.template.html:72`,
> `frontend/src/components/nav-item.js:44`

## ⛔ L'autore delle attività non è registrato — e la pagina lo dice da sola

`foto/T14-attivita-e-note/02-note.png`, riga dell'attività, verbatim:

> **Rivedere il diff di src/lista.mjs**
> Priorità alta · **Autore non registrato**

E il record sul disco conferma che il campo non c'è affatto:

```json
{ "id":"2697b59b…", "titolo":"Rivedere il diff di src/lista.mjs", "descrizione":null,
  "priorita":"high", "stato":"todo", "creataAlle":"…", "aggiornataAlle":"…" }
```

⇒ **C25** («le Attività mostrano l'autore su ogni riga: tu o l'agente») non è una riga di interfaccia
mancante: è un **campo che lo store non scrive**. Va detto a chi la implementerà, altrimenti si
aggiunge una colonna che resterà sempre «non registrato».

### Cosa funziona

- L'attività scritta dall'agente **compare** con titolo, priorità e stato, filtri Tutte/Da fare/In
  corso/Fatte, ricerca, «Nuova attività», e in fondo la nota sull'ambito.
- La frase della testata è **onesta**: «l'autore viene indicato **quando è registrato**».
- I valori sul disco sono neutri (`todo`, `high`), non tradotti: è la regola giusta (lezione
  `parola-tradotta-nel-database`).

## Verdetto (rivisto)

**FALLISCE** — 4 difetti, 4 gravi. Una delle due metà della prova (le Note) **non esiste come pagina**,
e l'altra ha un filtro per un dato che non viene mai scritto.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
