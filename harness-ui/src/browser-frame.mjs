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

/*
 * ⛔⛔⛔ 16/09/2026, P0 corsia B punto 4 — IL MOTIVO DEL GUASTO SI CLASSIFICA, non si schiaccia.
 *
 * Prima di oggi qui c'erano DUE frasi per tutti i guasti del mondo: «Nessuna risposta entro 6
 * secondi» per l'abort e «La pagina non risponde» per qualunque altra cosa. Il danno non era la
 * genericità: era che `components/browser.js` sceglie il RIMEDIO leggendo questo motivo
 * (`rimedioPerIlMotivo`, quattro espressioni regolari) e nessuna delle due frasi ne incrociava
 * una ⇒ per un indirizzo scritto male usciva «chiedi all'agente di leggerla», che è un consiglio
 * falso: un nome che non esiste non lo risolve nemmeno l'agente.
 *
 * Ricerca 16/09/2026:
 *   · nodejs/undici #1603 e #2362 — con `fetch` di Node il guasto vero NON sta in `errore.message`
 *     ('fetch failed' per tutti) ma in `errore.cause.code`: ENOTFOUND/EAI_AGAIN (nome), ECONNREFUSED
 *     (porta chiusa), UND_ERR_CONNECT_TIMEOUT/ETIMEDOUT (scadenza), ECONNRESET (caduta);
 *   · MDN «AbortSignal» — `AbortError` (annullato da noi) e `TimeoutError` sono due fatti distinti;
 *   · AWS Architecture Blog «Exponential Backoff And Jitter» — si ritenta ciò che è TRANSITORIO.
 *
 * ⛔ Le frasi qui sotto sono scritte per INCROCIARE i rimedi del client: cambiarle senza guardare
 *   `rimedioPerIlMotivo` rimette il difetto. La prova le tiene ferme da tutt'e due i lati.
 */
const CODICI = [
  [/^(ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED)$/i, 'dns', 'Questo indirizzo non esiste'],
  [/^(ECONNREFUSED)$/i, 'rifiuto', 'Nessuno risponde a questo indirizzo'],
  [/^(UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|ETIMEDOUT)$/i, 'timeout', null],
  [/CERT|SELF_SIGNED|TLS|SSL|ERR_SSL/i, 'certificato', 'Il sito ha un certificato non valido'],
  [/^(ECONNRESET|EPIPE|EHOSTUNREACH|ENETUNREACH|EPROTO|UND_ERR_SOCKET)$/i, 'rete', 'Non sono riuscito a raggiungere il sito'],
];

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — LA FRASE NON È IL DATO: IL DATO È `genere` + `dettagli`.
 *
 * Bocciatura del controllore, con la prova in mano: le foto consegnate mostravano il pannello
 * dello stato con il titolo in INGLESE («I could not open this page») sopra il motivo in ITALIANO
 * («Il sito non ha risposto in tempo (6 secondi)»). Il commit dichiarava quel difetto riparato, e
 * le foto lo smentivano.
 *
 * La causa NON era una riga dimenticata nel dizionario: era qui. Questa funzione componeva la
 * frase interpolando un NUMERO, e il client la passava a `t()`, che è un dizionario a chiavi
 * fisse. Una chiave che contiene «6» non ci sarà mai — e nemmeno quella con «11», e nemmeno
 * nessun'altra: il difetto era strutturale e nessuna traduzione lo avrebbe chiuso.
 *
 * Ricerca 16/09/2026 — api-craft «Shall REST API error messages be internationalized?»:
 * «locale-neutral errors with well-defined error values… allows the consumer to localize the
 * message and reduces the pain of trying to match up strings between systems». ⇒ Il server manda
 * ciò che SA (il genere del guasto e i suoi parametri); la frase per chi guarda la compone chi
 * disegna, nella lingua di chi guarda.
 *
 * ⛔ `motivo` resta, e resta in italiano: è la DIAGNOSTICA (log, rotta, taccuino) e la rete di
 *   sicurezza per un client vecchio. Non è più ciò che finisce a schermo — quello lo decide
 *   `frasePerGenere` in `components/browser.js`, e una prova lo tiene fermo dai due lati.
 */

