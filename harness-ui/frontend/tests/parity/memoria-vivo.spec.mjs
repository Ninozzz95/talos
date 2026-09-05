import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {MEMORIE} from '../../lab/fixtures/memoria.js';
const APP='http://127.0.0.1:4177',ORIGINALE='http://127.0.0.1:4179';
const FOTO=path.resolve('../../.claude/immagini/astra-fase2/MemoryRow');
async function pronta(page,url=APP) {
 await page.goto(url);const salta=page.getByRole('button',{name:'Salta per ora',exact:true});if(await salta.isVisible())await salta.click();
 if(url===APP)await expect(page.getByRole('button',{name:'Memoria 0',exact:true})).toBeVisible();
}
async function apriMemoria(page){await page.getByRole('button',{name:/^Memoria \d+$/}).click();}
async function foto(page,nome,info){await mkdir(FOTO,{recursive:true});await page.screenshot({path:path.join(FOTO,nome+'-'+info.project.use.viewport.width+'.png')});}
const payload=memorie=>({ok:true,data:{memorie,errore:null}});
test('MEMORIA-REALE: vuoto onesto, stessa API originale, ricarico senza fixture',async({page,request,browser},info)=>{
 const errori=[];page.on('pageerror',e=>errori.push(e.message));await pronta(page);await apriMemoria(page);
 await expect(page.locator('[data-memory-stato]')).toHaveText('0 ricordi');await expect(page.locator('#schermoMemoria [data-c="MemoryRow"]')).toHaveCount(0);
 await expect(page.locator('[data-memory-list]')).toContainText('Nessun ricordo salvato');await foto(page,'app-vuota',info);
 await page.reload();await expect(page.getByRole('button',{name:'Memoria 0',exact:true})).toBeVisible();await apriMemoria(page);await expect(page.locator('[data-memory-stato]')).toHaveText('0 ricordi');expect(errori).toEqual([]);
 const contesto=await browser.newContext({...info.project.use,locale:'it-IT'}),originale=await contesto.newPage();await pronta(originale,ORIGINALE);
 // Il comando visibile nel vecchio pannello e la stessa Memoria globale.
 if(info.project.use.viewport.width<=1040)await originale.locator('.desktop-context-toggle').click();
 await originale.getByRole('button',{name:'Gestisci capability',exact:true}).click();
 await originale.getByText('Nessuna memoria (.memory-store/, globale — non del progetto).',{exact:true}).click();await foto(originale,'originale-vuota',info);await contesto.close();
});
test('MEMORIA-FIXTURE: filtri, testo completo, tastiera e ricerca senza scritture',async({page},info)=>{
 await pronta(page);const scritture=[];page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))scritture.push(r.url());});
 await page.route('**/api/v1/sessions/*/memory',r=>r.fulfill({json:payload(MEMORIE)}));await apriMemoria(page);await expect(page.locator('#schermoMemoria [data-c="MemoryRow"]')).toHaveCount(4);
 await page.locator('[data-memory-genere="procedure"]').click();await expect(page.locator('#schermoMemoria [data-c="MemoryRow"]')).toHaveCount(1);
 await page.locator('[data-memory-genere="procedure"]').press('Home');await expect(page.locator('[data-memory-genere="tutti"]')).toBeFocused();
 await page.getByLabel('Cerca nei ricordi',{exact:true}).fill('controlli falliti');await expect(page.locator('#schermoMemoria [data-c="MemoryRow"]')).toHaveCount(1);
 const riga=page.locator('#schermoMemoria [data-c="MemoryRow"]');const leggi=riga.getByRole('button',{name:/^Leggi il ricordo/});await leggi.focus();await leggi.press('Enter');
 await expect(riga.getByRole('button',{name:/^Chiudi il ricordo/})).toHaveAttribute('aria-expanded','true');await expect(riga.locator('.talos-list-row__sub')).toContainText(MEMORIE[1].contenuto);
 expect(await riga.locator('.talos-list-row__sub').evaluate(n=>getComputedStyle(n).whiteSpace)).toBe('pre-wrap');await foto(page,'fixture-lettura',info);
 await riga.getByRole('button',{name:/^Chiudi il ricordo/}).press('Space');await expect(riga.locator('.talos-list-row__sub')).not.toContainText('controlli falliti');
 await page.getByLabel('Cerca nei ricordi',{exact:true}).fill('nessunrisultato');await expect(page.locator('[data-memory-list]')).toContainText('Nessun ricordo corrisponde ai filtri');await foto(page,'fixture-filtro-vuoto',info);
 await expect(page.locator('#schermoMemoria [data-richiede="fase3"]:visible')).toHaveCount(0);expect(scritture).toEqual([]);
});
test('MEMORIA-RECUPERO: errori, payload non valido e risposta obsoleta',async({page},info)=>{
 await pronta(page);await page.route('**/api/v1/sessions/*/memory',r=>r.fulfill({status:503,json:{ok:false,error:{code:'OFFLINE',message:'Servizio non disponibile'}}}));await apriMemoria(page);
 await expect(page.locator('[data-memory-stato]')).toContainText('Servizio non disponibile');await expect(page.locator('[data-memory-stato]')).toBeInViewport();await expect(page.locator('#schermoMemoria .talos-topbar__path')).toHaveText('Ricordi non disponibili');await foto(page,'app-errore',info);
 await page.unroute('**/api/v1/sessions/*/memory');await page.route('**/api/v1/sessions/*/memory',r=>r.fulfill({json:payload([null])}));await page.locator('[data-memory-refresh]').click();await expect(page.locator('[data-memory-stato]')).toContainText('Elenco dei ricordi non valido');
 await page.unroute('**/api/v1/sessions/*/memory');await page.locator('[data-memory-refresh]').click();await expect(page.locator('[data-memory-stato]')).toHaveText('0 ricordi');
 let libera;const attesa=new Promise(r=>{libera=r;});let richieste=0;
 await page.route('**/api/v1/sessions/*/memory',async r=>{richieste++;if(richieste===1){await attesa;await r.fulfill({json:payload([MEMORIE[0]])});}else await r.fulfill({json:payload([MEMORIE[1]])});});
 try {
  await page.locator('[data-memory-refresh]').click();await expect(page.locator('[data-memory-stato]')).toHaveText('Caricamento ricordi…');await expect(page.locator('#schermoMemoria .talos-topbar__path')).toHaveText('Caricamento ricordi…');
  await page.getByRole('button',{name:/^Board \d+$/}).click();await apriMemoria(page);await expect(page.locator('#schermoMemoria .talos-list-row__title')).toHaveText(MEMORIE[1].titolo);
  const obsoleta=page.waitForResponse(r=>r.url().endsWith('/memory'));libera();await (await obsoleta).finished();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await expect(page.locator('#schermoMemoria .talos-list-row__title')).toHaveText(MEMORIE[1].titolo);
 } finally {libera();}
});
