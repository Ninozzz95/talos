import { expect, test } from '@playwright/test';

/*
 * Decision 398 (owner, 08/11/2026), cure 3: the recent-words fade (`avvolgiParoleRecenti`, legacy/app.js) walks back from the end of
 * the answer and wraps every text node it meets in `.stream-word` spans. Past a generative block it went INTO the block: the static
 * note «Un clic manda la tua scelta», the buttons, the question came in word by word like model text. A block is interface drawn by
 * us, like the code-block head already excluded. Measured every frame while the answer streams. Streamdown skips its own frames in
 * the same way (`packages/streamdown/lib/animate.ts:172`, `SKIP_TAGS`).
 */
const ID = 'parole-blocco-398';
const SCELTE = 'root = Scelte("prossimo", null, "Come vuoi procedere?", [{testo: "Continua"}, {testo: "Fermati qui"}])';
const TESTO = `Ecco le opzioni che ti propongo adesso:\n\n\`\`\`talos-blocco\n${SCELTE}\n\`\`\`\n\nDimmi tu quale preferisci fra queste due strade.`;

async function apri(page) {
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* aperto e muto */ });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  const animazione = await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Parole e blocchi', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
    return document.documentElement.dataset.talosStreamingAnimation ?? null;
  }, ID);
  expect(animazione, 'premise: the fade is the default').toBe('fade');
}

/** streams the answer in small pieces, one per frame, and counts every frame the `.stream-word` spans inside and outside a block */
const campiona = (page, durataMs) => page.evaluate(({ testo, durataMs, id }) => new Promise((fatto) => {
  const r = window.__talosHarnessUiRuntime;
  const g = r.realSessionState.generation;
  r.handleRealEvent({ type: 'RunStarted', threadId: id, runId: 'r1', input: { consegna: 'Proponi' } }, g);
  r.handleRealEvent({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' }, g);
  const pezzi = []; for (let i = 0; i < testo.length; i += 8) pezzi.push(testo.slice(i, i + 8));
  const misura = { dentro: 0, fuori: 0, blocchi: 0, esempi: new Set() };
  const inizio = performance.now();
  let finito = false;
  const giro = () => {
    if (pezzi.length) r.handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: pezzi.shift() }, g);
    else if (!finito) { finito = true; r.handleRealEvent({ type: 'TextMessageEnd', messageId: 'm1' }, g); r.handleRealEvent({ type: 'RunFinished', threadId: id, runId: 'r1' }, g); }
    const conv = document.querySelector('#conversation');
    misura.blocchi = Math.max(misura.blocchi, conv.querySelectorAll('.gu').length);
    for (const w of conv.querySelectorAll('.stream-word')) {
      if (w.closest('.gu')) { misura.dentro += 1; if (misura.esempi.size < 6) misura.esempi.add(w.textContent); } else misura.fuori += 1;
    }
    if (performance.now() - inizio < durataMs) requestAnimationFrame(giro);
    else fatto({ ...misura, esempi: [...misura.esempi] });
  };
  requestAnimationFrame(giro);
}), { testo: TESTO, durataMs, id: ID });

test.use({ viewport: { width: 1920, height: 1080 } });

test('PAROLE-BLOCCO-398-01 while the answer streams, no word inside a generative block fades in; the text around it still does', async ({ page }) => {
  await apri(page);
  const m = await campiona(page, 4000);
  expect(m.blocchi, 'premise: the block is drawn while the text streams').toBe(1);
  expect(m.fuori, 'premise (the instrument): the words around the block do fade in').toBeGreaterThan(0);
  expect(m.dentro, `words wrapped inside the block: ${JSON.stringify(m.esempi)}`).toBe(0);
  await expect(page.locator('#conversation .gu-scelte__nota'), 'the static note is there, whole').toHaveCount(1);
});
