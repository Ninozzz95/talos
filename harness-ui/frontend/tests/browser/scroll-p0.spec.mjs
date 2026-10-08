import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * ⛔⛔⛔ P0 corsia C, punto 6 (16/09/2026) — LA CHAT RUBA LA POSIZIONE DI LETTURA MENTRE IL MODELLO SCRIVE.
 *
 * Il difetto: `streamingAutoFollow` — il flag che dice «la persona si è spostata, non inseguirla» —
 * esisteva già ed era corretto, ma lo consultava UN SOLO scrittore di scroll
 * (`scrollStreamingOutput`). Gli altri tre no:
 *   1. `scorriAllaBollaAppesa` → `scorriInFondoConversazione` (scrollTo smooth verso il fondo),
 *      chiamata da OTTO punti, cinque dei quali sono eventi del MODELLO (attesa, batch attività,
 *      artefatto, spiegazione, permesso);
 *   2. la coda di `appendToolNote`, con la guardia CAPOVOLTA (`if (fondoConversazioneInVista()) return;`
 *      ⇒ scorreva proprio quando la persona era in alto);
 *   3. `RunStarted`, che ri-armava il flag a OGNI giro — anche ai giri interni di un attrezzo.
 *
 * ⭐ Ricerca 16/09/2026 (regola zero, prima di scrivere):
 *   · anthropics/claude-code#53382 «Desktop app: chat window auto-scrolls to bottom during streaming
 *     even when user has scrolled up» — regressione fra app-1.3561.0 e app-1.4758.0, chiusa «not
 *     planned» sul desktop e RISOLTA sull'estensione VSCode (issue #11092, 2025-11-12). Il pattern
 *     dichiarato lì è esattamente quello che serve qui: «IF user_scroll_position == bottom THEN
 *     auto_scroll ELSE preserve_scroll_position», più un pulsante «torna in fondo» per rientrare.
 *     ⇒ Il concorrente diretto ha il difetto e NON lo ha chiuso: è una riga di vantaggio, non un pareggio.
 *   · kirodotdev/KiroCrew#9652 e openclaw#37500 dicono la stessa cosa su altre due interfacce:
 *     «scrolling up must disengage follow and hold the view».
 *   · MDN «overflow-anchor» + caniuse (letti 16/09/2026): `auto` è il DEFAULT, e serve a NON perdere
 *     la posizione quando il contenuto sopra il viewport cambia. Dichiararlo è una guardia esplicita.
 *
 * ⛔ Le prove qui dentro girano anche AL CONTRARIO: rimettendo una sola riga della forma vecchia
 *   (per esempio `scorriInFondoConversazione` dentro `scorriAllaBollaAppesa`, oppure il riarmo su
 *   RunStarted) devono tornare ROSSE. Se restano verdi non stanno guardando niente.
 *
 * ⛔ Mai il 4174: `playwright.config.mjs` avvia un server suo, su una porta sua, con uno store vuoto.
 *
 * ⛔⛔ COME SI LANCIA, e perché non basta `npx playwright test`.
 *   Di serie il server dei test serve `harness-ui/public/`, che è un pacchetto COSTRUITO e
 *   committato: toccare `src/` non lo cambia, quindi si finirebbe per provare il bundle di ieri —
 *   e il 16/09 quello committato era già indietro rispetto al sorgente dello stesso commit
 *   (`dist/app.js` 1.825.533 byte contro `public/app.js` 1.818.988: misurato, non dedotto).
 *   ⇒ Si ricostruisce e si punta il server al build, senza toccare `public/`:
 *
 *     node scripts/build.mjs
 *     TALOS_HARNESS_UI_TEST_PORT=4178 \
 *     TALOS_HARNESS_UI_PUBLIC_DIR="$PWD/dist" \
 *     npx playwright test tests/browser/scroll-p0.spec.mjs --project=chromium-desktop
 *
 *   (`TALOS_HARNESS_UI_PUBLIC_DIR` lo legge `src/config.mjs:560`; il `webServer` di
 *   `playwright.config.mjs` eredita `process.env`. La porta 4178 e l'unica
 *   autorizzata dall'Owner per i test e le preview degli agenti.)
 */

const QUI = dirname(fileURLToPath(import.meta.url));
const FOTO = resolve(QUI, '..', '..', 'artifacts', 'p0-C');

test.use({ channel: 'chrome' });

test.beforeEach(async ({ page }) => {
  /* VELO-SPEC (08/10/2026, bugfixer): flusso APERTO E MUTO (handler che non risolve), come in chat-attesa-fondo.spec.mjs. Con un
     corpo vuoto il flusso si chiudeva e il browser lo riapriva, e ogni `onopen` rimette la chat «nella storia» (app.js, `source.onopen`):
     dopo il confine mandato dalla prova, una riapertura la rivelava di nuovo. */
  await page.route('**/api/v1/sessions/scroll-p0-*/events', () => { /* resta pending: aperto e muto */ });
  /* ⛔ Solo lo STUB: nessun giro vero parte da qui, e il server di prova non ha queste sessioni. */
  await page.route('**/api/v1/sessions/scroll-p0-*/resume', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { sessionId: 'scroll-p0' }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
});

async function apri(page, id) {
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(`scroll-p0-${id}`, 'workspace', 'Prova dello scorrimento', 'local:prova', { conclusa: false, modello: 'local:prova' });
    /* VELO-SPEC: da A1-R3 una sessione aperta resta velata fino al confine, che il server manda SEMPRE (anche a storia vuota). */
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, id);
}

async function eventi(page, lista) {
  await page.evaluate((lista) => {
    const r = window.__talosHarnessUiRuntime;
    for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
  }, lista);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}

const PARAGRAFO = (n) => `Paragrafo ${n}: la conversazione conserva la cronologia e il testo continua per qualche riga, così la colonna cresce davvero.\n\n`;
const avvio = (consegna = 'Controlla i test del progetto', seq = 1) => ({ type: 'RunStarted', input: { consegna }, _sequenza: seq });

/** Riempie la chat finché lo scorrevole ha almeno `minimo` px di corsa. */
async function riempi(page, messaggi = 3) {
  const lista = [avvio()];
  for (let m = 0; m < messaggi; m += 1) {
    lista.push({ type: 'TextMessageContent', messageId: `pieno-${m}`, delta: Array.from({ length: 40 }, (_, i) => PARAGRAFO(m * 40 + i + 1)).join(''), _sequenza: 100 + m });
    lista.push({ type: 'TextMessageEnd', messageId: `pieno-${m}`, _sequenza: 200 + m });
  }
  /* ⛔ Il giro si CHIUDE: con un giro ancora vivo il composer mette in coda invece di inviare, e
     SCROLL-P0-05 proverebbe un percorso che non è quello dell'invio (misurato: nessuna bolla). */
  lista.push({ type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 300 });
  await eventi(page, lista);
  await expect(page.locator('#conversation .is-streaming')).toHaveCount(0, { timeout: 20000 });
}

/**
 * Porta la vista a metà con una ROTELLA vera (un gesto della persona, non un'assegnazione di
 * `scrollTop`: solo così si prova il percorso che il prodotto vede davvero) e installa la sonda
 * che registra lo scostamento MASSIMO — non solo quello finale: uno `scrollTo` a molla torna
 * indietro da solo e un confronto fatto alla fine non lo vedrebbe mai.
 */
async function vaiAMetaEOsserva(page) {
  const scroller = page.locator('#schermoChat .talos-conversation');
  await scroller.hover();
  await page.mouse.wheel(0, -100000); // in cima
  await page.waitForTimeout(150);
  await page.mouse.wheel(0, 1200); // e poi un po' più giù: siamo in mezzo, di nostra iniziativa
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const sc = document.querySelector('#schermoChat .talos-conversation');
    const sonda = { base: sc.scrollTop, max: 0, letture: [] };
    window.__p0cSonda = sonda;
    const guarda = () => {
      const scarto = Math.abs(sc.scrollTop - sonda.base);
      if (scarto > sonda.max) sonda.max = scarto;
      sonda.letture.push(Math.round(sc.scrollTop));
      if (window.__p0cSonda === sonda) requestAnimationFrame(guarda);
    };
    sc.addEventListener('scroll', guarda, { passive: true });
    requestAnimationFrame(guarda);
    return { base: sc.scrollTop, corsa: sc.scrollHeight - sc.clientHeight };
  });
}

