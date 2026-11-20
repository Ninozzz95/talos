/*
 * Twin repair of 0.2.2, round 5 (owner 14/11 14:15, choice A; judge v1878): the four REDS and the YELLOW of reviewer 1 on the card of an
 * outside tool (`argomentiPerLaCarta`, `forme-di-segreto.mjs`), measured on 1229750e4:
 *   R1 the value-after-a-secret-name recogniser was QUADRATIC: it retried after every «_» or «-», so 4 values of «a-»×50,000 cost 2,821 ms,
 *      4 names of «a_»×50,000 2,923 ms, one window of «a_» 438 ms, while the server's event loop stood still;
 *   R2 the whole cap of 4,800 was jumped by elements that cost nothing: 2 million `[]` made a card of 6,000,007 characters, cut count 0;
 *   R4 secrets stayed on the card, so on disk: `{"password": "…"}` inside a text value (also with escaped quotes), lowercase names glued to
 *      the secret word (`clientsecret`, `dbpassword`, `githubtoken`), `secret_value`, `bearer`, `key_material`, `pass\u200bword` (Hermes masks
 *      all of them: `agent/redact.py:451-456` `_JSON_FIELD_RE` and its escaped twin, `:748-761` the case-folded suffix), and what Hermes
 *      lets through too: `passphrase`, `privatekey`, `cookie`, `secrets: {…}`, a PEM with no END line whose body is one long line.
 * The judge's condition 2: honest names stay VISIBLE (`token_limit`, `max_tokens`, `tokens`, `keyboard`, `monkey`, `secretary`,
 *   `password_hint`, `cookie_policy`): `cookie` is a secret name, `cookie_policy` is not, because the secret word must END the name.
 * And a second project test for every mutant reviewer 1 left alive (M1-M6, M8, M17) or killed with one test only (M11, M16).
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as K from '../src/kernel/talosHarness.mjs';
import { nomeDiCampoSegreto, oscuraFormeDiSegreto } from '../src/forme-di-segreto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
/* Time ceilings ×4 only under CI (shared runners); locally they stay as they were. Same rule as carta-argomenti-connettore-022-giro6. */
const MOLTIPLICATORE_CI = process.env.CI && process.env.CI !== 'false' ? 4 : 1;

const { talosLavora, argomentiPerLaCarta: perLaCarta } = K;
const T = K.TETTO_ARGOMENTI_DELLA_CARTA;
const OSCURATO = '[redacted]';
const SEGNO = '…';
const S = 'hunter2SEGRETOVERO';
const json = (x) => JSON.stringify(x);
/* the arguments of a card never pass this many JSON characters, whatever a hostile connector sends (declared in the kernel next to the cap) */
const TETTO_JSON = T.jsonInTutto ?? 24_000;
/** The best of three runs, in milliseconds: a slow machine makes one run slow, never three. */
const migliore = (fare) => Math.min(...[0, 1, 2].map(() => { const t0 = performance.now(); fare(); return performance.now() - t0; }));
/* 250 ms is five times the 50 ms the cure promises and ten times under what the quadratic recogniser cost on the same input */
const SOGLIA_MS = 250;
const finto = () => `sk-proj-${randomBytes(24).toString('hex')}`;

