/*
 * F3, onda 2 di F2 (24/09/2026) — lo spegnimento GENTILE del 4174 (decisione 8): `registro.chiudi()` = fence +
 * flush, e la rotta amministrativa `POST /api/v1/admin/shutdown` col gettone, 401 senza e NIENTE spegnimento.
 * Ermetico: server su porta effimera di loopback, negozio in TEMP privata. Mai il 4174.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function createSessionRegistry(opzioni) {
  return createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, ...opzioni });
}
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function sessioneControllabile() {
  let risolviAttesa;
  const attesa = new Promise((risolvi) => { risolviAttesa = risolvi; });
  let onEventoCatturato = null;
  return {
    avviaSessioneFn: async (input) => { onEventoCatturato = input.onEvento; input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return attesa; },
    concludi(eventoFinale, risultato = { ok: true }) { onEventoCatturato(eventoFinale); risolviAttesa(risultato); },
    emetti(evento) { onEventoCatturato(evento); },
  };
}

test('CTX-REG-SHUTDOWN-FLUSHES — una scrittura in coda allo shutdown è su disco quando chiudi() torna, e dopo il registro rifiuta', async () => {
  const cartellaStore = cartellaDiProva('talos-f3-spegnimento-');
  const finta = sessioneControllabile();
  try {
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
    const { sessionId } = registro.avvia('task-vero');
    for (let i = 0; i < 20; i += 1) finta.emetti({ type: 'TextMessageContent', messageId: 'm1', delta: `pezzo ${i} ` + 'x'.repeat(2_000) });
    finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'r' }], recordDiCompattazione: [] } });
    assert.equal(typeof registro.chiudi, 'function', 'il registro espone chiudi()');
    const esito = await registro.chiudi({ attesaMassimaMs: 10_000 });
    assert.equal(esito.scaduta, false);
    const righe = readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((r) => JSON.parse(r));
    assert.equal(righe.filter((r) => r.type === 'TextMessageContent').length, 20, 'tutti i delta sono su disco');
    assert.ok(righe.some((r) => r.type === 'RunFinished'));
    // 24/09/2026 (F2-bis B): la storia di fine giro è `messaggi-finali` prima, `messaggi-delta`/`checkpoint` con `fase:'finale'` col journal a delta
    assert.ok(righe.some((r) => r.tipo === 'messaggi-finali' || (['messaggi-delta', 'checkpoint'].includes(r.tipo) && r.fase === 'finale')), 'la storia finale è su disco');
    /* Il fence: dopo chiudi() niente scritture nuove, con un errore chiaro. */
    assert.equal(registro.avvia('task-vero').code, 'SERVER_SHUTTING_DOWN');
    assert.equal(registro.resume(sessionId, 'ancora').code, 'SERVER_SHUTTING_DOWN');
    assert.equal(registro.accodaMessaggio(sessionId, 'x').code, 'SERVER_SHUTTING_DOWN');
    const seconda = await registro.chiudi();
    assert.equal(seconda.scaduta, false, 'chiudi() è idempotente');
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

async function listen(t, opzioni) {
  const app = createHttpApp({ staticHandler: async () => null, listaTaskDisponibili: () => [], ...opzioni });
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

test('ADMIN-SHUTDOWN-REQUIRES-TOKEN — senza gettone 401 e NESSUNO spegnimento; col gettone giusto 202 e lo spegnimento parte una volta', async (t) => {
  let spegnimenti = 0;
  const base = await listen(t, { spegnimento: { gettone: 'gettone-di-prova-0123456789', spegniFn: () => { spegnimenti += 1; } } });
  const senza = await fetch(`${base}/api/v1/admin/shutdown`, { method: 'POST' });
  assert.equal(senza.status, 401);
  assert.equal((await senza.json()).error.code, 'AUTH_REQUIRED');
  const sbagliato = await fetch(`${base}/api/v1/admin/shutdown`, { method: 'POST', headers: { 'x-talos-shutdown-token': 'gettone-sbagliato-0123456789' } });
  assert.equal(sbagliato.status, 401);
  const get = await fetch(`${base}/api/v1/admin/shutdown`, { method: 'GET', headers: { 'x-talos-shutdown-token': 'gettone-di-prova-0123456789' } });
  assert.equal(get.status, 405, 'solo POST: gli altri metodi li respinge l’inventario');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(spegnimenti, 0, 'nessuno spegnimento senza gettone');
  const giusto = await fetch(`${base}/api/v1/admin/shutdown`, { method: 'POST', headers: { 'x-talos-shutdown-token': 'gettone-di-prova-0123456789' } });
  assert.equal(giusto.status, 202);
  assert.deepEqual((await giusto.json()).data, { spegnimento: 'avviato' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(spegnimenti, 1);
});

test('ADMIN-SHUTDOWN-NOT-CONFIGURED — senza configurazione la rotta risponde 405 come ogni endpoint mai attivato, anche col gettone, e non spegne', async (t) => {
  /* Convenzione di casa (http-inventario-rotte): una rotta dell'inventario senza il suo servizio dice 405, non 404. */
  const base = await listen(t, {});
  const r = await fetch(`${base}/api/v1/admin/shutdown`, { method: 'POST', headers: { 'x-talos-shutdown-token': 'qualcosa' } });
  assert.equal(r.status, 405);
  assert.equal((await r.json()).error.code, 'METHOD_NOT_ALLOWED');
});
