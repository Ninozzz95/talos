/*
 * B1 (owner 21/10/2026 sera; contratto riga viva §3 e §5): «Skip the summary» dal registro vero e dalla rotta HTTP, e l'esito che
 * arriva intero al giornale (`ripiego`, `ragione`, `classe`; sul fallimento `classe` e `fallimentiConsecutivi` — D5 b della CLI).
 * Registro VERO e `avviaSessione` VERO; al posto del kernel una spia che fa ciò che fa l'adattatore.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';

const createSessionRegistry = (opzioni) => createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, ...opzioni });
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: process.cwd(), comandoProva: null, task: { id: taskId, consegna: 'c' } };
}
const attendi = async (cond, ms = 10_000) => { const fine = Date.now() + ms; while (!cond() && Date.now() < fine) await new Promise((r) => { setTimeout(r, 10); }); return cond(); };
const RECORD = { schema: 'talos.compattazione.v1', coveredThrough: 3, riassunto: [], tokenPrima: 31_204, tokenDopo: 9_880, at: '2026-10-21T20:00:00.000Z', modello: 'z-ai/glm-5.3-flash' };

/** Registro vero; la spia annuncia un riassunto atteso, aspetta lo Skip, chiude con l'esito che darebbe l'adattatore. */
function registroConSpia() {
  const stato = { input: null, saltato: false, rilascia: null };
  const registro = createSessionRegistry({
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: async (ri) => {
      stato.input = ri;
      await new Promise((r) => { stato.rilascia = r; });
      ri.onGiro?.({ giro: 0, tipo: 'compattazione-inizio', tokenMisurati: 31_204, soglia: 3_000, motivo: 'soglia' });
      await new Promise((r) => { if (ri.segnaleSaltaRiassunto?.aborted) r(); else ri.segnaleSaltaRiassunto?.addEventListener('abort', r, { once: true }); });
      stato.saltato = ri.segnaleSaltaRiassunto?.aborted === true;
      ri.onGiro?.({ giro: 0, tipo: 'compattazione-fine', compattato: true, record: RECORD, ripiego: true, classe: 'saltato', ragione: 'saltato' });
      ri.onGiro?.({ giro: 1, tipo: 'compattazione-fine', compattato: false, motivo: 'errore', classe: 'rete', fallimentiConsecutivi: 2, interrottaIn: 'riassunto' });
      return { comeFinita: 'concluso', messaggiFinali: [] };
    } }),
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
  });
  return { registro, stato };
}

test('SKIP-01 dal registro: prima del riassunto atteso non arma niente; durante lo salta; l\'esito arriva intero al giornale', async () => {
  const { registro, stato } = registroConSpia();
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => stato.input), 'il giro è partito');
  assert.ok(stato.input.segnaleSaltaRiassunto instanceof AbortSignal, 'il registro dà al giro un segnale di Skip');
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: false }, 'nessun riassunto atteso: lo Skip non si arma per dopo');
  assert.equal(stato.input.segnaleSaltaRiassunto.aborted, false);
  stato.rilascia();
  assert.ok(await attendi(() => registro.esporta(sessionId)?.eventi?.some((e) => e.name === 'talos.compattazione' && e.value?.fase === 'inizio')));
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: true });
  assert.ok(await attendi(() => stato.saltato));
  assert.ok(await attendi(() => registro.esporta(sessionId)?.eventi?.some((e) => e.type === 'RunFinished' || e.type === 'RunError')));
  const fini = registro.esporta(sessionId).eventi.filter((e) => e.name === 'talos.compattazione' && e.value?.fase === 'fine').map((e) => e.value);
  assert.equal(fini[0].ripiego, true); assert.equal(fini[0].ragione, 'saltato'); assert.equal(fini[0].classe, 'saltato');
  assert.equal(fini[1].classe, 'rete'); assert.equal(fini[1].fallimentiConsecutivi, 2);
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: false }, 'a giro finito non c\'è niente da saltare');
  assert.equal(registro.saltaRiassunto('non-esiste').code, 'NOT_FOUND');
});

test('SKIP-02 la rotta: POST con gettone, 200 {saltato}, GET 405, sessione ignota 404, query 400', async (t) => {
  const chiamate = [];
  const app = createHttpApp({
    staticHandler: async () => null, token: 'token-di-prova',
    sessionRegistry: { saltaRiassunto: (id) => { chiamate.push(id); return id === 's1' ? { saltato: true } : { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' }; } },
  });
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const origine = `http://127.0.0.1:${server.address().port}`;
  const base = `${origine}/api/v1/sessions`;
  const headers = { cookie: 'talos_token=token-di-prova', origin: origine, 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/s1/compaction/skip`, { method: 'POST', headers: { origin: origine } })).status, 401);
  const ok = await fetch(`${base}/s1/compaction/skip`, { method: 'POST', headers, body: '{}' });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data, { saltato: true });
  assert.equal((await fetch(`${base}/s1/compaction/skip`, { headers })).status, 405);
  assert.equal((await fetch(`${base}/zz/compaction/skip`, { method: 'POST', headers, body: '{}' })).status, 404);
  assert.equal((await fetch(`${base}/s1/compaction/skip?x=1`, { method: 'POST', headers, body: '{}' })).status, 400);
  assert.deepEqual(chiamate, ['s1', 'zz']);
});
