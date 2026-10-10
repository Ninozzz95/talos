import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';

/*
 * ⭐ 10/10/2026 — l'affitto fra processi, a schermo (owner 09/10: «Affitto come Hermes»). Una chat aperta qui e tenuta da un altro
 *   processo di TALOS vivo (l'app installata, mentre questa è il 4174): il messaggio non parte, e la persona legge dove è aperta,
 *   nella sua lingua, col testo che resta nel compositore.
 * ⛔ Busta VERA del server (lezione del 26/09): catturata da `http-app.mjs` con un file d'affitto di un altro processo
 *   (`scratchpad/cattura-busta-affitto.mjs`, 10/10/2026), copiata qui senza cambiare una parola.
 * ⛔ Server di prova di `playwright.config.mjs`, mai il 4174; ogni altra scrittura si ferma e si conta. Foto 1920×1080 nei due temi.
 * ⛔ Nelle foto il toast «Collegato di nuovo» è della PROVA: `flussoConConfine` chiude lo stream dopo il confine e l'EventSource
 *   si ricollega (lezione del 26/09). La bolla del messaggio che resta e il compositore vuoto sono come ogni invio rifiutato oggi.
 */
const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/affitto-chat-altrove/', import.meta.url)));
const SESSIONE = 'affitto-altrove';
const BUSTA = {
  ok: false,
  error: {
    code: 'SESSION_LEASED', message: 'This chat is open in another TALOS window', title: 'Open in another TALOS window',
    explanation: 'This chat is running in another TALOS process on this computer, and only one can write to it at a time.',
    action: 'Continue it there, or wait until it finishes and try again.', doctorReference: 'doctor-be06a11acedf',
    params: { sessionId: SESSIONE, pid: 22480, etichetta: 'the TALOS desktop app', presoIl: '2026-10-10T08:01:00.000Z' },
  },
  meta: { schema: 'talos.harness-ui.api.v1', generatedAt: '2026-10-10T07:57:13.491Z' },
};

for (const modo of ['light', 'dark']) {
  test.describe(`affitto: chat aperta altrove · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    async function prepara(page, lingua) {
      const traffico = { resume: 0, impostazioni: 0, scritture: [] };
      await page.addInitScript(({ colorMode, uiLanguage }) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } }));
      }, { colorMode: modo, uiLanguage: lingua });
      await page.route('**/api/**', (rotta) => {
        if (rotta.request().method() === 'GET') return rotta.fallback();
        traffico.scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
        return rotta.abort();
      });
      await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/events`, flussoConConfine);
      await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/resume`, (route) => {
        traffico.resume += 1;
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(BUSTA) });
      });
      // la porta del server rifiuta OGNI scrittura su quella sessione: anche le impostazioni che l'invio salva prima
      await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/settings`, (route) => {
        traffico.impostazioni += 1;
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(BUSTA) });
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate((id) => {
        window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Chat aperta altrove', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash', permessi: 'Workspace write' });
      }, SESSIONE);
      await attendiFineStoria(page);
      // un giro già fatto (qui, prima che l'altra finestra la riprendesse)
      await page.evaluate(() => {
        const r = window.__talosHarnessUiRuntime;
        for (const e of [{ type: 'RunStarted', input: { consegna: 'Ciao' } }, { type: 'RunFinished' }]) r.handleRealEvent(e, r.realSessionState.generation);
      });
      await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
      return traffico;
    }
    async function foto(page, nome) {
      await mkdir(CARTELLA_FOTO, { recursive: true });
      await page.evaluate(() => Promise.race([
        Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).map((a) => a.finished.catch(() => null))),
        new Promise((ok) => setTimeout(ok, 3000)),
      ]));
      await writeFile(path.join(CARTELLA_FOTO, nome), await page.screenshot());
    }

    for (const [lingua, atteso] of [['it', 'Questa chat è aperta in un’altra finestra di TALOS'], ['en', 'This chat is open in another TALOS window']]) {
      test(`AFFITTO-UI-01 (${lingua}) — the message does not leave, and the error card says the chat is open in another TALOS window`, async ({ page }) => {
        const traffico = await prepara(page, lingua);
        const casella = page.getByRole('textbox', { name: lingua === 'it' ? 'Messaggio' : 'Message', exact: true });
        await casella.fill('continua da qui');
        await casella.press('Enter');
        await expect.poll(() => traffico.resume).toBe(1);
        await expect(page.getByText(atteso).first()).toBeVisible();
        await expect(page.locator('#conversation')).toContainText(atteso); // nella carta d'errore della chat, non solo nel toast
        await expect(page.locator('body')).not.toContainText('SESSION_LEASED'); // niente codici a schermo
        await foto(page, `affitto-${lingua}-${modo}.png`);
        expect(traffico.scritture).toEqual([]);
      });
    }
  });
}
