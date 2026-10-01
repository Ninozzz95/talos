import { expect, test } from '@playwright/test';

/*
 * ⛔ 01/10/2026, owner «allinea in alto» — le schede di scelta (`.talos-choice`, sono <button>) centravano in verticale il loro
 * contenuto: in una riga, le schede con meno testo avevano il titolo più in basso (misurato nel velo Permessi: «Accesso pieno»
 * 26 px dal bordo contro 17, «Windows» 28 contro 17). Qui: in ogni riga di schede i titoli stanno alla stessa distanza dal bordo
 * alto, e dove badge e frase stanno in riga (Dove girano i comandi) restano in riga. Sola lettura: ogni non-GET si ferma.
 * Le foto (1920×1080, chiaro e scuro) solo su richiesta: TALOS_FOTO_DIR.
 */
const FOTO = process.env.TALOS_FOTO_DIR;

async function guardia(page) {
  const fermate = [];
  await page.route('**/api/**', (rotta) => {
    if (rotta.request().method() === 'GET') return rotta.fallback();
    fermate.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
    return rotta.abort();
  });
  return fermate;
}

async function apriApp(page, tema = 'dark') {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiFontScale: 'default' }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata */ }
  }, { colorMode: tema });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
}

async function apriVeloPermessi(page) {
  await page.locator('.talos-sidebar [data-vaia="chat"]').first().click();
  await page.locator('[data-open-sheet="permissions"]:visible').first().click();
  await expect(page.locator('#veloPermessi')).toBeVisible();
}

async function apriFonteDiRicerca(page) {
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('tools', { persist: false });
  });
  await expect(page.locator('[data-search-source]').first()).toBeVisible({ timeout: 10_000 });
}

/** Per ogni riga visiva di schede dentro `contenitore`: quanto sta il titolo dal bordo alto di ciascuna. */
function distanzeDeiTitoli(page, contenitore) {
  return page.evaluate((sel) => {
    const righe = new Map();
    for (const scheda of document.querySelectorAll(`${sel} .talos-choice`)) {
      const s = scheda.getBoundingClientRect();
      if (s.width === 0) continue;
      const titolo = scheda.querySelector('.talos-choice__title').getBoundingClientRect();
      const chiave = Math.round(s.top);
      if (!righe.has(chiave)) righe.set(chiave, []);
      righe.get(chiave).push({ nome: scheda.querySelector('.talos-choice__title').textContent.trim(), dallAlto: Math.round(titolo.top - s.top) });
    }
    return [...righe.values()];
  }, contenitore);
}

test('SCHEDE-01: nel velo Permessi i titoli di ogni riga partono dalla stessa altezza, e in «Dove girano i comandi» badge e frase restano in riga', async ({ page }) => {
  const fermate = await guardia(page);
  await apriApp(page);
  await apriVeloPermessi(page);
  const righe = await distanzeDeiTitoli(page, '#veloPermessi');
  expect(righe.length, 'le due righe: autonomia e dove girano i comandi').toBeGreaterThanOrEqual(2);
  for (const riga of righe) {
    const distanze = new Set(riga.map((s) => s.dallAlto));
    expect(distanze.size, `titoli alla stessa altezza: ${JSON.stringify(riga)}`).toBe(1);
  }
  const inRiga = await page.evaluate(() => [...document.querySelectorAll('#veloPermessi [data-dove-choice]')].map((s) => {
    const badge = s.querySelector('.talos-badge')?.getBoundingClientRect();
    const frase = s.querySelector('.talos-choice__sub').getBoundingClientRect();
    return badge ? { stessaRiga: Math.abs(badge.top - frase.top) < 4, larghezzaBadge: Math.round(badge.width), larghezzaScheda: Math.round(s.getBoundingClientRect().width) } : null;
  }).filter(Boolean));
  expect(inRiga.length).toBe(2);
  for (const b of inRiga) {
    expect(b.stessaRiga, 'il badge sta in riga con la frase, come nel mockup').toBe(true);
    expect(b.larghezzaBadge < b.larghezzaScheda / 2, 'il badge resta grande quanto il suo testo').toBe(true);
  }
  const badgePermessi = await page.evaluate(() => [...document.querySelectorAll('#veloPermessi [data-permission-choice] .talos-badge')]
    .map((b) => Math.round(b.getBoundingClientRect().width) < Math.round(b.closest('.talos-choice').getBoundingClientRect().width) / 2));
  expect(badgePermessi.length).toBe(4);
  expect(badgePermessi.every(Boolean), 'i badge di rischio non si allargano alla scheda').toBe(true);
  expect(fermate).toEqual([]);
});

test('SCHEDE-02: nelle Impostazioni le fonti di ricerca di ogni riga hanno il titolo alla stessa altezza', async ({ page }) => {
  const fermate = await guardia(page);
  await apriApp(page);
  await apriFonteDiRicerca(page);
  const righe = await distanzeDeiTitoli(page, '[data-source-settings]');
  expect(righe.length).toBeGreaterThanOrEqual(1);
  for (const riga of righe) expect(new Set(riga.map((s) => s.dallAlto)).size, JSON.stringify(riga)).toBe(1);
  expect(fermate).toEqual([]);
});

for (const tema of ['light', 'dark']) {
  test(`SCHEDE-FOTO (${tema}): velo Permessi e fonti di ricerca`, async ({ page }) => {
    test.skip(!FOTO, 'solo su richiesta: TALOS_FOTO_DIR');
    await guardia(page);
    await apriApp(page, tema);
    await apriVeloPermessi(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${FOTO}/schede-velo-${tema}.png` });
    await page.keyboard.press('Escape');
    await apriFonteDiRicerca(page);
    await page.locator('[data-search-source]').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${FOTO}/schede-impostazioni-${tema}.png` });
  });
}
