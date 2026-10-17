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

import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

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
 * ⛔ Il contratto, MISURATO (Windows 11, @napi-rs/keyring di r4, 14/10/2026 notte, su una voce che non esiste):
 *   - `getPassword()` di una voce ASSENTE restituisce `null`, non lancia ⇒ `get` → null per l'assenza;
 *   - `deletePassword()` di una voce ASSENTE restituisce `false`, non lancia ⇒ `remove` di un'assenza riesce da sé (cancellare
 *     una fonte mai configurata — DuckDuckGo, un provider pulito due volte — non dà un errore falso);
 *   - quindi quando lanciano è un GUASTO vero (portachiavi bloccato, accesso negato, nome oltre il limite della piattaforma:
 *     misurato `GenericFailure`) e si PROPAGA, come `set`. Prima i due `catch` lo facevano sparire: un guasto in lettura
 *     diventava «nessuna chiave» (segnalato da Nino2, CLI, 14/10: `system-keyring.ts` aveva la stessa forma), e un `remove`
 *     fallito risultava riuscito mentre la chiave RESTAVA nel portachiavi. I chiamanti hanno già il loro `try/catch` e il loro
 *     codice (`PROVIDER_STORE_UNAVAILABLE`, `SEARCH_STORE_UNAVAILABLE`, «not readable from the keychain», la pulizia li elenca).
 */
