/*
 * Decisions 198 and 199 (owner 04/11/2026; form `FORMA-RIPRENDI-198-199-2026-11-04.md`, OK from Mobile, CLI and Performance) — IS THERE
 * SOMETHING TO RESUME? One rule, read by the gate of `resume()` and by the rows on the server (`session-registry.mjs`,
 * `cosaCeDaRiprendere`), by the ▶ of the PC on the live events (`legacy/app.js`), and copied by the phone. Its cases are in
 * `contracts/da-riprendere.casi.json`, which the phone copies byte for byte.
 *
 *   'fermata'     — the last turn was stopped (the person's Stop, or the parent on a child);
 *   'errore'      — it ended on an error (provider, network, expired access, full window…);
 *   'giri-finiti' — it ran out of rounds (owner D2 a: the work is half done, resuming is «go on»);
 *   'interrotta'  — a restart cut it off (only from the session row: no event says it);
 *   null          — nothing to resume: running, finished well, paused (it resumes with child_control), refused by the model (it
 *                   would refuse again, like FE-051), or a request that went back to the composer (§4.2 rule N: resuming would
 *                   answer the question BEFORE it).
 *
 * LibreChat keeps «Continue» only on the last answer whose `finish_reason` is not `stop` and while nothing is being sent
 * (`client/src/hooks/useGenerationsByLatest.ts:67-76`): the same idea, on our closing reasons.
 * Per event and O(1) (Performance condition): the server folds it inside the memo of the session (`memoDellaVoce`).
 */

export const MOTIVI_DA_RIPRENDERE = Object.freeze(['fermata', 'errore', 'giri-finiti', 'interrotta']);

/** The model refused: two shapes (after some text, or the whole answer empty); the same rule as `eRifiutoDelModello` in the registry. */
function rifiutoDelModello(evento) {
  const codice = typeof evento?.code === 'string' ? evento.code : null;
  return codice === 'rifiuto-del-modello' || (codice === 'PROVIDER_EMPTY_RESPONSE' && evento?.classe === 'rifiuto-del-modello');
}

/** What a closing `RunError` leaves to resume. */
export function daRiprendereDelTerminale(evento) {
  const codice = typeof evento?.code === 'string' ? evento.code : null;
  if (codice === 'fermato') return 'fermata';
  if (codice === 'giri-esauriti') return 'giri-finiti';
  if (codice === 'in-pausa' || rifiutoDelModello(evento)) return null;
  return 'errore';
}

export const STATO_INIZIALE_DA_RIPRENDERE = Object.freeze({ valore: null, nonInviata: false });

/**
 * One step of the fold. `stato` = { valore, nonInviata }: `nonInviata` remembers, inside the current turn, that its request went back
 * to the composer (`talos.richiesta-non-inviata` comes BEFORE the RunError, agent-service). Every other event leaves it as it is.
 */
export function passoDaRiprendere(stato, evento) {
  const prima = stato ?? STATO_INIZIALE_DA_RIPRENDERE;
  switch (evento?.type) {
    case 'RunStarted': return STATO_INIZIALE_DA_RIPRENDERE;
    case 'RunFinished': return prima.valore === null ? prima : { valore: null, nonInviata: prima.nonInviata };
    case 'RunError': return { valore: prima.nonInviata ? null : daRiprendereDelTerminale(evento), nonInviata: prima.nonInviata };
    case 'CUSTOM': return evento.name === 'talos.richiesta-non-inviata' ? { valore: null, nonInviata: true } : prima;
    default: return prima;
  }
}

/** The value after a whole sequence of events (the cases file, a replay). */
export function daRiprendereDaEventi(eventi) {
  let stato = STATO_INIZIALE_DA_RIPRENDERE;
  for (const evento of Array.isArray(eventi) ? eventi : []) stato = passoDaRiprendere(stato, evento);
  return stato.valore;
}
