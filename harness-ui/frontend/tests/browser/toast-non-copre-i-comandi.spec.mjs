import { expect, test } from '@playwright/test';
import { chiudiToastAperti } from './aiuto-toast.mjs';

/*
 * ⭐⭐⭐ DOVE STA LA PILA DEI TOAST — la prova della collocazione decisa dall'owner il 23/09/2026 notte
 * (commit `f5990ac42`, commento in `legacy/app.js`, `misuraPilaToast`).
 *
 * La regola, testuale: «i toast devono stare sopra la sidebar destra, sempre in basso, non tra la sidebar
 * e il composer». ⇒ Con la barra destra (`.talos-inspector`) visibile la pila siede sul SUO fondo, larga
 * quanto lei meno 12 px per lato; con la barra chiusa sta nell'angolo in basso a destra. Aprire, chiudere
 * o allargare la barra ricolloca la pila (ResizeObserver in `app.js`); una pila più alta della barra scorre
 * dentro sé stessa e mostra la scheda più recente, che sta in fondo.
 *
 * ⛔ Storia di questo file (24/09/2026): fino al 23/09 sera le prove qui dentro pretendevano la collocazione
 *   precedente — «in fondo ACCANTO al composer, o sopra di lui nella metà destra» — e sulla base con la
 *   decisione nuova erano ROSSE 6 su 8 (misurato: a 1440x900 `posizione` era già `barra-destra` e la prova
 *   voleva `sopra`). La storia delle regole ancora più vecchie (BC-77 del 17/09, «sempre in fondo allo
 *   schermo» del 18/09) sta nel `git log` di questo file e nei commenti di `app.js`.
 *
 * ⭐ Ricerca fatta PRIMA di scrivere (24/09/2026):
 *   · W3C, «Understanding SC 2.4.11 Focus Not Obscured (Minimum)», w3.org/WAI/WCAG22/Understanding/
 *     focus-not-obscured-minimum.html — i toast pensati per «slide up into the unpopulated side of a page»
 *     non devono coprire del tutto il comando col fuoco: la barra destra è quel lato, e il composer, la
 *     striscia con «Ferma» (aria «Interrompi esecuzione») e la testata sono i comandi da non coprire.
 *   · Playwright, «Locator.boundingBox()», playwright.dev/docs/api/class-locator — le coordinate sono
 *     relative alla FINESTRA: qui si confrontano solo rettangoli presi nello stesso istante, nello stesso
 *     `evaluate`, e nessuna azione di Playwright scorre la pagina fra una misura e l'altra.
 *
 * ⛔ Questa prova misura RETTANGOLI, non classi, e asserisce le sue PREMESSE: se la barra non c'è quando
 *   dev'esserci, se i toast non si accendono, se il tema non è quello chiesto o se la pila non è davvero più
 *   alta della barra, è ROSSA — non verde a vuoto.
 */

const VIEWPORT = [[1920, 1080], [1440, 900], [1024, 800]];
const TEMI = ['dark', 'light'];
const MARGINE = 12; // `misuraPilaToast`: `const margine = 12`
const TOLLERANZA = 1.5; // mezzo pixel di arrotondamento del browser per lato, più l'arrotondamento di `Math.round`

/** La scena: una sessione con un giro in corso (striscia di stato con «Ferma», composer pieno di comandi) e
 *  un file scritto, che accende «Copia i diff» — la porta del prodotto con cui si alza una pila di toast. */
async function scena(page, { larghezza, altezza, tema }) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/toast-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('toast-barra', 'workspace', 'Toast', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 10, input: { consegna: 'Scrivi un file' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'glm-5.3-flash' } }, g);
    r.handleRealEvent({ type: 'StateDelta', _sequenza: 11, delta: [{ op: 'add', path: '/file/src/uno.mjs', value: 'a\nb\n' }] }, g);
    r.handleRealEvent({ type: 'TextMessageStart', messageId: 'm1' }, g);
    r.handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: Array.from({ length: 70 }, (_, i) => `Paragrafo ${i + 1}: il progetto conserva la cronologia.\n\n`).join('') }, g);
  });
  await expect(page.locator('#schermoChat .talos-chat-foot')).toBeVisible();
  /* Il piede nel suo stato più POPOLATO: letta la conversazione più su, compaiono anche la striscia di stato
     del giro con «Ferma» (`chat-foot.js`: tace quando il fondo è in vista) e il tondo «torna in fondo». */
  await page.locator('#schermoChat .talos-conversation').hover();
  await page.mouse.wheel(0, -20000);
  await expect(page.locator('#schermoChat .talos-status-strip'), 'la scena non si è formata: la striscia di stato del giro non è comparsa').toBeVisible();
  /* Il tema chiesto è davvero quello a schermo: una prova «chiaro e scuro» che gira due volte sullo stesso
     tema non ne prova due (`app.js` scrive `data-talos-resolved-color-mode` sulla radice). */
  expect(await page.evaluate(() => document.documentElement.dataset.talosResolvedColorMode), 'il tema a schermo non è quello chiesto').toBe(tema);
  await page.waitForTimeout(200);
}

