// RuntimeCard: stato del servizio separato dalla disponibilità e dalla RAM.
const nomi={ollama:'Ollama',lmstudio:'LM Studio','llama.cpp':'llama.cpp'};
export function datiRuntimeModello(r={}){
 const raggiunto=r.state==='observed',models=Array.isArray(r.models)?r.models:[];
 const errore=r.modelsError||r.failureReason||'';
 const locale=r.runtimeId==='llama.cpp',fasi={unavailable:'Non avviato',stopped:'Non avviato',loading:'Caricamento in corso',stopping:'Arresto in corso',failed:'Avvio non riuscito'};
 const stato=raggiunto?(locale?(r.runtimeState==='ready'?'Raggiunto':fasi[r.runtimeState]||'Stato non rilevato'):'Raggiunto'):'Non raggiunto';
 return {nome:nomi[r.runtimeId]||r.runtimeId||'Motore sconosciuto',stato,tono:stato==='Raggiunto'&&!errore?'success':'warning',modelli:!raggiunto?'Disponibilità non verificata':r.modelsError?'Lettura dei modelli non riuscita':models.length?models.length+(models.length===1?' modello disponibile':' modelli disponibili'):'Nessun modello disponibile',nomi:raggiunto&&!r.modelsError?models.map(m=>m.name||m.id).filter(Boolean):[],caricamento:raggiunto&&r.runtimeId==='llama.cpp'?(r.runtimeState==='ready'?'Modello caricato da TALOS':['stopped','unavailable'].includes(r.runtimeState)?'Nessun modello caricato da TALOS':'Non rilevato'):'Non rilevato',indirizzo:r.baseUrl||'Non esposto dal server',data:typeof r.observedAt==='string'&&!Number.isNaN(Date.parse(r.observedAt))?new Date(r.observedAt).toLocaleString('it-IT',{timeZone:'Europe/Rome'}):'Non rilevata',errore};
}
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;}
export function creaRuntimeModello(runtime){
 const d=datiRuntimeModello(runtime),card=el('article','talos-card talos-card--pad talos-runtime-card');card.dataset.c='RuntimeCard';card.dataset.runtimeId=runtime.runtimeId||'';card.dataset.runtimeState=runtime.state||'unknown';
 const head=el('div','talos-cluster'),name=el('h3','talos-lab__heading',d.nome);name.dataset.runtimeName='';const badge=el('span','talos-badge talos-badge--sm talos-badge--'+d.tono,d.stato);badge.dataset.c='Badge';head.append(name,badge);card.append(head);
 const status=el('p','talos-muted',d.modelli);status.dataset.runtimeModels='';card.append(status);
 if(d.nomi.length){const list=el('ul','talos-runtime-card__models');for(const name of d.nomi)list.append(el('li','',name));card.append(list);}
 for(const [label,value,key]of [['Caricamento',d.caricamento,'loaded'],['Indirizzo',d.indirizzo,'address'],['Verifica',d.data,'date']]){const row=el('div','talos-kv'),v=el('span','talos-kv__v',value);v.dataset.runtimeValue=key;row.append(el('span','talos-kv__k',label),v);card.append(row);}
 if(d.errore){const error=el('p','talos-muted talos-runtime-card__error','Dettaglio: '+d.errore);card.append(error);}return card;
}
export function aggiornaElencoRuntime(list,runtimes=[],{caricamento=false,errore=null}={}){
 if(!list)return;list.className='talos-runtime-list';list.setAttribute('aria-busy',String(caricamento));
 if(caricamento||errore||!runtimes.length){const empty=el('p','talos-muted',caricamento?'Verifica dei motori in corso…':errore?'Lettura non riuscita: '+(errore.message||errore)+'. Riprova con Aggiorna runtime.':'Nessun motore configurato sul server.');empty.dataset.c='EmptyState';if(errore)empty.setAttribute('role','alert');list.replaceChildren(empty);return;}
 list.replaceChildren(...runtimes.map(creaRuntimeModello));
}
export function montaPannelloRuntime(gate){
 if(!gate)return;gate.classList.add('talos-runtime-panel');
 gate.querySelector('h4')?.classList.add('talos-lab__heading');gate.querySelector('#modelLabRuntimeStatus')?.classList.add('talos-muted');
 for(const select of gate.querySelectorAll('select'))select.classList.add('talos-select');
 for(const button of gate.querySelectorAll('button')){button.classList.add('talos-button','talos-button--secondary','talos-button--sm');button.dataset.c='Button';}
 gate.querySelector('textarea')?.classList.add('talos-field__input');
}
