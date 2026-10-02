import { creaCronologiaGrafo } from './cronologia-grafo.js';
import { graphlib, layout } from '@dagrejs/dagre';
import { nomeUmanoAttrezzo } from './nomi-attrezzi.js';
import { linguaCorrenteDiT } from './lingua.js';
import { ICONA_TONO } from './grafo/comuni.js';

const idValido = v => typeof v === 'string' && v.length > 0 && v.length <= 2048;
const stati = { all: 'Tutti gli stati', active: 'In corso', waiting: 'Da approvare', done: 'Conclusi', interrupted: 'Interrotti', error: 'Non riusciti', unknown: 'Stato non disponibile' };
/* il tono di ogni stato, nella scala del Workflow (`grafo/comuni.js`, ICONA_TONO) */
const TONO_STATO = { active: 'corso', waiting: 'avviso', done: 'ok', error: 'errore', interrupted: 'attesa', unknown: 'neutro' };
const etichetta = { active: 'In corso', waiting: 'Da approvare', done: 'Concluso', interrupted: 'Interrotto', error: 'Errore', unknown: 'Stato non disponibile' };
function stato(a) {
  if (a.interrotta === true || a.motivoChiusura === 'fermata') return 'interrupted';
  if (a.conclusa === true) return ['errore', 'error', 'fallito', 'failed', 'rifiutato'].includes(a.ultimoEsito || a.esitoDelega) ? 'error' : 'done';
  if (a.approvalPendingCount > 0 || a.inAttesaApprovazione > 0 || a.inAttesaApprovazione === true) return 'waiting';
  return a.conclusa === false ? 'active' : 'unknown';
}

const contaValida = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
const istante = s => typeof s === 'string' && Number.isFinite(Date.parse(s)) ? Date.parse(s) : null;
/*
 * ⛔ 23/09/2026 (riparazione D6 della revisione UI) — conteggi nella lingua ATTIVA e sempre raggruppati:
 *   decisione owner «5.000» (in inglese «5,000»). In italiano `useGrouping: 'auto'` stampa «5000»; `'always'`
 *   raggruppa anche le quattro cifre (MDN, Intl.NumberFormat() constructor, opzione useGrouping, consultato
 *   23/09/2026). Anche la forma compatta segue la lingua invece di un 'it-IT' fisso.
 */
const conteggio = n => { try { return new Intl.NumberFormat(linguaCorrenteDiT(), { useGrouping: 'always' }).format(n); } catch { return String(n); } };
const compatto = n => { try { return new Intl.NumberFormat(linguaCorrenteDiT(), { notation: 'compact', maximumFractionDigits: 1 }).format(n); } catch { return String(n); } };
const tempo = ms => ms == null ? 'Durata non disponibile' : ms < 60000 ? `${Math.floor(ms / 1000)} s` : ms < 3600000 ? `${Math.floor(ms / 60000)} min` : `${Math.floor(ms / 3600000)} h ${Math.floor(ms / 60000) % 60} min`;

/** Soltanto misure dichiarate: la mancanza di telemetria non equivale a zero. */
export function attivitaNodoGrafo(a, ora = Date.now()) {
  const att = a.attivita, passi = Array.isArray(att?.passi) ? att.passi : [];
  const ultimo = passi.filter(p => istante(p.quando) != null).at(-1) || null;
  const fine = istante(a.conclusaAlle) ?? istante([...passi].reverse().find(p => ['fine', 'errore'].includes(p.tipo))?.quando);
  const inizio = istante(a.avviataAlle), stop = a.conclusa || a.interrotta ? fine : ora;
  const input = contaValida(a.usageSessione?.prompt_tokens), output = contaValida(a.usageSessione?.completion_tokens);
  const fase = a.operazioneCorrente;
  const operazione = fase?.status === 'running' && fase.kind === 'reasoning' ? 'Ragionamento in corso'
    : fase?.status === 'running' && fase.kind === 'response' ? 'Risposta in corso'
    : typeof att?.attrezzoCorrente === 'string' ? nomeUmanoAttrezzo(att.attrezzoCorrente) : null;
  /* 02/10/2026: un record di attrezzo della cronologia porta i soli contatori (`compatta`, decisione owner): niente elenco, ma
     il numero dei file sì — il nodo lo mostra; la sintesi in testa, che unisce i file di tutti, lo dichiara parziale. */
  return { token: input != null && output != null ? input + output : null, chiamate: contaValida(att?.chiamate), file: Array.isArray(att?.file) ? att.file : null,
    numeroFile: contaValida(att?.numeroFile), parziale: (att?.fileTagliati || 0) > 0, ultimo,
    operazione: stato(a) === 'active' ? operazione : null,
    durataMs: inizio != null && stop != null && stop >= inizio ? stop - inizio : null };
}
export function telemetriaGrafoAgenti(modello) {
  const t = { totale: modello.nodi.length, active: 0, waiting: 0, done: 0, interrupted: 0, error: 0, unknown: 0, chiamate: null, copertura: 0, coperturaFile: 0, token: null, coperturaToken: 0, costo: null, file: null, scritti: null, parziale: false };
  const file = new Set(), scritti = new Set();
  for (const n of modello.nodi) {
    t[n.stato]++; const a = attivitaNodoGrafo(n.dati);
    if (a.token != null) { t.token = (t.token ?? 0) + a.token; t.coperturaToken++; }
    if (a.chiamate != null) { t.chiamate = (t.chiamate ?? 0) + a.chiamate; t.copertura++; }
    if (a.file) { t.coperturaFile++; t.file ??= 0; t.scritti ??= 0; for (const f of a.file) if (typeof f.percorso === 'string') { file.add(f.percorso); if (f.scritto) scritti.add(f.percorso); } }
    t.parziale ||= a.parziale;
  }
  if (t.file != null) { t.file = file.size; t.scritti = scritti.size; }
  t.parziale ||= t.copertura < t.totale || t.coperturaFile < t.totale;
  return t;
}

/** Adapter TALOS: nessuna dipendenza o relazione ricavata dal testo del compito. */
export function modelloGrafoAgenti({ corrente = {}, sessioni = [], figli = [] } = {}, opzioni = {}) {
  const mappa = new Map();
  for (const a of sessioni) if (idValido(a?.sessionId)) mappa.set(a.sessionId, { ...a });
  if (idValido(corrente.sessionId)) mappa.set(corrente.sessionId, { ...mappa.get(corrente.sessionId), ...corrente });
  for (const a of figli) if (idValido(a?.sessionId) && a.sessionId !== corrente.sessionId) {
    mappa.set(a.sessionId, { ...mappa.get(a.sessionId), ...a, padreId: corrente.sessionId });
  }
  const archi = [];
  for (const a of mappa.values()) for (const [campo, tipo] of [['padreId', 'delega'], ['forkDa', 'ramo']]) {
    if (a[campo] !== a.sessionId && mappa.has(a[campo])) archi.push({ da: a[campo], a: a.sessionId, tipo });
  }
  const adiacenze = new Map();
  const numeroFigli = new Map();
  for (const a of archi) {
    if (!adiacenze.has(a.da)) adiacenze.set(a.da, []);
    adiacenze.get(a.da).push(a.a);
    numeroFigli.set(a.da, (numeroFigli.get(a.da) || 0) + 1);
  }
  const discendenti = radici => {
    const visitati = new Set(radici), coda = [...radici];
    for (let i = 0; i < coda.length; i++) for (const id of adiacenze.get(coda[i]) || []) {
      if (!visitati.has(id)) { visitati.add(id); coda.push(id); }
    }
    return visitati;
  };
  const inclusi = opzioni.ambito === 'workspace' && corrente.cartella
    ? new Set([...mappa.values()].filter(a => a.cartella === corrente.cartella).map(a => a.sessionId).concat([...discendenti([corrente.sessionId])]))
    : discendenti([corrente.sessionId]);
  const nascosti = new Set();
  for (const id of opzioni.collassati || []) for (const disc of discendenti([id])) if (disc !== id) nascosti.add(disc);
  const query = String(opzioni.query || '').trim().toLocaleLowerCase();
  const isolati = opzioni.isolato ? discendenti([opzioni.isolato]) : null;
  const filtrati = [...mappa.values()].filter(a => inclusi.has(a.sessionId) && !nascosti.has(a.sessionId) && (!isolati || isolati.has(a.sessionId))).map(a => ({
    id: a.sessionId, nome: a.taskCorto || a.nome || a.taskDelega || (typeof a.task === 'string' ? a.task : '') || 'Sessione senza titolo',
    stato: stato(a), dati: a, figli: numeroFigli.get(a.sessionId) || 0,
  })).filter(n => (!query || `${n.nome} ${n.dati.modello || ''}`.toLocaleLowerCase().includes(query)) && (!opzioni.stato || opzioni.stato === 'all' || n.stato === opzioni.stato));
  const offset = Number.isSafeInteger(opzioni.offset) && opzioni.offset > 0 ? opzioni.offset : 0;
  const limit = Number.isSafeInteger(opzioni.limit) && opzioni.limit > 0 ? Math.min(opzioni.limit, 100) : null;
  const nodi = limit == null ? filtrati : filtrati.slice(offset, offset + limit);
  const presenti = new Set(nodi.map(n => n.id));
  return { nodi, archi: archi.filter(a => presenti.has(a.da) && presenti.has(a.a)),
    totale: inclusi.size, totaleFiltrati: filtrati.length, offset, limit };
}

