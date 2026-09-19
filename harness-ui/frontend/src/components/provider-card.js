// ProviderCard: credenziale presente, configurazione e sonda restano tre fatti distinti.
/*
 * ⛔ 19/09/2026 (FASE 4-bis) — IL MARCHIO VERO ENTRA NEL GLIFO. Fino a ieri il riquadro portava
 *   un simbolo di FAMIGLIA (robot / cervello / globo): tre disegni per ventotto fornitori, e
 *   nessuno che dicesse QUALE. La mappa fornitore → marchio, la licenza e la provenienza stanno
 *   in `loghi-fornitori.js` — qui si usa e basta. Il ripiego per chi non ha un marchio verificabile
 *   è ancora quello di prima, e il file lo tiene in un posto solo.
 */
import { glifoFornitore, marchioDiFornitore } from './loghi-fornitori.js';
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
 /*
  * `.button` del mockup, misurato dal DOM vivo il 19/09/2026 sulle `.provider-actions`:
  *   min-height 38 · padding 9px 13px · raggio 8 · bordo 1 · 12px/550 · gap 8 · icona 16×16.
  * ⛔ Si veste QUI, con le proprietà del CSSOM, e non con una variante nuova di `.talos-button`:
  *   la misura è della CARD del mockup, non del sistema di design — e una variante nuova sarebbe
  *   una regola di prodotto che nessuno ha chiesto (e `src/styles/*` non è di questa corsia).
  *   I numeri di partenza erano: altezza 32, bordo 2, peso 600, gap 10, nessuna icona.
  */
 pulsante:{minHeight:'38px',padding:'9px 13px',borderRadius:'8px',borderWidth:'1px',gap:'8px',fontSize:'12px',fontWeight:'550',lineHeight:'1.4',whiteSpace:'normal'},
 /*
  * LA MODALE DI «CONFIGURA» — `.dialog` del mockup, misurato dal DOM vivo il 19/09/2026:
  *   600×513,8 · raggio 16 · bordo 1 · `0 32px 90px rgb(0 0 0/30%)`
  *   `.dialog-header` padding 25px 26px 17px · gap 18 · align flex-start · justify space-between
  *   `h2` 22px · line-height 1.3 · letter-spacing −0,035em
  *   `.dialog-body` padding 2px 26px 24px
  *   `.dialog-footer` flex · justify flex-end · gap 10 · padding 16px 26px 21px · filetto in alto
  *   `.icon-button` 36×36 · raggio 7 · `place-items: center` · `.eyebrow` 10px/500 · ls .17em
  * ⛔ L'OCCHIELLO DEL MOCKUP NON SI PORTA: dice «TALOS · ANTEPRIMA INTERATTIVA», che è il cartello
  *   del prototipo. Nel prodotto sarebbe FALSO — è la stessa regola della frase di sicurezza
  *   («Qui non inserire chiavi reali», vedi `curaDoppiaTestata`), decisa dall'owner il 19/09/2026.
  *   Nella tabella delle differenze è dichiarato invece che nascosto.
  */
 modale:{
  dialogo:{padding:'0',border:'1px solid var(--talos-border)',borderRadius:'16px',background:'var(--talos-panel)',color:'var(--talos-text)',width:'600px',maxWidth:'calc(100vw - 36px)',maxHeight:'calc(100dvh - 48px)',boxShadow:'0 32px 90px rgb(0 0 0 / 30%)',overflow:'hidden'},
  testa:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'18px',padding:'25px 26px 17px'},
  titolo:{margin:'0',fontSize:'22px',fontWeight:'600',lineHeight:'1.3',letterSpacing:'-.035em',overflowWrap:'anywhere'},
  chiudi:{width:'36px',height:'36px',flex:'none',display:'grid',placeItems:'center',borderRadius:'7px',color:'var(--talos-muted)',borderWidth:'0',background:'transparent',padding:'0'},
  /*
   * ⛔ IL CORPO SCORRE, E QUESTA RIGA È NATA DA UNA FOTO — non da un ragionamento. Il primo
   *   giro mostrava la modale col contenuto TAGLIATO: «Salva chiave» finiva sotto il bordo e non
   *   c'era modo di raggiungerlo. Le altre due parti erano già fisse (la testata e il piede non
   *   hanno `flex`), ma senza `flex:1` e `overflow:auto` il corpo non scorreva: il `<dialog>` ha
   *   `overflow:hidden` e il contenuto che non ci sta viene semplicemente perso.
   *   È il vincolo che la ricerca del brief chiede — «altezza ≤ 80-90vh con testata e piede fissi
   *   e solo il corpo che scorre» (<https://vercel.com/geist/modal>, letta il 19/09/2026) — e
   *   senza, il piede resta raggiungibile ma i CAMPI no.
   */
  corpo:{padding:'2px 26px 24px',flex:'1 1 auto',minHeight:'0',overflowY:'auto'},
  piede:{display:'flex',justifyContent:'flex-end',gap:'10px',padding:'16px 26px 21px',borderTop:'1px solid var(--talos-border)'},
  /* `.dialog-footer .button { min-height: 40px }` — misurato, non dedotto. */
  pulsante:{minHeight:'40px',paddingLeft:'14px',paddingRight:'14px'},
 },
 /*
  * LA RIGA DEI FILTRI — `catalogo-faccette.js` è la FORMA già approvata per una barra a faccette
  * (ricerca + chip coi conteggi + «Togli i filtri»); qui se ne portano le stesse classi e le stesse
  * misure, senza inventarne un'altra. Ricerca 19/09/2026, fonti nella testata dei filtri: il
  * conteggio per valore è ciò che rende una faccetta intelligente, OR dentro una faccetta e AND
  * fra faccette, i valori a zero si grigiano.
  */
 filtri:{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'10px',margin:'0 0 16px'},
});
/* ⛔ IL NOME DEGLI ATTRIBUTI CHE I FILTRI USANO, in un posto solo: li scrive il disegno e li
   rilegge il filtro, e due stringhe scritte a mano in due punti sono un rinominamento mancato. */
