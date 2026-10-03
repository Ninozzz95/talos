import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const id = 'retry06-ui';
const runId = 'retry06-run';
const started = { type: 'RunStarted', threadId: 'thread06', runId, input: { consegna: 'Controlla il progetto senza modificarlo.' } };
const boundary = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const retry = (fase, extra = {}) => ({ type: 'CUSTOM', name: 'talos.provider-retry', value: {
  schema: 'talos.provider-retry.v1', runId, threadId: 'thread06', requestId: 'request06',
  fase, tentativo: 2, tentativiMassimi: 4, modello: 'test/model', httpStatus: 503,
  attesaMs: fase === 'attesa' ? 60_000 : 0, retryAt: fase === 'attesa' ? Date.now() + 60_000 : null, ...extra,
} });

async function apri(page, session = id, conclusa = false) {
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached' });
  await page.evaluate(({ session, conclusa }) => window.__talosHarnessUiRuntime.passaASessione(session, 'workspace', 'Verifica temporaneamente in attesa', 'test/model', { conclusa, modello: 'test/model' }), { session, conclusa });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  /* 03/10/2026: finita la rigiocata, la chat resta nascosta (`#conversation.is-restoring`, visibility:hidden) finché il custode
     del ripristino non la scopre, al suo giro successivo (ogni 200 ms, `app.js` «fermaSeFinito»). `locator.focus()` non aspetta
     la visibilità (Playwright, actionability: focus non ha controlli), quindi il focus su un elemento ancora nascosto cadeva
     sul body: RETRY06 HTTP402 rosso 3 volte su 6 già alla corsia C. Si aspetta la chat che la persona vede. */
  await page.waitForFunction(() => !document.getElementById('conversation')?.classList.contains('is-restoring'));
}

