/** AutomationRow: programma e avvii registrati, mai esiti o costi dedotti. 05/09/2026. */
export function statoAutomazione(attiva) {
 if(attiva===true)return {testo:'Attiva',tono:'success',prossimo:false};
 if(attiva===false)return {testo:'In pausa',tono:'',prossimo:true};
 return {testo:'Stato non registrato',tono:'',prossimo:null};
}
const intero=n=>Number.isInteger(n)&&n>=0;
function dataCompleta(valore){const d=typeof valore==='string'?new Date(valore):null;return d&&Number.isFinite(d.getTime())?d.toLocaleString('it-IT'):'Data non registrata';}
export function testiAutomazione(a,adesso=new Date()){
 const oggi=new Date(adesso).toISOString().slice(0,10),limite=intero(a.limiteAlGiorno)&&a.limiteAlGiorno>0?a.limiteAlGiorno:null;
 const conteggio=a.giornoContatore!==oggi?0:intero(a.eseguiteOggi)?a.eseguiteOggi:null;
 const raggiunto=limite!==null&&conteggio!==null&&conteggio>=limite;
 return {nome:typeof a.nome==='string'&&a.nome.trim()?a.nome:'Automazione senza nome',intervallo:intero(a.intervalloMinuti)&&a.intervalloMinuti>0?'Ogni '+a.intervalloMinuti+' min':'Intervallo non registrato',conteggio:conteggio===null||limite===null?'Conteggio non disponibile':conteggio+' di '+limite,ultima:a.ultimaEsecuzione==null?'Nessun avvio registrato':dataCompleta(a.ultimaEsecuzione),prossima:a.attiva===false?'In pausa':a.attiva!==true?'Stato da verificare':raggiunto?'Limite giornaliero raggiunto':dataCompleta(a.prossimaEsecuzione),creata:dataCompleta(a.creataAlle),task:typeof a.taskId==='string'?a.taskId:'Attività non registrata'};
}
export function filtraAutomazioni(elenco,{query='',stato='tutte'}={}){
 const q=String(query).trim().toLocaleLowerCase('it');
 return elenco.filter(a=>(stato==='tutte'||(stato==='attive'?a.attiva===true:a.attiva===false))&&(!q||[a.nome,a.taskId].join(' ').toLocaleLowerCase('it').includes(q)));
}
export function riepilogoAutomazioni(elenco){const attive=elenco.filter(a=>a.attiva===true).length;return elenco.length+' automazion'+(elenco.length===1?'e':'i')+' · '+attive+(attive===1?' attiva':' attive');}
function el(doc,tag,classe,testo){const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;}
function kv(doc,k,v){const n=el(doc,'div','talos-kv');n.append(el(doc,'span','talos-kv__k',k),el(doc,'span','talos-kv__v',v));return n;}
export function creaAutomationRow(a,{document:doc=globalThis.document,adesso=new Date(),salvataggio=false,salvataggioId=null,aperta=false,onDettagli,onToggle,onElimina}={}){
 const t=testiAutomazione(a,adesso),stato=statoAutomazione(a.attiva),riga=el(doc,'article','talos-card talos-automation');riga.dataset.c='AutomationRow';riga.dataset.automazioneId=a.id;riga.setAttribute('role','listitem');
 const testa=el(doc,'div','talos-automation__head');
 testa.append(el(doc,'span','talos-dot'+(stato.tono?' talos-dot--'+stato.tono:'')),el(doc,'span','talos-automation__name talos-grow',t.nome),el(doc,'span','talos-badge talos-badge--sm',t.intervallo),el(doc,'span','talos-badge'+(stato.tono?' talos-badge--'+stato.tono:'')+' talos-badge--sm',stato.testo));
 const toggle=el(doc,'button',stato.prossimo===null?'talos-button talos-button--secondary talos-button--sm':'talos-switch');toggle.type='button';toggle.dataset.autoToggle='';toggle.disabled=salvataggio||stato.prossimo===null;
 if(stato.prossimo!==null){toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(a.attiva));toggle.setAttribute('aria-label','Automazione '+t.nome);toggle.append(el(doc,'span','talos-switch__thumb'));}else toggle.textContent='Stato da verificare';
 toggle.addEventListener('click',()=>onToggle?.(a,stato.prossimo));testa.append(toggle);
 const righe=el(doc,'div','talos-automation__runs');righe.append(kv(doc,'Prossimo avvio',t.prossima),kv(doc,'Avvii nel giorno UTC / limite',t.conteggio));
 const piede=el(doc,'div','talos-automation__head');const dettagli=el(doc,'button','talos-button talos-button--ghost talos-button--sm','Dettagli');dettagli.type='button';dettagli.dataset.autoDetails='';dettagli.setAttribute('aria-expanded',String(aperta));const pannello=el(doc,'div','talos-automation__runs');pannello.dataset.autoDettaglio='';pannello.hidden=!aperta;pannello.append(kv(doc,'Ultimo avvio registrato',t.ultima),kv(doc,'Creata',t.creata),kv(doc,'Attività',t.task));dettagli.addEventListener('click',()=>{pannello.hidden=!pannello.hidden;dettagli.setAttribute('aria-expanded',String(!pannello.hidden));onDettagli?.(a,!pannello.hidden);});piede.append(dettagli,el(doc,'span','talos-grow'));
 if(salvataggio&&salvataggioId===a.id){const attesa=el(doc,'span','talos-muted','Salvataggio…');attesa.setAttribute('role','status');piede.append(attesa);}
 const elimina=el(doc,'button','talos-button talos-button--ghost talos-button--sm','Elimina');elimina.type='button';elimina.dataset.autoElimina='';elimina.setAttribute('aria-label','Elimina '+t.nome);elimina.disabled=salvataggio;elimina.addEventListener('click',()=>onElimina?.(a));piede.append(elimina);riga.append(testa,righe,piede,pannello);return riga;
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
 schermo.querySelector('.talos-topbar__path').textContent=opzioni.errore?'Automazioni non disponibili':opzioni.caricamento?'Caricamento automazioni…':riassunto;
 const esito=schermo.querySelector('[data-auto-esito]');esito.textContent=opzioni.errore||(opzioni.caricamento?'Caricamento automazioni…':visibili.length===elenco.length?riassunto:visibili.length+' di '+elenco.length+' automazioni');esito.setAttribute('role',opzioni.errore?'alert':'status');
 const errore=schermo.querySelector('[data-auto-errore-azione]');errore.textContent=opzioni.erroreAzione||'';errore.hidden=!opzioni.erroreAzione;
 schermo.querySelector('[data-auto-refresh]').disabled=Boolean(opzioni.caricamento||opzioni.salvataggio);schermo.querySelector('[data-automation-action="new"]').disabled=Boolean(opzioni.salvataggio);
 for(const tab of schermo.querySelectorAll('[data-auto-stato]')){const attivo=pagina.stato===tab.dataset.autoStato;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;}
 const lista=schermo.querySelector('[data-auto-list]');lista.setAttribute('role',visibili.length?'list':'group');
 const focusLista=lista.contains(doc.activeElement)||doc.activeElement===doc.body;
 const azione=(a,nome,fn,...args)=>{if(opzioni.salvataggio)return;pagina.focus={id:a.id,nome};fn?.(a,...args);};
 lista.replaceChildren(...visibili.map(a=>creaAutomationRow(a,{document:doc,adesso:opzioni.adesso,salvataggio:opzioni.salvataggio,salvataggioId:opzioni.salvataggioId,aperta:pagina.aperte.has(a.id),onDettagli:(s,v)=>{if(v)pagina.aperte.add(s.id);else pagina.aperte.delete(s.id);},onToggle:(s,v)=>azione(s,'toggle',opzioni.onToggle,v),onElimina:s=>azione(s,'elimina',opzioni.onElimina)})));
 if(!visibili.length)lista.append(el(doc,'p','talos-list-row talos-muted',opzioni.errore||(opzioni.caricamento?'Caricamento automazioni…':elenco.length?'Nessuna automazione corrisponde ai filtri.':'Nessuna automazione creata.')));
 if(pagina.focus&&!opzioni.caricamento&&!opzioni.salvataggio){if(focusLista){const riga=[...lista.querySelectorAll('[data-automazione-id]')].find(r=>r.dataset.automazioneId===pagina.focus.id);riga?.querySelector('[data-auto-'+pagina.focus.nome+']')?.focus({preventScroll:true});}pagina.focus=null;}
}
