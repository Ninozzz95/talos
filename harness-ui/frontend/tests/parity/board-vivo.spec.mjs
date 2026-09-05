import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const APP='http://127.0.0.1:4177', ORIGINALE='http://127.0.0.1:4179';
const FOTO=path.resolve('artifacts/astra-fase2/Board');
async function avvia(page,url=APP) {
 await page.goto(url);const salta=page.getByRole('button',{name:'Salta per ora',exact:true});
 if(await salta.isVisible()) await salta.click();
 await page.getByRole('button',{name:url===APP?/^Board \d+$/:/^Board$/}).click();
 if(url===APP) {await expect(page.locator('#schermoBoard [data-board-session-id]')).toHaveCount(73);await expect(page.locator('[data-board-refresh]')).toBeEnabled();}
 else await expect(page.locator('#sessionsBoardList .session-board-row')).toHaveCount(73);
}
async function foto(page,nome,info) {await mkdir(FOTO,{recursive:true});await page.screenshot({path:path.join(FOTO,nome+'-'+info.project.use.viewport.width+'.png')});}
const ids = page=>page.locator('#schermoBoard [data-board-session-id]').evaluateAll(ns=>ns.map(n=>n.dataset.boardSessionId));
test('B3-REALE: stessa lista dello store, dati e metriche veri, costo nascosto',async({page,request,browser},info)=>{
 const errori=[];page.on('pageerror',e=>errori.push(e.message));
 const {data:{items}}=await(await request.get(APP+'/api/v1/sessions')).json(); expect(items).toHaveLength(73);
 await avvia(page); expect(await ids(page)).toEqual([...items].sort((a,b)=>Date.parse(b.avviataAlle)-Date.parse(a.avviataAlle)).map(s=>s.sessionId));
 for(const s of items.slice(0,3)) {
  const riga=page.locator('[data-board-session-id="'+s.sessionId+'"]');
  await expect(riga.locator('.talos-board-session')).toHaveText(s.nome || s.taskId);
  await expect(riga.locator('td').nth(3)).toHaveText(String(s.usage.giri));
  const {data:metriche}=await(await request.get(APP+'/api/v1/sessions/'+s.sessionId+'/metrics')).json();
  await expect(riga.locator('td').nth(5)).toContainText(metriche.cache.percentuale+'%');
  await expect(riga.locator('td').nth(6)).toHaveText('—');
 }
 await expect(page.locator('#schermoBoard [data-richiede="fase3"]:visible')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errori).toEqual([]); expect((await page.locator('#boardTabella').boundingBox()).y+(await page.locator('#boardTabella').boundingBox()).height).toBeLessThanOrEqual(info.project.use.viewport.height); await expect(page.locator('#boardEsito'), 'B3-STATO-VISIBILE').toBeInViewport(); await foto(page,'app-reale',info);
 const contesto=await browser.newContext({...info.project.use,locale:'it-IT'});const originale=await contesto.newPage();await avvia(originale,ORIGINALE);await foto(originale,'originale',info);
 const titoli=await originale.locator('#sessionsBoardList strong').allTextContents(); expect(titoli).toEqual(items.map(s=>s.nome || s.taskId || 'Sessione'));
 await contesto.close();
 const contenitore=page.locator('#boardTabella');await contenitore.hover();await page.mouse.wheel(2000,0);
 await expect(page.getByRole('columnheader',{name:'Avviata',exact:true})).toBeInViewport();await foto(page,'app-metriche-destra',info);
});
test('B3-AZIONI: filtri, ordine, cartella, menu, apertura e ricarico',async({page,request},info)=>{
 await avvia(page);const {data:{items}}=await(await request.get(APP+'/api/v1/sessions')).json();
 const errore=page.locator('[data-board-stato="errore"]');await errore.click();
 const attesi=items.filter(s=>s.conclusa&&!s.interrotta&&!s.inAttesaApprovazione&&s.ultimoEsito==='errore').map(s=>s.sessionId);
 expect(await ids(page)).toEqual(attesi);await expect(errore).toHaveAttribute('aria-selected','true');await foto(page,'app-filtro-errore',info);
 await errore.press('Home');await expect(page.locator('[data-board-stato="tutte"]')).toBeFocused();await expect(page.locator('#schermoBoard [data-board-session-id]')).toHaveCount(73);
 await page.getByLabel('Ordina',{exact:true}).selectOption('token');const ordinati=items.filter(s=>Number.isFinite(s.usage?.prompt_tokens)&&Number.isFinite(s.usage?.completion_tokens)).sort((a,b)=>(b.usage.prompt_tokens+b.usage.completion_tokens)-(a.usage.prompt_tokens+a.usage.completion_tokens));expect((await ids(page))[0]).toBe(ordinati[0].sessionId);
 await expect(page.locator('#schermoBoard th[aria-sort]')).toHaveCount(1);await expect(page.getByRole('columnheader',{name:'Token',exact:true})).toHaveAttribute('aria-sort','descending');
 await page.getByLabel('Ordina',{exact:true}).selectOption('vecchie');expect((await ids(page))[0]).toBe([...items].sort((a,b)=>Date.parse(a.avviataAlle)-Date.parse(b.avviataAlle))[0].sessionId);
 const cartella=page.getByLabel('Cartella',{exact:true});await cartella.focus();await expect(page.locator('#schermoBoard .talos-topbar__path')).toContainText('cartelle',{timeout:45000});
 const percorsi=await cartella.locator('option').evaluateAll(ns=>ns.map(n=>n.value).filter(v=>v&&v!=='@assente'));expect(percorsi.length).toBeGreaterThan(0);await cartella.selectOption(percorsi[0]);
 const filtrati=await ids(page);expect(filtrati.length).toBeGreaterThan(0);
 const campione=filtrati[0];const {data:esportazione}=await(await request.get(APP+'/api/v1/sessions/'+campione+'/export')).json();
 const avvio=[...esportazione.eventi].reverse().find(e=>e.type==='RunStarted'&&typeof e.contesto?.cartella==='string');expect(avvio.contesto.cartella).toBe(percorsi[0]);
 await cartella.selectOption('');await page.getByLabel('Ordina',{exact:true}).selectOption('recenti');
 const primo=page.locator('#schermoBoard .talos-board-session').first();await primo.focus();await primo.press('Shift+F10');
 await expect(page.getByRole('menu')).toBeVisible();await expect(page.getByRole('menuitem',{name:/Rinomina/})).toBeVisible();await page.keyboard.press('Escape');await expect(primo).toBeFocused();
 await primo.press('Enter');await expect(page.locator('#schermoChat')).toBeVisible();await expect(page.locator('.talos-sidebar [data-real-session-id="'+items[0].sessionId+'"][aria-current="true"]')).toBeVisible();
 await page.reload();await expect(page.locator('.talos-sidebar [data-real-session-id="'+items[0].sessionId+'"][aria-current="true"]')).toBeVisible();
});
test('B3-RECUPERO: errori di lista e metriche, Aggiorna recupera senza valori inventati',async({page},info)=>{
 await avvia(page);
 await page.route('**/api/v1/sessions',route=>route.fulfill({status:503,json:{ok:false,error:{code:'OFFLINE',message:'Servizio temporaneamente non disponibile'}}}));
 await page.locator('[data-board-refresh]').click();await expect(page.locator('#boardEsito')).toHaveAttribute('role','alert');await expect(page.locator('#schermoBoard [data-board-session-id]')).toHaveCount(0);
 await foto(page,'app-errore',info);await page.unroute('**/api/v1/sessions');
 await page.route('**/api/v1/sessions/*/metrics',route=>route.fulfill({status:503,json:{ok:false,error:{code:'OFFLINE',message:'Metriche non disponibili'}}}));
 await page.locator('[data-board-refresh]').click();await expect(page.locator('[data-board-refresh]')).toBeEnabled();await expect(page.locator('#boardEsito')).toContainText('Metriche non disponibili per 73');
 await expect(page.locator('#schermoBoard tbody tr').first().locator('td').nth(5)).toHaveText('— · 74,2k');
 await page.unroute('**/api/v1/sessions/*/metrics');await page.locator('[data-board-refresh]').click();await expect(page.locator('[data-board-refresh]')).toBeEnabled();
 await expect(page.locator('#boardEsito')).not.toContainText('non disponibili');await expect(page.locator('#schermoBoard tbody tr').first().locator('td').nth(5)).toHaveText('83% · 74,2k');
});

test('B3-EMBEDDED: aggiornamento e filtro rispettano il confine senza backend',async({page})=>{
 await avvia(page);await page.evaluate(()=>document.documentElement.classList.add('talos-embedded'));
 await page.getByRole('button',{name:/^Board \d+$/}).click();await expect(page.locator('#boardEsito')).toHaveText('Nessun dato mobile collegato.');
 const letture=[];page.on('request',r=>{if(r.url().includes('/api/v1/sessions'))letture.push(r.url());});
 await page.locator('[data-board-refresh]').click();await page.getByLabel('Cartella',{exact:true}).focus();
 await expect(page.locator('#boardEsito')).toHaveText('Nessun dato mobile collegato.');expect(letture).toEqual([]);
});
