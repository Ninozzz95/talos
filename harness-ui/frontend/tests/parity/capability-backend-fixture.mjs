import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {createHttpApp} from '../../../src/http-app.mjs';
import {createSessionRegistry,SCHEMA_SESSIONE} from '../../../src/session-registry.mjs';
import {ATTREZZI} from '../../lab/fixtures/capability.js';
export async function avviaCapabilityDiProva(){
 const radice=await mkdtemp(join(tmpdir(),'talos-capability-qa-')),cartellaStore=join(radice,'sessions');await mkdir(cartellaStore);let server;
 async function chiudi(){if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}const p=resolve(radice);if(!p.startsWith(resolve(tmpdir())+sep)||!basename(p).startsWith('talos-capability-qa-'))throw new Error('Fuori perimetro temporaneo');await rm(p,{recursive:true,force:true});}
 try{const registro=createSessionRegistry({cartellaStore,guardaWorkspaceFn:()=>()=>{},attrezziKernelFn:async()=>({base:ATTREZZI.filter(a=>a.categoria==='base'),estesi:ATTREZZI.filter(a=>a.categoria==='esteso')})}),sessioni=new Set();
 server=createServer(createHttpApp({sessionRegistry:registro,staticHandler:(_req,res)=>{res.writeHead(404);res.end();}}));await new Promise((r,j)=>{server.once('error',j);server.listen(4178,'127.0.0.1',r);});
 return {chiudi,async inoltra(rotta){const url=new URL(rotta.request().url()),id=decodeURIComponent(url.pathname.split('/')[4]||'');if(id&&!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('Sessione invalida');if(id&&!sessioni.has(id)){await writeFile(join(cartellaStore,id+'.jsonl'),JSON.stringify({tipo:'intestazione',schema:SCHEMA_SESSIONE,sessionId:id,taskId:'capability-prova',cartella:radice,task:'Controllo permessi isolato',avviataAlle:'2026-09-05T10:00:00Z',modello:'nessun-modello',permessi:'Full access',permessiPerAttrezzo:{}})+'\n');await registro.ripristina();sessioni.add(id);}const risposta=await rotta.fetch({url:'http://127.0.0.1:4178'+url.pathname});await rotta.fulfill({response:risposta});},async leggiPermessi(id){if(!sessioni.has(id))throw new Error('Sessione non creata');return (await registro.elencaAttrezzi(id)).attrezzi;},async leggiDisco(id){if(!sessioni.has(id))throw new Error('Sessione non creata');return readFile(join(cartellaStore,id+'.jsonl'),'utf8');}};
 }catch(e){await chiudi();throw e;}
}
