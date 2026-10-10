import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * A13 (owner 10/10/2026, «Sì, come nella CLI»): la carta dei GIRI IN TONDO. Alla 5ª chiamata identica col risultato identico il kernel
 *   chiede alla persona se continuare (`verificaAzioneAutomazione({ tipo: 'giri-in-tondo', strumento, volte })`, talosHarness.mjs), e
 *   il registro aggiunge `sempreNonBasta` (session-registry.mjs, regola F15): «Consenti una volta» e «Nega», mai «Per questa sessione».
 * ⛔ Evento finto col testo VERO del server (lezione del 26/09): l'azione è quella del kernel, più `sempreNonBasta` del registro.
 * ⛔ Server di prova di `playwright.config.mjs`, mai il 4174; ogni scrittura si ferma e si conta. Foto 1920×1080 nei due temi.
 */
const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/a13-giri-in-tondo/', import.meta.url)));
const SESSIONE = 'a13-giri';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const AZIONE = { tipo: 'giri-in-tondo', strumento: 'leggi', volte: 5, toolCallId: 'call-a13-5', sempreNonBasta: true };

for (const modo of ['light', 'dark']) {
  test.describe(`A13 carta dei giri in tondo · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    async function prepara(page, lingua) {
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
        r.passaASessione(id, 'workspace', 'A13 giri in tondo', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash', permessi: 'Workspace write' });
        r.handleRealEvent(confine, r.realSessionState.generation);
      }, { id: SESSIONE, confine: CONFINE });
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
      /* la prima tornata fotografava il velo «Apro la cronologia…» sopra la carta: si aspetta che il ripristino finisca */
      await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
      await page.evaluate((azione) => {
        const r = window.__talosHarnessUiRuntime;
        r.handleRealEvent({ type: 'ApprovalRequested', requestId: 'a13-req', azione, _sequenza: 2 }, r.realSessionState.generation);
      }, AZIONE);
      return traffico;
    }
    const carta = (page) => page.locator('#conversation [data-c="ApprovalCard"]');
    /* la foto ad animazione FINITA (lezione della spec C2b: la carta ritratta a metà della comparsa esce sbiadita), al massimo 3 s */
    async function foto(page, nome) {
      await mkdir(CARTELLA_FOTO, { recursive: true });
      await page.evaluate(() => Promise.race([
        Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).map((a) => a.finished.catch(() => null))),
        new Promise((ok) => setTimeout(ok, 3000)),
      ]));
      await writeFile(path.join(CARTELLA_FOTO, nome), await page.screenshot());
    }

    test('A13-CARTA-01 — in italiano: cosa chiede, quante volte, il perché, e solo «Consenti una volta» e «Nega»', async ({ page }) => {
      const traffico = await prepara(page, 'it');
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page)).toContainText('Chiede se continuare');
      await expect(carta(page)).toContainText(/Il modello ripete la stessa chiamata: .+, con gli stessi argomenti e lo stesso risultato, 5 volte di fila\. Lo lascio continuare\?/u);
      await expect(carta(page).locator('.talos-approval__motivo')).toHaveText('Te lo chiede TALOS perché fra queste chiamate non è cambiato niente. Con «Nega» il giro si ferma qui.');
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveText(['Consenti una volta', 'Nega']);
      await expect(carta(page)).not.toContainText('giri-in-tondo'); // niente nomi tecnici a schermo
      await foto(page, `a13-carta-it-${modo}.png`);
      await carta(page).getByRole('button', { name: 'Nega' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0]).toEqual({ requestId: 'a13-req', approvato: false });
      expect(traffico.scritture).toEqual([]);
    });

    test('A13-CARTA-02 — in inglese, lo stesso', async ({ page }) => {
      await prepara(page, 'en');
      await expect(carta(page)).toContainText('Asks whether to go on');
      await expect(carta(page)).toContainText(/The model repeats the same call: .+, with the same arguments and the same result, 5 times in a row\. Let it go on\?/u);
      await expect(carta(page).locator('.talos-approval__motivo')).toHaveText('TALOS asks because nothing changed between these calls. With “Deny” the run stops here.');
      await foto(page, `a13-carta-en-${modo}.png`);
    });
  });
}
