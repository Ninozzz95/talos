/**
 * BC-03 — la PROVA visiva: la scheda «Agenti» con le figlie dentro, e quella vuota.
 * ⛔ Server ISOLATO sulla 4198 (store seminato, `frontend/dist` fresco), mai il 4174.
 * Tema CHIARO e SCURO (regola owner 11/09) e le due viewport desktop di `qa-visual-pipeline`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = await import('file:///C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/frontend/node_modules/@playwright/test/index.mjs');

const BASE = 'http://127.0.0.1:4198';
const FUORI = process.argv[2];
const SESSIONI = [['piena', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'], ['vuota', 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee']];
mkdirSync(FUORI, { recursive: true });
const VIEWPORT = [{ nome: 'desktop', width: 1440, height: 900 }, { nome: 'laptop', width: 1024, height: 800 }];
const errori = [];

const browser = await chromium.launch({ args: ['--disable-backgrounding-occluded-windows'] });
for (const vp of VIEWPORT) {
  for (const tema of ['dark', 'light']) {
    for (const [etichetta, id] of SESSIONI) {
      /* ⛔ Una pagina NUOVA per ogni scatto: su laptop la colonna si apre come pannello CON VELO, e il
         velo resta appeso fra una sessione e l'altra. Ricaricare è l'unico modo onesto di partire
         dallo stesso stato per tutti e otto gli scatti, invece di inseguire il velo. */
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: tema, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errori.push(`[${vp.nome}/${tema}/${etichetta}] pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errori.push(`[${vp.nome}/${tema}/${etichetta}] console.error: ${m.text()}`); });
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2600);

      const riga = page.locator(`.real-session-item[data-real-session-id="${id}"]`).first();
      await riga.waitFor({ state: 'visible', timeout: 20000 });
      await riga.click();
      await page.waitForTimeout(1300);

      /* ⛔ `:visible` e non `.first()`: nel DOM convivono la scheda del guscio legacy (nascosta) e
         quella vera — `.first()` prendeva la nascosta, cioè misurava ciò che nessuno vede. */
      const tab = page.locator('[data-rail="agenti"]:visible');
      if (!(await tab.count())) { await page.locator('button[data-azione="dettagli"]:visible').first().click(); await page.waitForTimeout(1800); }

      if (await tab.count()) {
        await tab.first().click();
        await page.waitForTimeout(800);
        const pannello = page.locator('#railAgenti:visible').first();
        const testo = (await pannello.innerText()).replace(/\s+/g, ' ').trim();
        writeFileSync(join(FUORI, `${etichetta}-${vp.nome}-${tema}.txt`), testo, 'utf8');
        await pannello.screenshot({ path: join(FUORI, `agenti-${etichetta}-${vp.nome}-${tema}.png`) });
        await page.screenshot({ path: join(FUORI, `intera-${etichetta}-${vp.nome}-${tema}.png`) });
        console.log(`${etichetta}/${vp.nome}/${tema} :: ${testo.slice(0, 200)}`);
      } else {
        /* ⛔ NON è una prova mancata: è la prova DEL DIFETTO. Sotto i 1240 px il tasto «dettagli»
           mette `open` sul pannello, ma il foglio scopre la colonna solo con `details-open` sulla
           shell — classe che nessuno scrive. Si fotografa quello che vede la persona: un velo. */
        const stato = await page.evaluate(() => { const s = document.querySelector('.talos-shell'); const i = document.querySelector('#inspectorPanel'); return `shell="${s?.className}" pannello="${i?.className}" display=${getComputedStyle(i).display}`; });
        writeFileSync(join(FUORI, `${etichetta}-${vp.nome}-${tema}.txt`), `COLONNA IRRAGGIUNGIBILE — ${stato}`, 'utf8');
        await page.screenshot({ path: join(FUORI, `difetto-${etichetta}-${vp.nome}-${tema}.png`) });
        console.log(`${etichetta}/${vp.nome}/${tema} :: ⛔ COLONNA IRRAGGIUNGIBILE — ${stato}`);
      }
      await ctx.close();
    }
  }
}
await browser.close();
writeFileSync(join(FUORI, 'errori-runtime.txt'), errori.length ? errori.join('\n') : 'nessun errore JS a runtime', 'utf8');
console.log(errori.length ? `⛔ ${errori.length} errori runtime:\n${errori.join('\n')}` : '✔ nessun errore JS a runtime');
