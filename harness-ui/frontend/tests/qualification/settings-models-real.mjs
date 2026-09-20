import {selectValue,checkValue,pickerVisible} from './custom-control-driver.mjs';
/** SET-01/MODEL-01 visual inventory, actual server and original storage contracts. No inference. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
const root = resolve(import.meta.dirname, '../../../..');
const out = resolve(process.env.TALOS_EVIDENCE_DIR || join(root, 'harness-ui/frontend/test-results/settings-models'));
const data = await mkdtemp(join(tmpdir(), 'talos-settings-models-'));
const base = 'http://127.0.0.1:5196';
await mkdir(out, { recursive: true });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(TALOS_|OPENAI_|ANTHROPIC_|OPENROUTER_|GOOGLE_API_KEY|GEMINI_API_KEY|NODE_OPTIONS)/i.test(key)));
const result = { source: execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(), node: process.version, mockedApis: false, paidInference: false, screenshots: [], checks: [], errors: [], warnings: [], failures: [], inspectedVisually: false };
const server = spawn(process.execPath, [join(root, 'harness-ui/server.mjs')], { cwd: root, env: { ...env, TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: '5196', TALOS_DESKTOP_PROFILE: 'preview', TALOS_DESKTOP_DATA_DIR: data, TALOS_HARNESS_UI_SESSIONS_DIR: join(data, 'sessions'), TALOS_HARNESS_UI_PUBLIC_DIR: join(root, 'harness-ui/frontend/dist') }, stdio: ['ignore','pipe','pipe'] });
let logs = '', browser, page;
server.stdout.on('data', d => { logs += d; }); server.stderr.on('data', d => { logs += d; });
async function snapshot(name) {
  await wait(120);
  const file = name + '.png'; await page.screenshot({ path: join(out, file) });
  const dimensions = await page.locator('#schermoImpostazioni > .talos-page').evaluate(el=>({ top:el.scrollTop,height:el.clientHeight,total:el.scrollHeight,overflow:el.scrollWidth>el.clientWidth+1 }));
  result.screenshots.push({ file, viewport:page.viewportSize(),...dimensions });
}
async function captureSection(name) {
  const scroll = page.locator('#schermoImpostazioni > .talos-page');
  const size = await scroll.evaluate(el=>{el.scrollTop=0;return {height:el.clientHeight,total:el.scrollHeight};});
  assert.ok(size.height>100,'The settings scroll container must be visible.');
  const count = Math.max(1,Math.ceil((size.total-size.height)/Math.max(200,size.height-160))+1);
  assert.ok(count<=14,'Unbounded page height: '+name);
  for(let i=0;i<count;i++) { await scroll.evaluate((el,top)=>{el.scrollTop=top;},i*Math.max(200,size.height-160)); await snapshot(name+'-'+String(i+1).padStart(2,'0')); }
  await scroll.evaluate(el=>{el.scrollTop=0;});
}
async function choose(id) {
  const select = page.locator('[data-settings-mobile]');
  if (await pickerVisible(select)) await selectValue(select,id);
  else await page.locator('#schermoImpostazioni [data-settings-tab="'+id+'"]').click();
  // Exact outer panel: legacy fragments and the nested lab also have data-settings-panel.
  await page.locator('#setting-panel-'+id).waitFor({state:'visible'});
}
async function check(name,fn) {
  try { await fn(); result.checks.push({name,passed:true}); }
  catch(e) { result.failures.push({name,error:String(e.stack||e)});try{await snapshot('failure-'+name);}catch{/* Preserve original failure. */} }
}
async function search(query) { await page.locator('[data-settings-query]').fill(query); }
async function color(mode) {
  await choose('appearance');
  await page.locator('[data-td-studio-temi] button').click();
  await page.locator('.td-theme-studio [data-modo="'+mode+'"]').click();
  await page.keyboard.press('Escape');
  await page.locator('.td-theme-studio').waitFor({state:'hidden'});
}
try {
  const deadline=Date.now()+30000;
  for(;;) {try {if((await fetch(base+'/api/v1/health')).ok)break;}catch{} if(server.exitCode!==null||Date.now()>deadline)throw Error('Server unavailable: '+logs.slice(-3000));await wait(100);}
  browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark',locale:'it-IT'});
  page=await context.newPage();page.setDefaultTimeout(6000);
  page.on('pageerror',e=>result.errors.push(e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))result.warnings.push({type:m.type(),text:m.text().slice(0,500)});});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#talosAvvio').waitFor({state:'hidden',timeout:20000});
  await page.locator('.talos-sidebar [data-vaia="impostazioni"]').first().click();
  await page.locator('#schermoImpostazioni').waitFor({state:'visible'});
  const sections=await page.locator('#schermoImpostazioni [data-settings-tab]').evaluateAll(nodes=>nodes.map(n=>n.dataset.settingsTab));
  assert.equal(sections.length,10);assert.equal(new Set(sections).size,10);result.sections=sections;
  result.redesigned=await page.locator('#schermoImpostazioni').getAttribute('data-settings-ui')==='v3';
  for(const mode of ['dark','light']) {
    await page.setViewportSize({width:1440,height:1000}); await color(mode);
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      for(const id of sections) await check('settings-'+id+'-'+mode+'-'+width,async()=>{await choose(id);await captureSection('settings-'+id+'-'+mode+'-'+width);});
      await choose('models');
      const labs=await page.locator('#setting-panel-models [data-model-lab-tab]').evaluateAll(nodes=>nodes.map(n=>n.dataset.modelLabTab));
      assert.equal(labs.length,6);result.modelSections=labs;
      for(const id of labs)await check('models-'+id+'-'+mode+'-'+width,async()=>{
        const select=page.locator('[data-model-lab-mobile]');
        if(await pickerVisible(select))await selectValue(select,id);else await page.locator('#setting-panel-models [data-model-lab-tab="'+id+'"]').click();
        await page.locator('#setting-panel-models [data-model-lab-panel="'+id+'"]').waitFor({state:'visible'});await captureSection('models-'+id+'-'+mode+'-'+width);
      });
    }
  }
  await page.setViewportSize({width:1440,height:1000});await color('dark');
  if(result.redesigned) {
    await check('search-advanced',async()=>{await search('elastica');await snapshot('search-advanced');await page.locator('[data-settings-result="motionEasingSelect"]').click();assert.equal(await page.locator('[data-settings-advanced]').getAttribute('open'),'');assert.equal(await page.locator('#motionEasingSelect--calm').evaluate(el=>el===document.activeElement),true);await snapshot('advanced-focused');});
    await check('search-theme-studio',async()=>{await search('bilanciata');await snapshot('search-studio');await page.locator('[data-settings-result="motionQualitySelect"]').click();await page.locator('#td-studio-motionQualitySelect--calm').waitFor({state:'visible'});await snapshot('studio-deep-link');await page.keyboard.press('Escape');});
    await check('search-provider-section',async()=>{await search('api key');await snapshot('search-provider');await page.locator('[data-settings-result="providers"]').click();await page.locator('#setting-panel-providers').waitFor({state:'visible'});});
    await check('search-no-results',async()=>{await search('zz-no-setting');assert.equal(await page.locator('[data-settings-result]').count(),0);await snapshot('search-empty');await page.locator('[data-settings-clear]').click();});
    await check('single-setting-reset-and-save',async()=>{
      await choose('appearance');const control=page.locator('#uiFontScaleSelect');await selectValue(control,'large');
      await page.locator('[data-settings-save][data-state="saved"]').waitFor();await snapshot('setting-changed');
      await page.locator('[data-setting-reset="uiFontScaleSelect"]').click();assert.equal(await control.inputValue(),'default');assert.equal(await page.locator('[data-setting-reset="uiFontScaleSelect"]').isVisible(),false);await snapshot('setting-reset');
      await page.reload();await page.locator('#talosAvvio').waitFor({state:'hidden'});await page.locator('.talos-sidebar [data-vaia="impostazioni"]').first().click();await choose('appearance');assert.equal(await page.locator('#uiFontScaleSelect').inputValue(),'default');
    });
    await check('save-failure-is-not-success',async()=>{
      await page.evaluate(()=>{window.__restoreSettingsWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='talos.harness.desktop.settings.v1')throw new DOMException('Synthetic storage failure','QuotaExceededError');return window.__restoreSettingsWrite.call(this,k,v);};});
      try{await selectValue(page.locator('#uiFontScaleSelect'),'large');await page.locator('[data-settings-save][data-state="unsaved"]').waitFor();await snapshot('settings-save-error');}
      finally{await page.evaluate(()=>{Storage.prototype.setItem=window.__restoreSettingsWrite;delete window.__restoreSettingsWrite;});await selectValue(page.locator('#uiFontScaleSelect'),'default');}
    });
    await check('vertical-keyboard-navigation',async()=>{await choose('appearance');await page.locator('#setting-tab-appearance').focus();await page.keyboard.press('ArrowDown');await page.locator('#setting-panel-chat').waitFor({state:'visible'});assert.equal(await page.locator('#setting-tab-chat').evaluate(el=>el===document.activeElement),true);await snapshot('settings-keyboard');});
    await check('english-without-remount',async()=>{await choose('appearance');await selectValue(page.locator('#setting-uiLanguageSelect'),'en');assert.equal(await page.locator('.settings-header h1').textContent(),'Settings');await search('elastica');assert.equal(await page.locator('[data-settings-result="motionEasingSelect"]').count(),1);await snapshot('search-english');await search('');});
    for(const id of sections)await check('settings-'+id+'-english',async()=>{await choose(id);await captureSection('settings-'+id+'-english');});
    await choose('appearance');await selectValue(page.locator('#setting-uiLanguageSelect'),'it');
    for(const width of [320,768])await check('appearance-reflow-'+width,async()=>{await page.setViewportSize({width,height:1000});await choose('appearance');await captureSection('settings-reflow-'+width);});
    await page.setViewportSize({width:1440,height:1000});await choose('appearance');
    await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});await captureSection('settings-forced-colors');await page.emulateMedia({reducedMotion:'no-preference',forcedColors:'none'});
  }
  result.controls=await page.locator('#schermoImpostazioni input,#schermoImpostazioni select,#schermoImpostazioni textarea').evaluateAll(nodes=>nodes.map(n=>({id:n.id,type:n.type,row:n.closest('[data-setting-row]')?.dataset.settingRow||null})));
  await writeFile(join(out,'settings-dom.html'),await page.locator('#schermoImpostazioni').innerHTML());
}catch(e){result.failures.push({name:'setup',error:String(e.stack||e)});}
finally{
  await browser?.close();
  if(server.exitCode===null){const exit=once(server,'exit');server.kill('SIGTERM');if(!await Promise.race([exit.then(()=>true),wait(8000).then(()=>false)])){server.kill('SIGKILL');result.failures.push({name:'shutdown',error:'Graceful shutdown timed out.'});}}
  await writeFile(join(out,'capture.json'),JSON.stringify(result,null,2));await writeFile(join(out,'server.log'),logs);
}
console.log(JSON.stringify({screenshots:result.screenshots.length,checks:result.checks.length,failures:result.failures,errors:result.errors},null,2));
if(result.failures.length||result.errors.length)process.exitCode=1;
