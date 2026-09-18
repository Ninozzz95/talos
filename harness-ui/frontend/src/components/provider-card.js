// ProviderCard: credenziale presente, configurazione e sonda restano tre fatti distinti.
/** 12/09 (review P-K): il badge dell'indirizzo. Senza un predefinito (Azure, Vertex, Bedrock) non si dice «predefinito» di un campo vuoto. */
export function etichettaIndirizzo(row={}){if(!row.supportsEndpoint)return null;if(row.endpointConfigured)return 'Indirizzo personalizzato';return row.endpoint?'Indirizzo predefinito':'Indirizzo da impostare';}
export function statoProvider(row={},prova=null){
 const esito=prova?.esito,labels={'in-corso':'Prova in corso…','non-autorizzato':'Credenziale rifiutata',irraggiungibile:'Non raggiungibile','non-provabile':'Da configurare',errore:'Prova non riuscita'};
 const conteggio=Number.isInteger(prova?.modelli)&&prova.modelli>=0?' · '+prova.modelli+' modelli':'';
 return {chiave:etichettaOrigineChiave(row),tempo:row.id!=='huggingface',prova:!prova?'Mai provato':esito==='collegato'?(row.id==='esterno'?'Agente raggiunto':row.id==='huggingface'?'Profilo raggiunto':'Servizio raggiunto'+conteggio):labels[esito]||'Prova non riuscita',tono:esito==='collegato'?'success':['non-autorizzato','irraggiungibile','errore'].includes(esito)?'danger':'warning',occupato:esito==='in-corso'};
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
 if(row.id==='esterno')return row.agente?'Agente configurato':'Agente da configurare';
 if(row.origineChiave==='ambiente')return 'Chiave dall\u2019ambiente';
 if(row.origineChiave==='accesso')return 'Accesso fatto';
 if(row.keyConfigured===true)return 'Chiave salvata';
 return row.requiresKey===true?'Chiave mancante':'Chiave facoltativa';
}
export function statoChiavePool(chiave={}){
 const cause={traffico:'Troppo traffico',credenziale:'Credenziale rifiutata',credito:'Credito non disponibile',rete:'Collegamento interrotto','timeout-fornitore':'Tempo massimo superato','guasto-fornitore':'Servizio non raggiungibile','flusso-interrotto':'Risposta interrotta'};
 if(chiave.stato!=='in-panchina')return 'Disponibile';
 const data=Number.isFinite(chiave.inPanchinaFino)?new Date(chiave.inPanchinaFino):null;
 const istante=data&&!Number.isNaN(data.getTime())?data.toLocaleString('it-IT',{dateStyle:'short',timeStyle:'medium'}):null;
 return (istante?'In panchina fino a '+istante:'In panchina')+' · '+(cause[chiave.causa]||'Accesso da verificare');
}
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;}
function campo(label,tipo,key,row,valore=''){const wrap=el('label','talos-stack talos-provider__field');wrap.append(el('span','talos-muted',label));const input=el('input','talos-field__input');input.type=tipo;input.dataset[key]=row.id;input.autocomplete='off';input.value=valore;if(tipo==='password'){input.spellcheck=false;input.placeholder=row.keyConfigured?'Incolla una nuova chiave':'Incolla la chiave';}if(tipo==='number'){input.min='5';input.max='300';input.step='1';}wrap.append(input);return wrap;}
// P-K-bis/P-L-bis: identità esplicite e configurazione non segreta del processo.
const CLOUD_CONFIGURABILI=new Set(['azure','vertex','bedrock']);
function multiriga(label,key,row,valore=''){
 const wrap=el('label','talos-stack talos-provider__field');wrap.style.gridColumn='1 / -1';
 const input=el('textarea','talos-field__input');input.dataset[key]=row.id;input.value=valore;input.rows=3;input.spellcheck=false;input.autocomplete='off';
 Object.assign(input.style,{width:'100%',minWidth:'0',height:'auto',minHeight:'88px',boxSizing:'border-box',resize:'vertical',font:'inherit',lineHeight:'1.4',padding:'10px 12px'});
 wrap.append(el('span','talos-muted',label),input);return wrap;
}
export function leggiCollegamentoProvider(row,card){
 const valore=s=>card.querySelector(s)?.value??'';
 const righe=s=>valore(s).split(/\r?\n/u).map(v=>v.trim()).filter(Boolean);
 if(row.id==='esterno')return {agente:{comando:valore('[data-provider-comando]').trim(),
  argomenti:valore('[data-provider-argomenti]').split(/\r?\n/u).filter(v=>v!==''),cwd:valore('[data-provider-cwd]').trim(),
  variabiliAmbiente:righe('[data-provider-variabili]'),timeoutMs:Number(valore('[data-provider-tempo-agente]'))*1000}};
 return {endpoint:valore('[data-provider-endpoint]').trim(),timeoutSeconds:Number(valore('[data-provider-timeout]')||60),
  ...(CLOUD_CONFIGURABILI.has(row.id)?{modelli:righe('[data-provider-modelli]').map(id=>{
   const nome=row.modelli?.find(m=>m.id===id)?.nome;return {id,...(nome?{nome}:{})};
  })}:{})};
}
/** Stesso envelope della regia; il salvataggio non invia segreti né ritenta scritture. */
export async function salvaCollegamentoProvider(row,card,{fetchImpl=globalThis.fetch,baseUrl=globalThis.window?.__talosHarnessApiBase||''}={}){
 let risposta;
 try{risposta=await fetchImpl(`${baseUrl}/api/v1/providers/${encodeURIComponent(row.id)}/runtime`,{
  method:'POST',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(leggiCollegamentoProvider(row,card))});}
 catch{throw new Error('Collegamento non salvato: il server locale non risponde.');}
 let esito;try{esito=await risposta.json();}catch{throw new Error('Collegamento non salvato: risposta locale non valida.');}
 if(!risposta.ok||esito?.ok!==true||!esito.data||typeof esito.data!=='object')throw new Error('Collegamento non salvato. Controlla i campi e riprova.');
 return esito.data;
}
function aggiungiCampiAgente(body,row){
 const a=row.agente||{};
 body.append(campo('Comando','text','providerComando',row,a.comando||''),campo('Cartella di lavoro','text','providerCwd',row,a.cwd||''),
  multiriga('Argomenti (uno per riga)','providerArgomenti',row,(a.argomenti||[]).join('\n')),
  multiriga("Variabili d'ambiente da passare (solo i nomi)",'providerVariabili',row,(a.variabiliAmbiente||[]).join('\n')));
 const tempo=campo('Tempo massimo (secondi)','number','providerTempoAgente',row,String((a.timeoutMs??180000)/1000));
 const input=tempo.querySelector('input');input.min='0.05';input.max='3600';input.step='0.001';body.append(tempo);
 const nota=el('p','talos-muted','Indica percorsi assoluti. Passa le credenziali tramite i nomi delle variabili, senza incollarne i valori. Salva il collegamento prima di provarlo.');
 nota.style.gridColumn='1 / -1';body.append(nota);
}
function button(action,label,tone='secondary'){const b=el('button','talos-button talos-button--'+tone+' talos-button--sm',label);b.type='button';b.dataset.c='Button';b.dataset.providerAction=action;return b;}
/** Il simbolo di un'icona dello sprite. Il file non aveva icone: nasce qui, minimo. */
function simboloProvider(nome){const NS='http://www.w3.org/2000/svg';const svg=document.createElementNS(NS,'svg');svg.setAttribute('class','i i--sm');svg.setAttribute('aria-hidden','true');const use=document.createElementNS(NS,'use');use.setAttribute('href','#'+nome);svg.append(use);return svg;}

