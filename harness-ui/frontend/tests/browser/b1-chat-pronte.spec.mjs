import { test, expect } from '@playwright/test';

/*
 * ⭐ B1 (owner 10/10/2026, «Le ultime 3, con un tetto di memoria») — LE CHAT TENUTE PRONTE. Misurato sul banco GLM da 300 giri: il
 *   ritorno a una chat lunga passa da 1.648 ms a 8-100 ms (niente più rigiocata). Qui, con flussi finti che rispettano `?after=` come
 *   il server vero (http-app.mjs), si prova che il ritorno è GIUSTO: identico a prima e identico a una ricostruzione completa.
 * ⛔ Server di prova di `playwright.config.mjs`, mai il 4174; ogni scrittura si ferma e si conta.
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };

function storiaDi(sessionId, giri, { aperta = false } = {}) {
  const eventi = [];
  let seq = 0;
  const ev = (type, extra = {}) => eventi.push({ type, _sequenza: ++seq, ...extra });
  for (let g = 1; g <= giri; g += 1) {
    ev('RunStarted', { threadId: sessionId, runId: `r${g}`, input: { consegna: `domanda ${g} di ${sessionId}`, ...(g > 1 ? { seguito: true } : {}) } });
    ev('TextMessageStart', { messageId: `m${g}`, role: 'assistant' });
    // una lista: il turno pesa abbastanza nodi perché la finestra di replay (budget ~900) ne stacchi i più vecchi
    const lista = Array.from({ length: 8 }, (_, i) => `- punto ${i + 1} del giro ${g}`).join('\n');
    ev('TextMessageContent', { messageId: `m${g}`, delta: `Risposta ${g} della chat ${sessionId}, con un po' di testo perché il turno abbia un peso.\n\n${lista}` });
    ev('TextMessageEnd', { messageId: `m${g}` });
    if (!(aperta && g === giri)) ev('RunFinished', { threadId: sessionId, runId: `r${g}`, result: { detto: `Risposta ${g}` } });
  }
  return eventi;
}

async function prepara(page, storie, { dopoIlRitorno = {} } = {}) {
  const traffico = { eventi: [], scritture: [] };
  await page.addInitScript(() => { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode: 'light', uiLanguage: 'it' } })); });
  await page.route('**/api/**', (rotta) => {
    if (rotta.request().method() === 'GET') return rotta.fallback();
    traffico.scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
    return rotta.abort();
  });
  // l'elenco del server conosce le chat finte: la potatura delle pronte (una chat eliminata non resta pronta) le lascia stare
  await page.route((url) => url.pathname === '/api/v1/sessions', (route) => (route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: { ok: true,
    data: { items: Object.keys(storie).map((id) => ({ sessionId: id, nome: `Chat ${id}`, conclusa: id !== 'viva', interrotta: false, avviataAlle: '2026-10-10T08:00:00.000Z' })) }, meta: {} } })));
  await page.route((url) => /\/api\/v1\/sessions\/[^/]+\/events$/u.test(url.pathname), (route) => {
    const url = new URL(route.request().url());
    const id = decodeURIComponent(url.pathname.split('/')[4]);
    const dopo = url.searchParams.has('after') ? Number(url.searchParams.get('after')) : 0;
    traffico.eventi.push({ id, after: url.searchParams.get('after') });
    const tutti = [...(storie[id] ?? []), ...(dopo > 0 ? dopoIlRitorno[id] ?? [] : [])];
    const da = tutti.filter((e) => e._sequenza > dopo);
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `retry: 3600000\n${[...da, CONFINE].map((e) => `id: ${e._sequenza ?? ''}\ndata: ${JSON.stringify(e)}\n\n`).join('')}` });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  return traffico;
}
const apri = async (page, id, { conclusa = true } = {}) => {
  await page.evaluate(({ id, conclusa }) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', `Chat ${id}`, 'z-ai/glm-5.3-flash', { conclusa, interrotta: false, modello: 'z-ai/glm-5.3-flash' }), { id, conclusa });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 10_000 });
  await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/u);
};
/* la colonna senza ciò che cambia fra due disegni dello stesso contenuto (id generati, stili) */
const colonna = (page) => page.evaluate(() => {
  const c = document.querySelector('#conversation').cloneNode(true);
  for (const n of c.querySelectorAll('*')) { n.removeAttribute('style'); n.removeAttribute('id'); }
  return c.innerHTML.replace(/\s+/gu, ' ');
});
const pronte = (page) => page.evaluate(() => window.__talosHarnessUiRuntime.chatPronte());

