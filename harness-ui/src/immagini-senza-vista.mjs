/*
 * WHERE the image is decides what happens to it (Desktop, 01/11/2026: «una chat morta per una foto di un'ora fa è da release»).
 * The phone's rule, owner 27/07 (`mobile/src/lib/chat/chatCompletion.ts:82-107`, `visionFallback.ts:26`): switching a conversation to a
 * model without vision killed every further message, because the guard fired on any image anywhere in the history.
 *   - In the input being sent NOW (everything after the last answer of the model: the person's message, or the results of its tools)
 *     an image is refused before the network: the person attached something this model cannot see.
 *   - Further back the image is dropped with a line in its place: a photo cannot be un-sent, and a model handed a silent hole answers as
 *     though it had seen something.
 * Same line as the phone, so the model reads the same thing on every surface.
 */

export const RIGA_AL_POSTO_DELL_IMMAGINE = '[An image was here. The current model cannot see images, so it was left out.]';

const eImmagine = (parte) => parte?.type === 'image_url';
const haImmagini = (m) => Array.isArray(m?.content) && m.content.some(eImmagine);

/** @returns {{ immagini: boolean, nuove: boolean, messaggi: object[] }} `messaggi` with the old images replaced; the new ones untouched */
export function immaginiPerUnModelloSenzaVista(messaggi) {
  if (!Array.isArray(messaggi)) return { immagini: false, nuove: false, messaggi };
  /* Sixth review, B2: «after the last answer» kept a refused photo «new» forever (the failed message stays in the history with no answer
     after it), so every text-only message after it was refused too. The input sent NOW is: the results of the tools after the last
     answer of the model, or else ONLY the last message of the person. Anything before it is old. */
  /* D7 del Tester (04/11/2026, OK del Desktop): il nucleo accoda alla richiesta note `system` non salvate (Ask, lingua, Piano: `noteInCoda`
     in `talosHarness.mjs`). Non sono l'ingresso della persona: si saltano solo IN CODA, e una nota in mezzo resta un confine. Prima la
     foto appena mandata contava come vecchia, diventava la riga e nessuno la rifiutava. Come Hermes, che decide sull'ingresso del turno
     (`agent/image_routing.py:375-391`), non sull'ultimo messaggio della richiesta. */
  let fine = messaggi.length;
  while (fine > 0 && (messaggi[fine - 1]?.role === 'system' || messaggi[fine - 1]?.role === 'developer')) fine -= 1;
  let inizioNuovo = fine;
  for (let i = fine - 1; i >= 0; i -= 1) {
    const ruolo = messaggi[i]?.role;
    if (ruolo === 'tool') { inizioNuovo = i; continue; }
    if (ruolo === 'user' && inizioNuovo === fine) inizioNuovo = i;
    break;
  }
  const immagini = messaggi.some(haImmagini);
  const nuove = messaggi.slice(inizioNuovo, fine).some(haImmagini);
  if (!immagini) return { immagini, nuove, messaggi };
  /* Revisione D7, R1 (04/11/2026): le note IN CODA non sono l'ingresso della persona, quindi un'immagine dentro una di loro è «vecchia» come
     quelle prima dell'ingresso: diventa la riga invece di partire intatta verso un modello che non vede. */
  const sostituiti = messaggi.map((m, i) => ((i < inizioNuovo || i >= fine) && haImmagini(m)
    ? { ...m, content: m.content.map((p) => (eImmagine(p) ? { type: 'text', text: RIGA_AL_POSTO_DELL_IMMAGINE } : p)) }
    : m));
  return { immagini, nuove, messaggi: sostituiti };
}