const leggiSonda = (page) => page.evaluate(() => ({ ...window.__p0cSonda, letture: window.__p0cSonda.letture.slice(-6) }));

test('SCROLL-P0-01 — 240 delta con la persona a metà: la vista non si muove di un pixel', async ({ page }) => {
  await apri(page, 'delta');
  await riempi(page);
  const { base, corsa } = await vaiAMetaEOsserva(page);
  expect(corsa, 'lo scorrevole deve avere corsa vera, altrimenti la prova non prova niente').toBeGreaterThan(600);
  expect(base, 'la persona è in mezzo, non in fondo').toBeLessThan(corsa - 200);

  const delta = [];
  for (let i = 0; i < 240; i += 1) delta.push({ type: 'TextMessageContent', messageId: 'live', delta: `frammento ${i} `, _sequenza: 1000 + i });
  await eventi(page, delta);
  await page.waitForTimeout(1200); // più dei 40 ms della vecchia coda e dell'animazione smooth che ne seguiva
  const sonda = await leggiSonda(page);
  expect(sonda.max, `la vista si è spostata di ${sonda.max}px durante lo streaming (ultime letture: ${sonda.letture})`).toBe(0);
});

test('SCROLL-P0-02 — nemmeno le carte del modello la spostano (attesa, attrezzo, attività, artefatto, permesso)', async ({ page }) => {
  await apri(page, 'carte');
  await riempi(page);
  const { base } = await vaiAMetaEOsserva(page);
  expect(base).toBeGreaterThan(0);

  await eventi(page, [
    { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi', _sequenza: 2000 },
    { type: 'ToolCallArgs', toolCallId: 't1', delta: '{"percorso":"src/app.js"}', _sequenza: 2001 },
    { type: 'ToolCallResult', toolCallId: 't1', ok: true, _sequenza: 2002 },
    /* ⛔ La SECONDA riga attrezzo riusa il batch già aperto: non passa da `creaAttivita` e quindi
       prova solo la coda di `appendToolNote` — il punto in cui la guardia era capovolta. */
    { type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'cerca', _sequenza: 2002.5 },
    { type: 'ToolCallResult', toolCallId: 't2', ok: true, _sequenza: 2002.6 },
    { type: 'ArtifactCreated', id: 'a1', titolo: 'Grafico', _sequenza: 2003 },
    { type: 'ApprovalRequested', requestId: 'p1', azione: { attrezzo: 'scrivi', percorso: 'src/nuovo.js' }, _sequenza: 2004 },
  ]);
  await page.waitForTimeout(1200);
  const sonda = await leggiSonda(page);
  expect(sonda.max, `una carta del modello ha spostato la vista di ${sonda.max}px`).toBe(0);
});

test('R4-CHAT-ACTIVITY-SCROLL-06 — creare un segmento tool/ragionamento non sposta chi legge a metà', async ({ page }) => {
  await apri(page, 'segmento-r4');
  await riempi(page);
  const { base, corsa } = await vaiAMetaEOsserva(page);
  expect(corsa).toBeGreaterThan(600);
  expect(base).toBeGreaterThan(0);
  expect(base).toBeLessThan(corsa - 200);

  await eventi(page, [
    { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi', _sequenza: 2000 },
    { type: 'ToolCallResult', toolCallId: 't1', content: 'file letto', _sequenza: 2001 },
    { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2002 },
    { type: 'ReasoningMessageContent', messageId: 'r1', delta: 'Controllo quale prova segue.', _sequenza: 2003 },
    { type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 2004 },
    { type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'cerca', _sequenza: 2005 },
    { type: 'ToolCallResult', toolCallId: 't2', content: 'test trovato', _sequenza: 2006 },
  ]);
  await expect(page.locator('#conversation .talos-activity--segment')).toHaveCount(1);
  await page.waitForTimeout(1200);
  const sonda = await leggiSonda(page);
  expect(sonda.max, `il nuovo segmento ha spostato la vista di ${sonda.max}px (ultime letture: ${sonda.letture})`).toBe(0);
});

test('SCROLL-P0-03 — un nuovo giro non riporta giù chi sta leggendo', async ({ page }) => {
  await apri(page, 'giro');
  await riempi(page);
  const { base } = await vaiAMetaEOsserva(page);
  expect(base).toBeGreaterThan(0);

  await eventi(page, [avvio('E adesso continua', 3000)]);
  await page.waitForTimeout(1200);
  const dopoAvvio = await leggiSonda(page);
  expect(dopoAvvio.max, `RunStarted ha riportato la vista giù di ${dopoAvvio.max}px`).toBe(0);

  // e il giro che segue continua a non inseguirla
  await eventi(page, [{ type: 'TextMessageContent', messageId: 'dopo-giro', delta: 'Riprendo da dove eravamo. '.repeat(40), _sequenza: 3001 }]);
  await page.waitForTimeout(600);
  const dopoTesto = await leggiSonda(page);
  expect(dopoTesto.max).toBe(0);
});

test('SCROLL-P0-04 — chi torna in fondo viene di nuovo seguito', async ({ page }) => {
  await apri(page, 'ritorno');
  await riempi(page);
  await vaiAMetaEOsserva(page);
  await eventi(page, [{ type: 'TextMessageContent', messageId: 'live', delta: 'uno. '.repeat(50), _sequenza: 4000 }]);
  await page.waitForTimeout(400);
  expect((await leggiSonda(page)).max).toBe(0);

  // la persona torna in fondo con il pulsante: è una SUA azione, e riaccende il seguito
  const torna = page.getByRole('button', { name: 'Torna in fondo alla conversazione', exact: true });
  await expect(torna).toBeVisible();
  await torna.click();
  await page.waitForTimeout(600);
  const scroller = page.locator('#schermoChat .talos-conversation');
  const primaDelSeguito = await scroller.evaluate((e) => e.scrollTop);

  await eventi(page, [{ type: 'TextMessageContent', messageId: 'live', delta: Array.from({ length: 30 }, (_, i) => PARAGRAFO(500 + i)).join(''), _sequenza: 4100 }]);
  await expect.poll(() => scroller.evaluate((e) => e.scrollTop), { timeout: 5000 }).toBeGreaterThan(primaDelSeguito);
});

test('SCROLL-P0-05 — il messaggio scritto dalla PERSONA riporta in fondo (è una sua azione)', async ({ page }) => {
  await apri(page, 'invio');
  await riempi(page);
  const { base } = await vaiAMetaEOsserva(page);
  expect(base).toBeGreaterThan(0);
  const scroller = page.locator('#schermoChat .talos-conversation');

  await page.evaluate(() => { window.__p0cSonda = null; }); // la sonda ha già detto la sua: qui ci si ASPETTA il movimento
  await page.locator('#composerInput').fill('Continua da qui, per favore');
  await page.locator('#composerInput').press('Enter');

  /*
   * ⛔ La promessa NON è «scrollTop uguale a scrollHeight»: sotto l'ultimo messaggio c'è mezzo
   *   schermo di spazio voluto (`--stream-follow-space`, owner 06/09 «la conversazione scrollata al
   *   massimo deve essere centrata a metà pagina»). Misurato dopo la cura: restano 29 px dal fondo
   *   dello scorrevole, che è la posizione GIUSTA. Si prova quindi quello che la persona vede: la
   *   sua frase è a schermo, e il pulsante «torna in fondo» è sparito.
   */
  const bolla = page.locator('#conversation .talos-message--user').last();
  await expect(bolla).toContainText('Continua da qui, per favore');
  await expect.poll(async () => {
    const dentro = await bolla.evaluate((el) => {
      const sc = document.querySelector('#schermoChat .talos-conversation');
      const r = el.getBoundingClientRect();
      const c = sc.getBoundingClientRect();
      return r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
    });
    return dentro;
  }, { timeout: 6000 }).toBe(true);
  await expect(page.getByRole('button', { name: 'Torna in fondo alla conversazione', exact: true })).toBeHidden();
  void scroller;
});

test('SCROLL-P0-06 — `.talos-conversation` dichiara overflow-anchor e resta un solo scorrevole', async ({ page }) => {
  await apri(page, 'ancora');
  await riempi(page);
  const stato = await page.evaluate(() => {
    const sc = document.querySelector('#schermoChat .talos-conversation');
    const colonna = document.querySelector('#conversation');
    return {
      ancora: getComputedStyle(sc).overflowAnchor,
      segue: sc.dataset.segue,
      scorrevoli: [...document.querySelectorAll('#schermoChat .talos-conversation')].length,
      colonnaScorre: colonna.scrollHeight > colonna.clientHeight + 1,
    };
  });
  /* ⭐ 24/09/2026 — mentre si SEGUE il fondo l'ancoraggio nativo è spento (`data-segue="si"` ⇒ `overflow-anchor:none`,
     la forma di Hermes `styles.css:1739-1746` e Cline `MessagesArea.tsx:264`); `auto` torna solo quando la persona si
     stacca (SCROLL-P0-07). Prima di oggi qui si pretendeva `auto` sempre: era la guardia del 16/09, che resta vera
     nel verso «chi legge in alto è protetto». */
  expect(stato.segue, 'a fondo raggiunto lo scorrevole dichiara che sta seguendo').toBe('si');
  expect(stato.ancora, 'seguendo, l’ancoraggio nativo è spento: un solo scrittore dello scrollTop').toBe('none');
  expect(stato.scorrevoli).toBe(1);
  expect(stato.colonnaScorre, 'la colonna non deve scorrere: chi scorre è il contenitore').toBe(false);
});

test('SCROLL-P0-07 — chi si stacca riaccende l’ancoraggio nativo; chi torna in fondo lo rispegne', async ({ page }) => {
  await apri(page, 'ancora-stacco');
  await riempi(page);
  const leggi = () => page.evaluate(() => { const sc = document.querySelector('#schermoChat .talos-conversation'); return { segue: sc.dataset.segue, ancora: getComputedStyle(sc).overflowAnchor }; });
  expect(await leggi()).toEqual({ segue: 'si', ancora: 'none' });
  await vaiAMetaEOsserva(page);
  expect(await leggi(), 'a metà pagina la persona è protetta dall’ancoraggio nativo').toEqual({ segue: 'no', ancora: 'auto' });
  await page.locator('#schermoChat .talos-conversation').hover();
  await page.mouse.wheel(0, 100000);
  await page.waitForTimeout(300);
  expect(await leggi(), 'tornata in fondo, si segue di nuovo e l’ancoraggio si spegne').toEqual({ segue: 'si', ancora: 'none' });
});

test('SCROLL-P0-08 — se cresce qualcosa SOPRA la risposta che scorre, il fondo resta in vista (ri-ancoraggio)', async ({ page }) => {
  await apri(page, 'cresce-sopra');
  await riempi(page);
  // Un giro nuovo con una risposta che scorre; poi un ragionamento che cresce a pezzi PRIMA del testo.
  await eventi(page, [avvio('Spiega', 400), { type: 'ReasoningMessageStart', messageId: 'rag-1', _sequenza: 401 }, { type: 'TextMessageContent', messageId: 'testo-1', delta: PARAGRAFO(1), _sequenza: 402 }]);
  // ciò che deve restare fermo è la CODA DEL TESTO rispetto alla metà del viewport (regola 06/09), non la distanza dal fondo
  const scartoDaMeta = () => page.evaluate(() => { const sc = document.querySelector('#schermoChat .talos-conversation'); const r = sc.getBoundingClientRect(); const copia = document.querySelector('#conversation .is-streaming .assistant-copy') || document.querySelector('#conversation .assistant-copy:last-of-type'); return Math.round(Math.abs(copia.getBoundingClientRect().bottom - (r.top + r.height / 2))); });
  const prima = await scartoDaMeta();
  // il ragionamento cresce di molte righe sopra il testo: senza ri-ancoraggio il fondo scapperebbe di altrettanti pixel
  await eventi(page, Array.from({ length: 12 }, (_, i) => ({ type: 'ReasoningMessageContent', messageId: 'rag-1', delta: `Passo ${i + 1}: il modello ragiona a lungo e la riga si allunga.
`, _sequenza: 410 + i })));
  // la ResizeObserver della colonna osserva DOPO il layout e scrive al fotogramma successivo: si riprova, non si aspetta a occhio
  await expect.poll(async () => scartoDaMeta(), { timeout: 1500, message: `scarto dalla metà prima ${prima}px` }).toBeLessThan(36);
});

test('SCROLL-P0-09 — ragionamento APERTO sopra la risposta e testo che scorre sotto: nessun su-e-giù (un solo bersaglio, il fondo)', async ({ page }) => {
  await apri(page, 'alternanza');
  await riempi(page);
  // Un giro vivo: il ragionamento parte, la persona lo APRE, poi ragionamento e testo crescono alternati (è il caso dell'owner).
  await eventi(page, [avvio('Spiega', 600), { type: 'ReasoningMessageStart', messageId: 'rag-9', _sequenza: 601 }, { type: 'ReasoningMessageContent', messageId: 'rag-9', delta: 'Prima riga del ragionamento.\n', _sequenza: 602 }]);
  const testaRag = page.locator('#conversation .real-reasoning-note summary, #conversation .real-reasoning-note [aria-expanded]').first();
  if (await testaRag.count()) await testaRag.click();
  await page.mouse.wheel(0, 100000);
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const sc = document.querySelector('#schermoChat .talos-conversation');
    const sonda = { letture: [], inversioni: 0, saltiNeg: 0, maxNeg: 0, dir: 0, ultimo: sc.scrollTop };
    window.__p0sonda9 = sonda;
    const guarda = () => {
      const d = sc.scrollTop - sonda.ultimo;
      // sotto i 2 px è arrotondamento del browser, non un salto che si vede (regola: un numero letto oltre la sua risoluzione)
      if (Math.abs(d) >= 2) { const nd = Math.sign(d); if (sonda.dir !== 0 && nd !== sonda.dir) sonda.inversioni += 1; sonda.dir = nd; if (d < 0) { sonda.saltiNeg += 1; sonda.maxNeg = Math.min(sonda.maxNeg, d); } }
      sonda.ultimo = sc.scrollTop; sonda.letture.push(Math.round(sc.scrollTop));
      if (window.__p0sonda9 === sonda) requestAnimationFrame(guarda);
    };
    requestAnimationFrame(guarda);
  });
  const lista = [];
  for (let i = 0; i < 40; i += 1) {
    lista.push({ type: 'ReasoningMessageContent', messageId: 'rag-9', delta: `Passo ${i + 1} del ragionamento, che si allunga di una riga.
`, _sequenza: 700 + i * 2 });
    lista.push({ type: 'TextMessageContent', messageId: 'testo-9', delta: `Riga ${i + 1} della risposta, che cresce sotto il ragionamento. `, _sequenza: 701 + i * 2 });
  }
  for (const e of lista) { await eventi(page, [e]); await page.waitForTimeout(16); }
  const esito = await page.evaluate(() => { const s = window.__p0sonda9; window.__p0sonda9 = null; return { inversioni: s.inversioni, saltiNeg: s.saltiNeg, maxNeg: s.maxNeg, letture: s.letture.length }; });
  expect(esito.letture, 'la sonda ha letto dei fotogrammi').toBeGreaterThan(20);
  expect(esito.saltiNeg, `salti verso l'alto mentre si segue: ${JSON.stringify(esito)}`).toBe(0);
  expect(esito.inversioni, `inversioni di direzione: ${JSON.stringify(esito)}`).toBeLessThanOrEqual(1);
});

