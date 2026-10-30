import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/*
 * Owner 28/10/2026 (dal Mobile: «quando apro il selettore modelli non vedo selezionato e centrato il modello in uso»; foto in sola lettura
 *   del 4174 lo stesso giorno: scheda OpenRouter giusta, ma tutti i gruppi per autore CHIUSI e il modello in uso invisibile). All'apertura:
 *   il gruppo dell'autore in uso si apre, la riga in uso è segnata e sta AL CENTRO della lista; si muove solo la lista, mai il foglio.
 * 29/10/2026 (selettore rifatto dal bozzetto approvato): i gruppi portano il nome umano dell'autore («m-ai» → «M Ai»), mai la sigla.
 * Forme del server copiate da `pillola-sforzo.spec.mjs` (catalogo di `GET /api/v1/models`); ogni scrittura si ferma e si conta.
 */
const FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/selettore-modello-in-vista/', import.meta.url)));
const SID = 'sessione-selettore';
/* quaranta autori da tre modelli, venti prima e venti dopo «m-ai»: il modello in uso sta a METÀ, lontano dalla vista iniziale, e la lista
   può scendere oltre lui (in fondo al catalogo nessuna lista può centrare: SELETTORE-VISTA-03) */
const AUTORI = Array.from({ length: 40 }, (_, i) => `${i < 20 ? 'a' : 'q'}-autore-${String(i).padStart(2, '0')}`);
const CATALOGO = [
  ...AUTORI.flatMap((a) => [1, 2, 3].map((n) => ({ id: `${a}/modello-${n}`, provider: a, nome: `${a}: Modello ${n}` }))),
  { id: 'm-ai/glm-5.3', provider: 'm-ai', nome: 'M: GLM 5.3' },
  { id: 'm-ai/glm-5.3-flash', provider: 'm-ai', nome: 'M: GLM 5.3 Flash' },
  { id: 'm-ai/glm-5.3-air', provider: 'm-ai', nome: 'M: GLM 5.3 Air' },
  { id: 'zz-ultimo/finale', provider: 'zz-ultimo', nome: 'ZZ: Finale' },
];
const IN_USO = 'm-ai/glm-5.3-flash';

