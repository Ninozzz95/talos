/*
 * R-58 (02/11/2026): la ripartenza guarda l'ultima PROVA, non solo l'ultimo comando. Forma con gli OK di CLI, Mobile e Desktop:
 * `Downloads/TALOS/desktop/in-corso/performance-2026-10-29/FORMA-R58-RIPARTENZA-SU-PROVA-ROSSA-2026-11-02.md`.
 * Caso vero: suite rossa, poi `git status` e `git diff` verdi, chiusura senza ripartenza (G-confine r5, pubblica-luna-491251d6f).
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora, NOTE_DI_RIPARTENZA, NOTA_RILEGGI_PRIMA_DI_CHIUDERE, PASSI_MINIMI_PER_RIAPRIRE } from '../src/kernel/talosHarness.mjs';
import { eComandoDiProve, riepilogoRosso, comandoFinitoRosso, comandoCheModifica, deveRiaprireSuProvaRossa } from '../src/kernel/prova-rossa.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const NODE = JSON.stringify(process.execPath);
const shell = (comando, id) => ({ tool_calls: [{ id, type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando }) } }] });
const scrivi = (id) => ({ tool_calls: [{ id, type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: `f-${id}.txt`, contenuto: 'x' }) } }] });
const testo = (t) => ({ content: t });

function rete(risposte) {
  const corpi = [];
  const fetchDiRete = async (_url, o) => {
    corpi.push(JSON.parse(o.body));
    const r = risposte[corpi.length - 1] ?? testo('Chiuso.');
    const fine = r.finish ?? (r.tool_calls ? 'tool_calls' : 'stop');
    return new Response(JSON.stringify({ choices: [{ index: 0, finish_reason: fine, message: { role: 'assistant', content: r.content ?? null, ...(r.tool_calls ? { tool_calls: r.tool_calls } : {}) } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }), { headers: { 'content-type': 'application/json' } });
  };
  return { corpi, fetchDiRete };
}
/* Una cartella con una prova rossa e una verde. Non un `node --test` annidato: dentro un altro `node --test` il figlio riporta al padre
   (NODE_TEST_CONTEXT) ed esce 0. Due script che stampano il riepilogo di node:test ed escono come lui. */
const cartellaConProve = () => {
  const cartella = cartellaDiProva('talos-prova-rossa-');
  writeFileSync(join(cartella, 'rossa.test.mjs'), "console.log('# tests 1'); console.log('# pass 0'); console.log('# fail 1'); process.exit(1);\n");
  writeFileSync(join(cartella, 'verde.test.mjs'), "console.log('# tests 1'); console.log('# pass 1'); console.log('# fail 0');\n");
  return cartella;
};
const giro = (risposte, extra = {}) => {
  const r = rete(risposte); const eventi = [];
  const esito = talosLavora({ cartella: extra.cartella ?? cartellaConProve(), task: { consegna: 'correggi il difetto' }, modello: 'x', chiave: 'y', permessi: 'bypass', fetchDiRete: r.fetchDiRete, onGiro: (e) => eventi.push(e), ...extra });
  return { ...r, eventi, esito };
};
const NOTA = NOTE_DI_RIPARTENZA?.['prova-rossa'];
const conLaNota = (corpo) => corpo.messages.some((m) => m.role === 'user' && m.content === NOTA);
const ripartenze = (eventi, motivo) => eventi.filter((e) => e.tipo === 'continuazione' && (!motivo || e.motivo === motivo));
const proveRosse = `${NODE} rossa.test.mjs`;
const proveVerdi = `${NODE} verde.test.mjs`;
const leggiSolo = 'echo fatto';

test('PROVA-ROSSA-01: prove rosse, poi due comandi di sola lettura verdi, chiusura: riparte una volta, con la nota della prova', async () => {
  const g = giro([scrivi('a'), shell(proveRosse, 'b'), shell(leggiSolo, 'c'), shell(leggiSolo, 'd'), testo('Fatto. Una prova del kernel è rossa ma non c entra.'), testo('Confermo: era rossa anche prima.')]);
  const e = await g.esito;
  assert.equal(g.corpi.length, 6);
  assert.equal(conLaNota(g.corpi[5]), true);
  assert.deepEqual(ripartenze(g.eventi).map((x) => x.motivo), ['prova-rossa']);
  assert.equal(e.comeFinita, 'concluso');
});

