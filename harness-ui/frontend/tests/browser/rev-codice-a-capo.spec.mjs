import { test, expect } from '@playwright/test';

/*
 * Revisione avversaria di «A capo / Una riga» (29/10/2026). Proposta: NON committata. Il blocco vero, nel browser vero: la voce compare
 * solo se una riga sborda, dopo il clic niente sborda più, «Copia» resta il testo grezzo, e la scelta sopravvive al ridisegno della
 * risposta a fine stream. Stessa scena rigiocata di `blocchi-codice-barra-ferma.spec.mjs` (nessuna richiesta non-GET).
 */
const LUNGA = `const valore = ${'"abcdefghij" + '.repeat(40)}"fine";`;
const TESTO = `Ecco:\n\n\`\`\`js\n${LUNGA}\nconst corta = 1;\n\`\`\`\n\nFine.`;
const eventi = [
  { type: 'RunStarted', threadId: 't', runId: 'r1', input: { consegna: 'Scrivi una riga lunga' } },
  { type: 'TextMessageStart', messageId: 'm1', role: 'assistant' },
  { type: 'TextMessageContent', messageId: 'm1', delta: TESTO },
  { type: 'TextMessageEnd', messageId: 'm1' },
  { type: 'RunFinished', threadId: 't', runId: 'r1' },
  { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null },
].map((e, i) => ({ ...e, _sequenza: i + 1 }));

test('REV-A-CAPO-01 — nel browser vero: la voce c\'è, dopo il clic niente sborda, la copia resta grezza, e «Una riga» torna indietro', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' } })));
  let nonGet = 0;
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p.endsWith('/sessions/rev-a-capo/metrics')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {} } }) });
    if (p.endsWith('/sessions/rev-a-capo/events')) return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    if (req.method() !== 'GET') { nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('rev-a-capo', 'workspace', 'A capo', 'prova/modello', { conclusa: true, modello: 'prova/modello' }));
  const blocco = page.locator('#conversation .code-block').first();
  await expect(blocco).toBeVisible({ timeout: 10_000 });
  const sborda = () => blocco.locator('pre').evaluate((pre) => pre.scrollWidth > pre.clientWidth + 1);
  expect(await sborda(), 'premessa: la riga lunga sborda').toBe(true);
  await blocco.locator('.code-block-more').click();
  const voce = page.getByRole('menuitem', { name: 'A capo' });
  await expect(voce).toBeVisible();
  await voce.click();
  await expect(blocco).toHaveClass(/code-block--a-capo/u);
  expect(await sborda(), 'dopo «A capo» nessuna riga sborda').toBe(false);
  await blocco.locator('.code-block-copy').click();
  const copiato = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiato.includes(LUNGA), 'la copia è il testo grezzo, senza a capo aggiunti').toBe(true);
  await blocco.locator('.code-block-more').click();
  await page.getByRole('menuitem', { name: 'Una riga' }).click();
  expect(await sborda()).toBe(true);
  expect(nonGet).toBe(0);
});
