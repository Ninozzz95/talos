import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { argomentiWslPerScript, eseguiComandoSandboxato, convertiPercorsoWsl } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const probe = process.platform === 'win32'
  ? spawnSync('wsl.exe', ['--exec', 'bash', '--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true }) : null;
const realWsl = { skip: probe?.status === 0 ? false : 'WSL/Bash unavailable: integration not executed' };

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-shell-data-'));
  t.after(() => {
    const child = relative(resolve(tmpdir()), resolve(root));
    assert.ok(child && !isAbsolute(child) && !child.startsWith('..'), 'cleanup is inside owned TEMP');
    return rimuoviCartellaDiProva(root);
  });
  return root;
}
function bare(script, dir) {
  return spawnSync('wsl.exe', ['--cd', convertiPercorsoWsl(dir), '--exec', 'bash', '-lc', script], {
    encoding: 'utf8', timeout: 15_000, windowsHide: true,
  });
}

test('SHELL05-ARGV: optional data uses native arguments; old calls remain identical', () => {
  const data = ["$()`x` ' città", ''];
  assert.deepEqual(argomentiWslPerScript('Ubuntu', 'script'), ['-d', 'Ubuntu', '--exec', 'bash', '-lc', 'script']);
  assert.deepEqual(argomentiWslPerScript('Ubuntu', 'script', data), ['-d', 'Ubuntu', '--exec', 'bash', '-lc', 'script', 'bash', ...data]);
  assert.deepEqual(data, ["$()`x` ' città", '']);
});

for (const [id, name, decoy] of [
  ['SUBSTITUTION', '$(printf decoy)', 'decoy'],
  ['BACKTICK', '`printf decoy`', 'decoy'],
  ['PARAMETER', '${BASH_VERSINFO[0]}', '5'],
  ['ARITHMETIC', '$((1+1))', '2'],
  ['UNICODE', "l'archivio città 🐇", null],
]) {
  test(`SHELL05-CWD-${id}: workspace name stays literal in real WSL`, realWsl, async t => {
    const root = fixture(t), dir = join(root, name);
    mkdirSync(dir);
    writeFileSync(join(dir, 'identity.txt'), 'INTENDED WORKSPACE');
    if (decoy) {
      mkdirSync(join(root, decoy));
      writeFileSync(join(root, decoy, 'identity.txt'), 'WRONG WORKSPACE');
    }
    const plain = bare('cat identity.txt', dir);
    assert.equal(plain.status, 0, plain.stderr);
    assert.equal(plain.stdout, 'INTENDED WORKSPACE');
    const result = await eseguiComandoSandboxato('cat identity.txt', dir, { dove: 'wsl2', tracciaCartella: true });
    assert.equal(result.enforcement, 'wsl2');
    assert.equal(result.codice, 0, result.testo);
    assert.equal(result.testo, plain.stdout);
    assert.equal(result.cartellaFinale, convertiPercorsoWsl(dir));
  });
}

test('SHELL05-PROBE-NO-EXEC: command availability never executes the token', realWsl, async t => {
  const root = fixture(t), marker = join(root, 'probe.txt');
  const posix = convertiPercorsoWsl(marker);
  assert.doesNotMatch(posix, /[\s"'`$]/, 'fixture needs a literal single token');
  // Quoted first token takes the availability probe. This is data for that probe,
  // not permission to run its substitution; the selected cmd shell cannot expand it.
  const script = '"$(printf${IFS}PROBE>>' + posix + ')"';
  const result = await eseguiComandoSandboxato(script, root);
  assert.equal(existsSync(marker), false, 'availability probe executed a command substitution');
  assert.equal(result.enforcement, 'none');
  assert.notEqual(result.codice, 0);
});

test('SHELL05-POSITIONAL: workspace is removed before user script; status and shell name preserved', realWsl, async t => {
  const dir = fixture(t), script = 'printf "%s|%s|%s|%s" "$0" "$#" "$?" "${1-unset}"';
  const plain = bare(script, dir);
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(plain.stdout, 'bash|0|0|unset');
  const result = await eseguiComandoSandboxato(script, dir, { dove: 'wsl2', tracciaCartella: true });
  assert.equal(result.codice, 0, result.testo);
  assert.equal(result.testo, plain.stdout);
});

test('SHELL05-RESUME-CWD: next call can reuse the exact returned POSIX directory', realWsl, async t => {
  const root = fixture(t), child = join(root, '$(printf decoy)');
  mkdirSync(child);
  writeFileSync(join(child, 'identity.txt'), 'SECOND CALL');
  const first = await eseguiComandoSandboxato("cd '$(printf decoy)'", root, { dove: 'wsl2', tracciaCartella: true });
  assert.equal(first.codice, 0, first.testo);
  assert.equal(first.cartellaFinale, convertiPercorsoWsl(child));
  const second = await eseguiComandoSandboxato('cat identity.txt', first.cartellaFinale, { dove: 'wsl2', tracciaCartella: true });
  assert.equal(second.codice, 0, second.testo);
  assert.equal(second.testo, 'SECOND CALL');
  assert.equal(second.cartellaFinale, first.cartellaFinale);
});

test('SHELL05-MISSING-CWD: failed directory change never runs user body', realWsl, async t => {
  const dir = fixture(t);
  const result = await eseguiComandoSandboxato("printf 'FORBIDDEN-BODY'", join(dir, 'missing'), { dove: 'wsl2', tracciaCartella: true });
  assert.notEqual(result.codice, 0);
  assert.doesNotMatch(result.testo, /FORBIDDEN-BODY/);
});

for (const [id, script, code, stdout] of [
  ['EXPLICIT-ZERO', 'n=0; for i in {1..500}; do false || n=$((n+1)); done; printf "falliti=%s" "$n"; exit 0', 0, 'falliti=500'],
  ['AND', "false && printf forbidden", 1, ''],
  ['OR', "false || printf recovered", 0, 'recovered'],
  ['FINAL-NONZERO', "printf partial; (exit 42)", 42, 'partial'],
  ['PIPE-DEFAULT', 'false | cat', 0, ''],
  ['PIPEFAIL', 'set -o pipefail; false | cat', 1, ''],
]) {
  test(`SHELL05-T06-${id}: reports actual Bash exit without inventing internal status`, realWsl, async t => {
    const dir = fixture(t), plain = bare(script, dir);
    assert.equal(plain.status, code, plain.stderr);
    assert.equal(plain.stdout, stdout);
    for (const tracciaCartella of [false, true]) {
      const result = await eseguiComandoSandboxato(script, dir, { dove: 'wsl2', tracciaCartella });
      assert.equal(result.codice, code, result.testo);
      assert.equal(result.fuori ?? '', stdout);
      assert.equal(result.errori ?? '', '');
    }
  });
}
