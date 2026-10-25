import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/*
 * Revisione a blocco 5 (24/10/2026 notte) — le cure della finestra, dal lavoratore Desktop 9:
 *   · REV5-CB1 / REV5-CB2 (sonde del revisore, `_rev5-consenso-finestra.spec.mjs`): `remote.changed` a raffica legge lo stato UNA
 *     volta in volo e una in coda; due letture fuori ordine non lasciano il pallino acceso per sempre;
 *   · decisioni dell'owner del 24/10 notte: la riga di conferma dopo «Consenti» (con «Gestisci», o «Apri» se c'è `sessionId`), la
 *     pillola «Pad di Nino +1» col suggerimento che li elenca, «Seguito/Revisione/Bacheca» in italiano;
 *   · il segno d'origine «Free task ·from the device»: la causa MISURATA sul DOM, poi la cura in `remoto.css`.
 * Il giro della finestra a 3 s / 20 s è spento: tutto ciò che succede lo porta lo stream della prova. Ogni richiesta non-GET che non sia
 * la risposta alla carta si ferma e si conta. Le foto (1920×1080, chiaro e scuro) vanno in TALOS_FOTO_DIR, se data.
 */
const ORA = Date.now();
const RICHIESTA = {
  type: 'consent.requested', richiestaId: 'rev5-conferma-01', dispositivo: { id: 't1', nome: 'Pad di Nino' },
  cartella: { nome: 'AVM', percorso: 'D:\\Projects\\AVM' }, scadeAlle: new Date(ORA + 115_000).toISOString(),
};
const sse = (...eventi) => eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
const FOTO = process.env.TALOS_FOTO_DIR || null;
if (FOTO) mkdirSync(FOTO, { recursive: true });

async function prepara(page, { lingua = 'en', modo = 'light' } = {}) {
  await page.addInitScript(([uiLanguage, colorMode]) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage, colorMode, themePreset: 'calm', themePresetVersione: 2 } }));
    const vero = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...resto) => (ms === 3_000 || ms === 20_000 ? 0 : vero(fn, ms, ...resto));
  }, [lingua, modo]);
}

const telefono = (id, nome, inLinea) => ({ id, nome, collegatoAlle: ORA, inLinea, percorso: null, revocatoAlle: null });
const stato = (telefoni) => ({ ok: true, data: {
  disponibile: true, acceso: true, relay: { modo: 'n0' }, sceltaFatta: true, pcId: 'pc', inLinea: telefoni.filter((v) => v.inLinea).map((v) => v.id),
  telefoni, attese: [], accoppiamento: { sbagliati: 0 }, consensi: [],
} });

async function serverSse() {
  const { createServer } = await import('node:http');
  const aperti = [];
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' });
    res.write(':ok\n\n');
    aperti.push(res);
    req.on('close', () => { const i = aperti.indexOf(res); if (i >= 0) aperti.splice(i, 1); });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return {
    url: `http://127.0.0.1:${server.address().port}/events`, aperti: () => aperti.length,
    manda: (...eventi) => { for (const res of aperti) res.write(sse(...eventi)); },
    chiudi: () => new Promise((ok) => { for (const res of aperti.splice(0)) res.destroy(); server.closeAllConnections?.(); server.close(() => ok()); }),
  };
}

/** `/api/v1/remote**` finto: lo stato lo dà `leggi()`, lo stream va al server della prova, la risposta alla carta la dà `consenti`. */
async function fingi(page, flusso, { leggi = () => stato([telefono('t1', 'Pad di Nino', false)]), consenti = () => ({ esito: 'consentita' }) } = {}) {
  const conti = { letture: 0, nonGet: [] };
  await page.route('**/api/v1/remote**', async (route) => {
    const r = route.request(); const p = new URL(r.url()).pathname;
    if (p === '/api/v1/remote/events') return route.continue({ url: flusso.url });
    if (r.method() === 'POST' && /^\/api\/v1\/remote\/consents\/[^/]+\/allow$/u.test(p)) return route.fulfill({ json: { ok: true, data: consenti() } });
    if (r.method() !== 'GET') { conti.nonGet.push(`${r.method()} ${p}`); return route.fulfill({ status: 418, json: {} }); }
    if (p === '/api/v1/remote') { conti.letture += 1; return route.fulfill({ json: await Promise.resolve(leggi(conti.letture)) }); }
    if (/\/folders$/u.test(p)) return route.fulfill({ json: { ok: true, data: { cartelle: [] } } });
    return route.fulfill({ status: 404, json: { ok: false } });
  });
  return conti;
}

