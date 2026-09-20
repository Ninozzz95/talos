import { expect, test } from '@playwright/test';

/*
 * BLOCCO 1 — LE FOTO DEL 4174, coi numeri presi dall'ambiente VERO.
 *
 * Owner 18/09/2026: «ultima regola durante il processo di verifica è OBBLIGATORIO verificare
 * VISIVAMENTE usando screenshot dell'ambiente 4174». Qui il 4174 è il server vivo dell'owner, e
 * queste prove lo guardano e basta.
 *
 * ⛔ LA GUARDIA: sul 4174 passa SOLO `GET`/`HEAD`. Ogni altra richiesta viene FERMATA e CONTATA —
 *   è la regola di sempre («si legge e si fotografa, mai una scrittura»), e la sonda la fa
 *   rispettare da sé invece di affidarsi alla disciplina di chi guarda. Il conteggio si stampa a
 *   fine corsa: se è diverso da zero, il numero dice quali richieste sono state fermate.
 * ⛔ Questa sonda vale SOLO contro un ambiente esterno: si lancia col baseURL dell'owner, e NON
 *   parte nessun server nostro. Senza quella variabile si salta da sola, così non entra nella
 *   suite normale dove le premesse (40 sessioni, la sua finestra) non esistono.
 *     TALOS_HARNESS_UI_BASE_URL=http://127.0.0.1:4174/ npx playwright test <questo file>
 */

test.skip(!process.env.TALOS_HARNESS_UI_BASE_URL, 'sonda dell’ambiente esterno: si lancia col baseURL dell’owner');

test.use({ locale: 'it-IT' });

/** Le richieste non-GET fermate, in ordine. Vuoto è il risultato che ci si aspetta. */
const FERMATE = [];

/* Il pezzo da togliere per rifare il «prima». Nella risposta vera è unico: `margin-top: auto;`
   compare UNA volta sola in tutto il foglio, ed è questa. */
const REGOLA = /background: var\(--talos-panel\);\s+margin-top: auto;/;

async function apri(page, { tema, larghezza, altezza, senzaCura = false }) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.route('**/*', async (route) => {
    const richiesta = route.request();
    const metodo = richiesta.method().toUpperCase();
    if (metodo !== 'GET' && metodo !== 'HEAD') {
      FERMATE.push(`${metodo} ${richiesta.url()}`);
      return route.abort();
    }
    /*
     * ⛔ IL «PRIMA» SI RICAVA DALLA RISPOSTA VERA, IN MEMORIA. La cura sta in UNA riga di
     *   `styles.css`; togliendola dalla risposta del server si misura lo stesso foglio, lo stesso
     *   bundle, la stessa scena — senza scrivere un byte sul disco e senza che il server dell'owner
     *   se ne accorga. È l'unico modo di avere un prima/dopo sulla STESSA scena: una foto di ieri
     *   sarebbe un'altra app.
     */
    if (senzaCura && /\/styles\.css(\?|$)/.test(richiesta.url())) {
      const risposta = await route.fetch();
      const corpo = await risposta.text();
      const trovate = corpo.match(new RegExp(REGOLA.source, 'g'))?.length ?? 0;
      /* ⛔ Se la riga non c'è (o ce ne fosse più d'una) il «prima» NON è il prima: starei misurando
         il foglio curato e la prova direbbe che non c'è nessun difetto. Meglio rompersi qui. */
      expect(trovate, `il foglio servito non ha la riga da togliere (trovate ${trovate}): il «prima» non si può costruire`).toBe(1);
      return route.fulfill({ response: risposta, body: corpo.replace(REGOLA, 'background: var(--talos-panel);') });
    }
    return route.continue();
  });
  /* Le preferenze si scrivono nel localStorage di QUESTA finestra usa-e-getta, non in quelle
     dell'owner: Playwright ha un profilo suo, quindi il suo browser non viene toccato. */
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 20000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime, null, { timeout: 15000 });
  await page.waitForTimeout(400);
}

