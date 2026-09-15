import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createHttpApp, metodiAmmessiPerRotta } from '../src/http-app.mjs';

/*
 * ⛔⛔⛔ 07/9 — IL 405 CHE COPRIVA IL 404.
 *
 * Misurato sul server vivo (istanza mia sulla 4462, store vergine) il 07/09/2026:
 *   POST /api/v1/artifacts          -> 405
 *   POST /api/v1/questa-non-esiste  -> 405
 * Nessuna delle due esiste (di artifacts esiste solo /api/v1/artifacts/:id), eppure la
 * risposta era la stessa che dà una rotta vera bussata col metodo sbagliato: dall'esterno
 * una porta e un muro erano indistinguibili, e su questo si era arenato il tentativo di
 * scrivere un controllo automatico sulle rotte esposte.
 *
 * Ricerca 07/09/2026, prima di scrivere il codice (RFC 9110 §15.5.6 via http.dev/405; MDN
 * «405 Method Not Allowed»; expressjs/express #2055 e #1499): «404 means the door isn't
 * there; 405 means the door is there but locked to that knock», e sul 405 il server MUST
 * mandare Allow con i metodi CORRENTEMENTE supportati da quella risorsa. Il nostro mandava
 * sempre «GET, HEAD», falso su /api/v1/sessions. Hermes Agent, il concorrente da battere,
 * un API server ce l'ha (sua doc «API Server», letta 07/09/2026) e la sua difesa sono
 * ~11.500 test con gate di regressione: il pareggio-e-supera qui non è un test in più, è il
 * guardiano in fondo a questo file, che rilegge il sorgente invece di fidarsi di una lista.
 *
 * Le prove vanno nei DUE versi, come vuole la regola: la rotta vera deve continuare a dire
 * 405, quella inventata deve dire 404.
 */

const PERCORSO_HTTP_APP = fileURLToPath(new URL('../src/http-app.mjs', import.meta.url));

