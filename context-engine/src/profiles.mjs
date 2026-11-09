import { ContextEngineError } from './contracts.mjs';

/*
 * 174 (04/11/2026, forma C, OK di Performance, CLI e Mobile): il margine copre l'errore della STIMA, quindi quando la misura porta
 *   un'àncora del fornitore (`anchorTokens`, esatti) e la parte stimata dopo di lei (`estimatedDeltaTokens`) si misura sulla sola
 *   parte stimata: max(5% della finestra, 15% della parte stimata). Senza àncora resta come prima: 15% della finestra per una stima,
 *   5% per un conteggio. Prima una misura ancorata + 2k stimati prendeva il 15% di tutta la finestra e la soglia saltava
 *   165.999 ↔ 145.999 su una finestra di 266.667. Hermes ancora allo stesso modo (`agent/usage_anchor.py:108-120`) e la sua soglia
 *   non dipende dal metodo (`agent/context_compressor.py:2778-2790`).
 */
const ancorata = (profile) => Number.isSafeInteger(profile.anchorTokens) && profile.anchorTokens > 0 && Number.isSafeInteger(profile.estimatedDeltaTokens) && profile.estimatedDeltaTokens >= 0;

export function validateContextProfile(profile) {
  const { windowTokens, responseReserve, method = 'heuristic' } = profile ?? {};
  if (!Number.isInteger(windowTokens) || windowTokens <= 0 || !Number.isInteger(responseReserve) || responseReserve < 0 || !['runtime', 'provider', 'heuristic'].includes(method)) throw new ContextEngineError('Finestra o riserva del modello non disponibili.', 'CTX_INVALID_PROFILE');
  const safetyMarginTokens = profile.marginTokens ?? (ancorata(profile)
    ? Math.max(256, Math.ceil(windowTokens * 0.05), Math.ceil(profile.estimatedDeltaTokens * 0.15))
    : Math.max(method === 'heuristic' ? 1024 : 256, Math.ceil(windowTokens * (method === 'heuristic' ? 0.15 : 0.05))));
  if (!Number.isInteger(safetyMarginTokens) || safetyMarginTokens < 0) throw new ContextEngineError('Margine del contesto non valido.', 'CTX_INVALID_PROFILE');
  if (windowTokens - responseReserve - safetyMarginTokens <= 0) throw new ContextEngineError('La riserva della risposta occupa la finestra disponibile.', 'CTX_CONTEXT_TOO_SMALL');
  return { ...profile, windowTokens, responseReserve, method, safetyMarginTokens };
}
