// ProviderCard: credenziale presente, configurazione e sonda restano tre fatti distinti.
export function statoProvider(row={},prova=null){
 const esito=prova?.esito,labels={'in-corso':'Prova in corso…','non-autorizzato':'Credenziale rifiutata',irraggiungibile:'Non raggiungibile','non-provabile':'Da configurare',errore:'Prova non riuscita'};
 const conteggio=Number.isInteger(prova?.modelli)&&prova.modelli>=0?' · '+prova.modelli+' modelli':'';
 return {chiave:etichettaOrigineChiave(row),tempo:row.id!=='huggingface',prova:!prova?'Mai provato':esito==='collegato'?(row.id==='huggingface'?'Profilo raggiunto':'Servizio raggiunto'+conteggio):labels[esito]||'Prova non riuscita',tono:esito==='collegato'?'success':['non-autorizzato','irraggiungibile','errore'].includes(esito)?'danger':'warning',occupato:esito==='in-corso'};
}
/*
 * ⛔ PO-01 — «Chiave salvata» non basta più: da quando esiste l'accesso, una chiave può arrivare
 *   da tre posti diversi, e uno dei tre NON si tocca da qui. `origineChiave` lo dice il server
 *   (`custodia` / `ambiente`); senza quel campo si torna esattamente a com'era.
 * ⛔ «Chiave dall'ambiente» è la più importante: l'ha impostata qualcuno fuori da TALOS, vince su
 *   quella salvata, e da questa pagina non si rimuove. Senza dirlo, una chiave vecchia continua a
 *   essere usata e nessuno capisce perché.
 */
export function etichettaOrigineChiave(row={}){
 if(row.origineChiave==='ambiente')return 'Chiave dall\u2019ambiente';
 if(row.origineChiave==='accesso')return 'Accesso fatto';
 if(row.keyConfigured===true)return 'Chiave salvata';
 return row.requiresKey===true?'Chiave mancante':'Chiave facoltativa';
}
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;}
function campo(label,tipo,key,row,valore=''){const wrap=el('label','talos-stack talos-provider__field');wrap.append(el('span','talos-muted',label));const input=el('input','talos-field__input');input.type=tipo;input.dataset[key]=row.id;input.autocomplete='off';input.value=valore;if(tipo==='password'){input.spellcheck=false;input.placeholder=row.keyConfigured?'Incolla una nuova chiave':'Incolla la chiave';}if(tipo==='number'){input.min='5';input.max='300';input.step='1';}wrap.append(input);return wrap;}
function button(action,label,tone='secondary'){const b=el('button','talos-button talos-button--'+tone+' talos-button--sm',label);b.type='button';b.dataset.c='Button';b.dataset.providerAction=action;return b;}
/** Il simbolo di un'icona dello sprite. Il file non aveva icone: nasce qui, minimo. */
function simboloProvider(nome){const NS='http://www.w3.org/2000/svg';const svg=document.createElementNS(NS,'svg');svg.setAttribute('class','i i--sm');svg.setAttribute('aria-hidden','true');const use=document.createElementNS(NS,'use');use.setAttribute('href','#'+nome);svg.append(use);return svg;}

