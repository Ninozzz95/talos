import { creaEsecuzione, creaSnapshot, creaAmbienteIsolato } from '../../harness-ui/frontend/scripts/ripresa-run.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = creaEsecuzione('mutation-hf');
creaSnapshot(run);
const owner = fileURLToPath(new URL('../../harness-ui/frontend/src/legacy/app.js', import.meta.url));
const file = join(run.frontend, 'src/legacy/app.js');
const before = readFileSync(file);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const originalHash = hash(before);
const needle = '      apiPost: (percorso, corpo) => apiPost(percorso, corpo),';
const text = before.toString('utf8');
if (text.split(needle).length !== 2) throw new Error('Il punto di mutazione non è univoco');
const record = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function phase(name) {
  const output = join(run.output, name);
  mkdirSync(output);
  const env = { ...creaAmbienteIsolato(run), TALOS_RIPRESA_OUTPUT: output };
  record(join(output, 'configuration.json'), { ...env, Path: undefined, PATH: undefined });
  record(join(output, 'manifest.json'), { id: `${run.id}-${name}`, parent: run.id,
    snapshot: run.frontend, sourceSha256: hash(readFileSync(file)), started: new Date().toISOString() });
  const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: run.frontend, env, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  writeFileSync(join(output, 'build.log'), `${build.stdout || ''}${build.stderr || ''}`, { flag: 'wx' });
  if (build.status !== 0) throw new Error(`Build ${name}: ${build.status}, ${build.error?.message || ''}`);
  writeFileSync(join(output, 'build-manifest.json'), readFileSync(join(run.bundle, 'build-manifest.json')), { flag: 'wx' });
  const args = [join(run.frontend, 'node_modules/@playwright/test/cli.js'), 'test',
    '--config=playwright.ripresa.config.mjs', 'lab-pagina-modello.spec.mjs', '--grep', 'RIPRESA-HF-DOWNLOAD —'];
  const test = spawnSync(process.execPath, args, { cwd: run.frontend, env, windowsHide: true, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(join(output, 'browser.log'), `${test.stdout || ''}${test.stderr || ''}`, { flag: 'wx' });
  record(join(output, 'result.json'), { code: test.status, error: test.error?.message, args, finished: new Date().toISOString() });
  console.log(`${name}: ${test.status}; ${output}`);
  return { code: test.status, log: test.stdout || '' };
}
let green, red, restored;
try {
  green = phase('green');
  if (green.code !== 0) throw new Error('Baseline non verde: mutazione non eseguita');
  writeFileSync(file, text.replace(needle, '      // Mutazione deliberata: writer rimosso solo nello snapshot.'));
  red = phase('red');
  if (red.code !== 1 || !red.log.includes('element is not enabled')) throw new Error('Mutazione non rilevata per il motivo atteso');
} finally {
  writeFileSync(file, before);
  if (hash(readFileSync(file)) !== originalHash || hash(readFileSync(owner)) !== originalHash) throw new Error('Hash di ripristino o sorgente owner diverso');
}
restored = phase('restored');
record(join(run.output, 'mutation-result.json'), { green: green.code, red: red.code, restored: restored.code,
  sourceSha256: originalHash, restoredSha256: hash(readFileSync(file)), ownerSha256: hash(readFileSync(owner)) });
if (restored.code !== 0) throw new Error('Ripristino non verde');
