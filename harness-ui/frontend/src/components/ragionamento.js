/*
 * ⛔⛔ IL RAGIONAMENTO SI COMPRIME, NON SPARISCE — le parole della sua riga, in un posto solo.
 *
 * Decisione dell'owner, 13/09/2026 sera, dopo una ricerca chiesta da lui:
 *   · Hermes desktop (`apps/desktop/src/components/assistant-ui/thread/message-parts.tsx`, letto nel
 *     clone): il ragionamento non si nasconde mai. È una riga apribile che dice «Thinking…» mentre
 *     scrive e poi «Thought for 12s» / «Thought briefly» / «Thought» — «a turn that ended must not go
 *     on saying Thinking». La preferenza è «Collapse thinking by default», spenta di serie. Un
 *     ragionamento senza testo non ha riga: «an empty header is never wanted».
 *   · assistant-ui (https://www.assistant-ui.com/docs/ui/reasoning): «a plain collapsed row once the
 *     model moves on», etichetta «Reasoning (12s)».
 *   · AI SDK Elements (https://elements.ai-sdk.dev/components/reasoning): aperto mentre scrive, chiuso
 *     quando ha finito.
 *   · NN/g, Nielsen, «Progressive Disclosure» (3/12/2006): il secondario si rimanda, ma «it must be
 *     obvious how users progress» — deve restare trovabile.
 *
 * Prima TALOS faceva il contrario: «Mostra ragionamento» spento voleva dire `hidden`, invisibile e
 * irraggiungibile, e un turno il cui unico contenuto era un ragionamento restava con la sola
 * intestazione. Valore di serie scelto dall'owner: SEMPRE COMPRESSO (l'interruttore resta spento).
 *
 * ⛔ Gli eventi del ragionamento non portano un orario: zero su 105.853 nello store (13/09). La durata
 *   si misura solo dal vivo; in una rigiocata tutto accade in pochi millisecondi, e senza questa
 *   distinzione ogni ragionamento direbbe «Ha ragionato poco». Lì si dice solo «Ha ragionato».
 */

/** Il nome dell'interruttore: non più «mostra/nascondi», ma se aprirlo mentre il modello scrive. */
export const ETICHETTA_INTERRUTTORE_RAGIONAMENTO = 'Apri il ragionamento mentre scrive';

/**
 * Una durata in parole brevi: «12 s», «1 min 5 s», «2 min».
 * @param {number} secondi
 * @returns {string}
 */
export function formattaDurataRagionamento(secondi) {
  const totale = Math.max(0, Math.round(Number(secondi) || 0));
  if (totale < 60) return `${totale} s`;
  const minuti = Math.floor(totale / 60);
  const resto = totale % 60;
  return resto ? `${minuti} min ${resto} s` : `${minuti} min`;
}

/**
 * L'etichetta della riga del ragionamento.
 *
 * ⛔ Tre modi per un ragionamento FINITO di raccontarsi, come in Hermes: con una durata misurata la
 *   dice; sotto il secondo non scrive «0 s» (esatto e inutile) ma «poco»; senza durata — una
 *   rigiocata — dice solo che è successo. E un ragionamento finito non dice mai «Sta ragionando».
 * @param {{inCorso?:boolean, secondi?:number|null}} stato
 * @returns {string}
 */
export function etichettaRagionamento({ inCorso = false, secondi = null } = {}) {
  if (inCorso) return 'Sta ragionando…';
  if (secondi === null || secondi === undefined || !Number.isFinite(Number(secondi))) return 'Ha ragionato';
  if (Number(secondi) < 1) return 'Ha ragionato poco';
  return `Ha ragionato per ${formattaDurataRagionamento(secondi)}`;
}
