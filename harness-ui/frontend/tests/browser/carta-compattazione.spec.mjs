import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

/*
 * FE-053 (owner 01/11/2026): la carta «Compattazione della conversazione» in Impostazioni → Memoria e contesto. La rotta la risponde la prova: ogni scrittura vera si ferma e
 * si conta, quelle della carta si registrano e si rispondono qui. Foto per il verde del Frontend: 1024, 1440, 1920, chiaro e scuro, italiano e inglese.
 */
const FOTO = `${homedir().replaceAll('\\', '/')}/Downloads/TALOS/frontend/in-corso/prove-fe-053`;
const SCELTO = { ruolo: 'scelto', modello: 'z-ai/glm-5.3-flash', stato: 'pronto', origine: 'scelta' };
const RISERVA = { ruolo: 'riserva', modello: 'qwen/qwen3.7-flash', stato: 'pronto', origine: 'scelta' };
const SENZA = { ruolo: 'senza-modello', modello: null, stato: 'pronto' };
const BASE = { motore: 'engine', modelloDelRiassunto: 'z-ai/glm-5.3-flash', riservaDelRiassunto: 'qwen/qwen3.7-flash', catena: [SCELTO, RISERVA, SENZA] };
const MODELLI = [{ id: 'z-ai/glm-5.3-flash', provider: 'z-ai', nome: 'GLM 5.3 Flash' }, { id: 'qwen/qwen3.7-flash', provider: 'qwen', nome: 'Qwen 3.7 Flash' }, { id: 'openai/gpt-5.4', provider: 'openai', nome: 'GPT-5.4' }];

async function apri(page, { tema = 'dark', lingua = 'it', get = BASE, post = null, larghezza = 1920 } = {}) {
  const scritte = []; const fermate = [];
  await page.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.fallback() : (fermate.push(r.request().url()), r.abort())));
  await page.route('**/api/v1/models*', (r) => r.fulfill({ json: { ok: true, data: { modelli: MODELLI } } }));
  await page.route('**/api/v1/auth/chatgpt/stato', (r) => r.fulfill({ json: { ok: true, data: { collegato: false, pianoAbilitato: false } } }));
  await page.route('**/api/v1/context-settings', async (r) => {
    if (r.request().method() === 'GET') return r.fulfill({ json: { ok: true, data: get } });
    const corpo = JSON.parse(r.request().postData() || '{}');
    scritte.push(corpo);
    if (post === 400) return r.fulfill({ status: 400, json: { ok: false, error: { code: 'QUERY_INVALID' } } });
    return r.fulfill({ json: { ok: true, data: { ...get, ...corpo } } });
  });
  await page.setViewportSize({ width: larghezza, height: 1080 });
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage, uiFontScale: 'default' } })); } catch { /* niente */ }
  }, { colorMode: tema, uiLanguage: lingua });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
  await page.evaluate(() => document.querySelector('[data-vaia="impostazioni"], [data-view="settings"]')?.click());
  await page.locator('#setting-tab-memoria').click();
  const carta = page.locator('[data-settings-card="memoria-compattazione"]');
  await expect(carta).toBeVisible();
  return { carta, scritte, fermate };
}

const scegli = async (page, riga, voce) => {
  await page.locator(`[data-setting-row="${riga}"] .calm-select`).click();
  await page.locator('.calm-option', { hasText: voce }).first().click();
};

test('CARTA-UI-01 — sotto «Motore del contesto», la frase sempre a vista e i menu in Avanzate', async ({ page }) => {
  const { carta } = await apri(page);
  expect(await page.evaluate(() => document.querySelector('[data-settings-card="memoria-motore-contesto"]')?.nextElementSibling?.dataset.settingsCard)).toBe('memoria-compattazione');
  await expect(carta.locator('[data-compattazione-catena]')).toContainText('Adesso: GLM 5.3 Flash, poi Qwen 3.7 Flash se non risponde, poi una compattazione rapida senza modello.');
  await expect(carta.locator('[data-setting-row="modelloDelRiassunto"]')).toBeHidden();
  await carta.locator('[data-compattazione-avanzate]').click();
  await expect(carta.locator('[data-setting-row="modelloDelRiassunto"]')).toBeVisible();
  await expect(carta.locator('[data-setting-row="riservaDelRiassunto"] .calm-select')).toContainText('Qwen 3.7 Flash');
});

