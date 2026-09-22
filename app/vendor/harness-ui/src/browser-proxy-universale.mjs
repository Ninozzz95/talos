/**
 * browser-proxy-universale.mjs — M3 (07/09/2026): la CORSIA VELOCE del Browser.
 * Fa vedere dentro TALOS anche le pagine che vietano la cornice (github risponde
 * `X-Frame-Options: DENY` e nella cornice resta un rettangolo grigio), senza
 * dover avviare un browser vero. Il browser vero (la corsia B, CDP) resta per
 * quello che il proxy non può dare: accesso già fatto, pagine che si difendono
 * davvero, JavaScript che parla solo col suo stesso server.
 *
 * ⛔ PERCHÉ UN'ORIGINE SEPARATA, E NON LA NOSTRA — è il punto di tutto il file.
 * Una pagina servita da noi diventa, per il browser, CODICE DELLA NOSTRA
 * ORIGINE: la same-origin policy le apre `localStorage`, `IndexedDB`, i cookie e
 * ogni rotta `/api/*` di TALOS come se fossero roba sua (MDN «Same-origin
 * policy», letto il 07/09/2026: l'origine è schema+host+PORTA, e ciò che
 * condivide l'origine condivide lo storage). Un proxy che serve siti di terzi
 * dalla propria origine mette per giunta tutti i siti proxati nello STESSO
 * barattolo: lo script di un sito legge quello che ci ha lasciato un altro
 * (proxyorb.com, «Same-Origin Policy and Web Proxies», letto il 07/09/2026). E
 * la pagina di terzi è SEMPRE contenuto non affidabile — l'indirect prompt
 * injection su Comet dimostrata da Brave.
 * ⇒ Il proxy vive su una PORTA SUA (origine diversa) e non sa niente di TALOS.
 *
 * ⛔ La porta separa l'origine, NON i cookie. I cookie si scelgono per HOST, la
 * porta non entra nel confronto: una pagina servita da `127.0.0.1:4301` sta nello
 * stesso barattolo di TALOS su `127.0.0.1:4174` — e `talos_token`
 * (`src/http-app.mjs:1193`, HttpOnly SameSite=Strict) resta illeggibile da JS ma
 * VIENE SPEDITO, perché per SameSite due porte dello stesso host sono lo stesso
 * sito. Per questo il proxy si lega di default a un OSPITE diverso, `127.0.0.2`:
 * host diverso ⇒ barattolo diverso ⇒ da lì non parte nessun cookie di TALOS.
 * Dove quell'indirizzo non si può legare (macOS vuole un alias esplicito su
 * `lo0`) si ripiega su `127.0.0.1` e lo si DICHIARA (`cookieCondiviso: true`),
 * invece di fingere un isolamento che non c'è.
 *
 * ⛔ SSRF: il proxy va a prendere pagine per conto di chi chiede, quindi è la
 * classica leva verso l'interno. Indirizzi privati, loopback, link-local (dentro
 * cui sta `169.254.169.254`, le credenziali IAM di una macchina cloud) e
 * multicast si rifiutano, in IPv4 e in IPv6 — comprese le forme mascherate
 * `[::ffff:169.254.169.254]`, che alcune librerie Node lasciano passare
 * (appsecbrief.com «SSRF in 2026» e vulnsy.com «SSRF Cheat Sheet 2026», letti il
 * 07/09/2026). Il controllo si ripete a OGNI salto di reindirizzamento, perché il
 * primo indirizzo può essere pubblico e il secondo no. Resta scoperto il DNS
 * rebinding (un nome pubblico che risolve a 10.x): la cura vera è guardare
 * l'indirizzo del socket, ed è lavoro della corsia B.
 *
 * ⛔ La CSP si RISCRIVE, non si butta. Via `X-Frame-Options` (intero: dice solo
 * chi può incorniciare) e via la SOLA direttiva `frame-ancestors`; `script-src`,
 * `object-src` e le altre restano in piedi. Buttare tutta la CSP toglierebbe a
 * una pagina non affidabile ogni difesa contro i suoi stessi XSS proprio mentre
 * la ospitiamo noi (OWASP «Clickjacking Defense Cheat Sheet» e usamaejaz.com
 * «Securely bypassing X-Frame-Options», letti il 07/09/2026: si modifica la
 * direttiva, non si cancella l'intestazione).
 *
 * ⛔ `integrity` non si tocca. Con `<base>` sull'origine vera una sottorisorsa
 * che prima era same-origin diventa cross-origin: e una risorsa cross-origin con
 * `integrity` DEVE viaggiare in CORS, cioè vuole `crossorigin` nel markup,
 * altrimenti il browser riceve una risposta opaca, non può calcolare l'impronta e
 * blocca lo script (MDN «Subresource Integrity», letto il 07/09/2026). Quindi si
 * AGGIUNGE `crossorigin="anonymous"` dove manca, e non si toglie mai l'impronta:
 * toglierla spegnerebbe in silenzio una difesa sulla catena di fornitura. Per lo
 * stesso motivo il proxy passa SOLO il documento: se riscrivessimo anche le
 * sottorisorse, ogni byte cambiato sarebbe un'impronta che non torna.
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';

import { urlAmmesso, MILLISECONDI_MASSIMI } from './browser-frame.mjs';

export const BYTE_MASSIMI = 5 * 1024 * 1024;
export const SALTI_MASSIMI = 5;
export const OSPITE_SEPARATO = '127.0.0.2';
export const OSPITE_RIPIEGO = '127.0.0.1';
const AGENTE = 'TALOS-Harness-Desktop/0.1 (proxy universale)';

/* Mai inoltrate al browser. `set-cookie`: i cookie del sito non entrano nel
 * barattolo del proxy. `strict-transport-security` e `clear-site-data`
 * parlerebbero dell'origine NOSTRA. `cross-origin-resource-policy` e i due
 * `cross-origin-*-policy` bloccherebbero proprio la cornice che stiamo
 * costruendo. `content-encoding`/`content-length`/gli hop-by-hop descrivono un
 * corpo che abbiamo già decodificato e riscritto. `x-frame-options` è il motivo
 * per cui questo file esiste. */
