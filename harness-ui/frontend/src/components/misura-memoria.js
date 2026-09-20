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
/** ⛔ Il NUMERO senza l'unità serve solo all'eroe della card, dove «GiB» è un `<small>` suo:
    `#machineFreeMemoryMetric` resta la MISURA INTERA («12 GiB»), perché è il nodo che le prove
    già scritte leggono (`tests/parity/misura-memoria-vivo.spec.mjs`, `toHaveText('12 GiB')`). */
const giga=n=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(n/1024**3);
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;}
/*
 * ⛔ LA TENUTA DI UNA MISURA, E PERCHÉ NON SI MOSTRA UNO ZERO.
 *
 * Ricerca del 19/09/2026 (le fonti del brief della corsia 4 — `neurodash`,
 * `llm-serve-dashboard`, `node-red-dashboard-2-system-monitor`, `zmenu`): la telemetria di queste
 * superfici si raccoglie a **1-2 s**, e **la bugia più comune è mostrare zero** quando la misura
 * non c'è o è stantia: uno zero è un'affermazione («non c'è memoria libera») che nessuno ha
 * misurato. ⇒ Qui la misura vecchia **resta a schermo con la sua età** accanto, e non viene mai
 * azzerata: un dato vero con la data non è un dato falso.
 *
 * La soglia dei 60 s è quella indicata dalla stessa ricerca (un minuto è il limite oltre il quale
 * una fotografia dell'hardware non descrive più «adesso»): oltre, il badge dichiara l'età e prende
 * il tono d'avviso. Non si spegne niente — si DICHIARA.
 */
export const TENUTA_MISURA_MS = 60_000;
/** La cadenza del battito che invecchia i badge (1 s, dentro la banda 1-2 s della ricerca). */
export const RITMO_ETA_MS = 1_000;
const SOGLIA_ADESSO_S = 5;
/** «10,7 GiB» → «3 minuti fa». `null` se la data non è leggibile: non si inventa un'età. */
export function etaMisura(measuredAt, adesso = Date.now()) {
 const t = Date.parse(measuredAt);
 if (Number.isNaN(t)) return null;
 const s = Math.max(0, Math.round((adesso - t) / 1000));
 if (s < SOGLIA_ADESSO_S) return 'adesso';
 if (s < 60) return s + ' s fa';
 const m = Math.round(s / 60);
 if (m < 60) return m + (m === 1 ? ' minuto fa' : ' minuti fa');
 const h = Math.round(m / 60);
 if (h < 24) return h + (h === 1 ? ' ora fa' : ' ore fa');
 const g = Math.round(h / 24);
 return g + (g === 1 ? ' giorno fa' : ' giorni fa');
}
/** `fresca` entro la tenuta, `vecchia` oltre, `assente` se non c'è nulla da mostrare. */
export function freschezzaMisura(measuredAt, adesso = Date.now()) {
 const t = Date.parse(measuredAt ?? '');
 if (Number.isNaN(t)) return 'assente';
 return adesso - t < TENUTA_MISURA_MS ? 'fresca' : 'vecchia';
}
/* ⛔ IL BATTITO È UNO SOLO, PER TUTTE LE CARD — e non costa su una card che non si vede.
   La ricerca citata qui sopra dice due cose che tirano in direzioni opposte: la telemetria vuole
   1-2 s, e ciò che si aggiorna da solo non deve costare su una scheda NON VISIBILE. Un `setInterval`
   per card le soddisfa la prima e nega la seconda; uno solo, che scrive soltanto sulle card
   `isConnected` e visibili, le soddisfa entrambe. E quando non resta nessuna card collegata il
   battito si spegne da sé, invece di restare acceso per il resto della sessione: è la differenza
   fra un orologio e una sveglia che nessuno spegne.
   (Il `Set` è di elementi, non di `WeakRef`: una card staccata esce al primo giro, e il giro è di
   un secondo — un riferimento vivo per un secondo non è una perdita.) */
