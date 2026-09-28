/*
 * R4 — ATTIVITÀ COMPATTA · PROTOTIPO CLICCABILE. SOLO LABORATORIO (`?componente=AttivitaCompatta`).
 *
 * Proposta del 23/09/2026 (documento: `harness-ui/docs/R4-ATTIVITA-COMPATTA-RICERCA-E-PROPOSTA-2026-09-23.md`).
 * ⛔ NON è il prodotto e non lo tocca: il prodotto resta `legacy/app.js`. Qui si prova una FORMA, dagli
 *   stessi eventi che il prodotto riceve (`lab/fixtures/attivita-compatta.js`), per decidere prima di scrivere.
 *
 * Cosa cambia rispetto al segmento di oggi (la BASE, confermata dall'owner):
 *   1. conteggi VERITIERI per specie — un elenco di cartella non è una ricerca, una modifica non è «altra azione»;
 *   2. DUE livelli invece di tre: segmento → voce → dettaglio (oggi: segmento → gruppo → riga → dettaglio);
 *   3. la riga dice anche SU COSA (bersagli) e, dal vivo, COSA sta facendo adesso — a altezza fissa;
 *   4. un errore si legge a segmento CHIUSO (voce fissata sotto la riga), senza aprire tutto;
 *   5. la ricerca nella pagina trova il testo dentro i segmenti chiusi (`hidden="until-found"`) e li apre;
 *   6. filtri per specie nei segmenti lunghi, frecce da tastiera, menu «⋯» + tasto destro, copia come testo.
 * Ogni scelta ha la sua fonte nel documento; qui i commenti dicono solo il PERCHÉ locale.
 */
import { creaAzioniMessaggio, creaTurno, creaMessaggioUtente, creaMessaggioTalos, creaBloccoCodice } from '../src/components/conversazione.js';
import { renderizzaMarkdown } from '../src/components/markdown.js';
import { nomeUmanoAttrezzo, nomeDiRipiegoAttrezzo } from '../src/components/nomi-attrezzi.js';
import { argomentoDelRagionamento, argomentoPuoCambiare, etichettaRagionamento, formattaDurataRagionamento } from '../src/components/ragionamento.js';
import { leggiEsitoComando } from '../src/components/esito-comando.js';
import { accorciaPercorso } from '../src/components/schede.js';
import { SCENE_ATTIVITA, ORDINE_SCENE_ATTIVITA } from './fixtures/attivita-compatta.js';
import { STILE_ATTIVITA_COMPATTA } from './attivita-compatta-stile.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* =====================================================================================================
 * 1. LA TASSONOMIA — un nome per ogni gesto, e le sue parole. Proposta: nel prodotto vivrebbe accanto a
 *    `NOMI_UMANI_ATTREZZI` (`components/nomi-attrezzi.js`), «un posto solo» come vuole la regola del 04/09.
 *    ⛔ `elenca` NON è `cerca` (difetto visto nella foto del 23/09): Codex fa lo stesso distinguo sugli
 *      argomenti (`rg --files` è un elenco, `parse_command.rs:2375-2389`); Hermes desktop no («Explored N files»).
 * ===================================================================================================== */
const SPECIE = Object.freeze({
  lettura: { icona: 'i-eye', uno: 'file letto', molti: 'file letti', breve: ['letto', 'letti'], fallitoUno: 'lettura non riuscita', fallitoMolti: 'letture non riuscite', filtro: 'Letture' },
  ricerca: { icona: 'i-search', uno: 'ricerca', molti: 'ricerche', breve: ['ricerca', 'ricerche'], fallitoUno: 'ricerca non riuscita', fallitoMolti: 'ricerche non riuscite', filtro: 'Ricerche' },
  elenco: { icona: 'i-folder', uno: 'cartella elencata', molti: 'cartelle elencate', breve: ['elenco', 'elenchi'], fallitoUno: 'elenco non riuscito', fallitoMolti: 'elenchi non riusciti', filtro: 'Elenchi' },
  modifica: { icona: 'i-edit', uno: 'file modificato', molti: 'file modificati', breve: ['modifica', 'modifiche'], fallitoUno: 'modifica non riuscita', fallitoMolti: 'modifiche non riuscite', filtro: 'Modifiche' },
  creazione: { icona: 'i-code', uno: 'file creato', molti: 'file creati', breve: ['nuovo', 'nuovi'], fallitoUno: 'creazione non riuscita', fallitoMolti: 'creazioni non riuscite', filtro: 'Nuovi file' },
  scrittura: { icona: 'i-code', uno: 'file scritto', molti: 'file scritti', fallitoUno: 'scrittura non riuscita', fallitoMolti: 'scritture non riuscite', filtro: 'Scritture' },
  comando: { icona: 'i-terminal', uno: 'comando', molti: 'comandi', fallitoUno: 'comando non riuscito', fallitoMolti: 'comandi non riusciti', filtro: 'Comandi' },
  test: { icona: 'i-check-sq', uno: 'giro di test', molti: 'giri di test', fallitoUno: 'giro di test non riuscito', fallitoMolti: 'giri di test non riusciti', filtro: 'Test' },
  'ricerca-web': { icona: 'i-globe', uno: 'ricerca sul web', molti: 'ricerche sul web', fallitoUno: 'ricerca sul web non riuscita', fallitoMolti: 'ricerche sul web non riuscite', filtro: 'Web' },
  pagina: { icona: 'i-web', uno: 'pagina aperta', molti: 'pagine aperte', fallitoUno: 'pagina non aperta', fallitoMolti: 'pagine non aperte', filtro: 'Pagine' },
  delega: { icona: 'i-user', uno: 'delega', molti: 'deleghe', fallitoUno: 'delega non riuscita', fallitoMolti: 'deleghe non riuscite', filtro: 'Deleghe' },
});
const ORDINE_SPECIE = Object.keys(SPECIE);

/** Il verbo della riga, al passato (fatto) e al presente (in corso). */
const VERBI = Object.freeze({
  leggi: ['Letto', 'Legge'], cerca: ['Cercato', 'Cerca'], elenca: ['Elencato', 'Elenca'],
  file_edit: ['Modificato', 'Modifica'], scrivi: ['Scritto', 'Scrive'], shell: ['Eseguito', 'Esegue'],
  prova: ['Test eseguiti', 'Esegue i test'], web_search: ['Cercato sul web', 'Cerca sul web'], naviga: ['Aperto', 'Apre'],
  delega_sottotask: ['Delegato', 'Delega'],
});

function specieDi(nome, operazione) {
  switch (nome) {
    case 'leggi': return 'lettura';
    case 'cerca': return 'ricerca';
    case 'elenca': return 'elenco';
    case 'file_edit': return 'modifica';
    case 'scrivi': return operazione === 'add' ? 'creazione' : operazione === 'replace' ? 'modifica' : 'scrittura';
    case 'shell': return 'comando';
    case 'prova': return 'test';
    case 'web_search': return 'ricerca-web';
    case 'naviga': return 'pagina';
    case 'delega_sottotask': return 'delega';
    default: return `altro:${nome}`;
  }
}

