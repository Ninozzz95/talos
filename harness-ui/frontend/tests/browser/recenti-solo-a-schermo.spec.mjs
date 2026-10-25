import { test, expect } from '@playwright/test';

/*
 * Owner 23/10/2026 sera e notte (mobile e desktop): nell'elenco delle conversazioni una riga è evidenziata SOLO quando quella chat è
 * sullo schermo; e una chat il cui ultimo giro è finito in errore si dice «to resume» / «da riprendere», ambra, non «error» rosso.
 * Elenco e storie finti (ogni richiesta non-GET si ferma e si conta).
 */
const ev = (type, campi) => ({ type, ...campi });
function storia(id, { errore = false } = {}) {
  return [
    ev('RunStarted', { threadId: id, runId: 'r1', input: { consegna: `domanda di ${id}` } }),
    ev('TextMessageStart', { messageId: 'm1', role: 'assistant' }),
    ev('TextMessageContent', { messageId: 'm1', delta: `Risposta di ${id}.` }),
    ev('TextMessageEnd', { messageId: 'm1' }),
    errore ? ev('RunError', { threadId: id, runId: 'r1', message: 'provider unavailable', code: 'errore' }) : ev('RunFinished', { threadId: id, runId: 'r1' }),
  ].map((e, i) => ({ ...e, _sequenza: i + 1 }));
}
const STORIE = { 'recenti-a': storia('recenti-a'), 'recenti-b': storia('recenti-b', { errore: true }) };

