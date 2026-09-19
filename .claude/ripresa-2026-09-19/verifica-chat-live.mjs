import { chromium } from '../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const id = `verifica-chat-live-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0,8)}`;
const output = new URL(`./${id}/`, import.meta.url); mkdirSync(output);
const sha = b => createHash('sha256').update(b).digest('hex');
const report = { id, reference: "Nessun mockup per chat/composer: requisiti owner", appSha256: sha(Buffer.from(await (await fetch('http://127.0.0.1:4174/app.js')).arrayBuffer())), captures: [], limits: ['Sessione reale in sola lettura; nessuna nuova inferenza. Mockup inesistente per chat/composer.', 'Profilo temporaneo, nessuna operazione mutante verso il server.'] };
const payload=await (await fetch('http://127.0.0.1:4174/api/v1/sessions')).json();
const sessions=(payload.data||payload).items;
const roots=sessions.filter(s=>!s.padreId&&!(Number(s.profonditaDelega)>0));
roots.sort((a,b)=>sessions.filter(s=>s.padreId===b.sessionId).length-sessions.filter(s=>s.padreId===a.sessionId).length);
const selected=roots[0];if(!selected)throw Error('Manca sessione reale');
report.sessionId=selected.sessionId;
const browser = await chromium.launch({ headless: true });
try {
  for (const [width,height] of [[1024,800],[1440,900],[1920,1080]]) for (const kind of ['4174']) {
    const blocked = [], errors = [], sockets = [];
    const context = await browser.newContext({viewport:{width,height}, colorScheme:'dark', reducedMotion:'reduce'});
    await context.routeWebSocket('**/*', ws => { sockets.push(ws.url()); ws.close(); });
    await context.route('**/*', route => {
      const request = route.request(), u = new URL(request.url());
      if (request.method() !== 'GET') { blocked.push({method:request.method(),path:u.pathname}); return route.abort(); }
      if ((u.hostname === '127.0.0.1' && u.port === '4174' && !u.pathname.includes('/terminal'))) return route.continue();
      blocked.push({method:'GET',path:u.origin+u.pathname}); return route.abort();
    });
    await context.addInitScript(() => { if (window !== window.top) return; try { localStorage.setItem('talos.harness.desktop.settings.v1',JSON.stringify({version:1,appearance:{colorMode:'dark',uiLanguage:'it',backgroundMotion:false,interfaceMotion:false}})); } catch { /* Storage non disponibile nei frame opachi. */ } });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4174/');
    await page.locator(`[data-real-session-id="${selected.sessionId}"]`).click();
    await page.locator('#conversation .talos-message').last().waitFor();
    const scroller=page.locator('#schermoChat .talos-conversation');
    await scroller.evaluate(e=>{e.scrollTop=0;e.dispatchEvent(new Event('scroll'));});
    await page.locator('#chatTornaInFondo').waitFor();
    const form = page.locator('#composerForm'); await form.waitFor();
    const metrics = await form.evaluate(e => { const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,overflow:document.documentElement.scrollWidth>innerWidth+1}; });
    const center=await page.evaluate(()=>{const b=document.querySelector('#chatTornaInFondo').getBoundingClientRect(),m=[...document.querySelectorAll('#conversation .talos-message')].at(-1).getBoundingClientRect();return Math.abs(b.x+b.width/2-m.x-m.width/2)});
    if(center>1)throw Error(`Ritorno fuori centro: ${center}px`);
    const overlay=await page.evaluate(()=>{
      const button=document.querySelector('#chatTornaInFondo'),b=button.getBoundingClientRect();
      const wrap=button.parentElement, scroller=document.querySelector('#schermoChat .talos-conversation'),s=scroller.getBoundingClientRect();
      return {height:wrap.getBoundingClientRect().height,background:getComputedStyle(wrap).backgroundColor,
        buttonInside:b.top>=s.top&&b.bottom<=s.bottom+1,chatBehind:scroller.contains(document.elementFromPoint(b.left-12,b.top+b.height/2))};
    });
    if(overlay.height!==0||!overlay.buttonInside||!overlay.chatBehind)throw Error('Fascia ritorno non sovrapposta alla chat: '+JSON.stringify(overlay));
    metrics.overlay=overlay;
    const hiddenChildren=await page.locator('.talos-session-item--figlia').count();
    if(hiddenChildren)throw Error('Sidebar contiene figli');
    metrics.centerDelta=center;metrics.rootRows=await page.locator('.real-session-item').count();
    const file = `${kind}-chat-${width}.png`; await page.screenshot({path:fileURLToPath(new URL(file,output)),fullPage:true});
    report.captures.push({kind,width,height,file,metrics,blocked,errors,sockets});
    if (kind === '4174' && width === 1440) {
      await page.locator('[data-vaia="impostazioni"]').click(); await page.locator('#setting-tab-appearance').click();
      await page.locator('[data-reset-appearance]').waitFor();
      const file='4174-aspetto-reset-1440.png'; await page.screenshot({path:fileURLToPath(new URL(file,output)),fullPage:true});
      report.captures.push({kind:'4174-aspetto',width,height,file,blocked:[...blocked],errors:[...errors],sockets:[...sockets]});
    }
    await context.close();
  }
} finally { await browser.close(); writeFileSync(new URL('report.json',output),JSON.stringify(report,null,2),{flag:'wx'}); }
writeFileSync(new URL('verifica.html',output),`<!doctype html><meta charset="utf-8"><title>Verifica funzionale chat 4174</title><style>body{background:#202124;color:#eee;font:16px system-ui}img{max-width:100%}figure{margin:12px}</style><h1>Chat e composer — nessun mockup</h1><p>Verifica dei requisiti owner sulla4174: radici nella sidebar e ritorno centrato.</p>${report.captures.map(c=>`<figure><figcaption>${c.kind} ${c.width}px</figcaption><img src="${c.file}"></figure>`).join('')}`,{flag:'wx'});
console.log(JSON.stringify({output:fileURLToPath(output),captures:report.captures.length,errors:report.captures.flatMap(c=>c.errors),nonGet:report.captures.flatMap(c=>c.blocked).filter(r=>r.method!=='GET').length},null,2));
