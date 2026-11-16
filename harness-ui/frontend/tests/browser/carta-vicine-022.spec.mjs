import { test, expect } from '@playwright/test';

/*
 * Twin repair of 0.2.2, round 3, after the checker of round 1 (judge v1856, point 1): the two rules for a very long field name hit every
 * `.talos-approval__automazione` (eight pieces use it) and the card of the settings changed size at 150%. The rules must apply ONLY to the
 * list of arguments (`[data-argomenti-dal-testo]`): on the other cards every row keeps the layout of `.talos-kv` (index.css: one line,
 * `flex-wrap: nowrap`, rows that shrink, the name with no width cap).
 * ⛔ Fake events copied from the branch: app_settings from impostazioni-dalla-chat (the checker's VICINE, ctrl-gemella-022-extra.spec.mjs
 *   :23-70), automation_create from automazioni-v2.spec.mjs:328, provider_exclude from the same VICINE. The test server of
 *   playwright.config.mjs, never the 4174; every write is stopped. The measured photos of all eight cards, before and after, are in the
 *   report of round 3 (0 differences outside the argument cards).
 */
const SESSIONE = 'carta-vicine';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const CAMBIO = (chiave, nomeEn, nomeIt, ambito, prima, dopo) => ({ chiave, nome: { en: nomeEn, it: nomeIt, chiave: null }, ambito, dove: 'server', gruppo: null, prima, dopo });
const CATALOGO = { schema: 'talos.app-settings.catalog.v1', voci: [
  { key: 'conversation.reasoningEffort', section: 'conversation', scope: 'conversation', where: 'server', type: 'scelta', values: ['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], group: 'costo', text: { en: 'Reasoning level', it: 'Livello di ragionamento' }, textKey: 'app.modelPicker.reasoningLevel', textKeys: ['app.modelPicker.reasoningLevel'] },
  { key: 'tools.webSearchSource', section: 'tools', scope: 'app', where: 'server', type: 'scelta', values: ['duckduckgo', 'tavily', 'brave', 'searxng', 'custom', 'off'], group: null, text: { en: 'Web search source', it: 'Origine della ricerca web' }, textKey: 'modello.frammenti.impostazioni.webSearchSource', textKeys: ['modello.frammenti.impostazioni.webSearchSource'] },
] };
const BOZZA = { versione: 2, id: '6d825a75-d7d0-4346-80fd-462d817d2cc2', nome: 'Rapporto mattutino', istruzioni: 'Leggi i commit di ieri.', cartella: 'C:\\progetti\\talos',
  modello: 'z-ai/glm-5.3-flash', permessi: 'Workspace write', coordinazione: false, pianificazione: { tipo: 'feriali', ora: '09:00' }, fusoOrario: 'Europe/Rome',
  ripeti: null, eseguite: 0, attiva: true, origine: { tipo: 'interfaccia' }, creataAlle: '2026-10-08T20:00:00.000Z', modificataAlle: '2026-10-08T20:00:00.000Z',
  ultimaEsecuzione: null, prossimaEsecuzione: '2026-10-09T07:00:00.000Z', inAttesaFinoA: null, giroInCorso: null };
const VICINE = {
  impostazioni: { tipo: 'app_settings', azione: 'set', dove: 'pc', revisione: 10012, toolCallId: 'call-s1',
    cambi: [CAMBIO('conversation.reasoningEffort', 'Reasoning level', 'Livello di ragionamento', 'conversation', 'medium', 'high'), CAMBIO('tools.webSearchSource', 'Web search source', 'Origine della ricerca web', 'app', 'tavily', 'duckduckgo')] },
  automazione: { bozza: BOZZA, tipo: 'automation_create', toolCallId: 'call-a1' },
  fornitori: { tipo: 'provider_exclude', fornitore: 'deepinfra', toolCallId: 'call-f1',
    cambi: [{ campo: 'persona', prima: ['novita', 'chutes'], dopo: ['novita', 'chutes', 'deepinfra'] }, { campo: 'di-serie', modello: 'openai/gpt-6-luna', prima: false, dopo: true }] },
};

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, reducedMotion: 'reduce' });
for (const [nomeCarta, azione] of Object.entries(VICINE)) {
  for (const lingua of ['it', 'en']) {
    test(`CARTA-VICINE-01 ${nomeCarta} (${lingua}): the rows of the card keep the layout of .talos-kv, untouched by the long-name rules`, async ({ page }) => {
      const scritture = [];
      await page.addInitScript(({ uiLanguage }) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode: 'light', uiLanguage } }));
      }, { uiLanguage: lingua });
      await page.route('**/api/**', (rotta) => {
        if (rotta.request().method() === 'GET') return rotta.fallback();
        scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
        return rotta.abort();
      });
      await page.route((url) => url.pathname === '/api/v1/app-settings/catalog', (r) => r.fulfill({ contentType: 'application/json', body: INVOLUCRO(CATALOGO) }));
      await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/events`, () => { /* open and silent */ });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate(({ id, confine }) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'Vicine', 'openrouter:model', { conclusa: false, modello: 'openrouter:model', permessi: 'Workspace write' });
        r.handleRealEvent(confine, r.realSessionState.generation);
      }, { id: SESSIONE, confine: CONFINE });
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
      await page.evaluate((a) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'ApprovalRequested', requestId: 'vicina-1', _sequenza: 2, azione: a }, r.realSessionState.generation); }, azione);
      const carta = page.locator('#conversation [data-c="ApprovalCard"]');
      await expect(carta).toHaveCount(1);
      await expect(carta.locator('.talos-approval__automazione .talos-kv').first()).toBeVisible();
      const righe = await carta.evaluate((card) => [...card.querySelectorAll('.talos-approval__automazione .talos-kv')].map((riga) => {
        const s = getComputedStyle(riga); const k = riga.querySelector(':scope > .talos-kv__k'); const sk = k ? getComputedStyle(k) : null;
        return { testo: (k?.textContent ?? '').slice(0, 24), argomenti: !!riga.closest('[data-argomenti-dal-testo]'), wrap: s.flexWrap, shrink: s.flexShrink, maxW: sk?.maxWidth ?? null };
      }));
      expect(righe.length, 'the card has rows of the automation block').toBeGreaterThan(0);
      expect(righe.filter((r) => r.argomenti), 'no list of arguments on this card').toEqual([]);
      for (const r of righe) {
        expect(r.wrap, `${r.testo}: one line, as .talos-kv`).toBe('nowrap');
        expect(r.shrink, `${r.testo}: the row shrinks, as .talos-kv`).toBe('1');
        if (r.maxW !== null) expect(r.maxW, `${r.testo}: no width cap on the name`).toBe('none');
      }
      expect(scritture).toEqual([]);
    });
  }
}