async function apri(page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
}
const pronto = async (flusso) => { await expect.poll(() => flusso.aperti(), { timeout: 5_000 }).toBe(1); flusso.manda({ type: 'remote.changed', motivo: 'connesso' }); };

test('REV5-CB1 remote.changed a raffica: una lettura in volo e una in coda, non una per evento', async ({ page }) => {
  await prepara(page);
  const flusso = await serverSse();
  try {
    const conti = await fingi(page, flusso, { leggi: async () => { await new Promise((x) => setTimeout(x, 150)); return stato([telefono('t1', 'Pad di Nino', false)]); } });
    await apri(page);
    await pronto(flusso);
    await page.waitForTimeout(600);
    const prima = conti.letture;
    for (let i = 0; i < 20; i += 1) flusso.manda({ type: 'remote.changed', motivo: i % 2 ? 'telefono-collegato' : 'telefono-scollegato' });
    await page.waitForTimeout(1500);
    expect(conti.nonGet).toEqual([]);
    expect(conti.letture - prima, '⛔ una lettura per evento, senza accorpare').toBeLessThanOrEqual(3);
    expect(conti.letture - prima, 'almeno una lettura dopo la raffica').toBeGreaterThanOrEqual(1);
  } finally { await flusso.chiudi(); }
});

test('REV5-CB2 due letture fuori ordine: vince la più nuova, il pallino si spegne', async ({ page }) => {
  await prepara(page);
  const flusso = await serverSse();
  let gara = false; let n = 0;
  try {
    await fingi(page, flusso, { leggi: async () => {
      if (!gara) return stato([telefono('t1', 'Pad di Nino', false)]);
      n += 1;
      if (n === 1) { await new Promise((x) => setTimeout(x, 800)); return stato([telefono('t1', 'Pad di Nino', true)]); } // «collegato», lenta
      return stato([telefono('t1', 'Pad di Nino', false)]); // «scollegato», svelta
    } });
    await apri(page);
    await pronto(flusso);
    await page.waitForTimeout(600);
    gara = true;
    flusso.manda({ type: 'remote.changed', motivo: 'telefono-collegato' });
    await page.waitForTimeout(50);
    flusso.manda({ type: 'remote.changed', motivo: 'telefono-scollegato' });
    await page.waitForTimeout(2500);
    expect(await page.locator('[data-remoto-pallino]').evaluate((e) => !e.hidden), '⛔ il dispositivo è uscito, ma vince la risposta vecchia').toBe(false);
    expect(await page.locator('[data-remoto-pillola]').first().evaluate((e) => !e.hidden)).toBe(false);
  } finally { await flusso.chiudi(); }
});

