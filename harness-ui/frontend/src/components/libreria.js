import { plurale } from './plurale.js'; // BH-12: «1 ricordi» — il plurale vive in un posto solo
import { nomeModelloUmano } from './chat-foot.js'; // BC-38: un id di modello non è un nome, e la traduzione esiste già
/** LibraryRow del mockup, metadati GET /library. WAI Tabs/Disclosure, 05/09/2026. */
/*
 * ⛔⛔ 10/09/2026, owner: «ogni artefatto va salvato in libreria, con CRUD COMPLETO e azioni Windows».
 *
 * Misurato PRIMA di toccare niente, su questo stesso file (53 righe): la riga della Libreria aveva
 * DUE bottoni e UNO SOLO raggiungibile — «Dettagli» apriva la data, e «Apri» nasceva `hidden` con
 * `dataset.richiede='fase3'`, cioè disegnato e morto. ⇒ 0 azioni su 5 (apri, scarica, rinomina,
 * elimina, mostra nella cartella): un file entrava in Libreria e da lì non si poteva più né tirare
 * fuori né togliere.
 *
 * ⛔ Ricerca fatta PRIMA di scrivere (regola zero), il 10/09/2026:
 * · saasui.design, «SaaS Destructive Actions & Confirmation UX Patterns» — l'attrito è una SCALA
 *   (nessuna conferma · conferma semplice · conferma con la conseguenza scritta · scrivi il nome),
 *   e ogni azione sta sul gradino che il suo rischio si merita; «their effectiveness depends
 *   directly on their rarity» ⇒ QUI la conferma è SOLO su Elimina, e dice la conseguenza. Le altre
 *   quattro non chiedono niente: scaricare e mostrare una cartella non rompono niente, e una
 *   rinomina si rifà rinominando di nuovo.
 * · nngroup.com, «Confirmation Dialogs Can Prevent User Errors» — la conferma serve quando l'azione
 *   non si annulla; il server qui cancella il file per davvero e non c'è nessun cestino.
 * · blog.logrocket.com, «Modal UX design: patterns, examples and best practices» — «editable forms
 *   and inline elements don't need modals»: rinominare è UN passo, e una modale ci metterebbe due
 *   aperture e un cambio di fuoco in mezzo ⇒ rinomina IN LINEA, dentro la riga.
 * · W3C APG, «Providing Accessible Names and Descriptions» — il nome accessibile serve anche a
 *   «distinguish the element from other elements on the page»; con dieci file in elenco, dieci
 *   «Elimina» identici sono indistinguibili ⇒ ogni bottone nomina IL SUO file, e il gruppo di
 *   azioni porta «Azioni su <nome>» (deque axe `aria-command-name`, stessa data).
 * · learn.microsoft.com, «Naming Files, Paths, and Namespaces» — < > : " / \ | ? * sono riservati
 *   ⇒ un nome che li contiene si rifiuta QUI, senza far fare un giro a vuoto al server; e la barra
 *   è in particolare ciò che trasformerebbe un nome in un percorso.
 *
 * ⛔ I concorrenti, stessa data — che cosa fanno e il vincolo che ne viene:
 * · Hermes Agent (l'obiettivo da battere), changelog di settembre 2026: la desktop app disegna gli
 *   artefatti come «versioned cards with sandboxed live preview», e il file arriva alla persona con
 *   `ctx.download` dal SDK dei plugin; il file browser esplora la cartella di lavoro — ma nessun
 *   CRUD di libreria: rinomina ed elimina non ci sono. Il nostro +1 misurabile è esattamente questo.
 * · treasure.ai, note di rilascio: i file generati «si organizzano dal livello cartella — creare
 *   cartelle, rinominare, spostare, eliminare» ⇒ il CRUD in elenco è lo stato dell'arte, non un lusso.
 * · ⛔ IL VINCOLO CHE NON SAPEVO, dalle stesse note: «Reveal in File Explorer was fixed to properly
 *   SELECT the target file on Windows». Aprire la cartella NON basta: in una cartella con cento file
 *   la persona resta a cercare. La rotta `/rivela` deve SELEZIONARE il file (su Windows
 *   `explorer /select,<percorso>`) — è metà server, ed è scritto qui perché è la metà che questa
 *   interfaccia non può garantire da sola.
 *
 * ⛔ Il server lo scrive un'altra sessione, in parallelo: se una rotta non risponde ancora, la riga
 *   lo DICE (`role="alert"`, col codice HTTP) e non finge. Nessun bottone che sembra aver funzionato.
 */