export const INTESTAZIONI_MAI_INOLTRATE = [
  'set-cookie', 'set-cookie2', 'strict-transport-security', 'clear-site-data', 'public-key-pins',
  'cross-origin-resource-policy', 'cross-origin-opener-policy', 'cross-origin-embedder-policy',
  'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'upgrade',
  'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'x-frame-options',
];

const NOMI_SONDATI = ['content-type', 'content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'set-cookie', 'cache-control', 'content-length', 'content-encoding', 'strict-transport-security', 'cross-origin-resource-policy', 'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'x-content-type-options', 'location'];

/* Lo script che entra nella pagina proxata. Vive sull'origine del PROXY — mai su
 * quella di TALOS: una richiesta verso 4174 partirebbe col cookie di sessione. */
export const SCRIPT_OVERLAY_PREDEFINITO = `(() => {
  const dove = (document.currentScript && document.currentScript.dataset.talosUrl) || location.href;
  const manda = (tipo, dati) => { try { parent.postMessage(Object.assign({ talos: 'browser-proxy', tipo, url: dove }, dati), '*'); } catch { /* il genitore puo' essere andato via */ } };
  addEventListener('error', (e) => manda('errore', { messaggio: String((e && e.message) || 'errore'), riga: (e && e.lineno) || null }), true);
  addEventListener('unhandledrejection', (e) => manda('errore', { messaggio: String((e && e.reason && e.reason.message) || (e && e.reason) || 'promessa rifiutata') }));
  addEventListener('DOMContentLoaded', () => manda('pronta', { titolo: document.title || null }));
})();`;

/* ─────────────── gli indirizzi che il proxy non tocca ─────────────── */

