/*
 * Twin repair of 0.2.2, round 3 (owner 14/11 09:56 «Nella 0.2.2», judge v1852 and the five corrections of v1853): the card of a
 * connector tool (and of a plugin or Tool Forge tool) did not say WHAT goes out. `cancelloDelloStrumentoDiFuori` received the arguments
 * and used them only for the signature of the No; the action given to the gate had none (round 2 probe: `create_issue` with 3 arguments
 * ⇒ 1 card, no arguments). MCP 2025-06-18, server/tools, Security considerations: «Clients SHOULD show tool inputs to the user before
 * calling the server, to avoid malicious or accidental data exfiltration».
 * What these tests ask:
 * - the action of the card carries `argomenti`, for the three kinds, MASKED (a field named like a secret, at any depth, and a value shaped
 *   like a key) and THEN cut at the cap with the cut sign; the cut never leaves a piece of a secret;
 * - the No of the turn still compares the REAL arguments, never the masked ones;
 * - the masked copy goes ONLY to the card: the tool receives the real arguments byte for byte, and the model never sees the masked copy;
 * - on the disk (real registry, real store, profile under the test TEMP) the secret never appears through the new field: in its own
 *   file, `carta-argomenti-connettore-022-disco.test.mjs`.
 * As Hermes (`tools/mcp_tool_handlers.py:87-118`: field names masked recursively, text redacted, «Redact before truncating so a cut cannot
 * split a secret past its pattern», cap 1,200 with `[arguments truncated]`) and Codex (`codex-rs/core/src/mcp_tool_call.rs:2242-2254`: name
 * and value of every parameter on the approval).
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as K from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { talosLavora } = K;
/* the cap the kernel declares in one place; 1,200 is Hermes's number (`_TRUST_GATE_ARGUMENTS_MAX_CHARS`) */
const TETTO = K.TETTO_ARGOMENTI_DELLA_CARTA?.caratteriPerValore ?? 1_200;
const OSCURATO = '[redacted]';
const SEGNO = '…';
/* fake secrets made by the test, never real ones: the shapes of `forme-di-segreto.mjs` (sk- with a digit, ghp_ + 36) */
const finto = () => `sk-proj-${randomBytes(24).toString('hex')}`;
const fintoGh = () => `ghp_${randomBytes(18).toString('hex')}`;

const TOOL_MCP = [{ name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } }];
const TOOL_PLUGIN = [{ nome: 'plugin__lint__check', pluginId: 'lint', nomeOriginale: 'check', descrizione: 'checks the code', parametri: { type: 'object', properties: {} } }];
const TOOL_FORGE = [{ name: 'forge_daily_note', description: 'writes the daily note', inputSchema: { type: 'object', properties: {} } }];
const NOMI = { mcp_tool: 'mcp__github__create_issue', plugin_tool: 'plugin__lint__check', forge_tool: 'forge_daily_note' };
const FINE = { role: 'assistant', content: 'done', tool_calls: [] };
const chiama = (id, nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });

function cartella(t, prefisso = 'carta-arg-') {
  const c = mkdtempSync(join(tmpdir(), prefisso));
  t.after(() => { try { rimuoviCartellaDiProva(c); } catch { /* already gone */ } });
  return c;
}