/**
 * Dice CHE COSA è andato storto: un genere stabile, i suoi parametri, e una frase di diagnostica.
 * @param {unknown} errore l'errore di `fetch` (il codice vero sta in `errore.cause.code`)
 * @param {{millisecondi?:number}} [opzioni]
 * @returns {{genere:'timeout'|'dns'|'rifiuto'|'certificato'|'rete', motivo:string, dettagli:object}}
 */
export function classificaGuasto(errore, { millisecondi = MILLISECONDI_MASSIMI } = {}) {
  const secondi = Math.round(millisecondi / 1000);
  const scaduto = { genere: 'timeout', motivo: `Il sito non ha risposto in tempo (${secondi} secondi)`, dettagli: { secondi } };
  const nome = String(errore?.name || '');
  if (nome === 'AbortError' || nome === 'TimeoutError') return scaduto;
  const codice = String(errore?.cause?.code || errore?.code || '');
  for (const [prova, genere, motivo] of CODICI) {
    if (prova.test(codice)) return genere === 'timeout' ? scaduto : { genere, motivo, dettagli: {} };
  }
  return { genere: 'rete', motivo: 'Non sono riuscito a raggiungere il sito', dettagli: {} };
}

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — «C'È UN GENERE» NON VUOL DIRE «NON CI SONO ARRIVATO».
 *
 * Trovato rileggendo la cura, non da un rosso. Dando un `genere` anche ai RIFIUTI (che serviva per
 * poterli dire in due lingue), le due righe del client che decidono lo stato diventavano sbagliate:
 * dicevano `esito?.genere ? 'irraggiungibile' : …`, cioè leggevano la PRESENZA di un genere come
 * «non ci sono arrivato». Un sito che risponde benissimo e dice soltanto «non mi far vedere dentro
 * una cornice» sarebbe diventato «non sono riuscito ad aprire questa pagina», con «Riprova» acceso
 * su una cosa che riprovare non cambia — invece di ripiegare sul testo dell'agente, che è la cosa
 * giusta e non è un guasto.
 *
 * ⇒ La distinzione si NOMINA qui, una volta sola, accanto a chi assegna i generi. Chi aggiunge un
 *   genere nuovo deve passare da questo elenco, e la prova gliene chiede conto dai due lati.
 */
const GUASTI = new Set(['timeout', 'dns', 'rifiuto', 'certificato', 'rete', 'indirizzo']);

/**
 * Vero se il genere dice «non ci sono arrivato» (guasto), falso se dice «il sito ha risposto e ha
 * detto di no» (rifiuto della cornice) o se non c'è nessun genere.
 * @param {string|null|undefined} genere
 */
export function eUnGuasto(genere) { return GUASTI.has(String(genere || '')); }

/**
 * Un guasto TRANSITORIO si ritenta; un nome che non esiste o un certificato scaduto no — riprovare
 * non li cambia, e un ritentativo inutile è tempo tolto a chi guarda lo schermo.
 * @param {string|null} genere
 */
export function siRitenta(genere) {
  return genere === 'timeout' || genere === 'rete' || genere === 'rifiuto';
}

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
 *
 * ⛔ 16/09, giro di riparazione — anche un RIFIUTO porta il suo `genere`. Prima il genere esisteva
 *   solo per i guasti di rete, e il client, per un rifiuto, non aveva altro che la frase italiana
 *   del server: la mostrava così com'era anche a chi guarda in inglese. Un rifiuto è un esito
 *   nominabile quanto un timeout, e nominarlo è ciò che permette di dirlo in due lingue.
 * @param {{get(nome:string):string|null}} headers
 * @param {string} origineNostra es. `http://127.0.0.1:4174`
 * @returns {{incorniciabile:boolean, motivo:string|null, genere:string|null}}
 */
