/*
 * Long tasks, permission cards A and B (owner 13/11/2026 04:35, «A e B insieme»; judge v1759).
 * A: the calls of the SAME outside tool in the SAME model answer (connector, plugin, Tool Forge) share ONE card. The card says how many
 *    they are and lists the arguments of each one; the person's answer «for all of them» (`ambito: 'risposta'`) covers exactly those
 *    calls, never a call of another answer or of another tool; the model gets one result per call. A plain yes (a client that does not
 *    draw the list: the phone, the CLI) still covers only the call it was asked for.
 *    Never grouped (judge v1759 b): the critical deletes of the gate, a connector tool its server did not declare non-destructive
 *    (`destructiveHint` true, absent or not a boolean: the MCP schema 2025-06-18 says «Default: true»), the computer-use payments.
 * B: «No to this tool until your next message»: the tool is refused for the rest of the turn, with any arguments, and the person's next
 *    message clears it. Only the person's answer on the card turns it on: an automatic No never does.
 * Through the real kernel (`talosLavora`): fake model, fake tools, no key, nothing leaves the machine.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { talosLavora, chiaveAttrezzoDiFuori, domandaConSegnoForzato, argomentiEntroLaCarta, CARTA_SEMPRE } from '../src/kernel/talosHarness.mjs';
import * as nucleo from '../src/kernel/talosHarness.mjs';
import { dimenticaPercorsiVeri } from '../src/kernel/cancellazioni-critiche.mjs';
import { preparaToolMcpPerSessione } from '../src/mcp-session.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SCHEMA = { type: 'object', properties: { title: { type: 'string' }, file: { type: 'string' }, day: { type: 'string' } } };
const mcp = (nome, annotations) => ({ name: `mcp__github__${nome}`, serverId: 'github', nomeOriginale: nome, description: nome, inputSchema: SCHEMA, ...(annotations ? { annotations } : {}) });
/* what `mcp-session.mjs` passes for a tool its server declared `destructiveHint: false`, and the cases that must never group */
const TOOL_MCP = [
  mcp('create_issue', { destructiveHint: false }), mcp('delete_issue', { destructiveHint: true }), mcp('close_issue'),
  mcp('label_issue', { destructiveHint: 'false' }), mcp('list_issues', { readOnlyHint: true }),
];
const TOOL_PLUGIN = [{ nome: 'plugin__lint__check', pluginId: 'lint', nomeOriginale: 'check', descrizione: 'checks the code', parametri: SCHEMA }];
const TOOL_FORGE = [{ name: 'forge_daily_note', description: 'writes the daily note', inputSchema: SCHEMA }];
const IS = 'mcp__github__create_issue';
const LINT = 'plugin__lint__check';
const NOTA = 'forge_daily_note';
const DI_FUORI = new Set(['mcp_tool', 'plugin_tool', 'forge_tool']);
const FINE = { role: 'assistant', content: 'done', tool_calls: [] };
const tc = (id, nome, args) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(args ?? {}) } });

/* what the server's registry hands the kernel for each answer of the person (`rispondiApprovazione`) */
const TUTTE_SI = { approvato: true, perTutteLeChiamate: true };
const TUTTE_NO = { approvato: false, perTutteLeChiamate: true };
const NO_STRUMENTO = { approvato: false, noAlloStrumento: true };

/** One turn. `passi`: one element per model answer, each an array of calls [id, name, arguments]. */
async function giro(t, { passi, ospite = async () => false, coda, toolMcp = TOOL_MCP, ...altro }) {
  const dir = mkdtempSync(join(tmpdir(), 'carte-ab-'));
  t.after(() => { try { rimuoviCartellaDiProva(dir); } catch { /* already gone */ } });
  const risposte = [...passi.map((p) => ({ role: 'assistant', content: null, tool_calls: p.map(([id, n, a]) => tc(id, n, a)) })), FINE];
  const corpi = [], chieste = [], eseguite = [];
  const stato = { risposte: 0, carte: 0 };
  await talosLavora({
    cartella: dir, task: { consegna: 'work' }, modello: 'x', chiave: 'finta', toolMcp, toolPlugin: TOOL_PLUGIN, toolForge: TOOL_FORGE,
    chiamaToolMcpFn: async (nome, a) => { eseguite.push([nome, a]); return { content: [{ type: 'text', text: 'ok' }], isError: false }; },
    eseguiToolPluginFn: async (nome, a) => { eseguite.push([nome, a]); return 'ok'; },
    eseguiToolForgeFn: async (nome, a) => { eseguite.push([nome, a]); return { status: 'succeeded', output: 'ok' }; },
    chiediApprovazioneFn: async (a) => { chieste.push(a); const r = await ospite(a); if (DI_FUORI.has(a.tipo)) stato.carte += 1; return r; },
    ...(coda ? { codaMessaggiFn: () => coda(stato) } : {}),
    fetchDiRete: async (_u, o) => {
      const scelta = risposte[Math.min(corpi.length, risposte.length - 1)];
      corpi.push(JSON.parse(o.body));
      stato.risposte = corpi.length;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
    },
    ...altro,
  });
  const strumenti = corpi.at(-1).messages.filter((m) => m.role === 'tool');
  return { carte: chieste.filter((a) => DI_FUORI.has(a.tipo)), chieste, esiti: strumenti.map((m) => String(m.content)), idEsiti: strumenti.map((m) => m.tool_call_id), eseguite };
}

const X1 = Array.from({ length: 8 }, (_, i) => [`x1-${i}`, IS, { title: `bug ${i}` }]);
const X2 = Array.from({ length: 6 }, (_, i) => [`x2-${i}`, LINT, { file: `src/f${i}.js` }]);
const X3 = ['mon', 'tue', 'wed', 'thu', 'fri'].map((day, i) => [`x3-${i}`, NOTA, { day }]);
const LUNGHI = [['X1', X1], ['X2', X2], ['X3', X3]];
const idDelle = (carte) => carte.map((a) => a.toolCallId);
const RIFIUTATO = /^REFUSED/u;

/* ── A: one card for the calls of the same tool in the same answer ──────────────────────────────────────────────────────────── */

