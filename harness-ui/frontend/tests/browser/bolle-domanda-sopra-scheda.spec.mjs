import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

/*
 * ⛔ 04/11/2026 — LA DOMANDA FERMA SOPRA LA SCHEDA DELLE DOMANDE (foto dell'owner, chat sul PC, tema scuro, 16:02: «quello che non va
 *   non è la lingua ma errore visivo»). Sotto la domanda ferma in cima scorreva la ricevuta della scheda delle domande, e la carta si
 *   vedeva passare accanto alla fascia, tagliata a metà sotto la bolla.
 * Le prove misurano nel DOM vivo (`elementFromPoint`, `getBoundingClientRect`) che cosa dipinge ogni pixel della fascia.
 * Gli eventi sono quelli del server (`src/agui-events.mjs`: `userQuestionRequested`, `userQuestionResolved`), passati a mano.
 * ⛔ NIENTE SCRITTURE: ogni non-GET si ferma e si conta (zero alla fine).
 */

const ID = 'domanda-sopra-scheda';
const RISPOSTA_LUNGA = Array.from({ length: 40 }, (_, i) => `Paragrafo ${i}: testo della risposta che continua a lungo per riempire lo schermo.`).join('\n\n');
const DOMANDE = [
  { id: 'worktree', question: 'Creo un worktree separato da HEAD pulito?', why: 'Così posso lavorare in isolamento, senza toccare la cartella principale.', options: [
    { label: 'Sì, da HEAD pulito (consigliato)', description: 'Un worktree nuovo dal commit corrente', recommended: true },
    { label: 'Sì, con le modifiche', description: 'Porta con sé il lavoro non salvato' },
    { label: 'No', description: 'Resto nella cartella' },
  ] },
];

/** Il turno come lo manda il server: domanda della persona, scheda delle domande, risposta della persona, testo, fine. */
function eventiTurno(t, { scheda = true } = {}) {
  return [
    { type: 'RunStarted', runId: `run-${t}`, input: { consegna: `che ne pensi? potresti lavorare in un worktree separato per questo? (${t})`, seguito: t > 0 } },
    ...(scheda ? [
      { type: 'UserQuestionRequested', requestId: `req-${t}`, questions: DOMANDE, at: '2026-11-04T15:01:00.000Z', toolCallId: `call_ask_${t}`,
        origine: { modalita: 'normale', agente: 'principale' }, ripristinabile: true },
      { type: 'UserQuestionResolved', requestId: `req-${t}`, status: 'answered', answers: { worktree: 'Sì, da HEAD pulito (consigliato)' },
        at: '2026-11-04T15:01:20.000Z', da: 'persona' },
    ] : []),
    { type: 'TextMessageStart', messageId: `m-${t}`, role: 'assistant' },
    { type: 'TextMessageContent', messageId: `m-${t}`, delta: RISPOSTA_LUNGA },
    { type: 'TextMessageEnd', messageId: `m-${t}` },
    { type: 'RunFinished', outcome: { type: 'success' } },
  ];
}

async function apri(page, { modo = 'dark' } = {}) {
  await page.addInitScript((colorMode) => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); } catch { /* storage assente */ }
  }, modo);
  const tentate = [];
  await page.route('**/api/v1/**', (route) => {
    if (route.request().method() !== 'GET') { tentate.push(`${route.request().method()} ${route.request().url()}`); return route.abort(); }
    return route.fallback();
  });
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta aperto e muto */ });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Domanda sopra la scheda', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
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

const assestato = (page) => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(ok)), 30)))));

/** Porta l'elemento `selettore` (il primo) a `dy` px dalla cima dello scorrevole (negativo: più su), dopo un gesto vero verso l'alto
    che stacca il «segui il fondo»; poi il puntatore va via dalla fascia (col mouse sopra la domanda si apre intera, BOLLE-REV-02). */
