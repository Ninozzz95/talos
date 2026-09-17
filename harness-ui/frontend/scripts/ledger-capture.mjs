/** L01/F02: observe the real Electron renderer and backend, without API stubs.
 * No provider keys, model turns, resource deletions or production profiles.
 * Missing prerequisites are recorded as BLOCKED, never as a passed screen.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, platform, release } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(process.env.TALOS_CAPTURE_ROOT || 'harness-ui');
const out = resolve(process.env.TALOS_CAPTURE_OUTPUT || 'harness-ui/frontend/artifacts/ledger-runtime');
const require = createRequire(join(root, 'frontend', 'package.json'));
const { _electron } = require('playwright');
const electronPath = require(join(root, 'desktop/node_modules/electron'));
const temporary = await mkdtemp(join(tmpdir(), 'talos-ledger-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  !/KEY|TOKEN|SECRET|PASSWORD|TALOS_|NODE_OPTIONS|ELECTRON_RUN_AS_NODE/i.test(k)));
Object.assign(env, { TALOS_DESKTOP_DATA_DIR: temporary });
await mkdir(out, { recursive: true });
const report = { schema: 'talos.ledger.runtime-baseline.v1', sourceCommit: process.env.TALOS_CAPTURE_COMMIT,
  environment: { platform: platform(), release: release(), node: process.version },
  apiStubs: false, modelTurns: 0, paidCalls: 0, profile: 'temporary runner profile',
  surfaces: [], errors: [], console: [], requests: [], completed: false };
const redact = s => String(s).replace(/([?&]token=)[^\s&'"<>]+/g, '$1[redacted]');
const pause = ms => new Promise(r => setTimeout(r, ms));
let app, page;
const screenIds = ['schermoChat','schermoVuota','schermoTerminale','schermoReview','schermoBrowser',
  'schermoModelLab','schermoCapability','schermoBoard','schermoProgetti','schermoNote','schermoMemoria',
  'schermoAttivita','schermoImpostazioni','schermoDoctor','schermoLibreria','schermoRicerca','schermoOfficina','schermoAutomazioni'];
const navigation = ['chat','vuota','terminale','review','browser','modelli','capability','board',
  'progetti','note','memoria','attivita','impostazioni','doctor','libreria','ricerca','officina','automazioni'];

async function capture(id, extra = {}) {
  const observation = await page.evaluate(() => {
    const shown = el => !!(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const screens = [...document.querySelectorAll('[id^="schermo"]')].filter(shown).map(el => el.id);
    const overlays = [...document.querySelectorAll('.overlay-layer,dialog[open]')].filter(shown).map(el => el.id);
    const components = [...new Set([...document.querySelectorAll('[data-c]')].filter(shown).map(el => el.dataset.c))];
    const focusables = [...document.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')]
      .filter(el => el.tabIndex >= 0 && !el.disabled && shown(el));
    const samples = [...document.querySelectorAll('h1,h2,.talos-button,.talos-nav-item,.talos-topbar')]
      .filter(shown).slice(0, 60).map(el => { const css = getComputedStyle(el); const r = el.getBoundingClientRect(); return {
        tag: el.tagName, class: el.className, text: el.textContent.trim().slice(0,120), color: css.color,
        background: css.backgroundColor, fontSize: css.fontSize, lineHeight: css.lineHeight,
        width: r.width, height: r.height, x: r.x, y: r.y }; });
    return { screens, overlays, components, samples, focusables: focusables.length,
      focus: { tag: document.activeElement?.tagName, id: document.activeElement?.id },
      viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth,
      domNodes: document.querySelectorAll('*').length, theme: document.documentElement.dataset.talosTheme,
      mode: document.documentElement.dataset.theme, memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize } : null,
      resources: performance.getEntriesByType('resource').filter(e => /^https?:/.test(e.name)).map(e => ({
        path: new URL(e.name).pathname, duration: e.duration, transferSize: e.transferSize })) };
  });
  const filename = `${id}.png`;
  await page.screenshot({ path: join(out, filename) });
  report.surfaces.push({ id, status: 'OBSERVED', screenshot: filename, ...extra, ...observation });
}
async function closeVisibleOverlays() {
  for (let n = 0; n < 5; n++) {
    const open = page.locator('.overlay-layer:visible,dialog[open]:visible');
    if (!(await open.count())) return;
    await page.keyboard.press('Escape'); await pause(120);
  }
}
async function clickVisible(selector) {
  const elements = page.locator(selector);
  for (let n = 0; n < await elements.count(); n++) {
    const el = elements.nth(n);
    if (await el.isVisible() && await el.isEnabled()) { await el.click({ timeout: 3000 }); return true; }
  }
  return false;
}
try {
  app = await _electron.launch({ executablePath: electronPath, args: [join(root,'desktop')], env, timeout: 60000 });
  page = await app.firstWindow({ timeout: 60000 });
  page.on('pageerror', e => report.errors.push(redact(e.stack || e.message)));
  page.on('console', m => { if (['warning','error'].includes(m.type())) report.console.push({ type:m.type(), text:redact(m.text()) }); });
  page.on('request', r => { try { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) report.requests.push({ method:r.method(), origin:u.origin, path:u.pathname }); } catch {} });
  await page.waitForURL(u => u.hostname === '127.0.0.1' && u.pathname === '/' && !u.search, { timeout:60000 });
  await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await page.locator('.talos-shell').waitFor({ state:'visible', timeout:45000 });
  await page.waitForFunction(() => !document.querySelector('#talosAvvio') || document.querySelector('#talosAvvio').hidden || getComputedStyle(document.querySelector('#talosAvvio')).display === 'none', { timeout:30000 }).catch(e => report.console.push({type:'capture', text:'Startup splash still present: '+e.message}));
  await pause(800);
  const base = new URL(page.url()).origin;
  assert.equal((await fetch(base+'/api/v1/health')).status,401);
  assert.equal(await page.evaluate(async()=> (await fetch('/api/v1/health')).status),200);
  report.backendAuthenticated = true;
  await capture('00-first-launch');
  // A skip is an explicit UI action. It does not choose a provider or grant permissions.
  await clickVisible('#introSalta, #introSkip, [data-intro-salta]');
  await closeVisibleOverlays();
  await page.keyboard.press('Tab'); await capture('01-keyboard-entry');
  for (const dest of navigation) {
    try {
      await closeVisibleOverlays();
      if (!await clickVisible(`[data-vaia="${dest}"]`)) {
        const modes = {terminale:'terminal',board:'dashboard',chat:'chat'};
        if (!modes[dest] || !await clickVisible(`[data-mode="${modes[dest]}"]`)) {
          report.surfaces.push({id:`view-${dest}`,status:'BLOCKED',reason:'No visible navigation action in the fresh real profile; no forced DOM activation.'});continue;
        }
      }
      await pause(650);await capture(`view-${dest}`, { requestedView:dest });
    } catch(e) { report.surfaces.push({id:`view-${dest}`,status:'BLOCKED',reason:redact(e.message)}); }
  }
  // Inventory all overlay destinations, then exercise only their existing non-mutating open actions.
  const overlayIds = await page.locator('.overlay-layer').evaluateAll(es=>es.map(e=>e.id));
  await clickVisible('[data-vaia="chat"], [data-mode="chat"]');
  for (const id of overlayIds) {
    try {
      await closeVisibleOverlays();
      const found = await clickVisible(`[data-apre-velo="${id}"]`);
      if (!found) { report.surfaces.push({id:`overlay-${id}`,status:'BLOCKED',reason:'No opener exposed in this profile/state; may require workspace, resource or model. No destructive action invoked.'});continue; }
      await pause(300);await capture(`overlay-${id}`,{requestedOverlay:id});
    }catch(e){report.surfaces.push({id:`overlay-${id}`,status:'BLOCKED',reason:redact(e.message)});}
  }
  await closeVisibleOverlays();
  await clickVisible('[data-vaia="impostazioni"]');
  const settings = await page.locator('[data-settings-tab]').evaluateAll(es=> [...new Set(es.map(e=>e.dataset.settingsTab))]);
  for (const key of settings) {
    try { if (await clickVisible(`[data-settings-tab="${key}"]`)) {await pause(450);await capture(`settings-${key}`);} else report.surfaces.push({id:`settings-${key}`,status:'BLOCKED',reason:'Setting navigation not exposed in this state'}); }
    catch(e){report.surfaces.push({id:`settings-${key}`,status:'BLOCKED',reason:redact(e.message)});}
  }
  await closeVisibleOverlays();await clickVisible('[data-vaia="chat"], [data-mode="chat"]');
  for (const [w,h] of [[1024,800],[390,844],[320,640]]) {
    await app.evaluate(({BrowserWindow}, size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),[w,h]);
    await pause(350);await capture(`viewport-${w}`);
  }
  for (const id of screenIds) if (!report.surfaces.some(s=>s.screens?.includes(id)))
    report.surfaces.push({id:`unobserved-${id}`,status:'BLOCKED',reason:'Not observed through available navigation; requires a dedicated fixture/state investigation.'});
  report.appMetrics = await app.evaluate(({app})=>app.getAppMetrics().map(p=>({type:p.type,cpu:p.cpu,memory:p.memory})));
  report.frontendSha256 = createHash('sha256').update(await readFile(join(root,'public/app.js'))).digest('hex');
  report.completed = true;
} catch(e) {report.fatal=redact(e.stack||e);throw e;}
finally {
  if (app) await app.close().catch(()=>{});
  report.finishedAt=new Date().toISOString();
  await writeFile(join(out,'baseline.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({completed:report.completed, observed:report.surfaces.filter(s=>s.status==='OBSERVED').length,blocked:report.surfaces.filter(s=>s.status==='BLOCKED').length,errors:report.errors.length}));
}