/** È la barra flottante (sotto i 1240 px il foglio la toglie dalla griglia e la apre come strato)? */
async function barraFlottante(page) {
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--talos-inspector-flottante').trim() === '1');
}

async function barraVisibile(page) {
  return page.evaluate(() => [...document.querySelectorAll('.talos-inspector')].some((el) => !el.hidden && el.getClientRects().length > 0));
}

/** Apre o chiude la barra destra con il pulsante «Dettagli» della testata, come farebbe una persona.
 *  ⛔ `el.click()` e non `locator.click()`: non sposta il mouse, quindi non ferma né riavvia i timer dei
 *  toast (che si fermano sotto il puntatore) e non fa scorrere niente fra due misure. */
async function portaBarra(page, aperta) {
  if ((await barraVisibile(page)) === aperta) return;
  await page.evaluate(() => document.querySelector('.desktop-context-toggle')?.click());
  await expect.poll(() => barraVisibile(page), { message: `la barra destra non si è ${aperta ? 'aperta' : 'chiusa'}` }).toBe(aperta);
  await page.waitForTimeout(250);
}

/** Tre toast per la strada vera: tre clic su «Copia i diff». */
async function alzaTreToast(page) {
  await page.evaluate(() => { for (let i = 0; i < 3; i += 1) document.querySelector('#copyAllDiffs')?.click(); });
  await expect.poll(() => page.locator('#regioneToast .talos-toast:not([data-demo]):not([data-uscita])').count(), { message: 'la scena non si è formata: i tre toast non si sono accesi' }).toBe(3);
  await page.waitForTimeout(350); // l'animazione d'entrata e il rAF che porta in fondo lo scorrimento
}

const MISURA = `(() => {
  const r = (el) => { const q = el.getBoundingClientRect(); return { left: q.left, right: q.right, top: q.top, bottom: q.bottom, width: q.width, height: q.height }; };
  const visibile = (el) => Boolean(el && !el.hidden && el.getClientRects().length > 0);
  const regione = document.querySelector('#regioneToast');
  const vive = regione && !regione.hidden ? [...regione.querySelectorAll('.talos-toast')].filter((n) => !n.hidden && !n.dataset.demo && !n.dataset.uscita) : [];
  const riquadro = regione && !regione.hidden ? r(regione) : null;
  /* La parte VISIBILE di ogni scheda: il suo incrocio con la regione, che scorre dentro sé stessa. */
  const taglia = (q) => (riquadro ? { left: Math.max(q.left, riquadro.left), right: Math.min(q.right, riquadro.right), top: Math.max(q.top, riquadro.top), bottom: Math.min(q.bottom, riquadro.bottom) } : q);
  const schede = vive.map((n) => taglia(r(n))).filter((q) => q.right > q.left && q.bottom > q.top);
  const ultima = vive.length ? vive[vive.length - 1] : null;
  let ultimaInCima = false;
  if (ultima) {
    const q = r(ultima);
    const sopra = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
    ultimaInCima = Boolean(sopra && ultima.contains(sopra));
  }
  const barra = [...document.querySelectorAll('.talos-inspector')].find(visibile);
  const striscia = document.querySelector('#schermoChat .talos-status-strip');
  const piede = document.querySelector('#schermoChat .talos-chat-foot');
  const comandi = piede ? [...piede.querySelectorAll('button, a[href], [role="button"], textarea, input')].filter((n) => { const q = n.getBoundingClientRect(); return q.width > 0 && q.height > 0 && n.offsetParent !== null; }) : [];
  return {
    vista: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
    posizione: regione?.dataset.posizione || null,
    regione: riquadro,
    schede,
    quanteVive: vive.length,
    ultima: ultima ? r(ultima) : null,
    ultimaInCima,
    barra: barra ? r(barra) : null,
    composer: visibile(document.querySelector('#composerForm')) ? r(document.querySelector('#composerForm')) : null,
    striscia: visibile(striscia) ? r(striscia) : null,
    ferma: visibile(striscia?.querySelector('.stop-run')) ? r(striscia.querySelector('.stop-run')) : null,
    testate: [...document.querySelectorAll('.talos-topbar')].filter(visibile).map(r),
    comandi: comandi.map((n) => ({ ...r(n), nome: (n.getAttribute('aria-label') || n.textContent || n.id || '').trim().slice(0, 40) })),
    scorre: regione ? { alto: regione.scrollTop, contenuto: regione.scrollHeight, finestra: regione.clientHeight, overflowY: getComputedStyle(regione).overflowY } : null,
    margine: regione ? (() => { const s = getComputedStyle(regione); return { sinistra: parseFloat(s.paddingLeft), destra: parseFloat(s.paddingRight), sopra: parseFloat(s.paddingTop), sotto: parseFloat(s.paddingBottom), clic: s.pointerEvents }; })() : null,
  };
})()`;

