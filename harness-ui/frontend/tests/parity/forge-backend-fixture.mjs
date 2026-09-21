// API, registro sessioni e store REALI; soltanto i manifesti/sessioni sono fixture isolate.
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {createHttpApp} from '../../../src/http-app.mjs';
import {createSessionRegistry,SCHEMA_SESSIONE} from '../../../src/session-registry.mjs';
import {validaManifestForgeLocale} from '../../../src/forge-contract.mjs';
import {installaToolForgiato,abilitaToolForgiato} from '../../../src/tool-forge-store.mjs';
import {STRUMENTI_FORGIATI} from '../../lab/fixtures/officina.js';
export async function avviaForgeDiProva(){
 const radice=await mkdtemp(join(tmpdir(),'talos-forge-qa-')),cartellaStore=join(radice,'sessions'),cartellaForge=join(radice,'forge');await mkdir(cartellaStore);
 let server;
 async function chiudi(){
  if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}
  const verificata=resolve(radice),base=resolve(tmpdir())+sep;if(!verificata.startsWith(base)||!basename(verificata).startsWith('talos-forge-qa-'))throw new Error('Percorso temporaneo fuori perimetro');await rm(verificata,{recursive:true,force:true});
 }
 try{
  for(const s of STRUMENTI_FORGIATI){
   const manifest={id:s.id,title:s.titolo,description:s.descrizione,flow:{entry:'azione',maxTransitions:8,nodes:[{id:'azione',type:'capability',capability:s.capacita[0],input:{},target:'state.risultato',next:'fine'},{id:'fine',type:'return',value:{$ref:'state.risultato'}}]}};
   const valida=validaManifestForgeLocale(manifest);if(!valida.ok)throw new Error(valida.diagnostica.join('; '));
   const installato=await installaToolForgiato({cartella:cartellaForge,manifest,...valida});
   // Data fissa per confrontare esattamente originale e mockup; nessuna esecuzione del flow.
   await writeFile(join(cartellaForge,s.id+'.json'),JSON.stringify({...installato,installatoAlle:s.installatoAlle}));
   if(s.abilitato)await abilitaToolForgiato({cartella:cartellaForge,id:s.id,abilitato:true});
  }
  const registro=createSessionRegistry({cartellaStore,cartellaForge,guardaWorkspaceFn:()=>()=>{}}),sessioni=new Set();
  server=createServer(createHttpApp({sessionRegistry:registro,staticHandler:(_req,res)=>{res.writeHead(404);res.end();}}));
  await new Promise((r,j)=>{server.once('error',j);server.listen(4178,'127.0.0.1',r);});
  return {radice,chiudi,
   async inoltra(rotta){
    const url=new URL(rotta.request().url()),id=decodeURIComponent(url.pathname.split('/')[4]);if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('Id sessione di prova non valido');
    if(!sessioni.has(id)){await writeFile(join(cartellaStore,id+'.jsonl'),JSON.stringify({tipo:'intestazione',schema:SCHEMA_SESSIONE,sessionId:id,taskId:'forge-prova',cartella:radice,task:'Prova UI isolata',avviataAlle:'2026-09-05T10:00:00Z',modello:'nessun-modello',permessi:'Read only'})+'\n');const ripristino=await registro.ripristina();if(!ripristino.ripristinate)throw new Error('Sessione di prova non ripristinata');sessioni.add(id);}
    const risposta=await rotta.fetch({url:'http://127.0.0.1:4178'+url.pathname});await rotta.fulfill({response:risposta});
   },
   async leggi(id){if(!STRUMENTI_FORGIATI.some(s=>s.id===id))throw new Error('Attrezzo fuori fixture');return JSON.parse(await readFile(join(cartellaForge,id+'.json'),'utf8'));}
  };
 }catch(e){await chiudi();throw e;}
}
