/** Board — DataTable/FilterChips/Select del mockup, dai contratti sessions e metrics.
 * MDN aria-sort e WAI-ARIA Table Pattern, riletti 05/09/2026. Nessun dato utente in innerHTML.
 */
import { statoSessione, nomeModello } from './session-item.js';
const NUMERO = new Intl.NumberFormat('it-IT', {maximumFractionDigits:1});
const valido = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const totale = s => valido(s.usage?.prompt_tokens) && valido(s.usage?.completion_tokens) ? s.usage.prompt_tokens + s.usage.completion_tokens : null;
const compatto = n => !valido(n) ? '—' : n >= 1000 ? NUMERO.format(n / 1000) + 'k' : NUMERO.format(n);
const MOTIVI = {'fine-lavoro':'fine lavoro','giri-finiti':'giri finiti',fermata:'fermata da te',errore:'errore'};
const STATO = {vivo:['In corso','accent'],attesa:['Aspetta te','warning'],successo:['Conclusa','success'],errore:['Errore','danger'],interrotto:['Interrotta',null],ignoto:['Conclusa · esito non registrato',null]};
export function statoBoard(sessione) {
  const chiave = statoSessione(sessione).classe;
  const [testo,tono] = STATO[chiave];
  return {chiave,testo,tono};
}
export function tempoBoard(iso, adesso = new Date()) {
  if (!iso) return '—';
  const data = new Date(iso), ms = adesso - data;
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const giorno = d => new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  const giorni = Math.round((giorno(adesso) - giorno(data)) / 86400000);
  if (giorni === 1) return 'ieri';
  if (giorni > 1) return giorni < 7 ? giorni + ' giorni fa' : data.toLocaleDateString('it-IT');
  const minuti = Math.floor(ms / 60000);
  if (minuti < 1) return 'ora';
  if (minuti < 60) return minuti + ' min fa';
  const ore = Math.floor(minuti / 60);
  return ore + (ore === 1 ? ' ora fa' : ' ore fa');
}
export function testiBoard(sessione, metriche = {}, adesso = new Date()) {
  return {
    titolo:sessione.nome || sessione.taskId || 'Sessione', modello:nomeModello(sessione.modello) || '—',
    giri:valido(sessione.usage?.giri) ? String(sessione.usage.giri) : '—', token:compatto(totale(sessione)),
    cache:(valido(metriche?.cache?.percentuale) ? NUMERO.format(metriche.cache.percentuale) + '%' : '—') + (valido(sessione.usage?.cached_tokens) ? ' · ' + compatto(sessione.usage.cached_tokens) : ''),
    primo:valido(metriche?.primoToken?.ms) ? (metriche.primoToken.ms / 1000).toFixed(1).replace('.',',') + ' s' : '—',
    chiusura:MOTIVI[metriche?.chiusura?.motivo] || (metriche?.chiusura?.motivo ? 'altro motivo' : '—'),
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
  const titolo=el(doc,'td','title'), apri=el(doc,'button','talos-board-session',t.titolo);
  apri.type='button'; apri.title=t.titolo; apri.setAttribute('aria-label','Apri '+t.titolo);
  titolo.append(apri); riga.append(titolo);
  const cellaStato=el(doc,'td'); cellaStato.append(el(doc,'span','talos-badge'+(stato.tono?' talos-badge--'+stato.tono:'')+' talos-badge--sm',stato.testo)); riga.append(cellaStato);
  const modello=el(doc,'td','talos-mono talos-board-model',t.modello); modello.title=sessione.modello || 'Modello non registrato'; riga.append(modello);
  for (const campo of ['giri','token','cache','primo']) {
    const cella=el(doc,'td','num talos-mono talos-measure',t[campo]);
    if (campo==='token' && valido(totale(sessione))) cella.title=totale(sessione).toLocaleString('it-IT')+' token · ingresso + uscita';
    if (campo==='primo' && t.primo==='—') cella.title=metriche?.primoToken?.motivoAssente || 'Tempo non registrato';
    if (campo==='cache') {
      cella.title=valido(sessione.usage?.cached_tokens) ? sessione.usage.cached_tokens.toLocaleString('it-IT')+' token in cache' : metriche?.cache?.motivoAssente || 'Cache non registrata';
      cella.setAttribute('aria-label',t.cache+' · '+cella.title);
    }
    riga.append(cella);
  }
  riga.append(el(doc,'td',t.chiusura==='—'?'talos-muted':null,t.chiusura));
  const costo=el(doc,'td','num talos-mono talos-measure--estimate'); costo.hidden=true; costo.dataset.richiede='fase3'; riga.append(costo);
  const data=el(doc,'td','talos-muted',t.avviata); data.title=sessione.avviataAlle || 'Data non registrata'; riga.append(data);
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
  const card=el(doc,'div','talos-card talos-table-wrap'); card.dataset.c='DataTable'; card.id='boardTabella'; card.setAttribute('role','tabpanel'); card.setAttribute('aria-label','Sessioni filtrate');
  const tabella=el(doc,'table','talos-table'); tabella.setAttribute('aria-label','Sessioni');
  const testa=el(doc,'thead'), riga=el(doc,'tr');
  const ordine=opzioni.ordine || 'recenti';
  ['Sessione','Stato','Modello','Giri','Token','Cache','Primo token','Chiusa per','Costo','Avviata'].forEach((nome,i)=>{
    const th=el(doc,'th',[3,4,5,6,8].includes(i)?'num':null,nome); th.scope='col';
    if (i===8) {th.hidden=true;th.dataset.richiede='fase3';}
    if ((ordine==='nome' && i===0) || (ordine==='token' && i===4) || (['recenti','vecchie'].includes(ordine) && i===9)) th.setAttribute('aria-sort',['nome','vecchie'].includes(ordine)?'ascending':'descending');
    riga.append(th);
  });
  testa.append(riga); const corpo=el(doc,'tbody');
  for (const sessione of sessioni) corpo.append(creaRigaBoard(sessione,{...opzioni,metriche:opzioni.metriche?.[sessione.sessionId]}));
  if (!sessioni.length) {const tr=el(doc,'tr'),td=el(doc,'td','talos-muted',opzioni.vuoto || 'Nessuna sessione corrisponde ai filtri.');td.colSpan=9;tr.append(td);corpo.append(tr);}
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
  const alternative=[['','Tutte le cartelle'],...percorsi.map(p=>[p,p]),...(opzioni.cartelleCaricate && sessioni.some(s=>!cartelle[s.sessionId])?[['@assente','Cartella non registrata']]:[])];
  if (JSON.stringify(alternative)!==vista.alternative) {
    selettore.replaceChildren(...alternative.map(([valore,testo])=>{const o=el(doc,'option',null,testo);o.value=valore;return o;}));vista.alternative=JSON.stringify(alternative);
  }
  if (!alternative.some(([valore])=>valore===vista.cartella)) vista.cartella='';
  selettore.value=vista.cartella;
  for (const tab of schermo.querySelectorAll('[data-board-stato]')) {const attivo=tab.dataset.boardStato===vista.stato;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;}
  const aggiornamento=schermo.querySelector('[data-board-refresh]');aggiornamento.disabled=Boolean(opzioni.caricamento); aggiornamento.textContent=opzioni.caricamento?'Aggiornamento…':'Aggiorna';
  schermo.querySelector('.talos-topbar__path').textContent=sessioni.length+' sessioni'+(opzioni.cartelleCaricate?' · '+percorsi.length+' cartelle':'');
  const esito=schermo.querySelector('#boardEsito');
  esito.textContent=opzioni.errore || (visibili.length===sessioni.length ? sessioni.length+' sessioni' : visibili.length+' di '+sessioni.length+' sessioni')+(opzioni.metricheInCaricamento?' · Caricamento metriche…':'')+(opzioni.cartelleInCaricamento?' · Caricamento cartelle…':'')+(opzioni.avviso?' · '+opzioni.avviso:'');
  esito.setAttribute('role',opzioni.errore?'alert':'status');
  const attivo=doc.activeElement?.closest('[data-board-session-id]')?.dataset.boardSessionId;
  const tabella=creaTabellaBoard(visibili,{...opzioni,ordine:vista.ordine,vuoto:opzioni.errore || (opzioni.caricamento?'Caricamento sessioni…':sessioni.length?'Nessuna sessione corrisponde ai filtri.':'Nessuna sessione ancora — premi «Nuova» per iniziare.')});
  schermo.querySelector('[data-c="DataTable"]').replaceWith(tabella);
  if (attivo) [...tabella.querySelectorAll('[data-board-session-id]')].find(n=>n.dataset.boardSessionId===attivo)?.querySelector('button').focus({preventScroll:true});
}
