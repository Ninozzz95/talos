/*
 * Owner 14/10/2026 (mockup approvato, variante B «due domande»): nella modale «Configura Z.AI» l'indirizzo non si scrive, si
 * sceglie — «Come paghi Z.AI» (piano GLM Coding / saldo a consumo) e «Dove» (Internazionale / Cina) — con la riga che dice
 * dove andrà la chiave; «Salva» spento finché le due risposte non ci sono; nessuna scelta di serie per una chiave nuova.
 * Componente vero impacchettato con esbuild in una pagina vuota, come `provider-modale-salva-browser.test.mjs`: nessun server,
 * ogni richiesta del browser si ferma.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../..', import.meta.url));
const sorgenti = { name: 'sorgenti-zai', setup(b) {
  b.onResolve({ filter: /.*/ }, (args) => {
    if (/\.(woff2?|ttf)$/u.test(args.path)) return { path: args.path, external: true };
    if (args.kind !== 'entry-point' && args.path.startsWith('/')) return { path: args.path, external: true };
    const path = resolve(args.resolveDir || frontend, args.path);
    if (relative(frontend, path).startsWith('..')) throw new Error('Sorgente fuori dal frontend: ' + path);
    return { path, namespace: 'zai' };
  });
  b.onLoad({ filter: /.*/, namespace: 'zai' }, async (args) => {
    const est = extname(args.path);
    const loader = est === '.css' ? 'css' : est === '.ts' || est === '.mts' ? 'ts' : est === '.tsx' ? 'tsx' : 'js';
    return { contents: await readFile(args.path, 'utf8'), resolveDir: dirname(args.path), loader };
  });
} };

const PIANO = 'https://api.z.ai/api/coding/paas/v4';
const PIANO_CN = 'https://open.bigmodel.cn/api/coding/paas/v4';
const SALDO = 'https://api.z.ai/api/paas/v4';
/* La riga che il server manda per Z.AI senza indirizzo scelto (`listPublic`, `indirizzoDaScegliere: ['zai']`). */
const ZAI = { id: 'zai', label: 'Z.AI', requiresKey: true, keyConfigured: false, supportsEndpoint: true,
  endpoint: SALDO, endpointConfigured: false, endpointDaScegliere: true, endpointPredefinito: true, timeoutSeconds: 600, pool: [] };

let pagina;
let browser;
test.after(() => browser?.close());
test.before(async () => {
  const script = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], stdin: { contents: `
    import { creaProviderCard, etichettaIndirizzo } from './src/components/provider-card.js';
    window.zai = { creaProviderCard, etichettaIndirizzo };
  `, resolveDir: frontend, sourcefile: 'zai-banco.js' }, tsconfigRaw: {}, bundle: true, write: false, format: 'iife', logLevel: 'silent' });
  const stile = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], entryPoints: [resolve(frontend, 'src/styles/main.css')], tsconfigRaw: {}, bundle: true, write: false, external: ['./fonts/*'], logLevel: 'silent' });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  pagina = async (t, row) => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    t.after(() => page.close());
    const errori = []; page.on('pageerror', (e) => errori.push(e.message));
    t.after(() => assert.deepEqual(errori, []));
    await page.route('**/*', (route) => route.abort());
    await page.setContent('<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body><main style="padding:16px"><div id="card"></div></main></body></html>');
    await page.addStyleTag({ content: stile.outputFiles[0].text });
    await page.addScriptTag({ content: script.outputFiles[0].text });
    await page.evaluate((row) => {
      window.chiamate = []; window.salvate = [];
      document.querySelector('#card').append(zai.creaProviderCard(row, {
        onAzionePool: async () => {}, onMenu: () => {},
        onSalvaConfigurazione: async (dati) => { window.chiamate.push(dati); },
        onConfigurazioneSalvata: (esito) => { window.salvate.push(esito); },
      }));
    }, row);
    await page.locator('[data-provider-toggle]').click();
    const modale = page.locator(`dialog[data-provider-modale="${row.id}"]`);
    await modale.waitFor();
    return { page, modale };
  };
});

const carta = (modale, domanda, testo) => modale.locator(`[data-zai-domanda="${domanda}"] .talos-choice`, { hasText: testo });
const salva = (modale) => modale.getByRole('button', { name: 'Salva', exact: true });
const scelte = (modale) => modale.evaluate((d) => [...d.querySelectorAll('[data-zai-domanda] .talos-choice')].map((b) => `${b.closest('[data-zai-domanda]').dataset.zaiDomanda}:${b.dataset.valore}:${b.getAttribute('aria-checked')}`));

test('ZAI-UI-01 chiave nuova: niente campo libero, due domande senza risposta, «Salva» spento anche con la chiave incollata (e l’Invio non lo scavalca)', async (t) => {
  const { page, modale } = await pagina(t, ZAI);
  assert.equal(await modale.locator('input[type="url"]').count(), 0, 'il campo indirizzo libero non c’è più');
  assert.equal(await modale.locator('[role="radiogroup"]').count(), 2);
  assert.deepEqual(await scelte(modale), ['paghi:piano:false', 'paghi:consumo:false', 'dove:int:false', 'dove:cn:false'], 'nessuna scelta di serie');
  assert.equal(await modale.locator('[data-zai-indirizzo-nota]').innerText(), 'Rispondi alle due domande per salvare la chiave.');
  await modale.locator('[data-provider-key]').fill('zai-chiave-finta');
  assert.equal(await salva(modale).isDisabled(), true);
  await modale.locator('[data-provider-key]').press('Enter');
  await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(() => window.chiamate), [], 'l’Invio nel campo non salva senza indirizzo');
  await carta(modale, 'paghi', 'Piano GLM Coding').click();
  assert.equal(await salva(modale).isDisabled(), true, 'una risposta sola non basta');
});

