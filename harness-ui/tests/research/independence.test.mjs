import test from 'node:test';
import assert from 'node:assert/strict';
import { talosResearchIndependentSources, talosResearchRegistrableHost } from '../../src/research/independence.mjs';

/*
 * TRADOTTO da AVM/mobile/tests/unit/research/researchIndependence.test.ts (vitest → node:test).
 * Stessi casi, stesso ordine, stesse attese. Nessun caso aggiunto, nessuno tolto.
 *
 * ⛔⛔ INDIPENDENZA-03 — tre fonti che ripetono la stessa non fanno tre prove.
 *
 * Un rapporto che dice «sostenuta da 3 fonti» sta facendo una promessa
 * numerica. Se quelle tre fonti sono tre siti che riprendono lo stesso
 * comunicato, il 3 è FALSO: la prova è una sola, ripetuta tre volte, e chi
 * legge decide con più fiducia di quanta ne meriti il fatto.
 *
 * Si misura con quello che abbiamo davvero — il dominio registrabile, e le
 * origini che una fonte cita quando il raccoglitore le ha viste:
 *   1. due pagine dello stesso dominio non sono due fonti;
 *   2. una fonte che cita UNA SOLA altra origine è una ripresa di quella;
 *   3. ⛔ una fonte che cita PIÙ origini resta indipendente — sbagliare questo
 *      verso punirebbe proprio le fonti migliori.
 */

test('INDIP-01 talosResearchRegistrableHost toglie il www e la porta', () => {
  assert.equal(talosResearchRegistrableHost('https://www.example.com/a/b?c=1'), 'example.com');
  assert.equal(talosResearchRegistrableHost('https://example.com:8443/a'), 'example.com');
});

test('INDIP-02 un sottodominio non è un dominio diverso', () => {
  assert.equal(talosResearchRegistrableHost('https://blog.example.com/a'), 'example.com');
  assert.equal(talosResearchRegistrableHost('https://a.b.c.example.com/'), 'example.com');
});

test('INDIP-03 ⛔ i suffissi a due livelli non si tagliano a metà', () => {
  // `bbc.co.uk` è il dominio: `co.uk` da solo non è una fonte.
  assert.equal(talosResearchRegistrableHost('https://www.bbc.co.uk/news/x'), 'bbc.co.uk');
  assert.equal(talosResearchRegistrableHost('https://www.repubblica.it/x'), 'repubblica.it');
});

test('INDIP-04 un indirizzo che non è un indirizzo non diventa un dominio', () => {
  assert.equal(talosResearchRegistrableHost('non un url'), null);
  assert.equal(talosResearchRegistrableHost(''), null);
});

test('INDIP-05 ⛔ tre pagine dello stesso dominio contano UNA', () => {
  const esito = talosResearchIndependentSources([
    { url: 'https://example.com/uno' },
    { url: 'https://example.com/due' },
    { url: 'https://blog.example.com/tre' },
  ]);

  assert.equal(esito.total, 3);
  assert.equal(esito.independent, 1);
});

test('INDIP-06 ⛔ tre fonti che citano la STESSA origine contano UNA', () => {
  const esito = talosResearchIndependentSources([
    { url: 'https://tg1.it/a', cites: ['https://agenzia.example/comunicato'] },
    { url: 'https://tg2.it/b', cites: ['https://agenzia.example/comunicato'] },
    { url: 'https://tg3.it/c', cites: ['https://www.agenzia.example/comunicato'] },
  ]);

  assert.equal(esito.independent, 1);
  assert.equal(esito.groups.length, 1);
  assert.equal(esito.groups[0].origin, 'agenzia.example');
  assert.equal(esito.groups[0].sources.length, 3);
});

test('INDIP-07 ⛔ e al contrario: chi cita PIÙ origini resta indipendente', () => {
  // È il lavoro che mette insieme più cose: punirlo sarebbe il verso
  // sbagliato, e toglierebbe valore proprio alle fonti migliori.
  const esito = talosResearchIndependentSources([
    { url: 'https://rassegna.it/a', cites: ['https://uno.example/x', 'https://due.example/y'] },
    { url: 'https://altro.it/b', cites: ['https://uno.example/x'] },
  ]);

  assert.equal(esito.independent, 2);
});

test('INDIP-08 fonti davvero distinte restano distinte', () => {
  const esito = talosResearchIndependentSources([
    { url: 'https://uno.example/a' },
    { url: 'https://due.example/b' },
    { url: 'https://tre.example/c' },
  ]);

  assert.equal(esito.independent, 3);
});

test('INDIP-09 una fonte che cita sé stessa non diventa una ripresa di sé stessa', () => {
  const esito = talosResearchIndependentSources([
    { url: 'https://example.com/a', cites: ['https://example.com/b'] },
    { url: 'https://altro.example/c' },
  ]);

  assert.equal(esito.independent, 2);
});

test('INDIP-10 ⛔ un elenco vuoto è ZERO, non uno', () => {
  const esito = talosResearchIndependentSources([]);
  assert.equal(esito.total, 0);
  assert.equal(esito.independent, 0);
  assert.equal(esito.groups.length, 0);
});

test('INDIP-11 un indirizzo illeggibile non inventa un gruppo', () => {
  const esito = talosResearchIndependentSources([
    { url: 'non un url' },
    { url: 'https://uno.example/a' },
  ]);

  assert.equal(esito.independent, 1);
});