const TIPI=new Map([['document',{testo:'Documento',icona:'doc'}],['image',{testo:'Immagine',icona:'image'}]]);
const ORIGINI=new Map([['uploaded','Caricato'],['generated','Generato']]);
export function tipoVoceLibreria(tipo){return TIPI.get(tipo)||{testo:'Tipo non registrato',icona:'files'};}
export function origineVoceLibreria(origine){return ORIGINI.get(origine)||'Origine non registrata';}
export function testiVoceLibreria(voce){
 const nome=typeof voce?.nome==='string'&&voce.nome.trim()?voce.nome:'File senza nome';
 const data=typeof voce?.aggiornatoIl==='string'?new Date(voce.aggiornatoIl):null,valida=data&&Number.isFinite(data.getTime());
 return {nome,aggiornata:valida?data.toLocaleString('it-IT'):null,dataBreve:valida?'Aggiornato il '+data.toLocaleDateString('it-IT'):'Data non registrata'};
}

/*
 * ⭐⭐⭐ BC-38 — DOVE VIVE UN FILE, E CHI L'HA FATTO (12/09/2026)
 *
 * Owner: «mettere il percorso dei file nella Libreria. Nel dettaglio (sidebar) e nella card/riga
 * SOLO la cartella; nel dettaglio sidebar anche da chi sono stati creati e da quale sessione».
 *
 * ## Ricerca PRIMA di scrivere (12/09/2026) — fonti primarie, non blog
 *
 * ⛔ Il budget di ricerca web della sessione era esaurito (200/200): le fonti qui sotto sono state
 *   lette con WebFetch sulle pagine ufficiali, e la data è quella della lettura.
 *
 * ⭐ Hermes Agent (NousResearch, l'obiettivo da battere) — README del repo `hermes-agent` e
 *   `hermes-agent.nousresearch.com/docs`: NON esiste un pannello Libreria/File/Artefatti
 *   documentato; c'è solo «Context Files — project context files that shape every conversation».
 *   Dove scrive un percorso lo scrive relativo alla home (`~/.hermes/skills/…`).
 *   ⇒ Sulla provenienza di un file non hanno niente da copiare: qui il +1 è tutto nostro.
 * ⭐ VS Code — «Breadcrumbs always show the FILE PATH», sempre visibile sopra l'editor; il
 *   percorso INTERO non sta in un tooltip ma dietro un COMANDO («Copy Breadcrumbs Path» dal menu
 *   della scheda), e la cartella si raggiunge con «Reveal in File Explorer». Nelle etichette di
 *   scheda personalizzate la forma consigliata è `${dirname}/${filename}` — cioè SOLO la cartella
 *   che contiene, accanto al nome. ⇒ è esattamente ciò che l'owner chiede per riga e card.
 * ⭐ Microsoft, BreadcrumbBar (Windows App SDK, agg. 14/07/2026): quando lo spazio non basta,
 *   «an ellipsis replaces the LEFTMOST nodes» e la posizione corrente resta l'ultima voce.
 *   ⇒ se un percorso si deve accorciare, si taglia dalla TESTA e si tiene la coda. Qui non si
 *   taglia affatto nel dettaglio (un percorso tagliato non si incolla): si manda a capo.
 *
 * ## Le tre decisioni che ne escono, e perché non sono quelle ovvie
 *
 * ⛔ «LA CARTELLA» NON È LA CARTELLA PADRE DEL FILE. Il padre vero è
 *   `.harness-ui-library/lib-<uuid>/`, uguale per ogni voce e illeggibile: metterlo in riga
 *   sarebbe rumore identico su tutte le righe. La cartella che una persona riconosce è quella del
 *   PROGETTO — `cartella` — e in riga se ne mostra l'ultimo segmento.
 * ⛔ NIENTE `title` NATIVO col percorso intero. Il 10/09 il `title` è stato tolto da questa riga
 *   perché il fumetto COPRIVA i filtri della pagina, e MDN lo sconsiglia (tocco, tastiera, screen
 *   reader). Rimetterlo col percorso, che è tre volte più lungo del nome, rifarebbe quel difetto
 *   in peggio. ⇒ il percorso intero vive nel DETTAGLIO e dietro il comando «Copia percorso»,
 *   come in VS Code.
 * ⛔ NIENTE `~` AL POSTO DELLA HOME nel dettaglio. Un percorso abbreviato non si incolla in
 *   Esplora file, e su Windows la forma breve sarebbe `%USERPROFILE%`, non `~`. Il valore serve
 *   per essere copiato: si mostra intero e si manda a capo.
 */

/** L'ultimo segmento di un percorso di cartella — quello che una persona riconosce a colpo d'occhio. */
export function ultimaCartella(cartella) {
  const grezzo = String(cartella ?? '').trim().replace(/[\\/]+$/u, '');
  if (!grezzo) return '';
  const pezzi = grezzo.split(/[\\/]/u).filter(Boolean);
  const ultimo = pezzi.at(-1) || '';
  /* ⛔ `C:` non è una cartella con un nome: è la radice del disco, e l'ultimo segmento sarebbe
     `C:` da solo, che si legge come un errore. Una radice si dice per intero. */
  if (!ultimo || /^[A-Za-z]:$/u.test(ultimo)) return grezzo;
  return ultimo;
}

