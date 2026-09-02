# Ledger — auto-scroll, streaming scattoso, dissolvenza, cursore terminale (02/09)

> Owner, dal vivo, in tre messaggi consecutivi mentre lavoravo sul
> ridisegno del Model Lab:
> 1. *"un altro bug che ho notato è lo scrolling automatico fa schifo non
>    centra bene la risposta in streaming al centro, bisogna vedere come
>    fa claude codex e hermes (hermes devi vedere esattamnte la funzione
>    di codice che lo fa) e poi lo streaming dell output è macchinoso ed
>    estremamente scattoso"*
> 2. *"in oltre il rendering a dissolvenza e cursore terminale non
>    funzioano bene"*
>
> Registrato SUBITO (regola vincolante: ogni debito riportato si segna
> prima di indagare), non ancora diagnosticato riga per riga in questo
> commit — questo file apre l'indagine, non la chiude.

## I quattro punti, come riportati

1. **Auto-scroll durante lo streaming**: non centra bene la risposta
   mentre arriva. Owner chiede un confronto con Claude/Codex/Hermes —
   e per Hermes, specificamente, la funzione di codice REALE (repo
   locale già clonato in scratchpad: `hermes-agent-repo/`, `hm2/`), non
   un'impressione.
2. **Streaming dell'output "macchinoso ed estremamente scattoso"** —
   probabile correlato al punto 1 (stesso ciclo di re-render ad ogni
   token?), ma trattato come punto distinto finché non isolato.
3. **Rendering a dissolvenza (fade-in) non funziona bene** — presumo sia
   l'animazione di comparsa del testo/dei blocchi mentre arrivano, da
   verificare nel codice quale selettore/classe la applica.
4. **Cursore del terminale non funziona bene** — imparentato con
   `LEDGER-TERMINALE-REALE.md` (xterm.js, già una storia di bug
   sottili qui: keyCode mancante, mousedown/mouseup reali per il focus,
   `height` fissa contro il loop di resize) — da leggere prima di
   toccare `.terminal-window`/xterm, non ripartire da zero.

## Prossimi passi (non ancora eseguiti)

- Isolare nel codice (`app.js`) dove avviene lo scroll automatico
  durante `TextMessageContent`/`StateDelta` (probabile un
  `scrollIntoView`/`scrollTop` ad ogni chunk) e la classe/animazione di
  dissolvenza.
- Leggere il sorgente REALE di Hermes per l'auto-scroll durante lo
  streaming (repo locale in scratchpad — verificare se è aggiornato
  o va riclonato) — funzione esatta, non una descrizione.
- Misurare la "scattosità" con CDP Tracing (stesso strumento già usato
  per il lag di Harness Desktop, `LEDGER-LAG-DESKTOP-2026-09-01.md`) —
  non fidarsi a occhio: frame lunghi, layout thrashing, o un
  intervallo/callback che ridisegna più del necessario.
- Terminale: leggere `LEDGER-TERMINALE-REALE.md` per intero prima di
  toccare xterm — il cursore potrebbe essere lo stesso tipo di difetto
  già trovato lì (evento sintetico incompleto) o uno nuovo.

## ⛔⛔⛔ Registrato mentre indagavo sopra — DUE bug distinti, più gravi (correttezza, non cosmesi)

> Owner, dal vivo, trascritto letterale di una sessione TALOS reale
> (`google/gemini-3.7-flash`) mentre lavoravo sul fix sopra:
>
> **Turno 1** — "Create a new file named r2r3-proof.txt in this
> workspace with the text hello." → risposta del modello: *"Non è
> possibile creare o modificare file: l'ambiente è attualmente
> configurato in modalità sola lettura (read-only), quindi le
> operazioni di scrittura su disco non sono consentite."*
>
> **Turno 2** — "say hi" → **errore**, non una risposta:
> `[internal-error] HTTP 400 dopo 4 tentativi:
> {"error":{"message":"talos-test/modello-inesistente-r2r3 is not a
> valid model ID","code":400},"user_id":"user_3FG1j8kmjWdYSixNglpxJIZn4RO"}`
>
> Owner, subito dopo: **"l'ambiente non era in sola lettura"** — cioè
> il turno 1 ha mentito: il permesso NON era read-only per davvero.

