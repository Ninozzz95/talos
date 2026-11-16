/*
 * P018 in 0.2.2, the one repair round after the three reviewers (13/11/2026; judge v1734 on the Desktop brief).
 * 1. The No of a turn is forgotten only when the PERSON speaks again in that turn (a queued message they wrote, an answer to a
 *    question): then the same call asks again. An automatic event (a child's result, a notice, a background exit, a cancelled
 *    question) never forgets it. Reviewer A, RA-08 and RA-09.
 * 2. «The same call» compares the arguments with their keys sorted, nested objects and objects inside arrays included; the order of
 *    an array still counts. Reviewer A, RA-01 and RA-02.
 * 3. A No that no person gave (a rule «deny», nobody to ask) never enters the No of the turn and never reaches the model as «the
 *    person already said no». Reviewer A RA-16 (mutant RM3), reviewer B M2, reviewer C C4.
 * 4. In «Read only» a connector tool declared read-only AND destructive asks, as in Codex (`codex-rs/core/src/mcp_tool_call.rs:2595-2599`:
 *    `destructive_hint == Some(true)` ⇒ approval, before `read_only_hint` is read). Reviewer A, RA-12. MCP spec 2025-06-18 Tools
 *    (read 13/11): annotations are untrusted «unless they come from trusted servers».
 * Reviewer C (C10, C12): the key of the No holds the kind and the server or plugin; a No that carries a reason counts as a No.
 * The probes of reviewers A, B and C are kept with their ids. No network, no key, fake profile.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { preparaToolMcpPerSessione } from '../src/mcp-session.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SCHEMA = { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, opts: { type: 'object' }, items: { type: 'array' } } };
const TOOL_MCP = [{ name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: SCHEMA }];
const TOOL_PLUGIN = [{ nome: 'plugin__lint__check', pluginId: 'lint', nomeOriginale: 'check', descrizione: 'checks the code', parametri: { type: 'object', properties: { file: { type: 'string' } } } }];
const TOOL_FORGE = [{ name: 'forge_daily_note', description: 'writes the daily note', inputSchema: { type: 'object', properties: { day: { type: 'string' } } } }];
const IS = 'mcp__github__create_issue';
const DI_FUORI = new Set(['mcp_tool', 'plugin_tool', 'forge_tool']);
const FINE = { role: 'assistant', content: 'done', tool_calls: [] };
const tc = (id, nome, args) => ({ id, type: 'function', function: { name: nome, arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}) } });
const DOMANDE = [{ id: 'q', question: 'Create it?', why: 'You said no to the card.', options: [{ label: 'Yes', description: 'create', recommended: true }, { label: 'No', description: 'skip' }] }];

/**
 * One turn (one talosLavora). `passi`: one element per model answer — an array of calls [id, name, arguments], or a string for an
 *   answer with text only. `stato.risposte` counts the answers the model gave so far, `stato.carte` the outside-tool cards answered.
 */
async function giro(t, { passi, ospite = async () => false, toolMcp = TOOL_MCP, coda, ...altro }) {
  const dir = mkdtempSync(join(tmpdir(), 'p018-cura-'));
  t.after(() => { try { rimuoviCartellaDiProva(dir); } catch { /* already gone */ } });
  const risposte = [...passi.map((p) => (typeof p === 'string'
    ? { role: 'assistant', content: p, tool_calls: [] }
    : { role: 'assistant', content: null, tool_calls: p.map(([id, n, a]) => tc(id, n, a)) })), FINE];
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
  const esiti = corpi.at(-1).messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
  return { carte: chieste.filter((a) => DI_FUORI.has(a.tipo)), esiti, eseguite };
}
const idDelle = (carte) => carte.map((a) => a.toolCallId);
const GIA_DETTO = /the person already said no/u;
/** a queue that delivers `voce` once, after `dopo` outside-tool cards were answered (the moment RA-08 uses) */
const unaVoltaDopoLaCarta = (voce, dopo = 1) => { let fatto = false; return (stato) => (fatto || stato.carte < dopo ? null : (fatto = true, voce)); };

/* ── 1. the No of the turn and who speaks ──────────────────────────────────────────────────────────────────────────────────── */

