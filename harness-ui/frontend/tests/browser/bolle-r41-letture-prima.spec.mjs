import { test, expect } from '@playwright/test';

/*
 * R-41 (31/10/2026, con Performance) — la coda dei fotogrammi lenti con la domanda appiccicata. La traccia a 300 giri a macchina
 *   libera ha mostrato che i fotogrammi col PASSAGGIO di domanda sono lenti 3-6 volte più spesso, e che `misura` (domanda-appiccicata.js)
 *   scriveva le variabili e `scroll-padding-top` e POI rileggeva il messaggio, le azioni e l'altezza della vista: ogni rilettura dopo
 *   una scrittura forza ricalcolo dello stile e layout (510 layout e 897 ricalcoli dentro `misura`, ~1,5 ms a passaggio).
 * La prova è deterministica, non un banco di tempi: durante i passaggi registra in ordine le letture di geometria e le scritture di
 *   stile fatte DENTRO `misura` (dalla pila), e pretende che nessuna lettura venga dopo una scrittura. Rossa prima della cura.
 * ⛔ NIENTE SCRITTURE: il server finto risponde ai GET, ogni non-GET si ferma.
 */

const ID = 'bolle-r41';
const eventiTurni = (quanti) => {
  const lista = [];
  for (let t = 0; t < quanti; t += 1) {
    lista.push(
      { type: 'RunStarted', runId: `run-${t}`, input: { consegna: `Domanda numero ${t}: spiegami il passo ${t}.`, seguito: t > 0 } },
      { type: 'TextMessageStart', messageId: `m-${t}`, role: 'assistant' },
      { type: 'TextMessageContent', messageId: `m-${t}`, delta: `Risposta ${t}.\n\n${'parola '.repeat(120)}fine.` },
      { type: 'TextMessageEnd', messageId: `m-${t}` },
      { type: 'RunFinished', outcome: { type: 'success' } },
    );
  }
  return lista;
};

