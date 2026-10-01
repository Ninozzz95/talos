import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eseguiComandoSandboxato, convertiPercorsoWsl } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const probe = process.platform === 'win32'
  ? spawnSync('wsl.exe', ['--exec', 'bash', '--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true }) : null;
const options = { skip: probe?.status === 0 ? false : 'WSL/Bash unavailable: real integration not executed' };
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-heredoc-'));
  const dir = join(root, 'spazio città');
  mkdirSync(dir);
  t.after(() => rimuoviCartellaDiProva(root));
  return dir;
}
function bare(script, dir) {
  return spawnSync('wsl.exe', ['--cd', convertiPercorsoWsl(dir), '--exec', 'bash', '-lc', script], {
    encoding: 'utf8', timeout: 15_000, windowsHide: true,
  });
}
const cases = [
  ['HEREDOC', "cat <<'END'\nCittà 🐇 $HOME `uname` $(uname)\nEND", 'Città 🐇 $HOME `uname` $(uname)'],
  ['HEREDOC-EXPANSION', 'WORD=literal\ncat <<END\n$WORD\nEND', 'literal'],
  ['HEREDOC-FINAL-LF', "cat <<'END'\nintatto\nEND\n", 'intatto'],
  ['MULTIPLE', "cat <<'A'; cat <<'B'\nprimo\nA\nsecondo\nB", 'primo\nsecondo'],
  ['TABS', "cat <<-'END'\n\ttabulazione\n\tEND", 'tabulazione'],
  ['COMMENT', "printf 'ok' # il wrapper non fa parte del commento", 'ok'],
  ['SEMICOLON', "printf 'ok';", 'ok'],
];
for (const [name, script, expected] of cases) {
  test(`SHELL04-${name}: real WSL preserves Bash syntax and payload`, options, async t => {
    const dir = fixture(t), plain = bare(script, dir);
    assert.equal(plain.status, 0, plain.stderr);
    assert.equal(plain.stdout.trim(), expected);
    const result = await eseguiComandoSandboxato(script, dir, { dove: 'wsl2' });
    assert.equal(result.enforcement, 'wsl2');
    assert.equal(result.codice, plain.status, result.testo);
    assert.equal(result.testo, plain.stdout.trim());
    assert.equal(result.stderr ?? '', '');
    assert.deepEqual(readdirSync(dir), []);
  });
}

test('SHELL04-DIRECTORY: heredoc and cwd tracing share the same shell', options, async t => {
  const dir = fixture(t);
  mkdirSync(join(dir, 'sub'));
  const result = await eseguiComandoSandboxato("cd sub\ncat <<'END'\nrisultato\nEND", dir, { dove: 'wsl2', tracciaCartella: true });
  assert.equal(result.codice, 0, result.testo);
  assert.equal(result.testo, 'risultato');
  assert.equal(result.cartellaFinale, convertiPercorsoWsl(join(dir, 'sub')));
});

test('SHELL04-EXIT: tracing preserves nonzero status after a multiline command', options, async t => {
  const dir = fixture(t), script = "cat <<'END'\nrisultato\nEND\n(exit 7)";
  const plain = bare(script, dir);
  assert.equal(plain.status, 7);
  const result = await eseguiComandoSandboxato(script, dir, { dove: 'wsl2', tracciaCartella: true });
  assert.equal(result.codice, plain.status);
  assert.equal(result.testo, plain.stdout.trim());
  assert.equal(result.cartellaFinale, convertiPercorsoWsl(dir));
});

test('SHELL04-INVALID: invalid script fails; missing cwd never executes the body', options, async t => {
  const dir = fixture(t), script = 'if then';
  const plain = bare(script, dir);
  assert.notEqual(plain.status, 0);
  const result = await eseguiComandoSandboxato(script, dir, { dove: 'wsl2' });
  assert.equal(result.codice, plain.status);
  const missing = await eseguiComandoSandboxato("printf 'BODY-MUST-NOT-RUN'", join(dir, 'missing'), { dove: 'wsl2', tracciaCartella: true });
  assert.notEqual(missing.codice, 0);
  assert.doesNotMatch(missing.testo, /BODY-MUST-NOT-RUN/);
});

test('SHELL04-STOP: stop remains effective after a heredoc', options, async t => {
  const dir = fixture(t), stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 5_000);
  t.after(() => clearTimeout(timer));
  const result = await eseguiComandoSandboxato("cat <<'END'\nREADY-TO-STOP\nEND\nsleep 10\nprintf forbidden > after-stop.txt", dir, {
    dove: 'wsl2', segnaleStop: stop.signal,
    onPezzo: piece => { if (piece.testo.includes('READY-TO-STOP')) stop.abort(); },
  });
  assert.equal(result.fermatoSuRichiesta, true);
  assert.notEqual(result.codice, 0);
  assert.equal(existsSync(join(dir, 'after-stop.txt')), false);
});