/**
 * DOVE vive una voce e CHI l'ha fatta, in parole — PURA, nessun DOM.
 *
 * ⛔ Regge una voce che NON porta i campi nuovi (la rotta di ieri, una fixture, il mockup): in
 *   quel caso `creatoDa` si ricava da `origine`, che c'è sempre, e percorso e cartella restano
 *   vuoti — chi disegna non scrive la riga invece di scrivere «sconosciuto».
 * ⛔ Il nome della sessione si chiede PRIMA all'elenco vivo (`nomeSessione`) e solo dopo si usa
 *   quello congelato nel meta: una sessione rinominata deve leggersi col nome di oggi.
 */
export function provenienzaVoceLibreria(voce, { nomeSessione } = {}) {
  const cartella = typeof voce?.cartella === 'string' ? voce.cartella.trim() : '';
  const percorso = typeof voce?.percorso === 'string' ? voce.percorso.trim() : '';
  const creato = voce?.creatoDa && typeof voce.creatoDa === 'object' ? voce.creatoDa : null;
  const daPersona = creato ? creato.tipo === 'persona' : voce?.origine !== 'generated';
  const modello = creato && typeof creato.modello === 'string' && creato.modello.trim() ? creato.modello.trim() : '';
  const umano = modello ? (nomeModelloUmano(modello) || modello) : '';
  const creatoDa = daPersona
    ? { chi: 'Tu', dettaglio: 'caricato in Libreria' }
    : { chi: 'TALOS', dettaglio: umano ? `generato con ${umano}` : 'modello non registrato', modello };
  const sess = voce?.sessione && typeof voce.sessione === 'object' && typeof voce.sessione.id === 'string' && voce.sessione.id.trim()
    ? voce.sessione
    : null;
  let sessione = null;
  if (sess) {
    const id = sess.id.trim();
    const vivo = typeof nomeSessione === 'function' ? nomeSessione(id) : null;
    const congelato = typeof sess.nome === 'string' && sess.nome.trim() ? sess.nome.trim() : '';
    sessione = { id, nome: (typeof vivo === 'string' && vivo.trim() ? vivo.trim() : congelato) || '' };
  }
  return { cartella, cartellaBreve: ultimaCartella(cartella), percorso, creatoDa, sessione };
}

