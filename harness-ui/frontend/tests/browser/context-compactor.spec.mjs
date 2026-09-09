import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { createSqliteContextStore } from '../../../../context-engine/src/node/sqlite-store.mjs';

const harness = fileURLToPath(new URL('../../../', import.meta.url));
const sessionId = 'context-desktop-proof';
const model = 'fixture/no-inference';
let directory, child, base, token;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tcec-ui-'));
  const workspace = join(directory, 'workspace'); await mkdir(workspace);
  const socket = createServer(); await new Promise(done => socket.listen(0, '127.0.0.1', done));
  const port = socket.address().port; await new Promise(done => socket.close(done));
  base = `http://127.0.0.1:${port}`; token = randomBytes(24).toString('hex');
  const messages = [{ role: 'user', content: 'Quale database avevamo scelto?' }, { role: 'assistant', content: 'Avevamo scelto SQLite, solo locale.' }];
  await writeFile(join(directory, `${sessionId}.jsonl`), [
    { tipo: 'intestazione', sessionId, taskId: 'fixture', nome: 'Decisione sul database', cartella: workspace, task: { consegna: messages[0].content }, modello: model, avviataAlle: '2026-09-09T00:00:00.000Z' },
    { tipo: 'messaggi-finali', versioneGiro: 1, messaggiFinali: messages },
    { type: 'RunStarted', _sequenza: 1, input: { consegna: messages[0].content } },
    { type: 'TextMessageContent', _sequenza: 2, messageId: 'answer', delta: messages[1].content },
    { type: 'TextMessageEnd', _sequenza: 3, messageId: 'answer' },
    { type: 'StateDelta', _sequenza: 4, delta: [{ path: '/usage', value: { prompt_tokens: 100, completion_tokens: 20, cached_tokens: 40, giri: 1 } }] },
    { type: 'RunFinished', _sequenza: 5 },
  ].map(JSON.stringify).join('\n') + '\n');
  await writeFile(join(directory, 'context-disabled-proof.jsonl'), (await readFile(join(directory, `${sessionId}.jsonl`), 'utf8')).replaceAll(sessionId, 'context-disabled-proof'));
  child = spawn(process.execPath, ['server.mjs'], { cwd: harness, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, TALOS_HARNESS_UI_PORT: String(port), TALOS_HARNESS_UI_TOKEN: token,
    TALOS_HARNESS_UI_SESSIONS_DIR: directory, TALOS_HARNESS_UI_PROJECT_DIRS: workspace,
    TALOS_HARNESS_UI_PUBLIC_DIR: resolve(harness, 'frontend/dist'),
    TALOS_CONTEXT_TRIAL: JSON.stringify({ sessionIds: [sessionId], models: [{ provider: 'openrouter', model, windowTokens: 16384, responseReserve: 2048 }] }),
  } });
  child.stdout.resume(); child.stderr.resume();
  await expect.poll(async () => { try { return (await fetch(`${base}/api/v1/health`, { headers: { Cookie: `talos_token=${token}` }, signal: AbortSignal.timeout(300) })).status; } catch { return 0; } }, { timeout: 20000 }).toBe(200);
});
test.afterAll(async () => {
  if (child && child.exitCode === null && child.signalCode === null) { const ended = new Promise(done => child.once('exit', done)); child.kill(); await ended; }
  if (directory && resolve(directory).startsWith(resolve(tmpdir()) + '\\') && directory.includes('tcec-ui-')) await rm(directory, { recursive: true, force: true });
});

