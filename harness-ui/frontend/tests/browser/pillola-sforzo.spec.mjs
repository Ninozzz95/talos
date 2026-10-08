import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/*
 * ⛔ La pillola dello sforzo dice il vero (08/10/2026, segnalato dal bugfixer, etichette decise dall'owner).
 *   Prima `xhigh` si chiamava «Max» e il `max` del fornitore veniva ridotto a `xhigh` (`livelliEffortDelModello`): su un
 *   modello che dichiara tutti e due il max vero non si sceglieva, e l'etichetta non diceva cosa partiva.
 *   Ora: `xhigh` = «Molto alto» («Extra high»), `max` = «Max», e la pillola mostra solo i livelli che il modello dichiara.
 * Forme del server: il catalogo è quello di `GET /api/v1/models` (`reasoning.supportedEfforts`, in ordine decrescente come
 *   OpenRouter), la scrittura quella di `POST /api/v1/sessions/:id/settings` (`{reasoning:{effort}}`). Ogni altra scrittura si
 *   ferma e si conta.
 */
const FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/pillola-sforzo/', import.meta.url)));
const SID = 'sessione-sforzo';
const CATALOGO = [
  { id: 'anthropic/claude-opus-5', provider: 'anthropic', nome: 'Anthropic: Claude Opus 5',
    reasoning: { supportedEfforts: ['max', 'xhigh', 'high', 'medium', 'low'], defaultEffort: 'high', defaultEnabled: true, mandatory: false } },
  { id: 'x-ai/grok-4.6', provider: 'x-ai', nome: 'xAI: Grok 4.6',
    reasoning: { supportedEfforts: ['xhigh', 'high', 'medium', 'low'], defaultEffort: 'medium', defaultEnabled: true, mandatory: false } },
  { id: 'google/gemini-3.7-flash', provider: 'google', nome: 'Google: Gemini 3.7 Flash',
    reasoning: { supportedEfforts: ['high', 'medium', 'low'], defaultEffort: 'medium', defaultEnabled: true, mandatory: false } },
];

async function apri(page, { modello, effort = null, lingua = 'it', modo = 'light' }) {
  const stato = { impostazioni: [], scritture: [] };
  const sessione = { sessionId: SID, taskId: 'libero:default', nome: 'Sforzo', avviataAlle: '2026-10-08T07:00:00.000Z', conclusa: true,
    modello, modelId: modello, provider: 'cloud', ...(effort ? { reasoning: { effort } } : {}) };
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage } }));
  }, { colorMode: modo, uiLanguage: lingua });
  await page.route('**/api/**', (rotta) => {
    const r = rotta.request();
    if (r.method() === 'GET') return rotta.fallback();
    stato.scritture.push(`${r.method()} ${new URL(r.url()).pathname}`);
    return rotta.abort();
  });
  await page.route('**/api/v1/sessions', (route) => route.fulfill({ json: { ok: true, data: { items: [sessione] } } }));
  await page.route(`**/api/v1/sessions/${SID}/events`, (route) => route.fulfill({ contentType: 'text/event-stream',
    body: `retry: 3600000\ndata: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null })}\n\n` }));
  await page.route('**/api/v1/models', (route) => route.fulfill({ json: { ok: true, data: { modelli: CATALOGO, daCache: true } } }));
  await page.route(`**/api/v1/sessions/${SID}/settings`, (route) => {
    stato.impostazioni.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, data: { updated: true } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.locator(`[data-real-session-id="${SID}"]`).click();
  await page.locator('[data-open-sheet="model"]').click();
  await expect(page.getByRole('dialog').locator('.effort-picker')).toBeVisible();
  return stato;
}
const tacche = (page) => page.getByRole('dialog').locator('.effort-picker-tick').allTextContents();
const scegli = (page, indice) => page.getByRole('dialog').locator('.effort-picker-range').evaluate((r, i) => {
  r.value = String(i); r.dispatchEvent(new Event('input', { bubbles: true }));
}, indice);
async function foto(page, nome) {
  await mkdir(FOTO, { recursive: true });
  // le tacche cambiano colore con una transizione: senza aspettarla la prima foto mostrava ancora «Alto» colorata
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).map((a) => a.finished.catch(() => null))),
    new Promise((ok) => setTimeout(ok, 3000)),
  ]));
  await writeFile(path.join(FOTO, nome), await page.screenshot());
}

for (const modo of ['light', 'dark']) {
  test.describe(`Pillola dello sforzo · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    test('SFORZO-01 — un modello che dichiara max e xhigh: due livelli coi loro nomi, e «Max» manda max', async ({ page }) => {
      const s = await apri(page, { modello: 'anthropic/claude-opus-5', modo });
      expect(await tacche(page)).toEqual(['Off', 'Basso', 'Medio', 'Alto', 'Molto alto', 'Max']);
      await scegli(page, 5);
      await expect(page.locator('.effort-picker-selected')).toHaveText('Max');
      // la tacca colorata è quella scelta (la prima foto mostrava «Max» in testata e «Alto» colorata)
      await expect(page.getByRole('dialog').locator('.effort-picker-tick-selected')).toHaveText('Max');
      await expect.poll(() => s.impostazioni.at(-1)?.reasoning).toEqual({ effort: 'max' });
      // owner 08/10/2026: «leva lo shadow interno della modale» — il riquadro del modello sta in linea, senza ombra
      await expect(page.getByRole('dialog').locator('.model-picker-panel').first()).toHaveCSS('box-shadow', 'none');
      await foto(page, `sforzo-01-max-${modo}.png`);
      await scegli(page, 4);
      await expect(page.locator('.effort-picker-selected')).toHaveText('Molto alto');
      await expect.poll(() => s.impostazioni.at(-1)?.reasoning).toEqual({ effort: 'xhigh' });
      expect(s.scritture, 'nessun\'altra scrittura').toEqual([]);
    });

    test('SFORZO-02 — un modello che arriva a xhigh: niente «Max»; una sessione salvata a xhigh dice «Molto alto»', async ({ page }) => {
      const s = await apri(page, { modello: 'x-ai/grok-4.6', effort: 'xhigh', modo });
      expect(await tacche(page)).toEqual(['Off', 'Basso', 'Medio', 'Alto', 'Molto alto']);
      await expect(page.locator('.effort-picker-selected')).toHaveText('Molto alto');
      expect(s.scritture).toEqual([]);
    });

    test('SFORZO-03 — al contrario: max salvato su un modello che arriva a high scende ad «Alto», mai più su', async ({ page }) => {
      await apri(page, { modello: 'google/gemini-3.7-flash', effort: 'max', modo });
      expect(await tacche(page)).toEqual(['Off', 'Basso', 'Medio', 'Alto']);
      await expect(page.locator('.effort-picker-selected')).toHaveText('Alto');
    });
  });
}

test('SFORZO-EN — in inglese (la sorgente): «Extra high» e «Max»', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'anthropic/claude-opus-5', lingua: 'en' });
  expect(await tacche(page)).toEqual(['Off', 'Low', 'Medium', 'High', 'Extra high', 'Max']);
});
