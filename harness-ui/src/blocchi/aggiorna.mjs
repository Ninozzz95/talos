/*
 * Scene 1+4 (FE-081, group G-B, 05/11/2026): the `blocco_aggiorna` tool. The model changes a live block of this chat by its name; TALOS
 * keeps the versions (`versioni.mjs`). Shape: `FORMA-BLOCCO-AGGIORNA-E-RISCRITTURA-2026-11-05.md` §2 (schema verbatim, 146 tokens).
 *
 * - Exactly one of `sorgente` (the whole new source) or `modifiche` (exact replacements).
 * - Replacements go in order, each on the text left by the ones before, and each `vecchio` must appear EXACTLY once there. The same rule
 *   as the edit tools of the competitors, read in their code: Anthropic's reference editor counts the occurrences and refuses 0 and >1
 *   (`anthropic-quickstarts/computer-use-demo/computer_use_demo/tools/edit.py:167-181`), Hermes' `patch_replace` wants `old_string`
 *   unique (`hermes-agent/tools/file_operations.py:1625-1628`), and Codex applies the chunks of a patch in order from the point the
 *   previous one left (`codex-rs/apply-patch/src/file_update.rs:60-90`, `line_index`). TALOS adds no fuzzy match: a block is short.
 * - The new source goes through the same reader as every block; a broken one keeps the reader's code.
 * - The model gets ONE line: `{ok:true, blocco, versione, tipo}` or `{ok:false, codice, riga}`. Malformed input is a validation fault,
 *   never a TypeError (the `fromJson` of the shape).
 */
import { CODICI_DEL_ROTTO, Rotto } from './catalogo.mjs';
import { impronta } from './impronta.mjs';
import { leggi } from './lettore.mjs';
import { sorgenteDelBlocco } from './recinto.mjs';
import { aggiungiVersione, creaStorico, eventoDellaVersione, versioneCorrente } from './versioni.mjs';

export const NOME_BLOCCO_AGGIORNA = 'blocco_aggiorna';

export const ATTREZZO_BLOCCO_AGGIORNA = Object.freeze({
  name: NOME_BLOCCO_AGGIORNA,
  description: 'Change a live block shown in this chat (versions are kept). Give the whole new source in `sorgente`, or exact replacements in `modifiche`.',
  input_schema: {
    type: 'object',
    properties: {
      blocco: { type: 'string', description: 'block name (nome=bN)' },
      sorgente: { type: 'string' },
      modifiche: {
        type: 'array',
        description: 'each `vecchio` must appear exactly once',
        items: { type: 'object', properties: { vecchio: { type: 'string' }, nuovo: { type: 'string' } }, required: ['vecchio', 'nuovo'] },
      },
    },
    required: ['blocco'],
  },
});

export const CODICI_DI_BLOCCO_AGGIORNA = Object.freeze([...CODICI_DEL_ROTTO, 'bloccoSconosciuto', 'nessunaModifica', 'modificaAmbigua']);

const RIGHE = Object.freeze({
  bloccoSconosciuto: (campo) => `no live block named ${campo || '(empty)'} in this chat`,
  nessunaModifica: (campo) => (campo ? `${campo} was not found in the current source` : 'the new source is the same block'),
  modificaAmbigua: (campo) => `${campo} appears more than once: add context so it appears exactly once`,
});
const LUNGHEZZA_RIGA = 160;
const taglia = (s) => (s.length > LUNGHEZZA_RIGA ? `${s.slice(0, LUNGHEZZA_RIGA - 1)}…` : s);
const breve = (s) => JSON.stringify(String(s).length > 40 ? `${String(s).slice(0, 39)}…` : String(s));

/* a fault with its line for the model */
function guasto(codice, campo, riga) {
  const r = new Rotto(codice, campo);
  r.riga = taglia(riga ?? RIGHE[codice]?.(campo) ?? (campo ? `${codice} at ${campo}` : codice));
  return r;
}

const eOggetto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The tool input, checked. An object, or the JSON text of one; unknown keys are ignored.
 * @returns {{ blocco: string, sorgente?: string, modifiche?: {vecchio: string, nuovo: string}[] } | Rotto}
 */
