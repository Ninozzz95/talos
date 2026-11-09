/** Board — DataTable/FilterChips/Select del mockup, dai contratti sessions e metrics.
 * MDN aria-sort e WAI-ARIA Table Pattern, riletti 05/09/2026. Nessun dato utente in innerHTML.
 */
import { testoDelCampo } from './testo-server.js'; // K4b: i motivi delle metriche nella lingua dell'interfaccia
import { t as traduci, tn, linguaCorrenteDiT, EVENTO_LINGUA } from './lingua.js';
import { statoSessione, nomeModello, sessioniRadice } from './session-item.js';
import { compatto as compattoDeiCosti } from './costi-consumo.js';
// ⛔ 06/9, CB-04: le colonne Giri/Token/Cache promettono la SESSIONE, non l'ultimo invio.
import { usageDellaSessione, esecuzioniDellaSessione, giriDellaSessione, spiegaGiriFermati } from './consumo-sessione.js';
/* Date e numeri nella lingua dell'interfaccia (italiano → it-IT, inglese → en-US), letta a ogni uso. */
const localeUI = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');
const numero = n => new Intl.NumberFormat(localeUI(), {maximumFractionDigits:1}).format(n);
const conta = n => tn('sezioni.board.count.one','sezioni.board.count.many',n,{n:new Intl.NumberFormat(localeUI()).format(n)});
const valido = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const totale = s => { const u = usageDellaSessione(s); return valido(u?.prompt_tokens) && valido(u?.completion_tokens) ? u.prompt_tokens + u.completion_tokens : null; };
/* Revisione UX del 04/11/2026, riga 24: oltre il milione la Bacheca restava in migliaia («13.022,3k») mentre i Costi dicono «M». Un
   formato solo, quello della pagina Costi (`costi-consumo.js`, `compatto`); qui resta solo il «—» di un dato che non c'è. */
const compatto = n => !valido(n) ? '—' : compattoDeiCosti(n);
/* ⛔ Le etichette si leggono a ogni uso (funzioni), non alla creazione del modulo: seguono il cambio di lingua. */
const MOTIVI = {'fine-lavoro':()=>traduci('sezioni.board.closeReason.workDone'),'giri-finiti':()=>traduci('sezioni.board.closeReason.turnsUsedUp'),fermata:()=>traduci('sezioni.board.closeReason.stopped'),errore:()=>traduci('sezioni.board.closeReason.error')};
/*
 * ⛔ 11/09 sera, owner sulla foto del Board: «undefined is not iterable». `statoSessione` (session-item.js)
 *   restituisce anche `fermata` (errore + motivoChiusura 'fermata', dal 06/9) e `pendente` (la «Nuova»
 *   in attesa del primo messaggio): due classi che questa mappa non aveva, e la destrutturazione di
 *   `undefined` faceva cadere TUTTA la pagina invece di una riga. La mappa ora copre ogni classe della
 *   sorgente, e un ripiego dichiarato tiene in piedi la pagina se domani ne nasce un'altra: la riga dice
 *   che non la conosce, la pagina resta. Il test `board-stati-completi` prova il verso contrario.
 */