### Perché sono gravi

1. **Falso "read-only"**: un modello che rifiuta di scrivere per un
   motivo dichiarato FALSO viola direttamente la disciplina di onestà
   di questo progetto (REGOLA ZERO) — non è "il modello ha sbagliato",
   è che lo STATO che gli è stato passato/letto era sbagliato. Sospetti
   da verificare, non presunti: risoluzione del permesso di sessione
   (`Workspace write`/`Full access`/`On request`), un default che non
   combacia con la selezione reale, o l'attrezzo `scrivi` che legge un
   flag stantio.
2. **ID modello di TEST in una sessione REALE**:
   `talos-test/modello-inesistente-r2r3` ha un prefisso `talos-test/`
   che grida "sentinella di test" — un valore che dovrebbe esistere
   SOLO dentro una suite `node --test`/vitest per provare il percorso
   di errore su un ID inesistente, non nella risoluzione modello di una
   sessione vera con un modello vero selezionato (`google/gemini-3.7-flash`,
   turno 1). Se un fixture di test sta contaminando la risoluzione
   modello in produzione, è un buco potenzialmente serio — stato
   condiviso fra test e server vivo, o una costante hardcoded con un
   fallback sbagliato. Non diagnosticato ancora: da cercare
   `talos-test/modello-inesistente-r2r3` letteralmente nel codice
   (sorgente Y test) per capire da dove esce E perché finisce in una
   sessione reale.

### Stato

🔜 Registrati, NON ancora diagnosticati — prossimo passo di questa
sessione dopo aver chiuso scroll/dissolvenza (fase già in corso,
quasi finita quando questi due sono arrivati).

## ✅ Scroll/dissolvenza — CORRETTI, verificati dal vivo

> ⛔ **Correzione owner, durante il primo giro di fix**: il primo
> tentativo seguiva il FONDO vero (`scrollHeight`, pattern Hermes
> "stick-to-bottom"). Owner, subito dopo: *"ripeto lo scroll non deve
> fermarsi a fine pagina ma a meta... quando scrollo alla fine output
> deve essere a meta non alla fine"* — la scelta di QUESTO prodotto è
> il CENTRO del viewport, non il fondo. Corretto nello stesso giro,
> prima di committare la prima versione.

- **Scroll**: `scrollStreamingOutput` non centra più l'intera bolla
  (che perdeva senso una volta più alta del viewport, il difetto
  originale) — ora porta il FONDO DEL CONTENUTO scritto finora
  (`getBoundingClientRect().bottom` dell'elemento messaggio, che si
  sposta in giù col testo vero) a META' del viewport, istantaneo (mai
  `smooth`), e SOLO mentre `streamingAutoFollow` è vero (si spegne da
  solo se l'utente scrolla via — confronto fra lo scrollTop reale e
  l'ultimo bersaglio scritto da noi, `streamingLastTargetTop`; si
  riarma su `RunStarted`). Principio "singolo writer, istantaneo mai a
  molla, mai contro un utente che si è spostato" preso da Hermes
  (`use-stick-to-bottom`, `apps/desktop/src/components/assistant-ui/
  thread/list.tsx`, letto dal vivo nel repo locale in scratchpad — la
  LORO scelta di bersaglio è il fondo, la NOSTRA è il centro, owner
  esplicito) — riportato in vanilla JS senza dipendenze nuove.