function gruppiIpv6(host) {
  const testo = String(host).replace(/^\[|\]$/g, '');
  if (!testo.includes(':')) return null;
  let corpo = testo;
  const conV4 = /^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(testo);
  if (conV4) {
    const ottetti = conV4[2].split('.').map(Number);
    if (ottetti.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    corpo = `${conV4[1]}${((ottetti[0] << 8) | ottetti[1]).toString(16)}:${((ottetti[2] << 8) | ottetti[3]).toString(16)}`;
  }
  const parti = corpo.split('::');
  if (parti.length > 2) return null;
  const sinistra = parti[0] ? parti[0].split(':').filter(Boolean) : [];
  const destra = parti.length === 2 ? (parti[1] ? parti[1].split(':').filter(Boolean) : []) : null;
  const buchi = destra === null ? 0 : 8 - sinistra.length - destra.length;
  if (buchi < 0) return null;
  const pezzi = destra === null ? sinistra : [...sinistra, ...Array(buchi).fill('0'), ...destra];
  if (pezzi.length !== 8) return null;
  const gruppi = pezzi.map((p) => (/^[0-9a-f]{1,4}$/i.test(p) ? parseInt(p, 16) : NaN));
  return gruppi.some((n) => Number.isNaN(n)) ? null : gruppi;
}

function ottettiIpv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(host));
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.some((n) => n > 255) ? null : o;
}

function motivoIpv4(ottetti) {
  const [a, b, c] = ottetti;
  if (a === 127) return 'Indirizzo di loopback (127.0.0.0/8)';
  if (a === 0) return 'Indirizzo «questa rete» (0.0.0.0/8)';
  if (a === 10) return 'Indirizzo di rete privata (10.0.0.0/8)';
  if (a === 172 && b >= 16 && b <= 31) return 'Indirizzo di rete privata (172.16.0.0/12)';
  if (a === 192 && b === 168) return 'Indirizzo di rete privata (192.168.0.0/16)';
  if (a === 169 && b === 254) return 'Indirizzo link-local (169.254.0.0/16: è lì che risponde il servizio metadati di una macchina cloud)';
  if (a === 100 && b >= 64 && b <= 127) return 'Indirizzo condiviso dell\'operatore (100.64.0.0/10)';
  if (a === 192 && b === 0 && c === 0) return 'Indirizzo riservato IETF (192.0.0.0/24)';
  if (a === 198 && (b === 18 || b === 19)) return 'Indirizzo per prove di rete (198.18.0.0/15)';
  if (a >= 224) return 'Indirizzo multicast o riservato (224.0.0.0/4 e oltre)';
  return null;
}

/**
 * Dice PERCHÉ un host non si può proxare, o `null` se è un indirizzo pubblico.
 * @param {string} host l'hostname come l'ha normalizzato `new URL` (IPv6 fra parentesi)
 * @returns {string|null}
 */
export function indirizzoLocale(host) {
  const nudo = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!nudo) return 'Indirizzo senza host';
  if (nudo === 'localhost' || nudo.endsWith('.localhost') || nudo.endsWith('.local') || nudo.endsWith('.internal') || nudo.endsWith('.home.arpa')) {
    return 'Nome che punta al tuo computer o alla tua rete di casa';
  }
  const v4 = ottettiIpv4(nudo);
  if (v4) return motivoIpv4(v4);
  const g = gruppiIpv6(nudo);
  if (g) {
    if (g.every((n) => n === 0)) return 'Indirizzo non specificato (::)';
    if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) return 'Indirizzo di loopback (::1)';
    /* IPv4 travestito da IPv6: `::ffff:169.254.169.254` è lo stesso bersaglio, scritto come molti controlli non lo riconoscono */
    if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) return motivoIpv4([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff]);
    if ((g[0] & 0xfe00) === 0xfc00) return 'Indirizzo IPv6 di rete locale (fc00::/7)';
    if ((g[0] & 0xffc0) === 0xfe80) return 'Indirizzo IPv6 link-local (fe80::/10)';
  }
  return null;
}