async function listen(t, deps = {}) {
  const app = createHttpApp({
    staticHandler: async () => null,
    listaTaskDisponibili: () => [],
    elencaCartelleProgetto: () => [],
    ...deps,
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('⛔⛔⛔ una rotta API che non esiste risponde 404, non 405 (era il difetto: 405 su tutto)', async (t) => {
  const base = await listen(t);
  for (const percorso of ['/api/v1/questa-non-esiste', '/api/v1/artifacts', '/api/v1/sessions/x/inventata', '/api/v1/']) {
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const risposta = await fetch(`${base}${percorso}`, { method: metodo });
      assert.equal(risposta.status, 404, `${metodo} ${percorso}`);
      assert.equal((await risposta.json()).error.code, 'NOT_FOUND', `${metodo} ${percorso}`);
    }
  }
});

test('⛔⛔ AL CONTRARIO — una rotta che ESISTE, col metodo sbagliato, resta 405 e ora porta l’Allow vero', async (t) => {
  const base = await listen(t);
  const casi = [
    { percorso: '/api/v1/health', metodo: 'POST', allow: 'GET, HEAD' },
    { percorso: '/api/v1/tasks', metodo: 'DELETE', allow: 'GET, HEAD' },
    /* ⛔ Qui stava la seconda bugia, quella che ha fatto vedere la ricerca: /api/v1/sessions
       accetta POST, e l'intestazione Allow diceva lo stesso «GET, HEAD» di tutte le altre. */
    { percorso: '/api/v1/sessions', metodo: 'PUT', allow: 'GET, HEAD, POST' },
    { percorso: '/api/v1/sessions/x/stop', metodo: 'DELETE', allow: 'POST' },
    { percorso: '/api/v1/runtime/load', metodo: 'PATCH', allow: 'POST' },
    { percorso: '/api/v1/sessions/x/terminals', metodo: 'PUT', allow: 'GET, HEAD, POST' },
  ];
  for (const caso of casi) {
    const risposta = await fetch(`${base}${caso.percorso}`, { method: caso.metodo });
    assert.equal(risposta.status, 405, `${caso.metodo} ${caso.percorso}`);
    assert.equal((await risposta.json()).error.code, 'METHOD_NOT_ALLOWED');
    assert.equal(risposta.headers.get('allow'), caso.allow, `Allow di ${caso.percorso}`);
  }
});

test('⛔ fuori da /api/ non cambia niente: i file statici restano di sola lettura, 405 come sempre', async (t) => {
  const base = await listen(t);
  const risposta = await fetch(`${base}/qualunque-cosa.html`, { method: 'POST' });
  assert.equal(risposta.status, 405);
  assert.equal(risposta.headers.get('allow'), 'GET, HEAD');
});

test('⛔ una rotta dichiarata ma col servizio non collegato resta 405, come prima di questa cura', async (t) => {
  // Senza sessionRegistry la catena non serve /fork: la richiesta cade sul 405, non sul 404.
  const base = await listen(t, { sessionRegistry: null });
  const risposta = await fetch(`${base}/api/v1/sessions/x/fork`, { method: 'POST' });
  assert.equal(risposta.status, 405);
});


/*
 * ⛔⛔⛔ IL GUARDIANO CONTRO LA DERIVA. ROTTE_API descrive la catena di if/else di
 * http-app.mjs: due cose separate che devono dire lo stesso. Se qualcuno aggiunge una rotta
 * alla catena e si dimentica la riga nell'inventario, quella rotta ricomincia a rispondere
 * 404 dove doveva dire 405 — cioè il difetto torna, in silenzio e mesi dopo.
 * Questo test rilegge il sorgente, tira fuori OGNI indirizzo che la catena nomina, ne
 * costruisce un esempio concreto e pretende che l'inventario lo riconosca. Non confronta
 * stringhe ma comportamenti, così l'inventario può anche essere riscritto in un altro modo
 * purché continui a rispondere giusto.
 * ⛔ Niente doppie barre rovesciate qui dentro: passando da una shell a un file se ne perde
 * una e la regex diventa un'altra (già successo quattro volte, memoria del 02/09). Dove
 * servono si compongono da BARRA_ROVESCIA.
 */
const BARRA_ROVESCIA = String.fromCharCode(92);

/** Tira fuori dalla catena ogni schema di indirizzo, col metodo con cui è protetto. */
function rotteNominateNellaCatena(sorgente) {
  const righe = sorgente.split(/\r?\n/);
  const inizioRegex = '/^' + BARRA_ROVESCIA + '/api';
  const trovate = [];
  /*
   * ⛔ La guardia del metodo non sta sempre sulla stessa riga dello schema: a volte lo
   * schema è dichiarato due righe PRIMA del suo `if` (providerKeyMatch), a volte è una
   * seconda `.exec` DENTRO il blocco, fino a tre righe DOPO l'`if` (local-models/rename,
   * qualify, huggingface/downloads). Trovate provando: con una finestra di una riga sola
   * il guardiano accusava quattro rotte sane. Si guarda dalla più vicina alla più lontana.
   */
  const metodoDi = (indice) => {
    const vicinanza = [0, -1, 1, -2, 2, -3];
    for (const salto of vicinanza) {
      const riga = righe[indice + salto] ?? '';
      const trovato = /method === '(POST|PUT|DELETE|PATCH|GET)'/.exec(riga);
      if (trovato) return trovato[1];
    }
    return 'GET';
  };
  righe.forEach((riga, indice) => {
    const ripulita = riga.trimStart();
    if (ripulita.startsWith('*') || ripulita.startsWith('//') || ripulita.startsWith('/*')) return; // i commenti non sono rotte
    if (riga.includes('{ schema:')) return; // l'inventario stesso non è la catena
    const stringhe = /url\.pathname === '(\/api\/[^']+)'/g;
    let trovato;
    while ((trovato = stringhe.exec(riga))) trovate.push({ schema: trovato[1], metodo: metodoDi(indice) });
    if (!riga.includes('(url.pathname)')) return;
    let da = 0;
    for (;;) {
      const inizio = riga.indexOf(inizioRegex, da);
      if (inizio < 0) break;
      let fine = inizio + 2;
      let dentroClasse = false;
      for (; fine < riga.length; fine += 1) {
        const carattere = riga[fine];
        if (carattere === BARRA_ROVESCIA) { fine += 1; continue; }
        if (dentroClasse) { if (carattere === ']') dentroClasse = false; continue; }
        if (carattere === '[') { dentroClasse = true; continue; }
        if (carattere === '/') break;
      }
      trovate.push({ schema: riga.slice(inizio, fine + 1), metodo: metodoDi(indice) });
      da = fine + 1;
    }
  });
  return trovate;
}