test('CTX-UI-DESKTOP-ROUNDTRIP pulsante, SQLite e replay della chat vera', async ({ page, context }) => {
  await context.addCookies([{ name: 'talos_token', value: token, url: base, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const inference = [];
  // Il percorso vietato e intercettato: la mutazione RED non deve fare inferenza.
  await page.route('**/api/v1/sessions/*/compact', route => route.fulfill({ json: { ok: true, compattato: false } }));
  page.on('request', request => { if (/\/compact$|\/context\/jobs$/.test(request.url()) && request.method() === 'POST') inference.push(request.url()); });
  await page.goto(base);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(({ sessionId, model }) => window.__talosHarnessUiRuntime.passaASessione(sessionId, 'fixture', 'Decisione sul database', model, { conclusa: true, modello: model }), { sessionId, model });
  await page.locator('#compactSessionBtn').click();
  await expect(page.locator('#veloContesto')).toBeVisible();
  await expect(page.locator('#compactSessionBtn')).toHaveAccessibleName('Context Manager');
  await expect(page.locator('[data-context-title]')).toHaveText('Context Manager');
  await expect(page.locator('[data-context-auto]')).toBeChecked();
  await expect(page.locator('[data-context-start]')).toBeEnabled();
  expect(inference, 'aprire la modale non avvia inferenze').toEqual([]);
  const noOp = page.waitForResponse(response => response.url().endsWith('/context/jobs') && response.request().method() === 'POST');
  await page.locator('[data-context-start]').click();
  expect(await (await noOp).json()).toMatchObject({ error: { code: 'CTX_NOTHING_TO_COMPACT' } });
  await expect(page.locator('[data-context-status]')).toHaveAttribute('role', 'status');
  await expect(page.locator('[data-context-status]')).toContainText('ultimo scambio');
  const photos = resolve(harness, 'frontend/artifacts/context-compactor');
  await mkdir(photos, { recursive: true });
  for (const [width, height] of [[1920, 1080], [2560, 1440], [3840, 2160]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: join(photos, `desktop-small-${width}x${height}.png`) });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByText('Da non dimenticare', { exact: true }).click();
  await page.locator('[data-context-fact-text]').fill('Il database deve restare locale.');
  await page.getByRole('button', { name: 'Salva fatto', exact: true }).click();
  await expect(page.locator('[data-context-facts]')).toContainText('Il database deve restare locale.');
  const store = createSqliteContextStore({ databasePath: join(directory, 'context/context.sqlite') });
  try {
    const snapshot = await store.readContextSnapshot({ sessionId });
    expect(snapshot.jobs).toEqual([]);
    expect(snapshot.activeVersion).toBeNull();
    expect(snapshot.facts[0].text).toBe('Il database deve restare locale.');
    const records = await store.readOriginals({ sessionId });
    const createdAt = '2026-09-09T08:00:00.000Z';
    const job = { schema: 'talos.context.job.v1', id: 'ui-fixture-job', sessionId, idempotencyKey: 'ui-fixture-job', requestFingerprint: 'fixture', kind: 'compact', state: 'ready', baseRevision: snapshot.revision, baseStateRevision: snapshot.stateRevision, coveredThrough: 2, model: { provider: 'openrouter', model }, createdAt, updatedAt: createdAt, completedSegments: [], progress: { completed: 1, total: 1, phase: 'ready' } };
    const activeJob = { ...job, state: 'summarizing', progress: { completed: 1, total: 3, phase: 'summarizing' } };
    await store.claimContextJob({ sessionId, job: activeJob });
    await page.getByRole('button', { name: 'Aggiorna', exact: true }).click();
    await expect(page.locator('[data-context-progress]')).toContainText('1 di 3');
    await page.keyboard.press('Escape');
    const chatProgress = page.locator('#conversation [data-context-chat-progress]');
    await expect(chatProgress).toBeVisible();
    await expect(chatProgress.locator('progress')).toHaveAttribute('max', '3');
    await store.saveJobProgress({ sessionId, job: { ...activeJob, progress: { ...activeJob.progress, completed: 2 } } });
    await expect(chatProgress.locator('progress')).toHaveAttribute('value', '2');
    await page.reload(); await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.evaluate(({ sessionId, model }) => window.__talosHarnessUiRuntime.passaASessione(sessionId, 'fixture', 'Decisione sul database', model, { conclusa: true, modello: model }), { sessionId, model });
    await expect(page.locator('#veloContesto')).toBeHidden();
    await expect(chatProgress.locator('progress')).toHaveAttribute('value', '2');
    for (const [width, height] of [[1920, 1080], [2560, 1440], [3840, 2160]]) {
      await page.setViewportSize({ width, height });
      const bounds = await chatProgress.boundingBox();
      expect(bounds.width).toBeGreaterThan(200); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: join(photos, `desktop-progress-${width}x${height}.png`) });
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await store.saveJobProgress({ sessionId, job: { ...job, progress: { completed: 3, total: 3, phase: 'ready' } } });
    const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const version = { schema: 'talos.context.version.v1', id: 'ui-fixture-version', sessionId, coveredThrough: 2, sourceIds: records.map(r => r.id), sourceHash: hash(records.map(({ id, sha256 }) => ({ id, sha256 }))), summary: { schema: 'talos.context.summary.v1', text: 'SQLite locale.', goal: 'Riprendere', decisions: ['SQLite locale'], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: records[1].id, quote: 'SQLite' }] }, activeMessages: [{ role: 'user', content: 'SQLite locale.' }], model: job.model, measurement: { schema: 'talos.context.tokens.v1', inputTokens: 10, windowTokens: 16384, responseReserve: 2048, method: 'heuristic', exact: false, requestHash: hash('fixture'), provider: 'openrouter', model }, createdAt };
    await store.recordUsage({ sessionId, jobId: job.id, operationId: 'ui-usage-fixture', usage: { prompt_tokens: 1800, completion_tokens: 80 } });
    await store.recordUsage({ sessionId, jobId: job.id, operationId: 'ui-usage-fixture', usage: { prompt_tokens: 1800, completion_tokens: 80 } });
    await store.commitContextVersion({ sessionId, expectedRevision: snapshot.revision, expectedStateRevision: snapshot.stateRevision, jobId: job.id, version });
  } finally { await store.close(); }
  await expect(page.locator('#conversation [data-context-chat-progress]')).toHaveCount(0);
  await expect(page.locator('#conversation [data-context-separator]')).toHaveCount(1);
  await expect(page.locator('[data-runtime-usage]'), 'CTX-UI-USAGE-CLOSED-RELOAD').toContainText('2,0k');
  await expect(page.locator('[data-runtime-cache]')).toContainText('cache 40%');
  for (const [width, height] of [[1920, 1080], [2560, 1440], [3840, 2160]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: join(photos, `desktop-usage-${width}x${height}.png`) });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.locator('#conversation').getByRole('button', { name: 'Vedi contesto' }).click();
  await page.getByText('Fonti', { exact: true }).click();
  await page.getByRole('button', { name: 'Apri fonte', exact: true }).click();
  await expect(page.locator('[data-context-source-text]')).toContainText('Avevamo scelto SQLite, solo locale.');
  await page.keyboard.press('Escape');
  await page.reload(); await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(({ sessionId, model }) => window.__talosHarnessUiRuntime.passaASessione(sessionId, 'fixture', 'Decisione sul database', model, { conclusa: true, modello: model }), { sessionId, model });
  await expect(page.locator('#conversation [data-context-separator]')).toHaveCount(1);
  await expect(page.locator('[data-runtime-usage]')).toContainText('2,0k');
  await expect(page.locator('[data-runtime-cache]')).toContainText('cache 40%');
  await page.locator('#compactSessionBtn').click();
  await page.getByText('Da non dimenticare', { exact: true }).click();
  await expect(page.locator('[data-context-facts]')).toContainText('Il database deve restare locale.');
  expect(inference).toEqual([`${base}/api/v1/sessions/${sessionId}/context/jobs`]);
});

test('CTX-UI-DISABLED-OPEN opens Context Manager without a legacy compaction or inference', async ({ page, context }) => {
  await context.addCookies([{ name: 'talos_token', value: token, url: base, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const mutations = [];
  page.on('request', request => { if (/\/compact$|\/context\//.test(request.url()) && request.method() !== 'GET') mutations.push(request.url()); });
  await page.goto(base); await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(model => window.__talosHarnessUiRuntime.passaASessione('context-disabled-proof', 'fixture', 'Contesto non ancora attivo', model, { conclusa: true, modello: model }), model);
  await page.locator('#compactSessionBtn').click();
  await expect(page.locator('#veloContesto')).toBeVisible();
  await expect(page.locator('[data-context-status]')).toContainText('non è ancora attivo');
  await expect(page.locator('[data-context-start]')).toBeDisabled();
  await expect(page.locator('[data-context-auto]')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#compactSessionBtn')).toBeFocused();
  expect(mutations).toEqual([]);
});
