/** One-click source delivery. No provider call, global installation, or production-profile migration. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { access, copyFile, mkdir, readFile, readdir, rename, rm, stat, lstat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

export const NODE_VERSION = '24.18.0';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cache = join(root, '.talos-runtime');
const projects = ['harness-ui', 'harness-ui/frontend', 'harness-ui/desktop', 'context-engine'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export function parseOptions(args) {
  const result = { prepareOnly: false, verify: false, cpu: false, dataDir: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prepare-only') result.prepareOnly = true;
    else if (args[i] === '--verify') result.verify = true;
    else if (args[i] === '--cpu') result.cpu = true;
    else if (args[i] === '--data-dir') {
      if (!args[i + 1] || !isAbsolute(args[i + 1])) throw Error('--data-dir richiede un percorso assoluto.');
      result.dataDir = resolve(args[++i]);
    } else throw Error('Opzione non riconosciuta: ' + args[i]);
  }
  return result;
}

export function safeRelative(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.includes(':') || name.includes('\0') || name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Percorso di archivio non sicuro: ' + name);
  return name;
}

export function cleanEnvironment(env, options = {}) {
  const clean = Object.fromEntries(Object.entries(env).filter(([key, value]) => value !== undefined && !/^(NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|TALOS_|OPENAI_|OPENROUTER_|ANTHROPIC_|GOOGLE_API_KEY|GEMINI_API_KEY)/i.test(key)));
  clean.PATH = dirname(process.execPath) + sepForPath() + (clean.PATH || clean.Path || '');
  delete clean.Path;
  clean.TALOS_DESKTOP_PROFILE = 'preview';
  if (options.dataDir) clean.TALOS_DESKTOP_DATA_DIR = options.dataDir;
  return clean;
}
function sepForPath() { return process.platform === 'win32' ? ';' : ':'; }

export async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function regularParents(base, file) {
  const rel = relative(base, file);
  if (!rel || rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel)) throw Error('Destinazione esterna alla radice consentita.');
  let dir = base;
  for (const part of rel.split(sep).slice(0, -1)) {
    dir = join(dir, part);
    const info = await lstat(dir).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
    if (info?.isSymbolicLink() || (info && !info.isDirectory())) throw Error('Collegamento o file al posto di una cartella: ' + dir);
    if (!info) await mkdir(dir);
  }
}
async function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, shell: false, windowsHide: false, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolveRun() : reject(Error(`Comando terminato con ${code ?? signal}: ${command}`)));
  });
}

export async function verifiedDownload(url, target, expected, maximum = 256 * 1024 * 1024) {
  if (!/^[a-f0-9]{64}$/.test(expected)) throw Error('Impronta download non valida.');
  const address = new URL(url);
  if (address.protocol !== 'https:' || address.username || address.password || !['github.com', 'raw.githubusercontent.com', 'nodejs.org'].includes(address.hostname)) throw Error('Origine download non consentita.');
  if (existsSync(target)) {
    if ((await lstat(target)).isSymbolicLink() || await digest(target) !== expected) throw Error('Cache non integra: ' + target + '. Rimuovere solo questa copia e riprovare.');
    return target;
  }
  await regularParents(root, target);
  const partial = target + '.partial-' + randomUUID();
  const hash = createHash('sha256'); let bytes = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(Error('Download scaduto.')), 240000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok || !response.body) throw Error('Download HTTP ' + response.status + ': ' + address.hostname);
    if (Number(response.headers.get('content-length')) > maximum) throw Error('Download oltre il limite previsto.');
    await pipeline(response.body, new Transform({ transform(chunk, encoding, done) {
      bytes += chunk.length;
      if (bytes > maximum) return done(Error('Download oltre il limite previsto.'));
      hash.update(chunk); done(null, chunk);
    } }), createWriteStream(partial, { flags: 'wx' }));
    if (hash.digest('hex') !== expected) throw Error('Integrita del download non valida: nessun file eseguito.');
    await rename(partial, target);
    return target;
  } finally {
    clearTimeout(timer);
    await rm(partial, { force: true });
  }
}

async function restoreAssets() {
  const file = join(root, 'DELIVERY-ASSETS.json');
  if (!existsSync(file)) return; // A normal git checkout already contains its original assets.
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(manifest.schema, 1);
  assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/);
  for (const asset of manifest.assets) {
    safeRelative(asset.path);
    if (!asset.path.startsWith('harness-ui/')) continue;
    const expectedUrl = 'https://raw.githubusercontent.com/Ninozzz95/talos/' + manifest.sourceCommit + '/' + asset.path.split('/').map(encodeURIComponent).join('/');
    if (asset.url !== expectedUrl) throw Error('Riferimento asset incoerente con il commit.');
    await verifiedDownload(asset.url, join(root, asset.path), asset.sha256, Math.max(asset.bytes + 1, 1024));
  }
}

async function installDependencies(env) {
  const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  await access(npm);
  const stateFile = join(cache, 'dependencies.json');
  const previous = JSON.parse(await readFile(stateFile, 'utf8').catch(e => e.code === 'ENOENT' ? '{}' : Promise.reject(e)));
  const current = {};
  for (const name of projects) {
    const dir = join(root, name);
    const fingerprint = createHash('sha256').update(await readFile(join(dir, 'package-lock.json'))).update(await readFile(join(dir, 'package.json'))).update(process.version + process.platform + process.arch).digest('hex');
    const modules = join(dir, 'node_modules');
    if (existsSync(modules) && (await lstat(modules)).isSymbolicLink()) throw Error('node_modules collegato non ammesso nel lanciatore: ' + name);
    if (previous[name] !== fingerprint || !existsSync(join(modules, '.package-lock.json'))) {
      console.log('Installazione dipendenze dal lock: ' + name);
      await run(process.execPath, [npm, 'ci', '--prefix', dir, '--no-audit', '--no-fund', '--prefer-offline'], {
        env: { ...env, npm_config_cache: join(cache, 'npm'), npm_config_update_notifier: 'false' },
      });
    } else console.log('Dipendenze gia preparate: ' + name);
    current[name] = fingerprint;
  }
  await writeFile(stateFile, JSON.stringify(current, null, 2) + '\n');
}
async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('Link inatteso nel bundle compilato.');
    if (entry.isDirectory()) await copyTree(join(from, entry.name), join(to, entry.name));
    else if (entry.isFile()) await copyFile(join(from, entry.name), join(to, entry.name));
  }
}
async function buildFrontend(env) {
  const frontend = join(root, 'harness-ui/frontend');
  const pkg = JSON.parse(await readFile(join(frontend, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.build);
  const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  console.log('Compilazione della UI dai sorgenti effettivi...');
  await run(process.execPath, [npm, '--prefix', frontend, 'run', 'build'], { env });
  await run(process.execPath, [join(root, 'harness-ui/node_modules/typescript/bin/tsc'), '-p', join(frontend, 'tsconfig.refactor.json')], { env });
  const dist = join(frontend, 'dist');
  await copyTree(dist, join(root, 'harness-ui/public'));
  for (const name of ['app.js', 'index.html']) assert.equal(await digest(join(dist, name)), await digest(join(root, 'harness-ui/public', name)), 'La UI servita deve corrispondere alla build: ' + name);
}

async function prepareLocalRuntime(env, cpuOnly) {
  const { LLAMA } = await import('../../harness-ui/desktop/scripts/prepara-pacchetto.mjs');
  const backendRequire = createRequire(join(root, 'harness-ui/package.json'));
  const JSZip = backendRequire('jszip');
  const paths = {};
  for (const asset of LLAMA.filter(a => !cpuOnly || a.variante === 'cpu')) {
    const archive = join(cache, asset.nome);
    console.log('Verifica runtime locale ' + asset.variante + '...');
    await verifiedDownload(asset.url, archive, asset.sha256);
    const destination = join(cache, 'llama-' + asset.versione, asset.variante);
    const stamp = join(destination, '.verified.json');
    let verified = false;
    if (existsSync(stamp)) {
      const previous = JSON.parse(await readFile(stamp, 'utf8'));
      verified = previous.archiveSha256 === asset.sha256;
      for (const file of previous.files || []) {
        safeRelative(file.path);
        if (!existsSync(join(destination, file.path)) || await digest(join(destination, file.path)) !== file.sha256) verified = false;
      }
      if (!previous.files?.length) verified = false;
    }
    if (!verified) {
      const zip = await JSZip.loadAsync(await readFile(archive), { checkCRC32: true });
      const servers = Object.values(zip.files).filter(f => !f.dir && /(^|\/)llama-server\.exe$/.test(f.name));
      assert.equal(servers.length, 1, 'Il runtime deve contenere un solo server.');
      const prefix = servers[0].name.slice(0, -'llama-server.exe'.length);
      const files = []; let total = 0;
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        if (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name) throw Error('Percorso ZIP normalizzato non ammesso.');
        safeRelative(entry.name);
        if (entry.unixPermissions && (entry.unixPermissions & 0o170000) === 0o120000) throw Error('Link nel runtime non ammesso.');
        const name = prefix && entry.name.startsWith(prefix) ? entry.name.slice(prefix.length) : entry.name;
        safeRelative(name);
        if (/\.(gguf|ggml)$/i.test(name)) throw Error('Pesi di modello inattesi nel runtime.');
        const data = await entry.async('nodebuffer'); total += data.length;
        if (total > 512 * 1024 * 1024) throw Error('Runtime espanso oltre il limite.');
        const target = join(destination, name); await regularParents(root, target);
        if (existsSync(target) && (await lstat(target)).isSymbolicLink()) throw Error('Link nella cache del runtime.');
        await writeFile(target, data);
        files.push({ path: name, sha256: createHash('sha256').update(data).digest('hex') });
      }
      await writeFile(stamp, JSON.stringify({ archiveSha256: asset.sha256, files }, null, 2));
    }
    paths[asset.variante] = join(destination, 'llama-server.exe');
  }
  const { scegliMotoreLocale } = await import('../../harness-ui/desktop/runtime.mjs');
  const engine = scegliMotoreLocale({ percorsi: { localRuntime: paths }, env: {}, preferenza: cpuOnly ? 'cpu' : 'auto' });
  env.TALOS_LLAMA_SERVER_PATH = engine.percorso;
  if (engine.variante === 'vulkan') env.TALOS_LLAMA_SERVER_FALLBACK_PATH = paths.cpu;
  console.log('Motore locale: ' + engine.variante + '. Nessun modello e nessuna credenziale scaricati.');
  return { variant: engine.variante, path: engine.percorso };
}

export async function verifySource() {
  const file = join(root, 'SOURCE-MANIFEST.json');
  if (!existsSync(file)) throw Error('Il manifesto e incluso nello ZIP di consegna; non e presente in questo checkout.');
  const manifest = JSON.parse(await readFile(file, 'utf8')); const changed = [];
  for (const item of manifest.files) {
    safeRelative(item.path);
    if (!existsSync(join(root, item.path)) || await digest(join(root, item.path)) !== item.sha256) changed.push(item.path);
  }
  console.log(JSON.stringify({ sourceCommit: manifest.sourceCommit, verifiedFiles: manifest.files.length - changed.length, changed }, null, 2));
  if (changed.length) throw Error('I sorgenti differiscono dall\'archivio verificato. Le modifiche locali non vengono sovrascritte.');
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (options.verify) { await verifySource(); return; }
  if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Il lanciatore one-click e qualificato per Windows x64.');
  if (process.versions.node !== NODE_VERSION) throw Error('Avviare AVVIA-TALOS.cmd per usare il runtime Node verificato.');
  await mkdir(cache, { recursive: true });
  if ((await lstat(cache)).isSymbolicLink()) throw Error('Cache collegata non ammessa.');
  const lock = join(cache, 'preparation.lock');
  try { await mkdir(lock); } catch (error) {
    if (error.code === 'EEXIST') throw Error('Preparazione gia in corso. Se una precedente esecuzione e stata interrotta, verificare che non sia attiva e rimuovere soltanto .talos-runtime/preparation.lock.');
    throw error;
  }
  await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  const env = cleanEnvironment(process.env, options);
  let executable; let runtime;
  try {
    await installDependencies(env);
    await restoreAssets();
    await buildFrontend(env);
    const requireDesktop = createRequire(join(root, 'harness-ui/desktop/package.json'));
    executable = requireDesktop('electron');
    await run(executable, [join(root, 'harness-ui/desktop/scripts/verifica-nativi.mjs'), join(root, 'harness-ui'), join(root, 'context-engine')], { env: { ...env, ELECTRON_RUN_AS_NODE: '1' } });
    runtime = await prepareLocalRuntime(env, options.cpu);
    await writeFile(join(cache, 'prepared.json'), JSON.stringify({ completedAt: new Date().toISOString(), node: process.version, electron: requireDesktop('electron/package.json').version, runtime, appJsSha256: await digest(join(root, 'harness-ui/public/app.js')), profile: 'preview' }, null, 2));
  } finally {
    // This lock belongs only to this completed preparation; no application data is removed.
    await rm(lock, { recursive: true, force: true });
  }
  if (options.prepareOnly) { console.log('Preparazione completata. Nessuna operazione dell\'agente eseguita.'); return; }
  console.log('Avvio di TALOS Preview reale. Profilo e portachiavi separati da TALOS Desktop.');
  console.log('Per chiudere anche il servizio locale, usare Esci dal menu dell\'applicazione.');
  await run(executable, [join(root, 'harness-ui/desktop')], { env });
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error('\nTALOS non avviato: ' + error.message); process.exitCode = 1; });
}
