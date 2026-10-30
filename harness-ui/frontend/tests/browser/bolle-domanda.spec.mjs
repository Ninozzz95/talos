import { test, expect } from '@playwright/test';

/*
 * ⭐ 27/10/2026 — LE BOLLE DELLA PERSONA COME HERMES (owner, con la foto di Hermes desktop): «introdurre opzione nelle impostazioni
 *   per rendere le bolle domanda (utente) come hermes a tutta larghezza, e di default renderle sticky al top come fa hermes,
 *   quest'ultima senza impostazione per tutti, evita di non spaccare nulla con questo cambiamento».
 *
 * Le prove nascono ROSSE sulla base (`b000e7253`, misurato su un checkout a parte): là non c'è niente che si fermi in cima e
 *   nessuna impostazione. Ogni prova misura nel DOM vivo — `getBoundingClientRect`, `elementFromPoint`, lo stile calcolato — e
 *   non deduce: «la domanda è in cima» vuol dire che il pixel in cima è suo.
 * ⛔ NIENTE SCRITTURE: il server finto risponde ai GET, ogni non-GET si ferma e si conta (zero alla fine).
 * Il codice: `src/components/domanda-appiccicata.js`, `src/styles/domanda-appiccicata.css`.
 */

const ID = 'bolle-domanda';
const RISPOSTA_LUNGA = Array.from({ length: 40 }, (_, i) => `Paragrafo ${i}: testo della risposta che continua a lungo per riempire lo schermo.`).join('\n\n');
const DOMANDA_LUNGA = Array.from({ length: 14 }, (_, i) => `Riga ${i} di una domanda molto lunga che va a capo più volte.`).join(' ');
const domanda = (t) => `Domanda numero ${t}: spiegami il passo ${t}.`;

/** I turni conclusi come li manda il server: domanda (col suo giro), risposta, fine. `lunghe`: gli indici con la domanda lunga. */
function eventiTurni(quanti, { lunghe = [], risposta = RISPOSTA_LUNGA, base = 0 } = {}) {
  const lista = [];
  for (let t = base; t < base + quanti; t += 1) {
    lista.push(
      { type: 'RunStarted', runId: `run-${t}`, input: { consegna: lunghe.includes(t) ? `${DOMANDA_LUNGA} (${t})` : domanda(t), seguito: t > 0 } },
      { type: 'TextMessageStart', messageId: `m-${t}`, role: 'assistant' },
      { type: 'TextMessageContent', messageId: `m-${t}`, delta: typeof risposta === 'function' ? risposta(t) : risposta },
      { type: 'TextMessageEnd', messageId: `m-${t}` },
      { type: 'RunFinished', outcome: { type: 'success' } },
    );
  }
  return lista;
}

async function guardiaScritture(page) {
  const tentate = [];
  await page.route('**/api/v1/**', (route) => {
    if (route.request().method() !== 'GET') { tentate.push(`${route.request().method()} ${route.request().url()}`); return route.abort(); }
    return route.fallback();
  });
  return tentate;
}

/** Apre una chat DAL VIVO (eventi passati a mano, flusso del server muto). */
async function apri(page, { modo = 'dark', aspetto = {}, lingua = 'it', forza = false } = {}) {
  /* le preferenze si scrivono una volta (la ricarica di BOLLE-06 deve trovare quelle salvate dalla pagina); `forza` le riscrive */
  await page.addInitScript(([colorMode, extra, uiLanguage, forza]) => {
    try { if (forza || !localStorage.getItem('talos.harness.desktop.settings.v1')) localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage, ...extra } })); } catch { /* storage assente */ }
  }, [modo, aspetto, lingua, forza]);
  const tentate = await guardiaScritture(page);
  await page.route(`**/api/v1/sessions/${ID}/events`, () => { /* resta aperto e muto */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Bolle della domanda', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, ID);
  await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/);
  return tentate;
}

let sequenza = 0;
const eventi = (page, lista) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, lista.map((e) => ({ ...e, _sequenza: ++sequenza })));

/** Porta in cima alla vista il punto `dy` px sotto la testa del turno `indice` (fra tutti i `.talos-turn`), e aspetta l'assestamento. */
async function scorriA(page, indice, dy) {
  /* prima un gesto VERO della persona verso l'alto: stacca il «segui il fondo» (`registraGestoScorrimento`, app.js), che
     altrimenti riporterebbe la vista in fondo al primo cambio d'altezza — come quando la persona risale a leggere */
  const sc = await page.locator('.talos-conversation.conversation').boundingBox();
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(80);
  /* ⛔ I turni chiusi fuori vista non si impaginano (`content-visibility:auto`, streaming-fluido.css:93-95): un salto lungo li
     porta in vista e la loro altezza vera sposta ciò che sta sotto (misurato: +892 px a turno). Si ripete finché il punto sta fermo. */
  for (let tentativo = 0; tentativo < 6; tentativo += 1) {
    const scarto = await page.evaluate(([i, dy]) => {
      const sc = document.querySelector('#conversation').parentElement;
      const turno = document.querySelectorAll('#conversation > .talos-turn')[i];
      turno.style.position = 'static';
      const alto = turno.getBoundingClientRect().top; // il posto nel FLUSSO, anche se è la domanda ferma
      turno.style.position = '';
      const voluto = sc.scrollTop + alto - sc.getBoundingClientRect().top + dy;
      const scarto = Math.abs(voluto - sc.scrollTop);
      sc.scrollTop = voluto;
      return scarto;
    }, [indice, dy]);
    await assestato(page);
    if (scarto <= 1) break;
  }
}
/** Due fotogrammi: l'osservatore consegna, il ricalcolo gira al fotogramma dopo. */
const assestato = (page) => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(ok)), 30)))));