- **Dissolvenza**: `.stream-settle` sostituisce `:last-child` — la
  classe marca UNA VOLTA SOLA il testo appena stabilizzato
  (`renderizzaMarkdownIncrementale`), mai la coda volatile ricreata
  ogni frame, quindi l'animazione ora finisce invece di ripartire in
  continuazione.
- **Verificato dal vivo** (`verifica-scroll-streaming.mjs`, due sessioni
  reali `z-ai/glm-4.7-flash`): la PRIMA corsa (versione fondo-vero,
  prompt lungo su TCP) ha confermato che il meccanismo insegue
  davvero la coda che cresce (non più il centro dell'intera bolla). La
  SECONDA corsa (dopo la correzione al centro-viewport, prompt "25
  comandi Git") conferma `distanzaDalFondo:250` al termine — la vista
  NON è incollata al fondo (0px), coerente col nuovo bersaglio; il
  turno è stato più veloce del previsto (~11s) e non ha lasciato una
  finestra comoda per uno screenshot con `streaming:true` E contenuto
  già oltre il viewport nello stesso istante — la MATEMATICA del
  bersaglio (fondo del contenuto meno metà altezza viewport, clampato)
  è verificata per lettura diretta del codice, non (ancora) da uno
  screenshot che la coglie a metà stream. 🔜 Se dal vivo risultasse
  ancora non convincente, riverificare con un prompt che produce testo
  lungo più lentamente (paragrafi discorsivi, non un elenco veloce).
  `settleCount` cresce e l'ultimo figlio resta SENZA la classe
  `stream-settle` finché non si stabilizza — comportamento della
  dissolvenza confermato dalla telemetria, non solo dal codice. Zero
  eccezioni JS in nessuna delle corse. Backend 1319/1319 (fixture
  contratto rigenerata due volte), frontend 200/200.
- 🔜 Non implementato in questo giro (dichiarato, non perso): un
  pulsante "vai in fondo" quando l'utente si scosta (Hermes ce l'ha,
  `ScrollToBottomButton`) — senza, chi scrolla via durante uno stream
  lungo deve poi scrollare a mano fino in fondo. Nessuna regressione
  (prima l'auto-scroll lo forzava comunque giù, ora semplicemente non
  lo fa più) ma è il naturale incremento successivo.

## ⛔ Owner, dal vivo, subito dopo — due richieste in più sulla stessa area

*"e quando clicco su una riga sessione il testo deve scrollare
automaticamente alla fine, e quando ricarico la pagina bisogna che si
apra automaticamente ultima sessione disponibile, ack tutto adesso"*

Diverso dallo streaming sopra — qui si parla di aprire una sessione
GIÀ FERMA (nulla sta crescendo), quindi "alla fine" ha senso pieno
(non c'è ambiguità centro/fondo per un contenuto statico):
1. Cliccare una riga nella sidebar deve scrollare la conversazione
   aperta fino in fondo (l'ultimo messaggio), non lasciarla dov'era.
2. Un reload di pagina deve riaprire da solo l'ULTIMA sessione
   disponibile, non lo stato vuoto "premi Nuova per iniziare".

🔜 Non ancora implementate — prossimo passo dopo il commit dello
scroll/dissolvenza streaming.

## Cursore terminale, e i due bug di correttezza

🔜 Cursore terminale: non ancora guardato dal vivo.
🔜 I due bug di correttezza (falso read-only, ID modello di test):
non ancora diagnosticati — prossimo passo.

## ⛔ Owner, dal vivo, mentre chiudevo lo scroll/dissolvenza

*"lo streaming ha lag sostanziali a meta testo, se non l'hai già fatto
trova un modo per strumentare tutte queste statistiche per loggarle e
debuggarle"* — chiede STRUMENTAZIONE permanente (non un altro script
usa-e-getta): marks/measures + un log delle statistiche di rendering
durante lo streaming, per poter diagnosticare un lag futuro senza
ripartire da zero ogni volta. 🔜 Da implementare, prossimo passo dopo
questa nota.
