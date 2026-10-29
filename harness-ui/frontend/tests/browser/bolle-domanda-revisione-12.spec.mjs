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

const TURNI_BANCO = Number(process.env.BOLLE_TURNI || 300);

/* ───────────── Revisione avversaria del blocco 12 (27/10/2026), portata nel ramo il 28/10 con le cure dell'owner ───────────── */

/*
 * BOLLE-REV-01 — la domanda SUCCESSIVA ha sempre il fondo pieno del tema sul suo messaggio, anche quando scorre al suo posto e non
 *   copre niente. Il messaggio della persona è largo quanto la colonna (la bolla è allineata a destra dentro): con la scena animata
 *   accesa (di serie) si vede un rettangolo largo quanto la colonna. Foto nei due temi, e la misura della larghezza del fondo.
 */
for (const modo of ['dark', 'light']) {
  test(`BOLLE-REV-01 (${modo}) the next question paints no full-column opaque band while it is just scrolling in its place`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: modo });
    const tentate = await apri(page, { modo, aspetto: { backgroundMotion: true }, forza: true });
    await eventi(page, eventiTurni(4));
    await scorriA(page, 4, -500); // la domanda 1 (turno 2) è la corrente ferma, la 2 (turno 4) la successiva, a metà schermo
    const misura = await page.evaluate(() => {
      const succ = document.querySelector('#conversation > .talos-turn[data-domanda-successiva] > .talos-message--user');
      if (!succ) return null;
      const r = succ.getBoundingClientRect(); const b = succ.querySelector('.talos-message__body').getBoundingClientRect();
      return { fondo: getComputedStyle(succ).backgroundColor, larghezzaMessaggio: Math.round(r.width), larghezzaBolla: Math.round(b.width), alto: Math.round(r.top) };
    });
    console.log('BOLLE-REV-01', modo, JSON.stringify(misura));
    await page.screenshot({ path: `test-results/bolle-rev-01-${modo}.png` });
    expect(misura, 'there is a next question').not.toBeNull();
    // un fondo pieno più largo della bolla è un rettangolo visibile sulla scena
    const pieno = !/rgba\(0, 0, 0, 0\)|transparent/u.test(misura.fondo);
    expect(pieno && misura.larghezzaMessaggio > misura.larghezzaBolla + 40, `opaque ${misura.fondo} band ${misura.larghezzaMessaggio}px wide behind a ${misura.larghezzaBolla}px bubble`).toBe(false);
    expect(tentate).toEqual([]);
  });
}

/*
 * BOLLE-REV-02 — una domanda corta FERMA in cima: le sue azioni (copia, modifica, «⋯») sono tagliate dalla fascia, e il clic dove
 *   starebbero arriva alla risposta. Domanda aperta 6 nella lista dell'autore: qui la misura.
 */
test('BOLLE-REV-02 the actions of a short stuck question can be reached (hover shows them, a click hits them)', async ({ page }) => {
  const tentate = await apri(page);
  await eventi(page, eventiTurni(3));
  await scorriA(page, 3, 600);
  /* owner 28/10/2026, «Come Hermes»: le azioni compaiono passando col mouse sulla parte visibile della domanda ferma (il taglio si alza
     dopo 120 ms); poi il clic deve arrivare a loro */
  const bolla = page.locator('#conversation > .talos-turn[data-domanda-corrente] .talos-message__body').first();
  const rb = await bolla.boundingBox();
  await page.mouse.move(rb.x + rb.width / 2, rb.y + 10);
  await page.waitForTimeout(300);
  const dove = await page.evaluate(() => {
    const t = document.querySelector('#conversation > .talos-turn[data-domanda-corrente]');
    const azioni = t?.querySelector('.talos-message__actions');
    if (!azioni) return { azioni: false };
    const r = azioni.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const el = document.elementFromPoint(x, y);
    return { azioni: true, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], vista: t.style.getPropertyValue('--talos-domanda-vista'), colpito: el ? `${el.tagName}.${el.className}` : null, dentroAzioni: Boolean(el && azioni.contains(el)) };
  });
  console.log('BOLLE-REV-02', JSON.stringify(dove));
  expect(dove.azioni).toBe(true);
  expect(dove.dentroAzioni, `a click on the stuck question's actions hits ${dove.colpito}`).toBe(true);
  expect(tentate).toEqual([]);
});

/*
 * BOLLE-REV-03 — la banca dei costi dell'autore misura «con» e poi «senza» nella STESSA pagina, una volta, in quest'ordine; qui
 *   l'ordine è rovesciato (prima senza: si stacca e si ricollega? no — il collegamento non si rifà, quindi si misura «senza» su una
 *   pagina nuova) e il conto si ripete due volte per braccio.
 */
