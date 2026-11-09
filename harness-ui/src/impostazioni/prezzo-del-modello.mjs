/*
 * Revisione avversaria della fase 8, REV8-06 (01/11/2026 notte) — IL PREZZO sulla carta di `app_settings` (D4: prima → dopo, dollari per
 *   milione di token). Prima la funzione stava dentro `server.mjs` (non si provava) e controllava solo il prezzo d'ingresso: un modello
 *   col prezzo d'USCITA assente diventava `Number(null) = 0` ⇒ «$0.00» in uscita, cioè «gratis», detto alla persona che decide.
 * ⇒ Un prezzo vale solo se TUTTI E DUE i numeri ci sono, sono finiti e non negativi; altrimenti `null`, e la carta e l'esito dicono
 *   «price unknown». Un valore negativo (un listino «variabile», come quello di un router) è sconosciuto, mai un prezzo.
 */

/** Un numero di prezzo letto dal catalogo (dollari per token): finito e ≥ 0, o `null`. `null`/`''`/assente non diventano mai 0. */
function prezzoValido(grezzo) {
  if (grezzo === null || grezzo === undefined || grezzo === '' || typeof grezzo === 'boolean') return null;
  const n = Number(grezzo);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Dalle capacità di un modello (`readModelCapabilities`: `prezzoPrompt`, `prezzoCompletion`, dollari per token) al prezzo per milione
 * `{ in, out }`, o `null` se anche uno solo dei due manca o non è un prezzo.
 */
export function prezzoPerMilione(capacita) {
  const ingresso = prezzoValido(capacita?.prezzoPrompt);
  const uscita = prezzoValido(capacita?.prezzoCompletion);
  return ingresso === null || uscita === null ? null : { in: ingresso * 1e6, out: uscita * 1e6 };
}
