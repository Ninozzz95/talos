/*
 * Scene 1+4 (FE-081, group G-B of the generative-UI ledger, 05/11/2026): the versions of a live block, and its name.
 *
 * Shape: `FORMA-BLOCCO-AGGIORNA-E-RISCRITTURA-2026-11-05.md` §1 and §3.
 * - TALOS gives the names (`b1`, `b2`, … by first appearance, one counter per conversation, never reused). The model sees them only in
 *   the info string of the fences it receives (`nome=b2`); the person never sees them.
 * - A history holds at most `STORICO_MASSIMO` versions; going back ADDS an entry (`origine: 'ritorno'`), nothing is deleted. Past the cap
 *   the oldest `modello` version goes first, and v1 never goes.
 * Everything here is pure: frozen values out, never a throw on data.
 */
import { CATALOGO, LINGUA_DEL_RECINTO, TIPI } from './catalogo.mjs';
import { leggi } from './lettore.mjs';

export const STORICO_MASSIMO = 20;
export const ORIGINI = Object.freeze(['modello', 'vista', 'ritorno']);

const congela = (o) => Object.freeze(o);
const ora = (quando) => (typeof quando === 'string' && quando ? quando : new Date().toISOString());

/**
 * The source of a block in the fence language: the inverse of the reader, positional like the catalog (`id`, `titolo`, own fields,
 * `fonte`). Trailing absent arguments are dropped, so a block read and written again is the same block.
 * @returns {string} '' for something that is not a catalog block
 */
export function scriviSorgente(blocco) {
  const voce = TIPI.includes(blocco?.tipo) ? CATALOGO[blocco.tipo] : null;
  if (!voce) return '';
  const valori = voce.argomenti.map((a) => (blocco[a.nome] === undefined ? null : blocco[a.nome]));
  while (valori.length && valori.at(-1) === null) valori.pop();
  return `root = ${voce.componente}(${valori.map((v) => JSON.stringify(v)).join(', ')})`;
}

const PAROLE = congela({
  it: congela({
    tipo: { tabella: 'tabella', grafico: 'grafico', scelte: 'scelte', modulo: 'modulo', 'chiave-valore': 'elenco', passi: 'passi', avviso: 'avviso' },
    forma: { barre: 'barre', linee: 'linee', torta: 'torta' },
    vista: (a, b) => `vista da ${a} a ${b}`,
    tipoDa: (a, b) => `tipo da ${a} a ${b}`,
    forma2: (a, b) => `forma da ${a} a ${b}`,
    ritorno: (n) => `torna alla v${n}`,
    titolo: 'titolo cambiato',
    righePiu: ['una riga nuova', 'righe nuove'], righeMeno: ['una riga in meno', 'righe in meno'], righe: 'righe cambiate',
    colonne: 'colonne cambiate',
    puntiPiu: ['un punto nuovo', 'punti nuovi'], puntiMeno: ['un punto in meno', 'punti in meno'],
    seriePiu: ['una serie nuova', 'serie nuove'], serieMeno: ['una serie in meno', 'serie in meno'],
    valori: 'valori cambiati', vociPiu: ['una voce nuova', 'voci nuove'], vociMeno: ['una voce in meno', 'voci in meno'],
    contenuto: 'contenuto cambiato', niente: 'nessun cambiamento',
  }),
  en: congela({
    tipo: { tabella: 'table', grafico: 'chart', scelte: 'choices', modulo: 'form', 'chiave-valore': 'list', passi: 'steps', avviso: 'notice' },
    forma: { barre: 'bars', linee: 'lines', torta: 'pie' },
    vista: (a, b) => `view from ${a} to ${b}`,
    tipoDa: (a, b) => `type from ${a} to ${b}`,
    forma2: (a, b) => `shape from ${a} to ${b}`,
    ritorno: (n) => `back to v${n}`,
    titolo: 'title changed',
    righePiu: ['one new row', 'new rows'], righeMeno: ['one row fewer', 'rows fewer'], righe: 'rows changed',
    colonne: 'columns changed',
    puntiPiu: ['one new point', 'new points'], puntiMeno: ['one point fewer', 'points fewer'],
    seriePiu: ['one new series', 'new series'], serieMeno: ['one series fewer', 'series fewer'],
    valori: 'values changed', vociPiu: ['one new item', 'new items'], vociMeno: ['one item fewer', 'items fewer'],
    contenuto: 'content changed', niente: 'no change',
  }),
});