/** Lo stato misurato delle domande: posizione calcolata, riquadro, attributi. */
const stato = (page) => page.evaluate(() => {
  const sc = document.querySelector('#conversation').parentElement;
  const r = sc.getBoundingClientRect();
  const turni = [...document.querySelectorAll('#conversation > .talos-turn')];
  return {
    alto: r.top, basso: r.bottom, sinistra: r.left, destra: r.right, scrollTop: sc.scrollTop, fondo: sc.scrollHeight - sc.clientHeight,
    domande: turni.map((t, i) => ({ t, i })).filter(({ t }) => t.dataset.turno === 'utente').map(({ t, i }) => {
      const q = t.getBoundingClientRect(); const b = t.querySelector('.talos-message__body').getBoundingClientRect();
      return { indice: i, posizione: getComputedStyle(t).position, alto: q.top, basso: q.bottom, corrente: t.dataset.domandaCorrente === 'si', successiva: t.dataset.domandaSuccessiva === 'si', lunga: t.dataset.domandaLunga === 'si', vista: parseFloat(t.style.getPropertyValue('--talos-domanda-vista')) || 0, bolla: { alto: b.top, basso: b.bottom, sinistra: b.left, destra: b.right } };
    }),
  };
});
/** Di chi è il pixel (x, y): l'indice del `.talos-turn` che lo dipinge, o -1. */
const diChi = (page, x, y) => page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  const turno = el?.closest?.('#conversation > .talos-turn');
  return turno ? [...document.querySelectorAll('#conversation > .talos-turn')].indexOf(turno) : -1;
}, [x, y]);

test.use({ viewport: { width: 1920, height: 1080 } });
test.beforeEach(() => { sequenza = 0; });

test('BOLLE-01 · la domanda resta in cima mentre si legge la sua risposta, e ne copre la fascia', async ({ page }) => {
  const tentate = await apri(page);
  await eventi(page, eventiTurni(6));
  await scorriA(page, 5, 900); // a metà della risposta del terzo turno (turni: 0 q, 1 r, 2 q, 3 r, 4 q, 5 r …)
  const s = await stato(page);
  const ferme = s.domande.filter((d) => d.posizione === 'sticky');
  expect(ferme.map((d) => d.indice), 'una domanda sola è appiccicata, ed è quella del turno a schermo').toEqual([4]);
  const q = ferme[0];
  expect(q.corrente).toBe(true);
  expect(q.alto, 'la domanda è salita in cima').toBeLessThanOrEqual(s.alto);
  expect(q.bolla.alto, 'e la sua bolla si vede').toBeGreaterThan(s.alto);
  /* la fascia è sua: il centro della bolla e un punto a sinistra della bolla, dentro la fascia, sono pixel della domanda */
  expect(await diChi(page, (q.bolla.sinistra + q.bolla.destra) / 2, (q.bolla.alto + q.bolla.basso) / 2)).toBe(4);
  expect(await diChi(page, q.bolla.sinistra - 60, q.bolla.alto + 10), 'il testo che scorre sotto passa sotto la fascia, non attraverso').toBe(4);
  /* subito sotto la fascia si legge la risposta */
  expect(await diChi(page, q.bolla.sinistra - 60, q.alto + q.vista + 40)).toBe(5);
  expect(tentate).toEqual([]);
});

