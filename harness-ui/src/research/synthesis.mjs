/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchSynthesis.ts (282 righe, 11/09/2026).
 *
 * Trasformare quello che è stato raccolto in un rapporto le cui citazioni si
 * possano controllare.
 *
 * La seconda metà di R-3, e la metà che decide se R-4 sia possibile del tutto.
 * Il guasto misurato del campo non è che i modelli citino troppo poco — è che
 * quello che citano non si può verificare: una risposta prende 0,94 per
 * sembrare ancorata e 0,61 per essere davvero sostenuta dalla fonte che nomina,
 * e ogni prodotto spedisce il primo numero. Le citazioni allucinate stanno fra
 * l'11% e il 57% a seconda di chi conta.
 *
 * Quindi la forma dell'uscita non è prosa con note a piè di pagina. Ogni
 * affermazione porta l'id della fonte su cui si appoggia E il passaggio su cui
 * si appoggia, che è la struttura su cui il campo si è assestato nel 2026 — e
 * il passaggio viene poi controllato, qui, contro il testo che abbiamo tenuto
 * quando abbiamo letto la pagina.
 *
 * Quel controllo è tutta la ragione per cui il raccoglitore tiene il testo. È
 * meccanico, gratis, non coinvolge nessun modello e non ha opinioni, e prende
 * da solo la categoria peggiore: la citazione che non è mai stata sulla pagina.
 * Quello che non può giudicare — se un passaggio vero SOSTENGA davvero
 * l'affermazione — è lasciato a R-4 e a un modello diverso da quello che ha
 * scritto il rapporto, perché l'autore è il giudice peggiore possibile della
 * propria citazione.
 *
 * Niente che fallisca viene nascosto. Un'affermazione la cui citazione non è
 * nella fonte è marcata `unsupported` e mostrata lo stesso, perché un rapporto
 * che butta in silenzio le sue affermazioni più deboli dice al lettore che non
 * ne aveva.
 */

/**
 * @typedef {import('./collector.mjs').TalosResearchCollection} TalosResearchCollection
 * @typedef {import('./collector.mjs').TalosResearchSource} TalosResearchSource
 */

/**
 * @typedef {object} TalosResearchClaim
 * @property {string} text
 * @property {number} sourceIndex La fonte su cui si appoggia, col numero che il prompt le ha dato.
 * @property {string} quote Il passaggio che il modello dice la sostenga, alla lettera.
 * @property {'yes' | 'no' | 'unchecked'} quotePresent
 *   L2, deciso qui e adesso: quel passaggio è davvero nel testo che abbiamo
 *   tenuto? `unchecked` vuol dire che non c'era nessuna fonte contro cui
 *   controllare — un'affermazione che cita un numero che nessuno ha consegnato.
 *   Non è una promozione.
 */

/**
 * @typedef {object} TalosResearchReport
 * @property {string} summary
 * @property {readonly TalosResearchClaim[]} claims
 * @property {readonly TalosResearchSource[]} sources Le fonti nell'ordine in cui il prompt le ha numerate, così le citazioni risolvono.
 */

/** Quanto di una fonte entra nel prompt. Oltre questo è imbottitura. */
const PROMPT_CHARS_PER_SOURCE = 4_000;

/**
 * ⛔⛔ DOPPIONI-01 — la stessa pagina, contata una volta per linea d'indagine.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20. Il rapporto diceva «10 fonti», e
 * l'elenco portava `wikipedia.org` due volte, `ultralytics.com` due volte,
 * `ibm.com` due volte, `huggingface.co` due volte: stesso titolo, stessa
 * data, stesso indirizzo. Sei pagine distinte contate dieci.
 *
 * Due rami del piano cercano cose diverse e trovano la stessa pagina — è
 * normale e va bene. Quello che non va bene è metterla due volte in fila.
 *
 * ## Cosa sporcava, oltre al conteggio
 *
 *   · Il modello la vedeva come `[1]` e `[6]`: due numeri per una pagina,
 *     e due affermazioni «da fonti diverse» che vengono dalla stessa.
 *   · «6 su 10 indipendenti» aveva numeratore e denominatore entrambi
 *     gonfiati, cioè la misura che esiste per non gonfiare i numeri era la
 *     prima a essere gonfiata.
 *   · Il testo della pagina finiva nel prompt due volte, pagato due volte.
 *
 * ⛔ Si tiene la copia col TESTO PIÙ LUNGO, non la prima: due rami possono
 * aver letto la stessa pagina con fortuna diversa, e la più povera
 * toglierebbe passaggi che l'altra aveva.
 *
 * @param {readonly TalosResearchCollection[]} collections
 * @returns {readonly TalosResearchSource[]}
 */
