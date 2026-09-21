import { plurale } from './plurale.js'; // BH-12: «1 ricordi» — il plurale vive in un posto solo
/** TaskRow del mockup, dati tasks-store.mjs. WAI Tabs/Disclosure, 05/09/2026. */
const STATI=new Map([
 ['todo',{testo:'Da fare',icona:'list',tono:null}],
 ['doing',{testo:'In corso',icona:'clock',tono:'info'}],
 ['done',{testo:'Fatta',icona:'check',tono:'success'}],
]);
const PRIORITA=new Map([['low','Priorità bassa'],['normal','Priorità normale'],['high','Priorità alta']]);
export function statoAttivita(stato){return STATI.get(stato)||{testo:'Stato non registrato',icona:'list',tono:null};}
export function prioritaAttivita(priorita){return PRIORITA.get(priorita)||'Priorità non registrata';}
export function testiAttivita(a){
 const titolo=typeof a?.titolo==='string'&&a.titolo.trim()?a.titolo:'Attività senza titolo';
 const descrizione=typeof a?.descrizione==='string'?a.descrizione:'';
 const compatto=descrizione.replace(/\s+/g,' ').trim();
 const data=typeof a?.aggiornataAlle==='string'?new Date(a.aggiornataAlle):null;
 return {titolo,descrizione,anteprima:compatto.length>100?compatto.slice(0,100)+'…':compatto,autore:'Autore non registrato',aggiornata:data&&Number.isFinite(data.getTime())?data.toLocaleString('it-IT'):null};
}
export function riepilogoAttivita(attivita){
 const aperte=attivita.filter(a=>a?.stato==='todo'||a?.stato==='doing').length,fatte=attivita.filter(a=>a?.stato==='done').length,ignote=attivita.length-aperte-fatte;
 return aperte+' apert'+(aperte===1?'a':'e')+' · '+fatte+' fatt'+(fatte===1?'a':'e')+(ignote?' · '+ignote+(ignote===1?' stato non registrato':' stati non registrati'):'');
}
export function filtraAttivita(attivita,{query='',stato='tutte'}={}){
 const q=String(query).trim().toLocaleLowerCase('it');
 return attivita.filter(a=>(stato==='tutte'||a?.stato===stato)&&(!q||[testiAttivita(a).titolo,testiAttivita(a).descrizione,statoAttivita(a?.stato).testo,prioritaAttivita(a?.priorita)].join(' ').toLocaleLowerCase('it').includes(q)));
}
function el(doc,tag,classe,testo){const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;}
export function creaTaskRow(a,{document:doc=globalThis.document,aperta=false,onEspandi}={}){
 const t=testiAttivita(a),s=statoAttivita(a?.stato);
 const riga=el(doc,'div','talos-list-row'+(a?.stato==='done'?' talos-list-row--done':''));riga.dataset.c='TaskRow';riga.dataset.taskId=a?.id||'';riga.setAttribute('role','listitem');
 const segna=el(doc,'button','talos-checkbox');segna.type='button';segna.hidden=true;segna.dataset.richiede='fase3';segna.setAttribute('role','checkbox');segna.setAttribute('aria-checked',String(a?.stato==='done'));segna.setAttribute('aria-label','Segna come fatta');
 const icona=el(doc,'span','talos-list-row__icon'),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),use=doc.createElementNS('http://www.w3.org/2000/svg','use');svg.setAttribute('class','i');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#i-'+s.icona);svg.append(use);icona.append(svg);
 const testo=el(doc,'span','talos-list-row__text'),titolo=el(doc,'span','talos-list-row__title',t.titolo),sotto=el(doc,'span','talos-list-row__sub');titolo.title=t.titolo;testo.append(titolo,sotto);
 const aside=el(doc,'span','talos-list-row__aside');aside.append(el(doc,'span','talos-badge'+(s.tono?' talos-badge--'+s.tono:''),s.testo));
 const leggi=el(doc,'button','talos-button talos-button--ghost talos-button--sm');leggi.type='button';
 function mostra(){riga.dataset.aperta=String(aperta);sotto.textContent=prioritaAttivita(a?.priorita)+' · '+t.autore+(aperta?(t.descrizione?'\n'+t.descrizione:'\nNessuna descrizione.')+(t.aggiornata?'\nAggiornata il '+t.aggiornata:''):(t.anteprima?' · '+t.anteprima:''));leggi.textContent=aperta?'Chiudi':'Leggi';leggi.setAttribute('aria-expanded',String(aperta));leggi.setAttribute('aria-label',(aperta?'Chiudi':'Leggi')+' l’attività: '+t.titolo);}
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
 schermo.querySelector('.talos-topbar__path').textContent=opzioni.errore?'Attività non disponibili':opzioni.caricamento?'Caricamento attività…':riepilogoAttivita(attivita);
 const esito=schermo.querySelector('[data-task-esito]');esito.textContent=opzioni.errore||(opzioni.caricamento?'Caricamento attività…':visibili.length===attivita.length?plurale(attivita.length,'attività'):visibili.length+' di '+plurale(attivita.length,'attività'));esito.setAttribute('role',opzioni.errore?'alert':'status');
 const lista=schermo.querySelector('[data-task-list]'),attivo=doc.activeElement?.closest('[data-task-id]')?.dataset.taskId;lista.setAttribute('role',visibili.length?'list':'group');
 lista.replaceChildren(...visibili.map(a=>creaTaskRow(a,{document:doc,aperta:pagina.aperte.has(a.id),onEspandi:aperta=>{if(aperta)pagina.aperte.add(a.id);else pagina.aperte.delete(a.id);}})));
 if(!visibili.length)lista.append(el(doc,'p','talos-list-row talos-muted',opzioni.errore||(opzioni.caricamento?'Caricamento attività…':attivita.length?'Nessuna attività corrisponde ai filtri.':'Nessuna attività salvata. Le attività sono globali, disponibili alle tue conversazioni.')));
 if(attivo)[...lista.querySelectorAll('[data-task-id]')].find(n=>n.dataset.taskId===attivo)?.querySelector('button:not([hidden])')?.focus({preventScroll:true});
}
