/*
 * 15/10/2026 (bugfixer) — la suite di unità del frontend non resta più appesa a una prova che non torna (`scripts/argomenti-prove-node.mjs`).
 * Nei due versi, con processi veri: un gancio appeso SENZA gli argomenti di serie non finisce; CON gli argomenti finisce, rosso e col suo nome.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { argomentiDelRunner, TETTO_DI_SERIE_MS } from '../../scripts/argomenti-prove-node.mjs';
import { rimuoviCartellaDiProva } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

test('RUNNER-01 — di serie un tetto e l\'uscita a fine file; chi passa i suoi valori li tiene, senza doppioni', () => {
  assert.deepEqual(argomentiDelRunner([]), [`--test-timeout=${TETTO_DI_SERIE_MS}`, '--test-force-exit']);
  assert.deepEqual(argomentiDelRunner(['--test-timeout=5000']), ['--test-force-exit', '--test-timeout=5000']);
  assert.deepEqual(argomentiDelRunner(['--test-force-exit', '--test-name-pattern=X']), [`--test-timeout=${TETTO_DI_SERIE_MS}`, '--test-force-exit', '--test-name-pattern=X']);
  assert.ok(TETTO_DI_SERIE_MS >= 60_000, 'la prova più lunga misurata il 15/10 prende 19 s: il tetto non deve mordere le prove sane');
});

/** Lancia `node --test` su un file e dice se finisce entro `entroMs`, con codice e uscita. */
function corri(file, argomenti, entroMs) {
  return new Promise((risolvi) => {
    // `NODE_TEST_CONTEXT` fa credere al figlio di essere dentro questa prova (e salta i file): un runner vero non l'ha
    const ambiente = { ...process.env }; delete ambiente.NODE_TEST_CONTEXT;
    const figlio = spawn(process.execPath, ['--test', ...argomenti, file], { stdio: ['ignore', 'pipe', 'pipe'], env: ambiente });
    let uscita = '';
    figlio.stdout.on('data', (d) => { uscita += d; });
    figlio.stderr.on('data', (d) => { uscita += d; });
    const tempo = setTimeout(() => { figlio.kill('SIGKILL'); risolvi({ finito: false, uscita }); }, entroMs);
    figlio.on('exit', (codice) => { clearTimeout(tempo); risolvi({ finito: true, codice, uscita }); });
  });
}

const APPESI = {
  // un `before` che non torna (un `chromium.launch` appeso)
  'prima.test.mjs': "import test from 'node:test';\ntest.before(async () => { await new Promise(() => {}); });\ntest('dopo un before appeso', async () => {});\n",
  // un `after` che non torna, con un handle vivo (un browser che non si chiude)
  'dopo.test.mjs': "import test from 'node:test';\nsetInterval(() => {}, 1000);\ntest.after(() => new Promise(() => {}));\ntest('ok', async () => {});\n",
};

for (const [nome, sorgente] of Object.entries(APPESI)) {
  test(`RUNNER-02 — ${nome}: SENZA gli argomenti di serie resta appeso; CON gli argomenti finisce in fretta, rosso e col perché`, async (t) => {
    const cartella = mkdtempSync(join(tmpdir(), 'runner-appeso-'));
    t.after(() => rimuoviCartellaDiProva(cartella));
    const file = join(cartella, nome);
    writeFileSync(file, sorgente);
    const senza = await corri(file, [], 6_000);
    assert.equal(senza.finito, false, `premessa: senza tetto il file doveva restare appeso, invece è finito: ${senza.uscita.slice(-300)}`);
    const con = await corri(file, argomentiDelRunner([], { tettoMs: 1_500 }), 15_000);
    assert.equal(con.finito, true, `col tetto doveva finire: ${con.uscita.slice(-300)}`);
    assert.notEqual(con.codice, 0, 'e finire ROSSO');
    assert.match(con.uscita, /timed out after 1500ms/u, 'col perché');
  });
}

test('RUNNER-03 — il runner vero passa gli argomenti di serie a `node --test` (una funzione giusta che nessuno chiama non cura niente)', async () => {
  const { readFileSync } = await import('node:fs');
  const sorgente = readFileSync(new URL('../../scripts/run-node-tests.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /import \{ argomentiDelRunner \} from '\.\/argomenti-prove-node\.mjs'/u);
  assert.match(sorgente, /spawn\(process\.execPath, \['--test', \.\.\.argomentiDelRunner\(args\)/u);
});
