import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/*
 * FE-071 (R9, Desktop 05/11 17:09): il segno e la bolla restano accesi quando la persona cambia chat mentre TALOS usa il computer in un'altra.
 * Pagina principale vera (build) + una pagina del segno nello stesso browser; gli stream delle chat sono finti con `page.route` e rispettano
 * `?after=` e `Last-Event-ID` come il server vero (http-app.mjs). Il cambio di chat passa da `passaASessione`, la stessa funzione che chiama
 * la riga della barra laterale. Il server di prova è quello di `playwright.config.mjs`, mai il 4174; le scritture si fermano.
 */
const FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/segno-cambio-chat/', import.meta.url)));
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const FIN = { x: 120, y: 80, w: 900, h: 600 };
const P1 = { x: 300, y: 200 }, P2 = { x: 700, y: 450 };
const custom = (name, value, n) => ({ type: 'CUSTOM', name, value, _sequenza: n });
const sse = (eventi, retry) => `retry: ${retry}\n${eventi.map((e) => `${e._sequenza ? `id: ${e._sequenza}\n` : ''}data: ${JSON.stringify(e)}\n\n`).join('')}`;

async function prepara(page, viewport) {
  const traffico = { eventi: [], scritture: [] };
  let liberaAnnuncio, liberaEsito;
  const annuncioPronto = new Promise((r) => { liberaAnnuncio = r; });
  const esitoPronto = new Promise((r) => { liberaEsito = r; });
  /* La chat A: giro aperto e computer use in corso. Dopo la 2, ciò che succede mentre la persona guarda B. */
  const storiaA = () => [{ type: 'RunStarted', threadId: 'A', runId: 'r1', input: { consegna: 'apri il blocco note' }, _sequenza: 1 }];
  const vivoA = [custom('talos.computer-use-annuncio', { finestra: FIN, punto: P1, t0: 0 }, 2)];
  const doppioA = [];
  let richiesteDopo2 = 0;
  /* Ogni EventSource creato dalla pagina: la riconnessione nativa non ne crea uno nuovo, un secondo ascolto sì. */
  await page.addInitScript(() => { const Nativo = window.EventSource; if (window.top !== window) return; window.__aperti = []; window.EventSource = class extends Nativo { constructor(url, opzioni) { super(url, opzioni); window.__aperti.push(String(url)); } }; });
  /* Solo nella finestra principale: lo script iniziale gira in ogni riquadro, e uno isolato (sandbox) non ha localStorage. */
  await page.addInitScript(() => { if (window.top !== window) return; localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode: 'light', uiLanguage: 'it' } })); });
  await page.route('**/api/**', (rotta) => {
    if (rotta.request().method() === 'GET') return rotta.fallback();
    traffico.scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
    return rotta.abort();
  });
  await page.route((url) => url.pathname === '/api/v1/sessions', (route) => (route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: { ok: true,
    data: { items: ['A', 'B'].map((id) => ({ sessionId: id, nome: `Chat ${id}`, conclusa: id === 'B', interrotta: false, avviataAlle: '2026-11-05T08:00:00.000Z' })) }, meta: {} } })));
  await page.route((url) => /\/api\/v1\/sessions\/[^/]+\/events$/u.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const id = decodeURIComponent(url.pathname.split('/')[4]);
    const intestazioni = await route.request().allHeaders();
    const dopo = Number(intestazioni['last-event-id'] ?? url.searchParams.get('after') ?? 0);
    traffico.eventi.push({ id, after: url.searchParams.get('after'), ultimo: intestazioni['last-event-id'] ?? null, at: Date.now() });
    if (id === 'B') {
      const b = [{ type: 'RunStarted', threadId: 'B', runId: 'b1', input: { consegna: 'ciao' }, _sequenza: 1 }, { type: 'RunFinished', threadId: 'B', runId: 'b1', result: {}, _sequenza: 2 }];
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([...b.filter((e) => e._sequenza > dopo), CONFINE], 3600000) });
    }
    if (dopo === 0) {
      /* La pagina principale apre A: la storia (giro aperto), il confine, poi l'annuncio dal vivo col suo t0. */
      if (doppioA.length > 0) {
        /* Il ritorno su A a giro finito: tutto è storia, prima del confine; niente dal vivo. */
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([...storiaA(), ...vivoA, ...doppioA, CONFINE], 3600000) });
      }
      const vivi = vivoA.map((e) => ({ ...e, value: { ...e.value, t0: Date.now() } }));
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([...storiaA(), CONFINE, ...vivi], 3600000) });
    }
    if (dopo === 2 && ++richiesteDopo2 === 1) {
      /* L'ascolto del ponte (`?after=2`): il nuovo annuncio arriva quando la prova lo libera; il browser si ricollega da solo dopo 100 ms. */
      await annuncioPronto;
      const nuovo = [custom('talos.computer-use-annuncio', { finestra: FIN, punto: P2, t0: Date.now() }, 3)];
      doppioA.push(...nuovo);
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([...nuovo, CONFINE], 100) });
    }
    if (dopo === 2) {
      /* La riconnessione nativa: Chromium manda Last-Event-ID 3, ma nelle richieste intercettate Playwright non lo mostra (provato a parte il 05/11).
         Il finto server fa il caso peggiore, un server che non lo legge: rimanda anche il 3. Il ponte deve scartarlo (dedup su `_sequenza`). */
      await esitoPronto;
      const fine = [...doppioA.filter((e) => e._sequenza === 3), custom('talos.computer-use-esito', { motivo: 'fatto' }, 4), { type: 'RunFinished', threadId: 'A', runId: 'r1', result: {}, _sequenza: 5 }];
      doppioA.push(...fine.filter((e) => e._sequenza > 3));
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([...fine, CONFINE], 3600000) });
    }
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([CONFINE], 3600000) });
  });
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  return { traffico, liberaAnnuncio, liberaEsito, doppioA };
}

