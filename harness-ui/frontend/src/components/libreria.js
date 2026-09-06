import { plurale } from './plurale.js'; // BH-12: «1 ricordi» — il plurale vive in un posto solo
/** LibraryRow del mockup, metadati GET /library. WAI Tabs/Disclosure, 05/09/2026. */
const TIPI=new Map([['document',{testo:'Documento',icona:'doc'}],['image',{testo:'Immagine',icona:'image'}]]);
const ORIGINI=new Map([['uploaded','Caricato'],['generated','Generato']]);
export function tipoVoceLibreria(tipo){return TIPI.get(tipo)||{testo:'Tipo non registrato',icona:'files'};}
export function origineVoceLibreria(origine){return ORIGINI.get(origine)||'Origine non registrata';}
export function testiVoceLibreria(voce){
 const nome=typeof voce?.nome==='string'&&voce.nome.trim()?voce.nome:'File senza nome';
 const data=typeof voce?.aggiornatoIl==='string'?new Date(voce.aggiornatoIl):null,valida=data&&Number.isFinite(data.getTime());
 return {nome,aggiornata:valida?data.toLocaleString('it-IT'):null,dataBreve:valida?'Aggiornato il '+data.toLocaleDateString('it-IT'):'Data non registrata'};
}
export function filtraLibreria(voci,{query='',origine='tutte'}={}){
 const q=String(query).trim().toLocaleLowerCase('it');
 return voci.filter(v=>(origine==='tutte'||v?.origine===origine)&&(!q||[testiVoceLibreria(v).nome,tipoVoceLibreria(v?.fileType).testo,origineVoceLibreria(v?.origine)].join(' ').toLocaleLowerCase('it').includes(q)));
}
function el(doc,tag,classe,testo){const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;}
export function creaLibraryRow(voce,{document:doc=globalThis.document,aperta=false,onEspandi}={}){
 const t=testiVoceLibreria(voce),tipo=tipoVoceLibreria(voce?.fileType),origine=origineVoceLibreria(voce?.origine);
 const riga=el(doc,'div','talos-list-row');riga.dataset.c='LibraryRow';riga.dataset.libraryId=voce?.id||'';riga.setAttribute('role','listitem');
 const icona=el(doc,'span','talos-list-row__icon'),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),use=doc.createElementNS('http://www.w3.org/2000/svg','use');svg.setAttribute('class','i');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#i-'+tipo.icona);svg.append(use);icona.append(svg);
 const testo=el(doc,'span','talos-list-row__text'),titolo=el(doc,'span','talos-list-row__title',t.nome),sotto=el(doc,'span','talos-list-row__sub');titolo.title=t.nome;testo.append(titolo,sotto);
 const aside=el(doc,'span','talos-list-row__aside');aside.append(el(doc,'span','talos-badge'+(voce?.origine==='generated'?' talos-badge--accent':''),origine));
 const apri=el(doc,'button','talos-button talos-button--ghost talos-button--sm','Apri');apri.type='button';apri.hidden=true;apri.dataset.richiede='fase3';
 const dettagli=el(doc,'button','talos-button talos-button--ghost talos-button--sm');dettagli.type='button';
 function mostra(){riga.dataset.aperta=String(aperta);sotto.textContent=tipo.testo+' · '+(aperta&&t.aggiornata?'Aggiornato il '+t.aggiornata:t.dataBreve);dettagli.textContent=aperta?'Chiudi':'Dettagli';dettagli.setAttribute('aria-expanded',String(aperta));dettagli.setAttribute('aria-label',(aperta?'Chiudi i dettagli di ':'Dettagli di ')+t.nome);}
 dettagli.addEventListener('click',()=>{aperta=!aperta;mostra();onEspandi?.(aperta);});mostra();aside.append(apri,dettagli);riga.append(icona,testo,aside);return riga;
}
const PAGINE=new WeakMap();
export function aggiornaPaginaLibreria(schermo,voci,opzioni={}){
 let pagina=PAGINE.get(schermo);
 if(!pagina){
  pagina={voci:[],opzioni:{},query:'',origine:'tutte',aperte:new Set()};PAGINE.set(schermo,pagina);
  const tabs=[...schermo.querySelectorAll('[data-library-origine]')];
  for(const tab of tabs){
   tab.addEventListener('click',()=>{pagina.origine=tab.dataset.libraryOrigine;renderLibreria(schermo,pagina);});
   tab.addEventListener('keydown',e=>{if(!['Home','End','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(tab),scelta=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];scelta.click();scelta.focus();});
  }
  schermo.querySelector('[data-library-query]').addEventListener('input',e=>{pagina.query=e.target.value;renderLibreria(schermo,pagina);});
  schermo.querySelector('[data-library-refresh]').addEventListener('click',()=>pagina.opzioni.onAggiorna?.());
 }
 pagina.voci=voci;pagina.opzioni={...pagina.opzioni,...opzioni};renderLibreria(schermo,pagina);
}
function renderLibreria(schermo,pagina){
 const {voci,opzioni}=pagina,visibili=filtraLibreria(voci,pagina),doc=schermo.ownerDocument;
 for(const tab of schermo.querySelectorAll('[data-library-origine]')){const attivo=pagina.origine===tab.dataset.libraryOrigine;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;}
 schermo.querySelector('[data-library-refresh]').disabled=Boolean(opzioni.caricamento);
 schermo.querySelector('.talos-topbar__path').textContent=opzioni.errore?'Libreria non disponibile':opzioni.caricamento?'Caricamento Libreria…':plurale(voci.length,'file')+' · Token non disponibili';
 const esito=schermo.querySelector('[data-library-esito]');esito.textContent=opzioni.errore||(opzioni.caricamento?'Caricamento Libreria…':visibili.length===voci.length?plurale(voci.length,'file'):visibili.length+' di '+plurale(voci.length,'file'));esito.setAttribute('role',opzioni.errore?'alert':'status');
 const lista=schermo.querySelector('[data-library-list]'),attivo=doc.activeElement?.closest('[data-library-id]')?.dataset.libraryId;lista.setAttribute('role',visibili.length?'list':'group');
 lista.replaceChildren(...visibili.map(v=>creaLibraryRow(v,{document:doc,aperta:pagina.aperte.has(v.id),onEspandi:aperta=>{if(aperta)pagina.aperte.add(v.id);else pagina.aperte.delete(v.id);}})));
 if(!visibili.length)lista.append(el(doc,'p','talos-list-row talos-muted',opzioni.errore||(opzioni.caricamento?'Caricamento Libreria…':voci.length?'Nessun file corrisponde ai filtri.':'Nessun file in Libreria per questo progetto.')));
 if(attivo)[...lista.querySelectorAll('[data-library-id]')].find(n=>n.dataset.libraryId===attivo)?.querySelector('button:not([hidden])')?.focus({preventScroll:true});
}