test('BOLLE-02 · passaggio di consegne: la domanda dopo scorre sopra la ferma e ne prende il posto, mai due impilate', async ({ page }) => {
  const tentate = await apri(page);
  await eventi(page, eventiTurni(6));
  /* la domanda del quarto turno sta arrivando: 40 px sotto il bordo */
  await scorriA(page, 6, -40);
  let s = await stato(page);
  const ferma = s.domande.find((d) => d.corrente);
  const arriva = s.domande.find((d) => d.indice === 6);
  expect(ferma?.indice, 'durante l’arrivo resta ferma la domanda di prima').toBe(4);
  expect(arriva.successiva, 'quella che arriva è la successiva').toBe(true);
  expect(await diChi(page, (arriva.bolla.sinistra + arriva.bolla.destra) / 2, arriva.bolla.alto + 6), 'la domanda che arriva scorre SOPRA quella ferma').toBe(6);
  /* passata la riga: la nuova è in cima, la vecchia è tornata al suo posto (sopra la vista) */
  await scorriA(page, 7, 500);
  s = await stato(page);
  expect(s.domande.filter((d) => d.posizione === 'sticky').map((d) => d.indice)).toEqual([6]);
  const vecchia = s.domande.find((d) => d.indice === 4);
  expect(vecchia.corrente).toBe(false);
  expect(vecchia.basso, 'la domanda vecchia se n’è andata con il suo turno').toBeLessThan(s.alto);
  /* e su tutta la conversazione, a passi: mai più di una ferma, mai due che si sovrappongono in cima */
  const passi = await page.evaluate(async () => {
    const sc = document.querySelector('#conversation').parentElement;
    const esiti = [];
    for (let y = 0; y <= sc.scrollHeight; y += 333) {
      sc.scrollTop = y;
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(ok), 20))));
      const top = sc.getBoundingClientRect().top;
      const domande = [...document.querySelectorAll('#conversation > .talos-turn[data-turno="utente"]')];
      const ferme = domande.filter((d) => getComputedStyle(d).position === 'sticky');
      const inCima = domande.filter((d) => { const r = d.getBoundingClientRect(); return r.top <= top + 1 && r.bottom > top + 1; });
      esiti.push({ y, ferme: ferme.length, inCima: inCima.length });
    }
    return esiti;
  });
  for (const p of passi) {
    expect(p.ferme, `scrollTop ${p.y}: più di una domanda appiccicata`).toBeLessThanOrEqual(1);
    expect(p.inCima, `scrollTop ${p.y}: due domande in cima`).toBeLessThanOrEqual(1);
  }
  expect(tentate).toEqual([]);
});

test('BOLLE-03 · dal vivo la domanda ferma non copre la riga del lavoro in corso né il compositore', async ({ page }) => {
  const tentate = await apri(page);
  await eventi(page, eventiTurni(2));
  await eventi(page, [
    { type: 'RunStarted', runId: 'run-vivo', input: { consegna: 'Leggi tutto e riassumi.', seguito: true } },
    { type: 'TextMessageStart', messageId: 'm-vivo', role: 'assistant' },
    { type: 'TextMessageContent', messageId: 'm-vivo', delta: RISPOSTA_LUNGA },
    { type: 'TextMessageEnd', messageId: 'm-vivo' },
    { type: 'ToolCallStart', toolCallId: 'a1', toolCallName: 'leggi' },
    { type: 'ToolCallArgs', toolCallId: 'a1', delta: JSON.stringify({ percorso: 'README.md' }) },
  ]);
  await page.evaluate(() => { const sc = document.querySelector('#conversation').parentElement; sc.scrollTop = sc.scrollHeight; });
  await assestato(page);
  const s = await stato(page);
  const q = s.domande.find((d) => d.corrente);
  expect(q?.indice, 'in fondo alla risposta lunga la sua domanda è ferma in cima').toBe(4);
  const riga = await page.evaluate(() => {
    const seg = window.__talosHarnessUiRuntime.realSessionState.segmentoAttivo;
    const card = seg?.wrapper?.card ?? seg?.voci?.[0]?.card;
    const r = card?.getBoundingClientRect();
    return r ? { alto: r.top, basso: r.bottom, x: (r.left + r.right) / 2 } : null;
  });
  expect(riga, 'premessa: la riga del lavoro in corso c’è').not.toBeNull();
  expect(riga.alto, 'la riga viva sta sotto la fascia della domanda').toBeGreaterThan(q.alto + q.vista);
  expect(await diChi(page, riga.x, (riga.alto + riga.basso) / 2), 'il pixel della riga viva è della risposta').toBe(5);
  const compositore = await page.locator('#composerForm textarea').first().boundingBox();
  const sopra = await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('#composerForm')), [compositore.x + compositore.width / 2, compositore.y + compositore.height / 2]);
  expect(sopra, 'il compositore resta sopra la conversazione').toBe(true);
  expect(tentate).toEqual([]);
});

