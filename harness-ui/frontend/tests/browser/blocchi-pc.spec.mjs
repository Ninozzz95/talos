/*
 * BLOCCHI-PC nel browser — i disegnatori dei blocchi dell'interfaccia generativa (catalogo v1, blocco 2, 02/11/2026).
 *
 * ⛔ SCRITTA E NON ANCORA LANCIATA: il banco del Motore era acceso (02/11), niente browser. Si lancia col blocco, dopo il banco:
 *     npx playwright test tests/browser/blocchi-pc.spec.mjs --config=playwright.config.mjs
 *   Il server è quello isolato della suite (`playwright.config.mjs`); ogni richiesta verso il 4174 si ABORTISCE e fa fallire.
 *
 * COME SI CARICA: l'aggancio a `components/markdown.js` non c'è ancora (va dopo la fusione dei blocchi 25/26 e della fase 8), quindi
 * i moduli si impacchettano con lo STESSO esbuild e le stesse opzioni di `scripts/build.mjs` e si servono da un percorso finto
 * (`/__blocchi/**`), come `anteprima-tema.spec.mjs`; `blocchi.css` si serve accanto (non è ancora in `main.css`). Si montano dentro la
 * colonna vera della conversazione, così i token, il carattere e la larghezza sono quelli della chat.
 *
 * Cosa prova (forma §6, «PC, prove»): i 7 tipi in chiaro e scuro a 1440 e 1024 (foto fuori dal repo, `TALOS_FOTO_DI_PROVA`), in arrivo
 * coi secondi e viva anche col movimento ridotto (owner 10/09), rotto, la tastiera sull'ordine della tabella, il puntatore su OGNI elemento cliccabile
 * (owner 31/10: «ogni elemento cliccabile evidenziato col puntatore nel punto esatto»), un solo oggetto per un doppio clic, niente
 * errori nella console.
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import esbuild from 'esbuild';

import { preparaCartellaFoto } from '../aiuto/cartella-foto.mjs';

const RADICE = resolve(import.meta.dirname, '..', '..');
const MODULO = '/__blocchi/blocchi.js';
const FOGLIO = '/__blocchi/blocchi.css';
const CHIAVE_IMPOSTAZIONI = 'talos.harness.desktop.settings.v1';
const IMPOSTAZIONI = (modoColore) => JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: modoColore }, chat: {}, workspaces: {} });

const PONTE = `
export { disegnaBlocco, montaBloccoVivo, statoDelBlocco, SCELTA_DEL_DISEGNO } from '../../src/components/blocchi/guscio.js';
export { leggi } from '../../../src/blocchi/lettore.mjs';
`;

/* Un blocco per tipo, scritto come lo scriverebbe il modello (le stesse forme delle fixture del nucleo). */
const BLOCCHI = {
  tabella: 'root = Tabella("costi", "Costi di ottobre per fornitore", [{id: "f", titolo: "Fornitore", tipo: "testo"}, {id: "r", titolo: "Richieste", tipo: "numero"}, {id: "c", titolo: "Costo", tipo: "soldi"}], [["OpenRouter", 1240, 19.4], ["Z.AI", 860, 7.1], ["ChatGPT · piano", 2100, 0]], true, true)',
  barre: 'root = Grafico("barre", "Costo di ottobre", "barre", "Costo di ottobre per fornitore: OpenRouter 19,40, Z.AI 7,10, ChatGPT 0.", [{nome: "Costo", punti: [{x: "OpenRouter", y: 19.4}, {x: "Z.AI", y: 7.1}, {x: "ChatGPT · piano", y: 0}]}], "€")',
  linee: 'root = Grafico("linee", "Costo per settimana", "linee", "Sale ogni settimana, da 3,90 a 5,70.", [{nome: "OpenRouter", punti: [{x: "1–7 ott", y: 3.9}, {x: "8–14 ott", y: 4.6}, {x: "15–21 ott", y: 5.2}, {x: "22–31 ott", y: 5.7}]}, {nome: "Z.AI", punti: [{x: "1–7 ott", y: 1.2}, {x: "8–14 ott", y: 1.9}, {x: "15–21 ott", y: 2.1}, {x: "22–31 ott", y: 1.9}]}], "€")',
  torta: 'root = Grafico("torta", "Quote del mese", "torta", "OpenRouter 73%, Z.AI 27%.", [{nome: "Quote", punti: [{x: "OpenRouter", y: 19.4}, {x: "Z.AI", y: 7.1}]}], "€")',
  scelte: 'root = Scelte("dopo", "Cosa faccio adesso?", null, [{testo: "Dove risparmio di più?"}, {testo: "Sposta le chat lunghe su Z.AI"}])',
  modulo: 'root = Modulo("riunione", "Prima di cominciare", [{id: "periodo", etichetta: "Periodo", tipo: "scelta", opzioni: [{testo: "Ottobre"}, {testo: "Settembre e ottobre"}]}, {id: "fornitori", etichetta: "Fornitori", tipo: "piu-scelte", opzioni: [{testo: "OpenRouter"}, {testo: "Z.AI"}]}, {id: "nota", etichetta: "Per chi è", tipo: "testo"}], "Manda le scelte")',
  chiaveValore: 'root = ChiaveValore("server", "Server", [{chiave: "CPU", valore: "42%", stato: "ok"}, {chiave: "Disco", valore: 91, stato: "attenzione"}, {chiave: "Ultimo errore", valore: "connessione rifiutata", stato: "errore"}, {chiave: "Acceso da", valore: "3 giorni"}])',
  passi: 'root = Passi("migrazione", "Migrazione", [{titolo: "Copia dei dati", stato: "fatto", quando: "lun"}, {titolo: "Verifica", stato: "ora", quando: "mar"}, {titolo: "Spegnimento del vecchio", stato: "da-fare"}])',
  avviso: 'root = Avviso("disco", null, "attenzione", "Il disco è quasi pieno:\nrestano 2 GB.")',
  rotto: 'root = Tabella("t", "A metà", [{id: "a", titolo: "A", tipo: "testo"}], [["uno"',
};

