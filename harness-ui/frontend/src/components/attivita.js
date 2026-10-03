import { t as traduci, tn, linguaCorrenteDiT } from './lingua.js';
/* Date e numeri nella lingua dell'interfaccia (italiano → it-IT, inglese → en-US), letta a ogni uso. */
const localeUI=()=>(linguaCorrenteDiT()==='en'?'en-US':'it-IT');
const conta=n=>tn('sezioni.tasks.count.one','sezioni.tasks.count.many',n,{n:new Intl.NumberFormat(localeUI()).format(n)});
/** TaskRow del mockup, dati tasks-store.mjs. WAI Tabs/Disclosure, 05/09/2026. */
/* ⛔ Le etichette si leggono a ogni uso (getter), non alla creazione del modulo: seguono il cambio di lingua. */
const STATI=new Map([
 ['todo',{get testo(){return traduci('sezioni.tasks.status.todo');},icona:'list',tono:null}],
 ['doing',{get testo(){return traduci('sezioni.tasks.status.doing');},icona:'clock',tono:'info'}],
 ['done',{get testo(){return traduci('sezioni.tasks.status.done');},icona:'check',tono:'success'}],
]);
const PRIORITA=new Map([['low',()=>traduci('sezioni.tasks.priority.low')],['normal',()=>traduci('sezioni.tasks.priority.normal')],['high',()=>traduci('sezioni.tasks.priority.high')]]);
export function statoAttivita(stato){return STATI.get(stato)||{testo:traduci('sezioni.tasks.status.unknown'),icona:'list',tono:null};}
export function prioritaAttivita(priorita){return (PRIORITA.get(priorita)||(()=>traduci('sezioni.tasks.priority.unknown')))();}
export function testiAttivita(a){
 const titolo=typeof a?.titolo==='string'&&a.titolo.trim()?a.titolo:traduci('sezioni.tasks.untitled');
 const descrizione=typeof a?.descrizione==='string'?a.descrizione:'';
 const compatto=descrizione.replace(/\s+/g,' ').trim();
 const data=typeof a?.aggiornataAlle==='string'?new Date(a.aggiornataAlle):null;
 return {titolo,descrizione,anteprima:compatto.length>100?compatto.slice(0,100)+'…':compatto,autore:traduci('sezioni.tasks.authorUnknown'),aggiornata:data&&Number.isFinite(data.getTime())?data.toLocaleString(localeUI()):null};
}
export function riepilogoAttivita(attivita){
 const aperte=attivita.filter(a=>a?.stato==='todo'||a?.stato==='doing').length,fatte=attivita.filter(a=>a?.stato==='done').length,ignote=attivita.length-aperte-fatte;
 return tn('sezioni.tasks.summary.openOne','sezioni.tasks.summary.openMany',aperte)+' · '+tn('sezioni.tasks.summary.doneOne','sezioni.tasks.summary.doneMany',fatte)+(ignote?' · '+tn('sezioni.tasks.summary.unknownOne','sezioni.tasks.summary.unknownMany',ignote):'');
}
export function filtraAttivita(attivita,{query='',stato='tutte'}={}){
 const q=String(query).trim().toLocaleLowerCase('it');
 return attivita.filter(a=>(stato==='tutte'||a?.stato===stato)&&(!q||[testiAttivita(a).titolo,testiAttivita(a).descrizione,statoAttivita(a?.stato).testo,prioritaAttivita(a?.priorita)].join(' ').toLocaleLowerCase('it').includes(q)));
}
function el(doc,tag,classe,testo){const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;}
export function creaTaskRow(a,{document:doc=globalThis.document,aperta=false,onEspandi}={}){
 const t=testiAttivita(a),s=statoAttivita(a?.stato);
 const riga=el(doc,'div','talos-list-row'+(a?.stato==='done'?' talos-list-row--done':''));riga.dataset.c='TaskRow';riga.dataset.taskId=a?.id||'';riga.setAttribute('role','listitem');
 const segna=el(doc,'button','talos-checkbox');segna.type='button';segna.hidden=true;segna.dataset.richiede='fase3';segna.setAttribute('role','checkbox');segna.setAttribute('aria-checked',String(a?.stato==='done'));segna.setAttribute('aria-label',traduci("sezioni.tasks.row.markDone"));
 const icona=el(doc,'span','talos-list-row__icon'),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),use=doc.createElementNS('http://www.w3.org/2000/svg','use');svg.setAttribute('class','i');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#i-'+s.icona);svg.append(use);icona.append(svg);
 const testo=el(doc,'span','talos-list-row__text'),titolo=el(doc,'span','talos-list-row__title',t.titolo),sotto=el(doc,'span','talos-list-row__sub');titolo.title=t.titolo;testo.append(titolo,sotto);
 const aside=el(doc,'span','talos-list-row__aside');aside.append(el(doc,'span','talos-badge'+(s.tono?' talos-badge--'+s.tono:''),s.testo));
 const leggi=el(doc,'button','talos-button talos-button--ghost talos-button--sm');leggi.type='button';
 function mostra(){riga.dataset.aperta=String(aperta);sotto.textContent=prioritaAttivita(a?.priorita)+' · '+t.autore+(aperta?(t.descrizione?'\n'+t.descrizione:'\n'+traduci('sezioni.tasks.row.noDescription'))+(t.aggiornata?'\n'+traduci('sezioni.tasks.row.updatedOn',{date:t.aggiornata}):''):(t.anteprima?' · '+t.anteprima:''));leggi.textContent=aperta?traduci("sezioni.common.close"):traduci("sezioni.common.read");leggi.setAttribute('aria-expanded',String(aperta));leggi.setAttribute('aria-label',aperta?traduci('sezioni.tasks.row.closeLabel',{title:t.titolo}):traduci('sezioni.tasks.row.readLabel',{title:t.titolo}));}
 leggi.addEventListener('click',()=>{aperta=!aperta;mostra();onEspandi?.(aperta);});mostra();aside.append(leggi);riga.append(segna,icona,testo,aside);return riga;
}
const PAGINE=new WeakMap();
export function aggiornaPaginaAttivita(schermo,attivita,opzioni={}){
 let pagina=PAGINE.get(schermo);
 if(!pagina){
  pagina={attivita:[],opzioni:{},query:'',stato:'tutte',aperte:new Set()};PAGINE.set(schermo,pagina);
  const tabs=[...schermo.querySelectorAll('[data-task-stato]')];
  for(const tab of tabs){
   tab.addEventListener('click',()=>{pagina.stato=tab.dataset.taskStato;renderAttivita(schermo,pagina);});
   tab.addEventListener('keydown',e=>{if(!['Home','End','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(tab),scelta=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];scelta.click();scelta.focus();});
  }
  schermo.querySelector('[data-task-query]').addEventListener('input',e=>{pagina.query=e.target.value;renderAttivita(schermo,pagina);});
  schermo.querySelector('[data-task-refresh]').addEventListener('click',()=>pagina.opzioni.onAggiorna?.());
 }
 pagina.attivita=attivita;pagina.opzioni={...pagina.opzioni,...opzioni};renderAttivita(schermo,pagina);
}
function renderAttivita(schermo,pagina){
 const {attivita,opzioni}=pagina,visibili=filtraAttivita(attivita,pagina),doc=schermo.ownerDocument;
 for(const tab of schermo.querySelectorAll('[data-task-stato]')){const attivo=pagina.stato===tab.dataset.taskStato;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;}
 schermo.querySelector('[data-task-refresh]').disabled=Boolean(opzioni.caricamento);
 schermo.querySelector('.talos-topbar__path').textContent=opzioni.errore?traduci("sezioni.tasks.unavailable"):opzioni.caricamento?traduci("sezioni.tasks.loading"):riepilogoAttivita(attivita);
 const esito=schermo.querySelector('[data-task-esito]');esito.textContent=opzioni.errore||(opzioni.caricamento?traduci("sezioni.tasks.loading"):visibili.length===attivita.length?conta(attivita.length):traduci("sezioni.common.shownOfTotal", { shown: visibili.length, total: conta(attivita.length) }));esito.setAttribute('role',opzioni.errore?'alert':'status');
 const lista=schermo.querySelector('[data-task-list]'),attivo=doc.activeElement?.closest('[data-task-id]')?.dataset.taskId;lista.setAttribute('role',visibili.length?'list':'group');
 lista.replaceChildren(...visibili.map(a=>creaTaskRow(a,{document:doc,aperta:pagina.aperte.has(a.id),onEspandi:aperta=>{if(aperta)pagina.aperte.add(a.id);else pagina.aperte.delete(a.id);}})));
 if(!visibili.length)lista.append(el(doc,'p','talos-list-row talos-muted',opzioni.errore||(opzioni.caricamento?traduci("sezioni.tasks.loading"):attivita.length?traduci("sezioni.tasks.noMatches"):traduci("sezioni.tasks.empty"))));
 if(attivo)[...lista.querySelectorAll('[data-task-id]')].find(n=>n.dataset.taskId===attivo)?.querySelector('button:not([hidden])')?.focus({preventScroll:true});
}
