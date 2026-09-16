# BC-35 — DOCX con i titoli di Word, elenchi annidati nel Markdown del server

Sei Astra (Codex). Lavori nel repo `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`, cartella `harness-ui/` (ramo `lane/harness-desktop`). Rispondi e scrivi SEMPRE in italiano. **Non fare mai `git add`, `git commit`, `git push`**: lascia i file su disco ed elencali nel rapporto. Altri agenti stanno lavorando in questo stesso albero su ALTRI file: tocca SOLO quelli elencati sotto.

## Il difetto (BC-35, coda `.claude/CODA-UNICA-DEBITI-2026-09-06.md`)
1. **L'esportazione DOCX di una ricerca approfondita** (`GET /api/v1/sessions/:id/research/:rid/esporta?formato=docx`, rotta in `src/http-app.mjs` intorno alla riga 3037, generatore in `src/research/esportazioni.mjs` e/o `src/document-generator.mjs`) produce paragrafi **senza gli stili di titolo di Word** (Heading 1/2/3): in Word il documento non ha struttura, niente navigazione, niente indice possibile. `document_create` (l'attrezzo del modello, in `src/document-generator.mjs`) genera già dei DOCX: verifica se lì i titoli sono stili veri e, se sì, **usa lo stesso generatore** per la ricerca invece di un secondo; se no, cura entrambi da un posto solo.
2. **Il parser Markdown del server** (`src/research/markdown-server.mjs`: un parser, tre uscite — `markdownInHtml`, `markdownInBlocchiReport`, `markdownInTestoSemplice`, `runsDiMarkdown`) **non gestisce gli elenchi annidati** (un `- ` indentato sotto un altro `- `, elenchi numerati dentro puntati, ecc.): oggi escono piatti o come testo. Devono uscire annidati in tutte e tre le uscite (HTML, blocchi del rapporto/PDF, DOCX).

## Cosa devi fare
1. Ricerca prima di scrivere (fonte + data nel rapporto): la specifica degli elenchi annidati in CommonMark/GFM (indentazione, marcatori misti), gli stili di titolo in OOXML (`w:pStyle` `Heading1…`, `styles.xml`) e come li genera la libreria DOCX già usata nel repo (leggi `package.json` di `harness-ui/` per il nome, poi la sua documentazione ufficiale). Niente riscritture: si estende ciò che c'è.
2. Cura: parser con elenchi annidati (profondità ragionevole, dichiarata), DOCX con stili di titolo veri e un generatore solo.
3. Test nei due versi in `harness-ui/tests/` accanto ai test esistenti (`tests/research/*.test.mjs` e `tests/ricerca-esportazioni*.test.mjs`: trova i nomi veri): elenco annidato → struttura annidata nelle tre uscite; elenco piatto → invariato byte per byte rispetto a prima (i test esistenti lo garantiscono: devono restare verdi); DOCX → nel `document.xml` compaiono `Heading1/2/3` sui titoli e NON sui paragrafi; un DOCX di `document_create` e uno della ricerca hanno la stessa `styles.xml`.
4. Prova sul vero: usa una ricerca già sul disco (`C:\Users\Antonino\Desktop\.harness-ui-research\2a8ab83b-6fc6-4b07-9b6f-944acbeb18c1\rapporto.md`, ricerca `done` con 38 affermazioni) e produci il DOCX con la tua cura chiamando la funzione di esportazione direttamente da uno script (NON avviare il server sulla porta 4174, che è del proprietario; se ti serve un server usa una porta libera e chiudilo alla fine). Apri il DOCX come zip e riporta i `w:pStyle` trovati. Se puoi, trasformalo in PDF/immagine per una foto; altrimenti riporta il conteggio.
5. Lancia SOLO i test dei file toccati più `node --test tests/research/*.test.mjs` e i test di esportazione; non l'intera suite.

## File che puoi toccare
`src/research/markdown-server.mjs`, `src/research/esportazioni.mjs`, `src/document-generator.mjs`, i loro test in `tests/`. Tutto il resto è vietato (in particolare `src/research-orchestrator.mjs`, `src/research-store.mjs`, `src/http-app.mjs`, `src/contesto-del-progetto.mjs`, `src/mappa-cartelle.mjs`, `src/kernel/`, `frontend/`, `mobile/`, `control-plane/`, `core/`, `docs/`). Se una cura richiede una riga altrove, scrivi il diff nel rapporto e non applicarlo.

## Vincoli
- Nessun nome tecnico nelle stringhe visibili all'utente; nessun segreto in riga di comando; nessuna durata non misurata.
- Mai la porta 4174, mai richieste POST verso di lei.

## Consegna
Scrivi `.claude/RAPPORTO-BC35-DOCX-ELENCHI-2026-09-12.md` con: ricerca con fonti e date; cosa hai cambiato file per file con le righe; i test eseguiti con i numeri; la prova sul DOCX vero (stili trovati); cosa NON hai verificato; una proposta di testo di commit; chiusura con tre voci: **Cosa deve fare l'owner · Cosa faccio io · Cosa rimane**. Il tuo ultimo messaggio è un riassunto del rapporto in dieci righe.
