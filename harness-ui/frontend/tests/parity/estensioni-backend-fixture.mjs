import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {createHttpApp} from '../../../src/http-app.mjs';
import {createSessionRegistry,SCHEMA_SESSIONE} from '../../../src/session-registry.mjs';
import {ESTENSIONI} from '../../lab/fixtures/estensioni.js';
export async function avviaEstensioniDiProva(){
 const radice=await mkdtemp(join(tmpdir(),'talos-estensioni-qa-')),cartella=join(radice,'progetto'),cartellaStore=join(radice,'sessions');await mkdir(cartella);await mkdir(cartellaStore);let server;
 const mcp=join(cartella,'.harness-ui-mcp.json'),hooks=join(cartella,'.harness-ui-hooks.json');
 await writeFile(mcp,JSON.stringify({server:ESTENSIONI.mcp}));await writeFile(hooks,JSON.stringify({hooks:ESTENSIONI.hooks.map(h=>({...h,comando:'echo '+h.id}))}));
 for(const s of ESTENSIONI.skills){const d=join(cartella,'.harness-ui-skills',s.id);await mkdir(d,{recursive:true});await writeFile(join(d,'SKILL.md'),'---\nname: '+s.name+'\ndescription: '+s.description+'\n---\nIstruzioni di prova.');}
 for(const p of ESTENSIONI.plugins){const d=join(cartella,'.harness-ui-plugins',p.id);await mkdir(d,{recursive:true});await writeFile(join(d,'plugin.json'),JSON.stringify(p));}
 async function chiudi(){if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}const p=resolve(radice);if(!p.startsWith(resolve(tmpdir())+sep)||!basename(p).startsWith('talos-estensioni-qa-'))throw new Error('Fuori perimetro temporaneo');await rm(p,{recursive:true,force:true});}
 try{const registro=createSessionRegistry({cartellaStore,cartellaTrustHook:join(radice,'trust-hook'),cartellaTrustMcp:join(radice,'trust-mcp'),cartellaTrustPlugin:join(radice,'trust-plugin'),guardaWorkspaceFn:()=>()=>{}}),sessioni=new Set();
 server=createServer(createHttpApp({sessionRegistry:registro,staticHandler:(_req,res)=>{res.writeHead(404);res.end();}}));await new Promise((r,j)=>{server.once('error',j);server.listen(4178,'127.0.0.1',r);});
 return {chiudi,async inoltra(rotta){const url=new URL(rotta.request().url()),id=decodeURIComponent(url.pathname.split('/')[4]||'');if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('Sessione invalida');if(!sessioni.has(id)){await writeFile(join(cartellaStore,id+'.jsonl'),JSON.stringify({tipo:'intestazione',schema:SCHEMA_SESSIONE,sessionId:id,taskId:'estensioni-prova',cartella,task:'Controllo inventari isolato',avviataAlle:'2026-09-05T10:00:00Z',modello:'nessun-modello',permessi:'Read only'})+'\n');await registro.ripristina();sessioni.add(id);}const risposta=await rotta.fetch({url:'http://127.0.0.1:4178'+url.pathname});await rotta.fulfill({response:risposta});},async leggiFiducia(tipo,id){const d={mcp:'trust-mcp',plugins:'trust-plugin',hooks:'trust-hook'}[tipo];if(!d||!['documentazione','quality','prima-del-comando'].includes(id))throw new Error('Voce non prevista');return JSON.parse(await readFile(join(radice,d,id+'.json'),'utf8'));},async cambiaManifesto(){await writeFile(mcp,JSON.stringify({server:ESTENSIONI.mcp.map(s=>({...s,argomenti:[...s.argomenti,'--updated']}))}));},async guastaManifesto(){await writeFile(mcp,'{');},async riparaManifesto(){await writeFile(mcp,JSON.stringify({server:ESTENSIONI.mcp}));}};
 }catch(e){await chiudi();throw e;}
}
