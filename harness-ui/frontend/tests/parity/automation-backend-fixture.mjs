// HTTP e store reali, nessuno scheduler o modello avviato. Dati solo nella directory temporanea verificata.
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {createHttpApp} from '../../../src/http-app.mjs';
import {createAutomationStore} from '../../../src/automation-store.mjs';
import {AUTOMAZIONI,ATTIVITA_AUTOMAZIONI,ADESSO} from '../../lab/fixtures/automazioni.js';
export async function avviaAutomazioniDiProva({vuoto=false}={}){
 const radice=await mkdtemp(join(tmpdir(),'talos-automation-qa-'));let server;
 const store=createAutomationStore({cartella:radice,clock:()=>new Date(ADESSO)});
 async function chiudi(){if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}const verificata=resolve(radice);if(!verificata.startsWith(resolve(tmpdir())+sep)||!basename(verificata).startsWith('talos-automation-qa-'))throw Error('Directory fuori perimetro');await rm(verificata,{recursive:true,force:true});}
 try{
  if(!vuoto)for(const esempio of AUTOMAZIONI){const voce=await store.crea(esempio);await writeFile(join(radice,voce.id+'.json'),JSON.stringify({...esempio,id:voce.id}));}
  server=createServer(createHttpApp({automationStore:store,listaTaskDisponibili:()=>ATTIVITA_AUTOMAZIONI,clock:()=>new Date(ADESSO),staticHandler:(_req,res)=>{res.writeHead(404);res.end();}}));
  await new Promise((r,j)=>{server.once('error',j);server.listen(4178,'127.0.0.1',r);});
  return {chiudi,elenca:store.elenca,async inoltra(rotta){const url=new URL(rotta.request().url());if(!/^\/api\/v1\/(automations(?:\/[^/]+\/(?:toggle|elimina))?|tasks)$/.test(url.pathname))throw Error('Rotta fuori perimetro');const risposta=await rotta.fetch({url:'http://127.0.0.1:4178'+url.pathname});await rotta.fulfill({response:risposta});}};
 }catch(error){await chiudi();throw error;}
}
