/*
 * P018 in 0.2.2, the small round after the checker (13/11/2026; judge v1742 on the Desktop brief).
 * 1. A No that does not come from the person (the goal refuter's rule, an automatic yes on a card only the person may answer, the
 *    CLI with -p or «dontAsk») is marked `automatico: true` by whoever answers. It never enters the No of the turn, so the model is
 *    never told «the person already said no» for it: the next identical call is asked again and gets the true reason, the one that
 *    says who refused (checker point 9, probe CTRL-9). The person's own No stays, said the same way.
 * 2. In «Read only» a connector tool keeps its read-only sign only when `destructiveHint` is absent or exactly `false`: «"true"», 1,
 *    «"yes"», an object or null ask (wrong on the side of the question; checker mutants C4 and C5). Codex reads only booleans
 *    (`codex-rs/core/src/mcp_tool_call.rs:2595-2599`); the MCP schema 2025-06-18 types it `destructiveHint?: boolean`.
 * 3. A second test for C6 (mcp-session: the read-only sign only for `readOnlyHint === true`, not for something that looks true).
 * 4. After the reviewer of the small round (13/11/2026, YELLOW): his probes in the tests, each mutant he found alive (R1-R5, R7, R9)
 *    now killed by two tests, R8 (destructiveHint false alone is not read-only) by two, and the marks of the registry by two.
 *    The MCP schema 2025-06-18 (read 13/11/2026): `readOnlyHint?: boolean` «Default: false»; `destructiveHint?: boolean`
 *    «meaningful only when readOnlyHint == false»: a tool that says only «destructiveHint: false» is not a read-only tool.
 * No network, no key, fake profile.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CARTA_SEMPRE, talosLavora } from '../src/kernel/talosHarness.mjs';
import { preparaToolMcpPerSessione } from '../src/mcp-session.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SCHEMA = { type: 'object', properties: { title: { type: 'string' } } };
const TOOL_MCP = [{ name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: SCHEMA }];
const TOOL_PLUGIN = [{ nome: 'plugin__lint__check', pluginId: 'lint', nomeOriginale: 'check', descrizione: 'checks the code', parametri: { type: 'object', properties: { file: { type: 'string' } } } }];
const TOOL_FORGE = [{ name: 'forge_daily_note', description: 'writes the daily note', inputSchema: { type: 'object', properties: { day: { type: 'string' } } } }];
const IS = 'mcp__github__create_issue';
const DI_FUORI = new Set(['mcp_tool', 'plugin_tool', 'forge_tool']);
const FINE = { role: 'assistant', content: 'done', tool_calls: [] };
const tc = (id, nome, args) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(args ?? {}) } });
const GIA_DETTO = /the person already said no/u;
const MOTIVO_REGOLA = 'you are the TALOS goal refuter and work READ-ONLY: you may only run the goal contract commands, exactly as written ("npm test"). Nothing else ran.';
const MCP_CON = (annotations) => TOOL_MCP.map((t) => ({ ...t, annotations }));

/** One turn of the real kernel; `passi`: one element per model answer, an array of calls [id, name, arguments]. */
async function giro(t, { passi, ospite = async () => false, toolMcp = TOOL_MCP, ...altro }) {
  const dir = mkdtempSync(join(tmpdir(), 'p018-g3-'));
  t.after(() => { try { rimuoviCartellaDiProva(dir); } catch { /* already gone */ } });
  const risposte = [...passi.map((p) => ({ role: 'assistant', content: null, tool_calls: p.map(([id, n, a]) => tc(id, n, a)) })), FINE];
  const corpi = [], chieste = [], eseguite = [];
  await talosLavora({
    cartella: dir, task: { consegna: 'work' }, modello: 'x', chiave: 'finta', toolMcp, toolPlugin: TOOL_PLUGIN, toolForge: TOOL_FORGE,
    chiamaToolMcpFn: async (nome, a) => { eseguite.push([nome, a]); return { content: [{ type: 'text', text: 'ok' }], isError: false }; },
    eseguiToolPluginFn: async (nome, a) => { eseguite.push([nome, a]); return 'ok'; },
    eseguiToolForgeFn: async (nome, a) => { eseguite.push([nome, a]); return { status: 'succeeded', output: 'ok' }; },
    chiediApprovazioneFn: async (a) => { chieste.push(a); return ospite(a); },
    fetchDiRete: async (_u, o) => {
      const scelta = risposte[Math.min(corpi.length, risposte.length - 1)];
      corpi.push(JSON.parse(o.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
    },
    ...altro,
  });
  const esiti = corpi.at(-1).messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
  return { carte: chieste.filter((a) => DI_FUORI.has(a.tipo)), esiti, eseguite };
}
const idDelle = (carte) => carte.map((a) => a.toolCallId);

/* ── 1. who said no ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

test('G3-1a (CTRL-9): an automatic No (marked by the host) does not enter the No of the turn: the same call is asked again and keeps the true reason', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', passi: [[['c1', IS, { title: 'a' }]], [['c2', IS, { title: 'a' }]]],
    ospite: async () => ({ approvato: false, motivo: MOTIVO_REGOLA, automatico: true }),
  });
  assert.deepEqual(idDelle(r.carte), ['c1', 'c2'], 'the host is asked again: its rule answers again');
  assert.deepEqual(r.eseguite, []);
  for (const esito of r.esiti) {
    assert.doesNotMatch(esito, GIA_DETTO, esito);
    assert.match(esito, /goal refuter and work READ-ONLY/u, esito);
  }
});

test('G3-1b: the same for a plugin tool and a Forge tool, in «Read only» as well', async (t) => {
  for (const [nome, args] of [['plugin__lint__check', { file: 'a.js' }], ['forge_daily_note', { day: 'mon' }]]) {
    const r = await giro(t, {
      livelloAccesso: 'lettura', passi: [[['c1', nome, args]], [['c2', nome, args]]],
      ospite: async () => ({ approvato: false, motivo: 'the host CLI runs with -p: nobody can answer a card here.', automatico: true }),
    });
    assert.deepEqual(idDelle(r.carte), ['c1', 'c2'], nome);
    assert.doesNotMatch(r.esiti[1], GIA_DETTO, `${nome}: ${r.esiti[1]}`);
    assert.match(r.esiti[1], /nobody can answer a card here/u, nome);
  }
});

test('G3-1c (the reverse): the person\'s No, plain or with a reason, stays in the No of the turn and is said as the person\'s', async (t) => {
  for (const risposta of [false, { approvato: false, motivo: 'not this one' }, { approvato: false, motivo: 'not this one', automatico: false }]) {
    const r = await giro(t, { livelloAccesso: 'scrittura-progetto', passi: [[['c1', IS, { title: 'a' }]], [['c2', IS, { title: 'a' }]]], ospite: async () => risposta });
    assert.deepEqual(idDelle(r.carte), ['c1'], JSON.stringify(risposta));
    assert.match(r.esiti[1], GIA_DETTO, JSON.stringify(risposta));
  }
});

test('G3-1d: only the exact mark counts — `automatico: 1` or «"true"» is not the mark, the No stays the person\'s (one card)', async (t) => {
  for (const automatico of [1, 'true']) {
    const r = await giro(t, {
      livelloAccesso: 'scrittura-progetto', passi: [[['c1', IS, { title: 'a' }]], [['c2', IS, { title: 'a' }]]],
      ospite: async () => ({ approvato: false, motivo: 'not now', automatico }),
    });
    assert.deepEqual(idDelle(r.carte), ['c1'], String(automatico));
  }
});

test('G3-1d2 (second for the exact mark): a plugin tool in «Read only», `automatico: "yes"` is not the mark: one card, the person\'s No is said', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'lettura', passi: [[['c1', 'plugin__lint__check', { file: 'a.js' }]], [['c2', 'plugin__lint__check', { file: 'a.js' }]]],
    ospite: async () => ({ approvato: false, motivo: 'no', automatico: 'yes' }),
  });
  assert.deepEqual(idDelle(r.carte), ['c1']);
  assert.match(r.esiti[1], GIA_DETTO, r.esiti[1]);
});

/* the registry: the goal refuter (real) and the automatic yes turned into a no (real) carry the mark; the person's No does not */
async function scenaRegistro(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'p018-g3-r-'));
  const giri = [];
  const registry = createSessionRegistry({ cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: null, task: { id: 'task', consegna: 'x' } }),
    avviaSessioneFn: (input) => { giri.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); } });
  t.after(async () => { await registry.chiudi?.().catch?.(() => {}); try { await attendiScritture({ cartellaStore }); } catch { /* cleanup anyway */ } try { rimuoviCartellaDiProva(cartellaStore); } catch { /* already gone */ } });
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  return { registry, sessionId, chiedi: giri[0].chiediApprovazioneFn };
}
const CARTA_MCP = (id, extra = {}) => ({ tipo: 'mcp_tool', toolCallId: id, nome: IS, server: 'github', attrezzo: 'create_issue', ...extra });