/** One turn: the fake model makes the calls in order, then ends. Every card is answered by `ospite`. */
async function giro(t, { chiamate, ospite = async () => true, ...altro }) {
  const risposte = [...chiamate.map(([id, nome, argomenti]) => chiama(id, nome, argomenti)), FINE];
  const corpi = [], chieste = [], eseguite = [];
  const esegui = (nome, argomenti) => { eseguite.push({ nome, argomenti, json: JSON.stringify(argomenti) }); };
  await talosLavora({
    cartella: cartella(t), task: { consegna: 'work' }, modello: 'x', chiave: 'finta', livelloAccesso: 'scrittura-progetto',
    toolMcp: TOOL_MCP, toolPlugin: TOOL_PLUGIN, toolForge: TOOL_FORGE,
    chiamaToolMcpFn: async (nome, argomenti) => { esegui(nome, argomenti); return { content: [{ type: 'text', text: 'ok' }], isError: false }; },
    eseguiToolPluginFn: async (nome, argomenti) => { esegui(nome, argomenti); return 'ok'; },
    eseguiToolForgeFn: async (nome, argomenti) => { esegui(nome, argomenti); return { status: 'succeeded', output: 'ok' }; },
    chiediApprovazioneFn: async (a) => { chieste.push(structuredClone(a)); return ospite(a); },
    fetchDiRete: async (_u, o) => {
      const scelta = risposte[Math.min(corpi.length, risposte.length - 1)];
      corpi.push(o.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
    },
    ...altro,
  });
  const DI_FUORI = new Set(Object.keys(NOMI));
  return { chieste, carte: chieste.filter((a) => DI_FUORI.has(a.tipo)), eseguite, corpi };
}

test('ARG-01: the card of a connector, a plugin and a Tool Forge tool carries the arguments of the call, ordinary values as they are', async (t) => {
  const argomenti = { title: 'Weekly issue', note: 'DELETE EVERYTHING', nested: { a: [1, 2], ok: true, nulla: null } };
  for (const [tipo, nome] of Object.entries(NOMI)) {
    const r = await giro(t, { chiamate: [['c1', nome, argomenti]] });
    assert.equal(r.carte.length, 1, `${tipo}: one card`);
    assert.deepEqual(r.carte[0].argomenti, argomenti, `${tipo}: the arguments are on the card`);
    assert.equal(r.carte[0].argomentiTagliati, undefined, `${tipo}: nothing was cut`);
  }
});

test('ARG-02: a field named like a secret and a value shaped like a key arrive MASKED on the card (field AND value), counters stay', async (t) => {
  const segreti = { api: finto(), pw: 'hunter2-correct-horse', tok: fintoGh(), camel: 'plain-secret-value-1', header: 'header-value-xyz' };
  const nelTesto = finto();
  const argomenti = {
    api_key: segreti.api, password: segreti.pw, token: segreti.tok, clientSecret: segreti.camel, 'x-api-key': segreti.header,
    body: `please use ${nelTesto} for the call`, max_tokens: 4096, token_count: 7, title: 'kept',
  };
  for (const [tipo, nome] of Object.entries(NOMI)) {
    const r = await giro(t, { chiamate: [['c1', nome, argomenti]] });
    const a = r.carte[0]?.argomenti;
    assert.ok(a, `${tipo}: arguments on the card`);
    for (const k of ['api_key', 'password', 'token', 'clientSecret', 'x-api-key']) assert.equal(a[k], OSCURATO, `${tipo}: ${k} masked by its name`);
    assert.equal(a.body, `please use ${OSCURATO} for the call`, `${tipo}: the key-shaped value masked inside the text`);
    assert.equal(a.max_tokens, 4096, 'a counter is not a secret');
    assert.equal(a.token_count, 7, 'a counter is not a secret');
    assert.equal(a.title, 'kept');
    const carta = JSON.stringify(r.carte[0]);
    for (const s of [...Object.values(segreti), nelTesto]) assert.ok(!carta.includes(s), `${tipo}: no secret on the card`);
  }
});

test('ARG-03: a secret nested in an object inside a list inside an object arrives masked, by name and by shape', async (t) => {
  const pw = 'nested-pass-123456', chiave = finto();
  const argomenti = { outer: { list: [{ password: pw, label: 'x' }, { note: `key ${chiave}` }, [{ deep: { auth_token: 'deep-token-value' } }]] } };
  const r = await giro(t, { chiamate: [['c1', NOMI.mcp_tool, argomenti]] });
  const a = r.carte[0]?.argomenti;
  assert.equal(a?.outer?.list?.[0]?.password, OSCURATO, 'by name, two levels down in a list');
  assert.equal(a.outer.list[0].label, 'x');
  assert.equal(a.outer.list[1].note, `key ${OSCURATO}`, 'by shape, inside a list');
  assert.equal(a.outer.list[2][0].deep.auth_token, OSCURATO, 'by name, in a list inside a list');
  const carta = JSON.stringify(r.carte[0]);
  for (const s of [pw, chiave, 'deep-token-value']) assert.ok(!carta.includes(s), 'no nested secret on the card');
});

test('ARG-04: a value over the cap arrives cut with the cut sign, the card says how many values were cut; a short one is whole', async (t) => {
  const lungo = `${'a'.repeat(2_500)} END`;
  for (const [tipo, nome] of Object.entries(NOMI)) {
    const r = await giro(t, { chiamate: [['c1', nome, { body: lungo, title: 'short' }]] });
    const carta = r.carte[0];
    assert.ok(carta?.argomenti, `${tipo}: arguments on the card`);
    assert.ok(carta.argomenti.body.length <= TETTO, `${tipo}: cut at the cap (${carta.argomenti.body.length})`);
    assert.ok(carta.argomenti.body.endsWith(SEGNO), `${tipo}: with the cut sign`);
    assert.ok(carta.argomenti.body.startsWith('aaaa'), `${tipo}: the head is kept`);
    assert.ok(!carta.argomenti.body.includes('END'), `${tipo}: the tail is gone`);
    assert.equal(carta.argomenti.title, 'short', `${tipo}: a short value is whole`);
    assert.equal(carta.argomentiTagliati, 1, `${tipo}: one value cut`);
  }
});

test('ARG-05: a secret across the cap leaves no piece of itself after the cut; a long value under a secret name is masked whole', async (t) => {
  for (const spostamento of [40, 20, 8, 1]) {
    const segreto = finto();
    const body = `${'b'.repeat(TETTO - spostamento)} ${segreto} tail`;
    const lungoSegreto = 'z'.repeat(5_000);
    const r = await giro(t, { chiamate: [['c1', NOMI.mcp_tool, { body, password: lungoSegreto }]] });
    const a = r.carte[0]?.argomenti;
    assert.ok(a, 'arguments on the card');
    assert.equal(a.password, OSCURATO, 'masked whole, never cut to a piece');
    /* no run of 6 characters of the secret survives (the masked marker and the cut sign are not pieces of it) */
    for (let i = 0; i + 6 <= segreto.length; i += 1) assert.ok(!a.body.includes(segreto.slice(i, i + 6)), `no piece «${segreto.slice(i, i + 6)}» (shift ${spostamento})`);
    assert.ok(!a.body.includes('sk-'), 'not even its prefix');
  }
});

test('ARG-06: the No of the turn compares the REAL arguments: two calls that differ only in a secret ask twice, the masked copies are equal', async (t) => {
  const r = await giro(t, {
    ospite: async () => false,
    chiamate: [['c1', NOMI.mcp_tool, { api_key: finto(), title: 'same' }], ['c2', NOMI.mcp_tool, { api_key: finto(), title: 'same' }]],
  });
  assert.equal(r.carte.length, 2, 'the second call is a different call: it asks');
  assert.deepEqual(r.carte.map((c) => c.argomenti?.api_key), [OSCURATO, OSCURATO], 'both cards show the masked key');
  /* and the same call twice still gets the No at once, without a second card */
  const uguale = { api_key: finto(), title: 'same' };
  const due = await giro(t, { ospite: async () => false, chiamate: [['c1', NOMI.mcp_tool, uguale], ['c2', NOMI.mcp_tool, uguale]] });
  assert.equal(due.carte.length, 1, 'the identical call is not asked again');
  assert.ok(due.carte[0].argomenti, 'the card carried the arguments');
});

test('ARG-07: the tool receives the REAL arguments byte for byte and the model never sees the masked copy', async (t) => {
  const segreto = finto();
  const argomenti = { api_key: segreto, body: `${'c'.repeat(3_000)} ${finto()}`, nested: { password: 'p-123456789', list: [segreto] } };
  const json = JSON.stringify(argomenti);
  for (const [tipo, nome] of Object.entries(NOMI)) {
    const r = await giro(t, { chiamate: [['c1', nome, argomenti]] });
    assert.ok(r.carte[0]?.argomenti?.api_key === OSCURATO, `${tipo}: premise, the card is masked`);
    assert.equal(r.eseguite.length, 1, `${tipo}: the tool ran after the yes`);
    assert.equal(r.eseguite[0].json, json, `${tipo}: the tool got the real arguments, byte for byte`);
    /* what goes back to the model: the call as the model wrote it, never the masked or cut copy */
    const ultima = r.corpi.at(-1);
    assert.ok(ultima.includes(JSON.stringify(json)), `${tipo}: the model's own call is in the conversation, unchanged`);
    const dellaChiamata = JSON.stringify(JSON.parse(ultima).messages.filter((m) => m.role === 'assistant' || m.role === 'tool'));
    assert.ok(!dellaChiamata.includes(OSCURATO), `${tipo}: the masked copy never reaches the model`);
    assert.ok(!dellaChiamata.includes(SEGNO), `${tipo}: the cut copy never reaches the model`);
  }
});

/* After the mutants (each must die by two tests): the pure function, and a second way through the gate for the cap, the count, the
   window and the No. */
const perLaCarta = (a) => {
  assert.equal(typeof K.argomentiPerLaCarta, 'function', 'the kernel exports argomentiPerLaCarta');
  return K.argomentiPerLaCarta(a);
};
const PAROLE = 'correct horse battery staple under the old bridge with seven quiet lanterns and a purple umbrella';

test('ARG-09: argomentiPerLaCarta cuts a long value at the cap with the cut sign and counts it; a short one stays whole and counts nothing', () => {
  const lungo = perLaCarta({ body: 'b'.repeat(5_000), title: 'short' });
  assert.equal(lungo.argomenti.body.length, TETTO, 'the value is as long as the cap');
  assert.ok(lungo.argomenti.body.endsWith(SEGNO), 'it ends with the cut sign');
  assert.equal(lungo.argomenti.title, 'short');
  assert.equal(lungo.tagliati, 1, 'one value cut');
  const corto = perLaCarta({ title: 'short', n: 3, ok: true, nulla: null });
  assert.deepEqual(corto, { argomenti: { title: 'short', n: 3, ok: true, nulla: null }, tagliati: 0 });
  const vero = { body: 'b'.repeat(5_000) };
  perLaCarta(vero);
  assert.equal(vero.body.length, 5_000, 'the arguments passed in are never touched');
});

test('ARG-10: a Tool Forge card with two long values says two were cut, each ends with the cut sign', async (t) => {
  const r = await giro(t, { chiamate: [['c1', NOMI.forge_tool, { a: 'x'.repeat(2_000), b: 'y'.repeat(1_500), c: 'ok' }]] });
  assert.equal(r.carte.length, 1);
  assert.equal(r.carte[0].argomentiTagliati, 2, 'two values cut');
  assert.ok(r.carte[0].argomenti.a.endsWith(SEGNO) && r.carte[0].argomenti.a.length === TETTO, 'a: cut at the cap');
  assert.ok(r.carte[0].argomenti.b.endsWith(SEGNO) && r.carte[0].argomenti.b.length === TETTO, 'b: cut at the cap');
  assert.equal(r.carte[0].argomenti.c, 'ok');
});

test('ARG-11: the No compares the REAL arguments: two calls that differ only past the cap ask twice', async (t) => {
  const testa = 'h'.repeat(TETTO + 100);
  const r = await giro(t, { ospite: async () => false, chiamate: [['c1', NOMI.plugin_tool, { body: `${testa}A` }], ['c2', NOMI.plugin_tool, { body: `${testa}B` }]] });
  assert.equal(r.carte.length, 2, 'the second call is a different call: it asks');
  assert.equal(r.carte[0].argomenti.body, r.carte[1].argomenti.body, 'premise: on the card the two look the same');
});

test('ARG-12: argomentiPerLaCarta masks every field named like a secret at any depth, camelCase too; counters and ordinary names stay', () => {
  const { argomenti } = perLaCarta({
    a: { b: [{ token: 'plain words one' }, { deeper: { password: 'plain words two', clientSecret: 'plain words three' } }] },
    refreshToken: 'plain words four', authorization: 'Bearer plain', credentials: { user: 'u', pass: 'p' },
    max_tokens: 4096, token_count: 7, monkey: 'banana', title: 'Weekly',
  });
  assert.equal(argomenti.a.b[0].token, OSCURATO, 'token, two levels down in a list');
  assert.equal(argomenti.a.b[1].deeper.password, OSCURATO, 'password, three levels down');
  assert.equal(argomenti.a.b[1].deeper.clientSecret, OSCURATO, 'clientSecret, camelCase');
  assert.equal(argomenti.refreshToken, OSCURATO, 'refreshToken, camelCase');
  assert.equal(argomenti.authorization, OSCURATO, 'authorization, as Hermes');
  assert.equal(argomenti.credentials, OSCURATO, 'credentials: the whole object');
  assert.deepEqual([argomenti.max_tokens, argomenti.token_count, argomenti.monkey, argomenti.title], [4096, 7, 'banana', 'Weekly']);
  assert.ok(!JSON.stringify(argomenti).includes('plain words'), 'no masked value is left anywhere');
});

test('ARG-13: a quoted password with spaces that crosses the cap is masked whole: no word of it reaches the card', () => {
  for (const spostamento of [10, 60, 110]) {
    const { argomenti } = perLaCarta({ note: `${'n'.repeat(TETTO - spostamento)} password: "${PAROLE}" then the rest` });
    for (const parola of PAROLE.split(' ').filter((p) => p.length > 4)) assert.ok(!argomenti.note.includes(parola), `shift ${spostamento}: «${parola}» is not on the card`);
    assert.ok(argomenti.note.includes(`password: ${OSCURATO}`) || argomenti.note.endsWith(SEGNO), `shift ${spostamento}: masked, then cut`);
  }
});

test('ARG-14: through the gate, the quoted password that crosses the cap never reaches a plugin card', async (t) => {
  const r = await giro(t, { chiamate: [['c1', NOMI.plugin_tool, { note: `${'n'.repeat(TETTO - 60)} password: "${PAROLE}" then the rest ${'r'.repeat(300)}` }]] });
  assert.equal(r.carte.length, 1);
  for (const parola of PAROLE.split(' ').filter((p) => p.length > 4)) assert.ok(!r.carte[0].argomenti.note.includes(parola), `«${parola}» is not on the card`);
  assert.equal(r.carte[0].argomentiTagliati, 1, 'the note was cut');
});

const DIECI = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`v${i}`, String(i).repeat(1_500)]));
test('ARG-15: the whole card has a cap too: ten long values give four cut values, the rest left out and counted', () => {
  const puro = perLaCarta(DIECI);
  const testi = Object.values(puro.argomenti).filter((v) => typeof v === 'string');
  assert.ok(testi.reduce((s, v) => s + v.length, 0) <= (K.TETTO_ARGOMENTI_DELLA_CARTA?.caratteriInTutto ?? 4_800), 'the card stays under its whole cap');
  assert.ok(!('v9' in puro.argomenti), 'the last values are left out');
  assert.equal(puro.tagliati, 10, 'four cut and six left out');
});