test('ORB-TESTATA-03 — l’orb gira nella testata del messaggio TALOS finché il giro è vivo, poi resta fermo', async ({ page }) => {
  await apri(page, 'orb');
  await eventi(page, [avvio('Scrivi', 500), { type: 'TextMessageContent', messageId: 'orb-1', delta: 'Ecco la risposta, che continua…', _sequenza: 501 }]);
  const orb = page.locator('#conversation .talos-message__head .talos-orb');
  await expect(orb, 'un orb nella testata del messaggio in corso').toHaveCount(1);
  await expect(orb).toHaveClass(/working/);
  await eventi(page, [{ type: 'TextMessageEnd', messageId: 'orb-1', _sequenza: 502 }, { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 503 }]);
  await expect(orb, 'a giro finito l’orb resta').toHaveCount(1);
  await expect(orb, 'ma l’anello non gira più').not.toHaveClass(/working/);
});

test('P0-CHAT-JITTER-FOLLOW-01 — delta ritmati seguono il testo a metà senza inversioni involontarie', async ({ page }, testInfo) => {
  await apri(page, 'jitter-follow');
  await riempi(page, 2);
  await vaiAMetaEOsserva(page);
  const torna = page.getByRole('button', { name: 'Torna in fondo alla conversazione', exact: true });
  await expect(torna).toBeVisible();
  await torna.click();
  await expect(torna).toBeHidden();
  await page.evaluate(() => { window.__p0cSonda = null; });

  const misure = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const scroller = document.querySelector('#schermoChat .talos-conversation');
    const generation = runtime.realSessionState.generation;
    const righe = [];
    let campiona = true;
    let ultimoRicevuto = 0;
    const frame = () => {
      if (!campiona) return;
      // Il timer parte DOPO tutte le callback rAF del paint, incluso lo scroll writer
      // dell'app: leggere qui evita di giudicare un frame non ancora dipinto.
      setTimeout(() => {
        if (!campiona) return;
        const copia = document.querySelector('#conversation .is-streaming .assistant-copy');
        const contenuto = copia?.textContent || '';
        const scRect = scroller.getBoundingClientRect();
        righe.push({
          t: performance.now(), top: scroller.scrollTop,
          max: scroller.scrollHeight - scroller.clientHeight,
          viewportMid: scRect.top + scRect.height / 2,
          textBottom: copia?.getBoundingClientRect().bottom ?? null,
          visibleChars: contenuto.length, receivedChars: ultimoRicevuto,
        });
        requestAnimationFrame(frame);
      }, 0);
    };
    requestAnimationFrame(frame);
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Scrivi per paragrafi' }, _sequenza: 1000 }, generation);
    for (let i = 0; i < 56; i += 1) {
      const delta = `Riga ${i + 1}: una frase leggibile e abbastanza lunga per fare crescere il testo su più linee.\n`;
      // textContent non conserva i newline che il markdown trasforma in righe.
      ultimoRicevuto += delta.replaceAll('\n', '').length;
      runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'jitter-live', delta, _sequenza: 1001 + i }, generation);
      await new Promise((ok) => setTimeout(ok, i % 7 === 0 ? 55 : 22));
    }
    /* ⛔ Owner 26/09/2026, «Il ritmo»: il ritmo di rivelazione di Hermes (app.js, `STREAM_DRENAGGIO_MS = 500`) tiene
       il testo arrivato in arretrato e lo svuota in ~500 ms PER COSTRUZIONE. La prova aspettava due fotogrammi: ora
       aspetta il drenaggio, con un tetto di 500 ms + margine, e misura quanto ci ha messo. */
    const inizioDrenaggio = performance.now();
    while (performance.now() - inizioDrenaggio < 700
      && (document.querySelector('#conversation .is-streaming .assistant-copy')?.textContent.length || 0) < ultimoRicevuto) {
      await new Promise((ok) => requestAnimationFrame(ok));
    }
    const drenaggioMs = performance.now() - inizioDrenaggio;
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    campiona = false;
    const visibili = righe.filter((r) => r.visibleChars > 0);
    let inversioni = 0;
    let verso = 0;
    for (let i = 1; i < visibili.length; i += 1) {
      const delta = visibili[i].top - visibili[i - 1].top;
      if (Math.abs(delta) < 2) continue;
      const nuovoVerso = Math.sign(delta);
      if (verso > 0 && nuovoVerso < 0) inversioni += 1;
      verso = nuovoVerso;
    }
    const erroriCentro = visibili.slice(3).filter((r) => r.textBottom !== null && r.max > 100)
      .map((r) => Math.abs(r.textBottom - r.viewportMid));
    return { righe, inversioni, maxErroreCentro: Math.max(0, ...erroriCentro), drenaggioMs,
      testoRicevuto: ultimoRicevuto, testoVisibile: visibili.at(-1)?.visibleChars || 0 };
  });
  await testInfo.attach('p0-chat-jitter-follow-frames.json', {
    body: Buffer.from(JSON.stringify(misure)), contentType: 'application/json',
  });
  expect(misure.righe.length, 'servono campioni di più frame, non solo uno snapshot finale').toBeGreaterThan(50);
  expect(misure.testoVisibile, 'l arretrato si svuota tutto: nessun delta ricevuto resta nascosto').toBe(misure.testoRicevuto);
  expect(misure.drenaggioMs, 'l arretrato si svuota entro il ritmo di Hermes (500 ms) più un margine').toBeLessThan(650);
  expect(misure.inversioni, 'lo scroll live non deve invertire verso senza gesto umano').toBe(0);
  expect(misure.maxErroreCentro, 'la coda di testo deve restare vicina a metà viewport').toBeLessThan(36);
});

