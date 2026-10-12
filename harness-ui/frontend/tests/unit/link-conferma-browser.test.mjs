/*
 * 11/10/2026 — LA CONFERMA PRIMA DI APRIRE UN LINK DELLA CHAT (decisione owner «Clic + conferma del sito»). Componenti veri
 * (`conferma-link.js`, `link-esterni.js`, `modale-td.js`, `siti-fidati.js`) impacchettati con esbuild in una pagina vuota: nessun
 * server, ogni richiesta del browser si ferma, e «aprire» è un contatore — nessuna pagina esterna parte.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../..', import.meta.url));
const sorgenti = { name: 'sorgenti-link', setup(b) {
  b.onResolve({ filter: /.*/ }, (args) => {
    if (/\.(woff2?|ttf)$/u.test(args.path)) return { path: args.path, external: true };
    if (args.kind !== 'entry-point' && args.path.startsWith('/')) return { path: args.path, external: true };
    const path = resolve(args.resolveDir || frontend, args.path);
    if (relative(frontend, path).startsWith('..')) throw new Error('Sorgente fuori dal frontend: ' + path);
    return { path, namespace: 'lk' };
  });
  b.onLoad({ filter: /.*/, namespace: 'lk' }, async (args) => {
    const est = extname(args.path);
    const loader = est === '.css' ? 'css' : est === '.ts' || est === '.mts' ? 'ts' : est === '.tsx' ? 'tsx' : 'js';
    return { contents: await readFile(args.path, 'utf8'), resolveDir: dirname(args.path), loader };
  });
} };

let browser; let pagina;
test.after(() => browser?.close());
test.before(async () => {
  const script = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], stdin: { contents: `
    import { apriLinkEsterno, montaClicSuiLink } from './src/components/conferma-link.js';
    import { creaSitiFidati } from './src/components/link-esterni.js';
    import { montaSitiFidati } from './src/components/siti-fidati.js';
    import { creaMessaggioUtente } from './src/components/conversazione.js';
    import { renderizzaMarkdown } from './src/components/markdown.js';
    window.lk = { apriLinkEsterno, montaClicSuiLink, creaSitiFidati, montaSitiFidati, creaMessaggioUtente, renderizzaMarkdown };
  `, resolveDir: frontend, sourcefile: 'lk-banco.js' }, tsconfigRaw: {}, bundle: true, write: false, format: 'iife', logLevel: 'silent' });
  const stile = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], entryPoints: [resolve(frontend, 'src/styles/main.css')], tsconfigRaw: {}, bundle: true, write: false, external: ['./fonts/*'], logLevel: 'silent' });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  pagina = async (t) => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    t.after(() => page.close());
    const errori = []; page.on('pageerror', (e) => errori.push(e.message));
    t.after(() => assert.deepEqual(errori, []));
    await page.route('**/*', (route) => route.abort());
    await page.setContent('<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body><main id="schermoImpostazioni"><div id="setting-panel-privacy"></div></main></body></html>');
    await page.addStyleTag({ content: stile.outputFiles[0].text });
    await page.addScriptTag({ content: script.outputFiles[0].text });
    await page.evaluate(() => {
      const memoria = new Map();
      window.fidati = lk.creaSitiFidati({ deposito: { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v) } });
      window.aperti = []; window.copiati = [];
      window.clic = (indirizzo) => lk.apriLinkEsterno(indirizzo, { fidati: window.fidati, apri: (u) => window.aperti.push(u), copia: (u) => window.copiati.push(u) });
    });
    return page;
  };
});
const leggi = (page) => page.evaluate(() => {
  const d = document.querySelector('dialog[open]');
  return d ? { sito: d.querySelector('.talos-link-conferma__sito')?.textContent ?? null, indirizzo: d.querySelector('[data-link-indirizzo]')?.textContent ?? null,
    pulsanti: [...d.querySelectorAll('.td-detail-footer button')].map((b) => b.textContent.trim()), interruttore: Boolean(d.querySelector('[data-link-fidati]')),
    fuoco: document.activeElement?.textContent?.trim() ?? null } : null;
});