test('ARG-16: through the gate, a connector card with ten long values says ten and leaves the last out; the tool gets all ten', async (t) => {
  const dieci = DIECI;
  const r = await giro(t, { chiamate: [['c1', NOMI.mcp_tool, dieci]] });
  assert.equal(r.carte[0].argomentiTagliati, 10, 'the card says ten');
  assert.ok(!('v9' in r.carte[0].argomenti), 'the card leaves out the last values');
  assert.equal(r.eseguite[0].json, JSON.stringify(dieci), 'the tool still gets all ten whole');
});

/* Twin repair of 0.2.2, round 4 (owner 14/11 12:59, judge v1865-v1868): a NAME is cut at the cap too, and two names equal in their first
   1,199 characters became the SAME name on the card: the second value overwrote the first, which vanished (measured on 43b3bea83:
   { p×1300+"A": "primo", p×1300+"B": "secondo", altro: "terzo" } ⇒ [[1200,"secondo"],[5,"terzo"]]). A hostile connector could hide an
   argument behind a long equal prefix. Every name on the card must stay its own row with its own value: a name that would repeat one
   already on the card gets a visible number right after it, «(2)», «(3)», the first free one; the number counts in the whole cap; a name
   that is a secret name keeps its value masked. */
const TUTTO = K.TETTO_ARGOMENTI_DELLA_CARTA?.caratteriInTutto ?? 4_800;
const PREFISSO = 'p'.repeat(1_300);
const TAGLIATO = `${'p'.repeat(TETTO - 1)}${SEGNO}`; // what the cap leaves of PREFISSO + anything
/** Values that use up exactly `quanto` characters of the whole cap, under names that never meet the names of the test. */
const riempi = (quanto, lettera = 'f') => {
  const o = {};
  for (let i = 0; quanto > 0; i++) {
    const k = `${lettera}${i}`;
    const l = Math.min(TETTO, quanto - k.length);
    o[k] = 'x'.repeat(l);
    quanto -= k.length + l;
  }
  return o;
};
const voci = (argomenti) => Object.entries(argomenti);