test('BOLLE-REV-03 cost bench, arms in separate pages, two runs each (BOLLE_TURNI turns)', async ({ browser }) => {
  test.setTimeout(1_800_000);
  const misuraIn = async (stacca) => {
    const contesto = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await contesto.newPage();
    sequenza = 0;
    await apri(page, { forza: true });
    const lista = eventiTurni(TURNI_BANCO, { risposta: (t) => `Risposta ${t}.\n\n${'parola '.repeat(60)}fine.` });
    for (let i = 0; i < lista.length; i += 250) await eventi(page, lista.slice(i, i + 250));
    await assestato(page);
    if (stacca) await page.evaluate(() => window.__talosHarnessUiRuntime.domandaAppiccicata().scollega());
    const corsa = () => page.evaluate(async () => {
      const sc = document.querySelector('#conversation').parentElement;
      const fotogrammi = []; let prima = performance.now(); sc.scrollTop = 0;
      const passo = Math.max(97, Math.ceil((sc.scrollHeight - sc.clientHeight) / 1500));
      for (let y = 0; y < sc.scrollHeight - sc.clientHeight; y += passo) {
        sc.scrollTop = y;
        await new Promise((ok) => requestAnimationFrame(() => { const ora = performance.now(); fotogrammi.push(ora - prima); prima = ora; ok(); }));
      }
      fotogrammi.sort((a, b) => a - b);
      return { passi: fotogrammi.length, p50: +fotogrammi[Math.floor(fotogrammi.length * 0.5)].toFixed(1), p95: +fotogrammi[Math.floor(fotogrammi.length * 0.95)].toFixed(1) };
    });
    await corsa();
    const a = await corsa(); const b = await corsa();
    await contesto.close();
    return [a, b];
  };
  const senza = await misuraIn(true);
  const con = await misuraIn(false);
  console.log('BOLLE-REV-03', TURNI_BANCO, JSON.stringify({ senza, con }));
  /* owner 28/10/2026, «Accetta con la cura»: a 1000 turni deve tornare sotto il +10%. Il cancello vale a ogni misura (300 di serie,
     BOLLE_TURNI=1000 a mano): media delle due corse per braccio, un piccolo margine assoluto per il rumore dei fotogrammi. */
  const media = (xs, k) => xs.reduce((a, x) => a + x[k], 0) / xs.length;
  expect(media(con, 'p50'), 'median frame with the stuck question').toBeLessThanOrEqual(media(senza, 'p50') * 1.10 + 1);
  expect(media(con, 'p95'), '95th percentile frame with the stuck question').toBeLessThanOrEqual(media(senza, 'p95') * 1.10 + 2);
});

/*
 * BOLLE-REV-04 — owner 28/10/2026 («Sì, tutte e due», con la riserva «PagSu/PagGiù li provo io prima della fusione»): lo
 *   `scroll-padding-top` alto quanto la fascia vale anche per i tasti di pagina. Dopo un PagGiù l'ultima riga che si vedeva deve
 *   restare a schermo SOTTO la fascia della domanda ferma, non finirle sotto; dopo un PagSu, la prima riga sotto la fascia deve restare
 *   a schermo. Si misura sul riquadro vero dei paragrafi della risposta.
 */
test('BOLLE-REV-04 PageDown and PageUp with a stuck question: the line you were reading never ends up under the band', async ({ page }) => {
  const tentate = await apri(page);
  const lunga = Array.from({ length: 40 }, (_, k) => `Paragrafo ${k}: ${'parola '.repeat(30)}fine.`).join('\n\n');
  await eventi(page, eventiTurni(3, { risposta: lunga, lunghe: [1] }));
  await scorriA(page, 2, 400); // la domanda LUNGA è ferma: la fascia più alta (quattro righe), il caso che conta per i tasti di pagina // la domanda 1 è ferma in cima, sotto c'è la sua risposta lunga
  /* la fascia dalla domanda ferma VERA (la testa del turno più l'altezza visibile), non dalla riserva: la prova deve poter vedere una
     riserva sbagliata o assente */
  const fascia = await page.evaluate(() => {
    const t = document.querySelector('#conversation > .talos-turn[data-domanda-corrente]');
    return t ? t.getBoundingClientRect().top + (parseFloat(t.style.getPropertyValue('--talos-domanda-vista')) || 0) : 0;
  });
  expect(fascia, 'there is a stuck question with a band').toBeGreaterThan(0);
  console.log('BOLLE-REV-04 fascia', fascia, await page.evaluate(() => document.querySelector('#conversation').parentElement.clientHeight));
  /* il fuoco sullo scorrevole (un clic sul testo della risposta), poi il tasto */
  /* un clic sul testo a metà della vista: lo scorrevole diventa quello dei tasti di pagina, senza spostare niente */
  const sc = await page.locator('.talos-conversation.conversation').boundingBox();
  await page.mouse.click(sc.x + sc.width / 2, sc.y + sc.height * 0.6);
  const ultimaVisibile = () => page.evaluate(() => {
    const sc = document.querySelector('#conversation').parentElement; const basso = sc.getBoundingClientRect().bottom;
    const ps = [...document.querySelectorAll('#conversation > .talos-turn[data-domanda-corrente] ~ .talos-turn:not([data-turno="utente"]) p')];
    const i = ps.findLastIndex((p) => p.getBoundingClientRect().bottom <= basso && p.getBoundingClientRect().height > 0);
    return i;
  });
  const fondoDi = (i) => page.evaluate((i) => [...document.querySelectorAll('#conversation > .talos-turn[data-domanda-corrente] ~ .talos-turn:not([data-turno="utente"]) p')][i].getBoundingClientRect().bottom, i);
  const primaPagina = await ultimaVisibile();
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(600);
  expect(await fondoDi(primaPagina), 'after PageDown the last line read is still visible below the band').toBeGreaterThan(fascia + 4);
  /* PagSu: la prima riga sotto la fascia prima del tasto deve restare a schermo dopo (sopra il bordo basso) */
  const primaSotto = await page.evaluate((fascia) => [...document.querySelectorAll('#conversation > .talos-turn[data-domanda-corrente] ~ .talos-turn:not([data-turno="utente"]) p')].findIndex((p) => p.getBoundingClientRect().top >= fascia), fascia);
  await page.keyboard.press('PageUp');
  await page.waitForTimeout(600);
  const dopo = await page.evaluate((i) => { const sc = document.querySelector('#conversation').parentElement; const p = [...document.querySelectorAll('#conversation > .talos-turn[data-domanda-corrente] ~ .talos-turn:not([data-turno="utente"]) p')][i]; return { alto: p.getBoundingClientRect().top, basso: sc.getBoundingClientRect().bottom }; }, primaSotto);
  expect(dopo.alto, 'after PageUp the first line below the band is still on screen').toBeLessThan(dopo.basso - 4);
  expect(tentate).toEqual([]);
});

