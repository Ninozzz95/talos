import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {ATTIVITA} from '../../lab/fixtures/attivita.js';
const APP='http://127.0.0.1:4177',ORIGINALE='http://127.0.0.1:4179';
const FOTO=path.resolve('../../.claude/immagini/astra-fase2/TaskRow');
async function pronta(page,url=APP) {
 await page.goto(url);const salta=page.getByRole('button',{name:'Salta per ora',exact:true});if(await salta.isVisible())await salta.click();
 if(url===APP)await expect(page.getByRole('button',{name:'Attività 0',exact:true})).toBeVisible();
}
async function apriAttivita(page){await page.getByRole('button',{name:/^Attività \d+$/}).click();}
async function foto(page,nome,info){await mkdir(FOTO,{recursive:true});await page.screenshot({path:path.join(FOTO,nome+'-'+info.project.use.viewport.width+'.png')});}
const payload=attivita=>({ok:true,data:{attivita,errore:null}});
test('ATTIVITA-REALE: vuoto onesto, stessa API originale, ricarico senza fixture',async({page,request,browser},info)=>{
 const errori=[];page.on('pageerror',e=>errori.push(e.message));await pronta(page);await apriAttivita(page);
 await expect(page.locator('[data-task-esito]')).toHaveText('0 attività');await expect(page.locator('#schermoAttivita [data-c="TaskRow"]')).toHaveCount(0);
 await expect(page.locator('[data-task-list]')).toContainText('Nessuna attività salvata');await foto(page,'app-vuota',info);
 await page.reload();await expect(page.getByRole('button',{name:'Attività 0',exact:true})).toBeVisible();await apriAttivita(page);await expect(page.locator('[data-task-esito]')).toHaveText('0 attività');expect(errori).toEqual([]);
 const contesto=await browser.newContext({...info.project.use,locale:'it-IT'}),originale=await contesto.newPage();await pronta(originale,ORIGINALE);
 // Il comando visibile nel vecchio pannello e le stesse attività globali.
 if(info.project.use.viewport.width<=1040)await originale.locator('.desktop-context-toggle').click();
 await originale.getByRole('button',{name:'Gestisci capability',exact:true}).click();
 await originale.getByText('Nessuna attività (.tasks-store/, globale — non del progetto).',{exact:true}).click();await foto(originale,'originale-vuota',info);await contesto.close();
});
test('ATTIVITA-FIXTURE: stati, lettura completa, tastiera e nessuna scrittura',async({page},info)=>{
 await pronta(page);const scritture=[];page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))scritture.push(r.url());});
 await page.route('**/api/v1/sessions/*/tasks',r=>r.fulfill({json:payload(ATTIVITA)}));await apriAttivita(page);
 const righe=page.locator('#schermoAttivita [data-c="TaskRow"]');await expect(righe).toHaveCount(4);await expect(page.locator('#schermoAttivita .talos-topbar__path')).toHaveText('3 aperte · 1 fatta');
 await page.getByRole('tab',{name:'Da fare',exact:true}).click();await expect(righe).toHaveCount(2);
 await page.getByRole('tab',{name:'Da fare',exact:true}).press('End');await expect(page.getByRole('tab',{name:'Fatte',exact:true})).toBeFocused();await expect(righe).toHaveCount(1);
 await righe.getByRole('button',{name:/^Leggi l’attività/}).click();await expect(righe).toHaveCSS('opacity','1');await expect(righe.locator('.talos-list-row__sub')).toContainText(ATTIVITA[3].descrizione);
 await page.getByRole('tab',{name:'Fatte',exact:true}).press('Home');await expect(page.getByRole('tab',{name:'Tutte',exact:true})).toBeFocused();
 await page.getByLabel('Cerca nelle attività',{exact:true}).fill('microfono non disponibile');await expect(righe).toHaveCount(1);
 const leggi=righe.getByRole('button',{name:/^Leggi l’attività/});await leggi.focus();await leggi.press('Enter');
 await expect(righe.getByRole('button',{name:/^Chiudi l’attività/})).toHaveAttribute('aria-expanded','true');await expect(righe.locator('.talos-list-row__sub')).toContainText(ATTIVITA[1].descrizione);await expect(righe.locator('.talos-list-row__sub')).toContainText('Autore non registrato');await expect(righe.locator('.talos-list-row__sub')).toHaveCSS('white-space','pre-wrap');await foto(page,'fixture-lettura',info);
 await righe.getByRole('button',{name:/^Chiudi l’attività/}).press('Space');await expect(righe.locator('.talos-list-row__sub')).not.toContainText('microfono non disponibile');
 await page.getByLabel('Cerca nelle attività',{exact:true}).fill('nessunrisultato');await expect(page.locator('[data-task-list]')).toContainText('Nessuna attività corrisponde ai filtri');await foto(page,'fixture-filtro-vuoto',info);
 await expect(page.locator('#schermoAttivita [data-richiede="fase3"]:visible')).toHaveCount(0);expect(scritture).toEqual([]);
});
test('ATTIVITA-RECUPERO: errori, payload non valido e risposta obsoleta',async({page},info)=>{
 await pronta(page);await page.route('**/api/v1/sessions/*/tasks',r=>r.fulfill({status:503,json:{ok:false,error:{code:'OFFLINE',message:'Servizio non disponibile'}}}));await apriAttivita(page);
 await expect(page.locator('[data-task-esito]')).toContainText('Servizio non disponibile');await expect(page.locator('[data-task-esito]')).toBeInViewport();await expect(page.locator('#schermoAttivita .talos-topbar__path')).toHaveText('Attività non disponibili');await foto(page,'app-errore',info);
 await page.unroute('**/api/v1/sessions/*/tasks');await page.route('**/api/v1/sessions/*/tasks',r=>r.fulfill({json:payload([null])}));await page.locator('[data-task-refresh]').click();await expect(page.locator('[data-task-esito]')).toContainText('Elenco delle attività non valido');
 await page.unroute('**/api/v1/sessions/*/tasks');await page.locator('[data-task-refresh]').click();await expect(page.locator('[data-task-esito]')).toHaveText('0 attività');
 let libera;const attesa=new Promise(r=>{libera=r;});let richieste=0;
 await page.route('**/api/v1/sessions/*/tasks',async r=>{richieste++;if(richieste===1){await attesa;await r.fulfill({json:payload([ATTIVITA[0]])});}else await r.fulfill({json:payload([ATTIVITA[1]])});});
 try {
  await page.locator('[data-task-refresh]').click();await expect(page.locator('[data-task-esito]')).toHaveText('Caricamento attività…');await expect(page.locator('#schermoAttivita .talos-topbar__path')).toHaveText('Caricamento attività…');
  await page.getByRole('button',{name:/^Board \d+$/}).click();await apriAttivita(page);await expect(page.locator('#schermoAttivita .talos-list-row__title')).toHaveText(ATTIVITA[1].titolo);
  const obsoleta=page.waitForResponse(r=>r.url().endsWith('/tasks'));libera();await (await obsoleta).finished();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await expect(page.locator('#schermoAttivita .talos-list-row__title')).toHaveText(ATTIVITA[1].titolo);
 } finally {libera();}
});
