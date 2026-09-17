/** Actual backend + production bundle. No inference, no model/provider fixtures. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {CAMPI_IMPOSTAZIONI as fields} from '../../src/components/impostazioni-campi.js';
import {CONTROLLI_MIGRATI as studioIds} from '../../src/components/theme-studio.js';
const frontend=resolve(import.meta.dirname,'../..'),root=resolve(frontend,'../..');
const out=resolve(process.env.TALOS_EVIDENCE_DIR||join(frontend,'test-results/calm-controls'));
await mkdir(out,{recursive:true});const data=await mkdtemp(join(tmpdir(),'talos-calm-review-'));
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^(TALOS_|OPENAI_|ANTHROPIC_|OPENROUTER_|GOOGLE_API_KEY|GEMINI_API_KEY|NODE_OPTIONS)/i.test(key)));
const report={sha:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),node:process.version,mockedApis:false,paidInference:false,tests:[],errors:[],warnings:[],failures:[]};
const base='http://127.0.0.1:5197';const server=spawn(process.execPath,[join(root,'harness-ui/server.mjs')],{cwd:root,env:{...env,TALOS_HARNESS_UI_HOST:'127.0.0.1',TALOS_HARNESS_UI_PORT:'5197',TALOS_DESKTOP_PROFILE:'preview',TALOS_DESKTOP_DATA_DIR:data,TALOS_HARNESS_UI_SESSIONS_DIR:join(data,'sessions'),TALOS_HARNESS_UI_PUBLIC_DIR:join(frontend,'dist')},stdio:['ignore','pipe','pipe']});
let logs='',browser,page;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const sourceId=f=>['uiDensitySelect','uiLanguageSelect'].includes(f.id)?'setting-'+f.id:f.id;
async function check(name,fn){try{await fn();report.tests.push({name,passed:true});}catch(e){report.failures.push({name,error:String(e.stack||e)});try{await page.screenshot({path:join(out,'failure-'+report.failures.length+'.png')});}catch{}}}
async function section(id){
 const native=page.locator('[data-settings-mobile]');const mobile=native.locator('xpath=following-sibling::*[1]').getByRole('combobox');
 if(await mobile.isVisible())await choose(native,id);
 else await page.locator('#setting-tab-'+id).click();
 await page.locator('#setting-panel-'+id).waitFor({state:'visible'});
}
async function choose(source,value){
 const index=await source.evaluate((s,v)=>[...s.options].findIndex(o=>o.value===v),value);assert.ok(index>=0,'Requested option exists');
 const control=source.locator('xpath=following-sibling::*[1]').getByRole('combobox');await control.focus();await control.press('Home');
 for(let n=0;n<index;n++)await control.press('ArrowDown');await control.press('Enter');
 assert.equal(await source.inputValue(),value);
}
async function studio(open){const active=await page.locator('.td-theme-studio').count()>0;if(open&&!active){await section('appearance');await page.locator('[data-td-studio-temi] button').click();await page.locator('.td-theme-studio').waitFor();}if(!open&&active){await page.keyboard.press('Escape');await page.locator('.td-theme-studio').waitFor({state:'hidden'});}}
async function actualValue(f){const source=page.locator('#'+sourceId(f));return f.tipo==='checkbox'?await source.isChecked():await source.inputValue();}
async function access(f){
 const inStudio=studioIds.includes(f.id);await studio(inStudio);
 if(inStudio)return page.locator('#td-studio-'+f.id);
 await section(f.sezione==='chat'?'chat':'appearance');
 await page.locator('[data-setting-row="'+f.id+'"]').evaluate(row=>{for(let p=row;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
 return page.locator('#'+sourceId(f));
}
try{
 const deadline=Date.now()+30000;for(;;){try{if((await fetch(base+'/api/v1/health')).ok)break;}catch{}if(server.exitCode!==null||Date.now()>deadline)throw Error('Backend unavailable: '+logs.slice(-2500));await wait(100);}
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark',locale:'it-IT'});page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))report.warnings.push(m.text().slice(0,400));});
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#talosAvvio').waitFor({state:'hidden',timeout:20000});await page.locator('.talos-sidebar [data-vaia="impostazioni"]').first().click();await section('appearance');await page.locator('#uiFontScaleSelect--calm').waitFor();
 assert.equal(fields.length,40);const expected={};
 for(const f of fields)await check('real-control-'+f.chiave,async()=>{
  if(f.chiave==='themePreset'){await studio(true);await page.locator('.td-theme-list [data-tema="aurora"]').click();expected[f.id]='aurora';}
  else if(f.chiave==='colorMode'){await studio(true);await page.locator('.td-theme-studio [data-modo="light"]').click();expected[f.id]='light';}
  else {const source=await access(f);const custom=page.locator('#'+await source.getAttribute('id')+'--calm');await custom.waitFor({state:'visible'});assert.equal(await source.isVisible(),false);
   if(f.tipo==='select'){const before=await source.inputValue();const next=f.opzioni.find(([value])=>value!==before)[0];await choose(source,next);expected[f.id]=next;}
   else if(f.tipo==='checkbox'){expected[f.id]=!await source.isChecked();await custom.click();}
   else{const before=Number(await source.inputValue());const key=before===f.max?'Home':'End';expected[f.id]=String(key==='Home'?f.min:f.max);await custom.focus();await custom.press(key);}
  }
  assert.equal(await actualValue(f),expected[f.id]);
 });
 await studio(false);await page.screenshot({path:join(out,'real-settings-custom.png')});
 await check('real-storage-roundtrip-all-40',async()=>{await page.reload();await page.locator('#talosAvvio').waitFor({state:'hidden'});await page.locator('.talos-sidebar [data-vaia="impostazioni"]').first().click();await section('appearance');await page.locator('#uiFontScaleSelect--calm').waitFor();for(const f of fields){assert.ok(Object.hasOwn(expected,f.id),'Field must have been exercised: '+f.id);assert.equal(await actualValue(f),expected[f.id],f.chiave);}});
 await check('all-14-real-theme-choices',async()=>{await studio(true);const choices=page.locator('.td-theme-list [data-tema]');assert.equal(await choices.count(),14);for(const [id] of fields.find(f=>f.chiave==='themePreset').opzioni){await page.locator('.td-theme-list [data-tema="'+id+'"]').click();assert.equal(await page.locator('html').getAttribute('data-talos-theme'),id);}await page.screenshot({path:join(out,'real-studio-custom.png')});});
 await check('custom-Escape-before-real-overlay',async()=>{await studio(true);await page.locator('#td-studio-motionQualitySelect--calm').click();assert.equal(await page.getByRole('listbox').count(),1);await page.keyboard.press('Escape');assert.equal(await page.getByRole('listbox').count(),0);assert.equal(await page.locator('.td-theme-studio').count(),1);await page.keyboard.press('Escape');await page.locator('.td-theme-studio').waitFor({state:'hidden'});});
 await check('real-mobile-custom-navigation',async()=>{await page.setViewportSize({width:390,height:900});await section('models');assert.equal(await page.locator('[data-settings-mobile]').isVisible(),false);await section('appearance');await page.screenshot({path:join(out,'real-mobile-custom.png')});await page.setViewportSize({width:1440,height:1000});});
 await check('real-setting-reset-and-quota-failure',async()=>{await studio(false);await section('appearance');await choose(page.locator('#uiFontScaleSelect'),'large');await page.locator('[data-setting-reset="uiFontScaleSelect"]').click();assert.equal(await page.locator('#uiFontScaleSelect').inputValue(),'default');await page.evaluate(()=>{window.oldWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='talos.harness.desktop.settings.v1')throw new DOMException('test quota','QuotaExceededError');return oldWrite.call(this,k,v)};});try{await choose(page.locator('#uiFontScaleSelect'),'large');await page.locator('[data-settings-save][data-state="unsaved"]').waitFor();}finally{await page.evaluate(()=>{Storage.prototype.setItem=window.oldWrite;delete window.oldWrite});}});
 report.nativeVisible=await page.locator('#schermoImpostazioni select:visible,#schermoImpostazioni input[type=checkbox]:visible,#schermoImpostazioni input[type=range]:visible').count();assert.equal(report.nativeVisible,0);
}catch(e){report.failures.push({name:'setup-or-final-gate',error:String(e.stack||e)});}
finally{await browser?.close();if(server.exitCode===null){const exit=once(server,'exit');server.kill('SIGTERM');if(!await Promise.race([exit.then(()=>true),wait(8000).then(()=>false)])){server.kill('SIGKILL');report.failures.push({name:'shutdown',error:'Graceful shutdown timeout'});}}await writeFile(join(out,'product-real.json'),JSON.stringify(report,null,2));await writeFile(join(out,'server.log'),logs);}
console.log(JSON.stringify({pass:report.tests.length,fail:report.failures,errors:report.errors},null,2));if(report.failures.length||report.errors.length)process.exitCode=1;
