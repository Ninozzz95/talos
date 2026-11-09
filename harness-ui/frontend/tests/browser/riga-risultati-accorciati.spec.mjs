import { test, expect } from '@playwright/test';

/*
 * Riga dei risultati accorciati (owner 01/11/2026, FE-049): una riga tenue sotto la risposta, sopra le azioni, una sola. Eventi come li manda il server
 * (`session-registry.mjs`, `EVENTO_RISULTATI_ACCORCIATI`), prima di `RunFinished`.
 */
const ID = 'riga-accorciati';
const giro = (numero) => [
  { type: 'RunStarted', threadId: ID, runId: 'r1' },
  { type: 'TextMessageContent', messageId: 'm1', delta: 'I 26 codici sono qui.' },
  { type: 'CUSTOM', name: 'talos.risultati-accorciati', value: { numero, runId: 'r1' } },
  { type: 'RunFinished', threadId: ID, runId: 'r1', outcome: { type: 'success' } },
];
async function apri(page, lingua) {
  await page.addInitScript((uiLanguage) => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode: 'dark', uiLanguage } })); } catch { /* storage assente */ }
  }, lingua);
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta pending */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Riga accorciati', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, ID);
  await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/);
}
const manda = (page, eventi) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, eventi);

test.use({ viewport: { width: 1920, height: 1080 } });

test('RIGA-ACCORCIATI-PC-01: sotto il testo, sopra le azioni, plurale, tenue', async ({ page }) => {
  await apri(page, 'it');
  await manda(page, giro(3));
  const riga = page.locator('.talos-message > p.talos-message__nota');
  await expect(riga).toHaveText('3 risultati accorciati: TALOS può non aver visto tutto.');
  await expect(riga).toHaveCount(1);
  expect(await riga.evaluate((el) => el.nextElementSibling?.className ?? '')).toMatch(/talos-message__actions/u);
  expect(await riga.evaluate((el) => ({ size: getComputedStyle(el).fontSize, top: getComputedStyle(el).marginTop }))).toEqual({ size: '13px', top: '8px' });
});

test('RIGA-ACCORCIATI-PC-02: singolare in inglese, e un secondo evento dello stesso giro non raddoppia', async ({ page }) => {
  await apri(page, 'en');
  await manda(page, giro(1));
  await manda(page, [{ type: 'CUSTOM', name: 'talos.risultati-accorciati', value: { numero: 1, runId: 'r1' } }]);
  const riga = page.locator('.talos-message > p.talos-message__nota');
  await expect(riga).toHaveText('1 result shortened: TALOS may not have seen everything.');
  await expect(riga).toHaveCount(1);
});

test('RIGA-ACCORCIATI-PC-03 — AL CONTRARIO: un numero che non vale non disegna niente', async ({ page }) => {
  await apri(page, 'it');
  await manda(page, giro(0));
  await expect(page.locator('.talos-message__nota')).toHaveCount(0);
});

test('RIGA-ACCORCIATI-PC-04: riaprendo la conversazione la riga torna, sotto la sua risposta', async ({ page }) => {
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta pending */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate(({ id, eventi }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Riga accorciati', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
    for (const e of eventi) r.handleRealEvent(e, r.realSessionState.generation);
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, { id: ID, eventi: giro(2) });
  await expect(page.locator('#conversation')).not.toHaveClass(/is-restoring/);
  await expect(page.locator('.talos-message > p.talos-message__nota')).toHaveCount(1);
});
