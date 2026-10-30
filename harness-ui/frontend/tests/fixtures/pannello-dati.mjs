/*
 * DATI DI PROVA del bozzetto v2 — con la FORMA ESATTA di ciò che l'app ha già in mano quando disegna la colonna di destra.
 * Ogni blocco dice da dove viene la forma; i valori sono inventati ma plausibili, e sono gli STESSI in tutte e cinque le schede
 * (lo stesso progetto, la stessa richiesta: «Aggiungi l'esportazione in Markdown al report e copri i casi limite»).
 * Gli istanti sono relativi all'apertura della pagina, così gli orologi delle righe vive scorrono davvero.
 * ⛔ I campi marcati «DATI NUOVI» non esistono oggi nel prodotto: MAPPA.md dice la modifica più piccola che li porta.
 */
const MIN = 60_000;

export function creaStato(adesso = Date.now()) {
  const fa = (ms) => adesso - ms;
  const iso = (ms) => new Date(fa(ms)).toISOString();

  /* ── le richieste della persona (`datiGrafoAgenti().richieste`, legacy/app.js:12220 → `agentiPerInspector`, :12224) ── */
  const richiesta = { id: 'r-1441', at: fa(6 * MIN), testo: 'Aggiungi l\'esportazione in Markdown al report e copri i casi limite', corrente: true };
  const passata = { id: 'r-1310', at: fa(97 * MIN), testo: 'Copri anche le righe vuote del CSV', corrente: false };

  /* ── gli agenti: `snapshotFiglio` (src/subagent-orchestrator.mjs:420-490) + `numeroFigli` + `richiesta` (legacy/app.js:12217) ── */
  const uso = (n) => ({ prompt_tokens: Math.round(n * 0.86), completion_tokens: n - Math.round(n * 0.86) });
  const passi = (...righe) => righe.map(([tipo, attrezzo, percorso, quandoFa]) => ({ tipo, attrezzo, percorso, quando: iso(quandoFa) }));
  const agenti = [
    {
      sessionId: 's-a1', padreId: 's-madre', nome: 'Riscrivi report.js con l\'uscita Markdown', modello: 'z-ai/glm-5.3-flash', permessi: 'workspace-write', modalita: 'modifica',
      taskCorto: 'Riscrivi report.js con l\'uscita Markdown', task: 'Aggiungi a src/report.js l\'opzione --format markdown: intestazione con il nome del cliente, colonne allineate, totali in fondo. Mantieni la firma pubblica di generaReport e aggiorna i due chiamanti.',
      conclusa: false, interrotta: false, esitoDelega: null, avviataAlle: iso(5.4 * MIN), conclusaAlle: null, ultimaAttivitaAlle: iso(0.2 * MIN),
      evidenzaDelega: { toolCalls: 14, scritture: 2 }, usageSessione: uso(22_400),
      attivita: { chiamate: 14, attrezzoCorrente: 'file_edit', bersaglioCorrente: 'src/report.js', file: [
        { percorso: 'src/report.js', letto: true, scritto: true }, { percorso: 'src/markdown.js', creato: true, scritto: true }, { percorso: 'src/csv.js', letto: true },
      ], fileTagliati: 0, passi: passi(['attrezzo', 'leggi', 'src/report.js', 5.1 * MIN], ['attrezzo', 'scrivi', 'src/markdown.js', 3.2 * MIN], ['attrezzo', 'file_edit', 'src/report.js', 0.2 * MIN]) },
    },
    {
      sessionId: 's-a1-1', padreId: 's-a1', nome: 'Controlla i tipi di Riga', modello: 'z-ai/glm-5.3-flash', permessi: 'read-only', modalita: 'sola-lettura',
      taskCorto: 'Controlla i tipi di Riga', task: 'Controlla che il tipo Riga copra tutti i campi del report (importi con decimali, note con a capo).',
      conclusa: true, interrotta: false, esitoDelega: 'riuscito', ultimoEsito: 'successo', avviataAlle: iso(4.6 * MIN), conclusaAlle: iso(3.9 * MIN), ultimaAttivitaAlle: iso(3.9 * MIN),
      evidenzaDelega: { toolCalls: 6, scritture: 0 }, usageSessione: uso(9100), attivita: { chiamate: 6, attrezzoCorrente: null, file: [{ percorso: 'src/tipi.ts', letto: true }], passi: passi(['attrezzo', 'leggi', 'src/tipi.ts', 4.4 * MIN], ['fine', null, null, 3.9 * MIN]) },
    },
    {
      sessionId: 's-a2', padreId: 's-madre', nome: 'Test dei casi limite del Markdown', modello: 'z-ai/glm-5.3-flash', permessi: 'workspace-write', modalita: 'modifica',
      taskCorto: 'Test dei casi limite del Markdown', task: 'Scrivi i test per: barra verticale nel testo, a capo nelle note, importi negativi, report vuoto, caratteri non ASCII. Poi lanciali.',
      conclusa: false, interrotta: false, esitoDelega: null, avviataAlle: iso(5.2 * MIN), conclusaAlle: null, ultimaAttivitaAlle: iso(1.1 * MIN),
      approvalPendingCount: 1, questionPendingCount: 0,
      evidenzaDelega: { toolCalls: 9, scritture: 1 }, usageSessione: uso(19_800),
      attivita: { chiamate: 9, attrezzoCorrente: 'shell', bersaglioCorrente: null, file: [{ percorso: 'test/report.test.js', creato: true, scritto: true }], passi: passi(['attrezzo', 'scrivi', 'test/report.test.js', 2.4 * MIN]) },
    },
    {
      sessionId: 's-a3', padreId: 's-madre', nome: 'Tabelle con la barra verticale nel testo', modello: 'z-ai/glm-5.3-flash', permessi: 'workspace-write', modalita: 'modifica',
      taskCorto: 'Tabelle con la barra verticale nel testo', task: 'Fai in modo che una barra verticale dentro una cella non spezzi la tabella Markdown: va scritta come \\|.',
      conclusa: true, interrotta: false, esitoDelega: 'fallito', ultimoEsito: 'errore', avviataAlle: iso(5.0 * MIN), conclusaAlle: iso(1.6 * MIN), ultimaAttivitaAlle: iso(1.6 * MIN),
      evidenzaDelega: { toolCalls: 11, scritture: 1 }, usageSessione: uso(24_600),
      attivita: { chiamate: 11, attrezzoCorrente: null, file: [{ percorso: 'test/celle.test.js', creato: true, scritto: true }], passi: passi(['attrezzo', 'scrivi', 'test/celle.test.js', 2.2 * MIN], ['errore', null, null, 1.6 * MIN]) },
      riassuntoDelega: 'Il test che doveva scrivere non compila: SyntaxError alla riga 14 di test/celle.test.js.',
    },
    {
      sessionId: 's-a4', padreId: 's-madre', nome: 'Mappa gli usi di totaliPerCliente', modello: 'z-ai/glm-5.3-flash', permessi: 'read-only', modalita: 'sola-lettura',
      taskCorto: 'Mappa gli usi di totaliPerCliente', task: 'Trova ogni punto che chiama totaliPerCliente e dimmi se si aspetta numeri o stringhe. Non modificare niente.',
      conclusa: true, interrotta: false, esitoDelega: 'riuscito', ultimoEsito: 'successo', avviataAlle: iso(5.5 * MIN), conclusaAlle: iso(3.4 * MIN), ultimaAttivitaAlle: iso(3.4 * MIN),
      evidenzaDelega: { toolCalls: 17, scritture: 0 }, usageSessione: uso(31_200),
      attivita: { chiamate: 17, attrezzoCorrente: null, file: [{ percorso: 'src/totali.js', letto: true }, { percorso: 'src/report.js', letto: true }, { percorso: 'src/cli.js', letto: true }], fileTagliati: 4, passi: passi(['attrezzo', 'cerca', 'src/**', 5.2 * MIN], ['fine', null, null, 3.4 * MIN]) },
    },
    {
      sessionId: 's-a5', padreId: 's-madre', nome: 'Prova con un CSV da un milione di righe', modello: 'z-ai/glm-5.3-flash', permessi: 'workspace-write', modalita: 'modifica',
      taskCorto: 'Prova con un CSV da un milione di righe', task: 'Genera un CSV da un milione di righe e misura tempo e memoria dell\'esportazione in Markdown.',
      conclusa: true, interrotta: true, esitoDelega: 'fallito', motivoChiusura: 'fermata', avviataAlle: iso(5.3 * MIN), conclusaAlle: iso(2.8 * MIN), ultimaAttivitaAlle: iso(2.8 * MIN),
      evidenzaDelega: { toolCalls: 4, scritture: 1 }, usageSessione: uso(6200), attivita: { chiamate: 4, attrezzoCorrente: null, file: [{ percorso: 'bench/milione.csv', creato: true, scritto: true }], passi: [] },
    },
    {
      sessionId: 's-a6', padreId: 's-madre', nome: 'Aggiorna il README con l\'esempio', modello: 'z-ai/glm-5.3-flash', permessi: 'workspace-write', modalita: 'modifica',
      taskCorto: 'Aggiorna il README con l\'esempio', task: 'Aggiungi al README un esempio di report in Markdown e l\'opzione --format.',
      conclusa: false, interrotta: false, esitoDelega: null, avviataAlle: iso(3.0 * MIN), conclusaAlle: null, ultimaAttivitaAlle: iso(0.4 * MIN),
      evidenzaDelega: { toolCalls: 5, scritture: 1 }, usageSessione: uso(8800),
      attivita: { chiamate: 5, attrezzoCorrente: 'leggi', bersaglioCorrente: 'docs/esempi.md', file: [{ percorso: 'README.md', letto: true, scritto: true }, { percorso: 'docs/esempi.md', letto: true }], passi: passi(['attrezzo', 'file_edit', 'README.md', 1.2 * MIN]) },
      collisioni: [{ percorso: 'README.md', primaDi: null, dopoDi: 's-madre' }],
    },
    ...[
      ['s-p1', 'Trova dove si saltano le righe vuote', 18, 12],
      ['s-p2', 'Scrivi i test delle righe vuote', 22, 8],
      ['s-p3', 'Aggiorna il changelog', 9, 4],
    ].map(([id, nome, chiamate, durataMin], i) => ({
      sessionId: id, padreId: 's-madre', nome, taskCorto: nome, task: nome, modello: 'z-ai/glm-5.3-flash', permessi: 'workspace-write', modalita: 'modifica',
      conclusa: true, interrotta: false, esitoDelega: 'riuscito', ultimoEsito: 'successo', avviataAlle: iso((96 - i) * MIN), conclusaAlle: iso((96 - i - durataMin) * MIN), ultimaAttivitaAlle: iso((96 - i - durataMin) * MIN),
      evidenzaDelega: { toolCalls: chiamate, scritture: 1 }, usageSessione: uso(chiamate * 1300), attivita: { chiamate, file: [], passi: [] },
    })),
  ].map((a, _, tutti) => ({ ...a, numeroFigli: tutti.filter((x) => x.padreId === a.sessionId).length, richiesta: a.sessionId.startsWith('s-p') ? passata : richiesta }));
  /* la domanda aperta della figlia: oggi la legge `cartaDellaFiglia` (legacy/app.js:12292) — ⚠️ CABLAGGIO CLIENT, MAPPA A-07 */
  const domande = { 's-a2': { comando: 'npm test -- report' } };

  /* ── i giri: `giriPerInspector()` (legacy/app.js:11854): i messaggi della persona hanno `tu: true` ── */
  const giri = [
    { numero: 1, titolo: 'Leggi i CSV a flusso', tu: true }, { numero: 2, titolo: 'Ho letto csv.js e report.js', attrezzi: 6 }, { numero: 3, titolo: 'Lettura a flusso fatta', attrezzi: 4 },
    { numero: 4, titolo: 'Totali in centesimi', tu: true }, { numero: 5, titolo: 'Totali corretti', attrezzi: 9 },
    { numero: 6, titolo: 'Perché il test fallisce?', tu: true }, { numero: 7, titolo: 'Il test usava i decimali', attrezzi: 3 }, { numero: 8, titolo: 'Test corretto', attrezzi: 5 },
    { numero: 9, titolo: 'Copri anche le righe vuote', tu: true }, { numero: 10, titolo: 'Righe vuote coperte', attrezzi: 12 },
    { numero: 11, titolo: 'Aggiungi l\'esportazione in Mark…', tu: true }, { numero: 12, titolo: 'Ho diviso il lavoro in sei', attrezzi: 8 }, { numero: 13, titolo: 'Riscrivo report.js', inCorso: true },
  ];

  /* ── il contesto: `datiSchedaContesto()` (legacy/app.js:25670) + `usageDelContesto()` (:25393) ── */
  const storiaContesto = [ // ⚠️ DATI NUOVI LATO CLIENT (MAPPA C-05): un punto per invio, dagli StateDelta `/usage` del giornale
    { giro: 2, token: 12_400 }, { giro: 3, token: 21_900 }, { giro: 5, token: 46_300 }, { giro: 7, token: 71_800 }, { giro: 8, token: 102_500 },
    { giro: 9, token: 64_200, compattazione: { prima: 126_000, dopo: 58_000, conModello: false } }, { giro: 10, token: 88_700 },
    { giro: 11, token: 79_400, compattazione: { prima: 131_500, dopo: 72_100, conModello: true } }, { giro: 12, token: 84_300 }, { giro: 13, token: 89_600 },
  ].map((p, i, a) => ({ ...p, at: fa((a.length - i) * 6.5 * MIN) }));
  const contesto = {
    modello: 'glm-5.3-flash',
    usage: { prompt_tokens: 89_600, completion_tokens: 1_240 },
    schedaContesto: {
      budget: { triggerTokens: 140_000, windowTokens: 200_000 }, politica: null,
      ripartizione: { categorie: [{ id: 'system', tokens: 6_200 }, { id: 'rules', tokens: 1_900 }, { id: 'memory', tokens: 3_400 }, { id: 'tools', tokens: 9_800 }, { id: 'mcp', tokens: 28_500 }, { id: 'conversation', tokens: 39_800 }] },
      level1: null, motore: null, legacy: { numero: 2, ultima: { at: new Date(storiaContesto[7].at).toISOString(), tokenPrima: 131_500, tokenDopo: 72_100 } }, recordLegacy: null,
    },
    giri, invio: { giri: 3, tetto: 24 }, cacheTesto: '78% · su 9 richieste', storiaContesto,
  };

  /* ── i file: `reviewFiles` (legacy/app.js:19574) contati da `contaDiff` (:12938); `letti` ⚠️ DATI NUOVI LATO CLIENT (MAPPA F-04) ── */
  const scritti = [
    { path: 'src/report.js', giro: 12, nuovo: false, aggiunte: 42, rimozioni: 3 },
    { path: 'REPORT.md', giro: 10, nuovo: false, aggiunte: 12, rimozioni: 1 },
    { path: 'README.md', giro: 12, nuovo: false, aggiunte: 6, rimozioni: 0 },
    { path: 'test/righe-vuote.test.js', giro: 10, nuovo: true, aggiunte: 38, rimozioni: 0 },
  ];
  const letti = [{ path: 'package.json', giro: 2 }, { path: 'src/csv.js', giro: 12 }, { path: 'src/tipi.ts', giro: 12 }, { path: 'docs/formato.md', giro: 7 }];
  /* l'albero: GET /api/v1/sessions/:id/tree (src/workspace-tree.mjs:50) — `{ voci: [{ nome, cartella }] }` per livello */
  const cartelle = {
    '': [{ nome: 'src', cartella: true }, { nome: 'test', cartella: true }, { nome: 'docs', cartella: true }, { nome: 'bench', cartella: true }, { nome: 'package.json', cartella: false }, { nome: 'README.md', cartella: false }, { nome: 'REPORT.md', cartella: false }, { nome: '.gitignore', cartella: false }],
    'src/': ['cli.js', 'csv.js', 'markdown.js', 'report.js', 'tipi.ts', 'totali.js'].map((nome) => ({ nome, cartella: false })),
    'test/': ['celle.test.js', 'csv.test.js', 'report.test.js', 'righe-vuote.test.js', 'totali.test.js'].map((nome) => ({ nome, cartella: false })),
    'docs/': ['esempi.md', 'formato.md'].map((nome) => ({ nome, cartella: false })),
    'bench/': [{ nome: 'milione.csv', cartella: false }],
  };
  /* la scheda File di oggi: radice (`#alberoNomeRadice`), i livelli letti (`treeCache`), la card «Modificati in questa sessione»
     (legacy/app.js:12938) e la lettera A/M dell'albero (`statoFileAlbero`, :19843) */
  const file = {
    scritti, letti, richiesta: { at: richiesta.at, giroDa: 11 }, cartelle,
    radice: { nome: 'report-csv', percorso: 'C:\Users\Nino\progetti\report-csv' },
    livelli: { '': cartelle[''] },
    modificati: scritti.map(({ path, aggiunte, rimozioni }) => ({ path, aggiunte, rimozioni })),
    stati: Object.fromEntries(scritti.map((f) => [f.path, f.nuovo ? 'new' : 'modified'])),
    fuori: false,
  };

  /* ── Git: l'oggetto di `scheda.mostraStato` (legacy/app.js:21839) — GET /git/status + /git/branch + /git/sync; GET /git/log ── */
  const voceGit = (percorso, x, y) => ({ percorso, percorsoRepo: percorso, da: null, x, y, ...descrivi(x, y), cartella: false, repoAnnidato: false });
  const git = {
    stato: {
      voci: [voceGit('src/report.js', ' ', 'M'), voceGit('README.md', 'M', ' '), voceGit('REPORT.md', ' ', 'M'), voceGit('src/markdown.js', '?', '?'), voceGit('test/report.test.js', '?', '?'), voceGit('test/celle.test.js', '?', '?'), voceGit('bench/milione.csv', '?', '?'), voceGit('package-lock.json', ' ', 'M')],
      radiceRepo: 'C:/Users/Nino/progetti/report-csv', prefisso: '', cartellaEradiceRepo: true,
      riepilogo: null, base: { commit: '4f2a9c17e0', breve: '4f2a9c1', soggetto: 'Righe vuote coperte dai test' }, impronta: 'a1b2c3', preparatiFuori: 0,
      ramo: 'feat/export-markdown', staccata: false,
      sincronizzazione: { ramo: 'feat/export-markdown', staccata: false, remoti: [{ nome: 'origin', url: 'git@github.com:nino/report-csv.git', urlInvio: null }], riferimento: { corto: 'origin/feat/export-markdown', remoto: 'origin', ramo: 'feat/export-markdown' }, avanti: 2, indietro: 0, riferimentoSparito: false, remotoPerInvio: 'origin', ultimoRecupero: iso(40 * MIN), recuperoInCorso: false },
    },
    storia: { commit: [
      { commit: '4f2a9c17e0', breve: '4f2a9c1', autore: 'Nino', data: iso(12 * MIN), genitori: 1, padri: ['9b0e11d2aa'], soggetto: 'Righe vuote coperte dai test', inviato: false },
      { commit: '9b0e11d2aa', breve: '9b0e11d', autore: 'Nino', data: iso(64 * MIN), genitori: 1, padri: ['1c77ab90f3'], soggetto: 'Totali per cliente in centesimi', inviato: false },
      { commit: '1c77ab90f3', breve: '1c77ab9', autore: 'Nino', data: iso(26 * 60 * MIN), genitori: 0, padri: [], soggetto: 'Leggi i CSV a flusso', inviato: true },
    ], altri: false, ultimoMessaggio: 'Righe vuote coperte dai test', testa: '4f2a9c17e0', remoto: '1c77ab90f3', nomeRemoto: 'origin/feat/export-markdown', baseComune: '1c77ab90f3' },
    /* GET /git/stashes (git-service.mjs:1271 `accantonati`) */
    accantonati: [{ indice: 0, commit: 'st45h001aa', data: iso(2 * 60 * MIN), messaggio: 'On feat/export-markdown: prova del separatore punto e virgola' }],
    /* la card «Ambiente» che oggi sta nel Contesto (`righeAmbiente`, inspector.js:59): passa a Git, «Dettagli del repository» */
    ambiente: { branch: 'feat/export-markdown', worktree: 'report-csv', nonSalvate: 8, repoAnnidati: [] },
    /* ⚠️ DATI NUOVI dal server (MAPPA G-05): `git diff --numstat` contro HEAD */
    conti: new Map([['src/report.js', { aggiunte: 42, rimozioni: 3 }], ['README.md', { aggiunte: 6, rimozioni: 0 }], ['REPORT.md', { aggiunte: 12, rimozioni: 1 }], ['src/markdown.js', { aggiunte: 88, rimozioni: 0 }], ['test/report.test.js', { aggiunte: 64, rimozioni: 0 }], ['test/celle.test.js', { aggiunte: 21, rimozioni: 0 }], ['bench/milione.csv', { aggiunte: 0, rimozioni: 0 }], ['package-lock.json', { aggiunte: 3, rimozioni: 3 }]]),
  };

  /* ── i processi: `processiDagliEventi(...)` (components/inspector.js:2176), già senza i tolti (legacy/app.js:12943) ── */
  const processi = [
    { id: 'tc-dev', comando: 'npm run dev', descrizione: 'Server di sviluppo', stato: 'in-corso', chi: 'agente', giro: 5, avviatoA: fa(42 * MIN), durataMs: null, uscita: null, cwd: 'report-csv', fermoDaMs: 3_000 },
    { id: 'tc-tsc', comando: 'tsc -w --noEmit', descrizione: 'Controllo dei tipi', stato: 'in-corso', chi: 'tu', giro: null, avviatoA: fa(31 * MIN), durataMs: null, uscita: null, cwd: 'report-csv', fermoDaMs: 9_000 },
    { id: 'tc-watch', comando: 'npm test -- --watch', descrizione: '', stato: 'in-corso', chi: 'agente', giro: 12, avviatoA: fa(4.2 * MIN), durataMs: null, uscita: null, cwd: 'report-csv', fermoDaMs: 24_000 },
    { id: 'tc-test', comando: 'npm test', descrizione: 'Lancia tutti i test', stato: 'fallito', chi: 'agente', giro: 8, avviatoA: fa(70 * MIN), durataMs: 8_300, uscita: 1, cwd: 'report-csv' },
    { id: 'tc-lint', comando: 'npx eslint src', descrizione: 'Controlla lo stile', stato: 'riuscito', chi: 'agente', giro: 10, avviatoA: fa(30 * MIN), durataMs: 2_140, uscita: 0, cwd: 'report-csv' },
    { id: 'tc-ver', comando: 'node --version', descrizione: '', stato: 'riuscito', chi: 'tu', giro: null, avviatoA: fa(88 * MIN), durataMs: 120, uscita: 0, cwd: 'report-csv' },
  ];
  /* GET …/processes/resources → `state.realSession.risorseProcessi` (legacy/app.js:6927-6935): Map toolCallId → misura */
  const risorse = new Map([['tc-dev', { cpuPercento: 3.2, memoriaByte: 182 * 1_048_576 }], ['tc-tsc', { cpuPercento: 1.1, memoriaByte: 96 * 1_048_576 }], ['tc-watch', { cpuPercento: 0.4, memoriaByte: 64 * 1_048_576 }]]);
  /* ⚠️ CLIENT NUOVO (MAPPA P-04): gli ultimi 12 campioni di CPU; ⚠️ DATI NUOVI dal server (MAPPA P-05): le porte in ascolto */
  const storiaCpu = new Map([['tc-dev', [3, 4, 2, 6, 3, 2, 5, 3, 4, 3, 2, 3.2]], ['tc-tsc', [1, 1, 2, 1, 1, 3, 1, 1, 2, 1, 1, 1.1]], ['tc-watch', [6, 4, 2, 1, 1, 0.6, 0.5, 0.4, 0.4, 0.4, 0.4, 0.4]]]);
  const porte = new Map([['tc-dev', [{ porta: 5173, url: 'http://localhost:5173/' }]]]);

  return { adessoAllAvvio: adesso, richiesta, passata, agenti, domande, contesto, file, git, processi, risorse, storiaCpu, porte };
}

