/*
 * 28/10/2026 sera (trovato confrontando col Mobile): nel catalogo di Hugging Face il proiettore «mmproj-F16.gguf» diventava una VARIANTE
 * («F16», in cima), e se nessuna variante si poteva consigliare la preselezione cadeva su di lui. Regola presa da llama.cpp, che è il
 * motore che poi carica il file: `common/download.cpp:668-690` (clone del 21/10/2026) — un .gguf è un MODELLO solo se il nome del file non
 * contiene «imatrix» né la parola di un file di servizio («mmproj», «mtp-», «dflash-», «eagle3-», «dspark-»).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { gruppiVarianti, eFileDiModello } from '../../src/components/hf-catalogo.js';

test('HF-SERVIZIO-01 — i file di servizio non sono varianti: resta solo il modello', () => {
  const file = [
    { path: 'gemma-4-12b-it-Q4_K_M.gguf', sizeBytes: 7_000, sha256: 'a' },
    { path: 'gemma-4-12b-it-Q8_0.gguf', sizeBytes: 13_000, sha256: 'b' },
    { path: 'mmproj-F16.gguf', sizeBytes: 800, sha256: 'c' },
    { path: 'mmproj-gemma-4-12b-it-bf16.gguf', sizeBytes: 800, sha256: 'd' },
    { path: 'mtp-gemma-4-12b-it-Q8_0.gguf', sizeBytes: 300, sha256: 'e' },
    { path: 'dflash-gemma-4-12b.gguf', sizeBytes: 300, sha256: 'f' },
    { path: 'eagle3-gemma-4-12b.gguf', sizeBytes: 300, sha256: 'g' },
    { path: 'dspark-gemma-4-12b.gguf', sizeBytes: 300, sha256: 'h' },
    { path: 'imatrix.gguf', sizeBytes: 5, sha256: 'i' },
    { path: 'sotto/cartella/gemma-4-12b-it-imatrix.gguf', sizeBytes: 5, sha256: 'j' },
  ];
  assert.deepEqual(gruppiVarianti(file).map((g) => g.quant), ['Q4_K_M', 'Q8_0']);
});

/* Owner 28/10/2026 sera: maiuscole e minuscole si IGNORANO (llama.cpp guarda le lettere esatte; scelta più sicura, uguale sul Mobile). */
test('HF-SERVIZIO-02 — AL CONTRARIO: «eagle» senza «3-», o una cartella che si chiama mmproj, restano modelli; la regola guarda il NOME del file', () => {
  for (const p of ['Eagle-7B-v2-Q4_K_M.gguf', 'mmproj-repo/model-Q4_K_M.gguf', 'Llama-3-8B-Q4_K_M-00001-of-00002.gguf', 'gemma-4-E2B-it-Q4_K_M.gguf']) {
    assert.equal(eFileDiModello(p), true, p);
  }
  for (const p of ['mmproj-F16.gguf', 'MMPROJ-model-f16.gguf', 'x/mtp-gemma-4-E2B-it.gguf', 'MTP-model.gguf', 'Eagle3-draft.gguf', 'model-IMatrix.gguf', 'model-Q4.bin', '']) {
    assert.equal(eFileDiModello(p), false, p);
  }
});
