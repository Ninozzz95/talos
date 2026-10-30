/*
 * Il selettore dei modelli ricostruito dal bozzetto approvato dall'owner (29/10/2026, «velocità supersonica»; bozzetto
 *   `bozzetto-modelli/index.html`, pubblicato su claude.ai/artifact/YCCe4Aktz2uVwMgS6d5oJE). Qui le parti PURE: che cosa sa fare un
 *   modello, come si filtra, si ordina e si raggruppa, come si scrivono contesto e prezzo, il nome umano di chi lo fa, e le due
 *   liste della persona (preferiti, ultimi usati). Il montaggio, i cataloghi e la scelta sincronizzata col server restano in
 *   `legacy/app.js` (`creaModelPicker`), che li aveva già e non li perde.
 *
 * ⛔ Le capacità si leggono dai campi VERI del catalogo, mai indovinate dal nome:
 *   · ragiona   = `reasoning.supportedEfforts` non vuoto (OpenRouter) oppure `capacita.reasoning === true` (models.dev, i diretti);
 *   · vede      = `inputModalities` contiene `image`;
 *   · attrezzi  = `supportedParameters` contiene `tools` (OpenRouter) oppure `capacita.toolCall === true` (models.dev);
 *   · gratis    = prezzo d'ingresso E d'uscita DICHIARATI e uguali a zero (un prezzo mancante non è «gratis»);
 *   · contesto  = `contextLength` ≥ 200.000.
 */
import { t } from './lingua.js';

export const FILTRI_CAPACITA = Object.freeze(['ragiona', 'vede', 'attrezzi', 'gratis', 'contesto']);
export const ORDINI = Object.freeze(['autore', 'prezzo', 'contesto', 'nome']);
export const SOGLIA_CONTESTO_GRANDE = 200_000;
export const MASSIMO_RECENTI = 5;
export const MASSIMO_PREFERITI = 50;

/** Un prezzo per token del catalogo (stringa o numero) in dollari per milione, o `null` se non è dichiarato. */
export function prezzoAlMilione(valore) {
  if (valore == null || typeof valore === 'boolean' || typeof valore === 'object' || String(valore).trim() === '') return null;
  const n = Number(valore);
  /* arrotondato al milionesimo di dollaro: 0.0000004 × 1e6 in virgola mobile dà 0.39999999999999997 */
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e12) / 1e6 : null;
}

/** Che cosa sa fare un modello, dai campi del catalogo. */
export function capacitaDelModello(m = {}) {
  const sforzi = m?.reasoning?.supportedEfforts;
  const ingresso = prezzoAlMilione(m?.prezzoPrompt);
  const uscita = prezzoAlMilione(m?.prezzoCompletion);
  return {
    ragiona: (Array.isArray(sforzi) && sforzi.length > 0) || m?.capacita?.reasoning === true,
    vede: Array.isArray(m?.inputModalities) && m.inputModalities.includes('image'),
    attrezzi: (Array.isArray(m?.supportedParameters) && m.supportedParameters.includes('tools')) || m?.capacita?.toolCall === true,
    gratis: ingresso === 0 && uscita === 0,
    contesto: Number.isFinite(m?.contextLength) && m.contextLength >= SOGLIA_CONTESTO_GRANDE,
  };
}

/** Il contesto in breve: `200k`, `1M`, `1.5M`; `—` se non è dichiarato. */
export function formattaContesto(n) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  return `${Math.round(n / 1000)}k`;
}
/** Un prezzo al milione in breve, come nel bozzetto: `0`, `0.035`, `2.50`. */
export function formattaPrezzo(v) {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  return v < 0.1 ? v.toFixed(3) : v.toFixed(2);
}
/** «$in → $out» al milione, o `null` se nessuno dei due è dichiarato. */
export function prezzoInUscita(m = {}) {
  const ingresso = prezzoAlMilione(m?.prezzoPrompt);
  const uscita = prezzoAlMilione(m?.prezzoCompletion);
  if (ingresso === null && uscita === null) return null;
  return { ingresso, uscita, testo: `$${formattaPrezzo(ingresso)} → $${formattaPrezzo(uscita)}` };
}

