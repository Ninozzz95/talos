// P-K — componenti reali, API locale reale, nessun account cloud o portachiavi reale.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname, relative, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { createProviderCredentialStore } from '../../../src/provider-credential-store.mjs';
import { createHttpApp } from '../../../src/http-app.mjs';

const frontend = fileURLToPath(new URL('../..', import.meta.url));
test('PK-UI-02/03 — campi cloud reali, salvataggio HTTP, ricarica, errore e digitazione da tastiera', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pk-ui-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'runtime.json') });
  store.setRuntime('azure', { endpoint: 'https://risorsa-pk.openai.azure.com', timeoutSeconds: 30 });
  const app = createHttpApp({ providerStore: store, staticHandler: async () => null });
  const server = createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body><main style="padding:16px;max-width:900px;margin:auto"><h1>Fornitori e accessi</h1><p>Banco P-K · componenti isolati, nessun account cloud</p><div id="menu"></div><div id="lista"></div></main></body></html>'); return; }
    app(req, res);
  });
  await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise(ok => { server.close(ok); server.closeAllConnections(); }));
  assert.notEqual(server.address().port, 4174);
  const base = `http://127.0.0.1:${server.address().port}`;
  const sorgenti = { name: 'sorgenti-pk', setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      if (/\.(woff2?|ttf)$/u.test(args.path)) return { path: args.path, external: true };
      const path = resolve(args.resolveDir || frontend, args.path);
      if (relative(frontend, path).startsWith('..')) throw Error('Sorgente fuori dal frontend');
      return { path, namespace: 'pk' };
    });
    b.onLoad({ filter: /.*/, namespace: 'pk' }, async args => ({ contents: await readFile(args.path, 'utf8'), resolveDir: dirname(args.path), loader: extname(args.path) === '.css' ? 'css' : 'js' }));
  } };
  const script = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], stdin: { contents: `
    import {aggiornaProviderList} from './src/components/provider-card.js';
    window.carica = async () => {
      const rows=(await (await fetch('/api/v1/providers')).json()).data.items.filter(r=>r.cloud);
      aggiornaProviderList(document.querySelector('#lista'),rows,{aperte:new Set(['azure','bedrock','vertex']),onMenu:voci=>{
        const menu=document.querySelector('#menu');menu.replaceChildren();
        for(const voce of voci){const b=document.createElement('button');b.type='button';b.textContent=voce.etichetta;b.addEventListener('click',()=>{voce.aziona();menu.replaceChildren();});menu.append(b);}
      }});
    };
    document.addEventListener('click',async e=>{
      const b=e.target.closest('[data-provider-action]');if(!b||b.dataset.providerAction!=='save-runtime')return;
      const card=b.closest('[data-provider-id]'),input=card.querySelector('[data-provider-endpoint]');
      const r=await fetch('/api/v1/providers/'+card.dataset.providerId+'/runtime',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:input.value,timeoutSeconds:Number(card.querySelector('[data-provider-timeout]').value)})});
      const feedback=card.querySelector('[data-provider-feedback]');feedback.hidden=false;feedback.textContent=r.ok?'Collegamento salvato.':'Controlla il collegamento.';
    });
  `, resolveDir: frontend }, tsconfigRaw: {}, bundle: true, write: false, format: 'iife', logLevel: 'silent' });
  const css = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], entryPoints: [resolve(frontend, 'src/styles/main.css')], tsconfigRaw: {}, bundle: true, write: false, external: ['./fonts/*'], logLevel: 'silent' });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    t.after(() => page.close());
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    const carica = async () => { await page.goto(base); await page.addStyleTag({ content: css.outputFiles[0].text }); await page.addScriptTag({ content: script.outputFiles[0].text }); await page.evaluate(() => carica()); };
    await carica();
    const vertex = page.locator('[data-provider-id=vertex]');
    const salva = async () => { await vertex.getByRole('button', { name: 'Altre azioni per Google Vertex AI' }).click(); const b = page.locator('#menu').getByRole('button', { name: 'Salva collegamento', exact: true }); await b.focus(); await page.keyboard.press('Enter'); };
    await vertex.getByLabel('Progetto', { exact: true }).fill('progetto-pk');
    await vertex.getByLabel('Regione', { exact: true }).fill('europe-west1');
    assert.equal(await vertex.getByLabel('Indirizzo del servizio').inputValue(), 'https://europe-west1-aiplatform.googleapis.com/v1/projects/progetto-pk/locations/europe-west1/endpoints/openapi');
    await salva();
    await page.waitForFunction(() => document.querySelector('[data-provider-id=vertex] [data-provider-feedback]').textContent === 'Collegamento salvato.');
    await carica();
    assert.equal(await vertex.getByLabel('Progetto', { exact: true }).inputValue(), 'progetto-pk');
    await vertex.getByLabel('Regione', { exact: true }).fill('regione/non-valida');
    await salva();
    await page.waitForFunction(() => document.querySelector('[data-provider-id=vertex] [data-provider-feedback]').textContent === 'Controlla il collegamento.');
    await page.evaluate(() => carica()); // il renderer mantiene la bozza, non la sostituisce col salvato
    assert.equal(await vertex.getByLabel('Regione', { exact: true }).inputValue(), 'regione/non-valida');
    await vertex.getByLabel('Regione', { exact: true }).fill('europe-west1');
    const azure = page.locator('[data-provider-id=azure]');
    const versione = azure.getByLabel('Versione del collegamento');
    await versione.fill(''); await versione.pressSequentially('2024-10-21');
    assert.equal(await azure.getByLabel('Indirizzo del servizio').inputValue(), 'https://risorsa-pk.openai.azure.com/openai?api-version=2024-10-21');
    const bedrock = page.locator('[data-provider-id=bedrock]');
    await bedrock.getByLabel('Regione', { exact: true }).fill('eu-west-1');
    assert.equal(await bedrock.getByLabel('Indirizzo del servizio').inputValue(), 'https://bedrock-runtime.eu-west-1.amazonaws.com/openai/v1');
    await bedrock.getByLabel('Regione', { exact: true }).focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    await mkdir(resolve(frontend, '../.claude'), { recursive: true });
    await page.screenshot({ path: resolve(frontend, `../.claude/PK-UI-${width}.png`), fullPage: true });
    assert.deepEqual(errors, []);
  }
});