const STATO = {vivo:[()=>traduci('sezioni.board.state.running'),'accent'],agenti:[s=>tn('processi.session.stateAgentsOne','processi.session.stateAgentsMany',Number(s?.discendentiAlLavoro)),'accent'],attesa:[()=>traduci('sezioni.board.state.waiting'),'warning'],successo:[()=>traduci('sezioni.board.state.done'),'success'],errore:[()=>traduci('sezioni.board.state.error'),'warning'],fermata:[()=>traduci('sezioni.board.state.stopped'),null],interrotto:[()=>traduci('sezioni.board.state.interrupted'),null],'in-pausa':[s=>statoSessione(s).testo,'warning'],pendente:[()=>traduci('sezioni.board.state.new'),null],ignoto:[()=>traduci('sezioni.board.state.doneUnknownOutcome'),null]};
export const CLASSI_STATO_BOARD = Object.keys(STATO);
/* ⛔ owner 24/10/2026: come la barra laterale dal 23/10, l'ultimo giro finito in errore non giudica la chat — «da riprendere», ambra. */
export function statoBoard(sessione) {
  const chiave = statoSessione(sessione).classe;
  const [etichetta,tono] = STATO[chiave] ?? [()=>traduci('sezioni.board.state.unrecognized'),null];
  return {chiave,testo:etichetta(sessione),tono};
}
export function tempoBoard(iso, adesso = new Date()) {
  if (!iso) return '—';
  const data = new Date(iso), ms = adesso - data;
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const giorno = d => new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  const giorni = Math.round((giorno(adesso) - giorno(data)) / 86400000);
  if (giorni === 1) return traduci('sezioni.board.time.yesterday');
  if (giorni > 1) return giorni < 7 ? traduci('sezioni.board.time.daysAgo', {n:giorni}) : data.toLocaleDateString(localeUI());
  const minuti = Math.floor(ms / 60000);
  if (minuti < 1) return traduci('sezioni.board.time.now');
  if (minuti < 60) return traduci('sezioni.board.time.minutesAgo', {n:minuti});
  const ore = Math.floor(minuti / 60);
  return tn('sezioni.board.time.hoursAgoOne','sezioni.board.time.hoursAgoMany',ore);
}
export function testiBoard(sessione, metriche = {}, adesso = new Date()) {
  return {
    titolo:sessione.nome || sessione.taskId || traduci('sezioni.board.sessionFallback'), modello:nomeModello(sessione.modello) || '—',
    // ⛔ 14/09: i giri fermati contano come nella barra — un conto solo, `giriDellaSessione`
    giri:valido(giriDellaSessione(sessione).giri) ? String(giriDellaSessione(sessione).giri) : '—', token:compatto(totale(sessione)),
    cache:(valido(metriche?.cache?.percentuale) ? numero(metriche.cache.percentuale) + '%' : '—') + (valido(usageDellaSessione(sessione)?.cached_tokens) ? ' · ' + compatto(usageDellaSessione(sessione).cached_tokens) : ''),
    primo:valido(metriche?.primoToken?.ms) ? new Intl.NumberFormat(localeUI(), {minimumFractionDigits:1,maximumFractionDigits:1}).format(metriche.primoToken.ms / 1000) + ' s' : '—',
    chiusura:MOTIVI[metriche?.chiusura?.motivo]?.() || (metriche?.chiusura?.motivo ? traduci('sezioni.board.closeReason.other') : '—'),
    avviata:tempoBoard(sessione.avviataAlle, adesso),
  };
}
export function cartellaDaExport(esportazione) {
  const eventi = Array.isArray(esportazione?.eventi) ? esportazione.eventi : [];
  for (let i = eventi.length - 1; i >= 0; i--) {
    const evento = eventi[i];
    if (evento?.type === 'RunStarted' && typeof evento.contesto?.cartella === 'string' && evento.contesto.cartella.trim()) return evento.contesto.cartella;
  }
  return null;
}
export function selezionaSessioniBoard(sessioni, {stato='tutte',cartella='',ordine='recenti',cartelle={}} = {}) {
  const dati = sessioni.filter(s => (stato === 'tutte' || statoBoard(s).chiave === stato || (stato === 'successo' && statoBoard(s).chiave === 'ignoto') || (stato === 'vivo' && statoBoard(s).chiave === 'agenti')) && (!cartella || (cartella === '@assente' ? !cartelle[s.sessionId] : cartelle[s.sessionId] === cartella)));
  const confrontoNumero = (a,b,ascendente=false) => a === null ? (b === null ? 0 : 1) : b === null ? -1 : ascendente ? a - b : b - a;
  const data = s => Number.isFinite(Date.parse(s.avviataAlle)) ? Date.parse(s.avviataAlle) : null;
  return dati.sort((a,b) => ordine === 'nome' ? (a.nome || a.taskId || '').localeCompare(b.nome || b.taskId || '', 'it', {numeric:true,sensitivity:'base'}) : ordine === 'token' ? confrontoNumero(totale(a),totale(b)) : confrontoNumero(data(a),data(b),ordine === 'vecchie'));
}
function el(doc, tag, classe, testo) {
  const nodo = doc.createElement(tag);
  if (classe) nodo.className = classe;
  if (testo !== undefined) nodo.textContent = testo;
  return nodo;
}
/* Riga della tabella e scheda della lavagna fanno le stesse cose: un clic apre, il menu è quello delle azioni della sessione. */
function azioniDellaSessione(nodo,apri,sessione,{onApri,onMenu}) {
  nodo.addEventListener('click', event => onApri?.(sessione,event));
  nodo.addEventListener('contextmenu', event => {event.preventDefault(); event.stopPropagation(); onMenu?.(sessione,{x:event.clientX,y:event.clientY,focusElement:apri});});
  apri.addEventListener('keydown', event => {
    if (event.key==='ContextMenu' || (event.key==='F10' && event.shiftKey)) {
      event.preventDefault(); event.stopPropagation(); const r=apri.getBoundingClientRect(); onMenu?.(sessione,{x:r.left,y:r.bottom,focusElement:apri});
    }
  });
}
export function creaRigaBoard(sessione, {document:doc=globalThis.document,metriche={},adesso,onApri,onMenu}={}) {
  const t=testiBoard(sessione,metriche,adesso), stato=statoBoard(sessione);
  const riga=el(doc,'tr'); riga.dataset.boardSessionId=sessione.sessionId;
  const titolo=el(doc,'td','title',undefined), apri=el(doc,'button','talos-board-session',t.titolo);
  apri.type='button'; apri.title=t.titolo; apri.setAttribute('aria-label',traduci("sezioni.common.openName", { name: t.titolo }));
  titolo.append(apri); riga.append(titolo);
  const cellaStato=el(doc,'td'); cellaStato.append(el(doc,'span','talos-badge'+(stato.tono?' talos-badge--'+stato.tono:'')+' talos-badge--sm',stato.testo)); riga.append(cellaStato);
  const modello=el(doc,'td','talos-mono talos-board-model',t.modello); modello.title=sessione.modello || traduci("sezioni.board.modelNotRecorded"); riga.append(modello);
  for (const campo of ['giri','token','cache','primo']) {
    const cella=el(doc,'td','num talos-mono talos-measure',t[campo]);
    // ⛔ 06/9, CB-04: il suggerimento dice su quanti INVII è fatta la somma — «22,3k» senza
    //    quel dettaglio si leggeva come il consumo di un turno solo, e lo era davvero.
    const invii=esecuzioniDellaSessione(sessione);
    const daInvii=valido(invii) ? ' · '+tn('sezioni.board.tooltip.sendsOne','sezioni.board.tooltip.sendsMany',invii) : '';
    if (campo==='token' && valido(totale(sessione))) cella.title=traduci('sezioni.board.tooltip.tokens', { count: totale(sessione).toLocaleString(localeUI()) })+daInvii;
    if (campo==='giri' && t.giri!=='—') cella.title=traduci('sezioni.board.tooltip.turns')+daInvii+(giriDellaSessione(sessione).fermati ? ' · '+spiegaGiriFermati(giriDellaSessione(sessione).fermati) : '');
    if (campo==='primo' && t.primo==='—') cella.title=testoDelCampo(metriche?.primoToken,'motivoAssente') || traduci("sezioni.board.tooltip.timeNotRecorded");
    if (campo==='cache') {
      const cached=usageDellaSessione(sessione)?.cached_tokens;
      cella.title=valido(cached) ? traduci('sezioni.board.tooltip.cache', { count: cached.toLocaleString(localeUI()) })+daInvii : testoDelCampo(metriche?.cache,'motivoAssente') || traduci("sezioni.board.tooltip.cacheNotRecorded");
      cella.setAttribute('aria-label',t.cache+' · '+cella.title);
    }
    riga.append(cella);
  }
  riga.append(el(doc,'td',t.chiusura==='—'?'talos-muted':null,t.chiusura));
  const costo=el(doc,'td','num talos-mono talos-measure--estimate'); costo.hidden=true; costo.dataset.richiede='fase3'; riga.append(costo);
  const data=el(doc,'td','talos-muted',t.avviata); data.title=sessione.avviataAlle || traduci("sezioni.common.dateNotRecorded"); riga.append(data);
  azioniDellaSessione(riga,apri,sessione,{onApri,onMenu});
  return riga;
}
export function creaTabellaBoard(sessioni, opzioni={}) {
  const doc=opzioni.document || globalThis.document;
  const card=el(doc,'div','talos-card talos-table-wrap'); card.dataset.c='DataTable'; card.id='boardTabella'; card.setAttribute('role','tabpanel'); card.setAttribute('aria-label',traduci("sezioni.board.table.filtered"));
  const tabella=el(doc,'table','talos-table'); tabella.setAttribute('aria-label',traduci("sezioni.board.table.label"));
  const testa=el(doc,'thead'), riga=el(doc,'tr');
  const ordine=opzioni.ordine || 'recenti';
  [traduci('sezioni.board.column.session'),traduci('sezioni.board.column.status'),traduci('sezioni.board.column.model'),traduci('sezioni.board.column.turns'),traduci('sezioni.board.column.tokens'),traduci('sezioni.board.column.cache'),traduci('sezioni.board.column.firstToken'),traduci('sezioni.board.column.closedFor'),traduci('sezioni.board.column.cost'),traduci('sezioni.board.column.started')].forEach((nome,i)=>{
    const th=el(doc,'th',[3,4,5,6,8].includes(i)?'num':null,nome); th.scope='col';
    if (i===8) {th.hidden=true;th.dataset.richiede='fase3';}
    if ((ordine==='nome' && i===0) || (ordine==='token' && i===4) || (['recenti','vecchie'].includes(ordine) && i===9)) th.setAttribute('aria-sort',['nome','vecchie'].includes(ordine)?'ascending':'descending');
    riga.append(th);
  });
  testa.append(riga); const corpo=el(doc,'tbody');
  for (const sessione of sessioni) corpo.append(creaRigaBoard(sessione,{...opzioni,metriche:opzioni.metriche?.[sessione.sessionId]}));
  if (!sessioni.length) {const tr=el(doc,'tr'),td=el(doc,'td','talos-muted',opzioni.vuoto || traduci("sezioni.board.noMatches"));td.colSpan=9;tr.append(td);corpo.append(tr);}
  tabella.append(testa,corpo);card.append(tabella);return card;
}
/*
 * FE-009 (owner 31/10/2026): la lavagna è un modo di guardare la Bacheca, con gli stati di oggi. Quattro colonne, niente Revisione e niente
 * trascinamento: lo stato lo decidono gli eventi veri. Le interrotte stanno in Da riprendere col loro badge, e il filtro resta.
 * Il conto dei passi arriverà con la lista (FE-008), la frase su cosa aspetta è un dato che ancora non c'è: qui non si inventa niente.
 * ⛔ Una classe di stato nuova non deve far sparire una sessione: senza colonna va in Da riprendere, dove qualcuno la guarda.
 */
