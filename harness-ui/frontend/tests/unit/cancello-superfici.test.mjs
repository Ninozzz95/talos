import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizzaPercorso,
  combaciaPercorso,
  superficiScollegate,
  rotteMaiChiamate,
  chiamateSenzaRotta,
  contatoriSenzaLuogo,
  analizzaSuperfici,
  LIMITI_DICHIARATI,
  GRAVITA,
} from '../../scripts/cancello/superfici-scollegate.mjs';

/*
 * Cancello, classe 5. Ogni prova ha la sua metà AL CONTRARIO: non basta che il controllo trovi il
 * difetto, deve anche NON trovarlo dove non c'è. È il verso che il cancello semantico non aveva
 * mai avuto — provava solo che una scrittura legittima passasse, e un cancello inerte supera quella
 * prova esattamente come uno vero.
 *
 * I dati delle prove sono quelli veri del repo: `/api/v1/sessions/:id/children` esisteva mentre la
 * scheda «Agenti» era vuota, e la voce «Note» di `nav-item.js` ha `conteggio` senza `vaia`.
 */

// ── normalizzazione ───────────────────────────────────────────────────────────────────────────

test('NORM: un percorso costruito con ${…} diventa un pattern per segmenti', () => {
  const c = normalizzaPercorso('/api/v1/sessions/${encodeURIComponent(id)}/notes');
  assert.equal(c.percorso, '/api/v1/sessions/:x/notes');
  assert.equal(c.segmenti.length, 5);
  assert.equal(c.incerto, false, 'un buco in mezzo non rende incerta la coda');
});

test('NORM: origine, query, frammento e barra finale non fanno parte dell’identità della rotta', () => {
  assert.equal(normalizzaPercorso('http://127.0.0.1:4174/api/v1/tools?forza=1').percorso, '/api/v1/tools');
  assert.equal(normalizzaPercorso('${BASE}/api/v1/tools').percorso, '/api/v1/tools');
  assert.equal(normalizzaPercorso('/api/v1/tools/').percorso, '/api/v1/tools');
  assert.equal(normalizzaPercorso('/api/v1/tools#sezione').percorso, '/api/v1/tools');
});

test('NORM: il `?` DENTRO un buco non è l’inizio di una query — è la forma vera di app.js', () => {
  // `/api/v1/models${forza ? '?forza=1' : ''}` — la graffa annidata nel ternario è il caso su cui
  // una regex ingenua `\$\{[^}]*\}` si spezza.
  const c = normalizzaPercorso("/api/v1/models${forza ? '?forza=1' : ''}");
  assert.equal(c.percorso, '/api/v1/models…');
  assert.equal(c.incerto, true, 'un buco in coda lascia il resto sconosciuto: si dichiara');
  assert.ok(combaciaPercorso('/api/v1/models', c), 'e deve combaciare con la rotta vera');
});

test('NORM: i delimitatori del literal non entrano nel percorso — stringhe VERE di legacy/app.js', () => {
  // Chi estrae con una grep prende anche i backtick: senza toglierli l'ultimo segmento sarebbe
  // «notes`», la chiamata risulterebbe orfana e la sua rotta morta. Questo caso ha trovato un
  // difetto vero del modulo, che le fixture inventate (già pulite) non toccavano.
  const c = normalizzaPercorso('`/api/v1/sessions/${encodeURIComponent(id)}/notes`');
  assert.equal(c.percorso, '/api/v1/sessions/:x/notes');
  assert.ok(combaciaPercorso('/api/v1/sessions/:id/notes', c));
  assert.ok(combaciaPercorso('/api/v1/local-models/:id/fit', "`/api/v1/local-models/${encodeURIComponent(id)}/fit${profilo ? '?p=1' : ''}`"));
  assert.ok(combaciaPercorso('/api/v1/huggingface/repo', '`/api/v1/huggingface/repo?repo=${encodeURIComponent(item.repo)}&revision=${r}`'));
  // AL CONTRARIO: ripulire i delimitatori non deve far combaciare percorsi diversi
  assert.equal(combaciaPercorso('/api/v1/sessions/:id/notes', '`/api/v1/sessions/${id}/tasks`'), false);
});