/* La stessa misura della prova locale: rettangoli e pixel, mai la presenza di una regola. */
const MISURA = `(() => {
  const barra = document.querySelector('.talos-sidebar');
  const piede = barra.querySelector('.talos-sidebar__foot');
  const rb = barra.getBoundingClientRect();
  const rp = piede.getBoundingClientRect();
  const sb = getComputedStyle(barra);
  const fondo = rb.bottom - (parseFloat(sb.borderBottomWidth) || 0);
  return {
    scorrevole: barra.scrollHeight > barra.clientHeight + 1,
    quantoResta: Math.round(barra.scrollHeight - barra.clientHeight),
    barraFondo: Math.round(fondo),
    piedeFondo: Math.round(rp.bottom),
    scarto: Math.round(rp.bottom - fondo),
    piedeAltezza: Math.round(rp.height),
    righe: document.querySelectorAll('#sessionList .talos-session-item, #sessionList .td-session-row').length,
    titolo: piede.querySelector('.talos-sidebar__foot-title')?.textContent || null,
    sotto: piede.querySelector('.talos-sidebar__foot-sub')?.textContent || null,
  };
})()`;

test.afterAll(() => {
  /* ⛔ Il conto si dichiara SEMPRE, anche quando è zero: «non ho fermato niente» è un'informazione,
     e un silenzio non distingue «nessun tentativo» da «guardia non installata». */
  console.log(`FERMATE-SUL-4174 n=${FERMATE.length}${FERMATE.length ? ' :: ' + FERMATE.join(' | ') : ''}`);
});

/*
 * ⭐⭐⭐ LA SCENA DELL'OWNER, riprodotta sulla SUA misura e coi SUOI dati.
 *
 * ⛔ Il difetto NON si vede a una finestra normale: sul 4174 ci sono 40 sessioni, e a 1440×1600 la
 *   barra sborda di 405 px (1285 a 1280×720) — lì il piede lo teneva su lo sticky anche PRIMA della
 *   cura, e le prove a quelle misure erano verdi in partenza. Nella foto dell'owner
 *   (`Downloads/bug/download.png`, 3840×2160) la barra finisce a **2060** e il contenuto ci sta
 *   tutto: è la condizione in cui lo sticky è inerte. ⇒ La prova che morde è questa, ed è la SUA
 *   finestra. Il numero che la dichiara è `scorrevole: false`.
 */
for (const tema of ['dark', 'light']) {
  test(`4174 (3840x2060, ${tema}) — la sua misura, senza filtri: il piede tocca il fondo`, async ({ page }) => {
    test.setTimeout(60000);
    await apri(page, { tema, larghezza: 3840, altezza: 2060 });
    const m = await page.evaluate(MISURA);
    console.log(`MISURA-4174-BLOCCO1 3840x2060 ${tema} (senza filtro) = ${JSON.stringify(m)}`);
    await page.screenshot({ path: `../../artifacts/blocco1/4174-footer-3840x2060-${tema}.png`, fullPage: true });
    /* ⛔ Le due premesse, o la foto non prova niente: contenuto più corto della barra (altrimenti
       starebbe misurando lo sticky, che c'era già) e il piede in fondo. */
    expect(m.scorrevole, `alla sua misura la barra sborda di ${m.quantoResta} px: non è la scena del difetto`).toBe(false);
    expect(Math.abs(m.scarto), `il piede non sta in fondo: finisce a ${m.piedeFondo} su una barra che finisce a ${m.barraFondo} — ${Math.abs(m.scarto)} px di vuoto sotto`).toBeLessThanOrEqual(1);
  });
}

/* ⛔ IL «PRIMA» DELLA STESSA SCENA, ricavato dalla risposta del 4174 togliendo in memoria l'unica
   riga della cura. Questa prova PRETENDE il difetto: se il piede restasse in fondo anche senza la
   riga, vorrebbe dire che la riga non è quella che lo tiene su — e la cura sarebbe un'altra. */
