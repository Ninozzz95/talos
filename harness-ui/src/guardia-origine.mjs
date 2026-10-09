/**
 * ⭐ 0.1.25 — LA GUARDIA D'ORIGINE E DELL'HOST di tutto il server (owner 08/10/2026 notte: «una guardia unica su ogni scrittura»;
 * 09/10/2026: «Host su ogni richiesta, letture comprese»).
 *
 * Perché: il blocco CORS di `handle()` rifletteva QUALSIASI `Origin` e il preflight ammetteva PATCH/DELETE. Sui server SENZA
 *   gettone (il 4174, i server di prova) una pagina web aperta nel browser della persona poteva leggere e scrivere. L'app
 *   installata era già coperta dal cookie `talos_token` (HttpOnly, SameSite=Strict, legato a 127.0.0.1): questa è difesa in
 *   profondità, uguale per tutti i server.
 * Modello: Hermes `hermes_cli/web_server.py` (clone 65ad529, letto il 09/10/2026):
 *   - CORS solo per le origini di loopback, `allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"` (:437-445);
 *   - `_LOOPBACK_HOST_VALUES = {"localhost", "127.0.0.1", "::1"}` (:497) e `host_header_middleware` (:620-640) contro il DNS
 *     rebinding (GHSA-ppp5-vxwm-4cf7): un nome dell'attaccante risolto a 127.0.0.1 arriva nell'Host col SUO nome;
 *   - `_host_header_hostname` (:562-593): l'Host è un'autorità, non un URL; IPv6 solo fra quadre; la PORTA non si confronta
 *     (qui conta: il ponte adb del telefono può mappare porte diverse).
 *   E le scritture: la «Fetch Metadata Resource Isolation Policy» (OWASP CSRF Prevention Cheat Sheet; W3C Fetch Metadata) —
 *   un browser manda sempre `Sec-Fetch-Site`, e `Origin` sulle POST; un programma (test, script, CLI) non manda né l'uno né
 *   l'altro, e il CSRF viene solo dai browser.
 */

