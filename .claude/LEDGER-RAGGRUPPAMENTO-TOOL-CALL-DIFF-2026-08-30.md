# LEDGER — Raggruppamento tool-call in collapse + diff totale + diff per-file (30/8)

> ⛔ Richiesta arrivata **a metà turno**, mentre ero dentro il giro di QA
> visiva (Task 6, `.claude/QA-VISIVA-HARNESS-2026-08-30.md`). Per la
> regola vincolante **UNA FASE ALLA VOLTA** (`una-fase-alla-volta-finisci-verifica-poi-vai.md`):
> *"un filo vero trovato lavorando su una fase non è quella fase, si
> registra e si lascia per un sì separato"*. ⇒ **Registrata qui per
> intero, NON iniziata**: nessun file di prodotto toccato per questo
> lavoro. Riprendo la QA da dove ero; questo parte con un sì esplicito
> separato, quando l'owner lo dà.

## Richiesta owner, verbatim (30/8, durante Task 6 della QA)

> *"Vorrei che i comandi venissero raggruppati in un collapse come fa
> Claude, con diff totale accanto, se ci clicco deve avere la lista
> completa (comportamento attuale) ma in ogni modifica ci deve essere
> il diff specifico per ogni file (segni +n e -n), ti mando screenshot
> come riferimento"*

Due screenshot allegati, salvati da chi ospita la sessione a:
- `C:\Users\Antonino\.claude\uploads\e9837cd7-0a52-417e-9f3e-fa75f9ba2638\626c9f3c-image.jpg`
- `C:\Users\Antonino\.claude\uploads\e9837cd7-0a52-417e-9f3e-fa75f9ba2638\3fa5f8b9-image.jpg`

⛔ **Non sono screenshot di Harness Desktop**: mostrano l'interfaccia di
**Claude Code stesso**, in un'altra sessione (contenuto riconoscibile:
"FASE B/C/D/E", `sync-harness-ui-mobile.mjs`, `CATALOGO.md` — è il
filone mobile/desktop-harness-alignment, sessione diversa da questa).
"Come fa Claude" = il riferimento di comportamento da copiare, il
bersaglio dell'implementazione resta Harness Desktop
(`mobile/public/harness-ui/app.js`).

## Spec UX esatta, dedotta dai due screenshot

**Stato collassato** (screenshot 1) — una riga di riepilogo per batch di
tool-call consecutivi, testo naturale a elenco run-on:
```
Eseguito 19 comandi (1 errore), letto 2 file, trovato file, cercato codice ›
Letto 3 file, modificato 2 file, eseguito 20 comandi (2 errori), creato un file +77 -19 ›
Modificato app.js, eseguito 2 comandi +63 -0 ›
Eseguito 7 comandi (2 errori) ›
```
- Il **diff totale** (`+77 -19`, verde/rosso) compare **solo** se il
  batch contiene almeno una scrittura reale (modifica/creazione) — un
  batch di sole letture/ricerche/comandi non lo mostra.
- Chevron `›` sempre presente, apre/chiude.

**Stato espanso** (screenshot 2, click sulla riga `+77 -19` sopra) — la
lista COMPLETA delle singole tool-call **resta** (comportamento
attuale, non cambia), una riga per chiamata:
```
Lettura app.js ›
Modificato app.js +16 -1 ›
Impossibile check for any tests asserting the removed note text ›   (rosso — verifica fallita)
Confirmed device still connected ›
...
Creato cdp-verifica-bug2.mjs +44 -0 ›
...
Modificato cdp-verifica-bug2.mjs +4 -5 ›
...
Aggiornato cdp-verifica-bug2.mjs +13 -13 ›
```
- Ogni riga di **scrittura** (Modificato/Creato/Aggiornato) porta il
  suo **diff per-file** (+n/-n), incrementale rispetto alla versione
  precedente di QUELLA chiamata — non un totale cumulativo per file.
- Le righe di sola lettura/ricerca/verifica **non** portano diff.
- Lo stesso file può comparire in **più righe distinte** lungo la
  sequenza (es. `cdp-verifica-bug2.mjs` modificato tre volte, tre righe
  separate con tre diff separati) — non si accorpano in una sola riga
  per file.

## Stato attuale in Harness Desktop, verificato leggendo il sorgente (non presunto)

- **Nessun raggruppamento oggi**: ogni tool-call è già una riga
  indipendente in `.conversation` — zero occorrenze di un meccanismo di
  raggruppamento/collapse nel sorgente (`app.js`), verificato via grep
  mirato (`toolGroup`/`diff-badge`/`raggruppa`/etc. — nessun match).
- Riga generata da `riassuntoAttrezzo(nome, argomenti)` (`app.js:3092`)
  — lo switch che produce "Letto ...", "Cercato ...", "Ricerca web:
  ...", ecc. — e appesa via `appendToolNote(...)` (`app.js:3005`).
  Nessun diff-badge oggi su queste righe.
- **Il pezzo di calcolo diff ESISTE GIÀ**, riusabile: `calcolaDiffRighe(prima, dopo)`
  (`app.js:3623`), oggi usato per il pannello Review (i "+28 righe"/
  badge nuovo-modificato già visti in QA, es. Task 5.1). L'implementazione
  futura di questo lavoro NON deve reinventare il calcolo diff — solo
  collegarlo alle righe tool-call in conversazione, che oggi non lo
  chiamano.

## Cosa serve (bozza, da confermare quando si apre davvero questo lavoro — non un piano approvato)

1. Un meccanismo di **raggruppamento** di tool-call consecutivi in un
   turno (batch = sequenza ininterrotta prima del prossimo blocco di
   testo/ragionamento del modello, a giudicare dagli screenshot).
2. Riepilogo testuale del batch (riuso/estensione di `riassuntoAttrezzo`
   per un ARRAY invece di una singola chiamata) + somma dei diff
   per-file del batch per il totale mostrato collassato.
3. Il rendering espanso NON cambia (le righe singole ci sono già) — si
   aggiunge SOLO il badge diff su quelle di scrittura, chiamando
   `calcolaDiffRighe` sul prima/dopo già disponibile per quella
   tool-call (verificare che `prima` sia già portato fino a lì per ogni
   tool-call di scrittura, non solo per l'aggregato di Review).
4. Test: un batch di sole letture non mostra diff (né totale né
   per-riga); un batch con scritture mostra il totale corretto
   (somma algebrica dei +n/-n delle righe che scrivono); lo stesso
   file modificato più volte nello stesso batch produce righe/diff
   separati, non accorpati.

## Stato

🔜 **APERTO, non iniziato.** Nessun file toccato. Riprende con un sì
esplicito dell'owner, verosimilmente dopo la chiusura del giro di QA
visiva in corso (`.claude/QA-VISIVA-HARNESS-2026-08-30.md`, Task 6 di
14 al momento di questa registrazione).