test('NORM: il verbo si legge dalla stringa o dal campo, e resta maiuscolo', () => {
  assert.equal(normalizzaPercorso('POST /api/v1/sessions').metodo, 'POST');
  assert.equal(normalizzaPercorso({ metodo: 'post', percorso: '/api/v1/sessions' }).metodo, 'POST');
  // AL CONTRARIO: un percorso che comincia con una parola qualunque non perde quel pezzo
  assert.equal(normalizzaPercorso('/get/qualcosa').percorso, '/get/qualcosa');
});

// ── il confronto per segmenti ─────────────────────────────────────────────────────────────────

test('COMBACIA: `:id` copre il buco della chiamata costruita (il caso /children)', () => {
  assert.ok(combaciaPercorso(
    { metodo: 'GET', percorso: '/api/v1/sessions/:id/children' },
    { metodo: 'GET', percorso: '/api/v1/sessions/${sessionId}/children' },
  ));
});

test('COMBACIA: AL CONTRARIO, il prefisso di stringa NON basta — `sessions` ≠ `sessions-archiviate`', () => {
  // È la trappola dichiarata dalla ricerca: con `startsWith` la rotta morta `/api/v1/sessions`
  // risulterebbe viva grazie a una chiamata che non la tocca nemmeno.
  assert.equal(combaciaPercorso('/api/v1/sessions', '/api/v1/sessions-archiviate'), false);
  assert.equal(combaciaPercorso('/api/v1/sessions/:id/children', '/api/v1/sessions/${id}/notes'), false);
  assert.equal(combaciaPercorso('/api/v1/sessions/:id', '/api/v1/sessions'), false, 'un segmento in meno non combacia');
});

test('COMBACIA: il metodo discrimina, ma un metodo ignoto non fa accusare', () => {
  assert.equal(combaciaPercorso('POST /api/v1/sessions', 'GET /api/v1/sessions'), false);
  assert.ok(combaciaPercorso('POST /api/v1/sessions', '/api/v1/sessions'), 'chi non sa il verbo non deve far scattare un falso allarme');
});

test('COMBACIA: la rotta a prefisso (il nostro router usa startsWith) copre i figli', () => {
  const r = { metodo: 'GET', percorso: '/api/v1/browser-proxy', prefisso: true };
  assert.ok(combaciaPercorso(r, 'GET /api/v1/browser-proxy/pagina/interna'));
  // AL CONTRARIO: senza `prefisso: true` la stessa rotta non copre niente di più lungo
  assert.equal(combaciaPercorso({ metodo: 'GET', percorso: '/api/v1/browser-proxy' }, 'GET /api/v1/browser-proxy/pagina'), false);
});

// ── superfici scollegate ──────────────────────────────────────────────────────────────────────

const ROTTE = [
  { metodo: 'GET', percorso: '/api/v1/sessions/:id/children', file: 'src/http-app.mjs', riga: 2201 },
  { metodo: 'GET', percorso: '/api/v1/sessions/:id/notes', file: 'src/http-app.mjs', riga: 1310 },
  { metodo: 'GET', percorso: '/api/v1/tools', file: 'src/http-app.mjs', riga: 900 },
];

test('SCOLLEGATE: «Agenti» promette i sotto-agenti e non chiama niente ⇒ reperto grave', () => {
  const reperti = superficiScollegate(
    [{ id: 'agenti', nome: 'Agenti', promette: 'i sotto-agenti della sessione', chiamate: [], sinonimi: ['children'] }],
    [],
    { rotte: ROTTE },
  );
  assert.equal(reperti.length, 1);
  assert.equal(reperti[0].tipo, 'superficie-scollegata');
  assert.equal(reperti[0].gravita, GRAVITA.ALTA);
  assert.equal(reperti[0].rottaCandidata, 'GET /api/v1/sessions/:id/children', 'il sinonimo dichiarato porta il rapporto sulla rotta giusta');
});

