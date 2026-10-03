/** AutomationRow: programma e avvii registrati, mai esiti o costi dedotti. 05/09/2026. */
import { t as traduci, tn, linguaCorrenteDiT } from './lingua.js';
/* Date nella lingua dell'interfaccia (italiano → it-IT, inglese → en-US), letta a ogni uso. */
const localeUI=()=>(linguaCorrenteDiT()==='en'?'en-US':'it-IT');
import { nomeModelloUmano } from './chat-foot.js';
export function statoAutomazione(attiva) {
 if(attiva===true)return {testo:traduci('sezioni.automations.status.active'),tono:'success',prossimo:false};
 if(attiva===false)return {testo:traduci('sezioni.automations.status.paused'),tono:'',prossimo:true};
 return {testo:traduci('sezioni.automations.status.unknown'),tono:'',prossimo:null};
}
const intero=n=>Number.isInteger(n)&&n>=0;
function dataCompleta(valore){const d=typeof valore==='string'?new Date(valore):null;return d&&Number.isFinite(d.getTime())?d.toLocaleString(localeUI()):traduci('sezioni.common.dateNotRecorded');}
export function testiAutomazione(a,adesso=new Date()){
 const oggi=new Date(adesso).toISOString().slice(0,10),limite=intero(a.limiteAlGiorno)&&a.limiteAlGiorno>0?a.limiteAlGiorno:null;
 const conteggio=a.giornoContatore!==oggi?0:intero(a.eseguiteOggi)?a.eseguiteOggi:null;
 const raggiunto=limite!==null&&conteggio!==null&&conteggio>=limite;
 return {nome:typeof a.nome==='string'&&a.nome.trim()?a.nome:traduci('sezioni.automations.unnamed'),intervallo:intero(a.intervalloMinuti)&&a.intervalloMinuti>0?traduci('sezioni.automations.interval.every',{minutes:a.intervalloMinuti}):traduci('sezioni.automations.interval.unknown'),conteggio:conteggio===null||limite===null?traduci('sezioni.automations.runs.countUnavailable'):traduci('sezioni.automations.runs.countOfLimit',{count:conteggio,limit:limite}),ultima:a.ultimaEsecuzione==null?traduci('sezioni.automations.runs.none'):dataCompleta(a.ultimaEsecuzione),prossima:a.attiva===false?traduci('sezioni.automations.status.paused'):a.attiva!==true?traduci('sezioni.automations.status.needsChecking'):raggiunto?traduci('sezioni.automations.runs.dailyLimitReached'):dataCompleta(a.prossimaEsecuzione),creata:dataCompleta(a.creataAlle),task:typeof a.taskId==='string'?a.taskId:traduci('sezioni.automations.taskUnknown'),
  // 24/09/2026, decisione owner: il modello salvato alla creazione; le automazioni di prima girano col predefinito del server.
  modello:typeof a.modello==='string'&&a.modello.trim()?(nomeModelloUmano(a.modello)||a.modello):traduci('sezioni.automations.modelServerDefault')};
}
export function filtraAutomazioni(elenco,{query='',stato='tutte'}={}){
 const q=String(query).trim().toLocaleLowerCase('it');
 return elenco.filter(a=>(stato==='tutte'||(stato==='attive'?a.attiva===true:a.attiva===false))&&(!q||[a.nome,a.taskId].join(' ').toLocaleLowerCase('it').includes(q)));
}
export function riepilogoAutomazioni(elenco){const attive=elenco.filter(a=>a.attiva===true).length;return tn('sezioni.automations.summary.countOne','sezioni.automations.summary.countMany',elenco.length)+' · '+tn('sezioni.automations.summary.activeOne','sezioni.automations.summary.activeMany',attive);}
function el(doc,tag,classe,testo){const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;}
function kv(doc,k,v){const n=el(doc,'div','talos-kv');n.append(el(doc,'span','talos-kv__k',k),el(doc,'span','talos-kv__v',v));return n;}
export function creaAutomationRow(a,{document:doc=globalThis.document,adesso=new Date(),salvataggio=false,salvataggioId=null,aperta=false,onDettagli,onToggle,onElimina}={}){
 const t=testiAutomazione(a,adesso),stato=statoAutomazione(a.attiva),riga=el(doc,'article','talos-card talos-automation');riga.dataset.c='AutomationRow';riga.dataset.automazioneId=a.id;riga.setAttribute('role','listitem');
 const testa=el(doc,'div','talos-automation__head');
 testa.append(el(doc,'span','talos-dot'+(stato.tono?' talos-dot--'+stato.tono:''),undefined),el(doc,'span','talos-automation__name talos-grow',t.nome),el(doc,'span','talos-badge talos-badge--sm',t.intervallo),el(doc,'span','talos-badge'+(stato.tono?' talos-badge--'+stato.tono:'')+' talos-badge--sm',stato.testo));
 const toggle=el(doc,'button',stato.prossimo===null?'talos-button talos-button--secondary talos-button--sm':'talos-switch');toggle.type='button';toggle.dataset.autoToggle='';toggle.disabled=salvataggio||stato.prossimo===null;
 if(stato.prossimo!==null){toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(a.attiva));toggle.setAttribute('aria-label',traduci("sezioni.automations.row.toggleLabel", { name: t.nome }));toggle.append(el(doc,'span','talos-switch__thumb'));}else toggle.textContent=traduci("sezioni.automations.status.needsChecking");
 toggle.addEventListener('click',()=>onToggle?.(a,stato.prossimo));testa.append(toggle);
 const righe=el(doc,'div','talos-automation__runs');righe.append(kv(doc,traduci('sezioni.automations.row.nextRun'),t.prossima),kv(doc,traduci('sezioni.automations.row.runsToday'),t.conteggio));
 const piede=el(doc,'div','talos-automation__head');const dettagli=el(doc,'button','talos-button talos-button--ghost talos-button--sm',traduci("sezioni.common.details"));dettagli.type='button';dettagli.dataset.autoDetails='';dettagli.setAttribute('aria-expanded',String(aperta));const pannello=el(doc,'div','talos-automation__runs');pannello.dataset.autoDettaglio='';pannello.hidden=!aperta;pannello.append(kv(doc,traduci('sezioni.automations.row.model'),t.modello),kv(doc,traduci('sezioni.automations.row.lastRun'),t.ultima),kv(doc,traduci('sezioni.automations.row.created'),t.creata),kv(doc,traduci('sezioni.automations.row.task'),t.task));dettagli.addEventListener('click',()=>{pannello.hidden=!pannello.hidden;dettagli.setAttribute('aria-expanded',String(!pannello.hidden));onDettagli?.(a,!pannello.hidden);});piede.append(dettagli,el(doc,'span','talos-grow'));
 if(salvataggio&&salvataggioId===a.id){const attesa=el(doc,'span','talos-muted',traduci("sezioni.common.saving"));attesa.setAttribute('role','status');piede.append(attesa);}
 const elimina=el(doc,'button','talos-button talos-button--ghost talos-button--sm',traduci("sezioni.common.delete"));elimina.type='button';elimina.dataset.autoElimina='';elimina.setAttribute('aria-label',traduci("sezioni.automations.row.deleteLabel", { name: t.nome }));elimina.disabled=salvataggio;elimina.addEventListener('click',()=>onElimina?.(a));piede.append(elimina);riga.append(testa,righe,piede,pannello);return riga;
}
const PAGINE=new WeakMap();
export function aggiornaPaginaAutomazioni(schermo,elenco,opzioni={}){
 let pagina=PAGINE.get(schermo);
 if(!pagina){
  pagina={elenco:[],opzioni:{},query:'',stato:'tutte',focus:null,aperte:new Set()};PAGINE.set(schermo,pagina);
  schermo.querySelector('[data-auto-query]').addEventListener('input',e=>{pagina.query=e.target.value;render(schermo,pagina);});
  schermo.querySelector('[data-auto-refresh]').addEventListener('click',()=>pagina.opzioni.onAggiorna?.());
  const tabs=[...schermo.querySelectorAll('[data-auto-stato]')];for(const tab of tabs){tab.addEventListener('click',()=>{pagina.stato=tab.dataset.autoStato;render(schermo,pagina);});tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(tab),nuovo=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];nuovo.click();nuovo.focus();});}
 }
 pagina.elenco=elenco;pagina.opzioni={...pagina.opzioni,...opzioni};render(schermo,pagina);
}
function render(schermo,pagina){
 const {elenco,opzioni}=pagina,doc=schermo.ownerDocument,visibili=filtraAutomazioni(elenco,pagina),riassunto=riepilogoAutomazioni(elenco);
 schermo.querySelector('.talos-topbar__path').textContent=opzioni.errore?traduci("sezioni.automations.unavailable"):opzioni.caricamento?traduci("sezioni.automations.loading"):riassunto;
 const esito=schermo.querySelector('[data-auto-esito]');esito.textContent=opzioni.errore||(opzioni.caricamento?traduci("sezioni.automations.loading"):visibili.length===elenco.length?riassunto:traduci('sezioni.automations.filteredOfTotal',{shown:visibili.length,total:elenco.length}));esito.setAttribute('role',opzioni.errore?'alert':'status');
 const errore=schermo.querySelector('[data-auto-errore-azione]');errore.textContent=opzioni.erroreAzione||'';errore.hidden=!opzioni.erroreAzione;
 schermo.querySelector('[data-auto-refresh]').disabled=Boolean(opzioni.caricamento||opzioni.salvataggio);schermo.querySelector('[data-automation-action="new"]').disabled=Boolean(opzioni.salvataggio);
 for(const tab of schermo.querySelectorAll('[data-auto-stato]')){const attivo=pagina.stato===tab.dataset.autoStato;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;}
 const lista=schermo.querySelector('[data-auto-list]');lista.setAttribute('role',visibili.length?'list':'group');
 const focusLista=lista.contains(doc.activeElement)||doc.activeElement===doc.body;
 const azione=(a,nome,fn,...args)=>{if(opzioni.salvataggio)return;pagina.focus={id:a.id,nome};fn?.(a,...args);};
 lista.replaceChildren(...visibili.map(a=>creaAutomationRow(a,{document:doc,adesso:opzioni.adesso,salvataggio:opzioni.salvataggio,salvataggioId:opzioni.salvataggioId,aperta:pagina.aperte.has(a.id),onDettagli:(s,v)=>{if(v)pagina.aperte.add(s.id);else pagina.aperte.delete(s.id);},onToggle:(s,v)=>azione(s,'toggle',opzioni.onToggle,v),onElimina:s=>azione(s,'elimina',opzioni.onElimina)})));
 if(!visibili.length)lista.append(el(doc,'p','talos-list-row talos-muted',opzioni.errore||(opzioni.caricamento?traduci("sezioni.automations.loading"):elenco.length?traduci("sezioni.automations.noMatches"):traduci("sezioni.automations.empty"))));
 if(pagina.focus&&!opzioni.caricamento&&!opzioni.salvataggio){if(focusLista){const riga=[...lista.querySelectorAll('[data-automazione-id]')].find(r=>r.dataset.automazioneId===pagina.focus.id);riga?.querySelector('[data-auto-'+pagina.focus.nome+']')?.focus({preventScroll:true});}pagina.focus=null;}
}
