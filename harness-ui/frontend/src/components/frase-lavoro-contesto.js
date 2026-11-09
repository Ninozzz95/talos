/*
 * The sentence of a compaction job that did not finish (Context Manager, forma FRASI-LAVORI-CONTESTO 01/11/2026, parole riviste dal Frontend).
 * Il messaggio del motore nasce in inglese tecnico e la modale lo scriveva così com'era: qui la frase si sceglie dal CODICE, e il testo del
 * motore resta nel dettaglio chiuso. `erroreInUnaRiga` non serve: parla del giro, e un `/compact` a mano non è un giro.
 * Stesse parole sul telefono (lettore del Mobile, COD-229) e nella CLI (`src/i18n/en/errors.ts`): i testi restano separati.
 *
 * `scegli`: il rimedio è un'azione, il tasto «Scegli un altro» di FE-053. `riprova` è testo perché il tasto «Compatta ora» è già lì.
 */
import { t } from './lingua.js';

const FALLITI = Object.freeze({
  CTX_COMPACTION_TIMEOUT: { frase: 'timeout', riprova: true, scegli: true },
  CTX_SUMMARY_REFUSED: { frase: 'refused', scegli: true },
  CTX_EMPTY_SUMMARY: { frase: 'empty', riprova: true, scegli: true },
  CTX_INVALID_SUMMARY: { frase: 'unreadable', riprova: true, scegli: true },
  CTX_SUMMARY_RESPONSE_INVALID: { frase: 'unreadable', riprova: true, scegli: true },
  CTX_INVALID_SOURCE: { frase: 'sources', riprova: true, scegli: true },
  CTX_TRUNCATED_SUMMARY: { frase: 'truncated', riprova: true, scegli: true },
  CTX_PROVIDER_CONTEXT_INVALID: { frase: 'provider', scegli: true },
  CTX_MODEL_INVALID: { frase: 'modelMissing', scegli: true },
  CTX_HISTORY_DIVERGED: { frase: 'changed', riprova: true },
  CTX_STALE_REVISION: { frase: 'changed', riprova: true },
  CTX_PERSISTENCE_FAILED: { frase: 'notSaved', disco: true },
  CTX_SUMMARY_MODEL_UNAVAILABLE: { frase: 'modelMissing', scegli: true },
  CTX_CONTEXT_TOO_SMALL: { frase: 'tooSmall', scegli: true },
  CTX_SEGMENT_TOO_LARGE: { frase: 'tooSmall', scegli: true },
  CTX_SUMMARY_TOOLS: { frase: 'usedTools', scegli: true },
  CTX_COMPACTION_FAILED: { frase: 'failed', riprova: true },
});
/* `CTX_JOB_INTERRUPTED` vive solo in pausa (`engine.mjs:453`): accanto c'è «Riprendi», e «Compatta ora» butterebbe i pezzi già pagati */
const IN_PAUSA = Object.freeze({ CTX_PENDING_TOOLS: 'pausedTools', CTX_RESOURCE_BUSY: 'pausedBusy', CTX_USAGE_DENIED: 'pausedUsage', CTX_JOB_INTERRUPTED: 'pausedInterrupted' });
/* Frontend 01/11/2026: una pausa che aspetta qualcosa è una riga in corso, animata e coi secondi. Il limite di consumo e l'interruzione aspettano la persona: restano fermi */
const IN_ATTESA = new Set(['CTX_PENDING_TOOLS', 'CTX_RESOURCE_BUSY']);
/* Non sono guasti: la conversazione non ha niente da temere, e dirlo farebbe pensare il contrario */
const SENZA_GUASTO = Object.freeze({ CTX_NOTHING_TO_COMPACT: 'chat.context.jobError.nothing', CTX_NO_REDUCTION: 'chat.context.job.freedNothing' });

const dettaglioDi = ({ code, message }) => [code, message].filter((x) => typeof x === 'string' && x.trim()).join(': ') || null;

/** `{ testo, dettaglio, scegli }` per un lavoro con un errore da dire; `null` se non c'è niente da dire (annullato dalla persona, nessun errore). */
export function fraseDelLavoro(job, { traduci = t } = {}) {
  const errore = job?.error;
  if (!errore || job.state === 'cancelled' || errore.code === 'CTX_JOB_CANCELLED') return null;
  const dettaglio = dettaglioDi(errore);
  if (IN_PAUSA[errore.code]) return { testo: traduci(`chat.context.jobError.${IN_PAUSA[errore.code]}`), dettaglio, scegli: false, attesa: IN_ATTESA.has(errore.code) };
  if (SENZA_GUASTO[errore.code]) return { testo: traduci(SENZA_GUASTO[errore.code]), dettaglio, scegli: false };
  const voce = FALLITI[errore.code] ?? FALLITI.CTX_COMPACTION_FAILED;
  const pezzi = [traduci(`chat.context.jobError.${voce.frase}`), traduci('chat.context.jobError.intact')];
  if (voce.riprova) pezzi.push(traduci('chat.context.jobError.retry'));
  if (voce.disco) pezzi.push(traduci('chat.context.jobError.disk'));
  return { testo: pezzi.join(' '), dettaglio, scegli: voce.scegli === true };
}
