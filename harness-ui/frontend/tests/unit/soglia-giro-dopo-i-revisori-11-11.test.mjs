/*
 * 11/11/2026 — giro dopo i tre revisori della soglia (brief `BRIEF-AGENTE-SOGLIA-200K-E-SCRITTA-245-2026-11-11.md`, punti 4, 5, 11, 12, 13):
 * cosa dicono la scheda Contesto e la carta «Memoria del modello». Nate ROSSE sulla testa `8125b5c89`.
 * Fonti: Hermes `agent/model_metadata.py:2219-2221` (la memoria scritta vince); Codex `models-manager/src/model_info.rs:20-26` (la limita
 *   al catalogo: l'owner ha scelto di non limitarla ma di dirlo, 17:27 Q1); DeepSeek `ui-settings-models/src/client/locales.ts:56-57`
 *   («Uses the provider default»: il campo dice cosa si usa senza la persona).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { limiteCheAgisce, percheDelLimite } from '../../src/components/contesto-scheda.js';
import { righeFinestraSulLimite } from '../../src/components/inspector.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { TESTI } from '../../src/i18n/testi/index.js';
import * as carta from '../../src/components/carta-memoria-modello.js';
import { FINESTRA_SCRITTA_MINIMA, FINESTRA_SCRITTA_MASSIMA } from '../../../src/finestra-di-ripiego.mjs';

test('SG2-FR-01 (punto 4): sopra il catalogo la scheda Contesto dice «scritta da te, più grande del catalogo», col numero del catalogo, EN e IT', () => {
  const politica = { triggerTokens: 150_000, warningTokens: 120_000, windowTokens: 200_000, source: 'route-minimum', windowWrittenAboveCatalog: 163_840 };
  const limite = limiteCheAgisce({ politica });
  assert.equal(limite.sopraIlCatalogo, 163_840);
  const p = percheDelLimite(limite);
  assert.deepEqual(p, { chiave: 'processi.inspector.limitWhyWrittenAbove', soglia: 150_000, finestra: 200_000, catalogo: 163_840 });
  assert.match(TESTI.en['processi.inspector.limitWhyWrittenAbove'], /^Written by you \(\{finestra\}\), larger than the catalog \(\{catalogo\}\)/u);
  assert.match(TESTI.it['processi.inspector.limitWhyWrittenAbove'], /^Scritta da te \(\{finestra\}\), più grande del catalogo \(\{catalogo\}\)/u);
  try {
    impostaLingua('en');
    assert.match(righeFinestraSulLimite({ limite }).perche, /Written by you \(200k\), larger than the catalog \(163[.,]8k\)/u);
  } finally { impostaLingua('it'); }
  // anche quando decide il motore del contesto
  assert.equal(percheDelLimite(limiteCheAgisce({ budget: { triggerTokens: 120_000, windowTokens: 200_000 }, politica })).chiave, 'processi.inspector.limitWhyWrittenAbove');
  // sotto il catalogo, o senza la voce, la riga resta quella di oggi
  assert.equal(percheDelLimite(limiteCheAgisce({ politica: { ...politica, windowWrittenAboveCatalog: undefined } })).chiave, 'processi.inspector.limitWhyWindow');
});

test('SG2-FR-02 (punto 12): col tetto del motore la riga non dice più «75% della finestra» su un modello da 1M', () => {
  const unMilione = limiteCheAgisce({ politica: { triggerTokens: 200_000, warningTokens: 160_000, windowTokens: 1_000_000, source: 'route-minimum' } });
  const p = percheDelLimite(unMilione);
  assert.equal(p.chiave, 'processi.inspector.limitWhyCeiling');
  assert.match(TESTI.en['processi.inspector.limitWhyCeiling'], /same ceiling as the context engine/u);
  assert.match(TESTI.it['processi.inspector.limitWhyCeiling'], /stesso tetto del motore del contesto/u);
  const nota = limiteCheAgisce({ politica: { triggerTokens: 122_880, warningTokens: 98_304, windowTokens: 163_840, source: 'route-minimum' } });
  assert.equal(percheDelLimite(nota).chiave, 'processi.inspector.limitWhyWindow', 'sotto il tetto resta la riga di oggi');
});

test('SG2-FR-03 (punto 13): la carta scrive il nome intero col fornitore, mai solo «deepseek-v3.2»', () => {
  assert.equal(typeof carta.nomeInteroDelModello, 'function');
  assert.equal(carta.nomeInteroDelModello('deepseek/deepseek-v3.2'), 'OpenRouter · deepseek/deepseek-v3.2');
  assert.equal(carta.nomeInteroDelModello('openrouter:deepseek/deepseek-v3.2'), 'OpenRouter · deepseek/deepseek-v3.2');
  assert.equal(carta.nomeInteroDelModello('deepseek:deepseek-chat'), 'DeepSeek · deepseek-chat');
  assert.equal(carta.nomeInteroDelModello('chatgpt:gpt-6-luna'), 'ChatGPT plan · gpt-6-luna');
  assert.equal(carta.nomeInteroDelModello('deepseek/deepseek-v3.2', 'DeepSeek: DeepSeek V3.2'), 'OpenRouter · DeepSeek: DeepSeek V3.2');
  assert.notEqual(carta.nomeInteroDelModello('deepseek:deepseek-v3.2'), carta.nomeInteroDelModello('deepseek/deepseek-v3.2'), 'due fornitori, due nomi');
});

test('SG2-FR-04 (punto 11 e 4): la carta dice quale memoria TALOS usa adesso per quel modello, e quando la tua è più grande del catalogo', () => {
  assert.equal(typeof carta.memoriaInUso, 'function');
  /* D3 (a), 12/11/2026 (LINGUA-7-04): ogni frase ha le voci …One/…Many, il plurale lo sceglie il numero (LINGUA-7-07 prova le due lingue) */
  const voci = (k) => ({ uno: `varie.modelMemory.card.${k}One`, molti: `varie.modelMemory.card.${k}Many` });
  assert.deepEqual(carta.memoriaInUso({ finestra: 163_840, fonte: 'catalogo', letta: { finestra: 163_840, fonte: 'catalogo' } }), { ...voci('inUseRead'), n: 163_840 });
  assert.deepEqual(carta.memoriaInUso({ finestra: 131_072, fonte: 'rotta', letta: { finestra: 131_072, fonte: 'rotta' } }), { ...voci('inUseRead'), n: 131_072 });
  assert.deepEqual(carta.memoriaInUso({ finestra: 128_000, fonte: 'prudente', letta: { finestra: 128_000, fonte: 'prudente' } }), { ...voci('inUsePrudent'), n: 128_000 });
  assert.deepEqual(carta.memoriaInUso({ finestra: 65_536, fonte: 'persona', letta: { finestra: 163_840, fonte: 'catalogo' } }), { ...voci('inUseWritten'), n: 65_536 });
  assert.deepEqual(carta.memoriaInUso({ finestra: 200_000, fonte: 'persona', letta: { finestra: 163_840, fonte: 'catalogo' } }), { ...voci('inUseWrittenAbove'), n: 200_000, catalogo: 163_840 });
  assert.equal(carta.memoriaInUso(null), null);
  for (const k of ['inUseRead', 'inUsePrudent', 'inUseWritten', 'inUseWrittenAbove']) for (const lingua of ['en', 'it']) for (const v of Object.values(voci(k))) assert.equal(typeof TESTI[lingua][v], 'string', `${lingua} ${v}`);
  for (const forma of ['One', 'Many']) {
    assert.match(TESTI.en[`varie.modelMemory.card.inUseWrittenAbove${forma}`], /larger than the catalog \(\{catalogo\}\)/u);
    assert.match(TESTI.it[`varie.modelMemory.card.inUseWrittenAbove${forma}`], /più grande del catalogo \(\{catalogo\}\)/u);
  }
});

test('SG2-FR-05 (punto 5): i limiti del campo si leggono da un posto solo, quello del server', () => {
  assert.equal(carta.MEMORIA_MINIMA, FINESTRA_SCRITTA_MINIMA);
  assert.equal(carta.MEMORIA_MASSIMA, FINESTRA_SCRITTA_MASSIMA);
  const sorgente = readFileSync(new URL('../../src/components/carta-memoria-modello.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sorgente, /=\s*4_?096\b|=\s*10_?000_?000\b/u, 'nessuna seconda copia dei limiti');
  assert.doesNotMatch(sorgente, /131072|MEMORIA_MINIMA \* 32/u, 'nessun esempio inventato nel campo');
});