for (const livelloAccesso of ['scrittura-progetto', 'su-richiesta', 'lettura']) {
  for (const [nome, chiamate] of LUNGHI) {
    test(`AB-A1 ${nome} (${livelloAccesso}): the ${chiamate.length} calls of one answer ask ONE card; «allow all» runs every one`, async (t) => {
      const r = await giro(t, { livelloAccesso, passi: [chiamate], ospite: async (a) => (DI_FUORI.has(a.tipo) ? TUTTE_SI : true) });
      assert.equal(r.carte.length, 1, `cards: ${idDelle(r.carte)}`);
      assert.equal(r.eseguite.length, chiamate.length);
      assert.deepEqual(r.idEsiti, chiamate.map(([id]) => id), 'one result per call, in order');
      for (const e of r.esiti) assert.doesNotMatch(e, RIFIUTATO, e);
    });
    test(`AB-A2 ${nome} (${livelloAccesso}): «No» on the card refuses all ${chiamate.length}, one result each, nothing runs`, async (t) => {
      const r = await giro(t, { livelloAccesso, passi: [chiamate], ospite: async (a) => (DI_FUORI.has(a.tipo) ? TUTTE_NO : true) });
      assert.equal(r.carte.length, 1, `cards: ${idDelle(r.carte)}`);
      assert.deepEqual(r.eseguite, []);
      assert.deepEqual(r.idEsiti, chiamate.map(([id]) => id));
      for (const e of r.esiti) assert.match(e, RIFIUTATO, e);
    });
  }
}

test('AB-A3 (judge v1759 a): the card says how many calls it covers and lists the arguments of EACH one (the target included)', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [X1], ospite: async () => TUTTE_SI });
  const [carta] = r.carte;
  assert.equal(carta.toolCallId, 'x1-0');
  assert.equal(carta.gruppo?.totale, 8);
  assert.deepEqual(carta.gruppo.chiamate.map((c) => c.toolCallId), X1.map(([id]) => id));
  assert.deepEqual(carta.gruppo.chiamate.map((c) => c.argomenti?.title), X1.map(([, , a]) => a.title));
});

test('AB-A4: a plain yes (a client that does not draw the list) covers ONLY the call it was asked for; the next card lists the rest', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [X3], ospite: async () => true });
  assert.deepEqual(idDelle(r.carte), X3.map(([id]) => id));
  assert.deepEqual(r.carte.map((c) => c.gruppo?.totale), [5, 4, 3, 2, undefined]);
  assert.equal(r.eseguite.length, 5);
});

test('AB-A5: a plain No covers only its call too (as today): the next call of the answer asks again', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [X2.slice(0, 3)], ospite: async () => false });
  assert.deepEqual(idDelle(r.carte), ['x2-0', 'x2-1', 'x2-2']);
  assert.deepEqual(r.eseguite, []);
});

test('AB-A6: the answer never covers a call of ANOTHER answer of the model (the same tool asks again)', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [X1.slice(0, 3), X1.slice(3, 5)], ospite: async () => TUTTE_SI });
  assert.deepEqual(idDelle(r.carte), ['x1-0', 'x1-3']);
  assert.deepEqual(r.carte.map((c) => c.gruppo?.totale), [3, 2]);
  assert.equal(r.eseguite.length, 5);
});

test('AB-A7: the answer never covers ANOTHER tool in the same answer (each tool its own card, its own count)', async (t) => {
  const passo = [['a', IS, { title: 'a' }], ['b', LINT, { file: 'x.js' }], ['c', IS, { title: 'c' }], ['d', NOTA, { day: 'mon' }], ['e', LINT, { file: 'y.js' }]];
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [passo], ospite: async (a) => (a.attrezzo === 'check' ? TUTTE_NO : TUTTE_SI) });
  assert.deepEqual(idDelle(r.carte), ['a', 'b', 'd']);
  assert.deepEqual(r.carte.map((c) => c.gruppo?.totale), [2, 2, undefined]);
  assert.deepEqual(r.eseguite.map(([n, a]) => `${n}:${a.title ?? a.day ?? a.file}`), [`${IS}:a`, `${IS}:c`, `${NOTA}:mon`]);
  assert.match(r.esiti[1], RIFIUTATO); assert.match(r.esiti[4], RIFIUTATO);
});

test('AB-A8: a single call has no group on its card (nothing changes for it)', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [[['s', IS, { title: 's' }]]], ospite: async () => true });
  assert.equal(r.carte.length, 1);
  assert.equal(r.carte[0].gruppo, undefined);
});

test('AB-A9: an answer «for all» marked automatic is never remembered for the others: each one asks', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [X3.slice(0, 3)], ospite: async () => ({ ...TUTTE_SI, automatico: true }) });
  assert.equal(r.carte.length, 3);
});

test('AB-A10 (judge v1778, v1759 b): readOnlyHint true WITHOUT destructiveHint never groups: one card for each call', async (t) => {
  const tre = Array.from({ length: 3 }, (_, i) => [`l${i}`, 'mcp__github__list_issues', { title: `q${i}` }]);
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [tre], ospite: async () => TUTTE_SI });
  assert.deepEqual(idDelle(r.carte), ['l0', 'l1', 'l2']);
  for (const c of r.carte) assert.equal(c.gruppo, undefined);
});

/* ── A, never grouped (judge v1759 b): one card per call, even with 5 calls of the same tool in the same answer ───────────────── */

for (const [strumento, perche] of [['delete_issue', 'destructiveHint true'], ['close_issue', 'no annotation (the MCP default is destructive)'], ['label_issue', 'destructiveHint not a boolean']]) {
  test(`AB-N1 (${perche}): 5 calls of «${strumento}» in one answer = 5 cards, none with a group, an «all» answer covers only its call`, async (t) => {
    const cinque = Array.from({ length: 5 }, (_, i) => [`d${i}`, `mcp__github__${strumento}`, { title: `t${i}` }]);
    const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [cinque], ospite: async () => TUTTE_SI });
    assert.deepEqual(idDelle(r.carte), cinque.map(([id]) => id));
    for (const c of r.carte) assert.equal(c.gruppo, undefined);
  });
}

test('AB-N2 (critical deletes): 5 critical deletes in one answer, Full access = 5 cards, none with a group, nothing runs', async (t) => {
  if (process.platform !== 'win32') { t.skip('the Windows commands of the critical gate'); return; }
  const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'carte-ab-critiche-')));
  const casa = join(radice, 'casa');
  const progetto = join(radice, 'lavoro', 'p1');
  mkdirSync(casa, { recursive: true }); mkdirSync(progetto, { recursive: true });
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = casa; process.env.HOME = casa;
  t.after(() => { for (const [k, v] of Object.entries(prima)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } dimenticaPercorsiVeri(); try { rimuoviCartellaDiProva(radice); } catch { /* gone */ } });
  assert.equal(homedir(), casa, 'premise: the home is the fake one');
  const comandi = [`rd /s /q "${casa}"`, `rd /q /s "${casa}"`, `rmdir /s /q "${casa}"`, `rd /s /q "${progetto}"`, `rmdir /q /s "${progetto}"`];
  const passo = comandi.map((comando, i) => [`k${i}`, 'shell', { comando }]);
  const risposte = [{ role: 'assistant', content: null, tool_calls: passo.map(([id, n, a]) => tc(id, n, a)) }, FINE];
  const chieste = [];
  let n = 0;
  await talosLavora({
    cartella: progetto, task: { consegna: 'clean' }, modello: 'x', chiave: 'finta', livelloAccesso: 'accesso-pieno',
    chiediApprovazioneFn: async (a) => { chieste.push(a); return TUTTE_NO; },
    fetchDiRete: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: risposte[Math.min(n++, risposte.length - 1)] }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' }),
  });
  const critiche = chieste.filter((a) => a.cancellazioneCritica);
  assert.equal(critiche.length, 5, JSON.stringify(chieste.map((a) => a.comando)));
  for (const a of chieste) assert.equal(a.gruppo, undefined);
  assert.ok(existsSync(casa) && existsSync(progetto), 'nothing was deleted');
});

