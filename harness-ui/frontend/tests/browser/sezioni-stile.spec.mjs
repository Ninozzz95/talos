/*
 * SEZIONI-STILE — «Memoria», «Costi», «Strumenti» col vestito del mockup Calm Lab.
 *
 * ⛔ COSA PROVA QUESTA SPEC, E COSA NON PUÒ PROVARE.
 * Prova DUE cose, sui tre pannelli veri delle Impostazioni:
 *   1. le MISURE del mockup `TALOS-Calm-Lab-04.html` sono applicate davvero (lette dal DOM
 *      vivo con `getComputedStyle`, non dal foglio), e
 *   2. il CONTENUTO VERO è ancora quello: le stesse voci, gli stessi id, gli stessi numeri,
 *      le stesse rotte — cioè il foglio non ha toccato niente tranne il vestito.
 *
 * ⛔ `page.addStyleTag({ path: ... })` E IL PERCHÉ, CHE VA DETTO.
 * Il server dei test serve `harness-ui/public/`, il pacchetto COSTRUITO, e `public/styles.css`
 * NON contiene ancora `sezioni-stile.css` (verificato il 18/09/2026: `grep -c '#costiRiepilogo'
 * public/styles.css` → 0). Questa lane non ha il permesso di ricostruire (`npm run build` è
 * vietato dal brief) ⇒ il foglio si INIETTA dalla sorgente vera, che è la stessa cosa che
 * misurare il file: la spec legge `src/styles/sezioni-stile.css` e lo applica.
 *   ⇒ Al PRIMO `npm run build` l'iniezione diventa ridondante e si può togliere; la prova
 *     `SEZIONI-STILE-06` verifica intanto l'AGGANCIO (l'`@import` in `main.css` nell'ordine
 *     giusto), così il pezzo che l'iniezione non copre resta comunque coperto.
 *
 * ⛔ NIENTE SCRITTURE, DA NESSUNA PARTE. La pagina intercetta OGNI richiesta con `page.route` e
 * ABORTA quelle che non siano GET/HEAD/OPTIONS, tenendone l'elenco: la spec gira sul server
 * ISOLATO di `playwright.config.mjs`
 * (porta 4176, store vuoto in una cartella temporanea), ma la stessa spec lanciata con
 * `TALOS_HARNESS_UI_BASE_URL` addosso al 4174 dell'owner non scriverebbe comunque niente. Ogni
 * test chiude con `expect(tentateNonGET).toEqual([])`: è la prova che nessuna rotta è cambiata
 * E la protezione del server vivo, nella stessa riga.
 *
 * ⛔ IL VERSO CONTRARIO (SEZIONI-STILE-04): gli id e il contenuto si fottono PRIMA e DOPO aver
 * applicato il foglio, e devono essere IDENTICI. L'elenco vuoto non conta come prova: si
 * pretende che contenga gli id noti, così l'uguaglianza non è vacua.
 *
 * ⛔ LA PROVA CHE MORDE: si toglie una riga di `sezioni-stile.css` e questa spec diventa ROSSA.
 * Provato il 18/09/2026 e riportato nel resoconto (non dichiarato).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const FOGLIO_SEZIONI = fileURLToPath(new URL('../../src/styles/sezioni-stile.css', import.meta.url));
const FOGLIO_MAIN = fileURLToPath(new URL('../../src/styles/main.css', import.meta.url));
const CHIAVE_IMPOSTAZIONI = 'talos.harness.desktop.settings.v1';

/** Il minimo che serve perché la app parta in italiano e col tema che diciamo noi. */
const impostazioni = (colorMode) => ({
  version: 1,
  appearance: { uiLanguage: 'it', colorMode },
  chat: {},
  workspaces: {},
});

/**
 * ⛔ Ogni richiesta non-GET viene ABORTITA e registrata. `tentate` è mutato dalla closure nel
 * processo Node: sopravvive alla pagina ed è quello che ogni test asserisce vuoto.
 */
async function bloccaNonGET(page, tentate) {
  await page.route('**/*', (route) => {
    const metodo = route.request().method();
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return route.continue();
    tentate.push(`${metodo} ${route.request().url()}`);
    return route.abort();
  });
}

/** Una risposta finta per una rotta, con la stessa guardia del bloccante (una POST non passa). */
async function fixture(page, modello, corpo, tentate) {
  await page.route(modello, (route) => {
    const metodo = route.request().method();
    if (metodo !== 'GET' && metodo !== 'HEAD') {
      tentate.push(`${metodo} ${route.request().url()}`);
      return route.abort();
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(corpo),
    });
  });
}

const busta = (data) => ({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });

/**
 * Apre le Impostazioni su una sezione, con la lingua dichiarata (senza, la app parte in inglese)
 * e il tasto di scrittura SPENTO: `persist:false` è obbligatorio, col default la sonda
 * scriverebbe in `localStorage`.
 */
async function apriSezione(page, sezione) {
  await page.evaluate((s) => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.(s, { persist: false });
  }, sezione);
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
}

/**
 * Accende la app e apre le Impostazioni pronte per una sezione.
 * @returns {Promise<string[]>} l'elenco (mutabile) delle richieste non-GET tentate dalla pagina
 */
async function avvia(page, { rotte = {}, colorMode = 'dark', conFoglio = true } = {}) {
  const tentate = [];
  await bloccaNonGET(page, tentate);
  for (const [modello, corpo] of Object.entries(rotte)) await fixture(page, modello, corpo, tentate);
  await page.addInitScript((dati) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify(dati));
  }, impostazioni(colorMode));
  await page.goto('/');
  if (conFoglio) await page.addStyleTag({ path: FOGLIO_SEZIONI });
  await expect(page.locator('.talos-sidebar [data-vaia="impostazioni"]')).toBeVisible({ timeout: 15_000 });
  return tentate;
}