for (const modo of ['light', 'dark']) {
  test(`CONFERMA-1 (${modo}) dopo «Consenti»: la riga di conferma al posto della carta, poi «ha aperto una conversazione» con l'evento`, async ({ page }) => {
    await prepara(page, { modo });
    const flusso = await serverSse();
    try {
      const conti = await fingi(page, flusso);
      await apri(page);
      await pronto(flusso);
      flusso.manda(RICHIESTA);
      const carta = page.locator('[data-remoto-consenso]');
      await expect(carta).toHaveCount(1);
      await expect(page.locator('[data-remoto-consenti]:not([data-in-armamento])')).toHaveCount(1, { timeout: 5_000 });
      if (FOTO) await page.screenshot({ path: `${FOTO}/carta-prima-${modo}.png` });
      await page.locator('[data-remoto-consenti]').click();
      const riga = page.locator('[data-remoto-conferma]');
      await expect(riga).toHaveCount(1);
      await page.waitForTimeout(400); // l'entrata (160 ms) finita, per la foto
      await expect(carta).toHaveCount(0);
      await expect(riga).toHaveAttribute('aria-live', 'polite');
      await expect(riga).toHaveAttribute('role', 'status');
      await expect(riga).toContainText('“Pad di Nino” can now work in AVM');
      await expect(riga.locator('strong')).toHaveText('AVM');
      await expect(riga.locator('[data-remoto-conferma-azione]')).toHaveText('Manage');
      if (FOTO) await page.screenshot({ path: `${FOTO}/conferma-consenti-${modo}.png` });
      /* l'evento della chiusura porta il `sessionId` della sessione trattenuta: la riga lo dice, e l'azione diventa «Apri» */
      flusso.manda({ type: 'consent.closed', richiestaId: RICHIESTA.richiestaId, dispositivoId: 't1', esito: 'consentita', sessionId: 'sessione-dal-pad' });
      await expect(riga).toContainText('“Pad di Nino” opened a conversation in AVM');
      await expect(riga.locator('[data-remoto-conferma-azione]')).toHaveText('Open');
      if (FOTO) await page.screenshot({ path: `${FOTO}/conferma-sessione-${modo}.png` });
      /* se ne va da sola dopo 4-5 s */
      await expect(riga).toHaveCount(0, { timeout: 7_000 });
      expect(conti.nonGet).toEqual([]);
    } finally { await flusso.chiudi(); }
  });
}

