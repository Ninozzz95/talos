import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creaLibraryRow,ultimaCartella,provenienzaVoceLibreria} from '../../src/components/libreria.js';

/*
 * BC-38 (12/09/2026), owner: «mettere il percorso dei file nella Libreria. Nel dettaglio (sidebar)
 * e nella card/riga SOLO la cartella; nel dettaglio sidebar anche da chi sono stati creati e da
 * quale sessione».
 *
 * ⛔ Provato nei DUE VERSI, sempre: una voce NUOVA (percorso + sessione) e una VECCHIA (i campi non
 *   ci sono, perché nessuna voce salvata prima di oggi li porta — misurato: 14 su 14 sul disco
 *   dell'owner). La seconda metà è quella che conta: un pannello che si rompe sulle voci di ieri
 *   sarebbe peggio del niente di ieri.
 *
 * Ricerca dietro le scelte provate qui (12/09/2026, WebFetch sulle pagine ufficiali — il budget di
 * ricerca web della sessione era esaurito, 200/200): VS Code (i breadcrumbs mostrano il percorso;
 * quello INTERO sta dietro un comando, «Copy Breadcrumbs Path», non in un fumetto; le etichette di
 * scheda personalizzate usano dirname/filename, cioè SOLO la cartella che contiene); Microsoft
 * BreadcrumbBar (quando lo spazio manca l'ellissi mangia i nodi PIÙ A SINISTRA, la coda resta);
 * NousResearch/hermes-agent (nessun pannello Libreria documentato: niente da copiare).
 */

/** Il DOM minimo che serve alla riga — stesso finto di `libreria-azioni.test.mjs`, più `createTextNode`. */
function documentoFinto(){
 const crea=(tag)=>{
  const attributi=new Map();
  const nodo={
   tag,tagName:tag.toUpperCase(),classi:new Set(),dataset:{},figli:[],ascolti:[],testoProprio:'',hidden:false,disabled:false,value:'',
   get className(){return [...nodo.classi].join(' ');},
   set className(v){nodo.classi=new Set(String(v).split(/\s+/).filter(Boolean));},
   classList:{add:(...c)=>c.forEach(x=>nodo.classi.add(x)),remove:(...c)=>c.forEach(x=>nodo.classi.delete(x)),toggle:(c,forza)=>(forza?nodo.classi.add(c):nodo.classi.delete(c)),contains:c=>nodo.classi.has(c)},
   get textContent(){return nodo.testoProprio!==''?nodo.testoProprio:nodo.figli.map(f=>f.textContent??'').join('');},
   set textContent(v){nodo.testoProprio=String(v);},
   setAttribute:(k,v)=>attributi.set(k,String(v)),
   getAttribute:k=>(attributi.has(k)?attributi.get(k):null),
   append:(...x)=>nodo.figli.push(...x),
   prepend:(...x)=>nodo.figli.unshift(...x),
   addEventListener:(t,m)=>nodo.ascolti.push({t,m}),
   lancia:(t,e={})=>Promise.all(nodo.ascolti.filter(a=>a.t===t).map(a=>a.m({type:t,preventDefault(){},stopPropagation(){},...e}))),
   focus:()=>{},select:()=>{},
   trova:(classe)=>(nodo.classi.has(classe)?nodo:nodo.figli.map(f=>f.trova?.(classe)).find(Boolean)||null),
  };
  return nodo;
 };
 return {createElement:crea,createElementNS:(_ns,tag)=>crea(tag),createTextNode:(t)=>({textContent:String(t),figli:[],trova:()=>null})};
}

const SERVIZIO={rinomina:async()=>({ok:true}),elimina:async()=>({ok:true}),rivela:async()=>({ok:true}),apri:async()=>({ok:true})};
const vociDi=(riga)=>(typeof riga.vociMenu==='function'?riga.vociMenu():[]);
const voceDi=(riga,chiave)=>vociDi(riga).find(v=>v.chiave===chiave)||null;
const tuttiIDataset=(n,fuori=[])=>{if(n?.dataset?.azione)fuori.push(n.dataset.azione);for(const f of n?.figli||[])tuttiIDataset(f,fuori);return fuori;};

