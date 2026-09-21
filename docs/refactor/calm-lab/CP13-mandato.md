# CP13 — mandato e baseline del componente

Data: 2026-09-17. PR #27, ramo `refactor/desktop-ledger-2026-09-17`.
Baseline osservata: `726c106f9e1dea681bf24a332ac6b0cc9115a299`.

## Richiesta dell'owner

- Approvato il mockup Calm Lab v03: catalogo con filtri funzionali, scheda modello a pagina intera; niente sidebar di dettaglio modello.
- Committare nella PR, mantenere checkpoint, eseguire un ulteriore passaggio di code review/engineering review e irrobustimento.
- Integrare tutte le impostazioni tema attuali, incluso il selettore dei 14 temi, dall'interazione all'applicazione e alla persistenza.
- Aggiunta esplicita: dropdown e componenti custom, non UI legacy. Semantica accessibile e navigazione da tastiera rimangono requisiti, non vengono sacrificate al rendering custom.
- Consegnare un dossier completo per il revisore della PR.

## Vincoli

Il mockup usa dati dimostrativi: non sostituire con essi cataloghi, provider o hardware reali. Non equiparare prova del mockup a integrazione backend. Nessun merge, tag, release, auto-merge, force push o modifica all'installazione abituale. Preservare i lavori già nella PR e i blocchi globali documentati.

La baseline della PR è 16 commit avanti rispetto allo ZIP sorgenti `b25d0c6`. Le modifiche esistenti a `features/settings`, `impostazioni.js` e relativo CSS vanno preservate. I trasporti storici `*-slice` non vanno rieseguiti.

## Inventario da coprire

`CAMPI_IMPOSTAZIONI` contiene 40 controlli (il vecchio commento "38" non è una fonte aggiornata): 14 temi nel selettore; modalità colore; densità e lingua; scena; scala UI e chat; forma/apertura composer; stile messaggi; animazione risposta; pannelli; sfondo e animazioni attivi; pausa finestra; risparmio dati; movimento ridotto; renderer e qualità; 8 cursori scena; profilo/curva/durata/intensità/stagger UI; 6 famiglie di animazioni; intestazione immersiva; chat a tutta larghezza.

Un controllo, un proprietario della preferenza. Il prodotto conserva il suo percorso di salvataggio e le chiavi esistenti; un bridge interno nascosto, se necessario per compatibilità, non deve diventare una seconda interfaccia o un secondo store.

## Gate del lotto

1. Inventario macchina-verificabile e confronto dei valori/opzioni con la baseline.
2. Controlli custom: tastiera, typeahead, focus, Escape, click esterno, aggiornamenti dinamici, disabled, cleanup e collisioni con le modali.
3. Copertura roundtrip dei valori e ripristini senza perdita delle preferenze estranee.
4. Regressioni del catalogo approvato e controllo dell'assenza di dati demo sul percorso produttivo.
5. Manifesto dei byte, log positivi/negativi, limiti e istruzioni di revisione/rollback.

Stato a questo checkpoint: ricognizione; implementazione e qualificazione ancora da eseguire. Questo file non dichiara completato il lotto né chiusa la PR globale.
