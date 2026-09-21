import { plurale } from './plurale.js'; // BH-12: «1 ricordi» — il plurale vive in un posto solo
/** MemoryRow del mockup. Contratto: memory-store.mjs, 05/09/2026.
 * WAI Disclosure + WCAG Status Messages: contenuto integro, stato e focus espliciti.
 */
const GENERI = new Map([
 ['preference',{testo:'Preferenza',icona:'brain',tono:'accent'}],
 ['project_fact',{testo:'Fatto',icona:'clock',tono:null}],
 ['procedure',{testo:'Procedura',icona:'brain',tono:'accent'}],
 ['policy_note',{testo:'Regola',icona:'bolt',tono:'info'}],
]);
export function genereMemoria(genere) {return GENERI.get(genere) || {testo:'Tipo non registrato',icona:'brain',tono:null};}
export function testiMemoria(memoria) {
 const contenuto=typeof memoria?.contenuto==='string'?memoria.contenuto:'Contenuto non registrato';
 const compatto=contenuto.replace(/\s+/g,' ').trim();
 const data=typeof memoria?.aggiornataAlle==='string'?new Date(memoria.aggiornataAlle):null;
 return {titolo:typeof memoria?.titolo==='string'&&memoria.titolo.trim()?memoria.titolo:'Ricordo senza titolo',contenuto,anteprima:compatto.length>80?compatto.slice(0,80)+'…':compatto,aggiornata:data&&Number.isFinite(data.getTime())?data.toLocaleString('it-IT'):null};
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
 const correggi=el(doc,'button','talos-button talos-button--ghost talos-button--sm','Correggi');correggi.type='button';correggi.hidden=true;correggi.dataset.richiede='fase3';
 function mostra() {riga.dataset.aperta=String(aperta);sotto.textContent=aperta?t.contenuto+(t.aggiornata?'\nAggiornata il '+t.aggiornata:''):t.anteprima;leggi.textContent=aperta?'Chiudi':'Leggi';leggi.setAttribute('aria-expanded',String(aperta));leggi.setAttribute('aria-label',(aperta?'Chiudi':'Leggi')+' il ricordo: '+t.titolo);}
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
 schermo.querySelector('.talos-topbar__path').textContent=opzioni.errore?'Ricordi non disponibili':opzioni.caricamento?'Caricamento ricordi…':plurale(memorie.length,'ricordo')+' · globali';
 const esito=schermo.querySelector('[data-memory-stato]');esito.textContent=opzioni.errore || (opzioni.caricamento?'Caricamento ricordi…':visibili.length===memorie.length?plurale(memorie.length,'ricordo'):visibili.length+' di '+plurale(memorie.length,'ricordo'));esito.setAttribute('role',opzioni.errore?'alert':'status');
 const lista=schermo.querySelector('[data-memory-list]');lista.setAttribute('role',visibili.length?'list':'group');
 const attivo=doc.activeElement?.closest('[data-memory-id]')?.dataset.memoryId;
 lista.replaceChildren(...visibili.map(m=>creaMemoryRow(m,{document:doc,aperta:pagina.aperte.has(m.id),onEspandi:a=>{if(a)pagina.aperte.add(m.id);else pagina.aperte.delete(m.id);}})));
 if(!visibili.length)lista.append(el(doc,'p','talos-list-row talos-muted',opzioni.errore || (opzioni.caricamento?'Caricamento ricordi…':memorie.length?'Nessun ricordo corrisponde ai filtri.':'Nessun ricordo salvato. I ricordi sono globali, disponibili alle tue conversazioni.')));
 if(attivo)[...lista.querySelectorAll('[data-memory-id]')].find(n=>n.dataset.memoryId===attivo)?.querySelector('button:not([hidden])')?.focus({preventScroll:true});
}