test('G3-1e (registry, session-registry ~16158): an automatic yes on a card only the person may answer becomes a No marked automatic', { timeout: 20_000 }, async (t) => {
  const { registry, sessionId, chiedi } = await scenaRegistro(t);
  const risposta = chiedi(CARTA_MCP('c1', { [CARTA_SEMPRE]: true }));
  await new Promise((ok) => setTimeout(ok, 10));
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, true, { motivo: 'regola' });
  const esito = await risposta;
  assert.equal(esito.approvato, false);
  assert.match(esito.motivo, /only the person can approve/u);
  assert.equal(esito.automatico, true);
});

test('G3-1f (registry, the reverse): the person\'s No on the card, plain or with a reason, carries no mark', { timeout: 20_000 }, async (t) => {
  const { registry, sessionId, chiedi } = await scenaRegistro(t);
  const prima = chiedi(CARTA_MCP('c1'));
  await new Promise((ok) => setTimeout(ok, 10));
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, false);
  assert.equal(await prima, false);
  const seconda = chiedi(CARTA_MCP('c2'));
  await new Promise((ok) => setTimeout(ok, 10));
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, false, { motivo: 'not this one' });
  assert.deepEqual(await seconda, { approvato: false, motivo: 'not this one' });
});

test('G3-1e2 (second for the registry mark): an automatic yes of the mode on the research card also becomes a No marked automatic', { timeout: 20_000 }, async (t) => {
  const { registry, sessionId, chiedi } = await scenaRegistro(t);
  const risposta = chiedi({ tipo: 'research_start', toolCallId: 'c9', question: 'q', [CARTA_SEMPRE]: true });
  await new Promise((ok) => setTimeout(ok, 10));
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, true, { motivo: 'modalita' });
  const esito = await risposta;
  assert.deepEqual([esito.approvato, esito.automatico], [false, true]);
});