test('CARTA-UI-02 — una scelta si scrive, e la frase la cambia solo la risposta del server', async ({ page }) => {
  const { carta, scritte } = await apri(page);
  await carta.locator('[data-compattazione-avanzate]').click();
  await scegli(page, 'riservaDelRiassunto', 'Il modello della conversazione');
  await expect.poll(() => scritte).toEqual([{ riservaDelRiassunto: 'conversazione' }]);
  await scegli(page, 'modelloDelRiassunto', 'Come la conversazione');
  await expect.poll(() => scritte.at(-1)).toEqual({ modelloDelRiassunto: null });
});

test('CARTA-UI-03 — AL CONTRARIO: un salvataggio rifiutato rimette la scelta di prima e lo dice', async ({ page }) => {
  const { carta } = await apri(page, { post: 400 });
  await carta.locator('[data-compattazione-avanzate]').click();
  await scegli(page, 'modelloDelRiassunto', 'GPT-5.4');
  await expect(carta.locator('[data-compattazione-errore]')).toBeVisible();
  await expect(carta.locator('[data-setting-row="modelloDelRiassunto"] .calm-select')).toContainText('GLM 5.3 Flash');
});

test('CARTA-UI-04 — scelto inutilizzabile: l\'avviso e «Scegli un altro» aprono il suo menu', async ({ page }) => {
  const { carta } = await apri(page, { get: { ...BASE, catena: [{ ...SCELTO, stato: 'inutilizzabile', motivo: 'senza-chiave' }, RISERVA, SENZA] } });
  await expect(carta.locator('[data-compattazione-catena]')).toBeHidden();
  await expect(carta.locator('[data-compattazione-avviso-testo]')).toHaveText('Manca la chiave per GLM 5.3 Flash.');
  await carta.locator('[data-compattazione-scegli]').click();
  await expect(carta.locator('[data-setting-row="modelloDelRiassunto"]')).toBeVisible();
  await expect(page.locator('.calm-option', { hasText: 'Come la conversazione' }).first()).toBeVisible();
});

test('CARTA-UI-05 — un modello che non c\'è più resta la scelta salvata, col nome corto', async ({ page }) => {
  const { carta } = await apri(page, { get: { ...BASE, modelloDelRiassunto: 'autore/sparito-1', catena: [{ ...SCELTO, modello: 'autore/sparito-1' }, SENZA] } });
  await carta.locator('[data-compattazione-avanzate]').click();
  await expect(carta.locator('[data-setting-row="modelloDelRiassunto"] .calm-select')).toContainText('sparito-1');
});

for (const [lingua, tema, larghezza] of [['it', 'dark', 1920], ['it', 'light', 1920], ['en', 'dark', 1440], ['en', 'light', 1024]]) {
  test(`CARTA-FOTO (${lingua}, ${tema}, ${larghezza})`, async ({ page }) => {
    const { carta } = await apri(page, { lingua, tema, larghezza, get: { ...BASE, catena: [{ ...SCELTO, stato: 'bloccato', motivo: 'limite', finoAlle: Date.now() + 3_600_000, diAccount: true }, { ...RISERVA, stato: 'inutilizzabile', motivo: 'non-trovato' }, SENZA] } });
    await carta.locator('[data-compattazione-avanzate]').click();
    await carta.scrollIntoViewIfNeeded();
    const trabocca = await page.evaluate(() => { const c = document.querySelector('[data-settings-card="memoria-compattazione"]'); return c.scrollWidth > c.clientWidth + 1; });
    expect(trabocca).toBe(false);
    mkdirSync(FOTO, { recursive: true });
    await page.screenshot({ path: `${FOTO}/carta-${lingua}-${tema}-${larghezza}.png` });
  });
}