const FILTRO_CHIP='providerFilter';
function vesti(nodo,stile){if(nodo)Object.assign(nodo.style,stile);return nodo;}
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
/*
 * L'AVVISO CHE DICE DOVE FINISCONO LE CHIAVI — una frase, un posto, e due superfici che la usano
 * (il pannello e la modale di «Configura»). Nel mockup questa nota sta DENTRO la modale, col suo
 * `.inline-notice` (misurato: flex · gap 10 · bordo 1 · raggio 9 · 13/14 · 12px): è lì che si
 * scrivono le credenziali, ed è lì che serve leggerla. Le PAROLE restano le nostre — quelle del
 * mockup («Confermando si modifica solo lo stato temporaneo del prototipo») in TALOS sarebbero
 * false, ed è la stessa scelta già presa per la frase di sicurezza il 19/09/2026.
 */
const NOTA_CHIAVI='Le chiavi restano sul computer.';
const NOTA_CHIAVI_RESTO='Presenza della chiave, collegamento ed esecuzione sono verifiche distinte.';
function creaAvvisoChiavi(){
 const avviso=el('div','talos-provider__avviso');vesti(avviso,VESTITO.avviso);
 const icona=simboloProvider('i-shield');icona.style.flex='none';icona.style.marginTop='2px';
 const forte=el('strong','',NOTA_CHIAVI);Object.assign(forte.style,{color:'var(--talos-text)',fontWeight:'550'});
 const testo=el('span','');testo.append(forte,document.createTextNode(' '+NOTA_CHIAVI_RESTO));
 avviso.append(icona,testo);return avviso;
}

/** Il simbolo di un'icona dello sprite. Il file non aveva icone: nasce qui, minimo. */
function simboloProvider(nome){const NS='http://www.w3.org/2000/svg';const svg=document.createElementNS(NS,'svg');svg.setAttribute('class','i i--sm');svg.setAttribute('aria-hidden','true');const use=document.createElementNS(NS,'use');use.setAttribute('href','#'+nome);svg.append(use);return svg;}

/*
 * LE DUE ICONE DELLE AZIONI DELLA CARD, e sono QUELLE DEL MOCKUP — non due icone «simili».
 * Tracciati presi dal suo DOM vivo il 19/09/2026 (`[data-action="configure-provider"]` e
 * `[data-action="probe-provider"]`: due `path` e due `circle` per la prima, un `path` per la
 * seconda). Sono disegnate qui e non aggiunte allo sprite perché lo sprite vive in
 * `index.template.html`, che non è di questa corsia.
 * `.provider-actions .button .icon` del mockup: 16×16, `stroke-width: 1.65`, `linecap: round`.
 */
const ICONE_AZIONE=Object.freeze({
 /* I cursori: due righe con due manopole — «metti a punto», cioè configura. */
 configura:[['path','M4 7h9m4 0h3M4 17h3m4 0h9'],['circle',{cx:'15',cy:'7',r:'2'}],['circle',{cx:'9',cy:'17',r:'2'}]],
 /* Le due frecce circolari: «interroga il servizio e riporta», cioè verifica. */
 verifica:[['path','M20 7v5h-5M4 17v-5h5m-4-4a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3']],
 /* La croce di chiusura della testata della modale (`.icon-button`, misurata: 18×18 dentro 36×36). */
 chiudi:[['path','m6 6 12 12M6 18 18 6']],
});
function iconaAzione(nome,lato='16px'){
 const NS='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(NS,'svg');
 svg.setAttribute('class','i');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
 svg.setAttribute('stroke-width',nome==='chiudi'?'1.65':'1.65');
 svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
 Object.assign(svg.style,{width:lato,height:lato,flex:'none'});
 for(const [tag,spec]of ICONE_AZIONE[nome]){
  const n=document.createElementNS(NS,tag);
  if(tag==='path')n.setAttribute('d',spec);else for(const [k,v]of Object.entries(spec))n.setAttribute(k,v);
  svg.append(n);
 }
 return svg;
}

