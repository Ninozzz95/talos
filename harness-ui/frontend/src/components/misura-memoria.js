// MemoryMeter: misure del server, nessuna stima per processo.
const numero = n => Number.isFinite(n) && n >= 0;
export function normalizzaCapacita(c) {
 if(!c || c.schema!=='talos.model-lab.capacity/1' || !c.memory || !c.storage || !numero(c.memory.totalBytes) || c.memory.totalBytes===0 || !numero(c.memory.freeBytes) || c.memory.freeBytes>c.memory.totalBytes || !['availableBytes','reserveBytes','allocatableBytes'].every(k=>numero(c.storage[k])) || typeof c.measuredAt!=='string' || Number.isNaN(Date.parse(c.measuredAt)))throw Error('La misura della capacità non è valida.');
 return c;
}
export function datiMemoria(capacita,runtimes=[],{erroreRuntime=''}={}) {
 const c=normalizzaCapacita(capacita),ll=runtimes.find(r=>r.runtimeId==='llama.cpp');
 return {totale:c.memory.totalBytes,libera:c.memory.freeBytes,usata:c.memory.totalBytes-c.memory.freeBytes,percentuale:(1-c.memory.freeBytes/c.memory.totalBytes)*100,discoDisponibile:c.storage.availableBytes,discoRiserva:c.storage.reserveBytes,discoAllocabile:c.storage.allocatableBytes,caricato:erroreRuntime?null:ll?.runtimeState==='ready'};
}
const byte=n=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(n/1024**3)+' GiB';
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;}
const CAMPI=[['totale','RAM totale','machineMemoryMetric'],['libera','RAM libera','machineFreeMemoryMetric'],['discoDisponibile','Disponibile sul disco','machineStorageMetric'],['discoRiserva','Riserva sul disco',null],['discoAllocabile','Allocabile sul disco','machineAllocatableMetric']];
export function creaMisuraMemoria(dati={}){
 const card=el('section','talos-card talos-card--pad');card.dataset.c='MemoryMeter';card.dataset.memoryMeter='';
 const head=el('div','talos-cluster');head.append(el('h3','talos-lab__heading','Memoria e spazio sul disco'));const date=el('span','talos-badge talos-badge--sm');date.dataset.memoryDate='';date.dataset.c='Badge';head.append(date);card.append(head);
 const errore=el('p','talos-muted');errore.dataset.memoryError='';errore.setAttribute('role','alert');errore.hidden=true;card.append(errore);
 const meter=el('meter','talos-lab__meter');meter.id='memoriaModello';meter.min=0;meter.max=100;meter.low=75;meter.high=90;meter.optimum=0;meter.dataset.memoryBar='';card.append(meter);const label=el('p','talos-muted');label.dataset.memoryLabel='';card.append(label);
 for(const [key,title] of CAMPI){if(key==='discoDisponibile')card.append(el('hr','talos-lab__rule'));const row=el('div','talos-kv');const value=el('span','talos-kv__v');value.dataset.memoryValue=key;row.append(el('span','talos-kv__k',title),value);card.append(row);}
 const tenuta=el('p','talos-muted talos-lab__space');tenuta.dataset.memoryTenuta='';card.append(tenuta);
 const actions=el('div','talos-cluster talos-lab__space');for(const [key,title] of [['refresh','Rimisura'],['unload','Libera memoria del modello']]){const b=el('button','talos-button talos-button--secondary talos-button--sm',title);b.type='button';b.dataset.c='Button';b.dataset.memoryAction=key;if(key==='unload')b.dataset.action='runtimeLibera';else b.dataset.demo='Misure di esempio: nella app vengono lette dal server';actions.append(b);}card.append(actions);
 const detail=el('p','talos-muted talos-lab__space');detail.dataset.memoryDetail='';card.append(detail,el('p','talos-muted','GiB = 1.024³ byte. La memoria del singolo modello non è misurata. Liberare il modello di TALOS conserva il file sul disco.'));
 aggiornaMisuraMemoria(card,dati);return card;
}
export function aggiornaMisuraMemoria(card,{capacita=null,runtimes=[],caricamento=false,errore='',erroreRuntime='',caricamentoRuntime=false,runtimeVerificato=true,scaricamento=false}={}) {
 if(!card)return;const set=(selector,value)=>{const n=card.querySelector(selector);if(n)n.textContent=value;};
 let d=null;if(capacita&&!errore)d=datiMemoria(capacita,runtimes,{erroreRuntime});
 const alert=card.querySelector('[data-memory-error]');alert.hidden=!errore;alert.textContent=errore;
 set('[data-memory-date]',caricamento?'Misurazione…':errore?'Misura non disponibile':capacita?'Misurato '+new Date(capacita.measuredAt).toLocaleTimeString('it-IT',{timeZone:'Europe/Rome'}):'Non ancora misurata');
 for(const [key]of CAMPI)set('[data-memory-value='+key+']',d?byte(d[key]):'Non misurata');
 const pressione=d?.percentuale>=90?'critico':d?.percentuale>=75?'alto':'normale';card.dataset.memoryLevel=pressione;
 const avviso=pressione==='critico'?' · RAM quasi esaurita':pressione==='alto'?' · Molta RAM in uso':'';
 const label=d?byte(d.usata)+' in uso su '+byte(d.totale)+' · '+new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(d.percentuale)+'%'+avviso:'Memoria non misurata.';set('[data-memory-label]',label);
 const meter=card.querySelector('[data-memory-bar]');meter.hidden=!d;meter.value=d?.percentuale||0;meter.setAttribute('aria-label',label);
 const caricato=!erroreRuntime && runtimeVerificato && !caricamentoRuntime && runtimes.some(r=>r.runtimeId==='llama.cpp' && r.runtimeState==='ready');
 set('[data-memory-tenuta]',caricamentoRuntime||!runtimeVerificato?'Verifica del modello in corso…':erroreRuntime?'Stato del modello non verificato: '+erroreRuntime:caricato?'TALOS ha un modello caricato nel motore locale.':'Nessun modello caricato da TALOS.');
 set('[data-memory-detail]',capacita&&!errore?[capacita.platform,capacita.arch,new Date(capacita.measuredAt).toLocaleString('it-IT',{timeZone:'Europe/Rome'})].filter(Boolean).join(' · '):'Riprova a misurare dal server locale.');
 card.querySelector('[data-memory-action=refresh]').disabled=caricamento||caricamentoRuntime||scaricamento;
 card.querySelector('[data-memory-action=unload]').disabled=!d||!caricato||caricamento||scaricamento;
 card.querySelector('[data-memory-action=unload]').textContent=scaricamento?'Liberazione…':'Libera memoria del modello';
 card.setAttribute('aria-busy',String(caricamento||caricamentoRuntime||scaricamento));
}
export function montaMisuraMemoria(originale,canonico){
 if(!originale||!canonico||originale.querySelector('[data-memory-meter]'))return;
 const colonna=originale.querySelector('#memoriaLibera')?.parentElement;if(!colonna)return;
 for(const [key,id]of [['refresh','memoriaRimisura'],['unload','memoriaScarica']]){const vecchio=colonna.querySelector('#'+id),slot=canonico.querySelector('[data-memory-action='+key+']');vecchio.className=slot.className;vecchio.dataset.c='Button';vecchio.dataset.memoryAction=key;vecchio.textContent=slot.textContent;slot.replaceWith(vecchio);}
 for(const [key,,id]of CAMPI)if(id)canonico.querySelector('[data-memory-value='+key+']').id=id;
 canonico.querySelector('[data-memory-label]').id='memoriaBarraEtichetta';canonico.querySelector('[data-memory-tenuta]').id='memoriaTenuta';canonico.querySelector('[data-memory-detail]').id='machineCapacityDetail';
 colonna.replaceChildren(canonico);aggiornaMisuraMemoria(canonico,{runtimeVerificato:false});
}