test('ARG-17: two names equal in their first 1,199 characters stay two rows with their two values; the second carries «(2)»', () => {
  const { argomenti, tagliati } = perLaCarta({ [`${PREFISSO}A`]: 'primo', [`${PREFISSO}B`]: 'secondo', altro: 'terzo' });
  assert.deepEqual(voci(argomenti), [[TAGLIATO, 'primo'], [`${TAGLIATO}(2)`, 'secondo'], ['altro', 'terzo']], 'three rows, no value lost');
  assert.equal(tagliati, 2, 'two names cut');
});

test('ARG-18: three names that the cap makes equal get three different rows: no number, «(2)», «(3)»', () => {
  const { argomenti } = perLaCarta({ [`${PREFISSO}A`]: 'uno', [`${PREFISSO}B`]: 'due', [`${PREFISSO}C`]: 'tre' });
  assert.deepEqual(Object.keys(argomenti), [TAGLIATO, `${TAGLIATO}(2)`, `${TAGLIATO}(3)`], 'every number used once');
  assert.deepEqual(Object.values(argomenti), ['uno', 'due', 'tre'], 'every value in its row');
});

test('ARG-19: the number counts in the whole cap: the fourth name gets exactly what is left after the first three with their numbers', () => {
  const dieci = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`${PREFISSO}${i}`, 'v']));
  const { argomenti, tagliati } = perLaCarta(dieci);
  const nomi = Object.keys(argomenti);
  const resto = TUTTO - (TAGLIATO.length + 1) - (TAGLIATO.length + 3 + 1) - (TAGLIATO.length + 3 + 1);
  assert.deepEqual(nomi.slice(0, 3), [TAGLIATO, `${TAGLIATO}(2)`, `${TAGLIATO}(3)`]);
  assert.equal(nomi[3].length, resto, 'the fourth name is cut to what the first three left, numbers included');
  assert.equal(argomenti[nomi[3]], 'v');
  assert.equal(new Set(nomi).size, nomi.length, 'no name twice');
  assert.equal(tagliati, 10, 'four names cut, six left out');
});

