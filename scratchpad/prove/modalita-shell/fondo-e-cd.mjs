/*
 * Due domande insieme, misurate:
 *  1. il fondo dell'app in tema SCURO è ancora verde? (l'owner lo vede così)
 *  2. `cd Games` seguito da `ls` cambia davvero cartella?
 * ⛔ Costo zero: solo comandi `!`.
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
  /* Il tema scuro è il DEFAULT: `data-theme="light"` lo mette l'app solo per il chiaro. */
  await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await p.waitForTimeout(500);
  const colori = await p.evaluate(() => {
    const leggi = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : null; };
    return {
      body: leggi('body'),
      chat: leggi('#conversation') ?? leggi('#schermoChat'),
      barra: leggi('.talos-sidebar'),
      composer: leggi('#composerForm'),
      temaAttributo: document.documentElement.getAttribute('data-talos-theme'),
      scenaAttributo: document.documentElement.getAttribute('data-talos-scene'),
    };
  });
  console.log('COLORI (tema scuro):', JSON.stringify(colori, null, 2));
  const verde = (rgb) => { const m = /(\d+), (\d+), (\d+)/.exec(rgb ?? ''); if (!m) return null; const [, r, g, bl] = m.map(Number); return g > r + 4 && g > bl + 4; };
  console.log('c\'è una dominante VERDE?', Object.fromEntries(Object.entries(colori).filter(([, v]) => typeof v === 'string' && v.startsWith('rgb')).map(([k, v]) => [k, verde(v)])));

  const conclusa = p.locator('.talos-session-item').filter({ hasText: /conclusa/ }).first();
  if (!await conclusa.count()) { console.log('(nessuna sessione conclusa: salto la prova del cd)'); process.exit(0); }
  await conclusa.click();
  await p.waitForTimeout(2500);
  const composer = p.locator('#composerInput');
  const uscite = [];
  for (const cmd of ['!pwd', '!cd projects', '!pwd']) {
    await composer.fill(cmd);
    await composer.press('Enter');
    await p.waitForTimeout(2500);
        /* ⛔ Il testo dell'ULTIMO blocco di attività: i selettori fini cambiano con la resa, il blocco no. */
    uscite.push(await p.evaluate(() => { const b = [...document.querySelectorAll('#conversation [data-c="ActivityBundle"]')].pop(); return b ? b.textContent.replace(new RegExp(String.fromCharCode(92) + 's+', 'g'), ' ').trim().slice(-90) : '(nessun blocco)'; }));
  }
  console.log('\n!pwd            →', uscite[0]);
  console.log('!cd harness-ui  →', uscite[1]);
  console.log('!pwd di nuovo   →', uscite[2]);
  console.log(uscite[0] === uscite[2] ? '⛔ il `cd` NON persiste: ogni comando parte da capo' : '✔ la cartella resta fra un comando e l\'altro');
  await p.screenshot({ path: resolve(output, 'fondo-e-cd.png') });
} finally { await b.close(); }
