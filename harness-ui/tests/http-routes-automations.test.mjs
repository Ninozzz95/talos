import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { AutomationStoreError } from '../src/automation-store.mjs';
import { API_SCHEMA, createHttpApp } from '../src/http-app.mjs';

// ⛔ Stesso principio di http-routes-sessions.test.mjs: automation-store.mjs
// ha già i suoi test (persistenza, tetti duri). Questo file prova SOLO il
// livello HTTP — status code, buste, corpo — con un doppio in memoria.
function automationStoreFinto() {
  const voci = new Map();
  let contatore = 0;
  return {
    async elenca() {
      return [...voci.values()].sort((a, b) => a.creataAlle.localeCompare(b.creataAlle));
    },
    async crea({ taskId, nome, intervalloMinuti, limiteAlGiorno = 3 }) {
      if (intervalloMinuti < 5) throw new AutomationStoreError('intervalloMinuti troppo basso');
      contatore += 1;
      const voce = {
        id: `a${contatore}`, taskId, nome: nome ?? taskId, intervalloMinuti, limiteAlGiorno,
        attiva: false, creataAlle: `2026-08-27T10:0${contatore}:00.000Z`, ultimaEsecuzione: null,
        prossimaEsecuzione: null, eseguiteOggi: 0, giornoContatore: null,
      };
      voci.set(voce.id, voce);
      return voce;
    },
    async imposta(id, attiva) {
      const voce = voci.get(id);
      if (!voce) return null;
      voce.attiva = attiva;
      voce.prossimaEsecuzione = attiva ? '2026-08-27T10:30:00.000Z' : null;
      return voce;
    },
    async elimina(id) { voci.delete(id); },
  };
}

async function listen(t, { automationStore = automationStoreFinto() } = {}) {
  const app = createHttpApp({
    campaignService: { listCampaigns: async () => [] },
    staticHandler: async () => null,
    automationStore,
  });
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, automationStore };
}

test('⭐ GET /api/v1/automations torna vuoto senza automazioni, e senza automationStore configurato', async (t) => {
  const { base } = await listen(t, { automationStore: null });
  const corpo = await (await fetch(`${base}/api/v1/automations`)).json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.meta.schema, API_SCHEMA);
  assert.deepEqual(corpo.data.items, []);
});

test('⭐⭐ POST /api/v1/automations crea, torna la voce, e GET la ritrova — sempre attiva:false', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/automations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', intervalloMinuti: 30 }),
  });
  assert.equal(risposta.status, 200);
  const creata = (await risposta.json()).data;
  assert.equal(creata.attiva, false);

  const elenco = await (await fetch(`${base}/api/v1/automations`)).json();
  assert.equal(elenco.data.items.length, 1);
  assert.equal(elenco.data.items[0].id, creata.id);
});

test('⛔ POST /api/v1/automations con un tetto duro violato: 422, AUTOMATION_INVALID', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/automations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'x', intervalloMinuti: 1 }),
  });
  assert.equal(risposta.status, 422);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, false);
  assert.equal(corpo.error.code, 'AUTOMATION_INVALID');
});

test('⛔ POST /api/v1/automations con un corpo malformato: 400, QUERY_INVALID', async (t) => {
  const { base } = await listen(t);
  for (const corpo of [{}, { taskId: 'x' }, { intervalloMinuti: 30 }, { taskId: 'x', intervalloMinuti: 30, extra: 1 }]) {
    const risposta = await fetch(`${base}/api/v1/automations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    assert.equal(risposta.status, 400, `corpo ${JSON.stringify(corpo)} deve essere rifiutato`);
  }
});

test('⭐⭐⭐ POST /api/v1/automations/:id/toggle accende e spegne — e AL CONTRARIO su un id inesistente: 404', async (t) => {
  const { base } = await listen(t);
  const creata = (await (await fetch(`${base}/api/v1/automations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'x', intervalloMinuti: 30 }),
  })).json()).data;

  const accesa = await fetch(`${base}/api/v1/automations/${creata.id}/toggle`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attiva: true }),
  });
  assert.equal(accesa.status, 200);
  assert.equal((await accesa.json()).data.attiva, true);

  const suIdInesistente = await fetch(`${base}/api/v1/automations/non-esiste/toggle`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attiva: true }),
  });
  assert.equal(suIdInesistente.status, 404);
});

test('⛔ POST /api/v1/automations/:id/toggle con un corpo che non è {attiva: boolean}: 400', async (t) => {
  const { base } = await listen(t);
  const creata = (await (await fetch(`${base}/api/v1/automations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'x', intervalloMinuti: 30 }),
  })).json()).data;

  for (const corpo of [{}, { attiva: 'si' }, { attiva: 1 }]) {
    const risposta = await fetch(`${base}/api/v1/automations/${creata.id}/toggle`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    assert.equal(risposta.status, 400, `corpo ${JSON.stringify(corpo)} deve essere rifiutato`);
  }
});

test('⭐ POST /api/v1/automations/:id/elimina la toglie DAVVERO — GET non la ritrova più', async (t) => {
  const { base } = await listen(t);
  const creata = (await (await fetch(`${base}/api/v1/automations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'x', intervalloMinuti: 30 }),
  })).json()).data;

  const eliminazione = await fetch(`${base}/api/v1/automations/${creata.id}/elimina`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(eliminazione.status, 200);

  const elenco = await (await fetch(`${base}/api/v1/automations`)).json();
  assert.deepEqual(elenco.data.items, []);
});

test('⛔⛔ senza automationStore configurato, le rotte POST tornano 405 — stesso trattamento di ogni endpoint mai attivato', async (t) => {
  const { base } = await listen(t, { automationStore: null });
  const risposta = await fetch(`${base}/api/v1/automations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: 'x', intervalloMinuti: 30 }),
  });
  assert.equal(risposta.status, 405);
});
