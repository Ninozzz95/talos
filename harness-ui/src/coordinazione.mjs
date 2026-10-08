/*
 * ⛔⛔ C2b «Coordinazione» (owner 08/10/2026 sera; contratto `Downloads/handoff-talos-2026-09-27/C2B-CONTRATTO-2026-10-08.md`) —
 *   il modello avvia agenti (deleghe) da solo, oppure chiede prima con una carta. Lo stato vive nelle scelte per attrezzo della
 *   sessione, alla chiave `delega_sottotask`: così la carta, «Per questa sessione», la carta della figlia nel padre e «vince il
 *   Nega» (C2, C2-R7) valgono senza una macchina nuova.
 * ⛔ L'incontro con la catena è DEDICATO, non quello di C2 (`unisciPermessiPerAttrezzo`, `permessi-catena.mjs`): lì un anello
 *   senza la chiave conta quanto concede il suo livello, e «Accesso pieno» concede da solo ogni attrezzo (`CONCESSI_DA_SOLO`) —
 *   Coordinazione risulterebbe accesa senza che nessuno l'abbia scelta. Qui un anello senza la chiave è NEUTRO (eredita), e la
 *   RADICE senza la chiave è spenta: di serie, anche per le sessioni di prima (owner, quarta tornata).
 * Precedenti letti nel codice l'08/10/2026: DeepSeek Harness fotografa la politica del padre alla delega
 *   (`packages/subagent/subagent/src/child-agent.ts:230-275`); Claude Code eredita il modo del padre per i sotto-agenti
 *   (code.claude.com/docs/en/sub-agents, `permissionMode`). Qui l'incontro è VIVO: spegnere sulla radice spegne l'albero.
 */

/** La chiave delle scelte per attrezzo che porta lo stato di Coordinazione. */
export const CHIAVE_COORDINAZIONE = 'delega_sottotask';

/** Agenti avviati DA SOLI per albero (radice, figlie, nipoti): owner 08/10/2026, il doppio del massimo misurato (9) sulle
 *  43 sessioni della CLI, e il valore di serie di Claude Agent SDK. Oltre, ricompare la carta. */
export const TETTO_AVVII_DA_SOLO = 20;

const VALORI = new Set(['sempre', 'chiedi', 'nega']);

/** La scelta di un anello per Coordinazione: `undefined` se non c'è, `'nega'` se c'è ma è storta (come la fusione di C2). */
function sceltaDellAnello(scelte) {
  if (!scelte || typeof scelte !== 'object' || Array.isArray(scelte) || !Object.hasOwn(scelte, CHIAVE_COORDINAZIONE)) return undefined;
  const valore = scelte[CHIAVE_COORDINAZIONE];
  return VALORI.has(valore) ? valore : 'nega';
}

/**
 * Il modo di Coordinazione per una sessione.
 * @param {Array<Record<string,string>|null|undefined>|undefined} sceltePerAnello le scelte per attrezzo dalla sessione (prima)
 *   fino alla radice (ultima)
 * @param {{ avviiDaSolo?: number, tetto?: number }} [opzioni] gli avvii da soli già fatti nell'albero
 * @returns {{ modo: 'sempre' } | { modo: 'chiedi', motivo: 'spenta'|'tetto' } | { modo: 'nega' }}
 */
export function modoCoordinazione(sceltePerAnello, { avviiDaSolo = 0, tetto = TETTO_AVVII_DA_SOLO } = {}) {
  const anelli = Array.isArray(sceltePerAnello) ? sceltePerAnello : [];
  const scelte = anelli.map(sceltaDellAnello);
  if (scelte.includes('nega')) return { modo: 'nega' };
  const radice = scelte.length > 0 ? scelte[scelte.length - 1] : undefined;
  if (scelte.includes('chiedi') || radice !== 'sempre') return { modo: 'chiedi', motivo: 'spenta' };
  if (avviiDaSolo >= tetto) return { modo: 'chiedi', motivo: 'tetto' };
  return { modo: 'sempre' };
}

/**
 * Se un «sempre» scritto sulla PRIMA sessione della catena (dalla carta, «Per questa sessione») verrebbe onorato. Serve a non
 * offrire un pulsante che non può fare la sua cosa (F15): sulla carta di una figlia con la radice spenta il sì non varrebbe.
 * ⛔ Un «nega» della sessione stessa non si scavalca dalla carta (C2-R7, «vince il Nega»).
 */
export function sempreDellaFigliaVarrebbe(sceltePerAnello) {
  const anelli = Array.isArray(sceltePerAnello) ? sceltePerAnello : [];
  if (anelli.length === 0) return false;
  if (sceltaDellAnello(anelli[0]) === 'nega') return false;
  const [, ...antenati] = anelli;
  return modoCoordinazione([{ [CHIAVE_COORDINAZIONE]: 'sempre' }, ...antenati]).modo === 'sempre';
}
