import test from 'node:test';
import assert from 'node:assert/strict';

import {
  capacitaDelModello, prezzoAlMilione, formattaContesto, formattaPrezzo, prezzoInUscita, nomeAutore, nomeBreve,
  passaFiltri, ordinaModelli, gruppiPerAutore, aggiornaRecenti, normalizzaListaModelli, SOGLIA_CONTESTO_GRANDE,
} from '../../src/components/selettore-modelli.js';

/*
 * 29/10/2026 — le parti pure del selettore dei modelli rifatto dal bozzetto approvato. Le capacità si leggono dai campi VERI del
 * catalogo (OpenRouter: `reasoning.supportedEfforts`, `inputModalities`, `supportedParameters`, prezzi per token in stringa;
 * models.dev, i diretti: `capacita.reasoning`, `capacita.toolCall`), mai dal nome. Ogni prova ha il suo verso contrario.
 */
const OPENROUTER = {
  id: 'z-ai/glm-5.3-flash', provider: 'z-ai', nome: 'Z.ai: GLM 5.3 Flash', contextLength: 202_752,
  prezzoPrompt: '0.00000006', prezzoCompletion: '0.0000004',
  inputModalities: ['text', 'image'], supportedParameters: ['tools', 'reasoning'], reasoning: { supportedEfforts: ['low', 'high'] },
};
const NUDO = { id: 'x/nudo', provider: 'x', nome: 'Nudo', contextLength: 8000, inputModalities: ['text'], supportedParameters: [] };

test('SEL-CAP-01 — capacità dai campi del catalogo OpenRouter', () => {
  assert.deepEqual(capacitaDelModello(OPENROUTER), { ragiona: true, vede: true, attrezzi: true, gratis: false, contesto: true });
  assert.deepEqual(capacitaDelModello(NUDO), { ragiona: false, vede: false, attrezzi: false, gratis: false, contesto: false });
});

test('SEL-CAP-02 — capacità dei diretti (models.dev) e AL CONTRARIO: «false» dichiarato resta falso', () => {
  assert.equal(capacitaDelModello({ capacita: { reasoning: true, toolCall: true } }).ragiona, true);
  assert.equal(capacitaDelModello({ capacita: { reasoning: true, toolCall: true } }).attrezzi, true);
  assert.equal(capacitaDelModello({ capacita: { reasoning: false, toolCall: false } }).ragiona, false);
  assert.equal(capacitaDelModello({ capacita: { reasoning: false, toolCall: false } }).attrezzi, false);
  assert.equal(capacitaDelModello({ reasoning: { supportedEfforts: [] } }).ragiona, false, 'una lista vuota di sforzi non è «ragiona»');
});

test('SEL-CAP-03 — «gratis» vuole i DUE prezzi dichiarati e a zero; un prezzo mancante non è gratis', () => {
  assert.equal(capacitaDelModello({ prezzoPrompt: '0', prezzoCompletion: '0' }).gratis, true);
  assert.equal(capacitaDelModello({ prezzoPrompt: '0' }).gratis, false);
  assert.equal(capacitaDelModello({ prezzoPrompt: '0', prezzoCompletion: '0.000001' }).gratis, false);
  assert.equal(capacitaDelModello({ prezzoPrompt: '', prezzoCompletion: '' }).gratis, false);
});

test('SEL-CAP-04 — contesto grande dalla soglia esatta: 200.000 sì, 199.999 no', () => {
  assert.equal(capacitaDelModello({ contextLength: SOGLIA_CONTESTO_GRANDE }).contesto, true);
  assert.equal(capacitaDelModello({ contextLength: SOGLIA_CONTESTO_GRANDE - 1 }).contesto, false);
});

test('SEL-FMT-01 — contesto e prezzi come nel bozzetto', () => {
  assert.equal(formattaContesto(202_752), '203k');
  assert.equal(formattaContesto(1_000_000), '1M');
  assert.equal(formattaContesto(1_048_576), '1.0M');
  assert.equal(formattaContesto(1_500_000), '1.5M');
  assert.equal(formattaContesto(undefined), '—');
  assert.equal(formattaPrezzo(0), '0');
  assert.equal(formattaPrezzo(0.06), '0.060');
  assert.equal(formattaPrezzo(2.5), '2.50');
  assert.equal(prezzoAlMilione('0.0000004'), 0.4);
  assert.equal(prezzoAlMilione(null), null);
  assert.equal(prezzoAlMilione(true), null);
  assert.equal(prezzoInUscita(OPENROUTER).testo, '$0.060 → $0.40', 'il prezzo d’USCITA c’è, non solo l’ingresso');
  assert.equal(prezzoInUscita({}), null);
});