function nomeLeggibile(nome) {
  return nomeUmanoAttrezzo(nome) || nomeDiRipiegoAttrezzo(nome) || 'attrezzo';
}

/** «2 cartelle elencate» — e per un attrezzo senza parole nostre, il suo nome umano: mai «altra azione». */
function frase(specie, n, { fallito = false, breve = false } = {}) {
  const s = SPECIE[specie];
  if (s && breve && !fallito && s.breve) return `${n} ${n === 1 ? s.breve[0] : s.breve[1]}`;
  if (s) return `${n} ${fallito ? (n === 1 ? s.fallitoUno : s.fallitoMolti) : (n === 1 ? s.uno : s.molti)}`;
  const nome = nomeLeggibile(specie.slice('altro:'.length));
  return fallito ? `${nome} non riuscita${n > 1 ? ` ×${n}` : ''}` : `${nome}${n > 1 ? ` ×${n}` : ''}`;
}

/* Lo stesso contratto del prodotto (`esitoAttrezzoFallito`, `legacy/app.js:12180`): una regola sola. */
function esitoFallito(nome, testo) {
  const t = String(testo ?? '');
  if (nome === 'prova') return /ℹ?\s*fail\s+([1-9]\d*)/i.test(t);
  if (nome === 'shell') {
    const esito = leggiEsitoComando(t);
    return esito.verdetto ? !esito.riuscito : false;
  }
  return /^(?:REFUSED\.|ERROR\b|ERRORE\b|FAILED\b|FALLITO\b|NON RIUSCITO\b)/i.test(t.trim());
}

function argomentiDi(grezzi) {
  try { return JSON.parse(grezzi || '{}') || {}; } catch { return {}; }
}

/** Il bersaglio corto (per la riga del segmento) e lungo (per la riga della voce). */
function bersaglio(voce, { corto = false } = {}) {
  const a = voce.argomenti;
  const nomeFile = (p) => String(p || '').split(/[\\/]/).filter(Boolean).at(-1) || '';
  switch (voce.nome) {
    case 'leggi': case 'file_edit': case 'scrivi': return corto ? nomeFile(a.percorso) : accorciaPercorso(a.percorso || '', 64);
    case 'elenca': return corto ? `${nomeFile(a.percorso) || 'radice'}/` : (a.percorso ? accorciaPercorso(`${a.percorso}/`, 64) : 'la radice del progetto');
    case 'cerca': { const q = [a.nome, a.testo].filter(Boolean).join(' · '); return q ? `«${q}»` : ''; }
    case 'shell': return corto ? (a.descrizione || a.comando || '') : (a.comando || a.descrizione || '');
    case 'web_search': return a.query ? `«${a.query}»` : '';
    case 'naviga': return a.url || '';
    default: return '';
  }
}