test('SCOLLEGATE: AL CONTRARIO, la stessa scheda che chiama la rotta non è un reperto', () => {
  const reperti = superficiScollegate(
    [{ id: 'agenti', nome: 'Agenti', promette: 'i sotto-agenti', chiamate: ['GET /api/v1/sessions/${id}/children'] }],
    [],
    { rotte: ROTTE },
  );
  assert.deepEqual(reperti, []);
});

test('SCOLLEGATE: una superficie alimentata da SSE non è scollegata (trappola dichiarata)', () => {
  const reperti = superficiScollegate(
    [{ id: 'stream', nome: 'Conversazione', promette: 'i messaggi che arrivano', chiamate: [], eventi: ['message.delta'] }],
    [],
    { rotte: ROTTE },
  );
  assert.deepEqual(reperti, [], 'i dati arrivano da un altro tubo, non è un difetto');
});

test('SCOLLEGATE: le chiamate si attribuiscono anche per file, e chi non dice dove vive lo dichiara', () => {
  const chiamate = [{ metodo: 'GET', percorso: '/api/v1/tools', file: 'src/components/officina.js', riga: 12 }];
  const superfici = [
    { id: 'officina', nome: 'Officina', promette: 'gli attrezzi', file: 'src/components/officina.js' },
    { id: 'board', nome: 'Board', promette: 'le carte del lavoro' },
  ];
  const reperti = superficiScollegate(superfici, chiamate, { rotte: ROTTE });
  assert.equal(reperti.length, 1, 'l’Officina è collegata: la chiamata sta nel suo file');
  assert.equal(reperti[0].superficie, 'board');
  // ⛔ Non è «scollegata»: è NON GIUDICABILE, e tacere sarebbe il difetto peggiore.
  assert.equal(reperti[0].tipo, 'dichiarazione-incompleta');
  assert.equal(reperti[0].gravita, GRAVITA.BASSA);
});

test('SCOLLEGATE: chi chiama SOLO rotte che non esistono è peggio di chi non chiama', () => {
  const reperti = superficiScollegate(
    [{ id: 'agenti', nome: 'Agenti', promette: 'i sotto-agenti', chiamate: ['GET /api/v1/sessions/${id}/agents'] }],
    [],
    { rotte: ROTTE },
  );
  assert.equal(reperti.length, 1);
  assert.equal(reperti[0].tipo, 'superficie-su-rotta-inesistente');
  assert.equal(reperti[0].gravita, GRAVITA.ALTA);
});

test('SCOLLEGATE: una schermata statica è assolta solo se dice PERCHÉ', () => {
  const muta = superficiScollegate([{ id: 'aiuto', nome: 'Aiuto', promette: 'le scorciatoie', statica: true }], [], { rotte: ROTTE });
  assert.equal(muta.length, 1);
  assert.equal(muta[0].tipo, 'eccezione-muta');
  const dichiarata = superficiScollegate(
    [{ id: 'aiuto', nome: 'Aiuto', promette: 'le scorciatoie', statica: true, perche: 'la lista dei tasti è costante, non viene dal server' }],
    [], { rotte: ROTTE },
  );
  assert.deepEqual(dichiarata, []);
});

// ── rotte mai chiamate ────────────────────────────────────────────────────────────────────────

test('ROTTE MORTE: /children esposta e mai chiesta ⇒ sospetto; le altre due no', () => {
  const chiamate = [
    { metodo: 'GET', percorso: '/api/v1/sessions/${encodeURIComponent(id)}/notes', file: 'src/legacy/app.js', riga: 1316 },
    { metodo: 'GET', percorso: '${BASE}/api/v1/tools', file: 'src/components/contesto.js', riga: 9 },
  ];
  const reperti = rotteMaiChiamate(ROTTE, chiamate);
  assert.equal(reperti.length, 1);
  assert.equal(reperti[0].percorso, '/api/v1/sessions/:id/children');
  assert.equal(reperti[0].gravita, GRAVITA.MEDIA, 'è un sospetto statico, non un verdetto');
  assert.equal(reperti[0].file, 'src/http-app.mjs');
  assert.equal(reperti[0].riga, 2201);
});

