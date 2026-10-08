// Una chiamata senza argomenti è una chiamata VALIDA: l'oggetto vuoto. Sul filo arriva come stringa vuota (lo stream manda zero frammenti
// di argomenti: `partial_json=''` nell'esempio della documentazione Anthropic, «the final tool_use.input is always an object»), e il
// kernel la accumulava così com'era. Una stringa vuota non è JSON: la riparazione della ripresa la prendeva per «troncata» e la
// riscriveva in testo (CTX_HISTORY_DIVERGED sull'archivio del Context Engine), e il filo nativo cadeva con «Unexpected end of JSON input».
// Hermes (agent/turn_tool_validation.py:150-161, message_sanitization.py:230-236) e Pi (packages/ai/src/utils/json-parse.ts:104-106)
// fanno lo stesso: vuoto o spazi = oggetto vuoto. Letto 08/10/2026.
//
// Tre usi, mai sulla storia SALVATA già scritta (l'archivio del Context Engine ne ha il digest: riscriverla la farebbe divergere):
//   - alla FONTE, sulla risposta viva del modello (`normalizzaArgomentiVuoti`);
//   - al CONFINE col fornitore, su una copia (`conArgomentiVuotiComeOggetto`, `ripristinaArgomentiVuotiInPlace` su una copia già fatta);
//   - nel lettore del filo nativo e nella riparazione della ripresa, che li riconoscono (`argomentiVuoti`).

export const ARGOMENTI_NESSUNO = '{}';

/** true per una stringa vuota o fatta di soli spazi. Qualunque altra cosa (compreso un JSON troncato) non è «vuota». */
export const argomentiVuoti = (grezzi) => typeof grezzi === 'string' && grezzi.trim() === '';

/** Sulla risposta VIVA del modello: ogni chiamata con argomenti vuoti passa a `{}`. Ritorna quante ne ha toccate. */
export function normalizzaArgomentiVuoti(chiamate) {
  let toccate = 0;
  for (const chiamata of Array.isArray(chiamate) ? chiamate : []) {
    if (argomentiVuoti(chiamata?.function?.arguments)) { chiamata.function.arguments = ARGOMENTI_NESSUNO; toccate += 1; }
  }
  return toccate;
}

/** Su una COPIA già fatta dal chiamante (lo stesso che `prepareProviderContext` prepara): sul posto, ritorna quante ne ha toccate. */
export function ripristinaArgomentiVuotiInPlace(messaggi) {
  let toccate = 0;
  for (const messaggio of Array.isArray(messaggi) ? messaggi : []) toccate += normalizzaArgomentiVuoti(messaggio?.tool_calls);
  return toccate;
}

const haArgomentiVuoti = (messaggio) => messaggio?.role === 'assistant' && Array.isArray(messaggio.tool_calls)
  && messaggio.tool_calls.some((chiamata) => argomentiVuoti(chiamata?.function?.arguments));

/** Per il percorso senza copia: la STESSA lista se nessuna chiamata ha argomenti vuoti (nessun costo), altrimenti una lista nuova in cui
 *  cambiano solo i messaggi toccati. Mai la lista ricevuta, che è la storia viva del giro. */
export function conArgomentiVuotiComeOggetto(messaggi) {
  if (!Array.isArray(messaggi) || !messaggi.some(haArgomentiVuoti)) return messaggi;
  return messaggi.map((messaggio) => (!haArgomentiVuoti(messaggio) ? messaggio : {
    ...messaggio,
    tool_calls: messaggio.tool_calls.map((chiamata) => (argomentiVuoti(chiamata?.function?.arguments)
      ? { ...chiamata, function: { ...chiamata.function, arguments: ARGOMENTI_NESSUNO } }
      : chiamata)),
  }));
}