async function impacchetta() {
  const esito = await esbuild.build({
    absWorkingDir: RADICE,
    stdin: { contents: PONTE, resolveDir: join(RADICE, 'tests', 'browser'), sourcefile: 'ponte-blocchi.js', loader: 'js' },
    bundle: true, format: 'esm', platform: 'browser', target: ['chrome120'], charset: 'utf8', legalComments: 'none', minify: false, write: false, logLevel: 'silent',
  });
  const js = esito.outputFiles[0]?.text;
  if (!js || !js.includes('montaBloccoVivo')) throw new Error('il bundle non contiene i blocchi');
  return js;
}

async function apri(page, { modoColore = 'dark' } = {}) {
  page.versoIl4174 = [];
  page.errori = [];
  page.on('pageerror', (e) => page.errori.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') page.errori.push(m.text()); });
  const js = await impacchetta();
  const css = await readFile(join(RADICE, 'src', 'styles', 'blocchi.css'), 'utf8');
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('4174')) { page.versoIl4174.push(url); return route.abort(); }
    const percorso = new URL(url).pathname;
    if (percorso === FOGLIO) return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: css });
    if (percorso === MODULO) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: js });
    return route.continue();
  });
  await page.addInitScript(([chiave, valore]) => { try { localStorage.setItem(chiave, valore); } catch { /* niente storage */ } }, [CHIAVE_IMPOSTAZIONI, IMPOSTAZIONI(modoColore)]);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(getComputedStyle(document.documentElement).getPropertyValue('--talos-panel-soft').trim()), null, { timeout: 15000 });
  await page.evaluate(async ([foglio, modulo]) => {
    await new Promise((ok, ko) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = foglio; l.onload = ok; l.onerror = () => ko(new Error('foglio')); document.head.append(l); });
    window.__blocchi = await import(modulo);
    window.__azioni = [];
  }, [FOGLIO, MODULO]);
}