export function daJson(input) {
  let v = input;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return guasto('sintassi', '', 'the input is not valid JSON'); }
  }
  if (!eOggetto(v)) return guasto('valoreNonValido', '', 'the input must be an object with `blocco`');
  if (typeof v.blocco !== 'string' || !v.blocco.trim()) return guasto('campoMancante', 'blocco', '`blocco` is required: the name in nome=bN');
  const conSorgente = v.sorgente !== undefined;
  const conModifiche = v.modifiche !== undefined;
  if (conSorgente === conModifiche) return guasto('valoreNonValido', 'sorgente', 'give exactly one of `sorgente` or `modifiche`');
  if (conSorgente) {
    if (typeof v.sorgente !== 'string' || !v.sorgente.trim()) return guasto('valoreNonValido', 'sorgente', '`sorgente` must be the whole new source');
    return { blocco: v.blocco.trim(), sorgente: v.sorgente };
  }
  if (!Array.isArray(v.modifiche) || v.modifiche.length === 0) return guasto('valoreNonValido', 'modifiche', '`modifiche` must be a non-empty list');
  const modifiche = [];
  for (const [i, m] of v.modifiche.entries()) {
    if (!eOggetto(m) || typeof m.vecchio !== 'string' || typeof m.nuovo !== 'string' || m.vecchio === '') {
      return guasto('valoreNonValido', `modifiche[${i}]`, `modifiche[${i}] needs a non-empty \`vecchio\` and a \`nuovo\`, both text`);
    }
    modifiche.push({ vecchio: m.vecchio, nuovo: m.nuovo });
  }
  return { blocco: v.blocco.trim(), modifiche };
}

function contaOccorrenze(testo, cerca) {
  let n = 0;
  for (let i = testo.indexOf(cerca); i >= 0 && n < 2; i = testo.indexOf(cerca, i + 1)) n += 1;
  return n;
}

/**
 * Applies a `blocco_aggiorna` call to the history of the named block.
 * @param {object|null} storico the history whose `nome` must be `input.blocco` (null: no such block)
 * @param {unknown} input the tool input
 * @param {{ quando?: string, lingua?: string }} [opzioni]
 * @returns {{ storico: object, voce: object } | Rotto}
 */
export function applicaAggiornamento(storico, input, { quando, lingua } = {}) {
  const richiesta = daJson(input);
  if (richiesta instanceof Rotto) return richiesta;
  const corrente = versioneCorrente(storico);
  if (!corrente || storico.nome !== richiesta.blocco) return guasto('bloccoSconosciuto', richiesta.blocco);
  let testo;
  if (richiesta.sorgente !== undefined) testo = sorgenteDelBlocco(richiesta.sorgente);
  else {
    testo = sorgenteDelBlocco(corrente.sorgente);
    for (const { vecchio, nuovo } of richiesta.modifiche) {
      const n = contaOccorrenze(testo, vecchio);
      if (n === 0) return guasto('nessunaModifica', breve(vecchio));
      if (n > 1) return guasto('modificaAmbigua', breve(vecchio));
      const i = testo.indexOf(vecchio);
      testo = testo.slice(0, i) + nuovo + testo.slice(i + vecchio.length);
    }
  }
  const letto = leggi(testo);
  if (letto.stato !== 'completo') {
    const m = letto.motivo ?? {};
    const codice = CODICI_DEL_ROTTO.includes(m.codice) ? m.codice : 'erroreInterno';
    return guasto(codice, m.campo ?? '', `the new source does not read: ${codice}${m.campo ? ` at ${m.campo}` : ''}${Number.isInteger(m.riga) ? `, line ${m.riga}` : ''}`);
  }
  if (JSON.stringify(letto.blocco) === JSON.stringify(corrente.blocco)) return guasto('nessunaModifica', '');
  const nuovo = aggiungiVersione(storico, letto.blocco, { origine: 'modello', sorgente: testo, quando, lingua });
  return { storico: nuovo, voce: versioneCorrente(nuovo) };
}