/** Il layout è calcolato dall'upstream reale; TALOS possiede dati, rendering e interazioni. */
export function layoutGrafoAgenti(modello) {
  const g = new graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'TB', nodesep: 28, ranksep: 56, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of modello.nodi) g.setNode(n.id, { width: 248, height: 138 }); // 02/10/2026: la taglia del passo del Workflow, più la riga dell'operazione
  for (const a of modello.archi) g.setEdge(a.da, a.a, {}, a.tipo);
  if (modello.nodi.length) layout(g);
  return { ...modello, width: g.graph().width || 0, height: g.graph().height || 0,
    nodi: modello.nodi.map(n => ({ ...n, ...g.node(n.id) })),
    archi: modello.archi.map(a => ({ ...a, punti: g.edge(a.da, a.a, a.tipo).points })),
  };
}

export function montaGrafoAgenti(host, { dati, onApri, onChiudi, onAggiorna, onLeggiFile, onLeggiCronologia, storage = globalThis.sessionStorage } = {}) {
  let vivo = dati, posizione = null;
  const storico = creaCronologiaGrafo(dati.corrente.sessionId);
  let letturaCronologia = null, coverage = 'loading', erroreCronologia = '', persistita = true;
  let play = false, framePlayer = null, ultimoFrame = null, clockReplay = null, velocita = 1;
  let letturaFile = 0;
  const d = host.ownerDocument, key = `talos.grafo.v1:${dati.corrente.sessionId}`;
  let salvato = {};
  try { const raw = storage?.getItem(key); if (raw && raw.length < 65536) salvato = JSON.parse(raw) || {}; } catch { /* storage non disponibile */ }
  const opzioni = { ambito: salvato.ambito === 'workspace' ? 'workspace' : 'sessione', query: typeof salvato.query === 'string' ? salvato.query.slice(0, 300) : '',
    stato: Object.hasOwn(stati, salvato.stato) ? salvato.stato : 'all', collassati: Array.isArray(salvato.collassati) ? salvato.collassati.filter(idValido).slice(0, 1000) : [],
    selezionato: idValido(salvato.selezionato) ? salvato.selezionato : null, isolato: null };
  let corrente = dati, disegno, zoom = 1, x = 0, y = 0, primo = true, segui = false, morto = false;
  let vistaToccata = false, gruppoAperto = null, paginaGruppo = 0;
  const el = (tag, classe, testo) => { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; };
  const bottone = (testo, azione, aria) => { const b = el('button', 'talos-button talos-button--ghost talos-button--sm', testo); b.type = 'button'; if (aria) b.setAttribute('aria-label', aria); b.addEventListener('click', azione); return b; };
  /*
   * ⭐ 02/10/2026 (owner: «il grafo legacy per la delega deve essere allineato … allo stesso stile grammatica di quello del
   *   workflow … gli stessi movimenti … i tasti e pulsanti»; non identico). La struttura, i comandi, la riproduzione e il pannello
   *   di dettaglio riusano le classi del diagramma del Workflow (`grafo-workflow.css`, `grafo-tela.css`) e la sua grammatica:
   *   a sinistra CHE COSA si guarda, a destra COME (`grafo-workflow.js:130-180`). Le funzioni che il Workflow non ha (Segui attivo,
   *   Isola, Affianca file, filtro per stato, schede per stato, Aggiorna) restano, nello stesso stile: icone, una scelta con menu,
   *   un «⋯» (regola di casa: più di due azioni ⇒ menu), mai un controllo nativo.
   */
  const icona = (nome, classe = '') => {
    const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `i ${classe}`.trim()); svg.setAttribute('aria-hidden', 'true');
    const use = d.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${nome}`); svg.append(use);
    return svg;
  };
  const tasto = (classe, aria, nomeIcona, azione) => { const b = el('button', classe); b.type = 'button'; if (aria) b.setAttribute('aria-label', aria); if (nomeIcona) b.append(icona(nomeIcona)); if (azione) b.addEventListener('click', azione); return b; };
  const root = el('section', 'talos-grafo talos-wfg talos-grafo--deleghe'); root.dataset.c = 'GrafoAgenti'; root.setAttribute('aria-label', 'Diagramma della sessione');
  const cima = el('header', 'talos-wfg__cima talos-grafo__cima');
  const titoli = el('div', 'talos-wfg__titoli');
  const sommario = el('p', 'talos-wfg__sommario'), descrizione = el('p', 'talos-wfg__descrizione', 'Le deleghe della sessione, con il loro stato e l’attività registrata. Seleziona un agente per vederne i dettagli.');
  titoli.append(el('h2', 'talos-wfg__titolo', 'Diagramma della sessione'), sommario, descrizione);
  const lato = el('div', 'talos-wfg__lato'), latoRiga = el('div', 'talos-wfg__lato-riga');
  const aggiornato = el('div', 'talos-wfg__aggiornato'), aggiornatoOra = el('span', 'talos-wfg__aggiornato-ora');
  aggiornato.append(aggiornatoOra);
  const torna = el('button', 'talos-button talos-button--secondary talos-button--sm talos-wfg__torna', 'Torna alla chat'); torna.type = 'button';
  torna.setAttribute('aria-label', 'Chiudi il diagramma'); torna.addEventListener('click', () => onChiudi?.());
  latoRiga.append(aggiornato, torna); lato.append(latoRiga); cima.append(titoli, lato);

  /* la riga dei comandi: a sinistra l'ambito e lo stato (CHE COSA), a destra cerca, zoom, adatta, lettura, segui e «⋯» (COME) */
  const comandi = el('div', 'gv-comandi talos-grafo__comandi'); comandi.setAttribute('role', 'toolbar'); comandi.setAttribute('aria-label', 'Comandi del diagramma');
  const viste = el('div', 'gv-viste'); viste.setAttribute('role', 'radiogroup'); viste.setAttribute('aria-label', 'Ambito del diagramma');
  const vociAmbito = new Map([['sessione', 'Sessione corrente', 'i-branch'], ['workspace', 'Cartella corrente', 'i-folder']].map(([id, testo, ic]) => {
    const b = el('button', 'gv-vista'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.ambito = id; b.append(icona(ic), el('span', null, testo));
    b.addEventListener('click', () => { opzioni.ambito = id; disegnaComandi(); ridisegna(); adatta(); });
    viste.append(b); return [id, b];
  }));
  viste.addEventListener('keydown', e => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault(); const prossimo = opzioni.ambito === 'sessione' ? 'workspace' : 'sessione';
    vociAmbito.get(prossimo).click(); vociAmbito.get(prossimo).focus();
  });
  const menuStato = el('div', 'talos-wfg__menu-vista');
  const sceltaStato = el('button', 'talos-wfg__scelta'); sceltaStato.type = 'button'; sceltaStato.setAttribute('aria-haspopup', 'menu'); sceltaStato.setAttribute('aria-expanded', 'false');
  const sceltaTesto = el('span'); sceltaStato.append(sceltaTesto, icona('i-chev', 'talos-wfg__scelta-freccia'));
  const vociStato = el('div', 'talos-wfg__menu'); vociStato.setAttribute('role', 'menu'); vociStato.setAttribute('aria-label', 'Filtra stato nel diagramma'); vociStato.hidden = true;
  for (const [id, testo] of Object.entries(stati)) {
    const b = el('button', 'talos-wfg__menu-voce', testo); b.type = 'button'; b.setAttribute('role', 'menuitemradio'); b.tabIndex = -1; b.dataset.stato = id;
    b.addEventListener('click', () => { chiudiMenu(sceltaStato, vociStato, { fuoco: true }); impostaStato(id); });
    vociStato.append(b);
  }
  sceltaStato.addEventListener('click', () => (vociStato.hidden ? apriMenu(sceltaStato, vociStato) : chiudiMenu(sceltaStato, vociStato)));
  menuStato.append(sceltaStato, vociStato);
  const ricerca = el('input', 'talos-wfg__cerca'); ricerca.type = 'search'; ricerca.placeholder = 'Cerca agente…'; ricerca.setAttribute('aria-label', 'Cerca agente nel diagramma'); ricerca.value = opzioni.query;
  ricerca.hidden = !opzioni.query;
  ricerca.addEventListener('input', () => { opzioni.query = ricerca.value; ridisegna(); adatta(); });
  /* Esc resta nel campo: prima svuota, poi chiude e torna alla lente. ⛔ Senza `stopPropagation` risaliva alla catena degli Esc
     della app (`app.js`, ROOT keydown) e con un giro in corso apriva «Fermo il giro?» (misurato il 02/10 dalla prova GRAMMATICA). */
  ricerca.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    if (ricerca.value) { ricerca.value = ''; opzioni.query = ''; ridisegna(); adatta(); return; }
    ricerca.hidden = true; cerca.focus();
  });
  const cerca = tasto('talos-wfg__icona-bottone', 'Cerca nel diagramma', 'i-search', () => { ricerca.hidden = ricerca.value ? false : !ricerca.hidden; if (!ricerca.hidden) ricerca.focus(); });
  const meno = tasto('talos-wfg__icona-bottone', 'Riduci zoom', 'i-minus', () => scala(zoom / 1.2));
  const misura = tasto('talos-wfg__icona-bottone gv-percento', 'Zoom al 100%', null, () => scala(1)); misura.textContent = '100%'; misura.dataset.zoom = '';
  const piu = tasto('talos-wfg__icona-bottone', 'Aumenta zoom', 'i-plus', () => scala(zoom * 1.2));
  const adattaTasto = tasto('talos-wfg__icona-bottone', 'Adatta il diagramma alla finestra', 'i-fit', () => adatta());
  const letturaTasto = tasto('talos-wfg__icona-bottone', 'Zoom di lettura', 'i-eye', () => lettura());
  const follow = tasto('talos-wfg__icona-bottone gv-percorso', 'Segui l’agente attivo', 'i-robot', () => { segui = !segui; follow.setAttribute('aria-pressed', String(segui)); if (segui) centraAttivo(); });
  follow.append(el('span', null, 'Segui attivo')); follow.setAttribute('aria-pressed', 'false');
  follow.title = 'Tiene al centro l’agente che sta lavorando';
  const menuAltro = el('div', 'talos-wfg__menu-vista');
  const altro = tasto('talos-wfg__icona-bottone', 'Altri comandi del diagramma', 'i-more'); altro.setAttribute('aria-haspopup', 'menu'); altro.setAttribute('aria-expanded', 'false');
  const vociAltro = el('div', 'talos-wfg__menu talos-wfg__menu--destra'); vociAltro.setAttribute('role', 'menu'); vociAltro.setAttribute('aria-label', 'Altri comandi del diagramma'); vociAltro.hidden = true;
  const voceAltro = (testo, azione) => { const b = el('button', 'talos-wfg__menu-voce', testo); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.tabIndex = -1; b.addEventListener('click', () => { chiudiMenu(altro, vociAltro, { fuoco: true }); azione(); }); vociAltro.append(b); return b; };
  const isola = voceAltro('Isola selezionato', () => { if (opzioni.selezionato) { opzioni.isolato = opzioni.selezionato; ridisegna(); adatta(); } });
  const affianca = voceAltro('Affianca file', () => mostraFile()); affianca.setAttribute('aria-pressed', 'false');
  voceAltro('Aggiorna', () => { onAggiorna?.(); void caricaCronologia(); });
  voceAltro('Azzera filtri', () => { opzioni.query = ''; opzioni.stato = 'all'; opzioni.isolato = null; opzioni.collassati = []; ricerca.value = ''; ricerca.hidden = true; disegnaComandi(); ridisegna(); adatta(); });
  altro.addEventListener('click', () => (vociAltro.hidden ? apriMenu(altro, vociAltro) : chiudiMenu(altro, vociAltro)));
  menuAltro.append(altro, vociAltro);
  const sinistra = el('div', 'gv-comandi-gruppo'); sinistra.append(viste, menuStato);
  const destra = el('div', 'gv-comandi-gruppo'); destra.append(ricerca, cerca, meno, misura, piu, adattaTasto, letturaTasto, follow, menuAltro);
  comandi.append(sinistra, destra);
  const attrezziTela = [meno, misura, piu, adattaTasto, letturaTasto, follow, isola, affianca];
  function impostaStato(id) { opzioni.stato = id; disegnaComandi(); ridisegna(); adatta(); }
  function disegnaComandi() {
    for (const [id, b] of vociAmbito) b.setAttribute('aria-checked', String(id === opzioni.ambito));
    sceltaTesto.textContent = stati[opzioni.stato];
    sceltaStato.setAttribute('aria-label', `Filtra stato nel diagramma: ${stati[opzioni.stato]}`);
    for (const b of vociStato.children) b.setAttribute('aria-checked', String(b.dataset.stato === opzioni.stato));
    isola.disabled = !opzioni.selezionato;
  }
  function apriMenu(chi, menu) { menu.hidden = false; chi.setAttribute('aria-expanded', 'true'); (menu.querySelector('[aria-checked="true"]:not(:disabled):not([hidden])') ?? menu.querySelector('button:not(:disabled):not([hidden])'))?.focus(); }
  function chiudiMenu(chi, menu, { fuoco = false } = {}) { if (menu.hidden) return; menu.hidden = true; chi.setAttribute('aria-expanded', 'false'); if (fuoco) chi.focus(); }
  root.addEventListener('keydown', e => {
    const menu = e.target.closest?.('[role="menu"]'); if (!menu) return;
    const voci = [...menu.querySelectorAll('button:not(:disabled):not([hidden])')], i = voci.indexOf(e.target), chi = menu.previousElementSibling;
    if (e.key === 'ArrowDown') { e.preventDefault(); voci[(i + 1) % voci.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); voci[(i - 1 + voci.length) % voci.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudiMenu(chi, menu, { fuoco: true }); }
    else if (e.key === 'Tab') chiudiMenu(chi, menu);
  });
  const chiudiMenuFuori = e => {
    if (!vociStato.hidden && !menuStato.contains(e.target)) chiudiMenu(sceltaStato, vociStato);
    if (!vociAltro.hidden && !menuAltro.contains(e.target)) chiudiMenu(altro, vociAltro);
    if (!vociAgente.hidden && !detAltro.contains(e.target)) chiudiMenu(menuAgente, vociAgente);
  };
  d.addEventListener('pointerdown', chiudiMenuFuori, true);

  const avviso = el('p', 'talos-wfg__avviso talos-grafo__stato'); avviso.setAttribute('role', 'status');
  const riepilogo = el('div', 'talos-grafo__riepilogo'); riepilogo.setAttribute('aria-label', 'Riepilogo del lavoro');
  const recenti = el('details', 'talos-grafo__recenti'); recenti.append(el('summary', '', 'Attività recente')); const elencoRecenti = el('div', 'talos-grafo__eventi'); recenti.append(elencoRecenti);
  const canvas = el('div', 'talos-grafo__canvas'); canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Diagramma: trascina lo sfondo o usa le frecce per spostare');
  const mondo = el('div', 'talos-grafo__mondo'); canvas.append(mondo);
  const piede = el('p', 'talos-grafo__legenda', 'Linea continua: delega · tratteggiata: ramo. Seleziona un agente per aprire il dettaglio.');
  const area = el('div', 'talos-grafo__area');
  const anteprima = el('aside', 'talos-grafo__anteprima'); anteprima.hidden = true; anteprima.setAttribute('aria-label', 'File affiancato');
  const fileCima = el('div', 'talos-grafo__file-cima'), titoloFile = el('strong', '', 'File dell’agente');
  const chiudiFile = tasto('talos-wfg__icona-bottone', 'Chiudi affiancamento', 'i-x', () => { letturaFile++; anteprima.hidden = true; affianca.setAttribute('aria-pressed', 'false'); adatta(); });
  fileCima.append(titoloFile, chiudiFile);
  /* il file da affiancare: una scelta del sistema di design (niente <select> nativo, regola del 13/09) */
  const menuFile = el('div', 'talos-wfg__menu-vista talos-grafo__file-scelta');
  const sceltaFile = el('button', 'talos-wfg__scelta'); sceltaFile.type = 'button'; sceltaFile.setAttribute('aria-haspopup', 'menu'); sceltaFile.setAttribute('aria-expanded', 'false'); sceltaFile.setAttribute('aria-label', 'File da affiancare');
  const sceltaFileTesto = el('span'); sceltaFile.append(sceltaFileTesto, icona('i-chev', 'talos-wfg__scelta-freccia'));
  const vociFile = el('div', 'talos-wfg__menu'); vociFile.setAttribute('role', 'menu'); vociFile.setAttribute('aria-label', 'File da affiancare'); vociFile.hidden = true;
  sceltaFile.addEventListener('click', () => (vociFile.hidden ? apriMenu(sceltaFile, vociFile) : chiudiMenu(sceltaFile, vociFile)));
  menuFile.append(sceltaFile, vociFile);
  const fileTesto = el('pre', ''); anteprima.append(fileCima, menuFile, fileTesto);
  const aggregato = el('section', 'talos-grafo__aggregato'); aggregato.hidden = true;
  aggregato.setAttribute('aria-label', 'Sessioni raggruppate per stato');
  const gruppi = el('div', 'talos-grafo__gruppi');
  const gruppoDettaglio = el('div', 'talos-grafo__gruppo-dettaglio');
  aggregato.append(gruppi, gruppoDettaglio);
  area.append(canvas, aggregato, anteprima);
  const mini = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); mini.classList.add('talos-grafo__mini'); mini.setAttribute('role', 'button'); mini.setAttribute('aria-label', 'Panoramica del diagramma'); mini.setAttribute('preserveAspectRatio', 'none');
  mini.tabIndex = 0; mini.setAttribute('aria-description', 'Clicca un punto per centrarlo. Frecce per spostare la vista; Invio o Spazio per centrare il diagramma.'); canvas.append(mini);
  mini.addEventListener('pointerdown', e => e.stopPropagation());
  mini.addEventListener('click', e => { const r = mini.getBoundingClientRect(); if (!disegno) return; vistaToccata = true; x = canvas.clientWidth/2 - (e.clientX-r.left)/r.width*disegno.width*zoom; y = canvas.clientHeight/2 - (e.clientY-r.top)/r.height*disegno.height*zoom; trasforma({ anima: true }); });
  mini.addEventListener('keydown', e => {
    if (!disegno) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); x = canvas.clientWidth/2 - disegno.width*zoom/2; y = canvas.clientHeight/2 - disegno.height*zoom/2; trasforma({ anima: true }); }
    const delta = { ArrowLeft: [40,0], ArrowRight: [-40,0], ArrowUp: [0,40], ArrowDown: [0,-40] }[e.key];
    if (delta) { e.preventDefault(); vistaToccata = true; x += delta[0]; y += delta[1]; trasforma(); }
  });

  /* la riproduzione, nella forma di quella del Workflow (`grafo-workflow.js:187-207`): ▶, eventi, velocità, cursore, testo, «Torna al vivo» */
  const timeline = el('div', 'gv-rip talos-grafo__timeline'); timeline.setAttribute('role', 'group'); timeline.setAttribute('aria-label', 'Riproduzione della cronologia');
  const riproduci = tasto('gv-rip-gioca', 'Riproduci la cronologia', 'i-play', () => {
    if (play) { fermaPlayer(); aggiornaTimeline(); return; }
    if (!storico.length) return;
    if (posizione == null || posizione >= storico.length-1) mostraIstante(0);
    play = true; ultimoFrame = null; aggiornaTimeline(); framePlayer = requestAnimationFrame(tickPlayer);
  });
  const eventoPrecedente = tasto('gv-rip-gioca gv-rip-passo', 'Evento precedente', 'i-chevron-right', () => mostraIstante(posizione == null ? storico.length-1 : Math.max(0,posizione-1)));
  eventoPrecedente.classList.add('gv-rip-passo--indietro');
  const eventoSuccessivo = tasto('gv-rip-gioca gv-rip-passo', 'Evento successivo', 'i-chevron-right', () => mostraIstante(posizione == null ? storico.length-1 : Math.min(storico.length-1,posizione+1)));
  const ripVelocita = el('div', 'gv-rip-velocita'); ripVelocita.setAttribute('role', 'radiogroup'); ripVelocita.setAttribute('aria-label', 'Velocità riproduzione');
  for (const v of [1, 2, 4, 16]) {
    const b = el('button', 'gv-rip-v', `${v}×`); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(v === velocita));
    b.title = v === 1 ? 'Alla velocità vera' : `${v} volte più veloce`;
    b.addEventListener('click', () => { velocita = v; for (const x of ripVelocita.children) x.setAttribute('aria-checked', String(x === b)); });
    ripVelocita.append(b);
  }
  const cursore = el('input', 'gv-rip-cursore'); cursore.type = 'range'; cursore.min = '0'; cursore.max = '0'; cursore.step = '1'; cursore.setAttribute('aria-label', 'Cronologia osservata del diagramma');
  cursore.addEventListener('input', () => mostraIstante(Number(cursore.value)));
  const istanteReplay = el('span', 'gv-rip-testo', 'Dal vivo'), descrizioneReplay = el('span', 'gv-rip-nota talos-grafo__limite', 'Caricamento cronologia…');
  const tornaLive = el('button', 'talos-button talos-button--secondary talos-button--sm gv-rip-vivo', 'Torna al vivo'); tornaLive.type = 'button'; tornaLive.hidden = true;
  tornaLive.addEventListener('click', () => mostraIstante(null));
  const riprovaCronologia = el('button', 'talos-button talos-button--secondary talos-button--sm', 'Riprova cronologia'); riprovaCronologia.type = 'button'; riprovaCronologia.hidden = true;
  riprovaCronologia.addEventListener('click', () => caricaCronologia());
  timeline.append(riproduci, eventoPrecedente, eventoSuccessivo, ripVelocita, cursore, istanteReplay, tornaLive, riprovaCronologia, descrizioneReplay);

  /* il pannello di dettaglio in basso, come quello del Workflow (`grafo-workflow.js:209-231`): chi · Evidenze recenti · Task corrente · «⋯» */
  const dettaglio = el('section', 'talos-wfg__dettaglio gv-dettaglio talos-grafo__dettaglio'); dettaglio.hidden = true; dettaglio.setAttribute('aria-label', 'Dettaglio dell\'agente');
  const detChi = el('div', 'talos-wfg__dettaglio-chi');
  const detProve = el('section', 'talos-wfg__dettaglio-colonna'); detProve.setAttribute('aria-label', 'Evidenze recenti');
  const detCompito = el('section', 'talos-wfg__dettaglio-colonna'); detCompito.setAttribute('aria-label', 'Task corrente');
  const detAltro = el('div', 'talos-wfg__dettaglio-altro');
  const menuAgente = tasto('talos-wfg__icona-bottone', 'Altre azioni sull\'agente', 'i-more'); menuAgente.setAttribute('aria-haspopup', 'menu'); menuAgente.setAttribute('aria-expanded', 'false');
  const vociAgente = el('div', 'talos-wfg__menu talos-wfg__menu--destra'); vociAgente.setAttribute('role', 'menu'); vociAgente.hidden = true;
  const voceAgente = (testo, azione) => { const b = el('button', 'talos-wfg__menu-voce', testo); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.tabIndex = -1; b.addEventListener('click', () => { chiudiMenu(menuAgente, vociAgente); azione(); }); vociAgente.append(b); return b; };
  voceAgente('Apri il dettaglio dell\'agente', () => { const n = disegno?.nodi.find(v => v.id === opzioni.selezionato); if (n) onApri?.(n.dati); });
  voceAgente('Chiudi il dettaglio', () => { dettaglioAperto = false; disegnaDettaglio(); });
  menuAgente.addEventListener('click', () => (vociAgente.hidden ? apriMenu(menuAgente, vociAgente) : chiudiMenu(menuAgente, vociAgente)));
  detAltro.append(menuAgente, vociAgente);
  dettaglio.append(detChi, detProve, detCompito, detAltro);
  let dettaglioAperto = false;
  root.append(cima, comandi, riepilogo, avviso, area, timeline, dettaglio, recenti, piede); host.append(root);
  disegnaComandi();
  async function leggiFile(agente, percorso) {
    const lettura = ++letturaFile; fileTesto.textContent = 'Lettura del file…';
    try { const risultato = await onLeggiFile?.(agente, percorso); if (morto || lettura !== letturaFile) return;
      fileTesto.textContent = typeof risultato === 'string' ? risultato : 'Anteprima non disponibile per questo file.';
    } catch (error) { if (!morto && lettura === letturaFile) fileTesto.textContent = error?.message || 'Impossibile leggere il file. Riprova selezionandolo.'; }
  }
  function mostraFile() {
    if (!anteprima.hidden) { chiudiFile.click(); return; }
    anteprima.hidden = false; affianca.setAttribute('aria-pressed', 'true');
    const agente = disegno.nodi.find(n => n.id === opzioni.selezionato)?.dati || disegno.nodi.find(n => n.dati.attivita?.file?.length)?.dati;
    const files = agente?.attivita?.file || [];
    const scegliFile = (percorso) => { sceltaFileTesto.textContent = percorso; for (const b of vociFile.children) b.setAttribute('aria-checked', String(b.dataset.percorso === percorso)); if (typeof onLeggiFile === 'function') void leggiFile(agente, percorso); };
    vociFile.replaceChildren(...files.map(f => {
      const b = el('button', 'talos-wfg__menu-voce', f.percorso); b.type = 'button'; b.setAttribute('role', 'menuitemradio'); b.tabIndex = -1; b.dataset.percorso = f.percorso;
      b.addEventListener('click', () => { chiudiMenu(sceltaFile, vociFile, { fuoco: true }); scegliFile(f.percorso); });
      return b;
    }));
    menuFile.hidden = !files.length; titoloFile.textContent = 'Contenuto attuale del file';
    if (files.length && typeof onLeggiFile === 'function') scegliFile(files[0].percorso);
    else fileTesto.textContent = 'Nessun file registrato per l’agente selezionato.';
    adatta();
  }
  function fermaPlayer() {
    play = false; ultimoFrame = null;
    if (framePlayer != null) cancelAnimationFrame(framePlayer);
    framePlayer = null;
  }
  function aggiornaTimeline() {
    tornaLive.hidden = posizione == null; root.dataset.replay = String(posizione != null);
    istanteReplay.textContent = posizione == null ? 'Dal vivo' : new Date(clockReplay).toLocaleTimeString('it-IT');
    timeline.dataset.attiva = String(posizione != null);
    cursore.max = String(Math.max(0,storico.length-1)); cursore.disabled = !storico.length;
    cursore.value = String(posizione ?? Math.max(0,storico.length-1));
    cursore.style.setProperty('--gv-pieno', `${storico.length > 1 ? Math.round(Number(cursore.value) / (storico.length - 1) * 100) : 100}%`);
    eventoPrecedente.disabled = !storico.length || posizione === 0;
    eventoSuccessivo.disabled = posizione == null || posizione >= storico.length-1;
    riproduci.disabled = storico.length < 2;
    riproduci.setAttribute('aria-label', play ? 'Metti in pausa la riproduzione' : 'Riproduci la cronologia');
    riproduci.querySelector('use')?.setAttribute('href', play ? '#i-pausa' : '#i-play');
    const nuovi = posizione == null ? 0 : storico.length-1-posizione;
    const base = coverage === 'loading' ? 'Caricamento cronologia…' : coverage === 'unavailable' ? 'Storico precedente non registrato'
      : coverage === 'partial' || storico.partial ? 'Cronologia parziale · intervalli mancanti' : 'Dall’avvio';
    descrizioneReplay.textContent = erroreCronologia ? `Cronologia non aggiornata: ${erroreCronologia}`
      : `${base}${persistita ? '' : ' · salvataggio non disponibile'}${storico.length ? ` · ${conteggio(storico.length)} eventi` : ''}${nuovi ? ` · ${conteggio(nuovi)} nuovi` : ''}`;
    riprovaCronologia.hidden = !erroreCronologia;
  }
  function mostraIstante(indice) {
    fermaPlayer();
    posizione = indice == null || !storico.length ? null : Math.max(0,Math.min(storico.length-1,indice));
    const snapshot = posizione == null ? null : storico.frame(posizione);
    corrente = snapshot?.dati ?? vivo; clockReplay = snapshot?.quando ?? null;
    aggiornaTimeline(); ridisegna();
    if (snapshot) { lettura(); dimensioniCanvas = { width: canvas.clientWidth, height: canvas.clientHeight }; }
  }
  function tickPlayer(timestamp) {
    if (!play || morto || posizione == null) return;
    const delta = ultimoFrame == null || d.hidden ? 0 : Math.max(0,timestamp-ultimoFrame);
    ultimoFrame = timestamp; clockReplay += delta * velocita;
    let changed = false;
    while (posizione < storico.length-1 && storico.frame(posizione+1).quando <= clockReplay) {
      posizione++; corrente = storico.frame(posizione).dati; changed = true;
    }
    if (posizione >= storico.length-1) { clockReplay = storico.frame(posizione).quando; fermaPlayer(); }
    if (changed) ridisegna(); else {
      for (const n of disegno?.nodi ?? []) { const ui = nodiDom.get(n.id)?._parti; if (ui) { const ms = attivitaNodoGrafo(n.dati, clockReplay).durataMs; ui.durata.textContent = ms == null ? '—' : tempo(ms); } }
      aggiornaTimeline();
    }
    if (play) framePlayer = requestAnimationFrame(tickPlayer);
  }
  const visibility = () => { ultimoFrame = null; };
  d.addEventListener('visibilitychange', visibility);
  async function caricaCronologia() {
    if (morto || letturaCronologia || typeof onLeggiCronologia !== 'function') return letturaCronologia;
    letturaCronologia = (async () => {
      try {
        let after = storico.lastSeq, through;
        do {
          const page = await onLeggiCronologia({after, ...(through == null ? {} : {through}), limit:250});
          if (morto) return;
          if (page?.schema !== 'talos.agent-timeline.v1' || !Number.isSafeInteger(page.through) || page.through < after || (through != null && page.through !== through)) throw Error('Risposta della cronologia non valida');
          if (!['complete','partial','unavailable'].includes(page.coverage)) throw Error('Copertura della cronologia non valida');
          through ??= page.through;
          storico.aggiungi(page.items);
          if (page.coverage === 'complete' && page.next == null && storico.lastSeq !== through) throw Error('Eventi della cronologia mancanti');
          coverage = page.coverage; persistita = page.persisted !== false;
          if (page.next != null && (!Number.isSafeInteger(page.next) || page.next <= after || page.next !== storico.lastSeq || page.next > through)) throw Error('Pagina della cronologia non valida');
          after = page.next;
        } while (after != null);
        erroreCronologia = '';
      } catch (error) { if (!morto) erroreCronologia = error?.message || 'Connessione non disponibile'; }
      finally { letturaCronologia = null; if (!morto) { aggiornaTimeline(); ridisegna(); } }
    })();
    return letturaCronologia;
  }
  function aggiornaMini() {
    if (!disegno?.width || !disegno?.height) return;
    /* Si vede solo quando una parte del grafo è fuori vista: la metà della regola del Workflow (`grafo/tela.js:517-519`) che qui
       ha senso, perché oltre 14 agenti la tela lascia già il posto ai gruppi (decisione owner 02/10). Prima stava sempre lì e,
       a colonna stretta, copriva i nodi in basso a destra (misurato a 1440×900: copriva «Collassa»). */
    const entra = x >= -1 && y >= -1 && x + disegno.width * zoom <= canvas.clientWidth + 1 && y + disegno.height * zoom <= canvas.clientHeight + 1;
    mini.toggleAttribute('hidden', entra);
    if (entra) return;
    mini.setAttribute('viewBox', `0 0 ${disegno.width} ${disegno.height}`); mini.replaceChildren();
    for (const n of disegno.nodi) { const r = d.createElementNS(mini.namespaceURI, 'rect'); r.dataset.miniNodo = n.id; r.dataset.stato = n.stato;
      for (const [k,v] of Object.entries({x:n.x-n.width/2,y:n.y-n.height/2,width:n.width,height:n.height,rx:10})) r.setAttribute(k,String(v)); mini.append(r); }
    const r = d.createElementNS(mini.namespaceURI,'rect'); r.classList.add('talos-grafo__mini-vista');
    for (const [k,v] of Object.entries({x:-x/zoom,y:-y/zoom,width:canvas.clientWidth/zoom,height:canvas.clientHeight/zoom})) r.setAttribute(k,String(v)); mini.append(r);
  }
  function salva() { try { storage?.setItem(key, JSON.stringify(opzioni)); } catch { /* nessun errore di navigazione per quota/storage */ } }
  /* Gli stessi movimenti del Workflow: zoom, adatta e centra scorrono (240 ms), il trascinamento no; la griglia di puntini segue
     pan e zoom (`grafo-tela.css`, `.gv-tela`). Col movimento ridotto il CSS toglie la transizione. */
  let finoAnima = null;
  function trasforma({ anima = false } = {}) {
    if (anima) { mondo.classList.add('talos-grafo__mondo--anima'); clearTimeout(finoAnima); finoAnima = setTimeout(() => mondo.classList.remove('talos-grafo__mondo--anima'), 280); }
    mondo.style.transform = `translate(${x}px,${y}px) scale(${zoom})`; misura.textContent = `${Math.round(zoom * 100)}%`;
    canvas.style.setProperty('--gv-k', String(zoom)); canvas.style.setProperty('--gv-x', `${x}px`); canvas.style.setProperty('--gv-y', `${y}px`);
    aggiornaMini();
  }
  function scala(nuovo) { vistaToccata = true; const precedente = zoom; zoom = Math.max(.15, Math.min(2, nuovo)); const cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2; x = cx - (cx - x) * zoom / precedente; y = cy - (cy - y) * zoom / precedente; trasforma({ anima: true }); }
  function adatta() { if (!disegno?.nodi.length || !canvas.clientWidth || !canvas.clientHeight) return; vistaToccata = false; zoom = Math.max(.15, Math.min(1, (canvas.clientWidth - 32) / disegno.width, (canvas.clientHeight - 32) / disegno.height)); x = (canvas.clientWidth - disegno.width * zoom) / 2; y = 16; trasforma({ anima: !primo }); }
  function lettura() {
    if (!disegno?.nodi.length || !canvas.clientWidth || !canvas.clientHeight) return;
    vistaToccata = true;
    zoom = Math.max(.8, Math.min(1, (canvas.clientWidth - 32) / disegno.width, (canvas.clientHeight - 32) / disegno.height));
    const id = opzioni.selezionato || corrente.corrente.sessionId;
    centra(disegno.nodi.some(n => n.id === id) ? id : disegno.nodi[0].id);
    if (id === corrente.corrente.sessionId) { y = 16; trasforma(); }
  }
  function centra(id) {
    const n = disegno?.nodi.find(n => n.id === id); if (!n) return;
    // Un layout che entra nel canvas resta interamente visibile anche dopo la selezione.
    // Centrare solo il nodo portava le altre card sotto la testata, irraggiungibili col mouse.
    x = disegno.width * zoom <= canvas.clientWidth - 32
      ? (canvas.clientWidth - disegno.width * zoom) / 2
      : canvas.clientWidth / 2 - n.x * zoom;
    y = disegno.height * zoom <= canvas.clientHeight - 32
      ? 16
      : canvas.clientHeight / 2 - n.y * zoom;
    trasforma({ anima: !primo });
  }
  /* Il dettaglio in basso, la forma di quello del Workflow (`grafo-workflow.js:599-686`): chi · Evidenze recenti · Task corrente.
     Solo misure registrate: senza attività si dice che non c'è, mai uno zero inventato. */
  function disegnaDettaglio() {
    const n = dettaglioAperto && opzioni.selezionato ? disegno?.nodi.find(v => v.id === opzioni.selezionato) : null;
    if (!n) { dettaglio.hidden = true; chiudiMenu(menuAgente, vociAgente); return; }
    dettaglio.hidden = false;
    const a = attivitaNodoGrafo(n.dati, posizione == null ? Date.now() : clockReplay);
    const tono = TONO_STATO[n.stato] ?? 'neutro';
    const segno = el('span', 'talos-wfg__dettaglio-icona'); segno.append(icona(n.id === corrente.corrente.sessionId ? 'i-branch' : 'i-robot'));
    const testi = el('div', 'talos-wfg__dettaglio-testi'), testa = el('div', 'talos-wfg__dettaglio-testa');
    const pill = el('span', 'talos-wfg__pill'); pill.dataset.tono = tono;
    if (ICONA_TONO[tono]) pill.append(icona(ICONA_TONO[tono], 'talos-wfg__pill-icona'));
    pill.append(el('span', null, etichetta[n.stato]));
    testa.append(el('h3', 'talos-wfg__dettaglio-nome', n.nome), pill);
    const avvio = istante(n.dati.avviataAlle);
    const sotto = [n.dati.modello || (n.id === corrente.corrente.sessionId ? 'Sessione principale' : 'Sotto-agente'), a.durataMs != null ? tempo(a.durataMs) : null,
      avvio != null ? `avviata alle ${new Date(avvio).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : null].filter(Boolean).join(' · ');
    testi.append(testa, el('span', 'talos-wfg__passo-modello', sotto));
    detChi.replaceChildren(segno, testi);

    const provaTesta = el('h4', 'talos-wfg__dettaglio-titolo'); provaTesta.append(icona('i-doc'), el('span', null, 'Evidenze recenti'));
    const elenco = el('ul', 'talos-wfg__evidenze');
    const passi = (Array.isArray(n.dati.attivita?.passi) ? n.dati.attivita.passi : []).filter(p => p.tipo === 'attrezzo').slice(-4).reverse();
    const files = (a.file ?? []).slice(0, Math.max(0, 5 - passi.length));
    for (const p of passi) {
      const voce = el('li', 'talos-wfg__evidenza');
      voce.append(icona(p.esito === false ? 'i-x' : 'i-check'), el('span', 'talos-wfg__evidenza-nome', nomeUmanoAttrezzo(p.attrezzo)));
      if (p.percorso) { const o = el('code', 'talos-wfg__evidenza-oggetto', p.percorso); o.title = p.percorso; voce.append(o); }
      elenco.append(voce);
    }
    for (const f of files) {
      const voce = el('li', 'talos-wfg__evidenza');
      voce.append(icona('i-file'), el('span', 'talos-wfg__evidenza-nome', f.creato ? 'Creato' : f.scritto ? 'Modificato' : 'Letto'));
      const o = el('code', 'talos-wfg__evidenza-oggetto', f.percorso); o.title = f.percorso; voce.append(o);
      elenco.append(voce);
    }
    if (!elenco.children.length) elenco.append(el('li', 'talos-wfg__vuoto', a.chiamate == null ? 'Attività non disponibile per questo agente.' : 'Nessun attrezzo usato finora.'));
    detProve.replaceChildren(provaTesta, elenco);

    const compitoTesta = el('h4', 'talos-wfg__dettaglio-titolo'); compitoTesta.append(icona('i-eye'), el('span', null, 'Task corrente'));
    const compito = String(n.dati.task ?? n.dati.taskDelega ?? n.dati.taskCorto ?? '').trim();
    const parti = [compitoTesta];
    if (compito) { const primo = el('p', 'talos-wfg__compito-titolo', compito); primo.title = compito; parti.push(primo); }
    else parti.push(el('p', 'talos-wfg__vuoto', 'Il compito di questo agente non è disponibile.'));
    const ora = a.operazione || (n.stato === 'active' ? 'Tra due operazioni' : null);
    if (ora) parti.push(el('p', 'talos-wfg__compito-resto', ora));
    detCompito.replaceChildren(...parti);
  }
  function centraAttivo() { const n = disegno?.nodi.find(n => n.stato === 'active' && n.id !== corrente.corrente.sessionId); if (n) centra(n.id); }
  function seleziona(id, centraNodo = true) { opzioni.selezionato = id; dettaglioAperto = true; for (const n of mondo.querySelectorAll('[data-nodo-id]')) n.dataset.selezionato = String(n.dataset.nodoId === id); salva(); disegnaComandi(); disegnaDettaglio(); if (centraNodo) centra(id); }
  const nodiDom = new Map(), archiDom = new Map();
  const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('aria-hidden', 'true'); mondo.append(svg);
  const chiaveMarcatori = Math.random().toString(36).slice(2, 8); // id unici dei marcatori: due diagrammi nella stessa pagina non si rubano la freccia
  const vuoto = el('p', 'talos-grafo__vuoto', 'Nessun agente per questi filtri.'); mondo.append(vuoto);
  function disegnaAggregato(modello) {
    const perStato = new Map();
    for (const nodo of modello.nodi) {
      if (!perStato.has(nodo.stato)) perStato.set(nodo.stato, []);
      perStato.get(nodo.stato).push(nodo);
    }
    const ordinati = Object.keys(etichetta).filter(chiave => perStato.has(chiave));
    if (!perStato.has(gruppoAperto)) {
      gruppoAperto = ordinati.toSorted((a, b) => perStato.get(b).length - perStato.get(a).length)[0] || null;
      paginaGruppo = 0;
    }
    gruppi.replaceChildren(...ordinati.map(chiave => {
      const quanti = perStato.get(chiave).length;
      const card = bottone('', () => { gruppoAperto = chiave; paginaGruppo = 0; disegnaAggregato(modello); });
      card.classList.add('talos-grafo__gruppo'); card.dataset.stato = chiave;
      card.setAttribute('aria-pressed', String(gruppoAperto === chiave));
      card.setAttribute('aria-label', `${stati[chiave]}: ${conteggio(quanti)} sessioni, mostra elenco`);
      card.append(el('span', '', stati[chiave]), el('strong', 'talos-mono', conteggio(quanti)));
      const barra = el('span', 'talos-grafo__gruppo-barra');
      barra.style.width = `${Math.max(3, Math.round(quanti / modello.nodi.length * 100))}%`;
      card.append(barra); return card;
    }));
    const selezionati = perStato.get(gruppoAperto) || [];
    paginaGruppo = Math.min(paginaGruppo, Math.max(0, Math.ceil(selezionati.length / 12) - 1));
    const inizio = paginaGruppo * 12;
    const titolo = el('h3', '', `${stati[gruppoAperto] || 'Sessioni'} · ${conteggio(selezionati.length)}`);
    const elenco = el('div', 'talos-grafo__gruppo-elenco');
    for (const nodo of selezionati.slice(inizio, inizio + 12)) {
      const apri = bottone(nodo.nome, () => { opzioni.selezionato = nodo.id; salva(); onApri?.(nodo.dati); });
      apri.classList.add('talos-grafo__gruppo-riga');
      apri.dataset.sessionId = nodo.id;
      apri.setAttribute('aria-label', `Apri dettaglio ${nodo.nome}`);
      elenco.append(apri);
    }
    const pagine = el('nav', 'talos-grafo__gruppo-pagine'); pagine.setAttribute('aria-label', 'Pagine del gruppo');
    const precedente = bottone('Precedente', () => { paginaGruppo--; disegnaAggregato(modello); }, 'Pagina precedente del gruppo');
    const successiva = bottone('Successiva', () => { paginaGruppo++; disegnaAggregato(modello); }, 'Pagina successiva del gruppo');
    precedente.disabled = paginaGruppo === 0;
    successiva.disabled = inizio + 12 >= selezionati.length;
    pagine.append(precedente, el('span', 'talos-mono', `${conteggio(selezionati.length ? inizio + 1 : 0)}–${conteggio(Math.min(inizio + 12, selezionati.length))} di ${conteggio(selezionati.length)}`), successiva);
    gruppoDettaglio.replaceChildren(titolo, elenco, pagine);
  }
  function ridisegna() {
    if (morto) return;
    const intero = modelloGrafoAgenti(corrente, { ambito: opzioni.ambito });
    const filtrato = modelloGrafoAgenti(corrente, opzioni);
    const denso = filtrato.nodi.length > 14;
    root.dataset.density = denso ? 'aggregate' : 'individual';
    // in vista densa restano ambito, stato, ricerca e «⋯» (com'era la barra dei filtri prima del 02/10); spariscono solo gli attrezzi della tela
    canvas.hidden = denso; aggregato.hidden = !denso; for (const b of attrezziTela) b.hidden = denso;
    disegno = denso ? { nodi: [], archi: [], width: 0, height: 0 } : layoutGrafoAgenti(filtrato);
    const t = telemetriaGrafoAgenti(intero);
    root.dataset.obsoleto = String(Boolean(corrente.errore));
    sommario.replaceChildren(el('strong', null, `${conteggio(intero.nodi.length)} ${intero.nodi.length === 1 ? 'sessione' : 'sessioni'}`), ` nel diagramma · ${opzioni.ambito === 'workspace' ? 'cartella corrente' : 'sessione corrente e le sue deleghe'}`);
    aggiornatoOra.textContent = corrente.aggiornato ? `Ultimo aggiornamento ${new Date(corrente.aggiornato).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : '';
    const statistica = (chiave, numero, testo, filtra) => {
      const n = filtra ? bottone('', () => impostaStato(filtra)) : el('div', '');
      n.classList.add('talos-grafo__statistica'); n.dataset.statistica = chiave; if (filtra) n.dataset.stato = filtra;
      n.append(el('strong', 'talos-mono', numero == null ? '—' : compatto(numero)), el('span', '', testo)); return n;
    };
    riepilogo.replaceChildren(statistica('active', t.active, 'In corso', 'active'), statistica('waiting', t.waiting, 'Da approvare', 'waiting'),
      statistica('done', t.done, 'Conclusi', 'done'), statistica('error', t.error, 'Errori', 'error'),
      statistica('chiamate', t.chiamate, 'Chiamate strumenti'), statistica('file', t.file, 'File coinvolti'), statistica('token', t.token, 'Token registrati'));
    const copertura = el('small', 'talos-grafo__copertura', `Intero ambito · ${conteggio(t.totale)} sessioni · strumenti ${conteggio(t.copertura)}/${conteggio(t.totale)} · file ${conteggio(t.coperturaFile)}/${conteggio(t.totale)} · consumo ${conteggio(t.coperturaToken)}/${conteggio(t.totale)}${t.parziale ? ' · conteggi parziali' : ''}${t.scritti != null ? ` · ${conteggio(t.scritti)} file scritti` : ''}${t.interrupted ? ` · ${conteggio(t.interrupted)} interrotti` : ''}${t.unknown ? ` · ${conteggio(t.unknown)} stato non disponibile` : ''}`);
    riepilogo.append(copertura);
    if (denso) {
      for (const nodo of nodiDom.values()) nodo.remove(); nodiDom.clear();
      for (const arco of archiDom.values()) arco.remove(); archiDom.clear();
      svg.replaceChildren();
      disegnaAggregato(filtrato);
      avviso.textContent = `${conteggio(filtrato.nodi.length)} sessioni · gruppi derivati dagli stati registrati${corrente.errore ? ` · dati non aggiornati: ${corrente.errore}` : ''}`;
      piede.textContent = 'Sessioni raggruppate per stato. Apri un gruppo e scegli una sessione per il dettaglio.';
      aggiornaTimeline(); salva(); return;
    }
    piede.textContent = 'Linea continua: delega · tratteggiata: ramo. Seleziona un agente per aprire il dettaglio.';
    svg.setAttribute('width', String(disegno.width)); svg.setAttribute('height', String(disegno.height));
    /* Gli archi come quelli del Workflow (`grafo-tela.css`, «gli archi»): ad angolo, con la freccia, tratteggiati e in moto verso
       l'agente che sta lavorando (`fronte`), verdi verso chi ha finito (`fatto`), a tratti per un ramo. */
    if (!svg.querySelector('marker')) {
      const defs = d.createElementNS(svg.namespaceURI, 'defs');
      for (const [id, classe] of [['talos-grafo-freccia', 'gv-freccia'], ['talos-grafo-freccia-fronte', 'gv-freccia gv-freccia--fronte'], ['talos-grafo-freccia-fatto', 'gv-freccia gv-freccia--fatto']]) {
        const m = d.createElementNS(svg.namespaceURI, 'marker');
        for (const [k, v] of Object.entries({ id: `${id}-${chiaveMarcatori}`, viewBox: '0 0 8 8', refX: '7', refY: '4', markerWidth: '7', markerHeight: '7', orient: 'auto' })) m.setAttribute(k, v);
        const punta = d.createElementNS(svg.namespaceURI, 'path'); punta.setAttribute('d', 'M0,0 L8,4 L0,8 z'); punta.setAttribute('class', classe);
        m.append(punta); defs.append(m);
      }
      svg.prepend(defs);
    }
    const archiVivi = new Set();
    for (const a of disegno.archi) {
      const key = JSON.stringify([a.da, a.a, a.tipo]); archiVivi.add(key);
      let p = archiDom.get(key); if (!p) { p = d.createElementNS(svg.namespaceURI, 'path'); archiDom.set(key, p); svg.append(p); }
      const sorg = disegno.nodi.find(n => n.id === a.da), dest = disegno.nodi.find(n => n.id === a.a);
      if (sorg && dest) {
        const sx = sorg.x, sy = sorg.y + sorg.height / 2, tx = dest.x, ty = dest.y - dest.height / 2 - 2, mezzo = (sy + ty) / 2;
        p.setAttribute('d', `M${sx},${sy} V${mezzo} H${tx} V${ty}`);
      } else p.setAttribute('d', a.punti.map((q, i) => `${i ? 'L' : 'M'}${q.x},${q.y}`).join(' '));
      const attivo = posizione == null && !corrente.errore && Boolean(dest && attivitaNodoGrafo(dest.dati).operazione);
      const tipo = attivo ? 'fronte' : dest?.stato === 'done' ? 'fatto' : a.tipo === 'ramo' ? 'futuro' : '';
      p.setAttribute('class', 'gv-arco'); p.dataset.arco = a.tipo; p.dataset.attivo = String(attivo);
      if (tipo) p.dataset.tipo = tipo; else delete p.dataset.tipo;
      p.setAttribute('marker-end', `url(#${tipo === 'fronte' ? 'talos-grafo-freccia-fronte' : tipo === 'fatto' ? 'talos-grafo-freccia-fatto' : 'talos-grafo-freccia'}-${chiaveMarcatori})`);
    }
    for (const [id, n] of archiDom) if (!archiVivi.has(id)) { n.remove(); archiDom.delete(id); }
    const vivi = new Set();
    for (const n of disegno.nodi) {
      vivi.add(n.id); let nodo = nodiDom.get(n.id);
      if (!nodo) {
        nodo = el('article', 'talos-grafo__nodo'); nodo.dataset.nodoId = n.id;
        const apri = bottone('', () => { const fresco = disegno.nodi.find(v => v.id === n.id); if (fresco) { seleziona(n.id); onApri?.(fresco.dati); } }); apri.classList.add('talos-grafo__nome');
        // Il button conserva tastiera e semantica; il resto della card condivide l'apertura.
        // I comandi figli (titolo e Collassa) gestiscono già il proprio click.
        nodo.addEventListener('click', event => {
          if (event.target.closest('button,a,input,select,textarea,[role="button"]')) return;
          apri.click();
        });
        /* La forma del passo del Workflow (`.gv-passo`): punto + nome + durata, modello, pillola dello stato, misure, operazione. */
        const meta = el('span', 'talos-grafo__meta'), operazione = el('span', 'talos-grafo__operazione'), misure = el('span', 'talos-grafo__misure'), durata = el('span', 'talos-grafo__durata');
        const collassa = bottone('', () => { opzioni.collassati = opzioni.collassati.includes(n.id) ? opzioni.collassati.filter(id => id !== n.id) : [...opzioni.collassati, n.id]; ridisegna(); });
        collassa.className = 'talos-wfg__link talos-grafo__collassa';
        const testata = el('div', 'talos-grafo__testata-nodo'), pallino = el('span', 'talos-wfg__punto talos-grafo__pallino'); pallino.setAttribute('aria-hidden', 'true');
        const rigaStato = el('div', 'talos-grafo__riga-stato'), badge = el('span', 'talos-wfg__pill talos-grafo__badge-stato');
        const fondo = el('div', 'talos-grafo__fondo-nodo'); testata.append(pallino, apri, durata); rigaStato.append(badge, misure); fondo.append(operazione, collassa);
        nodo.append(testata, meta, rigaStato, fondo); nodo._parti = { apri, meta, operazione, misure, durata, collassa, badge, pallino };
        nodiDom.set(n.id, nodo); mondo.append(nodo);
      }
      const a = attivitaNodoGrafo(n.dati, posizione == null ? Date.now() : clockReplay), ui = nodo._parti;
      nodo.dataset.selezionato = String(n.id === opzioni.selezionato); nodo.dataset.stato = n.stato;
      nodo.dataset.operativo = String(posizione == null && Boolean(a.operazione) && !corrente.errore);
      Object.assign(nodo.style, { left: `${n.x - n.width / 2}px`, top: `${n.y - n.height / 2}px`, width: `${n.width}px`, height: `${n.height}px` });
      ui.apri.textContent = n.nome; ui.apri.removeAttribute('title'); ui.apri.removeAttribute('data-tip'); ui.apri.setAttribute('aria-label', `Apri dettaglio ${n.nome}`);
      ui.meta.textContent = n.dati.modello || (n.id === corrente.corrente.sessionId ? 'Sessione principale' : 'Sotto-agente'); ui.meta.title = ui.meta.textContent;
      const tono = TONO_STATO[n.stato] ?? 'neutro';
      ui.pallino.dataset.tono = tono; ui.badge.dataset.tono = tono; ui.badge.replaceChildren();
      if (ICONA_TONO[tono]) ui.badge.append(icona(ICONA_TONO[tono], 'talos-wfg__pill-icona'));
      ui.badge.append(el('span', null, etichetta[n.stato]));
      /* 02/10/2026, foto: lo stato ripetuto qui era un doppione della pillola. Chi lavora dice cosa fa; gli altri, quando hanno fatto l'ultima cosa. */
      ui.operazione.textContent = a.operazione || (n.stato === 'active' ? 'Tra due operazioni'
        : a.ultimo ? `Ultima attività alle ${new Date(a.ultimo.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : 'Nessuna attività registrata');
      ui.operazione.title = ui.operazione.textContent;
      ui.misure.textContent = a.chiamate == null ? 'Attività non disponibile' : `${a.chiamate} chiamate · ${a.file?.length ?? a.numeroFile ?? '—'} file${a.parziale ? '+' : ''}${a.token != null ? ` · ${compatto(a.token)} token` : ''}`;
      /* la durata corta, come il passo del Workflow: «—» quando non si sa (la frase intera resta nel title) */
      ui.durata.textContent = a.durataMs == null ? '—' : tempo(a.durataMs); ui.durata.title = a.durataMs == null ? 'Durata non disponibile' : a.ultimo ? `Ultima attività registrata: ${new Date(a.ultimo.quando).toLocaleString('it-IT')}` : 'Ultima attività non disponibile';
      ui.collassa.hidden = !n.figli; ui.collassa.textContent = `${opzioni.collassati.includes(n.id) ? 'Espandi' : 'Collassa'} ${n.figli}`; ui.collassa.setAttribute('aria-label', `Espandi o collassa ${n.nome}`);
    }
    for (const [id, n] of nodiDom) if (!vivi.has(id)) { n.remove(); nodiDom.delete(id); }
    vuoto.hidden = Boolean(disegno.nodi.length); mondo.style.width = `${disegno.width}px`; mondo.style.height = `${disegno.height}px`;
    const passi = intero.nodi.flatMap(n => (n.dati.attivita?.passi || []).filter(p => istante(p.quando) != null).map(p => ({ ...p, nodo: n }))).sort((a,b) => istante(b.quando) - istante(a.quando)).slice(0, 8);
    elencoRecenti.replaceChildren(...passi.map(p => {
      const frase = p.tipo === 'attrezzo' ? nomeUmanoAttrezzo(p.attrezzo) : ({ avvio: 'Avviato', fine: 'Concluso', errore: 'Errore' }[p.tipo] || 'Aggiornamento');
      const b = bottone(`${new Date(p.quando).toLocaleTimeString('it-IT')} · ${p.nodo.nome} · ${frase}${p.percorso ? ` · ${p.percorso}` : ''}`, () => { seleziona(p.nodo.id); onApri?.(p.nodo.dati); });
      b.title = b.textContent; return b;
    }));
    if (!passi.length) elencoRecenti.append(el('p', '', 'Nessuna attività con orario registrato.'));
    avviso.textContent = corrente.errore ? `Dati non aggiornati: ${corrente.errore}. Riprova con Aggiorna.` : `${disegno.nodi.length} nodi visibili · ${disegno.archi.length} collegamenti registrati${corrente.aggiornato ? ` · lettura ${new Date(corrente.aggiornato).toLocaleTimeString('it-IT')}` : ''}`;
    aggiornaTimeline(); aggiornaMini(); disegnaDettaglio();
    salva(); if (primo && canvas.clientWidth && canvas.clientHeight) { primo = false; if ((root.clientWidth || canvas.clientWidth) < 600) adatta(); else lettura(); } // la colonna, non la tela coi suoi margini (misurato il 02/10: tela 586 in una colonna di 634) else if (segui) centraAttivo();
  }
  let focusDaPuntatore = false;
  canvas.addEventListener('pointerdown', () => { focusDaPuntatore = true; }, true);
  canvas.addEventListener('pointerup', () => { focusDaPuntatore = false; }, true);
  canvas.addEventListener('pointercancel', () => { focusDaPuntatore = false; }, true);
  canvas.addEventListener('keydown', () => { focusDaPuntatore = false; }, true);
  canvas.addEventListener('focusin', e => {
    const nodo = e.target.closest('[data-nodo-id]');
    if (nodo && !focusDaPuntatore) { canvas.scrollTop = 0; canvas.scrollLeft = 0; centra(nodo.dataset.nodoId); }
  });
  let trascina = null;
  canvas.addEventListener('pointerdown', e => { if (e.button !== 0 || e.target.closest('button,input,select,article')) return; trascina = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: x, oy: y }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!trascina || e.pointerId !== trascina.id) return; vistaToccata = true; x = trascina.ox + e.clientX - trascina.x; y = trascina.oy + e.clientY - trascina.y; trasforma(); });
  const fine = () => { trascina = null; }; canvas.addEventListener('pointerup', fine); canvas.addEventListener('pointercancel', fine); canvas.addEventListener('lostpointercapture', fine);
  canvas.addEventListener('keydown', e => { if (e.target !== canvas) return; const m = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key]; if (m) { e.preventDefault(); vistaToccata = true; x += m[0]; y += m[1]; trasforma(); } });
  let dimensioniCanvas = { width: canvas.clientWidth, height: canvas.clientHeight };
  const osservatore = new ResizeObserver(() => {
    if (morto || !canvas.clientWidth || !canvas.clientHeight) return;
    const prima = dimensioniCanvas;
    dimensioniCanvas = { width: canvas.clientWidth, height: canvas.clientHeight };
    if (primo) { ridisegna(); return; }
    if (!prima.width || !prima.height) { adatta(); return; }
    if (opzioni.selezionato) centra(opzioni.selezionato);
    else if (!vistaToccata) adatta();
    else { x += (dimensioniCanvas.width - prima.width) / 2; y += (dimensioniCanvas.height - prima.height) / 2; trasforma(); }
  }); osservatore.observe(canvas);
  if (typeof onLeggiCronologia !== 'function') coverage = 'unavailable';
  ridisegna(); void caricaCronologia();
  return { elemento: root, seleziona, adatta, aggiorna(nuovi) {
      vivo = nuovi;
      if (posizione == null) corrente = nuovi;
      ridisegna(); void caricaCronologia();
    }, distruggi() { morto = true; fermaPlayer(); clearTimeout(finoAnima); d.removeEventListener('visibilitychange', visibility); d.removeEventListener('pointerdown', chiudiMenuFuori, true); osservatore.disconnect(); root.remove(); } };
}
