# Brief — Fase A, corsia FRONTEND: BC-77 → BC-71 → BC-70 → BC-68 (✅ divisione in fasi approvata dall'owner il 17/09: «sì»)

> Base: la lane DOPO la fusione di PO-27 (tocca gli stessi file). Un agente Opus 5 high; la review la faccio IO. Le schede complete
> sono in `.claude/CODA-BUG-CRITICI-2026-09-08.md` (cerca il numero): leggile, qui c'è solo l'ordine, il «cosa esiste già» e i
> criteri. ⛔ I numeri di riga sono del 17/09: riaccerta tutto col grep sul tuo albero.

## Ordine, e perché
1. **BC-77** — (a) un toast copre il composer a 1024×800 («Collegato di nuovo» sopra «Terminale», microfono e STOP): un avviso
   non copre mai un comando. Guarda dove il progetto ancora i toast e quale regola c'è già per non coprire; la cura è di
   POSIZIONE, non di durata. (b) HTML malformato nella `talos-turn-spine` del template
   (`<button …></span aria-label="Vai al giro"></button>`): si vede come un trattino a x≈303. Se PO-27 l'ha già corretto, dillo e salta.
2. **BC-71** — (a) `#copyAllDiffs` DUPLICATO (uno nel vecchio `[data-view="diff"]`, uno nella testata della Revisione): `$()`
   aggiorna il primo, invisibile. Un id solo; (b) il riassunto in testata: `renderRealReviewList` scrive «Nessuna modifica…» e
   `aggiornaSommarioReviewReale` lo riscrive vuoto subito dopo — un solo scrittore; (c) `#browserTesto` mostra il testo
   dimostrativo del template mentre le schede sono «in apertura»: è il gemello di BC-67 nel Browser — MISURALO prima (il revisore
   l'ha visto in una sonda, non a fondo), poi stessa cura: niente dati d'esempio a schermo, mai.
3. **BC-70** — la campanella: un'approvazione già in attesa non l'accende alla prima lettura; dice «1» mentre il pannello ne
   elenca DUE; una voce legge «Invalid Date». C'è un `test.fail()` dichiarato in `tests/browser/review-browser-notifiche.spec.mjs`
   (NOTIFICHE-REALI-43): la cura è finita quando quel `test.fail()` SPARISCE e la prova è verde. Rotta intercettata con la stella:
   `**/api/v1/sessions*` (senza, la query string sfugge). Se la causa è nel BACKEND (la forma della risposta), fermati e scrivimelo.
4. **BC-68** — le schede del BROWSER nel componente condiviso `components/schede.js` (BC-63): `browser.js` `renderizzaSchede` tiene
   una sua tastiera e un suo giro di disegno. Diventa un ADATTATORE che conserva il SUO aspetto (icona che cambia forma con lo
   stato, ✕ vera, pillola HTTP, `scroll-snap`, testo `sr-only`) e prende la meccanica (roving tabindex, frecce, Home/End, Canc,
   menu). Le 13 prove di `browser-p0.spec.mjs` restano verdi. Nello stesso giro, per tutte e TRE le superfici: `aria-controls` →
   `role="tabpanel"`; il «+ Nuovo» del Terminale non è un `role="tab"`; il piede del Terminale non mostra insieme il dettaglio e la
   frase generica (commento del 07/09); la larghezza del menu contestuale condiviso (340 px per due voci: `max-content` con un
   minimo, deciso UNA volta per Terminale, Revisione e chat).

## Regole
Skill `frontend-design` prima di ogni superficie; tema Calm; due temi a 1024×800 e 1440×900; nessun nome tecnico a schermo; niente
controlli nativi; più di due azioni ⇒ menu + tasto destro, riga e menu a intersezione vuota e unione completa. Ricerca prima di
scrivere (W3C APG Tabs e Menu Button per la 4; posizionamento dei toast), fonte+data. RED → GREEN → al contrario con copia e
sha256. Un commit per riga. Playwright `--workers=1` su una porta di banco SUA; ⛔ mai 4174/4177/9333, e MAI uno script senza
aver letto a cosa punta. Nessun giro col modello. `git.exe`, inglese da file, senza trailer, niente `checkout` fra rami, processi
lasciati vivi chiusi per PID. Foto di ogni superficie toccata, guardate TUTTE anche fuori da ciò che hai toccato.
Chiusura: `npm run test:unit`, la cartella `tests/browser` INTERA da sola (stato noto prima di te: vedi BC-72 — distingui i tuoi
rossi con un A/B), `git.exe status --short` vuoto. Rapporto corto: comando esatto accanto a ogni numero, misurato vs letto,
NON verificato per nome.

## Aggiunta del 17/09 sera — BC-78, punti 1-4 (trovati chiudendo PO-27), in coda a BC-68
5. **BC-78.2** la barra laterale taglia una voce a metà riga (`styles/mockup-sidebar.css:36`, `max-height:50%`): tetto a passo di
   riga oppure la sfumatura «continua» già usata dalle schede di BC-63 (`data-bordi`): scegli con la skill `frontend-design`.
6. **BC-78.3** a 1024×800 il dettaglio di Capability esce dalla finestra con «Fida» (899 px su 800): `.talos-detail` è sticky
   senza scorrimento proprio, condiviso da quattro pannelli — la cura vale per tutti e quattro, provata su tutti e quattro.
7. **BC-78.4** `tool:check_notes` a schermo negli avvisi della scansione dei plugin: nessun nome tecnico; e decidi con me se
   `scansionaPatternSospetti` resta (oggi rassicura e basta: leggi la scheda).
8. **BC-78.1** «Collega un modello» apre i Fornitori SU QUEL fornitore: serve un campo facoltativo in più su `RunError`
   (`src/agui-events.mjs`, backend): FERMATI e scrivimi la forma che ti serve, lo aggiungo io o te lo autorizzo.
⛔ Già curati da PO-27 e da NON rifare: il tondo «torna in fondo» (F2), il menu dentro la colonna (F1), Estensioni (F3).
