import { t } from './lingua.js';

/*
 * ⭐ 27/10/2026 (parità col Mobile, T8; owner «ogni parola in inglese e italiano»): il nome di un argomento d'attrezzo nel corpo
 *   dell'attività si legge nella lingua dell'interfaccia — «path:» / «percorso:» — invece del campo grezzo dello schema, che nel
 *   kernel è misto italiano/inglese (percorso, comando, path, query…). Le voci stanno in `app.activity.arg.<campo>`; la guardia
 *   `tests/unit/etichette-argomenti.test.mjs` legge i campi dagli schemi del kernel e pretende una voce per ognuno.
 *   Un campo senza voce (un server MCP, un attrezzo nuovo) resta il suo nome grezzo: è un identificatore, come il codice. È la
 *   ricaduta sulla chiave di i18next (configuration-options, «fallback to key», letto il 27/10/2026), qui sul nome del campo.
 *   Il Mobile legge le stesse voci con la stessa ricaduta.
 */
export function etichettaArgomento(nome) {
  const campo = String(nome ?? '');
  if (!/^[A-Za-z0-9_]+$/u.test(campo)) return campo;
  const chiave = `app.activity.arg.${campo}`;
  const voce = t(chiave);
  return voce === chiave ? campo : voce;
}