const TOOL_MCP = [{ name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } }];
const FINE = { role: 'assistant', content: 'done', tool_calls: [] };
/* `argomenti` as an object, or as the raw JSON text the model wrote (so a name like «__proto__» arrives as the model wrote it) */
const chiama = (id, nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: typeof argomenti === 'string' ? argomenti : JSON.stringify(argomenti) } }] });
async function giro(t, argomenti) {
  const c = mkdtempSync(join(tmpdir(), 'carta-g5-'));
  t.after(() => { try { rimuoviCartellaDiProva(c); } catch { /* already gone */ } });
  const risposte = [chiama('c1', 'mcp__github__create_issue', argomenti), FINE];
  const corpi = [], chieste = [], eseguite = [];
  await talosLavora({
    cartella: c, task: { consegna: 'work' }, modello: 'x', chiave: 'finta', livelloAccesso: 'scrittura-progetto', toolMcp: TOOL_MCP,
    chiamaToolMcpFn: async (nome, a) => { eseguite.push({ nome, argomenti: a }); return { content: [{ type: 'text', text: 'ok' }], isError: false }; },
    chiediApprovazioneFn: async (a) => { chieste.push(structuredClone(a)); return true; },
    fetchDiRete: async (_u, o) => {
      const scelta = risposte[Math.min(corpi.length, risposte.length - 1)];
      corpi.push(o.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
    },
  });
  return { carte: chieste.filter((a) => a.tipo === 'mcp_tool'), eseguite };
}

/* ---------------------------------------------------------------- R1: linear ---------------------------------------------------------------- */
test('G5-R1-01: four values of «a-» and of «a_» × 50,000 reach the card in well under a second (was 2,821 ms)', () => {
  for (const pezzo of ['a-', 'a_', 'ab_']) {
    const s = pezzo.repeat(50_000);
    const ms = migliore(() => perLaCarta({ a: s, b: s, c: s, d: s }));
    assert.ok(ms < SOGLIA_MS * MOLTIPLICATORE_CI, `[ceiling ${SOGLIA_MS * MOLTIPLICATORE_CI} ms] «${pezzo}»: ${ms.toFixed(1)} ms`);
  }
});

test('G5-R1-02: four NAMES of «a_» × 50,000 reach the card in well under a second (was 2,923 ms)', () => {
  const s = 'a_'.repeat(50_000);
  const ms = migliore(() => perLaCarta({ [`${s}1`]: 1, [`${s}2`]: 2, [`${s}3`]: 3, [`${s}4`]: 4 }));
  assert.ok(ms < SOGLIA_MS * MOLTIPLICATORE_CI, `[ceiling ${SOGLIA_MS * MOLTIPLICATORE_CI} ms] ${ms.toFixed(1)} ms`);
});

test('G5-R1-03: every shape of oscuraFormeDiSegreto is linear: 200,000 hostile characters each in well under a second', () => {
  const ostili = {
    'a_': 'a_'.repeat(100_000), 'a-': 'a-'.repeat(100_000), '_a': '_a'.repeat(100_000), 'a__': 'a__'.repeat(66_000),
    'token=': 'token='.repeat(33_000), 'x_token:': 'x_token:'.repeat(25_000), '"password":"': '"password":"'.repeat(16_000),
    '\\"': '\\"'.repeat(100_000), 'backslashes': '\\'.repeat(200_000), 'quotes': '"'.repeat(200_000),
    'PEM headers': '-----BEGIN PRIVATE KEY-----'.repeat(7_000), 'PEM body': `-----BEGIN PRIVATE KEY-----${'A'.repeat(200_000)}`,
    'eyJ.': 'eyJaaaaaaaa.'.repeat(16_000), 'bearer ': 'bearer '.repeat(28_000), 'x://a:': 'x://a:'.repeat(33_000),
    'spaces after a name': `password:${' '.repeat(200_000)}`, 'dashes': '-'.repeat(200_000),
  };
  for (const [nome, s] of Object.entries(ostili)) {
    const ms = migliore(() => oscuraFormeDiSegreto(s));
    assert.ok(ms < SOGLIA_MS * MOLTIPLICATORE_CI, `[ceiling ${SOGLIA_MS * MOLTIPLICATORE_CI} ms] «${nome}»: ${ms.toFixed(1)} ms`);
  }
});

/* ---------------------------------------------------------------- R2: the cap ---------------------------------------------------------------- */
test('G5-R2-01: empty lists, empty texts and empty objects each cost something: 200,000 of them never jump the whole cap', () => {
  for (const [nome, vuoto] of [['[]', () => []], ['""', () => ''], ['{}', () => ({})]]) {
    const c = perLaCarta({ a: Array.from({ length: 200_000 }, vuoto) });
    assert.ok(json(c.argomenti).length <= TETTO_JSON, `${nome}: ${json(c.argomenti).length} JSON characters`);
    assert.ok(c.tagliati > 0, `${nome}: the card says it left values out`);
  }
});

test('G5-R2-02: a list of a list of empty lists, and empty names with empty values, never jump the whole cap', () => {
  const annidati = Array.from({ length: 300 }, () => Array.from({ length: 300 }, () => []));
  const c1 = perLaCarta({ a: annidati });
  assert.ok(json(c1.argomenti).length <= TETTO_JSON, `nested: ${json(c1.argomenti).length}`);
  const c2 = perLaCarta(Object.fromEntries(Array.from({ length: 50_000 }, (_, i) => [String(i), ''])));
  assert.ok(json(c2.argomenti).length <= TETTO_JSON, `names: ${json(c2.argomenti).length}`);
  assert.ok(c1.tagliati > 0 && c2.tagliati > 0);
});

test('G5-R2-03: numbers cost their digits: 100,000 numbers in a list, or under 100,000 names, stay under the whole cap', () => {
  const c1 = perLaCarta({ a: Array.from({ length: 100_000 }, (_, i) => i) });
  assert.ok(json(c1.argomenti).length <= TETTO_JSON, `list: ${json(c1.argomenti).length}`);
  assert.ok(c1.tagliati > 90_000, 'the numbers left out are counted');
  const c2 = perLaCarta({ a: Array.from({ length: 100_000 }, () => 1e21) });
  assert.ok(json(c2.argomenti).length <= TETTO_JSON, `big numbers: ${json(c2.argomenti).length}`);
});

test('G5-R2-04: a text made of characters that JSON writes six times longer costs what it weighs: four of them stay under the cap', () => {
  const pesante = '\u0001'.repeat(5_000);
  const c = perLaCarta({ a: pesante, b: pesante, c: pesante, d: pesante, e: '"\\'.repeat(3_000) });
  assert.ok(json(c.argomenti).length <= TETTO_JSON, `${json(c.argomenti).length} JSON characters`);
  assert.ok(c.tagliati > 0);
});

test('G5-R2-05: the largest card a hostile connector can build stays under the declared JSON cap, and the cap is declared', () => {
  assert.equal(typeof T.jsonInTutto, 'number', 'the kernel declares the JSON cap next to the others');
  const ostili = [
    { a: Array.from({ length: 100_000 }, () => '') },
    Object.fromEntries(Array.from({ length: 20_000 }, (_, i) => [`k${i}`, []])),
    { a: Array.from({ length: 20_000 }, () => [[[[[[['x']]]]]]]) },
    Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`\u0002${i}`.repeat(700), '\u0003'.repeat(2_000)])),
    { a: Array.from({ length: 10_000 }, () => 'a') },
  ];
  for (const [i, o] of ostili.entries()) {
    const n = json(perLaCarta(o).argomenti).length;
    assert.ok(n <= T.jsonInTutto, `hostile ${i}: ${n} > ${T.jsonInTutto}`);
  }
});