export function filtraLibreria(voci,{query='',origine='tutte'}={}){
 const q=String(query).trim().toLocaleLowerCase('it');
 return voci.filter(v=>(origine==='tutte'||v?.origine===origine)&&(!q||[testiVoceLibreria(v).nome,tipoVoceLibreria(v?.fileType).testo,origineVoceLibreria(v?.origine)].join(' ').toLocaleLowerCase('it').includes(q)));
}
/** L'indirizzo dei BYTE veri di una voce. Vuoto se manca l'id o la sessione: mai un link rotto (stessa regola di `indirizzoScarico`, conversazione.js). */
export function indirizzoFileLibreria(sessionId,voceId){if(!sessionId||!voceId)return '';return '/api/v1/sessions/'+encodeURIComponent(sessionId)+'/library/'+encodeURIComponent(voceId)+'/file';}
/** ⛔ Un NOME, non un percorso: la barra è il carattere che separa i pezzi di un percorso (Microsoft Learn, 10/09/2026), e `..` risalirebbe di una cartella. */
export function nomeLibreriaValido(nome){
 const n=String(nome??'').trim();
 if(!n)return{ok:false,motivo:'Il nome non può essere vuoto.'};
 if(/[\\/]/.test(n))return{ok:false,motivo:'Il nome non può contenere una barra: qui va un nome, non un percorso.'};
 if(n==='.'||n==='..')return{ok:false,motivo:'«'+n+'» non è un nome di file.'};
 if(/[<>:"|?*]/.test(n)||[...n].some(c=>c.codePointAt(0)<32))return{ok:false,motivo:'Windows non accetta < > : " | ? * nel nome di un file.'};
 if(n.length>255)return{ok:false,motivo:'Il nome supera i 255 caratteri.'};
 return{ok:true,nome:n};
}
/* ⛔ 404/405/501 non sono un guasto: sono «quella rotta non c'è ancora» (il server lo scrive un'altra sessione, adesso). Si dice così, col numero, invece di un «non riuscito» che manderebbe a cercare il difetto dalla parte sbagliata. */
const NON_ANCORA=new Set([404,405,501]);
async function motivoRisposta(r){
 if(!r)return 'Il server non ha risposto.';
 let dettaglio='';
 try{const testo=await r.text?.();if(testo){try{const j=JSON.parse(testo);dettaglio=String(j?.errore||j?.error?.message||j?.error||j?.message||'').trim();}catch{dettaglio=String(testo).slice(0,200).trim();}}}catch{/* un corpo illeggibile non deve mangiarsi il codice HTTP */}
 if(NON_ANCORA.has(r.status))return 'Questa azione non è ancora disponibile sul server (HTTP '+r.status+').'+(dettaglio?' '+dettaglio:'');
 return 'Il server ha risposto HTTP '+r.status+(dettaglio?': '+dettaglio:'.');
}
/**
 * Le tre azioni che SCRIVONO, contro le rotte del contratto. Ognuna torna `{ok, motivo}` e non lancia
 * mai: chi chiama deve poter mettere il perché a schermo, non inghiottirlo in un `catch`.
 * `null` quando manca la sessione — e senza servizio la riga non disegna quei bottoni affatto.
 */
export function azioniLibreria({sessionId,fetch:rete=globalThis.fetch}={}){
 if(!sessionId||typeof rete!=='function')return null;
 const base=id=>'/api/v1/sessions/'+encodeURIComponent(sessionId)+'/library/'+encodeURIComponent(id);
 const manda=async(url,opzioni)=>{try{const r=await rete(url,opzioni);return r?.ok?{ok:true}:{ok:false,motivo:await motivoRisposta(r)};}catch(e){return{ok:false,motivo:'Il server non ha risposto: '+(e?.message||'errore sconosciuto')+'.'};}};
 return{
  rinomina:(id,nome)=>manda(base(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome})}),
  elimina:id=>manda(base(id),{method:'DELETE'}),
  rivela:id=>manda(base(id)+'/rivela',{method:'POST'}),
  /* ⛔ 10/09: «Apri» NON è lo scarico. La rotta dei byte manda `attachment`, quindi un'ancora lì
     scaricherebbe il file una seconda volta invece di aprirlo; su Windows «aprire» vuol dire che
     lo apre il programma associato all'estensione — Word per un .docx. Verbo POST come `rivela`,
     e per la stessa ragione: non scrive niente, ma ha un effetto fuori da questa API. */
  apri:id=>manda(base(id)+'/apri',{method:'POST'}),
 };
}
function el(doc,tag,classe,testo){const n=doc.createElement(tag);if(classe)n.className=classe;if(testo!==undefined)n.textContent=testo;return n;}
/* ⛔ 10/09: il `title` nativo qui c'era e COPRIVA i filtri della pagina — visto nella foto delle
   azioni: il fumetto «Relazione di prova.docx» si apriva sopra «Generati». Un tooltip nativo non si
   può posizionare, ed è lo stesso difetto tolto ieri dai tab della colonna destra (MDN, attributo
   `title`, agg. 17/04/2026: problematico per tocco, tastiera, screen reader e difficoltà
   cognitive). Il nome per intero sta già in «Dettagli» e negli `aria-label` delle cinque azioni. */
