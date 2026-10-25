import { expect, test } from '@playwright/test';

/*
 * R2.1 (24/10/2026 sera; contratto `CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-2026-10-23.md`, Parte 1, «Revision 2», AGREED col
 *   Mobile) — LA CARTA DEL CONSENSO ARRIVA SULL'EVENTO. Owner, dopo la prova dal vivo (≈49 s dal tocco alla carta, fino a 20 s dei
 *   quali della finestra che controllava ogni 20 s): «È troppo tempo, bisogna renderlo più istantaneo possibile, meglio del resto».
 *
 * ⛔ Il contratto chiede una prova che dimostri che NESSUN timer da 20 s c'entra: qui il giro a 3 s / 20 s di `montaRemoto` è SPENTO
 *   (`setTimeout` con quei ritardi non parte mai) e `/api/v1/remote` non porta MAI la richiesta. Se la carta compare, l'ha portata
 *   lo stream `/api/v1/remote/events`. Il protocollo del server è provato in `tests/remoto-eventi-consenso.test.mjs`; qui la finestra.
 */
const ORA = Date.now();
const RICHIESTA = {
  type: 'consent.requested', richiestaId: 'richiesta-evento-01', dispositivo: { id: 't1', nome: 'Pad di Nino' },
  cartella: { nome: 'AVM', percorso: 'D:\\Projects\\AVM' }, scadeAlle: new Date(ORA + 115_000).toISOString(),
};
const sse = (...eventi) => eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

async function spegniIlGiro(page) {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'en' } }));
    /* il giro della finestra: 3 s con un dispositivo in linea o una carta in attesa, 20 s altrimenti — qui non parte mai */
    const vero = window.setTimeout.bind(window);
    window.__giriSpenti = [];
    window.setTimeout = (fn, ms, ...resto) => {
      if (ms === 3_000 || ms === 20_000) { window.__giriSpenti.push(ms); return 0; }
      return vero(fn, ms, ...resto);
    };
    /* quando la carta entra nel DOM: l'istante, per misurare dall'evento alla carta */
    new MutationObserver(() => {
      if (!window.__cartaAlle && document.querySelector('[data-remoto-consenso]')) window.__cartaAlle = Date.now();
    }).observe(document, { childList: true, subtree: true });
  });
}

/** `/api/v1/remote` senza MAI la richiesta; lo stream lo decide la prova. */
async function fingiRemoto(page, { flusso }) {
  const chiamate = [];
  await page.route('**/api/v1/remote**', async (route) => {
    const r = route.request(); const p = new URL(r.url()).pathname;
    chiamate.push(`${r.method()} ${p}`);
    if (p === '/api/v1/remote') {
      return route.fulfill({ json: { ok: true, data: {
        disponibile: true, acceso: true, relay: { modo: 'n0' }, sceltaFatta: true, pcId: 'pc', inLinea: [],
        telefoni: [{ id: 't1', nome: 'Pad di Nino', collegatoAlle: ORA, inLinea: false, percorso: null, revocatoAlle: null }],
        attese: [], accoppiamento: { sbagliati: 0 }, consensi: [],
      } } });
    }
    if (p === '/api/v1/remote/events') return flusso(route, r);
    const consenso = /^\/api\/v1\/remote\/consents\/([^/]+)\/(allow|deny)$/u.exec(p);
    if (consenso) return route.fulfill({ json: { ok: true, data: { esito: consenso[2] === 'allow' ? 'consentita' : 'negata' } } });
    return route.fulfill({ status: 404, json: { ok: false, error: { code: 'NOT_FOUND' } } });
  });
  return chiamate;
}

async function apri(page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
}

/*
 * Lo stream: un server SSE della prova su una porta scelta dal sistema (loopback, chiuso a fine prova; mai 4174/4177-4179). La rotta
 * della finestra lo INOLTRA lì (`route.continue`), così l'EventSource vero della pagina resta aperto e gli eventi partono quando la
 * prova li manda — un corpo `fulfill` finirebbe subito e la riconnessione confonderebbe la misura.
 */
