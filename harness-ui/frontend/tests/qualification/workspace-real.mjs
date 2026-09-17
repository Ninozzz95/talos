/** Product qualification: real server, original API, production bundle. No model call. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
const root = resolve(import.meta.dirname, '../../../..');
const out = resolve(process.env.TALOS_EVIDENCE_DIR || join(root, 'harness-ui/frontend/test-results/workspace-real'));
const data = await mkdtemp(join(tmpdir(), 'talos-workspace-real-'));
const port = Number(process.env.TALOS_TEST_PORT || 5193);
const base = `http://127.0.0.1:${port}`;
await mkdir(out, {recursive:true});
const result={source:process.env.GITHUB_SHA || null,node:process.version,mockedApis:false,checks:[],screens:[],errors:[],warnings:[],complete:false};
const check=(name,condition)=>{result.checks.push({name,passed:Boolean(condition)});assert.ok(condition,name);};
let logs='',browser;
const server=spawn(process.execPath,[join(root,'harness-ui/server.mjs')],{cwd:root,env:{...process.env,TALOS_HARNESS_UI_HOST:'127.0.0.1',TALOS_HARNESS_UI_PORT:String(port),TALOS_DESKTOP_DATA_DIR:data,TALOS_HARNESS_UI_SESSIONS_DIR:join(data,'sessions'),TALOS_HARNESS_UI_PUBLIC_DIR:join(root,'harness-ui/frontend/dist'),TALOS_INTRO:'1'},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',d=>{logs+=String(d);});server.stderr.on('data',d=>{logs+=String(d);});
try{
 const deadline=Date.now()+30000;
 for(;;){try{if((await fetch(base+'/api/v1/health')).ok)break;}catch{}if(server.exitCode!==null||Date.now()>deadline)throw Error('Server unavailable '+logs);await wait(100);}
 browser=await chromium.launch();
 const context=await browser.newContext({viewport:{width:1440,height:960},locale:'it-IT'});
 const page=await context.newPage();
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')result.warnings.push(m.text().slice(0,600));});
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.documentElement.dataset.workspaceUi==='v2'&&document.documentElement.dataset.schermo==='home');
 await page.locator('#talosAvvio').waitFor({state:'hidden',timeout:15000});
 await wait(1500);
 check('fresh profile has real Home',await page.locator('#schermoHome').isVisible());
 check('neither wizard exists',await page.locator('#veloIntro,#introDialog,[data-apre-velo="veloIntro"]').count()===0);
 check('no unrequested modal',await page.locator('dialog[open],.overlay-layer:not([hidden])').count()===0);
 check('home project action wired',await page.getByRole('button',{name:'Apri un progetto',exact:true}).count()===1);
 await page.screenshot({path:join(out,'home-dark-1440.png')});
 await page.locator('[data-workspace-density]').click();
 check('density updates actual root',await page.locator('html').getAttribute('data-density')==='compact');
 await page.locator('[data-workspace-preset]').selectOption('focus');
 check('preset applies',await page.locator('html').getAttribute('data-workspace-preset')==='focus');
 await page.reload();await page.locator('#talosAvvio').waitFor({state:'hidden'});
 check('density survives real storage reload',await page.locator('html').getAttribute('data-density')==='compact');
 check('preset survives real storage reload',await page.locator('html').getAttribute('data-workspace-preset')==='focus');
 await page.locator('[data-workspace-density]').click();
 await page.locator('[data-workspace-preset]').selectOption('development');
 // Genuine button paths (not runtime debug setView): select model and project.
 await page.getByRole('button',{name:'Scegli un modello',exact:true}).click();await wait(300);
 check('home opens existing model sheet',await page.locator('dialog[open],.overlay-layer:not([hidden])').count()>0);
 await page.keyboard.press('Escape');await wait(100);
 await page.getByRole('button',{name:'Apri un progetto',exact:true}).click();await wait(300);
 check('project uses real workspace chooser',await page.locator('dialog[open],.overlay-layer:not([hidden])').count()>0);
 await page.keyboard.press('Escape');await wait(100);
 const destinations=['chat','note','attivita','libreria','memoria','ricerca','progetti','board','impostazioni','modelli','capability','officina','automazioni','doctor'];
 for(const name of destinations){
   const target=page.locator(`.talos-sidebar [data-vaia="${name}"]`).first();
   const group=await target.evaluate(el=>el.closest('[id].td-nav-group')?.id||'');
   if(!await target.isVisible()&&group){const disclosure=page.locator(`button[aria-controls="${group}"]`).first();if(await disclosure.getAttribute('aria-expanded')==='false')await disclosure.click();}
   await target.click();await wait(250);
   check(`destination ${name} visible`,await target.getAttribute('aria-current')==='page'||name==='modelli');
   result.screens.push({name,screen:await page.locator('html').getAttribute('data-schermo')});
   await page.screenshot({path:join(out,`view-${name}.png`)});
 }
 await page.locator('.talos-sidebar [data-vaia="chat"]').click();
 await page.locator('#schermoChat [data-vaia="terminale"]').click();await wait(600);
 check('terminal view opens',await page.locator('#schermoTerminale').isVisible());
 await page.screenshot({path:join(out,'terminal-1440.png')});
 await page.locator('.talos-sidebar [data-vaia="home"]').click();
 for(const width of [1920,1280,960,768,390,320]){
   await page.setViewportSize({width,height:900});await wait(100);
   const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,home:document.getElementById('schermoHome').scrollWidth,homeWidth:document.getElementById('schermoHome').clientWidth}));
   check(`home no document overflow ${width}`,geometry.scroll<=geometry.width+1);
   check(`home no content overflow ${width}`,geometry.home<=geometry.homeWidth+1);
   await page.screenshot({path:join(out,`home-${width}.png`)});
 }
 await page.setViewportSize({width:1440,height:960});
 await page.keyboard.press('Tab');check('keyboard has visible focus',await page.evaluate(()=>document.activeElement!==document.body));
 await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});await page.screenshot({path:join(out,'home-forced-colors.png')});
 await page.emulateMedia({forcedColors:'none'});
 // Audit only, separate from explicit assertions. Existing product findings remain visible.
 await page.addScriptTag({content:await readFile(join(root,'harness-ui/frontend/node_modules/axe-core/axe.min.js'),'utf8')});
 result.accessibility=await page.evaluate(async()=>{const r=await axe.run(document.getElementById('schermoHome'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});
 check('no page errors across tested product paths',result.errors.length===0);
 result.complete=true;
}catch(error){result.failure=error.stack;throw error;}
finally{await browser?.close();server.kill('SIGTERM');await writeFile(join(out,'server.log'),logs);await writeFile(join(out,'qualification.json'),JSON.stringify(result,null,2));}