/** Il colore RISOLTO di un token di design: si legge la variabile e la si fa dipingere. */
async function coloreToken(page, token, proprieta = 'color') {
  return page.evaluate(({ t, proprieta }) => {
    const grezzo = getComputedStyle(document.documentElement).getPropertyValue(t).trim();
    const sonda = document.createElement('div');
    sonda.style[proprieta] = grezzo;
    document.body.appendChild(sonda);
    const colore = getComputedStyle(sonda)[proprieta];
    sonda.remove();
    return colore;
  }, { t: token, proprieta });
}

/** `getComputedStyle` su un selettore, ridotto ai campi che interessano. */
async function stili(page, selettore, campi) {
  return page.evaluate(({ sel, campi }) => {
    const e = document.querySelector(sel);
    if (!e) return { mancante: true };
    const cs = getComputedStyle(e);
    const out = {};
    for (const c of campi) out[c] = cs[c];
    return out;
  }, { sel: selettore, campi });
}

/**
 * Il contrasto del testo sul suo fondo VERO.
 *
 * ⛔ LA PRIMA STESURA DI QUESTA FUNZIONE ERA UNA MISURA NON VALIDA, e si è vista subito: leggeva
 * il primo fondo con `alpha > 0` e buttava via l'alpha, quindi su una pastiglia dal fondo
 * traslucido (`--talos-accent-soft` è un `rgba`) confrontava il colore del testo CON SÉ STESSO e
 * stampava «rapporto 1». Un rapporto che non può che valere 1 non sta misurando niente.
 * ⛔ E la SECONDA stesura è stata sbagliata allo stesso modo, in un punto più fine: leggeva i
 * numeri con `match(/[\d.]+/g)` dandoli per 0-255, ma in questo progetto l'accento è un
 * `color-mix(...)` e Chromium lo serializza come `color(srgb 0.846824 0.717961 0.525882)`, dove i
 * canali sono FRAZIONI 0-1. Arrotondati a interi diventavano tutti 1 ⇒ «rgb(1, 1, 1) su
 * rgb(32, 33, 36), rapporto 1,3», cioè una pastiglia illeggibile che a schermo non esiste.
 * ⇒ Il colore si legge con una TELA 1×1 e si guarda il PIXEL: qualunque sintassi CSS ci si versi
 *   dentro (rgb, rgba, `color(srgb …)`, `oklch`) ne esce la terna sRGB vera più l'alpha, senza
 *   interpretare stringhe. Ricerca 18/09/2026: CSS Color 5 (W3C, csswg-drafts) — «il valore
 *   calcolato di `color-mix()` è il colore mescolato», e per lo spazio `srgb` la serializzazione
 *   prevista è `color(srgb r g b)`; i WPT «Color-mix for canvas 2d» mostrano che `fillStyle`
 *   normalizza nella STESSA forma, quindi è il PIXEL — non la stringa — a dare i canali 0-255.
 *   ⛔ E la misura ha una RISOLUZIONE dichiarata: la tela memorizza i colori premoltiplicati,
 *   quindi su un alpha basso (qui 0,14) il canale riletto può sbagliare di 1-2 su 255 — non
 *   sposta una soglia di 4,5:1, ma non è una misura esatta e non si racconta come tale.
 * Qui l'alpha si compone davvero, dal fondo dell'elemento fino alla radice (`over`), e se la
 * catena non chiude su un colore opaco lo si DICHIARA (`opaco:false`) invece di inventare un
 * fondo di comodo. Formula: WCAG 2.1 / Technique G18 `(L1+0,05)/(L2+0,05)`, letta il 18/09/2026.
 */
async function contrasto(page, selettore) {
  return page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e) return { mancante: true };
    /* La tela è il LETTORE DEI COLORI: nessuna stringa interpretata a mano. */
    const tela = document.createElement('canvas');
    tela.width = 1; tela.height = 1;
    const pennello = tela.getContext('2d', { willReadFrequently: true });
    const rgb = (css) => {
      // una sintassi che il motore non capisce non si indovina: si dichiara illeggibile
      if (!CSS.supports('color', css)) return null;
      pennello.clearRect(0, 0, 1, 1);
      pennello.fillStyle = css;
      pennello.fillRect(0, 0, 1, 1);
      const d = pennello.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    };
    const over = (s, d) => ({
      r: s.r * s.a + d.r * (1 - s.a),
      g: s.g * s.a + d.g * (1 - s.a),
      b: s.b * s.a + d.b * (1 - s.a),
      a: s.a + d.a * (1 - s.a),
    });
    const lum = ({ r, g, b }) => {
      const f = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const catena = [];
    let nodo = e;
    while (nodo) {
      const c = rgb(getComputedStyle(nodo).backgroundColor);
      if (c == null) return { illeggibile: getComputedStyle(nodo).backgroundColor };
      if (c.a > 0) catena.push(c);
      nodo = nodo.parentElement;
    }
    let fondo = catena.length ? catena[catena.length - 1] : { r: 255, g: 255, b: 255, a: 1 };
    for (let i = catena.length - 2; i >= 0; i--) fondo = over(catena[i], fondo);
    const t = rgb(getComputedStyle(e).color);
    if (t == null) return { illeggibile: getComputedStyle(e).color };
    const testo = t.a < 1 ? over(t, fondo) : t;
    const nome = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
    const l1 = lum(testo);
    const l2 = lum(fondo);
    return {
      testo: nome(testo),
      fondo: nome(fondo),
      opaco: fondo.a >= 1 && testo.a >= 1,
      strati: catena.length,
      rapporto: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100,
    };
  }, selettore);
}

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * I FIXTURE — numeri SCELTI A MANO perché ogni cifra mostrata sia ricalcolabile a mente.
 * ⛔ Non sono dati del prodotto: sono l'ingresso di una rotta, e servono a provare che il
 *    contenuto VERO attraversa il componente fino a schermo, non che i dati esistano.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

