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
 *     TALOS_HARNESS_UI_TEST_PORT=4186 \
 *     TALOS_HARNESS_UI_PUBLIC_DIR="$PWD/dist" \
 *     npx playwright test tests/browser/scroll-p0.spec.mjs --project=chromium-desktop
 *
 *   (`TALOS_HARNESS_UI_PUBLIC_DIR` lo legge `src/config.mjs:560`; il `webServer` di
 *   `playwright.config.mjs` eredita `process.env`, quindi la variabile arriva. La 4186 invece della
 *   4176 perché il 16/09 cinque corsie lavoravano insieme e la 4176 era occupata a intermittenza.)
 */

const QUI = dirname(fileURLToPath(import.meta.url));
const FOTO = resolve(QUI, '..', '..', 'artifacts', 'p0-C');

test.use({ channel: 'chrome' });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/sessions/scroll-p0-*/events', (route) => route.fulfill({ contentType: 'text/event-stream', body: '' }));
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
    window.__talosHarnessUiRuntime.passaASessione(`scroll-p0-${id}`, 'workspace', 'Prova dello scorrimento', 'local:prova', { conclusa: false, modello: 'local:prova' });
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
      scorrevoli: [...document.querySelectorAll('#schermoChat .talos-conversation')].length,
      colonnaScorre: colonna.scrollHeight > colonna.clientHeight + 1,
    };
  });
  expect(stato.ancora).toBe('auto');
  expect(stato.scorrevoli).toBe(1);
  expect(stato.colonnaScorre, 'la colonna non deve scorrere: chi scorre è il contenitore').toBe(false);
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