/** Il titolo di un ragionamento FINITO: il primo titolo in grassetto su riga intera, o la prima frase. */
function titoloRagionamento(testo) {
  const grezzo = String(testo ?? '');
  const titolo = /^[ \t]*\*\*([^*\n]{3,80})\*\*[ \t]*$/m.exec(grezzo);
  if (titolo) return titolo[1].trim();
  const pulito = grezzo.replace(/[*`_#>]/g, '').replace(/\s+/g, ' ').trim();
  const frase1 = /^(.{8,}?[.!?])(?=\s|$)/.exec(pulito)?.[1] || pulito;
  return frase1.length > 110 ? `${frase1.slice(0, 109).trimEnd()}…` : frase1;
}

/* =====================================================================================================
 * 2. LA PROIEZIONE — dagli eventi ai blocchi: segmento | testo. Pura e incrementale (serve dal vivo).
 *    Confini del segmento (regola 1 del ticket, invariata): il testo del modello, la fine del giro, un
 *    permesso (`ApprovalRequested`) o un comando della persona. Ordine degli eventi mai toccato.
 * ===================================================================================================== */
export function creaProiezione({ ragionamentiMs = {}, orologio = () => performance.now() } = {}) {
  const blocchi = [];
  const perAttrezzo = new Map();
  const perRagionamento = new Map();
  const perTesto = new Map();
  let segmento = null;
  let concluso = false;
  let consegna = '';
  let prossimo = 0;
  const scrittureSenzaDiff = [];

  function segmentoAperto() {
    if (!segmento) {
      segmento = { tipo: 'segmento', id: `seg-${++prossimo}`, voci: [], inizio: orologio(), fine: null, misurato: true };
      blocchi.push(segmento);
    }
    return segmento;
  }
  function chiudiSegmento() {
    if (segmento) segmento.fine = orologio();
    segmento = null;
  }

  function applica(e) {
    switch (e.type) {
      case 'RunStarted': consegna = e.input?.consegna || ''; break;
      case 'ToolCallStart': {
        const s = segmentoAperto();
        const voce = { tipo: 'attrezzo', id: e.toolCallId, nome: e.toolCallName, argomentiGrezzi: '', argomenti: {}, esito: null, stato: 'in-corso', specie: specieDi(e.toolCallName), diff: null, inizio: orologio(), fine: null };
        s.voci.push(voce);
        perAttrezzo.set(e.toolCallId, voce);
        break;
      }
      case 'ToolCallArgs': {
        const v = perAttrezzo.get(e.toolCallId);
        if (v) { v.argomentiGrezzi += e.delta || ''; v.argomenti = argomentiDi(v.argomentiGrezzi); }
        break;
      }
      case 'ToolCallResult': {
        const v = perAttrezzo.get(e.toolCallId);
        if (!v) break;
        v.esito = String(e.content ?? '');
        v.stato = esitoFallito(v.nome, v.esito) ? 'fallito' : 'riuscito';
        v.fine = orologio();
        if ((v.nome === 'file_edit' || v.nome === 'scrivi') && v.stato === 'riuscito') scrittureSenzaDiff.push(v);
        break;
      }
      case 'StateDelta': {
        for (const op of e.delta || []) {
          if (!String(op.path || '').startsWith('/file/')) continue;
          const v = scrittureSenzaDiff.shift();
          if (!v) continue;
          if (v.nome === 'scrivi') v.specie = specieDi('scrivi', op.op);
          if ('prima' in op) {
            const prima = String(op.prima ?? '').split('\n').filter((r) => r !== '');
            const dopo = String(op.value ?? '').split('\n').filter((r) => r !== '');
            const resto = [...prima];
            let piu = 0;
            for (const r of dopo) { const i = resto.indexOf(r); if (i >= 0) resto.splice(i, 1); else piu += 1; }
            v.diff = { piu, meno: resto.length };
          }
        }
        break;
      }
      case 'ReasoningMessageStart': {
        /* Come nel prodotto: un ragionamento senza testo non ha riga, e non spezza niente. */
        perRagionamento.set(e.messageId, { tipo: 'ragionamento', id: e.messageId, testo: '', stato: 'in-corso', inizio: orologio(), fine: null, durataMs: null, visibile: false });
        break;
      }
      case 'ReasoningMessageContent': {
        const v = perRagionamento.get(e.messageId);
        if (!v) break;
        v.testo += e.delta || '';
        if (!v.visibile && v.testo.trim()) { v.visibile = true; segmentoAperto().voci.push(v); }
        break;
      }
      case 'ReasoningMessageEnd': {
        const v = perRagionamento.get(e.messageId);
        if (!v) break;
        v.stato = 'concluso';
        v.fine = orologio();
        v.durataMs = Number.isFinite(ragionamentiMs[v.id]) ? ragionamentiMs[v.id] : v.fine - v.inizio;
        break;
      }
      case 'TextMessageContent': {
        chiudiSegmento();
        for (const r of perRagionamento.values()) if (r.stato === 'in-corso' && r.visibile) applica({ type: 'ReasoningMessageEnd', messageId: r.id });
        let t = perTesto.get(e.messageId);
        if (!t) { t = { tipo: 'testo', id: e.messageId, testo: '' }; perTesto.set(e.messageId, t); blocchi.push(t); }
        t.testo += e.delta || '';
        break;
      }
      case 'ApprovalRequested': case 'ComandoUtenteIniziato': chiudiSegmento(); break;
      case 'RunFinished': chiudiSegmento(); concluso = true; break;
      default: break;
    }
  }
  return {
    applica,
    get blocchi() { return blocchi; },
    get concluso() { return concluso; },
    get consegna() { return consegna; },
  };
}

/** La rigiocata: le durate vengono solo da `/metrics` (`ragionamentiMs`); quelle misurate in pochi ms non valgono. */
export function proiettaStoria(eventi, { ragionamentiMs = {} } = {}) {
  let t = 0;
  const p = creaProiezione({ ragionamentiMs, orologio: () => (t += 0.01) });
  for (const e of eventi) p.applica(e);
  for (const b of p.blocchi) {
    if (b.tipo !== 'segmento') continue;
    b.misurato = false;
    for (const v of b.voci) {
      if (v.tipo === 'ragionamento') v.durataMs = Number.isFinite(ragionamentiMs[v.id]) ? ragionamentiMs[v.id] : null;
      else { v.inizio = null; v.fine = null; }
    }
  }
  return p;
}

/* =====================================================================================================
 * 3. IL RIASSUNTO — la riga del segmento, calcolata per intero a ogni aggiornamento (dati veri, mai delta).
 * ===================================================================================================== */
export function riassuntoSegmento(seg) {
  const riusciti = new Map();
  const falliti = new Map();
  let ragionamenti = 0;
  let durataRagionamenti = 0;
  let durateNote = true;
  let piu = 0; let meno = 0; let conDiff = false;
  const bersagli = [];
  let inCorso = null;
  for (const v of seg.voci) {
    if (v.tipo === 'ragionamento') {
      if (v.stato === 'in-corso') { inCorso = v; continue; }
      ragionamenti += 1;
      if (Number.isFinite(v.durataMs)) durataRagionamenti += v.durataMs; else durateNote = false;
      continue;
    }
    if (v.stato === 'in-corso') { inCorso = v; continue; }
    const mappa = v.stato === 'fallito' ? falliti : riusciti;
    mappa.set(v.specie, (mappa.get(v.specie) || 0) + 1);
    if (v.diff) { conDiff = true; piu += v.diff.piu; meno += v.diff.meno; }
    const b = bersaglio(v, { corto: true });
    if (b && !bersagli.includes(b)) bersagli.push(b);
  }
  const ordinate = (m) => [...m.keys()].sort((a, b) => {
    const ia = ORDINE_SPECIE.indexOf(a); const ib = ORDINE_SPECIE.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const parti = ordinate(riusciti).map((s) => frase(s, riusciti.get(s)));
  /* La forma breve, per quando la riga non ci sta: stesse specie, parole corte, niente durate. Mai troncare un
     conteggio a metà («3 ragio…», visto nella foto a 1024 px) se c'è una forma vera che entra. */
  const partiBrevi = ordinate(riusciti).map((s) => frase(s, riusciti.get(s), { breve: true }));
  if (ragionamenti) partiBrevi.push(`${ragionamenti} ${ragionamenti === 1 ? 'ragionamento' : 'ragionamenti'}`);
  if (ragionamenti) {
    const d = durateNote && ragionamenti ? ` (${formattaDurataRagionamento(durataRagionamenti / 1000)})` : '';
    parti.push(`${ragionamenti} ${ragionamenti === 1 ? 'ragionamento' : 'ragionamenti'}${d}`);
  }
  const erroriParti = ordinate(falliti).map((s) => frase(s, falliti.get(s), { fallito: true }));
  const nFalliti = [...falliti.values()].reduce((a, b) => a + b, 0);
  return { parti, partiBrevi, erroriParti, nFalliti, bersagli, diff: conDiff ? { piu, meno } : null, inCorso };
}

function fraseAdesso(v) {
  if (!v) return '';
  if (v.tipo === 'ragionamento') {
    const arg = argomentoDelRagionamento(v.testo, { massimo: 70 });
    return arg ? `Sta ragionando: ${arg}` : 'Sta ragionando…';
  }
  const verbo = VERBI[v.nome]?.[1] || nomeLeggibile(v.nome);
  const b = bersaglio(v, { corto: true });
  return `${verbo}${b ? ` ${b}` : ''}…`;
}

function testoDelSegmento(seg) {
  const righe = [];
  for (const v of seg.voci) {
    if (v.tipo === 'ragionamento') {
      righe.push(`- ${etichettaRagionamento({ inCorso: v.stato === 'in-corso', secondi: Number.isFinite(v.durataMs) ? v.durataMs / 1000 : null })}: ${titoloRagionamento(v.testo)}`);
      righe.push(...v.testo.split('\n').map((r) => `  > ${r}`));
      continue;
    }
    const verbo = VERBI[v.nome]?.[v.stato === 'in-corso' ? 1 : 0] || nomeLeggibile(v.nome);
    const esito = v.stato === 'fallito' ? ' (non riuscito)' : v.stato === 'in-corso' ? ' (in corso)' : '';
    righe.push(`- ${verbo} ${bersaglio(v)}${esito}`.trimEnd());
  }
  return righe.join('\n');
}

/* =====================================================================================================
 * 4. LA VISTA — costruita una volta per blocco e aggiornata SUL POSTO: niente nodi rifatti, quindi
 *    aperture, filtri e fuoco sopravvivono allo streaming (Hermes lo dice di sé: «honors explicit
 *    disclosure across live updates», `tool-group.test.tsx:418`).
 * ===================================================================================================== */
function el(tag, classe, testo) {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
}
function icona(nome, classe = 'i') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${nome}`);
  svg.append(use);
  return svg;
}
let contatoreId = 0;
const nuovoId = (base) => `${base}-${(++contatoreId).toString(36)}`;

function nascondiTrovabile(nodo, nascosto) {
  if (nascosto) nodo.setAttribute('hidden', 'until-found'); else nodo.removeAttribute('hidden');
}

function annuncia(testo) {
  const regione = document.getElementById('r4aAnnunci');
  if (!regione) return;
  regione.textContent = '';
  requestAnimationFrame(() => { regione.textContent = testo; });
}

const SOGLIA_FILTRI = 6;
const PERMANENZA_MINIMA_AZIONE_MS = 700;

class VistaSegmento {
  constructor(seg, { variante = 'scheda' } = {}) {
    this.seg = seg;
    this.voci = new Map();
    this.filtro = 'tutte';
    this.adessoMostrato = '';
    this.adessoAlle = 0;
    this.annunciati = new Set();
    this.eraVivo = false;
    const radice = el('section', 'talos-segmento');
    radice.dataset.variante = variante;
    radice.dataset.c = 'ActivitySegment';
    this.radice = radice;

    const testa = el('div', 'talos-segmento__testa');
    const bottone = el('button', 'talos-segmento__riassunto');
    bottone.type = 'button';
    this.idCorpo = nuovoId('segmento-corpo');
    bottone.setAttribute('aria-expanded', 'false');
    bottone.setAttribute('aria-controls', this.idCorpo);
    const chev = icona('i-chev', 'i talos-segmento__chev');
    this.statoEl = el('span', 'talos-segmento__stato');
    this.conteggiEl = el('span', 'talos-segmento__conteggi');
    this.bersagliEl = el('span', 'talos-segmento__bersagli');
    this.misureEl = el('span', 'talos-segmento__misure');
    this.descrizioneEl = el('span', 'sr-only');
    this.descrizioneEl.id = nuovoId('segmento-descrizione');
    bottone.setAttribute('aria-describedby', this.descrizioneEl.id);
    bottone.append(chev, this.statoEl, this.conteggiEl, this.bersagliEl, this.misureEl);
    const altro = el('button', 'talos-segmento__altro');
    altro.type = 'button';
    altro.setAttribute('aria-label', 'Azioni sull’attività');
    altro.setAttribute('aria-haspopup', 'menu');
    altro.setAttribute('aria-expanded', 'false');
    altro.append(icona('i-more'));
    testa.append(bottone, altro, this.descrizioneEl);
    this.bottone = bottone;
    this.altro = altro;

    this.fissate = el('div', 'talos-segmento__fissate');
    this.fissate.hidden = true;

    const corpo = el('div', 'talos-segmento__corpo');
    corpo.id = this.idCorpo;
    nascondiTrovabile(corpo, true);
    const interno = el('div', 'talos-segmento__interno');
    this.filtriEl = el('div', 'talos-segmento__filtri');
    this.filtriEl.setAttribute('role', 'group');
    this.filtriEl.setAttribute('aria-label', 'Mostra solo');
    this.filtriEl.hidden = true;
    this.notaEl = el('p', 'talos-segmento__nota');
    this.notaEl.hidden = true;
    this.lista = el('ol', 'talos-segmento__voci');
    this.lista.setAttribute('aria-label', 'Voci dell’attività, in ordine');
    interno.append(this.filtriEl, this.notaEl, this.lista);
    corpo.append(interno);
    this.corpo = corpo;
    radice.append(testa, this.fissate, corpo);

    bottone.addEventListener('click', () => this.imposta(!this.aperto()));
    bottone.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && this.aperto()) { e.preventDefault(); this.righeVisibili()[0]?.focus(); }
    });
    corpo.addEventListener('beforematch', () => this.imposta(true, { daRicerca: true }));
    altro.addEventListener('click', () => apriMenu(this, altro));
    testa.addEventListener('contextmenu', (e) => { e.preventDefault(); apriMenu(this, altro, { x: e.clientX, y: e.clientY }); });
    this.lista.addEventListener('keydown', (e) => this.tastiera(e));
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => this.adatta()).observe(radice);
    this.aggiorna();
  }

  aperto() { return this.bottone.getAttribute('aria-expanded') === 'true'; }

  scriviConteggi(breve) {
    const r = this.ultimoRiassunto;
    if (!r) return;
    const parti = breve ? r.partiBrevi : r.parti;
    this.conteggiEl.replaceChildren();
    if (this.adessoMostrato) this.conteggiEl.append(el('span', 'talos-segmento__adesso', this.adessoMostrato), parti.length ? ' · ' : '');
    this.conteggiEl.append(parti.join(' · ') || (this.vivo ? '' : 'Attività'));
    this.conteggiEl.dataset.forma = breve ? 'breve' : 'intera';
    this.conteggiEl.title = breve ? r.parti.join(' · ') : '';
  }

  /* Misura, non indovina: se la forma intera non entra si passa a quella breve; un bersaglio ridotto a una
     lettera («r…», foto a 1440 px) non dice niente, e sotto 64 px si toglie. */
  adatta() {
    if (!this.radice.isConnected || this.radice.classList.contains('talos-segmento--nudo')) return;
    this.scriviConteggi(false);
    if (this.conteggiEl.scrollWidth > this.conteggiEl.clientWidth + 1) this.scriviConteggi(true);
    this.bersagliEl.style.visibility = '';
    const b = this.bersagliEl;
    if (b.textContent && b.scrollWidth > b.clientWidth + 1 && b.clientWidth < 64) b.style.visibility = 'hidden';
  }

  imposta(aperto, { daRicerca = false } = {}) {
    this.bottone.setAttribute('aria-expanded', String(aperto));
    this.radice.dataset.aperto = aperto ? 'si' : 'no';
    if (!daRicerca) nascondiTrovabile(this.corpo, !aperto);
    this.aggiornaFissate();
  }

  righeVisibili() {
    return [...this.lista.querySelectorAll(':scope > .talos-voce:not([hidden]) > .talos-voce__riga')];
  }

  /* Frecce: un acceleratore, non un sostituto — ogni riga resta un bottone nel giro del Tab (le frecce di
     un lettore di schermo in modalità lettura restano sue: Roselli, «Disclosure Widgets», 2020). */
  tastiera(e) {
    const righe = this.righeVisibili();
    const i = righe.indexOf(document.activeElement);
    if (i < 0) return;
    const riga = righe[i];
    const vista = riga.__vista;
    if (e.key === 'ArrowDown') { e.preventDefault(); righe[Math.min(righe.length - 1, i + 1)].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i === 0) this.bottone.focus(); else righe[i - 1].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); righe[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); righe.at(-1).focus(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); vista?.imposta(true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (vista?.aperta()) vista.imposta(false); else this.bottone.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); this.bottone.focus(); }
  }

  aggiorna() {
    const seg = this.seg;
    for (const v of seg.voci) {
      let vista = this.voci.get(v.id);
      if (!vista) {
        vista = new VistaVoce(v, this);
        this.voci.set(v.id, vista);
        this.lista.append(vista.radice);
      } else vista.aggiorna();
    }
    const nudo = seg.voci.length === 1;
    this.radice.classList.toggle('talos-segmento--nudo', nudo);
    /* ⭐ Una voce sola non ha testa (decisione owner 10/09): la riga È il contenuto. */
    this.radice.querySelector('.talos-segmento__testa').hidden = nudo;
    if (nudo) { nascondiTrovabile(this.corpo, false); this.corpo.querySelector('.talos-segmento__interno').style.borderTop = '0'; }
    else {
      this.corpo.querySelector('.talos-segmento__interno').style.borderTop = '';
      if (!this.aperto()) nascondiTrovabile(this.corpo, true);
    }
    this.radice.dataset.nudo = nudo ? 'si' : 'no';

    const r = riassuntoSegmento(seg);
    /* ⛔ Vivo = il segmento è la CODA aperta del giro, non «c'è una voce in corso»: fra due chiamate non c'è
       niente in corso, e la riga lampeggiava vivo→concluso→vivo (visto nella prova V7). Hermes lo scrive nel
       suo test: «stays live in the gap between two sequential calls» (`tool-group.test.tsx:474-477`). */
    const vivo = Boolean(r.inCorso) || seg.fine === null;
    this.vivo = vivo;
    this.radice.dataset.stato = vivo ? 'vivo' : r.nFalliti ? 'errore' : 'concluso';
    this.radice.setAttribute('aria-busy', String(vivo));

    /* Il pallino vivo o il segno d'errore; niente a riposo. */
    this.statoEl.replaceChildren();
    if (vivo) { const p = el('span', 'talos-dot talos-dot--live'); p.setAttribute('aria-hidden', 'true'); this.statoEl.append(p); }

    /* L'«adesso» cambia al massimo dopo che si è potuto leggere (stessa regola dell'argomento del ragionamento,
       `ragionamento.js:permanenzaArgomentoMs`; Hermes: `TURN_QUIET_S = 2`, «or a run of quick calls would strobe»). */
    const ora = performance.now();
    const cur = r.inCorso;
    const puoCambiare = () => argomentoPuoCambiare({ attuale: this.adessoMostrato, mostratoAlle: this.adessoAlle, adesso: ora });
    const mostra = (testo, id) => { if (testo !== this.adessoMostrato) { this.adessoMostrato = testo; this.adessoAlle = ora; } this.adessoId = id; };
    if (!vivo) { this.adessoMostrato = ''; this.adessoId = null; }
    else if (cur) {
      const testo = fraseAdesso(cur);
      /* La STESSA voce che si precisa (arrivano gli argomenti) si aggiorna subito; una voce NUOVA aspetta che la
         vecchia si sia potuta leggere; il ragionamento che scorre segue la sua regola di sempre. */
      if (cur.id === this.adessoId && cur.tipo !== 'ragionamento') mostra(testo, cur.id);
      /* ⛔ Un'azione NUOVA prende il posto della vecchia dopo PERMANENZA_MINIMA_AZIONE_MS, non dopo i 2-4 s
         dell'argomento: con 2-4 s la riga diceva «Sta ragionando» mentre il modello stava già cercando (prova V7) —
         stabile e falsa. 700 ms bastano perché un attrezzo lampo non «strobi» (Hermes rivela dopo 200 ms,
         `status.tsx:189`) e restano sotto la soglia in cui la riga comincia a mentire. Da misurare nel giro vero.
         Un riempitivo («Prepara il passo successivo…», id nullo) non trattiene mai un'azione vera. */
      else if (this.adessoId == null || ora - this.adessoAlle >= PERMANENZA_MINIMA_AZIONE_MS) mostra(testo, cur.id);
    } else if (!this.adessoMostrato || (this.adessoId !== null && ora - this.adessoAlle >= 2000)) {
      /* Fra due passi il modello sta scrivendo il prossimo: si dice quello, non l'ultima azione finita. */
      mostra('Prepara il passo successivo…', null);
    }
    this.ultimoRiassunto = r;
    this.scriviConteggi(false);
    this.bersagliEl.textContent = r.bersagli.join(', ');
    /* ⛔ Niente aria-label: il nome accessibile resta il testo visibile (WCAG 2.5.3, «Label in Name» — chi comanda a
       voce dice ciò che vede). La forma INTERA, quando a schermo c'è quella breve, va nella descrizione. */
    this.descrizioneEl.textContent = [...r.parti, ...r.erroriParti].join(', ');

    this.misureEl.replaceChildren();
    if (r.diff) {
      const d = el('span', 'talos-segmento__diff');
      d.append(el('span', 'talos-segmento__piu', `+${r.diff.piu}`), ' ', el('span', 'talos-segmento__meno', `−${r.diff.meno}`));
      d.setAttribute('aria-label', `${r.diff.piu} righe aggiunte, ${r.diff.meno} tolte`);
      this.misureEl.append(d);
    }
    if (r.nFalliti) {
      const x = el('span', 'talos-segmento__errore');
      x.append(icona('i-x'), r.erroriParti.join(' · '));
      this.misureEl.append(x);
    }
    const tempo = el('span', 'talos-segmento__tempo');
    tempo.setAttribute('aria-hidden', 'true');
    if (seg.misurato) {
      const fine = vivo ? performance.now() : (seg.fine ?? performance.now());
      tempo.textContent = formattaDurataRagionamento((fine - seg.inizio) / 1000);
    }
    this.misureEl.append(tempo);

    this.aggiornaFiltri(r);
    this.aggiornaFissate();
    this.adatta();

    /* Si annunciano i PASSAGGI, non i secondi (MDN aria-live: gli aggiornamenti frequenti non si annunciano). */
    for (const v of seg.voci) {
      if (v.stato === 'fallito' && !this.annunciati.has(v.id)) { this.annunciati.add(v.id); annuncia(`Non riuscito: ${VERBI[v.nome]?.[0] || nomeLeggibile(v.nome)} ${bersaglio(v, { corto: true })}`); }
    }
    if (this.eraVivo && !vivo) annuncia(`Attività conclusa: ${[...r.parti, ...r.erroriParti].join(', ')}`);
    this.eraVivo = vivo;
    this.vivo = vivo;
  }

  /* Un errore si legge senza aprire: la sua voce resta fissata sotto la riga finché il segmento è chiuso. */
  aggiornaFissate() {
    const falliti = this.seg.voci.filter((v) => v.stato === 'fallito');
    const mostra = falliti.length > 0 && !this.aperto() && this.seg.voci.length > 1;
    this.fissate.hidden = !mostra;
    if (!mostra) { this.fissate.replaceChildren(); return; }
    this.fissate.replaceChildren(...falliti.map((v) => {
      const b = el('button', 'talos-voce__riga');
      b.type = 'button';
      b.dataset.fissata = 'si';
      const vista = this.voci.get(v.id);
      b.append(vista.iconaEl.cloneNode(true), el('span', 'talos-voce__verbo', vista.verboEl.textContent), el('span', 'talos-voce__oggetto', vista.oggettoEl.textContent), el('span', 'talos-voce__meta', vista.metaEl.textContent));
      const li = el('div', 'talos-voce');
      li.dataset.stato = 'fallito';
      li.dataset.tipo = 'attrezzo';
      b.addEventListener('click', () => { this.imposta(true); vista.imposta(true); vista.riga.focus(); });
      li.append(b);
      return li;
    }));
  }

  aggiornaFiltri(r) {
    const conteggi = new Map();
    for (const v of this.seg.voci) {
      const k = v.tipo === 'ragionamento' ? 'ragionamento' : v.specie;
      conteggi.set(k, (conteggi.get(k) || 0) + 1);
    }
    const mostra = this.seg.voci.length >= SOGLIA_FILTRI;
    this.filtriEl.hidden = !mostra;
    if (!mostra) return;
    const chiavi = ['tutte', ...(conteggi.has('ragionamento') ? ['ragionamento'] : []), ...ORDINE_SPECIE.filter((s) => conteggi.has(s)), ...[...conteggi.keys()].filter((k) => k.startsWith('altro:')), ...(r.nFalliti ? ['falliti'] : [])];
    const etichetta = (k) => k === 'tutte' ? 'Tutte' : k === 'ragionamento' ? 'Ragionamenti' : k === 'falliti' ? 'Non riuscite' : SPECIE[k]?.filtro || nomeLeggibile(k.slice(6));
    const quanti = (k) => k === 'tutte' ? this.seg.voci.length : k === 'falliti' ? r.nFalliti : conteggi.get(k);
    const firma = chiavi.map((k) => `${k}:${quanti(k)}`).join('|');
    if (this.filtriEl.dataset.firma !== firma) {
      this.filtriEl.dataset.firma = firma;
      this.filtriEl.replaceChildren(...chiavi.map((k) => {
        const b = el('button', 'talos-filtro', `${etichetta(k)} ${quanti(k)}`);
        b.type = 'button';
        b.dataset.filtro = k;
        b.setAttribute('aria-pressed', String(k === this.filtro));
        b.addEventListener('click', () => this.filtra(k));
        return b;
      }));
    }
    this.filtra(this.filtro, { silenzioso: true });
  }

  filtra(k, { silenzioso = false } = {}) {
    this.filtro = k;
    for (const b of this.filtriEl.querySelectorAll('.talos-filtro')) b.setAttribute('aria-pressed', String(b.dataset.filtro === k));
    let visibili = 0;
    for (const vista of this.voci.values()) {
      const v = vista.voce;
      const passa = k === 'tutte' || (k === 'falliti' ? v.stato === 'fallito' : k === 'ragionamento' ? v.tipo === 'ragionamento' : v.specie === k);
      vista.radice.hidden = !passa;
      if (passa) visibili += 1;
    }
    const filtrato = k !== 'tutte';
    this.notaEl.hidden = !filtrato;
    if (filtrato) this.notaEl.textContent = `Mostrate ${visibili} voci su ${this.seg.voci.length}.`;
    if (!silenzioso && filtrato) annuncia(this.notaEl.textContent);
  }

  apriTutte({ soloRagionamenti = false } = {}) {
    this.imposta(true);
    for (const vista of this.voci.values()) if (!soloRagionamenti || vista.voce.tipo === 'ragionamento') vista.imposta(true);
  }
  chiudiTutte() { for (const vista of this.voci.values()) vista.imposta(false); }
  async copia() {
    const testo = testoDelSegmento(this.seg);
    let fatto = true;
    try { await navigator.clipboard.writeText(testo); } catch { fatto = false; }
    this.notaEl.hidden = false;
    this.notaEl.textContent = fatto ? 'Attività copiata negli appunti.' : 'Copia non riuscita: il browser non ha concesso gli appunti.';
    annuncia(this.notaEl.textContent);
    setTimeout(() => this.filtra(this.filtro, { silenzioso: true }), 2500);
  }
}

