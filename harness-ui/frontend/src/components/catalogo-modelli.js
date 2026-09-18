// 05/9 Fase 2: ListRow e DetailPanel del catalogo API, dati osservati OpenRouter.
/*
 * ⛔ 18/09/2026, corsia 1 — il catalogo passa dal MOTORE NUOVO (`domain/catalog-engine.ts`, port
 * verbatim di `prototypes/calm-lab/src/catalog-engine.mjs`) e la barra a faccette
 * (`components/catalogo-faccette.js`) si aggancia qui, dentro il pannello che esiste già.
 *
 * Le tre funzioni storiche — `normalizzaCatalogoModelli`, `prezzoPerMilione`, `filtraModelli` —
 * restano INTATTE: sono il contratto verso `app.js`, il laboratorio e i test di parità. Il motore
 * si innesta SOPRA di loro, non al posto loro: la ricerca continua a fare quello che faceva
 * (`filtraModelli` cerca in `nome`, `id` e `provider`; il motore cerca in `name`, `family`,
 * `author`, `provider`, `repo`, `file` — e NON nell'id: sostituirla avrebbe smesso di trovare
 * `modello-130` per id, cioè una regressione di prodotto).
 *
 * ⛔ RICERCA — la forma dei conteggi e delle faccette ha la sua fonte, letta il 18/09/2026:
 * OR dentro una faccetta e AND fra faccette; il conteggio di un valore si calcola SENZA il filtro
 * della sua stessa faccetta (`facetCount` fa esattamente questo); i valori a zero restano a
 * schermo ma non cliccabili. Fonti: multigrid.ai · meilisearch · Nosto · Voyado Elevate · AWS
 * QuickSight (`NullOption`) · Algolia. ⛔ Conseguenza MISURABILE su questo file: per i fornitori
 * il numero si calcola su una lista SENZA il filtro del fornitore (che vive in `state.modelLab`,
 * non nei filtri) e poi si riscrive nelle voci del select; per le altre faccette `facetCount`
 * riceve i filtri INTERI, fornitore compreso, altrimenti conterebbe modelli che poi non si vedono.
 */
import{FACET_OPTIONS,emptyCatalogFilters,selectCatalog}from'../domain/catalog-engine.ts';
import{aggiornaBarraFaccette,capacitaDelCatalogo,conteggiPerFornitore,creaBarraFaccette}from'./catalogo-faccette.js';
const oggetto=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function normalizzaCatalogoModelli(d){
 if(!oggetto(d)||!Array.isArray(d.modelli)||typeof d.daCache!=='boolean'||typeof d.aggiornatoAlle!=='string'||Number.isNaN(Date.parse(d.aggiornatoAlle))||!d.modelli.every(m=>oggetto(m)&&typeof m.id==='string'&&m.id&&typeof m.nome==='string'&&typeof m.provider==='string'&&['inputModalities','outputModalities','supportedParameters'].every(k=>Array.isArray(m[k])&&m[k].every(v=>typeof v==='string'))))throw Error('La risposta del catalogo non è valida.');
 return d;
}
export function prezzoPerMilione(value){
 if(value==null||typeof value==='boolean'||typeof value==='object'||String(value).trim()==='')return 'Non dichiarato';
 const n=Number(value);return Number.isFinite(n)&&n>=0?new Intl.NumberFormat('it-IT',{maximumFractionDigits:6}).format(n*1000000)+' USD':'Non dichiarato';
}
export function filtraModelli(modelli,query='',provider='all'){const q=String(query).trim().toLocaleLowerCase('it');return modelli.filter(m=>(provider==='all'||m.provider===provider)&&(!q||[m.nome,m.id,m.provider].some(v=>String(v||'').toLocaleLowerCase('it').includes(q))));}
const PAROLE={text:'Testo',image:'Immagini',audio:'Audio',video:'Video',file:'File',tools:'Attrezzi',tool_choice:'Scelta attrezzi',temperature:'Creatività',top_p:'Varietà',max_tokens:'Limite risposta',response_format:'Formato risposta',reasoning:'Ragionamento',include_reasoning:'Mostra ragionamento'};
const elenco=v=>v?.length?v.map(x=>PAROLE[x]||x).join(', '):'Non dichiarato';
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=String(txt);return n;}
function kv(k,v,id){const row=el('div','talos-kv'),val=el('span','talos-kv__v',v);if(id)val.id=id;row.append(el('span','talos-kv__k',k),val);return row;}
function contesto(n){return Number.isFinite(n)&&n>0?new Intl.NumberFormat('it-IT').format(n)+' token':'Non dichiarato';}