/** `/api/v1/tools` — 4.321 + 2.111 = 6.432 token di schema. */
const ATTREZZI = busta({
  attrezzi: [
    { nome: 'leggi_file', categoria: 'file', tokenSchemaStimati: 4321 },
    { nome: 'cerca_web', categoria: 'rete', tokenSchemaStimati: 2111 },
    { nome: 'attrezzo_senza_stima', categoria: 'altro' },
  ],
});

/**
 * `/api/v1/sessions` — tre sessioni, due oggi e una ieri.
 *   A: 1.000 + 500 = 1.500 token · 2 giri · 200 in cache
 *   B: 2.000 + 1.000 = 3.000 token · 1 giro + 2 fermati = 3 · 0 in cache
 *   C: 4.000 + 0 = 4.000 token · 1 giro · 800 in cache
 * Totali: 3 sessioni · 6 giri · 8.500 token («8,5 k») · 1.000 in cache («1 k») · 2 giri fermati.
 * Per giorno (dal più recente): oggi 2 · 5 · «4,5 k» · 200 — ieri 1 · 1 · «4 k» · 800.
 * Per modello (per token, dal più pesante): prova-uno 2 · 5 · «4,5 k» · 200 — prova-due 1 · 1 · «4 k» · 800.
 */
function sessioni() {
  const ieri = new Date(); ieri.setDate(ieri.getDate() - 1);
  const base = { taskId: 'T-1', nome: 'prova', conclusa: false, provider: 'prova' };
  return busta({
    items: [
      { ...base, sessionId: 'SEZIONI-A', modello: 'prova-uno', avviataAlle: new Date().toISOString(), usageSessione: { prompt_tokens: 1000, completion_tokens: 500, cached_tokens: 200, giri: 2 } },
      { ...base, sessionId: 'SEZIONI-B', modello: 'prova-uno', avviataAlle: new Date().toISOString(), giriFermati: 2, usageSessione: { prompt_tokens: 2000, completion_tokens: 1000, cached_tokens: 0, giri: 1 } },
      { ...base, sessionId: 'SEZIONI-C', modello: 'prova-due', avviataAlle: ieri.toISOString(), usageSessione: { prompt_tokens: 4000, completion_tokens: 0, cached_tokens: 800, giri: 1 } },
    ],
  });
}