const parole = (lingua) => PAROLE[lingua] || PAROLE.it;
const uguali = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* the main list of each type, the one whose length a person counts */
const LISTA = congela({ scelte: 'opzioni', modulo: 'campi', 'chiave-valore': 'righe', passi: 'voci' });

function differenza(n, [una, tante], [unaMeno, tanteMeno]) {
  if (n === 1) return una;
  if (n > 1) return `${n} ${tante}`;
  if (n === -1) return unaMeno;
  if (n < -1) return `${-n} ${tanteMeno}`;
  return '';
}

/**
 * What changed between two versions, in plain words: «2 righe nuove, titolo cambiato», «vista da barre a tabella».
 * @param {object} prima @param {object} dopo blocks of the catalog
 * @param {{ lingua?: 'it'|'en' }} [opzioni]
 */
export function cosaECambiato(prima, dopo, { lingua = 'it' } = {}) {
  const p = parole(lingua);
  if (!prima || !dopo) return p.contenuto;
  const nomeDi = (b) => (b.tipo === 'grafico' && p.forma[b.forma] ? p.forma[b.forma] : (p.tipo[b.tipo] || String(b.tipo)));
  /* another kind of block: the view is the news; a title that follows the view is not */
  if (prima.tipo !== dopo.tipo) {
    return prima.tipo === 'grafico' || dopo.tipo === 'grafico' ? p.vista(nomeDi(prima), nomeDi(dopo)) : p.tipoDa(nomeDi(prima), nomeDi(dopo));
  }
  const frasi = [];
  if ((prima.titolo || '') !== (dopo.titolo || '')) frasi.push(p.titolo);
  if (dopo.tipo === 'tabella') {
    if (!uguali(prima.colonne, dopo.colonne)) frasi.push(p.colonne);
    const d = differenza((dopo.righe?.length ?? 0) - (prima.righe?.length ?? 0), p.righePiu, p.righeMeno);
    if (d) frasi.push(d);
    else if (!uguali(prima.righe, dopo.righe)) frasi.push(p.righe);
  } else if (dopo.tipo === 'grafico') {
    if (prima.forma !== dopo.forma) frasi.push(p.forma2(p.forma[prima.forma] || prima.forma, p.forma[dopo.forma] || dopo.forma));
    const ds = differenza((dopo.serie?.length ?? 0) - (prima.serie?.length ?? 0), p.seriePiu, p.serieMeno);
    const punti = (b) => (b.serie || []).reduce((n, s) => n + (s.punti?.length ?? 0), 0);
    const dp = differenza(punti(dopo) - punti(prima), p.puntiPiu, p.puntiMeno);
    if (ds) frasi.push(ds);
    else if (dp) frasi.push(dp);
    else if (!uguali(prima.serie, dopo.serie)) frasi.push(p.valori);
  } else if (LISTA[dopo.tipo]) {
    const campo = LISTA[dopo.tipo];
    const d = differenza((dopo[campo]?.length ?? 0) - (prima[campo]?.length ?? 0), p.vociPiu, p.vociMeno);
    if (d) frasi.push(d);
  }
  if (!frasi.length) {
    const resto = (b) => { const { titolo: _t, ...r } = b; return r; };
    frasi.push(uguali(resto(prima), resto(dopo)) ? p.niente : p.contenuto);
  }
  return frasi.join(', ');
}

function voce({ versione, blocco, sorgente, cosa, origine, aVersione, quando }) {
  return congela({
    versione, blocco, sorgente, cosaECambiato: cosa, origine,
    ...(origine === 'ritorno' && Number.isInteger(aVersione) ? { aVersione } : {}),
    quando: ora(quando),
  });
}

