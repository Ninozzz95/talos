import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, createWriteStream, readdirSync, copyFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const repo = resolve(frontend, '../..');
const preload = new URL('../tests/fixtures/ripresa-keyring-preload.mjs', import.meta.url).href;
const json = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Git ${args[0]}: ${result.stderr}`);
  return result.stdout.trim();
};

export function creaEsecuzione(kind) {
  if (!/^[a-z-]+$/.test(kind)) throw new Error('Tipo esecuzione non valido');
  const id = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${kind}-${randomUUID().slice(0, 8)}`;
  const output = join(frontend, 'artifacts', 'ripresa', id);
  mkdirSync(output, { recursive: true });
  const state = mkdtempSync(join(tmpdir(), 'talos-ripresa-'));
  const run = { id, kind, output, state, data: join(state, 'data'), home: join(state, 'home'), temp: join(state, 'tmp'), workspace: join(state, 'workspace'), manifest: join(output, 'manifest.json') };
  for (const dir of [run.data, run.home, run.temp, run.workspace, join(run.home, 'AppData/Roaming'), join(run.home, 'AppData/Local'), join(run.data, 'sessions')]) mkdirSync(dir, { recursive: true });
  run.bundle = join(run.temp, 'talos-phase1-bundle');
  json(run.manifest, {
    schema: 'talos.ripresa.run.v1', ...run, created: new Date().toISOString(),
    head: git('rev-parse', 'HEAD'), release: 'desktop-v0.1.13', releaseHead: git('rev-parse', 'desktop-v0.1.13^{commit}'),
    status: git('status', '--short'), node: process.version, keyring: 'test-only-memory',
    locks: ['package-lock.json', '../package-lock.json'].map(file => ({ file, sha256: createHash('sha256').update(readFileSync(resolve(frontend, file))).digest('hex') })),
    limitations: ['Keyring OS e provider autenticati non certificati', 'Nessuna prova della 4174', 'Trace e screenshot solo per test browser eseguiti'],
  });
  return run;
}

export function creaAmbienteIsolato(run, source = process.env) {
  const env = {};
  const allowed = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'processor_architecture', 'number_of_processors', 'programfiles', 'programfiles(x86)', 'programw6432']);
  for (const [key, value] of Object.entries(source)) if (allowed.has(key.toLowerCase())) env[key] = value;
  return {
    ...env, HOME: run.home, USERPROFILE: run.home,
    APPDATA: join(run.home, 'AppData/Roaming'), LOCALAPPDATA: join(run.home, 'AppData/Local'),
    TEMP: run.temp, TMP: run.temp, TALOS_RIPRESA_ISOLATED: '1',
    NODE_OPTIONS: `--import=${preload}`,
    TALOS_RIPRESA_OUTPUT: run.output, TALOS_RIPRESA_BUNDLE: run.bundle,
    TALOS_DESKTOP_DATA_DIR: run.data, TALOS_HARNESS_UI_SESSIONS_DIR: join(run.data, 'sessions'),
    TALOS_HARNESS_UI_PROJECT_DIRS: run.workspace,
    TALOS_HARNESS_UI_KEYRING_SCOPE: run.kind === 'browser-release' ? 'desktop' : 'desktop-preview',
    TALOS_HARNESS_UI_PORT: '4186', TALOS_HARNESS_UI_PUBLIC_DIR: run.bundle,
    // Playwright browser binaries are executables, not the owner's browser profile.
    PLAYWRIGHT_BROWSERS_PATH: source.PLAYWRIGHT_BROWSERS_PATH || join(source.LOCALAPPDATA || '', 'ms-playwright'),
    CI: '1',
  };
}

