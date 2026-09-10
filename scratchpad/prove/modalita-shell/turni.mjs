/*
 * Tre comandi di fila devono dare TRE blocchi, non uno da «3 comandi eseguiti».
 * ⛔ Costo zero: il `!` non chiama nessun modello. E si controlla anche che il segnale della shell
 *   si SPENGA quando il campo si svuota dopo l'invio (visto acceso sul vuoto nella foto dell'owner).
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
  const conclusa = p.locator('.talos-session-item').filter({ hasText: /conclusa/ }).first();
  if (!await conclusa.count()) throw new Error('nessuna sessione conclusa');
  await conclusa.click();
  await p.waitForTimeout(2500);
  const composer = p.locator('#composerInput');
  for (const cmd of ['!echo uno', '!echo due', '!echo tre']) {
    await composer.fill(cmd);
    await composer.press('Enter');
    await p.waitForTimeout(2200);
  }
  await p.waitForTimeout(1500);
  const esito = await p.evaluate(() => {
    const card = [...document.querySelectorAll('#conversation [data-c="ActivityBundle"]')];
    const titoli = card.map((x) => x.querySelector('.tool-note-summary-text')?.textContent?.trim() ?? '(senza titolo)');
    const f = document.querySelector('#composerForm');
    return {
      blocchi: card.length,
      titoli: titoli.slice(-5),
      accorpati: titoli.some((t) => /[2-9] comandi eseguiti/.test(t)),
      segnaleAcceso: f?.classList.contains('talos-composer--shell') ?? null,
      campoVuoto: (document.querySelector('#composerInput')?.value ?? 'x') === '',
    };
  });
  console.log(JSON.stringify(esito, null, 2));
  console.log(!esito.accorpati && esito.campoVuoto && esito.segnaleAcceso === false
    ? '✔ tre blocchi distinti, e il segnale shell si spegne col campo'
    : '⛔ ancora accorpati o segnale rimasto acceso');
  await p.screenshot({ path: resolve(output, 'turni.png') });
} finally { await b.close(); }