test('P0-CHAT-JITTER-TRANSITION-02 — tool e ragionamento non lasciano il nuovo testo un frame indietro', async ({ page }, testInfo) => {
  await apri(page, 'jitter-transition');
  await riempi(page, 2);
  await vaiAMetaEOsserva(page);
  const torna = page.getByRole('button', { name: 'Torna in fondo alla conversazione', exact: true });
  await torna.click();
  await expect(torna).toBeHidden();
  await page.evaluate(() => { window.__p0cSonda = null; });

  const misure = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const generation = runtime.realSessionState.generation;
    const scroller = document.querySelector('#schermoChat .talos-conversation');
    const rows = [];
    let running = true;
    const emit = (e) => runtime.handleRealEvent(e, generation);
    const sample = () => {
      if (!running) return;
      setTimeout(() => {
        if (!running) return;
        const copy = document.querySelector('#conversation .is-streaming .assistant-copy');
        const sr = scroller.getBoundingClientRect();
        rows.push({ t: performance.now(), top: scroller.scrollTop,
          bottom: copy?.getBoundingClientRect().bottom ?? null,
          middle: sr.top + sr.height / 2, chars: copy?.textContent.length || 0,
          toolRows: document.querySelectorAll('#conversation .talos-tool-row').length,
          reasoningRows: document.querySelectorAll('#conversation .real-reasoning-note').length });
        requestAnimationFrame(sample);
      }, 0);
    };
    requestAnimationFrame(sample);
    emit({ type: 'RunStarted', input: { consegna: 'Riassumi il lavoro' }, _sequenza: 5000 });
    emit({ type: 'ToolCallStart', toolCallId: 'jitter-tool', toolCallName: 'leggi', _sequenza: 5001 });
    emit({ type: 'ToolCallResult', toolCallId: 'jitter-tool', content: 'Tre file letti', _sequenza: 5002 });
    await new Promise((ok) => setTimeout(ok, 45));
    emit({ type: 'ReasoningMessageStart', messageId: 'jitter-thought', _sequenza: 5003 });
    emit({ type: 'ReasoningMessageContent', messageId: 'jitter-thought', delta: 'Controllo i contratti e preparo una risposta chiara.', _sequenza: 5004 });
    emit({ type: 'ReasoningMessageEnd', messageId: 'jitter-thought', _sequenza: 5005 });
    await new Promise((ok) => setTimeout(ok, 45));
    for (let i = 0; i < 28; i += 1) {
      emit({ type: 'TextMessageContent', messageId: 'jitter-after-tool',
        delta: `Passaggio ${i + 1}: ${'descrivo in modo verificabile quanto e stato appena osservato, senza omettere gli eventi. '.repeat(3)}\n`,
        _sequenza: 5006 + i });
      await new Promise((ok) => setTimeout(ok, 24));
    }
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    running = false;
    const textRows = rows.filter((r) => r.chars > 0);
    const errors = textRows.slice(3).map((r) => Math.abs(r.bottom - r.middle));
    return { rows, maxTextError: Math.max(0, ...errors),
      toolRows: textRows.at(-1)?.toolRows || 0,
      reasoningRows: textRows.at(-1)?.reasoningRows || 0 };
  });
  await testInfo.attach('p0-chat-jitter-transition-frames.json', {
    body: Buffer.from(JSON.stringify(misure)), contentType: 'application/json',
  });
  expect(misure.toolRows).toBeGreaterThan(0);
  expect(misure.reasoningRows).toBeGreaterThan(0);
  expect(misure.rows.length).toBeGreaterThan(30);
  expect(misure.maxTextError, 'dopo tool e ragionamento, il nuovo testo resta a metà ad ogni paint').toBeLessThan(36);
});