/** Da uno schema (stringa o regex letterale) a un indirizzo concreto che quello schema accetta. */
function esempioDiIndirizzo(schema) {
  if (!schema.startsWith('/^')) return schema;
  let corpo = schema.slice(2).replace(/\$\/u?$/, '');
  for (;;) { // un gruppo facoltativo "(?:...)?" si omette: l'indirizzo più corto è comunque valido
    const inizio = corpo.indexOf('(?:');
    const fine = inizio < 0 ? -1 : corpo.indexOf(')?', inizio);
    if (inizio < 0 || fine < 0) break;
    corpo = corpo.slice(0, inizio) + corpo.slice(fine + 2);
  }
  // Anche un gruppo catturante facoltativo puo essere omesso. La sonda
  // gestisce qui i gruppi semplici presenti nelle rotte, non regex arbitrarie.
  corpo = corpo.replace(/\((?:\\.|[^()])*\)\?/g, '');
  corpo = corpo.split('([^/]+)').join('esempio');            // un id qualunque
  corpo = corpo.split('[a-f0-9]{12}').join('a1b2c3d4e5f6');  // il riferimento di Doctor
  corpo = corpo.split('[a-f0-9]{64}').join('a'.repeat(64));  // il riferimento immagine
  corpo = corpo.replace(/\(([^)]*)\)/g, (_, dentro) => dentro.split('|')[0]); // prima alternativa
  return corpo.split(BARRA_ROVESCIA + '/').join('/');
}

test('CTX-ROUTE-SAMPLE un gruppo catturante facoltativo produce un indirizzo realmente accettato', () => {
  const schema = /^\/api\/v1\/sessions\/([^/]+)\/context(\/.*)?$/;
  const indirizzo = esempioDiIndirizzo(schema.toString());
  assert.equal(indirizzo, '/api/v1/sessions/esempio/context');
  assert.equal(schema.test(indirizzo), true);
});

test('⛔⛔⛔ GUARDIANO — ogni rotta nominata nella catena è anche nell’inventario che decide 404 contro 405', () => {
  const sorgente = readFileSync(PERCORSO_HTTP_APP, 'utf8');
  const nominate = rotteNominateNellaCatena(sorgente);
  assert.ok(nominate.length > 80, `la lettura del sorgente ha trovato solo ${nominate.length} rotte: è la SONDA a essere rotta, non il codice`);
  const mancanti = [];
  for (const { schema, metodo } of nominate) {
    const indirizzo = esempioDiIndirizzo(schema);
    const ammessi = metodiAmmessiPerRotta(indirizzo);
    if (ammessi === null) { mancanti.push(`${indirizzo} (${schema}) — nessuna riga nell'inventario`); continue; }
    if (!ammessi.includes(metodo)) mancanti.push(`${indirizzo} — la catena la serve in ${metodo}, l'inventario dice ${ammessi.join(', ')}`);
  }
  assert.deepEqual(mancanti, [], `rotte servite dalla catena e non descritte dall'inventario:\n${mancanti.join('\n')}`);
});

