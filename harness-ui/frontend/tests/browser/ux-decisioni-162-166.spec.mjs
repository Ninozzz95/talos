import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/*
 * Decisioni dell'owner 162-166 (04/11/2026) provate sul pacchetto SERVITO, nei DUE temi, a 1920×1080 con le foto:
 *   162 — le parole del rischio della pagina Permessi ovunque (Nuova sessione, foglio dei permessi);
 *   163 — la banda del Laboratorio dice la RAM libera MISURATA, nel formato del telefono, e la card ha la sua parola «liberi»;
 *   164 — «Link dalla chat» in cima a Sicurezza e privacy;
 *   165 — «Seguito» dal dizionario nella testata della domanda;
 *   166 — dopo lo stop la nota dice «Fermato» una volta e porta «Riprendi da dove ti eri fermato», che riprende SENZA messaggio.
 * Le prove a unità (`tests/unit/ux-decisioni-16x.test.mjs`) tengono la logica; qui si guarda che la stessa cosa arrivi a schermo.
 * ⛔ Mai il 4174: `playwright.config.mjs` avvia un server suo, con uno store vuoto e il portachiavi in memoria. L'elenco delle
 *   sessioni e gli eventi della 166 sono INTERCETTATI, come in `elenco-dopo-lo-stop.spec.mjs`.
 */

const FOTO = resolve(process.cwd(), 'artifacts', 'ux-decisioni-162-166');
const MODELLO = 'z-ai/glm-5.3-flash';
const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });

