/*
 * P018 (judge proposal, owner 11/11/2026 12:18 «Sì, tutte e due, prima del resto»): a tool of an MCP connector ran WITHOUT the
 * permission gate. The MCP branch of the kernel called `chiamaToolMcpFn` directly, while every other tool that changes something
 * passes through `verificaPermessoConBarriera`. These tests say what the gate must do for an MCP tool:
 * - default («Workspace write»): a card the first time; «On request»: a card; «Read only»: refused like any tool that can write;
 *   «Full access»: like the other tools, no card.
 * - «allow for this tool in this conversation»: keyed on (server, tool). The same tool of the same server does not ask again,
 *   another tool of the same server asks, the same tool name on another server asks.
 * - trifecta: an MCP tool brings in untrusted content and can send data out; with private data already seen the remembered yes
 *   is not enough, like a per-tool «always».
 * - a server annotation (`readOnlyHint`) never removes the card by itself: the server is not trusted for its hints (MCP spec).
 * The server side: the remembered yes comes from the QUESTION (never from the client), and goes down to the children.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as K from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { talosLavora } = K;
/* the key the kernel and the server agree on; the format is checked once below */
const chiave = (server, attrezzo) => JSON.stringify([server, attrezzo]);

const TOOL_MCP = [
  { name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } },
  { name: 'mcp__github__list_issues', serverId: 'github', nomeOriginale: 'list_issues', description: 'lists issues', inputSchema: { type: 'object', properties: {} } },
  { name: 'mcp__gitlab__create_issue', serverId: 'gitlab', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } },
];
const FINE = { role: 'assistant', content: 'done', tool_calls: [] };
const chiama = (id, nome, argomenti = {}) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'p018-mcp-'));
  t.after(() => { try { rimuoviCartellaDiProva(c); } catch { /* already gone */ } });
  return c;
}

/** One turn: the fake model makes the calls in order, then ends. `ospite(azione)` answers every card; `null` = no channel. */
async function giro(t, { chiamate, ospite = async () => true, toolMcp = TOOL_MCP, ...altro }) {
  const dir = cartella(t);
  const risposte = [...chiamate.map(([id, nome, argomenti]) => chiama(id, nome, argomenti)), FINE];
  const corpi = [], chieste = [], chiamateMcp = [];
  await talosLavora({
    cartella: dir, task: { consegna: 'work' }, modello: 'x', chiave: 'finta', toolMcp,
    chiamaToolMcpFn: async (nome, argomenti) => { chiamateMcp.push(nome); return { content: [{ type: 'text', text: `ok from ${nome}` }], isError: false }; },
    ...(ospite === null ? {} : { chiediApprovazioneFn: async (a) => { chieste.push(a); return ospite(a); } }),
    fetchDiRete: async (_u, o) => {
      const scelta = risposte[Math.min(corpi.length, risposte.length - 1)];
      corpi.push(JSON.parse(o.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
    },
    ...altro,
  });
  const esiti = corpi.at(-1).messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
  const carteMcp = chieste.filter((a) => a.tipo === 'mcp_tool');
  return { dir, chieste, carteMcp, esiti, chiamateMcp };
}

test('P018-00: the key of «allow this tool» is (server, tool), the same string for kernel and server', () => {
  assert.equal(typeof K.chiaveAttrezzoMcp, 'function', 'the kernel exports the key');
  assert.equal(K.chiaveAttrezzoMcp('github', 'create_issue'), chiave('github', 'create_issue'));
  /* a server named «a__b» and a tool «c» are not the server «a» with the tool «b__c» */
  assert.notEqual(K.chiaveAttrezzoMcp('a__b', 'c'), K.chiaveAttrezzoMcp('a', 'b__c'));
});

test('P018-01: default («Workspace write»): the first use of an MCP tool brings a card that names server and tool; a no means it never runs', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', ospite: async () => false, chiamate: [['c1', 'mcp__github__create_issue', { title: 'x' }]] });
  assert.equal(r.carteMcp.length, 1, JSON.stringify(r.chieste));
  const carta = r.carteMcp[0];
  assert.equal(carta.server, 'github');
  assert.equal(carta.attrezzo, 'create_issue');
  assert.equal(carta.toolCallId, 'c1');
  assert.equal(carta.fraseChiave, 'server.approval.mcpTool');
  assert.match(carta.frase, /create_issue/u);
  assert.match(carta.frase, /github/u);
  assert.deepEqual(r.chiamateMcp, [], 'after the no the server is never called');
  assert.match(r.esiti[0], /^(REFUSED|DECLINED)/u);
  assert.match(r.esiti[0], /github/u, 'the model is told which server and tool');
});

test('P018-02: default with a yes: the tool runs once the person said yes', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', chiamate: [['c1', 'mcp__github__create_issue', { title: 'x' }]] });
  assert.equal(r.carteMcp.length, 1);
  assert.deepEqual(r.chiamateMcp, ['mcp__github__create_issue']);
});

