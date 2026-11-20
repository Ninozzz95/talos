/*
 * S6 della 0.2.4 (18/11/2026): il generatore dell'elenco dei modelli di riserva, provato SENZA rete su un estratto locale di models.dev
 * (`tests/fixtures/models-dev-esempio-2026-11-18.json`: voci vere di api.json del 18/11/2026, copiate come sono).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { generaElenco, serializza, differenzeDalRegistro, statoDelModello, vociDelRegistro } from '../scripts/genera-elenco-modelli.mjs';

const leggi = (relativo) => JSON.parse(readFileSync(fileURLToPath(new URL(relativo, import.meta.url)), 'utf8'));
const API = leggi('./fixtures/models-dev-esempio-2026-11-18.json');
const congela = Object.freeze;
const REGISTRO = {
  openai: { id: 'openai', modelsDevId: 'openai', modelloAusiliario: 'gpt-5-nano', modelliDiRiserva: [{ id: 'gpt-5-nano' }, { id: 'gpt-5-mini' }] },
  minimax: { id: 'minimax', modelsDevId: 'minimax', modelloAusiliario: 'MiniMax-M2.5', modelliDiRiserva: [{ id: 'MiniMax-M3' }, { id: 'MiniMax-M2.5' }] },
  openrouter: { id: 'openrouter', modelsDevId: 'openrouter', modelloAusiliario: 'liquid/lfm-2.5-2.6b:free', modelliDiRiserva: [{ id: 'liquid/lfm-2.5-2.6b:free' }, { id: 'openai/gpt-5-nano' }] },
  locale: { id: 'locale', modelsDevId: null, modelloAusiliario: null, modelliDiRiserva: null },
};
const CORREZIONI = congela({ candidatiPerFornitore: 2, ritiriAnnunciati: [{ fornitore: 'openai', id: 'gpt-5-mini', data: '2026-12-11', fonte: 'https://developers.openai.com/api/docs/deprecations' }] });
const stato = (elenco, fornitore, id) => elenco.fornitori[fornitore].voci.find((v) => v.id === id && v.ruolo !== 'candidato')?.stato;

test('GEM-01 sparito, ritirato, in spegnimento e vivo: quattro stati distinti', () => {
  const e = generaElenco(API, REGISTRO, CORREZIONI, { letto: '2026-11-18' });
  assert.equal(stato(e, 'openrouter', 'liquid/lfm-2.5-2.6b:free'), 'sconosciuto');
  assert.equal(stato(e, 'minimax', 'MiniMax-M2.5'), 'ritirato');
  assert.equal(stato(e, 'openai', 'gpt-5-mini'), 'in-spegnimento');
  assert.equal(stato(e, 'openai', 'gpt-5-nano'), 'vivo');
  assert.deepEqual(Object.keys(e.fornitori), ['openai', 'minimax', 'openrouter'], 'il fornitore senza riserve non entra');
  /* il giorno del ritiro annunciato il modello è ritirato */
  assert.equal(stato(generaElenco(API, REGISTRO, CORREZIONI, { letto: '2026-12-11' }), 'openai', 'gpt-5-mini'), 'ritirato');
});

test('GEM-02 i nuovi: candidati vivi con attrezzi, i più economici, mai un ritirato né uno già in lista', () => {
  const e = generaElenco(API, REGISTRO, CORREZIONI, { letto: '2026-11-18' });
  const candidati = (f) => e.fornitori[f].voci.filter((v) => v.ruolo === 'candidato').map((v) => v.id);
  assert.deepEqual(candidati('minimax'), ['MiniMax-M3.1-Flash'], 'M2.5 ritirato e M3 già dentro restano fuori');
  assert.deepEqual(candidati('openai'), ['gpt-6-luna', 'gpt-4o-mini'], 'gpt-5-mini in spegnimento non è un candidato');
  /* a pari prezzo (0/0) decide l'id, così l'uscita è la stessa a ogni corsa */
  assert.deepEqual(candidati('openrouter'), ['google/gemma-4-26b-a4b-it:free', 'liquid/lfm-3-1.7b:free']);
  const luna = e.fornitori.openai.voci.find((v) => v.id === 'gpt-6-luna');
  assert.deepEqual([luna.ingresso, luna.uscita, luna.attrezzi], [0.1, 0.5, true], 'il prezzo per milione arriva com\'è');
});

test('GEM-03 il file nel deposito: un modello per riga, JSON valido, stessa uscita a ogni corsa', () => {
  const e = generaElenco(API, REGISTRO, CORREZIONI, { letto: '2026-11-18', sha256: 'x' });
  const testo = serializza(e);
  assert.deepEqual(JSON.parse(testo), e);
  assert.equal(serializza(generaElenco(API, REGISTRO, CORREZIONI, { letto: '2026-11-18', sha256: 'x' })), testo);
  const righeDiModello = testo.split('\n').filter((r) => r.trim().startsWith('{"ruolo"'));
  assert.equal(righeDiModello.length, Object.values(e.fornitori).reduce((n, f) => n + f.voci.length, 0));
});

test('GEM-04 --controlla: il registro che cambia senza rigenerare viene visto; al contrario, coerente = nessuna differenza', () => {
  const e = generaElenco(API, REGISTRO, CORREZIONI, { letto: '2026-11-18' });
  assert.deepEqual(differenzeDalRegistro(e, REGISTRO), []);
  const cambiato = { ...REGISTRO, minimax: { ...REGISTRO.minimax, modelliDiRiserva: [{ id: 'MiniMax-M3' }, { id: 'MiniMax-M3.1-Flash' }], modelloAusiliario: 'MiniMax-M3.1-Flash' } };
  const problemi = differenzeDalRegistro(e, cambiato);
  assert.equal(problemi.length, 2);
  assert.match(problemi[0], /minimax: registry fallbacks/);
  assert.match(differenzeDalRegistro(e, { openai: REGISTRO.openai, minimax: REGISTRO.minimax }).join('\n'), /openrouter: in the generated list but without fallbacks/);
});

test('GEM-05 nessuna rete nelle prove: generaElenco è pura e senza data si rifiuta', () => {
  const fetchVero = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network is off in tests'); };
  try {
    assert.throws(() => generaElenco(API, REGISTRO, CORREZIONI, {}), /read date/);
    assert.ok(generaElenco(API, REGISTRO, CORREZIONI, { letto: '2026-11-18' }));
  } finally { globalThis.fetch = fetchVero; }
  assert.equal(statoDelModello({ tool_call: false }, null, '2026-11-18'), 'senza-attrezzi');
  assert.equal(statoDelModello({ tool_call: true, status: 'beta' }, null, '2026-11-18'), 'vivo');
  assert.deepEqual(vociDelRegistro({ voci: [{ ruolo: 'candidato' }, { ruolo: 'riserva', id: 'a' }] }).map((v) => v.id), ['a']);
});
