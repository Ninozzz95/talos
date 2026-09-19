import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSessionRegistry } from '../../../src/session-registry.mjs';
import { createHttpApp } from '../../../src/http-app.mjs';
import { createStaticHandler } from '../../../src/static-files.mjs';

const start=Date.parse('2026-09-19T12:00:00Z');
function history() {
 const root={sessionId:'replay-root',taskCorto:'Coordinamento',conclusa:false,avviataAlle:new Date(start).toISOString(),attivita:{chiamate:0,file:[],passi:[]}};
 const child={...root,sessionId:'replay-child',padreId:'replay-root',taskCorto:'Verifica file',attivita:{chiamate:1,file:[],passi:[]}};
 return [root,child,{...child,conclusa:true,conclusaAlle:new Date(start+2000).toISOString()}].map((node,i)=>({tipo:'grafo-agenti',schema:'talos.agent-timeline.v1',rootId:'replay-root',seq:i+1,at:new Date(start+i*1000).toISOString(),event:i===2?'RunFinished':'created',node}));
}
async function scene(page,{width=1440,theme='dark'}={}) {
 await page.setViewportSize({width,height:width===1024?800:900});
 await page.addInitScript(theme=>localStorage.setItem('talos.harness.desktop.settings.v1',JSON.stringify({version:1,appearance:{colorMode:theme,interfaceMotion:false}})),theme);
 const records=history(); const control={records,fail:false,calls:0};
 await page.route('**/api/v1/sessions/replay-*/events*',r=>r.fulfill({contentType:'text/event-stream',body:'retry: 600000\n\n'}));
 await page.route('**/api/v1/sessions/replay-*/children',r=>r.fulfill({json:{ok:true,data:{figli:r.request().url().includes('replay-root')?[records[2].node]:[]}}}));
 await page.route('**/api/v1/sessions/replay-root/agent-timeline*',r=>{
  control.calls++;if(control.fail)return r.fulfill({status:503,json:{ok:false,error:{message:'Cronologia temporaneamente non disponibile'}}});
  const q=new URL(r.request().url()).searchParams, after=Number(q.get('after')||0),through=Number(q.get('through')||control.records.length);
  const items=control.records.filter(x=>x.seq>after&&x.seq<=through).slice(0,2);
  return r.fulfill({json:{ok:true,data:{schema:'talos.agent-timeline.v1',rootId:'replay-root',coverage:'complete',persisted:true,through,next:items.at(-1)?.seq<through?items.at(-1).seq:null,items}}});
 });
 await page.goto('/');await page.waitForFunction(()=>window.__talosHarnessUiRuntime);
 const open=async()=>{
  await page.evaluate(()=>window.__talosHarnessUiRuntime.passaASessione('replay-root','workspace','Coordinamento','m',{conclusa:false}));
  if(await page.locator('[data-c="GrafoAgenti"]').isVisible()) return;
  if(!await page.locator('#railTabs').isVisible())await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await expect(page.locator('#railAgenti [data-c="AgentRow"]')).toHaveCount(1);
  await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
 };
 await open();return {...control,control,open};
}

for(const width of [1024,1440])for(const theme of ['dark','light'])test(`RIPRESA-REPLAY-PLAYER ${width} ${theme}: seek, pausa, arrivi live e reload`,async({page},info)=>{
 const {control,open}=await scene(page,{width,theme});const g=page.locator('[data-c="GrafoAgenti"]');
 const slider=g.getByRole('slider',{name:'Cronologia osservata del diagramma'});
 await expect(slider).toHaveAttribute('max','2');await expect(g).toContainText('Dall’avvio');
 await slider.fill('0');await expect(g.locator('[data-nodo-id]')).toHaveCount(1);
 await slider.fill('1');await expect(g.locator('[data-nodo-id="replay-child"]')).toHaveAttribute('data-stato','active');
 await expect(g.locator('[data-nodo-id="replay-child"] .talos-grafo__durata')).toHaveText('1 s');
 control.records.push({...control.records[2],seq:4,at:new Date(start+3000).toISOString(),node:{...control.records[2].node,taskCorto:'Nome futuro'}});
 await g.getByRole('button',{name:'Aggiorna',exact:true}).click();
 await expect(slider).toHaveAttribute('max','3');await expect(slider).toHaveValue('1');
 await expect(g).not.toContainText('Nome futuro');await expect(g).toContainText('2 nuovi');
 await slider.fill('3');await expect(g).toHaveAttribute('data-replay','true');
 await slider.fill('0');await g.getByRole('button',{name:'Riproduci',exact:true}).click();
 await expect(g.locator('[data-nodo-id="replay-child"]')).toBeVisible({timeout:5000});
 await g.getByRole('button',{name:'Pausa',exact:true}).click();
 const paused=await slider.inputValue();await page.waitForTimeout(1100);await expect(slider).toHaveValue(paused);
 await slider.fill('1');
 for(const close of await page.locator('#regioneToast button').all()) if(await close.isVisible()) await close.click();
 await page.screenshot({path:info.outputPath(`replay-${width}-${theme}.png`),fullPage:true});
 const geometry=await g.locator('.talos-grafo__timeline').evaluate(e=>({width:e.scrollWidth,client:e.clientWidth}));expect(geometry.width).toBeLessThanOrEqual(geometry.client+1);
 await g.getByRole('button',{name:'Torna in diretta'}).click();await expect(g).toHaveAttribute('data-replay','false');
 await page.reload();await page.waitForFunction(()=>window.__talosHarnessUiRuntime);await open();
 await expect(slider).toHaveAttribute('max','3');await slider.fill('0');await expect(g.locator('[data-nodo-id]')).toHaveCount(1);
});