const area = (a, b) => Math.round(Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)));
const dentro = (a, b, t = TOLLERANZA) => a.left >= b.left - t && a.right <= b.right + t && a.top >= b.top - t && a.bottom <= b.bottom + t;
const fondoPila = (m) => Math.max(...m.schede.map((q) => q.bottom));
const tondo = (q) => q && `${Math.round(q.left)},${Math.round(q.top)}→${Math.round(q.right)},${Math.round(q.bottom)}`;

/** La pila siede sulla barra destra: dentro il suo rettangolo, sul suo fondo, larga quanto lei meno i margini. */
function siedeSullaBarra(m, etichetta) {
  expect(m.barra, `${etichetta}: la barra destra non è a schermo`).not.toBeNull();
  expect(m.posizione, `${etichetta}: la pila non è collocata sulla barra destra`).toBe('barra-destra');
  expect(m.schede.length, `${etichetta}: nessuna scheda visibile da misurare`).toBeGreaterThan(0);
  for (const q of m.schede) {
    expect(dentro(q, m.barra), `${etichetta}: una scheda (${tondo(q)}) esce dalla barra (${tondo(m.barra)})`).toBe(true);
    expect(Math.abs(q.left - (m.barra.left + MARGINE)), `${etichetta}: la scheda non parte a ${MARGINE} px dal bordo sinistro della barra (${q.left} contro ${m.barra.left})`).toBeLessThanOrEqual(TOLLERANZA);
    expect(Math.abs(q.right - (m.barra.right - MARGINE)), `${etichetta}: la scheda non finisce a ${MARGINE} px dal bordo destro della barra (${q.right} contro ${m.barra.right})`).toBeLessThanOrEqual(TOLLERANZA);
  }
  expect(Math.abs(fondoPila(m) - (m.barra.bottom - MARGINE)), `${etichetta}: la pila non siede sul fondo della barra (fondo ${fondoPila(m)}, barra ${m.barra.bottom})`).toBeLessThanOrEqual(TOLLERANZA);
  /* ⛔ 26/09 — il riquadro della regione NON sta più tutto nella barra, di proposito: il suo margine interno contiene l'ombra
     fluttuante (raggio intero della sfocatura, `index.css` `.talos-toast-region[data-posizione]`), e 12 px la tagliavano in un
     rettangolo grigio visibile (TOAST-SHADOW-01). Quel margine è trasparente e non prende i clic. ⇒ Nella barra deve stare
     l'area dove stanno le SCHEDE — il riquadro meno il margine — e la cima della regione, oltre la quale una pila che scorre
     si ritaglia; e il margine deve lasciar passare i clic. */
  expect(m.regione && m.margine, `${etichetta}: la regione dei toast non si misura`).toBeTruthy();
  const areaSchede = { left: m.regione.left + m.margine.sinistra, right: m.regione.right - m.margine.destra, top: m.regione.top, bottom: m.regione.bottom - m.margine.sotto };
  expect(dentro(areaSchede, m.barra), `${etichetta}: l'area delle schede (${tondo(areaSchede)}) esce dalla barra (${tondo(m.barra)})`).toBe(true);
  expect(m.margine.clic, `${etichetta}: il margine trasparente della regione prende i clic`).toBe('none');
  expect(m.ultimaInCima, `${etichetta}: la scheda più recente è coperta da qualcos'altro`).toBe(true);
}

