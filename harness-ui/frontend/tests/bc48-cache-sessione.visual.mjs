import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Verifica autonoma di fixture: nessuna sessione reale, nessuna chiamata a un modello.
const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rapporto = resolve(radice, '../.claude');
const html = `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,"><link rel="stylesheet" href="/src/styles/main.css"><title>BC48 · prova di fixture</title>
<body><main style="max-width:920px;margin:32px auto;padding:16px">
<h1>BC48 · prova di fixture</h1><p class="talos-muted">Dati simulati, componenti e stili del prodotto. Nessuna chiamata a un modello.</p>
<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">
<section id="costi" style="flex:1;min-width:260px"><h2>Costi e consumo</h2><div id="costiRiepilogo"></div></section>
<aside id="inspector" style="width:288px;max-width:100%"><div id="railContesto">
<div data-c="InspectorCard" hidden></div>
<div class="talos-card talos-inspector-card" data-c="InspectorCard"><div class="talos-inspector-card__head"><b>Finestra del contesto</b><span></span></div></div>
</div></aside></div>
<button id="cambia" class="talos-button" style="margin-top:24px">Simula misura assente</button>
</main><script type="module">
import { aggiornaInspector } from '/src/components/inspector.js';
import { aggiornaCosti } from '/src/components/costi-consumo.js';
const misura={percentuale:63,tokenIngresso:3000,tokenDaCache:1890,giriMisurati:2,giriNonMisurati:1,fonte:'consumo-fornitore'};
function disegna(){
 const cacheSessione=localStorage.getItem('bc48-assente')==='si'?null:misura;
 aggiornaInspector(document.querySelector('#inspector'),{usage:{prompt_tokens:1200,completion_tokens:100},finestra:16384,cacheSessione});
 aggiornaCosti(document.querySelector('#costi'),[{sessionId:'prova',avviataAlle:'2026-09-12T17:00:00Z',modello:'prova',usageSessione:{prompt_tokens:3000,completion_tokens:150,cached_tokens:1890,giri:3},cacheSessione}],{sessioneId:'prova'});
 document.body.dataset.pronto='si';
}
document.querySelector('#cambia').onclick=()=>{localStorage.setItem('bc48-assente','si');disegna();};disegna();
</script></body></html>`;

const server = createServer(async (req, res) => {
  try {
    const percorso = new URL(req.url, 'http://localhost').pathname;
    if (percorso === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
    const file = resolve(radice, '.' + decodeURIComponent(percorso));
    const interno = relative(radice, file);
    if (interno.startsWith('..') || interno.includes(':')) { res.writeHead(403); res.end(); return; }
    const mime = { '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2' }[extname(file)] || 'application/octet-stream';
    res.setHeader('Content-Type', mime); res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const porta = server.address().port;
let browser;
try {
  assert.notEqual(porta, 4174);
  browser = await chromium.launch({ headless: true });
  for (const larghezza of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width: larghezza, height: 900 }, reducedMotion: 'reduce' });
    const pagina = await context.newPage(); const errori = [];
    pagina.on('pageerror', e => errori.push(e.message));
    await pagina.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.hostname === '127.0.0.1' && url.port === String(porta) ? route.continue() : route.abort();
    });
    await pagina.goto(`http://127.0.0.1:${porta}/fixture`);
    await pagina.waitForSelector('body[data-pronto="si"]');
    await pagina.evaluate(() => document.fonts.ready);
    const misure = await pagina.evaluate(() => {
      const riga = [...document.querySelectorAll('#inspector .talos-kv')].find(n => n.textContent.includes('Riusato dalla cache'));
      const chiave = riga.querySelector('.talos-kv__k');
      return { etichettaIntera: chiave.scrollWidth <= chiave.clientWidth, testo: riga.textContent, senzaOverflow: document.documentElement.scrollWidth <= innerWidth, ridotto: matchMedia('(prefers-reduced-motion: reduce)').matches };
    });
    await pagina.screenshot({ path: join(rapporto, `BC48-C-${larghezza}.png`), fullPage: true });
    assert.equal(misure.etichettaIntera, true, 'BC48-ETICHETTA: il nome della misura non deve essere troncato');
    assert.match(misure.testo, /63 % · su 2 giri/);
    assert.equal(misure.senzaOverflow, true);
    assert.equal(misure.ridotto, true);
    await pagina.keyboard.press('Tab');
    assert.equal(await pagina.locator('#cambia').evaluate(n => n === document.activeElement), true);
    await pagina.keyboard.press('Enter');
    await pagina.reload(); await pagina.waitForSelector('body[data-pronto="si"]');
    assert.match(await pagina.locator('#inspector').textContent(), /non misurato/);
    assert.match(await pagina.locator('[data-cache-sessione]').textContent(), /non misurato/);
    assert.deepEqual(errori, []);
    console.log(`BC48 ${larghezza}: testo intero, nessun overflow, tastiera, movimento ridotto e reload della fixture verificati`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(r => server.close(r));
}