test('AB-N3 (computer use): 5 computer_use calls in one answer (5 payments) reach the host 5 times, each with its own card, never a group', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'carte-ab-cu-'));
  t.after(() => { try { rimuoviCartellaDiProva(dir); } catch { /* gone */ } });
  const passo = Array.from({ length: 5 }, (_, i) => [`u${i}`, 'computer_use', { task: `pay invoice ${i} on the bank site` }]);
  const risposte = [{ role: 'assistant', content: null, tool_calls: passo.map(([id, n, a]) => tc(id, n, a)) }, FINE];
  const alHost = [], chieste = [];
  let n = 0;
  await talosLavora({
    cartella: dir, task: { consegna: 'pay' }, modello: 'x', chiave: 'finta', livelloAccesso: 'scrittura-progetto', strumentiEstesi: ['computer_use'],
    vedeImmaginiFn: () => true,
    onComputerUseFn: async (_nome, argomenti, info) => { alHost.push({ task: argomenti.task, id: info?.toolCallId }); return { ok: false, testo: 'the person said no on the payment card' }; },
    chiediApprovazioneFn: async (a) => { chieste.push(a); return TUTTE_SI; },
    fetchDiRete: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: risposte[Math.min(n++, risposte.length - 1)] }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' }),
  });
  assert.deepEqual(alHost.map((h) => h.id), passo.map(([id]) => id), 'each payment is its own task, with its own card in the host');
  for (const a of chieste) assert.equal(a.gruppo, undefined);
});

/* ── B: «No to this tool until your next message» ───────────────────────────────────────────────────────────────────────────── */

const SEPARATE = (lista) => lista.map((c) => [c]); // one call per model answer: A cannot help here, B can

for (const livelloAccesso of ['scrittura-progetto', 'su-richiesta', 'lettura']) {
  for (const [nome, chiamate] of LUNGHI) {
    test(`AB-B1 ${nome} (${livelloAccesso}): «No to this tool» on the first card refuses the other ${chiamate.length - 1} calls (other arguments, other answers), 1 card`, async (t) => {
      const r = await giro(t, { livelloAccesso, passi: SEPARATE(chiamate), ospite: async () => NO_STRUMENTO });
      assert.equal(r.carte.length, 1, `cards: ${idDelle(r.carte)}`);
      assert.deepEqual(r.eseguite, []);
      assert.equal(r.esiti.length, chiamate.length);
      for (const e of r.esiti) {
        assert.match(e, RIFIUTATO, e);
        assert.match(e, /the person said no to this tool until their next message/u, e);
        assert.doesNotMatch(e, /automatic/u, e);
      }
    });
  }
}

test('AB-B2: B covers only that tool: another tool still asks', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', passi: [[['a', IS, { title: 'a' }]], [['b', LINT, { file: 'x.js' }]], [['c', IS, { title: 'c' }]]],
    ospite: async (a) => (a.attrezzo === 'create_issue' ? NO_STRUMENTO : true),
  });
  assert.deepEqual(idDelle(r.carte), ['a', 'b']);
  assert.deepEqual(r.eseguite.map(([n]) => n), [LINT]);
  assert.match(r.esiti[2], /until their next message/u);
});

test('AB-B3: the person\'s next message (queued with their mark) clears B: the tool asks again', async (t) => {
  let fatto = false;
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', passi: [[['a', IS, { title: 'a' }]], [['b', IS, { title: 'b' }]], [['c', IS, { title: 'c' }]]],
    ospite: async (a) => (a.toolCallId === 'a' ? NO_STRUMENTO : true),
    coda: (stato) => (fatto || stato.risposte !== 2 ? null : (fatto = true, { testo: 'ok, go ahead', dallaPersona: true })),
  });
  assert.ok(fatto, 'premise: the message was delivered');
  assert.ok(idDelle(r.carte).includes('c'), `after the person spoke the tool asks again: ${idDelle(r.carte)}`);
  assert.ok(r.eseguite.some(([, a]) => a.title === 'c'));
  assert.ok(!r.eseguite.some(([, a]) => a.title === 'a'));
});

test('AB-B4: a queued voice WITHOUT the person\'s mark (a child, a notice) does not clear B', async (t) => {
  let fatto = false;
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', passi: [[['a', IS, { title: 'a' }]], [['b', IS, { title: 'b' }]], [['c', IS, { title: 'c' }]]],
    ospite: async () => NO_STRUMENTO,
    coda: (stato) => (fatto || stato.risposte !== 2 ? null : (fatto = true, { testo: 'a child finished' })),
  });
  assert.ok(fatto);
  assert.deepEqual(idDelle(r.carte), ['a']);
  assert.deepEqual(r.eseguite, []);
});

test('AB-B5: an automatic No that says «no to this tool» (marked automatic) never turns B on', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', passi: SEPARATE(X3.slice(0, 3)),
    ospite: async () => ({ ...NO_STRUMENTO, automatico: true, motivo: 'Denied: not interactive.' }),
  });
  assert.equal(r.carte.length, 3);
});

test('AB-B6: B on a group card refuses the rest of the group and the later answers of that tool', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [X1.slice(0, 4), X1.slice(4)], ospite: async () => NO_STRUMENTO });
  assert.deepEqual(idDelle(r.carte), ['x1-0']);
  assert.deepEqual(r.eseguite, []);
  assert.equal(r.esiti.length, 8);
});

test('AB-B7: a new turn asks again (B lives in the turn only)', async (t) => {
  const consensiSessione = {};
  const primo = await giro(t, { livelloAccesso: 'scrittura-progetto', consensiSessione, passi: [[['a', IS, { title: 'a' }]]], ospite: async () => NO_STRUMENTO });
  const secondo = await giro(t, { livelloAccesso: 'scrittura-progetto', consensiSessione, passi: [[['b', IS, { title: 'b' }]]], ospite: async () => true });
  assert.equal(primo.carte.length, 1);
  assert.deepEqual(idDelle(secondo.carte), ['b']);
  assert.equal(secondo.eseguite.length, 1);
});