test('SEL-NOMI-01 — chi fa il modello col nome umano, mai la sigla in maiuscolo; il prefisso «Autore: » si toglie', () => {
  assert.equal(nomeAutore('z-ai'), 'Z.ai');
  assert.equal(nomeAutore('meta-llama'), 'Meta');
  assert.equal(nomeAutore('m-ai'), 'M Ai');
  assert.equal(nomeAutore(''), '');
  assert.equal(nomeBreve(OPENROUTER), 'GLM 5.3 Flash');
  assert.equal(nomeBreve({ nome: 'Senza prefisso' }), 'Senza prefisso');
});

test('SEL-FILTRI-01 — ricerca su nome, id e autore (anche il nome umano); i filtri si sommano', () => {
  assert.equal(passaFiltri(OPENROUTER, { query: 'flash' }), true);
  assert.equal(passaFiltri(OPENROUTER, { query: 'Z.AI' }), true, 'il nome umano dell’autore si cerca');
  assert.equal(passaFiltri(OPENROUTER, { query: 'z-ai/glm' }), true);
  assert.equal(passaFiltri(OPENROUTER, { query: 'qwen' }), false);
  assert.equal(passaFiltri(OPENROUTER, { filtri: new Set(['ragiona', 'vede']) }), true);
  assert.equal(passaFiltri(OPENROUTER, { filtri: new Set(['ragiona', 'gratis']) }), false, 'tutti i filtri devono valere, non uno');
  assert.equal(passaFiltri(NUDO, { filtri: new Set(['attrezzi']) }), false);
});

test('SEL-ORDINE-01 — più economici prima (ingresso + uscita, i non dichiarati in fondo), contesto più grande prima, nome', () => {
  const a = { id: 'a', nome: 'Alfa', prezzoPrompt: '0.000002', prezzoCompletion: '0.000002', contextLength: 10 };
  const b = { id: 'b', nome: 'Beta', prezzoPrompt: '0.000001', prezzoCompletion: '0.000001', contextLength: 30 };
  const c = { id: 'c', nome: 'Gamma', contextLength: 20 };
  assert.deepEqual(ordinaModelli([a, c, b], 'prezzo').map((m) => m.id), ['b', 'a', 'c']);
  assert.deepEqual(ordinaModelli([a, c, b], 'contesto').map((m) => m.id), ['b', 'c', 'a']);
  assert.deepEqual(ordinaModelli([c, b, a], 'nome').map((m) => m.id), ['a', 'b', 'c']);
  const originale = [c, b, a];
  ordinaModelli(originale, 'nome');
  assert.deepEqual(originale.map((m) => m.id), ['c', 'b', 'a'], 'ordina una COPIA');
});

test('SEL-GRUPPI-01 — gruppi per autore in ordine di nome umano', () => {
  const g = gruppiPerAutore([{ provider: 'z-ai' }, { provider: 'anthropic' }, { provider: 'z-ai' }]);
  assert.deepEqual(g.map(([a, ms]) => [a, ms.length]), [['anthropic', 1], ['z-ai', 2]]);
});

test('SEL-LISTE-01 — gli ultimi usati: il nuovo in testa, senza doppioni, al più cinque', () => {
  assert.deepEqual(aggiornaRecenti(['a', 'b', 'c', 'd', 'e'], 'f'), ['f', 'a', 'b', 'c', 'd']);
  assert.deepEqual(aggiornaRecenti(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
  assert.deepEqual(aggiornaRecenti(['a'], ''), ['a'], 'AL CONTRARIO: una scelta vuota non entra');
  assert.deepEqual(aggiornaRecenti(undefined, 'a'), ['a']);
});

test('SEL-LISTE-02 — preferenze ripulite: solo stringhe, niente doppioni, tetto', () => {
  assert.deepEqual(normalizzaListaModelli(['a', 'a', 3, null, '', 'b'], 50), ['a', 'b']);
  assert.deepEqual(normalizzaListaModelli('a', 50), []);
  assert.deepEqual(normalizzaListaModelli(['a', 'b', 'c'], 2), ['a', 'b']);
  assert.deepEqual(normalizzaListaModelli(['x'.repeat(201)], 50), []);
});