/**
 * Chi il proxy può andare a prendere. Riusa `urlAmmesso` di `browser-frame.mjs`
 * (solo http/https, mai credenziali nell'indirizzo) e ne tiene la FORMA
 * `{ok:true} | {ok:false, motivo}`, aggiungendoci il filtro SSRF.
 * `locale:true` distingue «non lo tocca il proxy» da «non lo tocca nessuno»: un
 * dev server sul computer lo apre benissimo il browser vero, che gira lì.
 * @param {URL} url
 * @returns {{ok:true}|{ok:false, motivo:string, locale?:boolean}}
 */
export function bersaglioAmmesso(url) {
  const base = urlAmmesso(url);
  if (!base.ok) return base;
  const motivo = indirizzoLocale(url.hostname);
  if (motivo) return { ok: false, motivo, locale: true };
  return { ok: true };
}

/* ─────────────── quale delle tre vie ─────────────── */

const SEGNI_NEL_PERCORSO = /(^|\/)(login|log-in|signin|sign-in|accedi|auth|oauth|oauth2|sso|session|account|accounts)(\/|$)/i;
const SEGNI_NEL_MOTIVO = /(401|403|login|accesso|autentic|credenzial|sessione|cookie|non autorizzat)/i;

/**
 * Riconosce una pagina che senza cookie non mostrerebbe niente di utile. Il
 * proxy non inoltra credenziali per costruzione, quindi lì farebbe vedere solo
 * il muro dell'accesso: quella pagina è del browser vero, che ha un profilo suo.
 * @param {{url?:string, motivo?:string|null}} dati
 */
export function dietroLogin({ url = '', motivo = null } = {}) {
  if (motivo && SEGNI_NEL_MOTIVO.test(String(motivo))) return true;
  let indirizzo;
  try { indirizzo = new URL(String(url)); } catch { return false; }
  if (SEGNI_NEL_PERCORSO.test(indirizzo.pathname)) return true;
  return /^(accounts?|login|auth|signin|sso|my)\./i.test(indirizzo.hostname);
}

/**
 * La scelta della corsia. Regola d'oro: la via più economica che funziona.
 * @param {{incorniciabile?:boolean, motivo?:string|null, url?:string, proxyDisponibile?:boolean, vivoDisponibile?:boolean}} dati
 * @returns {{via:'cornice'|'proxy'|'vivo', perche:string}}
 */
export function decidiVia({ incorniciabile, motivo = null, url = '', proxyDisponibile = true, vivoDisponibile = false } = {}) {
  if (incorniciabile === true) {
    return { via: 'cornice', perche: 'La pagina si lascia incorniciare: è la via più economica — nessun proxy da attraversare, nessun browser da avviare' };
  }
  let bersaglio = null;
  try { bersaglio = new URL(String(url)); } catch { bersaglio = null; }
  const ammesso = bersaglio ? bersaglioAmmesso(bersaglio) : { ok: false, motivo: 'Indirizzo non valido' };
  if (!ammesso.ok) {
    if (ammesso.locale && vivoDisponibile) return { via: 'vivo', perche: `${ammesso.motivo}: il proxy non tocca gli indirizzi privati, ma il browser vero gira sul tuo computer e ci arriva` };
    if (ammesso.locale) return { via: 'cornice', perche: `${ammesso.motivo}: il proxy non lo tocca e il browser vero non è disponibile` };
    return { via: 'cornice', perche: `${ammesso.motivo}: nessuna corsia lo migliora` };
  }
  if (dietroLogin({ url, motivo })) {
    if (vivoDisponibile) return { via: 'vivo', perche: 'Sembra una pagina dietro accesso: il proxy non inoltra i tuoi cookie, quindi mostrerebbe solo il modulo di accesso — il browser vero ha un profilo suo dove puoi entrare' };
    if (proxyDisponibile) return { via: 'proxy', perche: 'Sembra dietro accesso e il browser vero non è disponibile: il proxy la mostrerà come la vede chi l\'accesso non l\'ha fatto' };
    return { via: 'cornice', perche: 'Sembra dietro accesso e non c\'è né il proxy né il browser vero' };
  }
  if (proxyDisponibile) return { via: 'proxy', perche: `${motivo || 'La pagina vieta la cornice'}: la passiamo dal proxy, su un'origine separata dalla nostra` };
  if (vivoDisponibile) return { via: 'vivo', perche: `${motivo || 'La pagina vieta la cornice'}: il proxy non è disponibile, la apre il browser vero` };
  return { via: 'cornice', perche: `${motivo || 'La pagina vieta la cornice'}: senza proxy né browser vero la cornice resterà quasi certamente vuota` };
}

