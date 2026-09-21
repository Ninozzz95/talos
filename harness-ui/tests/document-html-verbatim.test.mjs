/*
 * ⛔⛔⛔ BC-11 — `document_create format:'html'` NON POTEVA SCRIVERE UNA PAGINA HTML.
 *
 * Owner 11/09/2026: «genera un file html di almeno 1000 righe». Per quel compito non esisteva
 * nessun attrezzo capace: `html` non è fra i `TALOS_SOURCE_TEXT_FORMATS`, quindi finiva nel ramo
 * che AVVOLGE il body (`<!doctype>`, `<head>`, un `<h1>` col titolo, ogni blocco in un `<p>`) e lo
 * passa da `escapeHtml`. Un `<section id="x">` scritto dal modello arrivava sul disco come
 * `&lt;section id="x"&gt;` dentro un `<p>`. Restavano `scrivi` (che allora voleva tutto in una
 * risposta) e la shell (tetto della riga di comando: misurato 23.941 caratteri → «La riga di
 * comando è troppo lunga»). Il «giro assurdo» — `_p2.html`, `_p3.html`, `_p4.html`, `_p5.html` —
 * non era una bizzarria del modello: era l'unica strada rimasta.
 *
 * ⛔ La cura NON è un campo `raw:true` (un parametro che il modello deve SCOPRIRE: arXiv:2608.26130
 *   misura zero richieste del secondo pezzo su log di produzione — un agente usa la prima strada
 *   che gli riesce, non va a cercare l'opzione giusta). È una regola deterministica che la
 *   descrizione dello schema DICHIARA: se il body è già un documento, si scrive com'è.
 *
 * ⛔ E la prova vale solo nei due versi: la prosa deve restare avvolta ed escapata ESATTAMENTE
 *   come prima, o questa cura avrebbe rotto l'uso per cui il ramo esisteva.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { generateTalosDocument, verifyTalosDocument } from '../src/document-generator.mjs';

const testo = (documento) => new TextDecoder().decode(documento.bytes);

test('⭐⭐⭐ un documento HTML COMPLETO finisce sul disco byte per byte, senza escape e senza involucro', async () => {
  const scrittoAMano = [
    '<!doctype html>',
    '<html lang="it"><head><meta charset="utf-8"><style>.k{color:#0af}</style></head>',
    '<body><section id="intro" data-n="1">',
    '<h2>Titolo &amp; co</h2>',
    '<script>const f = (a, b) => a < b ? "<" : ">";</script>',
    '</section></body></html>',
  ].join('\n');

  const documento = await generateTalosDocument({ format: 'html', title: 'Pagina', body: scrittoAMano });
  assert.equal(testo(documento), scrittoAMano, '⛔ un solo carattere diverso e la pagina non è più quella che il modello ha scritto');
  assert.doesNotMatch(testo(documento), /&lt;section/, '⛔ è esattamente il difetto: `<section>` escapato dentro un `<p>`');
  assert.equal((testo(documento).match(/<!doctype/gi) ?? []).length, 1, 'mai due doctype');
  assert.equal((await verifyTalosDocument(documento)).ok, true, 'e il controllo di riapertura deve continuare a passare');
});

test('⭐⭐ lo riconosce anche scritto diversamente: `<html>` senza doctype, maiuscole, spazi davanti', async () => {
  for (const corpo of ['<html><body>x</body></html>', '<!DOCTYPE HTML>\n<html></html>', '\n  <!doctype html>\n<html></html>']) {
    const documento = await generateTalosDocument({ format: 'html', title: 'T', body: corpo });
    assert.equal(testo(documento), corpo, `non riconosciuto come documento completo: ${JSON.stringify(corpo)}`);
  }
});

test('⛔⛔ AL CONTRARIO — la PROSA resta avvolta e escapata esattamente come prima', async () => {
  const documento = await generateTalosDocument({
    format: 'html', title: 'Relazione <urgente>', body: 'primo blocco con 3 < 5\n\nsecondo blocco',
  });
  const uscita = testo(documento);
  assert.match(uscita, /^<!doctype html>/, 'la prosa senza involucro non sarebbe una pagina');
  assert.match(uscita, /<h1>Relazione &lt;urgente&gt;<\/h1>/, 'il titolo si escapa ancora');
  assert.match(uscita, /<p>primo blocco con 3 &lt; 5<\/p>/, 'il testo si escapa ancora: un `<` in prosa non è markup');
  assert.match(uscita, /<p>secondo blocco<\/p>/, 'i blocchi separati da riga vuota restano paragrafi distinti');
  assert.match(uscita, /<\/body><\/html>$/);
});

test('⛔ un frammento HTML che NON è un documento resta trattato come prosa: la regola è «documento completo», non «contiene tag»', async () => {
  /*
   * Dichiarato: `<div>ciao</div>` viene escapato. È una scelta, non una svista — la regola deve
   * essere una sola, verificabile a occhio, e «inizia con `<!doctype`/`<html`» lo è; «contiene un
   * tag» no (un testo che parla di HTML contiene tag). Per un frammento la strada è `scrivi`.
   */
  const documento = await generateTalosDocument({ format: 'html', title: 'T', body: '<div>ciao</div>' });
  assert.match(testo(documento), /&lt;div&gt;ciao&lt;\/div&gt;/);
});
