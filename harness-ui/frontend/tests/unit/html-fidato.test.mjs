import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlAmmesso, stileAmmesso } from '../../src/components/html-fidato.js';

/*
 * ⛔ IL README DI HUGGING FACE PORTA HTML DENTRO IL MARKDOWN, e per disegnarlo bene bisogna
 *   accettare dell'HTML che viene da fuori. Queste prove fissano **il confine**: ciò che passa e
 *   ciò che non passa.
 *
 * ⛔ OGNI CASO QUI SOTTO È UN ATTACCO VERO, non un esempio di scuola: sono le forme che si trovano
 *   nei README pubblici e nei rapporti di sicurezza della ricerca letta il 18/09/2026
 *   (`github.com/apconw/Aix-DB` PR #231, `git.berlin.ccc.de/vinzenz/hyperhive` commit `ccc5e631e2`).
 *
 * ⛔ E la prova è scritta al VERSO CONTRARIO: per ogni cosa vietata c'è la cosa uguale ma
 *   legittima che DEVE passare. Un elenco di soli «no» non distingue un filtro giusto da un filtro
 *   che dice no a tutto.
 */

test('HTML-FIDATO: gli indirizzi pericolosi non passano', () => {
  const pericolosi = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' java\tscript:alert(1)',   // spazio e tab in testa: lo stesso attacco, scritto per non farsi leggere
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'blob:https://x/y',
    'file:///C:/Windows/System32',
  ];
  for (const url of pericolosi) {
    assert.equal(urlAmmesso(url), false, `non deve passare: ${url}`);
  }
});

test('HTML-FIDATO: gli indirizzi legittimi passano (il verso contrario)', () => {
  const buoni = [
    'https://docs.unsloth.ai/basics/unsloth-dynamic-v2.0-gguf',
    'http://127.0.0.1:4174/',
    'mailto:qualcuno@example.com',
    '/percorso/relativo',
    '#ancora',
    'https://github.com/unslothai/unsloth/',
  ];
  for (const url of buoni) {
    assert.equal(urlAmmesso(url), true, `deve passare: ${url}`);
  }
});

test('HTML-FIDATO: un’immagine non può puntare a uno schema che non sia http(s)', () => {
  assert.equal(urlAmmesso('https://x/y.png', { soloImmagine: true }), true);
  assert.equal(urlAmmesso('javascript:alert(1)', { soloImmagine: true }), false);
  assert.equal(urlAmmesso('data:image/svg+xml,<svg onload=alert(1)>', { soloImmagine: true }), false);
  // E `mailto:` va bene per un link ma NON per una immagine.
  assert.equal(urlAmmesso('mailto:x@y.z'), true);
  assert.equal(urlAmmesso('mailto:x@y.z', { soloImmagine: true }), false);
});

test('HTML-FIDATO: dello stile passa la disposizione, non il caricamento', () => {
  // Hugging Face usa davvero queste: se non passassero, il README resterebbe storto.
  assert.equal(stileAmmesso('margin-top:0;margin-bottom: 0'), 'margin-top:0;margin-bottom:0');
  assert.equal(stileAmmesso('display: flex; gap: 5px; align-items: center'), 'display:flex;gap:5px;align-items:center');
  // ⛔ E queste sono le porte: un `url()` carica una risorsa, `expression()` esegue (IE),
  //    `@import` tira dentro un altro foglio. Tutte rifiutate.
  assert.equal(stileAmmesso('background:url(javascript:alert(1))'), '');
  assert.equal(stileAmmesso('background-image: url("https://x/y.png")'), '');
  assert.equal(stileAmmesso('width:expression(alert(1))'), '');
  assert.equal(stileAmmesso('behavior:url(#default#time2)'), '');
  assert.equal(stileAmmesso('@import "https://x/y.css"'), '');
  // ⛔ E una proprietà che non è nella lista non passa, anche se il valore è innocuo:
  //    la lista è di ciò che serve, non di ciò che sembra sicuro.
  assert.equal(stileAmmesso('position:fixed'), '');
  assert.equal(stileAmmesso('background-color:red'), '');
});

test('HTML-FIDATO: in mezzo a uno stile misto, si tiene solo il lecito', () => {
  // Il caso vero: una riga di stile con dentro una cosa buona e una cattiva.
  const misto = stileAmmesso('margin-top:0; background:url(javascript:alert(1)); display:flex');
  assert.equal(misto, 'margin-top:0;display:flex');
  assert.ok(!misto.includes('url'), 'il caricamento non deve restare');
});

test('HTML-FIDATO: valori vuoti o malformati non fanno passare niente', () => {
  assert.equal(stileAmmesso(''), '');
  assert.equal(stileAmmesso('margin-top'), '');        // senza valore
  assert.equal(stileAmmesso('margin-top:'), '');       // valore vuoto
  assert.equal(stileAmmesso(null), '');
  assert.equal(stileAmmesso(12), '');
  assert.equal(urlAmmesso(''), false);
  assert.equal(urlAmmesso(null), false);
  assert.equal(urlAmmesso(undefined), false);
  assert.equal(urlAmmesso(42), false);
});