const NUOVA={
 id:'lib-1',nome:'Relazione.md',fileType:'document',origine:'generated',aggiornatoIl:'2026-09-11T10:00:00.000Z',
 cartella:'C:\\Users\\Antonino\\Desktop',
 percorso:'C:\\Users\\Antonino\\Desktop\\.harness-ui-library\\lib-1\\contenuto',
 creatoDa:{tipo:'modello',modello:'z-ai/glm-5.3-flash',provider:'openrouter'},
 sessione:{id:'c8e9b07b-1111-2222-3333-444455556666',nome:'Relazione trimestrale'},
};
/* Esattamente la forma che c'è oggi sul disco: nessun percorso, nessun autore, nessuna sessione. */
const VECCHIA={id:'lib-0',nome:'File di prova - Word.docx',fileType:'document',origine:'generated',aggiornatoIl:'2026-09-11T18:08:49.041Z'};

test('BC-38 ultimaCartella: l’ultimo segmento, e una radice di disco si dice per intero',()=>{
 assert.equal(ultimaCartella('C:\\Users\\Antonino\\Desktop'),'Desktop');
 assert.equal(ultimaCartella('C:/progetti/talos/'),'talos');
 /* ⛔ AL CONTRARIO: la radice non ha un nome di cartella — «C:» da solo si leggerebbe come un errore. */
 assert.equal(ultimaCartella('C:\\'),'C:');
 assert.equal(ultimaCartella(''),'');
 assert.equal(ultimaCartella(null),'');
 assert.equal(ultimaCartella(undefined),'');
});

test('BC-38 provenienza: una voce NUOVA porta cartella, percorso, autore e sessione',()=>{
 const p=provenienzaVoceLibreria(NUOVA);
 assert.equal(p.cartellaBreve,'Desktop');
 assert.equal(p.percorso,NUOVA.percorso);
 assert.equal(p.creatoDa.chi,'TALOS');
 /* ⛔ Mai l'identificatore grezzo come testo principale: il nome umano esiste già (nomeModelloUmano). */
 assert.ok(!p.creatoDa.dettaglio.includes('z-ai/'),p.creatoDa.dettaglio);
 assert.deepEqual(p.sessione,{id:NUOVA.sessione.id,nome:'Relazione trimestrale'});
});

test('BC-38 AL CONTRARIO: una voce VECCHIA non inventa né percorso né sessione',()=>{
 const p=provenienzaVoceLibreria(VECCHIA);
 assert.equal(p.percorso,'');
 assert.equal(p.cartellaBreve,'');
 assert.equal(p.sessione,null,'una sessione non registrata NON si inventa');
 /* L'autore resta deducibile dall'origine, che c'è sempre: è un fatto, non una supposizione. */
 assert.equal(p.creatoDa.chi,'TALOS');
 assert.equal(p.creatoDa.dettaglio,'modello non registrato');
 assert.equal(provenienzaVoceLibreria({origine:'uploaded'}).creatoDa.chi,'Tu');
});

test('BC-38 il nome VIVO della sessione batte quello congelato nel meta',()=>{
 const p=provenienzaVoceLibreria(NUOVA,{nomeSessione:(id)=>(id===NUOVA.sessione.id?'Rinominata ieri':null)});
 assert.equal(p.sessione.nome,'Rinominata ieri');
 /* ⛔ E se l'elenco vivo non sa nulla, si torna al congelato — mai a un id grezzo. */
 assert.equal(provenienzaVoceLibreria(NUOVA,{nomeSessione:()=>null}).sessione.nome,'Relazione trimestrale');
});

test('BC-38 RIGA: il sottotitolo porta SOLO la cartella, mai il percorso intero e mai un fumetto',()=>{
 const doc=documentoFinto();
 const riga=creaLibraryRow(NUOVA,{document:doc,sessionId:'s-1',azioni:SERVIZIO,onMenu:()=>{}});
 assert.equal(riga.trova('talos-list-row__sub').textContent,'Documento · Aggiornato il 11/09/2026 · in Desktop');
 /* ⛔ Il 10/09 il `title` nativo è stato tolto da questa riga perché COPRIVA i filtri della pagina:
    col percorso, tre volte più lungo del nome, sarebbe peggio. Questa prova impedisce che torni. */
 const conTitle=[];
 (function cerca(n){if(n?.getAttribute?.('title'))conTitle.push(n.tag);for(const f of n?.figli||[])cerca(f);})(riga);
 assert.deepEqual(conTitle,[],'nessun fumetto nativo nella riga');
 /* ⛔ E il percorso intero non compare da nessuna parte nel testo della riga. */
 assert.ok(!riga.textContent.includes('.harness-ui-library'),riga.textContent);
});