/*
 * ============================================================================
 * LA MODALE DI «CONFIGURA» (FASE 4-bis, 19/09/2026)
 * ============================================================================
 * ⛔ COSA HA DETTO L'OWNER: «quando faccio "Configura" mi apre una modale del mock-up. Invece su
 *   4174 c'è un **collapse bruttissimo**». Il mockup, misurato dal DOM vivo: `#dialog.dialog`,
 *   600×513,8, titolo «Configura OpenRouter», i campi dentro, e in fondo Annulla + una primaria.
 *
 * ⛔ PERCHÉ LA MODALE VIVE DENTRO LA CARD, e non su `document.body`. Non è una preferenza: la
 *   regia del prodotto legge i campi DALLA CARD, e li legge con due righe misurate —
 *     `app.js` `gestisciAzioneProvider`: `const card = button.closest('[data-provider-id]')`
 *     poi `card.querySelector('[data-provider-key]')` / `[data-provider-endpoint]` / `[data-provider-timeout]`
 *   ⇒ una modale appesa a `document.body` farebbe tornare `null` da `closest`, e **ogni salvataggio
 *     morirebbe in silenzio** — senza un errore, con l'interfaccia che sembra viva. Un `<dialog>`
 *     dentro la card invece **si disegna lo stesso nel top layer** (è il livello del browser, non
 *     una questione di albero), quindi si hanno tutte e due le cose: la modale modale, e i campi
 *     dove la regia li cerca.
 *
 * ⛔ SI USA IL CONTRATTO NATIVO, non un secondo gestore e non una seconda regia. `<dialog>` +
 *   `showModal()` danno, senza una riga di codice: la trappola del fuoco, l'`inert` di tutto ciò
 *   che sta fuori, la chiusura con Esc, il `::backdrop`, e il fuoco che TORNA a chi ha aperto.
 *   È la strada che il prodotto ha già scelto e scritto una volta sola, per il cercatore delle
 *   Impostazioni (`features/settings/settings-view.ts:540-552`, 18/09/2026): «PERCHÉ `<dialog>`
 *   NATIVO E NON UNA MODALE NOSTRA … NON si aggiunge un trap di fuoco in JS (`over-trapping`
 *   impedisce di raggiungere la barra del browser) e NON si aggiunge `inert` a mano: lotterebbe
 *   col ritorno del fuoco», con W3C WCAG Technique H102 e CSS-Tricks «There is No Need to Trap
 *   Focus on a Dialog Element» come fonti.
 *   ⛔ E NON SI COMBATTE COL GESTORE DEI VELI: `manager.ts:45-48` lo dice con le sue parole —
 *     «A native modal opened by an independent host keeps the browser's own focus contract»:
 *     un `<dialog>` aperto da un ospite indipendente è un OSPITE LEGITTIMO, e il gestore si fa da
 *     parte (`foreignNativeModal()`) invece di contenderselo. Un `activate()` scritto a mano qui
 *     sarebbe la seconda regia che questa casa non vuole.
 *   ⛔ E la veste è `.td-modal`, che in questo repo È la modale del mockup portata
 *     (`src/styles/mockup-td.css`, lotto G): si porta per il `::backdrop` — l'unica cosa che dal
 *     CSSOM non si può scrivere (`::backdrop` non è un nodo) — e le misure del mockup la
 *     sovrascrivono proprietà per proprietà qui sopra, in `VESTITO.modale`.
 *
 * ⛔ IL FUOCO. Entra nel primo controllo utile (la ricerca del brief, 19/09/2026: «il fuoco entra
 *   nel primo controllo e torna al pulsante che ha aperto»), e ci torna alla chiusura. W3C WAI-ARIA
 *   APG «Dialog (Modal) Pattern»: il fuoco si sposta dentro il dialogo e si restituisce all'elemento
 *   che l'ha aperto — <https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/>, letta il 19/09/2026.
 *
 * ⛔ ESC CHIUDE SEMPRE (WCAG 2.1.2 «No Keyboard Trap»), e lo fa il `<dialog>` nativo. Quello che
 *   si aggiunge è il `stopPropagation`: `legacy/app.js` ha una catena di Esc (chiudi palette →
 *   chiudi foglio → chiudi pannelli → «fermo il giro?»), e senza fermarla chiudere questa modale
 *   farebbe partire la domanda sul giro in corso. È la stessa riga di `modale-td.js`.
 *
 * ⛔ DAL VELO NON SI CHIUDE — e qui si DISOBBEDISCE al mockup, di proposito. Il mockup chiude sul
 *   clic nel velo (misurato: clic a fuori → `dialog[open]` sparisce), e anche `modale-td.js` lo fa.
 *   Ma qui dentro ci sono le CHIAVI E L'INDIRIZZO che si stanno scrivendo, e la ricerca del brief è
 *   esplicita: «su un form con dati non si chiude dal velo (si perde quello che si è scritto)»
 *   (<https://vercel.com/geist/modal> · <https://www.shaheermalik.com/blog/modal-design-best-practices>,
 *   lette il 19/09/2026). Le vie d'uscita restano TRE e tutte visibili: Annulla, la croce, Esc.
 *   La differenza è dichiarata nella tabella del resoconto, non nascosta.
 *
 * ⛔ E IL PIEDE NON CHIUDE DOPO IL SALVATAGGIO. L'esito del salvataggio è un messaggio del
 *   prodotto (`[data-provider-feedback]`) che vive DENTRO il corpo — cioè dentro questa modale:
 *   chiudendo subito, un errore («Collegamento non salvato») finirebbe in un nodo appena sparito,
 *   e l'utente vedrebbe la modale chiudersi come se fosse andata bene. ⇒ Si salva e si resta.
 */