test('ARG-20: with one character left, the name cut to «…» and the sign of the names left out do not eat each other', () => {
  const { argomenti, tagliati } = perLaCarta({ ...riempi(TUTTO - 1), qqqq: 'z', r: 'more' });
  assert.equal(argomenti[SEGNO], 'z', 'the name cut to the bare cut sign keeps its value');
  assert.equal(argomenti[`${SEGNO}(2)`], SEGNO, 'the sign of the names left out has its own row');
  assert.equal(tagliati, 2, 'one name cut, one left out');
});

test('ARG-21: a cut name that is a secret name keeps its value masked after its number; an ordinary one stays readable', () => {
  const { argomenti } = perLaCarta({ [`${PREFISSO}_api_key`]: 'plain words one', [`${PREFISSO}_token`]: 'plain words two', [`${PREFISSO}_title`]: 'Weekly' });
  assert.deepEqual(voci(argomenti), [[TAGLIATO, OSCURATO], [`${TAGLIATO}(2)`, OSCURATO], [`${TAGLIATO}(3)`, 'Weekly']]);
  assert.ok(!JSON.stringify(argomenti).includes('plain words'), 'no secret value on the card');
});

test('ARG-25: names of the object\'s own machinery stay as written, and no name gets a number when nothing repeats', () => {
  const nomi = ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__', 'title'];
  const { argomenti, tagliati } = perLaCarta(Object.fromEntries(nomi.map((k, i) => [k, `v${i}`])));
  assert.deepEqual(Object.keys(argomenti), nomi, 'every name as written');
  assert.deepEqual(Object.values(argomenti), nomi.map((_, i) => `v${i}`));
  assert.equal(tagliati, 0);
  assert.deepEqual(Object.keys(perLaCarta({ [`${PREFISSO}A`]: 'solo' }).argomenti), [TAGLIATO], 'a cut name alone has no number');
});

