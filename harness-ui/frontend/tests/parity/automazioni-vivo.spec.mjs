import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {AUTOMAZIONI as AUTOMAZIONI_FIX} from '../../lab/fixtures/automazioni.js';
import {avviaAutomazioniDiProva,ROTTE_AUTOMAZIONI as ROTTE} from './automation-backend-fixture.mjs';
const APP='http://127.0.0.1:4177',ORIGINALE='http://127.0.0.1:4179';
const FOTO=path.resolve('artifacts/astra-fase2/AutomationRow');
async function foto(page,nome,info){await mkdir(FOTO,{recursive:true});await page.screenshot({path:path.join(FOTO,nome+'-'+info.project.use.viewport.width+'.png'),animations:'disabled'});}
async function pronta(page,url=APP){await page.goto(url);const salta=page.getByRole('button',{name:'Salta per ora',exact:true});if(await salta.isVisible())await salta.click();if(url===APP)await page.locator('#talosAvvio').waitFor({state:'detached',timeout:15_000});}
async function apriAutomazioni(page){const voce=page.getByRole('button',{name:/^Automazioni(?: \d+)?$/});if(!await voce.isVisible())await page.getByRole('button',{name:'Altro',exact:true}).click();await voce.click();}
// L'ORIGINALE (il monolite sulla 4179) non è cambiato: questa prova resta com'era.
test('AUT-ORIGINALE: leggo le automazioni e apro il modulo esistente',async({page},info)=>{
 const lab=await avviaAutomazioniDiProva();try{
  await page.route(ROTTE,r=>lab.inoltra(r));await pronta(page,ORIGINALE);await expect(page.locator('.attention-card')).toBeVisible();await page.locator('.attention-card').getByRole('button',{name:'Apri',exact:true}).click();await expect(page.locator('#automationListReal .automation-row')).toHaveCount(3);await foto(page,'originale-fixture',info);
  await page.getByRole('button',{name:'Nuova automazione',exact:true}).click();await expect(page.getByRole('button',{name:'Crea automazione',exact:true})).toBeVisible();await foto(page,'originale-creazione',info);
 }finally{try{await page.unrouteAll({behavior:'wait'});}finally{await lab.chiudi();}}
});

/*
 * ⛔ 08/10/2026 — LA PAGINA DELL'APP È CAMBIATA, e queste prove con lei. Le automazioni a due porte (owner 08/10 notte) e la
 *   pagina «stesso linguaggio di Libreria e Note» (owner 08/10, variante «Come Note»): niente più righe con l'interruttore e
 *   «Dettagli» che si espande — schede (`.td-card`), filtri a pastiglie (`.td-filter`), il «⋯» col menu di casa (Metti in pausa /
 *   Accendi / Elimina con conferma), il foglio v2 (nome, istruzioni, cartella), gli errori nella riga di stato (`role=alert`) e,
 *   per un'azione fallita, nel toast. Le stesse quattro storie di prima, sullo store e sull'HTTP VERI del fixture.
 */
const pagina=(page)=>page.locator('#schermoAutomazioni');
const schede=(page)=>pagina(page).locator('.td-card');
const scheda=(page,nome)=>schede(page).filter({hasText:nome});
const menu=(page)=>page.locator('.ft-actions-menu');
async function dalMenu(page,nome,voce){await scheda(page,nome).locator('[data-auto-menu]').click();await menu(page).getByRole('menuitem',{name:voce,exact:true}).click();}
const filtro=(page,nome)=>pagina(page).locator('.td-filters .td-filter').filter({hasText:nome});
const RIEPILOGO='Riepilogo delle attività';

test('AUT-VUOTO: apro Automazioni e vedo solo i dati realmente presenti',async({page},info)=>{
 await pronta(page);await apriAutomazioni(page);const p=pagina(page);await expect(p.getByText('Ancora nessuna automazione',{exact:true})).toBeVisible({timeout:5000});await expect(schede(page)).toHaveCount(0);await page.reload();await apriAutomazioni(page);await expect(p.getByText('Ancora nessuna automazione',{exact:true})).toBeVisible();await foto(page,'app-vuota',info);
 await p.getByRole('button',{name:'Nuova automazione',exact:true}).first().click();await expect(page.locator('#sheetBody [data-auto-foglio-nome]')).toBeVisible();await expect(page.locator('#sheetBody').getByRole('button',{name:'Crea automazione',exact:true})).toBeVisible();
});

