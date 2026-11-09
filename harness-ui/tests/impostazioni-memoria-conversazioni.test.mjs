/* 01/11/2026, «Memoria delle conversazioni»: la scelta sul server e le sue due rotte. */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';
import { GB_DI_SERIE, createImpostazioniMemoriaConversazioni, massimoGb } from '../src/impostazioni-memoria-conversazioni.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const GB = 1024 ** 3;
const file = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-memoria-')); t.after(() => rimuoviCartellaDiProva(c)); return join(c, 'm.json'); };

test('IMC-1 default 8 GB; the maximum from the free disk minus 20 GB, at most 64; a broken file is the default', async (t) => {
  const f = file(t);
  const s = createImpostazioniMemoriaConversazioni({ file: f, discoLibero: () => 50 * GB });
  assert.deepEqual(await s.leggi(), { gb: GB_DI_SERIE, massimo: 30 });
  assert.equal(s.tettoAdesso(), 8 * GB);
  assert.equal(massimoGb(10 * GB), 0, 'under the floor there is no room');
  assert.equal(massimoGb(500 * GB), 64);
  assert.equal(massimoGb(Number.NaN), 64, 'unknown disk: the cap');
  writeFileSync(f, '{ rotto');
  assert.equal(createImpostazioniMemoriaConversazioni({ file: f, avvisa: () => {} }).tettoAdesso(), 8 * GB);
});

test('IMC-2 0 turns it off; a value over the maximum or not whole is refused and nothing changes', async (t) => {
  const s = createImpostazioniMemoriaConversazioni({ file: file(t), discoLibero: () => 30 * GB });
  assert.deepEqual(await s.scrivi({ gb: 0 }), { gb: 0, massimo: 10 });
  assert.equal(s.tettoAdesso(), 0);
  for (const v of [{ gb: 11 }, { gb: -1 }, { gb: 2.5 }, { gb: '8' }, { gb: 8, x: 1 }]) {
    await assert.rejects(s.scrivi(v), (e) => e.code === 'CONVERSATION_MEMORY_SETTINGS_INVALID', JSON.stringify(v));
  }
  assert.equal(s.tettoAdesso(), 0);
  assert.deepEqual(await s.scrivi({ gb: 10 }), { gb: 10, massimo: 10 }, 'the maximum itself is allowed');
});

test('IMC-4 the disk shrank under a saved value: it stays, and anything up to it can still be saved', async (t) => {
  const f = file(t);
  writeFileSync(f, JSON.stringify({ schema: 'talos.conversation-memory-settings.v1', gb: 20 }));
  const s = createImpostazioniMemoriaConversazioni({ file: f, discoLibero: () => 30 * GB });
  assert.deepEqual(await s.leggi(), { gb: 20, massimo: 10 });
  assert.deepEqual(await s.scrivi({ gb: 15 }), { gb: 15, massimo: 10 });
  await assert.rejects(s.scrivi({ gb: 16 }), (e) => e.code === 'CONVERSATION_MEMORY_SETTINGS_INVALID');
});

async function app(t, opzioni) {
  const server = createServer(createHttpApp({ senzaGettone: 'prove', ...opzioni }));
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise((ok) => server.close(ok)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/conversation-memory-settings`;
  return {
    leggi: async () => { const r = await fetch(base); return { stato: r.status, corpo: await r.json() }; },
    salva: async (corpo) => { const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }); return { stato: r.status, corpo: await r.json() }; },
  };
}

test('IMC-3 the routes: GET the value and the maximum; POST saves a valid one; over the maximum is a 400', async (t) => {
  const s = createImpostazioniMemoriaConversazioni({ file: file(t), discoLibero: () => 40 * GB });
  const r = await app(t, { impostazioniMemoriaConversazioni: s });
  assert.deepEqual((await r.leggi()).corpo.data, { gb: 8, massimo: 20 });
  assert.deepEqual((await r.salva({ gb: 12 })).corpo.data, { gb: 12, massimo: 20 });
  assert.equal((await r.salva({ gb: 21 })).stato, 400);
  assert.equal((await r.salva({ gb: 'tanti' })).stato, 400);
  assert.equal(s.tettoAdesso(), 12 * GB);
});
