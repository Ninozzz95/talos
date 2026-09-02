import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { API_SCHEMA, createHttpApp } from '../src/http-app.mjs';

async function listen(t, { diagnosiFn } = {}) {
  const app = createHttpApp({
    staticHandler: async () => null,
    diagnosiFn,
  });
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}` };
}

test('⭐ GET /api/v1/doctor torna DAVVERO quello che diagnosiFn produce, nella busta standard', async (t) => {
  const { base } = await listen(t, {
    diagnosiFn: async () => ({ chiaveApi: true, shell: 'wsl2', git: true, naviga: true }),
  });
  const risposta = await fetch(`${base}/api/v1/doctor`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.meta.schema, API_SCHEMA);
  assert.deepEqual(corpo.data, { chiaveApi: true, shell: 'wsl2', git: true, naviga: true });
});

test('⭐ GET /api/v1/doctor espone lo stato reale delle cartelle senza confonderlo con la copy della modale', async (t) => {
  const { base } = await listen(t, {
    diagnosiFn: async () => ({
      chiaveApi: false,
      shell: 'none',
      git: true,
      naviga: true,
      cartelleProgetto: { disponibili: false, conteggio: 0, dettaglio: 'Nessuna cartella di progetto è stata configurata nell’elenco consentito.' },
    }),
  });
  const risposta = await fetch(`${base}/api/v1/doctor`);
  const corpo = await risposta.json();
  assert.equal(risposta.status, 200);
  assert.equal(corpo.data.cartelleProgetto.disponibili, false);
  assert.equal(corpo.data.cartelleProgetto.conteggio, 0);
  assert.match(corpo.data.cartelleProgetto.dettaglio, /Nessuna cartella/);
});

test('⛔ senza diagnosiFn configurato: 404, REPORT_UNAVAILABLE — mai un "Healthy" inventato', async (t) => {
  const { base } = await listen(t, { diagnosiFn: null });
  const risposta = await fetch(`${base}/api/v1/doctor`);
  assert.equal(risposta.status, 404);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, false);
  assert.equal(corpo.error.code, 'REPORT_UNAVAILABLE');
});

test('GET /api/v1/doctor conferma la workspace predefinita pronta al primo avvio', async (t) => {
  const { base } = await listen(t, {
    diagnosiFn: async () => ({
      chiaveApi: true,
      shell: 'desktop',
      git: true,
      naviga: true,
      cartelleProgetto: { disponibili: true, conteggio: 1, dettaglio: '1 cartella di progetto disponibile.' },
    }),
  });
  const risposta = await fetch(`${base}/api/v1/doctor`);
  const corpo = await risposta.json();
  assert.equal(risposta.status, 200);
  assert.equal(corpo.data.cartelleProgetto.disponibili, true);
  assert.equal(corpo.data.cartelleProgetto.conteggio, 1);
  assert.match(corpo.data.cartelleProgetto.dettaglio, /disponibile/);
});
