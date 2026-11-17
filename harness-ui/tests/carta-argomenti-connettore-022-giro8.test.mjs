/*
 * Twin repair of 0.2.2, round 8, the complete one (owner 14/11 23:49, judge v1917, yes v1920). The three reviewers after round 7 were RED:
 *   point 1  one work budget (H2 + shared object): `oscuraPerStruttura` searched the «(n)» of equal names from 2 for every name (quadratic:
 *            369 KB of equal names cost 77 s on the row, base 5.3 ms) and walked a shared child once per path (22 levels 95 s). It now counts
 *            the nodes and the characters it visits; over the cap it stops and shows «…», and a value it cannot finish is never shown;
 *   point 2  H1: `chiudiJsonParziale` (carta-dal-testo.js:95) ran a backtracking regex on every frame (80 KB of spaces: 6.8 s a frame);
 *   point 3  P1/R1: while the arguments stream, a value still open is never shown (a secret known by its FORM needs the whole token: GitHub
 *            37 of 44 characters were on screen); it reads «…» until it closes, then passes the masks as before;
 *   point 4  P2: the activity group read the raw arguments (`attivita-segmento.js:348`): «Ran export DB_PASSWORD=… && make deploy»;
 *   point 5  R2: invisible characters inside a secret name (the kernel half: `nomeDiCampoSegreto`);
 *   point 6  tests for the live mutants of round 7 (Y1-Y13 of reviewer 7-1, G1, M6 of reviewer 7-2);
 *   point 8  (judge v1920) the budget cut makes a truncated value too: it is treated as an open value, «…», never a piece of it.
 * The model and the tool receive the real arguments: only the copy for the screen changes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as FDS from '../src/forme-di-segreto.mjs';
import * as PAGINA from '../frontend/src/components/carta-dal-testo.js';
import * as SEGMENTO from '../frontend/src/components/attivita-segmento.js';
import { impostaLingua } from '../frontend/src/components/lingua.js';
/* Time ceilings ×4 only under CI (shared runners); locally they stay as they were. Same rule as carta-argomenti-connettore-022-giro6. */
const MOLTIPLICATORE_CI = process.env.CI && process.env.CI !== 'false' ? 4 : 1;

/* by namespace: on the base, a function or a constant that does not exist yet makes each test red on its own, not the whole file */
const oscuraPerStruttura = (...a) => FDS.oscuraPerStruttura(...a);
const argomentiDellaRiga = (...a) => PAGINA.argomentiDellaRiga(...a);
const argomentiGrezziDellaRiga = (...a) => PAGINA.argomentiGrezziDellaRiga(...a);
const valoreLeggibile = (...a) => PAGINA.valoreLeggibile(...a);
const normalizzaVoce = (...a) => SEGMENTO.normalizzaVoce(...a);
const { fraseAdesso, riassuntoVoci, testoDelSegmento, bersaglioAttrezzo } = SEGMENTO;
const OSCURATO = '[redacted]';
const TAGLIO = '…';
const json = (x) => JSON.stringify(x);
const ms = (f) => { const t0 = performance.now(); const r = f(); return { r, t: performance.now() - t0 }; };

/* secrets whose distinctive part (after the well-known prefix) uses letters found nowhere else in the arguments */
const GHP = 'ghp_QZXJ7a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P';
const AKIA = 'AKIAQZXJ7W3E4R5T6Y7U';
const SKP = 'sk-proj-QZXJ8a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5';
const BEARER = 'QZXJ9bcdefWvUtSrQpOnMlKjih';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJRWlhKcmV2OCJ9.QZXJsigAbCdEfGhIjKlMnOp';
const URLP = 'QZXJurlPQSW9z8';
const ENVP = 'QZXJenvPQSW9z8';
/* the part of each secret that must never appear: from its first distinctive character to its end */
const CORPI = { GHP: GHP.slice(4), AKIA: AKIA.slice(4), SKP: SKP.slice(8), BEARER, JWT: JWT.slice(3), URLP, ENVP };
/* the longest piece of a secret body on screen (4 characters or more count as seen: three letters of a key or a word, «url», «123», meet by chance) */
function visibili(testo) {
  const s = String(testo);
  const fuori = {};
  for (const [k, corpo] of Object.entries(CORPI)) {
    let massimo = 0;
    for (let i = 0; i + 4 <= corpo.length && massimo < corpo.length - i; i++) {
      for (let n = corpo.length - i; n >= 4 && n > massimo; n--) if (s.includes(corpo.slice(i, i + n))) { massimo = n; break; }
    }
    if (massimo) fuori[k] = massimo;
  }
  return fuori;
}
const FORME = { title: 'Rotate the creds', body: `Repro uses ${GHP} now`, aws: AKIA, note: SKP, header: `Bearer ${BEARER}`, jwt: JWT, url: `https://admin:${URLP}@example.invalid/x`, script: `export DB_PASSWORD='${ENVP}' && make deploy` };

