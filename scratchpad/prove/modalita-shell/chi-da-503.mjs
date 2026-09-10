/* Quale richiesta risponde 503? Comparso in ogni sonda di stasera e mai stanato. */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  const brutte = [];
  p.on('response', (r) => { if (r.status() >= 400) brutte.push({ stato: r.status(), url: r.url().replace('http://127.0.0.1:4174', ''), corpo: null }); });
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(6000);
  if (!brutte.length) { console.log('✔ nessuna risposta >= 400'); }
  else for (const x of brutte.slice(0, 6)) console.log(`⛔ ${x.stato} · ${x.url}`);
} finally { await b.close(); }
