/* È la SCENA a dipingere di verde? Due scene hanno una tinta verde: `terminal` e `telemetry`. */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { PNG } from '../../../harness-ui/frontend/node_modules/pngjs/lib/png.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const temi = readFileSync(resolve('harness-ui/frontend/src/styles/temi.css'), 'utf8');
const aspetto = readFileSync(resolve('harness-ui/frontend/src/styles/aspetto.css'), 'utf8');
const conta = (buf) => {
  const png = PNG.sync.read(buf);
  let verdi = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b2] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (g > r + 10 && g > b2 + 10) verdi += 1;
  }
  return verdi;
};
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(3500);
  await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await p.addStyleTag({ content: temi + '\n' + aspetto });
  await p.waitForTimeout(800);
  for (const scena of ['calm', 'terminal', 'telemetry', 'aurora']) {
    await p.evaluate((s) => {
      document.documentElement.setAttribute('data-talos-scene', s);
      document.body.classList.add('background-motion-active');
    }, scena);
    await p.waitForTimeout(700);
    const v = conta(await p.screenshot());
    console.log(`scena ${scena.padEnd(10)} → ${String(v).padStart(7)} pixel verdi su 1.296.000 (${(v / 1296000 * 100).toFixed(2)}%)`);
    if (scena === 'terminal') await p.screenshot({ path: resolve('scratchpad/prove/modalita-shell/scena-terminal.png') });
  }
} finally { await b.close(); }