async function child(run, name, args, env) {
  const logPath = join(run.output, `${name}.log`);
  const log = createWriteStream(logPath, { flags: 'wx' });
  const started = new Date().toISOString();
  const code = await new Promise((done, reject) => {
    const proc = spawn(process.execPath, args, { cwd: run.frontend || frontend, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.pipe(log, { end: false }); proc.stderr.pipe(log, { end: false });
    proc.on('error', reject);
    proc.on('close', (status, signal) => log.end(() => done(signal ? 1 : (status ?? 1))));
  });
  json(join(run.output, `${name}-result.json`), { started, finished: new Date().toISOString(), args, code, logPath });
  console.log(`${name}: exit ${code}; ${logPath}`);
  return code;
}

export function creaSnapshot(run, { release = false } = {}) {
  const snapshot = join(run.state, 'source');
  const cloned = spawnSync('git', ['clone', '--shared', '--no-checkout', '--quiet', repo, snapshot], { encoding: 'utf8', windowsHide: true });
  if (cloned.status !== 0) throw new Error(`Snapshot Git: ${cloned.stderr}`);
  if (release) {
    const checkout = spawnSync('git', ['checkout', '--detach', 'desktop-v0.1.13'], { cwd: snapshot, encoding: 'utf8', windowsHide: true });
    if (checkout.status !== 0) throw new Error(`Release snapshot: ${checkout.stderr}`);
  }
  const indexed = spawnSync('git', ['read-tree', 'HEAD'], { cwd: snapshot, encoding: 'utf8', windowsHide: true });
  if (indexed.status !== 0) throw new Error(`Indice snapshot: ${indexed.stderr}`);
  const files = git('ls-files', '-z').split('\0').filter(Boolean);
  const gitlinks = new Map(git('ls-files', '--stage', '-z').split('\0').filter(row => row.startsWith('160000 ')).map(row => [row.slice(row.indexOf('\t') + 1), row.split(' ')[1]]));
  const additions = [
    'harness-ui/frontend/src/components/cronologia-grafo.js',
    'harness-ui/frontend/tests/unit/cronologia-grafo.test.mjs',
    'harness-ui/frontend/tests/browser/ripresa-replay.spec.mjs',
    'harness-ui/src/agent-timeline.mjs',
    'harness-ui/tests/agent-timeline.test.mjs',
    'harness-ui/frontend/scripts/ripresa-run.mjs',
    'harness-ui/frontend/scripts/ripresa-reporter.mjs',
    'harness-ui/frontend/playwright.ripresa.config.mjs',
    'harness-ui/frontend/tests/fixtures/ripresa-keyring-preload.mjs',
    'harness-ui/frontend/tests/fixtures/ripresa-keyring-memory.mjs',
    'harness-ui/frontend/tests/unit/ripresa-isolamento.test.mjs',
    'harness-ui/frontend/tests/browser/ripresa-banco.spec.mjs',
    'harness-ui/frontend/tests/browser/ripresa-sidebar-radici.spec.mjs',
    'harness-ui/frontend/tests/browser/lab-libera-memoria.spec.mjs',
    'harness-ui/tests/process-policy-env-narrowing.test.mjs',
    'harness-ui/frontend/src/components/grafo-agenti.js',
    'harness-ui/frontend/src/styles/grafo-agenti.css',
    'harness-ui/frontend/tests/unit/grafo-agenti.test.mjs',
  ];
  const hashes = [];
  for (const file of new Set([...files, ...additions])) {
    if (gitlinks.has(file)) { hashes.push({ file, gitlink: gitlinks.get(file), contentCopied: false }); continue; }
    if (release && !file.startsWith('harness-ui/frontend/tests/') && !additions.includes(file)) continue;
    const source = resolve(repo, file), target = resolve(snapshot, file);
    const rel = relative(snapshot, target);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Percorso snapshot fuori radice: ${file}`);
    if (!existsSync(source)) { hashes.push({ file, deleted: true }); continue; }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    hashes.push({ file, sha256: createHash('sha256').update(readFileSync(target)).digest('hex') });
  }
  for (const dir of ['node_modules', 'harness-ui/node_modules', 'harness-ui/frontend/node_modules']) {
    const source = join(repo, dir);
    if (existsSync(source)) symlinkSync(source, join(snapshot, dir), 'junction');
  }
  json(join(run.output, 'source-files.json'), hashes);
  run.frontend = join(snapshot, 'harness-ui/frontend');
  // Le spec con server proprio puntano a frontend/dist: stessa build, stesso snapshot.
  run.bundle = join(run.frontend, 'dist');
  json(join(run.output, 'snapshot.json'), { snapshot, frontend: run.frontend, bundle: run.bundle, dependencyLinks: true, productSource: release ? 'desktop-v0.1.13' : 'current-worktree', probes: 'current-worktree' });
  return snapshot;
}

export function elencaTestBackend(root = repo) {
  return [
    ...readdirSync(join(root, 'harness-ui/tests'), { recursive: true }).filter(file => file.endsWith('.test.mjs')).map(file => join('../tests', file)),
    ...readdirSync(join(root, 'harness-ui/labs/electron-shell'), { recursive: true }).filter(file => file.endsWith('.test.mjs')).map(file => join('../labs/electron-shell', file)),
  ].sort();
}

export async function esegui(kind, args = []) {
  if (!['build', 'unit', 'backend', 'browser', 'browser-release', 'list'].includes(kind)) throw new Error('Usare build, unit, backend, browser, browser-release o list');
  if (args.some(arg => /^--(config|output|reporter|workers|project|ui|headed|debug|update-snapshots)/.test(arg))) throw new Error('Override del banco non consentito');
  const run = creaEsecuzione(kind);
  if (kind !== 'list') creaSnapshot(run, { release: kind === 'browser-release' });
  const env = creaAmbienteIsolato(run);
  console.log(`RIPRESA ${run.id}\nRapporti: ${run.output}\nStato isolato: ${run.state}`);
  json(join(run.output, 'configuration.json'), { ...env, Path: undefined, PATH: undefined });
  json(join(run.output, 'exclusions.json'), [
    { file: 'lab-bootstrap.spec.mjs', reason: 'Banco modulare e configurazione dedicati' },
    { file: '_confronto-exa.spec.mjs', reason: '4174 e output Downloads hardcoded; gate separato controllato' },
    { file: '_confronto-fase1.spec.mjs', reason: '4174 e output Downloads hardcoded; gate separato controllato' },
  ]);
  const cli = join(frontend, 'node_modules/@playwright/test/cli.js');
  if (kind === 'backend') {
    const files = args.length ? args.map(file => {
      if (!/^[a-zA-Z0-9_.-]+\.test\.mjs$/.test(file)) throw new Error('Il backend accetta solo nomi di file test');
      return join('../tests', file);
    }) : elencaTestBackend();
    json(join(run.output, 'test-files.json'), files);
    return child(run, 'backend', ['--test', '--test-concurrency=1', '--test-reporter=tap', ...files], env);
  }
  if (kind === 'unit') {
    const build = `const {buildProduction}=await import('./scripts/build.mjs'); await buildProduction({outputDir:process.env.TALOS_RIPRESA_BUNDLE});`;
    const code = await child(run, 'build', ['--input-type=module', '-e', build], env);
    if (code) return code;
    writeFileSync(join(run.output, 'build-manifest.json'), readFileSync(join(run.bundle, 'build-manifest.json')), { flag: 'wx' });
  }
  if (kind === 'unit') {
    const files = readdirSync(join(frontend, 'tests'), { recursive: true }).filter(file => file.endsWith('.test.mjs')).map(file => join('tests', file));
    json(join(run.output, 'test-files.json'), files);
    return child(run, 'unit', ['--test', '--test-concurrency=1', '--test-reporter=tap', ...files], env);
  }
  if (kind !== 'list') {
    const build = `const {buildProduction}=await import('./scripts/build.mjs'); await buildProduction({outputDir:process.env.TALOS_RIPRESA_BUNDLE});`;
    const code = await child(run, 'build', ['--input-type=module', '-e', build], env);
    if (code || kind === 'build') return code;
    writeFileSync(join(run.output, 'build-manifest.json'), readFileSync(join(run.bundle, 'build-manifest.json')), { flag: 'wx' });
  }
  return child(run, kind, [cli, 'test', '--config=playwright.ripresa.config.mjs', ...(kind === 'list' ? ['--list'] : []), ...args], env);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  esegui(process.argv[2], process.argv.slice(3)).then(code => { process.exitCode = code; }).catch(error => { console.error(error); process.exitCode = 1; });
}
