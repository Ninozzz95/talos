/* La scelta «dove girano i comandi» si vede e funziona? ⛔ Nessun giro col modello. */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { resolve } from 'node:path';
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  const errori = [];
  p.on('pageerror', (e) => errori.push(e.message.slice(0, 160)));
  const chiamate = [];
  p.on('request', (r) => { if (r.url().includes('dove-girano')) chiamate.push(r.postData()); });
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(4000);
  await p.locator('.talos-session-item').filter({ hasText: /conclusa/ }).first().click();
  await p.waitForTimeout(2500);
  await p.locator('[data-open-sheet="permissions"]').first().click();
  await p.waitForTimeout(1200);
  const scelte = await p.evaluate(() => [...document.querySelectorAll('[data-dove-choice]')].map((b2) => ({
    valore: b2.dataset.doveChoice, testo: b2.textContent.replace(new RegExp(String.fromCharCode(92) + 's+', 'g'), ' ').trim().slice(0, 64), attiva: b2.classList.contains('active'),
  })));
  console.log('scelte a schermo:', JSON.stringify(scelte, null, 2));
  await p.screenshot({ path: resolve('scratchpad/prove/modalita-shell/scelta-dove.png') });
  const windows = p.locator('[data-dove-choice="windows"]');
  if (await windows.count()) { await windows.click(); await p.waitForTimeout(1500); }
  console.log('chiamate alla rotta:', JSON.stringify(chiamate));
  if (errori.length) console.log('⛔ errori:', errori.slice(0, 3).join(' | '));
} finally { await b.close(); }