test('P0-CHAT-JITTER-HOLD-03 — una piccola rotella verso alto ferma il follow', async ({ page }, testInfo) => {
  await apri(page, 'jitter-small-wheel');
  await riempi(page, 2);
  await vaiAMetaEOsserva(page);
  const scroller = page.locator('#schermoChat .talos-conversation');
  await scroller.hover();
  await page.mouse.wheel(0, 100000); // ritorno fisico immediato, senza smooth del pulsante
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__p0cSonda = null; });
  const fondo = await scroller.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, -12); // evento fisico, non scrittura sintetica di scrollTop
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop), { timeout: 2000 }).toBeLessThan(fondo);
  const inLettura = await scroller.evaluate((el) => el.scrollTop);
  expect(fondo - inLettura, 'la prova deve esercitare proprio la tolleranza di 24 px').toBeGreaterThan(0);
  expect(fondo - inLettura).toBeLessThan(24);
  await page.evaluate((base) => {
    const el = document.querySelector('#schermoChat .talos-conversation');
    const probe = { base, max: 0, samples: [] };
    window.__p0SmallWheelProbe = probe;
    const sample = () => {
      if (window.__p0SmallWheelProbe !== probe) return;
      const delta = el.scrollTop - base;
      probe.max = Math.max(probe.max, Math.abs(delta));
      probe.samples.push({ t: performance.now(), top: el.scrollTop, height: el.scrollHeight });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, inLettura);
  await eventi(page, [avvio('Continua mentre leggo sopra', 6000)]);
  for (let i = 0; i < 10; i += 1) {
    await eventi(page, [{ type: 'TextMessageContent', messageId: 'hold-small',
      delta: `Frammento ${i + 1}: la persona sta ancora leggendo il messaggio precedente. `.repeat(2),
      _sequenza: 6001 + i }]);
    await page.waitForTimeout(20);
  }
  const misura = await page.evaluate(() => window.__p0SmallWheelProbe);
  await testInfo.attach('p0-chat-small-wheel-frames.json', {
    body: Buffer.from(JSON.stringify(misura)), contentType: 'application/json',
  });
  expect(misura.samples.at(-1).height).toBeGreaterThan(misura.samples[0].height);
  expect(misura.max, 'la rotella manuale verso alto prevale su ogni nuovo delta').toBeLessThanOrEqual(2);
});

