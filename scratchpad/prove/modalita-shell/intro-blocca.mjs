/* Il velo dell'intro blocca la pagina: si può chiudere? E perché è comparso? */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { resolve } from 'node:path';
const b = await chromium.launch({ headless: true });
try {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errori = [];
  p.on('pageerror', (e) => errori.push(e.message.slice(0, 200)));
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(5000);
  const stato = await p.evaluate(() => {
    const velo = document.querySelector('#veloIntro');
    const bottoni = [...(velo?.querySelectorAll('button') ?? [])].map((x) => ({ testo: x.textContent.trim().slice(0, 30), visibile: x.offsetParent !== null, disabilitato: x.disabled }));
    let salvato = null;
    try { salvato = localStorage.getItem('talos.harness.desktop.intro.v1'); } catch { salvato = '(localStorage non leggibile)'; }
    return {
      introAperta: Boolean(velo) && getComputedStyle(velo).display !== 'none',
      passo: velo?.dataset?.introPassoAttivo ?? null,
      bottoni,
      introSalvata: salvato,
    };
  });
  console.log(JSON.stringify(stato, null, 2));
  if (errori.length) console.log('⛔ errori:', errori.slice(0, 3).join(' | '));
  await p.screenshot({ path: resolve('scratchpad/prove/modalita-shell/intro.png') });
} finally { await b.close(); }