function apriConfigurazioneProvider(card,row){
 if(!card||card.querySelector(':scope > .talos-provider__modale'))return null;
 const doc=card.ownerDocument||globalThis.document;
 const corpo=card.querySelector('.talos-provider__body');if(!corpo)return null;
 const configura=card.querySelector('[data-provider-toggle]');
 const doveStava={dopo:corpo.nextSibling,genitore:corpo.parentElement,hidden:corpo.hidden};
 const dialogo=el('dialog','td-modal talos-provider__modale');
 dialogo.dataset.providerModale=row.id;
 dialogo.setAttribute('aria-labelledby','titolo-modale-'+row.id);
 vesti(dialogo,VESTITO.modale.dialogo);
 const titolo=el('h2','talos-provider__modale-titolo','Configura '+(row.label||row.id));
 titolo.id='titolo-modale-'+row.id;vesti(titolo,VESTITO.modale.titolo);
 const chiudi=el('button','talos-button talos-button--ghost talos-icon-button');chiudi.type='button';
 chiudi.setAttribute('aria-label','Chiudi');chiudi.dataset.providerModaleChiudi='';
 vesti(chiudi,VESTITO.modale.chiudi);chiudi.append(iconaAzione('chiudi','18px'));
 const testa=el('header','talos-provider__modale-testa');vesti(testa,VESTITO.modale.testa);testa.append(titolo,chiudi);
 const telaio=el('div','talos-provider__modale-corpo');vesti(telaio,VESTITO.modale.corpo);
 /*
  * ⛔ L'AVVISO STA ANCHE QUI, e non solo sopra la griglia: nel mockup la nota di sicurezza è DENTRO
  *   la modale, ed è il posto giusto — è il momento in cui si incolla una credenziale. Le parole
  *   sono le STESSE del pannello (`creaAvvisoChiavi`, una sola definizione), quindi chi legge la
  *   frase due volte non legge due frasi diverse. La differenza di posizione rispetto al pannello
  *   è dichiarata: il pannello la tiene in testa alla lista perché con 28 card la frase in fondo
  *   sarebbe a una schermata e mezza da chi la cerca (vedi `curaDoppiaTestata`).
  */
 {const avviso=creaAvvisoChiavi();avviso.dataset.providerModaleAvviso='';telaio.append(avviso);}
 const piede=el('footer','talos-provider__modale-piede');vesti(piede,VESTITO.modale.piede);
 const annulla=el('button','talos-button talos-button--secondary','Annulla');annulla.type='button';annulla.dataset.providerModaleAnnulla='';
 vesti(annulla,VESTITO.modale.pulsante);
 /*
  * LA PRIMARIA È IL GESTO VERO DELLA CARD, e il suo nome lo DICE. Il mockup porta «Salva
  * configurazione demo»: la sua è un'azione di PROTOTIPO — cambia uno stato temporaneo — e il
  * piede di una card vera non può promettere di salvare ciò che quella card non sa salvare.
  *   · chi ha una configurazione PROPRIA (Azure, Vertex, Bedrock, l'agente esterno: `save-runtime`
  *     col salvataggio vero) → «Salva configurazione»;
  *   · gli altri salvano la CHIAVE, ed è la loro primaria da sempre: il piede porta la stessa
  *     parola del pulsante che preme davvero.
  */
 const salvaRuntime=corpo.querySelector('[data-provider-action="save-runtime"]');
 const salvaChiave=corpo.querySelector('[data-provider-action="save-key"]');
 const vero=salvaRuntime||salvaChiave;
 if(vero){
  const primaria=el('button','talos-button talos-button--primary talos-button--sm',salvaRuntime?'Salva configurazione':(vero.textContent||'Salva'));
  primaria.type='button';primaria.dataset.providerModaleSalva=salvaRuntime?'runtime':'chiave';
  vesti(primaria,VESTITO.modale.pulsante);
  primaria.addEventListener('click',()=>vero.click());
  /* ⛔ «Annulla» E LA CROCE NON PORTANO `aria-expanded`: la regia del mockup (`app.js`, ascoltatore
     delegato sulla radice) tratta OGNI `[aria-expanded][aria-controls]` come una disclosure e la
     inverte da sé — è il difetto già misurato il 18/09 in `catalogo-faccette.js`. Questi due
     pulsanti non hanno quella coppia, quindi non c'è niente da fermare. Il «Configura» della card
     invece ce l'ha, ed è per questo che il suo clic chiama `stopPropagation` (vedi sotto). */
  piede.append(annulla,primaria);
 }else piede.append(annulla);
 const chiudiModale=()=>{if(typeof dialogo.close==='function'&&dialogo.open)dialogo.close();};
 chiudi.addEventListener('click',chiudiModale);
 annulla.addEventListener('click',chiudiModale);
 /* ESC si ferma qui: `cancel` chiude, il `keydown` non deve salire alla catena di Esc dell'app. */
 dialogo.addEventListener('keydown',(e)=>{if(e.key==='Escape')e.stopPropagation();});
 dialogo.addEventListener('close',()=>{
  /* IL CORPO TORNA DOVE STAVA, e torna con lo stato che aveva: se la card lo teneva aperto in
     linea (`aperta`, che è il caso del velo), si riapre in linea; se era chiuso, si richiude. */
  if(doveStava.genitore)doveStava.genitore.insertBefore(corpo,doveStava.dopo&&doveStava.dopo.isConnected?doveStava.dopo:null);
  corpo.hidden=doveStava.hidden;
  corpo.style.removeProperty('padding');corpo.style.removeProperty('border-top');
  dialogo.remove();
  aggiornaStatoConfigura(card,false);
  /*
   * IL FUOCO TORNA AL PULSANTE CHE HA APERTO — e si scrive, anche se il `<dialog>` nativo lo fa
   * già da sé: Chrome lo riporta all'elemento che aveva il fuoco prima di `showModal()`, ma qui
   * quel comportamento non si VEDE da nessuna parte e non si può provare se non per fede. Una
   * riga esplicita è una riga che la prova può misurare (APG «Dialog (Modal)»: il fuoco torna
   * all'elemento che ha aperto il dialogo). Se la card è stata sostituita mentre la modale era
   * aperta, `configura` non è più nel documento e non si tocca niente.
   */
  if(configura?.isConnected)configura.focus({preventScroll:true});
 });
 telaio.append(corpo);
 /* Il corpo, dentro la modale, perde il suo padding e il suo filetto: quelli sono della card
    aperta in linea, e qui li porta il telaio (`2px 26px 24px`, dal mockup). */
 corpo.hidden=false;
 Object.assign(corpo.style,{padding:'0',borderTop:'0'});
 dialogo.append(testa,telaio,piede);
 card.append(dialogo);
 if(typeof dialogo.showModal==='function')dialogo.showModal();else dialogo.setAttribute('open','');
 aggiornaStatoConfigura(card,true);
 /*
  * IL PRIMO CONTROLLO UTILE PRENDE IL FUOCO — «all'apertura il fuoco va sul primo controllo
  * utile, non sul contenitore» (accessibility.build, «Accessible Dialog & Modal Guide», letta il
  * 19/09/2026). E si mette A MANO, come fa il prodotto nel cercatore delle Impostazioni, perché
  * `autofocus` non è affidabile su tutti i browser desktop.
  */
 const primo=telaio.querySelector('input:not([type=hidden]),textarea,select,button')||annulla;
 primo.focus?.({preventScroll:true});
 return dialogo;
}
/** `aria-expanded` dice se la CONFIGURAZIONE è aperta — in linea o nella modale. Una cosa sola. */
function aggiornaStatoConfigura(card,aperto){
 const b=card?.querySelector('[data-provider-toggle]');
 if(b)b.setAttribute('aria-expanded',String(Boolean(aperto)));
}

