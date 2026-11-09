import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/*
 * Reperti «evidenti» 8 e 11 della revisione d'uso della candidata (Frontend, 04/11/2026): le prove dal prodotto, nei due temi,
 * a 1920×1080 e col movimento ridotto. Ogni richiesta non GET si ferma. Foto in TALOS_FOTO_DIR (scratchpad), mai nel repo.
 * Il catalogo dei modelli è quello vero del server, con in più la riga di DeepSeek della foto della revisione (forma del catalogo:
 * `{ id, nome, provider }`, `selettore-modelli.js` `nomeBreve`).
 */
const CARTELLA = process.env.TALOS_FOTO_DIR || '';
if (CARTELLA) mkdirSync(CARTELLA, { recursive: true });
const foto = async (page, nome) => { if (CARTELLA) await page.screenshot({ path: `${CARTELLA}/${nome}.png` }); };
const DEEPSEEK = { id: 'deepseek/deepseek-v4.1-flash-1017', nome: 'DeepSeek: DeepSeek V4.1 Flash 1017', provider: 'deepseek', contextLength: 1048576 };

async function apri(page, tema) {
  await page.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.fallback() : r.abort()));
  await page.route('**/api/v1/sessions/uxe3-*/events*', () => { /* resta pending */ });
  await page.route('**/api/v1/models*', async (r) => {
    const risposta = await r.fetch();
    const corpo = await risposta.json().catch(() => ({}));
    const dati = corpo?.data && typeof corpo.data === 'object' ? corpo.data : {};
    const modelli = Array.isArray(dati.modelli) ? dati.modelli.filter((m) => m?.id !== DEEPSEEK.id) : [];
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...corpo, ok: true, data: { ...dati, modelli: [DEEPSEEK, ...modelli] } }) });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); } catch { /* */ }
  }, { colorMode: tema });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
}

async function impostazioni(page, sezione) {
  await page.evaluate((sezione) => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.(sezione);
  }, sezione);
}

for (const tema of ['light', 'dark']) {
  test(`UXE-B8 (${tema}) — la voce delle Impostazioni dice ciò che c'è, e i pulsanti non sono in inglese`, async ({ page }) => {
    await apri(page, tema);
    await impostazioni(page, 'account');
    const pannello = page.locator('[data-settings-panel="account"]:visible').first();
    await expect(pannello).toBeVisible();
    await page.waitForTimeout(300);
    await foto(page, `8-agente-e-diagnostica-${tema}`);
    const voce = page.locator('[data-settings-tab="account"]:visible').first();
    await expect.soft(voce).not.toContainText(/backup|Account/iu);
    await expect.soft(voce).toContainText('Diagnosi e configurazione');
    await expect.soft(pannello).not.toContainText(/backup/iu);
    await expect.soft(pannello.getByRole('button', { name: 'Agenti', exact: true })).toBeVisible();
    await expect.soft(pannello.getByRole('button', { name: 'Agents', exact: true })).toHaveCount(0);
    await expect.soft(pannello.getByRole('button', { name: /^(Hooks|Skills|Plugins)$/u })).toHaveCount(0);
  });

  test(`UXE-B11 (${tema}) — il gettone del modello e la banda del Laboratorio dicono il nome del catalogo, non l'id`, async ({ page }) => {
    await apri(page, tema);
    await page.locator('.talos-nav-item[data-vaia="chat"]').click();
    await page.evaluate((id) => {
      const r = window.__talosHarnessUiRuntime;
      r.passaASessione('uxe3-modello', 'workspace', 'Prova', id, { conclusa: false, modello: id });
      r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
    }, DEEPSEEK.id);
    const gettone = page.locator('[data-open-sheet="model"]:visible .talos-chip__label').first();
    await expect(gettone).toBeVisible();
    await page.waitForTimeout(1500); // il catalogo si legge una volta in sottofondo
    await foto(page, `11-gettone-${tema}`);
    await expect.soft(gettone).toHaveText('DeepSeek V4.1 Flash 1017');
    await impostazioni(page, 'models');
    const banda = page.locator('#modelLabActiveModel:visible').first();
    await expect(banda).toBeVisible();
    await page.waitForTimeout(300);
    await foto(page, `11-laboratorio-${tema}`);
    await expect.soft(banda).toContainText('DeepSeek V4.1 Flash 1017');
    await expect.soft(banda).not.toContainText('deepseek-v4.1-flash-1017');
  });
}