// P-K — soli campi non segreti: il salvataggio esistente continua a leggere l'indirizzo.
export function componiIndirizzoCloud(provider,{endpoint='',regione='',progetto='',versioneApi='v1'}={}){
 const invalido=()=>{throw new Error('Controlla i campi del collegamento.');};
 if(provider==='azure'){
  let url;try{url=new URL(endpoint);}catch{invalido();}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hash||!['v1','2024-10-21'].includes(versioneApi))invalido();
  return url.origin+(versioneApi==='v1'?'/openai/v1':'/openai?api-version=2024-10-21');
 }
 if(!/^[a-z][a-z0-9-]{1,62}$/u.test(regione))invalido();
 if(provider==='bedrock'){
  let mantle=false;try{mantle=new URL(endpoint).hostname.startsWith('bedrock-mantle.');}catch{/* prima configurazione */}
  return mantle?`https://bedrock-mantle.${regione}.api.aws/v1`:`https://bedrock-runtime.${regione}.amazonaws.com/openai/v1`;
 }
 if(provider!=='vertex'||!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/u.test(progetto))invalido();
 return `https://${regione==='global'?'':regione+'-'}aiplatform.googleapis.com/v1/projects/${progetto}/locations/${regione}/endpoints/openapi`;
}
function aggiungiCampiCloud(body,row){
 if(!row.cloud)return;
 if(row.cloud.campi.includes('regione'))body.append(campo('Regione','text','providerRegione',row,row.regione||''));
 if(row.cloud.campi.includes('progetto'))body.append(campo('Progetto','text','providerProgetto',row,row.progetto||''));
 if(row.cloud.campi.includes('versioneApi')){
  const versione=campo('Versione del collegamento','text','providerVersione',row,row.versioneApi||'v1');
  versione.querySelector('input').placeholder='v1 oppure 2024-10-21';body.append(versione);
 }
 const nota=el('p','talos-muted',row.cloud.nota);nota.style.gridColumn='1 / -1';body.append(nota);
 // Delega sul corpo: gli input delle bozze vengono conservati da aggiornaProviderList.
 body.addEventListener('input',e=>{
  const endpoint=body.querySelector('[data-provider-endpoint]');if(!endpoint)return;
  const regione=body.querySelector('[data-provider-regione]'),progetto=body.querySelector('[data-provider-progetto]'),versione=body.querySelector('[data-provider-versione]');
  if(e.target===endpoint){
   try{
    const url=new URL(endpoint.value),p=/\/projects\/([^/]+)\/locations\/([^/]+)/u.exec(url.pathname);
    endpoint.dataset.pkUltimoIndirizzo=endpoint.value;
    if(regione)regione.value=p?.[2]||/^bedrock-(?:runtime|mantle)\.([^.]+)/u.exec(url.hostname)?.[1]||'';
    if(progetto)progetto.value=p?.[1]||'';
    if(versione)versione.value=url.searchParams.get('api-version')||'v1';
   }catch{/* L'indirizzo incompleto resta visibile e sarà respinto dal server. */}
   return;
  }
  if(![regione,progetto,versione].includes(e.target))return;
  // La digitazione può attraversare un valore incompleto: conserva soltanto la risorsa
  // pubblica per ricomporre il collegamento, ma lascia invalido ciò che si può salvare.
  if(endpoint.value)endpoint.dataset.pkUltimoIndirizzo=endpoint.value;
  try{endpoint.value=componiIndirizzoCloud(row.id,{endpoint:endpoint.value||endpoint.dataset.pkUltimoIndirizzo||row.endpoint,regione:regione?.value.trim(),progetto:progetto?.value.trim(),versioneApi:versione?.value.trim()});}
  catch{endpoint.value='';}
 });
}
// P-K — fine

