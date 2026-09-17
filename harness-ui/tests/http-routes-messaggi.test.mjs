import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

/*
 * ⭐⭐⭐ 17/09/2026 — LA PORTA CHE TOGLIE UN MESSAGGIO DALLA CONVERSAZIONE.
 *
 * Owner 11/09: «non c'è la rotta» non è una risposta. Qui si prova la PORTA, non il registro (che
 * ha le sue prove in `session-registry.test.mjs`): la forma dell'indirizzo, chi risponde 404, chi
 * 409, e che la porta non inventi un esito quando il registro dice di no.
 *
 * ⛔ Il registro è finto APPOSTA: una porta si prova sui suoi contratti, e un registro vero qui
 *   proverebbe due cose insieme senza saper dire quale delle due ha sbagliato.
 */

async function ascolta(t, sessionRegistry) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry }));
  await new Promise((risolvi, rifiuta) => { server.once('error', rifiuta); server.listen(0, '127.0.0.1', risolvi); });
  t.after(() => new Promise((risolvi) => server.close(risolvi)));
  return `http://127.0.0.1:${server.address().port}`;
}

const registroFinto = (rimuovi, { esiste = () => true } = {}) => ({
  esiste,
  rimuoviMessaggio: rimuovi,
  elenca: () => [],
});

test('MSG-HTTP-01 — DELETE di un messaggio: chiama il registro con l\'id decodificato e torna la busta standard', async (t) => {
  const chiamate = [];
  const base = await ascolta(t, registroFinto(async (sessionId, riferimento) => {
    chiamate.push([sessionId, riferimento]);
    return { ok: true, riferimento };
  }));
  const risposta = await fetch(`${base}/api/v1/sessions/s-1/messages/${encodeURIComponent('giro:3')}`, { method: 'DELETE' });
  assert.equal(risposta.status, 200);
  const busta = await risposta.json();
  assert.equal(busta.ok, true);
  assert.deepEqual(busta.data, { rimosso: true, riferimento: 'giro:3' });
  assert.deepEqual(chiamate, [['s-1', 'giro:3']], '⛔ l\'id arriva DECODIFICATO: `giro%3A3` e `giro:3` non sono due messaggi diversi');
});

test('MSG-HTTP-02 — 404 se la sessione non c\'è, e il registro non viene nemmeno chiamato', async (t) => {
  let chiamato = false;
  const base = await ascolta(t, registroFinto(async () => { chiamato = true; return { ok: true, riferimento: 'x' }; }, { esiste: () => false }));
  const risposta = await fetch(`${base}/api/v1/sessions/mai/messages/m1`, { method: 'DELETE' });
  assert.equal(risposta.status, 404);
  assert.equal(chiamato, false, '⛔ non si tocca il registro per una sessione che non esiste');
});

test('MSG-HTTP-03 — il rifiuto del registro arriva com\'è: 409 a sessione viva, 404 su un messaggio assente', async (t) => {
  const base = await ascolta(t, registroFinto(async (_sessionId, riferimento) => (
    riferimento === 'viva'
      ? { erroreAvvio: 'La sessione sta ancora lavorando: aspetta la fine del giro, o fermalo.', code: 'SESSION_STILL_RUNNING' }
      : { erroreAvvio: 'Messaggio non trovato in questa sessione', code: 'NOT_FOUND' }
  )));
  const viva = await fetch(`${base}/api/v1/sessions/s-1/messages/viva`, { method: 'DELETE' });
  assert.equal(viva.status, 409, 'una sessione al lavoro è un conflitto, non un errore di chi chiede');
  assert.equal((await viva.json()).error.code, 'SESSION_STILL_RUNNING');
  const assente = await fetch(`${base}/api/v1/sessions/s-1/messages/mai`, { method: 'DELETE' });
  assert.equal(assente.status, 404);
});

test('MSG-HTTP-04 — una query è rifiutata, e gli altri metodi non passano da questa porta', async (t) => {
  const base = await ascolta(t, registroFinto(async () => ({ ok: true, riferimento: 'm1' })));
  const conQuery = await fetch(`${base}/api/v1/sessions/s-1/messages/m1?forza=1`, { method: 'DELETE' });
  assert.notEqual(conQuery.status, 200, '⛔ nessun parametro nascosto: che cosa si cancella lo dice l\'indirizzo');
  /* ⛔ AL CONTRARIO: la stessa via con un altro metodo non deve cancellare niente per sbaglio. */
  const conGet = await fetch(`${base}/api/v1/sessions/s-1/messages/m1`, { method: 'GET' });
  assert.notEqual(conGet.status, 200);
});
