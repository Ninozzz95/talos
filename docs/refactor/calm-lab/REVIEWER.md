# Handoff al PR reviewer — Calm Lab / Impostazioni

## Leggere prima

PR #27, ramo `refactor/desktop-ledger-2026-09-17`. Baseline del lotto `726c106f9e1dea681bf24a332ac6b0cc9115a299`. CP13–CP17 documentano mandato, implementazione, negativi e correzioni. **Non è una richiesta di merge globale.** Mantenere Draft e tutti i blocchi del ledger generale.

## Due consegne distinte

1. **Prodotto:** `harness-ui/frontend/src/components/calm-controls.js`, relativo CSS, innesti in `src/main.js` e `src/styles/main.css`. Dropdown, checkbox/switch e slider custom nelle Impostazioni, Studio temi e superfici annotate. Conservati proprietari, ID, opzioni, normalizzatori e salvataggio di tutte le 40 preferenze e dei 14 temi. Gli elementi nativi nascosti sono un ponte interno, non la UI visibile né un secondo store. Il resto dell'app non è dichiarato interamente migrato ai componenti custom.
2. **Riferimento approvato:** `harness-ui/frontend/prototypes/calm-lab/`. Catalogo con filtri v03, scheda modello a pagina intera e v04 con temi completi/componenti custom. È sorgente ordinario con build HTML e test. **Non viene importato dal prodotto; catalogo e azioni di modello sono ancora dimostrativi. Il nuovo layout del catalogo non è ancora una migrazione completa alle API reali.**

## Percorso di review

- Confrontare i 40 campi con `src/components/impostazioni-campi.js`, le 14 palette e `theme-studio.js`.
- Seguire input/change dal controllo custom al proprietario esistente; leggere test di applicazione, reload, reset ed errore storage.
- Controllare i cicli mount/remove/dispose/BFCache, i descriptor per istanza, AbortController e filtro del MutationObserver.
- Verificare tastiera, opzioni disabled, typeahead, Escape, Tab, popup nel dialog proprietario, focus ritorno, etichette, required e forced colors. L'automazione non è una certificazione assistiva completa.
- Verificare che nessun dato demo raggiunga il prodotto, e che il prototipo mantenga filtri, ritorno da scheda, stati sconosciuti e conferme cloud.
- Leggere anche i negativi nei CP15–CP17. I driver cambiati mantengono gli assert, ma la loro correttezza richiede review.

## Riproduzione

Node 24.18.0; installare dai lock nei tre progetti `harness-ui`, `harness-ui/frontend`, `context-engine`; build frontend e `tsc -p harness-ui/frontend/tsconfig.refactor.json`. Il workflow read-only `.github/workflows/desktop-calm-review.yml` esegue:

- `tests/qualification/calm-controls-real.mjs`: backend/bundle reali, nessuna API modello finta né inferenza.
- suite frontend completa;
- `workspace-real.mjs` e `settings-models-real.mjs`;
- separatamente generazione, build e test del prototipo.

Nel prototipo: `node make-contract.mjs`, `node build.mjs`, `node --test tests/*.test.mjs`. I test Python browser richiedono Playwright e `CHROMIUM_PATH`. I test appearance del prototipo usano uno storage in memoria dichiarato; il reload del profilo reale è una prova diversa.

## Evidenze e limiti

L'owner riceve `TALOS-Revisione-PR27-Calm04.zip`: inventario JSON/Markdown, mandato originale, checkpoint, self-review ingegneristica (NON indipendente), log positivi/negativi locali e CI, sorgenti e patch, storico di revisione separato, istruzioni/rollback, manifesto SHA-256 e verificatore read-only con prove negative. Richiedere quel file all'owner: un percorso sandbox della chat non è un URL GitHub.

I risultati più recenti vanno letti sul preciso SHA candidato. Non ereditare il verde di un antenato. In particolare la prova completa Windows/Electron/installer non deriva dalle prove Chromium su Linux. Nessuna chiamata a pagamento, modifica al profilo abituale, tag o release.

Rollback: revert dei commit del lotto in ordine inverso, dopo aver verificato eventuali discendenti concorrenti; oppure rimuovere innesti+renderer+CSS insieme. Nessuna migrazione delle preferenze o dati modello. I vecchi trasporti `*-slice` sono documentazione storica: non rieseguirli. Il trasporto temporaneo CP15 e il workflow con diritto di scrittura sono già stati rimossi dal ramo.
