import { expect, test } from '@playwright/test';

/*
 * Owner 28/10/2026 («Lingua: Automatica per dettatura e risposte»; contratto col Mobile, `linguaDelMessaggio`): un messaggio DETTATO è
 * nella lingua del riconoscitore, quindi il PC la dice al server; uno scritto a mano no. E la lingua della dettatura segue
 * l'impostazione anche dopo un cambio (prima si fissava all'apertura dell'app).
 * Il riconoscitore è finto (in Chromium di prova non c'è il servizio vero) e ricorda la lingua con cui è partito.
 * ⛔ Nessuna scrittura vera: ogni richiesta non-GET si ferma; dell'avvio si legge solo il corpo.
 */
async function prepara(page, { replyLanguage = 'auto' } = {}) {
  const avvii = [];
  await page.addInitScript(({ replyLanguage }) => {
    if (window.top !== window) return;
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', replyLanguage }, chat: {}, workspaces: {} }));
    window.__lingueDettatura = [];
    window.__testoDaDettare = 'Hallo, wie geht es dir?';
    class RiconoscitoreFinto {
      start() {
        window.__lingueDettatura.push(this.lang);
        const risultato = Object.assign([{ transcript: window.__testoDaDettare }], { isFinal: true });
        setTimeout(() => this.onresult?.({ results: [risultato] }), 10);
      }
      stop() { setTimeout(() => this.onend?.(), 0); }
    }
    window.webkitSpeechRecognition = RiconoscitoreFinto;
    window.SpeechRecognition = RiconoscitoreFinto;
  }, { replyLanguage });
  await page.route('**/*', (route) => {
    const richiesta = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(richiesta.method())) return route.fallback();
    if (new URL(richiesta.url()).pathname === '/api/v1/sessions/custom') avvii.push(richiesta.postDataJSON());
    return route.abort();
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.evaluate(() => window.__talosHarnessUiRuntime.avviaSessionePendente({ cartellaId: 'default', nomeCartella: 'progetto', modello: 'deepseek:deepseek-chat' }));
  await expect(page.locator('#composerInput')).toBeVisible();
  return avvii;
}

async function detta(page) {
  const mic = page.locator('.composer-mic');
  await mic.dispatchEvent('mousedown');
  await expect(page.locator('#composerInput')).toHaveValue(/Hallo/u);
  await mic.dispatchEvent('mouseup');
}

test('LINGUA-DETTATA-01 — un messaggio dettato porta la lingua del riconoscitore; uno scritto a mano nessuna', async ({ page }) => {
  const avvii = await prepara(page, { replyLanguage: 'de' });
  await detta(page);
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => avvii.length).toBe(1);
  expect(avvii[0].linguaDelMessaggio).toBe('de');
  expect(await page.evaluate(() => window.__lingueDettatura)).toEqual(['de']);
});

test('LINGUA-DETTATA-02 — testo scritto a mano: nessuna lingua; dettato e poi cancellato e riscritto: nessuna', async ({ page }) => {
  const avvii = await prepara(page, { replyLanguage: 'de' });
  await detta(page);
  await page.locator('#composerInput').fill('scritto a mano dopo');
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => avvii.length).toBe(1);
  expect('linguaDelMessaggio' in avvii[0]).toBe(false);
});

test('LINGUA-DETTATA-03 — la dettatura segue un cambio dell\'impostazione senza riaprire l\'app', async ({ page }) => {
  await prepara(page, { replyLanguage: 'de' });
  await page.evaluate(() => {
    const chiave = 'talos.harness.desktop.settings.v1';
    const s = JSON.parse(localStorage.getItem(chiave));
    s.appearance.replyLanguage = 'fr';
    localStorage.setItem(chiave, JSON.stringify(s));
  });
  await detta(page);
  expect(await page.evaluate(() => window.__lingueDettatura)).toEqual(['fr']);
});

test('LINGUA-DETTATA-04 — (revisione del blocco 13) un avvio fallito non perde la lingua: il nuovo tentativo dello stesso testo la porta ancora', async ({ page }) => {
  const avvii = await prepara(page, { replyLanguage: 'de' });
  await detta(page);
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => avvii.length).toBe(1);
  /* ogni POST si ferma (nessuna scrittura vera): l'avvio fallisce, la chat tiene il testo e la persona rimanda */
  await expect(page.locator('#composerInput')).toHaveValue(/Hallo/u, { timeout: 10_000 });
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => avvii.length).toBe(2);
  expect(avvii[1].linguaDelMessaggio).toBe('de');
});