test('⛔⛔ AL CONTRARIO — il guardiano MORDE: ciò che la catena non nomina non risulta coperto', () => {
  // Senza questa, il test qui sopra passerebbe anche con un inventario che dice sempre «sì».
  assert.equal(metodiAmmessiPerRotta('/api/v1/questa-non-esiste'), null);
  assert.equal(metodiAmmessiPerRotta('/api/v1/sessions/x/approva'), null); // una lettera sola di differenza
  assert.equal(metodiAmmessiPerRotta('/api/v1/sessions/x/tree/inventata'), null);
  assert.equal(metodiAmmessiPerRotta('/api/v1/artifacts'), null);          // esiste solo /artifacts/:id
  assert.deepEqual(metodiAmmessiPerRotta('/api/v1/sessions/x/approve'), ['POST']);
  assert.deepEqual(metodiAmmessiPerRotta('/api/v1/artifacts/abc'), ['GET', 'HEAD']);
});

/*
 * ⭐⭐⭐⭐ 11/09 — IL CRUD DI NOTE/ATTIVITÀ/MEMORIA nell'inventario, risorsa per risorsa.
 * Il guardiano qui sopra prova che ogni rotta SERVITA sia dichiarata; questo prova il contrario
 * per le sette righe nuove: che l'inventario dichiari ESATTAMENTE i metodi giusti, e non l'unione
 * dei metodi di tutta la famiglia — che è il modo in cui un `Allow` torna a dire il falso.
 */
test('⭐⭐⭐ le rotte nuove di Note/Attività/Memoria dichiarano i metodi VERI, una per una', () => {
  for (const risorsa of ['notes', 'tasks', 'memory']) {
    assert.deepEqual(metodiAmmessiPerRotta(`/api/v1/sessions/x/${risorsa}`), ['GET', 'HEAD', 'POST'], `collezione ${risorsa}`);
    assert.deepEqual(metodiAmmessiPerRotta(`/api/v1/sessions/x/${risorsa}/v1`), ['GET', 'HEAD', 'PATCH', 'DELETE'], `voce di ${risorsa}`);
  }
  // Il cambio di stato è SOLO delle attività, e solo in POST.
  assert.deepEqual(metodiAmmessiPerRotta('/api/v1/sessions/x/tasks/t1/stato'), ['POST']);
  assert.equal(metodiAmmessiPerRotta('/api/v1/sessions/x/notes/n1/stato'), null, 'una nota non ha uno stato: quell’indirizzo non esiste');
  assert.equal(metodiAmmessiPerRotta('/api/v1/sessions/x/memory/m1/stato'), null);
  for (const risorsa of ['library', 'notes', 'tasks', 'memory', 'research']) {
    assert.deepEqual(metodiAmmessiPerRotta(`/api/v1/sessions/x/${risorsa}/batch`), ['POST'], `batch ${risorsa}`);
  }
  assert.equal(metodiAmmessiPerRotta('/api/v1/sessions/x/projects/batch'), null, 'Progetti resta privo di cancellazione');
});

/*
 * ⛔⛔ La stessa domanda dalla parte della GET. Prima della cura GET su una rotta POST che
 * ESISTE (/rename) e GET su un nome INVENTATO rispondevano identiche, 404: l’asimmetria
 * rendeva vera solo metà del contratto.
 */
test('⛔⛔ una rotta che esiste solo in POST, chiesta in GET, dice 405 con Allow: POST (non 404)', async (t) => {
  const base = await listen(t);
  for (const percorso of ['/api/v1/local-models/x/rename', '/api/v1/sessions/x/stop', '/api/v1/local-models/x/qualify']) {
    const risposta = await fetch(`${base}${percorso}`);
    assert.equal(risposta.status, 405, `GET ${percorso}`);
    assert.equal(risposta.headers.get('allow'), 'POST', `Allow di ${percorso}`);
  }
});

test('⛔⛔ AL CONTRARIO — una rotta GET arrivata in fondo (id inesistente, servizio scollegato) resta 404', async (t) => {
  // Se questa diventasse 405 vorrebbe dire che il 405 sta mangiando anche i casi che sono davvero 404.
  const base = await listen(t, { sessionRegistry: null });
  assert.equal((await fetch(`${base}/api/v1/sessions/x/tree`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/local-models/x/inventata`)).status, 404);
});
