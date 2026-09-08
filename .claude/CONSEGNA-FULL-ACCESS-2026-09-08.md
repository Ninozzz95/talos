# Accesso pieno fuori progetto — 08/09/2026

Implementata la scelta owner «opzione 2»: con Accesso pieno esplicito la trifecta non forza più una conferma. Il registry comunica il livello al kernel; prima lo inviava come undefined. Le ricevute del kernel continuano a calcolare la trifecta; non è stata aggiunta una nuova superficie UI per E22. Divieti espliciti, override Chiedi, protezioni dei file di controllo e floor restano attivi.

Corretto anche `discoNode`: un percorso assoluto identifica adesso il file richiesto. Prima veniva concatenato al workspace, generando un percorso inesistente. Le autorizzazioni restano separate dalla risoluzione; il progetto scelto non viene spostato sulla radice del disco.

## Prova reale

Sessione di prova `2236ac46-59f9-4db6-b0fe-4572807c1b10`, Claude Sonnet 5 via OpenRouter, Full access con shell su Sempre consentito. Workspace `scratchpad/prove/full-access-20260908/progetto`; file esterni in `C:/Users/Antonino/Desktop/TALOS-prova-accesso-20260908`.

- Dal composer: richiesta naturale di leggere `controllo.txt`, creare `risposta.txt`, elencare la cartella e controllare il contenuto con due comandi distinti.
- File creato realmente: `tormalina`, verificato da lettura indipendente sul disco. Zero REFUSED e zero ApprovalRequested.
- Insuccesso mantenuto: il modello ha inizialmente scelto `type` di Windows, mentre la shell effettiva era Bash in WSL2; exit1. Ha poi usato il percorso `/mnt/c/...` e concluso. Non è stato un rifiuto di permessi e non viene contato come comando riuscito.
- Reload della pagina; modifica controllata della fixture in `ametista`; seguito naturale. Tool reali `leggi` e `scrivi` su percorsi Windows assoluti: file esterno aggiornato esattamente ad `ametista`; diff +1/−1 visibile. Nessuna approvazione extra.
- Cronologie dell'owner intatte. File di prova e trace conservati; nessuna cancellazione o push.

## Cancelli

RED riprodotti prima degli edit: Full access negato dalla trifecta, conferma inattesa con callback, percorso assoluto ENOENT, livello Full access non propagato.

GREEN: focalizzati 310/310, backend 1803/1803, kernel 552/552, `git diff --check`. Test permanenti `full-access-policy.test.mjs` e `FULL-ACCESS-REGISTRY-01`. Vecchi scenari trifecta, livelli limitati, deny/Chiedi, controlli speciali e radice Windows ancora verdi.

Screenshot scuri reali 1920×1080, 2560×1440, 3840×2160, aperti personalmente: `.claude/immagini/full-access-2026-09-08/`, manifest compreso. Nessun asset UI cambiato in questa fase. Server 4174 aggiornato.

Ricerca primaria, pin Hermes `2237be355906fbe6065ce1815711eee52b2d646e`, decisione di adattamento e rollback nel `LEDGER-FULL-ACCESS-2026-09-08.md`. La copia distribuita del kernel desktop è quella modificata; checkout mobile non sovrascritto.

**Cosa deve fare l'owner:** ricaricare 4174 e riprovare la sua conversazione con Accesso pieno.
**Cosa fai tu dopo:** riprendere la decisione Autocompact dai benchmark conservati.
**Cosa rimane:** scelta e integrazione dell'engine, gate reale Anthropic quando il saldo sarà disponibile, proposte OAuth/Compactor/file/Bash/computer-use e fallback/RTK nelle rispettive code.