test('BOLLE-04 · la domanda lunga ferma si taglia a quattro righe, e «Domanda intera» la mostra tutta', async ({ page }) => {
  const tentate = await apri(page);
  await eventi(page, eventiTurni(5, { lunghe: [2] }));
  await scorriA(page, 5, 900);
  let s = await stato(page);
  const q = s.domande.find((d) => d.corrente);
  expect(q?.indice).toBe(4);
  expect(q.lunga, 'la bolla è più lunga di quattro righe').toBe(true);
  const riga = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#conversation > .talos-turn[data-domanda-corrente] .message-bubble p')).lineHeight));
  /* la fascia arriva alla quarta riga (12 px di padding, 1 di bordo) più il respiro, non oltre */
  const fineFascia = q.alto + q.vista; // la testa del turno fermo sta 12 px sopra il bordo (`--talos-domanda-cima`)
  expect(fineFascia - q.bolla.alto, 'la fascia taglia la bolla dopo la quarta riga').toBeLessThanOrEqual(13 + 4 * riga + 8 + 2);
  expect(fineFascia - q.bolla.alto).toBeGreaterThanOrEqual(13 + 4 * riga);
  /* sotto il taglio, dove la bolla intera avrebbe la sesta riga, si vede la risposta */
  expect(await diChi(page, q.bolla.sinistra + 20, q.bolla.alto + 13 + 5.5 * riga)).toBe(5);
  const pulsante = page.locator('#conversation > .talos-turn[data-domanda-corrente] .talos-domanda-intera');
  await expect(pulsante).toBeVisible();
  await expect(pulsante).toHaveAccessibleName('Mostra la domanda intera');
  const box = await pulsante.boundingBox();
  expect(box.y + box.height, 'il pulsante sta dentro la fascia').toBeLessThanOrEqual(fineFascia + 1);
  await pulsante.click();
  /* lo scorrimento (animato) si ferma con la domanda al suo posto: testa sul bordo, non più 12 px sopra come quando è ferma */
  await expect.poll(async () => { const t = await stato(page); return Math.abs(Math.round(t.domande.find((d) => d.indice === 4).alto - t.alto)); }, { message: 'la domanda torna al suo posto, in cima', timeout: 8000 }).toBe(0);
  await assestato(page);
  s = await stato(page);
  const intera = s.domande.find((d) => d.indice === 4);
  expect(intera.alto).toBeGreaterThanOrEqual(s.alto - 1);
  /* intera e leggibile: il pixel dell'ultima riga è della domanda */
  expect(await diChi(page, intera.bolla.sinistra + 20, intera.bolla.basso - 20)).toBe(4);
  await expect(pulsante, 'al suo posto nel flusso il pulsante non serve').toBeHidden();
  /* al contrario: una domanda CORTA ferma non ha il pulsante */
  await scorriA(page, 3, 900);
  await expect(page.locator('#conversation > .talos-turn[data-domanda-corrente] .talos-domanda-intera')).toHaveCount(0);
  expect(tentate).toEqual([]);
});

/** Le misure d'impaginazione di tutta la colonna: si confrontano con e senza la funzione. */
const impaginazione = (page) => page.evaluate(() => {
  const col = document.querySelector('#conversation');
  return {
    altezza: col.scrollHeight,
    turni: [...col.children].map((t) => [t.offsetHeight, t.offsetWidth]),
    bolle: [...col.querySelectorAll('.talos-message--user')].map((m) => {
      const b = m.querySelector('.talos-message__body'); const mr = m.getBoundingClientRect(); const br = b.getBoundingClientRect();
      return [Math.round(br.left - mr.left), Math.round(br.width), Math.round(br.height), Math.round(br.top - mr.top)];
    }),
  };
});

test('BOLLE-05 · «Domande a tutta larghezza»: spenta la bolla non cambia di un pixel, accesa occupa la colonna', async ({ page }) => {
  const tentate = await apri(page);
  await eventi(page, eventiTurni(6, { lunghe: [4] }));
  await scorriA(page, 9, 900); // una domanda ferma, lunga: lo stato più carico della funzione
  expect((await stato(page)).domande.some((d) => d.posizione === 'sticky')).toBe(true);
  await expect(page.locator('html')).not.toHaveClass(/user-bubble-full-width/);
  const con = await impaginazione(page);
  /* senza la funzione: si stacca lo script e si tolgono le sue regole dai fogli; l'impaginazione deve essere IDENTICA */
  await page.evaluate(() => {
    window.__talosHarnessUiRuntime.domandaAppiccicata().scollega();
    for (const foglio of document.styleSheets) {
      let regole; try { regole = foglio.cssRules; } catch { continue; }
      const togli = (lista, padre) => { for (let i = lista.length - 1; i >= 0; i -= 1) { const r = lista[i]; if (/domanda-|user-bubble-full-width/.test(r.cssText)) padre.deleteRule(i); else if (r.cssRules) togli(r.cssRules, r); } };
      togli(regole, foglio);
    }
  });
  await assestato(page);
  expect(await impaginazione(page), 'la funzione (spenta l’impostazione) ha cambiato l’impaginazione').toEqual(con);
  expect(tentate).toEqual([]);

  /* accesa: la bolla parte dal bordo sinistro del messaggio ed è larga quanto lui */
  const pagina2 = await page.context().newPage();
  sequenza = 0;
  const tentate2 = await apri(pagina2, { aspetto: { userBubbleFullWidth: true }, forza: true });
  await eventi(pagina2, eventiTurni(3));
  await expect(pagina2.locator('html')).toHaveClass(/user-bubble-full-width/);
  const piene = await pagina2.evaluate(() => [...document.querySelectorAll('#conversation .talos-message--user')].map((m) => {
    const mr = m.getBoundingClientRect(); const br = m.querySelector('.talos-message__body').getBoundingClientRect();
    return { sinistra: Math.round(br.left - mr.left), larghezza: Math.round(br.width), messaggio: Math.round(mr.width) };
  }));
  expect(piene.length).toBe(3);
  for (const p of piene) { expect(p.sinistra).toBe(0); expect(p.larghezza).toBe(p.messaggio); }
  expect(tentate2).toEqual([]);
  await pagina2.close();
});

