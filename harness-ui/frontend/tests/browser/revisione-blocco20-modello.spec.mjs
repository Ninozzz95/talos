import { test, expect } from '@playwright/test';

/* Revisione avversaria del Blocco 20: dopo un cambio di modello chi resta indietro? Solo misure, ogni non-GET si ferma. File temporaneo col prefisso _rev20-. */
const ID = 'rev20-modello';
const A = 'z-ai/glm-5.3-flash';
const B = 'xiaomi/mimo-v2.6-flash';
const CATALOGO = [
  { id: A, provider: 'z-ai', nome: 'Z.ai: GLM 5.3 Flash', contextLength: 202_752, prezzoPrompt: '0.00000006', prezzoCompletion: '0.0000004', inputModalities: ['text'], supportedParameters: ['tools'] },
  { id: B, provider: 'xiaomi', nome: 'Xiaomi: MiMo V2.6 Flash', contextLength: 262_144, prezzoPrompt: '0.0000001', prezzoCompletion: '0.0000003', inputModalities: ['text'], supportedParameters: ['tools'] },
];

async function apri(page) {
  await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode: 'dark', uiLanguage: 'it' } })); } catch { /* */ } });
  await page.route('**/api/v1/models', (rotta) => rotta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { modelli: CATALOGO } }) }));
  await page.route('**/api/v1/**', async (rotta) => {
    if (rotta.request().method() === 'GET') return rotta.fallback();
    const url = rotta.request().url();
    if (url.endsWith('/settings')) {
      const corpo = JSON.parse(rotta.request().postData() ?? '{}');
      return rotta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { sessionId: ID, istantanea: { modello: corpo.modello, modelId: corpo.modello, reasoning: null, permessi: 'Workspace write', modalitaOperativa: 'normale', permessiPerAttrezzo: {}, versione: 50 } } }) });
    }
    return rotta.abort();
  });
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta pending */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate(({ id, a }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Rev20', a, { conclusa: false, modello: a, permessi: 'Workspace write', versioneImpostazioni: 10 });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
    r.handleRealEvent({ type: 'RunStarted', threadId: id, runId: 'r1', contesto: { modello: a }, input: { consegna: 'ciao', origine: 'persona' } }, r.realSessionState.generation);
    r.handleRealEvent({ type: 'RunFinished', threadId: id, runId: 'r1', outcome: { type: 'success' }, result: { detto: 'ok' } }, r.realSessionState.generation);
  }, { id: ID, a: A });
}
const leggi = (page) => page.evaluate(() => {
  const testo = (s) => document.querySelector(s)?.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 160) ?? null;
  return { pillola: testo('[data-open-sheet="model"]'), piede: testo('#sessionsPanel .talos-sidebar__foot'), contesto: testo('#railContesto') };
});
test.use({ viewport: { width: 1920, height: 1080 } });

test('REV20-M1: cambio dal dispositivo', async ({ page }) => {
  await apri(page);
  await page.waitForTimeout(600);
  await page.evaluate(({ b }) => {
    const r = window.__talosHarnessUiRuntime;
    const istantanea = { modello: b, modelId: b, reasoning: null, permessi: 'Workspace write', modalitaOperativa: 'normale', permessiPerAttrezzo: {}, versione: 20 };
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.impostazioni-sessione', _sequenza: 90, value: { modalitaOperativa: 'normale', permessi: 'Workspace write', motivo: 'impostazioni', origine: { tipo: 'dispositivo', dispositivoId: 'd-1' }, istantanea } }, r.realSessionState.generation);
  }, { b: B });
  await page.waitForTimeout(800);
  const dopo = await leggi(page);
  expect(dopo.pillola?.toLowerCase()).toContain('mimo');
  expect.soft(dopo.piede ?? '', 'il piede della barra segue la pillola').not.toContain('Z.AI');
  expect.soft(dopo.contesto ?? '', 'la testata del Contesto segue la pillola').not.toContain('glm');
});

test('REV20-M2: cambio col selettore vero del PC', async ({ page }) => {
  await apri(page);
  await page.waitForTimeout(600);
  await page.locator('[data-open-sheet="model"]').first().click();
  await page.waitForTimeout(1200);
  const opzioni = await page.locator('.model-picker-option').evaluateAll((l) => l.slice(0, 40).map((n) => n.dataset.modelValue));
  test.skip(opzioni.length === 0, 'il server di prova non ha modelli da scegliere');
  await page.locator('.model-picker-group-header', { hasText: 'Xiaomi' }).first().click();
  await page.locator(`.model-picker-option[data-model-value="${B}"]`).first().click();
  await page.locator('.talos-dialog__footer').getByRole('button', { name: 'Fatto' }).click();
  await page.waitForTimeout(800);
  const dopo = await leggi(page);
  expect.soft(dopo.piede ?? '', 'il piede della barra segue la pillola').not.toContain('glm');
  expect.soft(dopo.contesto ?? '', 'la testata del Contesto segue la pillola').not.toContain('glm');
});