export function talosResearchDistinctSources(collections) {
  /** @type {Map<string, TalosResearchSource>} */
  const migliori = new Map();
  /** @type {string[]} */
  const ordine = [];

  for (const collection of collections) {
    for (const source of collection.sources) {
      const chiave = chiaveDi(source.url);
      const gia = migliori.get(chiave);
      if (!gia) {
        migliori.set(chiave, source);
        ordine.push(chiave);
        continue;
      }
      if (source.text.length > gia.text.length) migliori.set(chiave, source);
    }
  }

  return ordine.map((chiave) => migliori.get(chiave));
}

/**
 * L'indirizzo ridotto a ciò che identifica la PAGINA.
 *
 * ⛔ Il frammento non identifica niente — `#section` è un punto della
 * stessa pagina — e la barra finale nemmeno. La query invece resta: su
 * moltissimi siti `?id=12` e `?id=13` sono due articoli diversi, e
 * toglierla fonderebbe pagine che non c'entrano.
 *
 * Un indirizzo illeggibile resta sé stesso: meglio un doppione che una
 * fusione sbagliata.
 *
 * @param {string} url
 * @returns {string}
 */
function chiaveDi(url) {
  try {
    const letto = new URL(url);
    letto.hash = '';
    const testo = letto.toString();
    return testo.endsWith('/') ? testo.slice(0, -1) : testo;
  } catch {
    return url;
  }
}

/**
 * L'istruzione, e la forma che pretende.
 *
 * Scritta come un formato stretto invece che come una richiesta di buon
 * comportamento: «cita le tue fonti» produce citazioni plausibili, e uno schema
 * ne produce di controllabili. Al modello si dice che il passaggio verrà
 * verificato meccanicamente, perché un modello che sa che la citazione è
 * controllata smette di inventare citazioni — e perché è vero, che è la ragione
 * migliore.
 *
 * @param {string} question
 * @param {readonly TalosResearchCollection[]} collections
 * @returns {{prompt: string, sources: readonly TalosResearchSource[]}}
 */
export function talosResearchSynthesisPrompt(question, collections) {
  const sources = talosResearchDistinctSources(collections);
  const catalogue = sources.map((source, index) => [
    `[${index + 1}] ${source.title}`,
    source.url,
    source.publishedAt ? `data dichiarata: ${source.publishedAt}` : 'data non dichiarata',
    source.obtained === 'snippet' ? 'ATTENZIONE: solo estratto dal motore di ricerca' : '',
    source.text.slice(0, PROMPT_CHARS_PER_SOURCE),
  ].filter(Boolean).join('\n')).join('\n\n---\n\n');

  const prompt = [
    `Domanda: ${question}`,
    '',
    'Fonti raccolte, numerate:',
    '',
    catalogue,
    '',
    'Scrivi un rapporto rispettando ESATTAMENTE questo formato:',
    '',
    'SINTESI: una o due frasi che rispondono alla domanda.',
    '',
    // Scritto come un esempio invece che come un segnaposto etichettato perché
    // uno etichettato viene ricopiato: un giro vero è tornato con sei righe che
    // cominciavano con la parola AFFERMAZIONE, e un rapporto in cui ogni
    // affermazione è il nome del campo è peggio di nessun rapporto.
    'Poi una riga per ogni affermazione, in questa forma:',
    'affermazione | numero della fonte | "passaggio copiato dalla fonte"',
    '',
    'Per esempio:',
    'La torre è alta 96 metri | 3 | "la torre misura 96 metri dalla base"',
    '',
    'Regole:',
    '- scrivi l’affermazione vera e propria, non la parola «affermazione».',
    '- il passaggio deve essere copiato alla lettera dalla fonte che citi:',
    '  viene confrontato con il testo che abbiamo salvato, meccanicamente.',
    '- se le fonti non bastano a sostenere qualcosa, dillo invece di dedurlo.',
    '- niente affermazioni senza fonte.',
  ].join('\n');

  return { prompt, sources };
}