/* past the cap: the oldest `modello` version that is not v1 (and not the one on screen) goes; without one, the oldest that is not v1 */
function taglia(voci) {
  const out = [...voci];
  while (out.length > STORICO_MASSIMO) {
    const togliibile = (v, j) => j > 0 && j < out.length - 1 && v.versione !== 1;
    let i = out.findIndex((v, j) => togliibile(v, j) && v.origine === 'modello');
    if (i < 0) i = out.findIndex(togliibile);
    if (i < 0) break;
    out.splice(i, 1);
  }
  return out;
}

/**
 * The history of one block, with v1. `sorgente` is the fence body as written; without it, it is written from the block.
 * @param {object} blocco @param {string} nome `bN`
 * @param {{ sorgente?: string, quando?: string }} [opzioni]
 */
export function creaStorico(blocco, nome, { sorgente, quando } = {}) {
  const testo = typeof sorgente === 'string' && sorgente ? sorgente : scriviSorgente(blocco);
  return congela({ nome: String(nome ?? ''), prossima: 2, voci: congela([voce({ versione: 1, blocco, sorgente: testo, cosa: '', origine: 'modello', quando })]) });
}

/** The version on screen: always the last entry. */
export function versioneCorrente(storico) {
  return storico?.voci?.at(-1) ?? null;
}

/**
 * A new version. The number is never reused, even after the cap dropped some.
 * @param {{ origine?: 'modello'|'vista'|'ritorno', aVersione?: number, sorgente?: string, quando?: string, lingua?: string, cosa?: string }} [opzioni]
 */
export function aggiungiVersione(storico, blocco, { origine = 'modello', aVersione, sorgente, quando, lingua, cosa } = {}) {
  const prima = versioneCorrente(storico);
  const testo = typeof sorgente === 'string' && sorgente ? sorgente : scriviSorgente(blocco);
  const nuova = voce({
    versione: storico.prossima, blocco, sorgente: testo, origine: ORIGINI.includes(origine) ? origine : 'modello', aVersione, quando,
    cosa: typeof cosa === 'string' ? cosa : cosaECambiato(prima?.blocco, blocco, { lingua }),
  });
  return congela({ nome: storico.nome, prossima: storico.prossima + 1, voci: congela(taglia([...storico.voci, nuova])) });
}

/**
 * Back to version `n`: a NEW entry that copies it and points to it (`origine: 'ritorno'`, `aVersione: n`). Nothing is deleted, so the
 * version left behind is still in the list. An unknown `n`, or a source equal to the one on screen, gives the same history back.
 */
export function tornaAllaVersione(storico, n, { quando, lingua } = {}) {
  const meta = storico?.voci?.find((v) => v.versione === n);
  const corrente = versioneCorrente(storico);
  if (!meta || !corrente || corrente.sorgente === meta.sorgente) return storico;
  return aggiungiVersione(storico, meta.blocco, { origine: 'ritorno', aVersione: n, sorgente: meta.sorgente, quando, cosa: parole(lingua).ritorno(n) });
}

/** The `talos.blocco.versione` event of an entry (shape §3), for the host that persists it with the message. */
export function eventoDellaVersione(storico, voceDellaVersione, { conversazione = '', messaggio = '' } = {}) {
  const v = voceDellaVersione ?? versioneCorrente(storico);
  return congela({
    conversazione: String(conversazione), messaggio: String(messaggio), blocco: storico.nome, versione: v.versione, sorgente: v.sorgente,
    cosaECambiato: v.cosaECambiato, origine: v.origine, ...(v.origine === 'ritorno' ? { aVersione: v.aVersione } : {}), quando: v.quando,
  });
}

/**
 * The history rebuilt from the persisted events (reload), in version order. An event that does not read is skipped, never thrown.
 * @param {string} nome @param {string} sorgente1 the fence body of v1 (the message text) @param {object[]} eventi
 */
