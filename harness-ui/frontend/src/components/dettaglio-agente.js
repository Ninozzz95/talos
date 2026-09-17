/*
 * ⛔⛔ PO-30, fetta 2 (18/09/2026) — IL DETTAGLIO DI UN AGENTE, col disegno del laboratorio dell'owner (PR #33), sui dati VERI.
 *
 * Nel laboratorio: «← Tutti gli agenti», il nome con lo stato, tre sezioni (Panoramica · File · Eventi), il compito, una
 * tabella di fatti, i file coinvolti che portano al file. Lì sono fixture («Stato dimostrativo»). Qui ogni riga esce da
 * `GET …/children` (`src/subagent-orchestrator.mjs` + `src/attivita-figlia.mjs`): compito, modello, permessi, quando è
 * partito, che attrezzo sta usando ADESSO, che cosa ha letto e scritto, i suoi passi in ordine.
 *
 * ⛔ Una sezione in più rispetto al laboratorio, e detta: «Conversazione». Il prodotto aveva già la conversazione intera del
 *   sotto-agente (Markdown, ragionamento, attrezzi — P0, punto 10): toglierla per somigliare al prototipo sarebbe perdere
 *   una funzione vera. Sta come quarta sezione, e il suo pannello è quello di sempre (`conversazione-figlia.js`), ospitato qui.
 * ⛔ Niente «stati demo», niente «— / —» al posto di un numero che non abbiamo: una riga senza dato NON si disegna.
 * ⛔ Componente puro di DOM: non chiama la rete e non conosce lo stato dell'app. Chi lo monta gli passa i dati e le azioni.
 */
import { nomeUmanoAttrezzo } from './nomi-attrezzi.js';

export const SEZIONI_AGENTE = Object.freeze([['panoramica', 'Panoramica'], ['file', 'File'], ['eventi', 'Eventi'], ['conversazione', 'Conversazione']]);
export const ETICHETTE_PERMESSI = Object.freeze({ 'read-only': 'Solo lettura', 'workspace-write': 'Scrive nel progetto', 'full-access': 'Accesso pieno' });

/** Lo stato in parole, dalla sola verità che abbiamo: conclusa, interrotta, esito della delega. */
export function statoAgente(figlia = {}) {
  if (figlia.interrotta === true) return { testo: 'Interrotto', tono: 'warning' };
  if (figlia.conclusa !== true) return { testo: 'In corso', tono: 'accent' };
  if (figlia.esitoDelega && /fall|error|rifiut/i.test(String(figlia.esitoDelega))) return { testo: 'Non riuscito', tono: 'danger' };
  return { testo: 'Concluso', tono: 'success' };
}

/** «Letto», «Modificato», «Creato»: che cosa ha fatto l'agente a quel file, in una parola. */
export function segnoFileAgente(voce = {}) {
  if (voce.creato) return 'Creato';
  if (voce.scritto) return 'Modificato';
  return 'Letto';
}

/** Un passo della linea del tempo, in una frase umana. `null` = passo che non si sa dire: non si disegna. */
export function frasePasso(passo = {}) {
  if (passo.tipo === 'avvio') return 'Compito assegnato';
  if (passo.tipo === 'fine') return 'Giro concluso';
  if (passo.tipo === 'errore') return 'Giro interrotto da un errore';
  if (passo.tipo !== 'attrezzo' || !passo.attrezzo) return null;
  const nome = nomeUmanoAttrezzo(passo.attrezzo);
  return passo.percorso ? `${nome} · ${passo.percorso}` : nome;
}

export function oraBreve(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
}

