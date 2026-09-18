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
 /* ⛔ 18/09/2026 — ogni nodo può mancare: `querySelector` torna `null` e una dereferenza nuda
    esplode. La card del mockup ha tutti gli agganci, ma una card degradata (o un'altra forma)
    non deve far cadere l'aggiornamento: si aggiorna ciò che c'è, si salta ciò che non c'è. */
 const alert=card.querySelector('[data-memory-error]');if(alert){alert.hidden=!errore;alert.textContent=errore;}
 set('[data-memory-date]',caricamento?'Misurazione…':errore?'Misura non disponibile':capacita?'Misurato '+new Date(capacita.measuredAt).toLocaleTimeString('it-IT',{timeZone:'Europe/Rome'}):'Non ancora misurata');
 for(const [key]of CAMPI)set('[data-memory-value='+key+']',d?byte(d[key]):'Non misurata');
 const pressione=d?.percentuale>=90?'critico':d?.percentuale>=75?'alto':'normale';card.dataset.memoryLevel=pressione;
 const avviso=pressione==='critico'?' · RAM quasi esaurita':pressione==='alto'?' · Molta RAM in uso':'';
 const label=d?byte(d.usata)+' in uso su '+byte(d.totale)+' · '+new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(d.percentuale)+'%'+avviso:'Memoria non misurata.';set('[data-memory-label]',label);
 const meter=card.querySelector('[data-memory-bar]');if(meter){meter.hidden=!d;meter.value=d?.percentuale||0;meter.setAttribute('aria-label',label);}
 const caricato=!erroreRuntime && runtimeVerificato && !caricamentoRuntime && runtimes.some(r=>r.runtimeId==='llama.cpp' && r.runtimeState==='ready');
 set('[data-memory-tenuta]',caricamentoRuntime||!runtimeVerificato?'Verifica del modello in corso…':erroreRuntime?'Stato del modello non verificato: '+erroreRuntime:caricato?'TALOS ha un modello caricato nel motore locale.':'Nessun modello caricato da TALOS.');
 set('[data-memory-detail]',capacita&&!errore?[capacita.platform,capacita.arch,new Date(capacita.measuredAt).toLocaleString('it-IT',{timeZone:'Europe/Rome'})].filter(Boolean).join(' · '):'Riprova a misurare dal server locale.');
 const refresh=card.querySelector('[data-memory-action=refresh]');if(refresh)refresh.disabled=caricamento||caricamentoRuntime||scaricamento;
 const scarica=card.querySelector('[data-memory-action=unload]');
 if(scarica){scarica.disabled=!d||!caricato||caricamento||scaricamento;scarica.textContent=scaricamento?'Liberazione…':'Libera memoria del modello';}
 card.setAttribute('aria-busy',String(caricamento||caricamentoRuntime||scaricamento));
}
/* ⛔ 18/09/2026 — DUE RADICI, NON UNA (corsia 3, il travaso neutro).
   Fino a oggi questa funzione dava per scontato DOVE stanno i suoi nodi: il misuratore dentro
   `canonico`, la colonna con `#memoriaLibera` dentro `originale`, e ogni dereferenza nuda
   (`vecchio.className`, `slot.className`, `canonico.querySelector(...).id`). Con la destinazione
   invertita — il laboratorio sulla schermata, `montaMisuraMemoria($('#panel-runtime'), …)` — quei
   nodi stanno nell'ALTRO dei due, e sarebbe crollata come le tre funzioni sorelle del 18/09.
   ⇒ Qui: (1) le due radici si CERCANO, non si presumono; (2) ogni nodo che manca si salta invece di
   far esplodere niente; (3) se la colonna legacy non c'è, la card RESTA DOVE STA (cioè sulla
   schermata) invece di essere trascinata in Impostazioni.
   ⭐ L'ordine conta: le referenze si prendono PRIMA di spostare i figli, perché `replaceChildren` e
   `moveBefore` STACCANO i nodi e una query dentro un albero già vuotato torna `null`.
   Fonti consultate il 18/09/2026: MDN `Element.moveBefore` — «doesn't remove and then reinsert the
   node», conserva stato (animazione, focus, fullscreen, popover) e fallisce con
   `HierarchyRequestError` se il nodo non è connesso (per questo si ricade sull'inserimento
   normale); MDN `Element.replaceChildren` + algoritmo DOM «replace all» — SPOSTA i nodi, non li
   clona, quindi gli ascoltatori dei nodi restano vivi; MDN `Node.insertBefore` — `NotFoundError`
   «the node before which the new node is to be inserted is not a child of this node», ed è
   esattamente il crollo n. 3 del 18/09 (`ensureModelLabControls`): per questo il timbro di
   montaggio si mette su ENTRAMBE le radici. */
