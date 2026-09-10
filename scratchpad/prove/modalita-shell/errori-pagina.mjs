/* La pagina si blocca? Si guardano gli errori JavaScript e si prova a cambiare sessione. */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  const errori = [];
  p.on('pageerror', (e) => errori.push('pageerror: ' + e.message.slice(0, 220)));
  p.on('console', (m) => { if (m.type() === 'error') errori.push('console: ' + m.text().slice(0, 220)); });
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(5000);
  const voci = p.locator('.talos-session-item');
  const quante = await voci.count();
  console.log('sessioni nella barra:', quante);
  if (quante > 1) {
    await voci.nth(1).click();
    await p.waitForTimeout(3000);
    const titolo = await p.evaluate(() => document.querySelector('[data-current-session-title]')?.textContent?.trim() ?? '(nessun titolo)');
    console.log('dopo il clic sulla seconda sessione, il titolo dice:', JSON.stringify(titolo));
  }
  console.log(errori.length ? '⛔ ERRORI IN PAGINA:\n  ' + errori.slice(0, 6).join('\n  ') : '✔ nessun errore in pagina');
} finally { await b.close(); }