test('BOLLE-R41-01 — inside `misura` every geometry read comes BEFORE every style write (no layout forced by its own writes)', async ({ page }) => {
  const tentate = [];
  await page.route('**/api/v1/**', (route) => {
    if (route.request().method() !== 'GET') { tentate.push(route.request().url()); return route.abort(); }
    return route.fallback();
  });
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta aperto e muto */ });
  await page.addInitScript(() => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } })); } catch { /* */ }
    /* il registro: chi chiama si legge dalla pila; conta solo ciò che succede dentro `misura` */
    const traccia = []; window.__r41 = traccia;
    const dentroMisura = () => /\bat misura \(/u.test(new Error().stack || '');
    const avvolgi = (proto, nome, tipo) => {
      const d = Object.getOwnPropertyDescriptor(proto, nome);
      if (!d) return;
      if (typeof d.value === 'function') {
        const vero = d.value;
        Object.defineProperty(proto, nome, { ...d, value(...a) { if (dentroMisura()) traccia.push(`${tipo}:${nome}${tipo === 'scrivi' ? `:${a[0]}` : ''}`); return vero.apply(this, a); } });
      } else if (tipo === 'leggi' && d.get) {
        const vero = d.get;
        Object.defineProperty(proto, nome, { ...d, get() { if (dentroMisura()) traccia.push(`leggi:${nome}`); return vero.call(this); } });
      } else if (tipo === 'scrivi' && d.set) {
        const vero = d.set;
        Object.defineProperty(proto, nome, { ...d, set(v) { if (dentroMisura()) traccia.push(`scrivi:${nome}`); return vero.call(this, v); } });
      }
    };
    avvolgi(Element.prototype, 'getBoundingClientRect', 'leggi');
    avvolgi(Element.prototype, 'clientHeight', 'leggi');
    avvolgi(window, 'getComputedStyle', 'leggi');
    avvolgi(CSSStyleDeclaration.prototype, 'setProperty', 'scrivi');
    avvolgi(CSSStyleDeclaration.prototype, 'scrollPaddingTop', 'scrivi');
    /* il confine di ogni misura: `misura` gira dentro il callback del suo ResizeObserver; un segno a ogni callback */
    const RO = window.ResizeObserver;
    window.ResizeObserver = class extends RO { constructor(cb) { super((...a) => { traccia.push('inizio'); return cb(...a); }); } };
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Bolle R-41', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, ID);
  await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/u);
  let seq = 0;
  await page.evaluate((lista) => { const r = window.__talosHarnessUiRuntime; for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation); },
    eventiTurni(12).map((e) => ({ ...e, _sequenza: ++seq })));
  /* scorrimento a passi, con fine di scorrimento: la domanda corrente cambia più volte */
  const passaggi = await page.evaluate(async () => {
    const sc = document.querySelector('#conversation').parentElement;
    const fotogramma = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    sc.scrollTop = 0; await fotogramma(); window.__r41.length = 0;
    const cambi = new Set();
    for (let y = 0; y < sc.scrollHeight - sc.clientHeight; y += 240) {
      sc.scrollTop = y; await fotogramma(); await new Promise((ok) => setTimeout(ok, 120));
      const c = document.querySelector('#conversation > .talos-turn[data-domanda-corrente]'); if (c) cambi.add(c);
    }
    return cambi.size;
  });
  const traccia = await page.evaluate(() => window.__r41.slice());
  expect(passaggi, 'la premessa: la domanda corrente è cambiata più volte').toBeGreaterThanOrEqual(3);
  expect(traccia.filter((x) => x.startsWith('leggi')).length, 'la premessa: misura ha letto qualcosa').toBeGreaterThan(0);
  /* la traccia si spezza ai callback dei ResizeObserver; restano solo i pezzi in cui `misura` ha fatto qualcosa */
  const misure = []; let corrente = [];
  for (const x of traccia) { if (x === 'inizio') { if (corrente.length) misure.push(corrente); corrente = []; } else corrente.push(x); }
  if (corrente.length) misure.push(corrente);
  expect(misure.length, 'la premessa: più misure registrate').toBeGreaterThanOrEqual(3);
  const colpevoli = misure.filter((m) => { const prima = m.findIndex((x) => x.startsWith('scrivi')); return prima >= 0 && m.slice(prima).some((x) => x.startsWith('leggi')); });
  expect(colpevoli.length, `misure con una lettura DOPO una scrittura (${colpevoli.length} su ${misure.length}): ${JSON.stringify(colpevoli[0] ?? [])}`).toBe(0);
  expect(tentate).toEqual([]);
});

/*
 * Revisione del blocco 13, buco R2 (e R3): BOLLE-R41-01 guarda solo l'ORDINE delle letture. I due valori che `misura` passa avanti, l'altezza
 *   della vista e lo spostamento della fascia, non li guardava nessuno. Qui si guardano dal risultato: la domanda successiva prende il fondo
 *   (`data-domanda-sopra`) quando la sua testa entra nella fascia, né prima né dopo, anche dopo che la finestra ha cambiato altezza.
 */
