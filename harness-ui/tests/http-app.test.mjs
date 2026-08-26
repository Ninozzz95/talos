import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { readCampaignCosts } from '../src/cost-reader.mjs';
import { createCampaignService } from '../src/campaign-service.mjs';
import { API_SCHEMA, createHttpApp } from '../src/http-app.mjs';
import { createPathPolicy } from '../src/path-policy.mjs';
import { createReportSource } from '../src/report-source.mjs';
import { createStaticHandler } from '../src/static-files.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureBanco = join(testDir, 'fixtures', 'banco');
// ⭐ 26/8, DEC-053 — il bundle canonico è mobile/public/harness-ui/, non più
// harness-ui/public/ (mai riconciliata con l'integrazione mobile, non
// portata in questo worktree). Stessa relazione che config.mjs calcola.
const publicDir = join(testDir, '..', '..', 'mobile', 'public', 'harness-ui');
const projects = 'esiti-22ago-progetti';

function realApp() {
  const pathPolicy = createPathPolicy({
    bancoDir: fixtureBanco,
    campaigns: [projects, 'esiti-22ago-storia'],
  });
  pathPolicy.initialize();
  const campaignService = createCampaignService({
    pathPolicy,
    costReader: readCampaignCosts,
    reportSource: createReportSource(pathPolicy),
  });
  return createHttpApp({ campaignService, staticHandler: createStaticHandler(publicDir) });
}

async function listen(t, app = realApp()) {
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test('server binds to configured loopback only', () => {
  const source = readFileSync(join(testDir, '..', 'server.mjs'), 'utf8');
  assert.match(source, /listen\(config\.port, config\.host/);
  assert.doesNotMatch(source, /listen\([^\n]*0\.0\.0\.0/);
});

test('api serves the exact five GET resources and HEAD', async (t) => {
  const { base } = await listen(t);
  const routes = [
    '/api/v1/health',
    '/api/v1/campaigns',
    `/api/v1/campaigns/${projects}/snapshot`,
    `/api/v1/campaigns/${projects}/runs?limit=1`,
    `/api/v1/campaigns/${projects}/report`,
  ];
  for (const route of routes) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.meta.schema, API_SCHEMA);
    const head = await fetch(base + route, { method: 'HEAD' });
    assert.equal(head.status, 200, `HEAD ${route}`);
    assert.equal(await head.text(), '');
  }
  assert.equal((await fetch(`${base}/api/v1/nope`)).status, 404);
});

test('api rejects POST PUT PATCH DELETE and OPTIONS with 405 and no CORS', async (t) => {
  const { base } = await listen(t);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await fetch(`${base}/api/v1/health`, { method });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.has('access-control-allow-origin'), false);
    assert.equal((await response.json()).error.code, 'METHOD_NOT_ALLOWED');
  }
});

test('static handler serves only the mapped assets (HTML/CSS/JS + real fonts + real logo) and has no directory listing', async (t) => {
  const { base } = await listen(t);
  const fontRoutes = [
    'instrument-sans-latin-ext-400-normal.woff2', 'instrument-sans-latin-400-normal.woff2',
    'instrument-sans-latin-ext-500-normal.woff2', 'instrument-sans-latin-500-normal.woff2',
    'instrument-sans-latin-ext-600-normal.woff2', 'instrument-sans-latin-600-normal.woff2',
    'jetbrains-mono-latin-ext-400-normal.woff2', 'jetbrains-mono-latin-400-normal.woff2',
    'jetbrains-mono-latin-ext-500-normal.woff2', 'jetbrains-mono-latin-500-normal.woff2',
  ].map((name) => `/fonts/${name}`);
  for (const route of ['/', '/index.html', '/styles.css', '/app.js', '/talos/brand/logo-short.svg', ...fontRoutes]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    if (route.endsWith('.woff2')) assert.equal(response.headers.get('content-type'), 'font/woff2', route);
    if (route.endsWith('.svg')) assert.equal(response.headers.get('content-type'), 'image/svg+xml', route);
  }
  const disallowed = [
    '/fonts/', '/fonts/../server.mjs', '/fonts/does-not-exist.woff2',
    '/talos/brand/', '/talos/brand/../../server.mjs', '/talos/brand/does-not-exist.svg',
    '/public/', '/mockup-originale/', '/PROVENANCE.md', '/../server.mjs', '/favicon.ico',
  ];
  for (const route of disallowed) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
});

test('static index accepts only the six canonical qa states and rejects every other query', async (t) => {
  const { base } = await listen(t);
  for (const state of ['desktop', 'laptop', 'tablet', 'mobile', 'mobile-narrow', 'capabilities']) {
    assert.equal((await fetch(`${base}/?qa=${state}`)).status, 200, state);
    assert.equal((await fetch(`${base}/index.html?qa=${state}`, { method: 'HEAD' })).status, 200, `HEAD ${state}`);
  }
  for (const query of ['qa=unknown', 'qa=desktop&extra=1', 'extra=desktop', 'qa=desktop&qa=laptop']) {
    assert.equal((await fetch(`${base}/?${query}`)).status, 400, query);
  }
  assert.equal((await fetch(`${base}/app.js?qa=desktop`)).status, 400);
});

test('response headers apply CSP, nosniff, frame denial and no-store to data', async (t) => {
  const { base } = await listen(t);
  const response = await fetch(`${base}/api/v1/health`);
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('errors never expose absolute paths, stack or row evidence', async (t) => {
  const campaignService = {
    async listCampaigns() {
      throw new Error('C:\\secret\\banco\\alpha.jsonl detto-segreto\n    at private-stack');
    },
  };
  const { base } = await listen(t, createHttpApp({
    campaignService,
    staticHandler: createStaticHandler(publicDir),
  }));
  const response = await fetch(`${base}/api/v1/campaigns`);
  const text = await response.text();
  assert.equal(response.status, 500);
  assert.doesNotMatch(text, /secret|banco|alpha\.jsonl|private-stack|detto/i);
  assert.equal(JSON.parse(text).error.code, 'INTERNAL_ERROR');
});

test('oversized query, cursor, JSONL or report returns a bounded error', async (t) => {
  const { base } = await listen(t);
  const oversized = await fetch(`${base}/api/v1/campaigns/${projects}/runs?harness=${'x'.repeat(5000)}`);
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, 'PAYLOAD_LIMIT');

  const campaignService = {
    async getSnapshot() { throw Object.assign(new Error('private'), { code: 'PAYLOAD_LIMIT' }); },
  };
  const bounded = await listen(t, createHttpApp({ campaignService, staticHandler: createStaticHandler(publicDir) }));
  const response = await fetch(`${bounded.base}/api/v1/campaigns/${projects}/snapshot`);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'PAYLOAD_LIMIT');
});

test('client abort closes work cleanly', async (t) => {
  let resolved = false;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const campaignService = {
    async listCampaigns() {
      markStarted();
      await new Promise((resolve) => setTimeout(resolve, 25));
      resolved = true;
      return [];
    },
  };
  const { base } = await listen(t, createHttpApp({ campaignService, staticHandler: createStaticHandler(publicDir) }));
  const controller = new AbortController();
  const request = fetch(`${base}/api/v1/campaigns`, { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(request, /abort/i);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(resolved, true);
});