/** `/api/v1/search-source` — cinque fonti. Con `duckduckgo` «pronta» non ci sono chiavi né indirizzi da chiedere. */
const FONTI_RICERCA = busta({
  source: 'duckduckgo',
  endpoint: '',
  readiness: 'pronta',
  fonti: [
    { id: 'duckduckgo', label: 'DuckDuckGo', needsKey: false, needsEndpoint: false, keyless: true, keyConfigured: false },
    { id: 'tavily', label: 'Tavily', needsKey: true, needsEndpoint: false, keyless: false, keyConfigured: false },
    { id: 'brave', label: 'Brave Search', needsKey: true, needsEndpoint: false, keyless: false, keyConfigured: false },
    { id: 'searxng', label: 'SearXNG', needsKey: false, needsEndpoint: true, keyless: false, keyConfigured: false },
    { id: 'custom', label: 'Servizio personale', needsKey: false, needsEndpoint: true, keyless: false, keyConfigured: false },
  ],
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 01 — MEMORIA: la riga del mockup, e la ripartizione vera.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */
test('SEZIONI-STILE-01 · Memoria — la riga ha le misure di .setting-row e le voci sono quelle vere', async ({ page }) => {
  const tentate = await avvia(page, { rotte: { '**/api/v1/tools': ATTREZZI } });
  await apriSezione(page, 'memoria');
  await expect(page.locator('#contestoVoci .talos-contesto-voce')).toHaveCount(1);

  // ── il contenuto vero: una voce, il nome del prodotto, la somma dei token di schema
  await expect(page.locator('#contestoVoci .talos-contesto-voce__k')).toHaveText('Attrezzi');
  /*
   * ⛔ «6432», NON «6.432»: la prima stesura di questa riga pretendeva il separatore di migliaia
   * e la spec è diventata rossa — giustamente. In `it-IT` le migliaia NON si separano sui numeri
   * di quattro cifre (CLDR `minimumGroupingDigits = 2`: il raggruppamento parte da cinque cifre,
   * 64.320), e `Intl.NumberFormat('it-IT')` lo rispetta. Il numero scritto a mano nella prima
   * stesura era mio, non del prodotto: qui si asserisce ciò che il prodotto fa, e la cifra
   * 4.321 + 2.111 = 6.432 resta la prova che il totale è la somma dei due attrezzi.
   */
  await expect(page.locator('#contestoVoci .talos-contesto-voce__v')).toHaveText(/^6432 token/);
  await expect(page.locator('#contestoVoci .talos-contesto-mancanti')).toContainText('le istruzioni di sistema');
  /*
   * ⛔ LA BARRA È NASCOSTA, E NON È UN DIFETTO: è il prodotto che la nasconde quando nessun modello
   * dichiara la finestra. `src/components/contesto.js:136-138` — `senzaScala = !ripartizione ||
   * ripartizione.percentuale == null` → `barra.hidden = senzaScala` E `barra.replaceChildren()`,
   * perché «una barra senza scala mentirebbe sulla proporzione, e una barra vuota lasciata a
   * schermo sembra un grafico rotto». Qui la finestra è `null` per costruzione: nessun modello è
   * scelto nella chat, quindi `finestraContestoDelModello()` (app.js:5060) non trova il catalogo.
   * ⛔ La prima stesura di questa riga pretendeva `toBeVisible()` e la spec è diventata rossa: era
   * mio il numero, non del prodotto. ⇒ Si asserisce il VERO: la barra è nascosta e non resta a
   * schermo mezza barra disegnata.
   * (Lo stato VISIBILE della barra — le fette colorate — NON è coperto da questa spec: per
   *  raggiungerlo serve un modello scelto, e comunque `sezioni-stile.css` non tocca `.talos-contesto`
   *  né `.talos-contesto__fetta`: non è una superficie di questa corsia. Dichiarato nel resoconto.)
   */
  await expect(page.locator('#contestoRipartizione')).toBeHidden();
  await expect(page.locator('#contestoRipartizione > *')).toHaveCount(0);
  await expect(page.locator('#contestoEtichetta')).toContainText('token occupati prima che tu scriva');
  // e la frase onesta: senza finestra la percentuale NON si inventa
  await expect(page.locator('#contestoEtichetta')).toContainText('finestra del modello non dichiarata');

  // ── la sezione dentro la sezione NON è più una card: era 20px 24px + bordo + fondo (§A del foglio)
  const piatto = await stili(page, '#setting-panel-memoria #contestoVoci', ['padding', 'borderTopWidth', 'borderRadius', 'backgroundColor', 'boxShadow', 'marginTop']);
  expect(piatto.padding).toBe('0px');
  expect(piatto.borderTopWidth).toBe('0px');
  expect(piatto.borderRadius).toBe('0px');
  expect(piatto.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(piatto.boxShadow).toBe('none');
  expect(piatto.marginTop).toBe('0px');
  // e la card che la CONTIENE resta una card: non ho appiattito il contenitore
  const card = await stili(page, '#setting-panel-memoria .talos-card.talos-settings__section', ['paddingLeft', 'borderTopWidth']);
  expect(card.paddingLeft).toBe('24px');
  expect(card.borderTopWidth).toBe('1px');

  // ── la riga: le misure di .setting-row del mockup
  const riga = await stili(page, '#contestoVoci .talos-contesto-voce', ['display', 'alignItems', 'justifyContent', 'columnGap', 'paddingTop', 'paddingBottom', 'borderTopWidth']);
  expect(riga.display).toBe('flex');
  expect(riga.alignItems).toBe('center');
  expect(riga.justifyContent).toBe('space-between');
  expect(riga.columnGap).toBe('24px');
  expect(riga.paddingTop).toBe('21px');
  expect(riga.paddingBottom).toBe('21px');
  // la prima riga non porta il filetto: è la regola che il prodotto aveva già, riscritta apposta
  expect(riga.borderTopWidth).toBe('0px');

  /*
   * ⛔ Il filetto FRA due righe si misura su una riga che il componente disegnerebbe: oggi la
   *    ripartizione ha una voce sola, quindi si clona la SUA riga (markup del componente, non
   *    markup inventato dalla spec) e si legge la seconda. Senza questa riga la prova non
   *    morderebbe su `border-top`.
   */
  const filetto = await page.evaluate(() => {
    const voci = document.querySelector('#contestoVoci');
    const copia = voci.firstElementChild.cloneNode(true);
    voci.appendChild(copia);
    const larghezza = getComputedStyle(copia).borderTopWidth;
    copia.remove();
    return larghezza;
  });
  expect(filetto).toBe('1px');

  // ── la tipografia dell'etichetta (.setting-copy label) e il verso del valore
  const etichetta = await stili(page, '#contestoVoci .talos-contesto-voce__k', ['fontSize', 'fontWeight', 'lineHeight']);
  expect(etichetta.fontSize).toBe('14px');
  expect(etichetta.fontWeight).toBe('550');
  expect(etichetta.lineHeight).toBe('21px');
  const valore = await stili(page, '#contestoVoci .talos-contesto-voce__v', ['textAlign', 'color', 'fontVariantNumeric']);
  expect(valore.textAlign).toBe('right');
  expect(valore.fontVariantNumeric).toContain('tabular-nums');
  // il valore è il lato CONTROLLO: colore del testo, non quello tenue della descrizione
  expect(valore.color).toBe(await coloreToken(page, '--talos-text'));
  expect(valore.color).not.toBe(await coloreToken(page, '--talos-muted'));

  expect(tentate).toEqual([]);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 02 — COSTI: le pastiglie, le due tabelle, e i numeri veri.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */
test('SEZIONI-STILE-02 · Costi — le pastiglie del mockup e le due tabelle coi numeri ricalcolabili', async ({ page }) => {
  const tentate = await avvia(page, { rotte: { '**/api/v1/sessions': sessioni() } });
  await apriSezione(page, 'costi');
  await expect(page.locator('#costiPerGiorno tbody tr')).toHaveCount(2);
  await expect(page.locator('#costiPerModello tbody tr')).toHaveCount(2);

  // ── il riepilogo: le pastiglie dicono i totali veri, e dichiarano CHI MANCA
  await expect(page.locator('#costiRiepilogo .talos-badge')).toHaveCount(5);
  await expect(page.locator('#costiRiepilogo .talos-badge')).toHaveText([
    '3 sessioni',
    '6 giri',
    '8,5 k token',
    '1 k in cache',
    '2 giri fermati senza token',
  ]);
  await expect(page.locator('#costiRiepilogo [data-cache-sessione]')).toContainText('Riusato dalla cache · non misurato');

  // ── le due tabelle: righe per giorno (dal più recente) e per modello (dal più pesante)
  await expect(page.locator('#costiPerGiorno tbody tr').nth(0).locator('th')).toHaveText('oggi');
  await expect(page.locator('#costiPerGiorno tbody tr').nth(0).locator('td')).toHaveText(['2', '5', '4,5 k', '200']);
  await expect(page.locator('#costiPerGiorno tbody tr').nth(1).locator('th')).toHaveText('ieri');
  await expect(page.locator('#costiPerGiorno tbody tr').nth(1).locator('td')).toHaveText(['1', '1', '4 k', '800']);
  await expect(page.locator('#costiPerModello tbody tr').nth(0).locator('th')).toHaveText('prova-uno');
  await expect(page.locator('#costiPerModello tbody tr').nth(0).locator('td')).toHaveText(['2', '5', '4,5 k', '200']);
  await expect(page.locator('#costiPerModello tbody tr').nth(1).locator('th')).toHaveText('prova-due');
  await expect(page.locator('#costiPerModello tbody tr').nth(1).locator('td')).toHaveText(['1', '1', '4 k', '800']);

  // ── le pastiglie: la geometria di .badge
  /*
   * ⛔ `display` NON si asserisce come `inline-flex`, e non è una resa: misurato il 18/09/2026,
   * il valore calcolato è `flex`. `#costiRiepilogo` è un contenitore flex, e un figlio di un
   * contenitore flex viene «blockificato»: `inline-flex` diventa `flex` (CSS Display §2.7). La
   * mia regola È applicata — si vede dal resto: `padding:4px 7px` contro lo `0 8px` del sistema
   * di design, raggio 5px contro la pillola, `gap:5px` contro il token. Quelle tre non possono
   * venire da nessun altro foglio, e sono la prova.
   */
  const pillola = await stili(page, '#costiRiepilogo .talos-badge', ['display', 'alignItems', 'columnGap', 'padding', 'borderRadius', 'fontSize', 'fontWeight', 'lineHeight', 'whiteSpace']);
  expect(['flex', 'inline-flex']).toContain(pillola.display); // blockificato dal contenitore flex
  expect(pillola.alignItems).toBe('center');
  expect(pillola.columnGap).toBe('5px');
  expect(pillola.padding).toBe('4px 7px');
  expect(pillola.borderRadius).toBe('5px');
  expect(pillola.fontSize).toBe('11px');
  expect(pillola.fontWeight).toBe('500');
  expect(pillola.whiteSpace).toBe('nowrap');
  /*
   * ⛔ L'ALTEZZA È 25, NON 23 — e i 23 erano miei: la prima stesura li aveva dedotti dal solo
   * `padding:4px 7px` + `line-height:1.4` di 11px (= 15,4), dimenticando il bordo di 1px per lato
   * che la pastiglia porta dal sistema di design (`.talos-badge{border:1px solid …}`,
   * `src/design-system/controls.css:23`). Il conto vero: 15,4 + 8 + 2 = 25,4 → 25.
   * `min-height` non c'entra: `--sm` ne chiede 22 e la scatola è già più alta.
   */
  const alto = await page.evaluate(() => Math.round(document.querySelector('#costiRiepilogo .talos-badge').getBoundingClientRect().height));
  expect(alto).toBe(25);

  // ── le intestazioni di gruppo: .section-heading
  const testata1 = await stili(page, '#costiPerGiorno', ['fontSize']);
  expect(testata1.fontSize).toBe('12px');
  const titolo1 = await page.evaluate(() => {
    const h = document.querySelectorAll('#setting-panel-costi .talos-lab__heading')[0];
    const cs = getComputedStyle(h);
    return { display: cs.display, columnGap: cs.columnGap, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, marginBlockStart: cs.marginBlockStart, marginBlockEnd: cs.marginBlockEnd, testo: h.textContent };
  });
  expect(titolo1.testo).toBe('Per giorno');
  expect(titolo1.display).toBe('flex');
  expect(titolo1.columnGap).toBe('10px');
  expect(titolo1.fontSize).toBe('18px');
  expect(titolo1.fontWeight).toBe('600');
  expect(titolo1.lineHeight).toBe('27px');
  expect(titolo1.letterSpacing).toBe('-0.45px');
  expect(titolo1.marginBlockStart).toBe('0px');
  expect(titolo1.marginBlockEnd).toBe('8px');
  const titolo2 = await page.evaluate(() => getComputedStyle(document.querySelectorAll('#setting-panel-costi .talos-lab__heading')[1]).marginBlockStart);
  expect(titolo2).toBe('36px'); // il ritmo fra i blocchi: .settings-layout{gap:36px}

  // ── le celle: .comparison-table
  const celle = await stili(page, '#costiPerGiorno tbody td', ['padding', 'borderBottomWidth', 'borderBottomStyle', 'verticalAlign', 'textAlign']);
  expect(celle.padding).toBe('14px 9px');
  expect(celle.borderBottomWidth).toBe('1px');
  expect(celle.borderBottomStyle).toBe('solid');
  expect(celle.verticalAlign).toBe('top');
  expect(celle.textAlign).toBe('right');

  // ── le intestazioni di colonna: 12px, peso 500, tenui, NON maiuscole, cifre a destra
  const th = await stili(page, '#costiPerGiorno thead th', ['padding', 'fontSize', 'fontWeight', 'textTransform', 'letterSpacing', 'textAlign', 'backgroundColor']);
  expect(th.padding).toBe('14px 9px');
  expect(th.fontSize).toBe('12px');
  expect(th.fontWeight).toBe('500');
  expect(th.textTransform).toBe('none');
  expect(th.letterSpacing).toBe('normal');
  expect(th.textAlign).toBe('left'); // la prima colonna NOMINA la riga e resta a sinistra
  expect(th.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  const thNumero = await stili(page, '#costiPerGiorno thead th:nth-child(2)', ['textAlign']);
  expect(thNumero.textAlign).toBe('right'); // le quattro di numeri seguono i loro dati
  const thTenue = await stili(page, '#costiPerGiorno thead th', ['color']);
  expect(thTenue.color).toBe(await coloreToken(page, '--talos-muted'));

  // ── la cella che nomina la riga NON è un'intestazione di colonna
  const rigaTh = await stili(page, '#costiPerGiorno tbody th', ['fontSize', 'fontWeight', 'lineHeight', 'textTransform', 'letterSpacing', 'color']);
  expect(rigaTh.fontSize).toBe('14px');
  expect(rigaTh.fontWeight).toBe('550');
  expect(rigaTh.lineHeight).toBe('21px');
  expect(rigaTh.textTransform).toBe('none');
  expect(rigaTh.letterSpacing).toBe('normal');
  expect(rigaTh.color).toBe(await coloreToken(page, '--talos-text'));

  expect(tentate).toEqual([]);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 03 — STRUMENTI: il modulo di ricerca piatto, coi campi veri.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */
test('SEZIONI-STILE-03 · Strumenti — il modulo della ricerca è una riga piatta, coi suoi campi veri', async ({ page }) => {
  const tentate = await avvia(page, { rotte: { '**/api/v1/search-source': FONTI_RICERCA } });
  await apriSezione(page, 'tools');
  await expect(page.locator('#fonte-query')).toBeVisible();

  // ── il contenuto vero: le sei scelte (cinque fonti + «Nessuna»), il campo della prova, i pulsanti
  await expect(page.locator('[data-search-source]')).toHaveCount(6);
  await expect(page.locator('#fonte-label-duckduckgo')).toHaveText('DuckDuckGo');
  await expect(page.locator('[data-search-source="duckduckgo"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-search-readiness]')).toContainText('Configurazione pronta');
  await expect(page.locator('#fonte-query')).toBeEnabled();
  await expect(page.locator('[data-search-action="test"]')).toBeEnabled();
  await expect(page.locator('[data-search-action="reload"]')).toBeEnabled();

  // ── il blocco del modulo NON è più una card dentro la card (§A)
  const piatto = await stili(page, '[data-search-details]', ['padding', 'borderTopWidth', 'borderRadius', 'backgroundColor', 'boxShadow']);
  expect(piatto.padding).toBe('0px');
  expect(piatto.borderTopWidth).toBe('0px');
  expect(piatto.borderRadius).toBe('0px');
  expect(piatto.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(piatto.boxShadow).toBe('none');
  // ⛔ il pannello del RISULTATO no: quello deve staccarsi, e resta una card (scelta dichiarata)
  const risultato = await stili(page, '[data-search-result]', ['paddingTop', 'borderTopWidth']);
  expect(risultato.paddingTop).toBe('20px');
  expect(risultato.borderTopWidth).toBe('1px');
  // e la card della SEZIONE resta una card
  const cardSezione = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#setting-panel-tools .talos-card.talos-settings__section')].find((e) => e.querySelector('h3'));
    const cs = getComputedStyle(card);
    return { paddingLeft: cs.paddingLeft, borderTopWidth: cs.borderTopWidth };
  });
  expect(cardSezione.paddingLeft).toBe('24px');
  expect(cardSezione.borderTopWidth).toBe('1px');

  // ── il campo: la riga di .setting-row (spaziatura e tipografia, non l'asse)
  const campo = await stili(page, '[data-search-details] > .talos-field', ['marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'borderTopWidth', 'borderTopStyle']);
  expect(campo.marginTop).toBe('0px');
  expect(campo.marginBottom).toBe('0px');
  expect(campo.paddingTop).toBe('21px');
  expect(campo.paddingBottom).toBe('21px');
  expect(campo.borderTopWidth).toBe('1px');
  expect(campo.borderTopStyle).toBe('solid');
  const etichetta = await stili(page, '[data-search-details] .talos-setting__label', ['fontSize', 'fontWeight', 'lineHeight']);
  expect(etichetta.fontSize).toBe('14px');
  expect(etichetta.fontWeight).toBe('550');
  expect(etichetta.lineHeight).toBe('21px');
  // i pulsanti prendono la metà bassa dello stesso ritmo
  const azioni = await stili(page, '[data-search-details] > .talos-settings__actions', ['paddingTop', 'paddingBottom']);
  expect(azioni.paddingTop).toBe('0px');
  expect(azioni.paddingBottom).toBe('21px');

  expect(tentate).toEqual([]);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 04 — IL VERSO CONTRARIO: id, classi, attributi e testo non cambiano quando entra il foglio.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */
test('SEZIONI-STILE-04 · Il verso contrario — id, classi, attributi e testo identici prima e dopo il foglio', async ({ page }) => {
  // ⛔ SENZA il foglio: questa pagina serve a fotografare lo stato di partenza.
  const tentate = await avvia(page, {
    rotte: { '**/api/v1/tools': ATTREZZI, '**/api/v1/sessions': sessioni(), '**/api/v1/search-source': FONTI_RICERCA },
    conFoglio: false,
  });
  await apriSezione(page, 'memoria');
  await expect(page.locator('#contestoVoci .talos-contesto-voce')).toHaveCount(1);
  await apriSezione(page, 'costi');
  await expect(page.locator('#costiPerGiorno tbody tr')).toHaveCount(2);
  await apriSezione(page, 'tools');
  await expect(page.locator('#fonte-query')).toBeVisible();

  const firma = () => page.evaluate(() => {
    const leggi = (pannello) => {
      const nodo = document.querySelector(`#setting-panel-${pannello}`);
      if (!nodo) return null;
      return {
        id: [...nodo.querySelectorAll('[id]')].map((e) => e.id).sort(),
        classi: [...new Set([...nodo.querySelectorAll('[class]')].flatMap((e) => [...e.classList]))].sort(),
        attributi: [...new Set([...nodo.querySelectorAll('*')].flatMap((e) => [...e.attributes].map((a) => a.name)))].sort(),
        azioni: [...nodo.querySelectorAll('[data-search-action]')].map((e) => e.dataset.searchAction).sort(),
        testo: nodo.textContent.replace(/\s+/g, ' ').trim(),
        rotte: [...nodo.querySelectorAll('[data-vaia],[data-open-sheet],[data-settings-reuse]')].map((e) => `${e.dataset.vaia || e.dataset.openSheet || e.dataset.settingsReuse}`).sort(),
      };
    };
    return { memoria: leggi('memoria'), costi: leggi('costi'), tools: leggi('tools') };
  });

  const prima = await firma();
  // ⛔ l'elenco vuoto non è una prova: si pretende che ci siano gli id noti, o l'uguaglianza sarebbe vacua
  expect(prima.memoria.id).toEqual(expect.arrayContaining(['contestoRipartizione', 'contestoEtichetta', 'contestoVoci']));
  expect(prima.costi.id).toEqual(expect.arrayContaining(['costiRiepilogo', 'costiPerGiorno', 'costiPerModello', 'costiNota']));
  expect(prima.tools.id).toEqual(expect.arrayContaining(['setting-source-preview', 'fonte-query']));
  expect(prima.memoria.testo).toContain('Attrezzi');
  expect(prima.costi.testo).toContain('8,5 k token');
  expect(prima.tools.testo).toContain('DuckDuckGo');

  // ADESSO entra il foglio, e niente altro.
  await page.addStyleTag({ path: FOGLIO_SEZIONI });
  const dopo = await firma();

  expect(dopo.memoria.id).toEqual(prima.memoria.id);
  expect(dopo.costi.id).toEqual(prima.costi.id);
  expect(dopo.tools.id).toEqual(prima.tools.id);
  expect(dopo.memoria.classi).toEqual(prima.memoria.classi);
  expect(dopo.costi.classi).toEqual(prima.costi.classi);
  expect(dopo.tools.classi).toEqual(prima.tools.classi);
  expect(dopo.memoria.attributi).toEqual(prima.memoria.attributi);
  expect(dopo.costi.attributi).toEqual(prima.costi.attributi);
  expect(dopo.tools.attributi).toEqual(prima.tools.attributi);
  expect(dopo.memoria.testo).toBe(prima.memoria.testo);
  expect(dopo.costi.testo).toBe(prima.costi.testo);
  expect(dopo.tools.testo).toBe(prima.tools.testo);
  expect(dopo.memoria.rotte).toEqual(prima.memoria.rotte);
  expect(dopo.costi.rotte).toEqual(prima.costi.rotte);
  expect(dopo.tools.rotte).toEqual(prima.tools.rotte);
  expect(dopo.tools.azioni).toEqual(['reload', 'test']); // le due azioni della ricerca, invariate

  expect(tentate).toEqual([]);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 05 — I DUE TEMI: la stessa misura in chiaro e in scuro, e il contrasto rimisurato.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */
test('SEZIONI-STILE-05 · I due temi — misure identiche, colori dai token, contrasto ≥ 4,5 nei due', async ({ page }) => {
  const misure = {};
  for (const colorMode of ['dark', 'light']) {
    const tentate = await avvia(page, { rotte: { '**/api/v1/sessions': sessioni() }, colorMode });
    await apriSezione(page, 'costi');
    await expect(page.locator('#costiPerGiorno tbody tr')).toHaveCount(2);

    // ⛔ il tema è CAMBIATO davvero: senza questa riga, due misure uguali potrebbero venire da due giri entrambi scuri
    const temaAttivo = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(temaAttivo).toBe(colorMode === 'light' ? 'light' : null);

    misure[colorMode] = {
      pillola: await stili(page, '#costiRiepilogo .talos-badge', ['padding', 'borderRadius', 'fontSize', 'color', 'backgroundColor']),
      th: await stili(page, '#costiPerGiorno thead th', ['fontSize', 'fontWeight', 'color']),
      riga: await stili(page, '#costiPerGiorno tbody th', ['fontSize', 'fontWeight', 'color']),
      contrastoTh: await contrasto(page, '#costiPerGiorno thead th'),
      contrastoRiga: await contrasto(page, '#costiPerGiorno tbody th'),
      contrastoPillola: await contrasto(page, '#costiRiepilogo .talos-badge'),
      muted: await coloreToken(page, '--talos-muted'),
      tokenTestoPillola: await coloreToken(page, '--talos-accent-text'),
      tokenFondoPillola: await coloreToken(page, '--talos-accent-soft', 'backgroundColor'),
    };
    expect(tentate).toEqual([]);
  }

  const { dark, light } = misure;
  // geometria: la stessa nei due temi (le misure non dipendono dal tema)
  for (const tema of [dark, light]) {
    expect(tema.pillola.padding).toBe('4px 7px');
    expect(tema.pillola.borderRadius).toBe('5px');
    expect(tema.pillola.fontSize).toBe('11px');
    expect(tema.th.fontSize).toBe('12px');
    expect(tema.th.fontWeight).toBe('500');
    expect(tema.riga.fontSize).toBe('14px');
    expect(tema.riga.fontWeight).toBe('550');
  }
  // colore: i due temi hanno token diversi, quindi colori diversi — ed è la prova che ho girato su entrambi
  expect(dark.th.color).not.toBe(light.th.color);
  expect(dark.riga.color).not.toBe(light.riga.color);
  expect(dark.muted).not.toBe(light.muted);
  /*
   * ⛔ IL COLORE DELLA PASTIGLIA NON È MIO, ED È UNA PROVA — non una scusa.
   * `sezioni-stile.css` non tocca `color` né `background` delle pastiglie: tocca padding, raggio,
   * gap, corpo e altezza minima. Quindi il colore deve essere ESATTAMENTE il token del sistema di
   * design, e questa riga lo verifica: se domani qualcuno ci mettesse un colore a mano, qui
   * diventerebbe rosso. (L'altra metà della prova è in 06: nessun colore letterale nel mio foglio.)
   */
  for (const [tema, m] of Object.entries(misure)) {
    expect(m.pillola.color, `pastiglia, tema ${tema}: il colore non è più il token --talos-accent-text`).toBe(m.tokenTestoPillola);
    expect(m.pillola.backgroundColor, `pastiglia, tema ${tema}: il fondo non è più il token --talos-accent-soft`).toBe(m.tokenFondoPillola);
  }
  // contrasto: 4,5:1 è il minimo di WCAG 2.1 SC 1.4.3 per un testo di 12px (Technique G18)
  for (const [tema, m] of Object.entries(misure)) {
    // la catena dei fondi chiude su un colore opaco: senza questo, il rapporto qui sotto sarebbe un numero inventato
    expect(m.contrastoTh.opaco, `contrasto ${tema}: la catena dei fondi non chiude su un colore opaco`).toBe(true);
    expect(m.contrastoRiga.opaco, `contrasto ${tema}`).toBe(true);
    expect(m.contrastoPillola.opaco, `contrasto ${tema}`).toBe(true);
    expect(m.contrastoTh.rapporto, `intestazione di colonna, tema ${tema}: ${m.contrastoTh.testo} su ${m.contrastoTh.fondo}`).toBeGreaterThanOrEqual(4.5);
    expect(m.contrastoRiga.rapporto, `cella che nomina la riga, tema ${tema}: ${m.contrastoRiga.testo} su ${m.contrastoRiga.fondo}`).toBeGreaterThanOrEqual(4.5);
    expect(m.contrastoPillola.rapporto, `pastiglia, tema ${tema}: ${m.contrastoPillola.testo} su ${m.contrastoPillola.fondo}`).toBeGreaterThanOrEqual(4.5);
  }
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 06 — L'AGGANCIO, E LE DUE REGOLE CHE TENGONO IN PIEDI I DUE TEMI.
 * ⛔ Questa prova legge i FOGLI SUL DISCO: è la parte che l'iniezione non copre.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */
test("SEZIONI-STILE-06 · Il foglio è agganciato in main.css, e non porta colori fissi né !important", async () => {
  const main = readFileSync(FOGLIO_MAIN, 'utf8');
  const indice = (testo, ago) => {
    const i = testo.indexOf(ago);
    expect(i, `manca «${ago}»`).toBeGreaterThan(-1);
    return i;
  };
  // l'aggancio, e il suo POSTO: dopo `settings.css`, che è quello che annulla
  indice(main, "@import './sezioni-stile.css';");
  expect(indice(main, "@import './sezioni-stile.css';")).toBeGreaterThan(indice(main, "@import '../design-system/settings.css';"));

  const foglio = readFileSync(FOGLIO_SEZIONI, 'utf8');
  // ⛔ si giudica il codice, non i commenti: la testa del foglio cita `padding:20px 24px` e i colori
  const codice = foglio.replace(/\/\*[\s\S]*?\*\//g, '');
  expect(codice.length, 'il foglio è vuoto o è fatto solo di commenti').toBeGreaterThan(500);
  expect(codice, 'un `!important` in questo foglio: si vince per specificità').not.toContain('!important');
  const coloreScrittoAMano = codice.match(/(?:^|[\s;{])(?:color|background|background-color|border(?:-top|-bottom|-left|-right)?-color|outline-color|box-shadow)\s*:\s*[^;{}]*#[0-9a-fA-F]{3,8}/g);
  expect(coloreScrittoAMano, `colori fissi, che rompono uno dei due temi: ${coloreScrittoAMano}`).toBeNull();
  // ogni regola sta dentro il pannello di competenza e dentro la schermata delle impostazioni
  const selettori = codice.match(/^[^@{}\n][^{}\n]*\{/gm) || [];
  expect(selettori.length).toBeGreaterThan(8);
  const fuoriPosto = selettori.filter((s) => !(s.includes('#schermoImpostazioni[data-settings-ui="v3"]') && /#setting-panel-(memoria|costi|tools)/.test(s)));
  expect(fuoriPosto, 'regole che escono dai tre pannelli').toEqual([]);
});
