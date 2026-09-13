import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {RICERCHE} from '../../lab/fixtures/ricerca.js';
const APP='http://127.0.0.1:4177',ORIGINALE='http://127.0.0.1:4179';
const FOTO=path.resolve('artifacts/astra-fase2/ReportRow');
async function pronta(page,url=APP){
 await page.goto(url);const salta=page.getByRole('button',{name:'Salta per ora',exact:true});if(await salta.isVisible())await salta.click();
 if(url===APP)await expect(page.getByRole('button',{name:'Libreria 0',exact:true})).toBeVisible();
}
async function apriRicerca(page){const voce=page.getByRole('button',{name:/^Ricerca approfondita \d+$/});if(!await voce.isVisible())await page.getByRole('button',{name:'Altro',exact:true}).click();await voce.click();}
async function foto(page,nome,info){await mkdir(FOTO,{recursive:true});await page.screenshot({path:path.join(FOTO,nome+'-'+info.project.use.viewport.width+'.png')});}
const payload=ricerche=>({ok:true,data:{ricerche,errore:null}});
test('RICERCA-REALE: apro l’elenco vuoto, ricarico e confronto l’originale',async({page,browser},info)=>{
 const errori=[];page.on('pageerror',e=>errori.push(e.message));await pronta(page);await apriRicerca(page);
 await expect(page.locator('[data-research-esito]')).toHaveText('0 ricerche elencate');await expect(page.locator('#schermoRicerca [data-c="ReportRow"]')).toHaveCount(0);
 await expect(page.locator('[data-research-list]')).toContainText('Nessuna ricerca avviata in questo progetto');await foto(page,'app-vuota',info);
 await page.reload();await expect(page.getByRole('button',{name:'Libreria 0',exact:true})).toBeVisible();await apriRicerca(page);await expect(page.locator('[data-research-esito]')).toHaveText('0 ricerche elencate');expect(errori).toEqual([]);
 const contesto=await browser.newContext({...info.project.use,locale:'it-IT'}),originale=await contesto.newPage();await pronta(originale,ORIGINALE);
 if(info.project.use.viewport.width<=1040)await originale.locator('.desktop-context-toggle').click();
 await originale.getByRole('button',{name:'Gestisci capability',exact:true}).click();await originale.getByText('Nessuna ricerca avviata in questo progetto.',{exact:true}).click();await foto(originale,'originale-vuota',info);await contesto.close();
});
test('RICERCA-FIXTURE: cerco una ricerca in pausa e ne leggo tutti i dettagli',async({page,browser},info)=>{
 await pronta(page);const scritture=[];page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))scritture.push(r.url());});
 await page.route('**/api/v1/sessions/*/research',r=>r.fulfill({json:payload(RICERCHE)}));await apriRicerca(page);const righe=page.locator('#schermoRicerca [data-c="ReportRow"]');await expect(righe).toHaveCount(5);
 // RICERCA-TITOLO-NON-TRONCATO: nessun click in più rispetto all’originale per leggere il titolo.
 const titoloLungo=righe.filter({hasText:RICERCHE[1].titolo}).locator('.talos-list-row__title');
 expect(await titoloLungo.evaluate(n=>n.scrollWidth<=n.clientWidth),'Il titolo intero deve stare nella riga senza essere tagliato').toBe(true);await foto(page,'fixture-elenco',info);
 for(const [filtro,etichetta] of [['In corso','In corso'],['In pausa','In pausa'],['Concluse','Conclusa'],['Annullate','Annullata'],['Non riuscite','Non riuscita']]){await page.getByRole('tab',{name:filtro,exact:true}).click();await expect(righe).toHaveCount(1);await expect(righe.locator('.talos-badge')).toHaveText(etichetta);}
 await page.getByRole('tab',{name:'Non riuscite',exact:true}).press('Home');await expect(page.getByRole('tab',{name:'Tutte',exact:true})).toBeFocused();await expect(righe).toHaveCount(5);
 await page.getByRole('tab',{name:'Tutte',exact:true}).press('End');await expect(page.getByRole('tab',{name:'Non riuscite',exact:true})).toBeFocused();await page.getByRole('tab',{name:'Non riuscite',exact:true}).press('Home');
 await page.getByLabel('Cerca per titolo o stato',{exact:true}).fill('indisponibilità del servizio');await expect(righe).toHaveCount(1);await expect(righe.locator('.talos-badge')).toHaveText('In pausa');
 const dettagli=righe.getByRole('button',{name:/^Dettagli di /});await dettagli.focus();await dettagli.press('Enter');await expect(righe.getByRole('button',{name:/^Chiudi i dettagli di /})).toHaveAttribute('aria-expanded','true');
 await expect(righe.locator('.talos-list-row__title')).toHaveText(RICERCHE[1].titolo);await expect(righe.locator('.talos-list-row__title')).toHaveCSS('white-space','pre-wrap');await expect(righe.locator('.talos-list-row__sub')).toHaveText('Avviata il '+new Date(RICERCHE[1].avviataAlle).toLocaleString('it-IT'));await foto(page,'fixture-dettagli',info);
 await righe.getByRole('button',{name:/^Chiudi i dettagli di /}).press('Space');await expect(righe.getByRole('button',{name:/^Dettagli di /})).toHaveAttribute('aria-expanded','false');
 await page.getByLabel('Cerca per titolo o stato',{exact:true}).fill('nessunrisultato');await expect(page.locator('[data-research-list]')).toContainText('Nessuna ricerca corrisponde ai filtri');await foto(page,'fixture-filtro-vuoto',info);
 await expect(page.locator('#schermoRicerca [data-richiede="fase3"]:visible')).toHaveCount(0);await expect(page.locator('#schermoRicerca .talos-where')).toContainText('Fino a 20 ricerche recenti');await expect(page.locator('[data-research-query]')).toHaveCSS('height','36px');expect(scritture).toEqual([]);
 const contesto=await browser.newContext({...info.project.use,locale:'it-IT'}),originale=await contesto.newPage();await pronta(originale,ORIGINALE);
 await originale.route('**/api/v1/sessions/*/research',r=>r.fulfill({json:payload(RICERCHE)}));if(info.project.use.viewport.width<=1040)await originale.locator('.desktop-context-toggle').click();
 await originale.getByRole('button',{name:'Gestisci capability',exact:true}).click();await originale.getByText(RICERCHE[1].titolo,{exact:true}).click();await expect(originale.locator('#researchListMount .sheet-option')).toHaveCount(5);await foto(originale,'originale-fixture',info);await contesto.close();
});
test('RICERCA-RECUPERO: vedo l’errore, riprovo e una vecchia risposta non sovrascrive la nuova',async({page},info)=>{
 await pronta(page);await page.route('**/api/v1/sessions/*/research',r=>r.fulfill({status:503,json:{ok:false,error:{code:'OFFLINE',message:'Servizio non disponibile'}}}));await apriRicerca(page);
 await expect(page.locator('[data-research-esito]')).toContainText('Servizio non disponibile');await expect(page.locator('[data-research-esito]')).toBeInViewport();await expect(page.locator('#schermoRicerca .talos-topbar__path')).toHaveText('Ricerche non disponibili');await foto(page,'app-errore',info);
 await page.unroute('**/api/v1/sessions/*/research');await page.route('**/api/v1/sessions/*/research',r=>r.fulfill({json:payload([null])}));await page.locator('[data-research-refresh]').click();await expect(page.locator('[data-research-esito]')).toContainText('Elenco delle ricerche non valido');
 await page.unroute('**/api/v1/sessions/*/research');await page.locator('[data-research-refresh]').click();await expect(page.locator('[data-research-esito]')).toHaveText('0 ricerche elencate');
 let libera;const attesa=new Promise(r=>{libera=r;});let richieste=0;
 await page.route('**/api/v1/sessions/*/research',async r=>{richieste++;if(richieste===1){await attesa;await r.fulfill({json:payload([RICERCHE[0]])});}else await r.fulfill({json:payload([RICERCHE[1]])});});
 try{
  await page.locator('[data-research-refresh]').click();await expect(page.locator('[data-research-esito]')).toHaveText('Caricamento ricerche…');await expect(page.locator('#schermoRicerca .talos-topbar__path')).toHaveText('Caricamento ricerche…');
  await page.getByRole('button',{name:/^Board \d+$/}).click();await apriRicerca(page);await expect(page.locator('#schermoRicerca .talos-list-row__title')).toHaveText(RICERCHE[1].titolo);
  const obsoleta=page.waitForResponse(r=>r.url().endsWith('/research'));libera();await(await obsoleta).finished();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await expect(page.locator('#schermoRicerca .talos-list-row__title')).toHaveText(RICERCHE[1].titolo);
 }finally{libera();}
});