test('LINK-CONFERMA-01: un sito non fidato — si mostra il sito e l indirizzo intero, il fuoco parte da «Annulla», e niente si apre finché non lo si dice', async (t) => {
  const page = await pagina(t);
  assert.equal(await page.evaluate(() => clic('https://www.olivemagazine.com/recipes/collection/best-ever-pork-recipes/')), 'chiesto');
  assert.deepEqual(await leggi(page), { sito: 'www.olivemagazine.com', indirizzo: 'https://www.olivemagazine.com/recipes/collection/best-ever-pork-recipes/',
    pulsanti: ['Annulla', 'Copia link', 'Apri nel browser'], interruttore: true, fuoco: 'Annulla' });
  assert.deepEqual(await page.evaluate(() => window.aperti), []);
  await page.keyboard.press('Enter'); // Invio su «Annulla»: chiude e non apre
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.deepEqual(await page.evaluate(() => [window.aperti, window.fidati.elenco()]), [[], []]);
});

test('LINK-CONFERMA-02: «Apri nel browser» apre QUELL indirizzo una volta; con l interruttore il sito diventa fidato e al clic dopo non si chiede più', async (t) => {
  const page = await pagina(t);
  await page.evaluate(() => clic('https://example.com/a'));
  await page.locator('dialog[open] [data-link-apri]').click();
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.deepEqual(await page.evaluate(() => [window.aperti, window.fidati.elenco()]), [['https://example.com/a'], []], 'senza l interruttore non si ricorda niente');
  assert.equal(await page.evaluate(() => clic('https://example.com/b')), 'chiesto', 'e si richiede');
  await page.locator('dialog[open] [data-link-fidati]').check();
  await page.locator('dialog[open] [data-link-apri]').click();
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.deepEqual(await page.evaluate(() => window.fidati.elenco()), ['example.com']);
  assert.equal(await page.evaluate(() => clic('https://example.com/c')), 'aperto');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.aperti), ['https://example.com/a', 'https://example.com/b', 'https://example.com/c']);
  assert.equal(await page.evaluate(() => clic('https://sub.example.com/x')), 'chiesto', 'un sottodominio non eredita la fiducia');
});

test('LINK-CONFERMA-03 AL CONTRARIO: http non si apre (lo dice, resta «Copia link»); un indirizzo che inganna o non è web non apre nemmeno la domanda', async (t) => {
  const page = await pagina(t);
  await page.evaluate(() => { window.fidati.aggiungi('insicuro.test'); });
  assert.equal(await page.evaluate(() => clic('http://insicuro.test/pagina')), 'chiesto', 'anche se il sito è fidato: http non si apre da qui');
  const m = await leggi(page);
  assert.deepEqual([m.pulsanti, m.interruttore], [['Annulla', 'Copia link'], false]);
  assert.match(await page.locator('dialog[open] .talos-link-conferma__avviso').innerText(), /non è cifrato/u);
  await page.locator('dialog[open] [data-link-copia]').click();
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.deepEqual(await page.evaluate(() => [window.aperti, window.copiati]), [[], ['http://insicuro.test/pagina']]);
  for (const no of ['javascript:alert(1)', 'https://google.com@evil.test/x', 'file:///C:/x', 'talos://conversazione/a', '']) {
    assert.equal(await page.evaluate((u) => clic(u), no), 'rifiutato', no);
  }
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.aperti), []);
});

test('LINK-CONFERMA-05: il clic vero sul link — tasto principale e centrale chiedono; il DESTRO no (resta al menu); fuori dalla conversazione niente', async (t) => {
  const page = await pagina(t);
  await page.evaluate(() => {
    const crea = (dove, id) => { const a = document.createElement('a'); a.className = 'talos-link-esterno'; a.id = id; a.href = 'https://example.com/' + id; a.dataset.linkEsterno = a.href; a.textContent = id; dove.append(a); };
    const conv = document.createElement('div'); conv.id = 'conversation'; document.body.append(conv);
    crea(conv, 'dentro'); crea(document.body, 'fuori');
    window.menu = 0; document.addEventListener('contextmenu', (e) => { window.menu += 1; e.preventDefault(); });
    lk.montaClicSuiLink({ dentro: '#conversation', fidati: window.fidati, apri: (u) => window.aperti.push(u) });
  });
  await page.locator('#dentro').click({ button: 'right' });
  assert.deepEqual([await page.locator('dialog[open]').count(), await page.evaluate(() => window.menu)], [0, 1], 'il destro apre il menu, non la domanda');
  await page.locator('#dentro').click({ button: 'middle' });
  assert.equal(await page.locator('dialog[open]').count(), 1, 'il centrale chiede (altrimenti aprirebbe senza chiedere)');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await page.locator('#dentro').click();
  assert.equal(await page.locator('dialog[open]').count(), 1, 'il principale chiede');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.equal(await page.evaluate(() => { let fermato = null; document.addEventListener('click', (e) => { fermato = e.defaultPrevented; e.preventDefault(); }, { once: true }); document.getElementById('fuori').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return fermato; }), false, 'fuori dalla conversazione il link non è toccato');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.aperti), []);
});

