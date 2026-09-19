import { chromium } from '../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash,randomUUID } from 'node:crypto';
import { join } from 'node:path';
const id=`grafo-live-${new Date().toISOString().replaceAll(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`;
const output=new URL(`./${id}/`,import.meta.url);mkdirSync(output);
const mockupFile='C:/Users/Antonino/Downloads/talos-sidebar-calm-review.html';
const mockup=readFileSync(mockupFile);
const hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(mockup)!=='59b2b6d1ce90f7b29a74f6ba0f9646f3be980776767e6b0930c27882f8ce20f1')throw Error('Mockup diverso dal pin owner');
const j=await(await fetch('http://127.0.0.1:4174/api/v1/sessions')).json(),sessions=(j.data||j).items;
const candidates=sessions.filter(s=>!s.padreId&&sessions.some(c=>c.padreId===s.sessionId));
candidates.sort((a,b)=>String(b.avviataAlle).localeCompare(String(a.avviataAlle)));
if(!candidates.length)throw Error('Nessuna sessione reale con deleghe per verifica');
const selected=candidates[0];
const report={id,mockupFile,mockupSha256:hash(mockup),sessionId:selected.sessionId,captures:[],limits:['Mockup PR33 contiene fixture ed e solo scuro; prodotto usa sessioni reali. Chiaro verificato separatamente nei test browser.','Grafo esteso oltre mockup per richiesta owner; differenze funzionali intenzionali.','Nessuna chiamata mutante o WebSocket ammessa.']};
const browser=await chromium.launch({headless:true});
try{
 for(const [width,height,mode] of [[1024,800,'dark'],[1440,900,'dark'],[2560,1440,'dark']])for(const kind of ['mockup','4174']){
  const blocked=[],errors=[],sockets=[];
  const context=await browser.newContext({viewport:{width,height},colorScheme:mode,reducedMotion:'reduce'});
  await context.routeWebSocket('**/*',ws=>{sockets.push(ws.url());ws.close()});
  await context.route('**/*',async r=>{const u=new URL(r.request().url());if(r.request().method()!=='GET'){blocked.push({method:r.request().method(),path:u.pathname});return r.abort();}if(u.pathname==='/__mockup_graph.html')return r.fulfill({contentType:'text/html',body:mockup});if(u.hostname==='127.0.0.1'&&u.port==='4174'&&!u.pathname.includes('/terminal'))return r.continue();if(['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)&&kind==='mockup')return r.continue();blocked.push({method:'GET',path:u.origin+u.pathname});return r.abort();});
  await context.addInitScript(mode=>{if(window!==window.top)return;localStorage.setItem('talos.harness.desktop.settings.v1',JSON.stringify({version:1,appearance:{colorMode:mode,themePreset:'calm',themePresetVersione:2,interfaceMotion:false,backgroundMotion:false}}));},mode);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  if(kind==='mockup'){
   await page.goto('http://127.0.0.1:4178/__mockup_graph.html');
   await page.evaluate(mode=>document.documentElement.dataset.mode=mode,mode);
   await page.locator('[data-tab="agents"]').click();
   await page.locator('[data-action="open-graph"]').first().click();
   await page.locator('#graphCanvas').waitFor();
  }else{
   await page.goto('http://127.0.0.1:4174/');await page.locator('#talosAvvio').waitFor({state:'detached',timeout:15000});
   await page.locator(`[data-real-session-id="${selected.sessionId}"]`).first().click();
   const tabs=page.locator('#railTabs');if(!await tabs.isVisible())await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
   await page.locator('#railTabs [data-rail="agenti"]').click();
   await page.waitForTimeout(1000);
   const sidebarFile=`4174-sidebar-${width}x${height}-${mode}.png`;
   await page.screenshot({path:new URL(sidebarFile,output).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
   const agentCount=await page.locator('#railAgenti [data-c="AgentRow"]').count();
   report.captures.push({file:sidebarFile,kind:'4174-sidebar',width,height,mode,agentCount});
   await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
   await page.locator('[data-c="GrafoAgenti"] [data-nodo-id]').first().waitFor();
   const nodeCount=await page.locator('[data-c="GrafoAgenti"] [data-nodo-id]').count();
   if(nodeCount!==agentCount+1)throw Error(`Conteggi incoerenti: ${agentCount} agenti, ${nodeCount} nodi`);
   const letturaFile=`4174-lettura-${width}x${height}-${mode}.png`;
   const zoom=parseInt(await page.locator('[data-c="GrafoAgenti"] [data-zoom]').innerText());
   if(zoom<80)throw Error('Vista Lettura troppo piccola');
   await page.screenshot({path:new URL(letturaFile,output).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
   report.captures.push({file:letturaFile,kind:'4174-lettura',width,height,mode,zoom,nodeCount,agentCount});
   await page.locator('[data-c="GrafoAgenti"]').getByRole('button',{name:'Adatta',exact:true}).click();
   const title=page.locator('[data-c="GrafoAgenti"] .talos-grafo__nome').first();await title.hover();await page.waitForTimeout(450);
   if(await title.evaluate(n=>Boolean(n.title||n.getAttribute('data-tip')))||await page.locator('#talosTip').isVisible())throw Error('Tooltip titolo ancora presente');
  }
  await page.evaluate(()=>document.fonts.ready);
  const file=`${kind}-${width}x${height}-${mode}.png`;
  await page.screenshot({path:new URL(file,output).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
  const geometry=await page.evaluate(kind=>{const n=document.querySelector(kind==='4174'?'.talos-grafo':'.workspace-view'),r=n.getBoundingClientRect();return {width:r.width,height:r.height,overflow:n.scrollWidth>n.clientWidth+1,nodes:document.querySelectorAll(kind==='4174'?'[data-nodo-id]':'.node').length};},kind);
  report.captures.push({file,kind,width,height,mode,geometry,blocked,errors,sockets});await context.close();console.log(file);
 }
}finally{await browser.close();report.mockupUnchanged=hash(readFileSync(mockupFile))===report.mockupSha256;writeFileSync(new URL('report.json',output),JSON.stringify(report,null,2));
 const groups=report.captures.filter(c=>c.kind==='mockup').map(c=>`<section><h2>${c.width} × ${c.height} ${c.mode}</h2><div>${['mockup','4174'].map(k=>`<figure><figcaption>${k}</figcaption><img src="${k}-${c.width}x${c.height}-${c.mode}.png"></figure>`).join('')}</div></section>`).join('');
 writeFileSync(new URL('confronto.html',output),`<!doctype html><meta charset="utf-8"><style>body{background:#202124;color:#eee;font:16px system-ui}section>div{display:grid;grid-template-columns:1fr 1fr}figure{margin:8px}img{width:100%}</style><h1>Grafo: talos-sidebar-calm-review.html e prodotto 4174</h1><p>Fixture e lavoro reale distinti; estensioni autorizzate per statistiche e tracking.</p>${groups}`);console.log(output.href);}
