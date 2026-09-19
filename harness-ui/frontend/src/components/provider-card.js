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

/*
 * ============================================================================
 * IL VESTITO DEL MOCKUP — le misure, e DOVE STANNO (FASE 4, corsia 2, 19/09/2026)
 * ============================================================================
 * ⛔ TUTTI I NUMERI QUI SOTTO SONO STATI MISURATI DAL DOM VIVO del mockup
 *   (`C:\Users\Antonino\Downloads\TALOS-Calm-Lab-04.html`, md5
 *   `952fd467eff2cdd331f968c419fa1cc0`, rotta `#/impostazioni/modelli/providers`),
 *   con Playwright, il **19/09/2026** — non letti dal suo CSS a occhio.
 *
 *   viewport | contenuto | `.provider-grid`          | card
 *   1440     | 1122      | 2 colonne, gap 20         | **551×332**
 *   1024     | 754       | **1 colonna**, gap 15     | **754×303** e 754×332
 *   `.provider-card`   padding 22 · raggio 12 · bordo 1px · fondo `--panel`
 *   `.provider-head`   flex · align center · gap 12 · margin-bottom 24
 *   `.model-glyph`     38×38 · raggio 10 · bordo 1 · `display:grid` place-items center
 *   `h3`               15px/600 · letter-spacing −0,3px (a 15px = −0,02em)
 *   `.provider-head p` 11px · muted · margin-top 3
 *   `.provider-head>.badge`  `margin-left:auto` · `.badge` 11px/500 · padding 4px 7px
 *                            · raggio 5 · gap 5 · NIENTE bordo
 *   `.status-dot`      5×5 · raggio 50% · `background:currentColor`
 *   `.provider-facts>.div`  flex · gap 10 · padding 12px 0 · filetto in basso
 *   `.provider-actions`     flex · gap 10
 *   `.inline-notice`        flex · gap 10 · bordo 1 · raggio 9 · padding 13/14 · 12px
 *
 * ⛔ PERCHÉ LE REGOLE NON STANNO IN UN FOGLIO — e non è una preferenza, è MISURATO.
 *   Il server serve la app con `style-src 'self' 'nonce-…'` (letto il 19/09/2026
 *   dall'intestazione vera della 4174 e della 4195): un `<style>` creato da JS, un
 *   `setAttribute('style', …)` e un foglio costruito con `new CSSStyleSheet()` sono
 *   TUTTI E TRE respinti — provati uno per uno, `getComputedStyle` tornava il valore
 *   di prima e la console registrava «Applying inline style violates … 'style-src'».
 *   L'unico meccanismo che passa è l'assegnazione di PROPRIETÀ sul CSSOM
 *   (`nodo.style.padding='22px'`): il testo della direttiva non lo copre — MDN
 *   «Content-Security-Policy: style-src», «styles properties that are set directly
 *   on the element's `style` property will not be blocked»
 *   (<https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src>,
 *   letta il 19/09/2026). ⇒ Qui si veste con il CSSOM, ed è la stessa forma che questo
 *   file usava già (`Object.assign(input.style, …)`), non un'invenzione.
 *   ⛔ I COLORI NON SI COPIANO DAL MOCKUP: il mockup ha una palette sua che per nove
 *     decimi coincide con i nostri token, e la regola di casa è che una superficie si
 *     accende e si spegne COL TEMA (lezione di `banda-laboratorio.css`, 19/09/2026).
 *     ⇒ Si portano le MISURE, i colori restano `var(--talos-*)`.
 *
 * La GRIGLIA, e perché `min(100%, 340px)`: la soglia del mockup è a 754 di contenuto
 * (due colonne da 551 ne vogliono 1122), quindi si esprime **relativa al contenitore**
 * invece che al viewport — il contenitore delle Impostazioni è più stretto del suo
 * (misurato: `#modelLabCard` 842, il gruppo delle schede 792, contro i 1122 del mockup).
 * `repeat(auto-fit, minmax(min(100%, 340px), 1fr))` sceglie il numero di colonne da sé e
 * NON sfonda quando il contenitore è più stretto della soglia: è la stessa meccanica
 * dell'auto-repeat di CSS Grid Level 1 — «the largest possible positive integer that
 * does not cause the grid to overflow its grid container»
 * (<https://www.w3.org/TR/css-grid-1/#auto-repeat>, consultata il 19/09/2026) — con la
 * guardia `min(100%, …)` documentata per il caso in cui anche UNA ripetizione
 * sfonderebbe (vedi anche la revisione comunitaria del pattern, letta il 19/09/2026).
 */