test('PROVA-ROSSA-02 — AL CONTRARIO: prova rossa, poi prova verde: non riparte', async () => {
  const g = giro([scrivi('a'), shell(proveRosse, 'b'), shell(proveVerdi, 'c'), shell(leggiSolo, 'd'), testo('Finito, prove verdi.')]);
  await g.esito;
  assert.equal(ripartenze(g.eventi).length, 0);
  assert.equal(g.corpi.length, 5);
});

test('PROVA-ROSSA-03 — AL CONTRARIO: senza file modificati non riparte', async () => {
  const g = giro([shell(leggiSolo, 'a'), shell(proveRosse, 'b'), shell(leggiSolo, 'c'), shell(leggiSolo, 'd'), testo('Le prove erano già rosse, non ho toccato niente.')]);
  await g.esito;
  assert.equal(ripartenze(g.eventi).length, 0);
  assert.equal(g.corpi.length, 5);
});

test('PROVA-ROSSA-04: un comando di shell che scrive (finito con 0) conta come modifica dei file', async () => {
  const scriveDaShell = `${NODE} -e "require('fs').writeFileSync('g.txt','y')"`;
  const g = giro([shell(scriveDaShell, 'a'), shell(proveRosse, 'b'), shell(leggiSolo, 'c'), shell(leggiSolo, 'd'), testo('Fatto.'), testo('Confermo.')]);
  await g.esito;
  assert.deepEqual(ripartenze(g.eventi).map((x) => x.motivo), ['prova-rossa']);
});

test('PROVA-ROSSA-05: con l ultimo comando rosso vince R-53, e la ripartenza resta una sola', async () => {
  const rosso = `${NODE} -e "process.exit(1)"`;
  const g = giro([scrivi('a'), shell(proveRosse, 'b'), shell(leggiSolo, 'c'), shell(rosso, 'd'), testo('Non è completo.'), shell(leggiSolo, 'e'), testo('Chiudo.')]);
  await g.esito;
  assert.deepEqual(ripartenze(g.eventi).map((x) => x.motivo), ['comando-rosso']);
  assert.equal(g.corpi.some((c) => c.messages.some((m) => m.content === NOTA_RILEGGI_PRIMA_DI_CHIUDERE)), true);
  assert.equal(g.corpi.some(conLaNota), false);
});

test('PROVA-ROSSA-06: una seconda chiusura con la prova ancora rossa non riparte di nuovo', async () => {
  const g = giro([scrivi('a'), shell(proveRosse, 'b'), shell(leggiSolo, 'c'), shell(leggiSolo, 'd'), testo('Fatto.'), shell(proveRosse, 'e'), shell(leggiSolo, 'f'), testo('Era rossa anche prima.')]);
  await g.esito;
  assert.equal(ripartenze(g.eventi).length, 1);
  assert.equal(g.corpi.length, 8);
});

test('PROVA-ROSSA-07: un messaggio della persona in coda azzera il segnale', async () => {
  let g; let detto = false;
  g = giro([scrivi('a'), shell(proveRosse, 'b'), shell(leggiSolo, 'c'), shell(leggiSolo, 'd'), testo('Fatto.'), testo('Va bene.')], { codaMessaggiFn: () => {
    if (detto || g.corpi.length < 5) return null;
    detto = true;
    return 'Lascia stare le prove, grazie.';
  } });
  await g.esito;
  assert.equal(detto, true, 'premessa: la coda ha parlato');
  assert.equal(ripartenze(g.eventi).length, 0);
});

test('PROVA-ROSSA-08: codice d uscita verde (come dopo `npm test | tail`), ma il riepilogo dice rosso: riparte (CLI, revisione S1-2)', async () => {
  /* La pipe vera non si usa qui: nella shell di Windows un secondo programma fra virgolette dopo `|` non parte, e il rosso arriverebbe
     dal codice d'uscita (il mutante «riepilogo ignorato» restava vivo). Lo stesso caso, senza la shell di mezzo: esce 0, stampa fail 2. */
  const cartella = cartellaConProve();
  writeFileSync(join(cartella, 'mascherata.test.mjs'), "console.log('# tests 3'); console.log('# pass 1'); console.log('# fail 2');\n");
  const g = giro([scrivi('a'), shell(`${NODE} mascherata.test.mjs`, 'b'), shell(leggiSolo, 'c'), shell(leggiSolo, 'd'), testo('Fatto.'), testo('Confermo.')], { cartella });
  await g.esito;
  assert.deepEqual(ripartenze(g.eventi).map((x) => x.motivo), ['prova-rossa']);
});

