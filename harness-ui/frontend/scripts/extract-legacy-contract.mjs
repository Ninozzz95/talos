import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function lineCount(value) {
  return value.endsWith('\n') ? value.split('\n').length - 1 : value.split('\n').length;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function captureAll(source, expression, group = 1) {
  return [...source.matchAll(expression)].map((match) => match[group]).filter(Boolean);
}

/**
 * Extract the compatibility surface of the current desktop bundle.
 * The snapshot is intentionally descriptive rather than executable: later
 * frontend modules consume it only through tests, never at runtime.
 */
export async function extractLegacyContract({ appPath, htmlPath, cssPath, aguiPath, staticPath }) {
  const [app, html, css, agui, staticSource] = await Promise.all(
    [appPath, htmlPath, cssPath, aguiPath, staticPath].map((file) => readFile(file, 'utf8')),
  );

  const hostGlobals = sortedUnique(captureAll(app, /\b(?:window|windowObj)\.(__talosHarness[A-Za-z0-9_]+)/g));
  const storageKeys = sortedUnique([
    ...captureAll(app, /(?:const|let|var)\s+[A-Z0-9_]*STORAGE_KEY\s*=\s*['"]([^'"]+)['"]/g),
    ...captureAll(app, /DESKTOP_SETTINGS_KEY\s*=\s*['"]([^'"]+)['"]/g),
  ]);
  const eventTypes = sortedUnique(captureAll(agui, /type:\s*['"]([^'"]+)['"]/g));
  const publicAssets = sortedUnique(captureAll(staticSource, /^\s*['"]([^'"]+)['"]\s*:\s*\{/gm));
  // Keep route families, not interpolated implementation details. This makes
  // the contract stable when a parameter name changes while still detecting
  // that a public API family disappeared.
  const endpointFragments = sortedUnique(
    captureAll(app, /\/api\/v1\/[A-Za-z0-9_-]+/g, 0),
  );

  return {
    source: 'harness-ui/public',
    assets: {
      app: { lines: lineCount(app), bytes: Buffer.byteLength(app), sha256: digest(app) },
      html: { lines: lineCount(html), bytes: Buffer.byteLength(html), sha256: digest(html) },
      css: { lines: lineCount(css), bytes: Buffer.byteLength(css), sha256: digest(css) },
    },
    hostGlobals,
    storageKeys,
    eventTypes,
    publicAssets,
    endpointFragments,
    terminalFrames: { data: 0, control: 1 },
  };
}

/*
 * ⭐ 04/9, R-02 — eseguibile da riga di comando, come il ledger desktop già
 * prescriveva («rigenerare la fixture con node frontend/scripts/extract-legacy-contract.mjs»)
 * ma il file era solo una libreria: lanciato, non scriveva niente e non lo
 * diceva. Da qui: `node scripts/extract-legacy-contract.mjs --write` riscrive
 * `tests/fixtures/legacy-contract.snapshot.json`; senza `--write` stampa il
 * contratto e non tocca il disco.
 */
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const { writeFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '../../..');
  const fixturePath = path.join(here, '../tests/fixtures/legacy-contract.snapshot.json');
  const contract = await extractLegacyContract({
    appPath: path.join(repoRoot, 'harness-ui/public/app.js'),
    htmlPath: path.join(repoRoot, 'harness-ui/public/index.html'),
    cssPath: path.join(repoRoot, 'harness-ui/public/styles.css'),
    aguiPath: path.join(repoRoot, 'harness-ui/src/agui-events.mjs'),
    staticPath: path.join(repoRoot, 'harness-ui/src/static-files.mjs'),
  });
  const json = `${JSON.stringify(contract, null, 2)}\n`;
  if (process.argv.includes('--write')) {
    await writeFile(fixturePath, json);
    console.log(`fixture riscritta: ${fixturePath} (app ${contract.assets.app.lines} righe, css ${contract.assets.css.lines}, html ${contract.assets.html.lines})`);
  } else {
    process.stdout.write(json);
  }
}
