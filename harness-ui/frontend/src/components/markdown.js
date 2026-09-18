/*
 * IL RENDER MARKDOWN DELLA CHAT — uno solo, per tutte le superfici.
 *
 * ⛔⛔ 12/09/2026, BC-29. Owner: «le note, se sono markdown, devono essere renderizzate in
 *   markdown». Nella foto del dettaglio di una nota in Anteprima titoli, grassetto ed elenchi
 *   uscivano resi, ma un recinto ```…``` usciva come righe di testo normale e una citazione «> …»
 *   usciva letterale, col maggiore davanti. Due cause diverse, e nessuna delle due era «manca il
 *   Markdown nelle note»:
 *     (1) il RECINTO era già reso — `renderizzaMarkdownSemplice` lo passa a `creaBloccoCodice` —
 *         ma TUTTO il vestito del blocco (`src/styles/index.css`) era ambito a
 *         `:is(.assistant-copy, .talos-message__body--comando)`, cioè alla sola bolla della chat.
 *         Fuori di lì il markup arrivava giusto e nudo: niente fondo, niente bordo, niente
 *         monospazio ⇒ «righe di testo normale». La cura è nel FOGLIO, non nel renderer.
 *     (2) la CITAZIONE non esisteva davvero: `renderizzaMarkdownSemplice` non ha mai avuto un ramo
 *         per `>`, quindi la riga finiva in un paragrafo col carattere dentro. Anche in chat.
 *
 * ⇒ Questo file esiste perché la cura stia in UN posto solo e SI POSSA PROVARE. Il renderer viveva
 *   dentro l'IIFE di `legacy/app.js` (riga 2286 fino a oggi): non esportato, quindi non
 *   collaudabile da `tests/unit/` se non leggendone il sorgente come testo. È la stessa migrazione
 *   già fatta il 09/09 per `creaBloccoCodice`, che da `legacy/app.js` è passato a
 *   `components/conversazione.js` «dove ha le sue prove». Qui non cambia nessuna chiamata:
 *   `legacy/app.js` tiene il nome `renderizzaMarkdownSemplice` e delega.
 *
 * ⛔ NON è un motore CommonMark, e non deve diventarlo: il progetto dichiara «zero npm install» per
 *   questo bundle. Sono «le basi» — paragrafi, titoli, elenchi, separatore, grassetto/corsivo/
 *   codice inline, tabelle GFM, recinti di codice e, da oggi, citazioni.
 *
 * ⛔ MAI innerHTML con testo non fidato (il testo arriva dal modello o da un file della persona):
 *   ogni nodo si costruisce con createElement/createTextNode, e una stringa come
 *   `<img onerror=...>` resta testo letterale a schermo.
 *
 * Fonti (lette il 12/09/2026):
 *   · github.github.com/gfm — «Block quotes»: il marcatore è 0-3 spazi più `>` con o senza lo
 *     spazio che segue; vale la LAZINESS (le righe di continuazione di un paragrafo possono non
 *     riportare il `>`); due citazioni di fila vogliono una riga vuota in mezzo; il `>` può
 *     interrompere un paragrafo; i `>` si impilano per annidare.
 *   · developer.mozilla.org — `<blockquote>`: contenuto di flusso, ruolo ARIA implicito
 *     `blockquote`, rientro di serie dell'UA che si governa con i margini; l'attribuzione sta
 *     FUORI dall'elemento (qui non ce n'è: il testo è quello che ha scritto il modello).
 */

import { nodiDaHtml, urlAmmesso } from './html-fidato.js';

/*
 * ⛔ QUANTO HTML VIENE DA UNA RIGA. Serve a sapere dove un blocco HTML FINISCE: nel README di un
 *   modello le righe non sono tutte tag — in mezzo c'è testo che non comincia per `<`
 *   («achieves superior accuracy & outperforms other leading quants.»). Un criterio tipo «finché
 *   la riga comincia per `<`» si fermerebbe a metà blocco e lascerebbe il resto a schermo come
 *   sorgente. Si conta invece il **bilancio dei tag aperti e chiusi**, e il blocco finisce quando
 *   torna a zero.
 *   I tag vuoti dell'HTML (`<br>`, `<img>`, `<hr>`) non aprono niente: contarli manderebbe il
 *   bilancio sotto zero e il blocco si chiuderebbe troppo presto.
 */
