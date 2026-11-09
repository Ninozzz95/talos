/*
 * ⭐ Decisione 201 dell'owner (04/11/2026): l'ospite dell'attrezzo `browser_page`, gemello di `pagina-locale-ospite.mjs`.
 *   Forma: in-corso/FORMA-BROWSER-201-2026-11-04.md (OK di Performance, Mobile e CLI); nessuna conferma prima della lettura (decisione 205).
 * Legge la pagina che la PERSONA ha aperto nel Browser della conversazione — mai un indirizzo scelto dal modello — nell'ordine:
 *   1. nessuna pagina riportata ⇒ rifiuto;
 *   2. corsia viva (Chromium pilotato) con la scheda della finestra aperta ⇒ il testo RESO (`innerText` via CDP, la stessa lettura di
 *      `local_page`): ciò che la persona vede, anche dietro un accesso fatto lì;
 *   3. altrimenti un indirizzo pubblico ⇒ la copia pubblica con `leggiPaginaSicura` (la stessa di `naviga` e dell'allegato di prima),
 *      ripulita come la vista Browser (`testo-pagina.mjs`); il server non ha i cookie della persona, e la testa lo dice;
 *   4. questo computer o la rete locale, fuori dalla corsia viva ⇒ rifiuto, come l'allegato di prima (`/api/v1/browser/leggi`).
 * Hermes fa lo stesso con l'anteprima del suo pannello (`tools/preview_tool.py:43-69`, `right-rail/preview-active-tab.ts:1-10`).
 */

import { SCHEDA_DELLA_FINESTRA } from './pagina-locale-ospite.mjs';
import { trovaChromium } from './browser-vivo.mjs';
import { sembraHtml, testoLeggibile } from './testo-pagina.mjs';

export const VIE_DELLA_PAGINA = Object.freeze(['vivo', 'cornice', 'proxy']);
const CAMPI_DELLA_PAGINA = new Set(['url', 'titolo', 'via']);
export const MOTIVO_NESSUNA_PAGINA = 'No page is open in the Browser tab of TALOS.';
export const MOTIVO_PAGINA_LOCALE = 'This page is on this computer or the local network: TALOS does not read it from here. If it is a development server this conversation started, use local_page.';
/* I rifiuti della politica di `naviga` che dicono «non pubblico» (`validaUrlNaviga`, `ricercaPubblica` in talosHarness.mjs) */
const NON_PUBBLICO = /^TALOS_WEB_(?:URL_BLOCKED:(?:hostname|address|port)|ADDRESS_NOT_PUBLIC)\b/u;

/**
 * La pagina che il compositore riporta con un messaggio: `{ url, titolo, via }` pulito, `null` per «nessuna pagina», `undefined` per una
 * forma sbagliata (la rotta HTTP la rifiuta con QUERY_INVALID). `url` http(s) ≤ 2048, `titolo` stringa ≤ 300 o `null`, `via` fra tre.
 */
export function paginaBrowserValida(pagina) {
  if (pagina === null) return null;
  if (!pagina || typeof pagina !== 'object' || Array.isArray(pagina)) return undefined;
  if (Object.keys(pagina).some((k) => !CAMPI_DELLA_PAGINA.has(k))) return undefined;
  const { url, titolo = null, via } = pagina;
  if (typeof url !== 'string' || url.length > 2048 || !/^https?:\/\//iu.test(url)) return undefined;
  try { new URL(url); } catch { return undefined; }
  if (titolo !== null && (typeof titolo !== 'string' || titolo.length > 300)) return undefined;
  if (!VIE_DELLA_PAGINA.includes(via)) return undefined;
  return { url, titolo, via };
}

/* L'indirizzo da leggere senza utente e password (il server non li manda a nessuno) né frammento */
function daLeggere(url) {
  const u = new URL(url);
  u.username = '';
  u.password = '';
  u.hash = '';
  return u.toString();
}

/* Lo stesso documento: lo stesso indirizzo senza utente, password e frammento (`#` non cambia pagina); un indirizzo illeggibile no */
function stessaPagina(a, b) {
  try { return daLeggere(String(a)) === daLeggere(String(b)); } catch { return false; }
}

/**
 * Dove c'è un Chromium (il PC) l'attrezzo si offre; sul telefono no (forma, §6: «niente attrezzo»), come `local_page`
 * (`apriPaginaLocaleSeCeIlBrowser`). Si guarda UNA volta, all'avvio del server: il pannello del Browser aperto o chiuso non cambia niente.
 */
export function leggiPaginaBrowserSeCeIlBrowser(dipendenze, { trovaFn = trovaChromium } = {}) {
  let trovato = null;
  try { trovato = trovaFn(); } catch { trovato = null; }
  return trovato ? creaLeggiPaginaBrowser(dipendenze) : null;
}

/**
 * @param {{ browserVivoFn?: () => any, leggiPaginaFn: (url: string) => Promise<{ url?: string, corpo?: string }>, chiaveScheda?: string }} dipendenze
 *   funzioni e non valori: il browser nasce DOPO questa funzione nel server.
 * @returns {(richiesta: { pagina: { url: string, titolo: string|null, via: string } | null, segnale?: AbortSignal|null }) => Promise<object>}
 */
export function creaLeggiPaginaBrowser({ browserVivoFn = () => null, leggiPaginaFn, chiaveScheda = SCHEDA_DELLA_FINESTRA }) {
  return async ({ pagina = null, segnale = null } = {}) => {
    if (!pagina || typeof pagina.url !== 'string' || pagina.url === '') return { ok: false, motivo: MOTIVO_NESSUNA_PAGINA };
    segnale?.throwIfAborted?.();
    if (pagina.via === 'vivo') {
      const browser = browserVivoFn?.();
      let scheda = null;
      try { scheda = browser?.stato?.()?.schede?.find((s) => s?.sessionId === chiaveScheda) ?? null; } catch { scheda = null; }
      /* Revisione del blocco «chat e pagina» (05/11/2026, R-3): la scheda viva è UNA per finestra (`pagina-locale-ospite.mjs:33`); se
         un'altra chat, o la persona a giro in corso, l'ha portata altrove (la banca), il suo testo NON è la pagina detta dalla nota e
         non si restituisce: si guarda l'indirizzo prima di leggere (niente lettura inutile) e dopo (la scheda può cambiare nel mezzo),
         e si ripiega sulla copia pubblica dell'indirizzo detto. Nessuna carta nuova (regola 17). */
      if (browser && scheda && stessaPagina(scheda.url ?? pagina.url, pagina.url)) {
        const letta = await browser.leggi(chiaveScheda, { guarda: 'text' });
        const url = letta?.url ?? scheda.url ?? pagina.url;
        if (stessaPagina(url, pagina.url)) return { ok: true, url, titolo: pagina.titolo ?? null, testo: String(letta?.testo ?? '') };
      }
    }
    let letta;
    try {
      letta = await leggiPaginaFn(daLeggere(pagina.url));
    } catch (errore) {
      const codice = errore instanceof Error ? errore.message : String(errore);
      if (NON_PUBBLICO.test(codice)) return { ok: false, motivo: MOTIVO_PAGINA_LOCALE };
      return { ok: false, motivo: `The page could not be read: ${codice}.` };
    }
    segnale?.throwIfAborted?.();
    const corpo = String(letta?.corpo ?? '');
    return { ok: true, url: letta?.url ?? pagina.url, titolo: pagina.titolo ?? null, testo: sembraHtml(corpo) ? testoLeggibile(corpo) : corpo, copiaPubblica: true };
  };
}
