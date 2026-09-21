import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { avviaBancoBC50 } from './bc50-server.mjs';

const fase = process.argv[2] || 'dopo';
assert.ok(['prima', 'dopo'].includes(fase));
const destinazione = fileURLToPath(new URL('../../.claude/foto-bc50-2026-09-12/', import.meta.url));
await mkdir(destinazione, { recursive: true });
const banco = await avviaBancoBC50({ prima: fase === 'prima' });
const browser = await chromium.launch({ headless: true });
const misure = [];
const guasti = [];
const interazioni = [];
const prima = fase === 'dopo' ? JSON.parse(await readFile(`${destinazione}/misure-prima.json`, 'utf8')).misure : [];
let verifiche = 0;
try {
  for (const [width, height] of [[1440, 900], [1024, 800]]) for (const fonti of [8, 12]) for (const tema of ['chiaro', 'scuro']) for (const sede of ['composer', 'nuova']) {
    const pagina = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    pagina.on('pageerror', e => guasti.push(e.message));
    await pagina.route('**/*', route => new URL(route.request().url()).origin === banco.url ? route.continue() : route.abort());
    await pagina.goto(`${banco.url}/lab/bc50.html?fonti=${fonti}&tema=${tema}&sede=${sede}&fase=${fase}`);
    await pagina.waitForFunction(n => document.querySelectorAll('.model-picker-source').length === n, fonti);
    await pagina.evaluate(() => document.fonts.ready);
    assert.equal(await pagina.evaluate(() => document.fonts.check('12px "Instrument Sans"')), true, 'BC50-08: font effettivo caricato');
    verifiche += 1;
    await pagina.getByRole('tab', { name: 'Anthropic', exact: false }).click();
    await pagina.locator('.model-picker-search input').focus();
    const geometria = await pagina.locator('.model-picker-sources').evaluate(el => {
      const r = el.getBoundingClientRect();
      const schede = [...el.querySelectorAll('[role="tab"]')].map(t => ({ id: t.dataset.pickerSource, larghezza: t.getBoundingClientRect().width, altezza: t.getBoundingClientRect().height, y: t.getBoundingClientRect().y }));
      return { larghezza: r.width, altezza: r.height, righe: new Set(schede.map(t => t.y)).size, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
        altezzaElenco: document.querySelector('.model-picker-list').getBoundingClientRect().height,
        overflowPagina: document.documentElement.scrollWidth > innerWidth, schede };
    });
    const nome = `${fase}-${sede}-${fonti}-${width}x${height}-${tema}`;
    await pagina.screenshot({ path: `${destinazione}/${nome}.png` });
    misure.push({ nome, ...geometria });
    if (fase === 'dopo') {
      assert.equal(geometria.righe, 1, `BC50-02: ${nome}, una sola riga`);
      assert.equal(geometria.overflowPagina, false, `BC50-02: ${nome}, nessuno sfondamento della pagina`);
      assert.ok(geometria.scrollWidth > geometria.clientWidth, 'BC50-02: le schede devono scorrere');
      assert.ok(geometria.schede.every(t => t.altezza > 24), 'BC50-02: etichette non compresse');
      const originale = prima.find(m => m.nome === nome.replace('dopo-', 'prima-'));
      assert.deepEqual(geometria.schede.map(({ id, larghezza, altezza }) => ({ id, larghezza, altezza })),
        originale.schede.map(({ id, larghezza, altezza }) => ({ id, larghezza, altezza })), 'BC50-02: dimensioni delle singole schede identiche al prima');
      verifiche += 5;
      // BC50-03: usa il gestore vero del monolite, inclusa la ricostruzione dei pulsanti.
      const ids = await pagina.getByRole('tab').evaluateAll(tabs => tabs.map(t => t.dataset.pickerSource));
      await pagina.getByRole('tab', { selected: true }).focus();
      await pagina.keyboard.press('Home');
      async function controllaFuoco(id) {
        const esito = await pagina.locator('.model-picker-sources').evaluate(el => {
          const t = document.activeElement;
          const r = el.getBoundingClientRect(), f = t.getBoundingClientRect();
          return { id: t.dataset.pickerSource, selezionate: el.querySelectorAll('[aria-selected="true"]').length,
            fermate: el.querySelectorAll('[tabindex="0"]').length, scelta: t.getAttribute('aria-selected'),
            visibile: f.left >= r.left - 1 && f.right <= r.right + 1 && f.top >= r.top && f.bottom <= r.bottom };
        });
        assert.deepEqual(esito, { id, selezionate: 1, fermate: 1, scelta: 'true', visibile: true }, `BC50-03: ${nome}`);
        verifiche += 1;
      }
      await controllaFuoco(ids[0]);
      for (const id of ids.slice(1)) { await pagina.keyboard.press('ArrowRight'); await controllaFuoco(id); }
      await pagina.keyboard.press('ArrowRight'); await controllaFuoco(ids[0]);
      await pagina.keyboard.press('ArrowLeft'); await controllaFuoco(ids.at(-1));
      await pagina.keyboard.press('Home'); await controllaFuoco(ids[0]);
      await pagina.keyboard.press('End'); await controllaFuoco(ids.at(-1));
      const scrollPrimaDiTab = await pagina.locator('.model-picker-sources').evaluate(el => el.scrollLeft);
      await pagina.keyboard.press('Tab');
      assert.equal(await pagina.locator('.model-picker-search input').evaluate(el => el === document.activeElement), true, 'BC50-03: Tab esce dalla striscia');
      assert.equal(await pagina.locator('.model-picker-sources').evaluate(el => el.scrollLeft), scrollPrimaDiTab, 'BC50-03: il listener ignora il fuoco fuori dalla striscia');
      verifiche += 2;
      for (const movimento of ['reduce', 'no-preference']) {
        await pagina.emulateMedia({ reducedMotion: movimento });
        const stile = await pagina.locator('.model-picker-sources').evaluate(el => ({
          scorrimento: getComputedStyle(el).scrollBehavior,
          animazione: getComputedStyle(el.querySelector('[role="tab"]')).animationName,
          transizione: getComputedStyle(el.querySelector('[role="tab"]')).transitionDuration,
        }));
        assert.equal(stile.scorrimento, 'auto', 'BC50-04: scorrimento immediato');
        if (movimento === 'reduce') assert.deepEqual(stile, { scorrimento: 'auto', animazione: 'none', transizione: '0s' });
        verifiche += movimento === 'reduce' ? 2 : 1;
      }
      // Foto dei due capi e del centro: le ombre seguono la posizione, non una classe statica.
      if (fonti === 12 && width === 1024) {
        for (const posizione of ['inizio', 'centro', 'fine']) {
          await pagina.locator('.model-picker-sources').evaluate((el, posizione) => {
            const massimo = el.scrollWidth - el.clientWidth;
            el.scrollLeft = posizione === 'inizio' ? 0 : posizione === 'fine' ? massimo : massimo / 2;
          }, posizione);
          await pagina.screenshot({ path: `${destinazione}/${nome}-${posizione}.png` });
        }
      }
      // BC50-05: l'ultima fonte filtra il catalogo e la scelta usa il callback reale del picker.
      await pagina.locator('.model-picker-search input').fill('modello dimostrativo 15');
      assert.equal(await pagina.getByRole('option').count(), 1);
      await pagina.getByRole('option').click();
      assert.equal(await pagina.locator('#esito').textContent(), `Scelto nel banco: ${ids.at(-1)}:modello-15`);
      assert.equal(await pagina.locator('.model-picker-panel').isVisible(), false);
      if (sede === 'nuova') {
        await pagina.locator('.model-picker-trigger').click();
        assert.equal(await pagina.getByRole('tab', { selected: true }).getAttribute('data-picker-source'), ids.at(-1));
        assert.equal(await pagina.locator('.model-picker-trigger-label').textContent(), `${ids.at(-1)}:modello-15`);
        verifiche += 2;
      }
      await pagina.reload();
      await pagina.waitForFunction(n => document.querySelectorAll('.model-picker-source').length === n, fonti);
      assert.equal(await pagina.getByRole('tab').count(), fonti, 'BC50-05: al reload tornano tutte le fonti');
      verifiche += 4;
      interazioni.push({ nome, scenari: ['BC50-03', 'BC50-04', 'BC50-05'], esito: 'superati' });
    }
    await pagina.close();
  }
  if (fase === 'dopo') {
    // BC50-07: la larghezza, non il numero sei, decide se serve scorrere.
    for (const [fonti, width, height] of [[6, 1440, 900], [19, 1024, 800], [12, 390, 844]]) {
      const pagina = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      await pagina.goto(`${banco.url}/lab/bc50.html?fonti=${fonti}&tema=scuro&sede=composer&fase=dopo`);
      await pagina.waitForFunction(n => document.querySelectorAll('.model-picker-source').length === n, fonti);
      await pagina.evaluate(() => document.fonts.ready);
      const tabs = pagina.getByRole('tab');
      const idFinale = await tabs.last().getAttribute('data-picker-source');
      await tabs.first().focus();
      await pagina.keyboard.press('End');
      const esito = await pagina.locator('.model-picker-sources').evaluate(el => {
        const r = el.getBoundingClientRect(), f = document.activeElement.getBoundingClientRect();
        return { overflow: el.scrollWidth > el.clientWidth, visibile: f.left >= r.left - 1 && f.right <= r.right + 1,
          id: document.activeElement.dataset.pickerSource, righe: new Set([...el.children].map(t => t.getBoundingClientRect().y)).size };
      });
      assert.deepEqual(esito, { overflow: fonti > 6, visibile: true, id: idFinale, righe: 1 }, 'BC50-07: sei, tutti i diciannove e viewport stretto');
      await pagina.screenshot({ path: `${destinazione}/dopo-composer-${fonti}-${width}x${height}-limite.png` });
      verifiche += 1;
      interazioni.push({ nome: `BC50-07-${fonti}-${width}`, esito: 'superato' });
      await pagina.close();
    }
    // BC50-06: guasto di un catalogo, tutte le schede restano disponibili.
    const pagina = await browser.newPage({ viewport: { width: 1024, height: 800 } });
    await pagina.goto(`${banco.url}/lab/bc50.html?fonti=12&tema=chiaro&sede=nuova&errore=together`);
    await pagina.waitForFunction(() => document.querySelectorAll('.model-picker-source').length === 12);
    await pagina.getByRole('tab', { name: 'OpenRouter', exact: false }).focus();
    await pagina.keyboard.press('End');
    assert.match(await pagina.locator('.model-picker-list').textContent(), /Catalogo Together non disponibile/);
    assert.equal(await pagina.getByRole('tab').count(), 12);
    await pagina.locator('.model-picker-search input').focus();
    await pagina.locator('.model-picker-sources').evaluate(el => { el.scrollLeft = 0; });
    await pagina.locator('.model-picker-sources').hover();
    await pagina.mouse.wheel(350, 0);
    await pagina.waitForFunction(() => document.querySelector('.model-picker-sources').scrollLeft > 0);
    await pagina.screenshot({ path: `${destinazione}/dopo-errore-catalogo.png` });
    verifiche += 3;
    interazioni.push({ nome: 'BC50-06', esito: 'superato' });
    await pagina.close();
  }
  assert.deepEqual(guasti, []);
} finally {
  await writeFile(`${destinazione}/misure-${fase}.json`, `${JSON.stringify({ chromium: browser.version(), verifiche, guasti, misure, interazioni }, null, 2)}\n`);
  await browser.close();
  await banco.chiudi();
}
console.log(JSON.stringify({ fase, scenari: misure.length, verifiche, guasti, misure: misure.map(({ schede, ...m }) => m) }, null, 2));