class VistaVoce {
  constructor(voce, segmento) {
    this.voce = voce;
    this.segmento = segmento;
    const li = el('li', 'talos-voce');
    li.dataset.tipo = voce.tipo;
    const riga = el('button', 'talos-voce__riga');
    riga.type = 'button';
    riga.__vista = this;
    this.idDettaglio = nuovoId('voce-dettaglio');
    riga.setAttribute('aria-expanded', 'false');
    riga.setAttribute('aria-controls', this.idDettaglio);
    this.iconaEl = el('span', 'talos-voce__icona');
    this.verboEl = el('span', 'talos-voce__verbo');
    this.oggettoEl = el('span', 'talos-voce__oggetto');
    this.metaEl = el('span', 'talos-voce__meta');
    this.pallinoEl = el('span', 'talos-voce__pallino');
    riga.append(this.iconaEl, this.verboEl, this.oggettoEl, this.metaEl, this.pallinoEl);
    const dettaglio = el('div', 'talos-voce__dettaglio');
    dettaglio.id = this.idDettaglio;
    nascondiTrovabile(dettaglio, true);
    this.interno = el('div', 'talos-voce__interno');
    dettaglio.append(this.interno);
    li.append(riga, dettaglio);
    this.radice = li;
    this.riga = riga;
    this.dettaglio = dettaglio;
    riga.addEventListener('click', () => this.imposta(!this.aperta()));
    /* ⛔ Dalla ricerca nella pagina NON si ridisegna: il browser sta per scorrere sul nodo di testo trovato, e sostituirlo
       gli toglierebbe il bersaglio. Il testo grezzo resta; il disegno ricco arriva al prossimo clic. */
    dettaglio.addEventListener('beforematch', () => { riga.setAttribute('aria-expanded', 'true'); });
    this.firmaDettaglio = '';
    this.aggiorna();
    /* Il dettaglio c'è nel DOM anche chiuso: la ricerca nella pagina lo deve poter trovare. */
    this.disegnaDettaglio();
  }
  aperta() { return this.riga.getAttribute('aria-expanded') === 'true'; }
  imposta(aperta) {
    this.riga.setAttribute('aria-expanded', String(aperta));
    nascondiTrovabile(this.dettaglio, !aperta);
    if (aperta) this.disegnaDettaglio();
  }
  aggiorna() {
    const v = this.voce;
    this.radice.dataset.stato = v.stato;
    this.radice.dataset.specie = v.tipo === 'ragionamento' ? 'ragionamento' : v.specie;
    const nomeIcona = v.tipo === 'ragionamento' ? 'i-brain' : SPECIE[v.specie]?.icona || 'i-bolt';
    if (this.iconaEl.dataset.icona !== nomeIcona) { this.iconaEl.dataset.icona = nomeIcona; this.iconaEl.replaceChildren(icona(v.stato === 'fallito' ? 'i-x' : nomeIcona)); }
    if (v.stato === 'fallito' && this.iconaEl.dataset.fallita !== 'si') { this.iconaEl.dataset.fallita = 'si'; this.iconaEl.replaceChildren(icona('i-x')); }
    if (v.tipo === 'ragionamento') {
      const secondi = v.stato === 'in-corso'
        ? (performance.now() - v.inizio) / 1000
        : (Number.isFinite(v.durataMs) ? v.durataMs / 1000 : null);
      this.verboEl.textContent = v.stato === 'in-corso' ? 'Sta ragionando…' : etichettaRagionamento({ inCorso: false, secondi });
      this.oggettoEl.textContent = v.stato === 'in-corso' ? (argomentoDelRagionamento(v.testo, { massimo: 90 }) || '') : titoloRagionamento(v.testo);
      this.metaEl.textContent = v.stato === 'in-corso' ? formattaDurataRagionamento(secondi) : '';
    } else {
      const [passato, presente] = VERBI[v.nome] || [nomeLeggibile(v.nome), nomeLeggibile(v.nome)];
      const descrizione = v.nome === 'shell' && v.argomenti.descrizione;
      this.verboEl.textContent = descrizione ? v.argomenti.descrizione : v.stato === 'in-corso' ? presente : passato;
      this.oggettoEl.textContent = bersaglio(v);
      let meta = '';
      if (v.stato === 'in-corso' && Number.isFinite(v.inizio)) meta = formattaDurataRagionamento((performance.now() - v.inizio) / 1000);
      else if (v.nome === 'shell' && v.esito !== null) { const e = leggiEsitoComando(v.esito); meta = e.verdetto ? (e.uscita === null ? 'senza codice' : `exit ${e.uscita}`) : ''; }
      else if (v.stato === 'fallito') meta = 'non riuscito';
      this.metaEl.replaceChildren();
      if (v.diff) this.metaEl.append(el('span', 'talos-segmento__piu', `+${v.diff.piu}`), ' ', el('span', 'talos-segmento__meno', `−${v.diff.meno}`));
      else this.metaEl.textContent = meta;
    }
    this.pallinoEl.replaceChildren();
    if (v.stato === 'in-corso') { const p = el('span', 'talos-dot talos-dot--live'); p.setAttribute('aria-hidden', 'true'); this.pallinoEl.append(p); }
    this.riga.setAttribute('aria-busy', String(v.stato === 'in-corso'));
    this.disegnaDettaglio();
  }
  disegnaDettaglio() {
    const v = this.voce;
    const firma = `${v.stato}|${v.tipo === 'ragionamento' ? v.testo.length : `${v.argomentiGrezzi.length}|${v.esito?.length ?? -1}`}`;
    if (firma === this.firmaDettaglio) return;
    this.firmaDettaglio = firma;
    if (v.tipo === 'ragionamento') {
      /* Chiuso e ancora in corso: solo testo (costo zero, come `depositaTestoRagionamento` del prodotto). */
      if (!this.aperta()) { this.interno.textContent = v.testo; this.firmaDettaglio = `${firma}|grezzo`; return; }
      this.interno.replaceChildren(renderizzaMarkdown(v.testo, { bloccoCodice: (c, l, chiuso) => creaBloccoCodice({ testo: c, linguaggio: l, chiuso }) }));
      return;
    }
    const parti = [];
    const argomenti = Object.entries(v.argomenti).map(([k, val]) => `${k}: ${typeof val === 'string' ? val : JSON.stringify(val)}`).join('\n');
    if (argomenti) parti.push(['Argomenti', argomenti]);
    if (v.esito !== null) parti.push(['Esito', v.esito.split('\n').slice(0, 200).join('\n')]);
    else parti.push(['Esito', 'In corso…']);
    this.interno.replaceChildren(...parti.flatMap(([t, testo]) => [el('h4', null, t), el('pre', null, testo)]));
  }
}