/** Il nome del campo, restituito al posto di un'affermazione. Mai un'affermazione. */
const PLACEHOLDER = /^[<[(]?\s*(l['’]?\s*)?affermazione\s*(vera e propria)?\s*[>\])]?$/i;

/**
 * R11 — una domanda di seguito, risposta con quello che era già stato pagato.
 *
 * La stessa forma della sintesi, perché dev'essere controllata allo stesso
 * modo: una domanda di seguito le cui citazioni nessuno ha verificato sarebbe
 * l'anello debole di un dossier per il resto verificato. Quello che cambia è
 * l'istruzione permanente — non sta avvenendo nessuna ricerca, quindi le fonti
 * sono tutto quello che ci sarà mai, e al modello si dice di dirlo invece di
 * riempire il buco a memoria.
 *
 * Con tutto già su disco questo costa una chiamata al modello e nessuna rete
 * per le fonti; sul motore del dispositivo non costa niente del tutto. Altrove
 * una domanda di seguito fa ripartire l'intera ricerca.
 *
 * @param {string} question
 * @param {readonly TalosResearchCollection[]} collections
 * @returns {{prompt: string, sources: readonly TalosResearchSource[]}}
 */
export function talosResearchFollowUpPrompt(question, collections) {
  const built = talosResearchSynthesisPrompt(question, collections);
  return {
    sources: built.sources,
    prompt: [
      'Queste sono le fonti già raccolte in una ricerca precedente.',
      'NON è stata fatta nessuna ricerca nuova e non ce ne sarà: quello che',
      'c’è qui sotto è tutto quello che esiste.',
      '',
      built.prompt,
      '',
      '- se queste fonti non rispondono alla domanda, scrivilo nella SINTESI',
      '  invece di rispondere da quello che sai: qui si risponde solo con le fonti.',
    ].join('\n'),
  };
}

/**
 * Spazi e virgolette differiscono fra una pagina e un modello. Il significato no.
 *
 * @param {string} text
 * @returns {string}
 */
function comparable(text) {
  return text
    .replace(/[‘’“”]/g, (mark) => (mark === '‘' || mark === '’' ? "'" : '"'))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Legge la risposta del modello, e controlla ogni citazione mentre lo fa.
 *
 * Le righe che non stanno nel formato vengono ignorate invece che salvate: un
 * analizzatore che indovina cosa volesse dire una citazione malformata è un
 * analizzatore che inventa attribuzioni, che è il guasto a cui tutto questo
 * file mira.
 *
 * @param {string} answer
 * @param {readonly TalosResearchSource[]} sources
 * @returns {TalosResearchReport}
 */
export function talosResearchParseSynthesis(answer, sources) {
  const lines = answer.split('\n').map((line) => line.trim()).filter(Boolean);
  const summary = lines
    .find((line) => line.toUpperCase().startsWith('SINTESI:'))
    ?.slice('SINTESI:'.length)
    .trim() ?? '';

  /** @type {TalosResearchClaim[]} */
  const claims = [];
  for (const line of lines) {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length < 3) continue;
    const sourceIndex = Number.parseInt(parts[1].replace(/[^0-9]/g, ''), 10);
    if (!Number.isFinite(sourceIndex)) continue;
    const quote = parts.slice(2).join('|').replace(/^["“]|["”]$/g, '').trim();
    if (parts[0].length === 0 || quote.length === 0) continue;
    // Il modello restituito. Visto su un giro vero: ogni riga cominciava con la
    // parola AFFERMAZIONE, e il rapporto archiviava sei affermazioni ciascuna
    // delle quali era il nome del campo. Buttate invece che mostrate, il che
    // lascia la sintesi senza niente e fa fallire il passo — l'esito onesto,
    // perché non era stato affermato niente.
    if (PLACEHOLDER.test(parts[0])) continue;

    const source = sources[sourceIndex - 1];
    claims.push({
      text: parts[0],
      sourceIndex,
      quote,
      // Il controllo che il testo tenuto ripaga. Nessun modello, nessuna
      // opinione, nessun costo.
      quotePresent: !source
        ? 'unchecked'
        : comparable(source.text).includes(comparable(quote)) ? 'yes' : 'no',
    });
  }

  return { summary, claims, sources };
}

/**
 * Quello che al lettore è dovuto in cima: quanto di questo ha retto.
 *
 * @param {TalosResearchReport} report
 * @returns {{total:number, supported:number, unsupported:number}}
 */
export function talosResearchReportStanding(report) {
  return {
    total: report.claims.length,
    supported: report.claims.filter((claim) => claim.quotePresent === 'yes').length,
    // `unchecked` conta qui, non come una promozione: un'affermazione che cita
    // una fonte che nessuno ha consegnato non è un'affermazione sopravvissuta a
    // un controllo.
    unsupported: report.claims.filter((claim) => claim.quotePresent !== 'yes').length,
  };
}