/*
 * ============================================================================
 * I FILTRI DEI FORNITORI (FASE 4-bis, 19/09/2026)
 * ============================================================================
 * ⛔ LA RICHIESTA È DELL'OWNER, E NON VIENE DAL MOCKUP: «Ci devono essere tutti i filtri relativi:
 *   per Provider, per Impostato, per Non impostato, qualcosa di fatto bene». Misurato: nel mockup
 *   un filtro dei fornitori NON esiste — il «Configurato⌄» che si vede è il **selettore di scenario
 *   della statusbar**, un'altra cosa. Qui si progetta, non si copia.
 *
 * ⛔ LA FORMA È QUELLA GIÀ APPROVATA, non una nuova: la barra a faccette del catalogo
 *   (`catalogo-faccette.js`) usa `talos-button--sm` + `--primary` quando il chip è acceso, col
 *   conteggio in un `talos-badge--sm`. Si riprende identica — compresa la lezione scritta là il
 *   18/09: **nel design system NON esiste `talos-button[aria-pressed="true"]`**, quindi il chip
 *   acceso si distingue con la variante `--primary`, o acceso e spento sarebbero identici.
 *
 * ⛔ E LE REGOLE DELLA RICERCA (19/09/2026), che sono quattro e tutte misurate addosso a questo
 *   elenco:
 *   1. **il conteggio per valore** è ciò che rende una faccetta intelligente — senza, l'utente
 *      deve provare a caso (Saas UI «Filtering & Sorting UX Patterns», letto il 19/09/2026);
 *   2. **OR dentro una faccetta, AND fra faccette**: «Impostata» O «Da impostare» è una scelta
 *      sola; «Impostata» E «Mai provato» sono due domande diverse (Design Systems One, «Filters
 *      and refinement», letta il 19/09/2026);
 *   3. **i valori a zero si SPENGONO** (`disabled`), non si nascondono: nasconderli farebbe
 *      ballare la barra a ogni filtro;
 *   4. **`aria-live` sul risultato**: chi non vede la lista deve sentire che il numero è cambiato
 *      (<https://www.ideaplan.io/templates/faceted-search-template>, letto il 19/09/2026).
 *
 * ⛔ I VALORI NON SI INVENTANO: si leggono dagli stati che la card mostra già —
 *   `etichettaOrigineChiave` per la credenziale, la mappa delle prove per l'ultima prova. Se
 *   domani il server aggiunge uno stato, la faccetta lo segue senza una seconda lista da tenere.
 *   E la faccetta NON ha sei voci: ne ha TRE, perché «Chiave salvata», «Chiave dall'ambiente»,
 *   «Accesso fatto» e «Agente configurato» sono la stessa risposta alla domanda «è impostato?».
 */
const filtroVuoto=()=>({cerca:'',credenziale:[],prova:[]});
/* Lo stato della lista filtrata: i filtri accesi, le righe dell'ultimo disegno e con che opzioni —
   così un chip può RIDISEGNARE senza che nessuno glielo debba ripassare. Una `WeakMap` e non una
   proprietà sul nodo: la lista del velo e quella del pannello sono due nodi diversi, e ognuno ha
   il suo stato senza che l'uno debba sapere dell'altro. */
const statoLista=new WeakMap();

/** La faccetta della credenziale a cui un fornitore appartiene: una sola, sempre. */
export function credenzialeDiFornitore(row={}){
 const e=etichettaOrigineChiave(row);
 if(e==='Chiave facoltativa')return 'facoltativa';
 if(e==='Chiave mancante'||e==='Agente da configurare')return 'daImpostare';
 return 'impostata';
}
/** I conteggi VERI di ogni valore, sull'elenco INTERO (non su quello già filtrato). */
export function faccetteFornitori(rows=[],{prove=new Map()}={}){
 const credenziale={impostata:0,daImpostare:0,facoltativa:0};
 let provato=0;
 for(const row of rows){
  credenziale[credenzialeDiFornitore(row)]++;
  if(prove?.get?.(row.id))provato++;
 }
 return {credenziale,prova:{provato,mai:rows.length-provato},totale:rows.length};
}
/** Il filtro: OR dentro una faccetta, AND fra faccette e con la ricerca. */
export function filtraFornitori(rows=[],filtri=filtroVuoto(),{prove=new Map()}={}){
 const testo=(filtri.cerca||'').trim().toLocaleLowerCase('it');
 return rows.filter((row)=>{
  if(testo&&!`${row.label||''} ${row.id||''}`.toLocaleLowerCase('it').includes(testo))return false;
  if(filtri.credenziale.length&&!filtri.credenziale.includes(credenzialeDiFornitore(row)))return false;
  if(filtri.prova.length&&!filtri.prova.includes(prove?.get?.(row.id)?'provato':'mai'))return false;
  return true;
 });
}
/** Quanti filtri sono accesi. Serve a decidere se mostrare «Togli i filtri». */
function filtriAccesi(filtri){return (filtri.cerca.trim()?1:0)+filtri.credenziale.length+filtri.prova.length;}

