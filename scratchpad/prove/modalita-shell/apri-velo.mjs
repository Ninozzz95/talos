/* Il velo si apre chiamando openSheet dal codice, o non si apre proprio? */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { resolve } from 'node:path';
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  const errori = [];
  p.on('pageerror', (e) => errori.push(String(e.message) + ' @@ ' + String(e.stack || '').split(String.fromCharCode(10)).slice(1, 4).join(' ~ ')));
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(4000);
  await p.locator('.talos-session-item').filter({ hasText: /conclusa/ }).first().click();
  await p.waitForTimeout(2000);
  /* Il clic vero, sul bottone vero, come lo farebbe una persona. */
  const bottone = p.locator('[data-open-sheet="permissions"]').first();
  console.log('bottone visibile:', await bottone.isVisible(), '· abilitato:', await bottone.isEnabled());
  await bottone.click();
  await p.waitForTimeout(2000);
  const dopo = await p.evaluate(() => {
    const v = document.querySelector('#veloPermessi');
    return { hidden: v?.hidden, display: v ? getComputedStyle(v).display : null, visibiliOra: [...document.querySelectorAll('[data-dove-choice]')].filter((x) => x.offsetParent !== null).length };
  });
  console.log('dopo il clic:', JSON.stringify(dopo));
  if (errori.length) console.log('⛔ errori:', errori.slice(0, 3).join(' | '));
  await p.screenshot({ path: resolve('scratchpad/prove/modalita-shell/apri-velo.png') });
} finally { await b.close(); }
