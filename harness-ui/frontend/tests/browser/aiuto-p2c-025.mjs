import { expect } from '@playwright/test';

import { CONFINE } from './aiuto-confine.mjs';

/* P2-C della PC 0.2.5 (righe 39, 40 e 43): il banco comune delle tre spec `p2c-*-025.spec.mjs`. Server finto, nessuna rete fuori dalla pagina. */

export const NOTA_IMPOSTAZIONI = 'Impostazioni cambiate fuori da questa scheda';
export const CHIAVE_IMPOSTAZIONI = 'talos.harness.desktop.settings.v1';
export const pillola = (page) => page.locator('#schermoChat [data-open-sheet="model"] .talos-chip__label');
export const runtime = (page, fn, arg) => page.evaluate(fn, arg);
export const manda = (page, eventi) => runtime(page, (lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, eventi);

/* ---------- il banco del blocco (39 e 40): una chat con un blocco di scelte, gli eventi li passa la prova ---------- */
export const ID = 'p2c-blocco-025';
export const SCELTE = 'root = Scelte("prossimo", "Prossimo passo", "Come vuoi procedere?", [{testo: "Continua"}, {testo: "Fermati qui"}])';
export const RECINTO = `Ecco:\n\n\`\`\`talos-blocco\n${SCELTE}\n\`\`\`\n\nDimmi tu.`;
export const turno = (i, testo) => [
  { type: 'RunStarted', threadId: ID, runId: `r${i}`, input: { consegna: `Domanda ${i}` } },
  { type: 'TextMessageStart', messageId: `m${i}`, role: 'assistant' },
  { type: 'TextMessageContent', messageId: `m${i}`, delta: testo },
  { type: 'TextMessageEnd', messageId: `m${i}` },
  { type: 'RunFinished', threadId: ID, runId: `r${i}`, outcome: { type: 'success' } },
];

/** `invio`: 'rete' = la richiesta del messaggio non arriva al server (Chromium: «Failed to fetch»); 'ok' = arriva */
export async function bancoBlocco(page, { invio = 'rete' } = {}) {
  page.errori = [];
  page.messaggi = [];
  page.on('pageerror', (e) => page.errori.push(String(e.message)));
  await page.route('**/*', (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') return route.fallback();
    if (new URL(req.url()).pathname.startsWith(`/api/v1/sessions/${ID}`)) {
      const corpo = req.postDataJSON?.() ?? null;
      if (typeof corpo?.messaggio === 'string') {
        page.messaggi.push(corpo.messaggio);
        if (invio === 'rete') return route.abort('failed');
      }
      return route.fulfill({ json: { ok: true, data: { sessionId: ID } } });
    }
    return route.abort();
  });
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta aperta: gli eventi li passa la prova */ });
  await page.addInitScript(([chiave, valore]) => { try { localStorage.setItem(chiave, valore); } catch { /* niente storage */ } },
    [CHIAVE_IMPOSTAZIONI, JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: 'light' }, chat: {}, workspaces: {} })]);
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await runtime(page, (id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Blocco', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' }), ID);
  await manda(page, [...turno(1, RECINTO), { type: 'CUSTOM', name: 'talos.blocco.versione', value: { blocco: 'b1', versione: 1, sorgente: SCELTE, messaggio: 'm1', posizione: 0, quando: '2026-11-22T00:00:00.000Z' } }, CONFINE]);
  await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
  await expect(page.locator('#conversation .gu')).toHaveCount(1);
}
export async function fermo(page) {
  await expect.poll(() => page.evaluate(() => new Promise((fine) => {
    const posizioni = () => [...document.querySelectorAll('*')].filter((n) => n.scrollHeight > n.clientHeight).map((n) => n.scrollTop).join(',');
    const prima = posizioni();
    requestAnimationFrame(() => requestAnimationFrame(() => fine(posizioni() === prima)));
  }))).toBe(true);
}
export async function voceDelMenu(page, blocco, testo) {
  await blocco.scrollIntoViewIfNeeded();
  await fermo(page);
  await blocco.locator('button[aria-haspopup="menu"]').click();
  await page.locator('#menuDelBlocco [role="menuitem"]', { hasText: testo }).click();
}
export const avvisi = (page, testo) => page.locator('.talos-toast:not([hidden])', { hasText: testo });
export const bolle = (page) => page.locator('#conversation .talos-message--user');
export const scrivi = (page, testo) => runtime(page, (t) => { const r = window.__talosHarnessUiRuntime; r.submitPrompt(t); }, testo);