function chipFiltro(gruppo,valore,etichetta,conteggio,acceso){
 const b=el('button','talos-button talos-button--sm '+(acceso?'talos-button--primary':'talos-button--secondary'),etichetta);
 b.type='button';b.dataset[FILTRO_CHIP]=gruppo+':'+valore;b.setAttribute('aria-pressed',String(acceso));
 /* ⛔ Zero ⇒ spento. Ma «non contato» non è «zero»: qui l'elenco è sempre arrivato dal server
    prima di disegnare, quindi il numero è un numero — e se non lo fosse non si disegnerebbe. */
 if(conteggio===0)b.disabled=true;
 b.append(el('span','talos-badge talos-badge--sm',String(conteggio)));
 return b;
}

/**
 * Installa la riga dei filtri sopra la lista, UNA VOLTA. Idempotente: il timbro sulla lista è il
 * contratto (`data-provider-filtri`), la stessa forma del timbro di `montaProviderPanel`.
 * La chiama `montaProviderPanel`: la lista del VELO non passa di lì e non ha filtri — là dentro
 * un fornitore solo, e una barra che filtra un elemento non serve a nessuno.
 */
export function installaFiltriFornitori(lista){
 if(!lista||lista.hasAttribute('data-provider-filtri'))return null;
 lista.setAttribute('data-provider-filtri','');
 statoLista.set(lista,{filtri:filtroVuoto(),rows:[],opzioni:{}});
 const riga=el('div','talos-provider__filtri');riga.dataset.providerFiltriRiga='';
 riga.setAttribute('role','group');riga.setAttribute('aria-label','Filtri dei fornitori');
 vesti(riga,VESTITO.filtri);
 const cerca=el('label','talos-field talos-field--sm');
 cerca.append(el('span','talos-muted','Cerca'));
 const campo=el('input','talos-field__input');campo.type='search';
 campo.setAttribute('data-provider-filtro-cerca','');campo.setAttribute('aria-label','Cerca un fornitore');
 campo.autocomplete='off';campo.placeholder='Nome o identificatore…';
 cerca.append(campo);
 const gruppoCred=el('div','talos-cluster');gruppoCred.setAttribute('role','group');gruppoCred.setAttribute('aria-label','Credenziale');gruppoCred.dataset.providerFiltroGruppo='credenziale';
 const gruppoProva=el('div','talos-cluster');gruppoProva.setAttribute('role','group');gruppoProva.setAttribute('aria-label','Ultima prova');gruppoProva.dataset.providerFiltroGruppo='prova';
 const togli=el('button','talos-button talos-button--ghost talos-button--sm','Togli i filtri');togli.type='button';togli.dataset.providerFiltroTogli='';togli.hidden=true;
 const esito=el('p','talos-muted','');esito.dataset.providerFiltroEsito='';esito.setAttribute('role','status');esito.setAttribute('aria-live','polite');
 riga.append(cerca,gruppoCred,gruppoProva,togli,esito);
 lista.before(riga);
 collegaFiltriFornitori(lista,riga,()=>{const s=statoLista.get(lista);if(s)aggiornaProviderList(lista,s.rows,s.opzioni);});
 return riga;
}

/** Ridisegna i chip coi conteggi di OGGI e scrive l'esito. Non tocca i filtri accesi. */
function disegnaFiltriFornitori(lista,rows,filtri,visibili,prove){
 const riga=lista.previousElementSibling;
 if(!riga?.matches?.('[data-provider-filtri-riga]'))return;
 const c=faccetteFornitori(rows,{prove});
 const gCred=riga.querySelector('[data-provider-filtro-gruppo="credenziale"]');
 const gProva=riga.querySelector('[data-provider-filtro-gruppo="prova"]');
 gCred.replaceChildren(
  chipFiltro('credenziale','impostata','Impostata',c.credenziale.impostata,filtri.credenziale.includes('impostata')),
  chipFiltro('credenziale','daImpostare','Da impostare',c.credenziale.daImpostare,filtri.credenziale.includes('daImpostare')),
  chipFiltro('credenziale','facoltativa','Facoltativa',c.credenziale.facoltativa,filtri.credenziale.includes('facoltativa')));
 gProva.replaceChildren(
  chipFiltro('prova','provato','Provato',c.prova.provato,filtri.prova.includes('provato')),
  chipFiltro('prova','mai','Mai provato',c.prova.mai,filtri.prova.includes('mai')));
 const togli=riga.querySelector('[data-provider-filtro-togli]');if(togli)togli.hidden=filtriAccesi(filtri)===0;
 const esito=riga.querySelector('[data-provider-filtro-esito]');
 if(esito)esito.textContent=visibili===c.totale?`${c.totale} fornitori`:`${visibili} fornitori su ${c.totale}`;
}

