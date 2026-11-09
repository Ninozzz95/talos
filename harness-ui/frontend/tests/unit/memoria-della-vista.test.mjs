/* 02/11/2026, forma «proiettore nel conto», condizione del Desktop: la memoria della vista si dice nel verdetto della scheda del
   modello, mai spesa di nascosto; senza proiettore il verdetto resta la frase di prima. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { verdettoMemoria } from '../../src/components/scheda-modello.js';
import { impostaLingua } from '../../src/components/lingua.js';

const MiB = 1024 * 1024;
const fit = (stato, vista, extra = {}) => ({
  state: stato,
  memory: { requiredBytes: 4096 * MiB, availableBytes: 16384 * MiB },
  inspection: { projectorMemoryBytes: { state: 'declared', value: vista } },
  ...extra,
});

test('MDV-1 «entra» con la vista dice quanta memoria va alle immagini; senza vista la frase di prima', () => {
  impostaLingua('it');
  const senza = verdettoMemoria(fit('compatible', 0));
  const con = verdettoMemoria(fit('compatible', 758 * MiB));
  assert.doesNotMatch(senza.dettaglio, /immagini/u);
  assert.match(con.dettaglio, /di cui .+ per leggere le immagini/u);
  assert.ok(con.dettaglio.startsWith(senza.dettaglio), 'la frase di prima resta intera, la vista si aggiunge');
});

test('MDV-2 «non entra» per la memoria: la vista si dice prima del punto finale, anche in inglese', () => {
  impostaLingua('en');
  try {
    const d = verdettoMemoria(fit('blocked', 758 * MiB, { reason: 'memory' })).dettaglio;
    assert.match(d, /\(of which .+ to read images\)\.$/u);
  } finally { impostaLingua('it'); }
});

test('MDV-3 un verdetto senza ispezione (risposta vecchia) non inventa niente', () => {
  impostaLingua('it');
  const d = verdettoMemoria({ state: 'compatible', memory: { requiredBytes: 1, availableBytes: 100 } }).dettaglio;
  assert.doesNotMatch(d, /immagini/u);
});