/* ---------------------------------------------------------------- il menu «⋯» (e il tasto destro) */
function apriMenu(vista, bottone, punto = null) {
  let menu = document.getElementById('r4aMenu');
  if (!menu) {
    menu = el('div', 'talos-menu');
    menu.id = 'r4aMenu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    document.body.append(menu);
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) chiudiMenu(); });
  }
  const voci = [
    ['Apri tutti i ragionamenti', () => vista.apriTutte({ soloRagionamenti: true })],
    ['Apri tutte le voci', () => vista.apriTutte()],
    ['Chiudi tutte le voci', () => vista.chiudiTutte()],
    ['Copia l’attività come testo', () => vista.copia()],
  ];
  menu.setAttribute('aria-label', 'Azioni sull’attività');
  menu.replaceChildren(...voci.map(([testo, fai]) => {
    const b = el('button', 'talos-menu__voce', testo);
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.tabIndex = -1;
    b.addEventListener('click', () => { chiudiMenu({ fuoco: false }); fai(); bottone.focus(); });
    return b;
  }));
  menu.onkeydown = (e) => {
    const items = [...menu.querySelectorAll('[role=menuitem]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items.at(-1).focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); chiudiMenu(); }
  };
  menu.__bottone = bottone;
  bottone.setAttribute('aria-expanded', 'true');
  menu.hidden = false;
  const r = bottone.getBoundingClientRect();
  const larghezza = menu.offsetWidth || 256;
  const x = punto ? punto.x : r.right - larghezza;
  const y = punto ? punto.y : r.bottom + 6;
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - larghezza - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
  menu.querySelector('[role=menuitem]')?.focus();
}
function chiudiMenu({ fuoco = true } = {}) {
  const menu = document.getElementById('r4aMenu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  menu.__bottone?.setAttribute('aria-expanded', 'false');
  if (fuoco) menu.__bottone?.focus();
}

/* =====================================================================================================
 * 5. IL TURNO — la domanda, poi segmenti e testo nell'ordine in cui sono arrivati.
 * ===================================================================================================== */
class VistaTurno {
  constructor(proiezione, { variante }) {
    this.p = proiezione;
    this.variante = variante;
    this.viste = new Map();
    this.turnoUtente = creaTurno();
    this.turnoUtente.dataset.turno = 'utente';
    this.turnoTalos = creaTurno({ numeri: [{ n: '1' }] });
    this.turnoTalos.dataset.turno = 'talos';
    this.messaggio = creaMessaggioTalos({ modello: 'glm-5.3-flash', ora: '21:08' });
    this.turnoTalos.append(this.messaggio);
  }
  monta(colonna) {
    colonna.append(this.turnoUtente, this.turnoTalos);
    this.aggiorna();
  }
  aggiorna() {
    if (!this.turnoUtente.querySelector('.talos-message') && this.p.consegna) this.turnoUtente.append(creaMessaggioUtente({ testo: this.p.consegna, ora: '21:08', meta: 'Compito libero' }));
    for (const b of this.p.blocchi) {
      let vista = this.viste.get(b);
      if (b.tipo === 'segmento') {
        if (!b.voci.length) continue;
        if (!vista) { vista = new VistaSegmento(b, { variante: this.variante }); this.viste.set(b, vista); this.messaggio.append(vista.radice); }
        else vista.aggiorna();
      } else {
        if (!vista) {
          const copia = el('div', 'talos-message__copy');
          const dentro = el('div', 'assistant-copy');
          copia.append(dentro);
          vista = { radice: copia, dentro, lunghezza: -1 };
          this.viste.set(b, vista);
          this.messaggio.append(copia);
        }
        if (vista.lunghezza !== b.testo.length) {
          vista.lunghezza = b.testo.length;
          vista.dentro.replaceChildren(renderizzaMarkdown(b.testo, { bloccoCodice: (c, l, chiuso) => creaBloccoCodice({ testo: c, linguaggio: l, chiuso }) }));
        }
      }
    }
    if (this.p.concluso) this.chiudi();
    if (this.azioni && this.messaggio.lastElementChild !== this.azioni) this.messaggio.append(this.azioni);
  }
  /* A giro finito la riga delle azioni della risposta, come nel prodotto: le altezze dei turni si confrontano alla pari. */
  chiudi() { if (!this.azioni) { this.azioni = creaAzioniMessaggio({}, { etichetta: 'Azioni sulla risposta' }); this.messaggio.append(this.azioni); } }
  segmenti() { return [...this.viste.values()].filter((v) => v instanceof VistaSegmento); }
}

/* =====================================================================================================
 * 6. LA SCENA DI LABORATORIO — `?componente=AttivitaCompatta&scena=lungo&tema=dark&variante=scheda&stato=S1&foto=1`
 * ===================================================================================================== */
function applicaTema(tema) {
  const r = document.documentElement;
  r.dataset.talosTheme = 'calm';
  r.dataset.talosScene = 'calm';
  r.dataset.talosColorMode = tema;
  r.dataset.talosResolvedColorMode = tema;
  r.dataset.talosMode = tema;
  if (tema === 'light') r.setAttribute('data-theme', 'light'); else r.removeAttribute('data-theme');
  r.style.setProperty('color-scheme', tema);
}

const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

function urlScena(parametri, cambi) {
  const q = new URLSearchParams(parametri);
  for (const [k, v] of Object.entries(cambi)) q.set(k, v);
  return `?${q.toString()}`;
}

function banda(parametri, { scena, tema, variante, onSeguito }) {
  const b = el('div', 'r4a-banda');
  b.append(el('strong', null, 'Prototipo R4 · attività compatta'), el('span', null, 'fixture dichiarata, nessun dato vero ·'));
  for (const k of ORDINE_SCENE_ATTIVITA) {
    const a = el('a', 'talos-filtro', SCENE_ATTIVITA[k].titolo);
    a.href = urlScena(parametri, { scena: k });
    a.style.display = 'inline-flex'; a.style.alignItems = 'center'; a.style.textDecoration = 'none';
    if (k === scena) a.setAttribute('aria-current', 'page');
    b.append(a);
  }
  b.append(el('span', 'r4a-banda__spazio'));
  const t = el('a', 'talos-filtro', tema === 'dark' ? 'Tema chiaro' : 'Tema scuro');
  t.href = urlScena(parametri, { tema: tema === 'dark' ? 'light' : 'dark' });
  const v = el('a', 'talos-filtro', variante === 'scheda' ? 'Variante: riga quieta' : 'Variante: scheda');
  v.href = urlScena(parametri, { variante: variante === 'scheda' ? 'quieta' : 'scheda' });
  for (const a of [t, v]) { a.style.display = 'inline-flex'; a.style.alignItems = 'center'; a.style.textDecoration = 'none'; b.append(a); }
  if (onSeguito) {
    const s = el('button', 'talos-filtro', 'Riproduci il seguito');
    s.type = 'button';
    s.addEventListener('click', () => { s.disabled = true; onSeguito(); });
    b.append(s);
  }
  return b;
}

export async function montaAttivitaCompatta() {
  const parametri = new URLSearchParams(location.search);
  const scena = ORDINE_SCENE_ATTIVITA.includes(parametri.get('scena')) ? parametri.get('scena') : 'lungo';
  const tema = parametri.get('tema') === 'light' ? 'light' : 'dark';
  const variante = parametri.get('variante') === 'quieta' ? 'quieta' : 'scheda';
  const stato = ['S0', 'S1', 'S2'].includes(parametri.get('stato')) ? parametri.get('stato') : 'S0';
  const foto = parametri.get('foto') === '1';
  applicaTema(tema);
  if (!document.getElementById('r4aStile')) {
    const s = el('style');
    s.id = 'r4aStile';
    s.textContent = STILE_ATTIVITA_COMPATTA;
    document.head.append(s);
  }
  if (!document.getElementById('r4aAnnunci')) {
    const r = el('div', 'sr-only');
    r.id = 'r4aAnnunci';
    r.setAttribute('role', 'status');
    r.setAttribute('aria-live', 'polite');
    document.body.append(r);
  }
  document.getElementById('talosAvvio')?.remove();
  /* ⛔ Il template apre sulla Home (`#schermoChat` nasce `hidden`): la chat si mostra qui, con la stessa regia di
     `mostraSchermo` di main.js ma restando in vista «sessione» (la colonna dei dettagli resta, come nel prodotto). */
  for (const pane of document.querySelectorAll('#centro > .talos-screen, #centro > #schermoHome')) pane.hidden = pane.id !== 'schermoChat';
  document.documentElement.setAttribute('data-vista', 'sessione');
  document.documentElement.setAttribute('data-schermo', 'chat');
  const testata = document.querySelector('#schermoChat .talos-topbar');
  if (testata) {
    testata.querySelector('h1').textContent = SCENE_ATTIVITA[ORDINE_SCENE_ATTIVITA.includes(parametri.get('scena')) ? parametri.get('scena') : 'lungo'].titolo;
    for (const conta of testata.querySelectorAll('.talos-tabs__count')) conta.remove();
  }
  /* La striscia del giro e la coda del template sono fixture del mockup, non di questa scena: in foto confonderebbero. */
  for (const finto of document.querySelectorAll('#schermoChat [data-c="StatusStrip"], #schermoChat [data-c="MessageQueue"]')) finto.hidden = true;
  const colonna = document.querySelector('#schermoChat .talos-conversation__column');
  for (const finto of colonna.querySelectorAll(':scope > *')) finto.remove();

  const dati = SCENE_ATTIVITA[scena];
  let proiezione;
  let vista;
  let timer = null;
  const avviaOrologio = () => {
    if (timer) return;
    timer = setInterval(() => { vista.aggiorna(); if (proiezione.concluso) { clearInterval(timer); timer = null; } }, 500);
  };

  const seguito = dati.vivo && dati.seguito ? async () => {
    avviaOrologio();
    for (const e of dati.seguito) {
      proiezione.applica(e);
      vista.aggiorna();
      await pausa(e.type === 'ReasoningMessageStart' ? 2_300 : 900);
    }
  } : null;
  if (!foto) colonna.append(banda(parametri, { scena, tema, variante, onSeguito: seguito }));

  if (dati.vivo) {
    /* La strada DIRETTA, con le stesse pause della foto del prodotto: le durate si misurano dal vivo. */
    proiezione = creaProiezione({ ragionamentiMs: dati.ragionamentiMs });
    vista = new VistaTurno(proiezione, { variante });
    vista.monta(colonna);
    avviaOrologio();
    for (const e of dati.eventi) {
      proiezione.applica(e);
      vista.aggiorna();
      if (e.type === 'ReasoningMessageStart') await pausa(2_300);
      if (e.type === 'ToolCallResult') await pausa(300);
    }
    await pausa(1_600);
    vista.aggiorna();
  } else {
    proiezione = proiettaStoria(dati.eventi, { ragionamentiMs: dati.ragionamentiMs });
    vista = new VistaTurno(proiezione, { variante });
    vista.monta(colonna);
  }
  if (stato !== 'S0') for (const s of vista.segmenti()) { if (!s.radice.classList.contains('talos-segmento--nudo')) s.imposta(true); }
  if (stato === 'S2') for (const s of vista.segmenti()) s.apriTutte({ soloRagionamenti: true });
  window.__r4aVista = vista;
  /* Per le prove: il seguito della scena viva si lancia anche con la banda nascosta (foto). */
  window.__r4aSeguito = seguito;
  return vista;
}
