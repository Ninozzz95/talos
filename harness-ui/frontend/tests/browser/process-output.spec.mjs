import {test, expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtempSync, writeFileSync, readFileSync} from 'node:fs';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createStaticHandler} from '../../../src/static-files.mjs';
import {createHttpApp} from '../../../src/http-app.mjs';
import {createSessionRegistry} from '../../../src/session-registry.mjs';
import {createProcessOutputStore} from '../../../src/process-output-store.mjs';
import {avviaSessione} from '../../../src/agent-service.mjs';
import {talosLavora} from '../../../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProvaAttesa} from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

test.use({viewport:{width:1920,height:1080}, reducedMotion:'reduce'});
const output = 'Prima riga <img src=x onerror=alert(1)>\n' + 'Dato verificato: à雪🦊\n'.repeat(300) + 'FINE-OUTPUT20';
async function fixture({binary=false, limit=100_000}={}) {
  const root=mkdtempSync(join(tmpdir(),'talos-output20-')), cartellaStore=join(root,'sessions');
  const script=join(root,'producer.cjs');
  writeFileSync(script, `process.stdout.write(${JSON.stringify(output)});process.stderr.write(${binary ? 'Buffer.from([0,255,254,7])' : JSON.stringify('Diagnostica distinta, non un errore.')} );`);
  const command=`"${process.execPath}" "${script}"`;
  const store=await createProcessOutputStore({databasePath:join(root,'output.sqlite'),maxOutputBytes:limit});
  const registry=createSessionRegistry({cartellaStore,modello:'fixture20',chiave:'fixture20',
    guardaWorkspaceFn:()=>()=>{},processOutputStoreFn:()=>store,
    preparaEsecuzioneFn:id=>({cartella:root,task:{id,consegna:'Verifica output conservato.'},comandoProva:command}),
    avviaSessioneFn:input=>avviaSessione({...input,cartella:root,livelloAccesso:'completo',
      contestoDelProgettoFn:async()=>null,leggiContestoWorkspaceFn:()=>({}),
      talosLavoraFn:args=>{let call=0;return talosLavora({...args,onDelta:undefined,_giriMassimiInterno:3,
        ambienteComandiFn:()=>({dove:'windows',revisione:0}),fetchDiRete:async()=>{
          const message=call++===0?{role:'assistant',content:'',tool_calls:[{id:'tool20',type:'function',function:{name:'prova',arguments:'{}'}}]}:{role:'assistant',content:'Verifica conclusa.'};
          return Response.json({choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}]});
        },
      });},
    }),
  });
  const {sessionId}=registry.avvia('fixture20');await registry.attendiAssestamento(sessionId);
  const receipt=registry.esporta(sessionId).eventi.filter(e=>e.type==='CUSTOM'&&e.name==='talos.process-output').at(-1).value;
  const requests=[];
  const app=createHttpApp({staticHandler:createStaticHandler(fileURLToPath(new URL('../../dist/',import.meta.url))),token:'test20',sessionRegistry:registry});
  const server=createServer(async(req,res)=>{
    if(req.url.includes('/process-outputs/'))requests.push(req.url);
    // A real same-origin HTTP boundary also exercises downloads, which do not pass through page.route.
    if(!req.url.startsWith('/api/')||req.url.startsWith('/api/v1/sessions'))return app(req,res);
    try {
      const body=[];for await(const chunk of req)body.push(chunk);
      const response=await fetch(`http://127.0.0.1:4176${req.url}`,{method:req.method,headers:{'Content-Type':req.headers['content-type']||'application/json'},
        ...(body.length?{body:Buffer.concat(body)}:{})});
      const bytes=Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/octet-stream','Content-Length':bytes.length});res.end(bytes);
    }catch{res.writeHead(502);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {root,registry,store,sessionId,receipt,requests,base:`http://127.0.0.1:${server.address().port}`,
    async close(){server.closeAllConnections();await new Promise(r=>server.close(r));await registry.chiudi();await store.close();
      const child=relative(resolve(tmpdir()),resolve(root));expect(Boolean(child&&!child.startsWith('..')&&!isAbsolute(child))).toBe(true);await rimuoviCartellaDiProvaAttesa(root);},
  };
}
async function open(page,f,theme='dark') {
  await page.context().addCookies([{name:'talos_token',value:'test20',url:f.base,httpOnly:true,sameSite:'Strict'}]);
  await page.addInitScript(theme=>{if(window!==window.top)return;localStorage.setItem('talos.harness.desktop.settings.v1',JSON.stringify({version:1,appearance:{colorMode:theme,uiLanguage:'it',interfaceMotion:false}}));},theme);
  await page.goto(f.base);await page.waitForFunction(()=>window.__talosHarnessUiRuntime);await page.locator('#talosAvvio').waitFor({state:'detached'});
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await selectSession(page,f);
}
async function selectSession(page,f) {
  const metadata=f.registry.elenca().find(r=>r.sessionId===f.sessionId);
  await page.evaluate(s=>window.__talosHarnessUiRuntime.passaASessione(s.sessionId,s.taskId,s.nome,s.modello,s),metadata);
  await page.waitForFunction(()=>window.__talosHarnessUiRuntime.realSessionState.inRigiocata===false);
}
async function reveal(page) {
  const reader=page.locator('.talos-process-output');
  await expect(reader).toHaveCount(1);
  // Open the existing activity/tool disclosures through their actual controls.
  const segment=page.locator('.talos-activity').filter({has:reader});
  const head=segment.locator(':scope > .talos-activity__head').first();
  if(await head.count() && await head.getAttribute('aria-expanded')==='false')await head.click();
  const row=reader.locator('xpath=..').locator('xpath=preceding-sibling::*[1]');
  if(await row.getAttribute('aria-expanded')==='false')await row.click();
  await expect(reader.locator('summary')).toBeVisible();
  await reader.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(reader.locator('pre')).toContainText('Prima riga');
  return reader;
}
for(const theme of ['dark','light'])test(`OUTPUT20-REAL-${theme}: retained bytes are paged, selectable and restored after reload`,async({page},testInfo)=>{
  const f=await fixture(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await open(page,f,theme);expect(f.requests).toHaveLength(0);
    let reader=await reveal(page),text=await reader.locator('pre code').textContent();
    expect(await reader.evaluate(el=>({parent:el.parentElement.tagName,font:getComputedStyle(el).fontFamily}))).toEqual({parent:expect.not.stringMatching(/^PRE$/),font:expect.stringContaining('Instrument Sans')});
    await expect(reader.getByRole('button',{name:'Prima pagina'})).toHaveCSS('opacity','0.45');
    expect(await reader.locator('img').count()).toBe(0);
    await reader.getByRole('button',{name:'Pagina successiva'}).click();
    await expect(reader).not.toHaveAttribute('aria-busy','true');
    await expect(reader.locator('.talos-process-output__range')).not.toContainText('Byte 1–');
    text+=await reader.locator('pre code').textContent();
    while(await reader.getByRole('button',{name:'Pagina successiva'}).isEnabled()){
      const before=await reader.locator('.talos-process-output__range').textContent();
      await reader.getByRole('button',{name:'Pagina successiva'}).click();
      await expect(reader.locator('.talos-process-output__range')).not.toHaveText(before);
      await expect(reader).not.toHaveAttribute('aria-busy','true');
      text+=await reader.locator('pre code').textContent();
    }
    expect(text).toBe(output);
    const completePending=page.waitForEvent('download');
    await reader.getByRole('link',{name:'Scarica output conservato',exact:true}).click();
    const complete=await completePending;
    expect(await complete.failure()).toBe(null);
    expect(readFileSync(await complete.path())).toEqual(Buffer.from(output));
    expect(complete.suggestedFilename()).toMatch(/-stdout-retained\.bin$/);
    await reader.getByRole('combobox').selectOption('stderr');await expect(reader.locator('pre')).toHaveText('Diagnostica distinta, non un errore.');
    const downloadPromise=page.waitForEvent('download');await reader.getByRole('link',{name:'Scarica questa pagina'}).click();
    const download=await downloadPromise;
    expect(await download.failure(),JSON.stringify({url:download.url(),requests:f.requests})).toBe(null);
    expect(readFileSync(await download.path(),'utf8')).toBe('Diagnostica distinta, non un errore.');
    await reader.getByRole('combobox').scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath(`output20-${theme}-1920x1080.png`)});
    const geometry=await reader.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.querySelector('pre'),b=el.querySelector('select').getBoundingClientRect();return{fit:r.width>0&&r.left>=0&&r.right<=innerWidth,overflow:el.scrollWidth>el.clientWidth,selectable:getComputedStyle(p).userSelect==='text',hit:el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))};});
    expect(geometry).toEqual({fit:true,overflow:false,selectable:true,hit:true});
    await page.screenshot({path:testInfo.outputPath(`output20-${theme}-1920x1080.png`)});
    await page.reload();await page.locator('#talosAvvio').waitFor({state:'detached'});await selectSession(page,f);reader=await reveal(page);
    await expect(reader.locator('pre')).toContainText('Prima riga');expect(errors).toEqual([]);
  } finally {await page.close();await f.close();}
});
test('OUTPUT20-BINARY-REAL: invalid UTF8 remains raw bytes with an explicit explanation',async({page})=>{
  const f=await fixture({binary:true});try{await open(page,f);const reader=await reveal(page);
    await reader.getByRole('combobox').selectOption('stderr');await expect(reader.locator('pre')).toContainText('non UTF-8');
    const pending=page.waitForEvent('download');await reader.getByRole('link',{name:'Scarica questa pagina'}).click();const d=await pending;
    expect(readFileSync(await d.path())).toEqual(Buffer.from([0,255,254,7]));
  }finally{await page.close();await f.close();}
});
test('OUTPUT20-LIMIT-REAL: storage cap is visible and never presented as complete output',async({page})=>{
  const f=await fixture({limit:5000});try{await open(page,f);const reader=await reveal(page);await expect(reader.getByRole('status')).toContainText('Limite di conservazione raggiunto');
  }finally{await page.close();await f.close();}
});
test('OUTPUT20-ERROR-RECOVERY: a failed read is visible and retry does not rerun the command',async({page})=>{
  const f=await fixture();try{await open(page,f);const reader=await reveal(page);
    await page.route('**/process-outputs/**',route=>route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({ok:false,error:'private-path'})}),{times:1});
    await reader.getByRole('button',{name:'Aggiorna'}).click();await expect(reader.getByRole('status')).toContainText('non è più disponibile');
    await expect(reader).not.toContainText('private-path');await expect(reader.locator('pre code')).toBeEmpty();
    await reader.getByRole('button',{name:'Aggiorna'}).click();await expect(reader.locator('pre')).toContainText('Prima riga');
    expect(f.registry.esporta(f.sessionId).eventi.filter(e=>e.type==='ToolCallStart')).toHaveLength(1);
  }finally{await page.close();await f.close();}
});
test('OUTPUT20-CANCEL: switching stream or session aborts pending reads and preserves the new view',async({page})=>{
  const f=await fixture();let release=()=>{};
  try{await open(page,f);const reader=await reveal(page);
    async function delayNext(){let arrive;const arrived=new Promise(r=>arrive=r),hold=new Promise(r=>release=r);
      await page.route('**/process-outputs/**',async route=>{const response=await route.fetch();arrive();await hold;await route.fulfill({response}).catch(()=>{});},{times:1});return arrived;
    }
    // Start installing the gate without awaiting its first request.
    const gate=delayNext();await reader.getByRole('button',{name:'Aggiorna'}).click();await gate;
    const aborted=page.waitForEvent('requestfailed',{predicate:r=>r.url().includes('/process-outputs/')});
    await reader.getByRole('combobox').selectOption('stderr');await aborted;await expect(reader.locator('pre')).toHaveText('Diagnostica distinta, non un errore.');
    release();await expect(reader.locator('pre')).toHaveText('Diagnostica distinta, non un errore.');
    const second=f.registry.avvia('fixture20second');await f.registry.attendiAssestamento(second.sessionId);
    const gate2=delayNext();await reader.getByRole('button',{name:'Aggiorna'}).click();await gate2;
    const aborted2=page.waitForEvent('requestfailed',{predicate:r=>r.url().includes('/process-outputs/')});
    await selectSession(page,{...f,sessionId:second.sessionId});await aborted2;release();
    await expect(page.locator('.talos-process-output')).toHaveCount(1);
    await reveal(page);
  }finally{release();await page.close();await f.close();}
});
test('OUTPUT20-NARROW: controls and exact-page download remain reachable at 390px',async({page})=>{
  const f=await fixture();try{await open(page,f);await page.setViewportSize({width:390,height:844});const reader=await reveal(page);
    await reader.getByRole('combobox').selectOption('stderr');await expect(reader.locator('pre')).toHaveText('Diagnostica distinta, non un errore.');
    for(const control of [reader.getByRole('combobox'),reader.getByRole('button',{name:'Aggiorna'}),reader.getByRole('link',{name:'Scarica questa pagina'})]){
      await control.scrollIntoViewIfNeeded();expect(await control.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    }
    expect(await reader.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  }finally{await page.close();await f.close();}
});