for (const modo of ['dark', 'light']) {
  test.describe(`tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

    async function avvia(page) {
      await page.addInitScript((colorMode) => {
        try {
          localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
            version: 1, appearance: { colorMode, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' }, chat: {}, workspaces: {},
          }));
        } catch { /* un frame in sandbox non ha storage */ }
      }, modo);
    }
    async function vai(page) {
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
    }
    async function foto(page, nome) {
      await mkdir(FOTO, { recursive: true });
      await page.screenshot({ path: resolve(FOTO, `${nome}-${modo === 'dark' ? 'scuro' : 'chiaro'}.png`), animations: 'disabled' });
    }
    const eventi = (page, lista) => page.evaluate((lista) => {
      const r = window.__talosHarnessUiRuntime;
      for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
    }, lista);
    async function impostazioni(page, sezione) {
      await page.evaluate((s) => {
        const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
        const gruppo = voce?.closest('.td-nav-group');
        const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
        if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
        voce?.click();
        if (s) window.__talosHarnessUiRuntime?.setSettingsSection?.(s, { persist: false });
      }, sezione);
      await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
    }

    test(`UXD-166/165 — la nota della fermata, il suo «Riprendi» senza messaggio, poi il «Seguito» (${modo})`, async ({ page }) => {
      const id = `ux166-${modo}`;
      const riprese = [];
      const riga = { taskId: 'workspace', modello: MODELLO, avviataAlle: '2026-11-04T08:00:00.000Z', interrotta: false, usage: null, inAttesaApprovazione: false, sessionId: id, nome: 'Prova della fermata', conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'fermata' };
      await avvia(page);
      await page.route(/\/api\/v1\/sessions(\?.*)?$/, (route) => route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ items: [riga] }) }));
      await page.route(`**/api/v1/sessions/${id}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' }));
      await page.route(`**/api/v1/sessions/${id}/resume`, async (route) => {
        riprese.push(route.request().postDataJSON());
        await route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ sessionId: id }) });
      });
      await vai(page);
      await page.evaluate(([id, modello]) => {
        window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Prova della fermata', modello, { conclusa: true, modello });
      }, [id, MODELLO]);
      await eventi(page, [
        { type: 'RunStarted', input: { consegna: 'Controlla i test e dimmi quanti falliscono' }, _sequenza: 1 },
        { type: 'RunError', code: 'fermato', message: '⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 1.', _sequenza: 2 },
        { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, // come lo manda il server (vedi elenco-dopo-lo-stop.spec.mjs)
      ]);
      await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'));
      const pulsante = page.locator('#conversation').getByRole('button', { name: 'Riprendi da dove ti eri fermato' });
      await expect(pulsante).toBeVisible();
      await expect(pulsante).toHaveCount(1);
      await expect(pulsante).toHaveClass(/talos-button--secondary/);
      // `has` si cerca DENTRO la nota: il locator interno non parte da #conversation
      const nota = page.locator('#conversation .talos-system-note', { has: page.getByRole('button', { name: 'Riprendi da dove ti eri fermato' }) });
      await expect(nota).toContainText('Un messaggio nuovo è una richiesta nuova.');
      // decisione 191: il titolo dice cosa è successo, mai «TALOS» sotto la riga dell autore TALOS
      await expect(nota.locator('.talos-system-note__title')).toHaveText('Hai fermato il giro');
      expect(((await nota.innerText()).match(/Fermato/gu) ?? []).length, '«Fermato» una volta sola').toBe(1);
      await pulsante.hover();
      await foto(page, '166-nota-fermata');

      // il clic riprende SENZA messaggio: la stessa rotta di «Continua adesso», corpo vuoto
      await pulsante.click();
      await expect.poll(() => riprese.length).toBe(1);
      expect(riprese[0]).toEqual({});

      // il giro nuovo chiude il pulsante; la domanda dopo porta «Seguito» nella testata (decisione 165)
      await eventi(page, [{ type: 'RunStarted', input: { consegna: 'Adesso aggiorna solo il README.', seguito: true }, contesto: { permessi: 'Workspace write', modello: MODELLO }, _sequenza: 3 }]);
      await expect(page.locator('#conversation').getByRole('button', { name: 'Riprendi da dove ti eri fermato' })).toHaveCount(0);
      const domanda = page.locator('#conversation .talos-message--user').last();
      await expect(domanda).toContainText('Adesso aggiorna solo il README.');
      await expect(domanda.locator('.talos-message__meta')).toHaveText(/^\d{2}:\d{2} · Seguito/u);
      await expect(page.locator('#conversation')).not.toContainText('Follow-up');
      await foto(page, '165-seguito');
    });

    test(`UXD-164 — «Link dalla chat» è la prima carta di Sicurezza e privacy (${modo})`, async ({ page }) => {
      await avvia(page);
      await vai(page);
      await impostazioni(page, 'privacy');
      const pannello = page.locator('#setting-panel-privacy');
      await expect(pannello).toBeVisible();
      await expect(pannello.locator(':scope > *').first()).toContainText('Link dalla chat');
      await foto(page, '164-sicurezza-e-privacy');
    });

    test(`UXD-162 — Nuova sessione e foglio dei permessi parlano con le parole della pagina Permessi (${modo})`, async ({ page }) => {
      await avvia(page);
      await vai(page);
      await page.locator('#newSessionBtn').click();
      const scrive = page.locator('[data-workspace-permission="Workspace write"]');
      await expect(scrive).toBeVisible();
      await expect(scrive).toContainText('rischio medio');
      await expect(scrive).toContainText('Consigliato');
      await expect(page.locator('[data-workspace-permission="Read only"]')).toContainText('rischio basso');
      await expect(page.locator('[data-workspace-permission="Full access"]')).toContainText('rischio molto alto');
      for (const vecchia of ['Minimo rischio', 'Controllato', 'Alto rischio']) await expect(page.locator('.workspace-chooser-permission', { hasText: vecchia })).toHaveCount(0);
      await scrive.hover();
      await foto(page, '162-nuova-sessione');
      await page.keyboard.press('Escape');
      await page.locator('.talos-nav-item[data-vaia="chat"]').click();
      await page.locator('[data-open-sheet="permissions"]').first().click();
      await expect(page.getByText('rischio medio', { exact: true }).first()).toBeVisible();
      await foto(page, '162-permessi');
    });

    test(`UXD-163 — la banda del Laboratorio: RAM libera misurata, con l ora, in GB come il telefono (${modo})`, async ({ page }) => {
      await avvia(page);
      await vai(page);
      await impostazioni(page, null);
      await page.locator('#setting-tab-models').click();
      await page.locator('#labSchedaSystem').click();
      const banda = page.locator('#modelLabCard [data-lab-banda]');
      await expect(banda.locator('[data-lab-banda-sopra-ram]')).toHaveText(/^RAM libera · misurata alle \d{2}:\d{2}:\d{2}$/u, { timeout: 15_000 });
      await expect(banda.locator('[data-lab-banda-valore]')).toHaveText(/^\d+(?:,\d)?$/u);
      await expect(banda.locator('[data-lab-banda-unita]')).toHaveText(/^(?:MB|GB)$/u);
      await expect(banda.locator('[data-lab-banda-frazione]')).toHaveText(/^su \d+(?:,\d)? GB$/u);
      await expect(banda.locator('[data-lab-banda-track]')).toBeVisible();
      await expect(page.locator('#machineFreeMemoryMetric')).toHaveText(/^\d+(?:,\d)? (?:MB|GB)$/u);
      await expect(page.locator('[data-memory-free-label]')).toHaveText('liberi');
      expect(await banda.innerText()).not.toMatch(/GiB|scenario demo|18,6/u);
      await foto(page, '163-laboratorio');
    });
  });
}