/* ── the opposite: nothing runs without consent, Full access unchanged ───────────────────────────────────────────────────────── */

test('AB-C1: Full access asks nothing and runs everything, as before', async (t) => {
  const r = await giro(t, { livelloAccesso: 'accesso-pieno', passi: [X1], ospite: async () => false });
  assert.equal(r.carte.length, 0);
  assert.equal(r.eseguite.length, 8);
});

test('AB-C2: no answer is invented: with the plain No of today every call of the group is refused one by one, none runs', async (t) => {
  const r = await giro(t, { livelloAccesso: 'su-richiesta', passi: [X1], ospite: async () => false });
  assert.equal(r.carte.length, 8);
  assert.deepEqual(r.eseguite, []);
});

/* ── second tests: each new line that one test alone checked gets another (ask_user_question clears B, a forced sign keeps its own card,
      mcp-session passes the sign that lets the calls group) ─────────────────────────────────────────────────────────────────────────── */

const DOMANDE = [{ id: 'q', question: 'Create it?', why: 'You said no to the card.', options: [{ label: 'Yes', description: 'create', recommended: true }, { label: 'No', description: 'skip' }] }];
for (const [nome, strumento, prima, dopo] of [['connector', IS, { title: 'a' }, { title: 'c' }], ['plugin', LINT, { file: 'a.js' }, { file: 'c.js' }]]) {
  test(`AB-B8 (${nome}): after B the person answers one of the assistant's questions: the tool asks again (an answer is a message of the person)`, async (t) => {
    let chiesta = false;
    const r = await giro(t, {
      livelloAccesso: 'scrittura-progetto',
      passi: [[['a', strumento, prima]], [['q1', 'ask_user_question', { questions: DOMANDE }]], [['c', strumento, dopo]]],
      ospite: async (a) => (a.toolCallId === 'a' ? NO_STRUMENTO : true),
      chiediDomandaFn: async () => { chiesta = true; return { status: 'answered', answers: { q: 'Yes' } }; },
    });
    assert.equal(chiesta, true, 'premise: the question was answered');
    assert.deepEqual(idDelle(r.carte), ['a', 'c']);
    assert.equal(r.eseguite.length, 1);
  });
}

/* a forced sign on an outside tool: the trifecta (P018-09) — the tool was allowed «for this tool», a write in the same answer saw private
   data, so each later call of the tool asks with `trifecta: true`; such a call never takes the answer of a group, it asks on its own card */
for (const [nome, strumento, tipo, origine, attrezzo, campo] of [['connector', IS, 'mcp_tool', 'github', 'create_issue', 'title'], ['plugin', LINT, 'plugin_tool', 'lint', 'check', 'file']]) {
  test(`AB-A11 (${nome}): calls of the group whose questions carry a forced sign (the trifecta) ask each on its own card, never «for all»`, async (t) => {
    const r = await giro(t, {
      livelloAccesso: 'scrittura-progetto', consensiSessione: { attrezziMcpConsentiti: [chiaveAttrezzoDiFuori(tipo, origine, attrezzo)] },
      passi: [[['w1', 'scrivi', { percorso: 'note.txt', contenuto: 'privato' }], ...['a', 'b', 'c'].map((id) => [id, strumento, { [campo]: id }])]],
      ospite: async (a) => (a.gruppo ? TUTTE_SI : true),
    });
    assert.deepEqual(r.carte.map((a) => [a.toolCallId, a.trifecta === true, a.gruppo === undefined]), [['b', true, true], ['c', true, true]]);
    assert.equal(r.eseguite.length, 3);
  });
}

const DAL_SERVER = (annotazioni) => preparaToolMcpPerSessione({ cartella: '/tmp/x', cartellaTrust: '/tmp/t' }, {
  serverMcpFidatiFn: async () => ({ fidati: [{ id: 'github', comando: 'npx', argomenti: [], allowlist: ['create_issue'], hash: 'h' }], nonFidati: [] }),
  connettiServerMcpFn: async () => ({ client: {}, chiudi: async () => {} }),
  elencaToolMcpFn: async () => [{ name: 'create_issue', description: 'c', inputSchema: SCHEMA, ...(annotazioni ? { annotations: annotazioni } : {}) }],
  filtraToolMcpFn: (tool, allowlist) => tool.filter((x) => allowlist.includes(x.name)),
});

test('AB-A12 (mcp-session): only `destructiveHint` exactly false travels to the kernel; true or absent travels as nothing', async () => {
  assert.deepEqual((await DAL_SERVER({ destructiveHint: false })).toolMcp[0].annotations, { destructiveHint: false });
  assert.equal((await DAL_SERVER({ destructiveHint: true })).toolMcp[0].annotations, undefined);
  assert.equal((await DAL_SERVER()).toolMcp[0].annotations, undefined);
});

test('AB-A13 (from mcp-session to the kernel): a tool its server declared non-destructive groups; declared destructive, one card each', async (t) => {
  for (const [annotazioni, attese] of [[{ destructiveHint: false }, 1], [{ destructiveHint: true }, 3], [undefined, 3]]) {
    const { toolMcp } = await DAL_SERVER(annotazioni);
    const r = await giro(t, {
      livelloAccesso: 'scrittura-progetto', toolMcp, passi: [['a', 'b', 'c'].map((id) => [id, toolMcp[0].name, { title: id }])],
      ospite: async (a) => (a.gruppo ? TUTTE_SI : true),
    });
    assert.equal(r.carte.length, attese, JSON.stringify(annotazioni));
    assert.equal(r.eseguite.length, 3);
  }
});

/* ── second tests after the mutants (K2, K3, K7, K10, K12, K13 were killed by one test only): each gets another, on another tool ── */

test('AB-B5b (connector): an automatic No that says «no to this tool» never turns B on, on separate answers either', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'su-richiesta', passi: SEPARATE(X1.slice(0, 3)),
    ospite: async () => ({ ...NO_STRUMENTO, automatico: true, motivo: 'Denied: not interactive.' }),
  });
  assert.deepEqual(idDelle(r.carte), ['x1-0', 'x1-1', 'x1-2']);
  assert.deepEqual(r.eseguite, []);
});

