/**
 * ⭐⭐⭐ I RISULTATI DELLA RICERCA WEB, letti come si leggono i risultati di una ricerca.
 *
 * Owner, 10/09, con Hermes aperto accanto a TALOS: «formatta molto meglio i comandi e la ricerca
 * web». Aveva ragione, e la sua foto lo mostrava: da noi una ricerca apriva questo —
 *
 *     maxResults: 8
 *     query: GLM 5.3 benchmark prestazioni
 *     Esito:
 *      8 results for "GLM 5.3 benchmark prestazioni".
 *      1. GLM-5.3 Benchmarks & Speed (September 2026) | BenchLM.ai
 *         url: https://benchlm.ai/models/glm-5-3
 *         published: date unknown
 *         GLM-5.3 scores 68.4 out of 100…
 *
 * — cioè il testo che riceve il MODELLO, messo davanti a una PERSONA. `maxResults` è un parametro
 * dell'attrezzo, non un'informazione; `url:` e `published:` sono etichette per una macchina.
 *
 * ## ⛔ Il vincolo che la ricerca ha aggiunto, e che cambia il disegno
 *
 * Ricerca del 10/09/2026 (firecrawl.dev «Best AI Search Engines for Agents and Workflows in 2026»;
 * NousResearch/hermes-agent issue #501 «Web UI Gateway — Streaming, Artifacts & Rich Rendering»):
 * «Agents need **content**, not just links. A list of URLs is useless to an agent that can't
 * browse.» E dall'altra parte, fra i requisiti di una UI: «**Native rendering** — code blocks with
 * syntax highlighting, markdown tables, image display».
 *
 * ⇒ I destinatari sono DUE e vogliono cose diverse: il modello ha bisogno del testo intero, la
 *   persona di un elenco che si legge. Perciò questa resa **non sostituisce** il grezzo: si aggiunge,
 *   e il testo resta dov'era. Era la tentazione facile — togliere il blocco brutto — e sarebbe stata
 *   la scelta sbagliata.
 *
 * ## Come lo fa Hermes, letto nel suo codice lo stesso giorno
 *
 * `apps/desktop/src/components/assistant-ui/tool/fallback.tsx`: i risultati non sono testo ma una
 * struttura — `view.searchHits`, resa da `<SearchResultsList>` con la query in testa. Il grezzo
 * esiste ancora, ma dietro `toolViewMode === 'technical'`: **non è il modo predefinito**.
 *
 * ⛔ E se il formato cambia non si inventa niente: `leggiRisultatiRicerca` torna `null` e chi chiama
 *   lascia il testo com'è. Un elenco vuoto sarebbe peggio del testo grezzo.
 */

/** Una riga «1. Titolo» apre un risultato; le righe sotto lo completano. */
const INIZIO_RISULTATO = /^\s*(\d+)\.\s+(.+?)\s*$/;
const RIGA_URL = /^\s*url:\s*(\S+)\s*$/i;
const RIGA_DATA = /^\s*published:\s*(.+?)\s*$/i;
const TESTATA = /^\s*(\d+)\s+results?\s+for\s+(.*)$/i;

/**
 * Legge il testo di una ricerca web e ne ricava i risultati.
 * @returns {{query: string|null, quanti: number|null, risultati: Array<{titolo: string, url: string|null, quando: string|null, estratto: string}>}|null}
 */
export function leggiRisultatiRicerca(testo) {
  if (typeof testo !== 'string' || testo.trim() === '') return null;
  const righe = testo.split('\n');

  let query = null;
  let quanti = null;
  const testata = righe.find((r) => TESTATA.test(r));
  if (testata) {
    const m = TESTATA.exec(testata);
    quanti = Number(m[1]);
    /* La query arriva fra virgolette e con un punto in coda: si toglie l'involucro, non il contenuto. */
    query = m[2].replace(/^["'«]+|["'».]+$/g, '').trim() || null;
  }

  const risultati = [];
  let corrente = null;
  for (const riga of righe) {
    const inizio = INIZIO_RISULTATO.exec(riga);
    if (inizio && !RIGA_URL.test(riga)) {
      if (corrente) risultati.push(corrente);
      corrente = { titolo: inizio[2], url: null, quando: null, estratto: '' };
      continue;
    }
    if (!corrente) continue;
    const url = RIGA_URL.exec(riga);
    if (url) { corrente.url = url[1]; continue; }
    const data = RIGA_DATA.exec(riga);
    if (data) {
      /* ⛔ «date unknown» non è una data: è l'assenza di una data, e si dice non dicendola. */
      const valore = data[1].trim();
      corrente.quando = /unknown|sconosciut/i.test(valore) ? null : valore;
      continue;
    }
    const pezzo = riga.trim();
    if (pezzo) corrente.estratto = corrente.estratto ? `${corrente.estratto} ${pezzo}` : pezzo;
  }
  if (corrente) risultati.push(corrente);

  /* Nessun risultato riconosciuto: il formato non è questo, e il testo va lasciato com'è. */
  if (risultati.length === 0) return null;
  return { query, quanti, risultati };
}

/**
 * Disegna i risultati. Nessun colore nuovo: i token del tema, come il resto della chat.
 * @param {ReturnType<leggiRisultatiRicerca>} letti
 * @param {{document?: Document, tetto?: number}} [opzioni]
 */
export function creaRisultatiRicerca(letti, { document: doc, tetto = 8 } = {}) {
  const documentObj = doc || globalThis.document;
  if (!letti || !Array.isArray(letti.risultati) || letti.risultati.length === 0) return null;

  const blocco = documentObj.createElement('div');
  blocco.className = 'talos-ricerca-web';
  blocco.setAttribute('data-c', 'SearchResults');

  const mostrati = letti.risultati.slice(0, tetto);
  for (const r of mostrati) {
    const voce = documentObj.createElement('div');
    voce.className = 'talos-ricerca-web__voce';

    /*
     * Il titolo È il collegamento: è la cosa che una persona clicca. `rel`/`target` non sono
     * decorazione — una pagina esterna non deve poter toccare la finestra che l'ha aperta.
     */
    const titolo = documentObj.createElement(r.url ? 'a' : 'span');
    titolo.className = 'talos-ricerca-web__titolo';
    titolo.textContent = r.titolo;
    if (r.url) {
      titolo.href = r.url;
      titolo.target = '_blank';
      titolo.rel = 'noopener noreferrer';
    }
    voce.append(titolo);

    if (r.url) {
      const dominio = documentObj.createElement('span');
      dominio.className = 'talos-ricerca-web__dove';
      /* Il dominio dice DI CHI è la pagina; l'URL intero, in un elenco, è rumore. */
      let dove = r.url;
      try { dove = new URL(r.url).hostname.replace(/^www\./, ''); } catch { /* URL malformato: resta com'è */ }
      dominio.textContent = r.quando ? `${dove} · ${r.quando}` : dove;
      voce.append(dominio);
    }

    if (r.estratto) {
      const estratto = documentObj.createElement('p');
      estratto.className = 'talos-ricerca-web__estratto';
      estratto.textContent = r.estratto;
      voce.append(estratto);
    }
    blocco.append(voce);
  }

  /* ⛔ Chi resta fuori si dichiara, come per il diff e per gli esiti lunghi. */
  if (letti.risultati.length > mostrati.length) {
    const resto = documentObj.createElement('p');
    resto.className = 'talos-ricerca-web__resto';
    resto.textContent = `Altri ${letti.risultati.length - mostrati.length} risultati non sono mostrati qui.`;
    blocco.append(resto);
  }
  return blocco;
}
