/*
 * PO-30, fetta 1 (17/09/2026) — LA ROTTA della ricerca di un file in tutta la cartella della sessione:
 * `GET /api/v1/sessions/:id/tree/search?q=…`. Nei due versi: la parola arriva INTATTA al registro e la risposta porta
 * anche «troncato» e «saltate»; una query malformata non arriva MAI al registro.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* ⛔ Nessuna prova tocca la rete vera: passa solo 127.0.0.1, tutto il resto viene registrato e rifiutato. */
const fuori = [];
const fetchVera = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(typeof url === 'string' ? url : url.url);
  if (u.hostname === '127.0.0.1') return fetchVera(url, init);
  fuori.push(u.hostname);
  return new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } });
};
test.after(() => { if (fuori.length) throw new Error(`una prova ha tentato di uscire in rete: ${JSON.stringify(fuori)}`); });

async function ascolta(t, registro) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function registroSpia(risposta) {
  const chiamate = [];
  return { chiamate, cercaFile: async (sessionId, query) => { chiamate.push({ sessionId, query }); return risposta; } };
}

test('ALBERO-CERCA-01 — la parola arriva intatta, e la risposta porta risultati, «troncato», il motivo e le cartelle saltate', async (t) => {
  const registro = registroSpia({ ok: true, risultati: [{ percorso: 'src/a b.mjs', nome: 'a b.mjs', cartella: false }], troncato: true, motivo: 'la cartella è molto grande', saltate: ['node_modules'], visitate: 9 });
  const base = await ascolta(t, registro);
  const risposta = await fetch(`${base}/api/v1/sessions/sessione-1/tree/search?q=${encodeURIComponent('a b')}`);
  assert.equal(risposta.status, 200);
  assert.deepEqual((await risposta.json()).data, { risultati: [{ percorso: 'src/a b.mjs', nome: 'a b.mjs', cartella: false }], troncato: true, motivo: 'la cartella è molto grande', saltate: ['node_modules'] });
  assert.deepEqual(registro.chiamate, [{ sessionId: 'sessione-1', query: 'a b' }]);
});

test('ALBERO-CERCA-02 — senza `q`, con un parametro in più o con un POST: il registro non viene MAI chiamato', async (t) => {
  const registro = registroSpia({ ok: true, risultati: [], troncato: false, motivo: null, saltate: [] });
  const base = await ascolta(t, registro);
  for (const coda of ['', '?percorso=src', '?q=a&altro=1', '?q=a&q=b']) {
    const r = await fetch(`${base}/api/v1/sessions/s/tree/search${coda}`);
    assert.equal(r.status, 400, `«${coda}» doveva essere una query non valida`);
  }
  assert.equal((await fetch(`${base}/api/v1/sessions/s/tree/search?q=a`, { method: 'POST' })).status, 405);
  assert.deepEqual(registro.chiamate, []);
});

test('ALBERO-CERCA-03 — un rifiuto del registro (sessione assente, parola vuota) diventa l’errore giusto, non un 200 vuoto', async (t) => {
  const base404 = await ascolta(t, registroSpia({ erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' }));
  assert.equal((await fetch(`${base404}/api/v1/sessions/nessuna/tree/search?q=a`)).status, 404);
  const base400 = await ascolta(t, registroSpia({ erroreAvvio: 'Scrivi che cosa cercare', code: 'QUERY_INVALID' }));
  assert.equal((await fetch(`${base400}/api/v1/sessions/s/tree/search?q=%20`)).status, 400);
});

test('ALBERO-CERCA-04 — dal registro VERO: `cercaFile` cerca nella cartella della sessione, e una sessione che non c’è non cerca niente', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'albero-cerca-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  mkdirSync(join(cartella, 'src', 'dentro'), { recursive: true });
  writeFileSync(join(cartella, 'src', 'dentro', 'bersaglio.mjs'), 'x');
  const cercate = [];
  const registro = createSessionRegistry({
    avviaSessioneFn: async () => ({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } }),
    modello: 'vendor/modello', chiave: 'k', chiaveFn: () => 'k',
    cartelleProgetto: [{ id: '0', percorso: cartella, nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { consegna: 'x' }, comandoProva: null }),
    cercaNelWorkspaceFn: async (input) => { cercate.push(input); const { cercaNelWorkspace } = await import('../src/workspace-search.mjs'); return cercaNelWorkspace(input); },
  });
  t.after(() => { for (const sessione of registro.elenca()) registro.ferma(sessione.sessionId); }); // ogni prova spegne ciò che accende
  const { sessionId } = registro.avvia('task');
  const esito = await registro.cercaFile(sessionId, 'bersaglio');
  assert.equal(esito.ok, true);
  assert.deepEqual(esito.risultati.map((r) => r.percorso), ['src/dentro/bersaglio.mjs']);
  assert.equal(cercate[0].cartella, cartella, 'la cartella è quella della SESSIONE, mai una arrivata da fuori');
  assert.deepEqual(await registro.cercaFile('non-esiste', 'x'), { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' });
  assert.equal(cercate.length, 1);
  /* ⛔ Si aspetta che il giro avviato FINISCA prima di chiudere la prova: l'avvio di una sessione fa lavoro asincrono
     (contesto del progetto, git, plugin), e una prova che se ne va a metà lascia il processo appeso — misurato: il file
     non terminava, con le quattro prove verdi. */
  const scadenza = Date.now() + 10_000;
  while (Date.now() < scadenza && !(registro.esporta(sessionId)?.eventi ?? []).some((e) => e.type === 'RunFinished' || e.type === 'RunError')) await new Promise((r) => setTimeout(r, 20));
});
