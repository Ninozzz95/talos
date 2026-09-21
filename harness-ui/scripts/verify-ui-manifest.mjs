import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyUiManifest({ distDir = resolve(fileURLToPath(new URL('../dist/', import.meta.url))) } = {}) {
  const manifest = JSON.parse(await readFile(join(distDir, 'manifest.json'), 'utf8'));
  if (manifest?.schema !== 'talos.harness-ui.manifest.v1' || !Array.isArray(manifest.files)) throw new Error('UI manifest shape is invalid');
  const seen = new Set();
  for (const entry of manifest.files) {
    const relativePath = typeof entry?.path === 'string' ? entry.path.replaceAll('\\', '/') : '';
    const absolutePath = resolve(distDir, ...relativePath.split('/'));
    const containment = relative(resolve(distDir), absolutePath);
    if (!entry || typeof entry.path !== 'string' || seen.has(entry.path) || entry.path !== relativePath || entry.path === 'manifest.json' || relativePath.includes('..') || containment === '..' || containment.startsWith(`..${'\\'}`) || isAbsolute(containment)) throw new Error('UI manifest contains an invalid path');
    seen.add(entry.path);
    const bytes = await readFile(absolutePath);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength !== entry.bytes || digest !== entry.sha256) throw new Error(`UI asset drift: ${entry.path}`);
  }
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyUiManifest().then((manifest) => console.log(`UI manifest verificato: ${manifest.files.length} asset`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
