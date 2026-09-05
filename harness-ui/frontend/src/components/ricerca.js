/** ReportRow del mockup: metadati GET /research. WAI Tabs/Disclosure, 05/09/2026. */
const STATI=new Map([['running',{testo:'In corso',tono:'info'}],['paused',{testo:'In pausa',tono:'warning'}],['done',{testo:'Conclusa',tono:'success'}],['cancelled',{testo:'Annullata',tono:''}],['failed',{testo:'Non riuscita',tono:'danger'}]]);
export function statoRicerca(stato){return STATI.get(stato)||{testo:'Stato non registrato',tono:''};}
export function testiRicerca(ricerca){
 const titolo=typeof ricerca?.titolo==='string'&&ricerca.titolo.trim()?ricerca.titolo:'Ricerca senza titolo';
 const data=typeof ricerca?.avviataAlle==='string'?new Date(ricerca.avviataAlle):null,valida=data&&Number.isFinite(data.getTime());
 return {titolo,avviata:valida?data.toLocaleString('it-IT'):null,dataBreve:valida?'Avviata il '+data.toLocaleDateString('it-IT'):'Data non registrata'};
}
export function riepilogoRicerche(ricerche){return ricerche.length+(ricerche.length===1?' ricerca elencata':' ricerche elencate');}
export function filtraRicerche(ricerche,{query='',stato='tutte'}={}){
 const q=String(query).trim().toLocaleLowerCase('it');
 return ricerche.filter(r=>(stato==='tutte'||r?.stato===stato)&&(!q||[testiRicerca(r).titolo,statoRicerca(r?.stato).testo].join(' ').toLocaleLowerCase('it').includes(q)));
}
function el(doc,tag,classe,testo){const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;}
export function creaReportRow(ricerca,{document:doc=globalThis.document,aperta=false,onEspandi}={}){
 const t=testiRicerca(ricerca),stato=statoRicerca(ricerca?.stato);
 const riga=el(doc,'div','talos-list-row');riga.dataset.c='ReportRow';riga.dataset.researchId=ricerca?.id||'';riga.setAttribute('role','listitem');
 const icona=el(doc,'span','talos-list-row__icon'),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),use=doc.createElementNS('http://www.w3.org/2000/svg','use');svg.setAttribute('class','i');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#i-globe');svg.append(use);icona.append(svg);
 const testo=el(doc,'span','talos-list-row__text'),titolo=el(doc,'span','talos-list-row__title',t.titolo),sotto=el(doc,'span','talos-list-row__sub');titolo.title=t.titolo;testo.append(titolo,sotto);
 const aside=el(doc,'span','talos-list-row__aside');aside.append(el(doc,'span','talos-badge'+(stato.tono?' talos-badge--'+stato.tono:''),stato.testo));
 const apri=el(doc,'button','talos-button talos-button--ghost talos-button--sm','Apri rapporto');apri.type='button';apri.hidden=true;apri.dataset.richiede='fase3';
 const dettagli=el(doc,'button','talos-button talos-button--ghost talos-button--sm');dettagli.type='button';
 function mostra(){riga.dataset.aperta=String(aperta);sotto.textContent=aperta&&t.avviata?'Avviata il '+t.avviata:t.dataBreve;dettagli.textContent=aperta?'Chiudi':'Dettagli';dettagli.setAttribute('aria-expanded',String(aperta));dettagli.setAttribute('aria-label',(aperta?'Chiudi i dettagli di ':'Dettagli di ')+t.titolo);}
 dettagli.addEventListener('click',()=>{aperta=!aperta;mostra();onEspandi?.(aperta);});mostra();aside.append(apri,dettagli);riga.append(icona,testo,aside);return riga;
}
const PAGINE=new WeakMap();
export function aggiornaPaginaRicerca(schermo,ricerche,opzioni={}){
 let pagina=PAGINE.get(schermo);
 if(!pagina){
  pagina={ricerche:[],opzioni:{},query:'',stato:'tutte',aperte:new Set()};PAGINE.set(schermo,pagina);
  const tabs=[...schermo.querySelectorAll('[data-research-stato]')];
  for(const tab of tabs){
   tab.addEventListener('click',()=>{pagina.stato=tab.dataset.researchStato;renderRicerca(schermo,pagina);});
   tab.addEventListener('keydown',e=>{if(!['Home','End','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(tab),scelta=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];scelta.click();scelta.focus();});
  }
  schermo.querySelector('[data-research-query]').addEventListener('input',e=>{pagina.query=e.target.value;renderRicerca(schermo,pagina);});
  schermo.querySelector('[data-research-refresh]').addEventListener('click',()=>pagina.opzioni.onAggiorna?.());
 }
 pagina.ricerche=ricerche;pagina.opzioni={...pagina.opzioni,...opzioni};renderRicerca(schermo,pagina);
}
function renderRicerca(schermo,pagina){
 const {ricerche,opzioni}=pagina,visibili=filtraRicerche(ricerche,pagina),doc=schermo.ownerDocument;
 for(const tab of schermo.querySelectorAll('[data-research-stato]')){const attivo=pagina.stato===tab.dataset.researchStato;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;}
 schermo.querySelector('[data-research-refresh]').disabled=Boolean(opzioni.caricamento);
 schermo.querySelector('.talos-topbar__path').textContent=opzioni.errore?'Ricerche non disponibili':opzioni.caricamento?'Caricamento ricerche…':riepilogoRicerche(ricerche);
 const esito=schermo.querySelector('[data-research-esito]');esito.textContent=opzioni.errore||(opzioni.caricamento?'Caricamento ricerche…':visibili.length===ricerche.length?riepilogoRicerche(ricerche):visibili.length+' di '+ricerche.length+' ricerche elencate');esito.setAttribute('role',opzioni.errore?'alert':'status');
 const lista=schermo.querySelector('[data-research-list]'),attivo=doc.activeElement?.closest('[data-research-id]')?.dataset.researchId;lista.setAttribute('role',visibili.length?'list':'group');
 lista.replaceChildren(...visibili.map(r=>creaReportRow(r,{document:doc,aperta:pagina.aperte.has(r.id),onEspandi:aperta=>{if(aperta)pagina.aperte.add(r.id);else pagina.aperte.delete(r.id);}})));
 if(!visibili.length)lista.append(el(doc,'p','talos-list-row talos-muted',opzioni.errore||(opzioni.caricamento?'Caricamento ricerche…':ricerche.length?'Nessuna ricerca corrisponde ai filtri.':'Nessuna ricerca avviata in questo progetto.')));
 if(attivo)[...lista.querySelectorAll('[data-research-id]')].find(n=>n.dataset.researchId===attivo)?.querySelector('button:not([hidden])')?.focus({preventScroll:true});
}