/** Nessuna scheda sopra il composer, la striscia con «Ferma», la testata o un comando del piede. */
function nonCopreIComandi(m, etichetta) {
  expect(m.composer, `${etichetta}: la scena non si è formata, il composer non è a schermo`).not.toBeNull();
  expect(m.striscia, `${etichetta}: la scena non si è formata, la striscia di stato del giro non è a schermo`).not.toBeNull();
  expect(m.ferma, `${etichetta}: la scena non si è formata, «Ferma» non è a schermo`).not.toBeNull();
  expect(m.testate.length, `${etichetta}: la scena non si è formata, nessuna testata a schermo`).toBeGreaterThan(0);
  const colpiti = [];
  for (const q of m.schede) {
    for (const [nome, bersaglio] of [['composer', m.composer], ['striscia di stato', m.striscia], ['Ferma', m.ferma], ...m.testate.map((t) => ['testata', t]), ...m.comandi.map((c) => [c.nome, c])]) {
      const a = area(q, bersaglio);
      if (a > 0) colpiti.push({ px2: a, nome });
    }
  }
  expect(colpiti, `${etichetta}: la pila copre dei comandi`).toEqual([]);
}

for (const [larghezza, altezza] of VIEWPORT) {
  for (const tema of TEMI) {
    /* (1) BARRA APERTA — dentro la barra, in basso, e niente comandi coperti. */
    test(`TOAST-BARRA-APERTA (${larghezza}x${altezza}, ${tema}) — la pila siede in fondo alla barra destra e non copre i comandi`, async ({ page }) => {
      await scena(page, { larghezza, altezza, tema });
      await portaBarra(page, true);
      await alzaTreToast(page);
      const m = await page.evaluate(MISURA);
      console.log(`MISURA-TOAST-BARRA-APERTA ${larghezza}x${altezza} ${tema} = ${JSON.stringify({ posizione: m.posizione, barra: tondo(m.barra), regione: tondo(m.regione), schede: m.schede.map(tondo), composer: tondo(m.composer), striscia: tondo(m.striscia) })}`);
      expect(m.schede.length, 'la pila non mostra le tre schede').toBe(3);
      siedeSullaBarra(m, 'barra aperta');
      /*
       * ⛔ Sotto i 1240 px la barra non sta in griglia: è uno STRATO che si apre sopra la chat, col velo
       *   (styles/index.css, `@media(max-width:1240px)`), e copre lei stessa il lato destro del composer.
       *   Lì «non copre il composer» non ha contenuto geometrico: la pila sta DENTRO la barra (asserito qui
       *   sopra), quindi copre al più ciò che la barra copre già. In griglia, invece, la pila non deve
       *   toccare niente del piede né la testata.
       */
      if (!(await barraFlottante(page))) nonCopreIComandi(m, 'barra aperta');
    });

    /* (2) BARRA CHIUSA — sopra il piede della chat, a destra (decisione owner 24/09). */
    test(`TOAST-BARRA-CHIUSA (${larghezza}x${altezza}, ${tema}) — la pila sta sopra il piede, a destra`, async ({ page }) => {
      await scena(page, { larghezza, altezza, tema });
      await portaBarra(page, false);
      await alzaTreToast(page);
      const m = await page.evaluate(MISURA);
      const coperti = m.comandi.map((c) => ({ nome: c.nome, px2: m.schede.reduce((s, q) => s + area(q, c), 0) })).filter((c) => c.px2 > 0);
      /* ⛔ Si STAMPA cosa copre la pila nell'angolo: la decisione dell'owner non chiede di evitarlo, e
         questa prova non sceglie al suo posto. Il numero resta nel log per chi deve decidere. */
      console.log(`MISURA-TOAST-BARRA-CHIUSA ${larghezza}x${altezza} ${tema} = ${JSON.stringify({ posizione: m.posizione, regione: tondo(m.regione), schede: m.schede.map(tondo), coperti })}`);
      expect(m.barra, 'la barra destra è ancora a schermo').toBeNull();
      /* 24/09/2026, decisione owner: a barra chiusa la pila sale SOPRA il piede della chat, mai su un comando. */
      expect(m.posizione, 'con la barra chiusa la pila deve stare sopra il piede').toBe('sopra-piede');
      if (!(await barraFlottante(page))) nonCopreIComandi(m, 'barra chiusa');
      expect(m.schede.length, 'la pila non mostra le tre schede').toBe(3);
      const destra = Math.max(...m.schede.map((q) => q.right));
      expect(m.vista.width - destra, `la pila non è a destra: finisce a ${destra} su ${m.vista.width}`).toBeGreaterThanOrEqual(0);
      expect(m.vista.width - destra, `la pila non è a destra: finisce a ${destra} su ${m.vista.width}`).toBeLessThanOrEqual(32);
      expect(m.composer ? fondoPila(m) <= m.composer.top + 1 : true, `la pila deve stare sopra il composer: finisce a ${fondoPila(m)}, il composer comincia a ${m.composer?.top}`).toBe(true);
      expect(Math.min(...m.schede.map((q) => q.left)), 'la pila non sta nella metà destra dello schermo').toBeGreaterThan(m.vista.width / 2);
      expect(m.ultimaInCima, 'la scheda più recente è coperta da qualcos\'altro').toBe(true);
    });
  }
}

