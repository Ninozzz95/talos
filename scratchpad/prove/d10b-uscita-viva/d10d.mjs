/*
 * D-10D dal vivo: il `!` funziona MENTRE il modello lavora?
 * ⛔ Prima il registro rispondeva SESSION_NOT_READY. Qui si prova il caso vero: una sessione col
 *   giro acceso, e un comando scritto dalla persona nello stesso momento.
 * ⛔ Un giro vero costa: si usa il modello permesso e una domanda lunga ma banale.
 */
import { esigiModelloPermesso } from '../comune/modello-permesso.mjs';
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { resolve } from 'node:path';
const output = resolve('scratchpad/prove/d10b-uscita-viva');
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(4000);
  const conclusa = p.locator('.talos-session-item').filter({ hasText: /conclusa/ }).first();
  if (!await conclusa.count()) throw new Error('⛔ nessuna sessione conclusa: la prova non parte');
  await conclusa.click();
  await p.waitForTimeout(2500);
  console.log('modello:', await esigiModelloPermesso(p));

  /* ⛔ Strumentare invece di indovinare: si guarda la RETE. Se la POST /shell non parte, il
     cancello e' nella pagina; se parte e risponde male, e' nel server. Due posti diversi. */
  const rete = [];
  p.on('request', (r) => { if (r.url().includes('/shell')) rete.push({ fase: 'richiesta', url: r.url(), corpo: r.postData()?.slice(0, 120) ?? null }); });
  p.on('response', async (r) => { if (r.url().includes('/shell')) rete.push({ fase: 'risposta', stato: r.status(), corpo: await r.text().catch(() => null) }); });
  const inConsole = [];
  p.on('console', (m) => { if (m.type() === 'error' || /comando|shell/i.test(m.text())) inConsole.push(m.text().slice(0, 160)); });
  p.on('pageerror', (e) => inConsole.push('pageerror: ' + e.message.slice(0, 200)));
  const composer = p.locator('#composerInput');
  /* 1. si accende il giro del modello */
  await composer.fill('Conta lentamente da 1 a 60, un numero per riga, senza usare attrezzi.');
  await composer.press('Enter');
  await p.waitForTimeout(2500);
  const vivoPrima = await p.evaluate(() => Boolean(document.querySelector('.talos-waiting')) || document.body.classList.contains('talos-giro-vivo'));
  console.log('il modello sta lavorando:', vivoPrima);

  /* 2. e MENTRE lavora si scrive un comando */
  await composer.fill('!echo comando-durante-il-giro');
  await composer.press('Enter');
  const t0 = Date.now();
  let esito = null;
  for (let i = 0; i < 30; i += 1) {
    esito = await p.evaluate(() => {
      const testo = document.querySelector('#conversation')?.textContent ?? '';
      return {
        comandoInChat: testo.includes('comando-durante-il-giro'),
        rifiuto: /ancora in corso|SESSION_NOT_READY/i.test(testo),
        errore: /Il giro si è interrotto/.test(testo),
        giroVivo: document.body.classList.contains('talos-giro-vivo'),
      };
    });
    if (esito.comandoInChat || esito.rifiuto || esito.errore) break;
    await p.waitForTimeout(150);
  }
  console.log(`dopo +${Date.now() - t0} ms:`, JSON.stringify(esito));
  await p.screenshot({ path: resolve(output, 'd10d.png') });
  console.log('rete /shell:', rete.length ? JSON.stringify(rete) : '(nessuna richiesta partita)');
  if (inConsole.length) console.log('console:', inConsole.slice(0, 5).join(' | '));
  console.log(esito?.comandoInChat && !esito.rifiuto && !esito.errore
    ? '✔ D-10D: il comando è partito col modello al lavoro'
    : '⛔ D-10D: NON è partito');
} finally { await b.close(); }