/* ─────── l'anello che mancava: dal record OSSERVATO al modello del motore ─────── */
/*
 * ⛔ OGNI CAMPO HA LA SUA SORGENTE, e i campi senza sorgente restano `null`: non si riempiono con
 * una fixture, né con un surrogato, né con un valore «ragionevole» (regola del 18/09: ciò che non
 * si collega si elenca e si riporta). Le sorgenti, campo per campo:
 *  · `context`     ← `contextLength` — numero finito e > 0; 0 o assente = NON dichiarato (la
 *                    stessa soglia che usa `contesto()` due righe sopra, o la scheda e la
 *                    faccetta direbbero due cose diverse dello stesso modello)
 *  · `priceInput`  ← `prezzoPrompt`     × 1000000 — da USD per token a USD per milione, che è
 *  · `priceOutput` ← `prezzoCompletion` × 1000000   l'unità della faccetta «Costo dichiarato»
 *  · `provider`    ← `provider` · `name` ← `nome` · `id` ← `id`
 *  · `destination` ← 'cloud': questa risposta È il catalogo OpenRouter. `local` è la destinazione
 *                    del catalogo del dispositivo, che ha già le sue faccette
 *  · `capabilities`← le cinque parole del motore, col campo che le dichiara (vedi sotto)
 *  · tutto il resto — `family` (stringa vuota, come nel prototipo), `author`, `repo`, `file`,
 *    `tasks`, `languages`, `license`, `access`, `parametersB`, `architecture`, `updatedAt`,
 *    `installed`, `quantization`, `format`, `size` — NON ha una sorgente in questa risposta:
 *    resta `null`, e la faccetta che lo usa non si offre invece di mentire.
 * ⛔ `prezzoPrompt: -1` significa «il fornitore non lo dichiara» (5 record su 445 nel catalogo
 * osservato): diventa `null`, che nella faccetta è «non noto» e non «gratis».
 */
function numeroOsservato(v){
 if(v==null||typeof v==='boolean'||typeof v==='object'||String(v).trim()==='')return null;
 const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;
}
/* ⛔ Il prezzo si arrotonda alla STESSA risoluzione con cui lo si scrive a schermo — sei decimali,
   come `prezzoPerMilione`. Senza l'arrotondamento `0.0000008 × 1000000` fa `0.7999999999999999`,
   e un tetto digitato «0,8» escluderebbe il modello che a schermo vale esattamente 0,8: il numero
   che si legge e quello che si confronta devono essere lo stesso numero. */
const inMilioniDiToken = (n) => (n === null ? null : Number((n * 1000000).toFixed(6)));
/*
 * ⛔ LE CINQUE CAPACITÀ DEL MOTORE, ciascuna col CAMPO che la dichiara. Il motore ne accetta solo
 * cinque — `FACET_OPTIONS.capabilities` è la lista ammessa da `validateCatalogFilters`, che
 * SCARTA in silenzio qualunque altro valore: offrire `temperature` o `top_p` come faccetta
 * produrrebbe una spunta che non filtra niente, cioè la peggior specie di controllo.
 *  · tools     ← `supportedParameters` contiene `tools` (function calling)
 *  · vision    ← `inputModalities` contiene `image` (è il campo che la scheda mostra in «Ingresso»)
 *  · reasoning ← `supportedParameters` contiene `reasoning`
 *  · json      ← `supportedParameters` contiene `response_format`
 *  · audio     ← `inputModalities` o `outputModalities` contengono `audio`
 * ⛔ `json` è l'unico con un legame INTERPRETATO (il campo si chiama `response_format`, la parola
 * del motore è `json`): sta qui e nel referto, dichiarato, non nascosto nel codice.
 */