const SCRITTI = { 'pp…': 'one', 'pp…(2)': 'two', 'pp…(3)': 'six' }; // 24 characters of the cap
test('ARG-26: a cut name that meets names already written as «pp…», «pp…(2)», «pp…(3)» takes the first free number, «(4)»', () => {
  const { argomenti } = perLaCarta({ ...SCRITTI, ...riempi(TUTTO - 24 - 3), ppXXXXXXXX: 'three' });
  assert.deepEqual([argomenti['pp…'], argomenti['pp…(2)'], argomenti['pp…(3)']], ['one', 'two', 'six'], 'the names written keep their values');
  assert.ok(Object.hasOwn(argomenti, 'pp…(4)'), `the cut name has its own row: ${JSON.stringify(Object.keys(argomenti))}`);
});

test('ARG-27: a name written whole that equals a name cut before it gets the number: the earlier value stays', () => {
  const { argomenti, tagliati } = perLaCarta({ [`${PREFISSO}A`]: 'primo', [TAGLIATO]: 'written' });
  assert.deepEqual(voci(argomenti), [[TAGLIATO, 'primo'], [`${TAGLIATO}(2)`, 'written']]);
  assert.equal(tagliati, 1, 'only the first name was cut');
});

test('ARG-22: through the gate, a connector card with two long names that start the same shows both values; the tool gets the real names', async (t) => {
  const argomenti = { [`${PREFISSO}A`]: 'primo', [`${PREFISSO}B`]: 'secondo', [`${PREFISSO}C_api_key`]: 'plain secret words', constructor: 'build' };
  const r = await giro(t, { chiamate: [['c1', NOMI.mcp_tool, argomenti]] });
  assert.deepEqual(voci(r.carte[0].argomenti), [[TAGLIATO, 'primo'], [`${TAGLIATO}(2)`, 'secondo'], [`${TAGLIATO}(3)`, OSCURATO], ['constructor', 'build']]);
  assert.equal(r.carte[0].argomentiTagliati, 3, 'three names cut');
  assert.equal(r.eseguite[0].json, JSON.stringify(argomenti), 'the tool gets the real names and values');
});

