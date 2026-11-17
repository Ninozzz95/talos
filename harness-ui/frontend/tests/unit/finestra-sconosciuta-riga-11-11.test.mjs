/*
 * 11/11/2026 — decisione dell'owner 13:50 (v1465, punto 5, «Sì, come Hermes»): quando la memoria del modello (la finestra) non è nota,
 * una riga lo dice alla persona in parole semplici, EN e IT, e nelle Impostazioni c'è un campo per scriverla per quel modello.
 * La riga compare SOLO con la finestra non nota (`source: 'prudent'` della politica del server); il campo rifiuta i valori assurdi
 * con un messaggio, prima ancora di mandarli. Fonti: Hermes `agent/model_metadata.py:255-271`; DeepSeek
 * `packages/client/ui-settings-models/src/client/locales.ts:56-57` («Context window», «Uses the provider default»).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { limiteCheAgisce, percheDelLimite } from '../../src/components/contesto-scheda.js';
import { TESTI } from '../../src/i18n/testi/index.js';

const carta = await import('../../src/components/carta-memoria-modello.js').catch(() => ({}));
/* la politica del server con la finestra prudente: `windowUnknown` in più, la `source` di sempre (vedi FS-06 del server) */
const PRUDENTE = { triggerTokens: 96_000, warningTokens: 76_800, windowTokens: 128_000, source: 'fallback', windowUnknown: true }; // giro dopo i revisori, punto 3: `fallback`

test('FS-RIGA-01 (rossa prima della cura): con la finestra non nota la riga dice che la memoria non è nota e che TALOS usa una misura prudente', () => {
  const limite = limiteCheAgisce({ politica: PRUDENTE });
  assert.ok(limite, 'la politica prudente è un limite che agisce');
  assert.equal(limite.soglia, 96_000);
  const p = percheDelLimite(limite);
  assert.equal(p?.chiave, 'processi.inspector.limitWhyPrudent');
  assert.equal(TESTI.en['processi.inspector.limitWhyPrudent'], 'This model\'s memory is not known: TALOS uses a careful measure and compacts above {soglia}. You can write the right one in Settings → Memory and context.');
  assert.equal(TESTI.it['processi.inspector.limitWhyPrudent'], 'La memoria di questo modello non è nota: TALOS usa una misura prudente e compatta oltre {soglia}. Puoi scrivere quella giusta in Impostazioni → Memoria e contesto.');
  // anche quando decide il motore del contesto: il modello è lo stesso, e la sua memoria resta non nota
  const delMotore = limiteCheAgisce({ budget: { triggerTokens: 80_000, windowTokens: 128_000 }, politica: PRUDENTE });
  assert.equal(delMotore.fonte, 'motore');
  assert.equal(percheDelLimite(delMotore).chiave, 'processi.inspector.limitWhyPrudent');
});

test('FS-RIGA-02 (al contrario): con la finestra nota la riga resta quella di oggi, e niente parla di memoria non nota', () => {
  const nota = { triggerTokens: 122_880, warningTokens: 98_304, windowTokens: 163_840, source: 'route-minimum' };
  assert.deepEqual(limiteCheAgisce({ politica: nota }), { soglia: 122_880, finestra: 163_840, fonte: 'route-minimum' });
  assert.equal(percheDelLimite(limiteCheAgisce({ politica: nota })).chiave, 'processi.inspector.limitWhyWindow');
  assert.deepEqual(limiteCheAgisce({ budget: { triggerTokens: 130_212, windowTokens: 200_000 }, politica: nota }), { soglia: 130_212, finestra: 200_000, fonte: 'motore' });
  assert.equal(percheDelLimite({ soglia: 1, finestra: 2, fonte: 'motore' }).chiave, 'processi.inspector.limitWhyEngine');
});

test('FS-CAMPO-01 (rossa prima della cura): il campo legge un numero di token; un valore assurdo si rifiuta con un messaggio, EN e IT', () => {
  assert.equal(typeof carta.leggiMemoriaScritta, 'function', 'la carta della memoria del modello esiste');
  assert.deepEqual(carta.leggiMemoriaScritta('163840'), { ok: true, valore: 163_840 });
  assert.deepEqual(carta.leggiMemoriaScritta(' 163.840 '), { ok: true, valore: 163_840 });
  assert.deepEqual(carta.leggiMemoriaScritta('163,840'), { ok: true, valore: 163_840 });
  assert.deepEqual(carta.leggiMemoriaScritta(''), { ok: true, valore: null }, 'vuoto: torna automatica');
  for (const assurdo of ['0', '-5', '20000000', 'tanto', '1.5e9', '4095']) assert.deepEqual(carta.leggiMemoriaScritta(assurdo), { ok: false, chiave: 'varie.modelMemory.card.invalid' }, assurdo);
  assert.equal(TESTI.en['varie.modelMemory.card.invalid'], 'Write a whole number of tokens between 4,096 and 10,000,000.');
  assert.equal(TESTI.it['varie.modelMemory.card.invalid'], 'Scrivi un numero intero di token fra 4.096 e 10.000.000.');
  for (const k of ['title', 'description', 'modelLabel', 'valueLabel', 'valueHelp', 'save', 'remove', 'saved', 'notSaved', 'none']) {
    for (const lingua of ['en', 'it']) assert.equal(typeof TESTI[lingua][`varie.modelMemory.card.${k}`], 'string', `${lingua} ${k}`);
  }
});