const CAPACITA_OSSERVATE=[['tools','supportedParameters','tools'],['vision','inputModalities','image'],['reasoning','supportedParameters','reasoning'],['json','supportedParameters','response_format'],['audio','modalities','audio']];
export function capacitaOsservate(m){
 const dove={supportedParameters:new Set(m.supportedParameters||[]),inputModalities:new Set(m.inputModalities||[]),modalities:new Set([...(m.inputModalities||[]),...(m.outputModalities||[])])};
 return CAPACITA_OSSERVATE.filter(([,campo,valore])=>dove[campo].has(valore)).map(([id])=>id);
}
export function modelloCatalogo(m){
 const c=numeroOsservato(m.contextLength);
 return{id:m.id,name:m.nome,provider:m.provider,family:'',author:null,repo:null,file:null,destination:'cloud',
  context:c&&c>0?c:null,
  priceInput:inMilioniDiToken(numeroOsservato(m.prezzoPrompt)),
  priceOutput:inMilioniDiToken(numeroOsservato(m.prezzoCompletion)),
  capabilities:capacitaOsservate(m),tasks:[],languages:[],license:null,access:null,parametersB:null,architecture:null,updatedAt:null,installed:false,quantization:null,format:null};
}
/* L'etichetta a schermo di un valore di faccetta: una sola fonte, `FACET_OPTIONS`, più il
   vocabolario delle modalità che la scheda già usa. Mai il valore grezzo del fornitore. */
const etichettaFaccetta=(chiave,valore)=>FACET_OPTIONS[chiave]?.find(([v])=>v===valore)?.[1]||PAROLE[valore]||valore;

export function creaRigaCatalogo(m,{selezionato=false,seleziona}={}){
 const b=el('button','talos-list-row');b.type='button';b.dataset.c='ListRow';b.dataset.catalog=m.id;b.dataset.provider=m.provider;b.setAttribute('aria-pressed',String(selezionato));
 const icon=el('span','talos-list-row__icon');icon.innerHTML='<svg class="i" aria-hidden="true"><use href="#i-globe"></use></svg>';
 const text=el('span','talos-list-row__text');text.append(el('span','talos-list-row__title',m.nome),el('span','talos-list-row__sub',m.provider+' · '+contesto(m.contextLength)));
 b.append(icon,text);b.addEventListener('click',()=>seleziona?.(m));return b;
}
export function aggiornaDettaglioCatalogo(mount,m,{fornitori}={}){
 mount.replaceChildren();if(!m){mount.append(el('p','talos-muted','Seleziona un modello per vedere capacità, contesto e prezzi.'));return;}
 const nome=el('h3','',m.nome);nome.id='catalogoNome';const id=el('code','talos-mono',m.id);id.id='catalogoId';const desc=el('p','talos-detail__desc',m.description||'Il fornitore non ha fornito una descrizione.');desc.id='catalogoDescrizione';
 mount.append(nome,id,desc,kv('Fornitore',m.provider,'catalogoProvider'),kv('Ingresso',elenco(m.inputModalities),'catalogoIngresso'),kv('Risposta',elenco(m.outputModalities),'catalogoUscita'),kv('Parametri supportati',elenco(m.supportedParameters),'catalogoParametri'),kv('Contesto',contesto(m.contextLength),'catalogoContesto'));
 const alias=el('p','talos-muted','Alias: può cambiare versione nel tempo.');alias.id='catalogoAlias';alias.hidden=!m.alias;mount.append(alias,el('hr','talos-lab__rule'),el('h3','','Costo per milione di token'),kv('In ingresso',prezzoPerMilione(m.prezzoPrompt),'catalogoPrezzoInput'),kv('In uscita',prezzoPerMilione(m.prezzoCompletion),'catalogoPrezzoOutput'),el('p','talos-muted','Prezzi dichiarati da OpenRouter. Non sono una stima del costo della sessione.'));
 const raw=el('details','talos-lab__space');raw.append(el('summary','','Valori originali per token (USD)'));raw.append(kv('Ingresso',m.prezzoPrompt??'Non dichiarato','catalogoPrezzoInputRaw'),kv('Uscita',m.prezzoCompletion??'Non dichiarato','catalogoPrezzoOutputRaw'));mount.append(raw);
 const stato=el('p','talos-muted','L’elenco dei modelli non verifica le credenziali del tuo account.');stato.id='catalogoStato';mount.append(stato);
 const use=el('button','talos-button talos-button--primary talos-button--block','Usa nella sessione');use.id='catalogoAzione';use.type='button';use.dataset.richiede='fase3';use.hidden=true;mount.append(use);
 const access=el('button','talos-button talos-button--ghost talos-button--sm','Fornitori e accessi');access.type='button';access.dataset.c='Button';access.dataset.apreVelo='veloFornitori';access.addEventListener('click',event=>{if(fornitori){event.stopPropagation();fornitori();}});mount.append(access);
}
/*
 * La barra si costruisce UNA volta per pannello e si aggiorna in place: rifarla a ogni tasto
 * premuto nella ricerca porterebbe via il fuoco dalla casella appena toccata.
 * ⛔ `onCambia` è l'unico punto in cui un clic della barra torna indietro: i filtri delle faccette
 * NON stanno in `state.modelLab` (che non è mio), stanno sul pannello (`__catalogoFiltri`), e da lì
 * si ri-renderizza con gli ULTIMI dati e opzioni ricevuti. Il fornitore fa eccezione: lui vive nel
 * select vero della app, quindi togliere il chip del fornitore riscrive il select e gli manda un
 * `change`, che è la porta da cui `app.js` tiene allineato `state.modelLab.provider` — un chip che
 * rimuove un filtro senza rimuoverlo sarebbe un controllo che mente.
 */