const COLONNE_LAVAGNA = [
  {id:'vivo',titolo:'modello.board.inProgress',vuota:'sezioni.board.kanban.emptyRunning',stati:['vivo','agenti']},
  {id:'attesa',titolo:'modello.board.waitingForYou',vuota:'sezioni.board.kanban.emptyWaiting',stati:['attesa','pendente']},
  {id:'riprendere',titolo:'modello.board.error',vuota:'sezioni.board.kanban.emptyResume',stati:['errore','fermata','interrotto']},
  {id:'concluse',titolo:'modello.board.concluded',vuota:'sezioni.board.kanban.emptyDone',stati:['successo','ignoto']},
];
export function colonneDellaLavagna(sessioni) {
  const colonne=COLONNE_LAVAGNA.map(c=>({...c,sessioni:[]}));
  const riprendere=colonne.find(c=>c.id==='riprendere');
  for (const sessione of sessioni) (colonne.find(c=>c.stati.includes(statoBoard(sessione).chiave)) ?? riprendere).sessioni.push(sessione);
  return colonne;
}
function creaSchedaLavagna(sessione, {document:doc,metriche={},adesso,onApri,onMenu}) {
  const t=testiBoard(sessione,metriche,adesso), stato=statoBoard(sessione);
  const scheda=el(doc,'div','talos-card lav-carta'); scheda.dataset.c='BoardCard'; scheda.dataset.boardSessionId=sessione.sessionId;
  const apri=el(doc,'button','talos-board-session',t.titolo);
  apri.type='button'; apri.title=t.titolo; apri.setAttribute('aria-label',traduci("sezioni.common.openName", { name: t.titolo }));
  const riga=el(doc,'div','lav-riga'); riga.append(el(doc,'span','talos-badge'+(stato.tono?' talos-badge--'+stato.tono:'')+' talos-badge--sm',stato.testo));
  if (Number.isSafeInteger(sessione.passi?.totale) && sessione.passi.totale>0) riga.append(el(doc,'span','talos-mono talos-measure',tn('sezioni.board.kanban.stepsOne','sezioni.board.kanban.stepsMany',sessione.passi.totale,{fatti:sessione.passi.fatti,totale:sessione.passi.totale})));
  scheda.append(apri,riga);
  if (t.chiusura!=='—') scheda.append(el(doc,'p','talos-muted lav-nota',t.chiusura));
  const piede=el(doc,'div','lav-riga talos-mono talos-muted lav-mod'); piede.append(el(doc,'span',null,t.modello),el(doc,'span','talos-grow'),el(doc,'span',null,t.avviata));
  scheda.append(piede);
  azioniDellaSessione(scheda,apri,sessione,{onApri,onMenu});
  return scheda;
}
export function creaLavagnaBoard(sessioni, opzioni={}) {
  const doc=opzioni.document || globalThis.document;
  const lavagna=el(doc,'div'); lavagna.className='lavagna'; lavagna.dataset.c='DataTable'; lavagna.id='boardTabella'; lavagna.setAttribute('role','tabpanel'); lavagna.setAttribute('aria-label',traduci("sezioni.board.table.filtered"));
  if (!sessioni.length) {lavagna.append(el(doc,'p','talos-muted lav-vuota',opzioni.vuoto || traduci("sezioni.board.noMatches")));return lavagna;}
  for (const colonna of colonneDellaLavagna(sessioni)) {
    const sezione=el(doc,'section','lav-col'), testa=el(doc,'div','lav-testa');
    sezione.setAttribute('aria-label',traduci(colonna.titolo));
    testa.append(el(doc,'span','talos-eyebrow',traduci(colonna.titolo)),el(doc,'span','talos-nav-item__count',String(colonna.sessioni.length)));
    sezione.append(testa);
    for (const sessione of colonna.sessioni) sezione.append(creaSchedaLavagna(sessione,{...opzioni,document:doc,metriche:opzioni.metriche?.[sessione.sessionId]}));
    if (!colonna.sessioni.length) sezione.append(el(doc,'p','talos-muted lav-vuota',traduci(colonna.vuota)));
    lavagna.append(sezione);
  }
  return lavagna;
}
/*
 * Revisione UX del 04/11/2026, riga 26 (misurato su dati finti, `strumento-26.mjs`): la barra di sinistra conta le sessioni RADICE
 *   (`sessioniRadice`: senza padre e senza profondità di delega — con o senza progetto), la Bacheca tutte, sotto-agenti compresi.
 *   72 contro 43 = 29 sessioni di sotto-agenti. La Bacheca le tiene (hanno token e cache loro) e dice quante sono.
 */
