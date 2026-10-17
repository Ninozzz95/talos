/*
 * Riverifica della cura 56fd92f4f (16/10/2026): il ritentativo dopo una richiesta mandata senza aspettare.
 * REV-03: se la SECONDA preparazione fallisce (il riassunto in volo, aspettato, non va in porto: `CTX_COMPACTION_REQUIRED`), il giro
 *   muore con l'errore del MOTORE — non con il «contesto pieno» del fornitore, e senza il ripiego sulla compattazione semplice che
 *   la prima preparazione avrebbe avuto (owner 12/10: un errore di compattazione non ferma mai la chat).
 * REV-04: uno Stop durante la seconda preparazione resta uno Stop: nessuna seconda richiesta.
 * Stessa scena di `non-aspettare-overflow-revisione.test.mjs` (copiata).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };

function scena(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ritentativo-motore-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatore, clock: () => '2026-10-16T08:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test' } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => MODELLO, clock: () => '2026-10-16T08:00:00.000Z' });
  t.after(() => service.close());
  return { cartella, service };
}

function fornitoreCheRifiutaUnaVolta() {
  const corpi = [];
  const fetchDiRete = async (_url, init) => {
    corpi.push(JSON.parse(init.body));
    if (corpi.length === 1) return new Response(JSON.stringify({ error: { code: 400, message: "This endpoint's maximum context length is 60000 tokens. However, you requested about 61234 tokens." } }), { status: 400, headers: { 'content-type': 'application/json' } });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 5 } });
  };
  return { fetchDiRete, corpi };
}

async function giro(cartella, contextHooks, resto = {}) {
  const fornitore = fornitoreCheRifiutaUnaVolta();
  let esito = null; let errore = null;
  try {
    esito = await talosLavora({ cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
      fetchDiRete: fornitore.fetchDiRete, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks, ...resto });
  } catch (e) { errore = e; }
  return { esito, errore, fornitore };
}

test('NON-ASPETTARE-REV-03 — la seconda preparazione che fallisce non trasforma il «contesto pieno» in un errore del motore', async (t) => {
  const s = scena(t);
  const veri = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  let n = 0;
  const ganci = { ...veri, prepare: async (payload) => {
    n += 1;
    if (n === 1) return { ...(await veri.prepare(payload)), sentWithoutWaiting: true };
    if (payload.waitForInFlight === true) throw Object.assign(new Error('Il contesto richiede una compattazione completata.'), { code: 'CTX_COMPACTION_REQUIRED' });
    return veri.prepare(payload);
  } };
  const { esito, errore, fornitore } = await giro(s.cartella, ganci);
  const finito = errore ?? esito;
  const codice = errore?.code ?? errore?.cause?.code ?? null;
  assert.ok(fornitore.corpi.length >= 2 || errore?.classificazione === 'contesto-pieno',
    `il giro è morto con l'errore del motore (${codice ?? errore?.message ?? finito?.comeFinita}): né ripiego e ritentativo, né il «contesto pieno» del fornitore`);
});

test('NON-ASPETTARE-REV-04 — uno Stop durante la seconda preparazione resta uno Stop: nessuna seconda richiesta', async (t) => {
  const s = scena(t);
  const veri = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const stop = new AbortController();
  let n = 0;
  const ganci = { ...veri, prepare: async (payload) => {
    n += 1;
    if (n === 1) return { ...(await veri.prepare(payload)), sentWithoutWaiting: true };
    stop.abort();
    throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  } };
  const { esito, errore, fornitore } = await giro(s.cartella, ganci, { segnaleStop: stop.signal });
  assert.equal(fornitore.corpi.length, 1, 'dopo lo Stop non parte niente');
  assert.ok(errore || esito?.comeFinita !== 'concluso', 'uno Stop resta uno Stop');
});
