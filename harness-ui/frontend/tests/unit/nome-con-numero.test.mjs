// 15/10/2026 sera, owner («Sì, il numero sempre visibile»): il «-2» di un doppione ha un pezzo suo che non si tronca, e il testo
// del nodo resta il nome intero.
import assert from 'node:assert/strict';
import test from 'node:test';

import { impostaNomiNoti, scriviNomeConNumero, separaNumeroDelDoppione } from '../../src/components/nome-con-numero.js';

// NOME-NUMERO-REV-01: il numero si stacca solo se l'originale è nell'elenco — qui gli originali dei doppioni delle prove
impostaNomiNoti(['ciao leggi i due documenti', 'Prova']);

function documentoFinto() {
  const crea = (tag) => {
    const nodo = {
      tag, className: '', dataset: {}, figli: [], _testo: '',
      classList: {
        add(c) { if (!nodo.className.split(' ').includes(c)) nodo.className = `${nodo.className} ${c}`.trim(); },
        remove(c) { nodo.className = nodo.className.split(' ').filter((x) => x && x !== c).join(' '); },
        contains(c) { return nodo.className.split(' ').includes(c); },
      },
      get children() { return nodo.figli; },
      replaceChildren(...f) { nodo.figli = f; nodo._testo = ''; },
      get textContent() { return nodo.figli.length ? nodo.figli.map((f) => f.textContent).join('') : nodo._testo; },
      set textContent(v) { nodo.figli = []; nodo._testo = String(v); },
    };
    return nodo;
  };
  return { createElement: crea };
}

test('NOME-NUMERO-01 — il numero del doppione si separa, anche coi puntini del taglio del server dopo', () => {
  assert.deepEqual(separaNumeroDelDoppione('ciao leggi i due documenti-2'), { base: 'ciao leggi i due documenti', numero: '-2', coda: '' });
  assert.deepEqual(separaNumeroDelDoppione('ciao leggi i due documenti-12…'), { base: 'ciao leggi i due documenti', numero: '-12', coda: '…' });
  assert.equal(separaNumeroDelDoppione('ciao leggi i due documenti'), null);
  assert.equal(separaNumeroDelDoppione('-2'), null, 'un nome che è solo il numero non ha una base');
  assert.equal(separaNumeroDelDoppione('Rapporto 2026-10-15 x'), null);
  assert.equal(separaNumeroDelDoppione(null), null);
});

test('NOME-NUMERO-02 — nel nodo: base e numero in due pezzi, il testo resta il nome intero; un nome senza numero resta testo semplice', () => {
  const doc = documentoFinto();
  const nodo = doc.createElement('span');
  scriviNomeConNumero(nodo, 'ciao leggi i due documenti-2', doc);
  assert.equal(nodo.textContent, 'ciao leggi i due documenti-2');
  assert.equal(nodo.figli.length, 2);
  assert.equal(nodo.figli[0].className, 'talos-nome-numerato__base');
  assert.equal(nodo.figli[1].className, 'talos-nome-numerato__numero');
  assert.equal(nodo.figli[1].textContent, '-2');
  assert.ok(nodo.classList.contains('talos-nome-numerato'));
  // il taglio del server: i puntini dopo il numero in un terzo pezzo, e la base che li mostra al suo posto (prima foto: «se la…-2…»)
  scriviNomeConNumero(nodo, 'ciao leggi i due documenti-2…', doc);
  assert.equal(nodo.textContent, 'ciao leggi i due documenti-2…');
  assert.deepEqual(nodo.figli.map((f) => [f.className, f.textContent]), [
    ['talos-nome-numerato__base talos-nome-numerato__base--tagliata', 'ciao leggi i due documenti'],
    ['talos-nome-numerato__numero', '-2'],
    ['talos-nome-numerato__coda', '…'],
  ]);
  // AL CONTRARIO: un «-15» senza originale nell'elenco (una data) resta testo semplice
  scriviNomeConNumero(nodo, 'Riunione del 2026-10-15', doc);
  assert.equal(nodo.figli.length, 0);
  assert.ok(!nodo.classList.contains('talos-nome-numerato'));
  // AL CONTRARIO: rinominata senza numero, torna testo semplice e perde la classe
  scriviNomeConNumero(nodo, 'ciao leggi i due documenti-2', doc);
  scriviNomeConNumero(nodo, 'Analisi', doc);
  assert.equal(nodo.textContent, 'Analisi');
  assert.equal(nodo.figli.length, 0);
  assert.ok(!nodo.classList.contains('talos-nome-numerato'));
  assert.equal(nodo.dataset.nomeNumerato, undefined);
});

test('NOME-NUMERO-03 — lo stesso nome non si riscrive (la testata si aggiorna a ogni evento)', () => {
  const doc = documentoFinto();
  const nodo = doc.createElement('h1');
  scriviNomeConNumero(nodo, 'Prova-3', doc);
  const primi = nodo.figli;
  scriviNomeConNumero(nodo, 'Prova-3', doc);
  assert.equal(nodo.figli, primi, 'stessi nodi: nessun ridisegno');
  // e un testo uguale scritto a mano da qualcun altro (senza pezzi) si rifà nei due pezzi
  nodo.textContent = 'Prova-3';
  scriviNomeConNumero(nodo, 'Prova-3', doc);
  assert.equal(nodo.figli.length, 2);
});