test('G5-R2-06: depth over 8 is cut and announced: eight objects deep reach the card, the ninth becomes «…» and is counted', () => {
  const profondo = (n) => JSON.parse(`${'{"a":'.repeat(n)}"FONDO"${'}'.repeat(n)}`);
  const otto = perLaCarta(profondo(8));
  assert.ok(json(otto.argomenti).includes('FONDO'), 'eight objects deep: the value is on the card');
  assert.equal(otto.tagliati, 0);
  const nove = perLaCarta(profondo(9));
  assert.ok(!json(nove.argomenti).includes('FONDO'), 'nine objects deep: the value is cut');
  assert.ok(json(nove.argomenti).includes(SEGNO), 'and «…» stands in its place');
  assert.equal(nove.tagliati, 1, 'the cut is counted');
});

test('G5-R2-07: through the gate, depth 9 reaches the card as «…» counted, and the tool still gets the value', async (t) => {
  const testo = `${'{"a":'.repeat(9)}"FONDO"${'}'.repeat(9)}`;
  const r = await giro(t, testo);
  assert.ok(!json(r.carte[0].argomenti).includes('FONDO'));
  assert.equal(r.carte[0].argomentiTagliati, 1);
  assert.ok(json(r.eseguite[0].argomenti).includes('FONDO'), 'the tool gets the real arguments');
});

test('G5-R2-08: a field named like a secret costs its mask in the cap: 2,000 such fields make the same card size as plain ones', () => {
  const segreti = perLaCarta(Object.fromEntries(Array.from({ length: 2_000 }, (_, i) => [`k${i}_token`, 'v'])));
  const righe = Object.keys(segreti.argomenti).length;
  /* each row costs its name (7-11 characters) plus the mask (10): at most 4,800 / 17 + 1 rows */
  assert.ok(righe <= Math.ceil(T.caratteriInTutto / 17) + 1, `${righe} rows`);
  assert.ok(json(segreti.argomenti).length <= TETTO_JSON);
});