test('P0-CHAT-JITTER-REASONING-04 — ragionamento aperto cresce a pezzi senza perdere il midpoint', async ({ page }, testInfo) => {
  await apri(page, 'jitter-long-reasoning');
  await riempi(page, 2);
  await vaiAMetaEOsserva(page);
  const scroller = page.locator('#schermoChat .talos-conversation');
  await scroller.hover();
  await page.mouse.wheel(0, 100000);
  await page.waitForTimeout(180);
  await page.evaluate(() => { window.__p0cSonda = null; });
  await eventi(page, [
    avvio('Ragiona mentre leggo', 7000),
    { type: 'ReasoningMessageStart', messageId: 'long-live', _sequenza: 7001 },
    { type: 'ReasoningMessageContent', messageId: 'long-live', delta: 'Inizio della verifica.\n\n', _sequenza: 7002 },
  ]);
  const nota = page.locator('#conversation .real-reasoning-note').last();
  await expect(nota).toBeVisible();
  const testa = nota.locator(':scope > .talos-activity__head');
  await testa.click();
  await expect(testa).toHaveAttribute('aria-expanded', 'true');

  const misure = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const generation = runtime.realSessionState.generation;
    const scroller = document.querySelector('#schermoChat .talos-conversation');
    const card = [...document.querySelectorAll('#conversation .real-reasoning-note')].at(-1);
    const body = card.querySelector('.tool-note-detail');
    const rows = [];
    let sampling = true;
    const sample = () => {
      if (!sampling) return;
      setTimeout(() => {
        if (!sampling) return;
        const rect = scroller.getBoundingClientRect();
        rows.push({ t: performance.now(), top: scroller.scrollTop,
          bodyChars: body.textContent.length, bodyBottom: body.getBoundingClientRect().bottom,
          cardBottom: card.getBoundingClientRect().bottom,
          middle: rect.top + rect.height / 2 });
        requestAnimationFrame(sample);
      }, 0);
    };
    requestAnimationFrame(sample);
    const longText = Array.from({ length: 210 }, (_, i) =>
      `Passo ${i + 1}: confronto la sequenza degli eventi con il comportamento visibile e verifico che nessuna parte del ragionamento venga perduta.\n\n`).join('') + 'FINE-RAGIONAMENTO-LUNGO';
    runtime.handleRealEvent({ type: 'ReasoningMessageContent', messageId: 'long-live', delta: longText, _sequenza: 7003 }, generation);
    for (let i = 0; i < 120 && !body.textContent.includes('FINE-RAGIONAMENTO-LUNGO'); i += 1) {
      await new Promise((ok) => requestAnimationFrame(ok));
    }
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    sampling = false;
    const growing = rows.filter((r) => r.bodyChars > 4000);
    return { rows, allMounted: body.textContent.includes('FINE-RAGIONAMENTO-LUNGO'),
      growingFrames: growing.length,
      maxMidError: Math.max(0, ...growing.map((r) => Math.abs(r.cardBottom - r.middle))) };
  });
  await testInfo.attach('p0-chat-long-reasoning-frames.json', {
    body: Buffer.from(JSON.stringify(misure)), contentType: 'application/json',
  });
  expect(misure.allMounted, 'il contenuto non deve sparire per seguire la viewport').toBe(true);
  expect(misure.growingFrames, 'servono più paint di montaggio, non una card già finita').toBeGreaterThan(2);
  expect(misure.maxMidError, 'ogni pezzo visibile deve conservare la coda vicino a metà viewport').toBeLessThan(36);
});

test('P0-CHAT-JITTER-RETURN-05 — clic Torna in fondo e delta immediato non perdono il follow', async ({ page }, testInfo) => {
  await apri(page, 'jitter-return');
  await riempi(page, 2);
  await vaiAMetaEOsserva(page);
  const torna = page.getByRole('button', { name: 'Torna in fondo alla conversazione', exact: true });
  await expect(torna).toBeVisible();
  const misura = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const generation = runtime.realSessionState.generation;
    const scroller = document.querySelector('#schermoChat .talos-conversation');
    const button = [...document.querySelectorAll('button')]
      .find((b) => b.getAttribute('aria-label') === 'Torna in fondo alla conversazione');
    if (!button) return { buttonMissing: true };
    const samples = [];
    let running = true;
    const sample = () => {
      if (!running) return;
      setTimeout(() => {
        if (!running) return;
        const copy = document.querySelector('#conversation .is-streaming .assistant-copy');
        const rect = scroller.getBoundingClientRect();
        samples.push({ t: performance.now(), top: scroller.scrollTop,
          bottom: copy?.getBoundingClientRect().bottom ?? null,
          middle: rect.top + rect.height / 2,
          chars: copy?.textContent.length || 0 });
        requestAnimationFrame(sample);
      }, 0);
    };
    requestAnimationFrame(sample);
    button.click();
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Riprendi' }, _sequenza: 8000 }, generation);
    runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'return-live',
      delta: 'Prima parte della risposta, visibile subito. '.repeat(15), _sequenza: 8001 }, generation);
    await new Promise((ok) => setTimeout(ok, 650));
    const beforeNext = scroller.scrollTop;
    runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'return-live',
      delta: 'Seconda parte dopo il ritorno, ancora seguita. '.repeat(25), _sequenza: 8002 }, generation);
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    running = false;
    const last = samples.at(-1);
    return { samples, beforeNext, afterNext: last?.top,
      finalMidError: last?.bottom === null ? null : Math.abs(last.bottom - last.middle),
      finalChars: last?.chars || 0 };
  });
  await testInfo.attach('p0-chat-return-immediate-frames.json', {
    body: Buffer.from(JSON.stringify(misura)), contentType: 'application/json',
  });
  expect(misura.buttonMissing).not.toBe(true);
  expect(misura.finalChars).toBeGreaterThan(500);
  expect(misura.afterNext, 'il delta successivo deve restare agganciato').toBeGreaterThan(misura.beforeNext);
  expect(misura.finalMidError, 'dopo il ritorno umano la coda torna a metà viewport').toBeLessThan(36);
});

