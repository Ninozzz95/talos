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

/* Owner 02/11/2026 pomeriggio (supera il 28/10 «maiuscole ignorate»): regola IDENTICA a llama.cpp, lettere esatte
 * (`common/download.cpp:718-737`, clone llama.cpp-2026-11-01). I 19 casi del ledger comune
 * `Downloads/TALOS/desktop/riferimenti/REGOLA-FILE-DI-SERVIZIO-GGUF-2026-10-28.md` (sha256 f3d72aeb…), identici sul Mobile. */
test('HF-SERVIZIO-02 — i 19 casi comuni: la regola guarda il NOME del file, con le lettere esatte come llama.cpp', () => {
  const modelli = ['gemma-4-12b-it-Q4_K_M.gguf', 'gemma-4-E2B-it-Q4_K_M.gguf', 'Llama-3-8B-Q4_K_M-00001-of-00002.gguf', 'Eagle-7B-v2-Q4_K_M.gguf',
    'mmproj-repo/model-Q4_K_M.gguf', 'MMPROJ-model-f16.gguf', 'MTP-model.gguf', 'Eagle3-draft.gguf', 'model-IMatrix.gguf',
    'Tiel-Coder-35B-A3B-MTP-UD-Q4_K_XL.gguf'];
  const nonModelli = ['mmproj-F16.gguf', 'mmproj-gemma-4-12b-it-bf16.gguf', 'x/mtp-gemma-4-E2B-it.gguf', 'dflash-gemma-4-12b.gguf',
    'dspark-gemma-4-12b.gguf', 'imatrix.gguf', 'model-Q4.bin', '', 'gemma-4-12b-it-mtp-Q8_0.gguf'];
  assert.equal(modelli.length + nonModelli.length, 19);
  for (const p of modelli) assert.equal(eFileDiModello(p), true, p);
  for (const p of nonModelli) assert.equal(eFileDiModello(p), false, p);
});

/* 02/11/2026, revisione del lotto Mobile (R1): il repository vero `peculiar-ragdoll/Tiel-Coder-35B-A3B-GGUF-MTP` (2,7 M di scaricamenti)
 * aveva ZERO varianti, perché «-MTP-» in maiuscolo finiva fra le bozze. Nomi letti dall'API di Hugging Face il 02/11. */
/* Owner 02/11/2026 pomeriggio: la versione consigliata di serie è la stessa fila del telefono (bozzetto del 28/10) e di llama.cpp
 * (`common/download.cpp:747`, Q4_K_M per prima): Q4_K_M → IQ4_XS → Q4_K_S → Q4_0, poi la più fedele che entra. Restano le protezioni del
 * PC: niente pesi pieni, niente sotto i 4 bit, niente consiglio se misurate e non entra niente. */
test('HF-CONSIGLIO-FILA — Q4_K_M per prima quando entra, anche se una più fedele entrerebbe; poi IQ4_XS, Q4_K_S, Q4_0', async () => {
  const { varianteConsigliata } = await import('../../src/components/hf-catalogo.js');
  const g = (quant, extra = {}) => ({ chiave: quant, quant, bytes: 1, file: [{}], incompleto: false, senzaHash: false, ...extra });
  const tutte = [g('BF16'), g('Q8_0'), g('Q6_K'), g('Q5_K_M'), g('Q4_K_M'), g('IQ4_XS'), g('Q4_K_S'), g('Q4_0')];
  const entrano = (lista) => new Map(lista.map((x) => [x.chiave, { state: 'compatible' }]));
  assert.equal(varianteConsigliata(tutte, entrano(tutte)).gruppo.quant, 'Q4_K_M');
  assert.equal(varianteConsigliata(tutte, entrano(tutte)).motivo, 'misura');
  const senza = (via) => tutte.filter((x) => !via.includes(x.quant));
  assert.equal(varianteConsigliata(senza(['Q4_K_M']), entrano(tutte)).gruppo.quant, 'IQ4_XS');
  assert.equal(varianteConsigliata(senza(['Q4_K_M', 'IQ4_XS']), entrano(tutte)).gruppo.quant, 'Q4_K_S');
  assert.equal(varianteConsigliata(senza(['Q4_K_M', 'IQ4_XS', 'Q4_K_S']), entrano(tutte)).gruppo.quant, 'Q4_0');
  // nessuna della fila: la più fedele che entra
  assert.equal(varianteConsigliata([g('Q8_0'), g('Q5_K_M')], entrano(tutte)).gruppo.quant, 'Q8_0');
  // Q4_K_M che NON entra non si sceglie: si passa alla fila che entra
  const stima = entrano(tutte); stima.set('Q4_K_M', { state: 'blocked' });
  assert.equal(varianteConsigliata(tutte, stima).gruppo.quant, 'IQ4_XS');
  // senza misura, la stessa fila per convenzione
  const conv = varianteConsigliata([g('Q8_0'), g('Q5_K_M'), g('Q4_K_M')], new Map());
  assert.equal(conv.gruppo.quant, 'Q4_K_M'); assert.equal(conv.motivo, 'convenzione');
});

test('HF-SERVIZIO-03 — Tiel-Coder: le versioni con «MTP-» nel nome restano varianti, il vero file mtp- no', () => {
  const quant = ['Q2_K_XL', 'Q3_K_XL', 'Q4_K_XL', 'Q5_K_XL', 'Q6_K_XL', 'Q8_K_XL'];
  const file = quant.map((q, i) => ({ path: `Tiel-Coder-35B-A3B-MTP-UD-${q}.gguf`, sizeBytes: 1_000 + i, sha256: `s${i}` }));
  file.push({ path: 'mtp-Tiel-Coder-35B-A3B-Q8_0.gguf', sizeBytes: 300, sha256: 'm' });
  assert.equal(gruppiVarianti(file).length, quant.length);
});