function barraDelPannello(panel){
 const esistente=panel.querySelector('#modelLabFacets');
 if(esistente&&esistente.aggiorna)return esistente;
 const barra=creaBarraFaccette({etichetta:etichettaFaccetta,onCambia:(nuovi)=>{
  panel.__catalogoFiltri={...nuovi,providers:[]};
  const sel=panel.querySelector('#modelLabProviderFilter'),voluto=(nuovi.providers||[])[0]||'all';
  if(sel&&sel.value!==voluto){sel.value=voluto;sel.dispatchEvent(new Event('change',{bubbles:true}));}
  const ultimo=panel.__catalogoUltimo;
  /* ⛔ 18/09/2026 — il fornitore si rilegge DAL SELECT, non dall'istantanea di `ultimo.opzioni`.
     Togliendo il chip «Provider: X» la riga qui sopra riscrive il select e gli manda un `change`:
     `app.js` lo ascolta, aggiorna il suo stato e ri-renderizza — con l'ultima istantanea, che però
     porta ancora `provider: 'X'`. Senza questa rilettura l'ultimo disegno rimetteva in lista i
     modelli di X mentre il select diceva «Tutti i fornitori»: il filtro tolto a schermo e restato
     nei fatti — la stessa specie di difetto del chip che non toglie niente, vista dall'altro lato.
     Il select è la sola fonte del fornitore perché è lì che lo legge `app.js`. */
  if(ultimo){const provider=sel&&sel.value?sel.value:'all';aggiornaCatalogoModelli(panel,ultimo.dati,{...(ultimo.opzioni||{}),provider});}
 }});
 /* Subito dopo la riga degli strumenti già esistente (`.talos-toolbar` nel pannello canonico,
    `.model-lab-filters` in quello legacy): la barra è un secondo piano di comando, non una
    testata. Se nessuno dei due c'è, in testa al pannello invece di sparire. */
 const dove=panel.querySelector('.talos-toolbar, .model-lab-filters');
 if(dove)dove.after(barra);else panel.prepend(barra);
 return barra;
}
/* I conteggi dei fornitori nelle VOCI del select vero. Il numero è quello del filtro senza la
   propria faccetta (cioè: con la ricerca e le altre faccette applicate), come vuole un conteggio
   di faccetta. ⛔ L'etichetta originale si tiene da parte la prima volta: riscriverla due volte
   produrrebbe «aion-labs (3) (2)». */
