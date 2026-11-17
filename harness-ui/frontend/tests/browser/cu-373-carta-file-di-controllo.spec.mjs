import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * Decisione 373, giro 2 (07/11/2026): la carta di un comando della shell che nomina i file di Uso del computer
 *   (`.computer-use-impostazione.json`, `.computer-use-luoghi.json`). Il cancello del registro (`cancelloShellDelComputerUse`,
 *   session-registry.mjs) la manda con `fileDiControllo` e `sempreNonBasta`: la pagina dice che il comando tocca le impostazioni di
 *   Uso del computer e offre solo «Consenti una volta» e «Nega» (un «sempre» sulla shell non toglierebbe questa carta: F15).
 * ⛔ Evento finto con l'azione VERA del registro (lezione del 26/09). Server di prova di `playwright.config.mjs`, mai il 4174; ogni
 *   scrittura si ferma e si conta. Foto 1920×1080 nei due temi.
 */
const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/cu-373-carta-file-di-controllo/', import.meta.url)));
const SESSIONE = 'cu-373-carta';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const COMANDO = 'echo [] > .computer-use-luoghi.json';
const AZIONE = { tipo: 'shell', comando: COMANDO, fileDiControllo: true, sempreNonBasta: true };
/* Giro 3 (D3): una carta della shell con `sempreNonBasta` ma SENZA `fileDiControllo` (per esempio la carta F15 di un segreto) non
   deve dire «impostazioni di Uso del computer»: la frase segue `fileDiControllo`, non `sempreNonBasta` (app.js, ramo della shell). */
const AZIONE_SOLO_UNA_VOLTA = { tipo: 'shell', comando: 'cat .env', sempreNonBasta: true };

for (const modo of ['light', 'dark']) {
  test.describe(`373 carta della shell sui file di Uso del computer · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    async function prepara(page, lingua, azioneDellaCarta = AZIONE) {
      const traffico = { approve: [], scritture: [] };
      await page.addInitScript(({ colorMode, uiLanguage }) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } }));
      }, { colorMode: modo, uiLanguage: lingua });
      await page.route('**/api/**', (rotta) => {
        if (rotta.request().method() === 'GET') return rotta.fallback();
        traffico.scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
        return rotta.abort();
      });
      await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/events`, () => { /* aperto e muto */ });
      await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/approve`, (route) => {
        traffico.approve.push(route.request().postDataJSON());
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true }, meta: {} }) });
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate(({ id, confine }) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', '373 carta', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash', permessi: 'On request' });
        r.handleRealEvent(confine, r.realSessionState.generation);
      }, { id: SESSIONE, confine: CONFINE });
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
      await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
      await page.evaluate((azione) => {
        const r = window.__talosHarnessUiRuntime;
        r.handleRealEvent({ type: 'ApprovalRequested', requestId: 'cu-373-req', azione, _sequenza: 2 }, r.realSessionState.generation);
      }, azioneDellaCarta);
      return traffico;
    }
    const carta = (page) => page.locator('#conversation [data-c="ApprovalCard"]');
    async function foto(page, nome) {
      await mkdir(CARTELLA_FOTO, { recursive: true });
      await page.evaluate(() => Promise.race([
        Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).map((a) => a.finished.catch(() => null))),
        new Promise((ok) => setTimeout(ok, 3000)),
      ]));
      await writeFile(path.join(CARTELLA_FOTO, nome), await page.screenshot());
    }

    test('CU373-CARTA-01 — in italiano: dice che tocca Uso del computer, mostra il comando, solo «Consenti una volta» e «Nega»', async ({ page }) => {
      const traffico = await prepara(page, 'it');
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page)).toContainText('Vuole eseguire un comando che tocca le impostazioni di Uso del computer (cosa TALOS può fare su questo computer). Solo tu puoi consentirlo, una volta:');
      await expect(carta(page)).toContainText(COMANDO);
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveText(['Consenti una volta', 'Nega']);
      await expect(carta(page)).not.toContainText('Per questa sessione');
      await expect(carta(page)).not.toContainText('fileDiControllo');
      await foto(page, `cu373-carta-it-${modo}.png`);
      await carta(page).getByRole('button', { name: 'Consenti una volta' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0]).toEqual({ requestId: 'cu-373-req', approvato: true });
      expect(traffico.scritture).toEqual([]);
    });

    test('CU373-CARTA-02 — in inglese, lo stesso; «Deny» manda un no', async ({ page }) => {
      const traffico = await prepara(page, 'en');
      await expect(carta(page)).toContainText('It wants to run a command that touches the Computer use settings (what TALOS may do on this computer). Only you can allow it, one time:');
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveText(['Allow once', 'Deny']);
      await foto(page, `cu373-carta-en-${modo}.png`);
      await carta(page).getByRole('button', { name: 'Deny' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0]).toEqual({ requestId: 'cu-373-req', approvato: false });
      expect(traffico.scritture).toEqual([]);
    });

    test('CU373-CARTA-03 — al contrario: «sempreNonBasta» senza «fileDiControllo» è la carta ordinaria della shell, una volta sola', async ({ page }) => {
      await prepara(page, 'it', AZIONE_SOLO_UNA_VOLTA);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page)).toContainText('Vuole eseguire questo comando nel terminale:');
      await expect(carta(page)).not.toContainText('Uso del computer');
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveText(['Consenti una volta', 'Nega']);
    });
  });
}