test('P0-CHAT-STREAM-CADENCE-06 — output visibile segue i delta senza pause UI aggiunte', async ({ page }, testInfo) => {
  await page.evaluate(() => {
    const trace = { start: performance.now(), syncMs: 0, longFrames: [], longTasks: [], observers: [] };
    for (const type of ['long-animation-frame', 'longtask']) {
      if (!PerformanceObserver.supportedEntryTypes?.includes(type)) continue;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (type === 'longtask') trace.longTasks.push({ start: entry.startTime, duration: entry.duration,
            attribution: (entry.attribution || []).map((a) => ({ name: a.name, entryType: a.entryType })) });
          else trace.longFrames.push({ start: entry.startTime, duration: entry.duration,
            blocking: entry.blockingDuration, renderStart: entry.renderStart,
            styleAndLayoutStart: entry.styleAndLayoutStart,
            scripts: (entry.scripts || []).slice(0, 8).map((s) => ({ duration: s.duration,
              functionName: s.sourceFunctionName, sourceURL: s.sourceURL, invoker: s.invoker })) });
        }
      });
      observer.observe({ type });
      trace.observers.push(observer);
    }
    window.__p0CadenceOpenTrace = trace;
    const start = performance.now();
    window.__talosHarnessUiRuntime.passaASessione('scroll-p0-stream-cadence', 'workspace',
      'Prova dello scorrimento', 'local:prova', { conclusa: false, modello: 'local:prova' });
    trace.syncMs = performance.now() - start;
    // VELO-SPEC: il confine del server a storia vuota (vedi `apri`), fuori dalla misura del passaggio sincrono
    window.__talosHarnessUiRuntime.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, window.__talosHarnessUiRuntime.realSessionState.generation);
  });
  const warmupMs = Number(process.env.TALOS_P0_CADENCE_WARMUP_MS) || 0;
  const preRunWarmupMs = Number(process.env.TALOS_P0_CADENCE_PRE_RUN_WARMUP_MS) || 0;
  const misura = await page.evaluate(async ({ warmupMs, preRunWarmupMs }) => {
    const runtime = window.__talosHarnessUiRuntime;
    const generation = runtime.realSessionState.generation;
    const frameRows = [];
    const inputs = [];
    const logStart = window.talosStreamingLog().length;
    const longFrames = [];
    const observer = typeof PerformanceObserver === 'function' &&
      PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')
      ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longFrames.push({
          start: entry.startTime, duration: entry.duration,
          blocking: entry.blockingDuration,
          renderStart: entry.renderStart,
          styleAndLayoutStart: entry.styleAndLayoutStart,
          scripts: (entry.scripts || []).slice(0, 8).map((s) => ({
            duration: s.duration, functionName: s.sourceFunctionName,
            sourceURL: s.sourceURL, invoker: s.invoker,
          })),
        });
      }) : null;
    observer?.observe({ type: 'long-animation-frame' });
    let running = true;
    const sample = () => {
      if (!running) return;
      setTimeout(() => {
        if (!running) return;
        frameRows.push({ t: performance.now(),
          chars: document.querySelector('#conversation .is-streaming .assistant-copy')?.textContent.length || 0 });
        requestAnimationFrame(sample);
      }, 0);
    };
    requestAnimationFrame(sample);
    if (preRunWarmupMs > 0) await new Promise((ok) => setTimeout(ok, preRunWarmupMs));
    const startAt = performance.now();
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Scrivi progressivamente' }, _sequenza: 9000 }, generation);
    const runStartedDuration = performance.now() - startAt;
    if (warmupMs > 0) await new Promise((ok) => setTimeout(ok, warmupMs));
    let receivedChars = 0;
    for (let i = 0; i < 60; i += 1) {
      const delta = `Parte ${i + 1}: parole ricevute dal trasporto. `;
      const t = performance.now();
      runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'cadence-live', delta, _sequenza: 9001 + i }, generation);
      receivedChars += delta.length;
      inputs.push({ t, expectedChars: receivedChars });
      await new Promise((ok) => setTimeout(ok, i === 39 ? 90 : 12));
    }
    /* ⛔ Owner 26/09/2026, «Il ritmo»: il testo si rivela col ritmo di Hermes (`STREAM_DRENAGGIO_MS = 500`, tetto 30
       caratteri per scrittura): l'ultimo delta diventa visibile quando l'arretrato si svuota, non entro due fotogrammi.
       Si aspetta il drenaggio (tetto 500 ms + margine) prima di smettere di campionare. */
    const inizioDrenaggio = performance.now();
    while (performance.now() - inizioDrenaggio < 700
      && (document.querySelector('#conversation .is-streaming .assistant-copy')?.textContent.length || 0) < receivedChars) {
      await new Promise((ok) => requestAnimationFrame(ok));
    }
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    running = false;
    observer?.disconnect();
    const lags = inputs.map((input) => {
      const firstVisible = frameRows.find((r) => r.t >= input.t && r.chars >= input.expectedChars);
      return firstVisible ? firstVisible.t - input.t : null;
    });
    /* La pausa AGGIUNTA dalla UI: il tratto più lungo in cui c'era arretrato (ricevuto > visibile) e il testo a
       schermo NON è cresciuto. Il ritmo rivela almeno un carattere a ogni scrittura: una pausa lunga qui è un difetto. */
    let maxStallo = 0;
    let inizioStallo = null;
    let ultimiVisibili = -1;
    for (const riga of frameRows) {
      const ricevutoAllora = inputs.filter((input) => input.t <= riga.t).at(-1)?.expectedChars ?? 0;
      const arretrato = ricevutoAllora > riga.chars;
      if (arretrato && riga.chars === ultimiVisibili) {
        if (inizioStallo === null) inizioStallo = riga.t;
        maxStallo = Math.max(maxStallo, riga.t - inizioStallo);
      } else {
        inizioStallo = arretrato ? riga.t : null;
      }
      ultimiVisibili = riga.chars;
    }
    const logs = window.talosStreamingLog().slice(logStart);
    const openTrace = window.__p0CadenceOpenTrace;
    openTrace?.observers.forEach((item) => item.disconnect());
    return { warmupMs, preRunWarmupMs, runStartedDuration, frameRows, inputs, lags, receivedChars,
      openSyncMs: openTrace?.syncMs, openLongFrames: openTrace?.longFrames,
      openLongTasks: openTrace?.longTasks,
      maxLag: Math.max(0, ...lags.filter(Number.isFinite)),
      maxStallo,
      unseenInputs: lags.filter((n) => n === null).length,
      longFrames: longFrames.filter((e) => e.start >= startAt),
      renderDurations: logs.filter((r) => r.evento === 'render').map((r) => r.durataMs),
      deltaLogCount: logs.filter((r) => r.evento === 'delta').length };
  }, { warmupMs, preRunWarmupMs });
  await testInfo.attach('p0-chat-stream-cadence.json', {
    body: Buffer.from(JSON.stringify(misura)), contentType: 'application/json',
  });
  expect(misura.inputs).toHaveLength(60);
  expect(misura.deltaLogCount).toBe(60);
  expect(misura.unseenInputs, 'ogni delta deve diventare visibile, anche dopo una pausa provider').toBe(0);
  expect(misura.frameRows.at(-1).chars).toBe(misura.receivedChars);
  expect(misura.maxLag, 'ogni delta diventa visibile entro il ritmo di Hermes (500 ms di drenaggio) più un margine').toBeLessThan(650);
  expect(misura.maxStallo, 'con arretrato il testo cresce a ogni scrittura: nessuna pausa aggiunta oltre due fotogrammi').toBeLessThan(50);
  expect(Math.max(...misura.renderDurations), 'il renderer deve lasciare budget al paint').toBeLessThan(50);
});