test('ZAI-UI-02 saldo + Internazionale (lo stesso indirizzo di serie): «Salva» si accende, la riga lo dice, e il collegamento PARTE lo stesso', async (t) => {
  const { page, modale } = await pagina(t, ZAI);
  await modale.locator('[data-provider-key]').fill('zai-chiave-finta');
  await carta(modale, 'paghi', 'Saldo a consumo').click();
  await carta(modale, 'dove', 'Internazionale').click();
  assert.equal(await salva(modale).isDisabled(), false);
  assert.equal(await modale.locator('[data-zai-indirizzo-nota]').innerText(), 'La chiave andrà solo a api.z.ai, sul saldo a consumo. TALOS non prova gli altri indirizzi.');
  await salva(modale).click();
  await page.waitForFunction(() => !document.querySelector('dialog[data-provider-modale][open]'));
  assert.deepEqual(await page.evaluate(() => window.chiamate), [
    { provider: 'zai', pool: true, chiave: 'zai-chiave-finta', collegamento: null },
    { provider: 'zai', pool: true, chiave: '', collegamento: { endpoint: SALDO } },
  ]);
});

test('ZAI-UI-03 già scelto il piano in Cina: le carte lo mostrano, la scheda lo dice per nome, e con le frecce si passa a Internazionale', async (t) => {
  const row = { ...ZAI, keyConfigured: true, endpoint: PIANO_CN, endpointConfigured: true, endpointDaScegliere: undefined, endpointPredefinito: false };
  assert.equal(await (async () => { const { page } = await pagina(t, row); return page.evaluate((r) => zai.etichettaIndirizzo(r), row); })(), 'Piano GLM Coding · Cina');
  const { page, modale } = await pagina(t, row);
  assert.deepEqual(await scelte(modale), ['paghi:piano:true', 'paghi:consumo:false', 'dove:int:false', 'dove:cn:true']);
  assert.equal(await salva(modale).isDisabled(), false);
  await carta(modale, 'dove', 'Cina').focus();
  await page.keyboard.press('ArrowLeft');
  assert.deepEqual(await scelte(modale), ['paghi:piano:true', 'paghi:consumo:false', 'dove:int:true', 'dove:cn:false']);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.valore), 'int', 'il fuoco segue la scelta');
  await salva(modale).click();
  await page.waitForFunction(() => !document.querySelector('dialog[data-provider-modale][open]'));
  assert.deepEqual(await page.evaluate(() => window.chiamate), [{ provider: 'zai', pool: true, chiave: '', collegamento: { endpoint: PIANO } }]);
});

test('ZAI-UI-04 un indirizzo personalizzato già salvato non si butta: nessuna carta scelta, la riga lo nomina, «Salva» acceso e niente da salvare', async (t) => {
  const row = { ...ZAI, keyConfigured: true, endpoint: 'https://proxy.esempio.test/zai/v4', endpointConfigured: true, endpointDaScegliere: undefined, endpointPredefinito: false };
  const { page, modale } = await pagina(t, row);
  assert.deepEqual(await scelte(modale), ['paghi:piano:false', 'paghi:consumo:false', 'dove:int:false', 'dove:cn:false']);
  assert.match(await modale.locator('[data-zai-indirizzo-nota]').innerText(), /https:\/\/proxy\.esempio\.test\/zai\/v4, un indirizzo personalizzato/u);
  assert.equal(await salva(modale).isDisabled(), false);
  await salva(modale).click();
  await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(() => window.chiamate), [], 'niente cambiato, niente spedito');
});

test('ZAI-UI-05 la scheda riassunto: «Indirizzo da scegliere» finché non si sceglie; un altro fornitore non cambia', async (t) => {
  const { page } = await pagina(t, ZAI);
  assert.equal(await page.evaluate((r) => zai.etichettaIndirizzo(r), ZAI), 'Indirizzo da scegliere');
  const altro = { id: 'openrouter', supportsEndpoint: true, endpoint: 'https://openrouter.ai/api/v1', endpointConfigured: false, endpointPredefinito: true };
  assert.equal(await page.evaluate((r) => zai.etichettaIndirizzo(r), altro), 'Indirizzo predefinito');
});

test('ZAI-UI-06 la porta Anthropic di Z.AI (owner 14/10: sceglierla è già la scelta) dice dove va la chiave e non chiede le due domande', async (t) => {
  const row = { id: 'zai-anthropic', label: 'Z.AI (porta Anthropic)', requiresKey: true, keyConfigured: false, supportsEndpoint: true,
    endpoint: 'https://api.z.ai/api/anthropic/v1', endpointConfigured: false, endpointPredefinito: true, timeoutSeconds: 600, pool: [] };
  const { page } = await pagina(t, row);
  const modale = page.locator('dialog[data-provider-modale="zai-anthropic"]');
  assert.equal(await modale.locator('[data-zai-domanda]').count(), 0);
  assert.equal(await modale.locator('[data-zai-anthropic-nota]').innerText(), 'Questo collegamento va al piano GLM Coding: la chiave si usa solo lì.');
});
