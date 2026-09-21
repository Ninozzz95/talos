// Schede vere + HTTP locale vero; nessun agente reale o catalogo cloud.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHttpApp } from '../../../src/http-app.mjs';
import { createProviderCredentialStore } from '../../../src/provider-credential-store.mjs';
import { createProviderProbe } from '../../../src/provider-probe.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/src/styles/main.css"></head>
<body style="overflow:auto"><svg style="display:none"><symbol id="i-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></symbol></svg><main style="max-width:900px;margin:auto;padding:16px"><h1>Fornitori e accessi</h1><p>Banco di prova con processo finto</p><button id="providerRefresh">Aggiorna</button><div id="lista"></div><div id="menu" role="menu"></div></main>
<script type="module">
import { aggiornaProviderList } from '/frontend/src/components/provider-card.js';
const lista=document.querySelector('#lista');window.rows=[];window.prove=new Map();window.aperte=new Set(['azure','esterno']);window.salvataggiLegacy=0;
window.disegna=()=>aggiornaProviderList(lista,window.rows,{aperte:window.aperte,prove:window.prove,onMenu(voci){const menu=document.querySelector('#menu');menu.replaceChildren(...voci.map(v=>{const b=document.createElement('button');b.textContent=v.etichetta;b.setAttribute('role','menuitem');b.onclick=()=>{menu.replaceChildren();v.aziona();};return b;}));}});
window.carica=async()=>{window.rows=(await(await fetch('/api/v1/providers')).json()).data.items.filter(r=>['azure','vertex','bedrock','esterno','openai'].includes(r.id));window.disegna();};
document.querySelector('#providerRefresh').onclick=()=>window.carica();
lista.onclick=async e=>{const toggle=e.target.closest('[data-provider-toggle]');if(toggle){const id=toggle.dataset.providerToggle;window.aperte.has(id)?window.aperte.delete(id):window.aperte.add(id);window.disegna();return;}
 const b=e.target.closest('[data-provider-action]');if(!b)return;const id=b.closest('[data-provider-id]').dataset.providerId;
 if(b.dataset.providerAction==='save-runtime'){window.salvataggiLegacy++;return;}
 if(b.dataset.providerAction==='test'){window.prove.set(id,{esito:'in-corso'});window.disegna();const r=await(await fetch('/api/v1/providers/'+id+'/test',{method:'POST'})).json();window.prove.set(id,r.data);window.disegna();}};
