/**
 * Local-development HTML transport and annotation-script injection.
 * Target/redirect policy and the 5 MiB decoded-byte budget are enforced here.
 * Local content is NOT inherently trusted. Serving this HTML under the app's
 * origin does not provide isolation; F01/EXT-02 remains a separate release gate.
 */
import { urlAmmesso, MILLISECONDI_MASSIMI } from './browser-frame.mjs';

export const BYTE_MASSIMI = 5 * 1024 * 1024;
export const REDIRECT_MASSIMI = 5;
export const SCRIPT_OVERLAY = '/talos/browser-annota.js';

/** Loopback targets only; this is an egress policy, not a trust decision. */
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

/** Read the actual decoded body bytes before decoding text. No full-body fallback. */
async function leggiHtmlLimitato(response, signal) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const chunks = [];
  let bytes = 0;
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > BYTE_MASSIMI) {
        await reader.cancel('HTML body exceeds byte limit');
        const error = new Error('HTML body exceeds byte limit');
        error.code = 'BROWSER_PROXY_TROPPO_GRANDE';
        throw error;
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

async function scarta(response) {
  try { await response.body?.cancel?.(); } catch { /* Already closed or aborted. */ }
}

/**
 * F04/F07: bounded HTML bytes and policy checked before EVERY redirect request.
 * This transport does NOT by itself establish a safe origin for untrusted HTML.
 * Origin isolation and the annotation broker remain separate responsibilities.
 * @param {string} indirizzo
 * @param {{fetchFn?:typeof fetch, millisecondi?:number, origineNostra?:string}} deps
 */
export async function proxyPagina(indirizzo, { fetchFn = globalThis.fetch, millisecondi = MILLISECONDI_MASSIMI, origineNostra = '' } = {}) {
  let url;
  try { url = new URL(String(indirizzo)); } catch { return { ok: false, codice: 'QUERY_INVALID', motivo: 'URL non valido' }; }
  const ammesso = urlAmmesso(url);
  if (!ammesso.ok) return { ok: false, codice: 'QUERY_INVALID', motivo: ammesso.motivo };
  const rifiutoLocale = () => ({ ok: false, codice: 'BROWSER_PROXY_SOLO_LOCALE', motivo: 'Il proxy con annotazione vale solo per un dev server sul tuo computer (localhost, 127.0.0.1)' });
  if (!bersaglioLocale(url)) return rifiutoLocale();
  const budget = Number.isFinite(millisecondi) && millisecondi > 0 ? millisecondi : MILLISECONDI_MASSIMI;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  let status;
  try {
    let response;
    for (let hop = 0; ; hop++) {
      controller.signal.throwIfAborted();
      response = await fetchFn(url.href, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { accept: 'text/html,*/*;q=0.5', 'user-agent': 'TALOS-Harness-Desktop/0.1 (proxy locale)' },
      });
      status = response.status;
      const actual = response.url ? new URL(response.url) : url;
      // A transport that followed redirects silently cannot attest intermediate targets.
      if (response.redirected || !urlAmmesso(actual).ok || !bersaglioLocale(actual)) {
        await scarta(response); return rifiutoLocale();
      }
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      await scarta(response);
      if (!location || hop >= REDIRECT_MASSIMI) return { ok: false, codice: 'BROWSER_PROXY_REDIRECT', motivo: 'Reindirizzamento non valido o troppo lungo', stato: status };
      let next;
      try { next = new URL(location, url); } catch { return { ok: false, codice: 'BROWSER_PROXY_REDIRECT', motivo: 'Indirizzo di reindirizzamento non valido', stato: status }; }
      if (!urlAmmesso(next).ok) return { ok: false, codice: 'QUERY_INVALID', motivo: 'Il reindirizzamento usa un indirizzo non consentito', stato: status };
      if (!bersaglioLocale(next)) return rifiutoLocale();
      url = next;
    }
    const tipo = String(response.headers.get('content-type') || '');
    if (!/text\/html/i.test(tipo)) { await scarta(response); return { ok: false, codice: 'BROWSER_PROXY_NON_HTML', motivo: `Non è una pagina HTML (${tipo.split(';')[0] || 'tipo ignoto'})`, stato: status }; }
    const lunghezza = Number(response.headers.get('content-length') || 0);
    if (lunghezza > BYTE_MASSIMI) { await scarta(response); return { ok: false, codice: 'BROWSER_PROXY_TROPPO_GRANDE', motivo: 'La pagina supera i 5 MB', stato: status }; }
    const testo = await leggiHtmlLimitato(response, controller.signal);
    controller.signal.throwIfAborted();
    return { ok: true, html: riscriviHtml(testo, url.href, origineNostra), url: url.href, stato: status };
  } catch (errore) {
    if (errore?.code === 'BROWSER_PROXY_TROPPO_GRANDE') return { ok: false, codice: errore.code, motivo: 'La pagina supera i 5 MB', stato: status };
    return { ok: false, codice: 'BROWSER_PROXY_IRRAGGIUNGIBILE', motivo: controller.signal.aborted || errore?.name === 'AbortError' ? `Nessuna risposta entro ${Math.round(budget / 1000)} secondi` : 'La pagina non risponde' };
  } finally {
    clearTimeout(timer);
  }
}
