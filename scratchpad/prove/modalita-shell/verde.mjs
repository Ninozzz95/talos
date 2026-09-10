/* Perché i fogli dei temi dipingono di verde? Si iniettano nella MIA pagina (il 4174 non li serve) e
   si misura il colore vero di ogni superficie. ⛔ Nessuna scrittura sul server. */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const temi = readFileSync(resolve('harness-ui/frontend/src/styles/temi.css'), 'utf8');
const aspetto = readFileSync(resolve('harness-ui/frontend/src/styles/aspetto.css'), 'utf8');
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(3500);
  /* ⛔ Il tema dell'owner e' lo SCURO: e' il default, e `data-theme="light"` lo mette l'app solo per il chiaro. */
  await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await p.waitForTimeout(400);
  const prima = await p.evaluate(() => ({ html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor }));
  await p.addStyleTag({ content: temi + '\n' + aspetto });
  await p.waitForTimeout(800);
  const dopo = await p.evaluate(() => {
    const r = document.documentElement;
    const leggi = (el, prop) => getComputedStyle(el).getPropertyValue(prop).trim();
    return {
      html: getComputedStyle(r).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      temaAttributo: r.getAttribute('data-talos-theme'),
      scenaAttributo: r.getAttribute('data-talos-scene'),
      background: leggi(r, '--talos-background'),
      temaFondo: leggi(r, '--talos-tema-fondo'),
      scenaTinta: leggi(r, '--talos-scena-tinta'),
      scenaAccento: leggi(r, '--talos-scena-accento'),
      classiBody: document.body.className,
      scenaVisibile: getComputedStyle(document.body, '::before').display,
    };
  });
  console.log('PRIMA:', JSON.stringify(prima));
  console.log('DOPO :', JSON.stringify(dopo, null, 2));
  await p.screenshot({ path: resolve('scratchpad/prove/modalita-shell/verde.png') });
} finally { await b.close(); }