const NOMI_LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);
const ORIGINE_LOOPBACK = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/u;
const METODI_SICURI = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Il nome (minuscolo) da un'intestazione Host, o '' se non è un'autorità valida (porta di Hermes `_host_header_hostname`). */
export function nomeDaHost(host) {
  const valore = typeof host === 'string' ? host.trim() : '';
  if (!valore || valore.includes('://') || /["'<> \n\r\t/?#@]/u.test(valore)) return '';
  if (valore.startsWith('[')) {
    const chiusa = valore.indexOf(']');
    if (chiusa === -1) return '';
    const nome = valore.slice(1, chiusa);
    if (!nome.includes(':')) return ''; // le quadre sono solo per gli IPv6
    const resto = valore.slice(chiusa + 1);
    if (resto && !/^:\d+$/u.test(resto)) return '';
    return nome.toLowerCase();
  }
  if ((valore.match(/:/gu) ?? []).length > 1) return ''; // IPv6 senza quadre: ambiguo con la porta
  if (valore.includes(':')) {
    const [nome, porta] = [valore.slice(0, valore.lastIndexOf(':')), valore.slice(valore.lastIndexOf(':') + 1)];
    if (!nome || !/^\d+$/u.test(porta)) return '';
    return nome.toLowerCase();
  }
  return valore.toLowerCase();
}

/**
 * Vero se l'Host nomina il loopback (la porta non si confronta, come Hermes).
 * ⛔ Un Host ASSENTE passa: il DNS rebinding passa per forza da un browser, e un browser l'Host lo manda sempre; un Host
 *   assente viene solo da un programma o da una prova in memoria (`app({method, url, headers: {}})`). Un Host PRESENTE e
 *   sbagliato (anche vuoto) si rifiuta. Hermes rifiuta anche l'assente (uvicorn lo riempie sempre); qui il server riceve
 *   richieste costruite a mano dalle prove del catalogo dei modelli, misurato il 09/10 (tre rossi).
 */
export function hostAmmesso(host) {
  if (host === undefined) return true;
  return NOMI_LOOPBACK.has(nomeDaHost(host));
}

/** Vero per le origini di loopback: http/https su localhost, 127.0.0.1, [::1], con o senza porta. */
export function origineLoopback(origine) {
  return typeof origine === 'string' && ORIGINE_LOOPBACK.test(origine);
}

// L'origine del WebView di Capacitor (mobile/capacitor.config.ts:11 androidScheme 'https', hostname di serie localhost): SENZA
// porta. ⛔ NON `http://localhost`: senza porta è la 80, cioè qualunque server http locale (IIS, un dev server, uno strumento) —
// lo stesso buco della v1, solo più stretto (review del bugfixer, 09/10). Se una build vecchia la mandasse, si misura prima.
const ORIGINI_WEBVIEW = new Set(['https://localhost']);

function portaDiOrigine(origine) {
  const url = new URL(origine);
  return url.port || (url.protocol === 'https:' ? '443' : '80');
}
function portaDaHost(host) {
  const valore = String(host).trim();
  const dopo = valore.startsWith('[') ? valore.slice(valore.indexOf(']') + 1) : valore;
  const i = dopo.lastIndexOf(':');
  return i === -1 ? '80' : dopo.slice(i + 1); // il server parla http: senza porta nell'Host è la 80
}

/**
 * ⛔ Review del bugfixer (09/10/2026, YELLOW, ORIGINE-HOST): «loopback» non basta. Un'altra porta di loopback è un ALTRO server
 *   della stessa macchina — il server di sviluppo del progetto (http://localhost:5173, codice npm che non controlliamo), qualunque
 *   strumento locale — e il cookie `talos_token` non lo ferma: SameSite guarda il SITO e i cookie ignorano la porta. Hermes regge
 *   CORS su ogni porta solo perché tutto /api/ vuole il suo gettone di sessione (`web_server.py:379-490`, `_require_token`).
 *   Owner: «ogni scrittura solo dalla finestra TALOS/Capacitor». ⇒ Un'origine passa solo se è:
 *     - http, di loopback e con la STESSA porta dell'Host (la finestra di TALOS servita da questo server; il nome può essere un altro
 *       alias di loopback: localhost e 127.0.0.1 sono la stessa macchina); oppure
 *     - l'origine del WebView senza porta (`https://localhost`), con cui il telefono arriva qui dal ponte adb.
 *   Un Host ASSENTE (solo programmi e prove in memoria, mai un browser) non ha porta da confrontare: lì basta il loopback.
 */
export function origineDellaFinestra(origine, host) {
  if (!origineLoopback(origine)) return false;
  if (ORIGINI_WEBVIEW.has(origine)) return true;
  if (host === undefined) return true;
  // il server parla solo http: un'origine https sulla stessa porta non è servita da qui (schema diverso = origine diversa)
  return origine.startsWith('http://') && portaDiOrigine(origine) === portaDaHost(host);
}

/**
 * Il motivo per rifiutare una SCRITTURA, o `null`. Solo i metodi non sicuri; una lettura la decide l'Host.
 *   - `Origin` presente che non è la finestra (`origineDellaFinestra`: loopback con la porta dell'Host, o il WebView senza porta;
 *     anche `null`, l'origine opaca di un iframe sandboxato o di un file) ⇒ 'altra-origine';
 *   - senza `Origin`, un `Sec-Fetch-Site` che non sia `same-origin` o `none` ⇒ 'altro-sito';
 *   - senza nessuna delle due (un programma) ⇒ passa.
 * ⛔ Con l'origine della finestra si passa anche se il browser dice `cross-site`: il WebView del telefono (`https://localhost`)
 *   chiama 127.0.0.1, che per il browser è un altro sito, ed è la persona.
 */
export function rifiutoScritturaDaAltroSito(req) {
  const metodo = String(req?.method ?? 'GET').toUpperCase();
  if (METODI_SICURI.has(metodo)) return null;
  const origine = req?.headers?.origin;
  if (typeof origine === 'string' && origine !== '') return origineDellaFinestra(origine, req?.headers?.host) ? null : 'altra-origine';
  const sito = req?.headers?.['sec-fetch-site'];
  if (typeof sito === 'string' && sito !== '' && sito !== 'same-origin' && sito !== 'none') return 'altro-sito';
  return null;
}
