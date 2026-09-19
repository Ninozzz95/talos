# Correzioni accorpate richieste dall'owner

19/09, screenshot ScreenShot Tool -20260919155734.png: pagina HF senza sidebar e prosa stretta a sinistra. Secondo mandato esplicito: eliminare completamente i quattro riepiloghi Capacità macchina/Accessi server/Modelli osservati/Runtime locale dal Model Lab. La rimozione è una decisione dell'owner, non una perdita involontaria rispetto alla release.

Ricognizione: contenitorePaginaModello appende al body un pannello fixed inset:0 che copre la shell. disegnaCard usa td-prosa-rapporto (colonna stretta) senza readme-body e aggiunge padding inline. Il mockup originale contiene readme-body max-width 960 px (1030 oltre 1920), centrata, con padding 40/48. Il contenuto resta HTML sanificato; non si modifica il sanitizer né il proxy immagini.

Ricerca primaria riletta oggi: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position, https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Containing_block, https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/width. Decisione: primitive CSS native, contenitore centrale #centro della shell; nessuna nuova dipendenza. Pin esbuild 0.28.2, Playwright 1.62.1. Mockup originale immutabile SHA256 094207523b3b76b01cd9aac27792ff2cc2f97ddd69cbd9757898fa558284460e.

## File esatti prima delle modifiche

- harness-ui/frontend/src/legacy/app.js: contenitorePaginaModello, apriPaginaModello, chiudiPaginaModello, setView. Pagina montata in #centro; impostazioni come vista di provenienza, chiusura su navigazione sidebar, gestione classe del contenitore. Preservare hash, writer, revision e rientro. nuovaGenerazioneSessione deve azzerare figli solo al cambio effettivo: RED 172250ce mostra due deleghe precedenti nella nuova sessione offline.
- harness-ui/frontend/src/styles/pagina-modello.css: override contestuale del contenitore originale, readme-body applicato con specificità sufficiente, proporzioni 1/1/1.3/1.1 della striscia e responsive del mockup. Conservare i 978 byte originali.
- harness-ui/frontend/src/components/scheda-modello.js: disegnaCard, rimuovere padding inline e applicare readme-body alla prosa. Nessuna modifica al renderer Markdown.
- harness-ui/frontend/src/components/cornice-model-lab.js: montaCorniceModelLab rimuove ledger e badge anziché ridisegnarli. Simboli esportati mantenuti per compatibilità, updater tollera l'assenza.
- harness-ui/frontend/src/legacy/frammenti.html: rimuovere markup dei quattro riepiloghi e badge duplicato nella testata, senza eliminare Sistema o le API.
- harness-ui/frontend/tests/browser/lab-pagina-modello.spec.mjs: RIPRESA-HF-SHELL e RIPRESA-HF-README a 1440/3840, sidebar non coperta, contenuto centrato e larghezza misurata; RIPRESA-LAB-SENZA-RIEPILOGHI.
- harness-ui/frontend/tests/browser/lab-guscio.spec.mjs: ledger atteso assente per richiesta owner, resto del contratto invariato.
- harness-ui/frontend/tests/browser/lab-sistema.spec.mjs: SIS-07 verifica stati runtime nel pannello, rimuove aspettativa badge dismesso e ne verifica assenza.
- harness-ui/frontend/tests/parity/catalogo-modelli-vivo.spec.mjs: sole aspettative dei riepiloghi rimossi; obsolescenza sei schede resta separata e dichiarata.
- harness-ui/frontend/src/styles/grafo-agenti.css: specificità dell'overlay centrale. RED 44f27bc2 mostra grafo in fondo: desktop-final.css forza position:relative sui figli della chat. Override limitato al grafo, nessun cambiamento generale delle animazioni.
- harness-ui/frontend/src/components/inspector.js: ripristinare il controller della lista quando la navigazione ha staccato i suoi nodi; conservare stato di ricerca solo per sessione coerente.
- harness-ui/frontend/tests/browser/po30-dettaglio-agente.spec.mjs: avviso con selettore univoco (output zoom ha anch'esso ruolo status); geometria top/bottom reale; nuova sessione offline e ripristino della chat senza confondere colonna vuota di altezza zero con nascosta.

GREEN accorpato: lab-pagina-modello, lab-guscio, lab-sistema, po30-dettaglio-agente; poi unit e browser interessati in un solo giro. Prova finale obbligatoria: screenshot original mockup e 4174 stessa viewport/tema, guardia non-GET e WebSocket installata prima di navigare 4174, report delle richieste bloccate; immagini ispezionate singolarmente. Backup pubblico, hash serviti e health 200 prima/dopo; nessun riavvio per asset.

Rollback: diff dei soli file elencati, senza toccare file utente o altre modifiche già consegnate. Le nuove classi non alterano il mockup. Revisione dello stesso autore esplicitamente non indipendente.

## Emendamento scala effettiva
RED 63b4ce6c: i due LAYOUT leggono zoom locale=1 dopo il montaggio nella shell, non lo zoom effettivo 1.3. Aggiornare solo la misura nel test lab-pagina-modello.spec.mjs con currentCSSZoom; mantenere aspettativa 1.3 e controlli geometrici. Fonte primaria MDN https://developer.mozilla.org/en-US/docs/Web/API/Element/currentCSSZoom , implementazione Chromium fissata da Playwright 1.62.1. Nessuna modifica prodotto per questa aspettativa.

## Revisione avversariale separata — stesso autore, non indipendente
Riletti montaggio/smontaggio, scala annidata, CSS originale, accesso sidebar, rendering README e rimozione riepiloghi. RED aa5564e9 (5); GREEN della pagina 31/31 in 241a753c. Nessun ampliamento del proxy immagini. Le quattro sintesi del laboratorio sono rimosse per decisione esplicita owner; le quattro informazioni della singola pagina modello sono un componente diverso e restano. Da completare confronto visivo del bundle consegnato con mockup originale e geometria reale.

## Emendamento confronto vivo 76fa9ae0
Tutte le 14 immagini ispezionate. Scarti confermati: contenitore pagina oltre 1260 px sui monitor grandi, linguette a pastiglia perché il selettore cerca figli diretti ma i tab sono annidati, intestazione README distribuita invece che raggruppata. File esatti: src/styles/pagina-modello.css (model-page, model-page-tabs, readme-chrome), tests/browser/lab-pagina-modello.spec.mjs (RIPRESA-HF-README 1440/3840: massimo contenitore, tab sottolineati, header compatto). Nessuna modifica mockup o API. RED documentato dalle geometrie e immagini; aggiungere asserzioni permanenti e rieseguirle prima dell’edit. Ricerca primaria MDN max-width e specificity; adattamento dei selettori agli elementi reali, primitive CSS native, pin browser Playwright 1.62.1. Il guscio esterno rimane quello del prodotto; parità della sidebar sinistra appartiene al lotto PR32 ancora aperto.

RED vivo controllato 9b917bfb prima del CSS: tab borderBottom=0, radius=9px, distanza icona/README=232.20px. Il probe legge solo GET e blocca tutte le scritture/WS. Il test permanente è RIPRESA-HF-README.