/** Il clic (o la digitazione) dentro la riga dei filtri. */
function collegaFiltriFornitori(lista,riga,rendi){
 const leggi=()=>statoLista.get(lista)?.filtri||filtroVuoto();
 const scrivi=(nuovi)=>{const s=statoLista.get(lista);if(s)s.filtri=nuovi;rendi();};
 /*
  * ⛔ `stopPropagation` ANCHE QUI, e per la stessa ragione di «Configura»: la riga sta dentro il
  *   pannello, e la regia delegata della app tratta `[aria-expanded][aria-controls]` (la
  *   disclosure del mockup) e `[data-provider-action]`. I nostri chip non portano né l'una né
  *   l'altra coppia, ma il campo di ricerca sì che è un `<input>`, e un testo che finisce nella
  *   regia sbagliata è esattamente il difetto del 18/09. Si ferma qui: è roba nostra.
  */
 riga.addEventListener('click',(evento)=>{
  evento.stopPropagation();
  const togli=evento.target.closest('[data-provider-filtro-togli]');
  /*
   * ⛔ «TOGLI I FILTRI» SVUOTA ANCHE IL CAMPO, e non è pignoleria: senza questa riga il campo
   *   resterebbe con la parola scritta mentre il filtro è spento — cioè un'interfaccia che dice
   *   una cosa e ne fa un'altra. L'ha trovato la prova (`FILL-03`), non l'occhio: il primo giro
   *   della prova leggeva `input.value === 'a-salvata'` con la lista tornata intera.
   */
  if(togli){const c=riga.querySelector('[data-provider-filtro-cerca]');if(c)c.value='';scrivi(filtroVuoto());return;}
  const scelto=evento.target.closest('[data-provider-filter]');
  if(!scelto||scelto.disabled)return;
  const [gruppo,valore]=scelto.dataset[FILTRO_CHIP].split(':');
  const attuali=leggi()[gruppo];
  scrivi({...leggi(),[gruppo]:attuali.includes(valore)?attuali.filter((v)=>v!==valore):[...attuali,valore]});
 });
 riga.addEventListener('input',(evento)=>{
  evento.stopPropagation();
  const campo=evento.target.closest('[data-provider-filtro-cerca]');if(!campo)return;
  scrivi({...leggi(),cerca:campo.value});
 });
}

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
 /*
  * ⛔ IL MARCHIO VERO, non più il simbolo di famiglia — vedi `loghi-fornitori.js` per la licenza,
  *   la provenienza e l'elenco di chi un marchio verificabile non ce l'ha. Il ripiego resta quello
  *   di prima (famiglia: dice DOVE il fornitore esegue), e si dichiara con `data-glifo`, così la
  *   prova può contare le due popolazioni invece di fidarsi.
  */
 const {nodo:iconaGlifo,marchio:glifoMarchio}=glifoFornitore(row,{document:document});
 /* Il glifo DICHIARA sempre da dove viene il disegno: «marchio» o «monogramma». Senza, la
    differenza fra «questo fornitore ha il suo marchio» e «questo è il ripiego» non si
    potrebbe contare — e contarli è il modo per sapere che nessuno è rimasto senza niente. */
 glifo.dataset.glifo=glifoMarchio?'marchio':'monogramma';
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
 /* ⛔ Per l'agente esterno la sonda vive nel CORPO, non nel piede (è il gesto principale di quella
    card, e il menu non l'ha mai nascosta): porta la stessa veste e la stessa icona del piede —
    è lo stesso comando, in un'altra casa, e il perché sta scritto sopra `test`. */
 if(esterno){test.hidden=false;vesti(test,VESTITO.pulsante);test.prepend(iconaAzione('verifica'));actions.append(test);for(const v of vociMenu){v.elemento.hidden=false;} }
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
 /* ⛔ L'ICONA PRIMA DELLA PAROLA, come nel mockup (`<svg class="icon"/><span>Configura</span>`):
    il primo giro la metteva in coda, e la FOTO del 19/09/2026 l'ha mostrata a destra mentre
    «Verifica accesso» — che usa `prepend` — l'aveva a sinistra: due pulsanti uguali con l'icona
    in due posti diversi. */
 vesti(configura,VESTITO.pulsante);configura.prepend(iconaAzione('configura'));
 /*
  * ⛔ 19/09/2026 — «CONFIGURA» APRE LA MODALE, e il clic si FERMA QUI. Le due righe vanno lette
  *   insieme, perché senza la seconda la prima non si vedrebbe.
  *   `stopPropagation` è la via di casa per chi possiede la propria disclosure con un'etichetta che
  *   dice lo stato (`catalogo-faccette.js` fa lo stesso, per la stessa ragione MISURATA il 18/09):
  *   senza, due regie della app farebbero la loro parte su questo clic —
  *     · `app.js`, ascoltatore delegato sulla radice: `[aria-expanded][aria-controls]` ⇒ scrive
  *       `aria-expanded` INVERTITO e `c.hidden = aperto` sul corpo (la disclosure del mockup);
  *     · `app.js`, delega su `#providerList`/`#veloFornitori`: `[data-provider-toggle]` ⇒ inverte
  *       `providerAperti` e RIDISEGNA la lista.
  *   ⇒ Il corpo verrebbe aperto in linea E spostato nella modale, e il ridisegno porterebbe via la
  *     card con dentro la modale appena aperta: una modale che si chiude da sola, senza un errore.
  */
 configura.addEventListener('click',(e)=>{e.stopPropagation();apriConfigurazioneProvider(card,row);});
 piede.append(configura);
 if(!esterno){test.disabled=busy;vesti(test,VESTITO.pulsante);test.prepend(iconaAzione('verifica'));piede.append(test);}
 card.append(body,piede);
 }
 return card;
}
export function aggiornaProviderList(lista,rows,opzioni={}){
 const {aperte=new Set(),prove=new Map(),occupati=new Set(),caricamento=false,errore=null,onMenu=null,onAzionePool=null}=opzioni;
 if(!lista)return;lista.className='talos-provider-list';lista.setAttribute('aria-busy',String(caricamento));
 /* La griglia del mockup (due colonne a 1122 di contenuto, una a 754): vedi `VESTITO.griglia`. */
 vesti(lista,VESTITO.griglia);
 /*
  * I FILTRI — solo dove sono stati INSTALLATI (`montaProviderPanel`, cioè la scheda Provider).
  * La lista del velo non ha lo stato e non li disegna: è lo stesso renderer, con una riga sola.
  */
 const stato=statoLista.get(lista);
 if(stato){stato.rows=rows;stato.opzioni=opzioni;}
 /* ⛔ Un messaggio solo non è una card: nell'elenco vuoto la griglia si spegne, o il testo
    resterebbe incolonnato in una cella da 340 invece di leggersi come una riga. */
 if(errore||!rows.length){const p=el('p','talos-muted',errore?errore.message||String(errore):caricamento?'Leggo gli accessi…':'Nessun fornitore dichiarato dal server.');p.dataset.c='EmptyState';if(errore)p.setAttribute('role','alert');lista.replaceChildren(p);lista.style.display='block';if(stato)disegnaFiltriFornitori(lista,rows,stato.filtri,0,prove);return;}
 const visibili=stato?filtraFornitori(rows,stato.filtri,{prove}):rows;
 if(stato)disegnaFiltriFornitori(lista,rows,stato.filtri,visibili.length,prove);
 /*
  * ⛔ IL FILTRO CHE NON LASCIA NIENTE HA UNA FRASE SUA, e non è un dettaglio di copy: «Nessun
  *   fornitore dichiarato dal server» sarebbe FALSO — il server ne ha dichiarati ventotto, è il
  *   filtro che li ha esclusi. Un vuoto che accusa il server di un lavoro fatto dal filtro è la
  *   stessa classe di difetto dell'«esito stampato dopo un errore».
  */
 if(!visibili.length){const p=el('p','talos-muted','Nessun fornitore con questi filtri.');p.dataset.c='EmptyState';lista.replaceChildren(p);lista.style.display='block';return;}
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
 /*
  * ⛔ LA MODALE NON SI PERDE NEL RIDISEGNO, e non è un dettaglio: SALVARE RIDISEGNA. Il
  *   salvataggio della configurazione chiama il «Aggiorna» del prodotto (`providerRefresh`), la
  *   riga del fornitore cambia, la firma della card cambia, e `aggiornaProviderList` ne costruisce
  *   una NUOVA — portandosi via la card vecchia e, con lei, la modale che era appena stata aperta.
  *   Misurato il 19/09/2026 con la prova: si premeva «Salva configurazione», il salvataggio partiva
  *   DAVVERO (una richiesta, col valore giusto), e la modale spariva senza che l'utente vedesse
  *   l'esito. ⇒ Si ricorda quali card avevano la modale aperta e la si riapre sulla card nuova,
  *   dopo il ridisegno e dopo il ripristino del fuoco (prima no: il ripristino del fuoco
  *   ruberebbe il posto al primo controllo della modale riaperta).
  */
 const daRiaprire=[];
 const cards=visibili.map(row=>{const op={aperta:aperte.has(row.id),prova:prove.get(row.id)||null,occupato:occupati.has(row.id)||caricamento},signature=JSON.stringify([row,op,typeof onAzionePool==='function']),precedente=old.get(row.id);if(precedente?.dataset.salvataggioCollegamento==='in-corso'||precedente?.dataset.providerSignature===signature&&!precedente.dataset.providerReset)return precedente;if(precedente?.querySelector?.(':scope > .talos-provider__modale[open]'))daRiaprire.push(row);const card=creaProviderCard(row,{...op,onMenu,onAzionePool,ambito});card.dataset.providerSignature=signature;
 if(precedente&&!precedente.dataset.providerReset){for(const input of card.querySelectorAll('input,textarea')){const attr=[...input.attributes].find(a=>a.name.startsWith('data-provider-'));const prima=precedente.querySelector('['+attr.name+']');if(prima){prima.disabled=input.disabled;prima.className=input.className;prima.placeholder=input.placeholder;input.replaceWith(prima);}}}
 const feedback=precedente?.querySelector('[data-provider-feedback]'),target=card.querySelector('[data-provider-feedback]');if(feedback&&target)target.replaceWith(feedback);return card;});lista.replaceChildren(...cards);
 if(focusId){if(focus.isConnected&&!focus.disabled)focus.focus({preventScroll:true});else cards.find(n=>n.dataset.providerId===focusId)?.querySelector('[data-provider-toggle]')?.focus({preventScroll:true});}
 /* E la modale che era aperta si riapre sulla card nuova — vedi la nota sopra `daRiaprire`. */
 for(const row of daRiaprire)apriConfigurazioneProvider(cards.find(n=>n.dataset.providerId===row.id),row);
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
 const note=head?.querySelector('p');if(note){note.className='talos-muted';note.textContent=`${NOTA_CHIAVI} ${NOTA_CHIAVI_RESTO}`;}
 const test=panel.querySelector('#providerTestAll')||panel.querySelector('[data-provider-test-all]');
 if(test&&!panel.querySelector('#providerRefresh')){test.className='talos-button talos-button--secondary talos-button--sm';test.dataset.c='Button';const refresh=button('refresh','Aggiorna');refresh.id='providerRefresh';delete refresh.dataset.providerAction;test.before(refresh);}
 /*
  * I FILTRI NASCONO QUI, una volta sola, sopra la lista della scheda Provider. Il VELO non passa di
  * qui (`popolaVeloFornitori` disegna la sua lista da sé) e non li ha: là dentro c'è UN fornitore,
  * e una barra che filtra un elemento solo è arredamento.
  */
 installaFiltriFornitori(panel.querySelector('#providerList'));
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
 const avviso=creaAvvisoChiavi();avviso.dataset.providerAvviso='';
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