/*
 * BOLLE-REV-05 — foto della candidata sul 4174 (28/10/2026): passando col mouse sulla domanda LUNGA ferma il taglio si alza e la
 *   domanda si legge intera, ma il pulsante «Domanda intera» restava dov'era, sopra la quarta riga, e copriva due parole. Con la
 *   domanda intera il pulsante deve stare fuori dal testo e fuori dalle azioni, e restare cliccabile (porta la domanda al suo posto:
 *   non si toglie). Da tagliata, invece, resta sull'ultima riga sfumata, come prima.
 */
test('BOLLE-REV-05 with the whole stuck question shown, "Whole question" covers neither the text nor the actions, and can still be clicked', async ({ page }) => {
  const tentate = await apri(page);
  const lunga = Array.from({ length: 40 }, (_, k) => `Paragrafo ${k}: ${'parola '.repeat(30)}fine.`).join('\n\n');
  await eventi(page, eventiTurni(3, { risposta: lunga, lunghe: [1] }));
  await scorriA(page, 2, 400);
  const misura = () => page.evaluate(() => {
    const t = document.querySelector('#conversation > .talos-turn[data-domanda-corrente]');
    const p = t?.querySelector('.talos-domanda-intera');
    if (!p || getComputedStyle(p).display === 'none') return null;
    const r = (el) => { const q = el.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; };
    const tocca = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const pr = r(p), corpo = r(t.querySelector('.talos-domanda-corpo') ?? t.querySelector('.talos-message__body'));
    const azioni = [...(t.querySelector('.talos-message__actions')?.querySelectorAll('button') ?? [])].map(r).filter((a) => a.r > a.l);
    const centro = document.elementFromPoint((pr.l + pr.r) / 2, (pr.t + pr.b) / 2);
    const vista = parseFloat(t.style.getPropertyValue('--talos-domanda-vista')) || 0;
    return { pulsante: pr, allineato: Math.abs(pr.l - corpo.l) <= 2, sopraIlTesto: tocca(pr, corpo), sopraLeAzioni: azioni.some((a) => tocca(pr, a)), cliccabile: Boolean(centro && p.contains(centro)), dentroLaFascia: pr.b <= t.getBoundingClientRect().top + vista + 1 };
  });
  /* da tagliata (il puntatore fuori dalla domanda): il pulsante sta sull'ultima riga visibile, dentro la fascia */
  const prima = await misura();
  expect(prima, 'the long stuck question shows "Whole question"').not.toBeNull();
  expect(prima.dentroLaFascia, 'cut: the button sits on the last visible line').toBe(true);
  /* il puntatore sulla parte visibile, lontano dal pulsante: dopo l'attesa la domanda è intera */
  const bolla = await page.locator('#conversation > .talos-turn[data-domanda-corrente] .talos-message__body').first().boundingBox();
  await page.mouse.move(bolla.x + 40, bolla.y + 12);
  await page.waitForTimeout(400);
  const dopo = await misura();
  console.log('BOLLE-REV-05', JSON.stringify({ prima, dopo }));
  expect(dopo, 'the button is still there with the whole question').not.toBeNull();
  expect(dopo.sopraIlTesto, 'whole question: the button does not cover the text').toBe(false);
  expect(dopo.sopraLeAzioni, 'whole question: the button does not cover copy, edit or "⋯"').toBe(false);
  expect(dopo.cliccabile, 'whole question: a click on the button reaches it').toBe(true);
  expect(dopo.allineato, 'whole question: the button lines up with the left edge of the bubble').toBe(true);
  expect(tentate).toEqual([]);
});