const VESTITO=Object.freeze({
 /* ⛔ `align-items` NON si dichiara: il mockup non lo dichiara, e le sue due card — una con TRE
    fatti e una con DUE — misurano entrambe **332** di altezza. È lo `stretch` di serie della
    griglia a pareggiarle, e senza di lui due card della stessa riga finirebbero di altezze
    diverse. (Misurato sul DOM vivo, 19/09/2026.) */
 griglia:{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',gap:'20px'},
 carta:{padding:'22px',borderRadius:'12px',border:'1px solid var(--talos-border)',background:'var(--talos-panel)',minWidth:'0'},
 /* `flex-wrap:wrap` è la regola del mockup a contenitore stretto (misurato a 1024:
    `.provider-head{flex-wrap:wrap}`; il mockup ci arriva con una media query, qui è la
    stessa cosa senza — e serve perché la pastiglia non sfondi la card a due colonne). */
 testata:{display:'flex',alignItems:'center',flexWrap:'wrap',gap:'12px',marginBottom:'24px',textAlign:'left',minWidth:'0'},
 glifo:{display:'grid',placeItems:'center',width:'38px',height:'38px',flex:'none',borderRadius:'10px',border:'1px solid var(--talos-border)',background:'var(--talos-card)',color:'var(--talos-muted)'},
 identita:{display:'grid',gap:'3px',minWidth:'0'},
 nome:{fontSize:'15px',fontWeight:'600',letterSpacing:'-.02em',lineHeight:'1.4'},
 identificatore:{fontSize:'11px',color:'var(--talos-muted)',overflowWrap:'anywhere'},
 stato:{marginLeft:'auto',flex:'none'},
 pastiglia:{minHeight:'0',padding:'4px 7px',borderRadius:'5px',borderWidth:'0',gap:'5px',fontSize:'11px',fontWeight:'500',lineHeight:'1.4'},
 punto:{width:'5px',height:'5px'},
 fatti:{margin:'0 0 24px'},
 azioni:{display:'flex',flexWrap:'wrap',gap:'10px'},
 avviso:{display:'flex',alignItems:'flex-start',gap:'10px',border:'1px solid var(--talos-border)',borderRadius:'9px',padding:'13px 14px',margin:'0 0 18px',color:'var(--talos-muted)',fontSize:'12px',lineHeight:'1.65'},
});
function vesti(nodo,stile){if(nodo)Object.assign(nodo.style,stile);return nodo;}
/** Il simbolo di un fornitore. La mappa sta in UN posto solo, e sceglie da dati veri del server. */
function simboloFornitore(row){
 if(row.id==='esterno')return 'i-robot';           // un agente che gira fuori da TALOS
 if(row.execution==='runtime locale')return 'i-brain'; // il modello sta su questa macchina
 return 'i-globe';                                  // un servizio raggiunto in rete
}
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

export function creaProviderCard(row,{aperta=false,prova=null,occupato=false,onMenu=null,onAzionePool=null,ambito=''}={}){
 const esterno=row.id==='esterno',configurazionePropria=esterno||CLOUD_CONFIGURABILI.has(row.id);
 /*
  * ⛔⛔ L'ID DEL CORPO PORTA IL NOME DELLA SUPERFICIE — segnalato dalla corsia 4 il 19/09/2026 e
  *   MISURATO qui: `document.querySelectorAll('#provider-body-openrouter').length` valeva **2**,
  *   e vale **1** quando il velo è chiuso. Il velo «Fornitori e accessi» disegna lo STESSO
  *   fornitore del pannello con lo STESSO renderer, quindi per un po' di tempo il documento aveva
  *   due nodi con lo stesso id — e `getElementById`/`querySelector('#x')` tornano il PRIMO in
  *   ordine d'albero, quindi `aria-controls` poteva puntare alla card SBAGLIATA senza un errore.
  *   È la stessa classe di difetto di `#schermoHome` doppio (18/09: la Home galleggiava sopra la
  *   chat sul server dell'owner) e di `#providerRefresh` doppio (18/09).
  * ⛔ E IL SUFFISSO VA SOLO AL VELO, non al pannello: gli id del pannello sono congelati dal
  *   cancello dell'identità (`tests/browser/fixtures/inventario-sezioni.json`, chiave `models`,
  *   118 id). Rinominarli lo farebbe diventare rosso — cioè la cura di un difetto ne aprirebbe
  *   un altro. ⇒ `ambito` è vuoto per il pannello, `'velo'` per il dialogo: **1 e 1**, non 2 e 0.
  */
 const idCorpo='provider-body-'+(ambito?ambito+'-':'')+row.id;
 const d=statoProvider(row,prova),busy=occupato||d.occupato,card=el('article','talos-card talos-provider');card.dataset.c='ProviderCard';card.dataset.providerId=row.id;card.setAttribute('aria-busy',String(busy));if(prova)card.dataset.provaEsito=prova.esito;
 vesti(card,VESTITO.carta);
 /*
  * ⛔ 19/09/2026 — LA TESTATA NON È PIÙ UN PULSANTE, ed è la forma del mockup: `.provider-head`
  *   è un `div` con glifo, nome, sottotitolo e UNA pastiglia di stato. Il pulsante che apre la
  *   configurazione è «Configura», in fondo alla card, come nel mockup (`provider-actions`).
  *   ⛔ Cosa si guadagna, oltre alla forma: prima il nome accessibile della testata era la
  *     CONCATENAZIONE delle tre pastiglie («OpenAI Chiave dall'ambiente Indirizzo predefinito
  *     Mai provato») — un pulsante che si annuncia così non dice cosa fa. Ora il nome della card
  *     è testo, e il comando ha un nome suo.
  *   ⛔ Cosa NON si perde: tutti e tre i fatti restano sulla card, sempre visibili, nella riga
  *     «Credenziale · Configurazione · Ultima prova» del mockup (`.provider-facts`).
  */
 /*
  * ⛔ E NON SI CHIAMA PIÙ `talos-provider__head`, ed è una riga che conta: quella classe porta
  *   `.talos-provider__head:after{content:"+"}` (`index.css:2688`), il segno di apertura di
  *   QUANDO la testata era un pulsante. Su un `div` non aprirebbe niente e resterebbe lì per
  *   sempre, perché un `:after` non si spegne da CSSOM. Trovato nella FOTO del 19/09/2026:
  *   un `+` disegnato accanto alla pastiglia di ogni card. Verificato che nessuna prova del
  *   repo nomina quella classe (grep su `tests/`, 19/09/2026): solo `--__body`, `--__name`
  *   e `-panel` sono lette da fuori.
  */
 const head=el('div','talos-provider__testata');vesti(head,VESTITO.testata);
 const glifo=el('span','talos-provider__glifo');vesti(glifo,VESTITO.glifo);
 const iconaGlifo=simboloProvider(simboloFornitore(row));iconaGlifo.setAttribute('class','i');Object.assign(iconaGlifo.style,{width:'19px',height:'19px'});
 glifo.append(iconaGlifo);
 const identita=el('span','talos-provider__identita');vesti(identita,VESTITO.identita);
 const title=el('strong','talos-provider__name',row.label||row.id);vesti(title,VESTITO.nome);
 /* ⛔ Il nome umano è primario, l'id grezzo è secondario — `provider-head p` del mockup. L'id
    NON è decorazione: è la chiave che il server riconosce, e per dodici fornitori su ventotto
    dice qualcosa che l'etichetta non dice (`zai-anthropic`, `ollama-cloud`, `lmstudio`…). */
 const identificatore=el('span','talos-provider__id',row.id);
 identificatore.setAttribute('aria-hidden','true'); // il nome accessibile resta un nome
 vesti(identificatore,VESTITO.identificatore);
 identita.append(title,identificatore);
 const marks=el('span','talos-cluster');vesti(marks,VESTITO.stato);
 /*
  * UNA pastiglia, non tre: è la riga di stato del mockup, col suo punto. Credenziale e indirizzo
  * scendono nei fatti — non spariscono, cambiano posto (vedi `provider-facts`).
  */
 {
  const badge=el('span','talos-badge talos-badge--sm'+(d.tono?' talos-badge--'+d.tono:''));badge.dataset.c='Badge';
  const punto=el('span','talos-dot'+(d.tono?' talos-dot--'+d.tono:''));punto.setAttribute('aria-hidden','true');vesti(punto,VESTITO.punto);
  badge.append(punto,el('span','',d.prova));vesti(badge,VESTITO.pastiglia);marks.append(badge);
 }
 head.append(glifo,identita,marks);card.append(head);
 /*
  * I FATTI — `.provider-facts` del mockup, e la forma ce l'abbiamo GIÀ: `.talos-kv` dentro
  * `#schermoImpostazioni[data-settings-ui="v3"]` è, parola per parola,
  * `gap:10px; padding:12px 0; border-block-end:1px` con le due parti a 12px
  * (`src/design-system/settings.css:364-372`, scritto il 18/09 dalla FASE 2 e verde nel
  * cancello `_fase2-vestito.spec.mjs`). ⇒ Nessuna regola nuova: si usano le classi che ci sono.
  * ⛔ OGNI RIGA PORTA UN CAMPO CHE IL SERVER HA DAVVERO MANDATO. La riga «Configurazione»
  *   compare solo dove il fornitore DICHIARA di saper reggere un indirizzo (`supportsEndpoint`):
  *   per Anthropic, Gemini e l'agente esterno il mockup non ha un equivalente e non si inventa.
  */
 const fatti=el('div','talos-provider__fatti');vesti(fatti,VESTITO.fatti);
 /*
  * ⛔ TRE CHIAVI, E SONO QUELLE DEL MOCKUP — `Credenziale · Configurazione · Ultima prova`. E sono
  *   anche le tre cose che la nota di questa pagina nomina da sempre: «presenza della chiave,
  *   collegamento ed esecuzione sono verifiche distinte». Nessun campo grezzo del server sale a
  *   schermo: `row.execution` vale `collegato` per 22 fornitori su 28 ed è un valore di enum, non
  *   una frase — mostrarlo sotto un'etichetta italiana sarebbe rumore travestito da dato.
  * ⛔ E dove un indirizzo non c'è (Anthropic, Gemini, l'agente esterno: `supportsEndpoint` falso)
  *   la riga NON compare: due righe, che è esattamente la card locale del mockup. Una riga con
  *   dentro «non previsto» sarebbe una parola nostra, e le parole nostre non si inventano.
  */
 for(const [k,v]of [['Credenziale',d.chiave],['Configurazione',etichettaIndirizzo(row)],['Ultima prova',d.prova]])
  if(v)  {const riga=el('div','talos-kv');riga.dataset.c='KeyValue';riga.append(el('span','talos-kv__k',k),el('span','talos-kv__v',v));fatti.append(riga);}
 card.append(fatti);
 const body=el('div','talos-provider__body');body.id=idCorpo;body.hidden=!aperta;
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
  *   `[data-provider-action]` (app.js:3197, 4700) le trova al `.click()` senza sapere del menu.
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
 /*
  * ⛔⛔ 19/09/2026 — «PROVA COLLEGAMENTO» ESCE DAL MENU «⋯» E DIVENTA IL «VERIFICA ACCESSO» DEL
  *   MOCKUP, in fondo alla card. Tre ragioni, in ordine di peso:
  *   1. il mockup mette la sonda fra le azioni della card, non in un menu (`provider-actions`);
  *   2. nel menu era **hidden**, quindi il comando si poteva invocare solo aprendo «⋯»: un
  *      controllo che dice lo stato di un accesso deve stare DOVE quello stato si legge;
  *   3. un nodo solo per card, in un posto solo — con due nodi che portano lo stesso
  *      `data-provider-action="test"` un `.click()` dal di fuori diventa ambiguo.
  *   ⛔ E per l'agente esterno NON si sposta: lì la sonda è già visibile nel corpo
  *     (`Prova collegamento`, ed è il gesto principale di quella card) e il menu non l'ha mai
  *     nascosta. Spostarla anche lì darebbe due comandi identici sulla stessa card.
  */
 const test=button('test',esterno?'Prova collegamento':'Verifica accesso');
 const vociMenu=[];
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
 if(esterno){test.hidden=false;actions.append(test);for(const v of vociMenu){v.elemento.hidden=false;} }
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
 /*
  * ⛔⛔ IL PIEDE DELLA CARD — le `.provider-actions` del mockup, e sta FUORI dal corpo.
  *   Fuori non è estetica: `.talos-provider__body` è il pannello che si apre e si chiude, e
  *   «Configura» deve funzionare anche da CHIUSA — è l'unico comando che la card mostra quando
  *   è chiusa. (E due prove di `tests/unit/provider-pkl-bis-dom.test.mjs` contano i pulsanti
  *   VISIBILI dentro `.talos-provider__body`: aggiungerne uno lì dentro le farebbe rosse. Il
  *   piede fuori dal corpo tiene quel contratto invece di doverlo rinegoziare.)
  * ⛔ «Configura» È il disclosure della card: `data-provider-toggle` + `aria-expanded` +
  *   `aria-controls`, e la regia delegata (`app.js:3189`, `:4780`) lo trova senza sapere che
  *   esiste — è la stessa forma che aveva la testata, spostata sul comando che la nomina.
  * ⛔ «Verifica accesso» è `data-provider-action="test"`: la sonda VERA, non una finta. Per
  *   l'agente esterno il piede non la porta (vedi la nota sopra `test`).
  */
 const piede=el('div','talos-provider__azioni');vesti(piede,VESTITO.azioni);
 /*
  * ⛔ IL NOME ACCESSIBILE NON CAMBIA COL VERSO DEL COMANDO — e questa riga nasce da una ricerca
  *   che ha SMENTITO la mia prima stesura (19/09/2026). Il pulsante diceva «Configura» da chiuso
  *   e «Chiudi» da aperto, con un `aria-label` capovolto insieme al testo: è il modello che le
  *   fonti SCONSIGLIANO, perché nome e stato finiscono per annunciare la stessa cosa due volte e
  *   in versi opposti («Nascondi, aperto»). W3C WAI-ARIA APG, pattern Disclosure: `aria-expanded`
  *   sull'elemento che apre, lo stato LÌ, e il nome che nomina il CONTENUTO («Configura OpenAI»),
  *   non l'azione del momento
  *   (<https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-card/>, letta il
  *   19/09/2026). La regola per esteso, e la ragione: il nome di un controllo non si cambia mentre
  *   lo si sta usando
  *   (<https://amplify.studio24.net/amplify/advanced-components/disclosure-widget.html>, letta il
  *   19/09/2026), col caso di scuola che le fonti citano e che si vede in un audit vero: il testo
  *   visibile dice «Mostra» e il nome accessibile «Nascondi il sottomenu» mentre il menu è chiuso.
  * ⇒ Testo visibile STABILE, nome STABILE (e contiene la parola visibile: WCAG 2.5.3 «Label in
  *   Name»), stato solo in `aria-expanded`. Il verso del comando, a schermo, lo dice il corpo che
  *   si apre — non serve dirlo due volte.
  */
 const configura=el('button','talos-button talos-button--secondary talos-button--sm','Configura');
 configura.type='button';configura.dataset.c='Button';configura.dataset.providerToggle=row.id;
 configura.setAttribute('aria-expanded',String(aperta));configura.setAttribute('aria-controls',idCorpo);
 configura.setAttribute('aria-label','Configura '+(row.label||row.id));
 piede.append(configura);
 if(!esterno){test.disabled=busy;piede.append(test);}
 card.append(body,piede);
 }
 return card;
}
export function aggiornaProviderList(lista,rows,{aperte=new Set(),prove=new Map(),occupati=new Set(),caricamento=false,errore=null,onMenu=null,onAzionePool=null}={}){
 if(!lista)return;lista.className='talos-provider-list';lista.setAttribute('aria-busy',String(caricamento));
 /* La griglia del mockup (due colonne a 1122 di contenuto, una a 754): vedi `VESTITO.griglia`. */
 vesti(lista,VESTITO.griglia);
 /* ⛔ Un messaggio solo non è una card: nell'elenco vuoto la griglia si spegne, o il testo
    resterebbe incolonnato in una cella da 340 invece di leggersi come una riga. */
 if(errore||!rows.length){const p=el('p','talos-muted',errore?errore.message||String(errore):caricamento?'Leggo gli accessi…':'Nessun fornitore dichiarato dal server.');p.dataset.c='EmptyState';if(errore)p.setAttribute('role','alert');lista.replaceChildren(p);lista.style.display='block';return;}
 const focus=document.activeElement,focusId=focus?.closest('[data-provider-id]')?.dataset.providerId;
 const old=new Map([...lista.querySelectorAll('[data-provider-id]')].map(n=>[n.dataset.providerId,n]));
 /*
  * ⛔ L'AMBITO — la stessa riga può essere disegnata in DUE posti insieme (il pannello del
  *   laboratorio e il velo «Fornitori e accessi»): è da lì che nasceva `#provider-body-openrouter`
  *   doppio. Il segno della superficie ce l'ha la LISTA, non il chiamante: il velo la marca
  *   `data-velo-lista` (`app.js`, `popolaVeloFornitori`), il pannello no. ⇒ Si legge da qui, e
  *   nessun chiamante deve ricordarsi di passarlo — che è il modo in cui un parametro si dimentica.
  */
 const ambito=lista.hasAttribute?.('data-velo-lista')||lista.closest?.('#veloFornitori')?'velo':'';
 const cards=rows.map(row=>{const op={aperta:aperte.has(row.id),prova:prove.get(row.id)||null,occupato:occupati.has(row.id)||caricamento},signature=JSON.stringify([row,op,typeof onAzionePool==='function']),precedente=old.get(row.id);if(precedente?.dataset.salvataggioCollegamento==='in-corso'||precedente?.dataset.providerSignature===signature&&!precedente.dataset.providerReset)return precedente;const card=creaProviderCard(row,{...op,onMenu,onAzionePool,ambito});card.dataset.providerSignature=signature;
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
 curaDoppiaTestata(panel,head,title,note);
}
/*
 * ⛔⛔ D9 — LA DOPPIA TESTATA. MISURATA, NON DEDOTTA (19/09/2026, 4174 in sola lettura, tema scuro,
 *   viewport 1440, scheda «Provider» aperta). Sulla schermata viva c'erano DUE intestazioni
 *   impilate, tutte e due visibili:
 *
 *     H3  «Collegamenti, non scatole nere.»   792×30   20px/600   → il guscio a quattro schede
 *                                                                  (`lab-cornice-v3.js:193`, `[data-lab-frase]`)
 *     H4  «Fornitori e accessi»               671×21   14px/700   → il pannello legacy, rinominato
 *                                                                  qui sopra
 *
 *   ⇒ Il difetto ESISTE, ed è questo: **due nomi per la stessa pagina**, a 30 px di distanza.
 *   ⛔ La cura NON è cancellare un nodo: il `<h4>` è la testata del pannello legacy, che vive
 *     ANCHE fuori dal guscio (la schermata Impostazioni, il velo) e là è l'unica che c'è.
 *     E `tests/browser/lab-montaggio-neutro.spec.mjs:571` pretende che il suo testo resti
 *     «Fornitori e accessi». ⇒ Si nasconde (`hidden`), non si rimuove: il testo resta nel DOM,
 *     il cancello resta verde, e chi guarda vede UNA testata sola.
 *   ⛔ E si nasconde SOLO DENTRO IL GUSCIO: la condizione è «questo pannello sta in una carta del
 *     laboratorio che porta già la frase della scheda?». Fuori di lì — velo compreso — la testata
 *     del pannello resta al suo posto, com'era.
 *   ⛔ La FRASE del pannello non si butta: scende nell'avviso in fondo alla griglia, che è la
 *     posizione in cui il mockup tiene la sua nota di sicurezza (`.inline-notice`, misurato:
 *     flex · gap 10 · bordo 1 · raggio 9 · 13/14 di padding · 12px). ⛔ E il testo dell'avviso è
 *     il NOSTRO, non quello del mockup: «Qui non inserire chiavi reali.» in TALOS è FALSO — qui
 *     le chiavi vere si inseriscono, è il posto apposta. Stessa scelta, e stesso precedente, della
 *     politica della banda (`lab-cornice-v3.js:334` «la frase del mockup NON si copia»), decisa
 *     dall'owner il 19/09/2026.
 */
function curaDoppiaTestata(panel,head,title,note){
 const dentroIlGuscio=Boolean(panel.closest?.('#modelLabCard')?.querySelector('[data-lab-frase]'));
 if(!dentroIlGuscio||!title||!note)return;
 title.hidden=true;note.hidden=true;
 if(panel.querySelector('[data-provider-avviso]'))return;
 const avviso=el('div','talos-provider__avviso');avviso.dataset.providerAvviso='';vesti(avviso,VESTITO.avviso);
 const icona=simboloProvider('i-shield');icona.style.flex='none';icona.style.marginTop='2px';
 const testo=el('span','');
 const forte=el('strong','','Le chiavi restano sul computer.');
 Object.assign(forte.style,{color:'var(--talos-text)',fontWeight:'550'});
 testo.append(forte,document.createTextNode(' '+note.textContent.replace(/^Le chiavi restano sul computer\.\s*/u,'')));
 avviso.append(icona,testo);
 /*
  * ⛔ DOVE VA L'AVVISO, E PERCHÉ NON DOVE STA NEL MOCKUP. Il mockup lo mette DOPO la griglia
  *   (`.provider-grid{margin-bottom:24px}` e l'avviso le sta sotto) — e con le sue **2 card**
  *   è la riga successiva, a un dito dal titolo. Da noi le card sono **28**: la stessa posizione
  *   manderebbe la frase a circa **5.000 px** sotto, cioè a una schermata e mezza da chi la
  *   legge — e quella frase, «Le chiavi restano sul computer», era **in testa** fino a ieri.
  *   Spostarla in fondo non sarebbe una perdita nel DOM, sarebbe una perdita DI FATTO. ⇒ Sta
  *   subito sotto i comandi, dov'era: stesso elemento, stesso stile del mockup, stesso testo.
  *   La differenza di posizione è dichiarata, non nascosta.
  */
 if(head)head.after(avviso);else panel.prepend(avviso);
}