export function storicoDagliEventi(nome, sorgente1, eventi = []) {
  const primo = leggi(String(sorgente1 ?? ''));
  if (primo.stato !== 'completo') return null;
  let s = creaStorico(primo.blocco, nome, { sorgente: sorgente1 });
  const ordinati = (Array.isArray(eventi) ? eventi : [])
    .filter((e) => e && e.blocco === nome && Number.isInteger(e.versione) && e.versione >= 2)
    /* G-B4 (UIG-1.20): one entry per number, the first event wins (as `statoDeiBlocchi`); a journal written before the server owned the
       number may hold two v2 (one from the screen, one from the model), and the list showed «v2» twice */
    .filter((e, i, tutti) => tutti.findIndex((x) => x.versione === e.versione) === i)
    .sort((a, b) => a.versione - b.versione);
  for (const e of ordinati) {
    const r = leggi(String(e.sorgente ?? ''));
    if (r.stato !== 'completo') continue;
    s = aggiungiVersione(congela({ ...s, prossima: e.versione }), r.blocco, {
      origine: e.origine, aVersione: e.aVersione, sorgente: e.sorgente, quando: e.quando, cosa: String(e.cosaECambiato ?? ''),
    });
  }
  return s;
}

/**
 * G-B4 (06/11/2026), UIG-1.20: the version on screen takes the number the server gave it (a local version saved after a model version took
 * its number). Any other case gives the same history back: a number that is not an integer ≥ 2, the same number, or one already in the list.
 */
export function rinumeraCorrente(storico, versione) {
  const corrente = versioneCorrente(storico);
  if (!corrente || !Number.isInteger(versione) || versione < 2 || storico.voci.some((v) => v.versione === versione)) return storico;
  const voci = [...storico.voci.slice(0, -1), congela({ ...corrente, versione })];
  return congela({ nome: storico.nome, prossima: Math.max(storico.prossima, versione + 1), voci: congela(voci) });
}

// ---- Names (shape §1) ----

const APERTURA = new RegExp(`^(\\s*\`\`\`${LINGUA_DEL_RECINTO})((?:[ \\t][^\\n]*)?)$`, 'u');
const CHIUSURA = /^\s*```\s*$/u;
const NOME = /(?:^|\s)nome=(b[1-9]\d*)(?=\s|$)/u;
const NOMI = /(?:^|\s)nome=\S*/gu;

/** The name in an info string (` nome=b2`), or null. */
export function nomeDalRecinto(info) {
  return NOME.exec(String(info ?? ''))?.[1] ?? null;
}

const testoDellAssistente = (m) => (m?.role === 'assistant' && typeof m.content === 'string' ? m.content : null);

/**
 * The context the model receives: every block fence in the assistant messages gets `nome=bN` in its info string, and the body of a
 * block with a current version in `correnti` becomes that version. TALOS gives the names, never the model.
 *
 * G-B2 (05/11/2026): a name is PERSISTED with its message (the kernel writes it into the history it hands back), and one counter per
 * conversation, kept by the host, says which names TALOS has given: every bK with K < `prossimo`. So:
 *   - a name in the history with K < `prossimo`, seen for the first time in this walk, STAYS (reload, a fork's prefix);
 *   - a fence with no name, a name TALOS never gave (K ≥ `prossimo`, the model wrote it) or a duplicate takes `b${prossimo}` and the
 *     counter moves on; `rinomina` (a message the model has just written) gives every fence a new name;
 *   - a name is never given twice: a removed message (Riprova) keeps its numbers, because the counter does not go back.
 * Without a counter (`prossimo` 1) nothing is vouched for and the fences are numbered by first appearance, as before.
 * Messages without a block fence come back as the same objects, and the input is never changed.
 * @param {object[]} messaggi chat messages ({role, content})
 * @param {{ correnti?: Record<string, string>, prossimo?: number, rinomina?: boolean }} [opzioni] name → current source; the counter
 * @returns {{ messaggi: object[], nomi: string[], prossimo: number, nuovi: { nome: string, sorgente: string, indice: number }[] }}
 *   `nuovi`: the names given now, with the body the model wrote (the v1 of their history) and the message index
 */
export function nominaBlocchi(messaggi, { correnti = {}, prossimo = 1, rinomina = false } = {}) {
  const nomi = [];
  const nuovi = [];
  let contatore = Number.isInteger(prossimo) && prossimo > 1 ? prossimo : 1;
  const garantito = contatore;
  if (!Array.isArray(messaggi)) return { messaggi: [], nomi, prossimo: contatore, nuovi };
  const usati = new Set();
  const fuori = messaggi.map((m, indice) => {
    const t = testoDellAssistente(m);
    if (!t || !t.includes(`\`\`\`${LINGUA_DEL_RECINTO}`)) return m;
    let dentro = null;
    const out = [];
    for (const riga of t.split('\n')) {
      if (dentro) {
        if (!CHIUSURA.test(riga)) { dentro.corpo.push(riga); continue; }
        if (dentro.nuovo) nuovi.push({ nome: dentro.nome, sorgente: dentro.corpo.join('\n'), indice });
        const corrente = correnti[dentro.nome];
        out.push(...(typeof corrente === 'string' && corrente ? corrente.replace(/\n+$/u, '').split('\n') : dentro.corpo), riga);
        dentro = null;
        continue;
      }
      const a = APERTURA.exec(riga);
      if (!a) { out.push(riga); continue; }
      const scritto = rinomina ? null : nomeDalRecinto(a[2]);
      const tiene = scritto !== null && Number(scritto.slice(1)) < garantito && !usati.has(scritto);
      const nome = tiene ? scritto : `b${contatore++}`;
      usati.add(nome);
      nomi.push(nome);
      out.push(`${a[1]}${a[2].replace(NOMI, '').replace(/\s+$/u, '')} nome=${nome}`);
      dentro = { nome, corpo: [], nuovo: !tiene };
    }
    /* a fence left open (a message cut mid-block) keeps its body as it was */
    if (dentro) out.push(...dentro.corpo);
    const contenuto = out.join('\n');
    return contenuto === t ? m : { ...m, content: contenuto };
  });
  return { messaggi: fuori, nomi, prossimo: contatore, nuovi };
}

