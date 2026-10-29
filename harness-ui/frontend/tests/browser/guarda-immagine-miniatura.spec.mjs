import { test, expect } from '@playwright/test';

/*
 * view_image (contratto 27/10/2026, punto 8): l'immagine che il modello ha guardato compare come miniatura nel corpo della sua riga
 * d'attività, e si apre grande al clic; se non arriva, il riquadro lo dice. La conversazione è data alla finestra come eventi; ogni
 * richiesta non-GET è fermata (nessuna scrittura sul server).
 */
const ID = 'a'.repeat(64);
const ID_PERSO = 'b'.repeat(64);
// PNG 1×1 vero (trasparente)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function apri(page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'en' } })));
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', (r) => {
    const req = r.request();
    if (req.method() !== 'GET') return r.abort();
    const percorso = new URL(req.url()).pathname;
    if (/\/sessions\/vi-[a-z0-9-]+\/events$/.test(percorso)) return undefined;
    if (percorso === `/api/v1/chat-images/${ID}`) return r.fulfill({ contentType: 'image/png', body: PNG });
    if (percorso === `/api/v1/chat-images/${ID_PERSO}`) return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
    return r.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
}
async function guardata(page, id, sessione) {
  await page.evaluate(({ id, sessione }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(sessione, 'workspace', 'View image', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash', permessi: 'Full access' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g);
    for (const e of [
      { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Look at the screenshot' }, _sequenza: 1 },
      { type: 'ToolCallStart', toolCallId: 'v1', toolCallName: 'view_image', parentMessageId: 'm1', _sequenza: 2 },
      { type: 'ToolCallArgs', toolCallId: 'v1', delta: JSON.stringify({ path: 'shots/screen.png' }), _sequenza: 3 },
      { type: 'ToolCallResult', toolCallId: 'v1', role: 'tool', content: 'Image "shots/screen.png" (640×480) is attached below.',
        images: [{ id, mimeType: 'image/png', width: 640, height: 480 }], _sequenza: 4 },
    ]) r.handleRealEvent(e, g);
  }, { id, sessione });
}

test('VI-MINIATURA-01 the viewed image is a thumbnail in its row, with its real size, and opens large on click', async ({ page }) => {
  await apri(page);
  await guardata(page, ID, 'vi-ok');
  const riquadro = page.locator('.talos-tool-row__immagine').first();
  await expect(riquadro).toHaveCount(1);
  const img = riquadro.locator('img');
  await expect(img).toHaveAttribute('src', `/api/v1/chat-images/${ID}`);
  await expect(img).toHaveAttribute('width', '640');
  await expect(img).toHaveAttribute('height', '480');
  await expect(img).toHaveAttribute('alt', 'screen.png');
  await riquadro.evaluate((b) => b.click());
  await expect(page.locator('dialog.talos-image-viewer')).toBeVisible();
});

/*
 * Revisione del blocco 12 (VI-MINIATURA-02 era rossa e mai corsa): il riquadro sta dentro `<pre class="talos-tool-row__body">`, nascosto
 *   con `display:none` finché la riga è chiusa, e `loading="lazy"` non scarica un'immagine con riquadro 0×0. Togliere `hidden` a mano
 *   non apriva niente. Ora la riga si apre come la apre la persona, con un clic (`aria-expanded`), nei due temi — forma del revisore
 *   (VI-REV-MINIATURA-02). Nella stessa pagina anche la buona: riquadro disegnato con le misure vere.
 */
for (const modo of ['dark', 'light']) {
  test(`VI-MINIATURA-02 (reverse, ${modo}) opened by a click on the row, an image that does not load says so; a good one is drawn`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: modo });
    await page.addInitScript((m) => localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'en', colorMode: m } })), modo);
    await apri(page);
    await guardata(page, ID_PERSO, 'vi-perso');
    await page.locator('.tool-note-summary-text').first().click();
    const riga = page.locator('.talos-tool-row').first();
    if ((await riga.getAttribute('aria-expanded')) !== 'true') await riga.click();
    await expect(riga).toHaveAttribute('aria-expanded', 'true');
    const riquadro = page.locator('.talos-tool-row__immagine').first();
    await expect(riquadro).toHaveClass(/talos-image-card--rotta/u, { timeout: 5_000 });
    await expect(riquadro).toBeDisabled();
    await expect(riquadro.locator('.talos-image-card__caption')).toHaveText('Couldn’t load screen.png');
    await guardata(page, ID, 'vi-ok2');
    await page.locator('.tool-note-summary-text').first().click();
    const riga2 = page.locator('.talos-tool-row').first();
    if ((await riga2.getAttribute('aria-expanded')) !== 'true') await riga2.click();
    const img = page.locator('.talos-tool-row__immagine img').first();
    await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0), { timeout: 5_000 }).toBe(true);
  });
}

test('VI-MINIATURA-03 (reverse) a result without images draws no thumbnail', async ({ page }) => {
  await apri(page);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('vi-niente', 'workspace', 'View image', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash', permessi: 'Full access' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g);
    for (const e of [
      { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'x' }, _sequenza: 1 },
      { type: 'ToolCallStart', toolCallId: 'v1', toolCallName: 'view_image', parentMessageId: 'm1', _sequenza: 2 },
      { type: 'ToolCallResult', toolCallId: 'v1', role: 'tool', content: 'REFUSED. The image was not opened.', _sequenza: 3 },
    ]) r.handleRealEvent(e, g);
  });
  await expect(page.locator('.tool-note-summary-text').first()).toBeVisible();
  await expect(page.locator('.talos-tool-row__immagine')).toHaveCount(0);
});
