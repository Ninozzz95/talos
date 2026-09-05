/** ToolList nel mockup. WAI Listbox + inventari Hermes/Claude/Codex, 05/09/2026. */
import {nomeUmanoAttrezzo,corrispondeARicerca} from './nomi-attrezzi.js';
const PERMESSI={'':'Come la sessione',sempre:'Consenti sempre',chiedi:'Chiedi sempre',nega:'Nega'};
export function permessoAttrezzo(a){return a.permessoConfigurabile?PERMESSI[a.permesso??'']||'Permesso non riconosciuto':'Politica della sessione';}
export function stimaSchemaAttrezzi(attrezzi){return attrezzi.reduce((s,a)=>Number.isFinite(a.tokenSchemaStimati)&&a.tokenSchemaStimati>=0?{...s,totale:s.totale+a.tokenSchemaStimati}:{...s,mancanti:s.mancanti+1},{totale:0,mancanti:0});}
export function filtraAttrezzi(attrezzi,{query='',filtro='tutti'}={}){const q=String(query).trim().toLocaleLowerCase('it');return attrezzi.filter(a=>(filtro==='tutti'||(filtro==='permessi'?a.permessoConfigurabile===true:filtro==='dipendenze'?a.dipendenza&&a.dipendenza.stato!=='pronta':false))&&(!q||corrispondeARicerca(a.nome,q)||String(a.descrizione||'').toLocaleLowerCase('it').includes(q)));}
function el(doc,tag,classe,testo){const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;}
function titolo(a){return nomeUmanoAttrezzo(a.nome)||'Attrezzo senza nome leggibile';}
function stima(a){return Number.isFinite(a.tokenSchemaStimati)&&a.tokenSchemaStimati>=0?a.tokenSchemaStimati.toLocaleString('it-IT')+' token':'Stima non disponibile';}
function icona(doc,a){const c=el(doc,'span','talos-list-row__icon'),s=doc.createElementNS('http://www.w3.org/2000/svg','svg'),u=doc.createElementNS('http://www.w3.org/2000/svg','use');s.setAttribute('class','i');s.setAttribute('aria-hidden','true');u.setAttribute('href','#'+({shell:'i-terminal',cerca:'i-search',leggi:'i-eye',scrivi:'i-code',web_search:'i-globe',document_create:'i-files'}[a.nome]||'i-code'));s.append(u);c.append(s);return c;}
export function creaToolListRow(a,{document:doc=globalThis.document,selezionata=false,selezionabile=true,onSeleziona,uso=null}={}){
 const r=el(doc,selezionabile?'button':'div','talos-list-row');r.dataset.toolName=a.nome;if(selezionabile){r.type='button';r.setAttribute('role','option');r.setAttribute('aria-selected',String(selezionata));r.setAttribute('aria-controls','capabilityDettaglio');r.tabIndex=selezionata?0:-1;r.addEventListener('click',()=>onSeleziona?.(a.nome));}else r.setAttribute('role','group');
 const t=el(doc,'span','talos-list-row__text');t.append(el(doc,'span','talos-list-row__title',titolo(a)),el(doc,'span','talos-list-row__sub',a.descrizione||'Descrizione non disponibile'));
 if(a.dipendenza)t.append(el(doc,'span','talos-list-row__sub',a.dipendenza.dettaglio||'Dipendenza non osservata'));
 const aside=el(doc,'span','talos-list-row__aside');aside.append(el(doc,'span',Number.isFinite(a.tokenSchemaStimati)&&a.tokenSchemaStimati>=0?'talos-mono talos-measure--estimate':'talos-muted',stima(a)),el(doc,'span','talos-badge'+(a.permesso==='chiedi'?' talos-badge--warning':''),permessoAttrezzo(a)));
 if(uso?.chiamate>0)aside.append(el(doc,'span','talos-muted',uso.chiamate+' chiamate'+(uso.ripetute>0?' · '+uso.ripetute+' ripetute':'')));
 r.append(icona(doc,a),t,aside);return r;
}
const PAGINE=new WeakMap();
export function aggiornaPaginaCapability(schermo,attrezzi,opzioni={}){
 let p=PAGINE.get(schermo);if(!p){p={attrezzi:[],opzioni:{},query:'',filtro:'tutti',scelto:null,ambito:undefined};PAGINE.set(schermo,p);
 schermo.querySelector('[data-cap-query]').addEventListener('input',e=>{p.query=e.target.value;render(schermo,p);});
 schermo.querySelector('[data-cap-refresh]').addEventListener('click',()=>p.opzioni.onAggiorna?.());
 const tabs=[...schermo.querySelectorAll('[data-cap-filtro]')];for(const t of tabs){t.addEventListener('click',()=>{p.filtro=t.dataset.capFiltro;render(schermo,p);});t.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(t),next=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];next.click();next.focus();});}
 schermo.querySelector('[data-cap-permesso]').addEventListener('change',e=>{const a=p.attrezzi.find(a=>a.nome===p.scelto),valore=e.target.value;e.target.value=a?.permesso??'';if(a?.permessoConfigurabile&&!p.opzioni.salvataggio){p.focusPermesso=schermo.ownerDocument.activeElement===e.target?{nome:a.nome,ambito:p.ambito}:null;p.opzioni.onPermesso?.(a,valore);}});
 }
 if(p.ambito!==opzioni.ambito){p.scelto=null;p.ambito=opzioni.ambito;}
 p.attrezzi=attrezzi;p.opzioni={...p.opzioni,...opzioni};render(schermo,p);
}
function render(schermo,p){
 const {attrezzi,opzioni:o}=p,doc=schermo.ownerDocument,visibili=filtraAttrezzi(attrezzi,p),uso=new Map((o.uso?.perAttrezzo||[]).map(a=>[a.nome,a]));
 if(!o.caricamento&&!visibili.some(a=>a.nome===p.scelto))p.scelto=visibili[0]?.nome||null;
 const resumo=schermo.querySelector('[data-cap-esito]');resumo.textContent=o.errore||(o.caricamento?'Caricamento degli attrezzi…':visibili.length+' di '+attrezzi.length+' attrezzi offerti');resumo.setAttribute('role',o.errore?'alert':'status');
 schermo.querySelector('[data-cap-count]').textContent=o.errore||o.caricamento?'—':attrezzi.length;
 const sum=stimaSchemaAttrezzi(attrezzi);schermo.querySelector('[data-cap-token]').textContent=o.errore||o.caricamento?'Schema non osservato':!attrezzi.length?'Nessuno schema offerto':sum.mancanti?'Stima parziale: ~'+sum.totale.toLocaleString('it-IT')+' token · '+sum.mancanti+' non disponibili':'~'+sum.totale.toLocaleString('it-IT')+' token di schema per giro (stima)';
 schermo.querySelector('[data-cap-ambito]').textContent=o.ambito?'Permessi della sessione aperta. La scelta per attrezzo precede la politica generale.':'Nessuna sessione aperta. Il catalogo mostra gli attrezzi per la prossima sessione; scegli i permessi aprendo una sessione.';
 schermo.querySelector('[data-cap-uso]').textContent=o.ambito?(o.uso?.registrato?'Uso registrato: '+o.uso.chiamate+' chiamate · '+o.uso.ripetute+' identiche a una precedente.':'Uso nella sessione non registrato.'):'Nessun uso di sessione da mostrare.';
 const err=schermo.querySelector('[data-cap-errore-azione]');err.textContent=o.erroreAzione||'';err.hidden=!o.erroreAzione;
 schermo.querySelector('[data-cap-refresh]').disabled=Boolean(o.caricamento||o.salvataggio);
 for(const t of schermo.querySelectorAll('[data-cap-filtro]')){const active=t.dataset.capFiltro===p.filtro;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;}
 const lista=schermo.querySelector('[data-cap-list]'),focus=doc.activeElement?.closest('[data-tool-name]')?.dataset.toolName;lista.setAttribute('role',visibili.length?'listbox':'group');
 function seleziona(id,f=false){p.scelto=id;render(schermo,p);if(f)[...lista.querySelectorAll('[data-tool-name]')].find(n=>n.dataset.toolName===id)?.focus();}
 lista.replaceChildren(...visibili.map((a,i)=>{const r=creaToolListRow(a,{document:doc,selezionata:a.nome===p.scelto,onSeleziona:seleziona,uso:uso.get(a.nome)});r.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?visibili.length-1:(i+(e.key==='ArrowDown'?1:-1)+visibili.length)%visibili.length;seleziona(visibili[next].nome,true);});return r;}));
 if(!visibili.length)lista.append(el(doc,'p','talos-list-row talos-muted',o.errore?'Catalogo non disponibile.':o.caricamento?'Caricamento…':attrezzi.length?'Nessun attrezzo corrisponde ai filtri.':'Nessun attrezzo offerto in questa configurazione.'));
 if(focus)[...lista.querySelectorAll('[data-tool-name]')].find(n=>n.dataset.toolName===focus)?.focus({preventScroll:true});
 const a=visibili.find(a=>a.nome===p.scelto),d=schermo.querySelector('[data-cap-dettaglio]');d.hidden=!a;if(!a)return;
 d.querySelector('h3').textContent=titolo(a);d.querySelector('[data-cap-descrizione]').textContent=a.descrizione||'Descrizione non disponibile';d.querySelector('[data-cap-stima]').textContent=(Number.isFinite(a.tokenSchemaStimati)&&a.tokenSchemaStimati>=0?'~':'')+stima(a);d.querySelector('[data-cap-disponibile]').textContent='Offerto al modello';d.querySelector('[data-cap-dipendenza]').textContent=a.dipendenza?.dettaglio||'Nessuna dipendenza esterna dichiarata';d.querySelector('[data-cap-categoria]').textContent=a.categoria==='base'?'Base':a.categoria==='esteso'?'Esteso':'Categoria non osservata';
 const u=uso.get(a.nome);d.querySelector('[data-cap-uso-voce]').textContent=u?.chiamate>0?u.chiamate+' chiamate · '+u.ripetute+' identiche a una precedente':'Uso non registrato per questo attrezzo';
 const select=d.querySelector('[data-cap-permesso]');select.value=Object.hasOwn(PERMESSI,a.permesso??'')?a.permesso??'':'';select.disabled=Boolean(o.caricamento||o.salvataggio)||!a.permessoConfigurabile||!o.ambito;
 if(p.focusPermesso&&!o.salvataggio&&!o.caricamento){const prima=p.focusPermesso;p.focusPermesso=null;if(prima.nome===p.scelto&&prima.ambito===p.ambito&&!select.disabled&&!schermo.hidden&&doc.activeElement===doc.body)select.focus({preventScroll:true});}
 d.querySelector('[data-cap-permesso-spiega]').textContent=o.salvataggio?'Salvataggio del permesso…':a.permessoConfigurabile?(o.ambito?permessoAttrezzo(a)+'. Vale per le prossime chiamate di questa sessione.':'Apri una sessione per scegliere il permesso.'):'Questo attrezzo segue la politica generale della sessione; non ha una scelta separata.';
}
