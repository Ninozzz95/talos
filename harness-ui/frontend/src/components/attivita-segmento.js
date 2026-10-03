/*
 * R4 — IL SEGMENTO COMPATTO DELLE ATTIVITÀ: segmento → voce → dettaglio (24/09/2026, fase 2).
 *
 * Il prodotto raccoglie in un segmento gli attrezzi e i ragionamenti consecutivi di un giro (`legacy/app.js`,
 * `aggiungiVoceSegmento`). Fino al 24/09 i livelli erano TRE — segmento → gruppo di attrezzi (una card con la sua
 * testa) → riga → dettaglio — e la riga del segmento diceva cose false: un elenco contato come ricerca, una
 * modifica come «altra azione», un comando fallito assente (documento di fase 1, §2.2, misurato sul prodotto).
 *
 * Questo modulo fa DUE cose, e nient'altro:
 *   1. le funzioni PURE del riassunto — tassonomia, bersagli, frase viva, testo da copiare — provate a unità;
 *   2. la VISTA del segmento, che ADOTTA le schede che il prodotto crea già (la card di un gruppo di attrezzi con
 *      le sue righe, la scheda di un ragionamento) e le aggiorna sul posto: nessun nodo si ricostruisce, quindi
 *      aperture, filtri e fuoco sopravvivono allo streaming (Hermes lo dice di sé: «honors explicit disclosure
 *      across live updates», `tool/tool-group.test.tsx:418`, clone `65ad529` del 24/09/2026).
 *
 * Le 14 decisioni dell'owner (23-24/09/2026) sono citate accanto a ciò che le implementa (D1…D14).
 *
 * ⛔ I dati di una voce NON stanno nel DOM: stanno in `DATI_VOCE`, una mappa debole elemento → dati, che
 *   `app.js` riempie quando crea la riga (`{ tipo:'tool', info }` per un attrezzo, `{ tipo:'reasoning', voce }`
 *   per un ragionamento) e che qui si legge ad ogni aggiornamento. È la stessa lezione del 16/09 sul ragionamento:
 *   «il montaggio pigro regge solo se la SORGENTE DI VERITÀ sta nel DATO, non nel DOM parziale».
 *
 * ⛔ Il corpo chiuso è `hidden="until-found"` (D7): la ricerca nella pagina (Ctrl+F) e la navigazione a
 *   frammento lo trovano e lo aprono. MDN, «hidden» (letto il 24/09/2026): «Browsers typically implement hidden
 *   until found using content-visibility: hidden»; gli elementi così «participate in page layout» e «their
 *   margin, borders, padding, and background are rendered» ⇒ i contenitori nascosti qui NON hanno mai padding né
 *   bordi (stanno sul figlio `__interno`), e il CSS li azzera sulle schede adottate. E «If the element … has a
 *   display value of none, contents, or inline, then the element will not be revealed» ⇒ mai `display:none` su
 *   un contenitore `until-found`. MDN, «beforematch event» (letto il 24/09/2026): «Fire a beforematch event on
 *   the hidden element; Remove the hidden attribute from the element; Scroll to the element» — qui si allinea
 *   `aria-expanded` di chi lo comanda. Baseline 2025 («Newly available» da dicembre 2025).
 *
 * ⛔ Nessuna libreria, solo token Calm (`--talos-*`), nessun controllo nativo, niente nomi tecnici a schermo.
 */
import { renderizzaMarkdown } from './markdown.js';
import { t, tn } from './lingua.js';
import { ORDINE_SPECIE, SPECIE_ATTREZZI, fraseSpecie, iconaSpecie, nomeLeggibileAttrezzo, specieAttrezzo, verboAttrezzo } from './nomi-attrezzi.js';
import { argomentoDelRagionamento, etichettaRagionamento, formattaDurataRagionamento } from './ragionamento.js';
import { leggiEsitoComando } from './esito-comando.js';
import { accorciaPercorso } from './schede.js';

