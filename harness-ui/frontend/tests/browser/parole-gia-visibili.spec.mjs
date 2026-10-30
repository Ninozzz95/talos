import { expect, test } from '@playwright/test';

/*
 * 28/10/2026 — LE PAROLE GIÀ VISIBILI NON SI RICOLORANO (vedi `tests/unit/parole-gia-visibili-28-10.test.mjs`).
 * Nata da una sonda chiesta dal Mobile (regola delle tre app): sul telefono il messaggio finale ripartiva da opacità 0. Il desktop
 * alla FINE non lo fa (PAROLE-VISIBILI-B3), ma ne aveva un altro: al pezzo che arriva dopo una pausa le ultime parole già a schermo
 * tornavano a salire dal trasparente (misurato: 0,42 · 0,69 · 0,84 · 0,92 · 0,99, dall'ultima indietro).
 * La dissolvenza è sul COLORE (`streaming-fluido.css:24-29`): si legge l'alfa del colore calcolato di ogni `.stream-word`,
 * fotogramma per fotogramma. ⛔ Lo strumento si prova ogni volta (B1): le parole che arrivano DEVONO vedersi sotto 1, o la misura
 * non può smentire niente.
 */
const alfa = (colore) => {
  const m = colore.match(/\/\s*([\d.]+%?)\s*\)$/u) ?? colore.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/u);
  if (!m) return 1;
  return m[1].endsWith('%') ? Number(m[1].slice(0, -1)) / 100 : Number(m[1]);
};

async function campiona(page, durataMs, eventi) {
  return page.evaluate(({ durataMs, eventi, sorgenteAlfa }) => new Promise((fatto) => {
    const alfa = new Function(`return (${sorgenteAlfa})`)();
    const runtime = window.__talosHarnessUiRuntime;
    const g = runtime.realSessionState.generation;
    for (const evento of eventi) runtime.handleRealEvent(evento, g);
    const minimi = new Map();
    const inizio = performance.now();
    const giro = () => {
      const nodi = document.querySelectorAll('#conversation .assistant-copy');
      const n = nodi[nodi.length - 1];
      for (const w of n.querySelectorAll('.stream-word')) minimi.set(w.textContent, Math.min(minimi.get(w.textContent) ?? 1, alfa(getComputedStyle(w).color)));
      if (performance.now() - inizio < durataMs) requestAnimationFrame(giro);
      else fatto([...minimi].filter(([, a]) => a < 0.98));
    };
    requestAnimationFrame(giro);
  }), { durataMs, eventi, sorgenteAlfa: alfa.toString() });
}

async function apri(page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('**/api/v1/sessions/parole-visibili-*/events*', () => { /* aperto e muto */ });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  const animazione = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('parole-visibili-uno', 'workspace', 'Parole visibili', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, runtime.realSessionState.generation);
    const g = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Scrivi una risposta' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' } }, g);
    runtime.handleRealEvent({ type: 'TextMessageStart', messageId: 'm1' }, g);
    return document.documentElement.dataset.talosStreamingAnimation ?? null;
  });
  expect(animazione, 'premessa: la dissolvenza di serie').toBe('fade');
}

const PRIMA = 'Prima parte della risposta che scorre. ';
const giaVisibile = (pezzo) => PRIMA.includes(pezzo.trim()) && pezzo.trim() !== '';

test('PAROLE-VISIBILI-B1 — strumento: le parole che arrivano salgono dal trasparente', async ({ page }) => {
  await apri(page);
  const salite = await campiona(page, 1500, [{ type: 'TextMessageContent', messageId: 'm1', delta: PRIMA }]);
  expect(salite.length, JSON.stringify(salite)).toBeGreaterThan(3);
});

test('PAROLE-VISIBILI-B2 — dopo una pausa, il pezzo nuovo sale da solo: nessuna parola già a schermo si ricolora', async ({ page }) => {
  await apri(page);
  await campiona(page, 1500, [{ type: 'TextMessageContent', messageId: 'm1', delta: PRIMA }]);
  await page.waitForTimeout(1200); // la pausa: un attrezzo, un modello lento
  const dopo = await campiona(page, 1500, [{ type: 'TextMessageContent', messageId: 'm1', delta: 'Seconda frase, ' }]); // nessun suo pezzo («S», «fr», «frase») sta nel testo di prima: il controllo per testo non li confonde
  expect(dopo.some(([t]) => /Second/u.test(t)), `premessa: il pezzo nuovo sale ${JSON.stringify(dopo)}`).toBe(true);
  expect(dopo.filter(([t]) => giaVisibile(t)), JSON.stringify(dopo)).toEqual([]);
});

test('PAROLE-VISIBILI-B3 — alla fine della risposta niente si ricolora (il difetto del telefono qui non c\'è)', async ({ page }) => {
  await apri(page);
  await campiona(page, 1500, [{ type: 'TextMessageContent', messageId: 'm1', delta: PRIMA }]);
  await page.waitForTimeout(1200);
  const fine = await campiona(page, 1200, [{ type: 'TextMessageEnd', messageId: 'm1' }, { type: 'RunFinished' }]);
  expect(fine, JSON.stringify(fine)).toEqual([]);
});
