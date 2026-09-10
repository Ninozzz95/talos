/* Il velo dei permessi si apre cliccando la pillola? */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { resolve } from 'node:path';
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(4000);
  await p.locator('.talos-session-item').filter({ hasText: /conclusa/ }).first().click();
  await p.waitForTimeout(2000);
  const prima = await p.evaluate(() => ({ nascosto: document.querySelector('#veloPermessi')?.hidden ?? null }));
  await p.locator('[data-open-sheet="permissions"]').first().click({ force: true });
  await p.waitForTimeout(1500);
  const dopo = await p.evaluate(() => {
    const v = document.querySelector('#veloPermessi');
    const scelte = [...document.querySelectorAll('[data-dove-choice]')];
    return {
      nascosto: v?.hidden ?? null,
      display: v ? getComputedStyle(v).display : null,
      quanteScelte: scelte.length,
      visibili: scelte.filter((x) => x.offsetParent !== null).length,
      testi: scelte.map((x) => x.textContent.trim().slice(0, 40)),
    };
  });
  console.log('prima del clic:', JSON.stringify(prima));
  console.log('dopo il clic  :', JSON.stringify(dopo, null, 2));
  await p.screenshot({ path: resolve('scratchpad/prove/modalita-shell/velo.png') });
} finally { await b.close(); }
