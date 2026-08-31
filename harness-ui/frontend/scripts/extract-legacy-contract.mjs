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

  const hostGlobals = sortedUnique(captureAll(app, /window\.(__talosHarness[A-Za-z0-9_]+)/g));
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