/** Monta i blocchi in una risposta finta dentro la colonna vera della conversazione (o in una tela, se la colonna non c'è). */
async function montaTutti(page, nomi) {
  await page.evaluate(([testi]) => {
    const { disegnaBlocco, leggi } = window.__blocchi;
    /* La colonna vera vale solo se è a schermo: all'avvio, senza una sessione aperta, è nascosta (velo del ripristino o schermo Home)
       e ogni pulsante risulterebbe «non visibile». Allora si usa la tela sopra la pagina. */
    const vera = document.querySelector('.talos-conversation__column');
    vera?.classList.remove('is-restoring');
    const colonna = vera?.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) ? vera : null;
    const tela = document.createElement('div');
    tela.id = 'blocchi-tela';
    tela.className = 'assistant-copy';
    if (colonna) colonna.replaceChildren(tela);
    else { tela.style.cssText = 'position:fixed;inset:0;overflow:auto;padding:24px;z-index:99990;background:var(--talos-background)'; document.body.append(tela); }
    for (const testo of testi) tela.append(disegnaBlocco(leggi(testo), { document, testo, origine: 'prova', quandoAgisce: (a) => window.__azioni.push(a), azioni: { lato() {}, schermo() {}, libreria() {} }, copia: async () => {} }));
  }, [nomi.map((n) => BLOCCHI[n])]);
}

/**
 * Monta i blocchi nel SECONDO di sette turni di una conversazione: oltre gli ultimi quattro, quindi un turno CHIUSO, con
 * `content-visibility:auto` (`streaming-fluido.css:93-95`), che taglia ciò che esce dal suo riquadro. È il caso in cui il vecchio
 * menu dentro il blocco si tagliava (review G-A del 05/11/2026, HIGH 3): il menu deve vivere nel corpo della pagina.
 */
async function montaInUnTurnoChiuso(page, nomi) {
  await page.evaluate(([testi]) => {
    const { disegnaBlocco, leggi } = window.__blocchi;
    let conv = document.querySelector('#conversation');
    if (!conv?.checkVisibility?.({ visibilityProperty: true, opacityProperty: true })) {
      /* senza una sessione aperta la colonna vera è nascosta: cede il suo id, perché nella pagina ce ne sia uno solo */
      conv?.removeAttribute('id');
      const tela = document.createElement('div');
      /* 07/11/2026 (curatore, rossa del treno M): la tela della prova sta SOTTO lo strato dei menu (`--talos-z-menu`, tokens.css:68), come
         la colonna vera; a 99990 copriva `#menuDelBlocco`, che vive nel corpo della pagina (review G-A 05/11, variante A dell'owner).
         Fonte del cambio: decisione 352 dell'owner (07/11/2026): il cambio resta, con le foto del menu vero sopra un turno chiuso vero. */
      tela.style.cssText = 'position:fixed;inset:0;overflow:auto;padding:24px;z-index:calc(var(--talos-z-menu) - 1);background:var(--talos-background)';
      conv = document.createElement('div');
      conv.id = 'conversation';
      tela.append(conv);
      document.body.append(tela);
    }
    conv.replaceChildren();
    for (let i = 0; i < 7; i += 1) {
      const turno = document.createElement('article');
      turno.className = 'talos-turn';
      turno.dataset.disegnato = '1';
      const copia = document.createElement('div');
      copia.className = 'assistant-copy';
      if (i === 1) {
        copia.id = 'blocchi-tela';
        for (const testo of testi) copia.append(disegnaBlocco(leggi(testo), { document, testo, origine: 'prova', quandoAgisce: (a) => window.__azioni.push(a), azioni: { lato() {}, schermo() {}, libreria() {} }, copia: async () => {} }));
      } else copia.textContent = `Turno ${i + 1}: una risposta di testo.`;
      turno.append(copia);
      conv.append(turno);
    }
    conv.children[1].scrollIntoView({ block: 'start' });
  }, [nomi.map((n) => BLOCCHI[n])]);
}

test.afterEach(async ({ page }) => {
  expect(page.versoIl4174 ?? [], 'nessuna richiesta verso il 4174').toEqual([]);
  expect(page.errori ?? [], 'nessun errore nella pagina').toEqual([]);
});

