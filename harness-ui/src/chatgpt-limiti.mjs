/**
 * «Continue with ChatGPT» — i limiti d'uso del piano, letti dalle intestazioni delle risposte.
 *
 * Owner 12/10/2026: il giro si era fermato per il limite OGNI 5 ORE (0% disponibile) e l'avviso non diceva quale limite fosse né
 * quando tornasse; lui guardava il settimanale all'80% e non capiva lo stop. Decisione: «come Codex».
 *
 * Codex li legge così (`codex-rs/codex-api/src/rate_limits.rs`, clone `TALOS-RICERCHE/concorrenti/codex-2026-09-24`):
 *   `x-codex-primary-used-percent`, `x-codex-primary-window-minutes`, `x-codex-primary-reset-at` (secondi dall'epoca), e gli stessi
 *   tre con `secondary`. Una finestra esiste solo se c'è la percentuale; con percentuale 0, nessuna durata e nessun ripristino non
 *   dice niente e si scarta (`parse_rate_limit_window`, `:195-217`). `x-codex-rate-limit-reached-type` dice quale limite è scattato.
 *
 * ⛔ Che la strada del piano di TALOS mandi queste intestazioni NON è ancora misurato: qui si legge ciò che arriva, e quando non
 *   arriva niente il risultato è `null` — mai un limite inventato. `nomiVisti` serve proprio alla misura: i NOMI delle intestazioni
 *   `x-codex-*` arrivate (mai i valori di altro), da mettere nel registro.
 */

const PREFISSO = 'x-codex';

function leggi(intestazioni, nome) {
  if (!intestazioni) return null;
  const valore = typeof intestazioni.get === 'function' ? intestazioni.get(nome) : intestazioni[nome] ?? intestazioni[nome.toLowerCase()];
  return typeof valore === 'string' && valore.trim() !== '' ? valore.trim() : null;
}
const numero = (testo) => { if (testo === null) return null; const n = Number(testo); return Number.isFinite(n) ? n : null; };

function finestra(intestazioni, quale) {
  const usato = numero(leggi(intestazioni, `${PREFISSO}-${quale}-used-percent`));
  if (usato === null) return null;
  const minuti = numero(leggi(intestazioni, `${PREFISSO}-${quale}-window-minutes`));
  const tornaAlleSecondi = numero(leggi(intestazioni, `${PREFISSO}-${quale}-reset-at`));
  const haDati = usato !== 0 || (minuti !== null && minuti !== 0) || tornaAlleSecondi !== null;
  if (!haDati) return null;
  return {
    usatoPercento: Math.min(100, Math.max(0, usato)),
    finestraMinuti: minuti !== null && minuti > 0 ? Math.round(minuti) : null,
    tornaAlle: tornaAlleSecondi !== null && tornaAlleSecondi > 0 ? Math.round(tornaAlleSecondi * 1000) : null,
  };
}

/** I nomi delle intestazioni `x-codex-*` presenti, in ordine: è la misura di che cosa manda davvero il servizio. */
export function nomiVisti(intestazioni) {
  const nomi = [];
  if (!intestazioni) return nomi;
  if (typeof intestazioni.forEach === 'function') intestazioni.forEach((_valore, nome) => { nomi.push(String(nome).toLowerCase()); });
  else for (const nome of Object.keys(intestazioni)) nomi.push(nome.toLowerCase());
  return nomi.filter((nome) => nome.startsWith(`${PREFISSO}-`)).sort();
}

/**
 * I due limiti del piano come li dichiara il servizio, o `null` se le intestazioni non ne parlano.
 * @param {Headers|Record<string,string>|null} intestazioni
 * @returns {{ primario: object|null, secondario: object|null, scattato: string|null }|null}
 */
export function leggiLimitiDelPiano(intestazioni) {
  const primario = finestra(intestazioni, 'primary');
  const secondario = finestra(intestazioni, 'secondary');
  if (!primario && !secondario) return null;
  return { primario, secondario, scattato: leggi(intestazioni, `${PREFISSO}-rate-limit-reached-type`) };
}

/**
 * Quale limite è finito, per l'avviso: la finestra arrivata al 100% (se tutte e due, quella che torna più TARDI: finché non torna
 * lei non si lavora). `null` se nessuna è al 100%: allora non si sa, e non si dice.
 * @returns {{ quale: 'primario'|'secondario', finestraMinuti: number|null, tornaAlle: number|null }|null}
 */
export function limiteFinito(limiti) {
  if (!limiti) return null;
  const finite = [['primario', limiti.primario], ['secondario', limiti.secondario]]
    .filter(([, f]) => f && f.usatoPercento >= 100)
    .map(([quale, f]) => ({ quale, finestraMinuti: f.finestraMinuti, tornaAlle: f.tornaAlle }));
  if (finite.length === 0) return null;
  return finite.sort((a, b) => (b.tornaAlle ?? 0) - (a.tornaAlle ?? 0))[0];
}

/** Quanto aspettare fino al ripristino del limite finito (ms, almeno 1 s), o `null` se il servizio non lo dichiara. */
export function attesaFinoAlRipristino(limiti, adesso = Date.now()) {
  const finito = limiteFinito(limiti);
  if (!finito || finito.tornaAlle === null) return null;
  return Math.max(1000, finito.tornaAlle - adesso);
}
