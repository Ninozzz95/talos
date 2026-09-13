// R-05b: Git reale, sorgente minima dichiarata; nessuna rete o modifica ai repository originali.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = join(repo, 'scripts/prepara-monorepo-pubblico.ps1');
const pubblico = process.env.R05B_PUBBLICO ?? 'C:/Users/Antonino/Desktop/projects/AVM-PUBBLICA';
const env = { ...process.env, GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'safe.directory',
  GIT_CONFIG_VALUE_0: pubblico.replaceAll('\\', '/') + '/.git',
  GIT_CONFIG_KEY_1: 'safe.directory', GIT_CONFIG_VALUE_1: pubblico.replaceAll('\\', '/'),
  GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function scrivi(dir, name, body) {
  const p = join(dir, name); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body);
}
function clone(dest, sorgente = pubblico, noCheckout = false) {
  git(repo, 'clone', '-c', 'core.autocrlf=false', '--no-hardlinks', ...(noCheckout ? ['--no-checkout'] : []), sorgente, dest);
  git(dest, 'config', 'user.name', 'Banco R05b'); git(dest, 'config', 'user.email', 'banco@example.invalid');
  git(dest, 'config', 'core.autocrlf', 'false'); git(dest, 'config', 'core.hooksPath', '.git/r05b-no-hooks');
}
function esegui(sorgente, copia, ...args) {
  const r = spawnSync('pwsh', ['-NoProfile', '-File', script, '-Repo', sorgente, '-Copia', copia, ...args],
    { encoding: 'utf8', env, maxBuffer: 32 * 1024 * 1024, timeout: 180_000 });
  return { ...r, testo: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}
function salva(dir, message) { git(dir, 'add', '-A'); git(dir, 'commit', '-m', message); }
function stato(dir) { return [git(dir, 'rev-parse', 'HEAD'), git(dir, 'status', '--porcelain=v1', '--untracked-files=all')]; }

test('R05B-CLI: il comando esiste', () => assert.ok(existsSync(script), 'manca prepara-monorepo-pubblico.ps1'));

test('R05B: contratto completo sul clone locale pubblico', { skip: !existsSync(script), timeout: 600_000 }, async t => {
  const banco = mkdtempSync(join(tmpdir(), 'r05b-test-'));
  console.log(`Banco conservato: ${banco}`);
  const sorgente = join(banco, 'sorgente'); const copia = join(banco, 'pubblico');
  clone(sorgente, pubblico, true); git(sorgente, 'read-tree', '--empty');
  for (const p of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', '.gitattributes', 'README-MONOREPO.md', '.gitignore-pubblico']) {
    scrivi(sorgente, p, readFileSync(join(repo, p)));
  }
  for (const p of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) scrivi(sorgente, p, readFileSync(join(repo, p)));
  for (const p of ['harness-ui/server.mjs', 'harness-ui/src/contratto.mjs', 'harness-ui/public/index.html',
    'harness-ui/frontend/src/app.js', 'harness-ui/desktop/README.md', 'harness-ui/scripts/verifica.mjs',
    'harness-ui/tests/contratto.test.mjs', 'harness-ui/contracts/README.md', 'harness-ui/README.md',
    'harness-ui/THIRD_PARTY_NOTICES.md', 'context-engine/src/contratto.mjs', 'context-engine/THIRD_PARTY_NOTICES.md']) scrivi(sorgente, p, '// Fixture minima R05b\n');
  for (const p of ['harness-ui/package.json', 'harness-ui/package-lock.json', 'context-engine/package.json', 'context-engine/package-lock.json']) scrivi(sorgente, p, '{"license":"AGPL-3.0-only"}\n');
  salva(sorgente, 'test: sorgente minima R05b, non prodotto');
  clone(copia);
  const iniziale = stato(copia);
  const originaleReadme = git(copia, 'rev-parse', 'HEAD:README.md');
  await t.test('R05B-ANTEPRIMA: disposizione radice e nessuna mutazione', () => {
    const r = esegui(sorgente, copia, '-Riordina'); assert.equal(r.status, 0, r.testo);
    assert.match(r.testo, /DISPOSIZIONE: mobile alla radice/); assert.deepEqual(stato(copia), iniziale);
  });
  await t.test('R05B-R100 e R05B-SOTTOMODULI: solo rinomine, poi tre path aggiornati', () => {
    const r = esegui(sorgente, copia, '-Riordina', '-Esegui'); assert.equal(r.status, 0, r.testo);
    const cambi = git(copia, 'diff', '--name-status', '-M100%', 'HEAD~1', 'HEAD').split('\n');
    assert.ok(cambi.length > 2000); assert.ok(cambi.every(x => x.startsWith('R100\t')), cambi.filter(x => !x.startsWith('R100\t')).join('\n'));
    assert.equal(git(copia, 'rev-parse', 'HEAD:mobile/README.md'), originaleReadme);
    assert.equal(git(copia, 'rev-list', '--count', 'origin/main..HEAD'), '1');
    assert.equal(git(copia, 'diff', '--numstat', '-M100%', 'HEAD~1', 'HEAD').split('\n').filter(x => !x.startsWith('0\t0\t') && !x.startsWith('-\t-\t')).length, 0); // 13/09: per i binari (so, png) numstat scrive «-\t-», non «0\t0»
    const mod = readFileSync(join(copia, '.gitmodules'), 'utf8');
    assert.equal((mod.match(/path = mobile\/third_party\//g) ?? []).length, 3);
    assert.ok(git(copia, 'log', '--follow', '--format=%H', '--', 'mobile/README.md').split('\n').length > 1);
    // 13/09: la mobile gia' pubblica porta un suo `kernel/dist/` negli asset dell'APK; il controllo vale per cio' che esporta il desktop.
    assert.ok(!git(copia, 'ls-files').split('\n').filter(p => !p.startsWith('mobile/')).some(p => /(^|\/)(?:AGENTS.md|scratchpad|node_modules|dist|\.claude)(\/|$)/.test(p) && p !== 'harness-ui/src/kernel/dist/kernelPerIlBanco.js'));
  });
  assert.ok(existsSync(join(copia, 'mobile/package.json')), 'migrazione iniziale fallita: interrompo i test dipendenti');
  await t.test('R05B-IDEMPOTENZA: secondo giro con desktop staged identico', () => {
    const prima = stato(copia); const tree = git(copia, 'write-tree');
    const r = esegui(sorgente, copia, '-Riordina', '-Esegui'); assert.equal(r.status, 0, r.testo);
    assert.match(r.testo, /IDEMPOTENZA/); assert.deepEqual(stato(copia), prima); assert.equal(git(copia, 'write-tree'), tree);
  });
  // Ogni spia è piantata in un file tracciato fuori dalle vecchie radici di grep.
  for (const [id, testo] of [['SERIAL', '2ea6573c'], ['PERCORSO', 'C:\\Users\\Antonino\\'], ['EMAIL', 'ninozz142@example.invalid']]) {
    await t.test(`R05B-${id}: cancello globale, nessun commit`, () => {
      const f = `mobile/release/r05b-${id}.txt`; scrivi(copia, f, testo); git(copia, 'add', '--', f);
      const head = git(copia, 'rev-parse', 'HEAD'); const r = esegui(sorgente, copia, '-Esegui');
      assert.notEqual(r.status, 0, r.testo); assert.match(r.testo, new RegExp(`BLOCCO ${id}`));
      assert.equal(git(copia, 'rev-parse', 'HEAD'), head); git(copia, 'rm', '-f', '--', f);
    });
  }
  for (const [id, file, body] of [
    ['PERCORSI', 'context-engine/dist/prova.js', 'fixture'],
    // 13/09: 4174 e' la porta predefinita del prodotto, non blocca (si conta): nessun caso PORTA.
    // 13/09: TALOS-BANCO e' gia' pubblico (asset dell'APK) e non blocca piu'; si pianta una parola mai uscita.
    ['RICERCA', 'harness-ui/src/prova.mjs', '// prime-agent'],
    ['PESO', 'context-engine/grande.bin', Buffer.alloc(5 * 1024 * 1024 + 1, 1)],
    ['IMMAGINI', 'README-MONOREPO.md', '# TALOS\n![logo](mobile/docs/immagini/non-esiste.png)\n'],
  ]) {
    await t.test(`R05B-${id}: candidato respinto, destinazione intatta`, () => {
      const prima = stato(copia); const old = existsSync(join(sorgente, file)) ? readFileSync(join(sorgente, file)) : null;
      scrivi(sorgente, file, body); salva(sorgente, `test: pianta ${id}`);
      const r = esegui(sorgente, copia, '-Esegui'); assert.notEqual(r.status, 0, r.testo);
      assert.match(r.testo, new RegExp(`BLOCCO ${id}`)); assert.deepEqual(stato(copia), prima);
      if (old) scrivi(sorgente, file, old); else git(sorgente, 'rm', '-f', '--', file);
      salva(sorgente, `test: rimuovi ${id}`);
    });
  }
  await t.test('R05B-HEAD: un file privato non committato non esce', () => {
    scrivi(sorgente, 'context-engine/non-tracciato.txt', 'non deve uscire');
    const r = esegui(sorgente, copia, '-Esegui'); assert.equal(r.status, 0, r.testo);
    assert.ok(!existsSync(join(copia, 'context-engine/non-tracciato.txt')));
  });
  await t.test('R05B-SNAPSHOT: eliminazione limitata e mobile conservata', () => {
    // Il banco simula qui il secondo commit approvato, mai sul worktree privato.
    salva(copia, 'test: desktop approvato nel solo banco');
    git(copia, 'update-ref', 'refs/remotes/origin/main', git(copia, 'rev-parse', 'HEAD'));
    const mobile = git(copia, 'rev-parse', 'HEAD:mobile');
    git(sorgente, 'rm', '--', 'context-engine/src/contratto.mjs'); salva(sorgente, 'test: snapshot senza file rimosso');
    const r = esegui(sorgente, copia, '-Esegui'); assert.equal(r.status, 0, r.testo);
    assert.ok(!existsSync(join(copia, 'context-engine/src/contratto.mjs')));
    assert.equal(git(copia, 'rev-parse', ':mobile/README.md'), originaleReadme);
    assert.equal(git(copia, 'rev-parse', 'HEAD:mobile'), mobile);
  });
  await t.test('R05B-DIRTY: una modifica umana non viene sovrascritta', () => {
    scrivi(copia, 'harness-ui/src/contratto.mjs', '// modifica umana\n'); const prima = stato(copia);
    const r = esegui(sorgente, copia, '-Esegui'); assert.notEqual(r.status, 0); assert.match(r.testo, /BLOCCO PULIZIA/);
    assert.deepEqual(stato(copia), prima);
  });
});