export function creaProviderCard(row,{aperta=false,prova=null,occupato=false,onMenu=null,onAzionePool=null}={}){
 const esterno=row.id==='esterno',configurazionePropria=esterno||CLOUD_CONFIGURABILI.has(row.id);
 const d=statoProvider(row,prova),busy=occupato||d.occupato,card=el('article','talos-card talos-provider');card.dataset.c='ProviderCard';card.dataset.providerId=row.id;card.setAttribute('aria-busy',String(busy));if(prova)card.dataset.provaEsito=prova.esito;
 const head=el('button','talos-provider__head');head.type='button';head.dataset.providerToggle=row.id;head.setAttribute('aria-expanded',String(aperta));head.setAttribute('aria-controls','provider-body-'+row.id);
 const title=el('strong','talos-provider__name',row.label||row.id),marks=el('span','talos-cluster');head.append(title,marks);
 for(const [txt,tone]of [[d.chiave,row.keyConfigured?'success':''],[etichettaIndirizzo(row),row.supportsEndpoint&&!row.endpointConfigured&&!row.endpoint?'warning':''],[d.prova,d.tono]])if(txt){const badge=el('span','talos-badge talos-badge--sm'+(tone?' talos-badge--'+tone:''),txt);badge.dataset.c='Badge';marks.append(badge);}card.append(head);
 const body=el('div','talos-provider__body');body.id='provider-body-'+row.id;body.hidden=!aperta;
 {
 /*
  * ⛔ PO-01 — se il fornitore ha l'accesso, quello è il gesto principale e il campo della chiave
  *   scende sotto, in un dettaglio richiudibile: resta per chi una chiave ce l'ha già, ma smette
  *   di essere la prima cosa che si vede. Il pulsante compare SOLO se il server dichiara di
  *   saperlo servire: un pulsante che apre un flusso inesistente è peggio di nessun pulsante.
  */
 const conAccesso=row.supportsOAuth===true;
 const pool=Array.isArray(row.pool)?row.pool:[],poolCollegato=typeof onAzionePool==='function';
 if(pool.length){
  const elenco=el('ul','talos-stack');elenco.setAttribute('aria-label','Chiavi di '+(row.label||row.id));
  Object.assign(elenco.style,{gridColumn:'1 / -1',margin:'0',padding:'0',listStyle:'none'});
  for(const [i,chiave]of pool.entries()){
   const riga=el('li','talos-cluster'),testo=el('div','talos-stack'),impronta=/^[a-f0-9]{64}$/u.test(chiave.impronta||'')?chiave.impronta.slice(0,12):'';
   Object.assign(riga.style,{flexWrap:'nowrap',justifyContent:'space-between',alignItems:'flex-start'});
   Object.assign(testo.style,{gap:'4px',minWidth:'0',flex:'1'});
   testo.append(el('strong','',`Chiave ${i+1}${impronta?' · '+impronta:''}`),el('span','talos-muted',statoChiavePool(chiave)));
   if(chiave.origine==='ambiente')testo.append(el('span','talos-muted','Impostata fuori da TALOS'));
   riga.append(testo);
   if(poolCollegato&&chiave.origine!=='ambiente'){
    const rimuovi=el('button','talos-button talos-button--ghost talos-button--sm','Rimuovi');rimuovi.type='button';
    rimuovi.setAttribute('aria-label',`Rimuovi chiave ${i+1}`);
    const aziona=async()=>{
     rimuovi.disabled=true;
     try{await onAzionePool({azione:'rimuovi',provider:row.id,impronta:chiave.impronta});}
     catch{const feedback=body.querySelector('[data-provider-feedback]');if(feedback){feedback.textContent='La chiave non è stata rimossa. Aggiorna il pannello e riprova.';feedback.hidden=false;}}
     finally{rimuovi.disabled=busy;}
    };
    if(typeof onMenu==='function'){
     rimuovi.textContent='⋯';rimuovi.setAttribute('aria-label',`Azioni per chiave ${i+1}`);rimuovi.setAttribute('aria-haspopup','menu');
     rimuovi.addEventListener('click',()=>onMenu([{chiave:'rimuovi',etichetta:'Rimuovi',pericolo:true,aziona}],{ancora:rimuovi}));
    }else rimuovi.addEventListener('click',aziona);
    riga.append(rimuovi);
   }
   elenco.append(riga);
  }
  body.append(elenco);
 }
 const campoChiave=campo(poolCollegato?'Aggiungi una chiave':row.keyConfigured?'Sostituisci la chiave':row.requiresKey?'Chiave di accesso':'Chiave di accesso (facoltativa)','password','providerKey',row);
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
 }else if(!esterno)body.append(campoChiave);
 if(row.supportsEndpoint)body.append(campo('Indirizzo del servizio','url','providerEndpoint',row,row.endpoint||''));
 // P-K — campi collegati all'input salvato dalla regia esistente.
 aggiungiCampiCloud(body,row);
 if(CLOUD_CONFIGURABILI.has(row.id)){
  body.append(multiriga('Modelli configurati (uno per riga)','providerModelli',row,(row.modelli||[]).map(m=>m.id).join('\n')));
  const nota=el('p','talos-muted','Indica i nomi delle distribuzioni o dei modelli abilitati. Questa lista non verifica l’accesso né il supporto agli strumenti.');nota.style.gridColumn='1 / -1';body.append(nota);
 }
 if(esterno)aggiungiCampiAgente(body,row);
 // P-K — fine
 if(d.tempo&&!esterno)body.append(campo('Tempo massimo (secondi)','number','providerTimeout',row,String(row.timeoutSeconds??60)));
 /*
  * ⛔ Una sola azione a vista: salvare la chiave appena incollata. Le altre sono azioni su
  *   qualcosa di GIÀ configurato — si fanno una volta ogni tanto, non mentre stai configurando —
  *   e vivono nel menu «⋯», nascoste ma presenti nel DOM: la regia delegata su
  *   `[data-provider-action]` (app.js:4068) le trova al `.click()` senza sapere del menu.
  */
 const actions=el('div','talos-cluster');
 const salva=button('save-key',poolCollegato?'Aggiungi chiave':'Salva chiave','primary');
 if(poolCollegato){
  delete salva.dataset.providerAction;
  salva.addEventListener('click',async()=>{
   const input=campoChiave.querySelector('input');salva.disabled=true;
   try{await onAzionePool({azione:'aggiungi',provider:row.id,key:input.value});input.value='';}
   catch{const feedback=body.querySelector('[data-provider-feedback]');if(feedback){feedback.textContent='La chiave non è stata aggiunta. Controlla il collegamento e riprova.';feedback.hidden=false;}}
   finally{salva.disabled=busy;}
  });
 }
 if(!esterno)actions.append(salva);
 const nascoste=[];
 const aggiungiNascosto=(b)=>{b.hidden=true;nascoste.push(b);return b;};
 const vociMenu=[{chiave:'test',etichetta:'Prova collegamento',icona:'i-play',elemento:aggiungiNascosto(button('test','Prova collegamento'))}];
 if(d.tempo)vociMenu.push({chiave:'save-runtime',etichetta:row.supportsEndpoint||esterno?'Salva collegamento':'Salva tempo massimo',icona:'i-clock',elemento:aggiungiNascosto(button('save-runtime',row.supportsEndpoint||esterno?'Salva collegamento':'Salva tempo massimo'))});
 if(row.supportsEndpoint&&row.endpointConfigured)vociMenu.push({chiave:'reset-runtime',etichetta:'Ripristina indirizzo',icona:'i-history',elemento:aggiungiNascosto(button('reset-runtime','Ripristina indirizzo'))});
 if(row.keyConfigured&&!poolCollegato)vociMenu.push({chiave:'remove-key',etichetta:pool.length>1?'Rimuovi tutte le chiavi':'Rimuovi chiave',icona:'i-trash',pericolo:true,separaPrima:true,elemento:aggiungiNascosto(button('remove-key',pool.length>1?'Rimuovi tutte le chiavi':'Rimuovi chiave','ghost talos-button--danger'))});
 if(configurazionePropria){
  const salvaRuntime=vociMenu.find(v=>v.chiave==='save-runtime').elemento;
  salvaRuntime.addEventListener('click',async e=>{
   e.stopPropagation();if(card.dataset.salvataggioCollegamento==='in-corso')return;
   const controlli=[...body.querySelectorAll('input,textarea,button')],prima=controlli.map(c=>c.disabled);
   card.dataset.salvataggioCollegamento='in-corso';card.setAttribute('aria-busy','true');controlli.forEach(c=>{c.disabled=true;});
   const feedback=body.querySelector('[data-provider-feedback]');
   try{await salvaCollegamentoProvider(row,card);feedback.textContent='Collegamento salvato.';feedback.setAttribute('role','status');
    // Aggiorna lo stato pubblico con il gesto già collegato dalla regia legacy.
    document.getElementById('providerRefresh')?.click();
   }catch{feedback.textContent='Collegamento non salvato. Controlla i campi e il server locale, poi riprova.';feedback.setAttribute('role','alert');}
   finally{feedback.hidden=false;delete card.dataset.salvataggioCollegamento;card.setAttribute('aria-busy',String(busy));controlli.forEach((c,i)=>{c.disabled=prima[i];});}
  });
 }
 if(esterno){for(const v of vociMenu){v.elemento.hidden=false;} }
 if(!esterno&&typeof onMenu==='function'&&vociMenu.length){
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
 if(prova&&prova.esito!=='in-corso'){const note=el('p','talos-muted',prova.esito==='collegato'?(esterno?'Agente inizializzato e chiuso. Nessun messaggio inviato.':row.id==='openrouter'?'Il catalogo risponde. La validità della chiave richiede una verifica dedicata.':'La verifica del servizio non esegue un modello.'):(prova.motivo||d.prova));note.dataset.provaEsito=prova.esito;if(Number.isFinite(prova.millisecondi))note.append(document.createTextNode(' · '+prova.millisecondi+' ms'));body.append(note);}
 const feedback=el('p','talos-muted');feedback.dataset.providerFeedback=row.id;feedback.setAttribute('role','status');feedback.hidden=true;body.append(feedback);
 for(const control of body.querySelectorAll('input,textarea,button'))control.disabled=busy;
 }card.append(body);return card;
}
export function aggiornaProviderList(lista,rows,{aperte=new Set(),prove=new Map(),occupati=new Set(),caricamento=false,errore=null,onMenu=null,onAzionePool=null}={}){
 if(!lista)return;lista.className='talos-provider-list';lista.setAttribute('aria-busy',String(caricamento));
 if(errore||!rows.length){const p=el('p','talos-muted',errore?errore.message||String(errore):caricamento?'Leggo gli accessi…':'Nessun fornitore dichiarato dal server.');p.dataset.c='EmptyState';if(errore)p.setAttribute('role','alert');lista.replaceChildren(p);return;}
 const focus=document.activeElement,focusId=focus?.closest('[data-provider-id]')?.dataset.providerId;
 const old=new Map([...lista.querySelectorAll('[data-provider-id]')].map(n=>[n.dataset.providerId,n]));
 const cards=rows.map(row=>{const op={aperta:aperte.has(row.id),prova:prove.get(row.id)||null,occupato:occupati.has(row.id)||caricamento},signature=JSON.stringify([row,op,typeof onAzionePool==='function']),precedente=old.get(row.id);if(precedente?.dataset.salvataggioCollegamento==='in-corso'||precedente?.dataset.providerSignature===signature&&!precedente.dataset.providerReset)return precedente;const card=creaProviderCard(row,{...op,onMenu,onAzionePool});card.dataset.providerSignature=signature;
 if(precedente&&!precedente.dataset.providerReset){for(const input of card.querySelectorAll('input,textarea')){const attr=[...input.attributes].find(a=>a.name.startsWith('data-provider-'));const prima=precedente.querySelector('['+attr.name+']');if(prima){prima.disabled=input.disabled;prima.className=input.className;prima.placeholder=input.placeholder;input.replaceWith(prima);}}}
 const feedback=precedente?.querySelector('[data-provider-feedback]'),target=card.querySelector('[data-provider-feedback]');if(feedback&&target)target.replaceWith(feedback);return card;});lista.replaceChildren(...cards);
 if(focusId){if(focus.isConnected&&!focus.disabled)focus.focus({preventScroll:true});else cards.find(n=>n.dataset.providerId===focusId)?.querySelector('[data-provider-toggle]')?.focus({preventScroll:true});}
}
/*
 * ⛔ 18/09/2026 — IL PANNELLO SI MONTA UNA VOLTA SOLA, E REGGE ENTRAMBE LE DIREZIONI (corsia 3).
 * Fino a oggi: una riga sola, tollerante su tutto (`head?.`, `if(title)`, `if(test)`) tranne che
 * sull'IDEMPOTENZA — una seconda chiamata creava un SECONDO `#providerRefresh`, cioè due nodi con
 * lo stesso id nel documento. ⛔ Non è un difetto estetico: `getElementById`/`querySelector('#x')`
 * tornano il PRIMO in ordine d'albero, quindi il listener del monolite può finire sul nodo sbagliato
 * in silenzio (ricerca 18/09/2026: HTML, `id` «must be unique amongst all the IDs in the element's
 * tree»; WHATWG DOM issue #1361, feb 2025 — proposta di far tornare `null` invece del primo).
 * ⇒ Qui: (1) timbro `data-*` controllato PRIMA di scrivere, così il montaggio non combatte più con
 * chi ridisegna il pannello dopo di lui; (2) i nodi si cercano nell'una O nell'altra forma
 * (canonica `[data-provider-test-all]` / legacy `#providerTestAll`), così il pannello del mockup
 * sulla schermata e quello legacy in Impostazioni si montano con la stessa funzione; (3) niente
 * esplode se un nodo non c'è.
 */
export function montaProviderPanel(panel){
 if(!panel||panel.dataset.providerMontato)return;
 panel.dataset.providerMontato='true';
 panel.classList.add('talos-provider-panel');
 const head=panel.querySelector('.model-lab-panel-heading')||panel.querySelector('[data-provider-heading]');
 head?.classList.add('talos-page__head');
 const title=head?.querySelector('h4')||head?.querySelector('h2');if(title)title.textContent='Fornitori e accessi';
 const note=head?.querySelector('p');if(note){note.className='talos-muted';note.textContent='Le chiavi restano sul computer. Presenza della chiave, collegamento ed esecuzione sono verifiche distinte.';}
 const test=panel.querySelector('#providerTestAll')||panel.querySelector('[data-provider-test-all]');
 if(test&&!panel.querySelector('#providerRefresh')){test.className='talos-button talos-button--secondary talos-button--sm';test.dataset.c='Button';const refresh=button('refresh','Aggiorna');refresh.id='providerRefresh';delete refresh.dataset.providerAction;test.before(refresh);}
}