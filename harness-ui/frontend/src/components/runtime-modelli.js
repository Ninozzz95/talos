// RuntimeCard: stato del servizio separato dalla disponibilità e dalla RAM.
const nomi={ollama:'Ollama',lmstudio:'LM Studio','llama.cpp':'llama.cpp'};
export function datiRuntimeModello(r={}){
 const raggiunto=r.state==='observed',models=Array.isArray(r.models)?r.models:[];
 const errore=r.modelsError||r.failureReason||'';
 const locale=r.runtimeId==='llama.cpp',fasi={unavailable:'Non avviato',stopped:'Non avviato',loading:'Caricamento in corso',stopping:'Arresto in corso',failed:'Avvio non riuscito'};
 const stato=raggiunto?(locale?(r.runtimeState==='ready'?'Raggiunto':fasi[r.runtimeState]||'Stato non rilevato'):'Raggiunto'):'Non raggiunto';
 // R-03 (13/09): il motore locale in parole della persona — «scheda grafica (Vulkan) · nome» o
 // «processore»; l'avviso solo sullo stato REALE (un ripiego con la CPU poi fallita non dice
 // «gira»); la memoria esaurita non è un ripiego fatto, è una proposta da confermare nel menu.
 const m=locale&&r.motore&&typeof r.motore==='object'?r.motore:null;
 const dispositivi=Array.isArray(m?.dispositivi)?m.dispositivi.filter(Boolean):[];
 const motore=!m?'':m.variante==='vulkan'?'Motore locale: scheda grafica (Vulkan)'+(dispositivi.length?' · '+dispositivi.join(', '):''):m.variante==='cpu'?'Motore locale: processore':'Motore locale: percorso scelto a mano';
 const pronto=r.runtimeState==='ready';
 const avvisoMotore=!m?'':(m.ripiego&&pronto)?'La scheda grafica non è disponibile: il modello gira sul processore':(m.ripiego&&r.runtimeState==='failed')?'La scheda grafica non è disponibile e il caricamento sul processore non è riuscito':(m.proposta?.a==='cpu')?'La memoria della scheda grafica non basta per questo modello. Nel menu «Motore locale» puoi scegliere «Processore»: più lento, ma il modello gira.':'';
 const riprovaGrafica=Boolean(m?.ripiego&&pronto);
 return {nome:nomi[r.runtimeId]||r.runtimeId||'Motore sconosciuto',stato,tono:stato==='Raggiunto'&&!errore?'success':'warning',motore,avvisoMotore,riprovaGrafica,modelli:!raggiunto?'Disponibilità non verificata':r.modelsError?'Lettura dei modelli non riuscita':models.length?models.length+(models.length===1?' modello disponibile':' modelli disponibili'):'Nessun modello disponibile',nomi:raggiunto&&!r.modelsError?models.map(m=>m.name||m.id).filter(Boolean):[],caricamento:raggiunto&&r.runtimeId==='llama.cpp'?(r.runtimeState==='ready'?'Modello caricato da TALOS':['stopped','unavailable'].includes(r.runtimeState)?'Nessun modello caricato da TALOS':'Non rilevato'):'Non rilevato',indirizzo:r.baseUrl||'Non esposto dal server',data:typeof r.observedAt==='string'&&!Number.isNaN(Date.parse(r.observedAt))?new Date(r.observedAt).toLocaleString('it-IT',{timeZone:'Europe/Rome'}):'Non rilevata',errore};
}
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;}
export function creaRuntimeModello(runtime){
 const d=datiRuntimeModello(runtime),card=el('article','talos-card talos-card--pad talos-runtime-card');card.dataset.c='RuntimeCard';card.dataset.runtimeId=runtime.runtimeId||'';card.dataset.runtimeState=runtime.state||'unknown';
 const head=el('div','talos-cluster'),name=el('h3','talos-lab__heading',d.nome);name.dataset.runtimeName='';const badge=el('span','talos-badge talos-badge--sm talos-badge--'+d.tono,d.stato);badge.dataset.c='Badge';head.append(name,badge);card.append(head);
 const status=el('p','talos-muted',d.modelli);status.dataset.runtimeModels='';card.append(status);
 if(d.nomi.length){const list=el('ul','talos-runtime-card__models');for(const name of d.nomi)list.append(el('li','',name));card.append(list);}
 for(const [label,value,key]of [['Caricamento',d.caricamento,'loaded'],['Indirizzo',d.indirizzo,'address'],['Verifica',d.data,'date']]){const row=el('div','talos-kv'),v=el('span','talos-kv__v',value);v.dataset.runtimeValue=key;row.append(el('span','talos-kv__k',label),v);card.append(row);}
 if(d.motore){const row=el('div','talos-kv'),v=el('span','talos-kv__v',d.motore.replace(/^Motore locale: /,''));v.dataset.runtimeValue='engine';row.append(el('span','talos-kv__k','Motore locale'),v);card.append(row);}
 if(d.avvisoMotore){const avviso=el('p','talos-muted talos-runtime-card__avviso',d.avvisoMotore);avviso.setAttribute('role','status');avviso.dataset.runtimeEngineNotice='';card.append(avviso);}
 if(d.riprovaGrafica){const riprova=el('button','talos-button talos-button--secondary talos-button--sm','Riprova sulla scheda grafica');riprova.type='button';riprova.dataset.c='Button';riprova.dataset.runtimeRetryGpu='';riprova.addEventListener('click',()=>{riprova.disabled=true;card.dispatchEvent(new CustomEvent('talos:riprova-motore',{bubbles:true,detail:{runtimeId:runtime.runtimeId,modelId:runtime.modelId||null}}));});card.append(riprova);}
 if(d.errore){const error=el('p','talos-muted talos-runtime-card__error','Dettaglio: '+d.errore);card.append(error);}return card;
}
export function aggiornaElencoRuntime(list,runtimes=[],{caricamento=false,errore=null}={}){
 if(!list)return;list.className='talos-runtime-list';list.setAttribute('aria-busy',String(caricamento));
 if(caricamento||errore||!runtimes.length){const empty=el('p','talos-muted',caricamento?'Verifica dei motori in corso…':errore?'Lettura non riuscita: '+(errore.message||errore)+'. Riprova con Aggiorna runtime.':'Nessun motore configurato sul server.');empty.dataset.c='EmptyState';if(errore)empty.setAttribute('role','alert');list.replaceChildren(empty);return;}
 list.replaceChildren(...runtimes.map(creaRuntimeModello));
}
export function montaPannelloRuntime(gate){
 if(!gate)return;gate.classList.add('talos-runtime-panel');
 gate.querySelector('h4')?.classList.add('talos-lab__heading');
 const status=gate.querySelector('#modelLabRuntimeStatus');if(status){status.className='talos-badge talos-badge--sm';status.dataset.c='Badge';status.setAttribute('role','status');}
 for(const control of gate.querySelectorAll('select,textarea')){const label=control.closest('label');if(label){label.className='talos-field talos-field--stack';label.htmlFor=control.id;label.querySelector('span')?.classList.add('talos-label');}control.className=control.tagName==='TEXTAREA'?'talos-textarea':'talos-select';}
 for(const button of gate.querySelectorAll('button')){button.className='talos-button talos-button--'+(button.id==='modelLabRunButton'?'primary':'secondary')+' talos-button--sm';button.dataset.c='Button';}
 const backend=gate.querySelector('#modelLabRuntimeSelect')?.closest('label')?.querySelector('span');if(backend)backend.textContent='Motore';
}