function el(d, tag, classe = '', testo = null) {
  const n = d.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== null) n.textContent = testo;
  return n;
}
function icona(d, id) {
  const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = d.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

/**
 * @param {object} figlia la voce di `GET …/children`
 * @param {{document?:Document, sezione?:string, eta?:(iso:string)=>string|null,
 *          azioni?:{indietro?:()=>void, apriFile?:(percorso:string)=>void, apriSessione?:()=>void}}} opzioni
 * @returns {{elemento:HTMLElement, slotConversazione:HTMLElement, aggiorna:(figlia:object)=>void, mostra:(sezione:string)=>void, sezione:()=>string}}
 */
export function creaDettaglioAgente(figlia, { document: documento, sezione: sezioneIniziale = 'panoramica', eta = () => null, azioni = {} } = {}) {
  const d = documento || globalThis.document;
  let dati = figlia || {};
  let sezione = SEZIONI_AGENTE.some(([id]) => id === sezioneIniziale) ? sezioneIniziale : 'panoramica';

  const elemento = el(d, 'div', 'talos-agente');
  elemento.dataset.c = 'DettaglioAgente';
  if (dati.sessionId) elemento.dataset.sessioneFiglia = String(dati.sessionId);

  /* ---- testata: «← Tutti gli agenti», poi icona + nome + stato ---- */
  const cima = el(d, 'div', 'talos-agente__cima');
  const indietro = el(d, 'button', 'talos-button talos-button--ghost talos-button--sm talos-agente__indietro');
  indietro.type = 'button';
  indietro.dataset.azione = 'tutti-gli-agenti';
  indietro.append(icona(d, 'i-arrow-left'), d.createTextNode('Tutti gli agenti'));
  indietro.addEventListener('click', () => azioni.indietro?.());
  cima.appendChild(indietro);

  const chi = el(d, 'div', 'talos-agente__chi');
  const segno = el(d, 'span', 'talos-agente__icona');
  segno.appendChild(icona(d, 'i-robot'));
  const nomi = el(d, 'div', 'talos-agente__nomi');
  const nome = el(d, 'b', 'talos-agente__nome');
  const ruolo = el(d, 'span', 'talos-agente__ruolo talos-muted');
  nomi.append(nome, ruolo);
  const stato = el(d, 'span', 'talos-badge talos-badge--sm');
  stato.setAttribute('role', 'status');
  chi.append(segno, nomi, stato);

  /* ---- le sezioni: pillole come nel laboratorio (`aria-pressed`), non un secondo tablist dentro il tablist della colonna ---- */
  const pillole = el(d, 'div', 'talos-agente__sezioni');
  pillole.setAttribute('role', 'group');
  pillole.setAttribute('aria-label', 'Che cosa guardare di questo agente');
  const bottoni = new Map();
  for (const [id, testo] of SEZIONI_AGENTE) {
    const b = el(d, 'button', 'talos-agente__sezione', testo);
    b.type = 'button';
    b.dataset.sezione = id;
    b.addEventListener('click', () => mostra(id));
    bottoni.set(id, b);
    pillole.appendChild(b);
  }

  const corpo = el(d, 'div', 'talos-agente__corpo');
  const pannelli = new Map(SEZIONI_AGENTE.map(([id]) => { const p = el(d, 'div', 'talos-agente__pannello'); p.dataset.pannello = id; corpo.appendChild(p); return [id, p]; }));
  const slotConversazione = pannelli.get('conversazione');
  elemento.append(cima, chi, pillole, corpo);

  function collegamentoFile(voce) {
    const b = el(d, 'button', 'talos-agente__file');
    b.type = 'button';
    b.dataset.percorso = voce.percorso;
    const nomeFile = voce.percorso.includes('/') ? voce.percorso.slice(voce.percorso.lastIndexOf('/') + 1) : voce.percorso;
    b.append(icona(d, 'i-file'), el(d, 'span', 'talos-agente__file-nome', nomeFile), el(d, 'span', 'talos-agente__file-segno talos-muted', segnoFileAgente(voce)));
    b.title = `${voce.percorso} — mostralo nella scheda File`;
    b.addEventListener('click', () => azioni.apriFile?.(voce.percorso));
    return b;
  }
  function riga(k, v) {
    const r = el(d, 'div', 'talos-kv');
    r.append(el(d, 'span', 'talos-kv__k', k), el(d, 'span', 'talos-kv__v', v));
    return r;
  }

  function disegnaPanoramica() {
    const p = pannelli.get('panoramica');
    const attivita = dati.attivita || {};
    const pezzi = [];
    pezzi.push(el(d, 'p', 'talos-agente__etichetta talos-muted', 'Compito'));
    pezzi.push(el(d, 'div', 'talos-agente__compito', dati.task || dati.taskCorto || 'Delega senza compito registrato'));
    const fatti = el(d, 'div', 'talos-agente__fatti');
    if (dati.modello) fatti.appendChild(riga('Modello', String(dati.modello)));
    const quanto = dati.avviataAlle ? eta(dati.avviataAlle) : null;
    if (quanto) fatti.appendChild(riga('Partito', `${quanto} fa`));
    if (attivita.attrezzoCorrente && dati.conclusa !== true) fatti.appendChild(riga('Sta usando', nomeUmanoAttrezzo(attivita.attrezzoCorrente)));
    if (Number.isFinite(attivita.chiamate) && attivita.chiamate > 0) fatti.appendChild(riga('Attrezzi usati', String(attivita.chiamate)));
    if (dati.permessi && ETICHETTE_PERMESSI[dati.permessi]) fatti.appendChild(riga('Permessi', ETICHETTE_PERMESSI[dati.permessi]));
    if (fatti.childElementCount > 0) pezzi.push(fatti);
    const collisioni = Array.isArray(dati.collisioni) ? dati.collisioni : [];
    if (collisioni.length > 0) {
      pezzi.push(el(d, 'div', 'talos-callout talos-agente__avviso', `Ha scritto ${collisioni.length === 1 ? 'un file' : `${collisioni.length} file`} che anche un altro agente ha toccato: ${collisioni.map((c) => c.percorso).join(', ')}.`));
    }
    /* Un'azione si disegna solo se chi monta il dettaglio la sa fare: un pulsante che non fa niente è un pulsante che mente. */
    if (typeof azioni.apriSessione === 'function') {
      const apri = el(d, 'button', 'talos-button talos-button--secondary talos-button--sm', 'Apri come sessione');
      apri.type = 'button';
      apri.dataset.azione = 'apri-sessione';
      apri.addEventListener('click', () => azioni.apriSessione());
      pezzi.push(apri);
    }
    const file = Array.isArray(attivita.file) ? attivita.file : [];
    pezzi.push(el(d, 'b', 'talos-agente__titoletto', 'File coinvolti'));
    if (file.length === 0) pezzi.push(el(d, 'p', 'talos-muted talos-agente__vuoto', dati.conclusa === true ? 'Non ha letto né scritto file.' : 'Non ha ancora letto né scritto file.'));
    else pezzi.push(...file.slice(0, 5).map(collegamentoFile));
    if (file.length > 5) { const altri = el(d, 'button', 'talos-button talos-button--ghost talos-button--sm', `Vedi tutti i ${file.length + (attivita.fileTagliati || 0)} file`); altri.type = 'button'; altri.addEventListener('click', () => mostra('file')); pezzi.push(altri); }
    if (dati.esitoDelega) {
      const sintesi = el(d, 'div', 'talos-agente__compito');
      sintesi.append(el(d, 'b', '', 'Che cosa ha riportato'), el(d, 'p', '', String(dati.esitoDelega)));
      pezzi.push(sintesi);
    }
    p.replaceChildren(...pezzi);
  }
  function disegnaFile() {
    const p = pannelli.get('file');
    const attivita = dati.attivita || {};
    const file = Array.isArray(attivita.file) ? attivita.file : [];
    const pezzi = [el(d, 'b', 'talos-agente__titoletto', 'File letti e modificati')];
    if (file.length === 0) pezzi.push(el(d, 'p', 'talos-muted talos-agente__vuoto', 'Nessun file, per ora.'));
    else pezzi.push(...file.map(collegamentoFile));
    if (attivita.fileTagliati > 0) pezzi.push(el(d, 'p', 'talos-muted talos-agente__nota', `E altri ${attivita.fileTagliati} file, i più vecchi: qui stanno i più recenti.`));
    p.replaceChildren(...pezzi);
  }
  function disegnaEventi() {
    const p = pannelli.get('eventi');
    const attivita = dati.attivita || {};
    const passi = (Array.isArray(attivita.passi) ? attivita.passi : []).map((passo) => ({ passo, frase: frasePasso(passo) })).filter((x) => x.frase);
    const pezzi = [el(d, 'b', 'talos-agente__titoletto', 'Che cosa ha fatto, in ordine')];
    if (attivita.passiTagliati > 0) pezzi.push(el(d, 'p', 'talos-muted talos-agente__nota', `Prima di questi ci sono altri ${attivita.passiTagliati} passi: li trovi nella Conversazione.`));
    if (passi.length === 0) pezzi.push(el(d, 'p', 'talos-muted talos-agente__vuoto', 'Ancora nessun passo.'));
    for (const { passo, frase } of passi) {
      const r = el(d, 'div', 'talos-agente__passo');
      r.dataset.tipo = passo.tipo;
      r.append(el(d, 'span', 'talos-agente__ora talos-mono talos-muted', oraBreve(passo.quando)), el(d, 'span', 'talos-agente__frase', frase));
      pezzi.push(r);
    }
    p.replaceChildren(...pezzi);
  }

  function disegnaTestata() {
    nome.textContent = dati.taskCorto || dati.task || 'Agente';
    nome.title = dati.task || '';
    ruolo.textContent = 'Sotto-agente di questa sessione';
    const s = statoAgente(dati);
    stato.textContent = s.testo;
    stato.className = `talos-badge talos-badge--sm talos-badge--${s.tono}`;
  }
  function mostra(quale) {
    if (!pannelli.has(quale)) return;
    sezione = quale;
    for (const [id, b] of bottoni) b.setAttribute('aria-pressed', String(id === quale));
    for (const [id, p] of pannelli) p.hidden = id !== quale;
    elemento.dataset.sezione = quale;
  }
  function aggiorna(nuova) {
    if (nuova) dati = nuova;
    disegnaTestata();
    disegnaPanoramica();
    disegnaFile();
    disegnaEventi();
  }
  aggiorna();
  mostra(sezione);
  return { elemento, slotConversazione, aggiorna, mostra, sezione: () => sezione };
}