export async function creaAdattatorePortachiaviSistema() {
  const { Entry } = await import('@napi-rs/keyring');
  return {
    get: (servizio, account) => new Entry(servizio, account).getPassword() || null,
    set: (servizio, account, valore) => new Entry(servizio, account).setPassword(valore),
    remove: (servizio, account) => { new Entry(servizio, account).deletePassword(); },
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

/*
 * ⭐ 14/10/2026 (owner, alla sessione mobile: «Modulo nostro») — LA TERZA SCELTA: un portachiavi scritto da chi ospita il motore.
 *   Sul telefono il server r4 gira come processo Node figlio dell'app, e l'archivio sicuro di Android si raggiunge solo dal lato
 *   Kotlin: né la custodia di sistema (`@napi-rs/keyring`) né quella in memoria (persa a ogni riavvio) vanno bene. Con
 *   `TALOS_HARNESS_UI_KEYRING=modulo:<percorso assoluto di un .mjs>` il server importa quel file e ne prende l'adattatore.
 * ⛔ CHIUSO PER DIFETTO, come il resto della variabile: un percorso relativo, mancante, con un NUL, un file che non si importa,
 *   un modulo senza `creaPortachiavi`, che lancia o che torna una forma sbagliata ⇒ errore d'AVVIO con un codice
 *   (`KEYRING_MODULE_*`). Mai un ripiego sulla memoria o sul sistema: le chiavi andrebbero dove chi ospita non vuole.
 * ⛔ Il percorso si importa come URL `file:` (`pathToFileURL`): su Windows `import('C:\\…')` è rifiutato, perché il caricatore ESM
 *   legge `c:` come schema (nodejs/node#31710; vitejs/vite#1487, letti il 14/10/2026).
 * Il contratto del modulo: un export CON NOME `creaPortachiavi({ env })`, chiamato UNA volta all'avvio, sincrono, che torna
 *   `{ get(servizio, account) → string|null, set(servizio, account, valore), remove(servizio, account) }` con la semantica
 *   dell'adattatore in memoria (remove idempotente). Sopra si applica lo stesso scope degli altri modi (`avvolgiAdattatoreKeyring`).
 */
export const PREFISSO_MODULO = 'modulo:';

function erroreModulo(code, messaggio) {
  return Object.assign(new Error(`TALOS_HARNESS_UI_KEYRING: ${messaggio}`), { code });
}

/**
 * La scelta del portachiavi, STRICT: `null` = quello del sistema; `'memoria'`; `{ modulo: percorso }`. Qualunque altro valore, o un
 * modulo che non si può nemmeno cercare, è un errore d'avvio.
 * @returns {null | 'memoria' | { modulo: string }}
 */
export function leggiSceltaPortachiavi(env = process.env) {
  const valore = env.TALOS_HARNESS_UI_KEYRING;
  if (valore === undefined || valore === '') return null;
  const scelta = String(valore).trim();
  if (scelta === PORTACHIAVI_MEMORIA) return PORTACHIAVI_MEMORIA;
  if (scelta.startsWith(PREFISSO_MODULO)) {
    const percorso = scelta.slice(PREFISSO_MODULO.length);
    if (percorso === '' || percorso.includes('\0') || !isAbsolute(percorso)) throw erroreModulo('KEYRING_MODULE_PATH_INVALID', 'the module path must be absolute.');
    if (!/\.mjs$/iu.test(percorso)) throw erroreModulo('KEYRING_MODULE_PATH_INVALID', 'the module must be a .mjs file.');
    let eFile = false;
    try { eFile = statSync(percorso).isFile(); } catch { eFile = false; }
    if (!eFile) throw erroreModulo('KEYRING_MODULE_MISSING', `no module file at ${percorso}.`);
    return { modulo: percorso };
  }
  throw new Error(`TALOS_HARNESS_UI_KEYRING="${valore}" is not valid: the variable accepts "memoria", "modulo:<absolute path of a .mjs file>" or no value.`);
}

export function leggiPortachiaviDiProva(env = process.env) {
  return leggiSceltaPortachiavi(env) === PORTACHIAVI_MEMORIA;
}

/** L'adattatore di un modulo esterno (la terza scelta): importato, chiamato una volta, controllato nella forma. */
export async function creaAdattatorePortachiaviDaModulo(percorso, env = process.env, { segreti = Object.freeze({}) } = {}) {
  let modulo;
  try { modulo = await import(pathToFileURL(percorso).href); } catch (errore) {
    throw erroreModulo('KEYRING_MODULE_LOAD_FAILED', `the module at ${percorso} cannot be loaded (${errore?.code ?? errore?.name ?? 'error'}).`);
  }
  if (typeof modulo.creaPortachiavi !== 'function') throw erroreModulo('KEYRING_MODULE_INVALID', 'the module does not export a function named creaPortachiavi.');
  let adattatore;
  // `segreti`: le voci lette dallo stdin che r4 non consuma (14/10/2026), congelate; vuote senza `TALOS_HARNESS_UI_SEGRETI_DA`
  try { adattatore = modulo.creaPortachiavi({ env, segreti }); } catch (errore) {
    throw erroreModulo('KEYRING_MODULE_FAILED', `creaPortachiavi threw (${errore?.code ?? errore?.name ?? 'error'}).`);
  }
  if (adattatore && typeof adattatore.then === 'function') throw erroreModulo('KEYRING_MODULE_INVALID', 'creaPortachiavi must return the keychain synchronously, not a promise.');
  if (!adattatore || typeof adattatore !== 'object' || ['get', 'set', 'remove'].some((m) => typeof adattatore[m] !== 'function')) {
    throw erroreModulo('KEYRING_MODULE_INVALID', 'creaPortachiavi must return { get, set, remove }.');
  }
  /* ⛔ MODULO-REV-01 (revisione del bugfixer, 14/10): metodi ASYNC passavano l'avvio, poi `get` dava sempre null (una promessa non
     è una stringa: «nessuna chiave», in silenzio) e una scrittura rifiutata diventava un unhandledRejection. Due reti: all'avvio
     una funzione `async` si riconosce e il server non parte; a ogni chiamata un metodo che restituisce comunque una promessa (una
     funzione normale che ne torna una) è un guasto che si DICE — si lancia, e il rifiuto della promessa si raccoglie. */
  const asincrono = ['get', 'set', 'remove'].find((m) => adattatore[m]?.constructor?.name === 'AsyncFunction');
  if (asincrono) throw erroreModulo('KEYRING_MODULE_INVALID', `creaPortachiavi must return synchronous methods: ${asincrono} is async.`);
  const sincrono = (metodo, esito) => {
    if (esito && typeof esito.then === 'function') {
      Promise.resolve(esito).catch(() => {}); // nessun rifiuto lasciato senza gestore
      throw erroreModulo('KEYRING_MODULE_INVALID', `the keychain module returned a promise from ${metodo}: its methods must be synchronous.`);
    }
    return esito;
  };
  // solo i tre metodi, legati al loro oggetto; un `get` che non dà una stringa non ha una chiave
  return {
    get: (servizio, account) => { const v = sincrono('get', adattatore.get(servizio, account)); return typeof v === 'string' ? v : null; },
    set: (servizio, account, valore) => { sincrono('set', adattatore.set(servizio, account, String(valore))); },
    remove: (servizio, account) => { sincrono('remove', adattatore.remove(servizio, account)); },
  };
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

/** La fabbrica che il server usa: la custodia di prova se chiesta, il modulo di chi ospita se indicato, altrimenti il sistema. */
export async function creaAdattatorePortachiavi(env = process.env, { segreti = Object.freeze({}) } = {}) {
  const scelta = leggiSceltaPortachiavi(env);
  if (scelta === PORTACHIAVI_MEMORIA) return creaAdattatorePortachiaviInMemoria();
  if (scelta?.modulo) return creaAdattatorePortachiaviDaModulo(scelta.modulo, env, { segreti });
  return creaAdattatorePortachiaviSistema();
}
