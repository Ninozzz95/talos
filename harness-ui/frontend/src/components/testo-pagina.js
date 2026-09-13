/*
 * Il testo di una pagina letta dall'agente, reso leggibile.
 *
 * ⛔ 06/9, owner davanti alla vista Browser: «ANNOTAZIONE NEL BROWSER IL CONTENUTO SI VEDE COSI».
 * Nella scheda «Letture della sessione» comparivano `<!DOCTYPE html>`, una colonna di
 * `<meta property="og:…">` e la navigazione del sito, con in mezzo «438747 caratteri tolti nel mezzo».
 *
 * ⛔ La vista NON sbagliava: mostrava fedelmente ciò che l'attrezzo `naviga` ha consegnato al modello.
 * Per questo la cura non è sostituire il testo in silenzio con una versione ripulita — questa scheda
 * serve proprio a sapere **cosa ha letto l'agente**. La cura sono due modi dichiarati: «Leggibile»,
 * che è quello che si guarda, e «Sorgente», che è la verità che ha ricevuto il modello.
 *
 * ⛔ E niente `innerHTML`: il contenuto arriva da una pagina qualunque di internet. Qui si lavora
 * sulla stringa, con regole scritte, e non si costruisce mai un DOM da quel testo.
 *
 * Ricerca 06/09/2026, prima di scrivere: Mozilla Readability.js e i suoi porti (zerodep readability,
 * readability-rust) fanno tre cose nell'ordine — tolgono script/style/noscript/link, scartano i
 * candidati improbabili per classe o id (nav, sidebar, footer, comment, menu), poi trattano i div
 * come paragrafi; Trafilatura resta il metro di riferimento sulla precisione. Qui NON si implementa
 * l'estrazione dell'articolo principale (sarebbe un'altra cosa, e mentirebbe sul contenuto): si fa
 * la pulizia dichiarata — via il codice, via l'invisibile, via i tag — e lo si dice all'utente.
 */

const ENTITA = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»',
  hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', middot: '·', euro: '€',
};

/** Vero quando il testo acquisito è, di fatto, il sorgente di una pagina. */
export function sembraHtml(grezzo) {
  const t = String(grezzo || '');
  if (!t.trim()) return false;
  if (/<!DOCTYPE\s+html/i.test(t) || /<html[\s>]/i.test(t)) return true;
  // due o più tag di struttura diversi: una riga con un solo `<b>` non fa una pagina
  const tag = t.match(/<\/?(div|p|span|a|li|ul|ol|table|section|article|nav|header|footer|meta|script|style|h[1-6])\b/gi) || [];
  return tag.length >= 4;
}

function decodifica(testo) {
  return testo
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ' '; } })
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ' '; } })
    .replace(/&([a-z]+);/gi, (intero, nome) => (Object.hasOwn(ENTITA, nome.toLowerCase()) ? ENTITA[nome.toLowerCase()] : intero));
}

/**
 * Da sorgente a testo che si legge. Se il testo non è HTML torna com'è: non si tocca ciò che è già
 * a posto.
 * @param {string} grezzo il testo acquisito dall'agente
 * @returns {string}
 */
export function testoLeggibile(grezzo) {
  const t = String(grezzo || '');
  if (!sembraHtml(t)) return t;
  let s = t;
  // 1) via ciò che non è contenuto: codice, stile, e la testa della pagina con i suoi meta
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ');
  s = s.replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ');
  s = s.replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, ' ');
  s = s.replace(/<head\b[\s\S]*?<\/head\s*>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // 2) via i blocchi che sono navigazione per costruzione (Readability: «unlikely candidates»)
  s = s.replace(/<(nav|footer|aside)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  // 3) i confini che valgono un a capo: paragrafi, titoli, righe di lista, celle, interruzioni
  s = s.replace(/<\/(p|div|section|article|h[1-6]|li|tr|blockquote|pre)\s*>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/t[dh]\s*>/gi, '\t');
  /*
   * 4) via tutti i tag rimasti. Quelli che restano sono INLINE (<b>, <a>, <span>): si tolgono senza
   * lasciare spazio, altrimenti «<b>Adam Turner</b>.» diventa «Adam Turner .» — misurato, non supposto.
   * I confini che valgono davvero un a capo sono già stati tradotti al punto 3.
   */
  s = s.replace(/<[^>]*>/g, '');
  s = decodifica(s);
  // 5) spazi: righe pulite, mai più di una riga vuota di fila
  s = s.replace(/\r/g, '').split('\n').map((r) => r.replace(/[ \t]+/g, ' ').trim()).join('\n');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

/** Quanto si è risparmiato: serve a dire all'utente cosa sta guardando, senza vantarsi a vuoto. */
export function riassuntoPulizia(grezzo) {
  const g = String(grezzo || '');
  if (!sembraHtml(g)) return null;
  const pulito = testoLeggibile(g);
  return { caratteriPrima: g.length, caratteriDopo: pulito.length, righe: pulito ? pulito.split('\n').length : 0 };
}