test('BOLLE-06 · l’impostazione si accende dalle Impostazioni e resta dopo una ricarica', async ({ page }) => {
  const tentate = await apri(page);
  await page.evaluate(() => window.__talosHarnessUiRuntime.setSettingsSection('chat', { persist: false }));
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime.setSettingsSection('chat', { persist: false });
  });
  const riga = page.locator('[data-setting-row="userBubbleFullWidthToggle"]');
  await expect(riga).toBeVisible();
  await expect(riga).toContainText('Domande a tutta larghezza');
  const interruttore = riga.locator('button[role="switch"]');
  await expect(interruttore).toHaveAttribute('aria-checked', 'false');
  await interruttore.click();
  await expect(page.locator('html')).toHaveClass(/user-bubble-full-width/);
  await expect(interruttore).toHaveAttribute('aria-checked', 'true');
  const salvato = await page.evaluate(() => JSON.parse(localStorage.getItem('talos.harness.desktop.settings.v1')).appearance.userBubbleFullWidth);
  expect(salvato).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await expect(page.locator('html')).toHaveClass(/user-bubble-full-width/);
  expect(tentate).toEqual([]);
});

test('BOLLE-07 · rigiocata dalla storia salvata: la domanda si ferma in cima come dal vivo', async ({ page }) => {
  const storia = [...eventiTurni(6), { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }].map((e, i) => ({ ...e, _sequenza: i + 1 }));
  await page.addInitScript(() => { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: 'dark' } })); });
  let nonGet = 0;
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { nonGet += 1; return route.abort(); }
    const url = new URL(req.url());
    if (url.pathname === `/api/v1/sessions/${ID}/events`) return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${storia.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    if (url.pathname === `/api/v1/sessions/${ID}/children`) return route.fulfill({ json: { ok: true, data: { figli: [] } } });
    if (url.pathname.startsWith(`/api/v1/sessions/${ID}/tree`)) return route.fulfill({ json: { ok: true, data: { voci: [] } } });
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'Bolle rigiocate', 'z-ai/glm-5.3-flash', { conclusa: true }), ID);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/);
  await expect(page.locator('#conversation > .talos-turn[data-turno="utente"]')).toHaveCount(6);
  await scorriA(page, 7, 900);
  const s = await stato(page);
  expect(s.domande.filter((d) => d.posizione === 'sticky').map((d) => d.indice)).toEqual([6]);
  const q = s.domande.find((d) => d.indice === 6);
  expect(q.alto).toBeLessThanOrEqual(s.alto);
  expect(await diChi(page, (q.bolla.sinistra + q.bolla.destra) / 2, (q.bolla.alto + q.bolla.basso) / 2)).toBe(6);
  expect(nonGet).toBe(0);
});

test('BOLLE-08 · «Modifica e rimanda» su una domanda ferma: il campo si apre al suo posto, visibile, e si annulla', async ({ page }) => {
  const tentate = await apri(page);
  await eventi(page, eventiTurni(4));
  await scorriA(page, 5, 900);
  expect((await stato(page)).domande.find((d) => d.corrente)?.indice).toBe(4);
  const turno = page.locator('#conversation > .talos-turn').nth(4);
  await turno.locator('[data-message-action="modifica"]').evaluate((b) => b.click());
  const campo = turno.locator('.talos-rami-modifica textarea');
  await expect(campo).toBeVisible();
  await expect(campo).toBeFocused();
  const pos = await turno.evaluate((t) => getComputedStyle(t).position);
  expect(pos, 'mentre la si modifica la domanda torna nel flusso').not.toBe('sticky');
  await assestato(page);
  /* il campo è dentro la vista e nessun'altra domanda lo copre */
  const box = await campo.boundingBox();
  const s = await stato(page);
  expect(box.y).toBeGreaterThanOrEqual(s.alto - 1);
  expect(box.y + box.height).toBeLessThanOrEqual(s.basso + 1);
  expect(await diChi(page, box.x + box.width / 2, box.y + box.height / 2)).toBe(4);
  await turno.getByRole('button', { name: 'Annulla' }).click();
  await expect(turno.locator('.talos-rami-modifica')).toHaveCount(0);
  await expect(turno.locator('.message-bubble p')).toHaveText(domanda(2));
  expect(tentate).toEqual([]);
});