async function apri(page, tema = 'dark') {
  const contatore = { nonGet: 0, elenchi: 0 };
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'en' } })); } catch { /* riquadro isolato */ }
  }, tema);
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === '/api/v1/sessions' && req.method() === 'GET') {
      contatore.elenchi += 1;
      return route.fulfill({ json: { ok: true, meta: {}, data: { items: [
        { sessionId: 'recenti-a', nome: 'Chat A', conclusa: true, interrotta: false, ultimoEsito: 'successo', avviataAlle: '2026-10-23T20:00:00.000Z', ultimaRispostaAlle: new Date().toISOString() },
        { sessionId: 'recenti-b', nome: 'Chat B', conclusa: true, interrotta: false, ultimoEsito: 'errore', motivoChiusura: 'errore', avviataAlle: '2026-10-23T19:00:00.000Z' },
      ] } } });
    }
    const m = /^\/api\/v1\/sessions\/(recenti-[ab])\/(events|metrics)$/u.exec(p);
    if (m) {
      if (m[2] === 'metrics') return route.fulfill({ json: { ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {} }, meta: {} } });
      const corpo = [...STORIE[m[1]], { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${corpo}` });
    }
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  return contatore;
}
const riga = (page, id) => page.locator(`#sessionList .talos-session-item[data-real-session-id="${id}"]`);

test('RECENTI-01 — evidenziata solo a schermo: aperta la chat sì; Impostazioni e Board no; tornando alla chat di nuovo sì', async ({ page }) => {
  const c = await apri(page);
  await expect(riga(page, 'recenti-a')).toBeVisible({ timeout: 10_000 });
  await riga(page, 'recenti-a').click();
  await expect(page.locator('#schermoChat')).toBeVisible();
  await expect(riga(page, 'recenti-a')).toHaveAttribute('aria-current', 'true');
  await page.locator('[data-vaia="impostazioni"]:visible').first().click();
  await expect(riga(page, 'recenti-a')).not.toHaveAttribute('aria-current', /.*/u);
  await expect(page.locator('#sessionList .talos-session-item[aria-current]')).toHaveCount(0);
  await page.locator('[data-vaia="board"]:visible').first().click();
  await expect(page.locator('#sessionList .talos-session-item[aria-current]')).toHaveCount(0);
  /* AL CONTRARIO: tornando alla chat la riga si riaccende */
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(riga(page, 'recenti-a')).toHaveAttribute('aria-current', 'true');
  expect(c.nonGet).toBe(0);
});

test('RECENTI-02 — l\'ultimo giro in errore: «to resume» col pallino ambra e il titolo che dice dell\'errore; mai «error» rosso', async ({ page }) => {
  const c = await apri(page);
  const b = riga(page, 'recenti-b');
  await expect(b).toBeVisible({ timeout: 10_000 });
  await expect(b).toContainText('to resume');
  await expect(b).not.toContainText(/\berror\b/u);
  await expect(b.locator('.talos-dot--warning')).toHaveCount(1);
  await expect(b.locator('.talos-dot--danger')).toHaveCount(0);
  await expect(b).toHaveAttribute('title', /stopped on an error/u);
  expect(c.nonGet).toBe(0);
});

const accese = (page) => page.locator('#sessionList .talos-session-item[aria-current]');

test('RECENTI-03 — le schede della sessione (Review) contano come chat a schermo; cambiando chat ne resta accesa una sola', async ({ page }) => {
  const c = await apri(page);
  await riga(page, 'recenti-a').click();
  await riga(page, 'recenti-b').click();
  await expect(riga(page, 'recenti-b')).toHaveAttribute('aria-current', 'true');
  await expect(accese(page)).toHaveCount(1);
  for (const scheda of ['review']) { // il Terminale no: aprirlo avvia una PTY (una richiesta che non si fa in una prova)
    await page.locator(`.talos-screen:not([hidden]) [data-vaia="${scheda}"]:visible`).first().click();
    await expect(accese(page), scheda).toHaveCount(1);
  }
  expect(c.nonGet).toBe(0);
});

test("RECENTI-04 — la chat appena lasciata non prende l'alone «ha appena risposto» quando l'elenco si ridisegna fuori dalla chat", async ({ page }) => {
  test.setTimeout(60_000);
  const c = await apri(page);
  await riga(page, 'recenti-a').click();
  await expect(riga(page, 'recenti-a')).toHaveAttribute('aria-current', 'true');
  await expect(riga(page, 'recenti-a')).not.toHaveAttribute('data-novita', 'si');
  await page.locator('[data-vaia="impostazioni"]:visible').first().click();
  const prima = c.elenchi;
  await expect.poll(() => c.elenchi, { timeout: 25_000 }).toBeGreaterThan(prima);
  await page.waitForTimeout(500);
  await expect(riga(page, 'recenti-a')).not.toHaveAttribute('data-novita', 'si');
  /* AL CONTRARIO: l'alone c'è ancora per chi ha risposto e NON è la sessione aperta */
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await riga(page, 'recenti-b').click();
  await expect(riga(page, 'recenti-b')).toHaveAttribute('aria-current', 'true');
  await page.locator('[data-vaia="impostazioni"]:visible').first().click();
  const prima2 = c.elenchi;
  await expect.poll(() => c.elenchi, { timeout: 25_000 }).toBeGreaterThan(prima2);
  await expect(riga(page, 'recenti-a')).toHaveAttribute('data-novita', 'si');
  expect(c.nonGet).toBe(0);
});

test('RECENTI-05 — la riga «New · <cartella>» in attesa del primo messaggio: accesa sulla chat vuota, spenta nelle Impostazioni', async ({ page }) => {
  test.setTimeout(60_000);
  const c = await apri(page);
  await page.getByRole('button', { name: 'New session', exact: true }).first().click();
  const invia = page.locator('#workspaceChooser .workspace-chooser-footer button[type="submit"]');
  await invia.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1000);
  if (await invia.isDisabled()) await page.locator('#workspaceChooser [role="treeitem"]').first().click();
  await invia.click();
  const pendente = page.locator('#sessionList .talos-session-item.is-pending');
  await expect(pendente).toHaveCount(1, { timeout: 10_000 });
  await expect(pendente).toHaveAttribute('aria-current', 'true');
  await page.locator('[data-vaia="impostazioni"]:visible').first().click();
  await expect(page.locator('#schermoImpostazioni')).toBeVisible();
  await expect(accese(page)).toHaveCount(0);
  /* e resta spenta anche dopo il ridisegno dell'elenco (il giro successivo) */
  const prima = c.elenchi;
  await expect.poll(() => c.elenchi, { timeout: 25_000 }).toBeGreaterThan(prima);
  await page.waitForTimeout(500);
  await expect(accese(page)).toHaveCount(0);
  /* AL CONTRARIO: tornando alla chat vuota si riaccende */
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(pendente).toHaveAttribute('aria-current', 'true');
  expect(c.nonGet).toBe(0);
});