test('PROVA-ROSSA-09: anche l attrezzo `prova` conta come prova', async () => {
  const prova = (id) => ({ tool_calls: [{ id, type: 'function', function: { name: 'prova', arguments: '{}' } }] });
  const g = giro([scrivi('a'), prova('b'), shell(leggiSolo, 'c'), shell(leggiSolo, 'd'), testo('Fatto.'), testo('Confermo.')], { comandoProva: proveRosse });
  await g.esito;
  assert.deepEqual(ripartenze(g.eventi).map((x) => x.motivo), ['prova-rossa']);
});

test('PROVA-ROSSA-10: motore locale escluso, nella regola', () => {
  const base = { provaRossa: true, fileModificati: true, giaRiaperto: false, giro: 5, giriMassimi: 24, finishReason: 'stop', motoreLocale: false, testo: 'fine', fermato: false, rifiutata: false, tagliata: null, passiMinimi: PASSI_MINIMI_PER_RIAPRIRE };
  assert.equal(deveRiaprireSuProvaRossa(base), true);
  assert.equal(deveRiaprireSuProvaRossa({ ...base, motoreLocale: true }), false);
  assert.equal(deveRiaprireSuProvaRossa({ ...base, provaRossa: false }), false);
  assert.equal(deveRiaprireSuProvaRossa({ ...base, fileModificati: false }), false);
  assert.equal(deveRiaprireSuProvaRossa({ ...base, giaRiaperto: true }), false);
  assert.equal(deveRiaprireSuProvaRossa({ ...base, fermato: true }), false);
  assert.equal(deveRiaprireSuProvaRossa({ ...base, rifiutata: true }), false);
  assert.equal(deveRiaprireSuProvaRossa({ ...base, tagliata: { volte: 4 } }), false);
  assert.equal(deveRiaprireSuProvaRossa({ ...base, finishReason: 'length' }), false);
  assert.equal(deveRiaprireSuProvaRossa({ ...base, testo: ' ' }), false);
  assert.equal(deveRiaprireSuProvaRossa({ ...base, giro: PASSI_MINIMI_PER_RIAPRIRE - 1 }), false);
  assert.equal(deveRiaprireSuProvaRossa({ ...base, giro: 23 }), false);
  assert.equal(deveRiaprireSuProvaRossa({ ...base, giro: 22 }), true);
});

test('PROVA-ROSSA-11: gli esecutori riconosciuti dal comando, e le parole che NON sono prove (Desktop)', () => {
  const si = ['npm test', 'npm t', 'npm run test:kernel', 'npm --prefix harness-ui test', 'pnpm test', 'pnpm -C web run test:unit', 'yarn test', 'bun test',
    'npx vitest run', 'npx jest', 'npx playwright test', 'vitest', 'jest --ci', 'pytest -q', 'python -m pytest', 'python3 -m unittest', 'uv run pytest',
    'cargo test', 'go test ./...', 'deno test', 'dotnet test', 'mvn test', 'rspec', 'bundle exec rspec', 'phpunit', 'php artisan test', 'make test', 'tox',
    './gradlew test', 'gradlew.bat test', 'node --test', 'node scripts/run-tests.mjs', 'node tests/a.test.mjs', `${NODE} --test x.test.mjs`,
    'cd harness-ui && npm test', 'npm test; git status', 'npm test 2>&1 | tail -20', 'CI=1 npm test', 'C:\\x\\npm.cmd test'];
  const no = ['cat test.log', 'grep pytest', 'ls tests', 'git status', 'git diff', 'echo npm test', 'npm install', 'npm run build', 'node server.mjs',
    'npx playwright install', 'cargo build', 'python script.py', 'rg "npm test"', 'type test.txt', 'go build'];
  for (const c of si) assert.equal(eComandoDiProve(c), true, c);
  for (const c of no) assert.equal(eComandoDiProve(c), false, c);
});