test('BOLLE-09 · «Torna in fondo» e i salti della cronologia arrivano dove devono, mai sotto la domanda ferma', async ({ page }) => {
  const tentate = await apri(page);
  await eventi(page, eventiTurni(6));
  await scorriA(page, 3, 900);
  await expect(page.locator('#chatTornaInFondo')).toBeVisible();
  const partenza = (await stato(page)).scrollTop;
  await page.locator('#chatTornaInFondo').click();
  /* il «fondo» è quello dell'app (`scorriInFondoConversazione`, con la sua riserva): si aspetta che lo scorrimento si fermi */
  let ultimoTop = -1;
  await expect.poll(async () => { const t = (await stato(page)).scrollTop; const fermo = t === ultimoTop; ultimoTop = t; return fermo; }, { intervals: [150], timeout: 8000 }).toBe(true);
  expect(ultimoTop, 'è sceso').toBeGreaterThan(partenza + 1000);
  await assestato(page);
  /* l'ultimo paragrafo della risposta si legge, e non sta sotto la fascia */
  const ultimo = await page.evaluate(() => { const ps = [...document.querySelectorAll('#conversation > .talos-turn:last-child p')]; const r = ps.at(-1).getBoundingClientRect(); return { x: r.left + 20, y: (r.top + r.bottom) / 2 }; });
  expect(await diChi(page, ultimo.x, ultimo.y)).toBe(11);
  /* la cronologia porta al centro della vista un turno: il centro della vista è suo, non della fascia.
     ⛔ Ogni salto parte da DUE turni prima del bersaglio: un salto lungo e animato verso l'alto, sulla base `b000e7253` SENZA questa
     funzione, atterra già su un altro turno (voce 3 → turno 5, misurato: i turni chiusi fuori vista che si impaginano durante il
     viaggio spostano la meta). È un difetto della base, riportato a parte; qui si prova ciò che questa funzione cambia. */
  for (const indice of [3, 4, 9]) {
    await scorriA(page, indice - 2, 200);
    await page.locator(`#schermoChat .talos-cronologia__voce[data-indice="${indice}"]`).evaluate((b) => b.click());
    await page.waitForTimeout(700); // il salto può essere animato
    await assestato(page);
    const s = await stato(page);
    /* la cronologia porta il bersaglio al CENTRO (`cronologia.js:439`, block:'center'): il centro della vista è suo e sta sotto la fascia */
    const y = (s.alto + s.basso) / 2;
    const fascia = s.domande.find((d) => d.corrente && d.indice !== indice);
    if (fascia) expect(y, `voce ${indice}: il centro della vista sta sotto la fascia`).toBeGreaterThan(fascia.alto + fascia.vista);
    expect(await diChi(page, s.sinistra + (s.destra - s.sinistra) / 2 - 100, y), `voce ${indice}: il bersaglio si vede`).toBe(indice);
  }
  /* la spina (nascosta, ma i suoi segni restano bottoni): un giro di TALOS porta in cima la SUA domanda, al suo posto */
  await scorriA(page, 5, 200);
  await page.locator('#conversation > .talos-turn').nth(7).locator('.talos-turn-spine__tick').first().evaluate((b) => b.click());
  let fermo = -1;
  await expect.poll(async () => { const t = (await stato(page)).scrollTop; const ok = t === fermo; fermo = t; return ok; }, { intervals: [150], timeout: 8000 }).toBe(true);
  await assestato(page);
  const s = await stato(page);
  const q = s.domande.find((d) => d.indice === 6);
  expect(Math.abs(q.alto - s.alto), 'la domanda del giro scelto è in cima, al suo posto').toBeLessThanOrEqual(2);
  expect(await diChi(page, q.bolla.sinistra + 20, q.bolla.alto + 10)).toBe(6);
  expect(tentate).toEqual([]);
});

test('BOLLE-10 · una volta sola per i lettori di schermo; il fuoco da tastiera dentro la domanda ferma si vede', async ({ page }) => {
  const tentate = await apri(page);
  await eventi(page, eventiTurni(5, { lunghe: [2] }));
  await scorriA(page, 5, 900);
  const volte = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && e.textContent.includes('Riga 13 di una domanda')).length);
  expect(volte, 'il testo della domanda esiste una volta sola nella pagina (nessun clone)').toBe(1);
  const pulsante = page.locator('#conversation > .talos-turn[data-domanda-corrente] .talos-domanda-intera');
  await pulsante.focus();
  const primaDelFuoco = (await stato(page)).scrollTop;
  await page.keyboard.press('Shift+Tab'); // l'ultima azione del messaggio, che sta sotto il taglio
  await assestato(page);
  expect((await stato(page)).scrollTop, 'il fuoco dentro la domanda ferma non fa saltare la chat').toBe(primaDelFuoco);
  const fuoco = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2; const sopra = document.elementFromPoint(x, y); return { azione: a.dataset.messageAction ?? null, visto: a === sopra || a.contains(sopra), outline: getComputedStyle(a).outlineStyle }; });
  expect(fuoco.azione, 'premessa: il fuoco è su un’azione della domanda').not.toBeNull();
  expect(fuoco.visto, 'l’azione con il fuoco si vede: il taglio si toglie').toBe(true);
  expect(fuoco.outline).not.toBe('none');
  expect(tentate).toEqual([]);
});

