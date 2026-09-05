// ProviderCard: credenziale presente, configurazione e sonda restano tre fatti distinti.
export function statoProvider(row={},prova=null){
 const esito=prova?.esito,labels={'in-corso':'Prova in corso…','non-autorizzato':'Credenziale rifiutata',irraggiungibile:'Non raggiungibile','non-provabile':'Da configurare',errore:'Prova non riuscita'};
 const conteggio=Number.isInteger(prova?.modelli)&&prova.modelli>=0?' · '+prova.modelli+' modelli':'';
 return {chiave:row.keyConfigured===true?'Chiave salvata':row.requiresKey===true?'Chiave mancante':'Chiave facoltativa',tempo:row.id!=='huggingface',prova:!prova?'Mai provato':esito==='collegato'?(row.id==='huggingface'?'Profilo raggiunto':'Servizio raggiunto'+conteggio):labels[esito]||'Prova non riuscita',tono:esito==='collegato'?'success':['non-autorizzato','irraggiungibile','errore'].includes(esito)?'danger':'warning',occupato:esito==='in-corso'};
}
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;}
function campo(label,tipo,key,row,valore=''){const wrap=el('label','talos-stack talos-provider__field');wrap.append(el('span','talos-muted',label));const input=el('input','talos-field__input');input.type=tipo;input.dataset[key]=row.id;input.autocomplete='off';input.value=valore;if(tipo==='password'){input.spellcheck=false;input.placeholder=row.keyConfigured?'Incolla una nuova chiave':'Incolla la chiave';}if(tipo==='number'){input.min='5';input.max='300';input.step='1';}wrap.append(input);return wrap;}
function button(action,label,tone='secondary'){const b=el('button','talos-button talos-button--'+tone+' talos-button--sm',label);b.type='button';b.dataset.c='Button';b.dataset.providerAction=action;return b;}
export function creaProviderCard(row,{aperta=false,prova=null,occupato=false}={}){
 const d=statoProvider(row,prova),busy=occupato||d.occupato,card=el('article','talos-card talos-provider');card.dataset.c='ProviderCard';card.dataset.providerId=row.id;card.setAttribute('aria-busy',String(busy));if(prova)card.dataset.provaEsito=prova.esito;
 const head=el('button','talos-provider__head');head.type='button';head.dataset.providerToggle=row.id;head.setAttribute('aria-expanded',String(aperta));head.setAttribute('aria-controls','provider-body-'+row.id);
 const title=el('strong','talos-provider__name',row.label||row.id),marks=el('span','talos-cluster');head.append(title,marks);
 for(const [txt,tone]of [[d.chiave,row.keyConfigured?'success':''],[row.supportsEndpoint?(row.endpointConfigured?'Indirizzo personalizzato':'Indirizzo predefinito'):null,''],[d.prova,d.tono]])if(txt){const badge=el('span','talos-badge talos-badge--sm'+(tone?' talos-badge--'+tone:''),txt);badge.dataset.c='Badge';marks.append(badge);}card.append(head);
 const body=el('div','talos-provider__body');body.id='provider-body-'+row.id;body.hidden=!aperta;
 {
 body.append(campo(row.keyConfigured?'Sostituisci la chiave':row.requiresKey?'Chiave API':'Chiave API (facoltativa)','password','providerKey',row));
 if(row.supportsEndpoint)body.append(campo('Indirizzo del servizio','url','providerEndpoint',row,row.endpoint||''));
 if(d.tempo)body.append(campo('Tempo massimo (secondi)','number','providerTimeout',row,String(row.timeoutSeconds??60)));
 const actions=el('div','talos-cluster');actions.append(button('save-key','Salva chiave','primary'),button('test','Prova collegamento'));
 if(d.tempo)actions.append(button('save-runtime',row.supportsEndpoint?'Salva collegamento':'Salva tempo massimo'));
 if(row.supportsEndpoint&&row.endpointConfigured)actions.append(button('reset-runtime','Ripristina indirizzo'));
 if(row.keyConfigured)actions.append(button('remove-key','Rimuovi chiave','ghost talos-button--danger'));body.append(actions);
 if(prova&&prova.esito!=='in-corso'){const note=el('p','talos-muted',prova.esito==='collegato'?(row.id==='openrouter'?'Il catalogo risponde. La validità della chiave richiede una verifica dedicata.':'La verifica del servizio non esegue un modello.'):(prova.motivo||d.prova));note.dataset.provaEsito=prova.esito;if(Number.isFinite(prova.millisecondi))note.append(document.createTextNode(' · '+prova.millisecondi+' ms'));body.append(note);}
 const feedback=el('p','talos-muted');feedback.dataset.providerFeedback=row.id;feedback.setAttribute('role','status');feedback.hidden=true;body.append(feedback);
 for(const control of body.querySelectorAll('input,button'))control.disabled=busy;
 }card.append(body);return card;
}
export function aggiornaProviderList(lista,rows,{aperte=new Set(),prove=new Map(),occupati=new Set(),caricamento=false,errore=null}={}){
 if(!lista)return;lista.className='talos-provider-list';lista.setAttribute('aria-busy',String(caricamento));
 if(errore||!rows.length){const p=el('p','talos-muted',errore?errore.message||String(errore):caricamento?'Leggo gli accessi…':'Nessun fornitore dichiarato dal server.');p.dataset.c='EmptyState';if(errore)p.setAttribute('role','alert');lista.replaceChildren(p);return;}
 const focus=document.activeElement,focusId=focus?.closest('[data-provider-id]')?.dataset.providerId;
 const old=new Map([...lista.querySelectorAll('[data-provider-id]')].map(n=>[n.dataset.providerId,n]));
 const cards=rows.map(row=>{const op={aperta:aperte.has(row.id),prova:prove.get(row.id)||null,occupato:occupati.has(row.id)||caricamento},signature=JSON.stringify([row,op]),precedente=old.get(row.id);if(precedente?.dataset.providerSignature===signature&&!precedente.dataset.providerReset)return precedente;const card=creaProviderCard(row,op);card.dataset.providerSignature=signature;
 if(precedente&&!precedente.dataset.providerReset){for(const input of card.querySelectorAll('input')){const attr=[...input.attributes].find(a=>a.name.startsWith('data-provider-'));const prima=precedente.querySelector('['+attr.name+']');if(prima){prima.disabled=input.disabled;prima.className=input.className;prima.placeholder=input.placeholder;input.replaceWith(prima);}}}
 const feedback=precedente?.querySelector('[data-provider-feedback]'),target=card.querySelector('[data-provider-feedback]');if(feedback&&target)target.replaceWith(feedback);return card;});lista.replaceChildren(...cards);
 if(focusId){if(focus.isConnected&&!focus.disabled)focus.focus({preventScroll:true});else cards.find(n=>n.dataset.providerId===focusId)?.querySelector('[data-provider-toggle]')?.focus({preventScroll:true});}
}
export function montaProviderPanel(panel){if(!panel)return;panel.classList.add('talos-provider-panel');const head=panel.querySelector('.model-lab-panel-heading');head?.classList.add('talos-page__head');const title=head?.querySelector('h4');if(title)title.textContent='Fornitori e accessi';const note=head?.querySelector('p');if(note){note.className='talos-muted';note.textContent='Le chiavi restano sul computer. Presenza della chiave, collegamento ed esecuzione sono verifiche distinte.';}const test=panel.querySelector('#providerTestAll');if(test){test.className='talos-button talos-button--secondary talos-button--sm';test.dataset.c='Button';const refresh=button('refresh','Aggiorna');refresh.id='providerRefresh';delete refresh.dataset.providerAction;test.before(refresh);}}
