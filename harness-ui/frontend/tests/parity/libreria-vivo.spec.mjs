import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {LIBRERIA} from '../../lab/fixtures/libreria.js';
const APP='http://127.0.0.1:4177',ORIGINALE='http://127.0.0.1:4179';
const FOTO=path.resolve('artifacts/astra-fase2/LibraryRow');
async function pronta(page,url=APP) {
 await page.goto(url);const salta=page.getByRole('button',{name:'Salta per ora',exact:true});if(await salta.isVisible())await salta.click();
 if(url===APP)await expect(page.getByRole('button',{name:'Libreria 0',exact:true})).toBeVisible();
}
async function apriLibreria(page){await page.getByRole('button',{name:/^Libreria \d+$/}).click();}
async function foto(page,nome,info){await mkdir(FOTO,{recursive:true});await page.screenshot({path:path.join(FOTO,nome+'-'+info.project.use.viewport.width+'.png')});}
const payload=voci=>({ok:true,data:{voci,errore:null}});
test('LIBRERIA-REALE: vuoto onesto, stessa API originale, ricarico senza fixture',async({page,request,browser},info)=>{
 const errori=[];page.on('pageerror',e=>errori.push(e.message));await pronta(page);await apriLibreria(page);
 await expect(page.locator('[data-library-esito]')).toHaveText('0 file');await expect(page.locator('#schermoLibreria [data-c="LibraryRow"]')).toHaveCount(0);
 await expect(page.locator('[data-library-list]')).toContainText('Nessun file in Libreria per questo progetto');await foto(page,'app-vuota',info);
 await page.reload();await expect(page.getByRole('button',{name:'Libreria 0',exact:true})).toBeVisible();await apriLibreria(page);await expect(page.locator('[data-library-esito]')).toHaveText('0 file');expect(errori).toEqual([]);
 const contesto=await browser.newContext({...info.project.use,locale:'it-IT'}),originale=await contesto.newPage();await pronta(originale,ORIGINALE);
 // Il comando visibile nel vecchio pannello e la stessa Libreria del progetto.
 if(info.project.use.viewport.width<=1040)await originale.locator('.desktop-context-toggle').click();
 await originale.getByRole('button',{name:'Gestisci capability',exact:true}).click();
 await originale.getByText('Nessun file in Libreria per questo progetto (.harness-ui-library/).',{exact:true}).click();await foto(originale,'originale-vuota',info);await contesto.close();
});
test('LIBRERIA-FIXTURE: provenienza, nome completo e dettagli senza scritture',async({page,browser},info)=>{
 await pronta(page);const scritture=[];page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))scritture.push(r.url());});
 await page.route('**/api/v1/sessions/*/library',r=>r.fulfill({json:payload(LIBRERIA)}));await apriLibreria(page);const righe=page.locator('#schermoLibreria [data-c="LibraryRow"]');await expect(righe).toHaveCount(4);
 await page.getByRole('tab',{name:'Caricati',exact:true}).click();await expect(righe).toHaveCount(2);
 await page.getByRole('tab',{name:'Caricati',exact:true}).press('End');await expect(page.getByRole('tab',{name:'Generati',exact:true})).toBeFocused();await expect(righe).toHaveCount(2);
 await page.getByRole('tab',{name:'Generati',exact:true}).press('Home');await expect(page.getByRole('tab',{name:'Tutti',exact:true})).toBeFocused();
 await page.getByLabel('Cerca per nome, tipo o provenienza',{exact:true}).fill('documenti selezionati');await expect(righe).toHaveCount(1);await expect(righe.locator('use')).toHaveAttribute('href','#i-image');
 const dettagli=righe.getByRole('button',{name:/^Dettagli di /});await dettagli.focus();await dettagli.press('Enter');await expect(righe.getByRole('button',{name:/^Chiudi i dettagli di /})).toHaveAttribute('aria-expanded','true');
 await expect(righe.locator('.talos-list-row__title')).toHaveText(LIBRERIA[3].nome);await expect(righe.locator('.talos-list-row__title')).toHaveCSS('white-space','pre-wrap');await expect(righe.locator('.talos-list-row__sub')).toContainText('Immagine');await expect(righe.locator('.talos-badge')).toHaveText('Caricato');await foto(page,'fixture-dettagli',info);
 await righe.getByRole('button',{name:/^Chiudi i dettagli di /}).press('Space');await expect(righe.getByRole('button',{name:/^Dettagli di /})).toHaveAttribute('aria-expanded','false');
 await page.getByLabel('Cerca per nome, tipo o provenienza',{exact:true}).fill('nessunrisultato');await expect(page.locator('[data-library-list]')).toContainText('Nessun file corrisponde ai filtri');await foto(page,'fixture-filtro-vuoto',info);
 await expect(page.locator('#schermoLibreria [data-richiede="fase3"]:visible')).toHaveCount(0);await expect(page.locator('#schermoLibreria')).not.toContainText('62,4k');expect(scritture).toEqual([]);
 const contesto=await browser.newContext({...info.project.use,locale:'it-IT'}),originale=await contesto.newPage();await pronta(originale,ORIGINALE);
 await originale.route('**/api/v1/sessions/*/library',r=>r.fulfill({json:payload(LIBRERIA)}));if(info.project.use.viewport.width<=1040)await originale.locator('.desktop-context-toggle').click();
 await originale.getByRole('button',{name:'Gestisci capability',exact:true}).click();await originale.getByText(LIBRERIA[3].nome,{exact:true}).click();await expect(originale.locator('#libraryListMount .sheet-option')).toHaveCount(4);await foto(originale,'originale-fixture',info);await contesto.close();
});
test('LIBRERIA-RECUPERO: errori, payload non valido e risposta obsoleta',async({page},info)=>{
 await pronta(page);await page.route('**/api/v1/sessions/*/library',r=>r.fulfill({status:503,json:{ok:false,error:{code:'OFFLINE',message:'Servizio non disponibile'}}}));await apriLibreria(page);
 await expect(page.locator('[data-library-esito]')).toContainText('Servizio non disponibile');await expect(page.locator('[data-library-esito]')).toBeInViewport();await expect(page.locator('#schermoLibreria .talos-topbar__path')).toHaveText('Libreria non disponibile');await foto(page,'app-errore',info);
 await page.unroute('**/api/v1/sessions/*/library');await page.route('**/api/v1/sessions/*/library',r=>r.fulfill({json:payload([null])}));await page.locator('[data-library-refresh]').click();await expect(page.locator('[data-library-esito]')).toContainText('Elenco della Libreria non valido');
 await page.unroute('**/api/v1/sessions/*/library');await page.locator('[data-library-refresh]').click();await expect(page.locator('[data-library-esito]')).toHaveText('0 file');
 let libera;const attesa=new Promise(r=>{libera=r;});let richieste=0;
 await page.route('**/api/v1/sessions/*/library',async r=>{richieste++;if(richieste===1){await attesa;await r.fulfill({json:payload([LIBRERIA[0]])});}else await r.fulfill({json:payload([LIBRERIA[1]])});});
 try {
  await page.locator('[data-library-refresh]').click();await expect(page.locator('[data-library-esito]')).toHaveText('Caricamento Libreria…');await expect(page.locator('#schermoLibreria .talos-topbar__path')).toHaveText('Caricamento Libreria…');
  await page.getByRole('button',{name:/^Board \d+$/}).click();await apriLibreria(page);await expect(page.locator('#schermoLibreria .talos-list-row__title')).toHaveText(LIBRERIA[1].nome);
  const obsoleta=page.waitForResponse(r=>r.url().endsWith('/library'));libera();await (await obsoleta).finished();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await expect(page.locator('#schermoLibreria .talos-list-row__title')).toHaveText(LIBRERIA[1].nome);
 } finally {libera();}
});
