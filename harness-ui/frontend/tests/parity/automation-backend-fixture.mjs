// HTTP e store reali, nessuno scheduler o modello avviato. Dati solo nella directory temporanea verificata.
// 08/10/2026: porta 0 (la sceglie il sistema, chiusa a fine prova) invece della 4178 fissa — le porte fisse sono solo 4174/4176/4177;
// e le rotte della pagina v2 (posta «Da guardare» e storico dei giri), che la pagina chiede insieme all'elenco.
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {createHttpApp} from '../../../src/http-app.mjs';
import {createAutomationStore} from '../../../src/automation-store.mjs';
import {AUTOMAZIONI,ATTIVITA_AUTOMAZIONI,ADESSO} from '../../lab/fixtures/automazioni.js';
export const ROTTE_AUTOMAZIONI=/\/api\/v1\/(?:automations(?:\/inbox|\/[^/]+\/(?:toggle|elimina|runs))?|tasks)$/;
export async function avviaAutomazioniDiProva({vuoto=false}={}){
 const radice=await mkdtemp(join(tmpdir(),'talos-automation-qa-'));let server;let porta=0;
 const store=createAutomationStore({cartella:radice,clock:()=>new Date(ADESSO)});
 async function chiudi(){if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}const verificata=resolve(radice);if(!verificata.startsWith(resolve(tmpdir())+sep)||!basename(verificata).startsWith('talos-automation-qa-'))throw Error('Directory fuori perimetro');await rm(verificata,{recursive:true,force:true});}
 try{
  if(!vuoto)for(const esempio of AUTOMAZIONI){const voce=await store.crea(esempio);await writeFile(join(radice,voce.id+'.json'),JSON.stringify({...esempio,id:voce.id}));}
  server=createServer(createHttpApp({automationStore:store,listaTaskDisponibili:()=>ATTIVITA_AUTOMAZIONI,clock:()=>new Date(ADESSO),staticHandler:(_req,res)=>{res.writeHead(404);res.end();}}));
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
  porta=server.address().port;
  return {chiudi,radice,elenca:store.elenca,async inoltra(rotta){const url=new URL(rotta.request().url());if(!ROTTE_AUTOMAZIONI.test(url.pathname))throw Error('Rotta fuori perimetro');const risposta=await rotta.fetch({url:`http://127.0.0.1:${porta}${url.pathname}`});await rotta.fulfill({response:risposta});}};
 }catch(error){await chiudi();throw error;}
}
