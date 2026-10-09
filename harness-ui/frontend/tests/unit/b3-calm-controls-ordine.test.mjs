/*
 * ⛔ B3 (09/10/2026) — `relevant()` di `calm-controls` riordinata per costo (vedi il commento nel componente): la REGOLA non
 *   cambia, quindi questa prova fissa la regola e non l'ordine. In un Chromium vero, componente vero (pacchetto esbuild come
 *   la build), si monta su un ambito con una `select` migliorata e si fanno le mutazioni tipiche — quelle della chat che NON
 *   devono contare e quelle dei controlli che DEVONO contare — contando quante volte `refresh` rilegge gli ambiti
 *   (`document.querySelectorAll(scope)`, la sua prima lettura). La stessa tabella è passata, prima della cura, sul codice
 *   di r4 636385c7c: è la prova che il riordino non ha cambiato nessuna risposta.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const pacchetto = (await build({ entryPoints: [fileURLToPath(new URL('../../src/components/calm-controls.js', import.meta.url))], bundle: true, format: 'iife', globalName: '__calm', write: false, logLevel: 'silent' })).outputFiles[0].text;

const SCOPE = '#ambito, [data-calm-controls]';
/* [nome, mutazione da eseguire nella pagina, conta?] — la mutazione è il corpo di una funzione con `d` = document. */
const CASI = [
  ['stile di un paragrafo della chat', "d.querySelector('#chat p').style.color = 'red'", false],
  ['aria-label di un bottone della chat', "d.querySelector('#chat button').setAttribute('aria-label', 'Copia')", false],
  ['testo che cresce nella chat', "d.querySelector('#chat p').firstChild.appendData(' altro')", false],
  ['hidden su un nodo della chat senza controlli', "d.querySelector('#chat p').hidden = true", false],
  ['un turno con una checkbox aggiunto FUORI dall ambito', "const t = d.createElement('div'); t.innerHTML = '<p>giro</p><input type=checkbox>'; d.querySelector('#chat').append(t)", false],
  ['un nodo della chat tolto, nessun controllo staccato', "d.querySelector('#chat p').remove()", false],
  ['stile dentro l interfaccia calm', "const w = d.querySelector('[data-calm-ui]'); if (!w) throw new Error('nessuna interfaccia calm'); w.style.outline = '1px solid red'", false],
  ['disabled su un antenato del controllo', "d.querySelector('#gruppo').setAttribute('disabled', '')", true],
  ['value del controllo stesso', "d.querySelector('#scelta').setAttribute('value', 'b')", true],
  ['label di un opzione nell ambito', "d.querySelector('#scelta option').setAttribute('label', 'Uno!')", true],
  ['testo di una label nell ambito', "d.querySelector('#ambito label').firstChild.appendData(' (nuovo)')", true],
  ['una checkbox aggiunta DENTRO l ambito', "const c = d.createElement('input'); c.type = 'checkbox'; d.querySelector('#ambito').append(c)", true],
  ['un nodo FUORI che porta un ambito intero', "const s = d.createElement('div'); s.dataset.calmControls = ''; s.innerHTML = '<select><option>x</option></select>'; d.querySelector('#chat').append(s)", true],
  ['tolto il contenitore del controllo migliorato', "d.querySelector('#gruppo').remove()", true],
];

let browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(() => browser?.close());

for (const [nome, mutazione, atteso] of CASI) {
  test(`B3-CALM-ORDINE — ${nome}: ${atteso ? 'fa ripartire refresh' : 'NON fa ripartire refresh'}`, async (t) => {
    const page = await browser.newPage();
    t.after(() => page.close());
    await page.route('**/*', (route) => route.abort());
    await page.setContent(`<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body>
      <main id="chat"><p>Una risposta</p><button type="button">⋯</button></main>
      <section id="ambito"><label for="scelta">Scelta</label><fieldset id="gruppo"><select id="scelta"><option value="a">Uno</option><option value="b">Due</option></select></fieldset></section>
    </body></html>`);
    await page.addScriptTag({ content: pacchetto });
    const letture = await page.evaluate(async ([scope, corpo]) => {
      const d = document;
      window.__calm.mountCalmControls(d, { scope });
      await new Promise((ok) => setTimeout(ok, 30)); // il primo refresh e le sue mutazioni proprie sono passati
      const originale = d.querySelectorAll.bind(d);
      let n = 0;
      d.querySelectorAll = (sel) => { if (sel === scope) n += 1; return originale(sel); };
      new Function('d', corpo)(d);
      await new Promise((ok) => setTimeout(ok, 30)); // il lotto dell'osservatore e la microtask di schedule
      return n;
    }, [SCOPE, mutazione]);
    if (atteso) assert.ok(letture >= 1, `doveva rileggere gli ambiti, letture: ${letture}`);
    else assert.equal(letture, 0, `non doveva rileggere gli ambiti, letture: ${letture}`);
  });
}