test('G5-R2-09: through the gate, 2,000 secret fields reach a card no larger than the cap allows; the tool gets all 2,000', async (t) => {
  const argomenti = Object.fromEntries(Array.from({ length: 2_000 }, (_, i) => [`k${i}_password`, 'v']));
  const r = await giro(t, argomenti);
  assert.ok(Object.keys(r.carte[0].argomenti).length <= Math.ceil(T.caratteriInTutto / 20) + 1, `${Object.keys(r.carte[0].argomenti).length} rows`);
  assert.equal(Object.keys(r.eseguite[0].argomenti).length, 2_000);
});

/* ---------------------------------------------------------------- R3 in the kernel: kept ---------------------------------------------------------------- */
test('G5-R3-01: a top that is not an object (list, text, number) reaches the card as it is, masked and cut', () => {
  assert.deepEqual(perLaCarta(['--delete-all', '/']).argomenti, ['--delete-all', '/']);
  assert.equal(perLaCarta('rm -rf /').argomenti, 'rm -rf /');
  assert.equal(perLaCarta(42).argomenti, 42);
  assert.equal(perLaCarta(`password=${S}`).argomenti, `password=${OSCURATO}`);
});

/* ---------------------------------------------------------------- R4: secrets ---------------------------------------------------------------- */
/* ⛔ Round 6, the narrow road (reviewer 1 after round 5, RED 1; owner 14/11 17:03): the quoted-value field inside a text was superlinear
   and is removed; `{"password": "…"}` inside a text is back to the base (readable, the declared limit of 0.2.3). What stays from round 5
   is the field with an UNQUOTED value, below. */
test('G5-R4-01: a JSON or Python field named like a secret INSIDE a text value, with an unquoted value, is masked', () => {
  const casi = [`{"pin_password": 1234${S}}`, `{\\"db_password\\": ${S}}`, `{'api_key': ${S}}`];
  for (const c of casi) {
    const fuori = json(perLaCarta({ body: c }).argomenti);
    assert.ok(!fuori.includes(S), `${c} ⇒ ${fuori}`);
  }
});

test('G5-R4-02: names glued to the secret word, Hermes\'s exact names and names with invisible characters inside are secret names', () => {
  for (const k of ['clientsecret', 'dbpassword', 'githubtoken', 'secret_value', 'secretValue', 'bearer', 'key_material', 'raw_secret', 'secret_input',
    'pass\u200bword', 'pass\u2060word', 'api\u200b_key', 'passphrase', 'privatekey', 'private_key', 'cookie', 'Cookie', 'session_cookie', 'set-cookie',
    'secrets', 'passwords', 'apiKeys', 'credentials', 'password ', 'Password\n']) {
    assert.equal(nomeDiCampoSegreto(k), true, json(k));
    assert.equal(perLaCarta({ [k]: S }).argomenti[k], OSCURATO, json(k));
  }
});

test('G5-R4-03: what Hermes lets through is masked too: passphrase, privatekey, cookie, secrets with an object, a PEM with no END line', () => {
  const casi = [
    { passphrase: S }, { privatekey: S }, { cookie: `sid=${S}` }, { headers: { Cookie: `sid=${S}` } }, { secrets: { db: S } },
    { body: `-----BEGIN PRIVATE KEY-----\n${'MIIEvQ'.repeat(100)}${S}` },
    { body: `-----BEGIN PRIVATE KEY-----${'MIIEvQ'.repeat(100)}${S}` },
    { body: `-----BEGIN PRIVATE KEY-----\\n${'MIIEvQ'.repeat(10)}\\n${'QUJD'.repeat(16)}${S}` },
    { body: `"-----BEGIN RSA PRIVATE KEY-----\n${'MIIEvQ'.repeat(10)}\n${'QUJD'.repeat(16)}${S}"` },
    { note: `Cookie: sid=${S}` }, { note: `passphrase=${S}` }, { note: `private_key: ${S}` }, { note: `export DB_PASSWD="${S}"` },
  ];
  for (const c of casi) {
    const fuori = json(perLaCarta(c).argomenti);
    assert.ok(!fuori.includes(S), `${json(c).slice(0, 80)} ⇒ ${fuori.slice(0, 200)}`);
  }
});

