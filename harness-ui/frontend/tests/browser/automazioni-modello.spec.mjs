import { expect, test } from '@playwright/test';

/*
 * ⛔ 24/09/2026 — decisione owner («come il mobile, subito», memoria `automazioni-modello-salvato-alla-creazione`): il modulo
 * «Nuova automazione» dice con quale modello girerà l'automazione e lo manda con la creazione; senza un modello scelto nella
 * chat lo dice («predefinito del server») e non ne inventa uno. Le prove girano sul server di prova, mai sul 4174.
 */
async function apri(page, { modello }) {
  const creazioni = [];
  await page.route('**/api/v1/tasks', (route) => route.fulfill({ json: { ok: true, data: { items: [{ id: 'verifica-catalogo', difficolta: 'facile' }] } } }));
  await page.route('**/api/v1/automations', async (route) => {
    if (route.request().method() === 'POST') {
      const corpo = JSON.parse(route.request().postData() || '{}');
      creazioni.push(corpo);
      return route.fulfill({ json: { ok: true, data: { id: 'a1', ...corpo, attiva: false, creataAlle: '2026-09-24T18:00:00.000Z' } } });
    }
    return route.fulfill({ json: { ok: true, data: { items: [] } } });
  });
  await page.route('**/api/v1/sessions/auto-sessione/events*', (route) => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' }));
  // Nessun'altra scrittura: i non-GET che non sono la creazione intercettata si fermano e si contano.
  const scritture = [];
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET' && !r.url().endsWith('/api/v1/automations')) { scritture.push(r.method() + ' ' + r.url()); return route.abort(); }
    return route.fallback();
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  // Il modello «scelto nella chat» è quello della sessione aperta, come quando la persona apre una conversazione.
  await page.evaluate((modello) => window.__talosHarnessUiRuntime.passaASessione('auto-sessione', 'workspace', 'Automazioni', modello,
    { conclusa: true, ...(modello ? { modello } : {}) }), modello);
  await page.waitForTimeout(300);
  return { creazioni, scritture };
}

/* Automazioni a due porte (owner 08/10/2026 notte): il foglio è quello v2 — istruzioni libere al posto del task del corpus.
   La decisione del 24/09 sul modello resta identica, e qui si prova insieme alla forma del corpo v2. */
async function compila(foglio) {
  await foglio.locator('[data-auto-foglio-nome]').fill('Rapporto mattutino');
  await foglio.locator('[data-auto-foglio-istruzioni]').fill('Riassumi i commit di ieri.');
  await foglio.locator('[data-auto-foglio-cartella]').fill('C:\\progetto-di-prova');
}

test('R4-AUTO-MODEL-FORM: il modulo dice con quale modello girerà l’automazione e lo manda con la creazione', async ({ page }) => {
  const { creazioni, scritture } = await apri(page, { modello: 'z-ai/glm-5.3-flash' });
  await page.locator('[data-automation-action="new"]').first().evaluate((el) => el.click());
  const foglio = page.locator('#sheetBody');
  await expect(foglio).toContainText('Userà glm-5.3-flash, il modello scelto nella chat.');
  await compila(foglio);
  await foglio.getByRole('button', { name: 'Crea automazione' }).click();
  await expect.poll(() => creazioni.length).toBe(1);
  expect(creazioni[0].modello).toBe('z-ai/glm-5.3-flash');
  expect(creazioni[0]).toMatchObject({ nome: 'Rapporto mattutino', istruzioni: 'Riassumi i commit di ieri.', cartella: 'C:\\progetto-di-prova',
    permessi: 'Workspace write', coordinazione: false, ripeti: null, pianificazione: { tipo: 'giornaliera', ora: '09:00' } });
  expect(typeof creazioni[0].fusoOrario).toBe('string');
  expect(Object.hasOwn(creazioni[0], 'taskId')).toBe(false);
  expect(scritture).toEqual([]);
});

test('R4-AUTO-MODEL-FORM-DEFAULT: senza un modello scelto il modulo lo dice e non ne manda uno inventato', async ({ page }) => {
  const { creazioni } = await apri(page, { modello: null });
  await page.locator('[data-automation-action="new"]').first().evaluate((el) => el.click());
  const foglio = page.locator('#sheetBody');
  await expect(foglio).toContainText('Userà il modello predefinito del server: nella chat non ne hai scelto uno.');
  await compila(foglio);
  await foglio.getByRole('button', { name: 'Crea automazione' }).click();
  await expect.poll(() => creazioni.length).toBe(1);
  expect(Object.hasOwn(creazioni[0], 'modello')).toBe(false);
});

test('R4-AUTO-FORM-REQUIRED: senza nome, istruzioni e cartella il foglio non manda niente e lo dice', async ({ page }) => {
  const { creazioni } = await apri(page, { modello: null });
  await page.locator('[data-automation-action="new"]').first().evaluate((el) => el.click());
  const foglio = page.locator('#sheetBody');
  await foglio.locator('[data-auto-foglio-cartella]').fill('');
  await foglio.getByRole('button', { name: 'Crea automazione' }).click();
  await expect(foglio.locator('[data-auto-foglio-errore]')).toBeVisible();
  await expect(foglio.locator('[data-auto-foglio-nome]')).toBeFocused();
  expect(creazioni).toEqual([]);
});
