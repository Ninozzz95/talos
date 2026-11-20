/*
 * 0.2.4, block 1, items 1, 3 and 4 (known limits of 0.2.3 and 0.2.2): a field named `tokens` that holds no counter, the four shapes
 * on the card (escaped quotes in JSON text, `DB_PASSWORD_2`, `pass`, `secrets` written with spaces) and a secret word anywhere in the
 * name (`password_confirmation`, `apiKeyValue`). Every secret here is FAKE (`FINTO-…`); nothing reads the environment.
 * Red on bb6d3799a (desktop-v0.2.3): every «masked» assertion below fails there (probe `C:/T/024-b1-lavoro/sonda-prima.txt`).
 * Decision 375: twenty harmless texts and twenty harmless fields stay as they are, counted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campoSegreto, nomeDiCampoSegreto, oscuraFormeDiSegreto, oscuraPerStruttura } from '../src/forme-di-segreto.mjs';
import { argomentiPerLaCarta } from '../src/kernel/talosHarness.mjs';
import { valoreLeggibile } from '../frontend/src/components/carta-dal-testo.js';

const S = 'FINTO-segreto-7Hq2Lw9';
const carta = (a) => JSON.stringify(argomentiPerLaCarta(a).argomenti);
const riga = (a) => JSON.stringify(oscuraPerStruttura(a));
const nascosto = (fuori, etichetta) => assert.ok(!fuori.includes('FINTO'), `${etichetta} ⇒ ${fuori}`);

test('B1-TOKENS-01: a list or a text under «tokens» is masked on the kernel card, the tool row and the page; a counter stays', () => {
  for (const a of [{ tokens: [S, `${S}b`] }, { tokens: S }, { access_tokens: [S] }, { refresh_tokens: S }]) {
    nascosto(carta(a), `card ${Object.keys(a)[0]}`);
    nascosto(riga(a), `row ${Object.keys(a)[0]}`);
  }
  nascosto(valoreLeggibile('tokens', [S]), 'page');
  nascosto(oscuraFormeDiSegreto(`tokens=${S}`), 'text');
  nascosto(oscuraFormeDiSegreto(`{"tokens": "${S}"}`), 'json text');
  const contatori = { tokens: 12, max_tokens: 4096, total_tokens: '1234', prompt_tokens: 5, usage: { tokens: 7, completion_tokens: 3 }, tokens_used: 9, list: { tokens: [1, 2, 3] } };
  assert.deepEqual(argomentiPerLaCarta(contatori).argomenti, contatori);
  assert.deepEqual(oscuraPerStruttura(contatori), contatori);
  for (const t of ['tokens: 12', 'max_tokens: 4096', 'tokens used: 1234', 'total_tokens=1234', '"tokens": "12"', 'MAX_OUTPUT_TOKENS=10']) assert.equal(oscuraFormeDiSegreto(t), t);
});

test('B1-TOKENS-02: «tokens» alone is not a secret NAME (the value decides), so a number never becomes «[redacted]»', () => {
  assert.equal(nomeDiCampoSegreto('tokens'), false);
  assert.equal(campoSegreto('tokens', 4096), false);
  assert.equal(campoSegreto('tokens', '4096'), false);
  assert.equal(campoSegreto('tokens', [S]), true);
  assert.equal(campoSegreto('max_tokens', 'auto'), false, 'after a counter word it is a counter whatever the value');
  assert.equal(campoSegreto('access_tokens', 3), true, 'after access_ it is a secret whatever the value');
  /* mutants left alive by the first run (M04, M08): a plain prefix keeps «tokens» ambiguous; a list with one text in it is not a counter */
  assert.equal(campoSegreto('my_tokens', [S]), true);
  assert.equal(campoSegreto('tokens', [1, S]), true);
});

