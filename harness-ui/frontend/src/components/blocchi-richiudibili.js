/*
 * 10/11/2026 (0.2.1) — LA GRAMMATICA DEL BLOCCO RICHIUDIBILE, in un posto solo.
 *
 * Owner, foto del 10/11 alle 13:40: il modello scrive `<details><summary>Cosa è successo</summary> … </details>` e la chat lo
 * mostrava come testo letterale. In chat passano SOLO questi due tag; ogni altro HTML resta testo, come prima.
 *
 * La leggono in due: il renderer (`markdown.js`, dove il blocco comincia e finisce) e la scansione del testo in arrivo
 * (`markdown-in-arrivo.js`, dove si può tagliare e fin dove si può mostrare). Devono dire la STESSA cosa a ogni prefisso, altrimenti
 * il messaggio disegnato a pezzi durante l'arrivo esce diverso da quello ridisegnato intero: per questo la regola non è scritta due volte.
 *
 * ⛔ L'apertura vale solo in testa alla riga (dopo soli spazi) e solo nuda o con `open`: `<details onclick=…>` e `<details class=…>`
 *   NON sono un blocco e restano testo. Nessun attributo scritto dal modello arriva al DOM.
 * ⛔ Dentro il codice è codice: chi chiama salta le righe dei recinti, qui si saltano gli span di codice in riga.
 *
 * Fonti (lette il 10/11/2026):
 *   · Hermes, `apps/desktop/src/lib/markdown-preprocess.ts:117-177`: una lista di tag sicuri (`details` alla riga 132, `summary` alla
 *     160) passa; ogni altra cosa a forma di tag viene resa inerte, perché altrimenti «consumes the rest of the message». La loro lista
 *     è lunga (div, img, span…); qui sono due tag soli, perché in chat non accendiamo l'HTML.
 *   · T3 Code, `apps/web/src/components/ChatMarkdown.tsx:1553-1555`: `details` reso da un componente suo (`MarkdownDetails`), che del
 *     tag scritto dal modello tiene solo `open`.
 *   · html.spec.whatwg.org, «The details element»: il primo figlio `summary` è la legenda; senza, il programma ne mette una sua.
 */

const APERTURA = String.raw`<details(?:[ \t]+open(?:=(?:""|''|"open"|'open'|open))?)?[ \t]*>`;
const APERTURA_IN_TESTA = new RegExp(`^[ \\t]*${APERTURA}`, 'i');
const SEGNI = new RegExp('`[^`]*`|' + APERTURA + String.raw`|<\/details[ \t]*>`, 'gi');

/** La riga apre un blocco richiudibile? `{ lunghezza, aperto }` (quanti caratteri prende l'apertura, e se porta `open`), o `null`. */
export function apreRichiudibile(riga) {
  const m = APERTURA_IN_TESTA.exec(String(riga));
  if (!m) return null;
  return { lunghezza: m[0].length, aperto: /open/i.test(m[0].replace(/^[ \t]*<details/i, '')) };
}

/**
 * Scorre un pezzo di riga (fuori dai recinti) partendo da `profondita` blocchi aperti: ogni apertura ne aggiunge uno, ogni chiusura
 * ne toglie uno. Si ferma alla chiusura che porta a zero: `inizioChiusura` e `fine` dicono dove sta nel pezzo (-1 se non c'è).
 */
export function scorriRichiudibile(pezzo, profondita) {
  const segni = new RegExp(SEGNI.source, SEGNI.flags);
  let aperti = profondita;
  let m;
  while ((m = segni.exec(String(pezzo)))) {
    if (m[0][0] === '`') continue; // codice in riga: lì dentro i tag sono testo
    if (m[0][1] !== '/') { aperti += 1; continue; }
    aperti -= 1;
    if (aperti === 0) return { profondita: 0, inizioChiusura: m.index, fine: m.index + m[0].length };
  }
  return { profondita: aperti, inizioChiusura: -1, fine: -1 };
}

/** La riga di un recinto di codice: la stessa regola del renderer e della scansione. */
export const rigaDiRecinto = (riga) => /^\s*```/.test(String(riga));

/**
 * Il titolo e il corpo dal contenuto di un blocco. Il `<summary>` vale solo se è la PRIMA cosa del blocco (come nell'HTML); se la sua
 * chiusura non è ancora arrivata il titolo è il resto della riga. `titolo` è `null` quando il blocco non ne ha uno.
 */
export function titoloECorpo(contenuto) {
  const testo = String(contenuto);
  const apre = /^\s*<summary[ \t]*>/i.exec(testo);
  if (!apre) return { titolo: null, corpo: testo };
  const resto = testo.slice(apre[0].length);
  const chiude = /<\/summary[ \t]*>/i.exec(resto);
  const taglio = chiude ? chiude.index : (resto.indexOf('\n') === -1 ? resto.length : resto.indexOf('\n'));
  const titolo = resto.slice(0, taglio).replace(/\s+/g, ' ').trim();
  return { titolo: titolo || null, corpo: resto.slice(chiude ? taglio + chiude[0].length : taglio) };
}

/* Un `<` in fondo a una riga che sta arrivando può ancora diventare uno dei due tag? */
const TAG_INTERI = ['<details>', '</details>', '<summary>', '</summary>'];
export function tagRichiudibileInArrivo(coda) {
  const c = String(coda).toLowerCase();
  return TAG_INTERI.some((t) => t.startsWith(c)) || /^<details[ \t]+[a-z="']*$/.test(c);
}
/** Un tag intero del blocco, dovunque nella riga: non si vede, quindi passa in un colpo. */
export const TAG_RICHIUDIBILE = String.raw`<\/?(?:details|summary)(?:[ \t][^<>\n]*)?>`;