test('ROTTE MORTE: HEAD e OPTIONS non si accusano, nessun fetch li scrive mai', () => {
  assert.deepEqual(rotteMaiChiamate([{ metodo: 'HEAD', percorso: '/api/v1/health' }], []), []);
  // AL CONTRARIO: lo stesso percorso in GET, mai chiamato, si accusa
  assert.equal(rotteMaiChiamate([{ metodo: 'GET', percorso: '/api/v1/health' }], []).length, 1);
});

test('ROTTE MORTE: un consumatore esterno assolve solo con il perché scritto', () => {
  const conPerche = rotteMaiChiamate(
    [{ metodo: 'GET', percorso: '/api/v1/health', consumatore: 'supervisore', perche: 'la interroga il supervisore del 4174, non il frontend' }],
    [],
  );
  assert.deepEqual(conPerche, []);
  const muto = rotteMaiChiamate([{ metodo: 'GET', percorso: '/api/v1/health', consumatore: 'supervisore' }], []);
  assert.equal(muto.length, 1);
  assert.equal(muto[0].tipo, 'eccezione-muta');
});

test('ROTTE MORTE: la lista d’eccezione vale, ma una scusa senza motivo diventa un reperto', () => {
  const rotte = [{ metodo: 'GET', percorso: '/api/v1/ponte/stato' }];
  assert.deepEqual(rotteMaiChiamate(rotte, [], { eccezioni: [{ percorso: '/api/v1/ponte/stato', perche: 'la chiama il ponte mobile' }] }), []);
  const muta = rotteMaiChiamate(rotte, [], { eccezioni: ['/api/v1/ponte/stato'] });
  assert.equal(muta[0].tipo, 'eccezione-muta');
});

test('CHIAMATE ORFANE: un fetch verso una rotta inesistente si vede da entrambi i versi', () => {
  const orfane = chiamateSenzaRotta([{ metodo: 'GET', percorso: '/api/v1/sessions/${id}/agents', file: 'src/components/agenti.js', riga: 40 }], ROTTE);
  assert.equal(orfane.length, 1);
  assert.equal(orfane[0].gravita, GRAVITA.ALTA);
  assert.equal(orfane[0].file, 'src/components/agenti.js');
  // AL CONTRARIO: la stessa chiamata sulla rotta vera non è orfana, e senza rotte non si giudica
  assert.deepEqual(chiamateSenzaRotta([{ percorso: '/api/v1/sessions/${id}/children' }], ROTTE), []);
  assert.deepEqual(chiamateSenzaRotta([{ percorso: '/api/v1/qualunque' }], []), []);
});

// ── contatori senza luogo ─────────────────────────────────────────────────────────────────────

const SUPERFICI = [
  { id: 'note', nome: 'Note', promette: 'le note della sessione', chiamate: ['GET /api/v1/sessions/${id}/notes'] },
  { id: 'officina', nome: 'Officina', promette: 'gli attrezzi', chiamate: ['GET /api/v1/tools'] },
];

test('CONTATORI: «Note» col numero e senza `vaia` ⇒ il clic cade dove capita', () => {
  // La forma è quella vera di nav-item.js: la voce aveva `conteggio: "note"` e nessun `vaia`.
  const reperti = contatoriSenzaLuogo([{ conteggio: 'note', etichetta: 'Note' }], SUPERFICI);
  assert.equal(reperti.length, 1);
  assert.equal(reperti[0].tipo, 'contatore-senza-destinazione');
  assert.equal(reperti[0].gravita, GRAVITA.ALTA);
});

test('CONTATORI: AL CONTRARIO, la stessa voce con la sua pagina non è un reperto', () => {
  assert.deepEqual(contatoriSenzaLuogo([{ vaia: 'note', etichetta: 'Note' }], SUPERFICI), []);
});

test('CONTATORI: una destinazione che non esiste fra le superfici è grave quanto nessuna', () => {
  const reperti = contatoriSenzaLuogo([{ vaia: 'agenti', etichetta: 'Agenti' }], SUPERFICI);
  assert.equal(reperti[0].tipo, 'contatore-verso-luogo-inesistente');
  assert.equal(reperti[0].vaia, 'agenti');
});