/* ------------------------------------------------------------ point 1: one work budget ------------------------------------------------------------ */
test('G8-B-01 (H2): 369 KB of names that become equal after masking: row, structure and card each finish in a short time', () => {
  assert.equal(typeof FDS.TETTO_NODI_DA_MOSTRARE, 'number', 'no work budget: on the base this case costs minutes, not run');
  const o = {};
  let i = 0;
  while (json(o).length < 369 * 1024) o[`password=${i++}`] = 'x';
  const testo = json({ wrap: o });
  const riga = ms(() => argomentiDellaRiga(testo));
  const struttura = ms(() => oscuraPerStruttura(o));
  const carta = ms(() => valoreLeggibile('wrap', o));
  for (const [cosa, m] of [['row', riga], ['structure', struttura], ['card', carta]]) assert.ok(m.t < 1500 * MOLTIPLICATORE_CI, `[ceiling ${1500 * MOLTIPLICATORE_CI} ms] ${cosa}: ${m.t.toFixed(1)} ms (base 77 s on the row)`);
  assert.ok(!json(riga.r).includes('password=1'), 'every name is masked');
});

test('G8-B-02: the «(n)» of equal names counts on per name with a map; a real «x(2)» is not overwritten', () => {
  const r = oscuraPerStruttura({ 'password=a': 1, 'password=b': 2, 'password=c': 3, 'token: q': 4, 'token: r': 5 });
  assert.deepEqual(Object.keys(r), ['password=[redacted]', 'password=[redacted](2)', 'password=[redacted](3)', 'token: [redacted]', 'token: [redacted](2)']);
  /* a real name «[redacted](2)» (the masks leave it as it is), then three keys that mask to «[redacted]» */
  const s = oscuraPerStruttura({ '[redacted](2)': 'real', [AKIA]: 1, [GHP]: 2, [SKP]: 3 });
  assert.deepEqual(Object.keys(s), ['[redacted](2)', '[redacted]', '[redacted](3)', '[redacted](4)']);
  assert.equal(s['[redacted](2)'], 'real');
});

test('G8-B-03: a shared child at 22 and 30 levels stops at the node cap with «…», quickly, and keeps no secret', () => {
  assert.equal(typeof FDS.TETTO_NODI_DA_MOSTRARE, 'number', 'no work budget: on the base 30 levels cost hours or all the memory, not run');
  /* 15 levels first (65,536 leaves): without a node budget this finishes in a moment and has no «…», so the deeper cases never run */
  let quindici = { note: 'n' };
  for (let l = 0; l < 15; l++) quindici = { a: quindici, b: quindici };
  assert.ok(json(oscuraPerStruttura(quindici)).includes(TAGLIO), '15 shared levels stop at the node cap');
  for (const livelli of [22, 30]) {
    let figlio = { password: 'QZXJshared', note: 'n' };
    for (let l = 0; l < livelli; l++) figlio = { a: figlio, b: figlio };
    const { r, t } = ms(() => oscuraPerStruttura(figlio));
    const testo = json(r);
    assert.ok(t < 1500, `${livelli} levels: ${t.toFixed(1)} ms (22 levels cost 95 s)`);
    assert.ok(testo.includes(TAGLIO), `${livelli} levels: the cut is said`);
    assert.ok(!testo.includes('QZXJshared'), `${livelli} levels: no secret`);
    assert.ok(testo.length < 2_000_000, `${livelli} levels: ${testo.length} characters`);
  }
});

test('G8-B-04: 3 MB of arguments on the row: a short time, and nothing of a secret past the cap', () => {
  const grande = { title: 'big', content: `${'lorem ipsum '.repeat(250_000)} ${GHP}` };
  const testo = json(grande);
  assert.ok(testo.length > 3_000_000);
  const riga = ms(() => argomentiDellaRiga(testo));
  assert.ok(riga.t < 1500 * MOLTIPLICATORE_CI, `[ceiling ${1500 * MOLTIPLICATORE_CI} ms] row: ${riga.t.toFixed(1)} ms`);
  assert.deepEqual(visibili(json(riga.r)), {});
  const molti = { items: Array.from({ length: 60_000 }, (_, k) => ({ id: k, note: `item ${k} ${AKIA}` })) };
  const r2 = ms(() => argomentiDellaRiga(json(molti)));
  assert.ok(r2.t < 1500 * MOLTIPLICATORE_CI, `[ceiling ${1500 * MOLTIPLICATORE_CI} ms] many small: ${r2.t.toFixed(1)} ms`);
  assert.ok(json(r2.r).includes(TAGLIO), 'the cut is said');
  assert.deepEqual(visibili(json(r2.r)), {});
});

