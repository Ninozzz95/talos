import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

import { copyVendoredAssets } from './copy-vendored-assets.mjs';

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/*
 * ⛔ ATLAS F3 (27/09/2026): `@napi-rs/canvas` è la tela NATIVA per Node che pdfjs-dist 6 porta come dipendenza facoltativa.
 *   `emf-converter` (dentro pptx-viewer-core, rese Office di F5) la chiede con un `import()` protetto da «solo in Node»
 *   (`dist/index.js:5042-5053`): finché il pacchetto non c'era esbuild lasciava correre, da quando pdf.js lo installa
 *   esbuild lo trova e prova a impacchettare `fs`, `os` e un `.node` — build rossa. Esterno: l'import resta com'è e nel
 *   browser non parte mai.
 */
const ESTERNI_SOLO_NODE = Object.freeze(['@napi-rs/canvas']);
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
    /* ⛔ `avvio` è un entry a parte e non un pezzo di `app`: deve arrivare PRIMA del primo
       disegno, mentre `app.js` è il bundle grosso che arriva dopo — è esattamente il lampo
       che il velo esiste per coprire. E non può stare inline: `ui-untrusted-content` vieta
       gli script con contenuto in `public/index.html`. */
    /* F5 File reader (26/09/2026): le rese Office sono entry A PARTE, a nome fisso, caricate solo quando si apre un
       documento — il foglio da `app.js` per indirizzo (`import('/lettore-foglio.js')`), Word e PowerPoint dalla pagina
       ospite: docx-preview, SheetJS e pptx-viewer-core pesano megabyte che ogni avvio dovrebbe altrimenti analizzare (senza
       `splitting` esbuild mette gli `import()` dinamici DENTRO il bundle). Le serve `static-files.mjs`, il manifesto le
       elenca da solo. */
    entryPoints: { app: entryPoint, styles: 'src/styles/main.css', avvio: 'src/avvio.js' },
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
    external: ['./fonts/*', '/talos/*', ...ESTERNI_SOLO_NODE], // 12/09: il marchio corto (/talos/brand/logo-short.svg) lo serve static-files.mjs, esbuild non deve risolverlo
    metafile: true,
    sourcemap: false,
    minify: false,
    logLevel: 'silent',
  });
  /* ⛔ Le rese Office si MINIFICANO, e in una build a parte: `lettore-presentazione.js` non minificato pesa 6,7 MB e il
     server statico ne serve al massimo 4 MiB (`MAX_STATIC_BYTES`, `static-files.mjs`) — misurato il 26/09 dalla prova
     browser: «Failed to fetch dynamically imported module», cioè una presentazione che non si apre. Minificato è 3,1 MB
     (pptx-viewer-core da solo sono 5,7 MB di sorgente). `app.js` resta leggibile com'è sempre stato. La prova
     `tests/contract/build-output.test.mjs` controlla che ogni asset servito stia sotto il tetto. */
  const renderOffice = { absWorkingDir: FRONTEND_ROOT, outdir: output, entryNames: '[name]', bundle: true, platform: 'browser', target: ['chrome120'], charset: 'utf8', legalComments: 'none', sourcemap: false, minify: true, logLevel: 'silent', external: [...ESTERNI_SOLO_NODE] };
  // il foglio di calcolo resta un modulo della pagina (una tabella nostra: nessuno stile in linea)
  await esbuild.build({ ...renderOffice, entryPoints: { 'lettore-foglio': 'src/components/lettore/office/foglio.js' }, format: 'esm' });
  /* ⛔ Word e PowerPoint si rendono DENTRO la pagina ospite (26/09 pomeriggio, owner «ora, prima di F6»): i loro bundle li
     carica QUELLA pagina, a origine nulla, come script CLASSICI col suo nonce — un modulo da un'origine nulla chiederebbe
     CORS. Da qui `iife`: il bundle si registra su `globalThis.TalosResaOspite`. */
  await esbuild.build({
    ...renderOffice,
    entryPoints: {
      'lettore-ospite-documento': 'src/components/lettore/office/ospite-documento.js',
      'lettore-ospite-presentazione': 'src/components/lettore/office/ospite-presentazione.js',
    },
    format: 'iife',
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