export function creaLibraryRow(voce,{document:doc=globalThis.document,aperta=false,onEspandi,sessionId='',azioni=null,modo='normale',bozza=null,onModo,onCambiata,onMenu,nomeSessione,copia}={}){
 const t=testiVoceLibreria(voce),tipo=tipoVoceLibreria(voce?.fileType),origine=origineVoceLibreria(voce?.origine),id=voce?.id||'';
 /* ⭐ BC-38: la provenienza si calcola UNA volta per riga — `mostra()` gira a ogni gesto. */
 const prov=provenienzaVoceLibreria(voce,{nomeSessione});
 const riga=el(doc,'div','talos-list-row');riga.dataset.c='LibraryRow';riga.dataset.libraryId=id;riga.setAttribute('role','listitem');
 const icona=el(doc,'span','talos-list-row__icon'),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),use=doc.createElementNS('http://www.w3.org/2000/svg','use');svg.setAttribute('class','i');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#i-'+tipo.icona);svg.append(use);icona.append(svg);
 const testo=el(doc,'span','talos-list-row__text'),titolo=el(doc,'span','talos-list-row__title',t.nome),sotto=el(doc,'span','talos-list-row__sub');
 const aside=el(doc,'span','talos-list-row__aside');aside.append(el(doc,'span','talos-badge'+(voce?.origine==='generated'?' talos-badge--accent':''),origine));
 const indirizzo=indirizzoFileLibreria(sessionId,id),servizio=azioni||azioniLibreria({sessionId});
 /* ⛔ L'esito di un'azione non è un toast che passa: resta nella riga, sotto il nome, finché non se ne fa un'altra. */
 const messaggio=el(doc,'span','talos-list-row__messaggio');messaggio.hidden=true;
 const bottoni=[];
 const nuovoBottone=(etichetta,nomeAccessibile,azione,extra)=>{const b=el(doc,'button','talos-button talos-button--ghost talos-button--sm'+(extra||''),etichetta);b.type='button';b.dataset.azione=azione;b.setAttribute('aria-label',nomeAccessibile);bottoni.push(b);return b;};
 const nuovaAncora=(etichetta,nomeAccessibile,azione)=>{const a=el(doc,'a','talos-button talos-button--ghost talos-button--sm',etichetta);a.href=indirizzo;a.dataset.azione=azione;a.setAttribute('aria-label',nomeAccessibile);return a;};
 /* ⛔ Il gruppo nomina il file per chi lo sente annunciato entrandoci; ogni bottone lo ripete, perché il nome del gruppo non arriva a tutti gli screen reader (APG, 10/09/2026). */
 const gruppo=el(doc,'span','talos-list-row__azioni');gruppo.setAttribute('role','group');gruppo.setAttribute('aria-label','Azioni su '+t.nome);
 let rinominaBtn=null,eliminaBtn=null,rivelaBtn=null;
 let apriBtn=null,menuBtn=null;
 /*
  * ⛔⛔ 10/09/2026, owner, guardando cinque bottoni in fila in questa riga: «non mettere i pulsanti
  *   uno accanto all'altro, usa i tre puntini + dropdown… e anche azioni tasto destro mouse, ragiona
  *   sempre in questo modo».
  * ⇒ Le azioni non si MOSTRANO tutte: si RACCOLGONO. Resta un bottone solo, «…», e le cinque voci
  *   vivono nel menu che TALOS ha già (`.ft-actions-menu`, lo stesso dell'albero dei file e della
  *   barra delle sessioni): stesso aspetto, stessa tastiera, stessa chiusura — e nessun secondo
  *   menu da tenere allineato al primo.
  * ⛔ I bottoni veri restano costruiti qui, ma FUORI dalla riga: sono ciò che il menu aziona, e sono
  *   il modo in cui questo componente resta provabile senza aprire un menu. Chi disegna il menu
  *   (l'app) riceve le voci già pronte da `voceMenu`.
  * ⛔ Il tasto destro non sostituisce il bottone: lo affianca. Una scorciatoia che si scopre solo se
  *   già la conosci non può essere l'unica via.
  */
 if(servizio&&id){
  apriBtn=nuovoBottone('Apri','Apri '+t.nome+' con il programma predefinito','apri');
  rinominaBtn=nuovoBottone('Rinomina','Rinomina '+t.nome,'rinomina');
  rivelaBtn=nuovoBottone('Mostra nella cartella','Mostra '+t.nome+' nella cartella','rivela');
  eliminaBtn=nuovoBottone('Elimina','Elimina '+t.nome,'elimina',' talos-button--danger');
 }
 /*
  * ⭐⭐ BC-38 — «Copia percorso» sta nel MENU, non affiancato: la regola dell'owner del 10/09
  *   («più di due azioni ⇒ tre puntini + dropdown») vale anche per la sesta. Ed è la stessa
  *   scelta di VS Code, dove il percorso intero è un COMANDO («Copy Breadcrumbs Path») e non un
  *   fumetto — letto il 12/09/2026.
  * ⛔ Esiste solo se il percorso c'è davvero: un comando che copierebbe una stringa vuota non si
  *   disegna. Le voci salvate prima di oggi non lo portano, e per loro il menu ha cinque voci.
  */
 let copiaPercorsoBtn=null;
 if(prov.percorso){
  copiaPercorsoBtn=nuovoBottone('Copia percorso','Copia il percorso di '+t.nome,'copia-percorso');
  copiaPercorsoBtn.addEventListener('click',async()=>{
   try{
    /* ⛔ Chi inietta `copia` ha GIÀ il suo messaggio d'esito (`copyText` della app mostra il suo
       toast da solo): aggiungerne un secondo darebbe due verità per un gesto solo — stessa regola
       già scritta in `sezioni-adattatori.js`. Il messaggio nella riga serve solo al ripiego. */
    const iniettata=typeof copia==='function';
    const scrivi=iniettata?copia:globalThis.navigator?.clipboard?.writeText?.bind(globalThis.navigator.clipboard);
    if(!scrivi)throw new Error('appunti non disponibili');
    await scrivi(prov.percorso);
    if(!iniettata)avviso={tono:'stato',testo:'Percorso copiato.'};
   }catch{
    /* ⛔ Il ripiego NON è «non riuscito»: il percorso è scritto nel dettaglio e si seleziona a mano. */
    avviso={tono:'errore',testo:'Gli appunti non sono disponibili: il percorso è scritto nel dettaglio, selezionalo e premi Ctrl+C.'};
   }
   mostra();
  });
 }
 /* ⛔ Scarica resta un'ANCORA anche dentro il menu: i byte li porta il browser, e vale anche per un
    file da 50 MB, che in pagina non ci starebbe. */
 const scaricaEl=indirizzo?nuovaAncora('Scarica','Scarica '+t.nome,'scarica'):null;
 if(scaricaEl)scaricaEl.setAttribute('download',t.nome);
 /* Le voci del menu, nell'ordine in cui si usano: prima ciò che si fa spesso, per ultima e staccata
    quella che non si rifa. `separaPrima` lo dice a chi disegna, senza che debba saperlo a memoria. */
 const vociMenu=[
  apriBtn&&{chiave:'apri',etichetta:'Apri',icona:'i-doc',elemento:apriBtn},
  scaricaEl&&{chiave:'scarica',etichetta:'Scarica',icona:'i-download',elemento:scaricaEl},
  rinominaBtn&&{chiave:'rinomina',etichetta:'Rinomina',icona:'i-edit',elemento:rinominaBtn},
  rivelaBtn&&{chiave:'rivela',etichetta:'Mostra nella cartella',icona:'i-folder',elemento:rivelaBtn},
  copiaPercorsoBtn&&{chiave:'copia-percorso',etichetta:'Copia percorso',icona:'i-copy',elemento:copiaPercorsoBtn},
  eliminaBtn&&{chiave:'elimina',etichetta:'Elimina',icona:'i-trash',elemento:eliminaBtn,pericolo:true,separaPrima:true},
 ].filter(Boolean);
 riga.vociMenu=()=>vociMenu.map(v=>({...v,aziona:()=>v.elemento.click()}));
 if(vociMenu.length){
  /* ⛔ L'icona «i-more» dello sprite, non tre puntini scritti a mano: il design system ce l'ha
     già, e un carattere tipografico non si allinea come un'icona né eredita il colore allo
     stesso modo. Il nome accessibile sta nell'aria-label: l'icona è muta per chi ascolta. */
  menuBtn=nuovoBottone('','Azioni su '+t.nome,'menu');
  {const sv=doc.createElementNS('http://www.w3.org/2000/svg','svg'),us=doc.createElementNS('http://www.w3.org/2000/svg','use');sv.setAttribute('class','i');sv.setAttribute('aria-hidden','true');us.setAttribute('href','#i-more');sv.append(us);menuBtn.append(sv);}
  menuBtn.setAttribute('aria-haspopup','menu');
  menuBtn.addEventListener('click',(e)=>{e.stopPropagation();onMenu?.(riga.vociMenu(),{ancoraEl:menuBtn});});
  gruppo.append(menuBtn);
  /* ⛔ Il tasto destro apre lo STESSO menu, alle coordinate del puntatore: due strade, una lista sola. */
  riga.addEventListener('contextmenu',(e)=>{e.preventDefault();onMenu?.(riga.vociMenu(),{x:e.clientX,y:e.clientY});});
 }
 /* Rinomina IN LINEA: un passo solo, quindi niente modale (LogRocket, 10/09/2026). Invio conferma, Esc annulla, e il fuoco torna da dove era partito. */
 const forma=el(doc,'form','talos-list-row__rinomina');forma.hidden=true;
 const campo=el(doc,'input','talos-list-row__nome');campo.type='text';campo.value=bozza??t.nome;campo.maxLength=255;campo.autocomplete='off';campo.spellcheck=false;campo.setAttribute('aria-label','Nuovo nome per '+t.nome);
 const salva=el(doc,'button','talos-button talos-button--primary talos-button--sm','Salva');salva.type='submit';salva.dataset.azione='rinomina-salva';salva.setAttribute('aria-label','Salva il nuovo nome di '+t.nome);
 const annullaRinomina=el(doc,'button','talos-button talos-button--ghost talos-button--sm','Annulla');annullaRinomina.type='button';annullaRinomina.dataset.azione='rinomina-annulla';annullaRinomina.setAttribute('aria-label','Annulla la rinomina di '+t.nome);
 bottoni.push(salva,annullaRinomina);forma.append(campo,salva,annullaRinomina);
 /* ⛔ Il gradino della scala: la conseguenza scritta, non un «Sei sicuro?». È l'unica delle cinque che non si rifà (saasui.design + NN/g, 10/09/2026). */
 const conferma=el(doc,'span','talos-list-row__conferma');conferma.hidden=true;
 const noElimina=el(doc,'button','talos-button talos-button--ghost talos-button--sm','Annulla');noElimina.type='button';noElimina.dataset.azione='elimina-annulla';noElimina.setAttribute('aria-label','Annulla l’eliminazione di '+t.nome);
 const siElimina=el(doc,'button','talos-button talos-button--danger talos-button--sm','Elimina');siElimina.type='button';siElimina.dataset.azione='elimina-conferma';siElimina.setAttribute('aria-label','Elimina definitivamente '+t.nome+': non si torna indietro');
 bottoni.push(noElimina,siElimina);conferma.append(el(doc,'span','talos-list-row__conferma-testo','Eliminare definitivamente? Non si torna indietro.'),noElimina,siElimina);
 const dettagli=el(doc,'button','talos-button talos-button--ghost talos-button--sm');dettagli.type='button';dettagli.dataset.azione='dettagli';
 let stato=servizio&&id?String(modo||'normale'):'normale',occupata=false,avviso=null;
 function mostra(){
  riga.dataset.aperta=String(aperta);riga.dataset.modo=stato;
  /* ⭐ BC-38, owner: «nella card/riga SOLO la cartella» — l'ultimo segmento della cartella del
     PROGETTO, non il padre vero del file (`.harness-ui-library/lib-<uuid>/`, uguale su ogni riga).
     Il percorso intero sta nel dettaglio e in «Copia percorso»: niente fumetto nativo (10/09). */
  sotto.textContent=tipo.testo+' · '+(aperta&&t.aggiornata?'Aggiornato il '+t.aggiornata:t.dataBreve)+(prov.cartellaBreve?' · in '+prov.cartellaBreve:'');
  dettagli.textContent=aperta?'Chiudi':'Dettagli';dettagli.setAttribute('aria-expanded',String(aperta));dettagli.setAttribute('aria-label',(aperta?'Chiudi i dettagli di ':'Dettagli di ')+t.nome);
  titolo.hidden=stato==='rinomina';forma.hidden=stato!=='rinomina';gruppo.hidden=stato!=='normale';conferma.hidden=stato!=='conferma';
  riga.classList.toggle('talos-list-row--muted',stato==='eliminata');
  messaggio.hidden=!avviso;
  if(avviso){messaggio.textContent=avviso.testo;messaggio.dataset.tono=avviso.tono;messaggio.setAttribute('role',avviso.tono==='errore'?'alert':'status');}
  for(const b of bottoni)b.disabled=occupata;
 }
 function cambiaModo(nuovo,ritorno){
  stato=nuovo;onModo?.(nuovo,nuovo==='rinomina'?campo.value:null);mostra();
  if(nuovo==='rinomina'){campo.focus?.();campo.select?.();}
  else if(nuovo==='conferma')noElimina.focus?.(); // ⛔ il fuoco va sulla via d'uscita, non sul bottone che cancella: un Invio di troppo non deve distruggere un file
  else if(ritorno==='rinomina')rinominaBtn?.focus?.();
  else if(ritorno==='elimina')eliminaBtn?.focus?.();
 }
 async function esegui(chiama,dopo){
  if(!servizio||occupata)return;
  occupata=true;avviso=null;mostra();
  const esito=await chiama().catch(e=>({ok:false,motivo:'Il server non ha risposto: '+(e?.message||'errore sconosciuto')+'.'}));
  occupata=false;
  if(esito?.ok){dopo();return;}
  avviso={tono:'errore',testo:esito?.motivo||'Azione non riuscita.'};mostra();
 }
 rinominaBtn?.addEventListener('click',()=>{campo.value=t.nome;cambiaModo('rinomina');});
 eliminaBtn?.addEventListener('click',()=>cambiaModo('conferma'));
 /* ⛔ L'esito si dice: «Apri» apre una finestra FUORI dal browser, quindi a schermo non cambierebbe
    niente e chi ha premuto non saprebbe se è successo qualcosa. Stessa ragione di «Mostrato nella
    cartella» qui sotto. */
 apriBtn?.addEventListener('click',()=>esegui(()=>servizio.apri(id),()=>{avviso={tono:'stato',testo:'Aperto con il programma predefinito.'};mostra();}));
 rivelaBtn?.addEventListener('click',()=>esegui(()=>servizio.rivela(id),()=>{avviso={tono:'stato',testo:'Mostrato nella cartella.'};mostra();}));
 noElimina.addEventListener('click',()=>cambiaModo('normale','elimina'));
 siElimina.addEventListener('click',()=>esegui(()=>servizio.elimina(id),()=>{stato='eliminata';onModo?.('normale',null);avviso={tono:'stato',testo:'File eliminato.'};mostra();onCambiata?.();}));
 annullaRinomina.addEventListener('click',()=>cambiaModo('normale','rinomina'));
 campo.addEventListener('input',()=>{if(stato==='rinomina')onModo?.('rinomina',campo.value);});
 campo.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault?.();cambiaModo('normale','rinomina');}});
 forma.addEventListener('submit',e=>{
  e.preventDefault?.();
  /* ⛔ Il nome si controlla QUI prima di partire: un giro a vuoto sul server per una barra è tempo perso e un errore meno chiaro. */
  const v=nomeLibreriaValido(campo.value);
  if(!v.ok){avviso={tono:'errore',testo:v.motivo};mostra();campo.focus?.();return;}
  if(v.nome===t.nome){cambiaModo('normale','rinomina');return;}
  esegui(()=>servizio.rinomina(id,v.nome),()=>{stato='normale';onModo?.('normale',null);avviso={tono:'stato',testo:'Rinominato in '+v.nome+'.'};mostra();rinominaBtn?.focus?.();onCambiata?.();});
 });
 dettagli.addEventListener('click',()=>{aperta=!aperta;mostra();onEspandi?.(aperta);});
 mostra();
 testo.append(titolo,forma,sotto,messaggio);aside.append(gruppo,conferma,dettagli);riga.append(icona,testo,aside);return riga;
}
const PAGINE=new WeakMap();
export function aggiornaPaginaLibreria(schermo,voci,opzioni={}){
 let pagina=PAGINE.get(schermo);
 if(!pagina){
  pagina={voci:[],opzioni:{},query:'',origine:'tutte',aperte:new Set(),modi:new Map()};PAGINE.set(schermo,pagina);
  const tabs=[...schermo.querySelectorAll('[data-library-origine]')];
  for(const tab of tabs){
   tab.addEventListener('click',()=>{pagina.origine=tab.dataset.libraryOrigine;renderLibreria(schermo,pagina);});
   tab.addEventListener('keydown',e=>{if(!['Home','End','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(tab),scelta=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];scelta.click();scelta.focus();});
  }
  schermo.querySelector('[data-library-query]').addEventListener('input',e=>{pagina.query=e.target.value;renderLibreria(schermo,pagina);});
  schermo.querySelector('[data-library-refresh]').addEventListener('click',()=>pagina.opzioni.onAggiorna?.());
 }
 pagina.voci=voci;pagina.opzioni={...pagina.opzioni,...opzioni};renderLibreria(schermo,pagina);
}
function renderLibreria(schermo,pagina){
 const {voci,opzioni}=pagina,visibili=filtraLibreria(voci,pagina),doc=schermo.ownerDocument;
 for(const tab of schermo.querySelectorAll('[data-library-origine]')){const attivo=pagina.origine===tab.dataset.libraryOrigine;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;}
 schermo.querySelector('[data-library-refresh]').disabled=Boolean(opzioni.caricamento);
 schermo.querySelector('.talos-topbar__path').textContent=opzioni.errore?'Libreria non disponibile':opzioni.caricamento?'Caricamento Libreria…':plurale(voci.length,'file')+' · Token non disponibili';
 const esito=schermo.querySelector('[data-library-esito]');esito.textContent=opzioni.errore||(opzioni.caricamento?'Caricamento Libreria…':visibili.length===voci.length?plurale(voci.length,'file'):visibili.length+' di '+plurale(voci.length,'file'));esito.setAttribute('role',opzioni.errore?'alert':'status');
 /* ⛔ Il ridisegno non deve buttare via né il fuoco né il nome digitato a metà: un aggiornamento dell'elenco arrivato mentre stai rinominando ti farebbe ricominciare da capo. */
 const lista=schermo.querySelector('[data-library-list]'),fuoco=doc.activeElement,attivo=fuoco?.closest?.('[data-library-id]')?.dataset.libraryId,azioneAttiva=fuoco?.dataset?.azione||'';
 lista.setAttribute('role',visibili.length?'list':'group');
 const ricarica=()=>(opzioni.onCambiata||opzioni.onAggiorna)?.();
 lista.replaceChildren(...visibili.map(v=>{
  const memoria=pagina.modi.get(v.id)||null;
  return creaLibraryRow(v,{document:doc,aperta:pagina.aperte.has(v.id),onEspandi:aperta=>{if(aperta)pagina.aperte.add(v.id);else pagina.aperte.delete(v.id);},
   sessionId:opzioni.sessionId||'',azioni:opzioni.azioni||null,modo:memoria?.modo||'normale',bozza:memoria?.bozza??null,
   onModo:(modo,bozza)=>{if(modo==='normale')pagina.modi.delete(v.id);else pagina.modi.set(v.id,{modo,bozza});},
   onCambiata:()=>{pagina.modi.delete(v.id);ricarica();},onMenu:opzioni.onMenu||null});
 }));
 if(!visibili.length)lista.append(el(doc,'p','talos-list-row talos-muted',opzioni.errore||(opzioni.caricamento?'Caricamento Libreria…':voci.length?'Nessun file corrisponde ai filtri.':'Nessun file in Libreria per questo progetto.')));
 if(attivo){
  const tornata=[...lista.querySelectorAll('[data-library-id]')].find(n=>n.dataset.libraryId===attivo);
  (azioneAttiva&&tornata?.querySelector('[data-azione="'+azioneAttiva+'"]:not([hidden])')||tornata?.querySelector('button:not([hidden]):not([disabled])'))?.focus({preventScroll:true});
 }
}
