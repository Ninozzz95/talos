/* Revisione avversaria del blocco 9 (27/10/2026), portata nel repo con la cura G-R1. Originale in
   handoff/revisione-blocco-9-prove-2026-10-27/G-nomi-generici-b9.test.mjs. */
/*
 * Revisione blocco 9 (27/10/2026) — pezzo G, `b99563ebb` (G-R1): un file dal nome GENERICO lascia il nome all'id. Nomi di file VERI di
 * Hugging Face (o fatti come li fanno gli strumenti più usati: llama.cpp `convert_hf_to_gguf.py`, unsloth `save_pretrained_gguf`,
 * LM Studio, Ollama export). `registraModelliLocali` + `nomeModelloUmano` VERI. I moduli di questo repo.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const { nomeModelloUmano, registraModelliLocali } = await import(new URL('../../src/components/chat-foot.js', import.meta.url).href);

/* [id del catalogo (targa del repo), file, che cosa deve dire: 'id' = il file non sa il modello, 'file' = il file sa il modello] */
const CASI = [
  /* file che NON sanno il modello: deve vincere l'id */
  ['someone-Qwen3-8B-finetune-GGUF', 'unsloth.Q4_K_M.gguf', 'id'], // unsloth save_pretrained_gguf: «unsloth.Q4_K_M.gguf»
  ['someone-Llama-3-2-3B-sft-GGUF', 'unsloth.F16.gguf', 'id'],
  ['someone-Mistral-7B-merge-GGUF', 'ggml-model-f16.gguf', 'id'], // convert.py vecchio: ggml-model-f16
  ['someone-Mistral-7B-merge-GGUF', 'ggml-model-Q4_K_M.gguf', 'id'],
  ['someone-Phi-3-mini-GGUF', 'model-q4_k_m.gguf', 'id'],
  ['someone-Phi-3-mini-GGUF', 'model.Q8_0.gguf', 'id'],
  ['someone-Phi-3-mini-GGUF', 'model-00001-of-00002.gguf', 'id'],
  ['someone-Gemma-2-2B-GGUF', 'Q4_K_M.gguf', 'id'], // repo con un file per quantizzazione, nome = solo la quantizzazione
  ['someone-Gemma-2-2B-GGUF', 'q8_0.gguf', 'id'],
  ['someone-Gemma-2-2B-GGUF', 'converted.gguf', 'id'],
  ['someone-Gemma-2-2B-GGUF', 'output.gguf', 'id'],
  ['someone-Gemma-2-2B-GGUF', 'model_q4_k_m.gguf', 'id'],
  ['someone-Gemma-2-2B-GGUF', 'model (1).gguf', 'id'],
  ['someone-Gemma-2-2B-GGUF', 'Model-7.6B-F16.gguf', 'id'], // convert_hf_to_gguf senza nome nei metadati: «Model-7.6B-F16»
  /* file che sanno il modello: deve vincere il file */
  ['LiquidAI-LFM2-5-1B-GGUF', 'LFM2.5-1B-Q8_0.gguf', 'file'],
  ['bartowski-Meta-Llama-3-1-8B-Instruct-GGUF', 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf', 'file'],
  ['someone-ModelScope-Agent-7B-GGUF', 'ModelScope-Agent-7B-Q4_K_M.gguf', 'file'],
  ['someone-Download-Llama-GGUF', 'model-download-helper-7b.Q4_K_M.gguf', 'file'],
  ['openbmb-MiniCPM-V-2-6-gguf', 'ggml-model-Q4_K_M.gguf', 'id'], // MiniCPM-V (repo VERO openbmb): il file è ggml-model-Q4_K_M
  ['openbmb-MiniCPM-V-2-6-gguf', 'mmproj-model-f16.gguf', 'id'], // e il proiettore
];

test('REV-B9-G1 nomi di file veri: vince il file solo quando sa il modello', (t) => {
  const sbagliati = [];
  CASI.forEach(([id, file, atteso], i) => {
    const chiave = `${id}-${i}`;
    const soloId = nomeModelloUmano(`local:${chiave}`); // prima di registrare: il nome dall'id
    registraModelliLocali([{ id: chiave, files: [{ path: file }] }]);
    const nome = nomeModelloUmano(`local:${chiave}`);
    const esito = nome === soloId ? 'id' : 'file';
    t.diagnostic(`${file.padEnd(42)} → «${nome}» (dall'id «${soloId}») ⇒ ${esito}${esito === atteso ? '' : '  ⛔ atteso ' + atteso}`);
    if (esito !== atteso) sbagliati.push(`${file} → «${nome}» invece di «${atteso === 'id' ? soloId : 'il nome del file'}»`);
  });
  assert.deepEqual(sbagliati, [], 'nomi generici tenuti (o nomi veri persi)');
});