test('PROVA-ROSSA-12: il riepilogo spinge solo verso il rosso; il codice d uscita resta', () => {
  assert.equal(riepilogoRosso('# tests 4\n# pass 2\n# fail 2\n'), true);
  assert.equal(riepilogoRosso('ℹ tests 4\nℹ pass 3\nℹ fail 1\n'), true);
  assert.equal(riepilogoRosso(' Tests  2 failed | 5 passed (7)'), true);
  assert.equal(riepilogoRosso('Tests:       1 failed, 3 passed, 4 total'), true);
  assert.equal(riepilogoRosso('===== 2 failed, 10 passed in 0.31s ====='), true);
  assert.equal(riepilogoRosso('test result: FAILED. 3 passed; 1 failed'), true);
  assert.equal(riepilogoRosso('--- FAIL: TestX (0.00s)'), true);
  assert.equal(riepilogoRosso('3 examples, 1 failure'), true);
  assert.equal(riepilogoRosso('FAILED (failures=1)'), true);
  for (const verde of ['# tests 4\n# pass 4\n# fail 0\n', 'ℹ fail 0', ' Tests  7 passed (7)', '0 failed', '3 examples, 0 failures', 'ok  \tpkg\t0.01s', '', null])
    assert.equal(riepilogoRosso(verde), false, String(verde));
  assert.equal(comandoFinitoRosso({ comando: 'npm test', codice: 1, testo: '# fail 0' }), true, 'un riepilogo fail 0 con codice 1 resta rosso');
  assert.equal(comandoFinitoRosso({ comando: 'npm test | tail', codice: 0, testo: '# fail 2' }), true);
  assert.equal(comandoFinitoRosso({ comando: 'cat old.log', codice: 0, testo: '# fail 2' }), false, 'il riepilogo conta solo per un comando di prove');
  assert.equal(comandoFinitoRosso({ comando: 'npm test', codice: 0, testo: '# fail 0' }), false);
});

/* Revisione avversaria della CLI su 488d0e55e (`cli/in-corso/REVISIONE-R58-PROVA-ROSSA-2026-11-02.md`): le sue quattro prove, girate. */
const A_CAPO = String.fromCharCode(10);
test('PROVA-ROSSA-15 (CLI A, S2): prove VERDI con «2 failed» o «3 failures» nel NOME restano verdi, per R-53 e R-58', () => {
  const nodeTest = ['✔ the retry counts 2 failed requests (3.1ms)', '✔ shows 1 failure in the summary (0.4ms)', 'ℹ tests 2', 'ℹ pass 2', 'ℹ fail 0'].join(A_CAPO);
  assert.equal(comandoFinitoRosso({ comando: 'node --test tests/x.test.mjs', codice: 0, testo: nodeTest }), false);
  const rspec = ['Retry', '  gives up after 3 failures', '', 'Finished in 0.01 seconds', '1 example, 0 failures'].join(A_CAPO);
  assert.equal(comandoFinitoRosso({ comando: 'bundle exec rspec', codice: 0, testo: rspec }), false);
  const vitest = ['✓ counts 2 failed jobs', ' Test Files  1 passed (1)', '      Tests  4 passed (4)'].join(A_CAPO);
  assert.equal(comandoFinitoRosso({ comando: 'npx vitest run', codice: 0, testo: vitest }), false);
  /* e il verso del rosso resta: il riepilogo vero sulla sua riga */
  assert.equal(comandoFinitoRosso({ comando: 'node --test', codice: 0, testo: ['✔ counts 2 failed requests', 'ℹ tests 3', 'ℹ fail 1'].join(A_CAPO) }), true);
  assert.equal(comandoFinitoRosso({ comando: 'bundle exec rspec', codice: 0, testo: ['gives up after 3 failures', '2 examples, 1 failure'].join(A_CAPO) }), true);
});

