// Guardie installate PRIMA della navigazione. Nessuna scrittura al server dell'owner.
import { chromium } from '../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const id = `confronto-live-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const output = resolve(repo, '.claude/ripresa-2026-09-19', id);
mkdirSync(output);
const mockupFile = 'C:/Users/Antonino/Downloads/TALOS-Calm-Lab-04.html';
const mockup = readFileSync(mockupFile);
const hash = b => createHash('sha256').update(b).digest('hex');
if (hash(mockup) !== '094207523b3b76b01cd9aac27792ff2cc2f97ddd69cbd9757898fa558284460e') throw new Error('Mockup diverso dal pin');
const result = { id, created: new Date().toISOString(), mockup: { file: mockupFile, sha256: hash(mockup) }, captures: [], limitations: ['Contenuti diversi: mockup con Qwen demo, prodotto con README Ornith dal repository.', 'Non-GET e WebSocket bloccati; nessuna operazione di gestione modelli eseguita.', 'Il profilo browser di verifica è nuovo e non modifica quello dell’owner.'] };
const browser = await chromium.launch({ headless: true });
const scenarios = process.argv.includes('--quick') ? [[1440,900,'dark']] : [[1024,800,'dark'],[1024,800,'light'],[1440,900,'dark'],[1440,900,'light'],[1920,1080,'dark'],[2560,1440,'dark'],[3840,1907,'dark']];
try {
  for (const [width, height, mode] of scenarios) for (const kind of ['mockup', '4174']) {
    const blocked = [], errors = [], sockets = [], workers = [];
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: mode, reducedMotion: 'reduce' });
    context.on('serviceworker', w => workers.push(w.url()));
    await context.routeWebSocket('**/*', socket => { sockets.push(socket.url()); socket.close(); });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() !== 'GET') { blocked.push({ method: request.method(), path: url.pathname }); await route.abort('blockedbyclient'); return; }
      if (url.pathname === '/__ripresa_mockup.html') { await route.fulfill({ contentType: 'text/html; charset=utf-8', body: mockup }); return; }
      if (kind === 'mockup' && url.pathname.startsWith('/api/')) { blocked.push({ method: 'GET', path: url.pathname, reason: 'mockup-no-api' }); await route.abort(); return; }
      if (url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '4174' && !/\/terminal/.test(url.pathname)) { await route.continue(); return; }
      if (kind === 'mockup' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) { await route.continue(); return; }
      blocked.push({ method: 'GET', path: url.origin + url.pathname, reason: 'external-or-terminal' }); await route.abort();
    });
    await context.addInitScript(mode => {
      try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: mode, themePreset: 'calm', themePresetVersione: 2, interfaceMotion: false, backgroundMotion: false } })); } catch { /* iframe opachi */ }
    }, mode);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const url = kind === 'mockup'
      ? 'http://127.0.0.1:4174/__ripresa_mockup.html#/impostazioni/modelli/scheda/local%3Aqwen8/card'
      : `http://127.0.0.1:4174/#/impostazioni/modelli/scheda/${encodeURIComponent('hf:Ornith-ai/Ornith-1.5-9B-GGUF@main')}/card`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (kind === '4174') {
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
      await page.locator('#paginaModello .readme-body').waitFor({ state: 'visible', timeout: 60000 });
    } else {
      await page.locator('.model-page .readme-body').waitFor({ state: 'visible', timeout: 15000 });
      if (await page.locator('html').getAttribute('data-mode') !== mode) await page.locator('[data-action="quick-theme"]').click();
    }
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const measurements = await page.evaluate(kind => {
      const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      return { sidebar: rect(document.querySelector(kind === '4174' ? '.talos-sidebar' : '.sidebar')), page: rect(document.querySelector('.model-page')), readme: rect(document.querySelector('.readme-body')), surface: rect(document.querySelector('.readme-surface')), context: rect(document.querySelector('.model-context-strip')), bodyWidth: document.body.scrollWidth, viewportWidth: innerWidth, title: document.querySelector('.model-hero h1')?.textContent, theme: document.documentElement.dataset.mode || document.documentElement.dataset.talosResolvedColorMode };
    }, kind);
    const name = `${kind}-${width}x${height}-${mode}.png`;
    if (kind === '4174' && process.argv.includes('--check-shape')) {
      const shape = await page.locator('.model-page').evaluate(n => {
        const tab = n.querySelector('[role="tab"][aria-selected="true"]'), h = n.querySelector('.readme-chrome');
        return { width: n.getBoundingClientRect().width, underline: getComputedStyle(tab).borderBottomWidth, radius: getComputedStyle(tab).borderRadius,
          gap: h.children[1].getBoundingClientRect().left - h.children[0].getBoundingClientRect().right };
      });
      result.shape = shape;
      if (shape.width > 1261 || shape.underline !== '2px' || shape.radius !== '0px' || shape.gap > 16) throw new Error(`RIPRESA-HF-README forma RED: ${JSON.stringify(shape)}`);
    }
    await page.screenshot({ path: join(output, name), fullPage: true });
    result.captures.push({ kind, width, height, mode, file: name, measurements, blocked, sockets, workers, errors });
    if (process.argv.includes('--lab')) {
      await page.getByRole('button', { name: 'Tutti i modelli', exact: true }).click();
      if (kind === '4174') {
        await page.locator('#modelLabCard').waitFor({ state: 'visible' });
        await page.locator('#modelLabHfResults [data-hf]').first().waitFor({ state: 'visible', timeout: 30000 });
        if (await page.locator('#modelLabCard .model-lab-ledger, #modelLabRuntimeBadge').count()) throw new Error('Riepiloghi ancora presenti');
      }
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const labFile = `${kind}-lab-${width}x${height}-${mode}.png`;
      await page.screenshot({ path: join(output, labFile), fullPage: true });
      result.captures.push({ kind, width, height, mode, file: labFile, summariesRemoved: kind === '4174' });
    }
    writeFileSync(join(output, 'progress.json'), JSON.stringify(result, null, 2));
    await context.close();
    console.log(`${name}: sidebar=${measurements.sidebar?.width}, README=${measurements.readme?.width}`);
  }
} finally {
  await browser.close();
  result.finished = new Date().toISOString();
  result.mockupUnchanged = hash(readFileSync(mockupFile)) === result.mockup.sha256;
  writeFileSync(join(output, 'report.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  const groups = scenarios.map(([w,h,m]) => `<section><h2>${w} × ${h} · ${m}</h2><div class="pair">${['mockup','4174'].map(k => `<figure><figcaption>${k}</figcaption><a href="${k}-${w}x${h}-${m}.png"><img src="${k}-${w}x${h}-${m}.png" alt="${k} ${w} ${m}"></a></figure>`).join('')}</div></section>`).join('');
  writeFileSync(join(output, 'confronto.html'), `<!doctype html><meta charset="utf-8"><title>Mockup e TALOS 4174</title><style>body{font:16px system-ui;background:#1e1f21;color:#eee;margin:24px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;border:1px solid #555}figcaption{padding:8px}section{margin-bottom:32px}</style><h1>Mockup originale e prodotto sulla 4174</h1><p>Screenshot alle stesse dimensioni. Contenuti demo e repository reale distinti. Clicca ogni immagine per vederla intera.</p>${groups}`, { flag: 'wx' });
  console.log(output);
}