/* The goal refuter of the registry (real) runs the kernel (real) with a connector tool: the model calls the same tool twice. */
const aspetta = async (condizione, cosa, ms = 20_000) => {
  const fino = Date.now() + ms;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  assert.fail(`never happened: ${cosa}`);
};
function bancoConfutatore(cartellaStore, cartella, [nomeChiamata, argomentiChiamata] = [IS, { title: 'a' }]) {
  const giri = [], revisori = [];
  const { registro } = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    confutaObiettivoFn: undefined, // the TRUE refuter of the registry
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    avviaSessioneFn: (input) => {
      const confutatore = String(input.task?.consegna ?? '').includes('You are the TALOS goal refuter');
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length + revisori.length}` });
      if (confutatore) {
        const revisore = { esiti: [], carte: 0, eseguite: 0 };
        revisori.push(revisore);
        let n = 0;
        const fetchDiRete = async (_url, init) => {
          n += 1;
          const corpo = JSON.parse(init.body);
          revisore.esiti = corpo.messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
          const message = n <= 2
            ? { role: 'assistant', content: null, tool_calls: [tc(`c${n}`, nomeChiamata, argomentiChiamata)] }
            : { role: 'assistant', content: '{"refuted": null, "reason": "the tool was refused"}' };
          return new Response(JSON.stringify({ choices: [{ message, finish_reason: n <= 2 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
        };
        return talosLavora({
          cartella: input.cartella, task: input.task, modello: 'f', chiave: 'k', giriMassimi: 4, fetchDiRete,
          livelloAccesso: 'scrittura-progetto', toolMcp: TOOL_MCP, toolPlugin: TOOL_PLUGIN,
          chiamaToolMcpFn: async () => { revisore.eseguite += 1; return { content: [{ type: 'text', text: 'ok' }], isError: false }; },
          eseguiToolPluginFn: async () => { revisore.eseguite += 1; return 'ok'; },
          chiediApprovazioneFn: async (a) => { if (DI_FUORI.has(a.tipo)) revisore.carte += 1; return input.chiediApprovazioneFn(a); },
          onEvento: input.onEvento,
        }).then((esito) => {
          input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'rc', result: { detto: esito.detto } });
          return { ok: true, esito: { comeFinita: 'concluso', detto: esito.detto, messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: esito.detto }] } };
        });
      }
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      giri.push({ input, concludi: () => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }] } }); } });
      return attesa;
    },
  });
  return { registro, giri, revisori };
}

async function dueChiamateDelConfutatore(t, cartellaStore, chiamata) {
  const cartella = mkdtempSync(join(tmpdir(), 'p018-g3-prog-'));
  t.after(() => { try { rimuoviCartellaDiProva(cartella); } catch { /* already gone */ } });
  const b = bancoConfutatore(cartellaStore, cartella, chiamata);
  const { sessionId } = b.registro.avvia('task-vero', {});
  b.giri.at(-1).concludi();
  await passo();
  await b.registro.impostaObiettivo(sessionId, 'open the issue', { criteri: [{ testo: 'the command passes', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'the person\'s turn');
  b.giri.at(-1).concludi();
  await aspetta(() => b.revisori[0]?.esiti.length === 2, 'the two calls of the refuter');
  const [primo, secondo] = b.revisori[0].esiti;
  t.diagnostic(`second: ${secondo.slice(0, 140)}`);
  assert.equal(b.revisori[0].eseguite, 0, 'nothing ran');
  assert.equal(b.revisori[0].carte, 2, 'the refuter rule is asked for both calls');
  assert.match(primo, /goal refuter and work READ-ONLY/u);
  assert.doesNotMatch(secondo, GIA_DETTO, secondo);
  assert.match(secondo, /goal refuter and work READ-ONLY/u, secondo);
}

test('G3-1g (CTRL-9 end to end, registry and kernel real): the refuter\'s second identical call hears the refuter rule, never «the person already said no»', { timeout: 40_000 }, async (t) => conStore(t, (cartellaStore) => dueChiamateDelConfutatore(t, cartellaStore)));

test('G3-1h (second for the refuter mark): the same with a plugin tool', { timeout: 40_000 }, async (t) => conStore(t, (cartellaStore) => dueChiamateDelConfutatore(t, cartellaStore, ['plugin__lint__check', { file: 'a.js' }])));

/* ── 2. destructiveHint that is not a boolean ──────────────────────────────────────────────────────────────────────────────── */

const NON_BOOLEANI = ['true', 1, 'yes', {}, null];

test('G3-2a (C4): «Read only», readOnlyHint true with a destructiveHint that is not a boolean («"true"», 1, «"yes"», object, null): a card «only once»', async (t) => {
  for (const destructiveHint of NON_BOOLEANI) {
    const r = await giro(t, { livelloAccesso: 'lettura', toolMcp: MCP_CON({ readOnlyHint: true, destructiveHint }), passi: [[['c1', IS, { title: 'x' }]]] });
    assert.deepEqual(idDelle(r.carte), ['c1'], JSON.stringify(destructiveHint));
    assert.equal(r.carte[0].soloUnaVolta, true, JSON.stringify(destructiveHint));
    assert.deepEqual(r.eseguite, [], JSON.stringify(destructiveHint));
  }
});

test('G3-2d (second for the kernel line): «Read only», destructiveHint false runs without a card, null and an object ask', async (t) => {
  for (const [destructiveHint, carte] of [[false, 0], [null, 1], [{ value: true }, 1]]) {
    const r = await giro(t, { livelloAccesso: 'lettura', toolMcp: MCP_CON({ readOnlyHint: true, destructiveHint }), passi: [[['c1', IS, { title: 'x' }]]] });
    assert.equal(r.carte.length, carte, JSON.stringify(destructiveHint));
    assert.equal(r.eseguite.length, 1 - carte, JSON.stringify(destructiveHint));
  }
});

const preparaCon = (elenco) => preparaToolMcpPerSessione({ cartella: '/tmp/x', cartellaTrust: '/tmp/t' }, {
  serverMcpFidatiFn: async () => ({ fidati: [{ id: 'github', comando: 'npx', argomenti: [], allowlist: elenco.map((x) => x.name), hash: 'h' }], nonFidati: [] }),
  connettiServerMcpFn: async () => ({ client: {}, chiudi: async () => {} }),
  elencaToolMcpFn: async () => elenco,
  filtraToolMcpFn: (tool, allowlist) => tool.filter((x) => allowlist.includes(x.name)),
});

test('G3-2b (C5): mcp-session does not pass the read-only sign when destructiveHint is not a boolean; false and absent keep it', async () => {
  const elenco = [
    ...NON_BOOLEANI.map((destructiveHint, i) => ({ name: `t${i}`, description: 'x', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true, destructiveHint } })),
    { name: 'falso', description: 'x', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'assente', description: 'x', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  ];
  const { toolMcp } = await preparaCon(elenco);
  assert.deepEqual(toolMcp.map((x) => [x.nomeOriginale, x.annotations?.readOnlyHint === true]),
    [['t0', false], ['t1', false], ['t2', false], ['t3', false], ['t4', false], ['falso', true], ['assente', true]]);
});

test('G3-2c (C4/C5 from the source to the kernel): «Read only», a tool declared read-only with destructiveHint «"true"» asks', async (t) => {
  const { toolMcp } = await preparaCon([{ name: 'create_issue', description: 'x', inputSchema: SCHEMA, annotations: { readOnlyHint: true, destructiveHint: 'true' } }]);
  const r = await giro(t, { livelloAccesso: 'lettura', toolMcp, passi: [[['c1', toolMcp[0].name, { title: 'x' }]]] });
  assert.equal(r.carte.length, 1);
  assert.deepEqual(r.eseguite, []);
});

test('G3-2e (second for the mcp-session line): from the source to the kernel, destructiveHint null asks and false runs', async (t) => {
  const { toolMcp } = await preparaCon([
    { name: 'create_issue', description: 'x', inputSchema: SCHEMA, annotations: { readOnlyHint: true, destructiveHint: null } },
    { name: 'list_issues', description: 'x', inputSchema: SCHEMA, annotations: { readOnlyHint: true, destructiveHint: false } },
  ]);
  const [crea, lista] = toolMcp.map((x) => x.name);
  const r = await giro(t, { livelloAccesso: 'lettura', toolMcp, passi: [[['c1', crea, { title: 'x' }], ['c2', lista, { title: 'x' }]]] });
  assert.deepEqual(idDelle(r.carte), ['c1']);
  assert.deepEqual(r.eseguite.map(([n]) => n), [lista]);
});

/* ── 3. C6: the read-only sign only for readOnlyHint === true (a second test after G2-34) ──────────────────────────────────── */

test('G3-3a (C6): mcp-session passes the read-only sign only for readOnlyHint exactly true («"true"», 1, an object do not)', async () => {
  const elenco = [['vero', true], ['stringa', 'true'], ['uno', 1], ['oggetto', {}]]
    .map(([name, readOnlyHint]) => ({ name, description: 'x', inputSchema: { type: 'object' }, annotations: { readOnlyHint } }));
  const { toolMcp } = await preparaCon(elenco);
  assert.deepEqual(toolMcp.map((x) => [x.nomeOriginale, x.annotations?.readOnlyHint === true]), [['vero', true], ['stringa', false], ['uno', false], ['oggetto', false]]);
});

test('G3-3b (C6 from the source to the kernel): «Read only», readOnlyHint 1 asks; readOnlyHint true runs without a card', async (t) => {
  const { toolMcp } = await preparaCon([
    { name: 'list_issues', description: 'l', inputSchema: SCHEMA, annotations: { readOnlyHint: true } },
    { name: 'create_issue', description: 'c', inputSchema: SCHEMA, annotations: { readOnlyHint: 1 } },
  ]);
  const [lista, crea] = toolMcp.map((x) => x.name);
  const r = await giro(t, { livelloAccesso: 'lettura', toolMcp, passi: [[['c1', lista, { title: 'x' }], ['c2', crea, { title: 'x' }]]] });
  assert.deepEqual(idDelle(r.carte), ['c2']);
  assert.deepEqual(r.eseguite.map(([n]) => n), [lista]);
});

/* ── 4. the reviewer's probes (13/11/2026): every mutant he found alive dies by two tests ─────────────────────────────────────── */

const MCP_TOOL = (nomeOriginale, annotations) => ({ name: `mcp__github__${nomeOriginale}`, serverId: 'github', nomeOriginale, description: 'x', inputSchema: SCHEMA,
  ...(annotations === undefined ? {} : { annotations }) });
/* values that look false (or empty) without being the boolean false: the schema wants a boolean, anything else asks */
const QUASI_FALSI = [['"false"', 'false'], ['0', 0], ['""', ''], ['[]', []], ['{}', {}], ['"0"', '0'], ['[false]', [false]], ['{value:false}', { value: false }], ['NaN', Number.NaN], ['"False"', 'False']];

test('G3-4a (reviewer S1; R1, R3, R5): «Read only», readOnlyHint true with a destructiveHint that only looks false: 1 card and nothing runs, for each value', async (t) => {
  for (const [etichetta, destructiveHint] of QUASI_FALSI) {
    const r = await giro(t, { livelloAccesso: 'lettura', toolMcp: MCP_CON({ readOnlyHint: true, destructiveHint }), passi: [[['c1', IS, { title: 'x' }]]] });
    assert.deepEqual([r.carte.length, r.eseguite.length], [1, 0], etichetta);
  }
});

test('G3-4b (second for R1, R3, R5): one answer, five tools declared read-only: destructiveHint false runs, 0, «""», «"false"» and NaN each ask', async (t) => {
  const toolMcp = [MCP_TOOL('vero_falso', { readOnlyHint: true, destructiveHint: false }), MCP_TOOL('zero', { readOnlyHint: true, destructiveHint: 0 }),
    MCP_TOOL('vuoto', { readOnlyHint: true, destructiveHint: '' }), MCP_TOOL('stringa', { readOnlyHint: true, destructiveHint: 'false' }),
    MCP_TOOL('non_numero', { readOnlyHint: true, destructiveHint: Number.NaN })];
  const r = await giro(t, { livelloAccesso: 'lettura', toolMcp, passi: [toolMcp.map((x, i) => [`c${i + 1}`, x.name, { title: 'x' }])] });
  assert.deepEqual(idDelle(r.carte), ['c2', 'c3', 'c4', 'c5']);
  assert.deepEqual(r.eseguite.map(([n]) => n), ['mcp__github__vero_falso']);
});

test('G3-4c (reviewer S2; R2, R4, R9): mcp-session passes the read-only sign only for readOnlyHint true with destructiveHint absent or false', async () => {
  const elenco = [
    ...QUASI_FALSI.map(([, destructiveHint], i) => ({ name: `d${i}`, description: 'x', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true, destructiveHint } })),
    ...[['ro_stringa', 'true'], ['ro_uno', 1], ['ro_array', [true]], ['ro_oggetto', { value: true }], ['ro_assente', undefined]]
      .map(([name, readOnlyHint]) => ({ name, description: 'x', inputSchema: { type: 'object' }, annotations: { ...(readOnlyHint === undefined ? {} : { readOnlyHint }), destructiveHint: false } })),
    { name: 'ann_stringa', description: 'x', inputSchema: { type: 'object' }, annotations: 'readOnlyHint' },
    { name: 'ann_null', description: 'x', inputSchema: { type: 'object' }, annotations: null },
    { name: 'proto', description: 'x', inputSchema: { type: 'object' }, annotations: JSON.parse('{"readOnlyHint":true,"__proto__":{"destructiveHint":true}}') },
  ];
  const { toolMcp } = await preparaCon(elenco);
  assert.equal(toolMcp.length, elenco.length);
  assert.deepEqual(toolMcp.filter((x) => x.annotations?.readOnlyHint === true).map((x) => x.nomeOriginale), ['proto']);
});

test('G3-4d (second for R2, R4, R9): from the source to the kernel in «Read only»: destructiveHint 0, «"false"», or false without readOnlyHint ask', async (t) => {
  const { toolMcp } = await preparaCon([
    { name: 'list_issues', description: 'l', inputSchema: SCHEMA, annotations: { readOnlyHint: true } },
    { name: 'zero', description: 'z', inputSchema: SCHEMA, annotations: { readOnlyHint: true, destructiveHint: 0 } },
    { name: 'stringa', description: 's', inputSchema: SCHEMA, annotations: { readOnlyHint: true, destructiveHint: 'false' } },
    { name: 'solo_falso', description: 'f', inputSchema: SCHEMA, annotations: { destructiveHint: false } },
  ]);
  const nomi = toolMcp.map((x) => x.name);
  const r = await giro(t, { livelloAccesso: 'lettura', toolMcp, passi: [nomi.map((n, i) => [`c${i + 1}`, n, { title: 'x' }])] });
  assert.deepEqual(idDelle(r.carte), ['c2', 'c3', 'c4']);
  assert.deepEqual(r.eseguite.map(([n]) => n), [nomi[0]]);
});

test('G3-4e (reviewer S3): hints that change between turns of one conversation, false -> «"true"» -> false -> absent: cards 0, 1, 1, 1', async (t) => {
  const consensiSessione = {};
  const carte = [];
  for (const destructiveHint of [false, 'true', false, undefined]) {
    const { toolMcp } = await preparaCon([{ name: 'create_issue', description: 'x', inputSchema: SCHEMA, annotations: destructiveHint === undefined ? { readOnlyHint: true } : { readOnlyHint: true, destructiveHint } }]);
    const r = await giro(t, { livelloAccesso: 'lettura', toolMcp, consensiSessione, passi: [[['c1', toolMcp[0].name, { title: 'x' }]]] });
    carte.push(r.carte.length);
  }
  assert.deepEqual(carte, [0, 1, 1, 1], 'a sign that changed is never trusted again in that conversation');
});

const RISPOSTA_AUTOMATICA = { approvato: false, motivo: MOTIVO_REGOLA, automatico: true };
const LETTURA = (esito) => (GIA_DETTO.test(esito) ? 'GIA' : /goal refuter/u.test(esito) ? 'REGOLA' : 'ALTRO');

test('G3-4f (reviewer S4; R7): the person\'s No on A, then an automatic No on B, then A again: A stays «already said no», B asks again', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto',
    passi: [[['c1', IS, { title: 'a' }]], [['c2', IS, { title: 'b' }]], [['c3', IS, { title: 'a' }]], [['c4', IS, { title: 'b' }]]],
    ospite: async (a) => (a.toolCallId === 'c1' ? false : RISPOSTA_AUTOMATICA),
  });
  assert.deepEqual(idDelle(r.carte), ['c1', 'c2', 'c4']);
  assert.deepEqual(r.esiti.map(LETTURA), ['ALTRO', 'REGOLA', 'GIA', 'REGOLA']);
});

test('G3-4g (second for R7): «Read only», the person\'s No on a plugin tool, then an automatic No on a connector tool: the plugin call again is not asked', async (t) => {
  const P = ['plugin__lint__check', { file: 'a.js' }];
  const r = await giro(t, {
    livelloAccesso: 'lettura', passi: [[['c1', ...P]], [['c2', IS, { title: 'b' }]], [['c3', ...P]]],
    ospite: async (a) => (a.toolCallId === 'c1' ? { approvato: false, motivo: 'not this one' } : RISPOSTA_AUTOMATICA),
  });
  assert.deepEqual(idDelle(r.carte), ['c1', 'c2']);
  assert.match(r.esiti[2], GIA_DETTO, r.esiti[2]);
  assert.deepEqual(r.eseguite, []);
});

test('G3-4h (reviewer S5): an automatic No, then the same call asks and the person says no, then the third call is not asked', async (t) => {
  let n = 0;
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto',
    passi: [[['c1', IS, { title: 'a' }]], [['c2', IS, { title: 'a' }]], [['c3', IS, { title: 'a' }]]],
    ospite: async () => (n++ === 0 ? RISPOSTA_AUTOMATICA : { approvato: false, motivo: 'not this' }),
  });
  assert.deepEqual(idDelle(r.carte), ['c1', 'c2']);
  assert.deepEqual(r.esiti.map(LETTURA), ['REGOLA', 'ALTRO', 'GIA']);
});

/* R8: the kernel reads the read-only sign only from `readOnlyHint === true` (talosHarness.mjs, `segnoDichiarato`); a host that does not
   validate the schema can hand the kernel a raw «destructiveHint: false» without readOnlyHint, and that is not a read-only tool. */
test('G3-4i (R8): «Read only», a connector tool that says only destructiveHint false is not read-only: a card «only once», nothing runs', async (t) => {
  const r = await giro(t, { livelloAccesso: 'lettura', toolMcp: MCP_CON({ destructiveHint: false }), passi: [[['c1', IS, { title: 'x' }]]] });
  assert.deepEqual(idDelle(r.carte), ['c1']);
  assert.equal(r.carte[0].soloUnaVolta, true);
  assert.deepEqual(r.eseguite, []);
});

test('G3-4j (second for R8): one answer in «Read only»: readOnlyHint false or «"true"» with destructiveHint false ask, readOnlyHint true runs', async (t) => {
  const toolMcp = [MCP_TOOL('ro_falso', { readOnlyHint: false, destructiveHint: false }), MCP_TOOL('ro_stringa', { readOnlyHint: 'true', destructiveHint: false }),
    MCP_TOOL('ro_vero', { readOnlyHint: true, destructiveHint: false })];
  const r = await giro(t, { livelloAccesso: 'lettura', toolMcp, passi: [toolMcp.map((x, i) => [`c${i + 1}`, x.name, { title: 'x' }])] });
  assert.deepEqual(idDelle(r.carte), ['c1', 'c2']);
  assert.deepEqual(r.eseguite.map(([n]) => n), ['mcp__github__ro_vero']);
});

test('G3-4k (reviewer S6, the reverse): in the registry a No of the person stays the person\'s, also with a reason or an `automatico` passed in process', { timeout: 20_000 }, async (t) => {
  const { registry, sessionId, chiedi } = await scenaRegistro(t);
  const esiti = [];
  for (const [i, opz] of [{ motivo: 'regola' }, { motivo: 'modalita', automatico: true }].entries()) {
    const risposta = chiedi(CARTA_MCP(`x${i}`, { [CARTA_SEMPRE]: true }));
    await new Promise((ok) => setTimeout(ok, 10));
    registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, false, opz);
    esiti.push(await risposta);
  }
  for (const esito of esiti) assert.notEqual(esito?.automatico, true, JSON.stringify(esito));
});

test('G3-4l (second for the registry mark, any automatic reason): the classifier\'s yes on a card of the person becomes a No marked automatic', { timeout: 20_000 }, async (t) => {
  const { registry, sessionId, chiedi } = await scenaRegistro(t);
  const risposta = chiedi(CARTA_MCP('c7', { [CARTA_SEMPRE]: true }));
  await new Promise((ok) => setTimeout(ok, 10));
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, true, { motivo: 'classificatore' });
  const esito = await risposta;
  assert.deepEqual([esito.approvato, esito.automatico], [false, true]);
  assert.match(esito.motivo, /only the person can approve "mcp_tool"/u);
});
