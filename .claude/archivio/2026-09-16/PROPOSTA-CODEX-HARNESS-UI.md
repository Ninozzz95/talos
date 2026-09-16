# Proposta — Codex, l'interfaccia del banco/harness

> Scritto il 2026-08-24 come proposta, non come ordine di partenza: aspetta
> il tuo sì prima di diventare un ticket vero con confini precisi come
> `CONSEGNA-CODEX-0.1.19-VOCE-FLUIDA.md`.

## La domanda che decide tutto

Il mockup (`TALOS-RICERCHE/harness-ui-mockup-2026-08-20/`, 18 file,
confermato ancora sul disco) porta la sua stessa regola scritta addosso:
*"non si implementa finché l'harness stesso non funziona o non è stabile"*.
Quella regola aveva 4 giorni quando è stata scritta. Stanotte due cose sono
cambiate insieme:

1. **Il banco (TALOS-BANCO) è demonstrabilmente stabile come infrastruttura**:
   campagne da 40+ righe che chiudono pulite, resume che non perde lavoro
   pagato, un rapporto che calcola la propria risoluzione statistica. Questo
   non è cambiato stanotte, è il risultato di settimane.
2. **Ma il comportamento INTERNO di talosHarness.mjs è appena tornato in
   movimento**: Stadio A ha aggiunto compattazione e riflessione oggi, e
   Stadio B (appena approvato) toccherà i suoi parametri numerici da qui in
   avanti.

⇒ La domanda giusta non è "il harness è stabile sì/no": è **quale strato**
di esso è stabile. La riga di comando (`corsaCoding.mjs <harness> <fino-a>
<ripetizioni>`), il formato delle righe JSONL (`esito`, `giriDelTask`,
`cambiamenti`, `costoUsd`), il rapporto bootstrap — sono fermi da giorni e
non hanno motivo di cambiare per Stadio B, che tocca solo COME talos genera
le sue righe, non la loro FORMA. Quella forma è il contratto stabile.

## Cosa propongo

**Sì, a Codex — ma sul contratto, non sull'interno.** Ricerca corrente
conferma la stessa disciplina: un'interfaccia costruita contro un contratto
dichiarato (formato dati, non implementazione) sopravvive a un backend che
continua a evolvere sotto, purché il contratto stesso non cambi forma —
esattamente la situazione qui: JSONL e CLI restano fermi, l'euristica
interna di talos no.

Confini proposti per il ticket vero:

- **Sorgente dati**: le righe JSONL già scritte da `corsaCoding.mjs`
  (`TALOS-BANCO/esiti-*/`) e l'output di `rapportoCampagna.mjs` — mai una
  chiamata diretta a `talosHarness.mjs` o a un motore. L'interfaccia LEGGE
  campagne già corse, non ne pilota una nuova: quello resta un compito mio.
- **Worktree/ramo dedicato**, come voce-fluida: niente lavoro diretto su
  `lane/voce-personale`, niente collisione con Agente 19.
- **Il mockup è il piano che aspetta**: non si riprogetta da zero — 18 file
  già pronti, `RESEARCH.md` con l'analisi dei concorrenti, `UI_REVIEW.md`
  con la matrice QA responsive già fatta. Il lavoro è portarlo a
  componenti reali sopra dati reali, mobile-first come Claude Code e Codex.
- **Confine esplicito**: se durante il lavoro emerge che il formato JSONL
  DEVE cambiare per rendere l'interfaccia onesta (è già successo con la
  colonna del costo, ad agosto) — si ferma e lo dichiara, non lo cambia da
  solo: quel formato lo leggono anche `rapportoCampagna.mjs` e ogni script
  di analisi già scritto.

## Cosa NON è questa proposta

Non è "dare a Codex il banco". Il banco (le corse, le cure di Stadio A/B/C,
`talosHarness.mjs`) resta mio. Questa è solo la VETRINA su dati che il
banco produce già — la stessa separazione che ha reso possibile fondere
voce-fluida senza conflitti: due lavori sullo stesso argomento, zero file
in comune.