async function portaInCima(page, selettore, dy) {
  const sc = await page.locator('.talos-conversation.conversation').boundingBox();
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(80);
  for (let tentativo = 0; tentativo < 6; tentativo += 1) {
    const scarto = await page.evaluate(([sel, dy]) => {
      const sc = document.querySelector('#conversation').parentElement;
      const el = document.querySelector(sel);
      const voluto = sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - dy;
      const scarto = Math.abs(voluto - sc.scrollTop);
      sc.scrollTop = voluto;
      return scarto;
    }, [selettore, dy]);
    await assestato(page);
    if (scarto <= 1) break;
  }
  await page.mouse.move(sc.x + sc.width - 4, sc.y + sc.height - 4);
  await assestato(page);
}

/**
 * La fascia della domanda ferma e chi dipinge i suoi pixel: ogni 4 px in altezza, dalla cima della fascia alla sua fine, e ogni 2 px in
 * larghezza, dal bordo sinistro dell'elemento che scorre sotto al destro. `esempi`: i punti che
 * appartengono a un turno DIVERSO da quello della domanda ferma.
 */
const misuraFascia = (page, selettoreSotto) => page.evaluate((sel) => {
  const sc = document.querySelector('#conversation').parentElement;
  const rs = sc.getBoundingClientRect();
  const turni = [...document.querySelectorAll('#conversation > .talos-turn')];
  const ferma = turni.find((t) => t.dataset.domandaCorrente != null && getComputedStyle(t).position === 'sticky');
  if (!ferma) return { ferma: null };
  const rTurno = ferma.getBoundingClientRect();
  const rMessaggio = ferma.querySelector(':scope > .talos-message--user').getBoundingClientRect();
  const rBolla = ferma.querySelector('.talos-message__body').getBoundingClientRect();
  const vista = parseFloat(ferma.style.getPropertyValue('--talos-domanda-vista')) || 0;
  const fineFascia = rTurno.top + vista;
  const sotto = document.querySelector(sel);
  const rSotto = sotto.getBoundingClientRect();
  const estranei = [];
  const da = Math.max(rs.left + 1, rSotto.left + 0.5);
  const a = Math.min(rs.right - 1, rSotto.right - 0.5);
  for (let y = Math.max(rs.top + 1, rTurno.top + 1); y < fineFascia - 1; y += 4) {
    for (let x = da; x <= a; x += 2) {
      const el = document.elementFromPoint(x, y);
      const turno = el?.closest?.('#conversation > .talos-turn');
      if (turno && turno !== ferma) estranei.push({ x: Math.round(x), y: Math.round(y), di: turni.indexOf(turno), cosa: String(el.className).slice(0, 60) });
    }
  }
  return {
    ferma: turni.indexOf(ferma), alto: rs.top, fineFascia, vista,
    messaggio: { sinistra: rMessaggio.left, destra: rMessaggio.right },
    bolla: { sinistra: rBolla.left, destra: rBolla.right, alto: rBolla.top, basso: rBolla.bottom },
    sotto: { sinistra: rSotto.left, destra: rSotto.right, alto: rSotto.top, basso: rSotto.bottom, di: turni.indexOf(sotto.closest('#conversation > .talos-turn')) },
    estranei: estranei.length, esempi: estranei.slice(0, 6),
  };
}, selettoreSotto);

/**
 * Che cosa della carta si VEDE nella fascia: la fascia si fotografa due volte, con la carta e con la carta invisibile
 * (`visibility: hidden`, l'impaginazione non cambia), e si contano i pixel che cambiano. Dentro la fascia, da 24 px a sinistra
 * del bordo della carta a 24 px a destra (l'orlo della fascia: quanto sfuma l'ombra delle carte), dalla cima dello scorrevole alla fine
 * della fascia.
 * È la sola misura che vede il bordo dorato e l'ombra della carta: `elementFromPoint` non dice che cosa si dipinge accanto alla fascia.
 */
