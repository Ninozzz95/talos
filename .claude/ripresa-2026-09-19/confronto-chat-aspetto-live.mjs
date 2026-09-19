throw new Error('Riferimento mockup contestato dall’owner: confronto sospeso finché la fonte chat/composer non è verificata.');
import { chromium } from '../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const id = `chat-aspetto-live-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0,8)}`;
const output = new URL(`./${id}/`, import.meta.url); mkdirSync(output);
const mockup = new URL('../../harness-ui/mockup-originale/index.html', import.meta.url);
const sha = b => createHash('sha256').update(b).digest('hex');
const report = { id, mockupSha256: sha(readFileSync(mockup)), appSha256: sha(Buffer.from(await (await fetch('http://127.0.0.1:4174/app.js')).arrayBuffer())), captures: [], limits: ['Chat vuota: la misura del testo e la persistenza sono verificate separatamente dai test browser.', 'Profilo temporaneo, nessuna operazione mutante verso il server.'] };
const browser = await chromium.launch({ headless: true });
try {
  for (const [width,height] of [[1024,800],[1440,900],[1920,1080]]) for (const kind of ['mockup','4174']) {
    const blocked = [], errors = [], sockets = [];
    const context = await browser.newContext({viewport:{width,height}, colorScheme:'dark', reducedMotion:'reduce'});
    await context.routeWebSocket('**/*', ws => { sockets.push(ws.url()); ws.close(); });
    await context.route('**/*', route => {
      const request = route.request(), u = new URL(request.url());
      if (request.method() !== 'GET') { blocked.push({method:request.method(),path:u.pathname}); return route.abort(); }
      if (u.protocol === 'file:' || (u.hostname === '127.0.0.1' && u.port === '4174' && !u.pathname.includes('/terminal')) || ['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)) return route.continue();
      blocked.push({method:'GET',path:u.origin+u.pathname}); return route.abort();
    });
    await context.addInitScript(() => { if (window !== window.top) return; try { localStorage.setItem('talos.harness.desktop.settings.v1',JSON.stringify({version:1,appearance:{colorMode:'dark',uiLanguage:'it',backgroundMotion:false,interfaceMotion:false}})); } catch { /* Il mockup può contenere frame opachi. */ } });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(kind === 'mockup' ? mockup.href : 'http://127.0.0.1:4174/');
    if (kind === '4174') await page.locator('.talos-nav-item[data-vaia="chat"]').click();
    const form = page.locator(kind === 'mockup' ? '.composer' : '#composerForm'); await form.waitFor();
    const metrics = await form.evaluate(e => { const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,overflow:document.documentElement.scrollWidth>innerWidth+1}; });
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
writeFileSync(new URL('confronto.html',output),`<!doctype html><meta charset="utf-8"><title>Chat e aspetto — confronto</title><style>body{background:#202124;color:#eee;font:16px system-ui}section{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%}figure{margin:8px}</style><h1>Chat e aspetto</h1>${[1024,1440,1920].map(w=>`<h2>${w}px</h2><section>${report.captures.filter(c=>c.width===w&&['mockup','4174'].includes(c.kind)).map(c=>`<figure><figcaption>${c.kind}</figcaption><img src="${c.file}"></figure>`).join('')}</section>`).join('')}<h2>Reset aspetto</h2><img src="4174-aspetto-reset-1440.png">`,{flag:'wx'});
console.log(JSON.stringify({output:fileURLToPath(output),captures:report.captures.length,errors:report.captures.flatMap(c=>c.errors),nonGet:report.captures.flatMap(c=>c.blocked).filter(r=>r.method!=='GET').length},null,2));
