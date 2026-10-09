/**
 * ⭐ 0.1.25 — I FORNITORI A VALLE ESCLUSI DI SERIE su OpenRouter, per modello (owner 08/10/2026 notte e 09/10/2026).
 *
 * Perché esiste: `z-ai/glm-5.3-flash` instradato di serie a OpenInference (fp4) NON chiama gli attrezzi — misurato dalla CLI
 *   l'08/10/2026 su richieste identiche con 56 attrezzi (0/2 fissato, 0/2 libero; Z.AI fp8 3/3, DeepInfra fp4 2/2) e nello
 *   stress test desktop dello stesso giorno (tre risposte vuote, tutte servite da OpenInference). Lo slug è quello che il
 *   prodotto risolve da «via OpenInference» (`/esclusi/dalla-risposta`, decisione 14), verificato dal vivo l'08/10.
 * Decisioni dell'owner: l'esclusione è DI SERIE per quel modello; nelle Impostazioni si vede ed è togliibile; tolta resta
 *   tolta; si SOMMA alla lista della persona. Hermes (`agent/chat_completion_helpers.py:469-487`, clone 65ad529, letto il
 *   09/10) regge l'instradamento per modello solo dalla config della persona e lì il valore per modello SOSTITUISCE il
 *   generale: noi sommiamo, e aggiungiamo il di-serie che Hermes non ha.
 * ⛔ Una tabella sola: la leggono il server (instradamento a ogni richiesta), le rotte (elenco pubblico) e l'attrezzo del modello.
 */
export const ESCLUSI_DI_SERIE = Object.freeze({
  'z-ai/glm-5.3-flash': Object.freeze([
    Object.freeze({ slug: 'open-inference', perche: 'it does not call tools with this model (measured 08/10/2026)' }),
  ]),
});

const FORMA_SLUG = /^[a-z0-9][a-z0-9._-]{0,47}$/u;

/** Il modello senza la variante di OpenRouter (`:nitro`, `:floor`, `:free`…): l'instradamento vale per il modello. */
export function modelloBase(modello) {
  return typeof modello === 'string' ? modello.split(':', 1)[0].trim().toLowerCase() : '';
}

/** La chiave di una voce di serie tolta dalla persona: `<modello>#<slug>`. */
export function chiaveDiSerie(modello, slug) {
  return `${modelloBase(modello)}#${slug}`;
}

/** Le chiavi «tolte» lette dal disco: tollerante (come gli esclusi), tiene solo le voci che esistono nella tabella. */
export function normalizzaTolti(valore) {
  if (!Array.isArray(valore)) return [];
  const valide = new Set(Object.entries(ESCLUSI_DI_SERIE).flatMap(([m, voci]) => voci.map((v) => chiaveDiSerie(m, v.slug))));
  return [...new Set(valore.filter((k) => typeof k === 'string' && valide.has(k)))];
}

/** Gli slug di serie ancora ATTIVI per questo modello (quelli che la persona non ha tolto). */
export function esclusiDiSerieAttivi(modello, tolti = []) {
  const voci = ESCLUSI_DI_SERIE[modelloBase(modello)];
  if (!voci) return [];
  const via = new Set(normalizzaTolti(tolti));
  return voci.filter((v) => FORMA_SLUG.test(v.slug) && !via.has(chiaveDiSerie(modello, v.slug))).map((v) => v.slug);
}

/**
 * L'`openRouterRoutingFn` del server (patch di instradamento della CLI, `runtime-owner-adapter.mjs:unisciInstradamento`): a ogni
 * richiesta, gli esclusi di serie ATTIVI per quel modello, letti dal negozio in quel momento (togliere vale dalla chiamata dopo,
 * senza riavviare). Niente da escludere ⇒ `null`, cioè il corpo di sempre.
 */
export function creaInstradamentoDiSerie(leggiRuntime) {
  return (modello) => {
    let tolti = [];
    try { tolti = leggiRuntime()?.esclusiDiSerieTolti ?? []; } catch { /* negozio illeggibile: valgono i di-serie */ }
    const ignore = esclusiDiSerieAttivi(modello, tolti);
    return ignore.length ? { ignore } : null;
  };
}

/** L'elenco pubblico delle voci di serie, ognuna col suo stato: per le Impostazioni e per l'attrezzo del modello. */
export function vociDiSerie(tolti = []) {
  const via = new Set(normalizzaTolti(tolti));
  return Object.entries(ESCLUSI_DI_SERIE).flatMap(([modello, voci]) =>
    voci.map((v) => ({ modello, slug: v.slug, perche: v.perche, attivo: !via.has(chiaveDiSerie(modello, v.slug)) })));
}
