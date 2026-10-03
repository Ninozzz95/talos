import { t, tn, linguaCorrenteDiT } from './lingua.js';
/* Numeri e date nella lingua dell'interfaccia (come fanno gli altri componenti): italiano → it-IT, inglese → en-US. */
const localeUI = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');
/** Officina nel mockup; GET /tool-forge e azione owner separata. WAI Listbox, 05/09/2026. */
import {nomeUmanoAttrezzo} from './nomi-attrezzi.js';
// Adattamento degli id delle capacità ai nomi umani già canonici; nessun nome verso il modello cambia.
const ALIAS=new Map([['tasks.list','tasks_list'],['tasks.create','tasks_create'],['tasks.setStatus','tasks_update'],['notes.list','notes_list'],['notes.create','notes_create'],['notes.update','notes_update'],['memory.search','memory_search'],['memory.create','memory_write']]);
export function statoToolForgiato(abilitato){
 if(abilitato===true)return {testo:t('modelli.forge.enabled'),tono:'success',azione:t('modelli.forge.disable'),prossimo:false};
 if(abilitato===false)return {testo:t('modelli.forge.disabled'),tono:'',azione:t('modelli.forge.enable'),prossimo:true};
 return {testo:t('modelli.forge.stateUnrecorded'),tono:'',azione:t('modelli.forge.checkState'),prossimo:null};
}
export function capacitaToolForgiato(capacita){
 if(!Array.isArray(capacita))return [t('modelli.forge.capabilitiesUnrecorded')];
 if(!capacita.length)return [t('modelli.forge.noCapabilities')];
 return capacita.map(c=>nomeUmanoAttrezzo(ALIAS.get(c))||t('modelli.forge.capabilityUnknown'));
}
export function testiToolForgiato(strumento){
 const s=strumento||{},data=typeof s.installatoAlle==='string'?new Date(s.installatoAlle):null;
 return {titolo:typeof s.titolo==='string'&&s.titolo.trim()?s.titolo:t('modelli.forge.untitled'),descrizione:typeof s.descrizione==='string'&&s.descrizione.trim()?s.descrizione:t('modelli.tools.descriptionUnavailable'),installato:data&&Number.isFinite(data.getTime())?data.toLocaleString(localeUI()):t('modelli.forge.dateUnrecorded'),rischio:['R1','R2','R3'].includes(s.rischio)?s.rischio:t('modelli.forge.riskUnrecorded')};
}
export function filtraOfficina(strumenti,{query='',stato='tutti'}={}){
 const q=String(query).trim().toLocaleLowerCase('it');
 return strumenti.filter(s=>(stato==='tutti'||(stato==='abilitati'?s.abilitato===true:s.abilitato===false))&&(!q||[s.id,testiToolForgiato(s).titolo,testiToolForgiato(s).descrizione,...(Array.isArray(s.capacita)?s.capacita:[]),...capacitaToolForgiato(s.capacita)].join(' ').toLocaleLowerCase('it').includes(q)));
}
function el(doc,tag,classe,testo){const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;}
function icona(doc){const contenitore=el(doc,'span','talos-list-row__icon'),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),use=doc.createElementNS('http://www.w3.org/2000/svg','use');svg.setAttribute('class','i');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#i-code');svg.append(use);contenitore.append(svg);return contenitore;}
export function creaForgeRow(strumento,{document:doc=globalThis.document,selezionabile=true,selezionata=false,onSeleziona,onAbilita,salvataggio=false,salvataggioId=null}={}){
 const dati=testiToolForgiato(strumento),stato=statoToolForgiato(strumento.abilitato),riga=el(doc,selezionabile?'button':'div','talos-list-row');riga.dataset.forgeId=strumento.id;
 if(selezionabile){riga.type='button';riga.setAttribute('role','option');riga.setAttribute('aria-selected',String(selezionata));riga.setAttribute('aria-controls','officinaDettaglio');riga.tabIndex=selezionata?0:-1;riga.addEventListener('click',()=>onSeleziona?.(strumento.id));}else riga.setAttribute('role','group');
 const testo=el(doc,'span','talos-list-row__text');testo.append(el(doc,'span','talos-list-row__title',dati.titolo),el(doc,'span','talos-list-row__sub',dati.descrizione),el(doc,'span','talos-list-row__sub',capacitaToolForgiato(strumento.capacita).join(' · ')));
 const aside=el(doc,'span','talos-list-row__aside');aside.append(el(doc,'span','talos-badge'+(stato.tono?' talos-badge--'+stato.tono:'')+' talos-badge--sm',stato.testo));
 if(!selezionabile){const bottone=el(doc,'button','talos-button talos-button--secondary talos-button--sm',salvataggio&&salvataggioId===strumento.id?t('modelli.common.saving'):stato.azione);bottone.type='button';bottone.disabled=salvataggio||stato.prossimo===null;bottone.setAttribute('aria-label',t('modelli.forge.actionTitle',{action:stato.azione,title:dati.titolo}));bottone.addEventListener('click',()=>onAbilita?.(strumento,stato.prossimo));aside.append(bottone);}
 riga.append(icona(doc),testo,aside);return riga;
}
const PAGINE=new WeakMap();
export function aggiornaPaginaOfficina(schermo,strumenti,opzioni={}){
 let pagina=PAGINE.get(schermo);
 if(!pagina){
  pagina={strumenti:[],opzioni:{},query:'',stato:'tutti',scelto:null};PAGINE.set(schermo,pagina);
  schermo.querySelector('[data-forge-query]').addEventListener('input',e=>{pagina.query=e.target.value;renderOfficina(schermo,pagina);});
  schermo.querySelector('[data-forge-refresh]').addEventListener('click',()=>pagina.opzioni.onAggiorna?.());
  const tabs=[...schermo.querySelectorAll('[data-forge-stato]')];for(const tab of tabs){tab.addEventListener('click',()=>{pagina.stato=tab.dataset.forgeStato;renderOfficina(schermo,pagina);});tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(tab),nuovo=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];nuovo.click();nuovo.focus();});}
  schermo.querySelector('[data-forge-abilita]').addEventListener('click',()=>{const scelto=pagina.strumenti.find(s=>s.id===pagina.scelto);if(!scelto||pagina.opzioni.salvataggio)return;const stato=statoToolForgiato(scelto.abilitato);if(stato.prossimo!==null)pagina.opzioni.onAbilita?.(scelto,stato.prossimo);});
 }
 pagina.strumenti=strumenti;pagina.opzioni={...pagina.opzioni,...opzioni};renderOfficina(schermo,pagina);
}
function renderOfficina(schermo,pagina){
 const {strumenti,opzioni}=pagina,doc=schermo.ownerDocument,visibili=filtraOfficina(strumenti,pagina),abilitati=strumenti.filter(s=>s.abilitato===true).length;
 if(!opzioni.caricamento&&!visibili.some(s=>s.id===pagina.scelto))pagina.scelto=visibili[0]?.id||null;
 const riepilogo=tn('modelli.forge.oneTool','modelli.forge.manyTools',strumenti.length,{n:strumenti.length.toLocaleString(localeUI())})+' · '+tn('modelli.forge.oneEnabled','modelli.forge.manyEnabled',abilitati);
 schermo.querySelector('.talos-topbar__path').textContent=opzioni.errore?t('modelli.forge.unavailable'):opzioni.caricamento?t('modelli.forge.loading'):riepilogo;
 const esito=schermo.querySelector('[data-forge-esito]');esito.textContent=opzioni.errore||(opzioni.caricamento?t('modelli.forge.loading'):visibili.length===strumenti.length?riepilogo:tn('modelli.forge.oneFilteredTool','modelli.forge.manyFilteredTools',strumenti.length,{visible:visibili.length,n:strumenti.length.toLocaleString(localeUI())}));esito.setAttribute('role',opzioni.errore?'alert':'status');
 schermo.querySelector('[data-forge-refresh]').disabled=Boolean(opzioni.caricamento||opzioni.salvataggio);
 const erroreAzione=schermo.querySelector('[data-forge-errore-azione]');erroreAzione.textContent=opzioni.erroreAzione||'';erroreAzione.hidden=!opzioni.erroreAzione;
 for(const tab of schermo.querySelectorAll('[data-forge-stato]')){const attivo=pagina.stato===tab.dataset.forgeStato;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;}
 const lista=schermo.querySelector('[data-forge-list]');lista.setAttribute('role',visibili.length?'listbox':'group');
 const focusId=doc.activeElement?.closest('[data-forge-id]')?.dataset.forgeId;
 function seleziona(id,focus=false){pagina.scelto=id;renderOfficina(schermo,pagina);if(focus)[...lista.querySelectorAll('[data-forge-id]')].find(r=>r.dataset.forgeId===id)?.focus({preventScroll:true});}
 lista.replaceChildren(...visibili.map(s=>{const riga=creaForgeRow(s,{document:doc,selezionata:pagina.scelto===s.id,onSeleziona:id=>seleziona(id)});riga.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const i=visibili.indexOf(s),nuovo=e.key==='Home'?visibili[0]:e.key==='End'?visibili.at(-1):visibili[(i+(e.key==='ArrowDown'?1:-1)+visibili.length)%visibili.length];seleziona(nuovo.id,true);});return riga;}));
 if(!visibili.length)lista.append(el(doc,'p','talos-list-row talos-muted',opzioni.errore||(opzioni.caricamento?t('modelli.forge.loading'):strumenti.length?t('modelli.tools.noMatches'):t('modelli.forge.noTools'))));
 if(focusId)[...lista.querySelectorAll('[data-forge-id]')].find(r=>r.dataset.forgeId===focusId)?.focus({preventScroll:true});
 const scelto=visibili.find(s=>s.id===pagina.scelto),dettaglio=schermo.querySelector('[data-forge-dettaglio]');dettaglio.hidden=!scelto;if(!scelto)return;
 const dati=testiToolForgiato(scelto),stato=statoToolForgiato(scelto.abilitato);
 dettaglio.querySelector('h3').textContent=dati.titolo;dettaglio.querySelector('[data-forge-descrizione]').textContent=dati.descrizione;
 dettaglio.querySelector('[data-forge-capacita]').textContent=capacitaToolForgiato(scelto.capacita).join(' · ');
 dettaglio.querySelector('[data-forge-installato]').textContent=dati.installato;dettaglio.querySelector('[data-forge-rischio]').textContent=dati.rischio;
 const badge=dettaglio.querySelector('[data-forge-stato-attuale]');badge.className='talos-badge'+(stato.tono?' talos-badge--'+stato.tono:'')+' talos-badge--sm';badge.textContent=stato.testo;
 const bottone=dettaglio.querySelector('[data-forge-abilita]');bottone.textContent=opzioni.salvataggio&&opzioni.salvataggioId===scelto.id?t('modelli.common.saving'):t('modelli.forge.actionTool',{action:stato.azione});bottone.disabled=Boolean(opzioni.salvataggio)||stato.prossimo===null;bottone.setAttribute('aria-label',t('modelli.forge.actionTitle',{action:stato.azione,title:dati.titolo}));
}