void renderizzaMarkdown; // il ragionamento aperto usa il renderer condiviso, che il prodotto monta da `app.js` (D14): qui non c'è una seconda copia

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * D12 — una voce NUOVA prende il posto della vecchia nella frase viva dopo 700 ms, non prima. Con i 2-4 s
 * dell'argomento del ragionamento la riga diceva «Sta ragionando» mentre il modello cercava già (prova V7 del
 * prototipo, 23/09): stabile e falsa. Hermes rivela dopo 200 ms (`thread/status.tsx:187-189`: «Long enough that
 * a tool whose arguments arrive in a few frames never gets to strobe a label», `DRAFTING_REVEAL_MS = 200`);
 * 700 bastano perché un attrezzo lampo non «strobi» e restano sotto la soglia in cui la riga mente. Da misurare
 * nel giro vero (decisione dell'owner: lo misura il coordinatore).
 */
export const PERMANENZA_MINIMA_AZIONE_MS = 700;
/** D11 — fra due passi, dopo 2 s di silenzio, «Prepara il passo successivo…» (Hermes: `TURN_QUIET_S = 2`, `thread/turn-activity.ts:11`). */
export const PAUSA_PROSSIMO_PASSO_MS = 2000;
/** D5 — i filtri per specie solo da 6 voci in su. */
export const SOGLIA_FILTRI = 6;
/** D2 — sotto 520 px di segmento i bersagli spariscono; ridotti a meno di 64 px («r…») non dicono niente e si tolgono. */
export const TETTO_BERSAGLI_PX = 520;
export const LARGHEZZA_MINIMA_BERSAGLI_PX = 64;
/** Il battito della vista mentre il segmento è vivo: i secondi, la frase viva, i 700 ms. */
const BATTITO_VIVO_MS = 250;
/** Gli attrezzi la cui riga si scrive come «verbo · oggetto» (hanno un verbo in `VERBI_ATTREZZI`). */
const ATTREZZI_CON_VERBO = new Set(['leggi', 'cerca', 'elenca', 'file_edit', 'scrivi', 'shell', 'web_search', 'naviga']);
/** La lunghezza massima del bersaglio nella riga della voce (percorso accorciato nel mezzo). */
const LUNGHEZZA_BERSAGLIO_VOCE = 64;

/** Elemento della riga (ToolRow o scheda del ragionamento) → dati della voce. Riempita da `app.js`. */
export const DATI_VOCE = new WeakMap();
/** Elemento del segmento → la sua vista, per chi ha in mano solo il DOM. */
const VISTE = new WeakMap();
export function vistaDelSegmento(elemento) {
  return elemento ? VISTE.get(elemento) ?? null : null;
}

/* =====================================================================================================
 * 1. LE FUNZIONI PURE
 * ===================================================================================================== */

const nomeFile = (p) => String(p || '').split(/[\\/]/).filter(Boolean).at(-1) || '';

/**
 * Il bersaglio di un attrezzo: corto per la riga del segmento («app.js», «unit/», «query»), lungo per la voce
 * (percorso accorciato nel mezzo con `accorciaPercorso`, mai troncato in coda).
 * @param {string} nome
 * @param {object} argomenti
 * @param {{corto?:boolean}} [forma]
 */
export function bersaglioAttrezzo(nome, argomenti, { corto = false } = {}) {
  const a = argomenti || {};
  switch (nome) {
    case 'leggi': case 'file_edit': case 'scrivi': return corto ? nomeFile(a.percorso) : (a.percorso ? accorciaPercorso(String(a.percorso), LUNGHEZZA_BERSAGLIO_VOCE) : '');
    case 'elenca': return corto ? `${nomeFile(a.percorso) || t('chat.activity.root')}/` : (a.percorso ? accorciaPercorso(`${a.percorso}/`, LUNGHEZZA_BERSAGLIO_VOCE) : t('chat.activity.projectRoot'));
    case 'cerca': { const q = [a.nome, a.testo].filter(Boolean).join(' · '); return q ? `«${q}»` : ''; }
    case 'shell': return corto ? String(a.descrizione || a.comando || '') : String(a.comando || a.descrizione || '');
    case 'prova': return '';
    case 'web_search': return a.query ? `«${a.query}»` : '';
    case 'naviga': return a.url ? String(a.url) : '';
    case 'delega_sottotask': return a.task ? accorciaTesto(String(a.task), corto ? 40 : 80) : '';
    default: return '';
  }
}

function accorciaTesto(testo, massimo) {
  const pulito = String(testo ?? '').replace(/\s+/g, ' ').trim();
  return pulito.length > massimo ? `${pulito.slice(0, massimo - 1).trimEnd()}…` : pulito;
}

/**
 * Il titolo di un ragionamento FINITO: il primo grassetto su riga intera (così scrive Codex, `extract_first_bold`),
 * altrimenti la prima frase compiuta; mai una frase a metà (`ragionamento.js`, stessa regola per l'argomento vivo).
 */
export function titoloRagionamento(testo) {
  const grezzo = String(testo ?? '');
  const titolo = /^[ \t]*\*\*([^*\n]{3,80})\*\*[ \t]*$/m.exec(grezzo);
  if (titolo) return titolo[1].trim();
  const pulito = grezzo.replace(/[*`_#>]/g, '').replace(/\s+/g, ' ').trim();
  if (!pulito) return '';
  const frase1 = /^(.{8,}?[.!?])(?=\s|$)/.exec(pulito)?.[1] || pulito;
  return frase1.length > 110 ? `${frase1.slice(0, 109).trimEnd()}…` : frase1;
}

/**
 * D11 — la frase viva: verbo al presente in testa e il bersaglio corto («Cerca «X»…», «Legge app.js…»); per un
 * ragionamento, il suo argomento corrente («Sta ragionando: …»). La descrizione di un comando è già una frase al
 * presente scritta dal modello: non le si mette «Esegue» davanti.
 * @param {object|null} voce una voce normalizzata (vedi `normalizzaVoce`)
 */
export function fraseAdesso(voce) {
  if (!voce) return '';
  if (voce.tipo === 'reasoning') {
    const argomento = argomentoDelRagionamento(voce.testo, { massimo: 70 });
    return argomento ? t('chat.activity.thinkingAbout', { argomento }) : t('chat.activity.thinking');
  }
  const a = voce.argomenti || {};
  if (voce.nome === 'shell' && a.descrizione) return `${accorciaTesto(String(a.descrizione), 92)}…`;
  const presente = verboAttrezzo(voce.nome)[1];
  const b = bersaglioAttrezzo(voce.nome, a, { corto: true });
  return `${presente}${b ? ` ${b}` : ''}…`;
}

/** L'esito leggibile di una voce, per la colonna di destra: `exit 1`, «senza codice», «non riuscito», o niente. */
function metaEsito(voce) {
  if (voce.tipo !== 'tool') return '';
  if (voce.nome === 'shell' && voce.esito) {
    const e = leggiEsitoComando(voce.esito);
    if (e.verdetto) return e.uscita === null ? t('chat.activity.noExitCode') : `exit ${e.uscita}`;
  }
  return voce.stato === 'fallito' ? t('chat.activity.state.failed') : voce.stato === 'interrotto' ? t('chat.activity.state.interrupted')
    : voce.stato === 'non-eseguito' ? t('chat.activity.state.notRun') : '';
}

function ordinaSpecie(mappa) {
  return [...mappa.keys()].sort((a, b) => {
    const ia = ORDINE_SPECIE.indexOf(a); const ib = ORDINE_SPECIE.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

/**
 * D1/D3 — il riassunto del segmento, calcolato per intero dalle voci (dati veri, mai un delta sommato in giro):
 * parti intere e brevi in ordine fisso, i ragionamenti in coda con la somma delle durate solo se TUTTE note,
 * gli errori per specie, i bersagli, il diff, e la voce in corso.
 * @param {Array<object>} voci voci normalizzate
 */
export function riassuntoVoci(voci) {
  const riusciti = new Map();
  const falliti = new Map();
  let ragionamenti = 0;
  let durata = 0;
  let durateNote = true;
  let piu = 0; let meno = 0; let conDiff = false;
  const bersagli = [];
  let inCorso = null;
  let interrotti = 0;
  let nonEseguiti = 0;
  for (const v of voci || []) {
    if (!v) continue;
    if (v.tipo === 'reasoning') {
      if (v.stato === 'in-corso') { inCorso = v; continue; }
      ragionamenti += 1;
      if (Number.isFinite(v.durataMs)) durata += v.durataMs; else durateNote = false;
      continue;
    }
    if (v.stato === 'in-corso') { inCorso = v; continue; }
    if (v.stato === 'interrotto') { interrotti += 1; continue; } // 26/09: né riuscita né fallita — il giro si è fermato prima dell'esito
    if (v.stato === 'non-eseguito') { nonEseguiti += 1; continue; } // owner 03/10/2026: una prova non eseguita, né riuscita né fallita
    if (v.stato === 'corretta') continue; // 27/09, decisione 47: la domanda respinta non è stata posta; la riga discreta basta
    const mappa = v.stato === 'fallito' ? falliti : riusciti;
    mappa.set(v.specie, (mappa.get(v.specie) || 0) + 1);
    if (v.diff) { conDiff = true; piu += v.diff.piu; meno += v.diff.meno; }
    const b = bersaglioAttrezzo(v.nome, v.argomenti, { corto: true });
    if (b && !bersagli.includes(b)) bersagli.push(b);
  }
  const parti = ordinaSpecie(riusciti).map((s) => fraseSpecie(s, riusciti.get(s)));
  const partiBrevi = ordinaSpecie(riusciti).map((s) => fraseSpecie(s, riusciti.get(s), { breve: true }));
  if (ragionamenti) {
    const parola = tn('chat.activity.reasoningsOne', 'chat.activity.reasoningsMany', ragionamenti);
    partiBrevi.push(parola);
    /* La somma si scrive solo se TUTTE le durate sono note e arriva almeno al secondo: sotto, «(0 s)» sarebbe esatto e
       inutile — la stessa regola di «Ha ragionato poco» (`ragionamento.js`, `etichettaRagionamento`). */
    parti.push(durateNote && durata >= 1000 ? `${parola} (${formattaDurataRagionamento(durata / 1000)})` : parola);
  }
  /* 26/09, difetto (2): una chiamata rimasta senza esito quando il giro si è fermato si dice «interrotta» — né riuscita
     né fallita. Hermes fa lo stesso (`app/session/hooks/use-prompt-actions/rewind.ts:422-445`, clone 65ad529). */
  if (interrotti) { const parola = tn('chat.activity.interruptedOne', 'chat.activity.interruptedMany', interrotti); parti.push(parola); partiBrevi.push(parola); }
  if (nonEseguiti) { const parola = tn('chat.activity.notRunOne', 'chat.activity.notRunMany', nonEseguiti); parti.push(parola); partiBrevi.push(parola); }
  const erroriParti = ordinaSpecie(falliti).map((s) => fraseSpecie(s, falliti.get(s), { fallito: true }));
  const nFalliti = [...falliti.values()].reduce((a, b) => a + b, 0);
  return { parti, partiBrevi, erroriParti, nFalliti, bersagli, diff: conDiff ? { piu, meno } : null, inCorso };
}

/**
 * D11/D12 — la regola della frase viva, come stato: la STESSA voce che si precisa cambia subito; una voce nuova
 * aspetta che la vecchia si sia potuta leggere (700 ms); fra due passi resta l'ultima azione e dopo 2 s dice
 * «Prepara il passo successivo…»; un riempitivo non trattiene mai un'azione vera; a segmento concluso, niente.
 * @param {{orologio?:()=>number}} [opzioni]
 */
export function creaRegolaAdesso({ orologio = () => performance.now() } = {}) {
  let mostrato = '';
  let mostratoAlle = 0;
  let idMostrato = null;
  const mostra = (testo, id, ora) => { if (testo !== mostrato) { mostrato = testo; mostratoAlle = ora; } idMostrato = id; return mostrato; };
  return {
    prossimo({ vivo, inCorso }) {
      const ora = orologio();
      if (!vivo) { mostrato = ''; idMostrato = null; return ''; }
      if (inCorso) {
        const testo = fraseAdesso(inCorso);
        const id = inCorso.id ?? inCorso;
        if (id === idMostrato && inCorso.tipo !== 'reasoning') return mostra(testo, id, ora);
        if (idMostrato === null || ora - mostratoAlle >= PERMANENZA_MINIMA_AZIONE_MS) return mostra(testo, id, ora);
        return mostrato;
      }
      if (!mostrato || (idMostrato !== null && ora - mostratoAlle >= PAUSA_PROSSIMO_PASSO_MS)) return mostra(t('chat.activity.preparingNextStep'), null, ora);
      return mostrato;
    },
    get testo() { return mostrato; },
  };
}

/** D6 — «Copia l'attività come testo»: una riga per voce, in ordine, col ragionamento citato. */
export function testoDelSegmento(voci) {
  const righe = [];
  for (const v of voci || []) {
    if (!v) continue;
    if (v.tipo === 'reasoning') {
      const etichetta = etichettaRagionamento({ inCorso: v.stato === 'in-corso', secondi: Number.isFinite(v.durataMs) ? v.durataMs / 1000 : null });
      const titolo = titoloRagionamento(v.testo);
      righe.push(`- ${etichetta}${titolo ? `: ${titolo}` : ''}`);
      righe.push(...String(v.testo ?? '').split('\n').map((r) => `  > ${r}`));
      continue;
    }
    const a = v.argomenti || {};
    const verbo = v.nome === 'shell' && a.descrizione ? String(a.descrizione) : verboAttrezzo(v.nome)[v.stato === 'in-corso' || v.stato === 'interrotto' ? 1 : 0]; // 26/09: interrotta = l'azione che si è fermata, non «Letto»
    const esito = v.stato === 'fallito' ? ` (${t('chat.activity.state.failed')})` : v.stato === 'interrotto' ? ` (${t('chat.activity.state.interrupted')})` : v.stato === 'non-eseguito' ? ` (${t('chat.activity.state.notRun')})` : v.stato === 'in-corso' ? ` (${t('chat.activity.state.running')})` : v.stato === 'corretta' ? ` (${t('chat.activity.state.rejectedAndRephrased')})` : ''; // 27/09, decisione 47
    righe.push(`- ${verbo} ${bersaglioAttrezzo(v.nome, a)}${esito}`.replace(/\s+\(/, ' (').trimEnd());
  }
  return righe.join('\n');
}

/**
 * Da ciò che `app.js` deposita in `DATI_VOCE` alla forma che le funzioni pure leggono. Il diff di una scrittura si
 * legge dal badge che `updateRealReview` ha già messo sulla riga (`.tool-note-diff`): un dato solo, non due.
 */
function normalizzaVoce(elemento, dati) {
  if (!dati) return null;
  if (dati.tipo === 'reasoning') {
    const v = dati.voce;
    return { tipo: 'reasoning', id: elemento, stato: v.chiuso ? 'concluso' : 'in-corso', testo: v.grezzo ?? '', durataMs: Number.isFinite(v.durataMs) ? v.durataMs : null };
  }
  const info = dati.info;
  /* 27/09, decisione owner 47: `corretta` — una domanda respinta per la forma e riformulata dal modello. */
  const stato = info.stato === 'running' ? 'in-corso' : info.stato === 'error' ? 'fallito' : info.stato === 'interrotto' ? 'interrotto'
    : info.stato === 'non-eseguito' ? 'non-eseguito' : info.stato === 'corretta' ? 'corretta' : 'riuscito';
  let diff = null;
  const badge = elemento.querySelector(':scope > .tool-note-diff');
  if (badge) {
    const piu = Number(badge.querySelector('.add')?.textContent.replace(/[^\d]/g, ''));
    const meno = Number(badge.querySelector('.del')?.textContent.replace(/[^\d]/g, ''));
    if (Number.isFinite(piu) && Number.isFinite(meno)) diff = { piu, meno };
  }
  return {
    tipo: 'tool', id: elemento, nome: info.nome, argomenti: info.argomentiParsati || {}, stato,
    specie: specieAttrezzo(info.nome, info.operazione), esito: typeof info.esito === 'string' ? info.esito : '',
    diff, inizio: Number.isFinite(info.iniziatoA) ? info.iniziatoA : null, comandoDellaPersona: Boolean(info.comandoDellaPersona),
  };
}

/* =====================================================================================================
 * 2. LA VISTA
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

/** `hidden="until-found"` per nascondere, e via l'attributo per mostrare: mai un `hidden` cieco su un corpo del segmento. */
function nascondiTrovabile(nodo, nascosto) {
  if (!nodo) return;
  if (nascosto) { if (nodo.getAttribute('hidden') !== 'until-found') nodo.setAttribute('hidden', 'until-found'); } else if (nodo.hasAttribute('hidden')) nodo.removeAttribute('hidden');
}

/** Una regione `role="status"` sola per tutti i segmenti: si annunciano i PASSAGGI, mai i secondi (MDN, aria-live). */
function annuncia(testo) {
  let regione = document.getElementById('talosAnnunciAttivita');
  if (!regione) {
    regione = el('div', 'sr-only');
    regione.id = 'talosAnnunciAttivita';
    regione.setAttribute('role', 'status');
    regione.setAttribute('aria-live', 'polite');
    document.body.append(regione);
  }
  regione.textContent = '';
  requestAnimationFrame(() => { regione.textContent = testo; });
}

/**
 * La vista di un segmento. Ritorna gli stessi tre pezzi che `creaAttivita` dava al prodotto — `card`, `testa`,
 * `contenitore` — così `aggiungiVoceSegmento` continua ad appendere le schede in `contenitore` senza sapere altro.
 *
 * @param {object} opzioni
 * @param {{apriMenu:Function, apriReview:Function, toast:Function}} opzioni.azioni le porte del prodotto (menu di casa, Review, toast)
 * @param {()=>number} [opzioni.orologio]
 */
export function creaVistaSegmento({ azioni, orologio = () => performance.now() } = {}) {
  const vista = new VistaSegmento({ azioni: azioni || {}, orologio });
  VISTE.set(vista.card, vista);
  return vista;
}

class VistaSegmento {
  constructor({ azioni, orologio }) {
    this.azioni = azioni;
    this.orologio = orologio;
    this.regolaAdesso = creaRegolaAdesso({ orologio });
    this.filtro = 'tutte';
    this.annunciati = new WeakSet();
    this.decorati = new WeakSet();
    this.eraVivo = false;
    this.vivo = false;
    this.inizio = null;
    this.fine = null;
    this.timer = null;
    this.ultimo = { vivo: false, misurato: false };
    this.ultimoRiassunto = null;

    /* Le stesse classi della card di sempre: le prove e i respiri di GAP-09 (`.talos-message > .talos-activity +
       .talos-message__copy`) continuano a riconoscerla.
       ⛔ Ma `data-c="ActivitySegment"`, NON `ActivityBundle`: i gruppi si contano con `[data-c="ActivityBundle"]` (Inspector
       `giriPerInspector`, spina `nellaChat`, prove `TOOL-BATCH-*` di `baseline-shell`), e un involucro contato come gruppo
       faceva «2 gruppi» dove ce n'era uno (trovato con la suite intera il 24/09). */
    const card = el('div', 'talos-card talos-activity talos-activity--segment');
    card.setAttribute('data-c', 'ActivitySegment');
    card.dataset.segmento = 'r4';
    this.card = card;

    const idCorpo = nuovoId('segmento-corpo');
    const testa = el('button', 'talos-activity__head');
    testa.type = 'button';
    testa.setAttribute('aria-expanded', 'false');
    testa.setAttribute('aria-controls', idCorpo);
    testa.append(icona('i-chev', 'i talos-activity__chev'));
    this.statoEl = el('span', 'talos-activity__stato');
    /* Classe SUA, non `tool-note-summary-text`: quella è la frase del GRUPPO, che l'Inspector e le prove `TOOL-BATCH-*` leggono
       come «la prima testa della conversazione»; la riga del segmento non deve mettersi davanti (stessa suite del 24/09). */
    this.summaryText = el('span', 'talos-activity__conteggi');
    this.bersagliEl = el('span', 'talos-activity__bersagli');
    this.misureEl = el('span', 'talos-activity__misure');
    this.diffEl = el('span', 'talos-activity__diff');
    this.erroreEl = el('span', 'talos-activity__errore');
    this.tempoEl = el('span', 'talos-activity__tempo');
    this.tempoEl.setAttribute('aria-hidden', 'true');
    this.misureEl.append(this.diffEl, this.erroreEl, this.tempoEl);
    /* Niente `aria-label`: il nome accessibile resta il testo che si vede (WCAG 2.5.3, «Label in Name»); la forma
       INTERA, quando a schermo c'è quella breve, e gli errori vanno nella descrizione. */
    this.descrizioneEl = el('span', 'sr-only talos-activity__descrizione');
    this.descrizioneEl.id = nuovoId('segmento-descrizione');
    testa.setAttribute('aria-describedby', this.descrizioneEl.id);
    testa.append(this.statoEl, this.summaryText, this.bersagliEl, this.misureEl);
    this.testa = testa;

    /* D6 — il «⋯»: invisibile a riposo, visibile a hover/fuoco; e ciò che sta nel menu non resta anche in riga. */
    const altro = el('button', 'talos-activity__altro');
    altro.type = 'button';
    altro.setAttribute('aria-label', t('chat.activity.actions'));
    altro.setAttribute('aria-haspopup', 'menu');
    altro.setAttribute('aria-expanded', 'false');
    altro.append(icona('i-more'));
    this.altro = altro;

    this.fissate = el('div', 'talos-activity__fissate');
    this.fissate.hidden = true;

    const corpo = el('div', 'talos-activity__body');
    corpo.id = idCorpo;
    nascondiTrovabile(corpo, true);
    const interno = el('div', 'talos-activity__interno');
    this.filtriEl = el('div', 'talos-activity__filtri');
    this.filtriEl.setAttribute('role', 'group');
    this.filtriEl.setAttribute('aria-label', t('chat.activity.filter.label'));
    this.filtriEl.hidden = true;
    this.notaEl = el('p', 'talos-activity__nota');
    this.notaEl.hidden = true;
    this.contenitore = el('div', 'talos-activity__voci tool-batch-items');
    interno.append(this.filtriEl, this.notaEl, this.contenitore);
    corpo.append(interno);
    this.corpo = corpo;
    card.append(testa, altro, this.descrizioneEl, this.fissate, corpo);

    /* Il clic sulla testa lo apre la regia generica dei disclosure (`app.js`, `[aria-expanded][aria-controls]`),
       che gira DOPO questo ascoltatore e mette un `hidden` cieco: al fotogramma dopo si legge lo stato VERO e si
       rimette `until-found` (stessa strada di `chiediDisegnoRagionamento`). */
    testa.addEventListener('click', () => requestAnimationFrame(() => this.dopoToggle()));
    testa.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && this.aperto()) { e.preventDefault(); this.righeVisibili()[0]?.focus(); }
    });
    corpo.addEventListener('beforematch', () => this.imposta(true, { daRicerca: true }));
    altro.addEventListener('click', (e) => { e.stopPropagation(); this.apriMenu({ ancoraEl: altro }); });
    testa.addEventListener('contextmenu', (e) => { e.preventDefault(); this.apriMenu({ x: e.clientX, y: e.clientY, focusElement: altro }); });
    this.contenitore.addEventListener('keydown', (e) => this.tastiera(e));
    /* Un clic o un Invio su una riga adottata lo gestisce la casa (regia + `creaRigaAttrezzo`): qui si rimette solo
       `until-found` sul corpo che la casa ha appena chiuso con `hidden`. */
    this.contenitore.addEventListener('click', () => requestAnimationFrame(() => this.normalizzaCorpi()));
    this.contenitore.addEventListener('beforematch', (e) => this.rivelaDallaRicerca(e.target), true);
    if (typeof ResizeObserver === 'function') {
      this.osservatore = new ResizeObserver(() => this.adatta());
      this.osservatore.observe(card);
    }
  }

  aperto() { return this.testa.getAttribute('aria-expanded') === 'true'; }

  /** Dopo il clic della regia: `until-found` al posto del `hidden` cieco, le fissate e lo stato del card. */
  dopoToggle() {
    const aperto = this.aperto();
    nascondiTrovabile(this.corpo, !aperto);
    this.card.dataset.aperto = aperto ? 'si' : 'no';
    this.aggiornaFissate();
  }

  imposta(aperto, { daRicerca = false } = {}) {
    this.testa.setAttribute('aria-expanded', String(aperto));
    if (!daRicerca) nascondiTrovabile(this.corpo, !aperto);
    this.card.dataset.aperto = aperto ? 'si' : 'no';
    this.aggiornaFissate();
  }

  /** I corpi dei dettagli chiusi sono `until-found` (la casa li chiude con `hidden`, o li lascia a `display:none` via CSS): la ricerca deve trovare ancora. */
  normalizzaCorpi() {
    for (const riga of this.righe()) {
      const corpo = this.corpoDi(riga);
      if (!corpo) continue;
      const aperta = riga.getAttribute('aria-expanded') === 'true';
      if (!aperta && corpo.getAttribute('hidden') !== 'until-found') corpo.setAttribute('hidden', 'until-found');
      /* Un dettaglio aperto SCORRE (tetto 240 px; e `.assistant-copy pre` ha `overflow-x:auto`, `foglio-monolite.css:100`):
         una regione scorrevole si raggiunge anche da tastiera (axe `scrollable-region-focusable`, WCAG 2.1.1, trovato
         il 24/09 con la prova A11Y). Da chiusa non è una fermata di Tab. */
      const scorrevoli = this.eRagionamento(riga) ? [...corpo.querySelectorAll('.tool-note-detail')] : [corpo, ...corpo.querySelectorAll(':scope > pre')];
      for (const nodo of scorrevoli) { if (aperta) { if (nodo.tabIndex !== 0) nodo.tabIndex = 0; } else if (nodo.hasAttribute('tabindex')) nodo.removeAttribute('tabindex'); }
    }
  }

  /** La ricerca ha trovato un testo dentro un dettaglio chiuso: si allinea chi lo comanda. Dalla ricerca NON si ridisegna. */
  rivelaDallaRicerca(nodo) {
    for (const riga of this.righe()) {
      if (this.corpoDi(riga) === nodo) { riga.setAttribute('aria-expanded', 'true'); riga.dispatchEvent(new CustomEvent('talos:voce-rivelata', { bubbles: true })); break; }
    }
  }

  /* -------------------------------------------------------------- le righe adottate */
  /** Le righe delle voci, in ordine di evento: le ToolRow dei gruppi e le teste delle schede di ragionamento. */
  righe() {
    const esito = [];
    for (const scheda of this.contenitore.children) {
      if (scheda.classList.contains('real-reasoning-note')) {
        if (scheda.hidden) continue; // un ragionamento senza testo non ha riga (regola del 13/09)
        const testa = scheda.querySelector(':scope > .talos-activity__head');
        if (testa) esito.push(testa);
        continue;
      }
      for (const riga of scheda.querySelectorAll(':scope > .talos-activity__body > [data-c="ToolRow"]')) esito.push(riga);
    }
    return esito;
  }
  righeVisibili() { return this.righe().filter((r) => r.dataset.filtrata !== 'si'); }
  /* ⛔ «È un ragionamento» si legge dalla SCHEDA che contiene la riga, non da `data-voce`: quell'attributo lo scrive
     `decora()`, che gira DOPO la normalizzazione — al primo giro nessun ragionamento veniva riconosciuto (trovato con
     la prova D11: nel riassunto mancavano i ragionamenti). */
  eRagionamento(riga) { return Boolean(riga.parentElement?.classList.contains('real-reasoning-note')); }
  /** Il corpo che una riga comanda: il `<pre>` del dettaglio per un attrezzo, il corpo della scheda per un ragionamento. */
  corpoDi(riga) {
    if (this.eRagionamento(riga)) return riga.parentElement.querySelector(':scope > .talos-activity__body');
    const id = riga.getAttribute('aria-controls');
    return id ? riga.parentElement?.querySelector(`#${CSS.escape(id)}`) ?? null : null;
  }
  vociNormalizzate() {
    return this.righe().map((riga) => {
      const scheda = this.eRagionamento(riga) ? riga.parentElement : riga;
      return { riga, voce: normalizzaVoce(scheda, DATI_VOCE.get(scheda)) };
    }).filter((x) => x.voce);
  }

  /** Una riga adottata si decora UNA volta: `data-voce`, l'icona, gli span che la casa non ha (oggetto, meta). */
  decora(riga, voce) {
    if (this.decorati.has(riga)) return;
    this.decorati.add(riga);
    if (voce.tipo === 'reasoning') {
      riga.dataset.voce = 'ragionamento';
      const ic = el('span', 'talos-voce__icona');
      ic.append(icona('i-brain'));
      riga.prepend(ic);
      const oggetto = el('span', 'talos-voce__oggetto');
      riga.querySelector('.tool-note-summary-text')?.after(oggetto);
      return;
    }
    riga.dataset.voce = 'attrezzo';
    const meta = el('span', 'talos-voce__meta');
    const pallino = riga.querySelector(':scope > .talos-dot');
    if (pallino) pallino.before(meta); else riga.append(meta);
  }

  /** La riga di una voce, aggiornata sul posto: verbo, oggetto, esito; il titolo di un ragionamento finito. */
  aggiornaRiga(riga, voce) {
    this.decora(riga, voce);
    if (voce.tipo === 'reasoning') {
      const oggetto = riga.querySelector(':scope > .talos-voce__oggetto');
      const testo = voce.stato === 'in-corso' ? '' : titoloRagionamento(voce.testo);
      if (oggetto && oggetto.textContent !== testo) oggetto.textContent = testo;
      return;
    }
    const a = voce.argomenti || {};
    const nome = riga.querySelector('.tool-note-summary-text');
    const dettaglio = riga.querySelector('.talos-tool-row__detail');
    const meta = riga.querySelector(':scope > .talos-voce__meta');
    /* La riga si riscrive come «verbo · oggetto» solo per gli attrezzi che hanno un verbo nostro: per gli altri
       (`prova` col suo «✓ Test verdi — 14/14», la delega col riassunto del figlio, gli attrezzi di Libreria, memoria,
       ricerca…) la frase che il prodotto scrive già dice di più, e resta. Il comando della persona resta com'è (PO-06). */
    const nostra = !voce.comandoDellaPersona && ATTREZZI_CON_VERBO.has(voce.nome);
    if (nostra) {
      const [passato, presente] = verboAttrezzo(voce.nome);
      const verbo = voce.nome === 'shell' && a.descrizione ? accorciaTesto(String(a.descrizione), 92) : voce.stato === 'in-corso' || voce.stato === 'interrotto' ? presente : passato; // 26/09: il passato direbbe che è finita
      if (nome && nome.textContent !== verbo) nome.textContent = verbo;
      const oggetto = bersaglioAttrezzo(voce.nome, a);
      if (dettaglio && dettaglio.textContent !== oggetto) dettaglio.textContent = oggetto;
    }
    let testoMeta = '';
    if (voce.stato === 'in-corso' && voce.inizio !== null && this.ultimo.misurato) testoMeta = formattaDurataRagionamento((Date.now() - voce.inizio) / 1000);
    else if (!voce.diff) testoMeta = metaEsito(voce);
    if (meta) {
      if (voce.diff) {
        const atteso = `+${voce.diff.piu} −${voce.diff.meno}`;
        if (meta.dataset.diff !== atteso) {
          meta.dataset.diff = atteso;
          meta.replaceChildren(el('span', 'talos-activity__piu', `+${voce.diff.piu}`), ' ', el('span', 'talos-activity__meno', `−${voce.diff.meno}`));
        }
      } else if (meta.textContent !== testoMeta) { delete meta.dataset.diff; meta.textContent = testoMeta; }
    }
    const use = riga.querySelector(':scope > .talos-tool-row__icon use');
    if (use) {
      const href = voce.stato === 'fallito' ? '#i-x' : (use.dataset.originale || use.getAttribute('href'));
      if (!use.dataset.originale) use.dataset.originale = use.getAttribute('href');
      if (use.getAttribute('href') !== href) use.setAttribute('href', href);
    }
  }

  /* -------------------------------------------------------------- l'aggiornamento */
  /**
   * @param {{vivo:boolean, misurato:boolean}} stato vivo = è la coda aperta del giro; misurato = nato dal vivo (il tempo si scrive solo allora)
   */
  aggiorna({ vivo = false, misurato = false } = {}) {
    this.ultimo = { vivo, misurato };
    if (misurato && this.inizio === null) this.inizio = this.orologio();
    const coppie = this.vociNormalizzate();
    for (const { riga, voce } of coppie) this.aggiornaRiga(riga, voce);
    const voci = coppie.map((c) => c.voce);
    const r = riassuntoVoci(voci);
    this.ultimoRiassunto = r;

    /* ⛔ Vivo = il segmento è la CODA aperta del giro, non «c'è una voce in corso»: fra due chiamate non c'è
       niente in corso, e la riga lampeggiava vivo→concluso→vivo (prova V7). Hermes lo scrive nel suo test:
       «stays live in the gap between two sequential calls» (`tool/tool-group.test.tsx:465-475`). */
    this.vivo = vivo;
    this.card.dataset.stato = vivo ? 'vivo' : r.nFalliti ? 'errore' : 'concluso';
    this.card.setAttribute('aria-busy', String(vivo));
    if (!vivo && this.eraVivo && this.fine === null && misurato) this.fine = this.orologio();

    this.statoEl.replaceChildren();
    if (vivo) { const p = el('span', 'talos-dot talos-dot--live'); p.setAttribute('aria-hidden', 'true'); this.statoEl.append(p); }

    this.adessoMostrato = this.regolaAdesso.prossimo({ vivo, inCorso: r.inCorso });
    this.scriviConteggi(false);
    const bersagli = r.bersagli.join(', ');
    if (this.bersagliEl.textContent !== bersagli) this.bersagliEl.textContent = bersagli;
    const descrizione = [...r.parti, ...r.erroriParti].join(', ');
    if (this.descrizioneEl.textContent !== descrizione) this.descrizioneEl.textContent = descrizione;

    if (r.diff) {
      const atteso = `+${r.diff.piu} −${r.diff.meno}`;
      if (this.diffEl.dataset.diff !== atteso) {
        this.diffEl.dataset.diff = atteso;
        this.diffEl.replaceChildren(el('span', 'talos-activity__piu', `+${r.diff.piu}`), ' ', el('span', 'talos-activity__meno', `−${r.diff.meno}`));
        this.diffEl.setAttribute('aria-label', t('chat.activity.diffSummary', { piu: r.diff.piu, meno: r.diff.meno }));
      }
    } else if (this.diffEl.childNodes.length) { this.diffEl.replaceChildren(); delete this.diffEl.dataset.diff; }
    const errori = r.nFalliti ? r.erroriParti.join(' · ') : '';
    if (this.erroreEl.dataset.testo !== errori) {
      this.erroreEl.dataset.testo = errori;
      this.erroreEl.replaceChildren();
      if (errori) this.erroreEl.append(icona('i-x'), errori);
    }
    /* Il tempo solo se misurato dal vivo: in una rigiocata non si scrive (regola di casa; Hermes, `activity-timer.ts:81-82`). */
    const tempo = misurato && this.inizio !== null ? formattaDurataRagionamento(((vivo ? this.orologio() : (this.fine ?? this.orologio())) - this.inizio) / 1000) : '';
    if (this.tempoEl.textContent !== tempo) this.tempoEl.textContent = tempo;

    this.aggiornaFiltri(r, voci);
    this.aggiornaFissate(coppie);
    this.normalizzaCorpi();
    this.adatta();

    for (const { riga, voce } of coppie) {
      if (voce.tipo === 'tool' && voce.stato === 'fallito' && !this.annunciati.has(riga)) {
        this.annunciati.add(riga);
        annuncia(`${t('chat.common.failed')}: ${verboAttrezzo(voce.nome)[0]} ${bersaglioAttrezzo(voce.nome, voce.argomenti, { corto: true })}`.trim());
      }
    }
    if (this.eraVivo && !vivo) annuncia(`${t('chat.activity.finished')}: ${descrizione}`);
    this.eraVivo = vivo;
    if (vivo) this.avviaOrologio(); else this.fermaOrologio();
  }

  avviaOrologio() {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => {
      if (!this.card.isConnected) { this.fermaOrologio(); return; }
      this.aggiorna(this.ultimo);
    }, BATTITO_VIVO_MS);
  }
  fermaOrologio() {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  scriviConteggi(breve) {
    const r = this.ultimoRiassunto;
    if (!r) return;
    const parti = breve ? r.partiBrevi : r.parti;
    const adesso = this.adessoMostrato || '';
    const firma = `${breve ? 'b' : 'i'}|${adesso}|${parti.join('·')}`;
    if (this.summaryText.dataset.firma === firma) return;
    this.summaryText.dataset.firma = firma;
    this.summaryText.replaceChildren();
    if (adesso) this.summaryText.append(el('span', 'talos-activity__adesso', adesso), parti.length ? ' · ' : '');
    this.summaryText.append(parti.join(' · ') || (this.vivo ? '' : t('chat.activity.agentActivity')));
    this.summaryText.dataset.forma = breve ? 'breve' : 'intera';
    this.summaryText.title = breve ? r.parti.join(' · ') : '';
  }

  /* D1/D2 — si misura, non si indovina: se la forma intera non entra, la breve; un bersaglio sotto i 64 px si toglie. */
  adatta() {
    if (!this.card.isConnected || !this.ultimoRiassunto) return;
    this.scriviConteggi(false);
    if (this.summaryText.scrollWidth > this.summaryText.clientWidth + 1) this.scriviConteggi(true);
    const b = this.bersagliEl;
    b.style.visibility = '';
    if (b.textContent && b.scrollWidth > b.clientWidth + 1 && b.clientWidth < LARGHEZZA_MINIMA_BERSAGLI_PX) b.style.visibility = 'hidden';
  }

  /* D3 — un errore si legge senza aprire: la voce fallita resta fissata sotto la riga finché il segmento è chiuso. */
  aggiornaFissate(coppie = this.vociNormalizzate()) {
    const fallite = coppie.filter(({ voce }) => voce.tipo === 'tool' && voce.stato === 'fallito');
    const mostra = fallite.length > 0 && !this.aperto();
    const firma = mostra ? fallite.map(({ riga }) => `${riga.querySelector('.tool-note-summary-text')?.textContent}|${riga.querySelector('.talos-tool-row__detail')?.textContent}|${riga.querySelector('.talos-voce__meta')?.textContent}`).join('\n') : '';
    this.fissate.hidden = !mostra;
    if (this.fissate.dataset.firma === firma) return;
    this.fissate.dataset.firma = firma;
    if (!mostra) { this.fissate.replaceChildren(); return; }
    this.fissate.replaceChildren(...fallite.map(({ riga }) => {
      const b = el('button', 'talos-activity__fissata');
      b.type = 'button';
      b.append(
        icona('i-x', 'i talos-activity__fissata-icona'),
        el('span', 'talos-voce__verbo', riga.querySelector('.tool-note-summary-text')?.textContent ?? ''),
        el('span', 'talos-voce__oggetto', riga.querySelector('.talos-tool-row__detail')?.textContent ?? ''),
        el('span', 'talos-voce__meta', riga.querySelector('.talos-voce__meta')?.textContent ?? ''),
      );
      b.addEventListener('click', () => this.apriVoce(riga, { fuoco: true }));
      return b;
    }));
  }

  /** Apre il segmento e una voce, e le dà il fuoco (dalla fissata, dal menu, dalla tastiera). */
  apriVoce(riga, { fuoco = false } = {}) {
    this.imposta(true);
    this.impostaVoce(riga, true);
    if (fuoco) riga.focus();
  }
  impostaVoce(riga, aperta) {
    riga.setAttribute('aria-expanded', String(aperta));
    const corpo = this.corpoDi(riga);
    nascondiTrovabile(corpo, !aperta);
    if (aperta) riga.dispatchEvent(new CustomEvent('talos:voce-aperta', { bubbles: true }));
  }
  vociAperta(riga) { return riga.getAttribute('aria-expanded') === 'true'; }

  /* D5 — filtri per specie da 6 voci in su: pillole con aria-pressed, la nota dice quante voci si vedono. */
  aggiornaFiltri(r, voci) {
    const conteggi = new Map();
    for (const v of voci) { const k = v.tipo === 'reasoning' ? 'ragionamento' : v.specie; conteggi.set(k, (conteggi.get(k) || 0) + 1); }
    const mostra = voci.length >= SOGLIA_FILTRI;
    this.filtriEl.hidden = !mostra;
    if (!mostra) { if (this.filtro !== 'tutte') this.filtra('tutte', { silenzioso: true }); return; }
    const chiavi = ['tutte', ...(conteggi.has('ragionamento') ? ['ragionamento'] : []), ...ORDINE_SPECIE.filter((s) => conteggi.has(s)), ...[...conteggi.keys()].filter((k) => k.startsWith('altro:')), ...(r.nFalliti ? ['falliti'] : [])];
    const etichetta = (k) => k === 'tutte' ? t('chat.activity.filter.all') : k === 'ragionamento' ? t('chat.activity.filter.reasoning') : k === 'falliti' ? t('chat.activity.filter.failed') : SPECIE_ATTREZZI[k] ? t(SPECIE_ATTREZZI[k].filtro) : nomeLeggibileAttrezzo(k.slice(6));
    const quanti = (k) => k === 'tutte' ? voci.length : k === 'falliti' ? r.nFalliti : conteggi.get(k);
    const firma = chiavi.map((k) => `${k}:${quanti(k)}`).join('|');
    if (this.filtriEl.dataset.firma !== firma) {
      this.filtriEl.dataset.firma = firma;
      this.filtriEl.replaceChildren(...chiavi.map((k) => {
        const b = el('button', 'talos-filtro', `${etichetta(k)} ${quanti(k)}`);
        b.type = 'button';
        b.dataset.filtro = k;
        b.setAttribute('aria-pressed', String(k === this.filtro));
        b.addEventListener('click', (e) => { e.stopPropagation(); this.filtra(k); });
        return b;
      }));
    }
    this.filtra(this.filtro, { silenzioso: true });
  }

  filtra(k, { silenzioso = false } = {}) {
    this.filtro = k;
    for (const b of this.filtriEl.querySelectorAll('.talos-filtro')) b.setAttribute('aria-pressed', String(b.dataset.filtro === k));
    let visibili = 0;
    let totale = 0;
    for (const { riga, voce } of this.vociNormalizzate()) {
      totale += 1;
      const passa = k === 'tutte' || (k === 'falliti' ? voce.stato === 'fallito' : k === 'ragionamento' ? voce.tipo === 'reasoning' : voce.specie === k);
      if (passa) visibili += 1;
      /* `data-filtrata`, non `hidden`: `hidden` su una scheda di ragionamento vuol dire «senza testo» per `app.js`. */
      for (const nodo of this.nodiDellaVoce(riga)) { if (passa) delete nodo.dataset.filtrata; else nodo.dataset.filtrata = 'si'; }
    }
    const filtrato = k !== 'tutte';
    this.notaEl.hidden = !filtrato;
    if (filtrato) this.notaEl.textContent = t('chat.activity.filter.showing', { n: visibili, totale });
    if (!silenzioso && filtrato) annuncia(this.notaEl.textContent);
  }
  /** I nodi che una voce occupa: la scheda intera per un ragionamento; la riga e i suoi fratelli fino alla riga dopo (dettaglio, diff, fonti) per un attrezzo. */
  nodiDellaVoce(riga) {
    if (this.eRagionamento(riga)) return [riga.parentElement];
    const nodi = [riga];
    for (let n = riga.nextElementSibling; n && n.getAttribute('data-c') !== 'ToolRow'; n = n.nextElementSibling) nodi.push(n);
    return nodi;
  }

  /* D6 — le scorciatoie, nel menu di casa (`apriMenuAzioni`): tastiera e chiusura le fa lui. */
  vociDelMenu() {
    const voci = [
      { icona: 'i-brain', etichetta: t('chat.activity.menu.openReasonings'), azione: () => this.apriTutte({ soloRagionamenti: true }) },
      { icona: 'i-list', etichetta: t('chat.activity.menu.openAll'), azione: () => this.apriTutte() },
      { icona: 'i-chev', etichetta: t('chat.activity.menu.closeAll'), azione: () => this.chiudiTutte() },
      { icona: 'i-copy', etichetta: t('chat.activity.menu.copy'), azione: () => { void this.copia(); } },
    ];
    const percorsi = this.percorsiModificati();
    if (percorsi.length) voci.push({ icona: 'i-diff', etichetta: t('chat.activity.menu.openInReview'), azione: () => this.azioni.apriReview?.(percorsi) });
    return voci;
  }
  percorsiModificati() {
    const esito = [];
    for (const { voce } of this.vociNormalizzate()) {
      if (voce.tipo === 'tool' && voce.diff && voce.argomenti?.percorso && !esito.includes(voce.argomenti.percorso)) esito.push(String(voce.argomenti.percorso));
    }
    return esito;
  }
  apriMenu(posizionamento) {
    this.azioni.apriMenu?.({ voci: this.vociDelMenu(), etichetta: t('chat.activity.actions'), posizionamento: { ...posizionamento, fuoco: true, ancoraEl: posizionamento.ancoraEl ?? null, focusElement: posizionamento.focusElement ?? this.altro } });
  }
  apriTutte({ soloRagionamenti = false } = {}) {
    this.imposta(true);
    for (const riga of this.righe()) if (!soloRagionamenti || this.eRagionamento(riga)) this.impostaVoce(riga, true);
  }
  chiudiTutte() { for (const riga of this.righe()) this.impostaVoce(riga, false); }
  async copia() {
    const testo = testoDelSegmento(this.vociNormalizzate().map((c) => c.voce));
    let fatto = true;
    try { await navigator.clipboard.writeText(testo); } catch { fatto = false; }
    const messaggio = fatto ? t('chat.activity.copy.done') : t('chat.activity.copy.failed');
    if (this.azioni.toast) this.azioni.toast(messaggio); else annuncia(messaggio);
  }

  /* V1 — frecce come acceleratore, non come sostituto: ogni riga resta nel giro del Tab (Roselli, «Disclosure
     Widgets», 2020: le frecce di un lettore di schermo in modalità lettura restano sue). */
  tastiera(e) {
    const righe = this.righeVisibili();
    const i = righe.indexOf(document.activeElement);
    if (i < 0) return;
    const riga = righe[i];
    if (e.key === 'ArrowDown') { e.preventDefault(); righe[Math.min(righe.length - 1, i + 1)].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i === 0) this.testa.focus(); else righe[i - 1].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); righe[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); righe.at(-1).focus(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.impostaVoce(riga, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (this.vociAperta(riga)) this.impostaVoce(riga, false); else this.testa.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); this.testa.focus(); }
    else if (e.key === 'Enter' || e.key === ' ') requestAnimationFrame(() => this.normalizzaCorpi());
  }
}
