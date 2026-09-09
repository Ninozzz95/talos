# Consegna — Full access su radice filesystem

Stato: **chiuso il rischio di watcher ricorsivo; gate modello reale ancora da
eseguire con un prompt dell’owner**.

La causa tecnica riprodotta era l’apertura di un watcher ricorsivo sulla radice
del volume. Ora una sessione che sceglie esplicitamente `Full access` su `C:\\`
può continuare a usare il file tree lazy e le operazioni della sessione, ma non
chiede al sistema operativo di osservare ogni file del disco. Per una cartella
di progetto ordinaria il comportamento precedente resta invariato.

Verifiche automatiche:

- `full-access-root-e2e.test.mjs`: radice senza chiamata a chokidar, cartella
  ordinaria con watcher, percorso libero conservato senza allowlist artificiale;
- suite desktop completa: **1149/1149** passati;
- sintassi e `git diff --check`: passati.

Limite dichiarato: il watcher sulla radice non invia aggiornamenti automatici;
il tree si aggiorna quando l’owner lo riapre o ricarica. Questo evita di fingere
un monitoraggio completo che il sistema non può sostenere in modo affidabile.
La prova con modello reale, stream, stop e reload su `C:\\` resta il gate
successivo e non viene simulata.

Riepilogo semplice: TALOS non dovrebbe più bloccarsi perché prova a guardare
automaticamente l’intero disco. La cartella resta disponibile quando l’owner la
ha autorizzata, ma viene esplorata solo quando serve.