/*
 * (3) LA PILA SEGUE LA BARRA — aprire, chiudere e allargare la barra ricolloca una pila GIÀ a schermo.
 * ⛔ I toast si alzano UNA volta sola, prima dei cambi: alzarne di nuovi a ogni passo chiamerebbe
 *   `misuraPilaToast` dal prodotto e nasconderebbe proprio l'osservatore che qui si prova. I tre toast
 *   vivono 5 s; i passi durano meno, e ogni misura ripete la premessa (toast ancora vivi).
 */
for (const [larghezza, altezza] of VIEWPORT) {
  for (const tema of TEMI) {
    test(`TOAST-SEGUE-LA-BARRA (${larghezza}x${altezza}, ${tema}) — aprire, chiudere e allargare la barra ricolloca la pila`, async ({ page }) => {
      await scena(page, { larghezza, altezza, tema });
      const flottante = await barraFlottante(page);
      /* Si parte dalla barra CHIUSA, pila nell'angolo. */
      await portaBarra(page, false);
      await alzaTreToast(page);
      const passi = [];
      const misura = async (nome) => {
        const m = await page.evaluate(MISURA);
        passi.push({ nome, posizione: m.posizione, barra: tondo(m.barra), schede: m.schede.map(tondo) });
        expect(m.quanteVive, `${nome}: premessa persa, i toast sono scaduti prima della misura`).toBeGreaterThan(0);
        return m;
      };
      try {
        let m = await misura('chiusa');
        expect(m.posizione, 'chiusa: la pila non è sopra il piede').toBe('sopra-piede');

        await portaBarra(page, true);
        m = await misura('aperta');
        siedeSullaBarra(m, 'dopo l\'apertura');

        if (flottante) {
          /* Strato: si chiude con Esc (app.js, `closePanels`), come farebbe una persona. */
          await page.keyboard.press('Escape');
          await expect.poll(() => barraVisibile(page), { message: 'Esc non ha chiuso la barra' }).toBe(false);
          await page.waitForTimeout(250);
        } else {
          await portaBarra(page, false);
        }
        m = await misura('richiusa');
        expect(m.posizione, 'richiusa: la pila è rimasta sulla barra che non c\'è più').toBe('sopra-piede');
        expect(m.vista.width - Math.max(...m.schede.map((q) => q.right)), 'richiusa: la pila non è tornata a destra').toBeLessThanOrEqual(32);

        if (!flottante) {
          await portaBarra(page, true);
          const prima = await misura('riaperta');
          siedeSullaBarra(prima, 'riaperta');
          /* Allargare: la maniglia da tastiera (app.js, `setupPanelResize`: freccia sinistra = +12 px). */
          await page.locator('.talos-resizer--inspector').focus();
          for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowLeft');
          await page.waitForTimeout(250);
          const dopo = await misura('allargata');
          expect(dopo.barra.width - prima.barra.width, 'la barra non si è allargata: la scena non si è formata').toBeGreaterThan(40);
          siedeSullaBarra(dopo, 'dopo l\'allargamento');
        }
      } finally {
        console.log(`MISURA-TOAST-SEGUE ${larghezza}x${altezza} ${tema} = ${JSON.stringify(passi)}`);
      }
    });
  }
}