async function pixelDellaCartaNellaFascia(page, selettore, m, { alto = m.alto, basso = m.fineFascia - 1, x = m.sotto.sinistra - 24, larghezza = m.sotto.destra - m.sotto.sinistra + 48, soglia = 6 } = {}) {
  /* di serie fino alla fine della fascia piena: la sfumatura sotto (12 px) lascia passare apposta ciò che scorre */
  const clip = { x: Math.max(0, x), y: alto, width: larghezza, height: basso - alto };
  const con = PNG.sync.read(await page.screenshot({ clip }));
  await page.evaluate((sel) => { document.querySelector(sel).style.visibility = 'hidden'; }, selettore);
  await assestato(page);
  const senza = PNG.sync.read(await page.screenshot({ clip }));
  await page.evaluate((sel) => { document.querySelector(sel).style.visibility = ''; }, selettore);
  await assestato(page);
  let diversi = 0; const esempi = [];
  for (let i = 0; i < con.data.length; i += 4) {
    const scarto = Math.max(Math.abs(con.data[i] - senza.data[i]), Math.abs(con.data[i + 1] - senza.data[i + 1]), Math.abs(con.data[i + 2] - senza.data[i + 2]));
    if (scarto > soglia) {
      diversi += 1;
      if (esempi.length < 6) { const p = i / 4; esempi.push({ x: p % con.width, y: Math.floor(p / con.width), scarto }); }
    }
  }
  return { diversi, esempi, scala: con.width / clip.width };
}

test.use({ viewport: { width: 1920, height: 1080 } });
test.beforeEach(() => { sequenza = 0; });

/* 1, 1,25 e 1,5: le scale di Windows più comuni. Con una scala frazionaria il bordo di 1 px della carta cade a metà di un pixel del
   monitor e la sua sfumatura esce dal bordo della fascia, che si allinea al pixel intero. */
for (const scala of [1, 1.25, 1.5]) {
  for (const modo of ['dark', 'light']) {
    test.describe(`scala ${scala}`, () => {
      test.use({ deviceScaleFactor: scala });
      test(`DOMANDA-SOPRA-SCHEDA-01 · ${modo} · scala ${scala} · la ricevuta della scheda passa SOTTO la fascia della domanda ferma, bordo e ombra compresi`, async ({ page }, info) => {
        const tentate = await apri(page, { modo });
        await eventi(page, [...eventiTurno(0, { scheda: false }), ...eventiTurno(1)]);
        const scheda = '#conversation .talos-question-card[data-state="resolved"]';
        await expect(page.locator(scheda)).toHaveCount(1);
        /* la carta a metà sotto la fascia: la testa nascosta, la riga della risposta all'altezza del bordo basso della fascia */
        await portaInCima(page, scheda, -60);
        const m = await misuraFascia(page, scheda);
        await page.screenshot({ path: info.outputPath(`fascia-sopra-scheda-${modo}-${scala}.png`) });
        const pixel = await pixelDellaCartaNellaFascia(page, scheda, m);
        console.log(JSON.stringify({ modo, scala, ...m, pixel }));
        expect(m.ferma, 'la domanda del turno della scheda è ferma in cima').toBe(m.sotto.di - 1);
        expect(m.sotto.alto, 'la carta è salita sotto la fascia').toBeLessThan(m.fineFascia - 20);
        expect(m.esempi, 'nessun punto della fascia appartiene alla carta che scorre sotto').toEqual([]);
        expect(pixel.esempi, 'nessun pixel della carta (bordo, ombra, testo) si vede nella fascia né accanto a lei').toEqual([]);
        expect(tentate).toEqual([]);
      });
    });
  }
}

