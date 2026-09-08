import { ContextEngineError } from './contracts.mjs';

export function validateContextProfile(profile) {
  const { windowTokens, responseReserve, method = 'heuristic' } = profile ?? {};
  if (!Number.isInteger(windowTokens) || windowTokens <= 0 || !Number.isInteger(responseReserve) || responseReserve < 0 || !['runtime', 'provider', 'heuristic'].includes(method)) throw new ContextEngineError('Finestra o riserva del modello non disponibili.', 'CTX_INVALID_PROFILE');
  const safetyMarginTokens = profile.marginTokens ?? Math.max(method === 'heuristic' ? 1024 : 256, Math.ceil(windowTokens * (method === 'heuristic' ? 0.15 : 0.05)));
  if (!Number.isInteger(safetyMarginTokens) || safetyMarginTokens < 0) throw new ContextEngineError('Margine del contesto non valido.', 'CTX_INVALID_PROFILE');
  if (windowTokens - responseReserve - safetyMarginTokens <= 0) throw new ContextEngineError('La riserva della risposta occupa la finestra disponibile.', 'CTX_CONTEXT_TOO_SMALL');
  return { ...profile, windowTokens, responseReserve, method, safetyMarginTokens };
}
