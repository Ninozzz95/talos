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

/**
 * ⭐⭐⭐ LA PILLOLA DELLE FONTI — presa dal mobile, non inventata.
 *
 * Owner, 10/09: «il mobile fa già le pilline delle fonti molto bene, non dobbiamo inventare nulla».
 * Letto in `mobile/src/components/chat/TalosMobileSourcesChip.vue` (sola lettura: su `mobile/` non
 * ho ownership) e portato qui nella stessa forma:
 *  · un bottone a pillola «Fonti», con fino a **tre** marchi tondi sovrapposti;
 *  · ogni marchio porta la favicon del sito, e in sua assenza **la lettera iniziale del dominio**;
 *  · un `+N` quando le fonti sono più di tre.
 *
 * ⛔ E il vincolo che il mobile dichiara, che vale identico qui: le favicon **si leggono, non si
 *   scaricano** — «a favicon requested when a chat is OPENED is a request to every cited site every
 *   time», e romperebbe l'unica cosa che la funzione promette, cioè che dal dispositivo esce solo la
 *   query. Sul desktop quelle icone non le abbiamo salvate da nessuna parte ⇒ si usano **le lettere**,
 *   che è il ripiego già previsto dal mobile, non una scelta al ribasso presa qui.
 */
/**
 * Il marchio di un sito: la sua favicon se il server ce l'ha, altrimenti la lettera.
 *
 * ⛔ L'icona arriva SOLO dal nostro server (`/api/v1/favicon`), che la prende una volta e la tiene:
 *   la pagina non bussa mai a un sito citato. È il vincolo che il mobile dichiara per sé
 *   («a request to every site every time the surface is opened») e che qui vale identico.
 * ⛔ La lettera resta SOTTO l'immagine, non al suo posto: se l'icona non arriva — sito morto, 204,
 *   rete giù — `onerror` la toglie e sotto c'è già il ripiego, senza un buco e senza un secondo giro.
 */
function marchioDelSito(documentObj, url, classe) {
  const segno = documentObj.createElement('span');
  segno.className = classe;
  let dominio = url;
  try { dominio = new URL(url).hostname.replace(/^www\./, ''); } catch { /* URL storto: resta com'è */ }
  segno.textContent = dominio.charAt(0).toUpperCase();
  segno.title = dominio;
  const icona = documentObj.createElement('img');
  icona.className = `${classe}__icona`;
  icona.src = `/api/v1/favicon?dominio=${encodeURIComponent(dominio)}`;
  icona.alt = '';
  icona.loading = 'lazy';
  icona.addEventListener?.('error', () => icona.remove?.());
  segno.append(icona);
  return segno;
}

export function creaPillolaFonti(letti, { document: doc, marchiMax = 3, onApri } = {}) {
  const documentObj = doc || globalThis.document;
  const fonti = (letti?.risultati ?? []).filter((r) => r.url);
  if (fonti.length === 0) return null;

  const dominioDi = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  };

  const pillola = documentObj.createElement('button');
  pillola.type = 'button';
  pillola.className = 'talos-fonti';
  pillola.setAttribute('data-c', 'SourcesChip');
  pillola.setAttribute('aria-label', fonti.length === 1 ? '1 fonte web' : `${fonti.length} fonti web`);

  const etichetta = documentObj.createElement('span');
  etichetta.className = 'talos-fonti__testo';
  etichetta.textContent = 'Fonti';
  pillola.append(etichetta);

  const marchi = documentObj.createElement('span');
  marchi.className = 'talos-fonti__marchi';
  marchi.setAttribute('aria-hidden', 'true');
  for (const fonte of fonti.slice(0, marchiMax)) {
    marchi.append(marchioDelSito(documentObj, fonte.url, 'talos-fonti__marchio'));
  }
  if (fonti.length > marchiMax) {
    const extra = documentObj.createElement('span');
    extra.className = 'talos-fonti__marchio talos-fonti__marchio--extra';
    extra.textContent = `+${fonti.length - marchiMax}`;
    marchi.append(extra);
  }
  pillola.append(marchi);
  if (typeof onApri === 'function') pillola.addEventListener('click', onApri);
  return pillola;
}

