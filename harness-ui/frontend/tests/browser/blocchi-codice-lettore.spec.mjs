import { test, expect } from '@playwright/test';

/*
 * Revisione dei blocchi di codice (23/10/2026), F11 e R2 — IL LETTORE DI FILE, aperto dal vivo (albero e file finti, ogni richiesta
 * non-GET si ferma e si conta). Prova portata dalla riverifica avversaria (V-F11 del revisore):
 *   · il «⋯ › Scarica» di un file aperto salva col NOME VERO, spazio compreso;
 *   · sopra i 150 KB il blocco è acceso («Copia» e «⋯») e senza colori; sotto, i colori ci sono;
 *   · R2: un recinto ```python sync.py nella prosa di un .md si scarica col nome della sua riga d'apertura.
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const GIRO = [
  { type: 'RunStarted', threadId: 't', runId: 'r-l', input: { consegna: 'Ciao' } },
  { type: 'TextMessageStart', messageId: 'm-l', role: 'assistant' },
  { type: 'TextMessageContent', messageId: 'm-l', delta: 'Ciao.' },
  { type: 'TextMessageEnd', messageId: 'm-l' },
  { type: 'RunFinished', threadId: 't', runId: 'r-l' },
].map((e, i) => ({ ...e, _sequenza: i + 1 }));
const PICCOLO = 'export const somma = (a, b) => a + b;\n';
const GRANDE = `${'// riga di riempimento per superare i 150 KB\n'.repeat(4000)}export const fine = 1;\n`;
const MD = '# Leggimi\n\n```python sync.py\nprint(1)\n```\n';
const FILE = { 'mio file.mjs': PICCOLO, 'grande.mjs': GRANDE, 'LEGGIMI.md': MD };

async function apri(page) {
  const contatore = { nonGet: 0 };
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'en' } })); } catch { /* riquadro isolato */ }
  });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/tree')) return route.fulfill({ json: { ok: true, data: { voci: Object.keys(FILE).map((nome) => ({ nome, cartella: false })) } } });
    if (url.pathname.endsWith('/file')) return route.fulfill({ contentType: 'application/octet-stream', body: FILE[url.searchParams.get('percorso').split('/').pop()] ?? '' });
    const m = /\/api\/v1\/sessions\/(lettore-prova)\/(events|metrics)$/u.exec(url.pathname);
    if (m) {
      if (m[2] === 'metrics') return route.fulfill({ json: { ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {} }, meta: {} } });
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...GIRO, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('lettore-prova', 'workspace', 'Lettore', 'prova/modello', { conclusa: true, modello: 'prova/modello' }));
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 20_000 });
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  return contatore;
}

async function apriFile(page, nome) {
  await page.locator('#railTabs [data-rail="file"]').click();
  await page.locator('#alberoFile .ft-row', { hasText: nome }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^(Apri|Open)$/u }).click();
  const blocco = page.locator('#railFileLettore .code-block').first();
  await expect(blocco).toBeVisible({ timeout: 10_000 });
  return blocco;
}
async function scarica(page, blocco) {
  await blocco.locator('.code-block-more').click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#menuBloccoCodice [role=menuitem]').first().click()]);
  return d.suggestedFilename();
}
const chiudiLettore = (page) => page.evaluate(() => [...document.querySelectorAll('#railFileLettore button[aria-label]')].find((b) => /^(Close|Chiudi)/u.test(b.getAttribute('aria-label')))?.click());

test('BLOCCHI-LETTORE-01 — nome vero del file con lo spazio; sopra 150 KB acceso e senza colori, sotto coi colori; R2: il recinto di un .md col nome della sua riga', async ({ page }) => {
  const c = await apri(page);
  const piccolo = await apriFile(page, 'mio file.mjs');
  expect(await piccolo.locator('code span.token').count(), 'sotto i 150 KB i colori ci sono').toBeGreaterThan(0);
  expect(await scarica(page, piccolo)).toBe('mio file.mjs');
  await chiudiLettore(page);
  const grande = await apriFile(page, 'grande.mjs');
  await expect(grande.locator('.code-block-more')).toBeEnabled();
  await expect(grande.locator('.code-block-copy')).toBeEnabled();
  expect(await grande.locator('code span.token').count(), 'sopra i 150 KB niente colori').toBe(0);
  await chiudiLettore(page);
  const md = await apriFile(page, 'LEGGIMI.md');
  /* nella prosa resa il recinto python è il blocco: si scarica come sync.py (prima: talos-python-<data>.py) */
  await expect(md).toHaveAttribute('data-lingua', 'python');
  expect(await scarica(page, md)).toBe('sync.py');
  expect(c.nonGet).toBe(0);
});
