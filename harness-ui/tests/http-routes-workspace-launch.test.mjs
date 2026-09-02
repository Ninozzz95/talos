import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

function error(code, message = code) {
  const value = new Error(message);
  value.code = code;
  return value;
}

function launchStoreFinto() {
  return {
    ultimaCreazione: null,
    create(input) {
      this.ultimaCreazione = input;
      if (input.credential !== 'credenziale-valida') throw error('WORKSPACE_LAUNCH_UNAUTHORIZED');
      if (input.percorso === 'C:/assente') throw error('WORKSPACE_NOT_AVAILABLE');
      return { id: 'A'.repeat(32), nome: 'Progetto Ω', scadeAlle: '2026-09-01T12:02:00.000Z' };
    },
    inspect(id) {
      if (id !== 'A'.repeat(32)) throw error('WORKSPACE_LAUNCH_NOT_AVAILABLE');
      return { id, nome: 'Progetto Ω', scadeAlle: '2026-09-01T12:02:00.000Z' };
    },
  };
}

function registryFinto() {
  return {
    ultima: null,
    avviaLibero(input) { this.ultima = input; return { sessionId: 'sessione-launch' }; },
  };
}

async function listen(t) {
  const workspaceLaunchStore = launchStoreFinto();
  const sessionRegistry = registryFinto();
  const app = createHttpApp({ staticHandler: async () => null, workspaceLaunchStore, sessionRegistry });
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { base: `http://127.0.0.1:${server.address().port}`, workspaceLaunchStore, sessionRegistry };
}

test('OPEN-WITH-TALOS-HTTP-01 — POST autenticata crea una intenzione senza riflettere il percorso', async (t) => {
  const { base, workspaceLaunchStore } = await listen(t);
  const response = await fetch(`${base}/api/v1/workspace-launches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-talos-launcher-token': 'credenziale-valida' },
    body: JSON.stringify({ percorso: 'C:/Progetto Ω' }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.id, 'A'.repeat(32));
  assert.equal(body.data.nome, 'Progetto Ω');
  assert.equal(JSON.stringify(body).includes('C:/Progetto'), false);
  assert.deepEqual(workspaceLaunchStore.ultimaCreazione, { percorso: 'C:/Progetto Ω', credential: 'credenziale-valida' });
});

test('OPEN-WITH-TALOS-HTTP-02 — credenziale errata torna 403 e nessun dettaglio tecnico', async (t) => {
  const { base } = await listen(t);
  const response = await fetch(`${base}/api/v1/workspace-launches`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-talos-launcher-token': 'errata' },
    body: JSON.stringify({ percorso: 'C:/assente' }),
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, 'WORKSPACE_LAUNCH_UNAUTHORIZED');
  assert.doesNotMatch(JSON.stringify(body), /C:\/|stack|token/i);
});

test('OPEN-WITH-TALOS-HTTP-03 — corpo con chiavi extra o percorso non stringa è rifiutato prima dello store', async (t) => {
  const { base, workspaceLaunchStore } = await listen(t);
  for (const body of [{ percorso: 'C:/ok', extra: true }, { percorso: 42 }, {}]) {
    workspaceLaunchStore.ultimaCreazione = null;
    const response = await fetch(`${base}/api/v1/workspace-launches`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-talos-launcher-token': 'credenziale-valida' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'QUERY_INVALID');
    assert.equal(workspaceLaunchStore.ultimaCreazione, null);
  }
});

test('OPEN-WITH-TALOS-HTTP-04 — GET espone soltanto nome e scadenza', async (t) => {
  const { base } = await listen(t);
  const response = await fetch(`${base}/api/v1/workspace-launches/${'A'.repeat(32)}`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { id: 'A'.repeat(32), nome: 'Progetto Ω', scadeAlle: '2026-09-01T12:02:00.000Z' });
});

test('OPEN-WITH-TALOS-HTTP-05 — id assente o scaduto ha una risposta naturale 410', async (t) => {
  const { base } = await listen(t);
  const response = await fetch(`${base}/api/v1/workspace-launches/${'B'.repeat(32)}`);
  assert.equal(response.status, 410);
  const body = await response.json();
  assert.equal(body.error.code, 'WORKSPACE_LAUNCH_NOT_AVAILABLE');
  assert.match(body.error.message, /Apri cartella con TALOS|collegamento/i);
});

test('OPEN-WITH-TALOS-HTTP-06 — workspaceLaunchId è la terza scelta XOR per una sessione custom', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const response = await fetch(`${base}/api/v1/sessions/custom`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceLaunchId: 'A'.repeat(32), consegna: 'controlla il progetto', permessi: 'Workspace write' }),
  });
  assert.equal(response.status, 200);
  assert.equal(sessionRegistry.ultima.workspaceLaunchId, 'A'.repeat(32));
  assert.equal(sessionRegistry.ultima.permessi, 'Workspace write');
  assert.equal('cartellaLibera' in sessionRegistry.ultima, false);
});

test('OPEN-WITH-TALOS-HTTP-07 — launch id insieme a un percorso o id progetto è rifiutato', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  for (const extra of [{ cartellaLibera: 'C:/x' }, { cartellaId: 'default' }]) {
    sessionRegistry.ultima = null;
    const response = await fetch(`${base}/api/v1/sessions/custom`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceLaunchId: 'A'.repeat(32), ...extra, consegna: 'x' }),
    });
    assert.equal(response.status, 400);
    assert.equal(sessionRegistry.ultima, null);
  }
});

