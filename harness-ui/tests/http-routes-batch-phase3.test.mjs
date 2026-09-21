import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { creaNota, elencaNote } from '../src/notes-store.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SESSIONE = 'sess-phase3a';

async function listen(t, { sessioni = [SESSIONE] } = {}) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-phase3a-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(radice));
  const cartelle = {
    cartellaNote: join(radice, 'note'),
    cartellaAttivita: join(radice, 'attivita'),
    cartellaMemoria: join(radice, 'memoria'),
  };
  const vive = new Set(sessioni);
  const chiamateLibreria = [];
  const chiamateRicerca = [];
  const sessionRegistry = {
    esiste: (id) => vive.has(id),
    async eliminaVoceLibreria(sessionId, id) {
      chiamateLibreria.push({ sessionId, id });
      if (!vive.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (id === 'lib-missing') return { erroreAvvio: 'Voce assente', code: 'LIBRARY_NOT_FOUND' };
      return { ok: true, id, nome: `${id}.md` };
    },
    async eliminaRicerca(sessionId, id) {
      chiamateRicerca.push({ sessionId, id });
      if (!vive.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (id === 'research-missing') return { ok: true, eliminata: null };
      if (id === 'research-conflict') return { ok: false, motivo: 'Ricerca ancora attiva' };
      return { ok: true, eliminata: { id } };
    },
  };
  const app = createHttpApp({
    staticHandler: async () => null,
    listaTaskDisponibili: () => [],
    elencaCartelleProgetto: () => [],
    sessionRegistry,
    ...cartelle,
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    ...cartelle,
    chiamateLibreria,
    chiamateRicerca,
  };
}

function batch(base, risorsa, corpo, sessionId = SESSIONE) {
  return fetch(`${base}/api/v1/sessions/${encodeURIComponent(sessionId)}/${risorsa}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}

function esitiDi(json) {
  assert.equal(json.ok, true);
  assert.equal(json.data.azione, 'elimina');
  return json.data.esiti;
}

test('FASE3-BATCH-214 — 214 note vengono eliminate con una sola richiesta e 214 esiti ordinati', async (t) => {
  const { base, cartellaNote } = await listen(t);
  const ids = [];
  for (let i = 0; i < 214; i += 1) {
    const nota = await creaNota({ cartella: cartellaNote, title: `Nota ${i}`, content: `Contenuto ${i}`, origine: 'persona' });
    ids.push(nota.id);
  }

  const risposta = await batch(base, 'notes', { azione: 'elimina', ids });
  assert.equal(risposta.status, 200);
  const json = await risposta.json();
  assert.equal(json.data.risorsa, 'notes');
  const esiti = esitiDi(json);
  assert.equal(esiti.length, 214);
  assert.deepEqual(esiti.map((e) => e.id), ids, 'l’ordine della risposta è l’ordine richiesto');
  assert.ok(esiti.every((e) => e.ok === true && e.status === 200));
  assert.deepEqual(json.data.riepilogo, { richiesti: 214, riusciti: 214, falliti: 0 });
  assert.deepEqual(await elencaNote({ cartella: cartellaNote }), [], 'le 214 note sono sparite davvero dal disco');
});

test('FASE3-BATCH-PARZIALE — un 404 individuale non annulla gli altri elementi', async (t) => {
  const { base, chiamateLibreria } = await listen(t);
  const ids = ['lib-1', 'lib-missing', 'lib-2'];
  const risposta = await batch(base, 'library', { azione: 'elimina', ids });
  assert.equal(risposta.status, 200);
  const json = await risposta.json();
  assert.deepEqual(esitiDi(json), [
    { id: 'lib-1', ok: true, status: 200 },
    { id: 'lib-missing', ok: false, status: 404, code: 'LIBRARY_NOT_FOUND' },
    { id: 'lib-2', ok: true, status: 200 },
  ]);
  assert.deepEqual(json.data.riepilogo, { richiesti: 3, riusciti: 2, falliti: 1 });
  assert.deepEqual(chiamateLibreria.map((c) => c.id), ids, 'il fallimento centrale non interrompe il batch');
});

test('FASE3-BATCH-VALIDAZIONE — cap, duplicati, risorsa e azione invalidi falliscono prima di mutare', async (t) => {
  const { base, chiamateLibreria } = await listen(t);
  const casi = [
    ['251 id', 'library', { azione: 'elimina', ids: Array.from({ length: 251 }, (_, i) => `lib-${i}`) }],
    ['duplicati', 'library', { azione: 'elimina', ids: ['lib-1', 'lib-1'] }],
    ['azione', 'library', { azione: 'rinomina', ids: ['lib-1'] }],
    ['projects', 'projects', { azione: 'elimina', ids: ['p-1'] }],
    ['vuoto', 'library', { azione: 'elimina', ids: [] }],
    ['id vuoto', 'library', { azione: 'elimina', ids: [''] }],
  ];
  for (const [nome, risorsa, corpo] of casi) {
    const risposta = await batch(base, risorsa, corpo);
    assert.equal(risposta.status, 400, nome);
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID', nome);
  }
  assert.equal(chiamateLibreria.length, 0, 'nessuna mutazione parte da un batch invalido');

  const troppoGrande = await fetch(`${base}/api/v1/sessions/${SESSIONE}/library/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ azione: 'elimina', ids: ['lib-1'], padding: 'x'.repeat(70 * 1024) }),
  });
  assert.equal(troppoGrande.status, 413);
  assert.equal((await troppoGrande.json()).error.code, 'PAYLOAD_LIMIT');
  assert.equal(chiamateLibreria.length, 0, 'il body oltre 64 KiB viene fermato prima della mutazione');
});

test('FASE3-BATCH-SESSIONE — una sessione assente è 404 e non chiama i mutatori', async (t) => {
  const { base, chiamateLibreria } = await listen(t);
  const risposta = await batch(base, 'library', { azione: 'elimina', ids: ['lib-1'] }, 'sess-assente');
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
  assert.equal(chiamateLibreria.length, 0);
});

test('FASE3-BATCH-RICERCA — not-found e conflict restano esiti individuali e il batch continua', async (t) => {
  const { base, chiamateRicerca } = await listen(t);
  const ids = ['research-1', 'research-missing', 'research-conflict', 'research-2'];
  const risposta = await batch(base, 'research', { azione: 'elimina', ids });
  assert.equal(risposta.status, 200);
  const esiti = esitiDi(await risposta.json());
  assert.deepEqual(esiti, [
    { id: 'research-1', ok: true, status: 200 },
    { id: 'research-missing', ok: false, status: 404, code: 'RESEARCH_NOT_FOUND' },
    { id: 'research-conflict', ok: false, status: 409, code: 'RESEARCH_CONFLICT' },
    { id: 'research-2', ok: true, status: 200 },
  ]);
  assert.deepEqual(chiamateRicerca.map((c) => c.id), ids);
});
