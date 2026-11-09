import { expect, test } from '@playwright/test';

/*
 * Decision 398 (owner, 08/11/2026), cure 4: the composer placeholder showed the suggestion of ANOTHER chat («Tell me more about
 * relazione.md» in a chat that never read it). The suggestion is taken from the last tool of the finished turn
 * (`suggerimentoDaUltimoAttrezzo`) and lives in a variable of the page, not of the chat. Isolated server of `playwright.config.mjs`
 * (never the 4174); every non-GET is stopped. The events are the server's shapes (`deleghe-0123.spec.mjs`, `giroConDelega`).
 * Hermes re-rolls the placeholder when the conversation changes (`apps/desktop/src/app/chat/composer/hooks/use-composer-placeholder.ts:16-17`).
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const A = 'sugg-chat-a';
const B = 'sugg-chat-b';
const LETTO = 'relazione-trimestrale.md';
const giroConLettura = [
  { type: 'RunStarted', threadId: A, runId: 'ra', input: { consegna: 'Leggi la relazione.', seguito: true } },
  { type: 'ToolCallStart', toolCallId: 'l1', toolCallName: 'leggi' },
  { type: 'ToolCallArgs', toolCallId: 'l1', delta: JSON.stringify({ percorso: LETTO }) },
  { type: 'ToolCallEnd', toolCallId: 'l1' },
  { type: 'ToolCallResult', toolCallId: 'l1', content: '# Relazione\nRicavi in crescita.' },
  { type: 'RunFinished', threadId: A, runId: 'ra' },
];
const giroSenzaAttrezzi = (id) => [
  { type: 'RunStarted', threadId: id, runId: 'rb', input: { consegna: 'Ciao.', seguito: true } },
  { type: 'TextMessageStart', messageId: 'mb', role: 'assistant' },
  { type: 'TextMessageContent', messageId: 'mb', delta: 'Ciao, dimmi pure.' },
  { type: 'TextMessageEnd', messageId: 'mb' },
  { type: 'RunFinished', threadId: id, runId: 'rb' },
];

async function prepara(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode: 'dark', uiLanguage: 'it' } })); } catch {}
  });
  await page.route((url) => /\/sessions\/sugg-chat-[ab]\/events$/u.test(url.pathname), () => { /* resta in sospeso: il confine lo dà la prova */ });
  await page.route('**/api/v1/**', (route) => (route.request().method() !== 'GET' ? route.abort() : route.fallback()));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
}
/** opens chat `id`, closes its (empty) replay, then plays `eventi` live; returns the composer placeholder two frames later */
const apriEGioca = (page, id, eventi = []) => page.evaluate(async ([id, eventi, confine]) => {
  const r = window.__talosHarnessUiRuntime;
  r.passaASessione(id, 'workspace', `Chat ${id}`, 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
  r.handleRealEvent(confine, r.realSessionState.generation);
  for (const e of eventi) r.handleRealEvent(e, r.realSessionState.generation);
  await new Promise((fatto) => requestAnimationFrame(() => requestAnimationFrame(fatto)));
  return document.querySelector('#composerInput').getAttribute('placeholder') || '';
}, [id, eventi, CONFINE]);

test.describe('Il suggerimento del compositore resta nella sua chat', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, locale: 'it-IT' });

  test('SUGG-CHAT-398-01 passing to another chat, the placeholder no longer offers what the previous chat read', async ({ page }) => {
    await prepara(page);
    const inA = await apriEGioca(page, A, giroConLettura);
    expect(inA, 'premise: in chat A the suggestion is there').toContain(LETTO);
    const inB = await apriEGioca(page, B);
    expect(inB).not.toContain(LETTO);
  });

  test('SUGG-CHAT-398-02 a turn with no tool in the other chat does not bring back the previous chat suggestion', async ({ page }) => {
    await prepara(page);
    expect(await apriEGioca(page, A, giroConLettura), 'premise').toContain(LETTO);
    const inB = await apriEGioca(page, B, giroSenzaAttrezzi(B));
    expect(inB).not.toContain(LETTO);
  });

  test('SUGG-CHAT-398-03 AL CONTRARIO: in the same chat the suggestion of its own turn stays', async ({ page }) => {
    await prepara(page);
    await apriEGioca(page, B);
    const inA = await apriEGioca(page, A, giroConLettura);
    expect(inA).toMatch(new RegExp(`Dimmi di più su ${LETTO.replace('.', '\\.')}`, 'u'));
  });
});