async function serverSse() {
  const { createServer } = await import('node:http');
  const aperti = [];
  const intestazioniViste = [];
  const server = createServer((req, res) => {
    intestazioniViste.push(req.headers);
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' });
    res.write(':ok\n\n');
    aperti.push(res);
    req.on('close', () => { const i = aperti.indexOf(res); if (i >= 0) aperti.splice(i, 1); });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return {
    url: `http://127.0.0.1:${server.address().port}/events`,
    intestazioniViste, aperti: () => aperti.length,
    manda: (...eventi) => { for (const res of aperti) res.write(sse(...eventi)); },
    taglia: () => { for (const res of aperti.splice(0)) res.destroy(); },
    chiudi: () => new Promise((ok) => { for (const res of aperti.splice(0)) res.destroy(); server.closeAllConnections?.(); server.close(() => ok()); }),
  };
}

test('REMOTO-ISTANTANEO-01 — col giro SPENTO la carta compare dall\'evento consent.requested, in meno di un secondo', async ({ page }) => {
  await spegniIlGiro(page);
  const flusso = await serverSse();
  try {
    const chiamate = await fingiRemoto(page, { flusso: (route) => route.continue({ url: flusso.url }) });
    await apri(page);
    await expect.poll(() => flusso.aperti(), { timeout: 5_000 }).toBe(1);
    /* ⛔ qui l'intestazione Sec-Fetch-Site è quella dell'INOLTRO (un'altra porta: «same-site»): la guardia vera la prova la 04 */
    flusso.manda({ type: 'remote.changed', motivo: 'connesso' });
    const carta = page.locator('[data-remoto-consenso="richiesta-evento-01"]');
    await page.waitForTimeout(500);
    await expect(carta).toHaveCount(0);
    const mandataAlle = await page.evaluate(() => Date.now());
    flusso.manda(RICHIESTA);
    await expect(carta).toBeVisible({ timeout: 5_000 });
    const cartaAlle = await page.evaluate(() => window.__cartaAlle);
    expect(cartaAlle - mandataAlle).toBeLessThan(1_000);
    await expect(carta).toContainText('Pad di Nino');
    await expect(carta).toContainText(RICHIESTA.cartella.percorso);
    /* il giro c'era ed è stato spento (la prova ha davvero tolto il timer); lo stato, letto, non ha MAI la richiesta */
    expect(await page.evaluate(() => window.__giriSpenti.length)).toBeGreaterThan(0);
    /* un dispositivo entra mentre la carta è su: la finestra rilegge lo stato (che non porta la richiesta) e la carta RESTA — con lo
       stream pronto le carte sono sue, una lettura dello stato non le toglie */
    const letture = chiamate.filter((c) => c === 'GET /api/v1/remote').length;
    flusso.manda({ type: 'remote.changed', motivo: 'telefono-collegato' });
    await expect.poll(() => chiamate.filter((c) => c === 'GET /api/v1/remote').length, { timeout: 5_000 }).toBeGreaterThan(letture);
    await page.waitForTimeout(300);
    await expect(carta).toBeVisible();
    await expect(carta.locator('[data-remoto-consenti]')).not.toHaveAttribute('data-in-armamento', /.*/u, { timeout: 5_000 });
    await carta.locator('[data-remoto-consenti]').click();
    await expect(carta).toBeHidden();
    expect(chiamate).toContain('POST /api/v1/remote/consents/richiesta-evento-01/allow');
  } finally { await flusso.chiudi(); }
});

test('REMOTO-ISTANTANEO-02 — una richiesta chiusa altrove (consent.closed, o assente dall\'istantanea alla riconnessione) toglie la carta senza giro', async ({ page }) => {
  await spegniIlGiro(page);
  const flusso = await serverSse();
  try {
    await fingiRemoto(page, { flusso: (route) => route.continue({ url: flusso.url }) });
    await apri(page);
    await expect.poll(() => flusso.aperti(), { timeout: 5_000 }).toBe(1);
    const seconda = { ...RICHIESTA, richiestaId: 'richiesta-evento-02', cartella: { nome: 'site', percorso: 'D:\\Projects\\site' }, scadeAlle: new Date(ORA + 60_000).toISOString() };
    flusso.manda(RICHIESTA, seconda, { type: 'remote.changed', motivo: 'connesso' });
    /* una carta alla volta: la più vicina a scadere (la seconda) */
    const prima = page.locator('[data-remoto-consenso="richiesta-evento-01"]');
    const altra = page.locator('[data-remoto-consenso="richiesta-evento-02"]');
    await expect(altra).toBeVisible({ timeout: 5_000 });
    /* scaduta sul PC: la carta se ne va e arriva l'altra */
    flusso.manda({ type: 'consent.closed', richiestaId: 'richiesta-evento-02', esito: 'scaduta' });
    await expect(altra).toHaveCount(0, { timeout: 2_000 });
    await expect(prima).toBeVisible();
    /* lo stream cade: l'EventSource si ricollega da solo (≈3 s in Chromium) e l'istantanea non ha più la prima (dispositivo dimenticato) */
    flusso.taglia();
    await expect.poll(() => flusso.aperti(), { timeout: 10_000 }).toBe(1);
    flusso.manda({ type: 'remote.changed', motivo: 'connesso' });
    await expect(prima).toHaveCount(0, { timeout: 2_000 });
  } finally { await flusso.chiudi(); }
});

test('REMOTO-ISTANTANEO-03 — AL CONTRARIO: senza lo stream (503) la finestra torna al giro di ripiego e la carta arriva dallo stato', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'en' } }));
    /* il giro accelerato (3 s / 20 s → 300 ms), non spento */
    const vero = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...resto) => vero(fn, ms === 3_000 || ms === 20_000 ? 300 : ms, ...resto);
  });
  let consensi = [];
  let aperture = 0;
  await page.route('**/api/v1/remote**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/api/v1/remote/events') { aperture += 1; return route.fulfill({ status: 503, json: { ok: false, error: { code: 'REMOTE_UNAVAILABLE' } } }); }
    if (p === '/api/v1/remote') {
      return route.fulfill({ json: { ok: true, data: { disponibile: true, acceso: true, relay: { modo: 'n0' }, sceltaFatta: true, pcId: 'pc', inLinea: [],
        telefoni: [], attese: [], accoppiamento: { sbagliati: 0 }, consensi } } });
    }
    return route.fulfill({ status: 404, json: { ok: false, error: { code: 'NOT_FOUND' } } });
  });
  await apri(page);
  consensi = [{ richiestaId: 'richiesta-giro-01', dispositivoId: 't1', nomeDispositivo: 'Pad di Nino', nome: 'AVM', percorso: 'D:\\Projects\\AVM', scadeAlle: new Date(ORA + 110_000).toISOString() }];
  await expect(page.locator('[data-remoto-consenso="richiesta-giro-01"]')).toBeVisible({ timeout: 5_000 });
  /* WHATWG: un 503 chiude l'EventSource senza ritentare — è il giro che lo riapre */
  await expect.poll(() => aperture, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
});

