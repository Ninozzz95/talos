/**
 * browser-frame.mjs — K-I (06/09). Dice se una pagina PUÒ essere mostrata dentro
 * TALOS in una cornice (`<iframe>`), prima di provarci: il browser non espone al
 * codice della pagina il motivo per cui una cornice resta vuota, quindi la
 * risposta la dà il server leggendo le intestazioni della pagina.
 *
 * Fonti (lette il 06/09/2026): MDN «X-Frame-Options» — `DENY` e `SAMEORIGIN`
 * vietano la cornice da un'altra origine, `ALLOW-FROM` è deprecato e i browser
 * lo ignorano; MDN «CSP frame-ancestors» — se presente PREVALE su X-Frame-Options,
 * e una lista che non contiene la nostra origine (né `*`) vieta la cornice.
 * Una webview Electron eviterebbe il problema; qui il guscio è un
 * browser, e la regola dei siti si rispetta, non si aggira.
 *
 * ⛔ Solo `http:`/`https:`, mai credenziali nell'URL, un tempo massimo, e il corpo
 * della risposta si butta: servono le intestazioni, non la pagina.
 */

export const MILLISECONDI_MASSIMI = 6_000;

/**
 * @param {URL} url
 * @returns {{ok:true}|{ok:false, motivo:string}}
 */
export function urlAmmesso(url) {
  if (!(url instanceof URL)) return { ok: false, motivo: 'URL non valido' };
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, motivo: 'Solo http e https' };
  if (url.username || url.password) return { ok: false, motivo: 'Niente credenziali nell\'indirizzo' };
  return { ok: true };
}

/**
 * Valuta le intestazioni di una risposta per un'origine che vuole incorniciarla.
 * @param {{get(nome:string):string|null}} headers
 * @param {string} origineNostra es. `http://127.0.0.1:4174`
 * @returns {{incorniciabile:boolean, motivo:string|null}}
 */
export function valutaIntestazioni(headers, origineNostra) {
  const csp = String(headers.get('content-security-policy') || '');
  const direttiva = csp.split(';').map((d) => d.trim()).find((d) => /^frame-ancestors\b/i.test(d));
  if (direttiva) {
    const sorgenti = direttiva.replace(/^frame-ancestors\s*/i, '').split(/\s+/).filter(Boolean).map((s) => s.replace(/^'|'$/g, '').toLowerCase());
    if (sorgenti.includes('*')) return { incorniciabile: true, motivo: null };
    const nostra = (() => { try { return new URL(origineNostra); } catch { return null; } })();
    const ammessa = sorgenti.some((s) => {
      if (s === 'none') return false;
      if (s === 'self') return false; // «self» è l'origine della pagina, non la nostra
      if (!nostra) return false;
      if (s === nostra.origin.toLowerCase()) return true;
      if (s === `${nostra.protocol}` || s === `${nostra.protocol}//*`) return true;
      return s.startsWith('*.') && nostra.hostname.toLowerCase().endsWith(s.slice(1));
    });
    return ammessa ? { incorniciabile: true, motivo: null } : { incorniciabile: false, motivo: 'La pagina dichiara «frame-ancestors» e non include TALOS' };
  }
  const xfo = String(headers.get('x-frame-options') || '').trim().toUpperCase();
  if (xfo === 'DENY') return { incorniciabile: false, motivo: 'La pagina vieta ogni cornice (X-Frame-Options: DENY)' };
  if (xfo === 'SAMEORIGIN') return { incorniciabile: false, motivo: 'La pagina si mostra solo dentro il suo stesso sito (X-Frame-Options: SAMEORIGIN)' };
  return { incorniciabile: true, motivo: null };
}

/**
 * @param {string} indirizzo
 * @param {{fetchFn?:typeof fetch, origineNostra:string, millisecondi?:number}} deps
 * @returns {Promise<{url:string, incorniciabile:boolean, motivo:string|null, stato:number|null, titolo:string|null}>}
 */
export async function verificaIncorniciabile(indirizzo, { fetchFn = globalThis.fetch, origineNostra, millisecondi = MILLISECONDI_MASSIMI } = {}) {
  let url;
  try { url = new URL(String(indirizzo)); } catch { return { url: String(indirizzo), incorniciabile: false, motivo: 'URL non valido', stato: null, titolo: null }; }
  const ammesso = urlAmmesso(url);
  if (!ammesso.ok) return { url: url.href, incorniciabile: false, motivo: ammesso.motivo, stato: null, titolo: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), millisecondi);
  try {
    const risposta = await fetchFn(url.href, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { accept: 'text/html,*/*;q=0.5', 'user-agent': 'TALOS-Harness-Desktop/0.1 (anteprima)' } });
    const esito = valutaIntestazioni(risposta.headers, origineNostra);
    let titolo = null;
    if (esito.incorniciabile && /text\/html/i.test(String(risposta.headers.get('content-type') || ''))) {
      /* il titolo per la scheda: si legge solo l'inizio del documento, mai la pagina intera */
      try {
        const lettore = risposta.body?.getReader?.();
        if (lettore) {
          let testo = ''; const decoder = new TextDecoder();
          while (testo.length < 16_000) { const { value, done } = await lettore.read(); if (done) break; testo += decoder.decode(value, { stream: true }); if (/<\/title>/i.test(testo)) break; }
          await lettore.cancel().catch(() => {});
          const m = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(testo);
          if (m) titolo = m[1].replace(/\s+/g, ' ').trim() || null;
        }
      } catch { /* il titolo è un di più */ }
    } else {
      try { await risposta.body?.cancel?.(); } catch { /* niente da liberare */ }
    }
    return { url: risposta.url || url.href, incorniciabile: esito.incorniciabile, motivo: esito.motivo, stato: risposta.status, titolo };
  } catch (errore) {
    const motivo = errore?.name === 'AbortError' ? `Nessuna risposta entro ${Math.round(millisecondi / 1000)} secondi` : 'La pagina non risponde';
    return { url: url.href, incorniciabile: false, motivo, stato: null, titolo: null };
  } finally {
    clearTimeout(timer);
  }
}