test('AUT-PERSISTENZA: metto in pausa, cerco, riattivo ed elimino una sola automazione',async({page},info)=>{
 const lab=await avviaAutomazioniDiProva();const attiva=async(nome)=>(await lab.elenca()).find(a=>a.nome===nome)?.attiva;try{
  await page.route(ROTTE,r=>lab.inoltra(r));await pronta(page);await apriAutomazioni(page);await expect(schede(page)).toHaveCount(3);await foto(page,'fixture-elenco',info);
  await expect(filtro(page,'In pausa')).toContainText('1');
  await dalMenu(page,RIEPILOGO,'Metti in pausa');await expect.poll(()=>attiva(RIEPILOGO)).toBe(false);await expect(filtro(page,'In pausa')).toContainText('2');await foto(page,'fixture-pausa',info);
  await page.reload();await apriAutomazioni(page);await expect(schede(page)).toHaveCount(3);await expect(filtro(page,'In pausa')).toContainText('2');
  // il pannello si apre sulla voce scelta, e si richiude. «Aggiorna» col pannello aperto si prova solo dove l'elenco resta accanto:
  // a finestra stretta il pannello prende tutto lo spazio e l'elenco (con la sua barra) si nasconde, come in Note — misurato l'08/10
  await scheda(page,RIEPILOGO).locator('.td-card-open').click();const pannello=pagina(page).locator('.td-detail');await expect(pannello).toContainText(RIEPILOGO);
  const aggiorna=pagina(page).getByRole('button',{name:'Aggiorna',exact:true});if(await aggiorna.isVisible()){await aggiorna.click();await expect(pannello).toContainText(RIEPILOGO);}
  await pannello.getByRole('button',{name:'Chiudi il dettaglio',exact:true}).click();await expect(pannello).toBeHidden();
  await pagina(page).getByRole('searchbox').fill('promemoria');await expect(schede(page)).toHaveCount(1);await expect(schede(page).first()).toContainText(AUTOMAZIONI_FIX[1].nome);await foto(page,'fixture-filtro',info);await pagina(page).getByRole('searchbox').fill('');
  await filtro(page,'In pausa').click();await expect(schede(page)).toHaveCount(2);await filtro(page,'Tutte').click();await expect(schede(page)).toHaveCount(3);
  await dalMenu(page,RIEPILOGO,'Accendi');await expect.poll(()=>attiva(RIEPILOGO)).toBe(true);
  await dalMenu(page,AUTOMAZIONI_FIX[1].nome,'Elimina');const modale=page.getByRole('dialog').filter({hasText:`Eliminare «${AUTOMAZIONI_FIX[1].nome}»?`});await expect(modale).toBeVisible();await modale.getByRole('button',{name:'Elimina',exact:true}).click();
  await expect(schede(page)).toHaveCount(2);expect((await lab.elenca()).some(a=>a.nome===AUTOMAZIONI_FIX[1].nome)).toBe(false);await page.reload();await apriAutomazioni(page);await expect(schede(page)).toHaveCount(2);expect(await attiva(RIEPILOGO)).toBe(true);
 }finally{try{await page.unrouteAll({behavior:'wait'});}finally{await lab.chiudi();}}
});

test('AUT-CREAZIONE: scrivo nome, istruzioni e cartella e creo una automazione che resta dopo il ricaricamento',async({page},info)=>{
 const lab=await avviaAutomazioniDiProva({vuoto:true});try{
  await page.route(ROTTE,r=>lab.inoltra(r));await pronta(page);await apriAutomazioni(page);const p=pagina(page);await expect(p.getByText('Ancora nessuna automazione',{exact:true})).toBeVisible();await p.getByRole('button',{name:'Nuova automazione',exact:true}).first().click();
  const foglio=page.locator('#sheetBody');await foglio.locator('[data-auto-foglio-nome]').fill('Rapporto mattutino');await foglio.locator('[data-auto-foglio-istruzioni]').fill('Leggi i commit di ieri e scrivimi in cinque righe cosa è cambiato.');await foglio.locator('[data-auto-foglio-cartella]').fill(lab.radice);await foto(page,'app-creazione',info);
  await foglio.getByRole('button',{name:'Crea automazione',exact:true}).click();await expect(schede(page)).toHaveCount(1);await expect(schede(page).first()).toContainText('Rapporto mattutino');
  const [a]=await lab.elenca();expect(a).toMatchObject({versione:2,nome:'Rapporto mattutino',istruzioni:'Leggi i commit di ieri e scrivimi in cinque righe cosa è cambiato.',cartella:lab.radice,origine:{tipo:'interfaccia'}});
  await page.reload();await apriAutomazioni(page);await expect(schede(page)).toHaveCount(1);
 }finally{try{await page.unrouteAll({behavior:'wait'});}finally{await lab.chiudi();}}
});

test('AUT-RECUPERO: un errore non cambia lo stato, e posso riprovare',async({page},info)=>{
 const lab=await avviaAutomazioniDiProva();let erroreGet=true,corrotto=false,errorePost=true,ricevuti=0;try{
  await page.route(ROTTE,async r=>{const u=new URL(r.request().url());if(r.request().method()==='POST'){ricevuti++;if(errorePost)return r.fulfill({status:503,json:{ok:false,error:{code:'UNAVAILABLE',message:'Server temporaneamente non disponibile'}}});}else if(u.pathname.endsWith('/automations')){if(erroreGet)return r.fulfill({status:503,json:{ok:false,error:{code:'UNAVAILABLE',message:'Server temporaneamente non disponibile'}}});if(corrotto)return r.fulfill({json:{ok:true,data:{items:[null]}}});}return lab.inoltra(r);});
  await pronta(page);await apriAutomazioni(page);const p=pagina(page);const allarme=p.getByRole('alert').filter({hasText:'Automazioni non disponibili'});await expect(allarme).toBeVisible();await expect(schede(page)).toHaveCount(0);await foto(page,'app-errore',info);
  erroreGet=false;corrotto=true;await p.getByRole('button',{name:'Aggiorna',exact:true}).click();await expect(p.getByRole('alert').filter({hasText:'Elenco delle automazioni non valido'})).toBeVisible();
  corrotto=false;await p.getByRole('button',{name:'Aggiorna',exact:true}).click();await expect(schede(page)).toHaveCount(3);
  // un'azione che il server rifiuta: il toast lo dice, la voce resta com'era, e si può riprovare
  await dalMenu(page,RIEPILOGO,'Metti in pausa');await expect(page.getByText('Operazione non riuscita.',{exact:true}).first()).toBeVisible();expect(ricevuti).toBe(1);expect((await lab.elenca()).find(a=>a.nome===RIEPILOGO).attiva).toBe(true);await foto(page,'errore-azione',info);
  errorePost=false;await dalMenu(page,RIEPILOGO,'Metti in pausa');await expect.poll(async()=>(await lab.elenca()).find(a=>a.nome===RIEPILOGO).attiva).toBe(false);expect(ricevuti).toBe(2);
 }finally{try{await page.unrouteAll({behavior:'wait'});}finally{await lab.chiudi();}}
});