test('CURA-1a (RA-08): after the No the person writes «yes, go ahead» (queued after the tools): the same call asks again', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', passi: [[['c1', IS, { title: 'a' }]], [['c2', IS, { title: 'a' }]], [['c3', IS, { title: 'a' }]]],
    coda: unaVoltaDopoLaCarta({ testo: 'yes, go ahead, create it', dallaPersona: true }),
  });
  /* c2 asks again (the person spoke); its No is a new No of the turn, so c3 gets it without a card */
  assert.deepEqual(idDelle(r.carte), ['c1', 'c2']);
  assert.doesNotMatch(r.esiti[1], GIA_DETTO, r.esiti[1]);
  assert.match(r.esiti[2], GIA_DETTO, r.esiti[2]);
  assert.deepEqual(r.eseguite, []);
});

test('CURA-1b: the same when the person\'s message arrives after an answer with text only (the end-of-turn queue)', async (t) => {
  let fatto = false;
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', passi: [[['c1', IS, { title: 'a' }]], 'Should I create it anyway?', [['c2', IS, { title: 'a' }]]],
    /* answer 2 is the text-only one: the queue gives the message only there, never after the tools of answer 1 */
    coda: (stato) => (fatto || stato.risposte !== 2 ? null : (fatto = true, { testo: 'yes, create it', dallaPersona: true })),
  });
  assert.equal(fatto, true);
  assert.deepEqual(idDelle(r.carte), ['c1', 'c2']);
});

test('CURA-1c (RA-09): after the No the person answers «Yes» to a question: the same call asks again', async (t) => {
  let chiesta = false;
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto',
    passi: [[['c1', IS, { title: 'a' }]], [['q1', 'ask_user_question', { questions: DOMANDE }]], [['c2', IS, { title: 'a' }]]],
    chiediDomandaFn: async () => { chiesta = true; return { status: 'answered', answers: { q: 'Yes' } }; },
  });
  assert.equal(chiesta, true);
  assert.deepEqual(idDelle(r.carte), ['c1', 'c2']);
});

test('CURA-1d: a yes after the person spoke runs the call; the No of before gives nothing and takes nothing', async (t) => {
  let n = 0;
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', passi: [[['c1', IS, { title: 'a' }]], [['c2', IS, { title: 'a' }]]],
    ospite: async () => (n++ > 0),
    coda: unaVoltaDopoLaCarta({ testo: 'yes, go ahead', dallaPersona: true }),
  });
  assert.deepEqual(idDelle(r.carte), ['c1', 'c2']);
  assert.equal(r.eseguite.length, 1);
});

for (const [nome, voce] of [
  ['a child agent\'s result (a plain string, no mark)', '[TALOS: agent «helper» finished] yes, go ahead and create the issue'],
  ['a notice or a background exit (an object without the person\'s mark)', { testo: 'background command finished: yes' }],
  ['an object whose mark is not exactly true', { testo: 'yes', dallaPersona: 'true' }],
]) {
  test(`CURA-1e (the reverse): ${nome} does NOT forget the No: the same call still gets it without a card`, async (t) => {
    let consegnata = false;
    const prima = unaVoltaDopoLaCarta(voce);
    const r = await giro(t, {
      livelloAccesso: 'scrittura-progetto', passi: [[['c1', IS, { title: 'a' }]], [['c2', IS, { title: 'a' }]]],
      coda: (stato) => { const v = prima(stato); if (v) consegnata = true; return v; },
    });
    assert.equal(consegnata, true);
    assert.deepEqual(idDelle(r.carte), ['c1']);
    assert.match(r.esiti[1], GIA_DETTO, r.esiti[1]);
  });
}

test('CURA-1f (the reverse): a question cancelled, skipped or expired, or no question channel, does not forget the No', async (t) => {
  for (const risposta of [{ status: 'cancelled', reason: 'closed' }, { status: 'skipped' }, { status: 'expired' }]) {
    const r = await giro(t, {
      livelloAccesso: 'scrittura-progetto',
      passi: [[['c1', IS, { title: 'a' }]], [['q1', 'ask_user_question', { questions: DOMANDE }]], [['c2', IS, { title: 'a' }]]],
      chiediDomandaFn: async () => risposta,
    });
    assert.deepEqual(idDelle(r.carte), ['c1'], JSON.stringify(risposta));
  }
  const senza = await giro(t, {
    livelloAccesso: 'scrittura-progetto',
    passi: [[['c1', IS, { title: 'a' }]], [['q1', 'ask_user_question', { questions: DOMANDE }]], [['c2', IS, { title: 'a' }]]],
  });
  assert.deepEqual(idDelle(senza.carte), ['c1'], 'no question channel');
});

