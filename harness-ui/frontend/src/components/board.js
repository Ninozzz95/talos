/** Board — DataTable/FilterChips/Select del mockup, dai contratti sessions e metrics.
 * MDN aria-sort e WAI-ARIA Table Pattern, riletti 05/09/2026. Nessun dato utente in innerHTML.
 */
import { testoDelCampo } from './testo-server.js'; // K4b: i motivi delle metriche nella lingua dell'interfaccia
import { t as traduci, tn, linguaCorrenteDiT } from './lingua.js';
import { statoSessione, nomeModello } from './session-item.js';
// ⛔ 06/9, CB-04: le colonne Giri/Token/Cache promettono la SESSIONE, non l'ultimo invio.
import { usageDellaSessione, esecuzioniDellaSessione, giriDellaSessione, spiegaGiriFermati } from './consumo-sessione.js';
/* Date e numeri nella lingua dell'interfaccia (italiano → it-IT, inglese → en-US), letta a ogni uso. */
const localeUI = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');
const numero = n => new Intl.NumberFormat(localeUI(), {maximumFractionDigits:1}).format(n);
const conta = n => tn('sezioni.board.count.one','sezioni.board.count.many',n,{n:new Intl.NumberFormat(localeUI()).format(n)});
const valido = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const totale = s => { const u = usageDellaSessione(s); return valido(u?.prompt_tokens) && valido(u?.completion_tokens) ? u.prompt_tokens + u.completion_tokens : null; };
const compatto = n => !valido(n) ? '—' : n >= 1000 ? numero(n / 1000) + 'k' : numero(n);
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
const STATO = {vivo:[()=>traduci('sezioni.board.state.running'),'accent'],attesa:[()=>traduci('sezioni.board.state.waiting'),'warning'],successo:[()=>traduci('sezioni.board.state.done'),'success'],errore:[()=>traduci('sezioni.board.state.error'),'danger'],fermata:[()=>traduci('sezioni.board.state.stopped'),null],interrotto:[()=>traduci('sezioni.board.state.interrupted'),null],pendente:[()=>traduci('sezioni.board.state.new'),null],ignoto:[()=>traduci('sezioni.board.state.doneUnknownOutcome'),null]};
export const CLASSI_STATO_BOARD = Object.keys(STATO);
export function statoBoard(sessione) {
  const chiave = statoSessione(sessione).classe;
  const [etichetta,tono] = STATO[chiave] ?? [()=>traduci('sezioni.board.state.unrecognized'),null];
  return {chiave,testo:etichetta(),tono};
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
  const dati = sessioni.filter(s => (stato === 'tutte' || statoBoard(s).chiave === stato || (stato === 'successo' && statoBoard(s).chiave === 'ignoto')) && (!cartella || (cartella === '@assente' ? !cartelle[s.sessionId] : cartelle[s.sessionId] === cartella)));
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
  riga.addEventListener('click', event => onApri?.(sessione,event));
  riga.addEventListener('contextmenu', event => {event.preventDefault(); event.stopPropagation(); onMenu?.(sessione,{x:event.clientX,y:event.clientY,focusElement:apri});});
  apri.addEventListener('keydown', event => {
    if (event.key==='ContextMenu' || (event.key==='F10' && event.shiftKey)) {
      event.preventDefault(); event.stopPropagation(); const r=apri.getBoundingClientRect(); onMenu?.(sessione,{x:r.left,y:r.bottom,focusElement:apri});
    }
  });
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
const VISTE = new WeakMap();
/** Aggiorna SOLO la Board: controlli e focus rimangono stabili durante i caricamenti. */
export function aggiornaBoard(schermo, sessioni, opzioni={}) {
  let vista=VISTE.get(schermo);
  if (!vista) {
    vista={sessioni:[],opzioni:{},stato:'tutte',cartella:'',ordine:'recenti'}; VISTE.set(schermo,vista);
    const tabs=[...schermo.querySelectorAll('[data-board-stato]')];
    for (const tab of tabs) {
      tab.addEventListener('click',()=>{vista.stato=tab.dataset.boardStato;renderBoard(schermo,vista);});
      tab.addEventListener('keydown',event=>{
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault(); const i=tabs.indexOf(tab);
        const scelta=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];
        scelta.click();scelta.focus();
      });
    }
    schermo.querySelector('[data-board-ordine]').addEventListener('change',event=>{vista.ordine=event.target.value;renderBoard(schermo,vista);});
    const cartella=schermo.querySelector('[data-board-cartella]');
    cartella.addEventListener('focus',()=>vista.opzioni.onCartelle?.());
    cartella.addEventListener('change',()=>{vista.cartella=cartella.value;renderBoard(schermo,vista);});
    schermo.querySelector('[data-board-refresh]').addEventListener('click',()=>vista.opzioni.onAggiorna?.());
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
  schermo.querySelector('.talos-topbar__path').textContent=conta(sessioni.length)+(opzioni.cartelleCaricate?' · '+tn('sezioni.board.folders.one','sezioni.board.folders.many',percorsi.length):'');
  const esito=schermo.querySelector('#boardEsito');
  esito.textContent=opzioni.errore || (visibili.length===sessioni.length ? conta(sessioni.length) : traduci("sezioni.common.shownOfTotal", { shown: visibili.length, total: conta(sessioni.length) }))+(opzioni.metricheInCaricamento?' · '+traduci("sezioni.board.loadingMetrics"):'')+(opzioni.cartelleInCaricamento?' · '+traduci("sezioni.board.loadingFolders"):'')+(opzioni.avviso?' · '+opzioni.avviso:'');
  esito.setAttribute('role',opzioni.errore?'alert':'status');
  const attivo=doc.activeElement?.closest('[data-board-session-id]')?.dataset.boardSessionId;
  const tabella=creaTabellaBoard(visibili,{...opzioni,ordine:vista.ordine,vuoto:opzioni.errore || (opzioni.caricamento?traduci("sezioni.board.loading"):sessioni.length?traduci("sezioni.board.noMatches"):traduci("sezioni.board.empty"))});
  schermo.querySelector('[data-c="DataTable"]').replaceWith(tabella);
  if (attivo) [...tabella.querySelectorAll('[data-board-session-id]')].find(n=>n.dataset.boardSessionId===attivo)?.querySelector('button').focus({preventScroll:true});
}