test('G5-R4-04: through the gate, every secret of the reviewer stays off the card; the tool still gets every one of them', async (t) => {
  const argomenti = {
    body: `{\\"pin_password\\": ${S}1}`, clientsecret: `${S}2`, // round 6: the quoted value inside a text is the declared limit of 0.2.3 githubtoken: `${S}3`, ['pass\u200bword']: `${S}4`, passphrase: `${S}5`,
    cookie: `${S}6`, secrets: { db: `${S}7` }, pem: `-----BEGIN PRIVATE KEY-----\n${'MIIEvQ'.repeat(100)}${S}8`, bearer: `${S}9`,
  };
  const r = await giro(t, argomenti);
  assert.ok(!json(r.carte[0].argomenti).includes(S), json(r.carte[0].argomenti).slice(0, 400));
  assert.deepEqual(r.eseguite[0].argomenti, argomenti, 'the tool gets the real arguments');
});

test('G5-R4-05: the masks reviewer 1 saw hold are still there: nested, in a list, JWT, a whole PEM, sk-, URL credentials', () => {
  const jwt = `eyJ${'a'.repeat(30)}.eyJ${'b'.repeat(30)}.${'c'.repeat(30)}`;
  const chiave = finto();
  const c = json(perLaCarta({ a: { b: { password: S } }, list: [{ token: S }], note: `vedi ${jwt} e ${chiave}`, url: `https://user:${S}@host/x`,
    pem: `-----BEGIN PRIVATE KEY-----\n${'MIIEvQ'.repeat(10)}\n-----END PRIVATE KEY-----` }).argomenti);
  for (const x of [S, 'c'.repeat(30), chiave, 'MIIEvQMIIEvQ']) assert.ok(!c.includes(x), `${x} ⇒ ${c}`);
});

/* ------------------------------------------------- the judge's condition 2: honest names stay visible ------------------------------------------------- */
const ONESTI = ['token_limit', 'max_tokens', 'tokens', 'keyboard', 'monkey', 'secretary', 'password_hint', 'cookie_policy', 'token_count', 'total_tokens',
  'tokenizer', 'secret_name', 'password_policy', 'keys', 'author', 'authority', 'cookies_enabled', 'passport'];
/* 0.2.4, block 1 (item 1, the known limit of 0.2.3 «A field named `tokens` is read as a counter»): `tokens` alone stays an honest NAME, but
   the value decides — a counter (a number) is shown, a text like «visible-2» under it is now masked (`segreti-024-b1-nomi.test.mjs`).
   So here `tokens` carries a counter; every other honest name keeps its text. */
const valoreOnesto = (k, i) => (k === 'tokens' ? 1000 + i : `visible-${i}`);
test('G5-FP-01: honest names stay VISIBLE on the card: token_limit, max_tokens, tokens, keyboard, monkey, secretary, password_hint, cookie_policy', () => {
  for (const k of ONESTI) assert.equal(nomeDiCampoSegreto(k), false, k);
  const valori = Object.fromEntries(ONESTI.map((k, i) => [k, valoreOnesto(k, i)]));
  assert.deepEqual(perLaCarta(valori).argomenti, valori);
});

test('G5-FP-02: in a text, «token_limit: 4000», «max_tokens=4096», «tokens: 12», «secretary: Jane», «cookie_policy: strict» stay readable', () => {
  const testo = 'token_limit: 4000, max_tokens=4096, tokens: 12, secretary: Jane, cookie_policy: strict, password_hint: dog, monkey: yes, keyboard=us';
  assert.equal(oscuraFormeDiSegreto(testo), testo);
  assert.equal(perLaCarta({ note: testo }).argomenti.note, testo);
  assert.equal(oscuraFormeDiSegreto('{"token_limit": "4000", "cookie_policy": "strict", "tokens": "12"}'), '{"token_limit": "4000", "cookie_policy": "strict", "tokens": "12"}');
});

test('G5-FP-03: through the gate, the honest names reach the card readable, beside a «cookie» that is masked', async (t) => {
  const valori = Object.fromEntries(ONESTI.map((k, i) => [k, valoreOnesto(k, i)]));
  const r = await giro(t, { ...valori, cookie: `${S}c` });
  for (const k of ONESTI) assert.equal(r.carte[0].argomenti[k], valori[k], k);
  assert.equal(r.carte[0].argomenti.cookie, OSCURATO);
});

/* ---------------------------------------------------------------- the mutants left alive ---------------------------------------------------------------- */
const JWT_LUNGO = (l) => `eyJ${l.repeat(4_096)}.eyJ${'b'.repeat(8_192)}.${'c'.repeat(4_096)}`; // 16,392 characters: the longest JWT the masker knows
test('G5-M2-01: two long keys in a row: the window grows past the first until the second is whole, so no piece of it reaches the card', () => {
  const valore = `${JWT_LUNGO('a')} ${JWT_LUNGO('d')} tail`;
  const c = perLaCarta({ v: valore });
  assert.equal(c.argomenti.v, `${OSCURATO} ${OSCURATO} tail`);
});