test('REMOTO-ISTANTANEO-04 — il server VERO: lo stream della finestra passa la guardia dell\'origine e risponde subito «connesso»', async ({ page }) => {
  /* niente finzioni: il server di prova (portachiavi in memoria, quindi col remoto e le cartelle dei dispositivi) e l'EventSource vero */
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'en' } }));
  });
  const risposta = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/v1/remote/events', { timeout: 15_000 });
  await apri(page);
  const r = await risposta;
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toMatch(/^text\/event-stream/u);
  expect((await r.request().allHeaders())['sec-fetch-site']).toBe('same-origin');
  /* un secondo EventSource della stessa pagina riceve l'istantanea (nessuna richiesta aperta) e il segno di stream pronto */
  const primi = await page.evaluate(() => new Promise((ok, ko) => {
    const s = new EventSource('/api/v1/remote/events');
    const visti = [];
    s.onmessage = (m) => { visti.push(JSON.parse(m.data)); if (visti.at(-1).type === 'remote.changed') { s.close(); ok(visti); } };
    s.onerror = () => { s.close(); ko(new Error('stream rifiutato')); };
  }));
  expect(primi).toEqual([{ type: 'remote.changed', motivo: 'connesso' }]);
  /* AL CONTRARIO: la stessa rotta letta da un'altra origine no (la richiesta di Playwright non è un browser e non ha il gettone) */
  const estranea = await page.request.get('/api/v1/remote/events', { headers: { origin: 'http://sito-estraneo.example', 'sec-fetch-site': 'cross-site' } });
  expect(estranea.status()).toBe(403);
});