test('BOLLE-13 · il fuoco su un link della risposta finito dietro la fascia lo porta sotto di lei (WCAG 2.4.11)', async ({ page }) => {
  const tentate = await apri(page);
  const conLink = RISPOSTA_LUNGA.replace('Paragrafo 3:', 'Paragrafo 3 con [un collegamento](https://example.com/prova):');
  await eventi(page, eventiTurni(4, { risposta: conLink }));
  await scorriA(page, 5, 0);
  /* il link del terzo paragrafo, portato a metà della fascia */
  await page.evaluate(() => {
    const sc = document.querySelector('#conversation').parentElement;
    const a = document.querySelectorAll('#conversation > .talos-turn')[5].querySelector('a');
    const q = document.querySelector('#conversation > .talos-turn[data-domanda-corrente]');
    const fine = q.getBoundingClientRect().top + parseFloat(q.style.getPropertyValue('--talos-domanda-vista'));
    sc.scrollTop += a.getBoundingClientRect().top - (fine - 40);
  });
  await assestato(page);
  const prima = await page.evaluate(() => { const a = document.querySelectorAll('#conversation > .talos-turn')[5].querySelector('a'); const r = a.getBoundingClientRect(); const sopra = document.elementFromPoint(r.left + 4, r.top + r.height / 2); return a === sopra || a.contains(sopra); });
  expect(prima, 'premessa: il link sta dietro la fascia').toBe(false);
  await page.evaluate(() => document.querySelectorAll('#conversation > .talos-turn')[5].querySelector('a').focus());
  await assestato(page);
  const dopo = await page.evaluate(() => { const a = document.querySelectorAll('#conversation > .talos-turn')[5].querySelector('a'); const r = a.getBoundingClientRect(); const sopra = document.elementFromPoint(r.left + 4, r.top + r.height / 2); return a === sopra || a.contains(sopra); });
  expect(dopo, 'il link col fuoco si vede').toBe(true);
  expect(tentate).toEqual([]);
});

test('BOLLE-14 · cambiata la lingua, «Domanda intera» parla la lingua nuova (il pulsante staccato non riceve il ridisegno)', async ({ page }) => {
  /* la conversazione si rilegge dal server al cambio lingua (`collegaRidisegnoLingua`, app.js): il server finto la ridà ogni volta */
  const storia = [...eventiTurni(5, { lunghe: [2] }), { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }].map((e, i) => ({ ...e, _sequenza: i + 1 }));
  await page.addInitScript(() => { if (!localStorage.getItem('talos.harness.desktop.settings.v1')) localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: 'dark' } })); });
  let nonGet = 0;
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { nonGet += 1; return route.abort(); }
    const url = new URL(req.url());
    if (url.pathname === `/api/v1/sessions/${ID}/events`) return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000
