/*
 * PANNELLO v2 — la scheda CONTESTO, il modello PURO (PROVE.md U-06, U-10) e i casi limite (nessuna misura, limite ignoto, oltre il
 * limite, storia vuota o rotta). Il disegno si prova nel browser: `tests/browser/pannello-contesto.spec.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import { modelloContesto, contoContesto } from '../../src/components/pannello/contesto.js';
import { creaStato } from '../fixtures/pannello-dati.mjs';

const S = creaStato(Date.parse('2026-10-29T15:00:00Z'));

test('PANNELLO-U06 — percentuale TRONCATA sul limite che agisce (M-04), attenzione dall’85% (M-05), niente numeri senza misura', () => {
  impostaLingua('it');
  const m = modelloContesto(S.contesto);
  assert.equal(m.percentuale, 64);
  assert.equal(m.attenzione, false);
  const limite = m.limite.soglia;
  const quasi = modelloContesto({ ...S.contesto, usage: { prompt_tokens: Math.ceil(limite * 0.85) } });
  assert.equal(quasi.attenzione, true, 'all’85% esatto la riga «quasi piena» compare');
  const sotto = modelloContesto({ ...S.contesto, usage: { prompt_tokens: Math.floor(limite * 0.8499) } });
  assert.equal(sotto.attenzione, false);
  const tronca = modelloContesto({ ...S.contesto, usage: { prompt_tokens: Math.round(limite * 0.6399) } });
  assert.equal(tronca.percentuale, 63.9, 'troncata, mai arrotondata in su (owner 11/10)');
  assert.equal(contoContesto({ ...S.contesto, usage: { prompt_tokens: Math.ceil(limite * 0.9) } }).attenzione, 1);
  assert.equal(modelloContesto({}).percentuale, null, 'senza misura nessuna percentuale');
  assert.deepEqual(contoContesto({}), { numero: null, attenzione: 0 }, 'niente anello senza misura (U-10)');
});

test('PANNELLO-CONTESTO-LIMITI — oltre il limite, storia rotta o di un punto solo, invio senza tetto, riassunti dalla storia', () => {
  const limite = modelloContesto(S.contesto).limite.soglia;
  const oltre = modelloContesto({ ...S.contesto, usage: { prompt_tokens: limite + 5000 } });
  assert.equal(oltre.oltre, true);
  assert.ok(oltre.restanti < 0);
  const storiaRotta = modelloContesto({ ...S.contesto, storiaContesto: [null, { giro: 'x', token: 5 }, { giro: 3, token: Number.NaN }, { giro: 4, token: 10 }] });
  assert.equal(storiaRotta.storia.length, 1, 'i punti senza giro o senza numero si saltano');
  assert.equal(modelloContesto({ ...S.contesto, invio: { giri: 3, tetto: 0 } }).invio.tetto, null, 'un tetto zero è «senza tetto»');
  assert.equal(modelloContesto({ ...S.contesto, invio: { giri: 0 } }).invio, null);
  const conRiassunto = modelloContesto(S.contesto);
  assert.equal(conRiassunto.riassunti[0].giro, 11, 'il riassunto più recente per primo');
  assert.ok(conRiassunto.riassunti.every((r) => r.liberati >= 0), 'mai un «liberati» negativo');
  const stimata = modelloContesto({ ...S.contesto, usage: { ...S.contesto.usage, stimato: true } });
  assert.equal(stimata.stimato, true, 'una misura stimata si dice (~)');
});

test('PANNELLO-CONTESTO-RIASSUNTO — «col modello» solo quando lo si sa: vero, falso (rapido) o ignoto (nessuna parola)', () => {
  const storia = (conModello) => [{ giro: 1, at: 1, token: 50_000 }, { giro: 2, at: 2, token: 20_000, compattazione: { prima: 140_000, dopo: 20_000, ...(conModello === undefined ? {} : { conModello }) } }];
  assert.equal(modelloContesto({ storiaContesto: storia(true) }).riassunti[0].conModello, true);
  assert.equal(modelloContesto({ storiaContesto: storia(false) }).riassunti[0].conModello, false);
  assert.equal(modelloContesto({ storiaContesto: storia(undefined) }).riassunti[0].conModello, null, 'senza il dato non si dice «col modello»');
  assert.equal(modelloContesto({ storiaContesto: storia(null) }).riassunti[0].liberati, 120_000);
});
