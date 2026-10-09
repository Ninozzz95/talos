import { expect, test } from '@playwright/test';

import { CONFINE, attendiFineStoria } from './aiuto-confine.mjs';

/*
 * ⛔ B3 (09/10/2026, profilo CPU dell'apertura di una chat da 1000 giri) — ogni `RunStarted` della STORIA riscriveva tutte le
 *   preferenze in localStorage (`salvaPreferenzeChatDesktop`: il modo di lavoro del giro), 1000 scritture sincrone per una chat
 *   da 1000 giri, e contava solo l'ultima. Ora in rigiocata si aggiorna la memoria e si salva una volta, al confine.
 * La regola che si fissa: durante la storia le scritture delle preferenze NON crescono col numero dei giri (3 giri e 30 giri
 *   danno lo stesso numero); il valore salvato alla fine è il modo dell'ULTIMO giro; un giro DAL VIVO salva subito.
 */
test.use({ locale: 'it-IT' });
const CHIAVE = 'talos.harness.desktop.settings.v1';
const storia = (giri) => {
  const eventi = [];
  for (let i = 0; i < giri; i += 1) {
    const modo = i === giri - 1 ? 'piano' : (i % 2 === 0 ? 'normale' : 'piano');
    eventi.push({ type: 'RunStarted', input: { consegna: `giro ${i + 1}` }, contesto: { modalitaOperativa: modo, modello: 'z-ai/glm-5.3-flash' } }, { type: 'RunFinished' });
  }
  return [...eventi.map((e, i) => ({ ...e, _sequenza: i + 1 })), CONFINE];
};

async function apri(page, sessione, giri) {
  await page.addInitScript((chiave) => {
    if (window.top !== window) return;
    window.__scritture = [];
    const originale = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === chiave) { try { window.__scritture.push(JSON.parse(v)?.chat?.modalitaOperativa ?? null); } catch { window.__scritture.push('?'); } }
      return originale.call(this, k, v);
    };
  }, CHIAVE);
  await page.route(`**/api/v1/sessions/${sessione}/events*`, (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
    body: `retry: 3600000\n${storia(giri).map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` }));
  await page.route('**/api/v1/**', (route) => (route.request().method() === 'GET' ? route.fallback() : route.abort()));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  const prima = await page.evaluate(() => window.__scritture.length);
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'B3 preferenze', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), sessione);
  await attendiFineStoria(page);
  const dopo = await page.evaluate(() => window.__scritture.slice());
  return { scritture: dopo.slice(prima), salvato: await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}')?.chat?.modalitaOperativa ?? null, CHIAVE) };
}

test('B3-PREFERENZE-01 — in rigiocata le scritture delle preferenze non crescono col numero dei giri', async ({ browser }) => {
  const misure = {};
  for (const giri of [3, 30]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    misure[giri] = await apri(page, `b3-pref-${giri}`, giri);
    await ctx.close();
  }
  expect(misure[30].scritture.length, `3 giri: ${JSON.stringify(misure[3].scritture)} · 30 giri: ${JSON.stringify(misure[30].scritture)}`).toBe(misure[3].scritture.length);
  expect(misure[30].scritture.length, 'al massimo una manciata di scritture per un\'apertura, non una per giro').toBeLessThanOrEqual(3);
  expect(misure[3].salvato, 'il modo salvato è quello dell\'ULTIMO giro della storia').toBe('piano');
  expect(misure[30].salvato).toBe('piano');
});

test('B3-PREFERENZE-02 AL CONTRARIO — un giro DAL VIVO salva subito il suo modo', async ({ page }) => {
  await apri(page, 'b3-pref-vivo', 3);
  const n = await page.evaluate(() => window.__scritture.length);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 500, input: { consegna: 'dal vivo' }, contesto: { modalitaOperativa: 'normale', modello: 'z-ai/glm-5.3-flash' } }, r.realSessionState.generation);
  });
  await expect.poll(() => page.evaluate(() => window.__scritture.length)).toBeGreaterThan(n);
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}')?.chat?.modalitaOperativa, CHIAVE)).toBe('normale');
});