const sposta=(genitore,nodo)=>{try{if(typeof genitore.moveBefore==='function'){genitore.moveBefore(nodo,null);return;}}catch{/*nodo non connesso o motore senza moveBefore: si inserisce normalmente*/}genitore.append(nodo);};
const primo=(radici,...selettori)=>{for(const selettore of selettori)for(const radice of radici){if(!radice)continue;const n=radice.matches?.(selettore)?radice:radice.querySelector(selettore);if(n)return n;}return null;};
export function montaMisuraMemoria(originale,canonico){
 if(!originale||!canonico)return;
 /* Idempotenza: si timbra l'ELEMENTO, si controlla PRIMA di scrivere (prassi confermata dalla
    ricerca del 18/09/2026: `if (el.dataset.montato) return; el.dataset.montato='1'`). ⛔ Il timbro
    va su ENTRAMBE le radici perché non protegge solo da una seconda chiamata: `ensureModelLabControls`
    (app.js) guarda `dataset.<x>Montato` sul pannello VUOTATO, e senza il timbro anche lì la sua
    `insertBefore` esplode col nodo di riferimento ormai altrove. */
 if(originale.dataset.memoryMontato||canonico.dataset.memoryMontato)return;
 const card=primo([canonico,originale],'[data-memory-meter]');
 if(!card)return;
 /* ⛔ 18/09/2026 — SOLO LE DUE RADICI, nessun ripiego su `document`. Un `getElementById` di
    ripiego sembra prudente e invece RUBA: misurato il 18/09 con `MONTAGGIO-06` — due radici
    vuote bastavano a far svuotare il blocco della memoria del documento VIVO (1455 byte → 0) e a
    portar via i due bottoni che il monolite ascolta (app.js:4642, 4643). Se un nodo non e' in
    nessuna delle due radici, si SALTA: la card resta com'e', il documento vivo non si tocca. */
 const colonna=primo([originale,canonico],'#memoriaLibera')?.parentElement||null;
 // i due bottoni LEGACY entrano nelle sedi del mockup: gli id che il monolite ascolta restano vivi
 for(const [key,id]of [['refresh','memoriaRimisura'],['unload','memoriaScarica']]){
  const vecchio=primo([colonna,originale,canonico],'#'+id);
  const slot=card.querySelector('[data-memory-action='+key+']');
  if(!vecchio||!slot)continue;
  vecchio.className=slot.className;vecchio.dataset.c='Button';vecchio.dataset.memoryAction=key;vecchio.textContent=slot.textContent;
  slot.replaceWith(vecchio);
 }
 // gli id che il monolite cerca tornano sui campi della card — ognuno solo se quel campo c'è
 for(const [key,,id]of CAMPI)if(id){const n=card.querySelector('[data-memory-value='+key+']');if(n)n.id=id;}
 for(const [selettore,id]of [['[data-memory-label]','memoriaBarraEtichetta'],['[data-memory-tenuta]','memoriaTenuta'],['[data-memory-detail]','machineCapacityDetail']]){const n=card.querySelector(selettore);if(n)n.id=id;}
 /* Destinazione: la colonna legacy se esiste; altrimenti la card resta dov'è.
    ⛔ Un id doppio non è un difetto estetico: la specifica HTML vuole l'id UNICO nell'albero, e
    `getElementById`/`querySelector('#x')` tornano il PRIMO in ordine d'albero — se restasse il
    gemello legacy, il monolite legherebbe il nodo SBAGLIATO, in silenzio (ricerca 18/09/2026:
    HTML «must be unique amongst all the IDs in the element's tree»; WHATWG DOM issue #1361). */
 const dentroOriginale=originale===card||originale.contains(card);
 if(colonna&&!colonna.contains(card)){colonna.replaceChildren();if(!dentroOriginale)sposta(colonna,card);}
 else if(!colonna&&!dentroOriginale)sposta(originale,card);
 originale.dataset.memoryMontato='true';canonico.dataset.memoryMontato='true';
 aggiornaMisuraMemoria(card,{runtimeVerificato:false});
}