test('G8-B-05: the caps are numbers the report states; arguments within them come out exactly as before, with no «…»', () => {
  assert.equal(typeof FDS.TETTO_NODI_DA_MOSTRARE, 'number');
  assert.equal(typeof FDS.TETTO_CARATTERI_DA_MOSTRARE, 'number');
  assert.ok(FDS.TETTO_NODI_DA_MOSTRARE >= 1000 && FDS.TETTO_CARATTERI_DA_MOSTRARE >= 100_000);
  const a = { title: 'Login', password: 'QZXJ7pwd', config: { db: { host: 'h', password: 'QZXJ9' } }, tags: [{ token: 'QZXJ6' }], n: 3, ok: true, z: null };
  assert.deepEqual(oscuraPerStruttura(a), { title: 'Login', password: OSCURATO, config: { db: { host: 'h', password: OSCURATO } }, tags: [{ token: OSCURATO }], n: 3, ok: true, z: null });
  assert.ok(!json(argomentiDellaRiga(json(a))).includes(TAGLIO));
});

test('G8-B-06: with the caps raised, 18,000 names equal after masking still take a short time: the «(n)» does not restart from 2', () => {
  const o = {};
  for (let i = 0; i < 18_000; i++) o[`password=${i}`] = 'x';
  const { r, t } = ms(() => oscuraPerStruttura(o, { nodi: 1_000_000, caratteri: 10_000_000 }));
  assert.ok(t < 1500, `${t.toFixed(1)} ms (from 2 every time: quadratic, seconds)`);
  assert.equal(Object.keys(r).at(-1), 'password=[redacted](18000)');
});
test('G8-B-07: the same with names that mask to a key form, in a list of objects', () => {
  const o = {};
  for (let i = 0; i < 18_000; i++) o[`token: v${i}`] = i;
  const { r, t } = ms(() => oscuraPerStruttura([o], { nodi: 1_000_000, caratteri: 10_000_000 }));
  assert.ok(t < 1500, `${t.toFixed(1)} ms`);
  assert.equal(Object.keys(r[0]).length, 18_000);
});
test('G8-B-08: a name longer than what is left of the budget is not shown, and the cut is said once', () => {
  const lungo = `n_${'q'.repeat(300)}`;
  const r = oscuraPerStruttura({ a: 1, [lungo]: 'v', b: 2 }, { nodi: 1000, caratteri: 200 });
  assert.deepEqual(r, { a: 1, [TAGLIO]: TAGLIO });
  const s = oscuraPerStruttura({ [`x_${GHP}`]: 1 }, { nodi: 1000, caratteri: 20 });
  assert.deepEqual(visibili(json(s)), {});
});
test('G8-B-09: after the cut, an object and a list end with one «…» entry; a value that is cut is «…» under its own name', () => {
  assert.deepEqual(oscuraPerStruttura({ a: 'x'.repeat(50), b: 'y', c: 'z' }, { nodi: 1000, caratteri: 30 }), { a: TAGLIO, [TAGLIO]: TAGLIO });
  assert.deepEqual(oscuraPerStruttura(['x'.repeat(50), 'y', 'z'], { nodi: 1000, caratteri: 30 }), [TAGLIO]); // the cut value already says it
  assert.deepEqual(oscuraPerStruttura({ a: 1, b: 2, c: 3, d: 4 }, { nodi: 4, caratteri: 1000 }), { a: 1, b: TAGLIO, [TAGLIO]: TAGLIO });
  assert.deepEqual(oscuraPerStruttura([1, 2, 3, 4], { nodi: 3, caratteri: 1000 }), [1, 2, TAGLIO]);
});