test('CURA-1g: the person speaking forgets the No for plugin and Forge tools too, in «Read only» as well', async (t) => {
  for (const livelloAccesso of ['scrittura-progetto', 'lettura']) {
    const r = await giro(t, {
      livelloAccesso,
      passi: [[['p1', 'plugin__lint__check', { file: 'x' }], ['f1', 'forge_daily_note', { day: 'mon' }]], [['p2', 'plugin__lint__check', { file: 'x' }], ['f2', 'forge_daily_note', { day: 'mon' }]]],
      coda: unaVoltaDopoLaCarta({ testo: 'yes, both', dallaPersona: true }, 2),
    });
    assert.deepEqual(idDelle(r.carte), ['p1', 'f1', 'p2', 'f2'], livelloAccesso);
  }
});

/* ── 2. «the same call»: keys sorted ───────────────────────────────────────────────────────────────────────────────────────── */

for (const [nome, a, b] of [
  ['CURA-2a (RA-01) keys in another order', { title: 'a', body: 'b' }, { body: 'b', title: 'a' }],
  ['CURA-2b (RA-02) a nested object in another order', { opts: { x: 1, y: { p: 1, q: 2 } } }, { opts: { y: { q: 2, p: 1 }, x: 1 } }],
  ['CURA-2c objects inside an array in another order', { items: [{ k: 'a', v: 1 }, { k: 'b', v: 2 }] }, { items: [{ v: 1, k: 'a' }, { v: 2, k: 'b' }] }],
  ['CURA-2d the raw JSON text spaced differently and reordered', '{"title":"a","body":"b"}', '{ "body" : "b", "title" : "a" }'],
]) {
  test(`${nome}: after a No, one card only (before: two)`, async (t) => {
    const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [[['c1', IS, a]], [['c2', IS, b]]] });
    assert.deepEqual(idDelle(r.carte), ['c1']);
    assert.match(r.esiti[1], GIA_DETTO, r.esiti[1]);
    assert.deepEqual(r.eseguite, []);
  });
}

for (const [nome, a, b] of [
  ['the order of an array', { items: ['a', 'b'] }, { items: ['b', 'a'] }],
  ['a nested value', { opts: { x: 1 } }, { opts: { x: 2 } }],
  ['a number against a string', { opts: { x: 1 } }, { opts: { x: '1' } }],
  ['a key more', { title: 'a' }, { title: 'a', body: '' }],
]) {
  test(`CURA-2e (the reverse): ${nome} is another call: it asks again`, async (t) => {
    const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [[['c1', IS, a]], [['c2', IS, b]]] });
    assert.deepEqual(idDelle(r.carte), ['c1', 'c2']);
  });
}

/* ── 3. a No no person gave ────────────────────────────────────────────────────────────────────────────────────────────────── */

test('RA-16 (reviewer A, RM3): after a refusal by the RULE «deny» (no person), the same call keeps the rule\'s reason', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { mcp_tool: 'nega' }, passi: [[['c1', IS, { title: 'a' }]], [['c2', IS, { title: 'a' }]]] });
  assert.deepEqual(r.eseguite, []);
  assert.deepEqual(r.carte, []);
  assert.doesNotMatch(r.esiti[1], GIA_DETTO, r.esiti[1]);
  assert.equal(r.esiti[1], r.esiti[0], 'the second refusal is the rule\'s, word for word');
});

test('REV-B-M2 (reviewer B): without anyone to ask, the second identical call is not told the person said no', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', chiediApprovazioneFn: undefined, passi: [[['c1', IS, { title: 'a' }]], [['c2', IS, { title: 'a' }]]] });
  assert.deepEqual(r.eseguite, []);
  assert.doesNotMatch(r.esiti[1], GIA_DETTO, r.esiti[1]);
});

test('REV-B-M2b (reviewer B): a host rule «nega» on the tool: the second identical call keeps the rule reason', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { mcp_tool: 'nega' }, passi: [[['c1', IS, { title: 'a' }]], [['c2', IS, { title: 'a' }]]] });
  assert.deepEqual(r.eseguite, []);
  assert.doesNotMatch(r.esiti[1], GIA_DETTO, r.esiti[1]);
});