test('P018-03: «On request»: a card', async (t) => {
  const r = await giro(t, { livelloAccesso: 'su-richiesta', ospite: async () => false, chiamate: [['c1', 'mcp__github__list_issues']] });
  assert.equal(r.carteMcp.length, 1);
  assert.deepEqual(r.chiamateMcp, []);
});

/* P018 round 2 (owner 11/11/2026 13:08, «Carta di permesso», NON il rifiuto): «Read only» asks with a card «only once» */
test('P018-04: «Read only»: a card «only once» instead of the refusal — even with a remembered yes; a no means nothing is called', async (t) => {
  for (const consensiSessione of [undefined, { attrezziMcpConsentiti: [chiave('github', 'list_issues')] }]) {
    const r = await giro(t, { livelloAccesso: 'lettura', ospite: async () => false, ...(consensiSessione ? { consensiSessione } : {}), chiamate: [['c1', 'mcp__github__list_issues']] });
    assert.deepEqual(r.carteMcp.map((a) => [a.attrezzo, a.soloUnaVolta]), [['list_issues', true]]);
    assert.deepEqual(r.chiamateMcp, []);
    assert.match(r.esiti[0], /^(REFUSED|DECLINED)/u);
  }
});

test('P018-05: «Full access»: like the other tools, no card', async (t) => {
  const r = await giro(t, { livelloAccesso: 'accesso-pieno', chiamate: [['c1', 'mcp__github__create_issue', { title: 'x' }]] });
  assert.deepEqual(r.chieste, []);
  assert.deepEqual(r.chiamateMcp, ['mcp__github__create_issue']);
});

test('P018-06: Plan mode refuses an MCP tool like a command, no card', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', modalitaOperativa: 'piano', chiamate: [['c1', 'mcp__github__create_issue', { title: 'x' }]] });
  assert.deepEqual(r.chieste, []);
  assert.deepEqual(r.chiamateMcp, []);
});

test('P018-07: «allow this tool in this conversation» is per (server, tool): same tool silent, other tool asks, same name on another server asks', async (t) => {
  for (const livelloAccesso of ['scrittura-progetto', 'su-richiesta']) {
    const r = await giro(t, {
      livelloAccesso, consensiSessione: { attrezziMcpConsentiti: [chiave('github', 'create_issue')] },
      chiamate: [
        ['c1', 'mcp__github__create_issue', { title: 'a' }],
        ['c2', 'mcp__github__create_issue', { title: 'b' }],
        ['c3', 'mcp__github__list_issues'],
        ['c4', 'mcp__gitlab__create_issue', { title: 'c' }],
      ],
    });
    assert.deepEqual(r.carteMcp.map((a) => [a.server, a.attrezzo]), [['github', 'list_issues'], ['gitlab', 'create_issue']], livelloAccesso);
    assert.equal(r.chiamateMcp.length, 4, livelloAccesso);
  }
});

test('P018-08: no channel to ask (an automation nobody follows): the MCP tool is refused, never run in silence', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', ospite: null, chiamate: [['c1', 'mcp__github__create_issue', { title: 'x' }]] });
  assert.deepEqual(r.chiamateMcp, []);
  assert.match(r.esiti[0], /^REFUSED/u);
});

