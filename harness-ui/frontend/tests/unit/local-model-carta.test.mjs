/* 01/11/2026, la carta di `local_model` con le frasi del Frontend. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ATTREZZI_FORNITORI_CON_CARTA, pesoComeNelLaboratorio, testiCartaFornitori } from '../../src/components/fornitori-carta.js';
import { impostaLingua } from '../../src/components/lingua.js';

test('the open and free cards say what happens, with sizes as in the Model Lab and «on the PC»', () => {
  impostaLingua('it');
  assert.ok(ATTREZZI_FORNITORI_CON_CARTA.includes('local_model'));
  const apri = testiCartaFornitori({ tipo: 'local_model', azione: 'open', modello: 'Gemma 4', peso: 16.9e9, aperto: 'Qwen3.8', dove: 'pc' });
  assert.match(apri.perche, /^Apro .+ \(16 GB\) al posto di .+, che si chiude\.$/u);
  assert.equal(apri.nota, 'Succede sul PC.');
  assert.match(testiCartaFornitori({ tipo: 'local_model', azione: 'open', modello: 'Gemma 4', peso: 16.9e9, aperto: null }).perche, /^Apro .+ \(16 GB\)\.$/u);
  assert.equal(testiCartaFornitori({ tipo: 'local_model', azione: 'switch', prima: 'local:q4', dopo: 'Gemma 4' }).perche, '', 'no switch card: the conversation model is changed by app_settings only');
  assert.match(testiCartaFornitori({ tipo: 'local_model', azione: 'free', modello: 'Qwen3.8', memoria: 17e9, stima: true }).perche, /circa 16 GB di memoria\.$/u);
  impostaLingua('en');
  assert.match(testiCartaFornitori({ tipo: 'local_model', azione: 'free', modello: 'Qwen3.8', memoria: 17e9 }).perche, /^I'll close .+ and free 16 GB of memory\.$/u);
  impostaLingua('it');
  assert.equal(pesoComeNelLaboratorio(null), '—');
  assert.equal(pesoComeNelLaboratorio(2048), '2 KB');
});
