/*
 * Revisione del Blocco 21: prova del revisore, non parte del prodotto. Stessa scena di R13-2-B, con una sola differenza: `prepare` archivia la richiesta e POI fallisce
 * (profilo del modello non pronto, il caso curato dal Blocco 21 per lo Stop). Il giro va in ripiego, il fornitore rifiuta, ed è «troppo grande». La cura dice al guscio che la
 * richiesta è nell'archivio solo per `capture`: `richiestaNelMotore` resta falso, e il registro riceve una storia senza di lei.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaToken } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs';

const prosa = (n) => 'Answer words. '.repeat(Math.ceil(n / 14)).slice(0, n);
const log = (n) => '2026-10-22 12:00:00 INFO pasted build log line with some words '.repeat(Math.ceil(n / 62)).slice(0, n);
const testoDi = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p?.type === 'text' ? p.text : '')).join('') : '');
const rifiuto = (massimo, chiesti) => new Response(JSON.stringify({ error: { message: `This model's maximum context length is ${massimo} tokens. However, you requested ${chiesti} tokens. Please reduce the length of the messages.` } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
function fornitore(finestraVera) {
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    const n = (corpo.messages ?? []).reduce((k, m) => k + stimaToken(testoDi(m.content)), 0) + compattazione.stimaDegliAttrezzi(corpo.tools);
    if (n > finestraVera) return rifiuto(finestraVera, n);
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: n, completion_tokens: 1 } });
  };
  return { fetchDiRete };
}
const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 131_072, responseReserve: 2048 };

function scena(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-rev21-archivio-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const incollati = join(cartella, '.incollati');
  mkdirSync(incollati, { recursive: true });
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const stato = { profiloRotto: true };
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatore, clock: () => '2026-10-23T18:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:test' } : null), isSessionEnabled: (id) => id === 'chat',
    resolveSessionModel: async () => { if (stato.profiloRotto) throw Object.assign(new Error('The model is not ready.'), { code: 'CTX_RUNTIME_PROFILE_MISMATCH' }); return MODELLO; },
    clock: () => '2026-10-23T18:00:00.000Z' });
  t.after(() => service.close());
  return { cartella, incollati, store, service, stato };
}
async function giro(s, { rete, runId = 'giro-1', messaggiIniziali }) {
  const eventi = []; let esito = null; let errore = null;
  const consegna = [...messaggiIniziali].reverse().find((m) => m.role === 'user').content;
  try {
    esito = await talosLavora({ cartella: s.cartella, task: { consegna }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', cartellaIncollati: s.incollati, fetchDiRete: rete.fetchDiRete, contestoDelProgetto: 'PREAMBOLO',
      contextHooks: await s.service.createKernelHooks({ sessionId: 'chat', runId }), messaggiIniziali, onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione')) eventi.push(e); } });
  } catch (e) { errore = e; }
  return { esito, errore, riallineati: eventi.filter((e) => e.motivo === 'archivio-riallineato') };
}

test('REV21-G — prepare caduto DOPO aver archiviato, poi «troppo grande»: la storia che arriva al registro tiene la richiesta e il giro dopo non mette da parte l\'archivio', async (t) => {
  const s = scena(t);
  const grande = `here is a huge log ${log(120_000)}`;
  const giro1 = [{ role: 'user', content: 'prima domanda' }, { role: 'assistant', content: prosa(2_000) }, { role: 'user', content: grande }];
  const r = await giro(s, { rete: fornitore(11_000), messaggiIniziali: giro1 });
  assert.equal(r.errore?.code, 'REQUEST_TOO_LARGE', `premessa: ${r.errore?.message}`);
  const archiviati = (await s.store.readOriginals({ sessionId: 'chat' })).map((x) => x.message);
  assert.ok(archiviati.some((m) => testoDi(m.content) === grande), 'premessa: la richiesta è nell\'archivio, che è a sola aggiunta');
  const tenuta = r.errore.messaggiDelGiro;
  console.log('REV21-G', JSON.stringify({ archiviataDalMotore: r.errore.archiviataDalMotore ?? null, inStoria: Array.isArray(tenuta) ? tenuta.some((m) => testoDi(m.content) === grande) : null, originali: archiviati.length, storia: tenuta?.length ?? null }));
  s.stato.profiloRotto = false;
  const dopo = await giro(s, { rete: fornitore(200_000), runId: 'giro-2', messaggiIniziali: [...(tenuta ?? giro1.slice(0, -1)), { role: 'user', content: 'domanda corta' }] });
  assert.equal(dopo.errore, null, dopo.errore?.message);
  assert.equal(dopo.riallineati.length, 0, 'CTX_HISTORY_DIVERGED: l\'archivio viene messo da parte e i riassunti si ripagano');
});
