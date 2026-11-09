/*
 * ⭐ RICERCA APPROFONDITA A DUE PORTE — il campo del server (owner 22/10/2026, bozzetto approvato; forma
 *   `FORMA-RICERCA-DUE-PORTE-2026-11-01.md`, OK di Mobile, CLI e Performance il 01/11/2026).
 *
 *   `ricerca: { profondita: 'quick' | 'deep' | 'exhaustive' }` accompagna la consegna su `POST /api/v1/sessions/custom`: «New research»
 *   della sezione apre una conversazione nuova col suo primo giro. La domanda è la consegna. Il registro la porta al kernel come
 *   `chiamataIniziale` (`talosHarness.mjs`, `chiamataInizialeValida`): il primo passo è la chiamata della persona, non una scelta del modello.
 *   ⛔ Owner 01/11/2026 sera: «niente pillola ricerca approfondita nel composer, solo sezione o richiesta al modello» ⇒ `POST …/resume` NON
 *   accetta `ricerca` (era della sola pillola; il Mobile non l'ha mai usato, né la capacità `ricerca-due-porte`, tolta insieme).
 *
 *   Qui solo la FORMA, come gli altri `require…Body` di `http-app.mjs`: ogni errore è `QUERY_INVALID` (400), il codice di sempre.
 *   Il limite di 500 caratteri è quello di `research_start.question`, uno solo (`DOMANDA_RICERCA_MASSIMA` del kernel).
 */
import { DOMANDA_RICERCA_MASSIMA, PROFONDITA_RICERCA } from './kernel/talosHarness.mjs';

function invalido(messaggio) {
  const errore = new Error(messaggio);
  errore.code = 'QUERY_INVALID';
  return errore;
}

/**
 * La forma di `ricerca` insieme al testo che porta la domanda. `undefined` ⇒ nessuna ricerca (`null`).
 * @param {unknown} ricerca
 * @param {unknown} testo il messaggio (o la consegna) della persona
 * @returns {{ question: string, depth: 'quick'|'deep'|'exhaustive' } | null}
 */
export function requireRicercaDelMessaggio(ricerca, testo) {
  if (ricerca === undefined) return null;
  const chiavi = ricerca && typeof ricerca === 'object' && !Array.isArray(ricerca) ? Object.keys(ricerca) : null;
  if (!chiavi || chiavi.length !== 1 || chiavi[0] !== 'profondita' || !PROFONDITA_RICERCA.includes(ricerca.profondita)) {
    throw invalido('Invalid body: expected ricerca: {profondita: "quick" | "deep" | "exhaustive"}');
  }
  const question = typeof testo === 'string' ? testo.trim() : '';
  if (question.length < 1) throw invalido('Invalid body: a deep research needs the question as the message');
  if (question.length > DOMANDA_RICERCA_MASSIMA) throw invalido(`The research question is 1-${DOMANDA_RICERCA_MASSIMA} characters`);
  return { question, depth: ricerca.profondita };
}

/** Ciò che il registro passa al kernel per QUESTO giro (mai sul disco). */
export const chiamataInizialeDi = (ricerca) => (ricerca ? { nome: 'research_start', argomenti: { question: ricerca.question, depth: ricerca.depth } } : null);