const apri = async (page, id, conclusa) => {
  await page.evaluate(({ id, conclusa }) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', `Chat ${id}`, 'z-ai/glm-5.3-flash', { conclusa, interrotta: false, modello: 'z-ai/glm-5.3-flash' }), { id, conclusa });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 10_000 });
};
const cursoreFermo = (schermo) => schermo.evaluate(() => {
  for (const a of document.getAnimations()) if (a.effect?.target?.classList?.contains('cursore')) a.finish();
  const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.cursore')).transform);
  return { x: m.m41, y: m.m42 };
});

for (const [nome, viewport] of [['desktop', { width: 1440, height: 900 }], ['telefono', { width: 390, height: 844 }]]) {
  test(`SEG-R9 ${nome}: cambiata la chat durante il computer use, il cursore segue il nuovo annuncio, il bordo resta, l esito spegne; un solo ascolto in più; tornando su A niente si ridisegna`, async ({ page, context }) => {
    const errori = [];
    page.on('pageerror', (e) => errori.push(e.message));
    const { traffico, liberaAnnuncio, liberaEsito } = await prepara(page, viewport);
    const schermo = await context.newPage();
    schermo.on('pageerror', (e) => errori.push(e.message));
    await schermo.goto(`segno.html?fx=0&fy=0&fw=${viewport.width}&fh=${viewport.height}&scala=1`);
    await schermo.evaluate(() => { window.__ricevuti = []; new BroadcastChannel('talos-bolla').onmessage = (m) => window.__ricevuti.push(m.data); });

    await apri(page, 'A', false);
    await expect(schermo.locator('.cursore')).toBeVisible();
    expect(await cursoreFermo(schermo)).toEqual({ x: P1.x - 4, y: P1.y - 2 });
    await expect(schermo.locator('.guarda')).toBeVisible();

    const primaDelCambio = Date.now();
    await apri(page, 'B', true);
    await expect.poll(() => traffico.eventi.filter((r) => r.id === 'A' && r.at >= primaDelCambio).length).toBe(1);
    expect(traffico.eventi.filter((r) => r.id === 'A' && r.at >= primaDelCambio)[0]).toMatchObject({ after: '2', ultimo: null });
    await expect(schermo.locator('.guarda')).toBeVisible();

    liberaAnnuncio();
    await expect.poll(() => cursoreFermo(schermo)).toEqual({ x: P2.x - 4, y: P2.y - 2 });
    await expect(schermo.locator('.guarda')).toBeVisible();
    await page.screenshot({ path: path.join(FOTO, `${nome}-chat-B.png`) });
    await schermo.screenshot({ path: path.join(FOTO, `${nome}-segno-segue-A.png`) });

    /* Il browser si ricollega da sé (retry 100 ms): è lo stesso EventSource, non un secondo ascolto. */
    await expect.poll(() => traffico.eventi.filter((r) => r.id === 'A' && r.at >= primaDelCambio).length).toBe(2);
    expect(traffico.eventi.filter((r) => r.id === 'A' && r.at >= primaDelCambio)[1]).toMatchObject({ after: '2' });
    expect(await page.evaluate(() => window.__aperti.filter((u) => u.includes('/sessions/A/events?after=')).length), 'un solo ascolto in più su A').toBe(1);
    liberaEsito();
    await expect(schermo.locator('.cursore, .guarda')).toHaveCount(0);

    const ricevuti = await schermo.evaluate(() => window.__ricevuti.map((m) => (m.tipo === 'evento' ? `${m.tipo}:${m.evento.name}` : `${m.tipo}:${m.sessionId}`)));
    expect(ricevuti).toEqual(['sessione:A', 'evento:talos.computer-use-annuncio', 'evento:talos.computer-use-annuncio', 'evento:talos.computer-use-esito']);

    const primaDelRitorno = Date.now();
    await apri(page, 'A', true);
    await page.waitForTimeout(400);
    expect(await schermo.evaluate(() => window.__ricevuti.length), 'la storia di A non si ridisegna').toBe(4);
    await expect(schermo.locator('.cursore, .guarda')).toHaveCount(0);
    expect(traffico.eventi.filter((r) => r.at >= primaDelRitorno && r.id !== 'A'), 'nessun ascolto in più dopo la fine').toEqual([]);
    expect(traffico.scritture).toEqual([]);
    expect(errori).toEqual([]);
  });
}