const CARD_VIVE = new Set();
let battito = null;
function aggiornaBadgeEta(card){
 const nodo = card.querySelector('[data-memory-date]');
 if (!nodo || card.dataset.memoryData !== 'misurata') return;
 const età = etaMisura(card.dataset.memoryMisuratoIl);
 if (età === null) return;
 nodo.textContent = 'Misurato ' + new Date(card.dataset.memoryMisuratoIl).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome' }) + ' · ' + età;
}
function accendiBattito(){
 if (battito !== null) return;
 battito = setInterval(() => {
  let visibili = 0;
  for (const card of [...CARD_VIVE]) {
   if (!card.isConnected) { CARD_VIVE.delete(card); continue; }
   if (card.offsetParent === null) continue;
   visibili += 1; aggiornaBadgeEta(card);
  }
  if (visibili === 0 && CARD_VIVE.size === 0) { clearInterval(battito); battito = null; }
 }, RITMO_ETA_MS);
}
const CAMPI=[
 ['totale','RAM totale','machineMemoryMetric'],
 ['libera','RAM libera','machineFreeMemoryMetric'],
 ['discoDisponibile','Disponibile sul disco','machineStorageMetric'],
 ['discoRiserva','Riserva sul disco',null],
 ['discoAllocabile','Allocabile sul disco','machineAllocatableMetric'],
];
/* ⛔ L'EROE DELLA CARD, e da dove viene il suo numero.
   Il mockup (`prototypes/calm-lab/src/model-lab.mjs`, scheda `system`) apre la prima card con un
   valore grande in monospaziato — «18,6 GiB» — e sotto una barra. Là quel numero è il budget di
   uno SCENARIO; qui la stessa posizione porta il fatto vero che una persona cerca per primo su
   questa card — **quanta RAM è libera adesso** — mentre il resto della misura resta in tabella.
   ⛔ La RAM libera NON si ripete anche in tabella: sarebbe lo stesso fatto scritto due volte a
   venti pixel di distanza, cioè il difetto che il mockup stesso evita. */
