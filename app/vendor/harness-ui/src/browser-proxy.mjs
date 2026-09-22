/**
 * browser-proxy.mjs — Il proxy locale (06/09) che rende una pagina di un
 * dev server LOCALE «della nostra origine», così dentro la cornice si può iniettare l'overlay di
 * annotazione e leggere il DOM (same-origin policy). Una webview Electron eviterebbe il problema;
 * in un guscio browser la strada è il proxy, come VS Code
 * Live Preview.
 *
 * ⛔ SOLO bersagli locali (localhost, 127.0.0.1, ::1): una pagina passata dal proxy gira nella
 * NOSTRA origine, quindi i suoi script vedono localStorage e cookie di TALOS. Per il dev server
 * dello sviluppatore è il suo stesso codice; per un sito remoto sarebbe consegnargli TALOS.
 * Un sito remoto resta nella cornice normale (altra origine, senza annotazione) o bloccato.
 *
 * Riscrittura (fonti lette il 06/09/2026: gist cprima «PHP proxy for iframe embedding», niutech
 * x-frame-bypass, usamaejaz «bypassing X-Frame-Options»): via le intestazioni X-Frame-Options e
 * Content-Security-Policy della pagina e il `<meta http-equiv="Content-Security-Policy">`;
 * `<base href>` sull'origine vera, così script, stili e immagini relativi si caricano dal dev
 * server; il nostro script in testa al `<head>` (cattura gli errori di console PRIMA degli script
 * della pagina). Al documento proxato NON si applica la CSP di TALOS (bloccherebbe gli script del
 * dev server): resta `frame-ancestors 'self'` — nessun altro può incorniciarlo.
 */
import { urlAmmesso, MILLISECONDI_MASSIMI, classificaGuasto } from './browser-frame.mjs'; // 16/09: il guasto si nomina in UN posto solo

export const BYTE_MASSIMI = 5 * 1024 * 1024;
export const SCRIPT_OVERLAY = '/talos/browser-annota.js';

/** Solo il computer dello sviluppatore: la pagina proxata gira nella nostra origine. */
export function bersaglioLocale(url) {
  const host = String(url?.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

/**
 * Riscrive il documento HTML per la cornice: niente CSP in pagina, `<base>` sull'origine vera, il
 * nostro script per primo nel `<head>`.
 * @param {string} html
 * @param {string} urlVero l'indirizzo della pagina (per `<base>` e per il segnale al genitore)
 * @param {string} origineNostra l'origine di TALOS: con `<base>` sul dev server, `/talos/…` andrebbe a finire LÀ — lo script si carica con l'indirizzo assoluto nostro (trovato dal vivo il 06/09: overlay assente)
 */
export function riscriviHtml(html, urlVero, origineNostra = '') {
  let s = String(html);
  s = s.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '');
  const haBase = /<base\b[^>]*href=/i.test(s);
  const iniezione = `${haBase ? '' : `<base href="${urlVero.replace(/"/g, '&quot;')}">`}<script src="${origineNostra.replace(/\/$/, '')}${SCRIPT_OVERLAY}" data-talos-url="${urlVero.replace(/"/g, '&quot;')}"></script>`;
  if (/<head[^>]*>/i.test(s)) s = s.replace(/<head[^>]*>/i, (m) => `${m}${iniezione}`);
  else if (/<html[^>]*>/i.test(s)) s = s.replace(/<html[^>]*>/i, (m) => `${m}<head>${iniezione}</head>`);
  else s = `${iniezione}${s}`;
  return s;
}

/**
 * @param {string} indirizzo
 * @param {{fetchFn?:typeof fetch, millisecondi?:number}} deps
 * @returns {Promise<{ok:true, html:string, url:string, stato:number}|{ok:false, codice:string, motivo:string, stato?:number}>}
 */
export async function proxyPagina(indirizzo, { fetchFn = globalThis.fetch, millisecondi = MILLISECONDI_MASSIMI, origineNostra = '' } = {}) {
  let url;
  try { url = new URL(String(indirizzo)); } catch { return { ok: false, codice: 'QUERY_INVALID', motivo: 'URL non valido' }; }
  const ammesso = urlAmmesso(url);
  if (!ammesso.ok) return { ok: false, codice: 'QUERY_INVALID', motivo: ammesso.motivo };
  if (!bersaglioLocale(url)) return { ok: false, codice: 'BROWSER_PROXY_SOLO_LOCALE', motivo: 'Il proxy con annotazione vale solo per un dev server sul tuo computer (localhost, 127.0.0.1)' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), millisecondi);
  try {
    const risposta = await fetchFn(url.href, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { accept: 'text/html,*/*;q=0.5', 'user-agent': 'TALOS-Harness-Desktop/0.1 (proxy locale)' } });
    const finale = (() => { try { return new URL(risposta.url || url.href); } catch { return url; } })();
    if (!bersaglioLocale(finale)) { try { await risposta.body?.cancel?.(); } catch { /* niente */ } return { ok: false, codice: 'BROWSER_PROXY_SOLO_LOCALE', motivo: 'La pagina ha reindirizzato fuori dal tuo computer' }; }
    const tipo = String(risposta.headers.get('content-type') || '');
    if (!/text\/html/i.test(tipo)) { try { await risposta.body?.cancel?.(); } catch { /* niente */ } return { ok: false, codice: 'BROWSER_PROXY_NON_HTML', motivo: `Non è una pagina HTML (${tipo.split(';')[0] || 'tipo ignoto'})`, stato: risposta.status }; }
    const lunghezza = Number(risposta.headers.get('content-length') || 0);
    if (lunghezza > BYTE_MASSIMI) { try { await risposta.body?.cancel?.(); } catch { /* niente */ } return { ok: false, codice: 'BROWSER_PROXY_TROPPO_GRANDE', motivo: 'La pagina supera i 5 MB', stato: risposta.status }; }
    const testo = await risposta.text();
    if (testo.length > BYTE_MASSIMI) return { ok: false, codice: 'BROWSER_PROXY_TROPPO_GRANDE', motivo: 'La pagina supera i 5 MB', stato: risposta.status };
    return { ok: true, html: riscriviHtml(testo, finale.href, origineNostra), url: finale.href, stato: risposta.status };
  } catch (errore) {
    /* ⛔ 16/09 — stessa cura di `browser-frame.mjs`, stessa tabella: su un dev server «non l'hai
       acceso» e «ci ho messo troppo» sono due gesti diversi per chi programma, e prima uscivano
       con la stessa frase. La classificazione è importata, non ricopiata. */
    /* ⛔ 16/09, giro di riparazione — passano anche i `dettagli` (i secondi di un timeout): il
       motivo qui è italiano e composto dal server, quindi chi disegna deve poter riscrivere la
       frase nella lingua di chi guarda invece di provare a tradurre una chiave che contiene un
       numero. Stessa cura del percorso della cornice, stesso contratto. */
    const { genere, motivo, dettagli } = classificaGuasto(errore, { millisecondi });
    return { ok: false, codice: 'BROWSER_PROXY_IRRAGGIUNGIBILE', motivo, genere, dettagli };
  } finally {
    clearTimeout(timer);
  }
}
