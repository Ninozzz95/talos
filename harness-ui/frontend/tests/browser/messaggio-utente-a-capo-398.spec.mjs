import { expect, test } from '@playwright/test';

/*
 * Decision 398 (owner, 08/11/2026), cure 5: a message of the person written on two lines (Shift+Enter) showed on ONE line in the bubble.
 * The text is kept literal (`creaMessaggioUtente`, components/conversazione.js: text nodes in a `<p>`, the `\n` included), but the
 * paragraph collapsed the line break like any white space. Measured with a Range on the real text: the first letter after the line break
 * must sit on a lower line than the first letter of the message, at the same left edge.
 * The bubble is drawn when the server's `RunStarted` brings the message back (`appendRealTaskStart` for the first message,
 * `appendUserFollowUp` for a follow-up, legacy/app.js), live and on a reload alike: the test plays that event, with the shape of
 * `blocchi-chat.spec.mjs` (BLOCCHI-CHAT-05). The composer's own Shift+Enter is not under test here (the field keeps the `\n`; an
 * answer to the send faked by a route left the message «in queue», so the bubble never came from that path in this setup).
 * Isolated server of `playwright.config.mjs` (never the 4174).
 * Hermes keeps the person's line breaks in the bubble (`apps/desktop/src/components/assistant-ui/thread/user-message-text.tsx:158`).
 */
const ID = 'utente-a-capo-398';
const PRIMA = 'Ciao,'; // short lines: at 390 wide a long line would wrap by itself and hide the missing break
const SECONDA = 'tutto bene?';

async function apri(page) {
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* aperto e muto */ });
  await page.route('**/api/v1/**', (route) => (route.request().method() !== 'GET' ? route.abort() : route.fallback()));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'A capo', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, ID);
  await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
}
/** the server's turns: the first carries the first message, the second a follow-up */
const giri = (primo, seguito) => [
  { type: 'RunStarted', threadId: ID, runId: 'r1', input: { consegna: primo } },
  { type: 'RunFinished', threadId: ID, runId: 'r1', outcome: { type: 'success' } },
  ...(seguito ? [
    { type: 'RunStarted', threadId: ID, runId: 'r2', input: { consegna: seguito, seguito: true } },
    { type: 'RunFinished', threadId: ID, runId: 'r2', outcome: { type: 'success' } },
  ] : []),
];
const manda = (page, eventi) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, eventi);

/** where the first letter of each line of a bubble sits: a Range on the text node that holds the line break */
const posizioni = (p) => p.evaluate((p) => {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const a = n.textContent.indexOf('\n');
    if (a < 0) continue;
    const r = document.createRange();
    r.setStart(n, 0); r.setEnd(n, 1);
    const sopra = r.getBoundingClientRect();
    r.setStart(n, a + 1); r.setEnd(n, a + 2);
    const sotto = r.getBoundingClientRect();
    return { testo: p.textContent, primaTop: sopra.top, secondaTop: sotto.top, primaLeft: sopra.left, secondaLeft: sotto.left, alto: sopra.height, ws: getComputedStyle(p).whiteSpace };
  }
  return { testo: p.textContent, primaTop: null };
});

for (const [larghezza, altezza] of [[1920, 1080], [390, 844]]) {
  test(`UTENTE-A-CAPO-398-01 (${larghezza}) a two-line message, first and follow-up, keeps its second line on a new line`, async ({ page }) => {
    await page.setViewportSize({ width: larghezza, height: altezza });
    await apri(page);
    await manda(page, giri(`${PRIMA}\n${SECONDA}`, `${SECONDA}\n${PRIMA}`));
    const bolle = page.locator('#conversation .talos-message--user .talos-message__body p');
    await expect(bolle, 'premise: two bubbles, the first message and the follow-up').toHaveCount(2);
    for (const [i, atteso] of [[0, `${PRIMA}\n${SECONDA}`], [1, `${SECONDA}\n${PRIMA}`]]) {
      const m = await posizioni(bolle.nth(i));
      expect(m.testo, 'premise: the text in the bubble is literal, line break included').toBe(atteso);
      expect(m.primaTop).not.toBeNull();
      expect(m.secondaTop - m.primaTop, `bubble ${i}: ${JSON.stringify(m)}`).toBeGreaterThanOrEqual(m.alto * 0.8);
      expect(Math.abs(m.secondaLeft - m.primaLeft), `bubble ${i}, the second line starts at the left edge too: ${JSON.stringify(m)}`).toBeLessThan(2);
    }
  });
}

test('UTENTE-A-CAPO-398-02 AL CONTRARIO: a one-line message stays one line (no extra space, no break added)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page);
  await manda(page, giri(`${PRIMA} ${SECONDA}`));
  const p = page.locator('#conversation .talos-message--user .talos-message__body p').last();
  await expect(p).toHaveText(`${PRIMA} ${SECONDA}`);
  const righe = await p.evaluate((n) => { const r = document.createRange(); r.selectNodeContents(n); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; });
  expect(righe).toBe(1);
});
