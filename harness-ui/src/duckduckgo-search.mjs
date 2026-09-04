/**
 * ⭐⭐⭐ 04/9 — R-03, RICERCA WEB SENZA CHIAVE (owner: «se è possibile dare al
 * modello modi per fare una ricerca web anche se una chiave non è impostata,
 * fallo»).
 *
 * DuckDuckGo non ha un'API pubblica: si legge la pagina HTML dell'endpoint
 * senza JavaScript (`html.duckduckgo.com/html/`), come fanno Hermes (`ddgs`)
 * e OpenClaw («unofficial HTML-based integration», docs 09/2026). Non è un
 * accordo con DuckDuckGo: è una pagina pubblica, e sotto uso automatico può
 * rispondere con un blocco o un CAPTCHA. ⇒ Fonte «senza chiave» dichiarata
 * come tale nelle Impostazioni, mai spacciata per un'API; quando DuckDuckGo
 * rifiuta, l'esito lo dice.
 *
 * Il markup è stato letto DAL VIVO il 04/09 (curl, 200, 32 KB) e la fixture
 * dei test è un ritaglio di quella risposta, non un HTML scritto a memoria:
 *   <a class="result__a" href="//duckduckgo.com/l/?uddg=<url-codificato>&rut=…">Titolo</a>
 *   <a class="result__snippet" href="…">Estratto con <b>grassetti</b></a>
 * L'URL vero sta nel parametro `uddg` del redirect: si decodifica, mai si
 * segue il redirect di DuckDuckGo.
 *
 * ⛔ Nessun host scelto dal modello: la destinazione è FISSA (DuckDuckGo) e
 * solo la query entra nella querystring. È lo stesso confine del kernel per
 * `web_search` (endpoint fisso del provider, URL del modello mai).
 */

export const DUCKDUCKGO_ENDPOINT = 'https://html.duckduckgo.com/html/';
/** Host sentinella: il kernel costruisce l'URL della fonte `custom` con questo host, e il trasporto iniettato lo riconosce. `.invalid` è riservato dallo standard: non esiste e non potrà mai risolvere. */
export const HOST_SENTINELLA_SENZA_CHIAVE = 'ricerca-senza-chiave.talos.invalid';
export const ENDPOINT_SENTINELLA_DUCKDUCKGO = `https://${HOST_SENTINELLA_SENZA_CHIAVE}/duckduckgo`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TALOS-Harness/0.1 (+https://github.com/Ninozzz95/talos)';
const MAX_BYTE = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

function decodificaEntita(testo) {
  return String(testo)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function urlDaRedirect(href) {
  const grezzo = String(href).replace(/&amp;/g, '&');
  const m = /[?&]uddg=([^&]+)/.exec(grezzo);
  const candidato = m ? decodeURIComponent(m[1]) : (grezzo.startsWith('//') ? `https:${grezzo}` : grezzo);
  try {
    const u = new URL(candidato);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}

/** Puro: dal testo HTML ai risultati nella forma che il kernel già legge per `custom` ({ url, title, content }). Mai lancia. */
export function analizzaHtmlDuckDuckGo(html, maxRisultati = 8) {
  const testo = typeof html === 'string' ? html : '';
  const risultati = [];
  const reTitolo = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const reSnippet = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const snippet = [];
  for (const m of testo.matchAll(reSnippet)) snippet.push(decodificaEntita(m[1]));
  let indice = 0;
  for (const m of testo.matchAll(reTitolo)) {
    const url = urlDaRedirect(m[1]);
    const title = decodificaEntita(m[2]);
    const content = snippet[indice] ?? '';
    indice += 1;
    if (!url || !title) continue;
    risultati.push({ url, title, content });
    if (risultati.length >= Math.max(1, Math.min(20, Number(maxRisultati) || 8))) break;
  }
  return risultati;
}

/** Riconosce un blocco/CAPTCHA di DuckDuckGo: pagina senza risultati che parla di anomalia o challenge. */
export function sembraBloccoDuckDuckGo(stato, html) {
  if (stato === 403 || stato === 429 || stato === 202) return true;
  const t = String(html || '').toLowerCase();
  return !/class="result__a"/.test(t) && /anomaly|captcha|challenge|unusual traffic|bot/.test(t);
}

/**
 * Esegue una ricerca vera. `fetchFn` è iniettabile per i test (mai una
 * richiesta di rete in `node --test`).
 */
export async function cercaDuckDuckGo(query, maxRisultati = 8, { fetchFn = globalThis.fetch } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const url = new URL(DUCKDUCKGO_ENDPOINT);
  url.searchParams.set('q', q);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let risposta;
  try {
    risposta = await fetchFn(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' }, signal: controller.signal, redirect: 'follow' });
  } catch (errore) {
    throw Object.assign(new Error(`DuckDuckGo non raggiungibile: ${errore?.name === 'AbortError' ? 'tempo scaduto' : errore?.message ?? errore}`), { code: 'SEARCH_UNREACHABLE' });
  } finally {
    clearTimeout(timer);
  }
  const testo = (await risposta.text()).slice(0, MAX_BYTE);
  if (sembraBloccoDuckDuckGo(risposta.status, testo)) {
    throw Object.assign(new Error(`DuckDuckGo ha rifiutato la richiesta (HTTP ${risposta.status}): limite o verifica anti-bot. Riprova più tardi o imposta una fonte con chiave.`), { code: 'SEARCH_BLOCKED' });
  }
  if (!risposta.ok) throw Object.assign(new Error(`DuckDuckGo ha risposto HTTP ${risposta.status}`), { code: 'SEARCH_FAILED' });
  return analizzaHtmlDuckDuckGo(testo, maxRisultati);
}

/**
 * Il trasporto da iniettare al kernel come `richiediRicercaFn`: quando il
 * kernel chiede la fonte `custom` con l'host sentinella, la risposta è quella
 * di DuckDuckGo nella forma `{ results: [...] }` che il kernel già analizza.
 * Qualunque altro host è un errore: questo trasporto vale SOLO per la fonte
 * senza chiave, e non deve mai diventare un canale verso un URL arbitrario.
 */
export function creaTrasportoSenzaChiave({ fetchFn = globalThis.fetch } = {}) {
  return async function richiediRicercaSenzaChiave(url) {
    const u = url instanceof URL ? url : new URL(String(url));
    if (u.hostname !== HOST_SENTINELLA_SENZA_CHIAVE) {
      throw Object.assign(new Error('TALOS_SEARCH_TRANSPORT_UNEXPECTED_HOST'), { code: 'SEARCH_FAILED' });
    }
    const results = await cercaDuckDuckGo(u.searchParams.get('q') ?? '', Number(u.searchParams.get('count')) || 8, { fetchFn });
    return { stato: 200, corpo: JSON.stringify({ results }) };
  };
}
