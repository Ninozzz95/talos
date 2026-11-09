/*
 * Revisione UX della candidata, 04/11/2026, righe 28-31 (cielo), 35 (finestra Nuova sessione) e 36 (barra senza rete): la pagina vera,
 * chiaro e scuro, 1920×1080. Le cure si provano nel dettaglio nelle prove di unità (`cielo.test.mjs` CIELO-22..27,
 * `ux-35-nuova-sessione.test.mjs`, `ux-28-42-rete.test.mjs`); qui si guarda che nella pagina vera dicano lo stesso, e si fanno le foto
 * in `UX_FOTO_DIR` (se c'è). ⛔ Nessuna scrittura: ogni non-GET si conta e si rifiuta.
 */
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const FOTO = process.env.UX_FOTO_DIR || '';
const ora = Date.now();
const SESSIONI = [
  { sessionId: 'a', nome: 'Refactor del selettore', progetto: 'TALOS', conclusa: false, inAttesaApprovazione: true, modello: 'z-ai/glm-5.3-flash', avviataAlle: new Date(ora - 600_000).toISOString() },
  { sessionId: 'b', nome: 'Pagina dei prezzi', progetto: 'Sito', conclusa: true, ultimoEsito: 'successo', modello: 'z-ai/glm-5.3-flash', avviataAlle: new Date(ora - 86_400_000).toISOString() },
  { sessionId: 'c', nome: 'Ricerca sui prezzi dei concorrenti', progetto: 'Sito', conclusa: true, ultimoEsito: 'successo', modello: 'z-ai/glm-5.3-flash', avviataAlle: new Date(ora - 2 * 86_400_000).toISOString() },
];
const tema = (modo) => (modo === 'light' ? 'chiaro' : 'scuro');
const foto = async (page, nome) => { if (!FOTO) return; mkdirSync(FOTO, { recursive: true }); await page.screenshot({ path: `${FOTO}/${nome}.png` }); };

async function apri(page, modo, vista) {
  const tentate = [];
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { tentate.push(`${req.method()} ${new URL(req.url()).pathname}`); return route.abort(); }
    return route.fallback();
  });
  await page.route('**/api/v1/sessions', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: { ok: true, data: { items: SESSIONI } } }) : r.fallback()));
  await page.addInitScript(([colorMode, v]) => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it', ...(v ? { newSessionView: v } : {}) } })); } catch { /* storage assente */ }
  }, [modo, vista]);
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  return tentate;
}

test.use({ viewport: { width: 1920, height: 1080 } });

for (const modo of ['light', 'dark']) {
  test(`UX-28-31 (${modo}) the sky: singular head, the legend moves the sky, Esc closes only the legend`, async ({ page }) => {
    const tentate = await apri(page, modo, 'sky');
    await page.locator('#newSessionBtn').click();
    await expect(page.locator('.cielo')).toBeVisible();
    await expect(page.locator('.cielo .c-tit small')).toHaveText(/1 ti aspetta$/u);
    await page.waitForTimeout(900); // il cielo si assesta sulla sua vista (animazione verso `C.mira`)
    await foto(page, `28-cielo-testa-${tema(modo)}`);
    await page.locator('.cielo .c-tondo', { hasText: 'Come si legge' }).click();
    await expect(page.locator('.cielo .c-leg')).toBeVisible();
    await page.waitForTimeout(900);
    await foto(page, `30-cielo-come-si-legge-${tema(modo)}`);
    await page.keyboard.press('Escape');
    await expect(page.locator('.cielo .c-leg'), 'Esc chiude il riquadro').toHaveCount(0);
    await expect(page.locator('.cielo'), 'e il cielo resta').toBeVisible();
    await page.locator('.cielo .c-tondo', { hasText: 'Elenco' }).click();
    await page.locator('.c-elenco .c-ses', { hasText: 'Sito' }).click();
    await expect(page.locator('.c-pan')).toBeVisible();
    await page.waitForTimeout(900);
    await foto(page, `29-cielo-progetto-${tema(modo)}`);
    expect(tentate).toEqual([]);
  });

  test(`UX-35 (${modo}) the New session window speaks Italian`, async ({ page }) => {
    const tentate = await apri(page, modo);
    await page.locator('#newSessionBtn').click();
    const finestra = page.locator('.sheet-dialog--new-session');
    await expect(finestra).toBeVisible();
    await expect(finestra).toContainText('Pianificatore opzionale');
    await expect(finestra).toContainText('Accesso allo spazio di lavoro');
    await foto(page, `35-nuova-sessione-${tema(modo)}`);
    expect(tentate).toEqual([]);
  });

  test(`UX-36 (${modo}) offline, the status bar blames the network in the UI font`, async ({ page, context }) => {
    await apri(page, modo);
    /* la barra vive sotto la chat: si entra nella Conversazione come una persona, dalla Home */
    await page.locator('#schermoHome button, #schermoHome a', { hasText: 'Conversazione' }).first().click();
    await expect(page.locator('#schermoChat')).toBeVisible();
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const barra = page.locator('.talos-statusbar__connessione');
    await expect(barra).toHaveText('Questo computer è senza rete', { timeout: 40_000 });
    await expect(barra, 'la barra si vede, non solo esiste').toBeVisible();
    expect(await barra.evaluate((n) => getComputedStyle(n).fontFamily)).not.toMatch(/mono/iu);
    await foto(page, `36-barra-senza-rete-${tema(modo)}`);
    await context.setOffline(false);
  });
}