for (const modoColore of ['light', 'dark']) {
  for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
    test(`BLOCCHI-PC-B01 i 7 tipi, ${modoColore}, ${larghezza}: nessun testo fuori dal guscio, nessuno scorrimento orizzontale, foto`, async ({ page }) => {
      await page.setViewportSize({ width: larghezza, height: altezza });
      await apri(page, { modoColore });
      await montaTutti(page, ['tabella', 'barre', 'linee', 'torta', 'scelte', 'modulo', 'chiaveValore', 'passi', 'avviso', 'rotto']);
      const misure = await page.evaluate(() => [...document.querySelectorAll('#blocchi-tela > .gu')].map((g) => {
        const r = g.getBoundingClientRect();
        const fuori = [...g.querySelectorAll('*')].filter((n) => { const q = n.getBoundingClientRect(); return q.width && (q.right > r.right + 1 || q.left < r.left - 1); }).filter((n) => !n.closest('.md-table-wrap, pre'));
        return { tipo: g.dataset.tipo || g.dataset.stato, fondo: getComputedStyle(g.querySelector('.gu__corpo')).backgroundColor, fuori: fuori.length };
      }));
      expect(misure.length).toBe(10);
      for (const m of misure) {
        expect(m.fuori, `${m.tipo}: niente esce dal guscio`).toBe(0);
        expect(m.fondo, `${m.tipo}: il fondo è un token, non trasparente nel guscio A`).not.toBe('rgba(0, 0, 0, 0)');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      const cartella = await preparaCartellaFoto('blocchi-pc');
      await page.screenshot({ path: join(cartella, `tipi-${modoColore}-${larghezza}.png`), fullPage: true });
    });
  }
}

/* UIG-8.R1 (scena 8, FE-080, 05/11/2026, variante A dell'owner): nessun bordo, le azioni nel «⋯» e col tasto destro, Esc rimette il
   fuoco su «⋯», «Esporta in CSV» scarica davvero un file e la conferma in riga ne dice il nome; il grafico esporta un SVG.
   Cure del 05/11 (review G-A): i blocchi stanno in un turno CHIUSO oltre il quarto (`content-visibility:auto`), e il menu — che vive
   nel corpo della pagina, `#menuDelBlocco` — si vede per intero, sta sopra a tutto, e col tasto destro si apre dove punta il mouse.
   Il tasto destro della chat (app.js:15921-15925) non si apre insieme.
   ⛔ SCRITTA E NON LANCIATA (05/11): va nella suite della notte, come il resto di questo file. */
for (const modoColore of ['light', 'dark']) {
  for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
    test(`BLOCCHI-PC-UIG-8.R1 menu del blocco in un turno chiuso, ${modoColore}, ${larghezza}: «⋯», tasto destro, Esc, Esporta, foto`, async ({ page }) => {
      await page.setViewportSize({ width: larghezza, height: altezza });
      await apri(page, { modoColore });
      await montaInUnTurnoChiuso(page, ['tabella', 'barre']);
      const turno = page.locator('#conversation > .talos-turn').nth(1);
      expect(await turno.evaluate((n) => getComputedStyle(n).contentVisibility), 'premessa: il turno è chiuso').toBe('auto');
      const tabella = page.locator('#blocchi-tela .gu[data-tipo="tabella"]');
      expect(await tabella.locator('.gu__corpo').evaluate((n) => getComputedStyle(n).borderTopWidth), 'guscio A: nessun bordo').toBe('0px');
      await expect(tabella.locator('.gu__sotto button')).toHaveCount(0);
      const piu = tabella.locator('.gu__testa button[aria-haspopup="menu"]');
      const menu = page.locator('#menuDelBlocco');
      await expect(menu).toBeHidden();
      await piu.click();
      await expect(menu).toBeVisible();
      await expect(piu).toHaveAttribute('aria-expanded', 'true');
      await expect(menu.locator('[role="menuitem"]').first()).toBeFocused();
      expect(await menu.evaluate((m) => m.parentElement === document.body), 'il menu vive nel corpo, non nel turno').toBe(true);
      const r = await menu.boundingBox();
      expect(r.x + r.width, 'il menu non esce dalla finestra').toBeLessThanOrEqual(larghezza + 1);
      expect(r.y + r.height).toBeLessThanOrEqual(altezza + 1);
      /* non tagliato e non coperto: il punto più in basso del menu è del menu */
      expect(await menu.evaluate((m) => { const q = m.getBoundingClientRect(); return m.contains(document.elementFromPoint(q.left + q.width / 2, q.bottom - 4)); }), 'il menu si vede per intero').toBe(true);
      const cartella = await preparaCartellaFoto('blocchi-pc');
      await page.screenshot({ path: join(cartella, `menu-turno-chiuso-${modoColore}-${larghezza}.png`), fullPage: true });
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(piu).toBeFocused();
      const cella = await tabella.locator('tbody td').first().boundingBox();
      await page.mouse.click(cella.x + 10, cella.y + 5, { button: 'right' });
      await expect(menu, 'tasto destro: lo stesso menu').toBeVisible();
      const r2 = await menu.boundingBox();
      expect(Math.abs(r2.x - (cella.x + 10)) <= 2 || r2.x + r2.width <= larghezza, 'si apre dove punta il mouse, o rientra nella finestra').toBe(true);
      expect(Math.abs(r2.y - (cella.y + 5)) <= 2 || r2.y + r2.height <= altezza, 'alla stessa altezza del mouse').toBe(true);
      await expect(page.locator('.talos-context-menu:visible'), 'un menu solo: non anche quello della chat').toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      const scarico = page.waitForEvent('download');
      await piu.click();
      await menu.locator('button[data-esporta]').click();
      expect((await scarico).suggestedFilename()).toBe('Costi di ottobre per fornitore.csv');
      await expect(tabella.locator('.gu__sotto .gu-fatto')).toContainText('Costi di ottobre per fornitore.csv');
      await expect(piu).toBeFocused();
      const grafico = page.locator('#blocchi-tela .gu[data-tipo="grafico"]').first();
      const scarico2 = page.waitForEvent('download');
      await grafico.locator('.gu__testa button[aria-haspopup="menu"]').click();
      await menu.locator('button[data-esporta]').click();
      expect((await scarico2).suggestedFilename()).toMatch(/\.svg$/u);
      await page.screenshot({ path: join(cartella, `menu-esportato-turno-chiuso-${modoColore}-${larghezza}.png`), fullPage: true });
    });
  }
}

