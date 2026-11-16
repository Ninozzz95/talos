/*
 * Twin repair of 0.2.2, round 7, the small one (owner 14/11 19:46, judge v1905-v1906):
 *   point 0  the tool row in the conversation (head and expanded detail) printed the arguments as they came: `password: hunter2`, a key,
 *            a password inside a nested object, while the card hid them (reviewer 3 after round 6, RED 1, on the terminal; the same row of
 *            the page was «not verified»). The row now draws `argomentiDellaRiga`: the card's masks, also on the JSON still arriving;
 *   point 2  the card of a call written as text masked only at the top: `{"db":{"password":"hunter2"}}` was in clear on it and masked on the
 *            connector card (page reviewer, point 1, 1,024 cases with a real secret in clear). `valoreLeggibile` now masks by structure;
 *   point 3  the missing tests: X9 and X2 by two tests each, a second test for X1, X3, X6, X10 (mutants of reviewer 3, round 6);
 *   point 6  the row with no name reads «value» (owner 19:57, variant A).
 * The model and the tool receive the real arguments: only the copy for the screen changes.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as K from '../src/kernel/talosHarness.mjs';
import * as FDS from '../src/forme-di-segreto.mjs';
import * as PAGINA from '../frontend/src/components/carta-dal-testo.js';
/* by namespace: on the base, a function that does not exist yet makes each test red on its own, not the whole file */
const { oscuraFormeDiSegreto } = FDS;
const { bloccoDegliArgomenti, righeDegliArgomenti, valoreLeggibile } = PAGINA;
const oscuraPerStruttura = (...a) => FDS.oscuraPerStruttura(...a);
const argomentiDellaRiga = (...a) => PAGINA.argomentiDellaRiga(...a);
const argomentiGrezziDellaRiga = (...a) => PAGINA.argomentiGrezziDellaRiga(...a);
import { impostaLingua } from '../frontend/src/components/lingua.js';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { talosLavora, argomentiPerLaCarta: perLaCarta } = K;
const OSCURATO = '[redacted]';
const json = (x) => JSON.stringify(x);
/* secrets with letters that appear nowhere else, so even two characters of them would be seen */
const PWD = 'QZXJ7pwd', KEY = 'QZXJ8key', NEST = 'QZXJ9nest', LIST = 'QZXJ6list', COOKIE = 'QZXJ5cook';
const SEGRETI = [PWD, KEY, NEST, LIST, COOKIE];
const ARGOMENTI = { title: 'Login button does nothing', password: PWD, api_key: KEY, config: { db: { host: 'db.local', password: NEST } }, tags: [{ name: 'bug', token: LIST }], session_cookie: COOKIE, clear_cookies: true };
const nessunSegreto = (testo, cosa) => { for (const s of SEGRETI) assert.ok(!String(testo).includes(s.slice(0, 5)), `${cosa}: «${s}» in clear in ${String(testo).slice(0, 300)}`); };

/* ------------------------------------------------------------ point 0: the tool row ------------------------------------------------------------ */
test('G7-P0-01: the row shows the arguments with the card\'s masks: top, nested object, list; honest values stay', () => {
  const r = argomentiDellaRiga(json(ARGOMENTI));
  nessunSegreto(json(r), 'row');
  assert.equal(r.password, OSCURATO);
  assert.equal(r.api_key, OSCURATO);
  assert.equal(r.config.db.password, OSCURATO);
  assert.equal(r.tags[0].token, OSCURATO);
  assert.equal(r.title, 'Login button does nothing');
  assert.equal(r.config.db.host, 'db.local');
  assert.equal(r.clear_cookies, true);
});

test('G7-P0-02: the row and the connector card show the same arguments (no cut needed)', () => {
  assert.deepEqual(argomentiDellaRiga(json(ARGOMENTI)), perLaCarta(ARGOMENTI).argomenti);
  const lista = [{ password: PWD }, 'rm -rf /', { nested: [{ api_key: KEY }] }];
  assert.deepEqual(argomentiDellaRiga(json(lista)), perLaCarta(lista).argomenti);
});

test('G7-P0-03: while the JSON arrives piece by piece, no prefix ever shows two characters of a secret (a value cut between two pieces)', () => {
  const testo = json(ARGOMENTI);
  let mostrati = 0;
  for (let i = 1; i <= testo.length; i++) {
    const r = argomentiDellaRiga(testo.slice(0, i));
    if (r) mostrati += 1;
    nessunSegreto(json(r), `prefix ${i}`);
  }
  assert.ok(mostrati > testo.length * 0.9, `the preview shows the arguments while they arrive (${mostrati}/${testo.length})`);
  /* a value cut between two pieces under a secret name is masked from the first piece */
  assert.deepEqual(argomentiDellaRiga('{"title":"a","password":"QZ'), { title: 'a', password: OSCURATO });
  /* a name cut in half, or with no value yet, is not shown at all */
  assert.deepEqual(argomentiDellaRiga('{"title":"a","pass'), { title: 'a' });
  assert.deepEqual(argomentiDellaRiga('{"title":"a","password":'), { title: 'a' });
});