/**
 * G-B3 (06/11/2026): the closed `talos-blocco` fences of one message text, in order — `posizione` is the index among them (the screen
 * draws one block per fence in the same order), `sorgente` the body as `nominaBlocchi` cuts it, `nome` the stamped name or null.
 * A fence left open is not listed. Same APERTURA/CHIUSURA as `nominaBlocchi`, so the two never disagree on what a fence is.
 * @param {string} testo @returns {{ posizione: number, nome: string|null, sorgente: string }[]}
 */
export function recintiDelTesto(testo) {
  const fuori = [];
  if (typeof testo !== 'string' || !testo.includes(`\`\`\`${LINGUA_DEL_RECINTO}`)) return fuori;
  let dentro = null;
  for (const riga of testo.split('\n')) {
    if (dentro) {
      if (!CHIUSURA.test(riga)) { dentro.corpo.push(riga); continue; }
      fuori.push({ posizione: fuori.length, nome: dentro.nome, sorgente: dentro.corpo.join('\n') });
      dentro = null;
      continue;
    }
    const a = APERTURA.exec(riga);
    if (a) dentro = { nome: nomeDalRecinto(a[2]), corpo: [] };
  }
  return fuori;
}

// ---- G-B2 (05/11/2026): what the host rebuilds from the persisted events ----

/** The name of the durable CUSTOM event that carries one version (shape §3); v1 is emitted when the name is stamped. */
export const EVENTO_VERSIONE_DEL_BLOCCO = 'talos.blocco.versione';

const NUMERO_DEL_NOME = /^b([1-9]\d*)$/u;
const RECINTO_COL_NOME = new RegExp(`\`\`\`${LINGUA_DEL_RECINTO}[^\\n]*?\\snome=(b[1-9]\\d*)`, 'gu');

/**
 * The block state of a conversation, rebuilt on every turn from what was persisted: the name counter (one past the highest name seen
 * in the events AND in the stored messages, so a regenerated block never reuses an old name), every history rebuilt with
 * `storicoDagliEventi`, and the current sources for the names that moved past v1 (the model sees only those).
 * @param {object[]} eventi the `value` of the `talos.blocco.versione` events, any order
 * @param {object[]} [messaggi] the stored messages (their fences carry `nome=bN`)
 * @returns {{ prossimo: number, storici: Map<string, object>, correnti: Record<string, string>, primeDaiMessaggi: Map<string, string> }}
 */