test('B1-BASE-01: under a name the base already masked nothing comes back in clear: «password: null», «DB_PASS=1234», «"password": ""» stays empty', () => {
  assert.equal(oscuraFormeDiSegreto('password: null'), 'password: [redacted]', 'M14: a base name keeps masking null, as in 0.2.3');
  assert.equal(oscuraFormeDiSegreto('secret_answer: null'), 'secret_answer: null', 'a new name shows a null');
  assert.equal(oscuraFormeDiSegreto('DB_PASS=1234'), 'DB_PASS=[redacted]', 'M06: only «pass» ALONE can be a count');
  assert.equal(oscuraFormeDiSegreto('{"password": ""}'), '{"password": ""}', 'M13: an empty quoted value is shown empty');
});

test('B1-FORME-01: a field between quotes inside a text, plain or escaped, is masked; the quotes and the rest stay', () => {
  assert.equal(oscuraFormeDiSegreto(`{"password": "${S}", "user": "bob"}`), '{"password": "[redacted]", "user": "bob"}');
  assert.equal(oscuraFormeDiSegreto(`{\\"password\\": \\"${S}\\", \\"user\\": \\"bob\\"}`), '{\\"password\\": \\"[redacted]\\", \\"user\\": \\"bob\\"}');
  assert.equal(oscuraFormeDiSegreto(`{'apiKey': '${S}'}`), "{'apiKey': '[redacted]'}");
  nascosto(carta({ body: `{"db_password": "${S}"}` }), 'card, JSON text');
  nascosto(carta({ body: `{\\"api_key\\": \\"${S}\\"}` }), 'card, escaped JSON text');
  nascosto(carta({ body: JSON.stringify({ outer: JSON.stringify({ client_secret: S }) }) }), 'card, JSON inside JSON');
});

test('B1-FORME-02: DB_PASSWORD_2, pass and a secrets object written with spaces are masked in a text and on the card', () => {
  for (const t of [`DB_PASSWORD_2=${S}`, `pass=${S}`, `DB_PASS: ${S}`, `--pass=${S}`, `secrets: { db: ${S}, api: ${S}x }`, `{"secrets": { "db": "${S}" }}`,
    `secrets = [ "${S}", "${S}y" ]`, `config: { "secrets" : { "db" : "${S}" } }`]) nascosto(oscuraFormeDiSegreto(t), t);
  for (const a of [{ DB_PASSWORD_2: S }, { pass: S }, { ' secrets ': { db: S } }, { config: `secrets = { db = "${S}" }` }]) nascosto(carta(a), JSON.stringify(a));
  assert.equal(oscuraFormeDiSegreto(`secrets: { db: ${S} } and the rest`), 'secrets: [redacted] and the rest');
});

test('B1-FORME-03: «pass» as a word of prose or code stays: «except ValueError: pass», «pass: 3, fail: 0», «bypass=1», «passport: IT1»', () => {
  for (const t of ['except ValueError: pass', 'pass: 3, fail: 0', 'bypass=1', 'passport: IT1', 'pass_rate: 0.9', 'pass_count=4']) assert.equal(oscuraFormeDiSegreto(t), t);
});

test('B1-OVUNQUE-01: a secret word anywhere in the name is a secret name: password_confirmation, apiKeyValue, client_secret_value, key_material_v2', () => {
  for (const n of ['password_confirmation', 'apiKeyValue', 'client_secret_value', 'DB_PASSWORD_2', 'my_token_value', 'confirmPassword', 'pass', 'x-api-key-raw',
    'key_material_v2']) {
    assert.equal(nomeDiCampoSegreto(n), true, n);
    nascosto(carta({ [n]: S }), n);
  }
  for (const t of [`PASSWORD_CONFIRMATION=${S}`, `api_key_value: ${S}`, `export GITHUB_TOKEN_2="${S}"`, `foo: password=${S}`, `key_material: ${S}`]) nascosto(oscuraFormeDiSegreto(t), t);
  assert.equal(oscuraFormeDiSegreto('credentials: see the docs'), 'credentials: see the docs', 'in prose «credentials» stays a word');
});

