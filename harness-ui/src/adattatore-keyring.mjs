/*
 * ⛔⛔ (16/09/2026) — LO SCOPE DEL PORTACHIAVI: prod e dev non condividono più i nomi servizio.
 *
 * Fino a oggi il guscio desktop e il server da sorgente usavano GLI STESSI servizi del Credential
 * Manager (`talos-harness-provider`, `…-pool`, `…-pool-index`, `talos-harness-search`): le chiavi
 * configurate nell'istanza di sviluppo spuntavano «collegate» nell'app installata e viceversa, e
 * una disinstallazione+reinstallazione ereditava tutto. La cura è un suffisso: quando lo scope è
 * `desktop` OGNI servizio che passa dall'adattatore viene scritto/letto come `<servizio>-desktop`
 * — un namespace proprio, che nasce vuoto su qualunque macchina e sopravvive agli upgrade (è
 * sempre lo stesso). Il dev continua sui nomi di sempre. ⭐ (16/09/2026, decisione owner) le
 * chiavi del namespace VECCHIO vengono COPIATE una volta sola nel namespace dell'app al primo
 * avvio (`src/migrazione-chiavi.mjs`): chi aveva l'app ≤ 0.1.10 non reinserisce nulla, e i
 * servizi senza suffisso restano allo sviluppo.
 *
 * ⛔ Il wrapping è GENERICO (qualunque nome servizio in ingresso riceve il suffisso): i negozi
 *   conoscono i loro nomi, questo modulo no — la prossima fonte che userà il portachiavi eredita
 *   la separazione senza una riga qui. È anche la porta che la routine di pulizia
 *   (`pulizia-dati.mjs`) usa per cancellare SOLO il namespace dell'app installata, mai quello del
 *   dev.
 */

/** Il solo scope ammesso oltre all'assenza: qualunque altro valore è un errore d'avvio, non un default silenzioso. */
export const SCOPE_DESKTOP = 'desktop';
/** Il suffisso che separa il namespace dell'app installata da quello dello sviluppo. */
export const SUFFISSO_DESKTOP = '-desktop';

/**
 * Legge `TALOS_HARNESS_UI_KEYRING_SCOPE` STRICT: assente/vuota → null (sviluppo, nomi di sempre);
 * «desktop» → scope desktop; qualunque altro valore → errore onesto all'avvio (stessa scelta di
 * `portaValida` in runtime.mjs: un segnale scritto male non si indovina).
 */
export function leggiScopePortachiavi(env = process.env) {
  const valore = env.TALOS_HARNESS_UI_KEYRING_SCOPE;
  if (valore === undefined || valore === '') return null;
  const normalizzato = String(valore).trim();
  if (normalizzato === SCOPE_DESKTOP) return SCOPE_DESKTOP;
  throw new Error(`TALOS_HARNESS_UI_KEYRING_SCOPE="${valore}" non è valida: la variabile accetta solo il valore "desktop", o nessun valore.`);
}

/**
 * Avvolge l'adattatore `{get, set, remove}` applicando il suffisso di scope a ogni nome servizio
 * che gli arriva. Scope null → l'adattatore com'è (lo sviluppo non cambia una virgola). Un
 * adattatore assente passa intatto: chi lo riceve gestisce già quel caso.
 */
export function avvolgiAdattatoreKeyring(keyring, scope) {
  if (!keyring || scope !== SCOPE_DESKTOP) return keyring;
  const conSuffisso = (servizio) => `${servizio}${SUFFISSO_DESKTOP}`;
  return {
    get: (servizio, account) => keyring.get(conSuffisso(servizio), account),
    set: (servizio, account, valore) => keyring.set(conSuffisso(servizio), account, valore),
    remove: (servizio, account) => keyring.remove(conSuffisso(servizio), account),
  };
}

/**
 * L'UNICA fabbrica dell'adattatore verso il portachiavi del sistema (`@napi-rs/keyring`): chi
 * lo usava inline (server.mjs) e chi lo userà dopo (la routine di pulizia alla disinstallazione,
 * `src/pulizia-dati.mjs`) condividono QUESTA implementazione, non una copia.
 *
 * ⛔ Le tre eccezioni qui dentro sono parte del contratto, non pigrizia:
 *   - `get` fallito → null (una chiave che il portachiavi non dà non esiste);
 *   - `remove` di una credenziale ASSENTE → successo («assenza già rimossa»: senza questo,
 *     cancellare una fonte mai configurata — DuckDuckGo, o un provider pulito due volte —
 *     riporterebbe un errore falso e bloccherebbe una pulizia legittima);
 *   - solo un `set` fallito propagano: un segreto che NON entra è un guasto vero.
 */
export async function creaAdattatorePortachiaviSistema() {
  const { Entry } = await import('@napi-rs/keyring');
  return {
    get: (servizio, account) => { try { return new Entry(servizio, account).getPassword() || null; } catch { return null; } },
    set: (servizio, account, valore) => new Entry(servizio, account).setPassword(valore),
    remove: (servizio, account) => { try { new Entry(servizio, account).deletePassword(); } catch { /* assenza già rimossa */ } },
  };
}