/*
 * ⛔⛔ TEMA CHIARO E SCURO, SEMPRE TUTTI E DUE (regola dell'owner, 11/09): una prova visiva con una
 *   foto sola non è una prova. Qui si fotografa ciò che questa corsia ha cambiato: la chat mentre il
 *   modello scrive con la persona ferma a metà, e una scheda di ragionamento APERTA (il corpo montato
 *   a pezzi). Le foto finiscono in `frontend/artifacts/p0-C/`.
 */
for (const modo of ['dark', 'light']) {
  test(`SCROLL-P0-FOTO — la chat mentre scrive e il ragionamento aperto, tema ${modo}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: modo });
    await page.addInitScript((colorMode) => {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } }));
    }, modo);
    await page.goto('/');
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await apri(page, `foto-${modo}`);
    await riempi(page, 2);

    await eventi(page, [
      avvio('Guarda i test e spiegami', 5000),
      { type: 'ReasoningMessageStart', messageId: 'rf', _sequenza: 5001 },
      { type: 'ReasoningMessageContent', messageId: 'rf', delta: 'Prima leggo i test della chat.\nPoi guardo lo scorrimento.\nInfine confronto con il mockup.\n', _sequenza: 5002 },
      { type: 'ReasoningMessageEnd', messageId: 'rf', _sequenza: 5003 },
      { type: 'TextMessageContent', messageId: 'mf', delta: 'Ho letto i test e sto scrivendo la risposta, che continua per qualche riga.', _sequenza: 5004 },
      /* ⛔ senza la FINE il messaggio resta `is-streaming` per sempre e l'attesa qui sotto non scade mai: misurato, non dedotto */
      { type: 'TextMessageEnd', messageId: 'mf', _sequenza: 5005 },
    ]);
    await expect(page.locator('#conversation .is-streaming')).toHaveCount(0, { timeout: 20000 });
    mkdirSync(FOTO, { recursive: true });
    await page.screenshot({ path: resolve(FOTO, `chat-streaming-${modo}.png`), fullPage: false });

    const testa = page.locator('#conversation .real-reasoning-note').last().locator(':scope > .talos-activity__head');
    await testa.click();
    /*
     * ⛔⛔ 16/09, GIRO DI RIPARAZIONE — LA FOTO ASPETTAVA UNA COSA GIÀ VERA.
     *   «Il corpo contiene l'ultima riga» lo è già a scheda CHIUSA: il testo grezzo sta nel `<pre>`
     *   dal `ReasoningMessageEnd` (cura di CHAT-LUNGA-P0-03). Quindi l'attesa finiva prima che il
     *   markdown fosse montato e la foto poteva ritrarre lo stato di mezzo. Si aspetta il montaggio
     *   VERO: nodi ELEMENTO nel corpo, e fra quelli l'ultima riga.
     */
    await page.waitForFunction(() => {
      const corpo = [...document.querySelectorAll('#conversation .real-reasoning-note')].pop()?.querySelector('.tool-note-detail');
      return !!corpo && corpo.querySelectorAll('*').length > 0 && corpo.textContent.includes('Infine confronto con il mockup.');
    }, null, { timeout: 20000 });
    await page.locator('#conversation .real-reasoning-note').last().locator(':scope > .talos-activity__body')
      .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    await page.screenshot({ path: resolve(FOTO, `ragionamento-aperto-${modo}.png`), fullPage: false });
  });
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
  for (const modo of ['light', 'dark']) {
    test(`P0-CHAT-VISUAL-1080-1440-07 — ${viewport.width}x${viewport.height} ${modo}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: modo });
      await page.addInitScript((colorMode) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
          version: 1, appearance: { colorMode, uiLanguage: 'it' },
        }));
      }, modo);
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await apri(page, `visual-${viewport.width}-${modo}`);
      await riempi(page, 2);
      await eventi(page, [
        avvio('Controlla la leggibilita del turno', 6000),
        { type: 'ToolCallStart', toolCallId: 'visual-tool', toolCallName: 'leggi', _sequenza: 6001 },
        { type: 'ToolCallResult', toolCallId: 'visual-tool', content: 'File verificati', _sequenza: 6002 },
        { type: 'ReasoningMessageStart', messageId: 'visual-reasoning', _sequenza: 6003 },
        { type: 'ReasoningMessageContent', messageId: 'visual-reasoning',
          delta: 'Controllo le prove, poi preparo una risposta verificabile.', _sequenza: 6004 },
        { type: 'ReasoningMessageEnd', messageId: 'visual-reasoning', _sequenza: 6005 },
        { type: 'TextMessageContent', messageId: 'visual-stream',
          delta: 'La risposta arriva dal turno corrente e la coda resta leggibile mentre continua lo streaming. '.repeat(18),
          _sequenza: 6006 },
      ]);
      /*
       * ⛔ 27/09/2026 — la misura aspettava DUE fotogrammi, e il renderer dello streaming ha un pavimento ADATTIVO di 33-250 ms per
       *   costruzione (`app.js:1334-1375`, da Hermes `STREAM_DELTA_FLUSH_MS`). Misurato in questo scenario: primo carattere fra 22
       *   e 67 ms (mediana 35-36, p90 57, 40 giri per braccio), UGUALE sulla build del 4174 e su quella con F6-2 — quindi la foto
       *   prendeva a volte il turno ancora vuoto («0 caratteri», 1-5 volte su 32). Si aspetta il testo, poi si misura: le
       *   asserzioni restano quelle di prima.
       */
      await page.waitForFunction(() => (document.querySelector('#conversation .is-streaming .assistant-copy')?.textContent.length || 0) > 500, null, { timeout: 5000 });
      const measure = await page.evaluate(() => {
        const scroller = document.querySelector('#schermoChat .talos-conversation');
        const copy = document.querySelector('#conversation .is-streaming .assistant-copy');
        const rect = scroller.getBoundingClientRect();
        return { width: window.innerWidth, height: window.innerHeight,
          colorMode: document.documentElement.dataset.talosResolvedColorMode,
          chars: copy?.textContent.length || 0,
          midpointError: copy ? Math.abs(copy.getBoundingClientRect().bottom - (rect.top + rect.height / 2)) : null,
          toolRows: document.querySelectorAll('#conversation .talos-tool-row').length,
          reasoningRows: document.querySelectorAll('#conversation .real-reasoning-note').length };
      });
      const screenshot = testInfo.outputPath(`p0-chat-${viewport.width}x${viewport.height}-${modo}.png`);
      await page.screenshot({ path: screenshot, fullPage: false, animations: 'disabled' });
      await testInfo.attach('browser-view-fixture', { path: screenshot, contentType: 'image/png' });
      await testInfo.attach('visual-measure-fixture', {
        body: Buffer.from(JSON.stringify({ ...measure, viewport, modo, source: 'deterministic-browser-events' })),
        contentType: 'application/json',
      });
      expect({ width: measure.width, height: measure.height }).toEqual(viewport);
      expect(measure.colorMode).toBe(modo);
      expect(measure.chars).toBeGreaterThan(500);
      expect(measure.toolRows).toBeGreaterThan(0);
      expect(measure.reasoningRows).toBeGreaterThan(0);
      expect(measure.midpointError).toBeLessThan(36);
    });
  }
}