test('CONFERMA-2 la risposta porta già il sessionId: «ha aperto una conversazione» subito; senza, «Gestisci» porta alla riga del dispositivo', async ({ page }) => {
  await prepara(page, { lingua: 'it' });
  const flusso = await serverSse();
  let risposta = { esito: 'consentita', sessionId: 's-trattenuta' };
  try {
    await fingi(page, flusso, { consenti: () => risposta });
    await apri(page);
    await pronto(flusso);
    flusso.manda(RICHIESTA);
    await expect(page.locator('[data-remoto-consenti]:not([data-in-armamento])')).toHaveCount(1, { timeout: 5_000 });
    await page.locator('[data-remoto-consenti]').click();
    const riga = page.locator('[data-remoto-conferma]');
    await expect(riga).toContainText('“Pad di Nino” ha aperto una conversazione in AVM');
    await expect(riga.locator('[data-remoto-conferma-azione]')).toHaveText('Apri');
    /* la seconda: nessuna sessione ⇒ «Gestisci», che apre Dispositivi collegati sulla riga di quel dispositivo */
    risposta = { esito: 'consentita' };
    flusso.manda({ ...RICHIESTA, richiestaId: 'rev5-conferma-02' });
    await expect(riga).toHaveCount(0); // una carta nuova prende il posto della riga
    await expect(page.locator('[data-remoto-consenti]:not([data-in-armamento])')).toHaveCount(1, { timeout: 5_000 });
    await page.locator('[data-remoto-consenti]').click();
    await expect(riga.locator('[data-remoto-conferma-azione]')).toHaveText('Gestisci');
    await expect(riga).toContainText('“Pad di Nino” ora può lavorare in AVM');
    await riga.locator('[data-remoto-conferma-azione]').click();
    await expect(riga).toHaveCount(0);
    await expect(page.locator('#settingsTelefoni')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-remoto-telefono')), { timeout: 5_000 }).toBe('t1');
  } finally { await flusso.chiudi(); }
});

for (const modo of ['light', 'dark']) {
  test(`PILLOLA-1 (${modo}) tre dispositivi, due in linea: «Pad di Nino +1», e il suggerimento li elenca tutti`, async ({ page }) => {
    await prepara(page, { modo });
    const flusso = await serverSse();
    try {
      await fingi(page, flusso, { leggi: () => stato([telefono('t1', 'Pad di Nino', true), telefono('t2', 'Telefono di Ada', true), telefono('t3', 'Vecchio', false)]) });
      await apri(page);
      await pronto(flusso);
      await page.locator('.talos-nav-item[data-vaia="chat"]').click(); // il compositore della chat, dove sta la pillola
      await expect(page.locator('#schermoChat')).toBeVisible();
      const pillola = page.locator('[data-remoto-pillola]').first();
      await expect(pillola).toBeVisible();
      await expect(pillola.locator('[data-remoto-pillola-nome]')).toHaveText('Pad di Nino +1');
      await expect(pillola).toHaveAttribute('aria-label', 'Devices connected: Pad di Nino, Telefono di Ada');
      if (FOTO) await page.screenshot({ path: `${FOTO}/pillola-piu-uno-${modo}.png` });
    } finally { await flusso.chiudi(); }
  });
}

test('PILLOLA-2 (al contrario) un dispositivo solo in linea: il nome senza «+N»', async ({ page }) => {
  await prepara(page);
  const flusso = await serverSse();
  try {
    await fingi(page, flusso, { leggi: () => stato([telefono('t1', 'Pad di Nino', true), telefono('t2', 'Telefono di Ada', false)]) });
    await apri(page);
    await pronto(flusso);
    const pillola = page.locator('[data-remoto-pillola]').first();
    await expect(pillola.locator('[data-remoto-pillola-nome]')).toHaveText('Pad di Nino');
    await expect(pillola).toHaveAttribute('aria-label', 'Device connected: Pad di Nino');
  } finally { await flusso.chiudi(); }
});

for (const modo of ['light', 'dark']) {
  test(`ITALIANO-1 (${modo}) «Bacheca» nella barra laterale, non «Board»`, async ({ page }) => {
    await prepara(page, { lingua: 'it', modo });
    const flusso = await serverSse();
    try {
      await fingi(page, flusso);
      await apri(page);
      const voce = page.locator('[data-t="modello.sidebar.board"]').first();
      await expect(voce).toHaveText('Bacheca');
      await expect(page.locator('[data-t="modello.chat.review"]').first()).toHaveText(/Revisione/u);
      if (FOTO) await page.screenshot({ path: `${FOTO}/italiano-bacheca-${modo}.png` });
    } finally { await flusso.chiudi(); }
  });
}

/*
 * Il segno d'origine: la MISURA della causa. La testata del messaggio è una riga flex; lo span dell'origine ci sta dentro, e il suo
 * `::before { content: "· " }` — se lo spazio finale si perde, «·from» si attacca. Si misura la larghezza dello span col «· » e con
 * il solo «·»: se sono uguali, lo spazio non c'è.
 */
for (const modo of ['light', 'dark']) {
  test(`ORIGINE-1 (${modo}) «Free task · from the device»: lo spazio dopo il punto c'è, misurato sul DOM`, async ({ page }) => {
    await prepara(page, { modo });
    const flusso = await serverSse();
    try {
      await fingi(page, flusso);
      await apri(page);
      const misura = await page.evaluate(() => {
        const ospite = document.querySelector('.talos-chat, main, body');
        const msg = document.createElement('div');
        msg.className = 'talos-message talos-message--user';
        msg.id = 'provaOrigine';
        msg.style.cssText = 'position:fixed;left:40px;top:120px;z-index:99999;padding:12px;background:var(--talos-panel)';
        msg.innerHTML = '<div class="talos-message__head"><span class="talos-message__who">You</span><span class="talos-message__meta">10:04 · Free task</span><span class="talos-message__origine">from the device “Pad di Nino”</span></div>';
        ospite.append(msg);
        const span = msg.querySelector('.talos-message__origine');
        const prima = getComputedStyle(span, '::before');
        /* lo spazio PRIMA del punto (il `gap` della testata flex) e quello DOPO (spazio nel testo + margine del `::before`) */
        const spazioPrima = span.getBoundingClientRect().left - msg.querySelector('.talos-message__meta').getBoundingClientRect().right;
        const conSpazio = span.getBoundingClientRect().width;
        const stile = document.createElement('style');
        stile.textContent = '#provaOrigine .talos-message__origine.senza-spazio::before { content: "·" !important; margin-inline-end: 0 !important; }';
        document.head.append(stile);
        span.classList.add('senza-spazio');
        const senzaSpazio = span.getBoundingClientRect().width;
        span.classList.remove('senza-spazio');
        stile.remove();
        return { displaySpan: getComputedStyle(span).display, displayPrima: prima.display, content: prima.content, whiteSpace: prima.whiteSpace, marginDestro: prima.marginRight,
          gapTestata: getComputedStyle(msg.querySelector('.talos-message__head')).columnGap, spazioPrima, spazioDopo: conSpazio - senzaSpazio };
      });
      console.log('ORIGINE-1', modo, JSON.stringify(misura));
      if (FOTO) await page.locator('#provaOrigine').screenshot({ path: `${FOTO}/origine-${modo}.png` });
      /* prima della cura: spazioPrima 9, spazioDopo 2,8 — il punto attaccato a «from». Lo spazio dopo il punto vale quello prima, ±1 px */
      expect(Math.abs(misura.spazioDopo - misura.spazioPrima), `⛔ il punto non sta in mezzo (${JSON.stringify(misura)})`).toBeLessThanOrEqual(1);
    } finally { await flusso.chiudi(); }
  });
}

/* La riga di conferma a 1024×800 (la larghezza dove le colonne si stringono per prime): dentro la finestra, il testo per intero, l'azione
   visibile e cliccabile, nessuna sovrapposizione fra testo e azione. */
test('CONFERMA-3 a 1024×800: la riga sta nella finestra, il testo non finisce sotto l\'azione', async ({ page }) => {
  await prepara(page);
  const flusso = await serverSse();
  try {
    await fingi(page, flusso);
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
    await pronto(flusso);
    flusso.manda({ ...RICHIESTA, dispositivo: { id: 't1', nome: 'Pad di Nino con un nome lungo' }, cartella: { nome: 'progetto-con-un-nome-lungo', percorso: 'D:\Projects\progetto-con-un-nome-lungo' } });
    await expect(page.locator('[data-remoto-consenti]:not([data-in-armamento])')).toHaveCount(1, { timeout: 5_000 });
    await page.locator('[data-remoto-consenti]').click();
    const riga = page.locator('[data-remoto-conferma]');
    await expect(riga).toHaveCount(1);
    await page.waitForTimeout(400);
    const m = await riga.evaluate((e) => {
      const r = e.getBoundingClientRect(); const t = e.querySelector('.talos-remoto-conferma__testo').getBoundingClientRect(); const a = e.querySelector('[data-remoto-conferma-azione]').getBoundingClientRect();
      return { sinistra: r.left, destra: r.right, alto: r.top, basso: r.bottom, larghezzaFinestra: innerWidth, testoDestra: t.right, azioneSinistra: a.left, azioneLarga: a.width };
    });
    if (FOTO) await page.screenshot({ path: `${FOTO}/conferma-1024.png` });
    expect(m.sinistra, JSON.stringify(m)).toBeGreaterThanOrEqual(0);
    expect(m.destra, JSON.stringify(m)).toBeLessThanOrEqual(m.larghezzaFinestra);
    expect(m.testoDestra, `⛔ il testo finisce sotto l'azione (${JSON.stringify(m)})`).toBeLessThanOrEqual(m.azioneSinistra);
    expect(m.azioneLarga).toBeGreaterThan(20);
  } finally { await flusso.chiudi(); }
});