function scriviConteggiFornitori(panel,conteggi,totale){
 for(const o of panel.querySelectorAll('#modelLabProviderFilter option')){
  o.dataset.etichetta??=o.textContent;
  const n=o.value==='all'?totale:conteggi.get(o.value);
  o.textContent=n===undefined?o.dataset.etichetta:o.dataset.etichetta+' ('+new Intl.NumberFormat('it-IT').format(n)+')';
 }
}
export function aggiornaCatalogoModelli(panel,dati,opzioni={}){
 const{query='',provider='all',selezionato=null,limite=120,caricamento=false,errore='',seleziona,altri,fornitori}=opzioni;
 const list=panel.querySelector('[data-catalog-list]'),detail=panel.querySelector('[data-catalog-detail]'),count=panel.querySelector('[data-catalog-count]'),more=panel.querySelector('[data-catalog-more]'),vuoto=panel.querySelector('#vuotoCatalogo'),refresh=panel.querySelector('[data-catalog-refresh]');if(!list||!detail)return null;
 const attivo=document.activeElement,focusId=list.contains(attivo)?attivo.dataset.catalog:null,scroll=list.scrollTop;
 /* ⛔ La lista del motore è il catalogo con la RICERCA applicata e il FORNITORE no: il fornitore
    entra nei filtri (`providers`) e lo applica il motore, così i suoi conteggi possono escluderlo
    mentre tutti gli altri lo includono. Con nessuna faccetta accesa il risultato è identico a
    `filtraModelli(tutti,query,provider)`. */
 const tutti=dati?normalizzaCatalogoModelli(dati).modelli:[];
 const riferimenti=new Map(),adattati=tutti.map(m=>{const a=modelloCatalogo(m);riferimenti.set(a,m);return a;});
 const ammessi=new Set(filtraModelli(tutti,query,'all'));
 const base=adattati.filter(m=>ammessi.has(riferimenti.get(m)));
 const barra=dati?barraDelPannello(panel):null;
 const filtri={...(panel.__catalogoFiltri||emptyCatalogFilters()),providers:provider==='all'?[]:[provider]};
 const visibili=dati?selectCatalog(base,filtri).map(m=>riferimenti.get(m)).filter(Boolean):[];
 const selected=visibili.find(m=>m.id===selezionato?.id)||visibili[0]||null;
 list.replaceChildren();if(vuoto)vuoto.hidden=true;more.hidden=true;refresh.disabled=caricamento;panel.setAttribute('aria-busy',String(caricamento));
 if(errore){const p=el('p','talos-card talos-card--pad',errore);p.setAttribute('role','alert');list.append(p);count.textContent='Catalogo non disponibile';aggiornaDettaglioCatalogo(detail,null);return null;}
 panel.__catalogoUltimo={dati,opzioni};
 if(barra){
  aggiornaBarraFaccette(barra,{modelli:base,contesto:{},capacita:capacitaDelCatalogo(adattati),filtri});
  scriviConteggiFornitori(panel,conteggiPerFornitore(base,filtri),tutti.length);
 }
 count.textContent=caricamento?'Aggiornamento del catalogo…':dati?visibili.length+' di '+dati.modelli.length+' modelli · OpenRouter · '+(dati.daCache?'copia salvata · ':'')+new Date(dati.aggiornatoAlle).toLocaleString('it-IT',{timeZone:'Europe/Rome'}):'Catalogo non caricato';
 if(!dati){list.append(el('p','talos-card--pad talos-muted',caricamento?'Caricamento…':'Apri questa sezione per caricare il catalogo.'));}
 else if(!visibili.length){const p=el('p','talos-card--pad talos-muted',dati.modelli.length?'Nessun modello corrisponde ai filtri.':'Il catalogo osservato è vuoto.');list.append(p);}
 else for(const m of visibili.slice(0,limite))list.append(creaRigaCatalogo(m,{selezionato:m.id===selected?.id,seleziona}));
 more.hidden=visibili.length<=limite;more.onclick=()=>altri?.();aggiornaDettaglioCatalogo(detail,selected,{fornitori});list.scrollTop=scroll;
 if(focusId&&document.activeElement===document.body&&!panel.hidden){const nuovo=[...list.querySelectorAll('[data-catalog]')].find(b=>b.dataset.catalog===focusId);nuovo?.focus({preventScroll:true});}
 return selected;
}
export function montaCatalogoModelli(originale,canonico){
 if(!originale||!canonico||originale.dataset.catalogMounted)return;
 originale.replaceChildren(...canonico.children);originale.dataset.catalogMounted='true';originale.dataset.catalogPanel='';
 const ids={cercaCatalogo:'modelLabSearch',filtroFornitore:'modelLabProviderFilter',listaCatalogo:'modelLabCatalogList'};
 for(const [prima,dopo] of Object.entries(ids)){const n=originale.querySelector('#'+prima);if(!n)continue;for(const label of originale.querySelectorAll('label[for="'+prima+'"]'))label.htmlFor=dopo;n.id=dopo;}
 /* ⛔⛔ 18/09/2026 — QUESTE TRE RIGHE ERANO IN GUARDIE, E CON LA DIREZIONE INVERTITA DEL TRAVASO
    FACEVANO CROLLARE IL MONTAGGIO: `Cannot set properties of null`. Il rinomino degli id presuppone
    che in `originale` ci siano i figli CANONICI (`[data-catalog-detail]`, `[data-catalog-count]`,
    `[data-catalog-refresh]`); quando la destinazione è il pannello canonico — cioè ora, vedi
    `app.js`, `inizializzaModelLab` — i figli che arrivano sono i LEGACY, che portano già gli id
    giusti (`#modelLabModelDetail`, `#modelLabCatalogCount`, `#modelLabRefreshButton`). ⇒ Le query
    tornano `null` e il rinomino non serve: si salta invece di esplodere. Le due funzioni sorelle
    (`hf-catalogo.js`, `download-coda.js`) erano già guardate con `if (…)`; questa no, e la
    differenza si è vista solo perché la verifica ha esercitato il travaso — la prima foto della
    schermata era un falso positivo, scattata prima che il montaggio girasse. */
 const dettaglio = originale.querySelector('[data-catalog-detail]'); if (dettaglio) dettaglio.id = 'modelLabModelDetail';
 const conteggio = originale.querySelector('[data-catalog-count]'); if (conteggio) conteggio.id = 'modelLabCatalogCount';
 const aggiorna = originale.querySelector('[data-catalog-refresh]'); if (aggiorna) aggiorna.id = 'modelLabRefreshButton';
 originale.querySelector('#modelLabProviderFilter')?.replaceChildren(new Option('Tutti i fornitori','all'));
 /* ⛔ 18/09/2026 — stesso motivo delle tre righe qui sopra: dopo l'inversione del travaso la
    destinazione è il pannello canonico e i figli che arrivano sono i LEGACY, che portano gli id
    (`#modelLabCatalogList`, `#modelLabModelDetail`) e NON gli attributi canonici. Si cerca l'uno o
    l'altro, e se non c'è nessuno dei due non si esplode: si salta. */
 const listaCatalogo = originale.querySelector('[data-catalog-list]') || originale.querySelector('#modelLabCatalogList');
 if (listaCatalogo) listaCatalogo.replaceChildren();
 const dettaglioCatalogo = originale.querySelector('[data-catalog-detail]') || originale.querySelector('#modelLabModelDetail');
 if (dettaglioCatalogo) aggiornaDettaglioCatalogo(dettaglioCatalogo, null);
}
