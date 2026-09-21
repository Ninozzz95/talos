import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(process.env.TALOS_HARNESS_UI_SOURCE_DIR || join(ROOT, 'public'));
const OUTPUT = resolve(process.env.TALOS_HARNESS_UI_DIST_DIR || join(ROOT, 'dist'));
const MANIFEST = 'manifest.json';

async function filesIn(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(root, absolute));
    else files.push(relative(root, absolute).split('\\').join('/'));
  }
  return files.sort();
}

export async function buildUi({ sourceDir = SOURCE, outputDir = OUTPUT } = {}) {
  const source = resolve(sourceDir); const output = resolve(outputDir);
  const files = await filesIn(source);
  if (!files.includes('index.html') || !files.includes('app.js') || !files.includes('styles.css')) throw new Error('UI source is missing one of index.html, app.js or styles.css');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(source, output, { recursive: true });
  const entries = [];
  for (const file of files) {
    const bytes = await readFile(join(source, ...file.split('/')));
    entries.push({ path: file, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const manifest = Object.freeze({ schema: 'talos.harness-ui.manifest.v1', source: 'harness-ui/public', files: entries });
  await writeFile(join(output, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildUi().then((manifest) => console.log(`UI build pronta: ${manifest.files.length} asset verificati`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