test.describe('scala 1.25, puntatore e sfumatura', () => {
  test.use({ deviceScaleFactor: 1.25 });

  test('DOMANDA-SOPRA-SCHEDA-03 · col puntatore sulla domanda (taglio alzato) la carta resta sotto la fascia, bordo compreso', async ({ page }, info) => {
    const tentate = await apri(page);
    await eventi(page, [...eventiTurno(0, { scheda: false }), ...eventiTurno(1)]);
    const scheda = '#conversation .talos-question-card[data-state="resolved"]';
    await portaInCima(page, scheda, -60);
    const m = await misuraFascia(page, scheda);
    await page.mouse.move((m.bolla.sinistra + m.bolla.destra) / 2, (m.bolla.alto + m.bolla.basso) / 2);
    await page.waitForTimeout(300); // l'attesa di 120 ms prima che il taglio si alzi
    await assestato(page);
    const basso = await page.evaluate(() => document.querySelector('#conversation > .talos-turn[data-domanda-corrente] > .talos-message--user').getBoundingClientRect().bottom);
    expect(basso, 'il taglio si è alzato: la domanda si vede intera').toBeGreaterThan(m.fineFascia);
    await page.screenshot({ path: info.outputPath('fascia-col-puntatore-dark-1.25.png') });
    const pixel = await pixelDellaCartaNellaFascia(page, scheda, m, { basso: Math.floor(basso) - 1 });
    console.log(JSON.stringify({ basso, pixel }));
    expect(pixel.esempi, 'nessun pixel della carta accanto alla domanda aperta').toEqual([]);
    expect(tentate).toEqual([]);
  });

  test('DOMANDA-SOPRA-SCHEDA-04 · la sfumatura sotto la fascia è larga quanto la fascia: il bordo della carta non spunta ai suoi lati', async ({ page }) => {
    const tentate = await apri(page);
    await eventi(page, [...eventiTurno(0, { scheda: false }), ...eventiTurno(1)]);
    const scheda = '#conversation .talos-question-card[data-state="resolved"]';
    await portaInCima(page, scheda, -60);
    const m = await misuraFascia(page, scheda);
    /* la prima riga della sfumatura, solo nelle due strisce di bordo (dall'orlo a 2 px dentro la carta): lì la sfumatura è quasi piena,
     e il bordo dorato sotto di lei cambia al massimo 7 livelli (misurato); scoperto, 24-32 (la prova rossa) */
    const riga = { alto: Math.ceil(m.fineFascia), basso: Math.ceil(m.fineFascia) + 1, soglia: 12 };
    const sinistra = await pixelDellaCartaNellaFascia(page, scheda, m, { ...riga, x: m.sotto.sinistra - 16, larghezza: 18 });
    const destra = await pixelDellaCartaNellaFascia(page, scheda, m, { ...riga, x: m.sotto.destra - 2, larghezza: 18 });
    console.log(JSON.stringify({ fineFascia: m.fineFascia, sinistra, destra }));
    expect(sinistra.esempi, 'a sinistra').toEqual([]);
    expect(destra.esempi, 'a destra').toEqual([]);
    expect(tentate).toEqual([]);
  });
});

test('DOMANDA-SOPRA-SCHEDA-02 · al contrario: una risposta di solo testo scorre sotto la domanda ferma come prima', async ({ page }, info) => {
  const tentate = await apri(page);
  await eventi(page, [...eventiTurno(0, { scheda: false }), ...eventiTurno(1, { scheda: false })]);
  const testo = '#conversation > .talos-turn:nth-child(4) .talos-message';
  await portaInCima(page, testo, -300);
  const m = await misuraFascia(page, testo);
  await page.screenshot({ path: info.outputPath('fascia-sopra-testo-dark.png') });
  console.log(JSON.stringify(m));
  expect(m.ferma).toBe(m.sotto.di - 1);
  expect(m.esempi, 'il testo passa sotto la fascia').toEqual([]);
  const sotto = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest?.('#conversation > .talos-turn')?.dataset.turno ?? null,
    [m.bolla.sinistra - 60, m.fineFascia + 30]);
  expect(sotto, 'subito sotto la fascia si legge la risposta').not.toBe('utente');
  expect(tentate).toEqual([]);
});
