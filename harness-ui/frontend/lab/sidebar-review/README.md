# Sidebar destra — checkpoint di review

[Apri il dossier per il reviewer](docs/REVIEWER_START.md).

Questa directory contiene una correzione CSS operativa e un laboratorio offline **separato**. Il laboratorio non è collegato al filesystem, agli agenti o alle API di Talos.

## Produzione

`src/styles/inspector-tab-visibility.css`, importato in coda a `src/styles/main.css`, subordina il dettaglio figlio alla tab selezionata. Il nodo e lo scroll non vengono smontati. Guardia ampliata per selezione assente/incoerente e figlio nascosto; `[hidden]` non dipende dal supporto di `:has()`.

La fixture [visibility-regression.html](visibility-regression.html) punta al foglio operativo ed esegue 16 condizioni. Non sostituisce la build desktop o una sessione reale.

## Laboratorio riproducibile

```sh
cd prototype
python build.py
python build.py --check
```

Aprire il file generato `talos-sidebar-interattiva.html`. Il file HTML generato non è versionato; sorgenti e build lo sono. Il pacchetto consegnato nella conversazione contiene anche l'HTML già pronto, le prove, gli screenshot e la baseline approvata.

Risultato locale finale: **35 test Node, 98 controlli browser e 16 condizioni CSS superati**. Vedere [TESTING.md](docs/TESTING.md) per comandi, limitazioni del browser di prova e controlli non eseguiti. Non sono esiti della CI del repository.

## Scope e rischi

La UI File più calma, le operazioni file, il diagramma e la Review sono interazioni su fixture. La guardia non corregge un eventuale `activeTab` erroneamente reimpostato nel runtime. Nessun refactor generale è dichiarato completato; nessuna modifica a backend, mobile o navigazione principale. Verificare le WebView target e il routing reale prima del merge.
