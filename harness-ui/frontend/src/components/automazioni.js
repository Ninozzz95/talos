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
 // automazioni a due porte (08/10/2026): si cerca anche nelle istruzioni
 return elenco.filter(a=>(stato==='tutte'||(stato==='attive'?a.attiva===true:a.attiva===false))&&(!q||[a.nome,a.taskId,a.istruzioni].filter(Boolean).join(' ').toLocaleLowerCase('it').includes(q)));
}
export function riepilogoAutomazioni(elenco){const attive=elenco.filter(a=>a.attiva===true).length;return tn('sezioni.automations.summary.countOne','sezioni.automations.summary.countMany',elenco.length)+' · '+tn('sezioni.automations.summary.activeOne','sezioni.automations.summary.activeMany',attive);}
function el(doc,tag,classe,testo){const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;}
function kv(doc,k,v){const n=el(doc,'div','talos-kv');n.append(el(doc,'span','talos-kv__k',k),el(doc,'span','talos-kv__v',v));return n;}
/*
 * C2b «Coordinazione» (owner 08/10/2026 notte, «Interruttore nella scheda, ora»): nel dettaglio, un interruttore con la parola
 *   dello stato, come nel velo dei permessi. Spenta di serie e per le automazioni di prima (campo assente). Il tetto lo dice la
 *   riga sotto, dalla stessa costante del velo (`coordinazione.js`).
 */
import { TETTO_AVVII_DA_SOLO } from './coordinazione.js';
export function rigaCoordinazione(doc,a,nome,{salvataggio,onCoordinazione}){
 const accesa=a.coordinazione===true,riga=el(doc,'div','talos-kv talos-automation__coord');riga.dataset.autoCoordinazioneRiga='';
 const valore=el(doc,'span','talos-kv__v talos-automation__coord-valore'),parola=el(doc,'span',undefined,traduci(accesa?'sezioni.automations.row.coordinationOn':'sezioni.automations.row.coordinationOff'));parola.dataset.autoCoordinazioneStato='';
 const interruttore=el(doc,'button','talos-switch');interruttore.type='button';interruttore.dataset.autoCoordinazione='';interruttore.setAttribute('role','switch');interruttore.setAttribute('aria-checked',String(accesa));interruttore.setAttribute('aria-label',traduci('sezioni.automations.row.coordinationLabel',{name:nome}));interruttore.disabled=salvataggio;interruttore.append(el(doc,'span','talos-switch__thumb'));
 interruttore.addEventListener('click',()=>onCoordinazione?.(a,!accesa));
 valore.append(parola,interruttore);riga.append(el(doc,'span','talos-kv__k',traduci('sezioni.automations.row.coordination')),valore);
 const nota=el(doc,'p','talos-muted talos-automation__coord-nota',traduci('sezioni.automations.row.coordinationHint',{n:TETTO_AVVII_DA_SOLO}));
 return [riga,nota];
}
export function creaAutomationRow(a,{document:doc=globalThis.document,adesso=new Date(),salvataggio=false,salvataggioId=null,aperta=false,onDettagli,onToggle,onElimina,onCoordinazione}={}){
 const t=testiAutomazione(a,adesso),stato=statoAutomazione(a.attiva),riga=el(doc,'article','talos-card talos-automation');riga.dataset.c='AutomationRow';riga.dataset.automazioneId=a.id;riga.setAttribute('role','listitem');
 const testa=el(doc,'div','talos-automation__head');
 testa.append(el(doc,'span','talos-dot'+(stato.tono?' talos-dot--'+stato.tono:''),undefined),el(doc,'span','talos-automation__name talos-grow',t.nome),el(doc,'span','talos-badge talos-badge--sm',t.intervallo),el(doc,'span','talos-badge'+(stato.tono?' talos-badge--'+stato.tono:'')+' talos-badge--sm',stato.testo));
 // automazioni a due porte (08/10/2026): una voce v1 (task del corpus) lo dice, col modo di passare alla nuova forma
 const vecchio=el(doc,'span','talos-badge talos-badge--sm',traduci('sezioni.automations.v2.row.legacy'));vecchio.dataset.autoLegacy='';vecchio.title=traduci('sezioni.automations.v2.row.legacyHint');testa.append(vecchio);
 const toggle=el(doc,'button',stato.prossimo===null?'talos-button talos-button--secondary talos-button--sm':'talos-switch');toggle.type='button';toggle.dataset.autoToggle='';toggle.disabled=salvataggio||stato.prossimo===null;
 if(stato.prossimo!==null){toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(a.attiva));toggle.setAttribute('aria-label',traduci("sezioni.automations.row.toggleLabel", { name: t.nome }));toggle.append(el(doc,'span','talos-switch__thumb'));}else toggle.textContent=traduci("sezioni.automations.status.needsChecking");
 toggle.addEventListener('click',()=>onToggle?.(a,stato.prossimo));testa.append(toggle);
 const righe=el(doc,'div','talos-automation__runs');righe.append(kv(doc,traduci('sezioni.automations.row.nextRun'),t.prossima),kv(doc,traduci('sezioni.automations.row.runsToday'),t.conteggio));
 const piede=el(doc,'div','talos-automation__head');const dettagli=el(doc,'button','talos-button talos-button--ghost talos-button--sm',traduci("sezioni.common.details"));dettagli.type='button';dettagli.dataset.autoDetails='';dettagli.setAttribute('aria-expanded',String(aperta));const pannello=el(doc,'div','talos-automation__runs');pannello.dataset.autoDettaglio='';pannello.hidden=!aperta;pannello.append(kv(doc,traduci('sezioni.automations.row.model'),t.modello),...rigaCoordinazione(doc,a,t.nome,{salvataggio,onCoordinazione}),kv(doc,traduci('sezioni.automations.row.lastRun'),t.ultima),kv(doc,traduci('sezioni.automations.row.created'),t.creata),kv(doc,traduci('sezioni.automations.row.task'),t.task));dettagli.addEventListener('click',()=>{pannello.hidden=!pannello.hidden;dettagli.setAttribute('aria-expanded',String(!pannello.hidden));onDettagli?.(a,!pannello.hidden);});piede.append(dettagli,el(doc,'span','talos-grow'));
 if(salvataggio&&salvataggioId===a.id){const attesa=el(doc,'span','talos-muted',traduci("sezioni.common.saving"));attesa.setAttribute('role','status');piede.append(attesa);}
 const elimina=el(doc,'button','talos-button talos-button--ghost talos-button--sm',traduci("sezioni.common.delete"));elimina.type='button';elimina.dataset.autoElimina='';elimina.setAttribute('aria-label',traduci("sezioni.automations.row.deleteLabel", { name: t.nome }));elimina.disabled=salvataggio;elimina.addEventListener('click',()=>onElimina?.(a));piede.append(elimina);riga.append(testa,righe,piede,pannello);return riga;
}
/* La PAGINA delle automazioni sta in `automazioni-sezione.js` dall'08/10/2026: è un adattatore dell'impianto elenco+dettaglio
   di Libreria e Note (owner, «non negoziabile»). Qui restano i pezzi che servono anche fuori dalla pagina: i testi, la riga
   v1 del guscio legacy e la riga della Coordinazione. */