test('ARG-23: through the gate, a plugin card with ten long names that start the same: four rows, numbers counted in the cap', async (t) => {
  const dieci = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`${PREFISSO}${i}`, `v${i}`]));
  const r = await giro(t, { chiamate: [['c1', NOMI.plugin_tool, dieci]] });
  const nomi = Object.keys(r.carte[0].argomenti);
  assert.deepEqual(nomi.slice(0, 3), [TAGLIATO, `${TAGLIATO}(2)`, `${TAGLIATO}(3)`]);
  assert.deepEqual(Object.values(r.carte[0].argomenti).slice(0, 3), ['v0', 'v1', 'v2'], 'every value in its row');
  assert.equal(nomi[3].length, TUTTO - (TAGLIATO.length + 2) - (TAGLIATO.length + 3 + 2) - (TAGLIATO.length + 3 + 2), 'the numbers count in the cap');
  assert.equal(r.carte[0].argomentiTagliati, 11, 'four names cut, the fourth value cut to the one character left, six left out');
  assert.equal(r.eseguite[0].json, JSON.stringify(dieci), 'the tool gets all ten whole');
});

test('ARG-24: through the gate, at the end of the cap no row eats another: a Tool Forge, a plugin and a connector card', async (t) => {
  const forge = { ...riempi(TUTTO - 1), qqqq: 'z', r: 'more' };
  const plugin = { ...SCRITTI, ...riempi(TUTTO - 24 - 3, 'g'), ppXXXXXXXX: 'three' };
  const mcp = { [`${PREFISSO}A`]: 'primo', [TAGLIATO]: 'written' };
  const r = await giro(t, { chiamate: [['c1', NOMI.forge_tool, forge], ['c2', NOMI.plugin_tool, plugin], ['c3', NOMI.mcp_tool, mcp]] });
  assert.equal(r.carte.length, 3);
  assert.equal(r.carte[0].argomenti[SEGNO], 'z', 'Tool Forge: the name cut to «…» keeps its value');
  assert.equal(r.carte[0].argomenti[`${SEGNO}(2)`], SEGNO, 'Tool Forge: the sign of the names left out has its own row');
  assert.deepEqual([r.carte[1].argomenti['pp…'], r.carte[1].argomenti['pp…(2)'], r.carte[1].argomenti['pp…(3)']], ['one', 'two', 'six'], 'plugin: the names written keep their values');
  assert.ok(Object.hasOwn(r.carte[1].argomenti, 'pp…(4)'), 'plugin: the cut name takes «(4)»');
  assert.deepEqual(voci(r.carte[2].argomenti), [[TAGLIATO, 'primo'], [`${TAGLIATO}(2)`, 'written']], 'connector: the name written whole gets the number');
  assert.deepEqual(r.eseguite.map((e) => e.json), [JSON.stringify(forge), JSON.stringify(plugin), JSON.stringify(mcp)], 'the tools get the real arguments');
});