test('B1-PRONTE-01: coming back to a kept chat asks only for events after its last one, shows no veil, and draws exactly what a full rebuild draws', async ({ page }) => {
  const storie = { lunga: storiaDi('lunga', 30), corta: storiaDi('corta', 1) };
  const traffico = await prepara(page, storie);
  await apri(page, 'lunga');
  const prima = await colonna(page);
  expect(prima).toContain('Risposta 30 della chat lunga');
  // 30 giri = 60 turni: la finestra di replay ne ha staccati, e lo dice «Mostra precedenti»
  await expect(page.locator('.talos-mostra-precedenti')).toHaveCount(1);
  expect(prima).not.toContain('domanda 1 di lunga');
  await apri(page, 'corta');
  expect((await pronte(page)).ids).toEqual(['lunga']);
  const velo = page.evaluate(() => new Promise((ok) => {
    let visto = false;
    const o = new MutationObserver(() => { if (document.querySelector('#conversation')?.classList.contains('is-restoring')) visto = true; });
    o.observe(document.querySelector('#conversation'), { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { o.disconnect(); ok(visto); }, 1500);
  }));
  await apri(page, 'lunga');
  expect(await velo, 'no «Apro la cronologia…» veil: nothing is replayed').toBe(false);
  const richiesteLunga = traffico.eventi.filter((r) => r.id === 'lunga');
  expect(richiesteLunga.map((r) => r.after)).toEqual([null, String(storie.lunga.at(-1)._sequenza)]);
  const tornata = await colonna(page);
  expect(tornata).toBe(prima);
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.eventoTerminaleVisto), 'the run was closed: the composer offers send, not stop').toBe(true);
  /* Review B1 del desktop (P2): `ultimaDomanda` è ciò che «Chiedi di nuovo» rimanda (app.js, il ⋯ della risposta). Se il
     parcheggio non la portasse, tornando a «lunga» dopo «corta» si rimanderebbe in «lunga» la domanda di «corta»: un giro pagato
     col testo sbagliato. */
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.ultimaDomanda), 'the question «Chiedi di nuovo» would resend is this chat\'s').toBe('domanda 30 di lunga');
  // la finestra è tornata con lei: «Mostra precedenti» c'è e porta i turni staccati
  await expect(page.locator('.talos-mostra-precedenti')).toHaveCount(1);
  await page.locator('.talos-mostra-precedenti').click();
  await expect(page.locator('#conversation')).toContainText('domanda 1 di lunga');
  // si riporta la colonna com'era per il confronto con la ricostruzione (stesso punto di partenza)
  await apri(page, 'corta');
  await apri(page, 'lunga');
  expect((await pronte(page)).ids).toEqual(['corta'], 'the chat on screen is no longer kept; the one just left is');
  // la stessa chat ricostruita da capo (come al cambio di lingua): lo stesso disegno
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('lunga', 'workspace', 'Chat lunga', 'z-ai/glm-5.3-flash', { conclusa: true, interrotta: false, modello: 'z-ai/glm-5.3-flash' }, { forza: true }));
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/u);
  expect(traffico.eventi.filter((r) => r.id === 'lunga').at(-1).after, 'forza rebuilds from the start').toBe(null);
  expect(await colonna(page)).toBe(prima);
  expect(traffico.scritture).toEqual([]);
});

test('B1-PRONTE-02: a turn that happened while the chat was kept arrives with ?after and is drawn after the others', async ({ page }) => {
  const storie = { lunga: storiaDi('lunga', 5), corta: storiaDi('corta', 1) };
  const ultima = storie.lunga.at(-1)._sequenza;
  const nuovo = [
    { type: 'RunStarted', _sequenza: ultima + 1, threadId: 'lunga', runId: 'r6', input: { consegna: 'domanda 6 da un\'altra finestra' } },
    { type: 'TextMessageStart', _sequenza: ultima + 2, messageId: 'm6', role: 'assistant' },
    { type: 'TextMessageContent', _sequenza: ultima + 3, messageId: 'm6', delta: 'Risposta 6, arrivata mentre la chat era pronta.' },
    { type: 'TextMessageEnd', _sequenza: ultima + 4, messageId: 'm6' },
    { type: 'RunFinished', _sequenza: ultima + 5, threadId: 'lunga', runId: 'r6', result: { detto: 'Risposta 6' } },
  ];
  await prepara(page, storie, { dopoIlRitorno: { lunga: nuovo } });
  await apri(page, 'lunga');
  await apri(page, 'corta');
  await apri(page, 'lunga');
  await expect(page.locator('#conversation')).toContainText('Risposta 6, arrivata mentre la chat era pronta.');
  const testo = await page.locator('#conversation').innerText();
  expect(testo.indexOf('Risposta 5 della chat lunga')).toBeLessThan(testo.indexOf('Risposta 6, arrivata'));
});