/* ------------------------------------------------------------ point 8: the budget cut is an open value ------------------------------------------------------------ */
test('G8-T-01 (judge v1920): ghp_, AKIA and a JWT across the character cut, in every position: 0 characters of them on screen', () => {
  for (const [nome, segreto] of [['GHP', GHP], ['AKIA', AKIA], ['JWT', JWT]]) {
    for (const tetto of [40, 64, 100]) {
      let tagliati = 0;
      for (let prima = Math.max(0, tetto - segreto.length - 8); prima <= tetto + 2; prima++) {
        const dentro = { a: 'p'.repeat(prima), s: `x ${segreto}` }; // the secret in its own value, after a filler
        const unito = { s: `${'p'.repeat(prima)} ${segreto} tail` }; // the secret inside one long value
        for (const v of [dentro, unito]) {
          const r = json(oscuraPerStruttura(v, { caratteri: tetto + 4, nodi: 1000 }));
          if (r.includes(TAGLIO)) tagliati += 1;
          assert.deepEqual(visibili(r), {}, `${nome} cap ${tetto} filler ${prima}: ${r}`);
        }
      }
      assert.ok(tagliati > 0, `${nome} cap ${tetto}: the cut happened`);
    }
  }
});

test('G8-T-02: the node cut in every position: a secret under an honest name is masked or «…», never a piece', () => {
  for (let nodi = 1; nodi <= 30; nodi++) {
    const v = { a: 1, b: [1, 2, 3], c: { d: `see ${GHP}` }, e: [`${AKIA}`, { f: JWT }], g: 'end' };
    const r = json(oscuraPerStruttura(v, { nodi, caratteri: 1_000_000 }));
    assert.deepEqual(visibili(r), {}, `nodes ${nodi}: ${r}`);
    if (nodi < 12) assert.ok(r.includes(TAGLIO), `nodes ${nodi}: the cut is said: ${r}`);
  }
});

test('G8-T-03: at the real cap, a secret across the character cut is not shown; complete arguments within the cap show the masked value, no «…»', () => {
  const tetto = FDS.TETTO_CARATTERI_DA_MOSTRARE;
  assert.equal(typeof tetto, 'number');
  for (const scarto of [-30, -5, 0, 3]) {
    const v = { a: 'p'.repeat(tetto - GHP.length + scarto - 6), s: `x ${GHP}` };
    assert.deepEqual(visibili(json(oscuraPerStruttura(v))), {}, `offset ${scarto}`);
  }
  const fine = argomentiDellaRiga(json(FORME));
  assert.deepEqual(visibili(json(fine)), {});
  assert.ok(!json(fine).includes(TAGLIO), json(fine));
  assert.equal(fine.title, 'Rotate the creds');
  assert.match(fine.body, /^Repro uses \[redacted\] now$/u);
});

test('G8-T-04: the character budget is one for the whole call: values that each fit but together pass it end with «…», never a secret', () => {
  assert.deepEqual(oscuraPerStruttura({ a: 'p'.repeat(30), b: 'q'.repeat(30) }, { caratteri: 50, nodi: 1000 }), { a: 'p'.repeat(30), b: TAGLIO });
  assert.deepEqual(oscuraPerStruttura(['x'.repeat(30), 'y'.repeat(30)], { caratteri: 50, nodi: 1000 }), ['x'.repeat(30), TAGLIO]);
  assert.deepEqual(oscuraPerStruttura(['x'.repeat(30), 'y'.repeat(30), 'z', 'w'], { caratteri: 50, nodi: 1000 }), ['x'.repeat(30), TAGLIO]); // one «…», not two
  const segreto = oscuraPerStruttura({ a: 'p'.repeat(30), s: `x ${GHP}` }, { caratteri: 50, nodi: 1000 });
  assert.deepEqual(segreto, { a: 'p'.repeat(30), s: TAGLIO });
  assert.deepEqual(visibili(json(segreto)), {});
});

test('G8-T-06: names count in the character budget too: long names that together pass it end with one «…» entry', () => {
  const n = 'n'.repeat(40), m = 'm'.repeat(40);
  assert.deepEqual(oscuraPerStruttura({ [n]: 'v', [m]: 'w' }, { caratteri: 50, nodi: 1000 }), { [n]: 'v', [TAGLIO]: TAGLIO });
  assert.deepEqual(oscuraPerStruttura([{ [n]: 1 }, { [m]: 2 }], { caratteri: 50, nodi: 1000 }), [{ [n]: 1 }, { [TAGLIO]: TAGLIO }]);
});

test('G8-T-05: at the real cap, three values of 400,000 characters on the row: the third is «…» and no more than the cap is shown', () => {
  const tetto = FDS.TETTO_CARATTERI_DA_MOSTRARE;
  const pezzo = Math.floor(tetto * 0.4);
  const r = argomentiDellaRiga(json({ a: 'p'.repeat(pezzo), b: 'q'.repeat(pezzo), c: `x ${AKIA} ${'r'.repeat(pezzo)}` }));
  assert.equal(r.a.length, pezzo);
  assert.equal(r.b.length, pezzo);
  assert.equal(r.c, TAGLIO);
  assert.ok(json(r).length <= tetto + 100, `shown ${json(r).length}`);
  assert.deepEqual(visibili(json(r)), {});
});

