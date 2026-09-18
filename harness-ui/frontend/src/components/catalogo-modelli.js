// 05/9 Fase 2: ListRow e DetailPanel del catalogo API, dati osservati OpenRouter.
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
export function aggiornaCatalogoModelli(panel,dati,{query='',provider='all',selezionato=null,limite=120,caricamento=false,errore='',seleziona,altri,fornitori}={}){
 const list=panel.querySelector('[data-catalog-list]'),detail=panel.querySelector('[data-catalog-detail]'),count=panel.querySelector('[data-catalog-count]'),more=panel.querySelector('[data-catalog-more]'),vuoto=panel.querySelector('#vuotoCatalogo'),refresh=panel.querySelector('[data-catalog-refresh]');if(!list||!detail)return null;
 const attivo=document.activeElement,focusId=list.contains(attivo)?attivo.dataset.catalog:null,scroll=list.scrollTop;
 const filtered=dati?filtraModelli(normalizzaCatalogoModelli(dati).modelli,query,provider):[];const selected=filtered.find(m=>m.id===selezionato?.id)||filtered[0]||null;
 list.replaceChildren();if(vuoto)vuoto.hidden=true;more.hidden=true;refresh.disabled=caricamento;panel.setAttribute('aria-busy',String(caricamento));
 if(errore){const p=el('p','talos-card talos-card--pad',errore);p.setAttribute('role','alert');list.append(p);count.textContent='Catalogo non disponibile';aggiornaDettaglioCatalogo(detail,null);return null;}
 count.textContent=caricamento?'Aggiornamento del catalogo…':dati?filtered.length+' di '+dati.modelli.length+' modelli · OpenRouter · '+(dati.daCache?'copia salvata · ':'')+new Date(dati.aggiornatoAlle).toLocaleString('it-IT',{timeZone:'Europe/Rome'}):'Catalogo non caricato';
 if(!dati){list.append(el('p','talos-card--pad talos-muted',caricamento?'Caricamento…':'Apri questa sezione per caricare il catalogo.'));}
 else if(!filtered.length){const p=el('p','talos-card--pad talos-muted',dati.modelli.length?'Nessun modello corrisponde ai filtri.':'Il catalogo osservato è vuoto.');list.append(p);}
 else for(const m of filtered.slice(0,limite))list.append(creaRigaCatalogo(m,{selezionato:m.id===selected?.id,seleziona}));
 more.hidden=filtered.length<=limite;more.onclick=()=>altri?.();aggiornaDettaglioCatalogo(detail,selected,{fornitori});list.scrollTop=scroll;
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
