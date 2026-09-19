import { creaCronologiaGrafo } from './cronologia-grafo.js';
import { graphlib, layout } from '@dagrejs/dagre';
import { nomeUmanoAttrezzo } from './nomi-attrezzi.js';

const idValido = v => typeof v === 'string' && v.length > 0 && v.length <= 2048;
const stati = { all: 'Tutti gli stati', active: 'In corso', waiting: 'Da approvare', done: 'Conclusi', interrupted: 'Interrotti', error: 'Non riusciti', unknown: 'Stato non disponibile' };
const etichetta = { active: 'In corso', waiting: 'Da approvare', done: 'Concluso', interrupted: 'Interrotto', error: 'Errore', unknown: 'Stato non disponibile' };
function stato(a) {
  if (a.interrotta === true || a.motivoChiusura === 'fermata') return 'interrupted';
  if (a.conclusa === true) return ['errore', 'error', 'fallito', 'failed', 'rifiutato'].includes(a.ultimoEsito || a.esitoDelega) ? 'error' : 'done';
  if (a.approvalPendingCount > 0 || a.inAttesaApprovazione > 0 || a.inAttesaApprovazione === true) return 'waiting';
  return a.conclusa === false ? 'active' : 'unknown';
}

const contaValida = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
const istante = s => typeof s === 'string' && Number.isFinite(Date.parse(s)) ? Date.parse(s) : null;
const compatto = n => new Intl.NumberFormat('it-IT', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
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
  return { token: input != null && output != null ? input + output : null, chiamate: contaValida(att?.chiamate), file: Array.isArray(att?.file) ? att.file : null,
    parziale: (att?.fileTagliati || 0) > 0, ultimo,
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
  const discendenti = radici => {
    const visitati = new Set(radici), coda = [...radici];
    const adiacenze = new Map();
    for (const a of archi) { if (!adiacenze.has(a.da)) adiacenze.set(a.da, []); adiacenze.get(a.da).push(a.a); }
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
  const nodi = [...mappa.values()].filter(a => inclusi.has(a.sessionId) && !nascosti.has(a.sessionId) && (!isolati || isolati.has(a.sessionId))).map(a => ({
    id: a.sessionId, nome: a.taskCorto || a.nome || a.taskDelega || (typeof a.task === 'string' ? a.task : '') || 'Sessione senza titolo',
    stato: stato(a), dati: a, figli: archi.filter(e => e.da === a.sessionId).length,
  })).filter(n => (!query || `${n.nome} ${n.dati.modello || ''}`.toLocaleLowerCase().includes(query)) && (!opzioni.stato || opzioni.stato === 'all' || n.stato === opzioni.stato));
  const presenti = new Set(nodi.map(n => n.id));
  return { nodi, archi: archi.filter(a => presenti.has(a.da) && presenti.has(a.a)), totale: inclusi.size };
}

/** Il layout è calcolato dall'upstream reale; TALOS possiede dati, rendering e interazioni. */
export function layoutGrafoAgenti(modello) {
  const g = new graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'TB', nodesep: 28, ranksep: 56, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of modello.nodi) g.setNode(n.id, { width: 258, height: 202 });
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
  const el = (tag, classe, testo) => { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; };
  const bottone = (testo, azione, aria) => { const b = el('button', 'talos-button talos-button--ghost talos-button--sm', testo); b.type = 'button'; if (aria) b.setAttribute('aria-label', aria); b.addEventListener('click', azione); return b; };
  const root = el('section', 'talos-grafo'); root.dataset.c = 'GrafoAgenti'; root.setAttribute('aria-label', 'Diagramma della sessione');
  const cima = el('header', 'talos-grafo__cima');
  cima.append(el('h2', '', 'Diagramma della sessione'), bottone('Torna alla chat', onChiudi, 'Chiudi il diagramma'));
  const barra = el('div', 'talos-grafo__barra');
  const scegli = (nome, valori, valore, cambia) => { const s = el('select', ''); s.setAttribute('aria-label', nome); for (const [id, testo] of Object.entries(valori)) { const o = el('option', '', testo); o.value = id; s.append(o); } s.value = valore; s.addEventListener('change', () => cambia(s.value)); return s; };
  const ricerca = el('input', ''); ricerca.type = 'search'; ricerca.placeholder = 'Cerca agente…'; ricerca.setAttribute('aria-label', 'Cerca agente nel diagramma'); ricerca.value = opzioni.query;
  ricerca.addEventListener('input', () => { opzioni.query = ricerca.value; ridisegna(); adatta(); });
  const filtro = scegli('Filtra stato nel diagramma', stati, opzioni.stato, v => { opzioni.stato = v; ridisegna(); adatta(); });
  const ambito = scegli('Ambito del diagramma', { sessione: 'Sessione corrente', workspace: 'Cartella corrente' }, opzioni.ambito, v => { opzioni.ambito = v; ridisegna(); adatta(); });
  barra.append(ambito, ricerca, filtro, bottone('Azzera filtri', () => { opzioni.query = ''; opzioni.stato = 'all'; opzioni.isolato = null; opzioni.collassati = []; ricerca.value = ''; filtro.value = 'all'; ridisegna(); adatta(); }));
  const comandi = el('div', 'talos-grafo__barra talos-grafo__comandi');
  const misura = el('output', 'talos-mono', '100%'); misura.dataset.zoom = '';
  const follow = bottone('Segui attivo', () => { segui = !segui; follow.setAttribute('aria-pressed', String(segui)); if (segui) centraAttivo(); }); follow.setAttribute('aria-pressed', 'false');
  comandi.append(bottone('Adatta', adatta), bottone('Lettura', lettura), bottone('−', () => scala(zoom / 1.2), 'Riduci zoom'), misura, bottone('+', () => scala(zoom * 1.2), 'Aumenta zoom'), follow,
    bottone('Isola selezionato', () => { if (opzioni.selezionato) { opzioni.isolato = opzioni.selezionato; ridisegna(); adatta(); } }), bottone('Aggiorna', () => { onAggiorna?.(); void caricaCronologia(); }));
  const affianca = bottone('Affianca file', () => mostraFile()); affianca.setAttribute('aria-pressed', 'false'); comandi.append(affianca);
  const avviso = el('p', 'talos-grafo__stato'); avviso.setAttribute('role', 'status');
  const riepilogo = el('div', 'talos-grafo__riepilogo'); riepilogo.setAttribute('aria-label', 'Riepilogo del lavoro');
  const recenti = el('details', 'talos-grafo__recenti'); recenti.append(el('summary', '', 'Attività recente')); const elencoRecenti = el('div', 'talos-grafo__eventi'); recenti.append(elencoRecenti);
  const canvas = el('div', 'talos-grafo__canvas'); canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Diagramma: trascina lo sfondo o usa le frecce per spostare');
  const mondo = el('div', 'talos-grafo__mondo'); canvas.append(mondo);
  const piede = el('p', 'talos-grafo__legenda', 'Linea continua: delega · tratteggiata: ramo. Seleziona un agente per aprire il dettaglio.');
  const area = el('div', 'talos-grafo__area');
  const anteprima = el('aside', 'talos-grafo__anteprima'); anteprima.hidden = true; anteprima.setAttribute('aria-label', 'File affiancato');
  const fileCima = el('div', 'talos-grafo__file-cima'), titoloFile = el('strong', '', 'File dell’agente');
  const chiudiFile = bottone('×', () => { letturaFile++; anteprima.hidden = true; affianca.setAttribute('aria-pressed', 'false'); adatta(); }, 'Chiudi affiancamento');
  fileCima.append(titoloFile, chiudiFile); const fileScelta = el('select', ''); fileScelta.setAttribute('aria-label', 'File da affiancare');
  const fileTesto = el('pre', ''); anteprima.append(fileCima, fileScelta, fileTesto);
  fileScelta.addEventListener('change', () => leggiFile(fileScelta._agente, fileScelta.value));
  area.append(canvas, anteprima);
  const mini = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); mini.classList.add('talos-grafo__mini'); mini.setAttribute('role', 'button'); mini.setAttribute('aria-label', 'Panoramica del diagramma'); mini.setAttribute('preserveAspectRatio', 'none');
  mini.tabIndex = 0; mini.setAttribute('aria-description', 'Clicca un punto per centrarlo. Frecce per spostare la vista; Invio o Spazio per centrare il diagramma.'); canvas.append(mini);
  mini.addEventListener('pointerdown', e => e.stopPropagation());
  mini.addEventListener('click', e => { const r = mini.getBoundingClientRect(); if (!disegno) return; x = canvas.clientWidth/2 - (e.clientX-r.left)/r.width*disegno.width*zoom; y = canvas.clientHeight/2 - (e.clientY-r.top)/r.height*disegno.height*zoom; trasforma(); });
  mini.addEventListener('keydown', e => {
    if (!disegno) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); x = canvas.clientWidth/2 - disegno.width*zoom/2; y = canvas.clientHeight/2 - disegno.height*zoom/2; trasforma(); }
    const delta = { ArrowLeft: [40,0], ArrowRight: [-40,0], ArrowUp: [0,40], ArrowDown: [0,-40] }[e.key];
    if (delta) { e.preventDefault(); x += delta[0]; y += delta[1]; trasforma(); }
  });
  const timeline = el('div', 'talos-grafo__timeline');
  const cursore = el('input', ''); cursore.type = 'range'; cursore.min = '0'; cursore.max = '0'; cursore.step = '1'; cursore.setAttribute('aria-label', 'Cronologia osservata del diagramma');
  const istanteReplay = el('span', 'talos-mono', 'ORA'), descrizioneReplay = el('span', 'talos-grafo__limite', 'Caricamento cronologia…');
  const tornaLive = bottone('Torna in diretta', () => mostraIstante(null)); tornaLive.hidden = true;
  cursore.addEventListener('input', () => mostraIstante(Number(cursore.value)));
  const eventoPrecedente = bottone('Evento −', () => mostraIstante(posizione == null ? storico.length-1 : Math.max(0,posizione-1)), 'Evento precedente');
  const eventoSuccessivo = bottone('Evento +', () => mostraIstante(posizione == null ? storico.length-1 : Math.min(storico.length-1,posizione+1)));
  const riproduci = bottone('Riproduci', () => {
    if (play) { fermaPlayer(); aggiornaTimeline(); return; }
    if (!storico.length) return;
    if (posizione == null || posizione >= storico.length-1) mostraIstante(0);
    play = true; ultimoFrame = null; aggiornaTimeline(); framePlayer = requestAnimationFrame(tickPlayer);
  });
  const speed = scegli('Velocità riproduzione', { 1:'1×', 2:'2×', 4:'4×', 16:'16×' }, '1', v => { velocita = Number(v); });
  const riprovaCronologia = bottone('Riprova cronologia', () => caricaCronologia()); riprovaCronologia.hidden = true;
  timeline.append(eventoPrecedente, riproduci, eventoSuccessivo, speed, istanteReplay, cursore, tornaLive, descrizioneReplay, riprovaCronologia);
  root.append(cima, barra, comandi, riepilogo, avviso, area, timeline, recenti, piede); host.append(root);
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
    const files = agente?.attivita?.file || []; fileScelta.replaceChildren(); fileScelta._agente = agente;
    for (const f of files) { const o = el('option', '', f.percorso); o.value = f.percorso; fileScelta.append(o); }
    fileScelta.hidden = !files.length; titoloFile.textContent = 'Contenuto attuale del file';
    if (files.length && typeof onLeggiFile === 'function') void leggiFile(agente, files[0].percorso);
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
    istanteReplay.textContent = posizione == null ? 'ORA' : new Date(clockReplay).toLocaleTimeString('it-IT');
    cursore.max = String(Math.max(0,storico.length-1)); cursore.disabled = !storico.length;
    cursore.value = String(posizione ?? Math.max(0,storico.length-1));
    eventoPrecedente.disabled = !storico.length || posizione === 0;
    eventoSuccessivo.disabled = posizione == null || posizione >= storico.length-1;
    riproduci.disabled = storico.length < 2; riproduci.textContent = play ? 'Pausa' : 'Riproduci';
    const nuovi = posizione == null ? 0 : storico.length-1-posizione;
    const base = coverage === 'loading' ? 'Caricamento cronologia…' : coverage === 'unavailable' ? 'Storico precedente non registrato'
      : coverage === 'partial' || storico.partial ? 'Cronologia parziale · intervalli mancanti' : 'Dall’avvio';
    descrizioneReplay.textContent = erroreCronologia ? `Cronologia non aggiornata: ${erroreCronologia}`
      : `${base}${persistita ? '' : ' · salvataggio non disponibile'}${storico.length ? ` · ${storico.length} eventi` : ''}${nuovi ? ` · ${nuovi} nuovi` : ''}`;
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
      for (const n of disegno?.nodi ?? []) { const ui = nodiDom.get(n.id)?._parti; if (ui) ui.durata.textContent = tempo(attivitaNodoGrafo(n.dati, clockReplay).durataMs); }
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
    mini.setAttribute('viewBox', `0 0 ${disegno.width} ${disegno.height}`); mini.replaceChildren();
    for (const n of disegno.nodi) { const r = d.createElementNS(mini.namespaceURI, 'rect'); r.dataset.miniNodo = n.id; r.dataset.stato = n.stato;
      for (const [k,v] of Object.entries({x:n.x-n.width/2,y:n.y-n.height/2,width:n.width,height:n.height,rx:10})) r.setAttribute(k,String(v)); mini.append(r); }
    const r = d.createElementNS(mini.namespaceURI,'rect'); r.classList.add('talos-grafo__mini-vista');
    for (const [k,v] of Object.entries({x:-x/zoom,y:-y/zoom,width:canvas.clientWidth/zoom,height:canvas.clientHeight/zoom})) r.setAttribute(k,String(v)); mini.append(r);
  }
  function salva() { try { storage?.setItem(key, JSON.stringify(opzioni)); } catch { /* nessun errore di navigazione per quota/storage */ } }
  function trasforma() { mondo.style.transform = `translate(${x}px,${y}px) scale(${zoom})`; misura.textContent = `${Math.round(zoom * 100)}%`; aggiornaMini(); }
  function scala(nuovo) { const precedente = zoom; zoom = Math.max(.15, Math.min(2, nuovo)); const cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2; x = cx - (cx - x) * zoom / precedente; y = cy - (cy - y) * zoom / precedente; trasforma(); }
  function adatta() { if (!disegno?.nodi.length || !canvas.clientWidth || !canvas.clientHeight) return; zoom = Math.max(.15, Math.min(1, (canvas.clientWidth - 32) / disegno.width, (canvas.clientHeight - 32) / disegno.height)); x = (canvas.clientWidth - disegno.width * zoom) / 2; y = 16; trasforma(); }
  function lettura() {
    if (!disegno?.nodi.length || !canvas.clientWidth || !canvas.clientHeight) return;
    zoom = Math.max(.8, Math.min(1, (canvas.clientWidth - 32) / disegno.width, (canvas.clientHeight - 32) / disegno.height));
    const id = opzioni.selezionato || corrente.corrente.sessionId;
    centra(disegno.nodi.some(n => n.id === id) ? id : disegno.nodi[0].id);
    if (id === corrente.corrente.sessionId) { y = 16; trasforma(); }
  }
  function centra(id) { const n = disegno?.nodi.find(n => n.id === id); if (!n) return; x = canvas.clientWidth / 2 - n.x * zoom; y = canvas.clientHeight / 2 - n.y * zoom; trasforma(); }
  function centraAttivo() { const n = disegno?.nodi.find(n => n.stato === 'active' && n.id !== corrente.corrente.sessionId); if (n) centra(n.id); }
  function seleziona(id, centraNodo = true) { opzioni.selezionato = id; for (const n of mondo.querySelectorAll('[data-nodo-id]')) n.dataset.selezionato = String(n.dataset.nodoId === id); salva(); if (centraNodo) centra(id); }
  const nodiDom = new Map(), archiDom = new Map();
  const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('aria-hidden', 'true'); mondo.append(svg);
  const vuoto = el('p', 'talos-grafo__vuoto', 'Nessun agente per questi filtri.'); mondo.append(vuoto);
  function ridisegna() {
    if (morto) return;
    disegno = layoutGrafoAgenti(modelloGrafoAgenti(corrente, opzioni));
    const intero = modelloGrafoAgenti(corrente, { ambito: opzioni.ambito });
    const t = telemetriaGrafoAgenti(intero);
    root.dataset.obsoleto = String(Boolean(corrente.errore));
    const statistica = (chiave, numero, testo, filtra) => {
      const n = filtra ? bottone('', () => { opzioni.stato = filtra; filtro.value = filtra; ridisegna(); adatta(); }) : el('div', '');
      n.classList.add('talos-grafo__statistica'); n.dataset.statistica = chiave; if (filtra) n.dataset.stato = filtra;
      n.append(el('strong', 'talos-mono', numero == null ? '—' : compatto(numero)), el('span', '', testo)); return n;
    };
    riepilogo.replaceChildren(statistica('active', t.active, 'In corso', 'active'), statistica('waiting', t.waiting, 'Da approvare', 'waiting'),
      statistica('done', t.done, 'Conclusi', 'done'), statistica('error', t.error, 'Errori', 'error'),
      statistica('chiamate', t.chiamate, 'Chiamate strumenti'), statistica('file', t.file, 'File coinvolti'), statistica('token', t.token, 'Token registrati'));
    const copertura = el('small', 'talos-grafo__copertura', `Intero ambito · ${t.totale} sessioni · strumenti ${t.copertura}/${t.totale} · file ${t.coperturaFile}/${t.totale} · consumo ${t.coperturaToken}/${t.totale}${t.parziale ? ' · conteggi parziali' : ''}${t.scritti != null ? ` · ${t.scritti} file scritti` : ''}${t.interrupted ? ` · ${t.interrupted} interrotti` : ''}${t.unknown ? ` · ${t.unknown} stato non disponibile` : ''}`);
    riepilogo.append(copertura);
    svg.setAttribute('width', String(disegno.width)); svg.setAttribute('height', String(disegno.height));
    const archiVivi = new Set();
    for (const a of disegno.archi) {
      const key = JSON.stringify([a.da, a.a, a.tipo]); archiVivi.add(key);
      let p = archiDom.get(key); if (!p) { p = d.createElementNS(svg.namespaceURI, 'polyline'); archiDom.set(key, p); svg.append(p); }
      p.dataset.arco = a.tipo; p.setAttribute('points', a.punti.map(p => `${p.x},${p.y}`).join(' '));
      const dest = disegno.nodi.find(n => n.id === a.a);
      p.dataset.attivo = String(posizione == null && !corrente.errore && Boolean(dest && attivitaNodoGrafo(dest.dati).operazione));
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
        const meta = el('span', 'talos-grafo__meta'), operazione = el('span', 'talos-grafo__operazione'), misure = el('span', 'talos-grafo__misure talos-mono'), durata = el('span', 'talos-grafo__durata');
        const collassa = bottone('', () => { opzioni.collassati = opzioni.collassati.includes(n.id) ? opzioni.collassati.filter(id => id !== n.id) : [...opzioni.collassati, n.id]; ridisegna(); });
        const testata = el('div', 'talos-grafo__testata-nodo'), pallino = el('span', 'talos-grafo__pallino'); pallino.setAttribute('aria-hidden', 'true');
        const rigaStato = el('div', 'talos-grafo__riga-stato'), badge = el('span', 'talos-grafo__badge-stato');
        const fondo = el('div', 'talos-grafo__fondo-nodo'); testata.append(apri, pallino); rigaStato.append(badge, durata); fondo.append(operazione, collassa);
        nodo.append(testata, meta, rigaStato, misure, fondo); nodo._parti = { apri, meta, operazione, misure, durata, collassa, badge };
        nodiDom.set(n.id, nodo); mondo.append(nodo);
      }
      const a = attivitaNodoGrafo(n.dati, posizione == null ? Date.now() : clockReplay), ui = nodo._parti;
      nodo.dataset.selezionato = String(n.id === opzioni.selezionato); nodo.dataset.stato = n.stato;
      nodo.dataset.operativo = String(posizione == null && Boolean(a.operazione) && !corrente.errore);
      Object.assign(nodo.style, { left: `${n.x - n.width / 2}px`, top: `${n.y - n.height / 2}px`, width: `${n.width}px`, height: `${n.height}px` });
      ui.apri.textContent = n.nome; ui.apri.removeAttribute('title'); ui.apri.removeAttribute('data-tip'); ui.apri.setAttribute('aria-label', `Apri dettaglio ${n.nome}`);
      ui.meta.textContent = n.dati.modello || (n.id === corrente.corrente.sessionId ? 'Sessione principale' : 'Sotto-agente'); ui.meta.title = ui.meta.textContent; ui.badge.textContent = etichetta[n.stato];
      ui.operazione.textContent = a.operazione || (n.stato === 'active' ? 'Tra due operazioni' : etichetta[n.stato]); ui.operazione.title = ui.operazione.textContent;
      ui.misure.textContent = a.chiamate == null ? 'Attività non disponibile' : `${a.chiamate} chiamate · ${a.file?.length ?? '—'} file${a.parziale ? '+' : ''}${a.token != null ? ` · ${compatto(a.token)} token` : ''}`;
      ui.durata.textContent = tempo(a.durataMs); ui.durata.title = a.ultimo ? `Ultima attività registrata: ${new Date(a.ultimo.quando).toLocaleString('it-IT')}` : 'Ultima attività non disponibile';
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
    aggiornaTimeline(); aggiornaMini();
    salva(); if (primo && canvas.clientWidth && canvas.clientHeight) { primo = false; lettura(); } else if (segui) centraAttivo();
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
  canvas.addEventListener('pointermove', e => { if (!trascina || e.pointerId !== trascina.id) return; x = trascina.ox + e.clientX - trascina.x; y = trascina.oy + e.clientY - trascina.y; trasforma(); });
  const fine = () => { trascina = null; }; canvas.addEventListener('pointerup', fine); canvas.addEventListener('pointercancel', fine); canvas.addEventListener('lostpointercapture', fine);
  canvas.addEventListener('keydown', e => { if (e.target !== canvas) return; const m = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key]; if (m) { e.preventDefault(); x += m[0]; y += m[1]; trasforma(); } });
  let dimensioniCanvas = { width: canvas.clientWidth, height: canvas.clientHeight };
  const osservatore = new ResizeObserver(() => {
    if (morto || !canvas.clientWidth || !canvas.clientHeight) return;
    const prima = dimensioniCanvas;
    dimensioniCanvas = { width: canvas.clientWidth, height: canvas.clientHeight };
    if (primo) { ridisegna(); return; }
    if (!prima.width || !prima.height) { lettura(); return; }
    if (opzioni.selezionato) centra(opzioni.selezionato);
    else { x += (dimensioniCanvas.width - prima.width) / 2; y += (dimensioniCanvas.height - prima.height) / 2; trasforma(); }
  }); osservatore.observe(canvas);
  if (typeof onLeggiCronologia !== 'function') coverage = 'unavailable';
  ridisegna(); void caricaCronologia();
  return { elemento: root, seleziona, aggiorna(nuovi) {
      vivo = nuovi;
      if (posizione == null) corrente = nuovi;
      ridisegna(); void caricaCronologia();
    }, distruggi() { morto = true; fermaPlayer(); d.removeEventListener('visibilitychange', visibility); osservatore.disconnect(); root.remove(); } };
}