test('RIPRESA-REPLAY-HTTP-UI: registro reale, apertura tardiva e riavvio senza fixture di rete',async({page},info)=>{
 test.setTimeout(45000);
 const store=mkdtempSync(join(tmpdir(),'talos-replay-ui-')),runs=[];
 const options={cartellaStore:store,modello:'test',chiave:'test',guardaWorkspaceFn:()=>()=>{},cartellaEsisteFn:()=>true,
  preparaEsecuzioneFn:()=>({cartella:store,task:{id:'task',consegna:'Controlla il progetto'}}),
  avviaSessioneFn:input=>new Promise(resolve=>{runs.push({input,resolve});input.onEvento({type:'RunStarted',input:{consegna:'Controlla il progetto'}});})};
 let registry=createSessionRegistry(options),server;
 const listen=async(port=0)=>{
  server=createServer(createHttpApp({sessionRegistry:registry,staticHandler:createStaticHandler(process.env.TALOS_RIPRESA_BUNDLE)}));
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));return server.address().port;
 };
 const close=async()=>{const promise=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await promise;};
 try{
  const {sessionId:root}=registry.avvia('task');const child=await runs[0].input.onDelega('Verifica i file');
  runs[1].input.onEvento({type:'ToolCallStart',toolCallId:'read',toolCallName:'leggi'});
  const before=await registry.timelineAgenti(root,{limit:500});expect(before.coverage).toBe('complete');
  const port=await listen();const base=`http://127.0.0.1:${port}`;
  await page.goto(base);await page.locator(`[data-real-session-id="${root}"]`).click();
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();
  const graph=page.locator('[data-c="GrafoAgenti"]'),slider=graph.getByRole('slider');
  await expect(slider).toHaveAttribute('max',String(before.items.length-1));
  await slider.fill('0');await expect(graph.locator('[data-nodo-id]')).toHaveCount(1);
  await slider.fill(String(before.items.length-1));await expect(graph.locator(`[data-nodo-id="${child.childId}"]`)).toHaveAttribute('data-stato','active');
  const pos=await slider.inputValue();
  runs[1].input.onEvento({type:'ToolCallResult',toolCallId:'read',content:'ok'});
  await expect(graph).toContainText('1 nuovi',{timeout:10000});await expect(slider).toHaveValue(pos);
  for(const run of runs){run.input.onEvento({type:'RunFinished'});run.resolve({ok:true,esito:{detto:'Fine',comeFinita:'concluso',messaggiFinali:[]}});}
  await expect(graph.getByRole('button',{name:'Torna in diretta'})).toBeVisible();
  await graph.getByRole('button',{name:'Torna in diretta'}).click();
  await expect(graph.locator(`[data-nodo-id="${child.childId}"]`)).toHaveAttribute('data-stato','done');
  const complete=await registry.timelineAgenti(root,{limit:500});
  await page.goto('about:blank');await close();
  registry=createSessionRegistry(options);await registry.ripristina();await listen(port);
  const restored=await registry.timelineAgenti(root,{limit:500});expect(restored.items).toEqual(complete.items);
  await page.goto(base);await page.locator(`[data-real-session-id="${root}"]`).click();
  if(!await graph.isVisible()){await page.locator('#railTabs [data-rail="agenti"]').click();await page.locator('#railAgenti').getByRole('button',{name:'Apri visuale diagramma'}).click();}
  await expect(slider).toHaveAttribute('max',String(complete.items.length-1));await slider.fill('0');
  await expect(graph.locator('[data-nodo-id]')).toHaveCount(1);
  const framing=await graph.evaluate(e=>{const a=e.querySelector('[data-nodo-id]').getBoundingClientRect(),b=e.querySelector('.talos-grafo__canvas').getBoundingClientRect();return {top:a.top,left:a.left,bottom:a.bottom,right:a.right,canvas:{top:b.top,left:b.left,bottom:b.bottom,right:b.right}};});
  expect(framing.top,'RIPRESA-REPLAY-INQUADRATURA: primo frame non tagliato').toBeGreaterThanOrEqual(framing.canvas.top);
  expect(framing.bottom).toBeLessThanOrEqual(framing.canvas.bottom);
  for(const dismiss of await page.locator('#regioneToast button').all()) if(await dismiss.isVisible()) await dismiss.click();
  await page.screenshot({path:info.outputPath('replay-registro-reale.png'),fullPage:true});
 }finally{
  await page.goto('about:blank');
  for(const run of runs)run.resolve({ok:true,esito:{messaggiFinali:[]}});
  if(server?.listening)await close();
  await new Promise(resolve=>setTimeout(resolve,50));rmSync(store,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
});

test('RIPRESA-REPLAY-ERRORE: storico conservato, errore visibile e riprova',async({page})=>{
 const {control}=await scene(page);const g=page.locator('[data-c="GrafoAgenti"]');const slider=g.getByRole('slider');
 await expect(slider).toHaveAttribute('max','2');await slider.fill('1');control.fail=true;
 await g.getByRole('button',{name:'Aggiorna',exact:true}).click();await expect(g).toContainText('Cronologia non aggiornata');
 await expect(slider).toHaveValue('1');control.fail=false;await g.getByRole('button',{name:'Riprova cronologia'}).click();
 await expect(g).not.toContainText('Cronologia non aggiornata');await expect(slider).toHaveValue('1');
});