test('CONTATORI: «il luogo c’è ma è vuoto» è un difetto DIVERSO, e più leggero', () => {
  const reperti = contatoriSenzaLuogo(
    [{ vaia: 'officina', etichetta: 'Officina attrezzi' }],
    SUPERFICI,
    { scollegate: [{ superficie: 'officina' }] },
  );
  assert.equal(reperti[0].tipo, 'contatore-verso-luogo-vuoto');
  assert.equal(reperti[0].gravita, GRAVITA.MEDIA);
});

test('CONTATORI: un numero che viene da una rotta inesistente è un numero inventato', () => {
  const reperti = contatoriSenzaLuogo([{ vaia: 'note', etichetta: 'Note', fonte: 'GET /api/v1/sessions/${id}/appunti' }], SUPERFICI, { rotte: ROTTE });
  assert.equal(reperti[0].tipo, 'contatore-da-fonte-inesistente');
  // AL CONTRARIO: la fonte vera non produce niente
  assert.deepEqual(contatoriSenzaLuogo([{ vaia: 'note', etichetta: 'Note', fonte: 'GET /api/v1/sessions/${id}/notes' }], SUPERFICI, { rotte: ROTTE }), []);
});

test('CONTATORI: «decorativo» assolve solo con il perché, o diventa il tappeto sotto cui nascondere', () => {
  assert.deepEqual(
    contatoriSenzaLuogo([{ id: 'token', etichetta: '1.2k token', decorativo: true, perche: 'è un numero della barra di stato, non si apre niente' }], SUPERFICI),
    [],
  );
  const muto = contatoriSenzaLuogo([{ id: 'token', etichetta: '1.2k token', decorativo: true }], SUPERFICI);
  assert.equal(muto[0].tipo, 'eccezione-muta');
});

// ── il giro intero e la robustezza ────────────────────────────────────────────────────────────

test('GIRO: le tre domande insieme, e i contatori sanno quali luoghi sono vuoti', () => {
  const esito = analizzaSuperfici({
    rotte: ROTTE,
    chiamate: [{ metodo: 'GET', percorso: '/api/v1/tools', file: 'src/components/officina.js' }],
    superfici: [
      { id: 'agenti', nome: 'Agenti', promette: 'i sotto-agenti', chiamate: [], sinonimi: ['children'] },
      { id: 'officina', nome: 'Officina', promette: 'gli attrezzi', file: 'src/components/officina.js' },
    ],
    contatori: [{ conteggio: 'note', etichetta: 'Note' }, { vaia: 'agenti', etichetta: 'Agenti' }],
  });
  assert.equal(esito.scollegate.length, 1);
  assert.equal(esito.scollegate[0].superficie, 'agenti');
  assert.equal(esito.rotteMorte.length, 2, '/children e /notes non li chiede nessuno');
  assert.deepEqual(esito.chiamateOrfane, []);
  assert.deepEqual(esito.contatori.map((r) => r.tipo).sort(), ['contatore-senza-destinazione', 'contatore-verso-luogo-vuoto']);
  assert.ok(esito.limiti.length >= 5, 'il rapporto deve poter stampare cosa NON è stato guardato');
  assert.equal(esito.limiti, LIMITI_DICHIARATI);
});

test('ROBUSTEZZA: liste assenti o sporche non fanno inventare reperti né esplodere il cancello', () => {
  assert.deepEqual(superficiScollegate(null, null), []);
  assert.deepEqual(rotteMaiChiamate(undefined, undefined), []);
  assert.deepEqual(chiamateSenzaRotta(null, null), []);
  assert.deepEqual(contatoriSenzaLuogo([null, 'stringa'], null), []);
  assert.deepEqual(rotteMaiChiamate([{ percorso: '' }], []), [], 'una rotta senza percorso non è un difetto: è un dato sporco');
  assert.deepEqual(analizzaSuperfici().scollegate, []);
});