test('BLOCCHI-PC-B02 ogni elemento cliccabile ha il puntatore e un cambio al passaggio, nel punto esatto', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await apri(page);
  await montaTutti(page, ['tabella', 'scelte', 'modulo', 'rotto']);
  const cliccabili = page.locator('#blocchi-tela .gu button:not(:disabled):not([aria-disabled="true"]):visible, #blocchi-tela .gu input:not(:disabled):visible') /* scena 8: le voci del menu chiuso non si vedono */;
  const quanti = await cliccabili.count();
  expect(quanti).toBeGreaterThan(10);
  for (let i = 0; i < quanti; i += 1) {
    const c = cliccabili.nth(i);
    const prima = await c.evaluate((n) => { const s = getComputedStyle(n); return { cursore: s.cursor, colore: s.color, bordo: s.borderColor, fondo: s.backgroundColor, sotto: s.textDecorationColor }; });
    await c.hover();
    const dopo = await c.evaluate((n) => { const s = getComputedStyle(n); return { cursore: s.cursor, colore: s.color, bordo: s.borderColor, fondo: s.backgroundColor, sotto: s.textDecorationColor, tag: n.tagName }; });
    if (dopo.tag === 'INPUT') expect(dopo.cursore).toMatch(/text|auto/u); else expect(dopo.cursore, `pulsante ${i}`).toBe('pointer');
    expect(JSON.stringify({ ...prima, cursore: 0 }) !== JSON.stringify({ ...dopo, cursore: 0, tag: undefined }), `elemento ${i}: il passaggio si vede`).toBe(true);
    await page.mouse.move(1, 1);
  }
});

test('BLOCCHI-PC-B03 tastiera: Tab arriva all\'ordine della tabella, Invio ordina, il fuoco resta e aria-sort cambia sul th', async ({ page }) => {
  await apri(page);
  await montaTutti(page, ['tabella']);
  const costo = page.locator('#blocchi-tela th button').nth(2);
  await costo.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#blocchi-tela th').nth(2)).toHaveAttribute('aria-sort', 'descending');
  expect(await costo.evaluate((n) => document.activeElement === n)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('#blocchi-tela th').nth(2)).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.locator('#blocchi-tela tbody tr').first()).toContainText('ChatGPT');
  const anello = await costo.evaluate((n) => getComputedStyle(n).outlineStyle);
  expect(anello).not.toBe('none');
});

