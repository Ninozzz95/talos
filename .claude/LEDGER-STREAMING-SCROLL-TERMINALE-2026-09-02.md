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

## Stato

🔜 Aperto, appena registrato. Indagine in corso nella stessa sessione.
