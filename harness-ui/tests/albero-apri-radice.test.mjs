import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

/*
 * 11/09/2026 — LA ROTTA DI «APRI IN ESPLORA FILE», owner dal vivo sulla foto dell'albero:
 * «se faccio tasto destro sulla ROOT deve poter spuntare "Apri", cioe' devo poterla aprire su
 * Windows».
 *
 * Perche' una rotta NUOVA e non un parametro su `/tree/reveal`: su Windows «apri la cartella» e
 * «evidenziala nella cartella genitore» sono due operazioni diverse (`explorer.exe <p>` contro
 * `explorer.exe /select,<p>`), sono due voci diverse nel menu, e sulla RADICE la seconda aprirebbe
 * il genitore del workspace — cioe' un posto fuori dal workspace. Due cose diverse, due rotte.
 *
 * Cosa misurano queste prove, nei due versi:
 *   - che `{percorso: ''}` (la radice) arrivi INTATTO al registro, invece di essere respinto dal
 *     controllo di corpo come «percorso mancante»: e' esattamente il caso che l'owner ha chiesto;
 *   - che un corpo malformato, una query appesa e un metodo sbagliato non arrivino MAI al registro.
 */
async function ascolta(t, registro) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function registroSpia(risposta = { ok: true, aperto: true }) {
  const chiamate = [];
  return {
    chiamate,
    apriInEsploraFile: async (sessionId, percorso) => { chiamate.push({ sessionId, percorso }); return risposta; },
  };
}

test('ALBERO-APRI-01 — POST /tree/open con percorso VUOTO: la radice arriva intatta al registro', async (t) => {
  const registro = registroSpia();
  const base = await ascolta(t, registro);
  const risposta = await fetch(`${base}/api/v1/sessions/sessione-1/tree/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ percorso: '' }),
  });
  assert.equal(risposta.status, 200);
  assert.deepEqual((await risposta.json()).data, { aperto: true });
  assert.deepEqual(registro.chiamate, [{ sessionId: 'sessione-1', percorso: '' }]);
});

test('ALBERO-APRI-02 — una sottocartella passa dalla stessa rotta, senza un secondo verbo', async (t) => {
  const registro = registroSpia();
  const base = await ascolta(t, registro);
  const risposta = await fetch(`${base}/api/v1/sessions/sessione-1/tree/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ percorso: 'src/kernel' }),
  });
  assert.equal(risposta.status, 200);
  assert.deepEqual(registro.chiamate, [{ sessionId: 'sessione-1', percorso: 'src/kernel' }]);
});

test('ALBERO-APRI-03 — AL CONTRARIO: corpo sbagliato, query appesa e metodo sbagliato non toccano MAI il registro', async (t) => {
  const registro = registroSpia();
  const base = await ascolta(t, registro);
  const corpiRifiutati = [
    JSON.stringify({}),
    JSON.stringify({ percorso: 42 }),
    JSON.stringify({ percorso: 'a', extra: 'b' }),
    JSON.stringify({ path: 'a' }),
  ];
  for (const body of corpiRifiutati) {
    // eslint-disable-next-line no-await-in-loop -- i casi si leggono meglio in fila
    const risposta = await fetch(`${base}/api/v1/sessions/s/tree/open`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(risposta.status, 400, `corpo rifiutato: ${body}`);
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  }
  const conQuery = await fetch(`${base}/api/v1/sessions/s/tree/open?percorso=x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ percorso: '' }) });
  assert.equal(conQuery.status, 400, 'una query appesa a una rotta che legge dal CORPO e un comando ambiguo: si rifiuta');
  const conGet = await fetch(`${base}/api/v1/sessions/s/tree/open`);
  assert.notEqual(conGet.status, 200, 'GET non apre niente: aprire una finestra e un effetto, e un metodo sicuro non ha effetti (RFC 9110 §9.2.1)');
  assert.deepEqual(registro.chiamate, [], 'nessuna di queste richieste doveva arrivare al registro');
});

test('ALBERO-APRI-04 — un errore del registro esce come errore dichiarato, non come 200 muto', async (t) => {
  const base = await ascolta(t, { apriInEsploraFile: async () => ({ erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' }) });
  const risposta = await fetch(`${base}/api/v1/sessions/mai-vista/tree/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ percorso: '' }),
  });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});
