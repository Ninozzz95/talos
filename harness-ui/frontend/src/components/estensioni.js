/** Inventari per progetto: forma canonica, fiducia distinta da esecuzione. Ricerca 05/09/2026 nel ledger B4.2. */
const EVENTI={pre_tool_call:'Prima di usare un attrezzo',post_tool_call:'Dopo aver usato un attrezzo',session_start:'All’avvio della sessione',session_end:'Alla fine della sessione'};
const ORIGINI={skills:'.harness-ui-skills/',mcp:'.harness-ui-mcp.json',plugins:'.harness-ui-plugins/',hooks:'.harness-ui-hooks.json'};
const el=(doc,tag,classe,testo)=>{const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;};
const eventi=xs=>(xs||[]).map(e=>EVENTI[e]||e).join(' · ');
export function datiEstensione(tipo,v){
 const skill=tipo==='skills',stato=skill?'Disponibile':v.fidato===true?'Fidato':v.fidato===false?'Da fidare':'Fiducia non osservata';
 /*
  * ⭐⭐⭐ 5-ter (17/09/2026) — LA FRASE DELLA FIDUCIA, che il backend calcola e lo schermo buttava.
  *
  * Da `ba420a95` `elencaPlugin` porta `motivo` (`mai-approvato` · `regola-precedente` ·
  * `contenuto-cambiato`) e una `frase` già scritta per una persona. Qui arrivava solo il
  * `fidato: boolean`, e il pannello disegnava un «Fida» nudo: un plugin GIÀ approvato che va
  * riapprovato perché la regola è cambiata aveva lo stesso aspetto di uno MANOMESSO.
  * ⛔ A schermo va `frase`, MAI `motivo`: il motivo è un nome tecnico (regola dell'owner 04/09).
  * ⛔ Se la frase non c'è non si inventa: il pannello resta com'era, senza una riga vuota.
  */
 const r={id:v.id,titolo:v.name||v.nome||v.id,descrizione:v.description||v.descrizione||(tipo==='mcp'?'Server MCP dichiarato nel progetto.':eventi(v.eventi)),stato,fidabile:!skill&&v.fidato===false,frase:typeof v.frase==='string'&&v.frase.trim()?v.frase.trim():null,origine:ORIGINI[tipo]||'Origine non osservata',righe:[],avvisi:Array.isArray(v.avvisi)?v.avvisi:[]};
 if(tipo==='mcp')r.righe=[['Comando',v.comando],['Argomenti',v.argomenti?.length?v.argomenti.join(' · '):'Nessuno'],['Attrezzi ammessi',v.allowlist?.length?v.allowlist.join(' · '):'Non osservati'],['Connessione','Non osservata da questo inventario']];
 if(tipo==='plugins'){r.righe=[['Attrezzi',String(v.tools?.length??0)],['Hook',String(v.hooks?.length??0)]];for(const t of v.tools||[])r.righe.push([t.nome,t.descrizione+' · '+t.comando]);for(const h of v.hooks||[])r.righe.push([h.id,eventi(h.eventi)+' · '+h.comando]);}
 if(tipo==='hooks')r.righe=[['Quando',eventi(v.eventi)],['Comando','Non esposto dall’inventario. Verificalo nel file del progetto prima di fidarti.']];
 if(skill)r.righe=[['Caricamento','Su richiesta dell’agente'],['Istruzioni complete','Disponibili nel file SKILL.md del progetto']];
 return r;
}
export function filtraEstensioni(tipo,voci,query=''){const q=String(query).trim().toLocaleLowerCase('it');return voci.filter(v=>!q||JSON.stringify(datiEstensione(tipo,v)).toLocaleLowerCase('it').includes(q));}
export function creaExtensionRow(tipo,v,{document:doc=globalThis.document,selezionata=false,onSeleziona}={}){
 const d=datiEstensione(tipo,v),r=el(doc,'button','talos-list-row');r.type='button';r.dataset.extId=d.id;r.setAttribute('role','option');r.setAttribute('aria-selected',String(selezionata));r.tabIndex=selezionata?0:-1;
 const i=el(doc,'span','talos-list-row__icon'),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),u=doc.createElementNS('http://www.w3.org/2000/svg','use');svg.setAttribute('class','i');svg.setAttribute('aria-hidden','true');u.setAttribute('href',tipo==='mcp'?'#i-globe':'#i-bolt');svg.append(u);i.append(svg);
 const t=el(doc,'span','talos-list-row__text');t.append(el(doc,'span','talos-list-row__title',d.titolo),el(doc,'span','talos-list-row__sub',d.descrizione));
 const a=el(doc,'span','talos-list-row__aside');a.append(el(doc,'span','talos-badge'+(d.fidabile?' talos-badge--warning':''),d.stato));r.append(i,t,a);r.addEventListener('click',()=>onSeleziona?.(d.id));return r;
}
const PANELS=new WeakMap();
export function aggiornaEstensioni(panel,voci,opzioni={}){
 let p=PANELS.get(panel);if(!p){p={query:'',scelto:null,voci:[],opzioni:{},ambito:undefined};PANELS.set(panel,p);panel.querySelector('[data-ext-query]').addEventListener('input',e=>{p.query=e.target.value;render(panel,p);});panel.querySelector('[data-ext-refresh]').addEventListener('click',()=>p.opzioni.onAggiorna?.());panel.querySelector('[data-ext-trust]').addEventListener('click',()=>{const v=p.voci.find(v=>v.id===p.scelto);if(v&&datiEstensione(p.opzioni.tipo,v).fidabile&&!p.opzioni.salvataggio&&!p.opzioni.caricamento){p.fuoco=panel.ownerDocument.activeElement===panel.querySelector('[data-ext-trust]')?{id:v.id,ambito:p.ambito}:null;p.opzioni.onFida?.(v);}});}
 if(p.ambito!==opzioni.ambito){p.scelto=null;p.ambito=opzioni.ambito;}p.voci=voci;p.opzioni={...p.opzioni,...opzioni};render(panel,p);
}
function render(panel,p){
 const o=p.opzioni,doc=panel.ownerDocument,voci=filtraEstensioni(o.tipo,p.voci,p.query);if(!voci.some(v=>v.id===p.scelto))p.scelto=voci[0]?.id||null;
 const stato=panel.querySelector('[data-ext-esito]');stato.textContent=o.errore||(o.caricamento?'Caricamento…':voci.length+' di '+p.voci.length+' voci del progetto');stato.setAttribute('role',o.errore?'alert':'status');const err=panel.querySelector('[data-ext-errore]');err.hidden=!o.erroreAzione;err.textContent=o.erroreAzione||'';panel.querySelector('[data-ext-refresh]').disabled=Boolean(o.caricamento||o.salvataggio);
 const lista=panel.querySelector('[data-ext-list]'),focus=doc.activeElement?.closest('[data-ext-id]')?.dataset.extId;lista.setAttribute('role',voci.length?'listbox':'group');
 function scegli(id,fuoco=false){p.scelto=id;render(panel,p);if(fuoco)[...lista.children].find(n=>n.dataset.extId===id)?.focus();}
 lista.replaceChildren(...voci.map((v,i)=>{const r=creaExtensionRow(o.tipo,v,{document:doc,selezionata:v.id===p.scelto,onSeleziona:scegli});r.setAttribute('aria-controls',panel.querySelector('[data-ext-detail]').id);r.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const j=e.key==='Home'?0:e.key==='End'?voci.length-1:(i+(e.key==='ArrowDown'?1:-1)+voci.length)%voci.length;scegli(voci[j].id,true);});return r;}));
 if(!voci.length)lista.append(el(doc,'p','talos-list-row talos-muted',o.errore?'Inventario non disponibile.':o.caricamento?'Caricamento…':p.voci.length?'Nessuna voce corrisponde alla ricerca.':'Nessuna voce dichiarata nel progetto.'));
 if(focus)[...lista.children].find(n=>n.dataset.extId===focus)?.focus({preventScroll:true});
 /*
  * ⛔⛔ F3, 17/09/2026 — I PACCHETTI GUASTI STANNO NELLA COLONNA DELL'ELENCO, e si disegnano QUI,
  *   PRIMA del `return` che esce quando non c'è niente di selezionato. Finché stavano nella scheda
  *   erano due difetti in uno: col pulsante «Fida» sotto sembravano roba del plugin scelto, e con
  *   ZERO plugin caricati non si vedevano affatto — cioè sparivano proprio quando l'elenco è vuoto
  *   PERCHÉ i pacchetti sono guasti, che è il caso in cui contano di più.
  * ⛔ Righe che non si scelgono: nessun bottone, nessun `role`, nessun `tabindex`. L'elenco vivo è
  *   un `listbox`, e una voce che non si può selezionare non ci può stare dentro.
  */
 const nodoFalliti=panel.querySelector('[data-ext-falliti]');
 if(nodoFalliti){
  /* ⛔ A3: un pacchetto GUASTO non sparisce — arriva con la sua frase invece di lasciare un buco. */
  /* ⛔ Trovato in una FOTO: senza un'intestazione la frase di un pacchetto guasto sembrava una
     seconda riga della fiducia. Chi legge deve sapere che sta guardando un ALTRO pacchetto. */
  const falliti=Array.isArray(o.falliti)?o.falliti:[];
  nodoFalliti.replaceChildren(...falliti.map(f=>{
   const li=el(doc,'li','talos-trust-fallito');
   li.append(el(doc,'b','',f.nome||f.id||'Pacchetto senza nome'),el(doc,'span','talos-muted',f.frase||'Non caricato: il pacchetto non dichiara un motivo.'));
   return li;
  }));
  const blocco=panel.querySelector('[data-ext-falliti-blocco]');
  if(blocco)blocco.hidden=falliti.length===0;
 }
 const v=voci.find(v=>v.id===p.scelto),detail=panel.querySelector('[data-ext-detail]');detail.hidden=!v;if(!v)return;const d=datiEstensione(o.tipo,v);detail.querySelector('h3').textContent=d.titolo;detail.querySelector('[data-ext-desc]').textContent=d.descrizione;detail.querySelector('[data-ext-stato]').textContent=d.stato;detail.querySelector('[data-ext-origine]').textContent=d.origine;detail.querySelector('[data-ext-meta]').replaceChildren(...d.righe.map(([k,v])=>{const r=el(doc,'div','talos-kv');r.append(el(doc,'span','talos-kv__k',k),el(doc,'span','talos-kv__v',v));return r;}));
 const avvisi=detail.querySelector('[data-ext-warnings]');avvisi.hidden=!d.avvisi.length;avvisi.replaceChildren(...d.avvisi.map(a=>el(doc,'p','talos-detail__desc',a.origine+': '+a.avviso)));if(d.avvisi.length)avvisi.append(el(doc,'p','talos-muted','La scansione segnala possibili rischi; non garantisce sicurezza.'));
 /*
  * 5-ter: la FRASE della fiducia, accanto allo stato che spiega (F3). Nodo che esiste solo nel
  * pannello dei plugin — gli altri tre non ce l'hanno, e l'`if` lo dice senza rompere niente.
  * ⛔ Il testo va in un figlio, non sul blocco: il blocco porta anche l'icona dell'avviso, e un
  *   `textContent` sul padre la cancellerebbe al primo disegno.
  */
 const nodoFrase=detail.querySelector('[data-ext-frase]');
 if(nodoFrase){nodoFrase.hidden=!d.frase;(nodoFrase.querySelector('[data-ext-frase-testo]')||nodoFrase).textContent=d.frase||'';}
 const b=detail.querySelector('[data-ext-trust]');b.hidden=!d.fidabile;b.disabled=Boolean(o.caricamento||o.salvataggio)||!o.ambito;b.textContent=o.salvataggio?'Salvataggio…':'Fida';detail.querySelector('[data-ext-nota]').hidden=o.tipo==='skills';
 if(p.fuoco&&!o.caricamento&&!o.salvataggio){const f=p.fuoco;p.fuoco=null;if(f.id===p.scelto&&f.ambito===p.ambito&&!panel.hidden&&doc.activeElement===doc.body){const target=d.fidabile?b:detail.querySelector('h3');if(target.tagName==='H3')target.tabIndex=-1;target.focus({preventScroll:true});}}
}
const SCHEDE=new WeakMap();
export function mostraSchedaCapability(schermo,tipo){for(const b of schermo.querySelectorAll('[data-cap-tab]')){const attiva=b.dataset.capTab===tipo;b.setAttribute('aria-selected',String(attiva));b.tabIndex=attiva?0:-1;}for(const p of schermo.querySelectorAll('[data-cap-panel]'))p.hidden=p.dataset.capPanel!==tipo;}
export function collegaSchedeCapability(schermo,onSezione){if(SCHEDE.has(schermo)){SCHEDE.set(schermo,onSezione);return;}SCHEDE.set(schermo,onSezione);const tabs=[...schermo.querySelectorAll('[data-cap-tab]')];for(const b of tabs){b.addEventListener('click',()=>{mostraSchedaCapability(schermo,b.dataset.capTab);SCHEDE.get(schermo)?.(b.dataset.capTab);});b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(b),next=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];for(const t of tabs)t.tabIndex=t===next?0:-1;next.focus();});}}
