import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/*
 * Owner 28/10/2026 notte (parità col Mobile): nella pillola del compositore il LOGO della via d'accesso e SOLO il nome del modello.
 * Due sessioni: glm via OpenRouter (il marchio di OpenRouter) e DeepSeek diretto (il suo marchio). Forme del server come
 * `pillola-sforzo.spec.mjs`; ogni scrittura si ferma e si conta.
 */
const FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/pillola-logo-fornitore/', import.meta.url)));
const SESSIONI = [
  { sessionId: 'sessione-or', taskId: 'libero:default', nome: 'Via OpenRouter', avviataAlle: '2026-10-28T07:00:00.000Z', conclusa: true,
    modello: 'z-ai/glm-5.3-flash', modelId: 'z-ai/glm-5.3-flash', provider: 'cloud' },
  { sessionId: 'sessione-ds', taskId: 'libero:default', nome: 'DeepSeek diretto', avviataAlle: '2026-10-28T07:01:00.000Z', conclusa: true,
    modello: 'deepseek:deepseek-v4', modelId: 'deepseek:deepseek-v4', provider: 'cloud' },
  { sessionId: 'sessione-cg', taskId: 'libero:default', nome: 'Piano ChatGPT', avviataAlle: '2026-10-28T07:02:00.000Z', conclusa: true,
    modello: 'chatgpt:gpt-6-luna', modelId: 'chatgpt:gpt-6-luna', provider: 'cloud' },
];

async function apri(page, { modo }) {
  const scritture = [];
  await page.addInitScript(({ colorMode }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, { colorMode: modo });
  await page.route('**/api/**', (rotta) => {
    const r = rotta.request();
    if (r.method() === 'GET') return rotta.fallback();
    scritture.push(`${r.method()} ${new URL(r.url()).pathname}`);
    return rotta.abort();
  });
  await page.route('**/api/v1/sessions', (route) => route.fulfill({ json: { ok: true, data: { items: SESSIONI } } }));
  for (const s of SESSIONI) {
    await page.route(`**/api/v1/sessions/${s.sessionId}/events`, (route) => route.fulfill({ contentType: 'text/event-stream',
      body: `retry: 3600000\ndata: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null })}\n\n` }));
  }
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  return scritture;
}
const pillola = (page) => page.locator('#schermoChat [data-open-sheet="model"]').first();

for (const modo of ['light', 'dark']) {
  test.describe(`Pillola del modello · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    test('PILLOLA-LOGO-WEB-01 — glm via OpenRouter: logo di OpenRouter e solo «glm-5.3-flash»; DeepSeek diretto: il logo di DeepSeek; l\'id intero nel suggerimento', async ({ page }) => {
      const scritture = await apri(page, { modo });
      await page.locator('[data-real-session-id="sessione-or"]').click();
      await expect(pillola(page).locator('.talos-chip__label')).toHaveText('glm-5.3-flash');
      await expect(pillola(page).locator(':scope > svg[data-via-del-modello="openrouter"]')).toHaveAttribute('data-marchio', /openrouter/iu);
      await expect(pillola(page)).toHaveAttribute('title', /z-ai\/glm-5\.3-flash/u);
      await expect(pillola(page).locator(':scope > [data-via-del-modello], :scope > svg')).toHaveCount(1);
      await mkdir(FOTO, { recursive: true });
      await writeFile(path.join(FOTO, `pillola-openrouter-${modo}.png`), await page.locator('#schermoChat .talos-composer__bar').first().screenshot());
      await page.locator('[data-real-session-id="sessione-ds"]').click();
      await expect(pillola(page).locator('.talos-chip__label')).toHaveText('deepseek-v4');
      await expect(pillola(page).locator(':scope > [data-via-del-modello="deepseek"]')).toHaveAttribute('data-marchio', /deepseek/iu);
      await expect(pillola(page).locator(':scope > [data-via-del-modello], :scope > svg')).toHaveCount(1); // il logo SOSTITUISCE l'icona, non si aggiunge
      await writeFile(path.join(FOTO, `pillola-deepseek-${modo}.png`), await page.locator('#schermoChat .talos-composer__bar').first().screenshot());
      /* R17-5 (revisione blocco 17): il piano ChatGPT è di OpenAI, come sul Mobile — mai la «C» di Cerebras */
      await page.locator('[data-real-session-id="sessione-cg"]').click();
      await expect(pillola(page).locator('.talos-chip__label')).toHaveText('gpt-6-luna');
      const logoCg = pillola(page).locator(':scope > [data-via-del-modello="chatgpt"]');
      await expect(logoCg).toHaveCount(1);
      await expect(logoCg).not.toHaveText('C');
      await expect(pillola(page).locator(':scope > [data-via-del-modello], :scope > svg')).toHaveCount(1);
      expect(scritture).toEqual([]);
    });
  });
}