test('BC-38 RIGA AL CONTRARIO: senza provenienza il sottotitolo è quello di ieri, identico',()=>{
 const doc=documentoFinto();
 const riga=creaLibraryRow(VECCHIA,{document:doc,sessionId:'s-1',azioni:SERVIZIO,onMenu:()=>{}});
 assert.equal(riga.trova('talos-list-row__sub').textContent,'Documento · Aggiornato il 11/09/2026');
});

test('BC-38 MENU: «Copia percorso» c’è con un percorso, e NON c’è senza — mai un comando inerte',async()=>{
 const doc=documentoFinto();
 const copiati=[];
 const riga=creaLibraryRow(NUOVA,{document:doc,sessionId:'s-1',azioni:SERVIZIO,onMenu:()=>{},copia:async(t)=>{copiati.push(t);}});
 const voce=voceDi(riga,'copia-percorso');
 assert.ok(voce,'la voce di menu deve esistere');
 assert.equal(voce.etichetta,'Copia percorso');
 assert.equal(voce.elemento.getAttribute('aria-label'),'Copia il percorso di Relazione.md');
 /* ⛔ Nel MENU, non affiancata: la riga porta un bottone solo (regola owner 10/09). */
 assert.deepEqual(tuttiIDataset(riga.trova('talos-list-row__azioni')),['menu']);
 await voce.elemento.lancia('click');
 assert.deepEqual(copiati,[NUOVA.percorso]);
 /* ⛔ CHI INIETTA `copia` HA GIÀ IL SUO MESSAGGIO (`copyText` della app mostra il suo toast): la
    riga NON ne aggiunge un secondo, o per un gesto solo comparirebbero due verità. */
 assert.equal(riga.trova('talos-list-row__messaggio').hidden,true);

 const riga2=creaLibraryRow(VECCHIA,{document:documentoFinto(),sessionId:'s-1',azioni:SERVIZIO,onMenu:()=>{}});
 assert.equal(voceDi(riga2,'copia-percorso'),null,'senza percorso il comando non si disegna');
 assert.deepEqual(vociDi(riga2).map(v=>v.chiave),['apri','scarica','rinomina','rivela','elimina']);
});

test('BC-38 senza `copia` iniettata si passa dagli appunti del browser, e l’esito si legge nella riga',async()=>{
 const doc=documentoFinto();
 const scritti=[];
 /* ⛔ `globalThis.navigator` in Node ha solo un getter: si ridefinisce la PROPRIETÀ, non il valore. */
 const prima=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async(t)=>{scritti.push(t);}}}});
 try{
  const riga=creaLibraryRow(NUOVA,{document:doc,sessionId:'s-1',azioni:SERVIZIO,onMenu:()=>{}});
  await voceDi(riga,'copia-percorso').elemento.lancia('click');
  assert.deepEqual(scritti,[NUOVA.percorso]);
  const messaggio=riga.trova('talos-list-row__messaggio');
  assert.equal(messaggio.textContent,'Percorso copiato.');
  assert.equal(messaggio.hidden,false);
 }finally{if(prima)Object.defineProperty(globalThis,'navigator',prima);else delete globalThis.navigator;}
});

test('BC-38 AL CONTRARIO: se gli appunti non ci sono, la riga dice come fare — non «non riuscito»',async()=>{
 const doc=documentoFinto();
 const riga=creaLibraryRow(NUOVA,{document:doc,sessionId:'s-1',azioni:SERVIZIO,onMenu:()=>{},copia:async()=>{throw new Error('negato');}});
 await voceDi(riga,'copia-percorso').elemento.lancia('click');
 const messaggio=riga.trova('talos-list-row__messaggio');
 assert.match(messaggio.textContent,/dettaglio/);
 assert.equal(messaggio.dataset.tono,'errore');
});