/**
 * ⭐⭐⭐ LA MODALE DELLE FONTI — la stessa del mobile, con i siti e i link esatti.
 *
 * Owner, 10/09: «bisogna aprire una modalina delle fonti come sul mobile che ti danno i siti e i
 * link esatti». Nel mobile è `TalosMobileComposerSheet` aperto dalla pillola, e ogni riga porta —
 * nell'ordine — il marchio del sito, il titolo, il dominio, la data (o «data sconosciuta») e l'URL
 * per intero. Qui la stessa cosa, con le classi del dialogo che il desktop ha già.
 *
 * ⛔ Costruita a runtime e non nel template: `index.template.html` è generato dal mockup, che è la
 *   fonte del disegno e cambia solo per mano dell'owner. Le classi però sono le sue — nessuno stile
 *   nuovo per una modale in più.
 * ⛔ E la data: «date unknown» non diventa una data vuota, diventa «data non dichiarata». È la
 *   stessa scelta del mobile («a page that declares no date says so, rather than leaving a blank the
 *   reader fills in with "recent"»).
 */
export function apriModaleFonti(letti, { document: doc } = {}) {
  const documentObj = doc || globalThis.document;
  const fonti = (letti?.risultati ?? []).filter((r) => r.url);
  if (fonti.length === 0) return null;

  const dominioDi = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  };

  const velo = documentObj.createElement('div');
  velo.className = 'overlay-layer overlay-layer--modal';
  velo.setAttribute('data-c', 'SourcesDialog');
  velo.setAttribute('role', 'dialog');
  velo.setAttribute('aria-modal', 'true');
  velo.setAttribute('aria-label', fonti.length === 1 ? '1 fonte web' : `${fonti.length} fonti web`);

  const dialogo = documentObj.createElement('div');
  dialogo.className = 'talos-dialog talos-dialog--medium';

  const testa = documentObj.createElement('div');
  testa.className = 'talos-dialog__header';
  const titolo = documentObj.createElement('h2');
  titolo.className = 'talos-dialog__title';
  titolo.textContent = fonti.length === 1 ? 'Fonte' : `Fonti (${fonti.length})`;
  /* ⛔ Visto nella foto: senza qualcosa che cresca in mezzo, `talos-dialog__header` (flex, gap 12px)
     lascia «Chiudi» appiccicato al titolo invece di mandarlo a destra. `talos-grow` è la classe che
     il prodotto usa già per questo, nelle sue testate. */
  titolo.classList?.add?.('talos-grow');
  testa.append(titolo);
  const chiudi = documentObj.createElement('button');
  chiudi.type = 'button';
  chiudi.className = 'talos-button talos-button--ghost talos-button--sm';
  chiudi.textContent = 'Chiudi';
  testa.append(chiudi);
  dialogo.append(testa);

  const corpo = documentObj.createElement('div');
  corpo.className = 'talos-dialog__body';
  const lista = documentObj.createElement('ul');
  lista.className = 'talos-fonti-elenco';
  for (const fonte of fonti) {
    const voce = documentObj.createElement('li');
    voce.className = 'talos-fonti-elenco__voce';

    const link = documentObj.createElement('a');
    link.className = 'talos-fonti-elenco__titolo';
    link.href = fonte.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    /* Il marchio è la lettera del dominio, come nella pillola: nessuna favicon da scaricare. */
    const marchio = marchioDelSito(documentObj, fonte.url, 'talos-fonti-elenco__marchio');
    marchio.setAttribute('aria-hidden', 'true');
    link.append(marchio, documentObj.createTextNode(fonte.titolo || dominioDi(fonte.url)));
    voce.append(link);

    const dove = documentObj.createElement('p');
    dove.className = 'talos-fonti-elenco__dove';
    dove.textContent = fonte.quando ? `${dominioDi(fonte.url)} · ${fonte.quando}` : `${dominioDi(fonte.url)} · data non dichiarata`;
    voce.append(dove);

    /* ⛔ «i link esatti»: l'URL per intero, non troncato — è ciò che l'owner ha chiesto per nome. */
    const indirizzo = documentObj.createElement('p');
    indirizzo.className = 'talos-fonti-elenco__url';
    indirizzo.textContent = fonte.url;
    voce.append(indirizzo);

    lista.append(voce);
  }
  corpo.append(lista);
  dialogo.append(corpo);
  velo.append(dialogo);

  const chiudiTutto = () => {
    velo.remove();
    documentObj.removeEventListener?.('keydown', suTasto);
  };
  function suTasto(evento) { if (evento.key === 'Escape') chiudiTutto(); }
  chiudi.addEventListener('click', chiudiTutto);
  /* Un clic sul velo (fuori dal dialogo) chiude: è il gesto che ogni modale del prodotto già accetta. */
  velo.addEventListener('click', (evento) => { if (evento.target === velo) chiudiTutto(); });
  documentObj.addEventListener?.('keydown', suTasto);

  (documentObj.body ?? documentObj.documentElement)?.append?.(velo);
  chiudi.focus?.();
  return velo;
}