test('G5-M2-02: the same two long keys in a NAME: the name on the card is masked whole', () => {
  const nome = `${JWT_LUNGO('a')} ${JWT_LUNGO('d')}`;
  const c = perLaCarta({ [nome]: 'v' });
  assert.deepEqual(Object.keys(c.argomenti), [`${OSCURATO} ${OSCURATO}`]);
});

test('G5-M3-01: a NAME goes through the masker like a value: a JWT, an sk- key and «password=…» written as a name never reach the card', () => {
  const jwt = `eyJ${'a'.repeat(30)}.eyJ${'b'.repeat(30)}.${'c'.repeat(30)}`;
  const chiave = finto();
  const c = json(perLaCarta({ [jwt]: 'v1', [chiave]: 'v2', [`password=${S}`]: 'v3' }).argomenti);
  for (const x of ['c'.repeat(30), chiave, S]) assert.ok(!c.includes(x), `${x} ⇒ ${c}`);
});

test('G5-M3-02: through the gate, a key written as a name stays off the card', async (t) => {
  const chiave = finto();
  const r = await giro(t, { [chiave]: 'v', title: 'x' });
  assert.ok(!json(r.carte[0].argomenti).includes(chiave));
  assert.ok(Object.hasOwn(r.eseguite[0].argomenti, chiave), 'the tool gets the real name');
});

const SOLITARIA = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
test('G5-M6-01: a value cut right after the first half of an emoji never keeps half of it', () => {
  const v = `${'x'.repeat(T.caratteriPerValore - 2)}😀${'y'.repeat(100)}`;
  const fuori = perLaCarta({ v }).argomenti.v;
  assert.ok(fuori.endsWith(SEGNO));
  assert.ok(!SOLITARIA.test(fuori), 'no lone surrogate');
});

test('G5-M6-02: a NAME cut right after the first half of an emoji never keeps half of it', () => {
  const k = `${'x'.repeat(T.caratteriPerValore - 2)}😀${'y'.repeat(100)}`;
  const [nome] = Object.keys(perLaCarta({ [k]: 'v' }).argomenti);
  assert.ok(!SOLITARIA.test(nome), 'no lone surrogate');
});

test('G5-M11-01: through the gate, a name «__proto__» written by the model is a row of the card, not the prototype', async (t) => {
  const r = await giro(t, '{"path":"notes.txt","__proto__":"VALPROTO-delete-all"}');
  assert.ok(Object.hasOwn(r.carte[0].argomenti, '__proto__'), json(Object.keys(r.carte[0].argomenti)));
  assert.equal(Object.getOwnPropertyDescriptor(r.carte[0].argomenti, '__proto__')?.value, 'VALPROTO-delete-all');
});

test('G5-M11-02: a nested «__proto__» holding an object stays a row with its rows', () => {
  const c = perLaCarta(JSON.parse('{"outer":{"__proto__":{"cmd":"rm -rf /"}}}')).argomenti;
  assert.ok(Object.hasOwn(c.outer, '__proto__'));
  assert.equal(Object.getOwnPropertyDescriptor(c.outer, '__proto__').value.cmd, 'rm -rf /');
});

test('G5-M16-01: Authorization, proxy-authorization and credentials are secret names, at any depth', () => {
  const c = json(perLaCarta({ headers: { Authorization: `Basic ${S}`, 'proxy-authorization': S }, credentials: { user: 'u', pass: S }, Credential: S }).argomenti);
  assert.ok(!c.includes(S), c);
});

test('G5-M16-02: through the gate, an Authorization header and credentials stay off the card', async (t) => {
  const r = await giro(t, { headers: { authorization: `Bearer x${S}` }, aws_credentials: S });
  assert.ok(!json(r.carte[0].argomenti).includes(S));
});

test('G5-M17-01: an EMPTY value under a secret name is shown empty: the card says the truth, an empty password is sent', () => {
  assert.deepEqual(perLaCarta({ password: '', token: null, api_key: S }).argomenti, { password: '', token: null, api_key: OSCURATO });
});

test('G5-M17-02: through the gate, an empty secret field reaches the card empty, a full one masked', async (t) => {
  const r = await giro(t, { password: '', secret: `${S}x` });
  assert.equal(r.carte[0].argomenti.password, '');
  assert.equal(r.carte[0].argomenti.secret, OSCURATO);
});

