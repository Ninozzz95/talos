import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/*
 * Reperti «evidenti» 15, 20 e O4 della revisione d'uso della candidata (Frontend, 04/11/2026): le prove dal prodotto, nei due temi e
 * col movimento ridotto. Ogni richiesta non GET si ferma. Foto in TALOS_FOTO_DIR (scratchpad), mai nel repo.
 * Il rifiuto del server è copiato dal sorgente (`src/http-app.mjs` `errorEnvelope('AUTH_REQUIRED')`: 401, `ok:false`, codice e frase).
 */
const CARTELLA = process.env.TALOS_FOTO_DIR || '';
if (CARTELLA) mkdirSync(CARTELLA, { recursive: true });
const foto = async (page, nome) => { if (CARTELLA) await page.screenshot({ path: `${CARTELLA}/${nome}.png` }); };
const RIFIUTO = { ok: false, error: { code: 'AUTH_REQUIRED', message: 'This server only accepts the TALOS window that started it' } };
const adesso = new Date();
const riga = (i) => ({
  sessionId: `uxe4-${i}`, taskId: `uxe4-${i}`, nome: `Sessione ${i}`, conclusa: true, stato: 'concluso',
  avviataAlle: new Date(adesso.getTime() - i * 60_000).toISOString(), giri: 2,
});

async function apri(page, tema, { larghezza = 1920, altezza = 1080, lingua = 'it' } = {}) {
  await page.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.fallback() : r.abort()));
  await page.route('**/api/v1/sessions', (r) => (r.request().method() === 'GET'
    ? r.fulfill({ json: { ok: true, data: { items: [riga(1), riga(2), riga(3)] } } }) : r.fallback()));
  await page.route('**/api/v1/sessions/uxe4-*/events*', () => { /* resta pending */ });
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(({ colorMode, lingua }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: lingua } })); } catch { /* */ }
  }, { colorMode: tema, lingua });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
}

async function apriChat(page) {
  await page.locator('.talos-nav-item[data-vaia="chat"]').first().click();
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('uxe4-1', 'uxe4-1', 'Sto pensando di riorganizzare questo progetto', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  });
}

for (const tema of ['light', 'dark']) {
  test(`UXE-B15 (${tema}) — la finestra che ha perso l'accesso lo dice subito, con la strada per rientrare`, async ({ page }) => {
    await apri(page, tema);
    let fuori = false;
    await page.route('**/api/v1/**', (r) => (fuori ? r.fulfill({ status: 401, json: RIFIUTO }) : r.fallback()));
    await apriChat(page);
    await page.waitForTimeout(500);
    fuori = true;
    // una lettura di fondo dell'app stessa: l'elenco delle sessioni, come fa la barra di sinistra
    await page.evaluate(() => fetch('/api/v1/sessions', { headers: { Accept: 'application/json' } }).catch(() => null));
    const fascia = page.locator('.talos-accesso-perso');
    await expect.soft(fascia).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);
    await foto(page, `15-accesso-perso-${tema}`);
    await expect.soft(fascia).toContainText('Questa finestra non è più collegata a TALOS');
    await expect.soft(fascia.getByRole('button', { name: 'Rientra', exact: true })).toBeVisible();
    await expect.soft(fascia).toHaveAttribute('role', 'alert');
  });

  test(`UXE-B20 (${tema}) — la stella «Fissa in cima» non copre l'ora della riga`, async ({ page }) => {
    await apri(page, tema);
    const rigaDue = page.locator('.td-session-row', { hasText: 'Sessione 2' });
    await rigaDue.waitFor({ timeout: 10_000 });
    await page.mouse.move(900, 500);
    await rigaDue.hover();
    const stella = rigaDue.locator('.td-session-star');
    await expect(stella).toHaveCSS('opacity', '1');
    await page.waitForTimeout(300);
    await foto(page, `20-stella-sull-ora-${tema}`);
    await rigaDue.screenshot({ path: CARTELLA ? `${CARTELLA}/20-riga-${tema}.png` : undefined }).catch(() => {});
    const sovrapposti = await rigaDue.evaluate((r) => {
      const s = r.querySelector('.td-session-star').getBoundingClientRect();
      const aside = r.querySelector('.talos-session-item__aside');
      return [...aside.querySelectorAll('span')].filter((e) => e.childElementCount === 0 && e.textContent.trim()
        && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length > 0)
        .map((e) => ({ testo: e.textContent.trim(), b: e.getBoundingClientRect() }))
        .filter(({ b }) => b.left < s.right && b.right > s.left && b.top < s.bottom && b.bottom > s.top)
        .map(({ testo }) => testo);
    });
    expect(sovrapposti, 'nessun testo della riga sotto la stella').toEqual([]);
    // AL CONTRARIO: a riposo l'ora si vede
    await page.mouse.move(900, 500);
    await expect(rigaDue.locator('.talos-session-item__aside')).toHaveCSS('visibility', 'visible');
  });

  test(`UXE-BO4 (${tema}) — a 900 px le azioni della testata non coprono le schede`, async ({ page }) => {
    await apri(page, tema, { larghezza: 900, altezza: 1000, lingua: 'en' });
    await apriChat(page);
    const testata = page.locator('#schermoChat .talos-topbar');
    await expect(testata).toBeVisible();
    await page.waitForTimeout(400);
    await foto(page, `O4-testata-900-${tema}`);
    const misura = await testata.evaluate((t) => {
      const schede = t.querySelector('[data-vistetab]').getBoundingClientRect();
      const azioni = [...t.querySelectorAll('.talos-topbar__actions button')].filter((b) => b.getClientRects().length > 0
        && getComputedStyle(b).visibility !== 'hidden' && !b.closest('[popover]:not(:popover-open)'));
      const browser = [...t.querySelectorAll('[data-vistetab] [role="tab"]')].find((b) => /browser/iu.test(b.textContent));
      const rb = browser.getBoundingClientRect();
      const sopra = document.elementFromPoint(rb.right - 4, rb.top + rb.height / 2);
      return {
        schedeDestra: Math.round(schede.right),
        azioneSinistra: Math.round(Math.min(...azioni.map((b) => b.getBoundingClientRect().left))),
        browserLibero: browser.contains(sopra),
        browserIntero: browser.scrollWidth <= browser.clientWidth + 1,
      };
    });
    expect.soft(misura.azioneSinistra, JSON.stringify(misura)).toBeGreaterThanOrEqual(misura.schedeDestra);
    expect.soft(misura.browserLibero, 'la fine della scheda «Browser» non è coperta').toBe(true);
    expect.soft(misura.browserIntero).toBe(true);
  });
}