test('LINK-BOLLA-02: la bolla VERA della persona — gli indirizzi web sono link (blu, diverso dall accento delle risposte), il testo resta identico, e il clic chiede', async (t) => {
  const page = await pagina(t);
  const testo = 'Guarda https://www.olivemagazine.com/recipes/x/? E **questo** resta testo (https://example.com/a).';
  const m = await page.evaluate((testo) => {
    const conv = document.createElement('div'); conv.id = 'conversation'; document.body.append(conv);
    const bolla = lk.creaMessaggioUtente({ testo }); conv.append(bolla);
    const risposta = document.createElement('div'); risposta.className = 'talos-message'; conv.append(risposta);
    risposta.append(lk.renderizzaMarkdown('Vedi https://example.com/r', { linkWeb: true }));
    lk.montaClicSuiLink({ dentro: '#conversation', fidati: window.fidati, apri: (u) => window.aperti.push(u) });
    const p = bolla.querySelector('.message-bubble p');
    const inBolla = [...p.querySelectorAll('a.talos-link-esterno')];
    const inRisposta = risposta.querySelector('a.talos-link-esterno');
    return { testo: p.textContent, link: inBolla.map((a) => [a.textContent, a.dataset.linkEsterno]), forte: p.querySelector('strong') !== null,
      coloreBolla: getComputedStyle(inBolla[0]).color, coloreRisposta: getComputedStyle(inRisposta).color, sottolineato: getComputedStyle(inBolla[0]).textDecorationLine };
  }, testo);
  assert.equal(m.testo, testo, 'il testo della persona non perde un carattere');
  assert.deepEqual(m.link, [['https://www.olivemagazine.com/recipes/x/', 'https://www.olivemagazine.com/recipes/x/'], ['https://example.com/a', 'https://example.com/a']]);
  assert.equal(m.forte, false, 'niente Markdown nella bolla');
  assert.notEqual(m.coloreBolla, m.coloreRisposta, 'il link della bolla ha il suo colore (blu), non quello delle risposte');
  assert.match(m.sottolineato, /underline/u);
  await page.locator('#conversation .talos-message--user a.talos-link-esterno').first().click();
  assert.equal((await leggi(page))?.sito, 'www.olivemagazine.com');
  assert.deepEqual(await page.evaluate(() => window.aperti), []);
});

test('LINK-CONFERMA-04: nelle Impostazioni i siti fidati si vedono e si tolgono; tolto uno, al prossimo link si richiede', async (t) => {
  const page = await pagina(t);
  await page.evaluate(() => { lk.montaSitiFidati({ fidati: window.fidati }); });
  const carta = page.locator('[data-settings-card="privacy-link"]');
  assert.equal(await carta.locator('[data-siti-fidati-vuoto]').innerText(), 'Nessun sito si apre senza chiedere.');
  await page.evaluate(() => { window.fidati.aggiungi('example.com'); window.fidati.aggiungi('www.olivemagazine.com'); });
  assert.deepEqual(await carta.locator('[data-sito-fidato] .talos-setting__label').allInnerTexts(), ['example.com', 'www.olivemagazine.com'], 'la carta segue l elenco da sola');
  assert.equal(await carta.locator('[data-siti-fidati-vuoto]').count(), 0);
  await carta.locator('[data-sito-fidato="example.com"] button').click();
  assert.deepEqual(await carta.locator('[data-sito-fidato] .talos-setting__label').allInnerTexts(), ['www.olivemagazine.com']);
  assert.equal(await page.evaluate(() => clic('https://example.com/a')), 'chiesto');
  assert.equal(await carta.count(), 1, 'una carta sola, anche dopo più ridisegni');
});
