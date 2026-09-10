/* Lo shimmer sulla riga d'attesa scorre davvero? Si guarda `background-position`, che è ciò che
   l'animazione muove, e si fotografa. ⛔ Costo zero: un `!sleep`, nessun modello. */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { resolve } from 'node:path';
const output = resolve('scratchpad/prove/modalita-shell');
const b = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(4000);
  const conclusa = p.locator('.talos-session-item').filter({ hasText: /conclusa/ }).first();
  await conclusa.click();
  await p.waitForTimeout(2500);
  const composer = p.locator('#composerInput');
  await composer.fill('!sleep 8');
  await composer.press('Enter');
  await p.locator('.talos-waiting__label').first().waitFor({ timeout: 15000 }).catch(() => {});
  const letture = [];
  for (let i = 0; i < 14; i += 1) {
    const r = await p.evaluate(() => {
      const l = document.querySelector('.talos-waiting__label');
      if (!l) return null;
      const s = getComputedStyle(l);
      return { pos: s.backgroundPosition, colore: s.color, testo: l.textContent.trim().slice(0, 40), segnaviaVisibile: Boolean(document.querySelector('.talos-waiting .talos-line-loader')) && getComputedStyle(document.querySelector('.talos-waiting .talos-line-loader')).display !== 'none' };
    });
    if (r) letture.push(r);
    if (letture.length === 3) await p.screenshot({ path: resolve(output, 'shimmer.png') });
    await p.waitForTimeout(110);
  }
  if (!letture.length) { console.log('⛔ nessuna riga d\'attesa vista'); process.exit(0); }
  const posizioni = new Set(letture.map((x) => x.pos));
  console.log(`riga: ${JSON.stringify(letture[0].testo)}`);
  console.log(`segnavia ancora visibile: ${letture[0].segnaviaVisibile} (deve essere false)`);
  console.log(`background-position distinti: ${posizioni.size} su ${letture.length} → ${[...posizioni].slice(0, 4).join(' | ')}`);
  console.log(`colore del testo: ${letture[0].colore} (trasparente = il gradiente dipinge le lettere)`);
  console.log(posizioni.size > 5 && !letture[0].segnaviaVisibile ? '✔ lo shimmer scorre e il segnavia è nascosto' : '⛔ non scorre, o il segnavia è ancora lì');
} finally { await b.close(); }