/* ⛔ Round 6, the narrow road (reviewer 1 after round 5, RED 2): «to the end of the window» hid the rest of an argument after a quote that
   never closes, with no cut counted. Back to the base: the unclosed value stops at the space; the declared limit of round 3 is back. */
test('G5-R4-06: an unclosed quoted secret is masked up to its first space, as in the base: the rest of the line stays (declared limit)', () => {
  const v = `password: "${'w0rd '.repeat(5_000)}`;
  assert.ok(perLaCarta({ v }).argomenti.v.startsWith(`password: ${OSCURATO} w0rd w0rd`), perLaCarta({ v }).argomenti.v.slice(0, 60));
  assert.equal(oscuraFormeDiSegreto(`token = 'abc def ghi`), `token = ${OSCURATO} def ghi`);
});

/* M1 (the window starts without its margin): the masker must see the whole window at once. A whole PEM block whose body is full of
   «pwd=x» ends at 9,658: seen at once it is one block; seen in pieces of 1,200, 2,400 … 9,600 its END is never in, its body's «pwd=x»
   grow when masked, the window stops growing, and the card shows the body's words. */
const PEM_DI_PWD = `-----BEGIN PRIVATE KEY-----${'pwd=x '.repeat(1_600)}-----END PRIVATE KEY----- after`;
test('G5-M1-01: a whole PEM block whose body grows when masked is masked as ONE block: the card shows «[redacted] after»', () => {
  assert.equal(perLaCarta({ v: PEM_DI_PWD }).argomenti.v, `${OSCURATO} after`);
});

test('G5-M1-02: the same block as a NAME is masked as one block', () => {
  assert.deepEqual(Object.keys(perLaCarta({ [PEM_DI_PWD]: 'v' }).argomenti), [`${OSCURATO} after`]);
});

/* Mutants of the cure itself, left alive or killed once by the tests above (agente-cura-gemella-giro-5, on a copy). */
test('G5-M8-01: a number costs its digits: of 2,000 nine-digit numbers only what the cap holds reaches the card, the rest is counted', () => {
  const c = perLaCarta({ a: Array.from({ length: 2_000 }, () => 123_456_789) });
  assert.ok(c.argomenti.a.length <= Math.ceil(T.caratteriInTutto / 9) + 2, `${c.argomenti.a.length} numbers on the card`);
  assert.ok(c.tagliati >= 1_000, `${c.tagliati} counted as cut`);
});

test('G5-M8-02: through the gate, 100,000 numbers reach a card under the JSON cap; the tool gets all of them', async (t) => {
  const r = await giro(t, { a: Array.from({ length: 100_000 }, (_, i) => i) });
  assert.ok(json(r.carte[0].argomenti).length <= TETTO_JSON, `${json(r.carte[0].argomenti).length} JSON characters`);
  assert.equal(r.eseguite[0].argomenti.a.length, 100_000);
});

test('G5-P6-01: through the gate, texts JSON writes six times longer reach a card under the JSON cap; the tool gets them whole', async (t) => {
  const pesante = '\u0001'.repeat(5_000);
  const r = await giro(t, { a: pesante, b: pesante, c: pesante, d: pesante });
  assert.ok(json(r.carte[0].argomenti).length <= TETTO_JSON, `${json(r.carte[0].argomenti).length} JSON characters`);
  assert.equal(r.eseguite[0].argomenti.d, pesante);
});

/* In free text only names split by «_» or «-» count: on the same corpus of the judge's condition 1 the glued form hid `finestraToken = null`
   and `primoToken: {…}` in every summary. Glued names count in quoted JSON with a text value (`{"githubtoken": "…"}`, G5-R4-02). */
const CODICE = 'const finestraToken = null; primoToken: 3, maxToken=200, lastPassword=unset';
test('G5-FP-04: in a text, code names glued to the secret word stay readable: «finestraToken = null», «primoToken: 3»', () => {
  assert.equal(oscuraFormeDiSegreto(CODICE), CODICE);
  assert.equal(perLaCarta({ note: CODICE }).argomenti.note, CODICE);
});

test('G5-FP-05: through the gate, the same code text reaches the card readable', async (t) => {
  const r = await giro(t, { note: CODICE });
  assert.equal(r.carte[0].argomenti.note, CODICE);
});