/* ─────────────── le intestazioni ─────────────── */

function coppieDa(intestazioni) {
  if (!intestazioni) return [];
  if (typeof intestazioni.entries === 'function') return [...intestazioni.entries()];
  if (typeof intestazioni.get === 'function') return NOMI_SONDATI.map((n) => [n, intestazioni.get(n)]).filter(([, v]) => v != null && v !== '');
  return Object.entries(intestazioni).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)]);
}

/** Legge una singola intestazione da una qualunque delle tre forme (Headers, `{get}`, oggetto). */
export function prendiIntestazione(intestazioni, nome) {
  const cercato = String(nome).toLowerCase();
  const trovata = coppieDa(intestazioni).find(([k]) => String(k).toLowerCase() === cercato);
  return trovata ? String(trovata[1]) : null;
}

/**
 * Toglie la SOLA direttiva `frame-ancestors`, lasciando in piedi tutto il resto.
 * Una intestazione CSP può portare più politiche separate da virgola: si
 * trattano una per una, e nel browser continuano a intersecarsi.
 * @returns {{csp:string, tolta:boolean}}
 */
export function senzaFrameAncestors(valore) {
  const testo = String(valore || '');
  let tolta = false;
  const csp = testo.split(',').map((politica) => {
    const direttive = politica.split(';').map((d) => d.trim()).filter(Boolean);
    const restano = direttive.filter((d) => {
      const eLei = /^frame-ancestors\b/i.test(d);
      if (eLei) tolta = true;
      return !eLei;
    });
    return restano.join('; ');
  }).filter(Boolean).join(', ');
  return { csp, tolta };
}

/**
 * Aggiunge UNA origine esatta alle sorgenti di script, così l'overlay può
 * partire anche dentro una pagina con una CSP severa. È un allargamento minimo e
 * dichiarato — l'opposto di cancellare la politica.
 * ⛔ Con `strict-dynamic` in politica il browser ignora le sorgenti per host: lì
 * l'overlay non parte, e quella pagina è del browser vero.
 */
export function permettiScriptDa(csp, origine) {
  const testo = String(csp || '').trim();
  if (!testo) return testo;
  let org = String(origine || '').trim();
  try { org = new URL(org).origin; } catch { /* accettiamo anche un'origine già nuda */ }
  if (!org) return testo;
  return testo.split(',').map((politica) => {
    const direttive = politica.split(';').map((d) => d.trim()).filter(Boolean);
    let toccata = false;
    for (let i = 0; i < direttive.length; i += 1) {
      if (/^script-src(-elem)?\b/i.test(direttive[i])) {
        if (!direttive[i].toLowerCase().includes(org.toLowerCase())) direttive[i] = `${direttive[i]} ${org}`;
        toccata = true;
      }
    }
    if (!toccata) {
      const predefinita = direttive.find((d) => /^default-src\b/i.test(d));
      /* `script-src` non eredita da `default-src` una volta che esiste: si copia il valore e ci si aggiunge la nostra origine, così nient'altro cambia */
      if (predefinita) direttive.push(`script-src ${predefinita.replace(/^default-src\s*/i, '').trim()} ${org}`.trim());
    }
    return direttive.join('; ');
  }).join(', ');
}

/**
 * @param {Headers|{get:Function}|Record<string,string>} headers
 * @returns {{tolte:string[], tenute:Record<string,string>}}
 */