test('AB-B3b (plugin): the person\'s next message (queued with their mark) clears B on a plugin tool too', async (t) => {
  let fatto = false;
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', passi: [[['a', LINT, { file: 'a.js' }]], [['b', LINT, { file: 'b.js' }]], [['c', LINT, { file: 'c.js' }]]],
    ospite: async (a) => (a.toolCallId === 'a' ? NO_STRUMENTO : true),
    coda: (stato) => (fatto || stato.risposte !== 2 ? null : (fatto = true, { testo: 'go on with the lint', dallaPersona: true })),
  });
  assert.ok(fatto, 'premise: the message was delivered');
  assert.ok(idDelle(r.carte).includes('c'), `after the person spoke the plugin tool asks again: ${idDelle(r.carte)}`);
  assert.ok(r.eseguite.some(([, a]) => a.file === 'c.js'));
});

test('AB-A9b (plugin): an automatic «for all» on a plugin card is never kept for the others: each one asks, a yes covers its call', async (t) => {
  const r = await giro(t, { livelloAccesso: 'su-richiesta', passi: [X2.slice(0, 4)], ospite: async () => ({ ...TUTTE_SI, automatico: true }) });
  assert.deepEqual(idDelle(r.carte), ['x2-0', 'x2-1', 'x2-2', 'x2-3']);
});

test('AB-A13b (from mcp-session to the kernel; judge v1778): a tool its server declared read-only, with no destructive sign, never groups', async (t) => {
  const { toolMcp } = await DAL_SERVER({ readOnlyHint: true });
  assert.deepEqual(toolMcp[0].annotations, { readOnlyHint: true });
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', toolMcp, passi: [['a', 'b', 'c'].map((id) => [id, toolMcp[0].name, { title: id }])],
    ospite: async (a) => (a.gruppo ? TUTTE_SI : true),
  });
  assert.deepEqual(idDelle(r.carte), ['a', 'b', 'c']);
  for (const c of r.carte) assert.equal(c.gruppo, undefined);
  assert.equal(r.eseguite.length, 3);
});

test('AB-A4b (plugin): after a plain yes the next card lists the calls from ITSELF on, never the ones already answered', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [X2.slice(0, 4)], ospite: async () => true });
  assert.deepEqual(r.carte.map((c) => c.gruppo?.chiamate.map((m) => m.toolCallId) ?? []), [['x2-0', 'x2-1', 'x2-2', 'x2-3'], ['x2-1', 'x2-2', 'x2-3'], ['x2-2', 'x2-3'], []]);
});

test('AB-A3b (judge v1759 a, v1778): the card carries EVERY argument of each call whole — 12 fields and a 300-character value fit', async (t) => {
  const undici = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`f${String(i).padStart(2, '0')}`, i === 0 ? 'x'.repeat(300) : `v${i}`]));
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [[['a', NOTA, { day: 'mon', ...undici }], ['b', NOTA, { day: 'tue' }]]], ospite: async () => TUTTE_SI });
  assert.equal(r.carte.length, 1);
  const [prima, seconda] = r.carte[0].gruppo.chiamate;
  assert.deepEqual(prima.argomenti, { day: 'mon', ...undici });
  assert.equal(Object.keys(prima.argomenti).length, 12);
  assert.deepEqual(seconda.argomenti, { day: 'tue' });
  assert.equal(r.eseguite.length, 2);
});

/* ── the reviewer's ROSSO (13/11/2026 15:06; judge v1778, v1783): the same toolCallId twice in one answer, the cut card ───────────────
   A provider can send the same id twice in one answer: without `onDelta` the kernel takes the whole JSON (`chiamaConRitenta`), and the
   ids pass as they are. The card of a group must never cover a call it does not list: a group holds only when the call deciding has the
   key (kind, server or plugin, tool) and the arguments of a listed member, and an answer with a repeated id has no group at all (one
   card for each call) — as Codex, whose ApprovalStore decides by the serialized key, never by an id (`codex-rs/core/src/tools/sandboxing.rs:41-63`). */
const SCHEMA_R = { type: 'object', properties: { title: { type: 'string' }, t: { type: 'string' } } };
const mcpDi = (server, nome, annotations) => ({ name: `mcp__${server}__${nome}`, serverId: server, nomeOriginale: nome, description: nome, inputSchema: SCHEMA_R, ...(annotations ? { annotations } : {}) });
const TOOL_MCP_R = [
  mcpDi('github', 'create_issue', { destructiveHint: false }), mcpDi('github', 'delete_repo', { destructiveHint: true }),
  mcpDi('docs', 'create_issue', { destructiveHint: false }), mcpDi('github', 'close_issue'),
];
const TOOL_PLUGIN_R = [...TOOL_PLUGIN, { nome: 'plugin__jira__create', pluginId: 'jira', nomeOriginale: 'create', descrizione: 'opens a ticket', parametri: SCHEMA_R }];
const GH = 'mcp__github__create_issue';
const DOCS = 'mcp__docs__create_issue';
const JIRA = 'plugin__jira__create';
const conR = { livelloAccesso: 'scrittura-progetto', toolMcp: TOOL_MCP_R, toolPlugin: TOOL_PLUGIN_R };
const chiAttrezzo = (r) => r.carte.map((a) => `${a.toolCallId}:${a.server ?? a.plugin ?? ''}/${a.attrezzo}`);
const nomiEseguiti = (r) => r.eseguite.map(([n]) => n);

for (const [nome, terza, attesa] of [
  ['a destructive connector tool (destructiveHint true)', ['a', 'mcp__github__delete_repo', { title: 'ALL' }], 'a:github/delete_repo'],
  ['a plugin tool', ['a', JIRA, { t: 'x' }], 'a:jira/create'],
  ['a connector tool with no destructiveHint', ['b', 'mcp__github__close_issue', { title: '9' }], 'b:github/close_issue'],
]) {
  test(`AB-R1 (${nome}): «Allow all» on two create_issue, then ${nome} with the SAME id of one of them: it asks its own card and does not run`, async (t) => {
    const r = await giro(t, { ...conR, passi: [[['a', GH, { title: '1' }], ['b', GH, { title: '2' }], terza]], ospite: async (a) => (a.gruppo ? TUTTE_SI : a.attrezzo === 'create_issue') });
    assert.ok(chiAttrezzo(r).includes(attesa), `cards: ${chiAttrezzo(r)}`);
    assert.ok(!nomiEseguiti(r).includes(terza[1]), `ran without a card: ${nomiEseguiti(r)}`);
    for (const c of r.carte) assert.equal(c.gruppo, undefined, 'an answer with a repeated id has no group');
  });
}

