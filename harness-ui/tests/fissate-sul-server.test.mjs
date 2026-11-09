/*
 * Decisione 69 dell'owner (03/11/2026, dopo la ricerca: ChatGPT e Claude.ai tengono le chat fissate sul server). Forma con l'OK di CLI e Mobile:
 * `Downloads/TALOS/desktop/in-corso/FORMA-FISSATE-SUL-SERVER-2026-11-03.md`. La stella sta nella sessione, sopravvive al riavvio, si vede
 * nell'elenco e si mette dalla rotta e dal telefono (operazione remota `session.pin`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { OPERAZIONI_HTTP } from '../src/remoto/operazioni.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function runtimeFermo() {
  return { avviaSessioneFn(input) { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); } };
}
function registro(cartellaStore) {
  return createSessionRegistry({ cartellaStore, avviaSessioneFn: runtimeFermo().avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
}
const voceDi = (r, id) => r.elenca().find((v) => v.sessionId === id);

test('FISS-01 la stella si mette e si toglie, si vede nell elenco e sopravvive al riavvio; AL CONTRARIO di serie non c è', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-fissate-'));
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const r = registro(cartellaStore);
  const { sessionId } = r.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  assert.equal(voceDi(r, sessionId).fissata, false, 'di serie non è fissata');
  assert.deepEqual(await r.fissa(sessionId, true), { ok: true, fissata: true });
  assert.equal(voceDi(r, sessionId).fissata, true);
  await r.chiudi?.(); await attendiScritture({ cartellaStore });
  const riaperto = registro(cartellaStore);
  await riaperto.ripristina();
  assert.equal(voceDi(riaperto, sessionId)?.fissata, true, 'dopo il riavvio è ancora fissata');
  assert.deepEqual(await riaperto.fissa(sessionId, false), { ok: true, fissata: false });
  await riaperto.chiudi?.(); await attendiScritture({ cartellaStore });
  const terzo = registro(cartellaStore);
  await terzo.ripristina();
  assert.equal(voceDi(terzo, sessionId)?.fissata, false, 'tolta, resta tolta dopo il riavvio: vince l ultima riga');
  await terzo.chiudi?.(); await attendiScritture({ cartellaStore });
});

test('FISS-02 la rotta: fissa, togli, sessione che non c è, corpo sbagliato; e il telefono ha la sua operazione', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-fissate-http-'));
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const r = registro(cartellaStore);
  t.after(async () => { await r.chiudi?.(); await attendiScritture({ cartellaStore }); });
  const { sessionId } = r.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: r }));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => server.close(ok)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const pin = (id, corpo) => fetch(`${base}/api/v1/sessions/${encodeURIComponent(id)}/pin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  let res = await pin(sessionId, { fissata: true });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.fissata, true);
  assert.equal(voceDi(r, sessionId).fissata, true);
  res = await pin(sessionId, { fissata: false });
  assert.equal((await res.json()).data.fissata, false);
  assert.equal((await pin('non-esiste', { fissata: true })).status, 404);
  assert.equal((await pin(sessionId, { fissata: 'sì' })).status, 400);
  assert.equal(voceDi(r, sessionId).fissata, false, 'un corpo sbagliato non cambia niente');
  assert.equal(OPERAZIONI_HTTP['session.pin']?.percorso({ sessionId: 'abc' }), '/api/v1/sessions/abc/pin', 'il telefono collegato può fissare (ritocco del Mobile)');
});