/* copia di `descrivi` (src/git-service.mjs:279-292): la coppia XY nel vocabolario della scheda */
function descrivi(x, y) {
  const xy = `${x}${y}`;
  if (['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(xy)) return { tipo: 'conflitto', staged: false, nonStaged: false, conflitto: true };
  if (x === '?' && y === '?') return { tipo: 'nonTracciato', staged: false, nonStaged: true, conflitto: false };
  const lettera = x !== ' ' && x !== '?' && x !== '!' ? x : y;
  const tipo = { M: 'modificato', A: 'aggiunto', D: 'eliminato', R: 'rinominato', C: 'copiato', T: 'tipoCambiato' }[lettera] ?? 'modificato';
  return { tipo, staged: x !== ' ' && x !== '?' && x !== '!', nonStaged: y !== ' ' && y !== '?' && y !== '!', conflitto: false };
}
export { descrivi };

/**
 * ⭐ 29/10 sera — «TANTI» (owner: tutto a pagine e ogni scheda nello schermo): lo stesso progetto con 40+ file, 25 agenti, 40 processi,
 * liste di Git lunghe e 60 giri. Si accende con `?molti=1`. Le forme sono quelle di `creaStato`: si aggiungono voci, non campi.
 */
export function aggiungiMolti(S, adesso = Date.now()) {
  const MIN = 60_000;
  const iso = (fa) => new Date(adesso - fa).toISOString();
  /* file: una cartella lib/ con 24 file, 12 in più in src/ e test/; letti e scritti in più */
  S.file.cartelle['lib/'] = Array.from({ length: 24 }, (_, i) => ({ nome: `modulo-${String(i + 1).padStart(2, '0')}.js`, cartella: false }));
  S.file.cartelle[''] = [...S.file.cartelle[''].slice(0, 4), { nome: 'lib', cartella: true }, ...S.file.cartelle[''].slice(4)];
  S.file.livelli[''] = S.file.cartelle[''];
  for (let i = 1; i <= 8; i += 1) S.file.cartelle['src/'].push({ nome: `formato-${i}.js`, cartella: false });
  for (let i = 1; i <= 6; i += 1) S.file.cartelle['test/'].push({ nome: `formato-${i}.test.js`, cartella: false });
  for (let i = 1; i <= 14; i += 1) S.file.scritti.push({ path: `lib/modulo-${String(i).padStart(2, '0')}.js`, giro: 12, nuovo: i % 3 === 0, aggiunte: 10 + i, rimozioni: i % 4 });
  for (let i = 15; i <= 24; i += 1) S.file.letti.push({ path: `lib/modulo-${String(i).padStart(2, '0')}.js`, giro: 12 });
  S.file.modificati = S.file.scritti.map(({ path, aggiunte, rimozioni }) => ({ path, aggiunte, rimozioni }));
  S.file.stati = Object.fromEntries(S.file.scritti.map((f) => [f.path, f.nuovo ? 'new' : 'modified']));
  /* agenti: 18 in più, alcuni al lavoro e molti finiti, figli della madre (25 in tutto con quelli di prima) */
  const modello = S.agenti.find((a) => a.sessionId === 's-a4');
  for (let i = 1; i <= 18; i += 1) {
    const alLavoro = i % 3 === 0;
    S.agenti.push({
      ...modello, sessionId: `s-m${i}`, nome: `Controlla il formato ${i}`, taskCorto: `Controlla il formato ${i}`, task: `Controlla che il formato ${i} esca uguale in Markdown e in testo.`,
      conclusa: !alLavoro, esitoDelega: alLavoro ? null : 'riuscito', ultimoEsito: alLavoro ? null : 'successo',
      avviataAlle: iso((6 + i / 4) * MIN), conclusaAlle: alLavoro ? null : iso((2 + i / 5) * MIN), ultimaAttivitaAlle: iso(i * 0.2 * MIN),
      attivita: { ...modello.attivita, attrezzoCorrente: alLavoro ? 'leggi' : null, bersaglioCorrente: alLavoro ? `lib/modulo-${String(i).padStart(2, '0')}.js` : null, file: [{ percorso: `lib/modulo-${String(i).padStart(2, '0')}.js`, letto: true }] },
    });
  }
  /* processi: 40 in più, accesi e finiti, coi loro stati */
  const stati = ['riuscito', 'riuscito', 'fallito', 'riuscito', 'annullato'];
  for (let i = 1; i <= 40; i += 1) {
    const acceso = i % 5 === 0;
    const id = `tc-m${i}`;
    S.processi.push({ id, comando: `npm test -- formato-${i}`, descrizione: `Test del formato ${i}`, stato: acceso ? 'in-corso' : stati[i % stati.length], chi: i % 4 ? 'agente' : 'tu', giro: 5 + (i % 9), avviatoA: adesso - (40 - i) * MIN, durataMs: acceso ? null : 1_200 + i * 90, uscita: acceso ? null : stati[i % stati.length] === 'fallito' ? 1 : 0, cwd: 'report-csv', fermoDaMs: acceso ? 2_000 : null });
    if (acceso) S.risorse.set(id, { cpuPercento: 1 + (i % 7), memoriaByte: (40 + i) * 1_048_576 });
  }
  /* Git: 30 file modificati o nuovi in più, 26 commit in più, 5 messi da parte */
  const voceGit = (percorso, x, y) => ({ percorso, percorsoRepo: percorso, da: null, x, y, ...descrivi(x, y), cartella: false, repoAnnidato: false });
  for (let i = 1; i <= 24; i += 1) S.git.stato.voci.push(voceGit(`lib/modulo-${String(i).padStart(2, '0')}.js`, ' ', 'M'));
  for (let i = 1; i <= 8; i += 1) S.git.stato.voci.push(voceGit(`src/formato-${i}.js`, '?', '?'));
  for (let i = 1; i <= 24; i += 1) S.git.conti.set(`lib/modulo-${String(i).padStart(2, '0')}.js`, { aggiunte: 10 + i, rimozioni: i % 4 });
  const storia = S.git.storia.commit;
  const ultimo = storia.at(-1);
  for (let i = 1; i <= 26; i += 1) {
    const commit = `c0ffee${String(i).padStart(4, '0')}`;
    storia.at(-1).padri = [commit];
    storia.at(-1).genitori = 1;
    storia.push({ commit, breve: commit.slice(0, 7), autore: 'Nino', data: iso((27 + i) * 60 * MIN), genitori: 0, padri: [], soggetto: `Formato ${i}: casi limite`, inviato: true });
  }
  void ultimo;
  for (let i = 1; i <= 5; i += 1) S.git.accantonati.push({ indice: i, commit: `st45h00${i}bb`, data: iso((3 + i) * 60 * MIN), messaggio: `On feat/export-markdown: prova ${i}` });
  S.git.ambiente.nonSalvate = S.git.stato.voci.length;
  /* contesto: 60 giri */
  const giri = S.contesto.giri;
  const ultimoGiro = giri.at(-1);
  giri.pop();
  for (let n = 13; n <= 72; n += 1) giri.push(n % 6 === 1 ? { numero: n, titolo: `Domanda ${n}`, tu: true } : { numero: n, titolo: `Passo ${n}`, attrezzi: n % 9 });
  giri.push({ ...ultimoGiro, numero: 73 });
  return S;
}