${storia.map((e) => `data: ${JSON.stringify(e)}

`).join('')}` });
    if (url.pathname === `/api/v1/sessions/${ID}/children`) return route.fulfill({ json: { ok: true, data: { figli: [] } } });
    if (url.pathname.startsWith(`/api/v1/sessions/${ID}/tree`)) return route.fulfill({ json: { ok: true, data: { voci: [] } } });
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'Bolle lingua', 'z-ai/glm-5.3-flash', { conclusa: true }), ID);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await expect(page.locator('#conversation > .talos-turn[data-turno="utente"]')).toHaveCount(5);
  await scorriA(page, 5, 900);
  const pulsante = page.locator('#conversation > .talos-turn[data-domanda-corrente] .talos-domanda-intera');
  await expect(pulsante).toHaveText('Domanda intera');
  await scorriA(page, 3, 900); // una domanda corta in cima: il pulsante è STACCATO quando la lingua cambia
  await expect(page.locator('.talos-domanda-intera')).toHaveCount(0);
  await page.evaluate(() => { const sel = document.querySelector('#setting-uiLanguageSelect'); sel.value = 'en'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false && document.querySelectorAll('#conversation > .talos-turn[data-turno="utente"]').length === 5, null, { timeout: 15_000 });
  await scorriA(page, 5, 900);
  await expect(pulsante).toHaveText('Whole question');
  await expect(pulsante).toHaveAccessibleName('Show the whole question');
  expect(nonGet).toBe(0);
});

test('BOLLE-11 · movimento ridotto: «Domanda intera» salta senza animazione', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const tentate = await apri(page);
  await eventi(page, eventiTurni(5, { lunghe: [2] }));
  await scorriA(page, 5, 900);
  const dopo = await page.evaluate(async () => {
    const sc = document.querySelector('#conversation').parentElement;
    const prima = sc.scrollTop;
    document.querySelector('#conversation > .talos-turn[data-domanda-corrente] .talos-domanda-intera').click();
    return { prima, subito: sc.scrollTop };
  });
  expect(dopo.subito, 'lo scorrimento è già avvenuto, senza animazione').toBeLessThan(dopo.prima - 300);
  expect(tentate).toEqual([]);
});

const TURNI_BANCO = Number(process.env.BOLLE_TURNI || 300); // BOLLE_TURNI=1000 per la misura lunga del rapporto
test(`BOLLE-12 · costo: nessun lavoro a ogni fotogramma, ricalcoli solo ai cambi di turno (${TURNI_BANCO} turni)`, async ({ page }) => {
  test.setTimeout(1_500_000);
  const tentate = await apri(page);
  const lista = eventiTurni(TURNI_BANCO, { risposta: (t) => `Risposta ${t}.\n\n${'parola '.repeat(60)}fine.` });
  for (let i = 0; i < lista.length; i += 250) await eventi(page, lista.slice(i, i + 250));
  await assestato(page);
  const misura = () => page.evaluate(async () => {
    const sc = document.querySelector('#conversation').parentElement;
    const fotogrammi = [];
    let prima = performance.now();
    sc.scrollTop = 0;
    /* passi da 97 px (circa mezzo turno), al più 1.500 fotogrammi: con 1.000 turni la corsa resta sotto i dieci minuti */
    const passo = Math.max(97, Math.ceil((sc.scrollHeight - sc.clientHeight) / 1500));
    for (let y = 0; y < sc.scrollHeight - sc.clientHeight; y += passo) {
      sc.scrollTop = y;
      await new Promise((ok) => requestAnimationFrame(() => { const ora = performance.now(); fotogrammi.push(ora - prima); prima = ora; ok(); }));
    }
    fotogrammi.sort((a, b) => a - b);
    return { passi: fotogrammi.length, p50: fotogrammi[Math.floor(fotogrammi.length * 0.5)], p95: fotogrammi[Math.floor(fotogrammi.length * 0.95)] };
  });
  await misura(); // a vuoto: il primo passaggio impagina per la prima volta i turni saltati (`content-visibility`), e peserebbe su chi va primo
  const prima = await page.evaluate(() => window.__talosHarnessUiRuntime.domandaAppiccicata().conteggi());
  const con = await misura();
  const dopo = await page.evaluate(() => window.__talosHarnessUiRuntime.domandaAppiccicata().conteggi());
  await page.evaluate(() => window.__talosHarnessUiRuntime.domandaAppiccicata().scollega());
  const senza = await misura();
  test.info().annotations.push({ type: 'misura', description: JSON.stringify({ con, senza, ricalcoli: dopo.ricalcoli - prima.ricalcoli, cambi: dopo.cambi - prima.cambi }) });
  console.log('BOLLE-12', JSON.stringify({ con, senza, ricalcoli: dopo.ricalcoli - prima.ricalcoli, cambi: dopo.cambi - prima.cambi }));
  /* i ricalcoli seguono i turni attraversati, non i fotogrammi: al massimo uno per fotogramma, e meno dei passi */
  expect(dopo.ricalcoli - prima.ricalcoli).toBeLessThanOrEqual(con.passi + 2);
  expect(dopo.cambi - prima.cambi, 'ogni domanda attraversata cambia la corrente al più una volta').toBeLessThanOrEqual(TURNI_BANCO + 2);
  expect(con.p95, 'la funzione non rallenta lo scorrimento').toBeLessThanOrEqual(senza.p95 * 1.5 + 4);
  expect(tentate).toEqual([]);
});

/*
 * Le foto per la revisione (≥1920×1080, chiaro e scuro): solo con BOLLE_FOTO=<cartella>, non nella suite di serie.
 *   BOLLE_FOTO=<cartella delle foto> npx playwright test bolle-domanda -g FOTO
 */
const CARTELLA_FOTO = process.env.BOLLE_FOTO || '';
for (const modo of ['dark', 'light']) {
  test(`BOLLE-FOTO · ${modo}`, async ({ browser }) => {
    test.skip(!CARTELLA_FOTO, 'solo con BOLLE_FOTO');
    test.setTimeout(120_000);
    const scena = async (aspetto, nome, azione) => {
      const contesto = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: modo });
      const page = await contesto.newPage();
      sequenza = 0;
      await apri(page, { modo, aspetto, forza: true });
      await eventi(page, eventiTurni(5, { lunghe: [2] }));
      await azione(page);
      await page.mouse.move(1900, 1000);
      await page.screenshot({ path: `${CARTELLA_FOTO}/${nome}-${modo}.png` });
      await contesto.close();
    };
    await scena({}, '01-domanda-ferma-corta', (p) => scorriA(p, 3, 700));
    await scena({}, '02-domanda-lunga-tagliata', (p) => scorriA(p, 5, 700));
    await scena({}, '03-passaggio-di-consegne', (p) => scorriA(p, 6, -60));
    await scena({}, '04-larghezza-spenta', (p) => scorriA(p, 4, -120));
    await scena({ userBubbleFullWidth: true }, '05-larghezza-accesa', (p) => scorriA(p, 4, -120));
    await scena({ userBubbleFullWidth: true }, '06-larghezza-accesa-ferma', (p) => scorriA(p, 5, 700));
  });
}
