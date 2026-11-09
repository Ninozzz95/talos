/*
 * ⭐ FE-010 (owner 31/10/2026; forma del 03/11, OK di Performance, CLI e Mobile) — LA CHAT A LATO: una domanda a parte mentre TALOS lavora. Legge la
 * conversazione, non ci scrive, non interrompe e non si salva: il filo sta nel client, e il server non ne tiene niente.
 *
 * Come il `/btw` di Hermes (`agent/side_question.py:1-9`): la fotografia dell'ultima richiesta spedita, ripetuta identica contro la cache, con
 * solo una coda in più. ⛔ Stessi `tools`, `tool_choice` e `reasoning` del giro: «changing any of them changes the cache key»
 * (`agent/side_question_request.py:231-233`). Una chiamata di strumento nella risposta non si esegue mai.
 * ⛔ `filo` arriva dal client: solo testo, con tetti, mai istruzioni di sistema.
 * ⛔ Il tetto della risposta è sul testo: sul piano `max_output_tokens` è vietato, altrove `max_tokens` conta anche il ragionamento (Performance).
 */
export const TETTI_LATO = Object.freeze({ domanda: 4_000, filo: 16_000, risposta: 6_000, uscitaToken: 4_000, attesaMs: 120_000 });

export const ISTRUZIONE_LATO = 'The person asked a quick SIDE question while the main work continues in this conversation.\n'
  + 'Rules:\n- Answer ONLY the side question, using the conversation above as context. Do not continue, redo or critique the main task.\n'
  + '- Do not call any tools: they are disabled for this side question. Answer directly in text.\n'
  + '- If the conversation does not contain enough to answer, say so plainly instead of guessing.\n- Be concise and direct.';

/** Il filo ridotto al suo tetto, sulla somma dei caratteri: vanno via gli scambi più vecchi. */
export function validaFiloALato(filo) {
  if (filo === undefined || filo === null) return { ok: true, filo: [], tagliato: false };
  if (!Array.isArray(filo)) return { ok: false, messaggio: 'filo must be a list of { domanda, risposta }.' };
  const scambi = [];
  for (const [i, s] of filo.entries()) {
    if (typeof s?.domanda !== 'string' || typeof s?.risposta !== 'string') return { ok: false, messaggio: `filo[${i}] must have domanda and risposta as text.` };
    scambi.push({ domanda: s.domanda, risposta: s.risposta });
  }
  let somma = 0;
  let da = scambi.length;
  while (da > 0 && somma + scambi[da - 1].domanda.length + scambi[da - 1].risposta.length <= TETTI_LATO.filo) {
    da -= 1;
    somma += scambi[da].domanda.length + scambi[da].risposta.length;
  }
  return { ok: true, filo: scambi.slice(da), tagliato: da > 0 };
}

/** @returns {{ ok: true, domanda: string, filo: object[], filoTagliato: boolean } | { ok: false, messaggio: string }} */
export function validaDomandaALato(ingresso) {
  const domanda = typeof ingresso?.domanda === 'string' ? ingresso.domanda.trim() : '';
  if (!domanda) return { ok: false, messaggio: 'domanda must be a non-empty string.' };
  if (domanda.length > TETTI_LATO.domanda) return { ok: false, messaggio: `domanda must be at most ${TETTI_LATO.domanda} characters.` };
  const filo = validaFiloALato(ingresso?.filo);
  return filo.ok ? { ok: true, domanda, filo: filo.filo, filoTagliato: filo.tagliato } : filo;
}

/** Le immagini tolte dalla copia in memoria (`copiaDellaRichiesta`) non si possono rimandare: diventano una parola. */
const senzaPartiTolte = (m) => (Array.isArray(m?.content) && m.content.some((p) => p?.omitted === true)
  ? { ...m, content: m.content.map((p) => (p?.omitted === true ? { type: 'text', text: '[image]' } : p)) }
  : m);

/**
 * La conversazione fino all'ultimo punto che un fornitore accetta: una fotografia presa a metà giro può finire con chiamate senza esito o con esiti
 * senza risposta, e va tagliata lì (Hermes, `agent/side_question.py:47`).
 */
export function fotografiaPerALato(messaggi) {
  const lista = Array.isArray(messaggi) ? messaggi.filter((m) => m && typeof m === 'object') : [];
  let fine = lista.length;
  while (fine > 0) {
    const m = lista[fine - 1];
    if (m.role === 'user' || m.role === 'system' || (m.role === 'assistant' && !(Array.isArray(m.tool_calls) && m.tool_calls.length > 0))) break;
    fine -= 1;
  }
  return lista.slice(0, fine).map(senzaPartiTolte);
}

export const messaggiDelFilo = (filo) => filo.flatMap((s) => [{ role: 'user', content: s.domanda }, { role: 'assistant', content: s.risposta }]);

/** La richiesta: fotografia, filo e, per ultima, la domanda con l'istruzione. Il prefisso resta quello del giro. */
export function messaggiALato({ fotografia, filo = [], domanda }) {
  return [...fotografia, ...messaggiDelFilo(filo), { role: 'user', content: `${ISTRUZIONE_LATO}\n\nSide question: ${domanda}` }];
}

/** Il testo della risposta, col suo tetto. Una chiamata di strumento non conta: senza testo non c'è risposta. */
export function testoDellaRispostaALato(scelta) {
  const testo = String(scelta?.content ?? '').trim();
  return testo.length > TETTI_LATO.risposta
    ? { testo: testo.slice(0, TETTI_LATO.risposta), tagliata: true }
    : { testo, tagliata: false };
}