/** The one line the model receives for the result of `applicaAggiornamento` (or of the host). */
export function rispostaAlModello(esito) {
  if (esito instanceof Rotto || esito?.ok === false) {
    const codice = CODICI_DI_BLOCCO_AGGIORNA.includes(esito.codice) ? esito.codice : 'erroreInterno';
    return JSON.stringify({ ok: false, codice, riga: taglia(String(esito.riga ?? codice)) });
  }
  const voce = esito?.voce ?? esito;
  const nome = esito?.storico?.nome ?? esito?.blocco;
  return JSON.stringify({ ok: true, blocco: String(nome ?? ''), versione: voce?.versione, tipo: voce?.blocco?.tipo ?? voce?.tipo });
}

/**
 * G-B2 (05/11/2026): the host side of one turn, built from `statoDeiBlocchi` of the conversation. It hands the kernel the counter and the
 * current sources, keeps the histories of this turn (a second update in the same turn starts from the first), and persists every version
 * through `emetti` (a durable `talos.blocco.versione`) BEFORE answering the model: a version the model was told about is on disk.
 * @param {{ stato?: { prossimo: number, storici: Map<string, object>, correnti: Record<string,string>, primeDaiMessaggi?: Map<string,string> }, emetti: (valore: object) => unknown,
 *   conversazione?: string, ora?: () => string, lingua?: string }} opzioni
 */
export function creaOspiteDeiBlocchi({ stato = null, emetti, conversazione = '', ora = () => new Date().toISOString(), lingua } = {}) {
  const storici = new Map(stato?.storici ?? []);
  const evento = (storico, v) => eventoDellaVersione(storico, v, { conversazione });
  return {
    prossimoNomeDeiBlocchi: Number.isInteger(stato?.prossimo) && stato.prossimo > 1 ? stato.prossimo : 1,
    sorgentiCorrentiDeiBlocchi: { ...(stato?.correnti ?? {}) },
    onNomiDeiBlocchi({ nuovi = [] } = {}) {
      for (const { nome, sorgente } of nuovi) {
        if (storici.has(nome)) continue;
        const letto = leggi(String(sorgente ?? ''));
        if (letto.stato !== 'completo') continue;
        const s = creaStorico(letto.blocco, nome, { sorgente, quando: ora() });
        storici.set(nome, s);
        /* G-B3 (UIG-1.19): emitted NOW, not in a microtask — the registry binds it to its message and persists it before the turn's
           terminal event; `impronta` lets the registry and the screen find its fence (an added field, the shape is unchanged) */
        try { Promise.resolve(emetti({ ...evento(s, null), impronta: impronta(String(sorgente ?? '')) })).catch(() => {}); } catch { /* never breaks the turn */ }
      }
    },
    async onAggiornaBlocco(richiesta) {
      esito: {
        /* G-B3: a name kept only in a stored message (no v1 event) starts its history from the fence body there; on reload the same
           body is the v1 again (`statoDeiBlocchi`), so the v2 written now lands on the same base */
        const nome = richiesta?.blocco;
        if (typeof nome !== 'string' || storici.has(nome) || !stato?.primeDaiMessaggi?.has?.(nome)) break esito;
        const sorgente = stato.primeDaiMessaggi.get(nome);
        const letto = leggi(String(sorgente ?? ''));
        if (letto.stato === 'completo') storici.set(nome, creaStorico(letto.blocco, nome, { sorgente }));
      }
      /* G-B4 (UIG-1.20): the number is the server's. A version saved from the screen during this turn (the route) took a number this
         turn's history does not know: re-read the next one from the journal at EACH update, so the model's update goes on past it. Only
         the number moves — the base stays this turn's own history, the one the model was told about. The emit below runs before any
         await, so the route cannot take the same number in between. */
      let base = storici.get(richiesta?.blocco) ?? null;
      let prossima;
      try { prossima = stato?.rileggi?.()?.prossime?.get?.(richiesta?.blocco); } catch { prossima = undefined; }
      if (base && Number.isInteger(prossima) && prossima > base.prossima) base = { ...base, prossima };
      const esito = applicaAggiornamento(base, richiesta, { quando: ora(), lingua });
      if (esito instanceof Rotto) return esito;
      await emetti(evento(esito.storico, esito.voce));
      storici.set(esito.storico.nome, esito.storico);
      return { ok: true, blocco: esito.storico.nome, versione: esito.voce.versione, tipo: esito.voce.blocco.tipo };
    },
  };
}
