# Riquadro grafo e Markdown Panoramica — 19/09/2026
Owner TALOS UI. Richieste esplicite owner: tutta la card apre il dettaglio; compito e risultato leggibili in Markdown.
## File esatti e simboli
- harness-ui/frontend/src/components/grafo-agenti.js: montaGrafoAgenti/ridisegna, listener card; onApri invariato, titolo button nativo e collassa separati, identità keyed e pan invariati.
- harness-ui/frontend/src/styles/grafo-agenti.css: .talos-grafo__nodo cursor, mantenere geometria/mockup.
- harness-ui/frontend/src/components/dettaglio-agente.js: creaDettaglioAgente/disegnaPanoramica, riuso renderizzaMarkdown per task/esitoDelega. API dati invariata, nessun innerHTML grezzo.
- harness-ui/frontend/src/styles/dettaglio-agente.css: prosa compatta, pre/code/tabelle contenuti, nessuna larghezza nuova del rail.
- harness-ui/frontend/tests/browser/po30-dettaglio-agente.spec.mjs: RIPRESA-GRAFO-CARD-INTERA, RIPRESA-AGENTE-PANORAMICA-MD (desktop/mobile, task/esito, link non sicuri e HTML).
- .claude/LEDGER-RIPRESA-GRAFO-PANORAMICA-2026-09-19.md: questo registro.
## Ricerca primaria / decisione upstream
Consultate W3C APG Button Pattern https://www.w3.org/WAI/ARIA/apg/patterns/button/ ; MDN event bubbling https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling ; CommonMark 0.31.2 https://spec.commonmark.org/0.31.2/ . Adattare eventi DOM nativi conservando il button tastiera, ignorare click dei controlli figli per evitare doppia apertura. Non annidare button. Riutilizzare renderer TALOS markdown.js con html-fidato.js già versionati nel checkout HEAD a89be85374acf3a83b767b61e3ee44589f40f4a6; niente nuovo parser/dipendenza. CommonMark riferimento sintassi, non dichiarazione di conformità completa. Playwright pin 1.62.1, esbuild 0.28.2.
## RED e GREEN
RED atteso: click sul badge/spazio card non apre; assenti h2/strong/li/code nella Panoramica. Test prima delle modifiche; esecuzione in attesa della suite browser completa isolata già in corso (single runner).
GREEN: node scripts/ripresa-run.mjs browser po30-dettaglio-agente.spec.mjs ; unit frontend e colonna-destra-p0 interessate. Nessuna mutazione owner in 4174; fixture HTTP solo nel banco isolato. Sul vivo leggere e aprire card reale, verificare Markdown disponibile e screenshot contro mockup; distinguere fixture e runtime.
## Compatibilità e rollback
Click titolo esegue una sola apertura; Collassa non apre; focus Enter/Space sul button continua a funzionare; nessun tooltip lungo sul titolo. Aggiornamenti mantengono renderer, tab attivo e dati reali. Ridimensionamento/scorrimento non allargano rail. Backup pre-edit nella directory evidenze dedicata; ripristinare solo byte di questo lotto, mai git reset/discard. Consegna public con procedura backup e hash già adottata. Nessun riavvio backend.