test('G7-P0-04: the same preview with a pretty-printed JSON and escapes; a JSON that cannot be closed shows nothing, never the raw text', () => {
  const testo = JSON.stringify({ note: 'a "quoted" \\ text', password: PWD, inner: { api_key: KEY } }, null, 2);
  for (let i = 1; i <= testo.length; i++) nessunSegreto(json(argomentiDellaRiga(testo.slice(0, i))), `pretty prefix ${i}`);
  assert.equal(argomentiDellaRiga('{"a":tr'), null);
  assert.equal(argomentiGrezziDellaRiga('{"password":"QZXJ7pwd" broken'), '', 'a JSON that is not closed never reaches the screen raw');
});

test('G7-P0-05: arguments that are not JSON are shown as text with the secret forms masked; JSON-looking text is never shown raw', () => {
  const grezzo = argomentiGrezziDellaRiga('export DB_PASSWORD=hunter2 && deploy');
  assert.ok(!grezzo.includes('hunter2'));
  assert.match(grezzo, /\[redacted\]/u);
  assert.equal(argomentiGrezziDellaRiga('[{"password":"x"'), '');
  assert.equal(argomentiDellaRiga('plain text'), null);
  assert.equal(argomentiDellaRiga('"a bare string"'), null);
});

test('G7-P0-06: through the gate, the row arguments derived from the real stream mask what the card masks, and the tool gets the real values', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'g7-riga-'));
  t.after(() => { try { rimuoviCartellaDiProva(cartella); } catch { /* gone */ } });
  const TOOL_MCP = [{ name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: {} } }];
  const risposte = [{ role: 'assistant', content: null, tool_calls: [{ id: 'g7', type: 'function', function: { name: 'mcp__github__create_issue', arguments: json(ARGOMENTI) } }] }, { role: 'assistant', content: 'done', tool_calls: [] }];
  let n = 0; const eseguite = []; const carte = [];
  await talosLavora({
    cartella, task: { consegna: 'open it' }, modello: 'x', chiave: 'finta', livelloAccesso: 'scrittura-progetto', toolMcp: TOOL_MCP,
    chiamaToolMcpFn: async (_n, a) => { eseguite.push(json(a)); return { content: [{ type: 'text', text: 'ok' }], isError: false }; },
    chiediApprovazioneFn: async (a) => { carte.push(a); return true; },
    fetchDiRete: async () => { const s = risposte[Math.min(n++, 1)]; return { ok: true, status: 200, json: async () => ({ choices: [{ message: s }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' }; },
  });
  assert.equal(eseguite.length, 1);
  for (const s of SEGRETI) assert.ok(eseguite[0].includes(s), 'the tool gets the real value');
  const carta = carte.find((c) => c.tipo === 'mcp_tool');
  assert.ok(carta, 'a card');
  const grezzo = json(ARGOMENTI); // the text the row receives in ToolCallArgs is the JSON the model wrote
  assert.deepEqual(argomentiDellaRiga(grezzo), carta.argomenti, 'the row shows what the card shows');
});

/* ------------------------------------------------------------ point 2: nested on the card written as text ------------------------------------------------------------ */
test('G7-P2-01: on the card of a call written as text a nested secret is masked, in an object and in a list, like on the connector card', () => {
  const v = valoreLeggibile('config', { db: { password: 'hunter2', session_cookie: 'abc123', dbPassword: true, host: 'h' } });
  assert.ok(!v.includes('hunter2') && !v.includes('abc123'), v);
  assert.match(v, /"dbPassword": "\[redacted\]"/u);
  assert.match(v, /"host": "h"/u);
  const l = valoreLeggibile('items', [{ token: 'tok-QZXJ' }, { name: 'x' }]);
  assert.ok(!l.includes('tok-QZXJ'), l);
  const cima = righeDegliArgomenti({ argomenti: [{ password: 'hunter2' }, 'x'] }, { tutti: true });
  assert.ok(!json(cima).includes('hunter2'), json(cima));
});

test('G7-P2-02: the two cards show the same rows for nested and listed arguments too', () => {
  for (const a of [{ opzioni: { password: 'hunter2', clear_cookies: true } }, { elenco: [{ api_key: 'k-QZXJ', note: 'n' }] }, { a: { b: { c: [{ secret: 's' }] } } }]) {
    const testo = righeDegliArgomenti({ tipo: 'chiamata-dal-testo', argomenti: a });
    const carta = righeDegliArgomenti({ tipo: 'mcp_tool', argomenti: perLaCarta(a).argomenti }, { tutti: true });
    assert.deepEqual(testo, carta, json(a));
  }
});

/* the page reviewer's generator (C:/T/rev-gem5-2-lavoro/confronto-carte.mjs): 636 names × 23 values × 3 shapes */
const ZW = String.fromCharCode(0x200b); const KELVIN = String.fromCharCode(0x212a);
const PAROLE = ['password', 'passwd', 'pwd', 'secret', 'secrets', 'token', 'api_key', 'apikey', 'api-key', 'access_token', 'accessToken', 'auth_token', 'authToken',
  'key', 'cookie', 'cookies', 'passphrase', 'private_key', 'privateKey', 'credentials', 'credential', 'authorization', 'bearer', 'secret_value', 'key_material', 'api_keys', 'passwords'];
const FORME = (p) => [p, p.toUpperCase(), `db_${p}`, `db-${p}`, `db${p}`, `db${p[0].toUpperCase()}${p.slice(1)}`, `is_${p}`, `include_${p}`, `clear_${p}`, `list_${p}`, `${p}_hint`, `${p}_enabled`,
  ` ${p}`, `${p} `, `x_${p} `, `${p.slice(0, 2)}${ZW}${p.slice(2)}`, `my${ZW}_${p}`, `_${p}`, `__${p}`, `x.${p}`, `${p}(2)`, `${p}…`, p.replace(/k/giu, KELVIN), `has${p[0].toUpperCase()}${p.slice(1)}`];
const NOMI = [...new Set(PAROLE.flatMap(FORME))];
const VALORI = [true, false, 'true', 'false', 'yes', 'no', 'True', 'FALSE', 'Yes', 'NO', 'no)', 'true]}', ' true', 'true ', 'on', 'off', 1, 0, null, '', 'hunter2', 'yes please', 'sk-proj-abcdefghijklmnopqrstuvwx1234'];
test('G7-P2-03: on the reviewer\'s cases (names × values × top, nested, list) the two cards are equal and no real secret is in clear on either', () => {
  let casi = 0, diverse = 0, inChiaro = 0;
  for (const k of NOMI) for (const v of VALORI) for (const forma of ['cima', 'annidato', 'lista']) {
    const a = forma === 'cima' ? { [k]: v } : forma === 'annidato' ? { opzioni: { [k]: v } } : { elenco: [{ [k]: v }] };
    const chiave = forma === 'cima' ? k : forma === 'annidato' ? 'opzioni' : 'elenco';
    const t = righeDegliArgomenti({ tipo: 'chiamata-dal-testo', argomenti: a }).find((r) => r.k === chiave)?.v;
    const g = righeDegliArgomenti({ tipo: 'mcp_tool', argomenti: perLaCarta(a).argomenti }, { tutti: true }).find((r) => r.k === chiave)?.v;
    casi += 1;
    if (t !== g) diverse += 1;
    if (/hunter2|sk-proj/u.test(`${t}`) && !/hunter2|sk-proj/u.test(`${g}`)) inChiaro += 1;
  }
  assert.equal(casi, NOMI.length * VALORI.length * 3);
  assert.ok(casi >= 43_000, `${casi} cases`);
  assert.equal(inChiaro, 0, 'a real secret in clear on the card written as text');
  assert.equal(diverse, 0, 'the two cards differ');
});

/* ------------------------------------------------------------ point 6: the row with no name ------------------------------------------------------------ */
const nodoFinto = () => { const n = { className: '', dataset: {}, textContent: '', attributi: {}, figli: [] }; n.setAttribute = (k, v) => { n.attributi[k] = v; }; n.append = (...xs) => { n.figli.push(...xs); }; return n; };
const docFinto = { createElement: () => nodoFinto() };
test('G7-P6-01: a list or a bare text at the top is one row labelled «value» in English and «valore» in Italian, on both cards', (t) => {
  t.after(() => impostaLingua('it'));
  for (const [lingua, voce] of [['en', 'value'], ['it', 'valore']]) {
    impostaLingua(lingua);
    for (const cima of [['bug', 'urgent'], 'Fix the login page']) {
      for (const azione of [{ tipo: 'chiamata-dal-testo', argomenti: cima }, { tipo: 'mcp_tool', argomenti: perLaCarta(cima).argomenti }]) {
        const blocco = bloccoDegliArgomenti(docFinto, azione, { tutti: true });
        assert.equal(blocco.figli.length, 1);
        const [k, v] = blocco.figli[0].figli;
        assert.equal(k.textContent, voce, `${lingua} ${json(cima)} ${azione.tipo}`);
        assert.equal(k.className, 'talos-kv__k talos-kv__k--generico');
        assert.equal(v.textContent, json(cima));
      }
    }
  }
});
test('G7-P6-02: a named row keeps its own name: «value» is only for the row with no name', (t) => {
  t.after(() => impostaLingua('it'));
  impostaLingua('en');
  const blocco = bloccoDegliArgomenti(docFinto, { tipo: 'mcp_tool', argomenti: { title: 'x', labels: ['bug'] } }, { tutti: true });
  assert.deepEqual(blocco.figli.map((r) => r.figli[0].textContent), ['title', 'labels']);
  assert.ok(blocco.figli.every((r) => r.figli[0].className === 'talos-kv__k'));
});

/* ------------------------------------------------------------ point 3: the missing tests (no product change) ------------------------------------------------------------ */
test('G7-X9-01: a quoted password with spaces in a text is masked whole: «export DB_PASSWORD=\'p4ss w0rd here\'»', () => {
  const s = oscuraFormeDiSegreto("export DB_PASSWORD='p4ss w0rd here' && make");
  assert.equal(s, `export DB_PASSWORD=${OSCURATO} && make`);
});
test('G7-X9-02: the same quoted password on the card of a connector and on the row: nothing of it is in clear', () => {
  const a = { command: "export DB_PASSWORD='p4ss w0rd here'" };
  assert.equal(perLaCarta(a).argomenti.command, `export DB_PASSWORD=${OSCURATO}`);
  assert.equal(argomentiDellaRiga(json(a)).command, `export DB_PASSWORD=${OSCURATO}`);
});
test('G7-X2-01: «db_pwd=true» in a text stays masked, as the base did', () => {
  assert.equal(oscuraFormeDiSegreto('db_pwd=true'), `db_pwd=${OSCURATO}`);
  assert.equal(oscuraFormeDiSegreto('MYSQL_PASSWD: yes'), `MYSQL_PASSWD: ${OSCURATO}`);
});
test('G7-X2-02: a field «db_pwd» or «user_passwd» with a yes/no stays masked on the card, on the page and on the row', () => {
  for (const k of ['db_pwd', 'user_passwd']) {
    assert.equal(perLaCarta({ [k]: true }).argomenti[k], OSCURATO, k);
    assert.equal(valoreLeggibile(k, true), OSCURATO, k);
    assert.equal(oscuraPerStruttura({ [k]: 'false' })[k], OSCURATO, k);
  }
});
test('G7-X1-02: a yes/no in capitals under an honest name stays readable: «True», «YES», «FALSE»', () => {
  assert.equal(perLaCarta({ clear_cookies: 'True' }).argomenti.clear_cookies, 'True');
  assert.equal(oscuraFormeDiSegreto('include_secrets=YES'), 'include_secrets=YES');
  assert.equal(valoreLeggibile('list_api_keys', 'FALSE'), 'FALSE');
});
test('G7-X3-02: a «_key» base name with a yes/no stays masked: on the card, in a text, on the row', () => {
  assert.equal(perLaCarta({ x_key: true }).argomenti.x_key, OSCURATO);
  assert.equal(oscuraFormeDiSegreto('signing_key=true'), `signing_key=${OSCURATO}`);
  assert.equal(oscuraPerStruttura({ 'encryption-key': 'yes' })['encryption-key'], OSCURATO);
});
test('G7-X6-02: in a text the separator is not part of the name: «DB_PASSWORD: yes», «api_token = true» stay masked', () => {
  assert.equal(oscuraFormeDiSegreto('DB_PASSWORD: yes'), `DB_PASSWORD: ${OSCURATO}`);
  assert.equal(oscuraFormeDiSegreto('api_token = true'), `api_token = ${OSCURATO}`);
});
test('G7-X10-02: a «token» base name with a yes/no stays masked: «page_token», «session_token»', () => {
  assert.equal(perLaCarta({ page_token: true }).argomenti.page_token, OSCURATO);
  assert.equal(oscuraFormeDiSegreto('session_token=false'), `session_token=${OSCURATO}`);
});

/* ------------------------------------------- mutants of round 7 (copy only): the places one test alone caught ------------------------------------------- */
/* a NAME shaped like a key (a model that writes the key as the field name), twice: masked, and the second keeps its own row */
const NOME_CHIAVE_1 = 'sk-QZXJ4aaaaaaaaaaaaaaaaaaaa1', NOME_CHIAVE_2 = 'sk-QZXJ3bbbbbbbbbbbbbbbbbbbb2';
test('G7-M-01: on the row a field NAME shaped like a key is masked, and two such names stay two rows («(2)»)', () => {
  const r = argomentiDellaRiga(json({ title: 'x', [NOME_CHIAVE_1]: 'a', [NOME_CHIAVE_2]: 'b' }));
  assert.ok(!json(r).includes('QZXJ4') && !json(r).includes('QZXJ3'), json(r));
  assert.equal(Object.keys(r).length, 3, json(r));
  assert.deepEqual(Object.values(r), ['x', 'a', 'b']);
  assert.ok(Object.keys(r).some((k) => k.endsWith('(2)')), json(r));
});
test('G7-M-02: on the card written as text a nested NAME shaped like a key is masked, and two such names stay two', () => {
  const v = valoreLeggibile('config', { db: { [NOME_CHIAVE_1]: 'a', [NOME_CHIAVE_2]: 'b' } });
  assert.ok(!v.includes('QZXJ4') && !v.includes('QZXJ3'), v);
  const dentro = JSON.parse(v).db;
  assert.equal(Object.keys(dentro).length, 2, v);
  assert.ok(Object.keys(dentro).some((k) => k.endsWith('(2)')), v);
});
test('G7-M-03: an empty or null value under a secret name stays as it is on the row, not «[redacted]» (nothing to hide, like the card)', () => {
  const r = argomentiDellaRiga(json({ password: '', api_key: null, token: 'QZXJ8key' }));
  assert.equal(r.password, '');
  assert.equal(r.api_key, null);
  assert.equal(r.token, OSCURATO);
  assert.deepEqual(r, perLaCarta({ password: '', api_key: null, token: 'QZXJ8key' }).argomenti);
});
test('G7-M-04: on the card written as text an empty nested secret stays empty, a filled one is masked', () => {
  const dentro = JSON.parse(valoreLeggibile('config', { db: { password: '', secret_answer: null, token: 'QZXJ8key' } })).db;
  assert.deepEqual(dentro, { password: '', secret_answer: null, token: OSCURATO });
});
test('G7-M-05: a list at the top of the card written as text is walked: a nested secret in it is masked, in the rows and in the block', (t) => {
  impostaLingua('en');
  t.after(() => impostaLingua('it'));
  const azione = { tipo: 'chiamata-dal-testo', argomenti: [{ db: { password: 'QZXJ9nest', host: 'h' } }, { tags: [{ api_key: 'QZXJ6list' }] }] };
  const righe = righeDegliArgomenti(azione, { tutti: true });
  assert.equal(righe.length, 1);
  nessunSegreto(righe[0].v, 'top list row');
  assert.match(righe[0].v, /"host":"h"/u);
});
test('G7-M-06: arguments that are not JSON on the row: a bearer header and a key in a URL are masked, the rest of the text stays', () => {
  const g = argomentiGrezziDellaRiga('curl -H "Authorization: Bearer QZXJ5cookieabcdef0123456789" https://api.example.test/?api_key=QZXJ8keyabc123');
  assert.ok(!g.includes('QZXJ5') && !g.includes('QZXJ8'), g);
  assert.ok(g.includes('api.example.test'), g);
});
test('G7-M-07: while a flat JSON arrives, the honest values already arrived are shown: an open string as «…» (round 8), a name with no value, a half name', () => {
  assert.deepEqual(argomentiDellaRiga('{"title":"Login but'), { title: '…' }); // round 8, point 3: an open value reads «…» until it closes
  assert.deepEqual(argomentiDellaRiga('{"title":"Login","region":"eu","password":'), { title: 'Login', region: 'eu' });
  assert.deepEqual(argomentiDellaRiga('{"title":"Login","region":"eu","passw'), { title: 'Login', region: 'eu' });
  assert.deepEqual(argomentiDellaRiga('{"title":"Login\\'), { title: '…' });
});
test('G7-M-08: while a pretty-printed nested JSON arrives, the honest values already arrived are shown inside the object', () => {
  assert.deepEqual(argomentiDellaRiga('{\n  "config": {\n    "region": "eu-we'), { config: { region: '…' } });
  assert.deepEqual(argomentiDellaRiga('{\n  "config": {\n    "region": "eu",\n    "password":'), { config: { region: 'eu' } });
  assert.deepEqual(argomentiDellaRiga('{\n  "items": [\n    {\n      "name": "a",\n      "token": "QZ'), { items: [{ name: 'a', token: OSCURATO }] });
});
