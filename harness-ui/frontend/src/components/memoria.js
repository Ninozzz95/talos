import { t as traduci, tn, linguaCorrenteDiT } from './lingua.js';
/* Date e numeri nella lingua dell'interfaccia (italiano → it-IT, inglese → en-US), letta a ogni uso. */
const localeUI=()=>(linguaCorrenteDiT()==='en'?'en-US':'it-IT');
const conta=n=>tn('sezioni.memory.count.one','sezioni.memory.count.many',n,{n:new Intl.NumberFormat(localeUI()).format(n)});
/** MemoryRow del mockup. Contratto: memory-store.mjs, 05/09/2026.
 * WAI Disclosure + WCAG Status Messages: contenuto integro, stato e focus espliciti.
 */
/* ⛔ Le etichette si leggono a ogni uso (getter), non alla creazione del modulo: seguono il cambio di lingua. */
const GENERI = new Map([
 ['preference',{get testo(){return traduci('sezioni.memory.kind.preference');},icona:'brain',tono:'accent'}],
 ['project_fact',{get testo(){return traduci('sezioni.memory.kind.fact');},icona:'clock',tono:null}],
 ['procedure',{get testo(){return traduci('sezioni.memory.kind.procedure');},icona:'brain',tono:'accent'}],
 ['policy_note',{get testo(){return traduci('sezioni.memory.kind.rule');},icona:'bolt',tono:'info'}],
]);
export function genereMemoria(genere) {return GENERI.get(genere) || {testo:traduci('sezioni.memory.kind.unknown'),icona:'brain',tono:null};}
export function testiMemoria(memoria) {
 const contenuto=typeof memoria?.contenuto==='string'?memoria.contenuto:traduci('sezioni.memory.contentNotRecorded');
 const compatto=contenuto.replace(/\s+/g,' ').trim();
 const data=typeof memoria?.aggiornataAlle==='string'?new Date(memoria.aggiornataAlle):null;
 return {titolo:typeof memoria?.titolo==='string'&&memoria.titolo.trim()?memoria.titolo:traduci('sezioni.memory.untitled'),contenuto,anteprima:compatto.length>80?compatto.slice(0,80)+'…':compatto,aggiornata:data&&Number.isFinite(data.getTime())?data.toLocaleString(localeUI()):null};
}
export function filtraMemorie(memorie,{query='',genere='tutti'}={}) {
 const q=String(query).trim().toLocaleLowerCase('it');
 return memorie.filter(m=>(genere==='tutti'||m?.genere===genere)&&(!q||[testiMemoria(m).titolo,testiMemoria(m).contenuto,genereMemoria(m?.genere).testo].join(' ').toLocaleLowerCase('it').includes(q)));
}
function el(doc,tag,classe,testo) {
 const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;
}
export function creaMemoryRow(memoria,{document:doc=globalThis.document,aperta=false,onEspandi}={}) {
 const t=testiMemoria(memoria),g=genereMemoria(memoria?.genere);
 const riga=el(doc,'div','talos-list-row');riga.dataset.c='MemoryRow';riga.setAttribute('role','listitem');riga.dataset.memoryId=memoria?.id || '';
 const icona=el(doc,'span','talos-list-row__icon'),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),use=doc.createElementNS('http://www.w3.org/2000/svg','use');svg.setAttribute('class','i');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#i-'+g.icona);svg.append(use);icona.append(svg);
 const testo=el(doc,'span','talos-list-row__text'),titolo=el(doc,'span','talos-list-row__title',t.titolo),sotto=el(doc,'span','talos-list-row__sub');titolo.title=t.titolo;testo.append(titolo,sotto);
 const aside=el(doc,'span','talos-list-row__aside');aside.append(el(doc,'span','talos-badge'+(g.tono?' talos-badge--'+g.tono:''),g.testo));
 const leggi=el(doc,'button','talos-button talos-button--ghost talos-button--sm');leggi.type='button';
 const correggi=el(doc,'button','talos-button talos-button--ghost talos-button--sm',traduci("sezioni.memory.row.correct"));correggi.type='button';correggi.hidden=true;correggi.dataset.richiede='fase3';
 function mostra() {riga.dataset.aperta=String(aperta);sotto.textContent=aperta?t.contenuto+(t.aggiornata?'\n'+traduci('sezioni.memory.row.updatedOn',{date:t.aggiornata}):''):t.anteprima;leggi.textContent=aperta?traduci("sezioni.common.close"):traduci("sezioni.common.read");leggi.setAttribute('aria-expanded',String(aperta));leggi.setAttribute('aria-label',aperta?traduci('sezioni.memory.row.closeLabel',{title:t.titolo}):traduci('sezioni.memory.row.readLabel',{title:t.titolo}));}
 leggi.addEventListener('click',()=>{aperta=!aperta;mostra();onEspandi?.(aperta);});mostra();aside.append(leggi,correggi);riga.append(icona,testo,aside);return riga;
}
const PAGINE=new WeakMap();
export function aggiornaPaginaMemoria(schermo,memorie,opzioni={}) {
 let pagina=PAGINE.get(schermo);
 if(!pagina) {
  pagina={memorie:[],opzioni:{},query:'',genere:'tutti',aperte:new Set()};PAGINE.set(schermo,pagina);
  const tabs=[...schermo.querySelectorAll('[data-memory-genere]')];
  for(const tab of tabs) {
   tab.addEventListener('click',()=>{pagina.genere=tab.dataset.memoryGenere;renderMemoria(schermo,pagina);});
   tab.addEventListener('keydown',e=>{if(!['Home','End','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(tab),scelta=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];scelta.click();scelta.focus();});
  }
  schermo.querySelector('[data-memory-query]').addEventListener('input',e=>{pagina.query=e.target.value;renderMemoria(schermo,pagina);});
  schermo.querySelector('[data-memory-refresh]').addEventListener('click',()=>pagina.opzioni.onAggiorna?.());
 }
 pagina.memorie=memorie;pagina.opzioni={...pagina.opzioni,...opzioni};renderMemoria(schermo,pagina);
}
function renderMemoria(schermo,pagina) {
 const {memorie,opzioni}=pagina,visibili=filtraMemorie(memorie,pagina),doc=schermo.ownerDocument;
 for(const tab of schermo.querySelectorAll('[data-memory-genere]')){const attivo=pagina.genere===tab.dataset.memoryGenere;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;}
 schermo.querySelector('[data-memory-refresh]').disabled=Boolean(opzioni.caricamento);
 schermo.querySelector('.talos-topbar__path').textContent=opzioni.errore?traduci("sezioni.memory.unavailable"):opzioni.caricamento?traduci("sezioni.memory.loading"):traduci('sezioni.memory.globalCount',{count:conta(memorie.length)});
 const esito=schermo.querySelector('[data-memory-stato]');esito.textContent=opzioni.errore || (opzioni.caricamento?traduci("sezioni.memory.loading"):visibili.length===memorie.length?conta(memorie.length):traduci("sezioni.common.shownOfTotal", { shown: visibili.length, total: conta(memorie.length) }));esito.setAttribute('role',opzioni.errore?'alert':'status');
 const lista=schermo.querySelector('[data-memory-list]');lista.setAttribute('role',visibili.length?'list':'group');
 const attivo=doc.activeElement?.closest('[data-memory-id]')?.dataset.memoryId;
 lista.replaceChildren(...visibili.map(m=>creaMemoryRow(m,{document:doc,aperta:pagina.aperte.has(m.id),onEspandi:a=>{if(a)pagina.aperte.add(m.id);else pagina.aperte.delete(m.id);}})));
 if(!visibili.length)lista.append(el(doc,'p','talos-list-row talos-muted',opzioni.errore || (opzioni.caricamento?traduci("sezioni.memory.loading"):memorie.length?traduci("sezioni.memory.noMatches"):traduci("sezioni.memory.empty"))));
 if(attivo)[...lista.querySelectorAll('[data-memory-id]')].find(n=>n.dataset.memoryId===attivo)?.querySelector('button:not([hidden])')?.focus({preventScroll:true});
}