export function creaProviderCard(row,{aperta=false,prova=null,occupato=false,onMenu=null}={}){
 const d=statoProvider(row,prova),busy=occupato||d.occupato,card=el('article','talos-card talos-provider');card.dataset.c='ProviderCard';card.dataset.providerId=row.id;card.setAttribute('aria-busy',String(busy));if(prova)card.dataset.provaEsito=prova.esito;
 const head=el('button','talos-provider__head');head.type='button';head.dataset.providerToggle=row.id;head.setAttribute('aria-expanded',String(aperta));head.setAttribute('aria-controls','provider-body-'+row.id);
 const title=el('strong','talos-provider__name',row.label||row.id),marks=el('span','talos-cluster');head.append(title,marks);
 for(const [txt,tone]of [[d.chiave,row.keyConfigured?'success':''],[row.supportsEndpoint?(row.endpointConfigured?'Indirizzo personalizzato':'Indirizzo predefinito'):null,''],[d.prova,d.tono]])if(txt){const badge=el('span','talos-badge talos-badge--sm'+(tone?' talos-badge--'+tone:''),txt);badge.dataset.c='Badge';marks.append(badge);}card.append(head);
 const body=el('div','talos-provider__body');body.id='provider-body-'+row.id;body.hidden=!aperta;
 {
 /*
  * ⛔ PO-01 — se il fornitore ha l'accesso, quello è il gesto principale e il campo della chiave
  *   scende sotto, in un dettaglio richiudibile: resta per chi una chiave ce l'ha già, ma smette
  *   di essere la prima cosa che si vede. Il pulsante compare SOLO se il server dichiara di
  *   saperlo servire: un pulsante che apre un flusso inesistente è peggio di nessun pulsante.
  */
 const conAccesso=row.supportsOAuth===true;
 const campoChiave=campo(row.keyConfigured?'Sostituisci la chiave':row.requiresKey?'Chiave API':'Chiave API (facoltativa)','password','providerKey',row);
 if(conAccesso){
  const accedi=button('oauth-start',row.origineChiave==='accesso'?'Rifai l\u2019accesso':'Accedi con '+(row.label||row.id),'primary');
  accedi.classList.add('talos-provider__accedi');
  /* ⛔ Pulsante e nota nella STESSA riga: la nota sotto lasciava un vuoto verticale grande
     quanto la card, e il pulsante da solo su una riga intera si stirava come un banner. */
  const riga=el('div','talos-provider__accesso');riga.append(accedi);
  const nota=el('p','talos-muted',row.origineChiave==='ambiente'
   ?'Adesso vale la chiave impostata fuori da TALOS: finch\u00e9 c\u2019\u00e8, l\u2019accesso non viene usato.'
   :'Si apre il sito del fornitore: la password non passa da TALOS, e alla fine torna una chiave.');
  riga.append(nota);body.append(riga);
  const oppure=document.createElement('details');oppure.className='talos-provider__oppure';
  const riassunto=document.createElement('summary');riassunto.textContent='Oppure incolla una chiave';
  oppure.append(riassunto,campoChiave);body.append(oppure);
 }else body.append(campoChiave);
 if(row.supportsEndpoint)body.append(campo('Indirizzo del servizio','url','providerEndpoint',row,row.endpoint||''));
 if(d.tempo)body.append(campo('Tempo massimo (secondi)','number','providerTimeout',row,String(row.timeoutSeconds??60)));
 /*
  * ⛔ Una sola azione a vista: salvare la chiave appena incollata. Le altre sono azioni su
  *   qualcosa di GIÀ configurato — si fanno una volta ogni tanto, non mentre stai configurando —
  *   e vivono nel menu «⋯», nascoste ma presenti nel DOM: la regia delegata su
  *   `[data-provider-action]` (app.js:4068) le trova al `.click()` senza sapere del menu.
  */
 const actions=el('div','talos-cluster');actions.append(button('save-key','Salva chiave','primary'));
 const nascoste=[];
 const aggiungiNascosto=(b)=>{b.hidden=true;nascoste.push(b);return b;};
 const vociMenu=[{chiave:'test',etichetta:'Prova collegamento',icona:'i-play',elemento:aggiungiNascosto(button('test','Prova collegamento'))}];
 if(d.tempo)vociMenu.push({chiave:'save-runtime',etichetta:row.supportsEndpoint?'Salva collegamento':'Salva tempo massimo',icona:'i-clock',elemento:aggiungiNascosto(button('save-runtime',row.supportsEndpoint?'Salva collegamento':'Salva tempo massimo'))});
 if(row.supportsEndpoint&&row.endpointConfigured)vociMenu.push({chiave:'reset-runtime',etichetta:'Ripristina indirizzo',icona:'i-history',elemento:aggiungiNascosto(button('reset-runtime','Ripristina indirizzo'))});
 if(row.keyConfigured)vociMenu.push({chiave:'remove-key',etichetta:'Rimuovi chiave',icona:'i-trash',pericolo:true,separaPrima:true,elemento:aggiungiNascosto(button('remove-key','Rimuovi chiave','ghost talos-button--danger'))});
 if(typeof onMenu==='function'&&vociMenu.length){
  const tre=el('button','talos-button talos-button--ghost talos-icon-button talos-button--sm');tre.type='button';
  tre.setAttribute('aria-label','Altre azioni per '+(row.label||row.id));tre.setAttribute('aria-haspopup','menu');
  tre.append(simboloProvider('i-more'));
  const voci=()=>vociMenu.map(v=>({chiave:v.chiave,etichetta:v.etichetta,icona:v.icona,pericolo:v.pericolo,separaPrima:v.separaPrima,aziona:()=>v.elemento.click()}));
  tre.addEventListener('click',()=>onMenu(voci(),{ancora:tre}));
  /* Il tasto destro sulla card apre lo stesso menu, alle coordinate del puntatore. */
  card.addEventListener('contextmenu',(e)=>{e.preventDefault();onMenu(voci(),{x:e.clientX,y:e.clientY});});
  actions.append(tre);
 }
 actions.append(...nascoste);
 body.append(actions);
 if(prova&&prova.esito!=='in-corso'){const note=el('p','talos-muted',prova.esito==='collegato'?(row.id==='openrouter'?'Il catalogo risponde. La validità della chiave richiede una verifica dedicata.':'La verifica del servizio non esegue un modello.'):(prova.motivo||d.prova));note.dataset.provaEsito=prova.esito;if(Number.isFinite(prova.millisecondi))note.append(document.createTextNode(' · '+prova.millisecondi+' ms'));body.append(note);}
 const feedback=el('p','talos-muted');feedback.dataset.providerFeedback=row.id;feedback.setAttribute('role','status');feedback.hidden=true;body.append(feedback);
 for(const control of body.querySelectorAll('input,button'))control.disabled=busy;
 }card.append(body);return card;
}
export function aggiornaProviderList(lista,rows,{aperte=new Set(),prove=new Map(),occupati=new Set(),caricamento=false,errore=null,onMenu=null}={}){
 if(!lista)return;lista.className='talos-provider-list';lista.setAttribute('aria-busy',String(caricamento));
 if(errore||!rows.length){const p=el('p','talos-muted',errore?errore.message||String(errore):caricamento?'Leggo gli accessi…':'Nessun fornitore dichiarato dal server.');p.dataset.c='EmptyState';if(errore)p.setAttribute('role','alert');lista.replaceChildren(p);return;}
 const focus=document.activeElement,focusId=focus?.closest('[data-provider-id]')?.dataset.providerId;
 const old=new Map([...lista.querySelectorAll('[data-provider-id]')].map(n=>[n.dataset.providerId,n]));
 const cards=rows.map(row=>{const op={aperta:aperte.has(row.id),prova:prove.get(row.id)||null,occupato:occupati.has(row.id)||caricamento},signature=JSON.stringify([row,op]),precedente=old.get(row.id);if(precedente?.dataset.providerSignature===signature&&!precedente.dataset.providerReset)return precedente;const card=creaProviderCard(row,{...op,onMenu});card.dataset.providerSignature=signature;
 if(precedente&&!precedente.dataset.providerReset){for(const input of card.querySelectorAll('input')){const attr=[...input.attributes].find(a=>a.name.startsWith('data-provider-'));const prima=precedente.querySelector('['+attr.name+']');if(prima){prima.disabled=input.disabled;prima.className=input.className;prima.placeholder=input.placeholder;input.replaceWith(prima);}}}
 const feedback=precedente?.querySelector('[data-provider-feedback]'),target=card.querySelector('[data-provider-feedback]');if(feedback&&target)target.replaceWith(feedback);return card;});lista.replaceChildren(...cards);
 if(focusId){if(focus.isConnected&&!focus.disabled)focus.focus({preventScroll:true});else cards.find(n=>n.dataset.providerId===focusId)?.querySelector('[data-provider-toggle]')?.focus({preventScroll:true});}
}
export function montaProviderPanel(panel){if(!panel)return;panel.classList.add('talos-provider-panel');const head=panel.querySelector('.model-lab-panel-heading');head?.classList.add('talos-page__head');const title=head?.querySelector('h4');if(title)title.textContent='Fornitori e accessi';const note=head?.querySelector('p');if(note){note.className='talos-muted';note.textContent='Le chiavi restano sul computer. Presenza della chiave, collegamento ed esecuzione sono verifiche distinte.';}const test=panel.querySelector('#providerTestAll');if(test){test.className='talos-button talos-button--secondary talos-button--sm';test.dataset.c='Button';const refresh=button('refresh','Aggiorna');refresh.id='providerRefresh';delete refresh.dataset.providerAction;test.before(refresh);}}