const EROE='libera';
export function creaMisuraMemoria(dati={}){
 /* ⛔ L'ORDINE DEI NODI È QUELLO DEL MOCKUP, I NOMI DELLE CLASSI ANCHE, e i ganci `data-*` sono
    quelli che il monolite e le prove già scritte cercano per nome. La card del mockup si chiama
    `.system-card` (misure: `padding:22px · border:1px solid var(--line) · border-radius:12px ·
    fondo var(--panel)`, lette dal suo CSS il 19/09/2026). */
 const card=el('section','talos-card talos-card--pad system-card');
 card.dataset.c='MemoryMeter';card.dataset.memoryMeter='';card.dataset.sistemaCard='memoria';
 const head=el('div','section-heading talos-cluster');head.append(el('h3','talos-lab__heading','Memoria e spazio sul disco'));
 const date=el('span','talos-badge talos-badge--sm');date.dataset.memoryDate='';date.dataset.c='Badge';head.append(date);card.append(head);
 const errore=el('p','talos-muted');errore.dataset.memoryError='';errore.setAttribute('role','alert');errore.hidden=true;card.append(errore);
 /* L'eroe: la MISURA INTERA resta su `[data-memory-value=libera]` — il gancio che le prove già
    scritte leggono per nome (`lab-montaggio-neutro.spec.mjs`, MONTAGGIO-04: `letto.libera` deve
    valere `"10,5 GiB"`, unità compresa) — mentre dentro stanno il numero e l'unità tenuti
    separati, perché l'unità è piccola come nel mockup (`<small>`). Cioè: il contenitore legge
    «10,5 GiB», e il numero è il suo primo figlio.
    ⛔ È stata la prima versione a sbagliare qui: il numero portava il gancio e il contenitore no,
    e `letto.libera` leggeva «10,5» dove ne aspettava `"10,5 GiB"` — misurato, la prova rossa. */
 const eroe=el('p','system-value');
 const valoreEroe=el('span','',null);valoreEroe.dataset.memoryValue=EROE;
 const numeroEroe=el('span','',null);numeroEroe.dataset.memoryHero='';
 const unita=el('small','',null);unita.dataset.memoryUnit='';
 /* ⛔ LO SPAZIO È DELL'UNITÀ, non un nodo a sé: quando la misura non c'è l'unità si svuota E lo
    spazio se ne va con lei, altrimenti `#machineFreeMemoryMetric` leggerebbe «Non misurata »
    con un finale che non si vede — e un testo che finisce con uno spazio è un testo che due
    misure diverse descrivono in due modi diversi. (Trovato dalla prova SIS-03 il 19/09/2026,
    che leggeva `"Non misurata "` dove ne aspettava una senza.) */
 valoreEroe.append(numeroEroe,unita);eroe.append(valoreEroe);card.append(eroe);
 const meter=el('meter','talos-lab__meter budget-track large-track');meter.id='memoriaModello';meter.min=0;meter.max=100;meter.low=75;meter.high=90;meter.optimum=0;meter.dataset.memoryBar='';card.append(meter);
 const label=el('p','talos-muted');label.dataset.memoryLabel='';card.append(label);
 /* I fatti veri in tabella, con la forma di `.model-facts` del mockup (`dl > div > dt/dd`: è la
    forma che la specifica HTML ammette per una lista di definizioni dentro un `dl`). */
 const fatti=el('dl','model-facts');
 for(const [key,title] of CAMPI){
  if(key===EROE)continue;
  if(key==='discoDisponibile')fatti.append(el('hr','talos-lab__rule'));
  const row=el('div','talos-kv');const value=el('dd','talos-kv__v');value.dataset.memoryValue=key;
  row.append(el('dt','talos-kv__k',title),value);fatti.append(row);
 }
 card.append(fatti);
 const tenuta=el('p','talos-muted talos-lab__space');tenuta.dataset.memoryTenuta='';card.append(tenuta);
 const actions=el('div','talos-cluster talos-lab__space');for(const [key,title] of [['refresh','Rimisura'],['unload','Libera memoria del modello']]){const b=el('button','talos-button talos-button--secondary talos-button--sm',title);b.type='button';b.dataset.c='Button';b.dataset.memoryAction=key;if(key==='unload')b.dataset.action='runtimeLibera';else b.dataset.demo='Misure di esempio: nella app vengono lette dal server';actions.append(b);}card.append(actions);
 const detail=el('p','talos-muted talos-lab__space');detail.dataset.memoryDetail='';card.append(detail);
 /* L'avviso in fondo è quello del mockup (`.inline-notice`), con la NOSTRA frase: dice cosa TALOS
    libera davvero e cosa non tocca. Il mockup al suo posto ha una nota di scenario. */
 card.append(el('p','talos-muted inline-notice','GiB = 1.024³ byte. La memoria del singolo modello non è misurata. Liberare il modello di TALOS conserva il file sul disco.'));
 aggiornaMisuraMemoria(card,dati);return card;
}
export function aggiornaMisuraMemoria(card,stato={}) {
 if(!card)return;const {capacita=null,runtimes=[],caricamento=false,errore='',erroreRuntime='',caricamentoRuntime=false,runtimeVerificato=true,scaricamento=false}=stato;
 /* ⭐ 19/09/2026 — L'ULTIMO STATO RESTA SULLA CARD, e serve a una cosa sola: quando
    `montaMisuraMemoria` ricostruisce la card (il vestito del mockup) la nuova nasce VUOTA, e
    senza questa riga la misura VERA che era a schermo sparirebbe per il tempo che il server
    impiega a rimisurare — cioè un pannello che si svuota da solo mentre lo guardi.
    ⛔ Non è una copia del valore per tenerlo «a memoria»: è lo stato con cui la card è stata
    disegnata l'ultima volta, e si riapplica una volta sola, subito dopo la sostituzione. */
 card.__talosMemoria=stato;const set=(selector,value)=>{const n=card.querySelector(selector);if(n)n.textContent=value;};
 let d=null;if(capacita&&!errore)d=datiMemoria(capacita,runtimes,{erroreRuntime});
 /* ⛔ 18/09/2026 — ogni nodo può mancare: `querySelector` torna `null` e una dereferenza nuda
    esplode. La card del mockup ha tutti gli agganci, ma una card degradata (o un'altra forma)
    non deve far cadere l'aggiornamento: si aggiorna ciò che c'è, si salta ciò che non c'è. */
 const alert=card.querySelector('[data-memory-error]');if(alert){alert.hidden=!errore;alert.textContent=errore;}
 /* ⛔ IL BADGE DICE LA VERITÀ SUL DATO, ed è questa la parte che il mockup lascia scoperta: là
    dichiara la NATURA del dato («Fixture» = finto, «Pronto · demo» = simulato) perché i suoi dati
    sono finti. Qui i dati sono veri, quindi la stessa posizione dichiara le due cose che di un
    dato vero si possono dire: **quando è stato misurato** e **quanto è vecchio**. */
 card.dataset.memoryData=errore?'errore':d?'misurata':'assente';
 if(d)card.dataset.memoryMisuratoIl=capacita.measuredAt;else delete card.dataset.memoryMisuratoIl;
 const freschezza=d?freschezzaMisura(capacita.measuredAt):'assente';
 card.dataset.memoryFreschezza=freschezza;
 const badge=card.querySelector('[data-memory-date]');
 if(badge){
  const età=d?etaMisura(capacita.measuredAt):null;
  badge.textContent=caricamento?'Misurazione…':errore?'Misura non disponibile':caricamentoRuntime&&!capacita?'Misurazione…':d?'Misurato '+new Date(capacita.measuredAt).toLocaleTimeString('it-IT',{timeZone:'Europe/Rome'})+(età?' · '+età:''):'Non ancora misurata';
  badge.className='talos-badge talos-badge--sm'+(errore?' talos-badge--danger':freschezza==='assente'?'':freschezza==='vecchia'?' talos-badge--warning':' talos-badge--success');
 }
 /* L'eroe porta il NUMERO, l'unità sta nel suo `<small>`: insieme il contenitore legge «12 GiB»,
    che è il testo che le prove già scritte pretendono da `#machineFreeMemoryMetric`. Quando la
    misura non c'è, l'unità si SVUOTA (non basta nasconderla: `textContent` la conterebbe lo
    stesso) e il contenitore legge esattamente «Non misurata». */
 set('[data-memory-hero]',d?giga(d[EROE]):'Non misurata');
 set('[data-memory-unit]',d?' GiB':'');
 for(const [key]of CAMPI){if(key===EROE)continue;set('[data-memory-value='+key+']',d?byte(d[key]):'Non misurata');}
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
 /* Il battito si accende solo quando c'è un'età da far scorrere: su una card senza misura non c'è
    niente che invecchi, e un orologio acceso per un badge che non cambia è costo puro. */
 if(d){CARD_VIVE.add(card);accendiBattito();}else CARD_VIVE.delete(card);
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
/*
 * ============================================================================
 * ⭐ 19/09/2026, CORSIA 4 — LA SECONDA CARD: «RUNTIME LOCALE»
 * ============================================================================
 * Il mockup ha DUE card in questa scheda: «Memoria di esempio» e «Runtime locale». La prima è
 * costruita qui sopra; la seconda nel prodotto **esiste già** ed è `#modelLabRuntimeGate`, che sta
 * in `frammenti.html` — un file che non è di questa corsia.
 *
 * ⛔ PERCHÉ QUI SI VESTE E NON SI RICOSTRUISCE. La card del runtime ha dentro i suoi nodi veri
 *   (`#modelLabRuntimeStatus`, `#modelLabRuntimeList`, i due `<select>`, i tre pulsanti, il
 *   prompt, lo stream) e i suoi ascoltatori, legati dal monolite e da `runtime-modelli.js`. Il
 *   §14 della memoria lo dice con le parole di tre crolli del 18/09: un travaso non è un
 *   trapianto, e chi riceve i nodi deve saperlo. ⇒ Qui non si sposta niente e non si rinomina
 *   niente: si aggiunge la CLASSE della card (`system-card`) e si mette l'intestazione nella
 *   forma del mockup, **spostando due nodi dentro un contenitore nuovo** — il titolo e il badge
 *   di stato, che restano gli stessi elementi.
 *
 * ⛔ E IL BADGE DI STATO È GIÀ QUELLO DEL MOCKUP. `runtime-modelli.js:73` trasforma
 *   `#modelLabRuntimeStatus` in un `.talos-badge` a ogni disegno: nel mockup la seconda card ha
 *   esattamente questo — un titolo e una pastiglia nella stessa riga (`.section-heading`). Non
 *   serve un badge nuovo, e un badge nuovo sarebbe un secondo posto che dice la stessa cosa.
 *
 * ⛔ IL DUBBIO DELLE DUE FRASI, MISURATO IL 19/09/2026 (e non è una contraddizione):
 *   · `#modelLabRuntimeBadge` dice «1 runtime disponibile» — `cornice-model-lab.js:5-7` conta i
 *     runtime `state === 'observed'` **con almeno un modello** (`llama.cpp`, che ha
 *     `unsloth/GLM-4.7-Flash-GGUF`);
 *   · `#modelLabRuntimeStatus` dice «Nessun runtime raggiunto» — `app.js:3558` conta i runtime
 *     osservati che hanno **RISPOSTO** (`state === 'observed' && (runtimeId !== 'llama.cpp' ||
 *     runtimeState === 'ready')`).
 *   Sul carico vero del 19/09 (`GET /api/v1/runtime`, server isolato): ollama `unknown`,
 *   lmstudio `unknown`, llama.cpp `observed` + `runtimeState: 'unavailable'` + 1 modello.
 *   ⇒ «disponibile» = c'è il motore E c'è un modello sul disco; «raggiunto» = il servizio ha
 *   risposto. **Tutt'e due vere, di due cose diverse**, e llama.cpp è il caso che le separa:
 *   disponibile e non avviato. Nessuna delle due legge il campo sbagliato — quella che inganna
 *   è la PAROLA, non il campo, ed è la ragione per cui questa card scrive lo stato in chiaro
 *   sotto il titolo invece di lasciare due verdetti che sembrano opposti a 400 px di distanza.
 */
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
 /*
  * ⭐ 19/09/2026 — LA CARD SI PORTA ALLA FORMA DEL MOCKUP, e il modo è quello che il monolite
  * già usa: `creaMisuraMemoria` è il costruttore di questa card (lo era da sempre e non lo
  * chiamava nessuno). Ricostruirla costa un nodo nuovo per ogni aggancio; NON ricostruirla
  * significherebbe che il vestito arriva solo se qualcuno riscrive a mano il blocco statico in
  * `index.template.html`, cioè un file che non è di questa corsia.
  * ⛔ E i due BOTTONI non si ricreano: si SPOSTANO. Sono i nodi che il monolite ascolta
  *   (`#memoriaRimisura`, `#memoriaScarica`) e un bottone clonato è un bottone che non fa niente.
  */
 const vestita=card.dataset.sistemaCard==='memoria';
 /* ⛔ Lo stato precedente si prende ADESSO, prima di toccare l'albero: `replaceWith` stacca il
    vecchio nodo e da lì in poi non lo si legge più. Vedi la nota su `__talosMemoria` sopra. */
 const statoPrecedente=card.__talosMemoria||null;
 if(!vestita){
  const nuova=creaMisuraMemoria();
  for(const [key,id]of [['refresh','memoriaRimisura'],['unload','memoriaScarica']]){
   const vecchio=primo([colonna,originale,canonico],'#'+id);
   const slot=nuova.querySelector('[data-memory-action='+key+']');
   if(!vecchio||!slot)continue;
   vecchio.className=slot.className;vecchio.dataset.c='Button';vecchio.dataset.memoryAction=key;vecchio.textContent=slot.textContent;
   slot.replaceWith(vecchio);
  }
  /* ⛔ SI SOSTITUISCE IL CONTENUTO, NON IL NODO — e non è un dettaglio: la card è un elemento
     che qualcun altro può tenere in mano (il banco di `lab-montaggio-neutro.spec.mjs` la clona e
     poi la interroga, `MONTAGGIO-03`/`04`). Con `card.replaceWith(nuova)` il nodo vecchio esce
     dall'albero e chi lo teneva si ritrova un guscio vuoto: i due bottoni erano stati SPOSTATI
     dentro il nodo nuovo, e la prova leggeva «il bottone che il monolite ascolta non c'è».
     `replaceChildren` sui figli nuovi li SPOSTA (non li clona) e lascia in piedi l'elemento: la
     card resta LA STESSA card, con dentro il vestito del mockup. */
  card.replaceChildren(...nuova.childNodes);
  card.className=nuova.className;
  for(const [chiave,valore] of Object.entries(nuova.dataset))card.dataset[chiave]=valore;
 } else {
  // Una card già nella forma nuova (o una card degradata costruita da altri): i due bottoni
  // entrano comunque nelle loro sedi, se stanno altrove.
  for(const [key,id]of [['refresh','memoriaRimisura'],['unload','memoriaScarica']]){
   const vecchio=primo([colonna,originale,canonico],'#'+id);
   const slot=card.querySelector('[data-memory-action='+key+']');
   if(!vecchio||!slot)continue;
   vecchio.className=slot.className;vecchio.dataset.c='Button';vecchio.dataset.memoryAction=key;vecchio.textContent=slot.textContent;
   slot.replaceWith(vecchio);
  }
 }
 // gli id che il monolite cerca tornano sui campi della card — ognuno solo se quel campo c'è
 for(const [key,,id]of CAMPI)if(id){const n=card.querySelector('[data-memory-value='+key+']');if(n)n.id=id;}
 for(const [selettore,id]of [['[data-memory-label]','memoriaBarraEtichetta'],['[data-memory-tenuta]','memoriaTenuta'],['[data-memory-detail]','machineCapacityDetail']]){const n=card.querySelector(selettore);if(n)n.id=id;}
 /* Destinazione: la colonna legacy se esiste; altrimenti la card resta dov'è.
    ⛔ Un id doppio non è un difetto estetico: la specifica HTML vuole l'id UNICO nell'albero, e
    `getElementById`/`querySelector('#x')` tornano il PRIMO in ordine d'albero — se restasse il
    gemello legacy, il monolite legherebbe il nodo SBAGLIATO, in silenzio (ricerca 18/09/2026:
    HTML «must be unique amongst all the IDs in the element's tree»; WHATWG DOM issue #1361).
    ⛔ E la colonna si VUOTA, non solo si completa: dentro ci stanno i quattro `<strong>` legacy
    con `machineMemoryMetric` e compagni, e lasciarli lì mentre la card riceve gli stessi id
    significherebbe DUE nodi per id — il difetto che questa riga evita da sempre, misurato il
    19/09/2026 come «1 copia per id, dentro la card». */
 const dentroOriginale=originale===card||originale.contains(card);
 if(colonna&&!colonna.contains(card)){colonna.replaceChildren();if(!dentroOriginale)sposta(colonna,card);}
 else if(!colonna&&!dentroOriginale)sposta(originale,card);
 vesteCardRuntime(originale);
 originale.dataset.memoryMontato='true';canonico.dataset.memoryMontato='true';
 /* ⛔ Se una misura c'era già, si RIMETTE — invece di lasciare la card vuota fino al prossimo
    giro del server. Il ripiego `{runtimeVerificato:false}` è quella di sempre: appena montata,
    nessuno ha ancora verificato il modello, e dirlo è meglio che dichiararlo assente. */
 aggiornaMisuraMemoria(card,statoPrecedente||{runtimeVerificato:false});
}
/** La seconda card del mockup, sul contenuto vero. Vedi il blocco qui sopra per il perché. */
export function vesteCardRuntime(originale){
 const gate=primo([originale],'#modelLabRuntimeGate');
 if(!gate||gate.dataset.sistemaCard==='runtime')return;
 gate.classList.add('system-card');
 const titolo=gate.querySelector('h4'),stato=gate.querySelector('#modelLabRuntimeStatus');
 if(titolo&&stato&&!gate.querySelector('.section-heading')){
  /* ⛔ `insertBefore` e non `titolo.before(head)` + `append`: sono gli STESSI due nodi che si
     spostano, e il contenitore entra dove stava il titolo. Se il contenitore esiste già (un
     secondo giro, o un'altra forma della card) non si tocca niente — è la trappola del 18/09
     (`insertBefore` con un nodo che non è più figlio di quel genitore). */
  const head=document.createElement('div');head.className='section-heading';
  titolo.parentElement.insertBefore(head,titolo);
  head.append(titolo,stato);
 }
 // Il posto delle due card una accanto all'altra (`.system-grid` nel mockup). Non si sposta
 // nessun nodo: si timbra il contenitore che le tiene già, e le misure le dà il foglio.
 const layout=primo([originale],'.model-lab-layout');
 if(layout)layout.dataset.sistemaSchede='v1';
 gate.dataset.sistemaCard='runtime';
}
