/*
 * La modalità shell si vede mentre si scrive? ⛔ Sola lettura: si digita nel composer e basta,
 *   nessun invio, nessun giro, nessun costo.
 */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { resolve } from 'node:path';
const output = resolve('scratchpad/prove/modalita-shell');
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(4000);
  await p.locator('.talos-session-item').first().click();
  await p.waitForTimeout(2500);

  const leggi = () => p.evaluate(() => {
    const f = document.querySelector('#composerForm');
    const input = f?.querySelector('.talos-composer__input, #composerInput');
    const stile = input ? getComputedStyle(input) : null;
    return {
      classi: [...(f?.classList ?? [])].filter((x) => x.includes('shell')).join(' ') || '(nessuna)',
      bordo: f ? getComputedStyle(f).borderTopColor : null,
      carattere: stile ? stile.fontFamily.split(',')[0].replace(/["']/g, '') : null,
      avviso: f?.querySelector('.talos-composer__shell')?.textContent?.trim() ?? null,
    };
  });

  const composer = p.locator('#composerInput');
  await composer.fill('ciao come stai');
  await p.waitForTimeout(300);
  console.log('testo normale  :', JSON.stringify(await leggi()));
  await composer.fill('!npm test');
  await p.waitForTimeout(400);
  console.log('un !           :', JSON.stringify(await leggi()));
  await p.screenshot({ path: resolve(output, 'shell-singola.png') });
  await composer.fill('!!git status');
  await p.waitForTimeout(400);
  console.log('due !!         :', JSON.stringify(await leggi()));
  await p.screenshot({ path: resolve(output, 'shell-muta.png') });
  /* ⛔ AL CONTRARIO: si toglie il `!` e tutto deve tornare come prima. */
  await composer.fill('npm test');
  await p.waitForTimeout(400);
  console.log('tolto il !     :', JSON.stringify(await leggi()));
} finally { await b.close(); }