for (const httpStatus of [503, 402]) for (const theme of ['dark', 'light']) test(`RETRY06-LIVE HTTP${httpStatus} ${theme}: attesa, reload, invio, Stop e cambio sessione`, async ({ page }) => {
  test.setTimeout(45_000);
  const sockets = new Set();
  let sequence = 1;
  let history = [{ ...started, _sequenza: sequence }];
  const liveRetry = (fase, extra = {}) => retry(fase, { httpStatus,
    ...(httpStatus === 402 ? { motivo: 'budget-occupato' } : {}), ...extra });
  const send = e => {
    const event = { ...e, _sequenza: ++sequence };
    history.push(event);
    for (const res of sockets) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    sockets.add(res);
    req.on('close', () => sockets.delete(res));
    const selected = new URL(req.url, 'http://localhost').searchParams.get('session');
    res.write('retry: 3600000\n');
    for (const e of selected === id ? history : []) res.write(`data: ${JSON.stringify(e)}\n\n`);
    res.write(`data: ${JSON.stringify(boundary)}\n\n`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const mutations = [], errors = [];
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    await page.addInitScript(mode => {
      if (window === window.top) localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: mode, uiLanguage: 'it', interfaceMotion: false } }));
    }, theme);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/v1/**', route => {
      const r = route.request(), path = new URL(r.url()).pathname;
      const match = path.match(/^\/api\/v1\/sessions\/([^/]+)\/events$/u);
      if (match) return route.continue({ url: `http://127.0.0.1:${server.address().port}/events?session=${match[1]}` });
      if (r.method() !== 'GET' && path.startsWith('/api/v1/sessions/')) {
        mutations.push(`${r.method()} ${path}`);
        if (path === `/api/v1/sessions/${id}/stop`) {
          send({ type: 'RunError', code: 'fermato', message: 'Fermato su richiesta.' });
          return route.fulfill({ json: { ok: true, data: { fermata: true } } });
        }
        return route.abort();
      }
      if (path.endsWith('/children')) return route.fulfill({ json: { ok: true, data: { figli: [] } } });
      return route.continue();
    });
    await page.goto('/'); await apri(page);
    send(liveRetry('attesa'));
    const note = page.locator('[data-provider-retry]');
    await expect(note).toHaveCount(1);
    await expect(note).toContainText('Tentativo 2 di 4');
    await expect(note).toContainText(`HTTP ${httpStatus}`);
    if (httpStatus === 402) await expect(note).toContainText('budget è temporaneamente occupato');
    await expect(note.getByRole('timer')).toHaveAttribute('aria-live', 'off');
    await expect(note.getByRole('status')).toContainText('Nuovo tentativo programmato');
    const deadline = history.at(-1).value.retryAt;
    await page.reload(); await apri(page);
    await expect(note).toHaveCount(1);
    expect(history.at(-1).value.retryAt).toBe(deadline);
    await expect(note.getByRole('timer')).toContainText(/Tra \d+ s/u);
    const evidence = resolve(process.cwd(), '..', '..', 'artifacts', 'retry06-ui');
    mkdirSync(evidence, { recursive: true });
    for (const [width, height] of [[1920, 1080], [2560, 1440], [1024, 800], [1440, 900], [600, 900]]) {
      await page.setViewportSize({ width, height });
      await note.scrollIntoViewIfNeeded();
      const box = await note.evaluate(e => ({ width: e.clientWidth, scroll: e.scrollWidth, rect: e.getBoundingClientRect().toJSON(), parent: e.parentElement.getBoundingClientRect().toJSON() }));
      expect(box.scroll).toBeLessThanOrEqual(box.width + 1);
      expect(box.rect.right).toBeLessThanOrEqual(box.parent.right + 1);
      expect(box.rect.width).toBeGreaterThan(180);
      if (width >= 1920 && height >= 1080) await page.screenshot({ path: join(evidence, `retry-http${httpStatus}-${width}x${height}-${theme}.png`), animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    // La connessione è davvero chiusa: una vecchia scadenza non resta viva senza server.
    for (const res of sockets) res.end();
    await expect(note).toHaveCount(0);
    await page.reload(); await apri(page);
    await expect(note).toHaveCount(1);
    send(liveRetry('attesa', { retryAt: Date.now() - 1 }));
    await expect(note.getByRole('timer')).toHaveText('In attesa di conferma del server');
    expect(mutations).toEqual([]);
    send(liveRetry('invio'));
    await expect(note.getByRole('timer')).toHaveText('Richiesta in corso');
    send(liveRetry('fine'));
    await expect(note).toHaveCount(0);
    send(liveRetry('attesa', { requestId: 'request-stop' }));
    await expect(note).toHaveCount(1);
    const stop = page.getByRole('button', { name: 'Interrompi risposta', exact: true });
    await expect(stop).toBeVisible();
    await stop.focus(); await stop.press('Enter');
    await expect(note).toHaveCount(0);
    expect(mutations).toEqual([`POST /api/v1/sessions/${id}/stop`]);
    // Storia interrotta senza evento terminale: il dato canonico del server prevale.
    history = [{ ...started, _sequenza: 1 }, { ...liveRetry('attesa'), _sequenza: 2 }]; sequence = 2;
    await apri(page, 'retry06-other', true);
    await expect(note).toHaveCount(0);
    await apri(page, id, true);
    await expect(note).toHaveCount(0);
    if (httpStatus === 402) {
      history = [{ ...started, _sequenza: 1 }, { type: 'RunError', code: 'PROVIDER_KEY_SPEND_LIMIT',
        message: 'Il limite di spesa della chiave è stato raggiunto.', _sequenza: 2 }];
      await page.reload(); await apri(page, id, true);
      const card = page.locator('[data-c="SystemNote"]').filter({ hasText: 'Il limite di spesa della chiave è stato raggiunto.' });
      await expect(card).toHaveCount(1);
      await expect(card.locator('.talos-badge--warning')).toHaveText('Limite del servizio');
      await expect(card).not.toContainText(/chiave.*non valida|non è ancora tradotta/u);
      await card.scrollIntoViewIfNeeded();
      const summary = card.locator('summary');
      await summary.focus(); await summary.press('Enter');
      await expect(card.locator('pre')).toContainText('PROVIDER_KEY_SPEND_LIMIT');
      const size = await card.evaluate(e => ({ width: e.clientWidth, scroll: e.scrollWidth, right: e.getBoundingClientRect().right }));
      expect(size.scroll).toBeLessThanOrEqual(size.width + 1); expect(size.right).toBeLessThanOrEqual(1920);
      await page.screenshot({ path: join(evidence, `credit-limit-1920x1080-${theme}.png`), animations: 'disabled' });
      await summary.press('Enter'); await expect(summary).toBeFocused();
    }
    expect(errors).toEqual([]);
  } finally {
    for (const res of sockets) res.end();
    server.closeAllConnections();
    await new Promise(resolveClose => server.close(resolveClose));
  }
});