/* ------------------------------------------------------------ point 2: H1 ------------------------------------------------------------ */
test('G8-H1-01: 80 KB of spaces before a name with no value: one frame of the row takes a few milliseconds (base 6.8 s)', () => {
  for (const spazi of [40_000, 80_000]) {
    const dentro = `{"path":"a.txt","content":"${' '.repeat(spazi)}x","mode":`; // the reviewer's shape: the spaces inside a value
    const m = ms(() => argomentiDellaRiga(dentro));
    assert.ok(m.t < 100 * MOLTIPLICATORE_CI, `[ceiling ${100 * MOLTIPLICATORE_CI} ms] ${spazi} spaces inside a value: ${m.t.toFixed(2)} ms`);
    assert.deepEqual(m.r, { path: 'a.txt', content: `${' '.repeat(spazi)}x` });
    const testo = `{"title":"a",${' '.repeat(spazi)}"mode":`;
    const { r, t } = ms(() => argomentiDellaRiga(testo));
    assert.ok(t < 100, `${spazi} spaces: ${t.toFixed(2)} ms`);
    assert.deepEqual(r, { title: 'a' });
    const t2 = ms(() => argomentiDellaRiga(`{"a":[${'\n '.repeat(spazi / 2)}"x",${' '.repeat(spazi)}`)).t;
    assert.ok(t2 < 100, `list with spaces: ${t2.toFixed(2)} ms`);
  }
});

test('G8-H1-03: the same spaces inside a nested value and inside a list, before a name with no value: a few milliseconds a frame', () => {
  for (const testo of [`{"a":{"b":"${' '.repeat(80_000)}x","c":`, `{"a":["${' '.repeat(80_000)}x"],"c":`, `{"a":"${' '.repeat(40_000)}\\"${' '.repeat(40_000)}","c":`]) {
    const { r, t } = ms(() => argomentiDellaRiga(testo));
    assert.ok(t < 100, `${t.toFixed(2)} ms`);
    assert.ok(r && !Object.hasOwn(r, 'c'), json(r).slice(0, 80));
  }
});
test('G8-H1-02: the honest cases of the closing do not change: names with no value, half names, commas, lists, nesting, escapes', () => {
  assert.deepEqual(argomentiDellaRiga('{"title":"Login","region":"eu","password":'), { title: 'Login', region: 'eu' });
  assert.deepEqual(argomentiDellaRiga('{"title":"Login","region":"eu","passw'), { title: 'Login', region: 'eu' });
  assert.deepEqual(argomentiDellaRiga('{"title":"Login" ,  "region" :  '), { title: 'Login' });
  assert.deepEqual(argomentiDellaRiga('{"a":"x\\"y" , "b":'), { a: 'x"y' });
  assert.deepEqual(argomentiDellaRiga('{"a":1,'), { a: 1 });
  assert.deepEqual(argomentiDellaRiga('{"a":[1,2,'), { a: [1, 2] });
  assert.deepEqual(argomentiDellaRiga('{\n  "config": {\n    "region": "eu",\n    "password":'), { config: { region: 'eu' } });
  assert.deepEqual(argomentiDellaRiga('{"a":{"b":{"c":true}'), { a: { b: { c: true } } });
  assert.deepEqual(argomentiDellaRiga('{"a":"{\\"x\\":1}","b":2'), { a: '{"x":1}', b: 2 });
  assert.deepEqual(argomentiDellaRiga('{"a":"b:","c":'), { a: 'b:' });
  assert.equal(argomentiDellaRiga('{"a":tr'), null);
});

/* ------------------------------------------------------------ point 3: the open value ------------------------------------------------------------ */
test('G8-P1-01: every cut of the arguments (GitHub, AKIA, sk-proj, Bearer, JWT, URL password, quoted export): 0 characters of a secret on the row', () => {
  for (const forma of [json(FORME), JSON.stringify(FORME, null, 2)]) {
    let mostrati = 0;
    for (let i = 1; i <= forma.length; i++) {
      const r = argomentiDellaRiga(forma.slice(0, i));
      if (r) mostrati += 1;
      assert.deepEqual(visibili(json(r)), {}, `cut ${i}: ${json(r)}`);
    }
    assert.ok(mostrati > forma.length * 0.9, `the preview is shown while it arrives (${mostrati}/${forma.length})`);
  }
});