/*
 * (4) LA PILA PIÙ ALTA DELLA BARRA SCORRE DENTRO SÉ STESSA E MOSTRA LA SCHEDA PIÙ RECENTE.
 * Tre schede piene non superano mai una barra alta 700 px: la condizione vive in una finestra BASSA, e la
 * prova la mette in scena lì (stesse larghezze, altezza 280: misurato il 24/09, a 340 tre schede riempiono
 * la barra esattamente, 321 px su 321, e non scorre niente) — asserendo che la pila sia davvero più alta.
 */
for (const [larghezza] of VIEWPORT) {
  for (const tema of TEMI) {
    test(`TOAST-SCORRE (${larghezza}x280, ${tema}) — la pila più alta della barra scorre in sé e mostra la più recente`, async ({ page }) => {
      await scena(page, { larghezza, altezza: 280, tema });
      await portaBarra(page, true);
      await alzaTreToast(page);
      const m = await page.evaluate(MISURA);
      console.log(`MISURA-TOAST-SCORRE ${larghezza}x280 ${tema} = ${JSON.stringify({ barra: tondo(m.barra), regione: tondo(m.regione), ultima: tondo(m.ultima), scorre: m.scorre })}`);
      expect(m.scorre.contenuto, `la scena non si è formata: la pila (${m.scorre.contenuto} px) non è più alta del posto (${m.scorre.finestra} px)`).toBeGreaterThan(m.scorre.finestra + 1);
      expect(m.scorre.overflowY, 'la regione non scorre').toBe('auto');
      siedeSullaBarra(m, 'pila alta');
      expect(m.scorre.alto + m.scorre.finestra, 'lo scorrimento non è in fondo: la scheda più recente non si vede').toBeGreaterThanOrEqual(m.scorre.contenuto - 1);
      expect(dentro(m.ultima, m.regione), `la scheda più recente (${tondo(m.ultima)}) non è intera dentro la regione (${tondo(m.regione)})`).toBe(true);
    });
  }
}

/*
 * ⛔⛔ 17/09/2026 notte — IL TONDO «TORNA IN FONDO». Resta: è un comando che sta sopra il piede, a destra, e
 *   nessuna collocazione della pila deve finirci sopra. A 1024x800 la barra è chiusa (è uno strato), quindi
 *   la pila sta nell'angolo: è la finestra dove il caso è nato.
 */
for (const tema of TEMI) {
  test(`BC77-A-FONDO (1024x800, ${tema}) — il toast non copre «Torna in fondo alla conversazione»`, async ({ page }) => {
    await scena(page, { larghezza: 1024, altezza: 800, tema }); // la scena ha già scorso la conversazione in su
    await chiudiToastAperti(page);
    const pulsante = page.getByRole('button', { name: 'Torna in fondo alla conversazione', exact: true });
    await expect(pulsante, 'la scena non si è formata: il pulsante non è comparso').toBeVisible();
    await alzaTreToast(page);
    const m = await page.evaluate(() => {
      const b = document.querySelector('#chatTornaInFondo').getBoundingClientRect();
      const toasts = [...document.querySelectorAll('#regioneToast .talos-toast')].filter((n) => !n.hidden && !n.dataset.demo).map((n) => n.getBoundingClientRect());
      const area = (p, q) => Math.round(Math.max(0, Math.min(p.right, q.right) - Math.max(p.left, q.left)) * Math.max(0, Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)));
      const centro = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return { toasts: toasts.length, coperto: toasts.reduce((s, r) => s + area(r, b), 0), centroSulPulsante: document.querySelector('#chatTornaInFondo').contains(centro) };
    });
    console.log(`MISURA-BC77-FONDO ${tema} = ${JSON.stringify(m)}`);
    expect(m.toasts, 'la scena non si è formata: nessun toast').toBeGreaterThan(0);
    expect(m.coperto, 'il toast copre il tondo «torna in fondo»').toBe(0);
    expect(m.centroSulPulsante, 'al centro del tondo c\'è qualcos\'altro: non si può cliccare').toBe(true);
  });
}
