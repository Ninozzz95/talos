import { test, expect } from '@playwright/test';

/*
 * 29/10/2026 — «Segnala un problema» (owner: due porte; destinazione GitHub precompilato; diagnostica «come nel bozzetto»). Sul pacchetto
 * SERVITO, nei due temi, a 1920×1080. La diagnostica del server è INTERCETTATA (la rotta ha le sue prove: tests/segnalazione-*.test.mjs);
 * `window.open` è INTERCETTATO: non si apre niente davvero, si guarda l'indirizzo che si sarebbe aperto.
 */
const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const DIAGNOSTICA = {
  schema: 'talos.segnalazione-diagnostica.v1', versione: '0.1.38', installata: true,
  sistema: { piattaforma: 'windows', nome: 'Windows 11', arch: 'x64' },
  sessione: { modello: 'z-ai/glm-5.3-flash', fornitore: 'openrouter', sforzo: 'medium', permesso: 'Workspace write', terminale: true },
  errori: [{ codice: 'SHELL_TIMEOUT', alle: null }], motoreLocale: false, remoto: false,
};

for (const modo of ['dark', 'light']) {
  test.describe(`tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    async function prepara(page) {
      const diagnostiche = [];
      await page.addInitScript((colorMode) => {
        try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } })); } catch { /* sandbox */ }
        window.__aperti = [];
        window.open = (url) => { window.__aperti.push(String(url)); return null; };
        try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copiato = t; } }, configurable: true }); } catch { /* sola lettura */ }
      }, modo);
      await page.route('**/api/v1/sessions/segnala-proof-*/events', () => { /* aperto e muto */ });
      await page.route('**/api/v1/diagnostica-segnalazione**', async (route) => {
        diagnostiche.push(new URL(route.request().url()).search);
        return route.fulfill({ contentType: 'application/json', body: INVOLUCRO(DIAGNOSTICA) });
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate((id) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'Prova della segnalazione', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
        r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
        for (const e of [
          { type: 'RunStarted', input: { consegna: 'il terminale si blocca coi test, segnalalo' }, _sequenza: 1 },
          { type: 'ToolCallStart', toolCallId: 'call-s1', toolCallName: 'report_problem', _sequenza: 2 },
          { type: 'ToolCallResult', toolCallId: 'call-s1', content: 'Draft shown to the person: nothing was sent. The person reviews it and opens it on GitHub if they want.', _sequenza: 3 },
          { type: 'CUSTOM', name: 'talos.segnalazione-bozza', value: { toolCallId: 'call-s1', kind: 'bug', title: 'Il terminale si blocca coi test',
            description: 'L\'agente ha lanciato npm test e la riga è rimasta in corso per 5 minuti.', at: new Date().toISOString() }, _sequenza: 4 },
          { type: 'TextMessageStart', messageId: 'm1', role: 'assistant', _sequenza: 5 },
          { type: 'TextMessageContent', messageId: 'm1', delta: 'Ho preparato la segnalazione: rileggila prima di aprirla.', _sequenza: 6 },
          { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 7 },
          { type: 'RunFinished', _sequenza: 8 },
        ]) r.handleRealEvent(e, r.realSessionState.generation);
      }, `segnala-proof-${modo}`);
      await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/);
      return diagnostiche;
    }
    const finestra = (page) => page.locator('dialog.td-modal[data-segnala-problema]');

    test(`SEGNALA-UI-01 — dal menu della finestra: la finestra vuota, la diagnostica intera, «Apri su GitHub» chiede il titolo (${modo})`, async ({ page }, testInfo) => {
      const diagnostiche = await prepara(page);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('talos:segnala-problema')));
      const f = finestra(page);
      await expect(f).toHaveAttribute('data-segnala-problema', 'menu');
      await expect(f.locator('h2')).toHaveText('Segnala un problema');
      await expect(f.locator('.talos-segnala__origine')).toHaveText('Aperta dal menu: la diagnostica è già pronta.');
      await expect(f.locator('[data-segnala-tipo]')).toHaveText(['Qualcosa non funziona', 'Risposta sbagliata del modello', 'Un’idea']);
      await expect(f.locator('[data-segnala-tipo="bug"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(f.locator('[data-segnala-titolo]')).toHaveValue('');
      await expect(f.locator('[data-segnala-diagnostica]')).toHaveText([
        'TALOS desktop 0.1.38 (Windows 11, x64)', 'Modello: z-ai/glm-5.3-flash via openrouter · sforzo Medio',
        'Accesso: Scrive nel progetto · Terminale acceso', 'Ultimi errori: SHELL_TIMEOUT', 'Motore locale: spento · Controllo remoto: spento',
      ].join('\n'));
      await expect(f.locator('.talos-segnala__privacy')).toContainText('La segnalazione su GitHub è pubblica.');
      expect(diagnostiche).toEqual([`?sessionId=segnala-proof-${modo}`]);
      await page.mouse.move(1900, 1070);
      await page.screenshot({ path: testInfo.outputPath(`1-menu-${modo}.png`) });
      await f.locator('[data-segnala-apri]').click();
      await expect(f.locator('.talos-segnala__esito')).toHaveText('Scrivi un titolo, poi apri su GitHub.');
      await expect(f.locator('[data-segnala-titolo]')).toBeFocused();
      expect(await page.evaluate(() => window.__aperti)).toEqual([]);
      // un'idea, senza diagnostica: il campo non parte
      await f.locator('[data-segnala-tipo="idea"]').click();
      await f.locator('[data-segnala-titolo]').fill('Una scorciatoia per la Libreria');
      await f.locator('[data-segnala-allega]').click();
      await expect(f.locator('[data-segnala-allega]')).not.toBeChecked();
      await f.locator('[data-segnala-apri]').click();
      const [url] = await page.evaluate(() => window.__aperti);
      const u = new URL(url);
      expect(`${u.origin}${u.pathname}`).toBe('https://github.com/Ninozzz95/talos/issues/new');
      expect(u.searchParams.get('template')).toBe('desktop.yml');
      expect(u.searchParams.get('title')).toBe('[Idea] Una scorciatoia per la Libreria');
      expect(u.searchParams.has('diagnostica')).toBe(false);
      await expect(f.locator('.talos-segnala__esito')).toHaveText('Aperta nel browser: la invii tu da GitHub, col tuo account.');
    });

    test(`SEGNALA-UI-02 — dalla chat: la carta della bozza, «Rivedi e apri» apre la finestra compilata, «Apri su GitHub» con la diagnostica (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      const carta = page.locator('[data-segnalazione-bozza="call-s1"]');
      await expect(carta).toHaveCount(1);
      await expect(carta.locator('.talos-segnala-carta__titolo')).toHaveText('Bozza di segnalazione · Problema');
      await expect(carta.locator('.talos-segnala-carta__bozza')).toHaveText('«Il terminale si blocca coi test»');
      await carta.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`2-carta-${modo}.png`) });
      await carta.locator('[data-segnala-rivedi]').click();
      const f = finestra(page);
      await expect(f).toHaveAttribute('data-segnala-problema', 'chat');
      await expect(f.locator('.talos-segnala__origine')).toHaveText('Preparata dal modello in chat: rileggila prima di aprirla.');
      await expect(f.locator('[data-segnala-titolo]')).toHaveValue('Il terminale si blocca coi test');
      await expect(f.locator('[data-segnala-descrizione]')).toHaveValue('L\'agente ha lanciato npm test e la riga è rimasta in corso per 5 minuti.');
      await expect(f.locator('[data-segnala-allega]')).toBeChecked();
      await expect(f.locator('[data-segnala-diagnostica]')).toContainText('TALOS desktop 0.1.38');
      await page.mouse.move(1900, 1070);
      await page.screenshot({ path: testInfo.outputPath(`3-finestra-${modo}.png`) });
      await f.locator('[data-segnala-copia]').click();
      await expect(f.locator('.talos-segnala__esito')).toHaveText('Copiato.');
      expect(await page.evaluate(() => window.__copiato)).toMatch(/^\[Bug\] Il terminale si blocca coi test\n\nL'agente[\s\S]*\n\nDiagnostica:\nTALOS desktop 0\.1\.38/u);
      await f.locator('[data-segnala-apri]').click();
      const [url] = await page.evaluate(() => window.__aperti);
      const u = new URL(url);
      expect([...u.searchParams.keys()]).toEqual(['template', 'title', 'cosa', 'diagnostica']);
      expect(u.searchParams.get('title')).toBe('[Bug] Il terminale si blocca coi test');
      expect(u.searchParams.get('cosa')).toBe('L\'agente ha lanciato npm test e la riga è rimasta in corso per 5 minuti.');
      expect(u.searchParams.get('diagnostica')).toContain('Accesso: Scrive nel progetto · Terminale acceso');
      expect(url.length).toBeLessThanOrEqual(6000);
    });

    test(`SEGNALA-UI-04 — una descrizione troppo lunga per l'indirizzo: la finestra lo dice PRIMA di aprire, e l'indirizzo resta sotto il tetto (${modo})`, async ({ page }) => {
      await prepara(page);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('talos:segnala-problema')));
      const f = finestra(page);
      await expect(f.locator('[data-segnala-diagnostica]')).toContainText('TALOS desktop 0.1.38');
      await expect(f.locator('.talos-segnala__taglio')).toBeHidden();
      await f.locator('[data-segnala-titolo]').fill('Lungo');
      await f.locator('[data-segnala-descrizione]').fill('è'.repeat(1500));
      await expect(f.locator('.talos-segnala__taglio')).toHaveText('La descrizione è troppo lunga per l’indirizzo: su GitHub arriva accorciata. «Copia il testo» la copia intera.');
      await f.locator('[data-segnala-apri]').click();
      const [url] = await page.evaluate(() => window.__aperti);
      expect(url.length).toBeLessThanOrEqual(6000);
      expect(new URL(url).searchParams.get('cosa').endsWith('…')).toBe(true);
    });

    /* Revisione D del 29/10/2026 (F3): ciò che scrive la persona non si riscrive; una riga avvisa, e il pulsante resta attivo. */
    test(`SEGNALA-UI-05 — una chiave o un percorso scritti dalla persona: la riga d'avviso, il testo intatto, «Apri su GitHub» attivo; tolti, la riga sparisce (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('talos:segnala-problema')));
      const f = finestra(page);
      const riga = f.locator('[data-segnala-privato]');
      await expect(f.locator('[data-segnala-diagnostica]')).toContainText('TALOS desktop 0.1.38');
      await f.locator('[data-segnala-titolo]').fill('Il terminale si blocca');
      await f.locator('[data-segnala-descrizione]').fill('Succede con npm test, due volte su due.');
      await expect(riga).toBeHidden();
      const chiave = ['OPENROUTER', '_API_KEY=abc123secret'].join('');
      await f.locator('[data-segnala-descrizione]').fill(`Ho messo ${chiave} e poi è successo`);
      await expect(riga).toBeVisible();
      await expect(riga).toHaveText('Questo sembra una chiave o il percorso di una cartella: sarà pubblico. Toglilo prima di aprire.');
      await expect(f.locator('[data-segnala-descrizione]')).toHaveValue(`Ho messo ${chiave} e poi è successo`);
      await expect(f.locator('[data-segnala-apri]')).toBeEnabled();
      await page.mouse.move(1900, 1070);
      await page.screenshot({ path: testInfo.outputPath(`5-avviso-${modo}.png`) });
      await f.locator('[data-segnala-descrizione]').fill('Ho messo la chiave e poi è successo');
      await expect(riga).toBeHidden();
      await f.locator('[data-segnala-titolo]').fill('Errore in C:\\Users\\Mario\\progetto');
      await expect(riga).toBeVisible();
      // il testo della persona parte com'è: è una sua scelta, l'avviso l'ha detto
      await f.locator('[data-segnala-apri]').click();
      const [url] = await page.evaluate(() => window.__aperti);
      expect(new URL(url).searchParams.get('title')).toBe('[Bug] Errore in C:\\Users\\Mario\\progetto');
    });

    test(`SEGNALA-UI-03 — «Scarta»: niente si apre, la carta lo dice e lo resta rigiocando la storia (${modo})`, async ({ page }) => {
      await prepara(page);
      const carta = page.locator('[data-segnalazione-bozza="call-s1"]');
      await carta.locator('[data-segnala-scarta]').click();
      await expect(carta.locator('.talos-segnala-carta__azioni')).toHaveText('Bozza scartata: non è stato aperto niente.');
      await expect(carta.locator('[data-segnala-rivedi]')).toHaveCount(0);
      await expect(finestra(page)).toHaveCount(0);
      expect(await page.evaluate(() => window.__aperti)).toEqual([]);
      // lo stesso evento rigiocato non raddoppia la carta
      await page.evaluate(() => {
        const r = window.__talosHarnessUiRuntime;
        r.handleRealEvent({ type: 'CUSTOM', name: 'talos.segnalazione-bozza', value: { toolCallId: 'call-s1', kind: 'bug', title: 'x' }, _sequenza: 4 }, r.realSessionState.generation);
      });
      await expect(page.locator('[data-segnalazione-bozza]')).toHaveCount(1);
      // ricaricando la conversazione la bozza nasce già scartata
      await page.evaluate(() => { document.querySelector('[data-segnalazione-bozza="call-s1"]')?.remove(); });
      await page.evaluate(() => {
        const r = window.__talosHarnessUiRuntime;
        r.handleRealEvent({ type: 'CUSTOM', name: 'talos.segnalazione-bozza', value: { toolCallId: 'call-s1', kind: 'bug', title: 'x' }, _sequenza: 9 }, r.realSessionState.generation);
      });
      await expect(page.locator('[data-segnalazione-bozza="call-s1"] [data-segnala-rivedi]')).toHaveCount(0);
      await expect(page.locator('[data-segnalazione-bozza="call-s1"]')).toContainText('Bozza scartata');
    });
  });
}
