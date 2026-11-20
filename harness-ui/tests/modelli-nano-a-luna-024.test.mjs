/*
 * 0.2.4, decisione del giudice v2229 (19/11/2026): nell'elenco incorporato `gpt-5-nano` diventa `gpt-6-luna`, sotto OpenAI e sotto
 *   OpenRouter. OpenAI lo spegne l'11/12/2026 e indica proprio GPT-6 Luna come sostituto (developers.openai.com/api/docs/deprecations,
 *   letta il 19/11/2026: «Dec 11, 2026 | gpt-5-nano, gpt-5-nano-2025-08-07 | Deprecated | gpt-6-luna»). Luna costa di più
 *   (models.dev api.json del 18/11: 0,10/0,50 contro 0,05/0,40 USD per milione) e il CHANGELOG lo dice.
 *   Sotto OpenAI Luna c'era già (al posto di gpt-5-mini, S6): resta UNA voce sola.
 *   I modelli scelti dalla persona non passano dal registro: qui si prova solo l'elenco incorporato e il suo cancello.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { REGISTRO_FORNITORI, modelloAusiliarioPer, verificaRegistro } from '../src/provider-registry.mjs';

const leggi = (relativo) => JSON.parse(readFileSync(fileURLToPath(new URL(relativo, import.meta.url)), 'utf8'));
const ELENCO = leggi('../scripts/modelli-di-riserva/elenco-generato.json');
const CORREZIONI = leggi('../scripts/modelli-di-riserva/correzioni.json');
const ids = (id) => REGISTRO_FORNITORI[id].modelliDiRiserva.map((m) => m.id);

test('NANO-LUNA-01 rosso prima: gpt-5-nano non è più nelle riserve né ausiliario di OpenAI e di OpenRouter', () => {
  assert.deepEqual(ids('openai'), ['gpt-6-luna'], 'una sola voce: luna c\'era già al posto di mini');
  assert.equal(modelloAusiliarioPer('openai'), 'gpt-6-luna', 'il riassunto leggero di OpenAI punta a luna');
  assert.deepEqual(ids('openrouter'), ['liquid/lfm-3-1.7b:free', 'openai/gpt-6-luna', 'google/gemma-4-26b-a4b-it:free'], 'nano sostituito al suo posto');
  assert.equal(modelloAusiliarioPer('openrouter'), 'google/gemma-4-26b-a4b-it:free', 'l\'ausiliario gratuito di OpenRouter non cambia');
  for (const r of Object.values(REGISTRO_FORNITORI)) {
    for (const m of r.modelliDiRiserva ?? []) assert.doesNotMatch(m.id, /gpt-5-nano/u, `${r.id}/${m.id}`);
    assert.doesNotMatch(String(r.modelloAusiliario), /gpt-5-nano/u, r.id);
  }
});

test('NANO-LUNA-02 la voce nuova ha fonte e data, e il registro resta valido', () => {
  const luna = REGISTRO_FORNITORI.openrouter.modelliDiRiserva.find((m) => m.id === 'openai/gpt-6-luna');
  assert.equal(luna.toolCalling, true);
  assert.equal(luna.data, '2026-11-18', 'la data della fonte letta: api.json di models.dev del 18/11');
  assert.match(luna.fonte, /^https:\/\//u);
  assert.equal(verificaRegistro(REGISTRO_FORNITORI), true);
});

test('NANO-LUNA-03 al contrario: luna due volte nello stesso fornitore è respinta dal registro', () => {
  const r = REGISTRO_FORNITORI.openai;
  assert.throws(() => verificaRegistro({ openai: { ...r, modelliDiRiserva: [r.modelliDiRiserva[0], { ...r.modelliDiRiserva[0] }] } }), { code: 'PROVIDER_REGISTRY_INVALID' });
});

test('NANO-LUNA-04 l\'elenco generato copre il cambio: luna viva coi prezzi di models.dev, nessuna eccezione per nano', () => {
  const voce = (f, id) => ELENCO.fornitori[f].voci.find((v) => v.id === id && v.ruolo === 'riserva');
  for (const [f, id] of [['openai', 'gpt-6-luna'], ['openrouter', 'openai/gpt-6-luna']]) {
    assert.deepEqual([voce(f, id)?.stato, voce(f, id)?.attrezzi, voce(f, id)?.ingresso, voce(f, id)?.uscita], ['vivo', true, 0.1, 0.5], `${f}/${id}`);
  }
  assert.equal(ELENCO.fornitori.openai.ausiliario, 'gpt-6-luna');
  for (const f of ['openai', 'openrouter']) assert.equal(ELENCO.fornitori[f].voci.some((v) => v.ruolo !== 'candidato' && /gpt-5-nano/u.test(v.id)), false, f);
  assert.equal(CORREZIONI.eccezioni.some((e) => /gpt-5-nano/u.test(e.id)), false, 'l\'eccezione motivata non serve più');
});