test('P018-09: trifecta. An MCP tool brings untrusted content and can send out: after private data, the remembered yes asks again', async (t) => {
  const sicurezza = K.SICUREZZA_PER_ATTREZZO.mcp_tool;
  assert.ok(sicurezza, 'the MCP tool is in the security catalog');
  assert.equal(sicurezza.readsUntrustedContent, true);
  assert.equal(sicurezza.canTransmit, true);
  /* the same tool twice, nothing private in between: one remembered yes, no card (1 card per tool) */
  const pulito = await giro(t, {
    livelloAccesso: 'scrittura-progetto', consensiSessione: { attrezziMcpConsentiti: [chiave('github', 'create_issue')] },
    chiamate: [['c1', 'mcp__github__create_issue', { title: 'a' }], ['c2', 'mcp__github__create_issue', { title: 'b' }]],
  });
  assert.deepEqual(pulito.chieste, []);
  /* a write inside the project (private data seen), then the tool, then the tool again: the third call closes the trifecta */
  const chiusa = await giro(t, {
    livelloAccesso: 'scrittura-progetto', consensiSessione: { attrezziMcpConsentiti: [chiave('github', 'create_issue')] },
    chiamate: [['w1', 'scrivi', { percorso: 'note.txt', contenuto: 'privato' }], ['c1', 'mcp__github__create_issue', { title: 'a' }], ['c2', 'mcp__github__create_issue', { title: 'b' }]],
  });
  assert.deepEqual(chiusa.carteMcp.map((a) => [a.toolCallId, a.trifecta === true]), [['c2', true]]);
});

test('P018-10: a server annotation never removes the card: readOnlyHint true still asks the first time', async (t) => {
  const conSuggerimento = TOOL_MCP.map((x) => ({ ...x, annotations: { readOnlyHint: true, destructiveHint: false } }));
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', toolMcp: conSuggerimento, ospite: async () => false, chiamate: [['c1', 'mcp__github__list_issues']] });
  assert.equal(r.carteMcp.length, 1);
  assert.deepEqual(r.chiamateMcp, []);
});

test('P018-11: a host that does not say the server (old toolMcp, name only) still gets a card keyed on the exposed name', async (t) => {
  const vecchio = [{ name: 'mcp__meteo__forecast', description: 'meteo', inputSchema: { type: 'object', properties: {} } }];
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', toolMcp: vecchio, ospite: async () => false, chiamate: [['c1', 'mcp__meteo__forecast']] });
  assert.equal(r.carteMcp.length, 1);
  assert.equal(r.carteMcp[0].server, 'meteo');
  assert.equal(r.carteMcp[0].attrezzo, 'forecast');
  assert.deepEqual(r.chiamateMcp, []);
});

test('P018-12: an old name with «__» inside the tool reads the server up to the FIRST «__», as the chat names it', async (t) => {
  const vecchio = [{ name: 'mcp__meteo__forecast__v2', description: 'meteo', inputSchema: { type: 'object', properties: {} } }];
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', toolMcp: vecchio, ospite: async () => false, chiamate: [['c1', 'mcp__meteo__forecast__v2']] });
  assert.deepEqual(r.carteMcp.map((a) => [a.server, a.attrezzo]), [['meteo', 'forecast__v2']]);
});

test('P018-13: a rule the host passes for mcp_tool stays sovereign: «nega» refuses without a card, even with a remembered yes', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { mcp_tool: 'nega' },
    consensiSessione: { attrezziMcpConsentiti: [chiave('github', 'create_issue')] }, chiamate: [['c1', 'mcp__github__create_issue', { title: 'x' }]],
  });
  assert.deepEqual(r.chieste, []);
  assert.deepEqual(r.chiamateMcp, []);
  assert.match(r.esiti[0], /^REFUSED/u);
});

/* ── the server: «for this tool» on an MCP card ─────────────────────────────────────────────────────────────────────────── */

