/**
 * La traduzione fra il gesto della VISTA e il gesto che capisce il SERVER.
 *
 * ⛔⛔⛔ 07/09/2026 — owner: «qualcosa mi dice che non hai provato dal vivo in tutte le sue
 *   sfaccettature il browser nella app finale». Aveva ragione, e la prova C25 sul 4174 lo ha
 *   dimostrato in tre righe rosse: la rotella non muoveva la pagina, il clic non arrivava, i tasti
 *   nemmeno. Non era un difetto di rete né di CDP: i due moduli parlavano DUE LINGUE DIVERSE.
 *
 *   La vista (`components/browser-vivo.js`) produce:
 *     { tipo: 'giu' | 'su' | 'muovi' | 'rotella' | 'tastoGiu' | 'tastoSu',
 *       x, y, pulsante: 'sinistro', clic: 1, tasti: {alt, ctrl, meta, shift},
 *       deltaX, deltaY, tasto: 'a', testo: 'a' }
 *
 *   Il server (`src/browser-stream.mjs`) si aspetta:
 *     { tipo: 'clic' | 'tasto' | 'rotella',
 *       x, y, tasto: 'sinistro', doppio: false, modificatori, chiave, testo, dx, dy }
 *
 *   Nomi diversi per le stesse cose (`pulsante`/`tasto`, `deltaX`/`dx`, `tasto`/`chiave`), e tipi
 *   che non esistono dall'altra parte. Ogni gesto partiva, il server rispondeva «gesto non
 *   riconosciuto», e a schermo non succedeva NIENTE — senza un errore visibile da nessuna parte.
 *
 * ⇒ La traduzione sta QUI, in un posto solo e provata, invece che sparsa in un `onGesto` dentro la
 *   regia: due moduli scritti separatamente si incontrano in un punto, e quel punto si prova.
 *
 * ⛔ Due asimmetrie volute, non dimenticanze:
 *   · un clic è UNA coppia premuto+rilasciato, e la manda già il server (`mandaClic`). La vista
 *     manda due eventi (giù e su): si traduce SOLO il rilascio, o ogni clic diventerebbe doppio.
 *   · un tasto vero è keyDown + char + keyUp, e li manda già il server: si traduce solo `tastoGiu`.
 */

/** I gesti che non hanno un corrispondente lato server: si lasciano cadere, dichiarandolo. */
export const GESTI_IGNORATI = Object.freeze(['giu', 'muovi', 'tastoSu']);

/**
 * @param {object} gesto quello che produce `gestoDaEvento` nella vista
 * @returns {object|null} il gesto per il server, o null se non c'è niente da mandare
 */
export function gestoPerIlServer(gesto) {
  if (!gesto || typeof gesto !== 'object') return null;
  const tipo = gesto.tipo;
  if (GESTI_IGNORATI.includes(tipo)) return null;

  if (tipo === 'su') {
    // ⛔ fuori dai bordi non si clicca: `dentro` è già calcolato dalla vista sui metadati del frame
    if (gesto.dentro === false) return null;
    return {
      tipo: 'clic',
      x: Number(gesto.x) || 0,
      y: Number(gesto.y) || 0,
      tasto: gesto.pulsante || 'sinistro',
      doppio: Number(gesto.clic) >= 2,
      modificatori: gesto.tasti || 0,
    };
  }

  if (tipo === 'rotella') {
    return {
      tipo: 'rotella',
      x: Number(gesto.x) || 0,
      y: Number(gesto.y) || 0,
      dx: Number(gesto.deltaX) || 0,
      dy: Number(gesto.deltaY) || 0,
      modificatori: gesto.tasti || 0,
    };
  }

  if (tipo === 'tastoGiu') {
    const chiave = gesto.tasto;
    if (!chiave) return null;
    return {
      tipo: 'tasto',
      chiave,
      testo: typeof gesto.testo === 'string' ? gesto.testo : '',
      modificatori: gesto.tasti || 0,
    };
  }

  return null; // un tipo che non conosciamo non si inventa: meglio niente che un gesto sbagliato
}
