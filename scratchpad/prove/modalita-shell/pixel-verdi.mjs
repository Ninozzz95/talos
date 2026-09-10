/*
 * ⛔ Il colore dichiarato di `html` non e' cio' che si vede: la SCENA dipinge macchie sopra, con
 *   `body::before/::after`. Qui si contano i PIXEL verdi nello scatto — la lezione di stanotte
 *   applicata al contrario: un attributo che NON cambia non prova che i pixel non cambino.
 */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { PNG } from '../../../harness-ui/frontend/node_modules/pngjs/lib/png.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const temi = readFileSync(resolve('harness-ui/frontend/src/styles/temi.css'), 'utf8');
const aspetto = readFileSync(resolve('harness-ui/frontend/src/styles/aspetto.css'), 'utf8');
const b = await chromium.launch({ headless: true });
const conta = (buf) => {
  const png = PNG.sync.read(buf);
  let verdi = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, bl] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (g > r + 10 && g > bl + 10) verdi += 1;
  }
  return { verdi, totali: png.width * png.height };
};
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(3500);
  await p.evaluate(() => document.documentElement.removeAttribute('data-theme')); // lo scuro dell'owner
  await p.waitForTimeout(400);
  const prima = conta(await p.screenshot());
  await p.addStyleTag({ content: temi + '\n' + aspetto });
  await p.waitForTimeout(1200);
  const dopo = conta(await p.screenshot());
  console.log(`PRIMA dei fogli: ${prima.verdi} pixel verdi su ${prima.totali} (${(prima.verdi / prima.totali * 100).toFixed(2)}%)`);
  console.log(`DOPO  i fogli  : ${dopo.verdi} pixel verdi su ${dopo.totali} (${(dopo.verdi / dopo.totali * 100).toFixed(2)}%)`);
  console.log(dopo.verdi > prima.verdi * 3 + 1000 ? '⛔ I FOGLI DIPINGONO DI VERDE' : '✔ i fogli non aggiungono verde in questa condizione');
  await p.screenshot({ path: resolve('scratchpad/prove/modalita-shell/pixel-verdi.png') });
} finally { await b.close(); }
