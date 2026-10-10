/*
 * C1 (owner 10/10/2026, decisioni sulle schede): L'ULTIMA RICHIESTA SPEDITA AL MODELLO e la sua RIPARTIZIONE per categoria.
 *
 * Due decisioni dell'owner, entrambe «Recommended»:
 *  · «Misura lato server come Hermes» — la barra della scheda Contesto (sistema, regole del progetto, memoria, attrezzi, MCP,
 *    conversazione) viene dalla richiesta VERA, non da un campo che nessuno scriveva (`state.realSession.ripartizioneContesto`
 *    era letto in `app.js` e mai scritto dal 06/09). Come Hermes `agent/context_breakdown.py:143-210` (clone 865ba906): ogni
 *    categoria è una STIMA del suo testo, l'occupazione totale resta quella misurata dal fornitore (`prompt_tokens`); una
 *    categoria a zero si nasconde, TRANNE la conversazione («zero è una misura, non un'assenza», `:19-34`).
 *  · «L'ultima richiesta, tenuta in memoria» — per «prompt di sistema e messaggi grezzi» (come OpenCode
 *    `session-context-tab.tsx:351-369`). Mai su disco; le immagini non si copiano (un segnaposto con il tipo).
 *
 * I marcatori sono quelli che il prodotto scrive davvero:
 *  · istruzioni di progetto: `istruzioni-di-progetto.mjs:202` «Project instructions — written by the team…»;
 *  · memoria: `memorie-nel-prompt.mjs:42` «MEMORY — what the person asked TALOS to remember…», un messaggio di sistema suo
 *    (`talosHarness.mjs:11846-11847`);
 *  · attrezzi MCP: il nome `mcp__<server>__<attrezzo>` (`mcp-session.mjs:20`).
 * La stima è byte/3,5: la stessa euristica del motore del contesto (`context-engine/src/engine.mjs`, `fullBytes / 3.5`).
 */

export const CATEGORIE_RICHIESTA = Object.freeze(['system', 'rules', 'memory', 'tools', 'mcp', 'conversation']);
export const MARCATORE_ISTRUZIONI = 'Project instructions — written by the team';
export const MARCATORE_MEMORIA = 'MEMORY — what the person asked TALOS to remember';
const SEMPRE = new Set(['conversation']);

const stima = (testo) => (testo ? Math.ceil(Buffer.byteLength(testo, 'utf8') / 3.5) : 0);
const testoDelContenuto = (contenuto) => {
  if (typeof contenuto === 'string') return contenuto;
  if (!Array.isArray(contenuto)) return '';
  return contenuto.map((parte) => (typeof parte === 'string' ? parte : typeof parte?.text === 'string' ? parte.text : '')).join('\n');
};

/** Un messaggio di sistema diviso nelle sue parti: istruzioni di progetto e memoria hanno un marcatore, il resto è sistema. */
function partiDiSistema(testo) {
  const parti = { system: 0, rules: 0, memory: 0 };
  const tagli = [[MARCATORE_ISTRUZIONI, 'rules'], [MARCATORE_MEMORIA, 'memory']]
    .map(([m, id]) => ({ at: testo.indexOf(m), id })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at);
  let da = 0; let id = 'system';
  for (const taglio of tagli) { parti[id] += stima(testo.slice(da, taglio.at)); da = taglio.at; id = taglio.id; }
  parti[id] += stima(testo.slice(da));
  return parti;
}

/**
 * La ripartizione della richiesta spedita: `{ categorie: [{ id, tokens }], stimata: true, messaggi, attrezzi }`.
 * @param {{ messages?: object[], tools?: object[] }} richiesta il corpo che parte verso il fornitore
 */
export function ripartizioneDellaRichiesta({ messages = [], tools = [] } = {}) {
  const tot = Object.fromEntries(CATEGORIE_RICHIESTA.map((id) => [id, 0]));
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || typeof m !== 'object') continue;
    if (m.role === 'system' || m.role === 'developer') {
      const parti = partiDiSistema(testoDelContenuto(m.content));
      for (const [id, n] of Object.entries(parti)) tot[id] += n;
      continue;
    }
    // la conversazione: testo, argomenti delle chiamate, uscite degli attrezzi
    tot.conversation += stima(testoDelContenuto(m.content)) + stima(Array.isArray(m.tool_calls) ? JSON.stringify(m.tool_calls) : '');
  }
  for (const t of Array.isArray(tools) ? tools : []) {
    const nome = String(t?.function?.name ?? t?.name ?? '');
    tot[nome.startsWith('mcp__') ? 'mcp' : 'tools'] += stima(JSON.stringify(t));
  }
  return {
    categorie: CATEGORIE_RICHIESTA.filter((id) => tot[id] > 0 || SEMPRE.has(id)).map((id) => ({ id, tokens: tot[id] })),
    stimata: true,
    messaggi: Array.isArray(messages) ? messages.length : 0,
    attrezzi: Array.isArray(tools) ? tools.length : 0,
  };
}

/** Una copia da tenere in memoria: niente immagini (un segnaposto col tipo), niente riferimenti condivisi col corpo spedito. */
export function copiaDellaRichiesta({ messages = [], tools = [], model = null } = {}) {
  const senzaImmagini = (contenuto) => (Array.isArray(contenuto)
    ? contenuto.map((parte) => (parte && typeof parte === 'object' && parte.type !== 'text' && typeof parte.text !== 'string'
      ? { type: parte.type ?? 'part', omitted: true } : parte))
    : contenuto);
  return {
    model: typeof model === 'string' ? model : null,
    messages: structuredClone((Array.isArray(messages) ? messages : []).map((m) => (m && typeof m === 'object' ? { ...m, content: senzaImmagini(m.content) } : m))),
    tools: structuredClone(Array.isArray(tools) ? tools : []),
  };
}