test('REV-C-3 (reviewer C, C4): with nobody to ask, no refusal ever says «the person already said no»', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', chiediApprovazioneFn: undefined, passi: [[['c1', IS, { title: 'a' }]], [['c2', IS, { title: 'a' }]]] });
  assert.deepEqual(r.eseguite, []);
  assert.equal(r.esiti.length, 2);
  for (const e of r.esiti) assert.doesNotMatch(e, GIA_DETTO, e);
});

/* ── reviewer C: kind in the key, a No with a reason ───────────────────────────────────────────────────────────────────────── */

const MCP_LINT = [{ name: 'mcp__lint__check', serverId: 'lint', nomeOriginale: 'check', description: 'c', inputSchema: { type: 'object', properties: { file: { type: 'string' } } } }];

test('REV-C-1 (reviewer C, C12): a No WITH a reason ({approvato:false, motivo}) also counts: the same call is not asked twice', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', toolMcp: MCP_LINT, ospite: async () => ({ approvato: false, motivo: 'not now' }),
    passi: [[['c1', 'mcp__lint__check', { file: 'x' }]], [['c2', 'mcp__lint__check', { file: 'x' }]]],
  });
  assert.deepEqual(idDelle(r.carte), ['c1']);
  assert.deepEqual(r.eseguite, []);
});

test('REV-C-2 (reviewer C, C10): a No to the connector «lint» tool «check» does not refuse the plugin «lint» tool «check» with the same arguments', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', toolMcp: MCP_LINT,
    passi: [[['c1', 'mcp__lint__check', { file: 'x' }]], [['p1', 'plugin__lint__check', { file: 'x' }]]],
  });
  assert.deepEqual(idDelle(r.carte), ['c1', 'p1']);
});

/* ── 4. read-only and destructive together ask ─────────────────────────────────────────────────────────────────────────────── */

const MCP_CON = (annotations) => TOOL_MCP.map((t) => ({ ...t, annotations }));

test('CURA-4a (RA-12): «Read only», a tool declared readOnlyHint AND destructiveHint: a card «only once», as in Codex', async (t) => {
  const r = await giro(t, { livelloAccesso: 'lettura', toolMcp: MCP_CON({ readOnlyHint: true, destructiveHint: true }), passi: [[['c1', IS, { title: 'x' }]]] });
  assert.deepEqual(idDelle(r.carte), ['c1']);
  assert.equal(r.carte[0].soloUnaVolta, true);
  assert.deepEqual(r.eseguite, []);
});

test('CURA-4b (the reverse): readOnlyHint true with destructiveHint false or absent still runs without a card in «Read only»', async (t) => {
  for (const annotations of [{ readOnlyHint: true, destructiveHint: false }, { readOnlyHint: true }]) {
    const r = await giro(t, { livelloAccesso: 'lettura', toolMcp: MCP_CON(annotations), passi: [[['c1', IS, { title: 'x' }]]] });
    assert.deepEqual(r.carte, [], JSON.stringify(annotations));
    assert.equal(r.eseguite.length, 1, JSON.stringify(annotations));
  }
});

test('CURA-4c (RA-12 at the source): mcp-session does not pass the read-only sign of a tool its server also declares destructive', async () => {
  const { toolMcp } = await preparaToolMcpPerSessione({ cartella: '/tmp/x', cartellaTrust: '/tmp/t' }, {
    serverMcpFidatiFn: async () => ({ fidati: [{ id: 'github', comando: 'npx', argomenti: [], allowlist: ['list_issues', 'delete_issue', 'get_issue'], hash: 'h' }], nonFidati: [] }),
    connettiServerMcpFn: async () => ({ client: {}, chiudi: async () => {} }),
    elencaToolMcpFn: async () => [
      { name: 'list_issues', description: 'l', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true, destructiveHint: false } },
      { name: 'delete_issue', description: 'd', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true, destructiveHint: true } },
      { name: 'get_issue', description: 'g', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
    ],
    filtraToolMcpFn: (tool, allowlist) => tool.filter((x) => allowlist.includes(x.name)),
  });
  assert.deepEqual(toolMcp.map((x) => [x.nomeOriginale, x.annotations?.readOnlyHint === true]), [['list_issues', true], ['delete_issue', false], ['get_issue', true]]);
  assert.equal(toolMcp[1].annotations, undefined, 'nothing of what the server wrote travels for that tool');
});

/* ── second tests: every new line killed by one test only gets another (mutants K2, K4, K5, K9, K11, K14) ───────────────────── */