/* Il nome umano di chi fa il modello: le grafie note, poi le parole con l'iniziale maiuscola (mai la sigla in maiuscolo). */
const AUTORI = Object.freeze({
  'z-ai': 'Z.ai', openai: 'OpenAI', google: 'Google', anthropic: 'Anthropic', 'meta-llama': 'Meta', 'x-ai': 'xAI', mistralai: 'Mistral',
  qwen: 'Qwen', deepseek: 'DeepSeek', moonshotai: 'Moonshot', xiaomi: 'Xiaomi', minimax: 'MiniMax', nvidia: 'NVIDIA', microsoft: 'Microsoft',
  cohere: 'Cohere', amazon: 'Amazon', baidu: 'Baidu', 'arcee-ai': 'Arcee', liquid: 'Liquid', inception: 'Inception', perplexity: 'Perplexity',
  'aion-labs': 'AionLabs', 'anthracite-org': 'Anthracite', ibm: 'IBM', 'ibm-granite': 'IBM Granite', 'nousresearch': 'Nous Research',
  openrouter: 'OpenRouter', tencent: 'Tencent', bytedance: 'ByteDance', 'bytedance-seed': 'ByteDance Seed', stepfun: 'StepFun',
});
export function nomeAutore(slug) {
  const chiave = String(slug ?? '').trim().toLowerCase();
  if (!chiave) return '';
  if (Object.hasOwn(AUTORI, chiave)) return AUTORI[chiave];
  return chiave.split(/[-_\s]+/u).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
}
/** Il nome senza il prefisso «Autore: » che OpenRouter mette davanti (il gruppo lo dice già). */
export function nomeBreve(m = {}) {
  const nome = String(m?.nome || m?.id || '');
  return nome.replace(/^[^:]{1,40}:\s+/u, '') || nome;
}

/** Il modello passa la ricerca (nome, id, autore) e i filtri accesi? */
export function passaFiltri(m, { query = '', filtri = new Set() } = {}) {
  const q = String(query).trim().toLowerCase();
  if (q) {
    const testo = `${m?.nome ?? ''} ${m?.id ?? ''} ${m?.provider ?? ''} ${nomeAutore(m?.provider)}`.toLowerCase();
    if (!testo.includes(q)) return false;
  }
  if (filtri.size) {
    const c = capacitaDelModello(m);
    for (const f of filtri) if (!c[f]) return false;
  }
  return true;
}

/** Ordina una copia: per prezzo (in + out, i non dichiarati in fondo), per contesto (il più grande prima), per nome. */
export function ordinaModelli(modelli, ordine = 'autore') {
  const l = [...modelli];
  if (ordine === 'prezzo') {
    const totale = (m) => { const p = prezzoInUscita(m); return p && p.ingresso !== null && p.uscita !== null ? p.ingresso + p.uscita : Infinity; };
    l.sort((a, b) => totale(a) - totale(b) || nomeBreve(a).localeCompare(nomeBreve(b)));
  } else if (ordine === 'contesto') {
    l.sort((a, b) => (Number(b.contextLength) || 0) - (Number(a.contextLength) || 0) || nomeBreve(a).localeCompare(nomeBreve(b)));
  } else {
    l.sort((a, b) => nomeBreve(a).localeCompare(nomeBreve(b)));
  }
  return l;
}

/** I gruppi per autore, in ordine di nome umano. */
export function gruppiPerAutore(modelli) {
  const mappa = new Map();
  for (const m of modelli) {
    const chiave = m?.provider || '';
    if (!mappa.has(chiave)) mappa.set(chiave, []);
    mappa.get(chiave).push(m);
  }
  return [...mappa.entries()].sort((a, b) => nomeAutore(a[0]).localeCompare(nomeAutore(b[0])));
}

/** La lista degli ultimi usati dopo una scelta: il nuovo in testa, senza doppioni, al più cinque. */
export function aggiornaRecenti(recenti, id, massimo = MASSIMO_RECENTI) {
  if (typeof id !== 'string' || !id) return [...(recenti ?? [])];
  return [id, ...(Array.isArray(recenti) ? recenti : []).filter((x) => x !== id)].slice(0, massimo);
}
/** Una lista di id dalle preferenze, pulita: solo stringhe corte, niente doppioni, al più `massimo`. */
export function normalizzaListaModelli(valore, massimo) {
  if (!Array.isArray(valore)) return [];
  return [...new Set(valore.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 200))].slice(0, massimo);
}

/** Le etichette dei filtri (testo per la persona, mai il nome del campo). */
export function etichettaFiltro(f) {
  return t(`modello.modelPicker.filter.${f}`);
}