async function scena(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'p018-server-'));
  const runs = [];
  const registro = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
    avviaSessioneFn(input) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      runs.push({ input, resolve });
      input.onEvento({ type: 'RunStarted', threadId: `t${runs.length}`, runId: `r${runs.length}` });
      return promise;
    },
  });
  t.after(async () => {
    for (const [i, run] of runs.entries()) {
      try {
        run.input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` });
        run.resolve({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } });
      } catch { /* already closed */ }
    }
    await registro.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* cleanup anyway */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  return { registro, runs, sessionId, ricevuti, input: runs[0].input };
}
async function domanda(registro, id, input, azione) {
  const promessa = input.chiediApprovazioneFn(azione);
  await new Promise((r) => setTimeout(r, 10));
  const requestId = registro.domandaInAttesa(id)?.requestId;
  assert.ok(requestId, `premise: ${id} has an open question`);
  return { promessa, requestId };
}
const CARTA_MCP = { tipo: 'mcp_tool', toolCallId: 'c1', nome: 'mcp__github__create_issue', server: 'github', attrezzo: 'create_issue' };
const consentitiMcp = (input) => [...(input.consensiSessione?.attrezziMcpConsentiti ?? [])];

test('P018-20: «for this tool» on an MCP card remembers (server, tool) from the QUESTION, and the event carries the scope', async (t) => {
  const s = await scena(t);
  const { promessa, requestId } = await domanda(s.registro, s.sessionId, s.input, CARTA_MCP);
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, requestId, true, { ambito: 'strumento', nome: 'mcp__gitlab__create_issue' }), { ok: true });
  assert.equal(await promessa, true);
  assert.deepEqual(consentitiMcp(s.input), [chiave('github', 'create_issue')]);
  assert.deepEqual([...(s.input.consensiSessione?.strumentiEmulatiConsentiti ?? [])], [], 'not mixed with the emulated tools');
  const evento = s.ricevuti.find((e) => e.type === 'ApprovalResolved' && e.requestId === requestId);
  assert.equal(evento?.ambito, 'strumento');
});

test('P018-21: «for this tool» with a no, or given by a rule and not a person, remembers nothing', async (t) => {
  const s = await scena(t);
  const no = await domanda(s.registro, s.sessionId, s.input, CARTA_MCP);
  assert.equal(s.registro.rispondiApprovazione(s.sessionId, no.requestId, false, { ambito: 'strumento' }).code, 'QUERY_INVALID');
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, no.requestId, false), { ok: true });
  await no.promessa;
  const regola = await domanda(s.registro, s.sessionId, s.input, { ...CARTA_MCP, toolCallId: 'c2' });
  s.registro.rispondiApprovazione(s.sessionId, regola.requestId, true, { ambito: 'strumento', motivo: 'regola' });
  if (s.registro.domandaInAttesa(s.sessionId)?.requestId === regola.requestId) s.registro.rispondiApprovazione(s.sessionId, regola.requestId, false);
  await regola.promessa;
  assert.deepEqual(consentitiMcp(s.input), []);
});

/* P018 round 2 (judge v1462, D2): the phone shows «For this session» unless `sempreNonBasta`, and that button never kept its promise
   (it wrote a setting the PC refuses). Until the phone draws server and tool, the card carries `sempreNonBasta`: once and No there;
   the PC keeps its «for this tool», which `ambito: 'strumento'` still honours. */
test('P018-22: the MCP card carries sempreNonBasta for the phone, «for this tool» still holds; a child sees the parent yes, its own does not climb', async (t) => {
  const s = await scena(t);
  const { promessa, requestId } = await domanda(s.registro, s.sessionId, s.input, CARTA_MCP);
  const richiesta = s.ricevuti.find((e) => e.type === 'ApprovalRequested' && e.requestId === requestId);
  assert.equal(richiesta?.azione?.sempreNonBasta, true, 'the phone offers no button it cannot keep');
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, requestId, true, { ambito: 'strumento' }), { ok: true });
  await promessa;
  await s.input.onDelega('child: open an issue', '/tmp/x');
  const figliaId = s.registro.elenca().find((x) => x.padreId === s.sessionId)?.sessionId;
  assert.ok(figliaId, 'premise: the child exists');
  const inputFiglia = s.runs[1].input;
  assert.deepEqual(consentitiMcp(inputFiglia), [chiave('github', 'create_issue')]);
  const f = await domanda(s.registro, figliaId, inputFiglia, { ...CARTA_MCP, toolCallId: 'f1', nome: 'mcp__github__list_issues', attrezzo: 'list_issues' });
  assert.deepEqual(s.registro.rispondiApprovazione(figliaId, f.requestId, true, { ambito: 'strumento' }), { ok: true });
  await f.promessa;
  assert.deepEqual(consentitiMcp(inputFiglia).sort(), [chiave('github', 'create_issue'), chiave('github', 'list_issues')].sort());
  assert.deepEqual(consentitiMcp(s.input), [chiave('github', 'create_issue')], 'the yes of the child does not climb');
});