const TAG_VUOTI = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
export function bilancioHtml(riga) {
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  let bilancio = 0;
  let m;
  while ((m = re.exec(String(riga)))) {
    const nome = m[2].toLowerCase();
    if (TAG_VUOTI.has(nome) || m[3] === '/') continue;
    bilancio += m[1] === '/' ? -1 : 1;
  }
  return bilancio;
}

/** Un elemento con del testo dentro, senza passare da innerHTML. */
function elementoTesto(doc, tag, classe, valore) {
  const elemento = doc.createElement(tag);
  if (classe) elemento.className = classe;
  elemento.textContent = valore === null || valore === undefined ? '—' : String(valore);
  return elemento;
}

/**
 * Il markup di un recinto ``` quando chi chiama non ne passa uno suo: un `<pre><code>` nudo, senza
 * barra del linguaggio e senza «Copia».
 *
 * ⛔ Esiste per il laboratorio e per le prove, NON per la app: in `legacy/app.js` il recinto passa
 *   da `creaBloccoCodice` (barra, lingua, copia, evidenziazione Prism), che questo file non importa
 *   apposta — il renderer non deve sapere niente della conversazione per poter essere montato da
 *   solo. La classe `language-*` si scrive solo se il recinto dichiara una lingua: dichiararla per
 *   un blocco che non abbiamo colorato sarebbe la stessa bugia dell'etichetta indovinata.
 */
export function bloccoCodiceNudo(doc, testoCodice, linguaggioDichiarato) {
  const pre = doc.createElement('pre');
  pre.className = 'code-block-nudo';
  const code = elementoTesto(doc, 'code', '', testoCodice);
  if (linguaggioDichiarato) code.className = `language-${String(linguaggioDichiarato).trim().toLowerCase()}`;
  pre.appendChild(code);
  return pre;
}

/**
 * Il Markdown «delle basi» in un DocumentFragment.
 *
 * @param {string} testoGrezzo il testo come l'ha scritto il modello o come sta nel file
 * @param {object} [opzioni]
 * @param {Document} [opzioni.document] il documento su cui creare i nodi (per le prove)
 * @param {(testo:string, linguaggio:string, chiuso:boolean)=>Node} [opzioni.bloccoCodice]
 *        come si disegna un recinto ```: in app è il blocco della chat, qui di serie un `<pre>`
 */