test('AB-R1d: the same id twice on the SAME tool with other arguments: no group, each call its own card, «all» covers its call only', async (t) => {
  const r = await giro(t, { ...conR, passi: [[['a', GH, { title: '1' }], ['a', GH, { title: 'DELETE EVERYTHING' }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : a.argomenti?.title !== 'DELETE EVERYTHING') });
  assert.equal(r.carte.length, 2, `cards: ${chiAttrezzo(r)}`);
  for (const c of r.carte) assert.equal(c.gruppo, undefined);
});

test('AB-R1e (plugin): the same id twice on the same plugin tool: no group, two cards', async (t) => {
  const r = await giro(t, { ...conR, passi: [[['p', JIRA, { t: '1' }], ['p', JIRA, { t: '2' }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : false) });
  assert.equal(r.carte.length, 2, `cards: ${chiAttrezzo(r)}`);
  for (const c of r.carte) assert.equal(c.gruppo, undefined);
  assert.deepEqual(r.eseguite, []);
});

/* 3b (judge v1783): B together with the repeated ids — the same id on two DIFFERENT tools */
test('AB-R3b-1: B on github/create_issue never hits docs/create_issue that carries the same id: docs asks its own card, with no group', async (t) => {
  const r = await giro(t, { ...conR, passi: [[['a', GH, { title: '1' }], ['b', GH, { title: '2' }], ['a', DOCS, { title: '3' }]]], ospite: async (a) => (a.server === 'github' ? NO_STRUMENTO : true) });
  const docs = r.carte.find((a) => a.server === 'docs');
  assert.ok(docs, `docs must ask: ${chiAttrezzo(r)}`);
  assert.equal(docs.gruppo, undefined, 'the card of docs never lists the calls of github');
  assert.deepEqual(nomiEseguiti(r), [DOCS]);
  assert.doesNotMatch(r.esiti[2], /until their next message/u);
});

test('AB-R3b-2: after a yes on github/create_issue, a plugin with the same id never runs without its own card', async (t) => {
  const r = await giro(t, { ...conR, passi: [[['a', GH, { title: '1' }], ['b', GH, { title: '2' }], ['a', JIRA, { t: 'x' }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : a.server === 'github') });
  assert.ok(chiAttrezzo(r).includes('a:jira/create'), `cards: ${chiAttrezzo(r)}`);
  assert.ok(!nomiEseguiti(r).includes(JIRA));
});

test('AB-R3b-3: B on a plugin never hits a connector tool with the same id, and the connector card lists no group', async (t) => {
  const r = await giro(t, { ...conR, passi: [[['a', JIRA, { t: '1' }], ['b', JIRA, { t: '2' }], ['a', GH, { title: '3' }], ['c', GH, { title: '4' }]]], ospite: async (a) => (a.tipo === 'plugin_tool' ? NO_STRUMENTO : true) });
  const gh = r.carte.filter((a) => a.server === 'github');
  assert.deepEqual(gh.map((a) => a.toolCallId), ['a', 'c']);
  for (const c of r.carte) assert.equal(c.gruppo, undefined);
  assert.deepEqual(nomiEseguiti(r), [GH, GH]);
});

/* R2 (judge v1778): a call past the limit of the card (12 fields, 300 characters a value) never shares a card */
test('AB-R2a (S4): 14 fields, «title: DELETE EVERYTHING» past the twelfth: that call asks its own card, «Allow all» never covers it', async (t) => {
  const molti = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`f${String(i).padStart(2, '0')}`, 'x']));
  const r = await giro(t, { ...conR, passi: [[['a', GH, { title: '1' }], ['b', GH, { ...molti, title: 'DELETE EVERYTHING' }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : a.toolCallId === 'a') });
  assert.deepEqual(idDelle(r.carte), ['a', 'b']);
  for (const c of r.carte) assert.equal(c.gruppo, undefined);
  assert.deepEqual(r.eseguite.map(([, a]) => a.title), ['1']);
});

test('AB-R2b (plugin): a value longer than 300 characters: no group, each call its own card', async (t) => {
  const r = await giro(t, { ...conR, passi: [[['a', LINT, { file: 'a.js' }], ['b', LINT, { file: `${'y'.repeat(301)}` }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : a.toolCallId === 'a') });
  assert.deepEqual(idDelle(r.carte), ['a', 'b']);
  for (const c of r.carte) assert.equal(c.gruppo, undefined);
  assert.deepEqual(r.eseguite.map(([, a]) => a.file), ['a.js']);
});

test('AB-R2c (Tool Forge): 13 fields: no group; with 12 fields the same calls share one card', async (t) => {
  const campi = (n) => Object.fromEntries(Array.from({ length: n - 1 }, (_, i) => [`g${i}`, 'v']));
  const oltre = await giro(t, { ...conR, passi: [[['a', NOTA, { day: 'mon' }], ['b', NOTA, { day: 'tue', ...campi(13) }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : true) });
  assert.deepEqual(idDelle(oltre.carte), ['a', 'b']);
  const entro = await giro(t, { ...conR, passi: [[['a', NOTA, { day: 'mon' }], ['b', NOTA, { day: 'tue', ...campi(12) }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : true) });
  assert.deepEqual(idDelle(entro.carte), ['a']);
});

/* the never-grouped rule, from the other side: readOnlyHint true with destructiveHint false groups (the server said both) */
test('AB-A10b: readOnlyHint true AND destructiveHint false: the calls share one card', async (t) => {
  const toolMcp = [mcpDi('github', 'list_issues', { readOnlyHint: true, destructiveHint: false })];
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', toolMcp, passi: [['a', 'b', 'c'].map((id) => [id, 'mcp__github__list_issues', { title: id }])], ospite: async (a) => (a.gruppo ? TUTTE_SI : true) });
  assert.deepEqual(idDelle(r.carte), ['a']);
  assert.equal(r.eseguite.length, 3);
});

test('AB-A10c (On request): readOnlyHint true without destructiveHint asks a card for each call, never a group', async (t) => {
  const tre = Array.from({ length: 3 }, (_, i) => [`l${i}`, 'mcp__github__list_issues', { title: `q${i}` }]);
  const r = await giro(t, { livelloAccesso: 'su-richiesta', passi: [tre], ospite: async () => TUTTE_SI });
  assert.deepEqual(idDelle(r.carte), ['l0', 'l1', 'l2']);
  for (const c of r.carte) assert.equal(c.gruppo, undefined);
});

/* the reviewer's living mutants (V3, V4, V6, V18): each dies by two tests. V5 (broken JSON kept in a group) is equivalent: before the
   calls run the kernel already writes `{}` for any arguments that are not JSON (`c.function.arguments = '{}'`, BC-11), so the parse of
   the group never fails — measured: a call sent with `{"broken` reaches the group as `{}` */
test('AB-V3: two plugins with a tool of the same name in one answer: two groups, each card lists only its plugin', async (t) => {
  const plugin = [...TOOL_PLUGIN, { nome: 'plugin__altro__check', pluginId: 'altro', nomeOriginale: 'check', descrizione: 'another check', parametri: SCHEMA }];
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', toolPlugin: plugin, passi: [[['a', LINT, { file: '1' }], ['b', 'plugin__altro__check', { file: '2' }], ['c', LINT, { file: '3' }], ['d', 'plugin__altro__check', { file: '4' }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : true) });
  assert.deepEqual(r.carte.map((a) => [a.plugin, a.gruppo?.chiamate.map((m) => m.toolCallId)]), [['lint', ['a', 'c']], ['altro', ['b', 'd']]]);
});

test('AB-V3b: «Allow all» on the group of one plugin never runs the same-named tool of another plugin', async (t) => {
  const plugin = [...TOOL_PLUGIN, { nome: 'plugin__altro__check', pluginId: 'altro', nomeOriginale: 'check', descrizione: 'another check', parametri: SCHEMA }];
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', toolPlugin: plugin, passi: [[['a', LINT, { file: '1' }], ['b', 'plugin__altro__check', { file: '2' }], ['c', LINT, { file: '3' }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : false) });
  assert.deepEqual(idDelle(r.carte), ['a', 'b']);
  assert.deepEqual(nomiEseguiti(r), [LINT, LINT]);
});

test('AB-V4: two servers with a tool of the same name in one answer: two groups, each card lists only its server', async (t) => {
  const r = await giro(t, { ...conR, passi: [[['a', GH, { title: '1' }], ['b', DOCS, { title: '2' }], ['c', GH, { title: '3' }], ['d', DOCS, { title: '4' }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : true) });
  assert.deepEqual(r.carte.map((a) => [a.server, a.gruppo?.chiamate.map((m) => m.toolCallId)]), [['github', ['a', 'c']], ['docs', ['b', 'd']]]);
});

test('AB-V4b: «Allow all» on the github group never runs docs/create_issue', async (t) => {
  const r = await giro(t, { ...conR, passi: [[['a', GH, { title: '1' }], ['b', DOCS, { title: '2' }], ['c', GH, { title: '3' }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : false) });
  assert.deepEqual(idDelle(r.carte), ['a', 'b']);
  assert.deepEqual(nomiEseguiti(r), [GH, GH]);
});

for (const [nome, strumento, campo] of [['connector', IS, 'title'], ['plugin', LINT, 'file']]) {
  test(`AB-V6 (${nome}): an automatic «No to all» keeps its own reason: the model never hears that the person said no`, async (t) => {
    const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [[['a', strumento, { [campo]: '1' }], ['b', strumento, { [campo]: '2' }]]], ospite: async () => ({ ...TUTTE_NO, automatico: true, motivo: 'Denied: not interactive.' }) });
    assert.deepEqual(r.eseguite, []);
    for (const e of r.esiti) {
      assert.match(e, /Denied: not interactive\./u, e);
      assert.doesNotMatch(e, /the person said no/u, e);
    }
  });
}

for (const [nome, strumento, campo] of [['connector', IS, 'title'], ['plugin', LINT, 'file']]) {
  test(`AB-V18 (${nome}): calls through the deferred tools bridge (\`tool_call\`) group like direct ones: one card, every call runs`, async (t) => {
    const ponte = (id, v) => [id, 'tool_call', { name: strumento, arguments: { [campo]: v } }];
    const r = await giro(t, { livelloAccesso: 'scrittura-progetto', attrezziDifferiti: true, passi: [[ponte('a', '1'), ponte('b', '2'), ponte('c', '3')]], ospite: async (a) => (a.gruppo ? TUTTE_SI : false) });
    assert.deepEqual(idDelle(r.carte), ['a'], `cards: ${idDelle(r.carte)}`);
    assert.equal(r.carte[0].gruppo?.totale, 3);
    assert.equal(r.eseguite.length, 3);
  });
}

/* the SSE flow (rule 1 of the assembler, `consumaFlussoSSE`): a repeated id there joins the pieces into one call — whatever it becomes,
   the destructive tool never runs without its card */
const enc = new TextEncoder();
const flusso = (fotogrammi) => new Response(new ReadableStream({ start(c) { for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } }));
for (const [nome, terza] of [['destructive connector tool', ['a', 'mcp__github__delete_repo', { title: 'ALL' }]], ['plugin tool', ['a', JIRA, { t: 'x' }]]]) {
  test(`AB-R1-SSE (${nome}): in the stream, the same id after «Allow all» never runs the ${nome} without its card`, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'carte-ab-sse-'));
    t.after(() => { try { rimuoviCartellaDiProva(dir); } catch { /* gone */ } });
    const passo = [['a', GH, { title: '1' }], ['b', GH, { title: '2' }], terza];
    const fotogrammi = passo.map(([id, n, a], i) => ({ choices: [{ delta: { tool_calls: [{ index: i, id, type: 'function', function: { name: n, arguments: JSON.stringify(a) } }] } }] }));
    let n = 0;
    const carte = [], eseguite = [];
    await talosLavora({
      cartella: dir, task: { consegna: 'work' }, modello: 'x', chiave: 'finta', ...conR, onDelta: () => {},
      chiamaToolMcpFn: async (nome, a) => { eseguite.push(nome); return { content: [{ type: 'text', text: 'ok' }], isError: false }; },
      eseguiToolPluginFn: async (nome) => { eseguite.push(nome); return 'ok'; },
      chiediApprovazioneFn: async (a) => { carte.push(a); return a.gruppo ? TUTTE_SI : a.attrezzo === 'create_issue'; },
      fetchDiRete: async () => (n++ === 0 ? flusso(fotogrammi) : flusso([{ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] }])),
    });
    assert.ok(!eseguite.includes(terza[1]), `ran without a card: ${eseguite}`);
  });
}

/* the two pure pieces of the gate: which question keeps its own card (V11, `semprePersona`), and the limit of the card (R2) */
test('AB-V11: a question marked `semprePersona` (a call written as text, an emulated call) keeps its own card, like a forced sign', () => {
  assert.equal(domandaConSegnoForzato({ tipo: 'mcp_tool', semprePersona: true }), true);
  assert.equal(domandaConSegnoForzato({ tipo: 'plugin_tool', semprePersona: false }), false);
  assert.equal(domandaConSegnoForzato({ tipo: 'mcp_tool' }), false);
});

test('AB-V11b: every forced sign keeps its own card; a sign set to false or null does not', () => {
  for (const segno of ['segreto', 'trifecta', 'fuoriDalProgetto', 'contenutoSospetto', 'cancellazioneCritica']) {
    assert.equal(domandaConSegnoForzato({ [segno]: true }), true, segno);
    assert.equal(domandaConSegnoForzato({ [segno]: false }), false, segno);
    assert.equal(domandaConSegnoForzato({ [segno]: null }), false, segno);
  }
  assert.equal(domandaConSegnoForzato({ [CARTA_SEMPRE]: true }), true);
  assert.equal(domandaConSegnoForzato({ semprePersona: true, trifecta: false }), true);
  assert.equal(domandaConSegnoForzato(undefined), false);
});

test('AB-R2d: the limit of the card — 12 fields and 300 characters fit, 13 fields or 301 characters (as text or as JSON) do not', () => {
  const campi = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 'v']));
  assert.equal(argomentiEntroLaCarta({}), true);
  assert.equal(argomentiEntroLaCarta(campi(12)), true);
  assert.equal(argomentiEntroLaCarta(campi(13)), false);
  assert.equal(argomentiEntroLaCarta({ t: 'x'.repeat(300) }), true);
  assert.equal(argomentiEntroLaCarta({ t: 'x'.repeat(301) }), false);
  assert.equal(argomentiEntroLaCarta({ n: 12, ok: true, nulla: null }), true);
  assert.equal(argomentiEntroLaCarta({ lista: ['y'.repeat(296)] }), true, 'JSON ["…"] is 300 characters');
  assert.equal(argomentiEntroLaCarta({ lista: ['y'.repeat(297)] }), false, 'JSON ["…"] is 301 characters');
  for (const a of [null, undefined, [], ['a'], 'x', 3]) assert.equal(argomentiEntroLaCarta(a), false, JSON.stringify(a));
});

test('AB-R2e: a value JSON cannot write (a cycle) never shares a card; twelve values of 300 characters do', () => {
  const ciclo = {}; ciclo.me = ciclo;
  assert.equal(argomentiEntroLaCarta({ ciclo }), false);
  assert.equal(argomentiEntroLaCarta(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, 'z'.repeat(300)]))), true);
});

test('AB-R2e2: a value JSON cannot write (a BigInt) never shares a card', () => {
  assert.equal(argomentiEntroLaCarta({ grande: 10n }), false);
  assert.equal(argomentiEntroLaCarta({ piccolo: 10 }), true);
});

test('AB-R2f: arguments the model sent as a list, not an object, never share a card: one card for each call', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [[['a', LINT, ['x']], ['b', LINT, ['y']]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : false) });
  assert.deepEqual(idDelle(r.carte), ['a', 'b']);
  for (const c of r.carte) assert.equal(c.gruppo, undefined);
});

/* The second reviewer's ROSSO (13/11/2026 19:08, judge v1803): the limit counted the VALUES only. A field NAME of 289 characters with the
   value «DELETE EVERYTHING», next to a 300-character title, grouped: on the card the name pushed the value to 0 px, and «Allow all 2»
   ran a value the person never saw. The NAMES count too: past 64 characters (the length the providers give a tool name) a call asks
   its own card, and so does every other call of its tool. */
const NOME_LUNGO = `note_${'x'.repeat(280)}_END`; // 289 characters, as the reviewer's probe F4
const TITOLO_300 = `${'a'.repeat(283)} DELETE EVERYTHING`.slice(0, 300);

test('AB-R2g (F4): a field name of 289 characters, value «DELETE EVERYTHING», title of 300: no group, each call its own card, «all» covers its call only', async (t) => {
  assert.equal(NOME_LUNGO.length, 289);
  const r = await giro(t, { ...conR, passi: [[['a', GH, { title: 'short' }], ['b', GH, { [NOME_LUNGO]: 'DELETE EVERYTHING', title: TITOLO_300 }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : a.toolCallId === 'a') });
  assert.deepEqual(idDelle(r.carte), ['a', 'b'], `cards: ${chiAttrezzo(r)}`);
  for (const c of r.carte) assert.equal(c.gruppo, undefined, 'a call with a name past the limit shares no card');
  assert.deepEqual(r.eseguite.map(([, a]) => a.title), ['short'], 'the call the person never saw on a card never runs');
});

test('AB-R2h: the limit of a field NAME — 64 characters fit, 65 do not; the name counts with every field, the first or the last', () => {
  assert.equal(argomentiEntroLaCarta({ ['n'.repeat(64)]: 'v' }), true);
  assert.equal(argomentiEntroLaCarta({ ['n'.repeat(65)]: 'v' }), false);
  assert.equal(argomentiEntroLaCarta({ title: 'x', ['n'.repeat(65)]: 'v' }), false, 'a long name after a short one');
  assert.equal(argomentiEntroLaCarta({ [NOME_LUNGO]: 'DELETE EVERYTHING', title: TITOLO_300 }), false);
  assert.equal(argomentiEntroLaCarta({ ['n'.repeat(64)]: 'z'.repeat(300) }), true, 'a 64-character name with a 300-character value still fits');
  assert.equal(nucleo.CARATTERI_MASSIMI_DEL_NOME, 64, 'the limit of a field name is exported with the other two');
});

test('AB-R2i (Tool Forge): a 65-character name on one call: no group; with a 64-character name the same calls share one card', async (t) => {
  const oltre = await giro(t, { ...conR, passi: [[['a', NOTA, { day: 'mon' }], ['b', NOTA, { day: 'tue', ['k'.repeat(65)]: 'v' }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : true) });
  assert.deepEqual(idDelle(oltre.carte), ['a', 'b']);
  for (const c of oltre.carte) assert.equal(c.gruppo, undefined);
  const entro = await giro(t, { ...conR, passi: [[['a', NOTA, { day: 'mon' }], ['b', NOTA, { day: 'tue', ['k'.repeat(64)]: 'v' }]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : true) });
  assert.deepEqual(idDelle(entro.carte), ['a']);
  assert.equal(entro.eseguite.length, 2);
});

/* W5 of the second reviewer (alive): the CHANGELOG says «every call of that tool asks on its own» when one call is past the limit. With
   two calls nobody could tell; with THREE, the two that fit must not share a card either. */
for (const [nome, oltre] of [['a value of 301 characters', { title: 'y'.repeat(301) }], ['a field name of 289 characters', { [NOME_LUNGO]: 'DELETE EVERYTHING' }]]) {
  test(`AB-W5 (${nome}): three calls of one tool, one past the limit: three cards, none with a group; «all» covers its call only`, async (t) => {
    const r = await giro(t, { ...conR, passi: [[['a', GH, { title: '1' }], ['b', GH, { title: '2' }], ['c', GH, oltre]]], ospite: async (a) => (a.gruppo ? TUTTE_SI : a.toolCallId === 'a') });
    assert.deepEqual(idDelle(r.carte), ['a', 'b', 'c'], `cards: ${chiAttrezzo(r)}`);
    for (const c of r.carte) assert.equal(c.gruppo, undefined, 'every call of the tool asks on its own');
    assert.deepEqual(r.eseguite.map(([, a]) => a.title), ['1']);
  });
}
