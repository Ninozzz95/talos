import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/*
 * Reperti «evidenti» 7, 9, 10 e 12 della revisione d'uso della candidata (Frontend, 04/11/2026): le prove dal prodotto, nei due temi,
 * a 1920×1080 e col movimento ridotto. Ogni richiesta non GET si ferma. Foto in TALOS_FOTO_DIR (scratchpad), mai nel repo.
 * La riga di Ollama ha la forma che manda il server quando il servizio non risponde (`openai-compatible-runtime.mjs` `detect`:
 * `state:'unknown'`, data vera, `failureReason:'RUNTIME_UNREACHABLE'`): così la prova non dipende da un Ollama acceso sul PC.
 */
const CARTELLA = process.env.TALOS_FOTO_DIR || '';
if (CARTELLA) mkdirSync(CARTELLA, { recursive: true });
const foto = async (page, nome) => { if (CARTELLA) await page.screenshot({ path: `${CARTELLA}/${nome}.png` }); };

async function apri(page, tema, datiLocali = {}) {
  await page.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.fallback() : r.abort()));
  await page.route('**/api/v1/sessions/uxe2-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: 'retry: 600000\n\n' }));
  await page.route('**/api/v1/runtime', async (r) => {
    const risposta = await r.fetch();
    const corpo = await risposta.json();
    const items = Array.isArray(corpo?.data?.items) ? corpo.data.items : [];
    const muto = { state: 'unknown', observedAt: new Date().toISOString(), failureReason: 'RUNTIME_UNREACHABLE', models: [] };
    const nuovi = items.some((i) => i.runtimeId === 'ollama')
      ? items.map((i) => (i.runtimeId === 'ollama' ? { ...i, ...muto, modelsError: undefined } : i))
      : [...items, { runtimeId: 'ollama', baseUrl: 'http://127.0.0.1:11434', ...muto }];
    await r.fulfill({ response: risposta, json: { ...corpo, data: { ...corpo.data, items: nuovi } } });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(({ colorMode, datiLocali }) => {
    if (window.top !== window) return;
    try {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
      for (const [k, v] of Object.entries(datiLocali)) localStorage.setItem(k, v);
    } catch { /* */ }
  }, { colorMode: tema, datiLocali });
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
  test(`UXE-B7 (${tema}) — Sicurezza e privacy: i dati locali col nome umano e la grandezza in parole`, async ({ page }) => {
    await apri(page, tema, {
      'talos-harness-terminali-v1': JSON.stringify({ schede: [1, 2] }),
      'talos.ask-draft.v1:uxe2-a': 'una bozza', 'talos.ask-draft.v1:uxe2-b': 'un\'altra bozza',
      'talos.desktop.workspace.v2': JSON.stringify({ cartella: 'C:/progetti/prova' }),
    });
    await impostazioni(page, 'privacy');
    const elenco = page.locator('#settingsPrivacyList');
    await expect(elenco).toBeVisible();
    await elenco.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await foto(page, `7-dati-locali-${tema}`);
    await expect(elenco).toContainText('Schede del terminale');
    await expect(elenco).toContainText('Spazio di lavoro');
    await expect(elenco).toContainText(/Bozze non inviate · meno di 1 KB · 2 voci/u);
    await expect(elenco).not.toContainText('talos');
    await expect(elenco.locator('code')).toHaveCount(0);
    await expect(elenco).not.toContainText(/\d B\b/u);
  });

  test(`UXE-B9-B12 (${tema}) — Laboratorio modelli → Sistema: «Distingui» e Ollama muto «Non raggiungibile»`, async ({ page }) => {
    await apri(page, tema);
    await impostazioni(page, 'models');
    await page.locator('[data-lab-scheda="system"]').first().click();
    const carta = page.locator('.talos-runtime-card:visible', { has: page.locator('[data-runtime-name]', { hasText: /^Ollama$/u }) }).first();
    await expect(carta).toBeVisible({ timeout: 10_000 });
    await carta.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await foto(page, `9-12-laboratorio-sistema-${tema}`);
    // morbide: i due reperti si dicono entrambi, anche quando il primo è rosso
    await expect.soft(page.getByText(/Distingui ciò che è misurato/u).first()).toBeVisible();
    await expect.soft(page.getByText('Distinguì')).toHaveCount(0);
    await expect.soft(carta.locator('[data-runtime-models]')).toHaveText('Non raggiungibile');
    await expect.soft(carta).not.toContainText('non verificata');
  });

  test(`UXE-B10 (${tema}) — chat a lato vuota: nessuna «~» da sola sotto il campo`, async ({ page }) => {
    await apri(page, tema);
    /* come `a-lato.spec.mjs`: gli eventi restano in sospeso, e il confine della rigiocata chiude il ripristino */
    await page.route('**/api/v1/sessions/uxe2-lato/events*', () => { /* resta pending */ });
    await page.locator('.talos-nav-item[data-vaia="chat"]').click();
    await page.evaluate(() => {
      const r = window.__talosHarnessUiRuntime;
      r.passaASessione('uxe2-lato', 'workspace', 'Prova', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
      r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
    });
    await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
    await page.keyboard.press('Control+;');
    const lato = page.locator('#railLato');
    await expect(lato).toBeVisible();
    await page.waitForTimeout(300);
    await foto(page, `10-a-lato-vuota-${tema}`);
    const piede = lato.locator('.lato-piede');
    const segni = await piede.locator('.talos-measure--estimate').evaluateAll((els) => els
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => getComputedStyle(e, '::before').content + e.textContent));
    expect(segni, 'nessuna stima visibile a chat vuota').toEqual([]);
  });
}
