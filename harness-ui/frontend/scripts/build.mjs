import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

import { copyVendoredAssets } from './copy-vendored-assets.mjs';

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(FRONTEND_ROOT, 'dist');

function assertSafeOutput(outputDir) {
  const output = path.resolve(outputDir);
  const frontendRelative = path.relative(FRONTEND_ROOT, output);
  const inFrontendOutput = frontendRelative === 'dist' || frontendRelative === 'dist-lab';
  const inTestTemp = path.dirname(output) === path.resolve(tmpdir()) && path.basename(output).startsWith('talos-phase1-');
  if (!inFrontendOutput && !inTestTemp) throw new Error(`Directory build non consentita: ${output}`);
  return output;
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute));
    else files.push(path.relative(root, absolute).replaceAll('\\', '/'));
  }
  return files.sort();
}

async function writeBuildManifest(outputDir, metafile, mode) {
  const paths = (await listFiles(outputDir)).filter((name) => name !== 'build-manifest.json');
  const files = [];
  for (const relativePath of paths) {
    const bytes = await readFile(path.join(outputDir, ...relativePath.split('/')));
    files.push({ path: relativePath, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const manifest = { schema: 'talos.desktop.frontend-build.v1', mode, entries: { script: 'app.js', style: 'styles.css' }, files };
  await writeFile(path.join(outputDir, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifest, metafile };
}

export async function buildFrontend({
  entryPoint,
  htmlTemplate,
  outputDir,
  mode = 'production',
} = {}) {
  const output = assertSafeOutput(outputDir);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const result = await esbuild.build({
    absWorkingDir: FRONTEND_ROOT,
    entryPoints: { app: entryPoint, styles: 'src/styles/index.css' },
    outdir: output,
    entryNames: '[name]',
    assetNames: 'assets/[name]-[hash]',
    bundle: true,
    format: 'esm',
    // I frammenti HTML del monolite (src/legacy/frammenti.html) entrano nel bundle come testo.
    loader: { '.html': 'text' },
    platform: 'browser',
    target: ['chrome120'],
    charset: 'utf8',
    legalComments: 'none',
    external: ['./fonts/*'],
    metafile: true,
    sourcemap: false,
    minify: false,
    logLevel: 'silent',
  });
  await writeFile(path.join(output, 'index.html'), await readFile(path.join(FRONTEND_ROOT, htmlTemplate), 'utf8'), 'utf8');
  await copyVendoredAssets({ frontendRoot: FRONTEND_ROOT, outputDir: output });
  return writeBuildManifest(output, result.metafile, mode);
}

export function buildProduction({ outputDir = DEFAULT_OUTPUT } = {}) {
  return buildFrontend({ entryPoint: 'src/main.js', htmlTemplate: 'index.template.html', outputDir, mode: 'production-strangler' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildProduction().then(({ manifest }) => console.log(`Build modulare pronta: ${manifest.files.length} asset verificati, nessun cutover`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