test('B1-PRONTE-03: three chats are kept; the fourth left evicts the oldest, which then rebuilds; the chat you go to is taken before the one you leave is kept', async ({ page }) => {
  const storie = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((id) => [id, storiaDi(id, 2)]));
  const traffico = await prepara(page, storie);
  for (const id of ['a', 'b', 'c', 'd', 'e']) await apri(page, id);
  expect((await pronte(page)).ids).toEqual(['b', 'c', 'd']);
  await apri(page, 'a');
  expect(traffico.eventi.filter((r) => r.id === 'a').map((r) => r.after), 'evicted: rebuilt from the start').toEqual([null, null]);
  expect((await pronte(page)).ids).toEqual(['c', 'd', 'e']);
  // con tre pronte, andare su una di loro la prende PRIMA che la chat lasciata entri: non si scaccia da sola
  await apri(page, 'c');
  expect(traffico.eventi.filter((r) => r.id === 'c').at(-1).after).toBe(String(storie.c.at(-1)._sequenza));
  expect((await pronte(page)).ids).toEqual(['d', 'e', 'a']);
});

test('B1-PRONTE-04: a chat with a live run is not kept (its story goes on), and says why', async ({ page }) => {
  const storie = { viva: storiaDi('viva', 2, { aperta: true }), corta: storiaDi('corta', 1) };
  const traffico = await prepara(page, storie);
  await apri(page, 'viva', { conclusa: false });
  await apri(page, 'corta');
  expect((await pronte(page)).ultimoEsito).toEqual({ sessionId: 'viva', esito: 'giro-vivo' });
  expect((await pronte(page)).ids).toEqual([]);
  await apri(page, 'viva', { conclusa: false });
  expect(traffico.eventi.filter((r) => r.id === 'viva').map((r) => r.after)).toEqual([null, null]);
});

test('B1-PRONTE-05: a language change drops the kept chats (they were drawn in the other language)', async ({ page }) => {
  const storie = { lunga: storiaDi('lunga', 3), corta: storiaDi('corta', 1) };
  await prepara(page, storie);
  await apri(page, 'lunga');
  await apri(page, 'corta');
  expect((await pronte(page)).ids).toEqual(['lunga']);
  await page.evaluate(() => document.documentElement.dispatchEvent(new CustomEvent('talos:lingua')));
  expect((await pronte(page)).ids).toEqual([]);
  // e la chat a schermo, ricostruita con `forza` nella lingua nuova, non si parcheggia con la sua vista vecchia
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('corta', 'workspace', 'Chat corta', 'z-ai/glm-5.3-flash', { conclusa: true, interrotta: false, modello: 'z-ai/glm-5.3-flash' }, { forza: true }));
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  expect((await pronte(page)).ids).toEqual([]);
});

test('B1-PRONTE-06: a chat drawn with other display settings (appearance) is rebuilt, not reused', async ({ page }) => {
  const storie = { lunga: storiaDi('lunga', 3), corta: storiaDi('corta', 1) };
  const traffico = await prepara(page, storie);
  await apri(page, 'lunga');
  await apri(page, 'corta');
  expect((await pronte(page)).ids).toEqual(['lunga']);
  // l'aspetto cambia mentre la chat è pronta (come dalle Impostazioni): la sua vista è disegnata con quello di prima
  await page.evaluate(() => {
    const chiave = 'talos.harness.desktop.settings.v1';
    const doc = JSON.parse(localStorage.getItem(chiave) || '{}');
    doc.appearance = { ...(doc.appearance || {}), colorMode: 'dark' };
    localStorage.setItem(chiave, JSON.stringify(doc));
  });
  await apri(page, 'lunga');
  expect(traffico.eventi.filter((r) => r.id === 'lunga').map((r) => r.after)).toEqual([null, null]);
});