export function intestazioniDaTogliere(headers) {
  const tolte = [];
  const tenute = {};
  for (const [nome0, valore0] of coppieDa(headers)) {
    const nome = String(nome0).toLowerCase();
    const valore = Array.isArray(valore0) ? valore0.join(', ') : String(valore0);
    if (INTESTAZIONI_MAI_INOLTRATE.includes(nome)) { tolte.push(nome); continue; }
    if (nome === 'content-security-policy' || nome === 'content-security-policy-report-only') {
      const { csp, tolta } = senzaFrameAncestors(valore);
      if (tolta) tolte.push(`${nome}: frame-ancestors`);
      if (csp) tenute[nome] = csp;
      else if (tolta) tolte.push(nome); /* c'era solo frame-ancestors: non resta niente da mandare */
      else tenute[nome] = valore;
      continue;
    }
    tenute[nome] = valore;
  }
  return { tolte, tenute };
}

/* ─────────────── il documento ─────────────── */

const virgolette = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/* ⛔ `String.replace` con una stringa mangia i `$` (lezione 02/09): qui i sostituti sono SEMPRE funzioni. */
function riscriviTagConIntegrity(html) {
  return html.replace(/<(script|link)\b[^>]*>/gi, (tag) => {
    if (!/\sintegrity\s*=/i.test(tag)) return tag;
    if (/\scrossorigin(\s*=|[\s/>])/i.test(tag)) return tag;
    return tag.replace(/\s*(\/?)>$/, (_fine, barra) => ` crossorigin="anonymous"${barra ? ' /' : ''}>`);
  });
}

function riscriviMetaCsp(html, origineScript) {
  return html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, (tag) => tag.replace(/(content\s*=\s*)("([^"]*)"|'([^']*)')/i, (_intero, prefisso, _tutto, dop, sing) => {
    const valore = dop !== undefined ? dop : (sing || '');
    const nuovo = permettiScriptDa(senzaFrameAncestors(valore).csp, origineScript);
    return `${prefisso}"${virgolette(nuovo)}"`;
  }));
}

/**
 * Prepara il documento per la cornice: `<base>` sull'origine vera (così le
 * sottorisorse continuano a caricarsi dal sito, e nessun byte loro passa da noi
 * a rompere le impronte `integrity`), l'overlay in testa, `frame-ancestors`
 * fuori anche dal `<meta>` — dove per giunta il browser la ignora già (MDN «CSP
 * frame-ancestors», letto il 07/09/2026: in un meta tag la direttiva non ha
 * effetto, la decisione sulla cornice è già stata presa) — e `crossorigin`
 * aggiunto dove c'è `integrity`.
 * @param {string} html
 * @param {{urlPagina:string, origineProxy?:string}} dati
 */
export function riscriviHtml(html, { urlPagina, origineProxy = '' } = {}) {
  let s = String(html);
  s = riscriviMetaCsp(s, origineProxy);
  s = riscriviTagConIntegrity(s);
  const base = /<base\b[^>]*href\s*=/i.test(s) ? '' : `<base href="${virgolette(urlPagina)}">`;
  const overlay = origineProxy ? `<script src="${virgolette(String(origineProxy).replace(/\/+$/, ''))}/annota.js" data-talos-url="${virgolette(urlPagina)}"></script>` : '';
  const iniezione = `${base}${overlay}`;
  if (!iniezione) return s;
  if (/<head\b[^>]*>/i.test(s)) return s.replace(/<head\b[^>]*>/i, (apertura) => `${apertura}${iniezione}`);
  if (/<html\b[^>]*>/i.test(s)) return s.replace(/<html\b[^>]*>/i, (apertura) => `${apertura}<head>${iniezione}</head>`);
  return `${iniezione}${s}`;
}

/** L'indirizzo con cui la cornice chiede una pagina al proxy. Un bersaglio che il proxy non tocca non deve nemmeno avere un link: qui si alza un errore. */
export function urlProxato(origineProxy, url) {
  const base = String(origineProxy || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+/i.test(base)) throw new Error('Origine del proxy non valida');
  let bersaglio;
  try { bersaglio = new URL(String(url)); } catch { throw new Error('Indirizzo non valido'); }
  const ammesso = bersaglioAmmesso(bersaglio);
  if (!ammesso.ok) throw new Error(ammesso.motivo);
  return `${base}/vai?u=${encodeURIComponent(bersaglio.href)}`;
}