for (const tema of ['dark', 'light']) {
  test(`4174 (3840x2060, ${tema}) — il PRIMA: senza la riga il piede risale, e la riga è quella`, async ({ page }) => {
    test.setTimeout(60000);
    await apri(page, { tema, larghezza: 3840, altezza: 2060, senzaCura: true });
    const m = await page.evaluate(MISURA);
    console.log(`MISURA-4174-BLOCCO1 3840x2060 ${tema} (PRIMA, riga tolta in memoria) = ${JSON.stringify(m)}`);
    await page.screenshot({ path: `../../artifacts/blocco1/4174-footer-PRIMA-3840x2060-${tema}.png`, fullPage: true });
    expect(m.scorrevole, 'la scena non si è formata: la barra sborda, quindi il piede lo terrebbe su lo sticky comunque').toBe(false);
    expect(m.scarto, `senza la riga il piede doveva risalire, e invece sta in fondo (${m.scarto} px): la cura non è quella, o non è la sola`).toBeLessThan(-50);
  });
}

/* ⛔ Il ramo OPPOSTO, coi dati veri: quando la barra sborda, la cura non deve spostare niente — è
   il caso in cui il piede lo tiene su lo sticky, e il margine automatico vale zero. */
for (const tema of ['dark', 'light']) {
  test(`4174 (1440x1600, ${tema}) — con la barra che sborda il piede resta al fondo`, async ({ page }) => {
    await apri(page, { tema, larghezza: 1440, altezza: 1600 });
    const m = await page.evaluate(MISURA);
    console.log(`MISURA-4174-BLOCCO1 1440x1600 ${tema} = ${JSON.stringify(m)}`);
    await page.screenshot({ path: `../../artifacts/blocco1/4174-footer-1440x1600-${tema}.png`, fullPage: true });
    expect(m.scorrevole, `la scena non si è formata: a 1440×1600 con 40 sessioni la barra dovrebbe sbordare (${m.quantoResta} px)`).toBe(true);
    expect(Math.abs(m.scarto), `la cura ha spostato il piede nel ramo che sborda: ${m.scarto} px`).toBeLessThanOrEqual(1);
  });
}

/* ⛔ E il terzo stato, quello della foto dell'owner: ricerca attiva, poche righe. Si conta solo ciò
   che si vede — `querySelectorAll` restituisce anche le righe nascoste, e contarle tutte faceva
   sembrare che il filtro non avesse fatto niente (misurato, non supposto). */
for (const tema of ['dark', 'light']) {
  test(`4174 (3840x2060, ${tema}) — con la ricerca attiva il piede resta in fondo`, async ({ page }) => {
    test.setTimeout(60000);
    await apri(page, { tema, larghezza: 3840, altezza: 2060 });
    const contaVisibili = () => page.evaluate(() => [...document.querySelectorAll('#sessionList .talos-session-item, #sessionList .td-session-row, #sessionList .real-session-item')].filter((n) => !n.hidden && n.offsetParent !== null).length);
    const prima = await contaVisibili();
    expect(prima, 'la scena non si è formata: la barra non ha nemmeno una riga da filtrare').toBeGreaterThan(1);
    await page.locator('#sessionSearch').fill('gioco');
    await expect.poll(contaVisibili, { message: `la ricerca non ha filtrato niente: restano ${prima} righe visibili`, timeout: 15000 }).toBeLessThan(prima);
    await page.waitForTimeout(300);
    const m = await page.evaluate(MISURA);
    console.log(`MISURA-4174-BLOCCO1 3840x2060 ${tema} (ricerca «gioco») = ${JSON.stringify({ ...m, righeVisibiliPrima: prima })}`);
    await page.screenshot({ path: `../../artifacts/blocco1/4174-footer-ricerca-3840x2060-${tema}.png`, fullPage: true });
    expect(Math.abs(m.scarto), `con la ricerca attiva il piede non sta in fondo: ${m.scarto} px`).toBeLessThanOrEqual(1);
  });
}