export function renderizzaMarkdown(testoGrezzo, opzioni = {}) {
  const doc = opzioni.document || globalThis.document;
  const bloccoCodice = typeof opzioni.bloccoCodice === 'function'
    ? opzioni.bloccoCodice
    : (testo, linguaggio) => bloccoCodiceNudo(doc, testo, linguaggio);

  const frammento = doc.createDocumentFragment();
  const testo = String(testoGrezzo ?? '');
  const righe = testo.split('\n');

  /*
   * ⛔ I LINK MARKDOWN — `[testo](url)` — SONO OPT-IN, e non entrano in chat.
   *   Owner, 18/09/2026: «la scheda del modello di Hugging Face deve essere formattata in HTML».
   *   Nel README di un modello i link sono ovunque, e a schermo restavano `[Unsloth Dynamic
   *   2.0](https://…)`: la sintassi, non il link. Si accende con `opzioni.linkMarkdown`, e la
   *   scheda del modello è l'unica che la accende — **la chat e le note non cambiano di una riga**.
   * ⛔ E l'indirizzo passa da `urlAmmesso`: un `[clicca](javascript:alert(1))` è un link che
   *   esegue codice al tocco e non si distingue dagli altri. Se lo schema non è fra i tre ammessi,
   *   il link si disegna **senza `href`**: resta il testo, sparisce il pericolo.
   */
  const htmlFidato = opzioni.htmlFidato === true;
  const conLink = opzioni.linkMarkdown === true;
  const PATTERN_INLINE = conLink
    ? /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|_([^_]+)_/g
    : /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|_([^_]+)_/g;
  // Con i link accesi il primo gruppo è il link e gli altri slittano di due: la mappa dice dove
  // sta cosa, invece di lasciare gli indici sparsi nel corpo.
  const GRUPPI = conLink
    ? { link: 1, linkUrl: 2, forte: 3, codice: 4, corsivoA: 5, corsivoB: 6 }
    : { link: -1, linkUrl: -1, forte: 1, codice: 2, corsivoA: 3, corsivoB: 4 };
  function applicaInline(contenitore, segmento) {
    // grassetto **x**, corsivo *x*/_x_, codice inline `x`, ed eventualmente link [x](y) — un solo
    // giro, nessuna combinazione annidata (le "basi", non un parser a stati).
    const pattern = new RegExp(PATTERN_INLINE.source, 'g');
    let ultimo = 0;
    let match;
    while ((match = pattern.exec(segmento))) {
      if (match.index > ultimo) contenitore.appendChild(doc.createTextNode(segmento.slice(ultimo, match.index)));
      const link = GRUPPI.link >= 0 ? match[GRUPPI.link] : undefined;
      if (link !== undefined) {
        const a = doc.createElement('a');
        const indirizzo = match[GRUPPI.linkUrl];
        if (urlAmmesso(indirizzo)) { a.setAttribute('href', indirizzo); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
        a.textContent = link;
        contenitore.appendChild(a);
      } else if (match[GRUPPI.forte] !== undefined) contenitore.appendChild(elementoTesto(doc, 'strong', '', match[GRUPPI.forte]));
      else if (match[GRUPPI.codice] !== undefined) contenitore.appendChild(elementoTesto(doc, 'code', '', match[GRUPPI.codice]));
      else contenitore.appendChild(elementoTesto(doc, 'em', '', match[GRUPPI.corsivoA] !== undefined ? match[GRUPPI.corsivoA] : match[GRUPPI.corsivoB]));
      ultimo = pattern.lastIndex;
    }
    if (ultimo < segmento.length) contenitore.appendChild(doc.createTextNode(segmento.slice(ultimo)));
  }

  let i = 0;
  let paragrafoCorrente = [];
  function chiudiParagrafo() {
    if (paragrafoCorrente.length === 0) return;
    const p = doc.createElement('p');
    paragrafoCorrente.forEach((riga, indice) => {
      if (indice > 0) p.appendChild(doc.createElement('br'));
      applicaInline(p, riga);
    });
    frammento.appendChild(p);
    paragrafoCorrente = [];
  }

  while (i < righe.length) {
    const riga = righe[i];
    const fenceMatch = /^```/.test(riga.trim());
    // ⭐ 28/8, owner: "l'output della chat ha --- come separatore, formatta anche quello" — riga isolata di 3+ trattini/asterischi/underscore, nessun altro carattere: la sintassi Markdown per un separatore orizzontale. "---" non ha lo spazio dopo il primo trattino richiesto da listaMatch sotto, quindi le due regex non collidono su questa sintassi.
    const hrMatch = /^(-{3,}|\*{3,}|_{3,})\s*$/.test(riga.trim());
    const listaMatch = /^(\s*)([-*])\s+(.*)$/.exec(riga);
    const listaNumMatch = /^(\s*)(\d+)\.\s+(.*)$/.exec(riga);
    const titoloMatch = /^(#{1,6})\s+(.*)$/.exec(riga);
    const citazioneMatch = /^ {0,3}>/.test(riga);

    /*
     * ⛔ IL BLOCCO HTML — OPT-IN, e solo la scheda del modello lo accende.
     *   Owner, 18/09/2026: «la scheda del modello di Hugging Face deve essere formattata in HTML».
     *   Misurato in foto (`pagina-modello-card_1080p_real.png`): il README di `unsloth/GLM-4.7-
     *   Flash-GGUF` porta HTML dentro il Markdown, e a schermo usciva il SORGENTE — `<div>`,
     *   `<p style="margin-top:0…">`, `<em><a href="…">` — in mezzo al testo.
     * ⛔ NON si usa `innerHTML` e non si rompe la regola di questo file: la stringa viene LETTA in
     *   un documento inerte e da lì si COSTRUISCONO nodi nuovi, con una lista di ammessi
     *   (`html-fidato.js`). Uno `<script>` non arriva al DOM vivo in nessuna forma.
     * ⛔ La chat e le note non cambiano: senza `opzioni.htmlFidato` questo ramo non esiste.
     */
    if (htmlFidato && /^\s*<[a-zA-Z]/.test(riga)) {
      chiudiParagrafo();
      const raccolte = [];
      let bilancio = 0;
      while (i < righe.length) {
        const corrente = righe[i];
        raccolte.push(corrente);
        bilancio += bilancioHtml(corrente);
        i += 1;
        if (bilancio <= 0) break;
      }
      frammento.appendChild(nodiDaHtml(doc, raccolte.join('\n')));
      continue;
    }
    if (fenceMatch) {
      chiudiParagrafo();
      // ⭐ 02/9 — l'identificatore di linguaggio dopo i backtick di apertura
      // (```python) veniva SCARTATO: era l'unico posto dove il modello ci dice
      // di che linguaggio si tratta, e lo buttavamo via.
      const linguaggioDichiarato = riga.trim().slice(3).trim().split(/\s+/)[0] || '';
      const righeCodice = [];
      i += 1;
      while (i < righe.length && !/^```/.test(righe[i].trim())) { righeCodice.push(righe[i]); i += 1; }
      const chiuso = i < righe.length; // il fence ha trovato la sua riga di chiusura
      frammento.appendChild(bloccoCodice(righeCodice.join('\n'), linguaggioDichiarato, chiuso));
      i += 1; // salta la riga di chiusura ```
      continue;
    }
    /*
     * ⛔ 12/09 (BC-29) — LA CITAZIONE. Prima di oggi non c'era nessun ramo per `>`: la riga cadeva
     * nel paragrafo e il maggiore restava a schermo, nella nota E nella chat.
     *
     * Forma GFM (github.github.com/gfm, «Block quotes», letto il 12/09/2026): marcatore = 0-3 spazi
     * più `>`, con o senza lo spazio che segue. Si raccoglie finché le righe portano il marcatore,
     * PIÙ le righe di continuazione pigra (laziness: «block quote markers may be omitted from lines
     * where paragraph continuation text follows») — che però valgono solo per un PARAGRAFO, quindi
     * una riga che apre un altro costrutto (titolo, elenco, recinto, separatore, nuova citazione)
     * chiude la citazione invece di entrarci. La riga vuota la chiude sempre: «a document cannot
     * contain two block quotes in a row unless there is a blank line between them».
     *
     * ⛔ Il contenuto si rirenderizza con QUESTA stessa funzione, tolto un livello di marcatore:
     * così dentro una citazione valgono titoli, elenchi, recinti e — togliendo un `>` per giro —
     * l'annidamento, senza una seconda grammatica scritta apposta. La ricorsione finisce sempre
     * perché ogni giro toglie un marcatore.
     */
    if (citazioneMatch) {
      chiudiParagrafo();
      const dentro = [];
      let paragrafoAperto = false;
      while (i < righe.length) {
        const corrente = righe[i];
        if (/^ {0,3}>/.test(corrente)) {
          // ⛔ UNO spazio solo dopo il `>` è il marcatore: gli altri sono indentazione del contenuto.
          const contenuto = corrente.replace(/^ {0,3}> ?/, '');
          dentro.push(contenuto);
          paragrafoAperto = contenuto.trim() !== '';
          i += 1;
          continue;
        }
        if (!paragrafoAperto || corrente.trim() === '') break;
        // laziness: solo la continuazione di un paragrafo, mai l'inizio di un altro blocco
        const apreUnAltroBlocco = /^```/.test(corrente.trim())
          || /^(-{3,}|\*{3,}|_{3,})\s*$/.test(corrente.trim())
          || /^(\s*)([-*])\s+/.test(corrente)
          || /^(\s*)(\d+)\.\s+/.test(corrente)
          || /^(#{1,6})\s+/.test(corrente);
        if (apreUnAltroBlocco) break;
        dentro.push(corrente);
        i += 1;
      }
      const citazione = doc.createElement('blockquote');
      citazione.className = 'md-quote';
      citazione.appendChild(renderizzaMarkdown(dentro.join('\n'), { document: doc, bloccoCodice }));
      frammento.appendChild(citazione);
      continue;
    }
    if (hrMatch) {
      chiudiParagrafo();
      frammento.appendChild(doc.createElement('hr'));
      i += 1;
      continue;
    }
    if (titoloMatch) {
      chiudiParagrafo();
      const livello = Math.min(titoloMatch[1].length, 6);
      const h = doc.createElement(`h${livello}`);
      applicaInline(h, titoloMatch[2]);
      frammento.appendChild(h);
      i += 1;
      continue;
    }
    /*
     * ⛔ 06/9 — trovato guardando uno screenshot di una risposta vera: una tabella markdown
     * arrivava a schermo come testo grezzo, «| Funzione | Input atteso |» e «|---|---|» in fila.
     * Il modello le usa spesso (riepiloghi, confronti, casi limite) e qui non esistevano.
     * Forma GFM: una riga di celle, poi una riga di separatori (con l'allineamento opzionale
     * `:---`, `---:`, `:---:`), poi le righe di dati. Durante lo streaming una tabella ancora
     * aperta si rende con le righe già arrivate invece di lampeggiare come testo grezzo
     * (ricerca 06/09/2026: ant-design/x PR #1322 «cache incomplete table tokens», streamdown.ai
     * — si bufferizza il markdown incompleto, non lo si mostra crudo).
     */
    // il `|` è obbligatorio: senza, una riga di soli trattini è un separatore orizzontale, non una tabella
    const separatoreTabella = (r) => typeof r === 'string' && r.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(r) && r.includes('-');
    const celle = (r) => {
      let t = r.trim();
      if (t.startsWith('|')) t = t.slice(1);
      if (t.endsWith('|')) t = t.slice(0, -1);
      return t.split('|').map((c) => c.trim());
    };
    if (riga.includes('|') && i + 1 < righe.length && separatoreTabella(righe[i + 1]) && celle(riga).length > 1) {
      chiudiParagrafo();
      const intestazioni = celle(riga);
      const allineamenti = celle(righe[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''));
      const involucro = doc.createElement('div');
      involucro.className = 'md-table-wrap'; // la tabella scorre dentro il suo contenitore, non allarga la chat
      const tabella = doc.createElement('table');
      tabella.className = 'md-table';
      const thead = doc.createElement('thead');
      const trTesta = doc.createElement('tr');
      intestazioni.forEach((testoCella, n) => {
        const th = doc.createElement('th');
        if (allineamenti[n]) th.style.textAlign = allineamenti[n];
        applicaInline(th, testoCella);
        trTesta.appendChild(th);
      });
      thead.appendChild(trTesta);
      tabella.appendChild(thead);
      const tbody = doc.createElement('tbody');
      i += 2;
      while (i < righe.length && righe[i].includes('|') && righe[i].trim() !== '') {
        const valori = celle(righe[i]);
        const tr = doc.createElement('tr');
        for (let n = 0; n < intestazioni.length; n += 1) {
          const td = doc.createElement('td');
          if (allineamenti[n]) td.style.textAlign = allineamenti[n];
          applicaInline(td, valori[n] ?? '');
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
        i += 1;
      }
      tabella.appendChild(tbody);
      involucro.appendChild(tabella);
      frammento.appendChild(involucro);
      continue;
    }
    if (listaMatch || listaNumMatch) {
      chiudiParagrafo();
      const ordinata = !!listaNumMatch;
      const lista = doc.createElement(ordinata ? 'ol' : 'ul');
      while (i < righe.length) {
        const m = ordinata ? /^(\s*)(\d+)\.\s+(.*)$/.exec(righe[i]) : /^(\s*)([-*])\s+(.*)$/.exec(righe[i]);
        if (!m) break;
        const li = doc.createElement('li');
        applicaInline(li, m[3]);
        lista.appendChild(li);
        i += 1;
      }
      frammento.appendChild(lista);
      continue;
    }
    if (riga.trim() === '') {
      chiudiParagrafo();
      i += 1;
      continue;
    }
    paragrafoCorrente.push(riga);
    i += 1;
  }
  chiudiParagrafo();
  return frammento;
}