export function contoDellaBacheca(sessioni) {
  const elenco=Array.isArray(sessioni)?sessioni:[];
  const sotto=sottoAgentiDellaBacheca(elenco);
  return conta(elenco.length)+(sotto?', '+sotto:'');
}
/*
 * Decisione 187 dell'owner (04/11/2026, reperto N3b, bozzetto `variante-n3-bacheca-conto.html`, variante C): nella barra «Bacheca 5»
 *   stava accanto a «Sessioni 3» senza un perché. Sotto il nome della voce si legge «di cui 2 di sotto-agenti», le STESSE parole della
 *   testa della Bacheca: per questo la frase si compone qui, una volta, e la leggono tutte e due. Nessun sotto-agente ⇒ '' (niente riga).
 */
export function sottoAgentiDellaBacheca(sessioni) {
  const elenco=Array.isArray(sessioni)?sessioni:[];
  const figlie=elenco.length-sessioniRadice(elenco).length;
  return figlie>0?tn('sezioni.board.count.subAgentsOne','sezioni.board.count.subAgentsMany',figlie,{n:new Intl.NumberFormat(localeUI()).format(figlie)}):'';
}
/*
 * Decisione 175 dell'owner (04/11/2026, reperto N3c): con un filtro acceso la testa diceva «X di 72 sessioni, di cui 29 di sotto-agenti», e i
 *   29 erano del totale, non delle X mostrate. Ora i sotto-agenti si contano fra le MOSTRATE, e la parentesi sta attaccata a loro:
 *   «3 sessioni mostrate (di cui 2 di sotto-agenti) su 72». Senza sotto-agenti fra le mostrate resta la forma breve «3 di 72 sessioni».
 */
