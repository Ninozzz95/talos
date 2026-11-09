/*
 * FE-010: la chat a lato nella pagina vera, con la rotta finta. Si apre con Ctrl ; e con `/btw`, risponde senza toccare la conversazione, e con un modello
 * locale aspetta il giro.
 */
import { expect, test } from '@playwright/test';

const ID = 'chat-a-lato';
async function apri(page) {
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta pending */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'A lato', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, ID);
  /* Il confine della rigiocata, come a13-carta-giri-in-tondo: senza, la colonna resta `is-restoring` (nascosta) perché gli eventi restano
     in sospeso, e ogni clic trova un pulsante «non visibile». */
  await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
}
const risposta = (corpo, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(corpo) });

test.use({ viewport: { width: 1280, height: 860 } });

test('LATO-CHAT-01 Ctrl ; apre la scheda, una domanda torna nel filo e la conversazione non cambia', async ({ page }) => {
  await apri(page);
  const corpi = [];
  await page.route(`**/api/v1/sessions/${ID}/a-lato`, (r) => { corpi.push(r.request().postDataJSON()); return r.fulfill(risposta({ ok: true, data: { risposta: 'Sta confrontando i numeri.', usage: { prompt_tokens: 100, completion_tokens: 20 } } })); });
  const prima = await page.locator('#conversation').innerText();
  await page.keyboard.press('Control+;');
  await expect(page.locator('#railLato')).toBeVisible();
  await page.locator('#railLato input').fill('com\'e messo il cnfronto?');
  await page.keyboard.press('Enter');
  await expect(page.locator('#railLato .lato-filo')).toContainText('Sta confrontando i numeri.');
  await expect(page.locator('#railLato .lato-piede')).toContainText('sommati alla sessione');
  await expect(page.locator('#railLato')).toContainText('Trasforma in conversazione');
  expect(corpi[0]).toEqual({ domanda: 'com\'e messo il cnfronto?', filo: [] });
  expect(await page.locator('#conversation').innerText()).toBe(prima);
  await page.keyboard.press('Control+;');
  await expect(page.locator('#railLato')).toBeHidden();
});

test('LATO-CHAT-02 `/btw` dal compositore apre la scheda e non arriva alla chat', async ({ page }) => {
  await apri(page);
  await page.route(`**/api/v1/sessions/${ID}/a-lato`, (r) => r.fulfill(risposta({ ok: true, data: { risposta: 'Fatto.', usage: null } })));
  await page.locator('#composerInput').fill('/btw a che punto sei');
  await page.keyboard.press('Enter');
  await expect(page.locator('#railLato .lato-filo')).toContainText('a che punto sei');
  await expect(page.locator('#conversation')).not.toContainText('/btw');
});

test('LATO-CHAT-03 a 390 px resta dentro la pagina', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await apri(page);
  await page.keyboard.press('Control+;');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
