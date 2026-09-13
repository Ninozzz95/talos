import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {createHttpApp} from '../../../src/http-app.mjs';
import {createSearchSourceStore} from '../../../src/search-source-store.mjs';
export async function avviaFonteDiProva(){
 const radice=await mkdtemp(join(tmpdir(),'talos-fonte-qa-')),file=join(radice,'fonte.json'),chiavi=new Map(),richieste=[];let server,fallisci=false;
 const keyring={get:(s,a)=>chiavi.get(s+'/'+a),set:(s,a,v)=>{chiavi.set(s+'/'+a,v);},remove:(s,a)=>chiavi.delete(s+'/'+a)};
 const store=createSearchSourceStore({env:{},keyring,file});
 async function chiudi(){if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}const p=resolve(radice);if(!p.startsWith(resolve(tmpdir())+sep)||!basename(p).startsWith('talos-fonte-qa-'))throw Error('Fuori perimetro temporaneo');await rm(p,{recursive:true,force:true});}
 try{server=createServer(createHttpApp({staticHandler:async()=>null,searchSourceStore:store,provaRicercaWebFn:async query=>{richieste.push(query);if(fallisci)throw Error('Fonte di prova temporaneamente non disponibile');return {fonte:store.listPublic().source,risultati:2,titoli:['Documentazione ufficiale','Guida di configurazione']};}}));await new Promise((r,j)=>{server.once('error',j);server.listen(4178,'127.0.0.1',r);});return{chiudi,richieste,store,guastaProva:v=>{fallisci=v;},leggiFile:()=>readFile(file,'utf8'),riapri:()=>createSearchSourceStore({env:{},keyring,file}).listPublic(),async inoltra(rotta){const url=new URL(rotta.request().url());const risposta=await rotta.fetch({url:'http://127.0.0.1:4178'+url.pathname});await rotta.fulfill({response:risposta});}};}catch(e){await chiudi();throw e;}
}