test('BLOCCHI-PC-B04 un doppio clic su scelte manda UN oggetto; dopo il blocco è spento', async ({ page }) => {
  await apri(page);
  await montaTutti(page, ['scelte']);
  const primo = page.locator('#blocchi-tela button[data-scelta]').first();
  await primo.dblclick();
  await page.locator('#blocchi-tela button[data-scelta]').nth(1).click({ force: true });
  const azioni = await page.evaluate(() => window.__azioni);
  expect(azioni.length).toBe(1);
  expect(azioni[0]).toMatchObject({ evento: 'talos.blocco.azione.v1', idBlocco: 'dopo', valore: 'Dove risparmio di più?', chiave: 'prova#dopo' });
  await expect(primo).toHaveAttribute('aria-pressed', 'true');
  await expect(primo).toBeDisabled();
});

for (const ridotto of [false, true]) {
  test(`BLOCCHI-PC-B05 in arrivo ${ridotto ? 'col movimento ridotto' : ''}: riga viva coi secondi, scelte non cliccabili, altezza tenuta, foto durante`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: ridotto ? 'reduce' : 'no-preference' });
    await apri(page);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(ridotto);
    await page.evaluate(() => {
      const { montaBloccoVivo } = window.__blocchi;
      /* come `montaTutti`: la colonna vera solo se è a schermo, se no una tela sopra la pagina */
      const vera = document.querySelector('.talos-conversation__column');
      vera?.classList.remove('is-restoring');
      let tela = vera?.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) ? vera : null;
      if (!tela) { tela = document.createElement('div'); tela.className = 'assistant-copy'; tela.style.cssText = 'position:fixed;inset:0;overflow:auto;padding:24px;z-index:99990;background:var(--talos-background)'; document.body.append(tela); }
      window.__vivo = montaBloccoVivo({ document, quandoAgisce: (a) => window.__azioni.push(a) });
      tela.append(window.__vivo.nodo);
      window.__vivo.aggiungi('root = Scelte("s", "Cosa faccio adesso?", null, [{testo: "Dove risparmio di più?"}, {testo: "Sposta');
    });
    const riga = page.locator('.gu-in-arrivo');
    await expect(riga).toBeVisible();
    await expect(page.locator('.gu[aria-busy="true"] button[data-scelta]').first()).toBeDisabled();
    await page.waitForTimeout(2200);
    await expect(riga.locator('.talos-caricamento__secondi')).toHaveText(/2/u);
    const animazione = await riga.locator('.talos-caricamento__etichetta').evaluate((n) => getComputedStyle(n).animationName);
    /* Owner 10/09, ripetuto tre volte («NON LI VOGLIO»), scritto in `styles/attesa-shimmer.css`: la riga che dice «sto lavorando» è un
       indicatore di stato e si muove anche col movimento ridotto del sistema; scelta, non dimenticanza. */
    expect(animazione).toBe('talosAttesaShimmer');
    const cartella = await preparaCartellaFoto('blocchi-pc');
    await page.screenshot({ path: join(cartella, `in-arrivo${ridotto ? '-ridotto' : ''}.png`) });
    const alto = await page.locator('.gu').last().evaluate((n) => n.getBoundingClientRect().height);
    expect(alto).toBeGreaterThanOrEqual(96);
    await page.evaluate(() => { window.__vivo.aggiungi(' le chat lunghe su Z.AI"}])'); window.__vivo.fine(); });
    await expect(page.locator('.gu-in-arrivo')).toHaveCount(0);
    await expect(page.locator('.gu').last().locator('button[data-scelta]').first()).toBeEnabled();
  });
}

test('BLOCCHI-PC-B06 rotto: la frase e «Mostra il testo» che apre il recinto com\'è arrivato', async ({ page }) => {
  await apri(page);
  await montaTutti(page, ['rotto']);
  await expect(page.locator('.gu-rotto')).toContainText('i dati sono arrivati a metà');
  await page.locator('.gu-rotto__azioni button').click();
  await expect(page.locator('.gu-rotto__testo code')).toHaveText(BLOCCHI.rotto);
});
