/*
 * Riverifica di c7951bf82 (copiato da non-aspettare-ritentativo-revisione) (16/10/2026): il ritentativo dopo una richiesta mandata senza aspettare.
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


/* Una storia di turni CHIUSI, abbastanza grande da avere qualcosa da riassumere (ma sotto il tetto del legacy, 200K di serie). */
const STORIA = Array.from({ length: 12 }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ` + 'contesto del progetto e dettagli da ricordare. '.repeat(40) },
  { role: 'assistant', content: `Risposta ${i}: ` + 'spiegazione lunga con esempi e passaggi. '.repeat(40) },
]).flat();

test('NON-ASPETTARE-REV-06 — il ripiego dopo «contesto pieno» deve ACCORCIARE la richiesta: rimandarla uguale prende lo stesso rifiuto', async (t) => {
  const s = scena(t);
  const veri = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  let n = 0;
  const ganci = { ...veri, prepare: async (payload) => {
    n += 1;
    if (n === 1) return { ...(await veri.prepare(payload)), sentWithoutWaiting: true };
    if (payload.waitForInFlight === true) throw Object.assign(new Error('Il contesto richiede una compattazione completata.'), { code: 'CTX_COMPACTION_REQUIRED' });
    return veri.prepare(payload);
  } };
  const corpi = [];
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    corpi.push(body);
    if (corpi.length === 1) return new Response(JSON.stringify({ error: { code: 400, message: "This endpoint's maximum context length is 60000 tokens. However, you requested about 61234 tokens." } }), { status: 400, headers: { 'content-type': 'application/json' } });
    // un riassunto chiesto dalla compattazione semplice (nessun attrezzo) riceve un testo; il giro riceve «Fatto.»
    if (!body.tools?.length) return Response.json({ choices: [{ message: { role: 'assistant', content: 'Riassunto: dodici domande sul progetto, risposte date.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 5 } });
  };
  try {
    await talosLavora({ cartella: s.cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
      fetchDiRete, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks: ganci, messaggiIniziali: [...STORIA, { role: 'user', content: 'Elenca la cartella.' }] });
  } catch { /* il giro può finire come vuole: qui conta che cosa è partito */ }
  const delGiro = corpi.filter((c) => c.tools?.length);
  assert.ok(delGiro.length >= 2, `premessa: c'è un secondo tentativo del giro (${delGiro.length})`);
  const peso = (c) => JSON.stringify(c.messages).length;
  assert.ok(peso(delGiro[1]) < peso(delGiro[0]), `il ritentativo è partito UGUALE al primo (${peso(delGiro[1])} contro ${peso(delGiro[0])} caratteri): il ripiego non ha riassunto niente, e il fornitore lo rifiuterebbe di nuovo`);
});