test('B1-OVUNQUE-02: a data word after the secret word keeps the name honest; honest names of round 5 stay visible', () => {
  const onesti = ['token_limit', 'max_tokens', 'keyboard', 'monkey', 'secretary', 'password_hint', 'cookie_policy', 'token_count', 'total_tokens', 'tokenizer',
    'secret_name', 'password_policy', 'keys', 'author', 'authority', 'cookies_enabled', 'passport', 'token_type', 'password_min_length', 'refresh_token_expires_in',
    'ssh_key_path', 'password_required', 'cookie_domain', 'api_key_header'];
  for (const n of onesti) assert.equal(nomeDiCampoSegreto(n), false, n);
  const valori = Object.fromEntries(onesti.map((k, i) => [k, `visible-${i}`]));
  assert.deepEqual(argomentiPerLaCarta(valori).argomenti, valori);
});

/* decision 375: the noise, counted before and after (before: 0/20 and 0/20 on bb6d3799a) */
const INNOCUI = ['550e8400-e29b-41d4-a716-446655440000', 'commit 8eb29733e1c4b5a6d7e8f90123456789abcdef01', 'max_tokens: 4096', 'tokens used: 1234',
  'see password_policy.md', 'except ValueError: pass', 'C:/Users/dev/secret-santa/list.txt', 'token_limit: 4000', 'total_tokens=1234', 'password_hint: dog',
  'cookie_policy: strict', 'secretary: Jane', 'tokens: 12', 'prompt_tokens: 5, completion_tokens: 7', 'the key: Enter', 'monkey=banana', 'pass: 3, fail: 0',
  'keyboard=us', 'secret_name: prod-db', 'password_min_length=12'];
const CAMPI = { uuid: '550e8400-e29b-41d4-a716-446655440000', commit: '8eb29733e1c4b5a6d7e8f90123456789abcdef01', max_tokens: 4096, tokens: 1234,
  password_policy: 'password_policy.md', token_limit: 4000, total_tokens: 1234, password_hint: 'dog', cookie_policy: 'strict', secretary: 'Jane',
  secret_name: 'prod-db', password_min_length: 12, tokenizer: 'cl100k', passport: 'IT123', keyboard: 'us', token_type: 'Bearer', usage: { tokens: 12, prompt_tokens: 5 },
  path: 'C:/Users/dev/secret-santa/list.txt', cookies_enabled: 'yes', password_required: 'yes' };
test('B1-RUMORE-01: twenty harmless texts and twenty harmless fields are untouched (decision 375: 0/20 and 0/20)', () => {
  assert.deepEqual(INNOCUI.filter((t) => oscuraFormeDiSegreto(t) !== t), []);
  assert.deepEqual(argomentiPerLaCarta(CAMPI).argomenti, CAMPI);
  assert.deepEqual(oscuraPerStruttura(CAMPI), CAMPI);
});

test('B1-TEMPO-01: the new reader stays linear: 1 MB of quoted fields, escaped ladders, «secrets: {» never closed and 4 names of 100,000 characters', () => {
  const casi = [
    `{"password": "x", `.repeat(60_000),
    `${'\\'.repeat(40)}"password${'\\'.repeat(39)}": `.repeat(12_000),
    'secrets: { '.repeat(90_000),
    `${'a_'.repeat(50_000)}password=x `.repeat(4),
    '"a": '.repeat(200_000),
    `pass${'_x'.repeat(50_000)}: 1 `.repeat(4),
  ];
  for (const t of casi) {
    const inizio = performance.now();
    oscuraFormeDiSegreto(t);
    const ms = performance.now() - inizio;
    assert.ok(ms < 1000, `${t.slice(0, 30)}… (${t.length} chars) took ${ms.toFixed(1)} ms`);
  }
});