export function statoDeiBlocchi(eventi = [], messaggi = []) {
  let massimo = 0;
  const conta = (nome) => { const m = NUMERO_DEL_NOME.exec(String(nome ?? '')); if (m) massimo = Math.max(massimo, Number(m[1])); };
  /* the first event of a (name, version) wins: the host lists its own events before those of the conversation it was forked from */
  const chiavi = new Set();
  const validi = (Array.isArray(eventi) ? eventi : []).filter((e) => {
    if (!e || typeof e.blocco !== 'string' || !Number.isInteger(e.versione) || chiavi.has(`${e.blocco}#${e.versione}`)) return false;
    chiavi.add(`${e.blocco}#${e.versione}`);
    return true;
  });
  for (const e of validi) conta(e.blocco);
  for (const m of Array.isArray(messaggi) ? messaggi : []) {
    const t = testoDellAssistente(m);
    if (t) for (const x of t.matchAll(RECINTO_COL_NOME)) conta(x[1]);
  }
  /* G-B3: a name kept in a stored message with no v1 event (a journal from before G-B2, a lost write) keeps the fence body there as
     its v1 in `primeDaiMessaggi`, so `blocco_aggiorna` on it is not `bloccoSconosciuto`. It enters `storici` only when a later version
     event exists (a real history); a v1 event, when present, wins. */
  const primi = validi.filter((e) => e.versione === 1);
  const primeDaiMessaggi = new Map();
  for (const m of Array.isArray(messaggi) ? messaggi : []) {
    for (const r of recintiDelTesto(testoDellAssistente(m))) {
      if (!r.nome || chiavi.has(`${r.nome}#1`) || primeDaiMessaggi.has(r.nome)) continue;
      primeDaiMessaggi.set(r.nome, r.sorgente);
      if (validi.some((e) => e.blocco === r.nome)) primi.push({ blocco: r.nome, versione: 1, sorgente: r.sorgente });
    }
  }
  const storici = new Map();
  const correnti = {};
  for (const primo of primi) {
    if (storici.has(primo.blocco)) continue;
    const s = storicoDagliEventi(primo.blocco, primo.sorgente, validi);
    if (!s) continue;
    storici.set(primo.blocco, s);
    if (s.voci.length > 1 || versioneCorrente(s).versione > 1) correnti[primo.blocco] = versioneCorrente(s).sorgente;
  }
  return { prossimo: massimo + 1, storici, correnti, primeDaiMessaggi };
}

/**
 * G-B3 (06/11/2026): the version events of a branch, the branch's own first, then each source's ONLY up to the fork point — the
 * `RunStarted` whose `runId` is the `forkPrimaDelGiro` of the conversation below it (the cut of `puntoDelRamo`). A source forked with
 * no cut (or a cut not found) gives all its events, as before.
 * @param {{ eventi?: object[], forkPrimaDelGiro?: string|null }[]} catena the branch first, then its source, then the source's source
 * @returns {object[]} the `value` of the version events
 */
export function eventiDelRamo(catena = []) {
  const lista = Array.isArray(catena) ? catena : [];
  const fuori = [];
  for (let i = 0; i < lista.length; i += 1) {
    let eventi = Array.isArray(lista[i]?.eventi) ? lista[i].eventi : [];
    const taglio = i > 0 ? lista[i - 1]?.forkPrimaDelGiro : null;
    if (typeof taglio === 'string' && taglio) {
      const dove = eventi.findIndex((e) => e?.type === 'RunStarted' && e.runId === taglio);
      if (dove >= 0) eventi = eventi.slice(0, dove);
    }
    for (const e of eventi) if (e?.type === 'CUSTOM' && e.name === EVENTO_VERSIONE_DEL_BLOCCO && e.value) fuori.push(e.value);
  }
  return fuori;
}
