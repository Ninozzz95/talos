/*
 * ⭐ L1 1.3 (owner 26/10/2026, bozzetto approvato) — la riga «Window enlarged to N tokens to fit the conversation»: lo stesso separatore
 *   del riassunto, «Details» che apre UNA riga sotto e torna «Hide», una riga sola per evento anche rigiocando la storia, le parole
 *   in inglese e in italiano.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggiornaRigaFinestraLocale, testiFinestraLocale, EVENTO_FINESTRA_LOCALE } from '../../src/components/context-separator.js';
import { impostaLingua } from '../../src/components/lingua.js';

const VALORE = { prima: 16_384, dopo: 24_576, massimo: 131_072, memoriaInPiu: 402_653_184, modello: 'LFM2.5 24B', at: '2026-10-26T18:00:00.000Z' };

test('FIN-RIGA-01 le parole: la riga con la cifra, i dettagli con modello, da→a e memoria (inglese e italiano)', () => {
  impostaLingua('en');
  assert.equal(EVENTO_FINESTRA_LOCALE, 'talos.finestra-locale');
  const en = testiFinestraLocale(VALORE);
  assert.equal(en.riga, 'Window enlarged to 24,576 tokens to fit the conversation');
  assert.equal(en.dettagli, 'LFM2.5 24B was reopened with 24,576 tokens instead of 16,384 tokens, using about 0.4 GB more memory. The choice is remembered for this model; you can change it in Settings.');
  assert.doesNotMatch(testiFinestraLocale({ ...VALORE, memoriaInPiu: null }).dettagli, /GB/u, 'senza la misura della memoria non si inventa una cifra');
  impostaLingua('it');
  const it = testiFinestraLocale(VALORE);
  assert.equal(it.riga, 'Finestra allargata a 24.576 token per far entrare la conversazione');
  assert.match(it.dettagli, /^LFM2\.5 24B è stato riaperto con 24\.576 token invece di 16\.384 token, con circa 0,4 GB di memoria in più\./u);
  impostaLingua('en');
});

function documentoFinto() {
  const crea = (tag) => {
    const nodo = {
      tagName: tag.toUpperCase(), className: '', dataset: {}, children: [], attributi: {}, ascoltatori: {}, hidden: false, textContent: '', id: '',
      setAttribute(k, v) { this.attributi[k] = String(v); }, getAttribute(k) { return this.attributi[k] ?? null; },
      addEventListener(tipo, f) { (this.ascoltatori[tipo] ??= []).push(f); }, click() { for (const f of this.ascoltatori.click ?? []) f(); },
      append(...figli) { this.children.push(...figli); },
      tutti() { return this.children.flatMap((c) => [c, ...c.tutti()]); },
      querySelectorAll(sel) { return this.tutti().filter((n) => corrisponde(n, sel)); },
      querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; },
    };
    return nodo;
  };
  const corrisponde = (n, sel) => {
    if (sel === 'button') return n.tagName === 'BUTTON';
    if (sel === '[data-finestra-locale]') return n.dataset.finestraLocale !== undefined;
    return sel.split('.').filter(Boolean).every((c) => n.className.split(' ').includes(c));
  };
  return { createElement: crea };
}

test('FIN-RIGA-02 il DOM: separatore + «Details» che apre e chiude una riga sotto; una riga sola per evento rigiocato', async () => {
  /* jsdom non è fra le dipendenze del frontend (26/10: `import('jsdom')` fallisce), e una prova che salta in silenzio non misura:
     qui un documento finto minimo, quanto basta al componente (classi, dataset, attributi, click, ricerca per classe/attributo). */
  const dom = { window: { document: documentoFinto() } };
  impostaLingua('en');
  const colonna = dom.window.document.createElement('div');
  const gruppo = aggiornaRigaFinestraLocale(colonna, VALORE, { sessionId: 's1', document: dom.window.document });
  assert.ok(gruppo.querySelector('.talos-context-separator.talos-context-separator--window'), 'è lo stesso separatore del riassunto');
  const button = gruppo.querySelector('button');
  const dettagli = gruppo.querySelector('.talos-window-note__details');
  assert.equal(button.textContent, 'Details');
  assert.equal(dettagli.hidden, true, 'semplice a primo sguardo: i dettagli sono chiusi');
  assert.equal(button.getAttribute('aria-controls'), dettagli.id);
  button.click();
  assert.equal(dettagli.hidden, false);
  assert.equal(button.textContent, 'Hide');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  button.click();
  assert.equal(dettagli.hidden, true);
  assert.equal(button.textContent, 'Details');
  // rigiocata: lo stesso evento due volte ⇒ una riga
  aggiornaRigaFinestraLocale(colonna, VALORE, { sessionId: 's1', document: dom.window.document });
  assert.equal(colonna.querySelectorAll('[data-finestra-locale]').length, 1);
  // un evento diverso ⇒ un'altra riga
  aggiornaRigaFinestraLocale(colonna, { ...VALORE, at: '2026-10-26T18:30:00.000Z', prima: 24_576, dopo: 32_768 }, { sessionId: 's1', document: dom.window.document });
  assert.equal(colonna.querySelectorAll('[data-finestra-locale]').length, 2);
  // un valore senza cifra non disegna niente
  assert.equal(aggiornaRigaFinestraLocale(colonna, { at: 'x' }, { sessionId: 's1', document: dom.window.document }), null);
});
