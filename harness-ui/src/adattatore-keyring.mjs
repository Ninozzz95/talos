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

/** Scope Desktop e Preview isolati; oltre all'assenza: qualunque altro valore è un errore d'avvio, non un default silenzioso. */
export const SCOPE_DESKTOP = 'desktop';
export const SCOPE_PREVIEW = 'desktop-preview';
export const SUFFISSO_PREVIEW = '-desktop-preview';
/** Il suffisso che separa il namespace dell'app installata da quello dello sviluppo. */
export const SUFFISSO_DESKTOP = '-desktop';

/**
 * Legge `TALOS_HARNESS_UI_KEYRING_SCOPE` STRICT: assente/vuota → null (sviluppo, nomi di sempre);
 * «desktop» / «desktop-preview» → namespace distinti; qualunque altro valore → errore onesto all'avvio (stessa scelta di
 * `portaValida` in runtime.mjs: un segnale scritto male non si indovina).
 */
export function leggiScopePortachiavi(env = process.env) {
  const valore = env.TALOS_HARNESS_UI_KEYRING_SCOPE;
  if (valore === undefined || valore === '') return null;
  const normalizzato = String(valore).trim();
  if (normalizzato === SCOPE_DESKTOP || normalizzato === SCOPE_PREVIEW) return normalizzato;
  throw new Error(`TALOS_HARNESS_UI_KEYRING_SCOPE="${valore}" is not valid: the variable accepts "desktop", "desktop-preview", or no value.`);
}

/**
 * Avvolge l'adattatore `{get, set, remove}` applicando il suffisso di scope a ogni nome servizio
 * che gli arriva. Scope null → l'adattatore com'è (lo sviluppo non cambia una virgola). Un
 * adattatore assente passa intatto: chi lo riceve gestisce già quel caso.
 */
export function avvolgiAdattatoreKeyring(keyring, scope) {
  if (scope !== null && scope !== undefined && ![SCOPE_DESKTOP, SCOPE_PREVIEW].includes(scope)) throw new Error('Invalid keyring scope.');
  if (!keyring || !scope) return keyring;
  const suffix = scope === SCOPE_PREVIEW ? SUFFISSO_PREVIEW : SUFFISSO_DESKTOP;
  const conSuffisso = (servizio) => `${servizio}${suffix}`;
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

/*
 * ⛔⛔ (23/09/2026) — IL SERVER DI PROVA CANCELLAVA LA CHIAVE VERA DELL'OWNER.
 *
 * La prova browser BC-62 salva `sk-bc62-fixture` come chiave OpenRouter e il suo commento credeva
 * che finisse «nel keyring in-memory». Non esisteva: il server di Playwright usava il Credential
 * Manager VERO, nello spazio senza suffisso che è lo stesso del 4174. Misurato il 23/09 alle 20:36:
 * la voce `openrouter` del pool è diventata un valore di 15 caratteri, la chiave precedente è stata
 * tolta dal rimpiazzo del pool, e otto sessioni GLM sono finite con «Credenziale rifiutata».
 *
 * ⇒ Una custodia di PROVA, scelta da `TALOS_HARNESS_UI_KEYRING=memoria`: una Map per processo,
 *   che muore col server. Precedente: la libreria Python `keyring` sceglie il backend dei test con
 *   `PYTHON_KEYRING_BACKEND` (https://keyring.readthedocs.io/en/stable/, letta il 23/09/2026).
 * ⛔ Valore STRICT come lo scope: assente → custodia di sistema; «memoria» → questa; altro → errore
 *   d'avvio. E chi usa la memoria NON prende semi dall'ambiente (`server.mjs`): un server di prova
 *   non deve trovarsi in mano la chiave vera dell'owner da `OPENROUTER_API_KEY`.
 */
export const PORTACHIAVI_MEMORIA = 'memoria';

export function leggiPortachiaviDiProva(env = process.env) {
  const valore = env.TALOS_HARNESS_UI_KEYRING;
  if (valore === undefined || valore === '') return false;
  if (String(valore).trim() === PORTACHIAVI_MEMORIA) return true;
  throw new Error(`TALOS_HARNESS_UI_KEYRING="${valore}" is not valid: the variable accepts "memoria" or no value.`);
}

export function creaAdattatorePortachiaviInMemoria() {
  const voci = new Map();
  const chiave = (servizio, account) => `${servizio}\u0000${account}`;
  return {
    get: (servizio, account) => voci.get(chiave(servizio, account)) ?? null,
    set: (servizio, account, valore) => { voci.set(chiave(servizio, account), String(valore)); },
    remove: (servizio, account) => { voci.delete(chiave(servizio, account)); },
  };
}

/** La fabbrica che il server usa: la custodia di prova se chiesta, altrimenti quella del sistema. */
export async function creaAdattatorePortachiavi(env = process.env) {
  return leggiPortachiaviDiProva(env) ? creaAdattatorePortachiaviInMemoria() : creaAdattatorePortachiaviSistema();
}