test('G8-P1-02: an open value reads «…» until it closes, then the masked value; an open honest value too', () => {
  assert.deepEqual(argomentiDellaRiga('{"title":"Login but'), { title: TAGLIO });
  assert.deepEqual(argomentiDellaRiga('{"title":"Login","body":"Repro uses ghp_QZXJ7a1B'), { title: 'Login', body: TAGLIO });
  assert.deepEqual(argomentiDellaRiga(`{"title":"Login","body":"Repro uses ${GHP} now"`), { title: 'Login', body: 'Repro uses [redacted] now' });
  assert.deepEqual(argomentiDellaRiga('{"items":["a","AKIAQZXJ'), { items: ['a', TAGLIO] });
  assert.deepEqual(argomentiDellaRiga('["a","AKIAQZXJ'), ['a', TAGLIO]);
  assert.deepEqual(argomentiDellaRiga('{"a":{"b":"x\\'), { a: { b: TAGLIO } });
});

test('G8-P1-03: the frames of the row piece by piece (4 characters at a time): every frame 0 characters of a secret, the last one masked whole', () => {
  const testo = json(FORME);
  let ultimo = null;
  for (let i = 4; i < testo.length + 4; i += 4) {
    ultimo = argomentiDellaRiga(testo.slice(0, Math.min(i, testo.length)));
    assert.deepEqual(visibili(json(ultimo)), {}, `frame ${i / 4}`);
  }
  assert.deepEqual(ultimo, argomentiDellaRiga(testo));
  assert.ok(!json(ultimo).includes(TAGLIO));
});

/* ------------------------------------------------------------ point 4: the activity group ------------------------------------------------------------ */
const ELEMENTO = { querySelector: () => null };
const comando = (c, stato = 'running') => normalizzaVoce(ELEMENTO, { tipo: 'tool', info: { nome: 'shell', stato, argomentiParsati: { comando: c } } });
test('G8-P2-01: two kernel commands in one turn: the rows, the head while one runs and the summary show 0 secrets', (t) => {
  t.after(() => impostaLingua('it'));
  for (const lingua of ['en', 'it']) {
    impostaLingua(lingua);
    const primo = comando(`export DB_PASSWORD=${ENVP} && make deploy`, 'success');
    const secondo = comando(`curl -H "Authorization: Bearer ${BEARER}" https://api.example.invalid`);
    assert.ok(primo && secondo, 'two items');
    const tutti = [primo, secondo];
    const testi = [fraseAdesso(secondo), json(riassuntoVoci(tutti)), testoDelSegmento(tutti), bersaglioAttrezzo('shell', primo.argomenti), bersaglioAttrezzo('shell', secondo.argomenti, { corto: true })];
    for (const x of testi) assert.deepEqual(visibili(x), {}, `${lingua}: ${x}`);
    assert.match(bersaglioAttrezzo('shell', primo.argomenti), /make deploy/u, 'the honest part of the command stays');
  }
});

test('G8-P2-02: the activity group masks a secret NAME too, nested, and leaves the tool\'s own arguments untouched', () => {
  const argomenti = { comando: 'deploy', descrizione: `Deploy with token=${ENVP}`, env: { api_key: 'QZXJenvKEY1' } };
  const voce = normalizzaVoce(ELEMENTO, { tipo: 'tool', info: { nome: 'shell', stato: 'running', argomentiParsati: argomenti } });
  assert.equal(voce.argomenti.env.api_key, OSCURATO);
  assert.ok(!json(voce.argomenti).includes(ENVP));
  assert.ok(!fraseAdesso(voce).includes(ENVP), fraseAdesso(voce));
  assert.equal(argomenti.env.api_key, 'QZXJenvKEY1', 'the input is not changed');
});

/* ------------------------------------------------------------ point 5: invisible characters in a name (kernel half) ------------------------------------------------------------ */
const INVISIBILI = { zwsp: '​', zwj: '‍', shy: '­' };
const NOMI_DEL_NUCLEO = ['password', 'api_key', 'token', 'clientSecret', 'x-api-key', 'session_cookie', 'passphrase', 'private_key', 'credentials', 'db_password'];
const rompi = (n, c) => n.replace(/(pass|secret|token|key|cook|cred|Secret)/u, (m) => `${m.slice(0, 2)}${c}${m.slice(2)}`);
test('G8-R2-01: a secret name with a zero width space, joiner or soft hyphen inside is still a secret name for the kernel', () => {
  for (const [tag, c] of Object.entries(INVISIBILI)) {
    for (const n of NOMI_DEL_NUCLEO) {
      const rotto = rompi(n, c);
      assert.notEqual(rotto, n);
      assert.equal(FDS.nomeDiCampoSegreto(rotto), true, `${tag} ${json(rotto)}`);
      assert.equal(oscuraPerStruttura({ [rotto]: 'QZXJinv1' })[rotto], OSCURATO, `${tag} ${json(rotto)} structure`);
    }
  }
});