await window.carica();window.pronto=true;
</script></body></html>`;

for (const [nome, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) test(`PKLB-DOM-${nome}: campi, menu, persistenza, bozze, errori e prova senza prompt`, async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'talos-pklbis-dom-')), runtimeFile = join(cwd, 'preferenze.json'), diario = join(cwd, 'diario.jsonl');
  let store = createProviderCredentialStore({ env: {}, runtimeFile });
  const probe = createProviderProbe({ env: {}, leggiRuntime: id => store.getRuntime(id), leggiChiave: id => store.getKey(id), fetchImpl: () => assert.fail('Cloud vietato') });
  let app = createHttpApp({ staticHandler: async () => null, providerStore: store, providerProbe: probe });
  const server = createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
    if (req.url.startsWith('/frontend/')) {
      const path = resolve(root, '.' + req.url.slice('/frontend'.length));
      if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      try { const body = readFileSync(path); res.setHeader('Content-Type', ({ '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream'); res.end(body); }
      catch { res.writeHead(404).end(); } return;
    }
    void app(req, res);
  });
  await new Promise((r, j) => { server.once('error', j); server.listen(0, '127.0.0.1', r); });
  assert.notEqual(server.address().port, 4174);
  t.after(async () => { await new Promise(r => { server.close(r); server.closeAllConnections(); }); rmSync(cwd, { recursive: true, force: true }); });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  t.after(() => context.close());
  const page = await context.newPage(), errori = [], richiesteRuntime = [];
  page.on('pageerror', e => errori.push(e.message));
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/runtime')) richiesteRuntime.push(r.postDataJSON()); });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.pronto);
  const card = id => page.locator(`[data-provider-id="${id}"]`);
  for (const id of ['azure', 'vertex', 'bedrock']) assert.equal(await card(id).locator('[data-provider-modelli]').count(), 1);
  for (const id of ['openai', 'esterno']) assert.equal(await card(id).locator('[data-provider-modelli]').count(), 0);
  assert.equal(await card('esterno').locator('[data-provider-key]').count(), 0);
  assert.equal(await card('openai').locator('[data-provider-comando]').count(), 0);
  for (const label of ['Comando', 'Cartella di lavoro', 'Argomenti (uno per riga)', "Variabili d'ambiente da passare (solo i nomi)", 'Tempo massimo (secondi)']) assert.equal(await card('esterno').getByLabel(label, { exact: true }).count(), 1);
  assert.equal(await card('esterno').locator('.talos-provider__body button:visible').count(), 2);
  assert.equal(await card('azure').locator('.talos-provider__body button:visible').count(), 2);
  await card('azure').getByLabel('Indirizzo del servizio').fill('https://esempio.test/openai/v1');
  await card('azure').getByLabel('Modelli configurati (uno per riga)').fill('lavoro\nsecondo');
  const modelli = card('azure').locator('[data-provider-modelli]');
  assert.ok((await modelli.boundingBox()).height >= 80, 'PKLB-REG-RIGHE: il campo mostra più righe senza tagliare il contenuto');
  await modelli.focus();
  await page.evaluate(() => { window.prove.set('azure', { esito: 'errore', motivo: 'Errore di prova' }); window.disegna(); });
  assert.equal(await modelli.inputValue(), 'lavoro\nsecondo');
  assert.equal(await modelli.evaluate(n => n === document.activeElement), true, 'bozza e focus dopo ridisegno');
  await card('azure').getByRole('button', { name: 'Altre azioni per Azure AI Foundry' }).click();
  await page.getByRole('menuitem', { name: 'Salva collegamento' }).click();
  await page.waitForFunction(() => document.querySelector('[data-provider-id="azure"] [data-provider-feedback]')?.textContent === 'Collegamento salvato.');
  assert.deepEqual(store.getRuntime('azure').modelli, [{ id: 'lavoro' }, { id: 'secondo' }]);
  await card('esterno').getByLabel('Comando', { exact: true }).fill(process.execPath);
  await card('esterno').getByLabel('Cartella di lavoro').fill(cwd);
  await card('esterno').getByLabel('Argomenti (uno per riga)').fill([fileURLToPath(new URL('../../../tests/fixtures/acp-agent-finto.mjs', import.meta.url)), 'normale', diario].join('\n'));
  await card('esterno').getByRole('button', { name: 'Salva collegamento' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-provider-id="esterno"] [data-provider-feedback]')?.textContent === 'Collegamento salvato.');
  assert.equal(existsSync(diario), false);
  assert.equal(await page.evaluate(() => window.salvataggiLegacy), 0, 'nessun doppio invio dalla delega');
  assert.equal(richiesteRuntime.length, 2);
  assert.deepEqual(Object.keys(richiesteRuntime[1]), ['agente']);
  store = createProviderCredentialStore({ env: {}, runtimeFile });
  app = createHttpApp({ staticHandler: async () => null, providerStore: store, providerProbe: probe });
  await page.reload(); await page.waitForFunction(() => window.pronto);
  assert.equal(await card('azure').getByLabel('Modelli configurati (uno per riga)').inputValue(), 'lavoro\nsecondo');
  assert.equal(await card('esterno').getByLabel('Comando', { exact: true }).inputValue(), process.execPath);
  await card('esterno').getByRole('button', { name: 'Prova collegamento' }).click();
  await page.waitForFunction(() => document.querySelector('[data-provider-id="esterno"]')?.dataset.provaEsito === 'collegato');
  const righe = readFileSync(diario, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(righe.filter(m => m.method).map(m => m.method), ['initialize']);
  assert.throws(() => process.kill(righe[0].pid, 0), { code: 'ESRCH' });
  await card('esterno').getByLabel('Comando', { exact: true }).fill('relativo');
  await card('esterno').getByRole('button', { name: 'Salva collegamento' }).click();
  await page.waitForFunction(() => document.querySelector('[data-provider-id="esterno"] [role="alert"]')?.textContent.includes('non salvato'));
  assert.equal(store.getRuntime('esterno').agente.comando, process.execPath);
  assert.equal(await card('esterno').getByLabel('Comando', { exact: true }).inputValue(), 'relativo');
  assert.deepEqual(errori, []);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'nessuna eccedenza orizzontale');
  if (process.env.PKLB_ARTEFATTI) await page.screenshot({ path: join(process.env.PKLB_ARTEFATTI, `PKL-BIS-${nome}.png`), fullPage: true });
});