export function valutaIntestazioni(headers, origineNostra) {
  const csp = String(headers.get('content-security-policy') || '');
  const direttiva = csp.split(';').map((d) => d.trim()).find((d) => /^frame-ancestors\b/i.test(d));
  if (direttiva) {
    const sorgenti = direttiva.replace(/^frame-ancestors\s*/i, '').split(/\s+/).filter(Boolean).map((s) => s.replace(/^'|'$/g, '').toLowerCase());
    if (sorgenti.includes('*')) return { incorniciabile: true, motivo: null, genere: null };
    const nostra = (() => { try { return new URL(origineNostra); } catch { return null; } })();
    const ammessa = sorgenti.some((s) => {
      if (s === 'none') return false;
      if (s === 'self') return false; // «self» è l'origine della pagina, non la nostra
      if (!nostra) return false;
      if (s === nostra.origin.toLowerCase()) return true;
      if (s === `${nostra.protocol}` || s === `${nostra.protocol}//*`) return true;
      return s.startsWith('*.') && nostra.hostname.toLowerCase().endsWith(s.slice(1));
    });
    return ammessa
      ? { incorniciabile: true, motivo: null, genere: null }
      : { incorniciabile: false, motivo: 'La pagina dichiara «frame-ancestors» e non include TALOS', genere: 'frame-ancestors' };
  }
  const xfo = String(headers.get('x-frame-options') || '').trim().toUpperCase();
  if (xfo === 'DENY') return { incorniciabile: false, motivo: 'La pagina vieta ogni cornice (X-Frame-Options: DENY)', genere: 'xfo-deny' };
  if (xfo === 'SAMEORIGIN') return { incorniciabile: false, motivo: 'La pagina si mostra solo dentro il suo stesso sito (X-Frame-Options: SAMEORIGIN)', genere: 'xfo-sameorigin' };
  return { incorniciabile: true, motivo: null, genere: null };
}

/**
 * @param {string} indirizzo
 * @param {{fetchFn?:typeof fetch, origineNostra:string, millisecondi?:number}} deps
 * @returns {Promise<{url:string, incorniciabile:boolean, motivo:string|null, stato:number|null, titolo:string|null, genere:string|null, dettagli:object}>}
 */
export async function verificaIncorniciabile(indirizzo, { fetchFn = globalThis.fetch, origineNostra, millisecondi = MILLISECONDI_MASSIMI } = {}) {
  let url;
  // ⛔ 16/09 — `genere: 'indirizzo'`: non è un guasto di rete, non si ritenta, e il rimedio è guardare ciò che si è scritto.
  try { url = new URL(String(indirizzo)); } catch { return { url: String(indirizzo), incorniciabile: false, motivo: 'URL non valido', stato: null, titolo: null, genere: 'indirizzo', dettagli: {} }; }
  const ammesso = urlAmmesso(url);
  if (!ammesso.ok) return { url: url.href, incorniciabile: false, motivo: ammesso.motivo, stato: null, titolo: null, genere: 'indirizzo', dettagli: {} };
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
    return { url: risposta.url || url.href, incorniciabile: esito.incorniciabile, motivo: esito.motivo, stato: risposta.status, titolo, genere: esito.genere ?? null, dettagli: {} };
  } catch (errore) {
    // ⛔ 16/09 — il guasto si NOMINA (vedi `classificaGuasto` in testa al file): timeout, nome
    //   inesistente, porta chiusa e certificato portano rimedi diversi, e ritentarli ha senso solo
    //   per due di loro. Prima uscivano tutti con la stessa frase, che non incrociava nessun rimedio.
    const { genere, motivo, dettagli } = classificaGuasto(errore, { millisecondi });
    return { url: url.href, incorniciabile: false, motivo, stato: null, titolo: null, genere, dettagli };
  } finally {
    clearTimeout(timer);
  }
}