async function apri(page, { modo, modello = IN_USO }) {
  const scritture = [];
  const sessione = { sessionId: SID, taskId: 'libero:default', nome: 'Selettore', avviataAlle: '2026-10-28T07:00:00.000Z', conclusa: true,
    modello, modelId: modello, provider: 'cloud' };
  await page.addInitScript(({ colorMode }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, { colorMode: modo });
  await page.route('**/api/**', (rotta) => {
    const r = rotta.request();
    if (r.method() === 'GET') return rotta.fallback();
    scritture.push(`${r.method()} ${new URL(r.url()).pathname}`);
    return rotta.abort();
  });
  await page.route('**/api/v1/sessions', (route) => route.fulfill({ json: { ok: true, data: { items: [sessione] } } }));
  await page.route(`**/api/v1/sessions/${SID}/events`, (route) => route.fulfill({ contentType: 'text/event-stream',
    body: `retry: 3600000\ndata: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null })}\n\n` }));
  await page.route('**/api/v1/models', (route) => route.fulfill({ json: { ok: true, data: { modelli: CATALOGO, daCache: true } } }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.locator(`[data-real-session-id="${SID}"]`).click();
  return scritture;
}
const foglio = (page) => page.getByRole('dialog');
const lista = (page) => foglio(page).locator('.model-picker-list');
const rigaInUso = (page) => lista(page).locator('.model-picker-option[aria-selected="true"]');
/** Quanto il centro della riga in uso dista dal centro della lista, in pixel (0 = centrata). */
async function scartoDalCentro(page) {
  return lista(page).evaluate((l) => {
    const r = l.querySelector('.model-picker-option[aria-selected="true"]');
    if (!r) return null;
    const a = l.getBoundingClientRect(); const b = r.getBoundingClientRect();
    return Math.abs((b.top + b.height / 2) - (a.top + a.height / 2));
  });
}

for (const modo of ['light', 'dark']) {
  test.describe(`Selettore dei modelli · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    test('SELETTORE-VISTA-01 — all\'apertura il gruppo dell\'autore in uso è aperto, la riga in uso è segnata e sta al centro della lista; il foglio non scorre', async ({ page }) => {
      const scritture = await apri(page, { modo });
      await page.locator('[data-open-sheet="model"]').click();
      await expect(rigaInUso(page)).toHaveCount(1);
      await expect(rigaInUso(page)).toContainText('GLM 5.3 Flash');
      await expect(foglio(page).locator('.model-picker-group-header', { hasText: 'M Ai' })).toHaveAttribute('aria-expanded', 'true');
      await expect(foglio(page).locator('.model-picker-group-header[aria-expanded="true"]')).toHaveCount(1); // solo il suo, non tutti
      await expect.poll(() => scartoDalCentro(page)).toBeLessThan(30);
      expect(await lista(page).evaluate((l) => l.scrollTop), 'la lista è scesa fino a lui').toBeGreaterThan(200);
      expect(await page.evaluate(() => document.scrollingElement.scrollTop), 'la pagina non si è mossa').toBe(0);
      await mkdir(FOTO, { recursive: true });
      await writeFile(path.join(FOTO, `selettore-${modo}.png`), await page.screenshot());
      expect(scritture).toEqual([]);
    });

    test('SELETTORE-VISTA-02 — AL CONTRARIO: chiuso a mano, il gruppo resta chiuso; e una ricerca dopo l\'apertura non riporta la lista sulla riga in uso', async ({ page }) => {
      await apri(page, { modo });
      await page.locator('[data-open-sheet="model"]').click();
      await expect.poll(() => scartoDalCentro(page)).toBeLessThan(30);
      const testata = foglio(page).locator('.model-picker-group-header', { hasText: 'M Ai' });
      await testata.click();
      await expect(foglio(page).locator('.model-picker-group-header', { hasText: 'M Ai' })).toHaveAttribute('aria-expanded', 'false');
      await expect(rigaInUso(page)).toHaveCount(0);
      await lista(page).evaluate((l) => { l.scrollTop = 0; });
      await foglio(page).locator('.model-picker-search input').fill('autore-0');
      expect(await lista(page).evaluate((l) => l.scrollTop), 'la ricerca non tira la lista').toBe(0);
    });

    test('SELETTORE-VISTA-02b — AL CONTRARIO: aprire a mano un altro gruppo, con la riga in uso ancora nella lista, non riporta la lista su di lei', async ({ page }) => {
      await apri(page, { modo });
      await page.locator('[data-open-sheet="model"]').click();
      await expect.poll(() => scartoDalCentro(page)).toBeLessThan(30);
      await lista(page).evaluate((l) => { l.scrollTop = 0; });
      await foglio(page).locator('.model-picker-group-header', { hasText: 'A Autore 00' }).click();
      await expect(foglio(page).locator('.model-picker-group-header', { hasText: 'A Autore 00' })).toHaveAttribute('aria-expanded', 'true');
      await expect(rigaInUso(page)).toHaveCount(1);
      expect(await lista(page).evaluate((l) => l.scrollTop), 'un ridisegno dopo l\'apertura non tira la lista').toBe(0);
    });

    test('SELETTORE-VISTA-03 — il modello in uso in FONDO al catalogo: la lista scende fino alla fine e la riga si vede per intero', async ({ page }) => {
      await apri(page, { modo, modello: 'zz-ultimo/finale' });
      await page.locator('[data-open-sheet="model"]').click();
      await expect(rigaInUso(page)).toHaveCount(1);
      await expect.poll(() => lista(page).evaluate((l) => {
        const r = l.querySelector('.model-picker-option[aria-selected="true"]').getBoundingClientRect(); const a = l.getBoundingClientRect();
        return r.top >= a.top && r.bottom <= a.bottom + 1 && l.scrollTop + l.clientHeight >= l.scrollHeight - 1;
      })).toBe(true);
    });

    test('SELETTORE-VISTA-04 — finestra BASSA (il foglio stesso scorre): si muove solo la lista, il foglio e la pagina restano dove sono', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 560 });
      await apri(page, { modo });
      await page.locator('[data-open-sheet="model"]').click();
      await expect(rigaInUso(page)).toHaveCount(1);
      await expect.poll(() => lista(page).evaluate((l) => l.scrollTop)).toBeGreaterThan(0);
      const mossi = await lista(page).evaluate((l) => { const fuori = []; for (let e = l.parentElement; e; e = e.parentElement) if (e.scrollTop > 0) fuori.push(e.className || e.tagName); return fuori; });
      expect(mossi, 'nessun antenato della lista è stato fatto scorrere').toEqual([]);
    });
  });
}
