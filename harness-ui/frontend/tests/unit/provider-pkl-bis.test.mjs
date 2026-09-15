import test from 'node:test';
import assert from 'node:assert/strict';
import * as scheda from '../../src/components/provider-card.js';

const campi = valori => ({ querySelector: s => s in valori ? { value: valori[s] } : null });
test('PKLB-UI-STATO: la sonda agente dichiara il collegamento, senza chiamarlo catalogo modelli', () => {
  assert.equal(scheda.statoProvider({ id: 'esterno', agente: {} }, { esito: 'collegato', modelli: 1 }).prova, 'Agente raggiunto');
});
test('PKLB-UI-01: salvataggio cloud include modelli e conserva i nomi assegnati', () => {
  assert.equal(typeof scheda.leggiCollegamentoProvider, 'function');
  const r = scheda.leggiCollegamentoProvider({ id: 'azure', modelli: [{ id: 'lavoro', nome: 'Uso quotidiano' }] }, campi({
    '[data-provider-endpoint]': 'https://esempio.test/openai/v1', '[data-provider-timeout]': '35', '[data-provider-modelli]': 'lavoro\n\nsecondo\n',
  }));
  assert.deepEqual(r, { endpoint: 'https://esempio.test/openai/v1', timeoutSeconds: 35, modelli: [{ id: 'lavoro', nome: 'Uso quotidiano' }, { id: 'secondo' }] });
  assert.deepEqual(scheda.leggiCollegamentoProvider({ id: 'azure' }, campi({ '[data-provider-endpoint]': '', '[data-provider-modelli]': '' })).modelli, []);
});
test('PKLB-UI-02: agente invia soltanto comando, argomenti, cartella, nomi ambiente e timeout', () => {
  assert.equal(typeof scheda.leggiCollegamentoProvider, 'function');
  assert.deepEqual(scheda.leggiCollegamentoProvider({ id: 'esterno' }, campi({ '[data-provider-comando]': 'C:\\agenti\\node.exe', '[data-provider-argomenti]': 'C:\\agenti\\ponte.mjs\n--italiano', '[data-provider-cwd]': 'C:\\progetto', '[data-provider-variabili]': 'ACCESSO_AGENTE\n', '[data-provider-tempo-agente]': '180' })), {
    agente: { comando: 'C:\\agenti\\node.exe', argomenti: ['C:\\agenti\\ponte.mjs', '--italiano'], cwd: 'C:\\progetto', variabiliAmbiente: ['ACCESSO_AGENTE'], timeoutMs: 180000 },
  });
  assert.equal('modelli' in scheda.leggiCollegamentoProvider({ id: 'openai' }, campi({})), false);
});
test('PKLB-UI-03: Salva collegamento usa rotta e corpo reali, errori non annunciati come successo', async () => {
  assert.equal(typeof scheda.salvaCollegamentoProvider, 'function');
  const richieste = [], c = campi({ '[data-provider-endpoint]': 'https://esempio.test/openai/v1', '[data-provider-timeout]': '35', '[data-provider-modelli]': 'lavoro' });
  const row = { id: 'azure' };
  const r = await scheda.salvaCollegamentoProvider(row, c, { baseUrl: 'http://127.0.0.1:9999', fetchImpl: async (url, op) => { richieste.push([url, op]); return Response.json({ ok: true, data: { provider: 'azure' } }); } });
  assert.equal(r.provider, 'azure'); assert.equal(richieste.length, 1);
  assert.equal(richieste[0][0], 'http://127.0.0.1:9999/api/v1/providers/azure/runtime');
  assert.equal(richieste[0][1].method, 'POST'); assert.equal(richieste[0][1].credentials, 'same-origin');
  assert.deepEqual(JSON.parse(richieste[0][1].body).modelli, [{ id: 'lavoro' }]);
  for (const fetchImpl of [async () => new Response('errore'), async () => Response.json({ ok: false }, { status: 422 }), async () => { throw new Error('connessione'); }]) {
    await assert.rejects(scheda.salvaCollegamentoProvider(row, c, { fetchImpl }));
  }
});