test('PROVA-ROSSA-16 (CLI B, S3): «test» dentro una parola del nome non fa un comando di prove', () => {
  for (const c of ['node scripts/fetch-latest.mjs', 'node tools/attestation.mjs', 'node contest.mjs', 'node scripts/protester.js']) assert.equal(eComandoDiProve(c), false, c);
  for (const c of ['node scripts/run-tests.mjs', 'node tests/a.test.mjs', 'node test.mjs', 'node test-unit.mjs', 'node a-test.js', 'node tests\\b.mjs']) assert.equal(eComandoDiProve(c), true, c);
});

test('PROVA-ROSSA-17 (CLI C, S4): in cmd.exe un `&` singolo divide i comandi; `2>&1` e `&>` no', () => {
  assert.equal(eComandoDiProve('cd harness-ui & npm test'), true);
  assert.equal(comandoCheModifica('cd x & ls'), false, 'due pezzi di sola lettura');
  assert.equal(comandoCheModifica('npm test 2>&1'), false, '`2>&1` non divide e non scrive');
  assert.equal(eComandoDiProve('npm test &> out.txt'), true);
});

test('PROVA-ROSSA-18 (seconda lettura CLI): pytest -q, node con opzioni prima del file, e gli aiutanti delle prove', () => {
  assert.equal(riepilogoRosso('..F.F\n2 failed, 3 passed in 0.05s\n'), true, 'pytest -q senza ===');
  assert.equal(riepilogoRosso('.....\n5 passed in 0.05s\n'), false);
  assert.equal(riepilogoRosso('✔ the retry ends with 2 failed, 3 passed in 1.2s of waiting'), false, 'il riepilogo di pytest -q sta su una riga sua');
  for (const c of ['node --import tsx tests/x.mjs', 'node -r ts-node/register test/a.spec.ts', 'node --experimental-vm-modules scripts/run-tests.mjs', 'node --test-reporter=spec --test'])
    assert.equal(eComandoDiProve(c), true, c);
  for (const c of ['node test_utils.mjs', 'node tests/helpers.mjs', 'node test/setup.js', 'node --import tsx scripts/build.mjs', 'node tests-fixtures.mjs'])
    assert.equal(eComandoDiProve(c), false, c);
});

test('PROVA-ROSSA-13: cosa può scrivere nel progetto (revisione del Mobile, S2-1)', () => {
  const scrive = ["sed -i 's/a/b/' x.js", 'prettier --write .', 'git apply p.diff', 'git checkout -- x', 'npm install', 'echo a > b.txt', 'cat a >> b',
    'node script.mjs', 'git branch -D vecchio', 'find . -name "*.tmp" -delete', 'mv a b', 'rm x', 'grep a x | tee out.txt', 'python fix.py', 'cp a b'];
  const legge = ['git status', 'git diff --stat', 'git log --oneline -5', 'ls -la', 'cat a.txt', 'grep -rn "a|b" src', 'rg foo', 'echo fatto', 'npm test 2>&1 | tail -20',
    'npm test > /dev/null', 'find . -name "*.mjs"', 'sed -n 1,5p x', 'Get-Content a.txt', 'git branch', 'git branch --show-current', 'cd x && ls', 'wc -l a', ''];
  for (const c of scrive) assert.equal(comandoCheModifica(c), true, c);
  for (const c of legge) assert.equal(comandoCheModifica(c), false, c);
});

test('PROVA-ROSSA-14: il testo della ripartenza (revisione del Mobile, S1-1): la via sicura c è, le mosse distruttive solo vietate, e non accusa le modifiche', () => {
  assert.equal(typeof NOTA, 'string');
  assert.match(NOTA, /^\[TALOS: /u, 'nota di TALOS, mai una richiesta della persona');
  assert.match(NOTA, /git worktree add/u);
  const [prima, divieto] = NOTA.split(/Never use/u);
  assert.equal(typeof divieto, 'string', 'il divieto c è');
  for (const parola of ['stash', 'checkout', 'reset', 'restore', 'clean']) {
    assert.equal(prima.includes(parola), false, `${parola} solo dentro il divieto`);
    assert.equal(divieto.includes(parola), true, `${parola} vietato per nome`);
  }
  assert.doesNotMatch(NOTA, /your changes (?:caused|broke)|you broke/iu);
  assert.equal(NOTE_DI_RIPARTENZA['comando-rosso'], NOTA_RILEGGI_PRIMA_DI_CHIUDERE, 'un posto solo per i testi di ripartenza');
});