test('BOLLE-R41-02 — the next question takes its background exactly when it enters the band, at the height of the view NOW, and the reserve equals the painted band', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 560 });
  await page.route('**/api/v1/**', (route) => (route.request().method() !== 'GET' ? route.abort() : route.fallback()));
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta aperto e muto */ });
  await page.addInitScript(() => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } })); } catch { /* */ }
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Bolle R-41', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, ID);
  await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/u);
  let seq = 0;
  await page.evaluate((lista) => { const r = window.__talosHarnessUiRuntime; for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation); },
    eventiTurni(30).map((e) => ({ ...e, _sequenza: ++seq })));

  /* porta la testa della domanda successiva a `dy` px dal fondo della fascia e dice che cosa vede il browser */
  const conTesta = (dy, { dalCentro = true } = {}) => page.evaluate(async ({ scarto, centra }) => {
    const sc = document.querySelector('#conversation').parentElement;
    const fotogramma = () => new Promise((ok) => { requestAnimationFrame(() => requestAnimationFrame(ok)); });
    const successiva = async () => {
      for (let i = 0; i < 40; i += 1) {
        const trovata = document.querySelector('#conversation > .talos-turn[data-domanda-successiva]');
        if (trovata && sc.style.scrollPaddingTop) return trovata;
        await new Promise((ok) => { setTimeout(ok, 50); });
      }
      throw new Error(`nessuna domanda successiva: ${JSON.stringify({ turni: document.querySelectorAll('#conversation > .talos-turn').length, corrente: document.querySelectorAll('[data-domanda-corrente]').length, successiva: document.querySelectorAll('[data-domanda-successiva]').length, riserva: sc.style.scrollPaddingTop, top: sc.scrollTop, alto: sc.scrollHeight, vista: sc.clientHeight, classe: sc.className })}`);
    };
    /* sempre dal centro: una finestra più alta può aver portato lo scorrimento in fondo, dove la successiva non arriva più in cima */
    /* dopo i turni appena arrivati la chat si riporta in fondo da sola per qualche istante: si insiste finché resta al centro */
    for (let i = 0; centra && i < 12; i += 1) {
      const centro = (sc.scrollHeight - sc.clientHeight) / 2;
      sc.scrollTo({ top: centro, behavior: 'instant' });
      await new Promise((ok) => { setTimeout(ok, 250); });
      if (Math.abs(sc.scrollTop - centro) < sc.clientHeight) break;
    }
    /* il bersaglio si tiene fermo: i turni si impaginano davvero solo quando entrano in vista, e la posizione si corregge a piccoli passi */
    const n = await successiva();
    for (let i = 0; i < 8; i += 1) {
      const voluto = sc.getBoundingClientRect().top + parseFloat(sc.style.scrollPaddingTop) + scarto;
      sc.scrollTo({ top: sc.scrollTop + n.getBoundingClientRect().top - voluto, behavior: 'instant' });
      await fotogramma();
    }
    await new Promise((ok) => { setTimeout(ok, 250); });
    await fotogramma();
    const distanza = n.getBoundingClientRect().top - (sc.getBoundingClientRect().top + parseFloat(sc.style.scrollPaddingTop));
    return { sopra: n.dataset.domandaSopra === 'si', distanza: Math.round(distanza) };
  }, { scarto: dy, centra: dalCentro });
  const prova = async (nome, opzioni) => {
    const fuori = await conTesta(40, opzioni);
    expect(fuori.distanza, `${nome}: la premessa, la testa è sotto la fascia`).toBeGreaterThan(20);
    expect(fuori.sopra, `${nome}: sotto la fascia niente fondo`).toBe(false);
    const dentro = await conTesta(-20, { dalCentro: false });
    expect(dentro.distanza, `${nome}: la premessa, la testa è dentro la fascia`).toBeLessThan(0);
    expect(dentro.sopra, `${nome}: dentro la fascia il fondo c'è`).toBe(true);
  };
  await prova('560 di altezza');

  /* R3: la riserva dello scorrevole coincide col fondo vero della fascia dipinta */
  const scarto = await page.evaluate(() => {
    const sc = document.querySelector('#conversation').parentElement;
    const turno = document.querySelector('#conversation > .talos-turn[data-domanda-corrente]');
    const fondoFascia = turno.getBoundingClientRect().top + parseFloat(turno.style.getPropertyValue('--talos-domanda-vista'));
    return { riserva: sc.getBoundingClientRect().top + parseFloat(sc.style.scrollPaddingTop), fondoFascia };
  });
  expect(Math.abs(scarto.riserva - scarto.fondoFascia), JSON.stringify(scarto)).toBeLessThanOrEqual(1);

  /* cambia solo l'altezza, con la stessa domanda ferma: non cambia misura, `misura` non parte e un cambio di domanda non rifà niente al posto suo */
  await page.setViewportSize({ width: 1440, height: 1000 });
  await prova('da 560 a 1000', { dalCentro: false });
  await page.setViewportSize({ width: 1440, height: 560 });
  await prova('da 1000 a 560', { dalCentro: false });
  /* cambia anche la larghezza: la bolla cambia misura e parte `misura`, con l'altezza che legge lei */
  await page.setViewportSize({ width: 1100, height: 900 });
  await prova('1100 per 900');
});