test('CURA-1h (second for K2): at the end of an answer, an object whose mark is 1 (not true) keeps the No', async (t) => {
  let fatto = false;
  const r = await giro(t, {
    livelloAccesso: 'su-richiesta', passi: [[['f1', 'forge_daily_note', { day: 'mon' }]], 'Shall I?', [['f2', 'forge_daily_note', { day: 'mon' }]]],
    coda: (stato) => (fatto || stato.risposte !== 2 ? null : (fatto = true, { testo: 'yes', dallaPersona: 1 })),
  });
  assert.equal(fatto, true);
  assert.deepEqual(idDelle(r.carte), ['f1']);
});

test('CURA-1i (second for K4): «Read only», an answer to a question forgets the No of a plugin tool too', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'lettura',
    passi: [[['p1', 'plugin__lint__check', { file: 'x' }]], [['q1', 'ask_user_question', { questions: DOMANDE }]], [['p2', 'plugin__lint__check', { file: 'x' }]]],
    chiediDomandaFn: async () => ({ status: 'answered', answers: { q: 'Yes' } }),
  });
  assert.deepEqual(idDelle(r.carte), ['p1', 'p2']);
});

test('CURA-1j (second for K5): «On request», a question with no answer (timeout) keeps the No of a Forge tool', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'su-richiesta',
    passi: [[['f1', 'forge_daily_note', { day: 'mon' }]], [['q1', 'ask_user_question', { questions: DOMANDE }]], [['f2', 'forge_daily_note', { day: 'mon' }]]],
    chiediDomandaFn: async () => ({ status: 'timeout' }),
  });
  assert.deepEqual(idDelle(r.carte), ['f1']);
  assert.match(r.esiti.at(-1), GIA_DETTO, r.esiti.at(-1));
});

test('CURA-4d (second for K9): «Read only», read-only and destructive: every call asks, a yes once is not kept', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'lettura', toolMcp: MCP_CON({ readOnlyHint: true, destructiveHint: true }), ospite: async () => true,
    passi: [[['c1', IS, { title: 'x' }]], [['c2', IS, { title: 'y' }]]],
  });
  assert.deepEqual(idDelle(r.carte), ['c1', 'c2']);
  assert.equal(r.eseguite.length, 2);
});

test('CURA-4e (second for K11): from mcp-session to the kernel, a tool declared read-only and destructive asks in «Read only»', async (t) => {
  const { toolMcp } = await preparaToolMcpPerSessione({ cartella: '/tmp/x', cartellaTrust: '/tmp/t' }, {
    serverMcpFidatiFn: async () => ({ fidati: [{ id: 'github', comando: 'npx', argomenti: [], allowlist: ['delete_issue'], hash: 'h' }], nonFidati: [] }),
    connettiServerMcpFn: async () => ({ client: {}, chiudi: async () => {} }),
    elencaToolMcpFn: async () => [{ name: 'delete_issue', description: 'd', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true, destructiveHint: true } }],
    filtraToolMcpFn: (tool, allowlist) => tool.filter((x) => allowlist.includes(x.name)),
  });
  const r = await giro(t, { livelloAccesso: 'lettura', toolMcp, passi: [[['c1', toolMcp[0].name, {}]]] });
  assert.deepEqual(idDelle(r.carte), ['c1']);
  assert.deepEqual(r.eseguite, []);
});

test('REV-C-2b (second for C10/K8b): a No to «create issue» of the connector «github» does not refuse it on the connector «gitlab»', async (t) => {
  const due = [...TOOL_MCP, { name: 'mcp__gitlab__create_issue', serverId: 'gitlab', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: SCHEMA }];
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', toolMcp: due, passi: [[['c1', IS, { title: 'a' }]], [['g1', 'mcp__gitlab__create_issue', { title: 'a' }]]] });
  assert.deepEqual(idDelle(r.carte), ['c1', 'g1']);
});

test('REV-C-1b (second for K14): a No WITH a reason on a plugin tool also counts: one card', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', ospite: async () => ({ approvato: false, motivo: 'not this file' }),
    passi: [[['p1', 'plugin__lint__check', { file: 'x' }]], [['p2', 'plugin__lint__check', { file: 'x' }]]],
  });
  assert.deepEqual(idDelle(r.carte), ['p1']);
  assert.deepEqual(r.eseguite, []);
});