test('G8-R2-02: the same names on the row and on the card written as text: 0 values in clear', () => {
  for (const [tag, c] of Object.entries(INVISIBILI)) {
    for (const n of NOMI_DEL_NUCLEO) {
      const rotto = rompi(n, c);
      assert.ok(!json(argomentiDellaRiga(json({ wrap: { [rotto]: 'QZXJinv2' } }))).includes('QZXJinv2'), `${tag} ${json(rotto)} row`);
      assert.equal(valoreLeggibile(rotto, 'QZXJinv2'), OSCURATO, `${tag} ${json(rotto)} card`);
    }
  }
});

/* ------------------------------------------------------------ point 6: the live mutants of round 7 ------------------------------------------------------------ */
const profondo = (livelli, foglia, lista = false) => { let v = foglia; for (let l = 0; l < livelli; l++) v = lista ? [v] : { n: v }; return v; };
const giu = (v, livelli, lista = false) => { let x = v; for (let l = 0; l < livelli; l++) x = lista ? x[0] : x.n; return x; };
test('G8-Y1-Y3-01: on the row a secret at depth 10 and 40 is masked, not cut (past the card\'s 8 levels)', () => {
  for (const livelli of [10, 40]) {
    const r = argomentiDellaRiga(json({ wrap: profondo(livelli, { password: 'QZXJdeep', host: 'h' }) }));
    assert.deepEqual(giu(r.wrap, livelli), { password: OSCURATO, host: 'h' }, `${livelli} levels`);
  }
});
test('G8-Y1-Y3-02: past 64 levels the rest is «…», for objects and for lists, and the secret is not there', () => {
  for (const lista of [false, true]) {
    const r = oscuraPerStruttura(profondo(70, { password: 'QZXJdeep70', note: 'QZXJnote70' }, lista));
    assert.equal(giu(r, 64, lista), TAGLIO, `lists ${lista}`);
    assert.ok(!json(r).includes('QZXJdeep70') && !json(r).includes('QZXJnote70'));
    const r2 = oscuraPerStruttura(profondo(63, { note: 'h' }, lista));
    assert.deepEqual(giu(r2, 63, lista), { note: 'h' }, `lists ${lista}: 63 levels whole`);
  }
});
test('G8-Y11-01: a text longer than 200 characters in a structure has its secret forms masked, on the row and in the structure', () => {
  const lungo = `${'a long honest note '.repeat(20)} ${GHP} ${AKIA} end`;
  assert.ok(lungo.length > 200);
  assert.deepEqual(visibili(json(oscuraPerStruttura({ note: lungo, list: [lungo] }))), {});
  assert.deepEqual(visibili(json(argomentiDellaRiga(json({ deep: { note: lungo } })))), {});
});
test('G8-Y11-02: the same long text in a command of the activity group and in a nested value of the card written as text', () => {
  const lungo = `${'a long honest note '.repeat(20)} ${GHP} ${JWT} end`;
  const voce = normalizzaVoce(ELEMENTO, { tipo: 'tool', info: { nome: 'shell', stato: 'running', argomentiParsati: { opzioni: { nota: lungo } } } });
  assert.deepEqual(visibili(json(voce.argomenti)), {});
  assert.deepEqual(visibili(valoreLeggibile('opzioni', { nota: lungo, lista: [lungo] })), {});
});
test('G8-Y4-01: a name «__proto__» stays a field of its own, masked inside, and the prototype is untouched', () => {
  const r = argomentiDellaRiga('{"__proto__":{"password":"QZXJproto"},"a":1}');
  assert.ok(Object.hasOwn(r, '__proto__'), json(Object.keys(r)));
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(r, '__proto__').value.password, OSCURATO);
  assert.ok(!json(r).includes('QZXJproto'));
});
test('G8-Y4-02: the activity group and the structure keep «__proto__» as a field too, in an object nested in a list', () => {
  const dentro = JSON.parse('{"items":[{"__proto__":{"token":"QZXJproto2"},"b":2}]}');
  const s = oscuraPerStruttura(dentro);
  assert.ok(Object.hasOwn(s.items[0], '__proto__'), json(s));
  assert.equal(Object.getPrototypeOf(s.items[0]), Object.prototype);
  assert.ok(json(s).includes('"__proto__":{"token":"[redacted]"}'), json(s));
  const voce = normalizzaVoce(ELEMENTO, { tipo: 'tool', info: { nome: 'mcp__github__create_issue', stato: 'running', argomentiParsati: dentro } });
  assert.ok(json(voce.argomenti).includes('"__proto__":{"token":"[redacted]"}'), json(voce.argomenti));
});
test('G8-Y5-01: the first repeated name is «(2)», never «(1)»', () => {
  assert.deepEqual(Object.keys(oscuraPerStruttura({ 'api_key=1': 1, 'api_key=2': 2 })), ['api_key=[redacted]', 'api_key=[redacted](2)']);
  assert.deepEqual(Object.keys(argomentiDellaRiga('{"a":{"token: x":1,"token: y":2}}').a), ['token: [redacted]', 'token: [redacted](2)']);
});
test('G8-Y7-Y8-01: a list at the top is shown on the row, masked; a raw text starting with «[» is never shown raw', () => {
  assert.deepEqual(argomentiDellaRiga('[{"password":"QZXJlist"},"b"]'), [{ password: OSCURATO }, 'b']);
  assert.deepEqual(argomentiDellaRiga('[{"password":"QZXJlist"},"b"'), [{ password: OSCURATO }, 'b']);
  assert.equal(argomentiGrezziDellaRiga('[{"password":"QZXJlist"'), '');
  assert.equal(argomentiGrezziDellaRiga('  [1, 2'), '');
});
test('G8-Y9-Y10-01: a half name after a comma goes away; a backslash cut in the middle of an escape never shows', () => {
  assert.deepEqual(argomentiDellaRiga('{"a":"b","pas'), { a: 'b' });
  assert.deepEqual(argomentiDellaRiga('{"a":"b",  "pas'), { a: 'b' });
  assert.deepEqual(argomentiDellaRiga('{"a":"b\\'), { a: TAGLIO });
  assert.deepEqual(argomentiDellaRiga('{"a":"b\\u00'), { a: TAGLIO });
});
test('G8-Y12-01: a number, a list or an object under a secret name is masked on the row', () => {
  assert.deepEqual(argomentiDellaRiga('{"pin_password":1234,"token":[1,2],"secret":{"x":1}}'), { pin_password: OSCURATO, token: OSCURATO, secret: OSCURATO });
  assert.deepEqual(oscuraPerStruttura({ wrap: { password: 987654 } }), { wrap: { password: OSCURATO } });
});
test('G8-Y13-01: the braces of a partial JSON close in the right order: a list of objects, an object of lists', () => {
  assert.deepEqual(argomentiDellaRiga('[{"a":"x"'), [{ a: 'x' }]);
  assert.deepEqual(argomentiDellaRiga('{"a":[{"b":1'), { a: [{ b: 1 }] });
  assert.deepEqual(argomentiDellaRiga('[[{"a":[1'), [[{ a: [1] }]]);
});
test('G8-G1-01: every text in a structure passes the secret forms: in an object, in a list, at the top of a list', () => {
  assert.deepEqual(oscuraPerStruttura({ note: `use ${GHP}` }), { note: 'use [redacted]' });
  assert.deepEqual(oscuraPerStruttura([AKIA, { x: [JWT] }]), [OSCURATO, { x: [OSCURATO] }]);
  assert.equal(oscuraPerStruttura(`key ${SKP}`), 'key [redacted]');
});
test('G8-M6-01: the JSON still arriving passes the card\'s masks: a secret name, nested, in a list', () => {
  assert.deepEqual(argomentiDellaRiga('{"password":"QZXJm6a","title":"x'), { password: OSCURATO, title: TAGLIO });
  assert.deepEqual(argomentiDellaRiga('{"cfg":{"api_key":"QZXJm6b"},"n":1,'), { cfg: { api_key: OSCURATO }, n: 1 });
  assert.deepEqual(argomentiDellaRiga('{"list":[{"token":"QZXJm6c"},{"a":'), { list: [{ token: OSCURATO }, {}] });
});
test('G8-M6-02: the JSON still arriving masks secret forms in honest names and values once they are closed', () => {
  assert.deepEqual(argomentiDellaRiga(`{"note":"see ${GHP}","x":"y`), { note: 'see [redacted]', x: TAGLIO });
  assert.deepEqual(argomentiDellaRiga(`{"${AKIA}":"v","b":[`), { [OSCURATO]: 'v', b: [] });
});
