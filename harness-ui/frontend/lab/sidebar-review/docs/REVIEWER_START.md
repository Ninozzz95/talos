# PR #33 — dossier per il reviewer

## Decisione richiesta

Revisionare separatamente **la guardia CSS destinata al desktop** e **il laboratorio File/Agenti approvato, ora alleggerito e irrobustito**. Questa PR non collega il laboratorio al runtime Talos. Non approvare il secondo come se fosse già un file manager di produzione.

Repository: `Ninozzz95/talos`. PR: [#33](https://github.com/Ninozzz95/talos/pull/33). Branch: `fix/desktop-inspector-tabs-calm-lab`. Base analizzata: `13f65c15cdeaf8986b882993a0773cdeafb867d2`. Il lavoro resta su una sola PR; nessun merge automatico.

## Percorso di lettura

| Documento | Scopo |
| --- | --- |
| [CODE_REVIEW.md](CODE_REVIEW.md) | Difetti trovati, correzioni e rischi residui, con riferimenti ai test |
| [ENGINEERING_REVIEW.md](ENGINEERING_REVIEW.md) | Responsabilità dei moduli, limiti architetturali e confine con la produzione |
| [UX_BEFORE_AFTER.md](UX_BEFORE_AFTER.md) | File meno affollata, comandi conservati, confronto misurato |
| [TESTING.md](TESTING.md) | Risultati, ambiente, comandi ripetibili e verifiche non eseguite |
| [RESEARCH.md](RESEARCH.md) | Fonti primarie e alternative considerate |
| [REQUIREMENTS_MATRIX.md](REQUIREMENTS_MATRIX.md) | Mappatura dello scope richiesto: produzione, demo e rinvii |
| [CHECKPOINTS.md](CHECKPOINTS.md) | Commit, checkpoint, integrità e rollback |
| [REVIEWER_CHECKLIST.md](REVIEWER_CHECKLIST.md) | Percorso manuale e condizioni da verificare prima del merge |

## Cosa è cambiato

**Produzione:** `src/styles/inspector-tab-visibility.css` mantiene il dettaglio figlio subordinato alla tab Agenti; il suo import in `src/styles/main.css` resta l'unica modifica all'entry point. Nessuna API, backend, navigazione principale o pagina mobile modificata.

**Laboratorio:** sorgenti riproducibili in `lab/sidebar-review/prototype/`. Le modifiche File sono conservative: selettore unico per le viste, azioni visibili alla selezione, indicatori meno invasivi. Copie, rinomina, cestino, ricerca, virtualizzazione, focus e Review ricevono regressioni aggiuntive. Chat e shell approvate restano visivamente invariate nel confronto iniziale.

**Evidenza finale locale:** 35 test Node, 98 controlli browser e 16 condizioni della fixture di visibilità superati. Non sono 149 test end-to-end dell'app. Build desktop, lint complessivo, typecheck complessivo, sessione reale e screen reader restano da eseguire.

## Aprire il laboratorio

Dalla directory `harness-ui/frontend/lab/sidebar-review/prototype`:

```sh
python build.py
python build.py --check
```

Aprire `talos-sidebar-interattiva.html` in un browser desktop. Il file generato è escluso da Git per evitare un duplicato di 116.112 byte nel diff; è incluso già pronto nel pacchetto consegnato. Nessuna dipendenza o installazione serve per aprirlo. Python serve solo per rigenerarlo; Playwright serve solo per le prove automatiche.

## Confine della consegna

Nel pacchetto allegato sono presenti HTML aggiornato, sorgenti, test, risultati JSON, screenshot comparabili e baseline approvata. I font non sono distribuiti. Il confronto pixel riguarda il precedente prototipo, non l'app desktop avviata. Il dossier è una **self-review assistita**, non l'approvazione di un reviewer indipendente.