export function contoFiltratoDellaBacheca(visibili,sessioni) {
  const mostrate=Array.isArray(visibili)?visibili:[], tutte=Array.isArray(sessioni)?sessioni:[];
  const fmt=n=>new Intl.NumberFormat(localeUI()).format(n);
  const sotto=sottoAgentiDellaBacheca(mostrate);
  if (!sotto) return traduci('sezioni.common.shownOfTotal',{shown:fmt(mostrate.length),total:conta(tutte.length)});
  return tn('sezioni.board.count.shownOne','sezioni.board.count.shownMany',mostrate.length,{n:fmt(mostrate.length)})+' ('+sotto+') '+traduci('sezioni.board.count.outOfTotal',{total:fmt(tutte.length)});
}
export const CHIAVE_VISTA_BOARD='talos.harness.desktop.bacheca.vista.v1';
export function leggiVistaBoard(memoria) {
  try { return memoria?.getItem?.(CHIAVE_VISTA_BOARD)==='lavagna' ? 'lavagna' : 'tabella'; } catch { return 'tabella'; }
}
export function scriviVistaBoard(memoria,modo) {
  try { memoria?.setItem?.(CHIAVE_VISTA_BOARD,modo); } catch { /* memoria piena o negata: vale per questa pagina */ }
}
/* Le frecce di una fila di linguette: stesse regole per lo stato e per la vista. */
function frecceDelleLinguette(tabs) {
  for (const tab of tabs) tab.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); const i=tabs.indexOf(tab);
    const scelta=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];
    scelta.click();scelta.focus();
  });
}
const VISTE = new WeakMap();
/** Aggiorna SOLO la Board: controlli e focus rimangono stabili durante i caricamenti. */
export function aggiornaBoard(schermo, sessioni, opzioni={}) {
  let vista=VISTE.get(schermo);
  if (!vista) {
    vista={sessioni:[],opzioni:{},stato:'tutte',cartella:'',ordine:'recenti',modo:leggiVistaBoard(opzioni.memoria)}; VISTE.set(schermo,vista);
    const tabs=[...schermo.querySelectorAll('[data-board-stato]')];
    for (const tab of tabs) tab.addEventListener('click',()=>{vista.stato=tab.dataset.boardStato;renderBoard(schermo,vista);});
    frecceDelleLinguette(tabs);
    const viste=[...schermo.querySelectorAll('[data-board-vista]')];
    for (const tab of viste) tab.addEventListener('click',()=>{vista.modo=tab.dataset.boardVista;scriviVistaBoard(vista.opzioni.memoria,vista.modo);renderBoard(schermo,vista);});
    frecceDelleLinguette(viste);
    schermo.querySelector('[data-board-ordine]').addEventListener('change',event=>{vista.ordine=event.target.value;renderBoard(schermo,vista);});
    const cartella=schermo.querySelector('[data-board-cartella]');
    cartella.addEventListener('focus',()=>vista.opzioni.onCartelle?.());
    cartella.addEventListener('change',()=>{vista.cartella=cartella.value;renderBoard(schermo,vista);});
    schermo.querySelector('[data-board-refresh]').addEventListener('click',()=>vista.opzioni.onAggiorna?.());
    /* Revisione UX del 04/11/2026, riga 21: cambiata la lingua dalle Impostazioni, la Bacheca (già disegnata, anche nascosta) si ridice
       dai dati che ha — lo stesso ascolto della chat e delle Impostazioni (`talos:lingua` sulla radice, `lingua.js`). */
    schermo.ownerDocument?.documentElement?.addEventListener?.(EVENTO_LINGUA,()=>renderBoard(schermo,vista));
  }
  vista.sessioni=sessioni; vista.opzioni={...vista.opzioni,...opzioni}; renderBoard(schermo,vista);
}
function renderBoard(schermo,vista) {
  const {sessioni,opzioni}=vista, doc=schermo.ownerDocument;
  const cartelle=opzioni.cartelle || {};
  const visibili=selezionaSessioniBoard(sessioni,{...vista,cartelle});
  const selettore=schermo.querySelector('[data-board-cartella]');
  const percorsi=[...new Set(Object.values(cartelle).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
  const alternative=[['',traduci('sezioni.board.folder.all')],...percorsi.map(p=>[p,p]),...(opzioni.cartelleCaricate && sessioni.some(s=>!cartelle[s.sessionId])?[['@assente',traduci('sezioni.board.folder.unrecorded')]]:[])];
  if (JSON.stringify(alternative)!==vista.alternative) {
    selettore.replaceChildren(...alternative.map(([valore,testo])=>{const o=el(doc,'option',null,testo);o.value=valore;return o;}));vista.alternative=JSON.stringify(alternative);
  }
  if (!alternative.some(([valore])=>valore===vista.cartella)) vista.cartella='';
  selettore.value=vista.cartella;
  for (const tab of schermo.querySelectorAll('[data-board-stato]')) {const attivo=tab.dataset.boardStato===vista.stato;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;}
  const aggiornamento=schermo.querySelector('[data-board-refresh]');aggiornamento.disabled=Boolean(opzioni.caricamento); aggiornamento.textContent=opzioni.caricamento?traduci("sezioni.board.refreshing"):traduci("sezioni.board.refresh");
  /* Revisione UX del 04/11/2026, riga 23: il conteggio una volta sola, sotto il titolo (`#boardEsito`), come Note, Memoria e Attività */
  schermo.querySelector('.talos-topbar__path').textContent='';
  const quante=contoDellaBacheca(sessioni);
  const esito=schermo.querySelector('#boardEsito');
  esito.textContent=opzioni.errore || (visibili.length===sessioni.length ? quante : contoFiltratoDellaBacheca(visibili,sessioni))+(opzioni.cartelleCaricate?' · '+tn('sezioni.board.folders.one','sezioni.board.folders.many',percorsi.length):'')+(opzioni.metricheInCaricamento?' · '+traduci("sezioni.board.loadingMetrics"):'')+(opzioni.cartelleInCaricamento?' · '+traduci("sezioni.board.loadingFolders"):'')+(opzioni.avviso?' · '+opzioni.avviso:'');
  esito.setAttribute('role',opzioni.errore?'alert':'status');
  const attivo=doc.activeElement?.closest('[data-board-session-id]')?.dataset.boardSessionId;
  for (const tab of schermo.querySelectorAll('[data-board-vista]')) {const attivo=tab.dataset.boardVista===vista.modo;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;}
  /* FE-009: nella Lavagna si nasconde la legenda del «—», che parla delle colonne della Tabella; la riga di stato (#boardEsito, anche
     lei `.talos-page__note`, la prima nella pagina) resta come la governa il suo codice. */
  const nota=schermo.querySelector('.talos-page__note:not(#boardEsito)'); if (nota) nota.hidden=vista.modo==='lavagna';
  const crea=vista.modo==='lavagna'?creaLavagnaBoard:creaTabellaBoard;
  const tabella=crea(visibili,{...opzioni,ordine:vista.ordine,vuoto:opzioni.errore || (opzioni.caricamento?traduci("sezioni.board.loading"):sessioni.length?traduci("sezioni.board.noMatches"):traduci("sezioni.board.empty"))});
  schermo.querySelector('[data-c="DataTable"]').replaceWith(tabella);
  if (attivo) [...tabella.querySelectorAll('[data-board-session-id]')].find(n=>n.dataset.boardSessionId===attivo)?.querySelector('button').focus({preventScroll:true});
}