/* ─────────────── chi va a prendere la pagina ─────────────── */

/**
 * Il lettore predefinito. Segue i reindirizzamenti A MANO, un salto per volta,
 * ricontrollando l'indirizzo a ogni salto: con `redirect: 'follow'` vedremmo solo
 * la destinazione finale, e un 302 verso `169.254.169.254` sarebbe già partito.
 * Niente cookie e niente credenziali: `fetch` di Node non ha un barattolo, e lo
 * diciamo comunque con `credentials: 'omit'`.
 */
export async function leggiPagina(indirizzo, { fetchFn = globalThis.fetch, millisecondi = MILLISECONDI_MASSIMI, saltiMassimi = SALTI_MASSIMI, ammesso = bersaglioAmmesso } = {}) {
  let url;
  try { url = new URL(String(indirizzo)); } catch { return { ok: false, motivo: 'Indirizzo non valido' }; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), millisecondi);
  try {
    for (let salto = 0; salto <= saltiMassimi; salto += 1) {
      const via = ammesso(url);
      if (!via.ok) return { ok: false, motivo: via.motivo, locale: via.locale === true };
      const risposta = await fetchFn(url.href, { method: 'GET', redirect: 'manual', credentials: 'omit', signal: controller.signal, headers: { accept: 'text/html,*/*;q=0.5', 'user-agent': AGENTE } });
      const stato = Number(risposta.status || 0);
      if (stato >= 300 && stato < 400) {
        const dove = prendiIntestazione(risposta.headers, 'location');
        try { await risposta.body?.cancel?.(); } catch { /* niente da liberare */ }
        if (!dove) return { ok: false, motivo: `Reindirizzamento senza destinazione (${stato})` };
        try { url = new URL(dove, url); } catch { return { ok: false, motivo: 'Reindirizzamento verso un indirizzo non valido' }; }
        continue;
      }
      const tipo = String(prendiIntestazione(risposta.headers, 'content-type') || '');
      if (!/text\/html/i.test(tipo)) {
        try { await risposta.body?.cancel?.(); } catch { /* niente da liberare */ }
        return { ok: true, url: url.href, stato, intestazioni: risposta.headers, corpo: '', tipo };
      }
      const testo = await risposta.text();
      if (testo.length > BYTE_MASSIMI) return { ok: false, motivo: 'La pagina supera i 5 MB' };
      return { ok: true, url: url.href, stato, intestazioni: risposta.headers, corpo: testo, tipo };
    }
    return { ok: false, motivo: `Più di ${saltiMassimi} reindirizzamenti` };
  } catch (errore) {
    return { ok: false, motivo: errore?.name === 'AbortError' ? `Nessuna risposta entro ${Math.round(millisecondi / 1000)} secondi` : 'La pagina non risponde' };
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────── il server sulla porta sua ─────────────── */

async function ascolta(server, porta, ospite, ripiego) {
  const prova = (indirizzo) => new Promise((risolvi, rifiuta) => {
    const suErrore = (e) => { server.removeListener('listening', suAscolto); rifiuta(e); };
    const suAscolto = () => { server.removeListener('error', suErrore); risolvi(indirizzo); };
    server.once('error', suErrore);
    server.once('listening', suAscolto);
    server.listen(porta, indirizzo);
  });
  try {
    return { ospite: await prova(ospite), cookieCondiviso: false };
  } catch (errore) {
    if (ospite === ripiego) throw errore;
    /* macOS non lega 127.0.0.2 senza un alias su lo0: si ripiega, e lo si DICE a chi chiama */
    return { ospite: await prova(ripiego), cookieCondiviso: true };
  }
}

/**
 * Accende il proxy su una porta sua. `leggi` è iniettato: i test non toccano la
 * rete. La chiave nel percorso non cambia l'origine (quella la fa la porta): serve
 * solo perché un altro programma sul computer non possa usarci come proxy aperto.
 * @param {{porta?:number, leggi:Function, ammesso?:Function, ospite?:string, origineOspite?:string|null, scriptOverlay?:string, chiave?:string}} opzioni
 * @returns {Promise<{porta:number, origine:string, ospite:string, cookieCondiviso:boolean, chiave:string, chiudi:()=>Promise<void>}>}
 */
export async function creaServerProxy({ porta = 0, leggi, ammesso = bersaglioAmmesso, ospite = OSPITE_SEPARATO, origineOspite = null, scriptOverlay = SCRIPT_OVERLAY_PREDEFINITO, chiave = randomBytes(16).toString('hex') } = {}) {
  if (typeof leggi !== 'function') throw new TypeError('creaServerProxy vuole «leggi»: chi va a prendere la pagina');
  const prefisso = `/s/${chiave}`;
  let origine = '';

  const server = http.createServer((req, res) => {
    const rispondi = (stato, testo) => {
      res.writeHead(stato, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end(testo);
    };
    (async () => {
      if (req.method !== 'GET') return rispondi(405, 'Il proxy risponde solo a GET');
      let percorso;
      try { percorso = new URL(req.url, 'http://proxy.invalido'); } catch { return rispondi(400, 'Richiesta non valida'); }
      if (!percorso.pathname.startsWith(`${prefisso}/`)) return rispondi(404, 'Qui non c\'è niente');
      const resto = percorso.pathname.slice(prefisso.length);
      if (resto === '/annota.js') {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
        res.end(scriptOverlay);
        return undefined;
      }
      if (resto !== '/vai') return rispondi(404, 'Qui non c\'è niente');
      const chiesto = percorso.searchParams.get('u');
      if (!chiesto) return rispondi(400, 'Manca l\'indirizzo da mostrare');
      let bersaglio;
      try { bersaglio = new URL(chiesto); } catch { return rispondi(400, 'Indirizzo non valido'); }
      const via = ammesso(bersaglio);
      if (!via.ok) return rispondi(403, via.motivo);
      let pagina;
      try { pagina = await leggi(bersaglio.href); } catch { pagina = { ok: false, motivo: 'La pagina non risponde' }; }
      if (!pagina || pagina.ok === false) return rispondi(502, pagina?.motivo || 'La pagina non risponde');
      const tipo = String(pagina.tipo || prendiIntestazione(pagina.intestazioni, 'content-type') || '');
      if (!/text\/html/i.test(tipo)) return rispondi(415, 'Il proxy passa solo il documento HTML: script, stili e immagini si caricano dal sito vero grazie a <base>');
      const { tolte, tenute } = intestazioniDaTogliere(pagina.intestazioni);
      const html = riscriviHtml(String(pagina.corpo || ''), { urlPagina: pagina.url || bersaglio.href, origineProxy: origine });
      const intestazioni = {
        ...tenute,
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-talos-tolte': tolte.join(', ') || 'nessuna',
        'x-talos-origine': pagina.url || bersaglio.href,
      };
      const delSito = tenute['content-security-policy'] ? permettiScriptDa(tenute['content-security-policy'], origine) : null;
      /* due politiche CSP si INTERSECANO nel browser: quella del sito (senza frame-ancestors) resta in piedi, la nostra dice soltanto chi può incorniciare */
      const nostra = origineOspite ? `frame-ancestors 'self' ${origineOspite}` : null;
      if (delSito && nostra) intestazioni['content-security-policy'] = [delSito, nostra];
      else if (delSito) intestazioni['content-security-policy'] = delSito;
      else if (nostra) intestazioni['content-security-policy'] = nostra;
      res.writeHead(200, intestazioni);
      res.end(html);
      return undefined;
    })().catch(() => {
      try { rispondi(500, 'Errore del proxy'); } catch { /* risposta già chiusa */ }
    });
  });

  const legato = await ascolta(server, porta, ospite, OSPITE_RIPIEGO);
  const portaVera = server.address().port;
  origine = `http://${legato.ospite}:${portaVera}${prefisso}`;
  return {
    porta: portaVera,
    origine,
    ospite: legato.ospite,
    cookieCondiviso: legato.cookieCondiviso,
    chiave,
    chiudi: () => new Promise((risolvi) => { server.close(() => risolvi()); }),
  };
}
