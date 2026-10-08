/*
 * ⛔ 08/10/2026 (owner: «impossibile che sui modelli Anthropic 5.x non si possa aggiustare il ragionamento, guarda meglio») — il catalogo vivo di
 * Anthropic DICHIARA il ragionamento di ogni modello (`capabilities.thinking`, `capabilities.effort`: low/medium/high/xhigh/max), e il kernel lo
 * buttava: `elencaModelli` leggeva da `capabilities` solo `image_input`. Risultato: nel catalogo della CLI (e del desktop) ogni Claude risultava
 * «senza ragionamento», lo sforzo configurato veniva scartato con REASONING_EFFORT_UNSUPPORTED e a Claude non arrivava mai `thinking`/`effort`,
 * mentre l'adattatore nativo, interrogato direttamente, manda già `thinking:{type:"adaptive"}` + `output_config:{effort}` e Anthropic risponde 200
 * (provato dal vivo 08/10/2026 su claude-sonnet-5-5 e claude-haiku-5-5; haiku-5-5 restituisce un blocco `reasoning` con firma).
 *
 * Forma letta dalla documentazione (platform.claude.com/docs/en/api/models/list, 08/10/2026), non dedotta dall'id del modello come fa OpenCode
 * (transform.ts:657-684, per regex sull'id): `capabilities.thinking.{supported, types.{adaptive,enabled,disabled}.supported}` e
 * `capabilities.effort.{supported, low, medium, high, xhigh, max}.supported` (`xhigh` può essere null).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createProviderProbe } from '../src/provider-probe.mjs';

const ok = (v) => ({ supported: v });
const effort = (livelli) => ({ supported: livelli.length > 0, low: ok(livelli.includes('low')), medium: ok(livelli.includes('medium')), high: ok(livelli.includes('high')), max: ok(livelli.includes('max')), xhigh: livelli.includes('xhigh') ? ok(true) : null });
const thinking = (tipi) => ({ supported: tipi.length > 0 && !(tipi.length === 1 && tipi[0] === 'disabled'), types: { adaptive: ok(tipi.includes('adaptive')), enabled: ok(tipi.includes('enabled')), disabled: ok(tipi.includes('disabled')) } });
const modello = (id, caps) => ({ type: 'model', id, display_name: id, max_input_tokens: 1_000_000, max_tokens: 64_000, capabilities: caps });
const CATALOGO = {
  data: [
    modello('claude-opus-5-5', { thinking: thinking(['adaptive']), effort: effort(['low', 'medium', 'high', 'xhigh', 'max']), image_input: ok(true) }),
    modello('claude-haiku-5-5', { thinking: thinking(['adaptive', 'disabled']), effort: effort(['low', 'medium', 'high', 'xhigh', 'max']), image_input: ok(true) }),
    modello('claude-sonnet-4-6', { thinking: thinking(['adaptive', 'enabled', 'disabled']), effort: effort(['low', 'medium', 'high', 'max']), image_input: ok(true) }),
    modello('claude-haiku-4-5-20251001', { thinking: thinking(['enabled', 'disabled']), effort: effort([]), image_input: ok(true) }),
    modello('modello-senza-ragionamento', { thinking: thinking(['disabled']), effort: effort([]), image_input: ok(false) }),
    modello('modello-senza-capacita', null),
  ],
  has_more: false,
};

const BASI = { anthropic: 'https://api.anthropic.com/v1', 'minimax-anthropic': 'https://api.minimax.io/anthropic/v1' };
async function elenco(catalogo, provider = 'anthropic') {
  const sonda = createProviderProbe({
    leggiChiave: () => 'chiave-finta', leggiRuntime: (p) => ({ endpoint: BASI[p], timeoutSeconds: 30 }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => catalogo }),
  });
  const risultato = await sonda.elencaModelli(provider);
  return Object.fromEntries(risultato.modelli.map((m) => [m.id.split(':')[1], m]));
}

test('ANTH-CAP-1: lo sforzo di ogni Claude viene dal catalogo vivo, non dall’id: livelli, e nessun livello inventato', async () => {
  const m = await elenco(CATALOGO);
  assert.deepEqual(m['claude-opus-5-5'].reasoning.supportedEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(m['claude-haiku-5-5'].reasoning.supportedEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(m['claude-sonnet-4-6'].reasoning.supportedEfforts, ['low', 'medium', 'high', 'max'], 'xhigh null = non supportato');
});

test('ANTH-CAP-2: un modello che pensa ma non ha livelli (budget di pensiero) dice «ragionamento sì, nessun livello» — non «niente»', async () => {
  const m = await elenco(CATALOGO);
  assert.deepEqual(m['claude-haiku-4-5-20251001'].reasoning.supportedEfforts, []);
  assert.equal(typeof m['claude-haiku-4-5-20251001'].reasoning, 'object');
});

test('ANTH-CAP-3: il ragionamento si offre, NON si impone: `defaultEnabled:false` e mai «obbligatorio» (che farebbe imporre il livello più basso a chi non sceglie)', async () => {
  const m = await elenco(CATALOGO);
  for (const id of ['claude-opus-5-5', 'claude-haiku-5-5', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']) {
    assert.equal(m[id].reasoning.defaultEnabled, false, id);
    assert.equal(m[id].reasoning.mandatory, false, `${id}: anche un modello solo-adattivo, che ragiona da solo e non si spegne, resta non obbligatorio: il normalizzatore gli imporrebbe il livello più basso`);
  }
});

test('ANTH-CAP-4: AL CONTRARIO — senza `thinking.supported` o senza `capabilities` la riga NON porta alcun ragionamento', async () => {
  const m = await elenco(CATALOGO);
  assert.equal('reasoning' in m['modello-senza-ragionamento'], false);
  assert.equal('reasoning' in m['modello-senza-capacita'], false);
});

test('ANTH-CAP-5: il resto della riga resta com’era (contesto da max_input_tokens, immagini da image_input) e un livello sconosciuto non entra', async () => {
  const strano = { data: [modello('claude-futuro', { thinking: thinking(['adaptive']), effort: { supported: true, low: ok(true), ultra: ok(true), high: ok(true) }, image_input: ok(true) })], has_more: false };
  const m = await elenco(strano);
  assert.equal(m['claude-futuro'].contextLength, 1_000_000);
  assert.deepEqual(m['claude-futuro'].inputModalities, ['text', 'image']);
  assert.deepEqual(m['claude-futuro'].reasoning.supportedEfforts, ['low', 'high'], 'solo i cinque livelli che il kernel conosce, nell’ordine di intensità');
});

test('ANTH-CAP-6: una porta Anthropic di terzi senza `capabilities` nel catalogo resta senza ragionamento dichiarato', async () => {
  const m = await elenco({ data: [{ id: 'MiniMax-M3', display_name: 'MiniMax M3' }], has_more: false }, 'minimax-anthropic');
  assert.equal('reasoning' in m['MiniMax-M3'], false);
});
