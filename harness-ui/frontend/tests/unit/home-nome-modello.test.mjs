import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nomeModello } from '../../src/components/session-item.js';

/*
 * 25/10/2026 (foto del 4174): in «Riprendi il lavoro» della Home la riga stampava il modello grezzo — «chatgpt:gpt-6-luna» e la targa
 * intera di un GGUF locale — mentre la stessa sessione nella barra diceva «gpt-6-luna» e il nome umano. Il nome si fa in UN posto solo.
 */
const SORGENTE = readFileSync(new URL('../../src/features/navigation/workspace-chrome.ts', import.meta.url), 'utf8');

test('HOME-MODELLO-01 — i due valori visti sul 4174 diventano il nome della barra', () => {
  assert.equal(nomeModello('chatgpt:gpt-6-luna'), 'gpt-6-luna');
  const locale = nomeModello('local:LiquidAI-LFM2-5-24B-A2B-GGUF-0912d33141f7-LFM2-5-24B-A2B-Q4-K-M-gguf');
  assert.ok(locale && !/^local:/u.test(locale) && !/0912d33141f7/u.test(locale), `nome locale ancora grezzo: ${locale}`);
});

test('HOME-MODELLO-02 — la riga di «Riprendi il lavoro» passa da nomeModello, mai row.modello a schermo', () => {
  assert.match(SORGENTE, /import \{ nomeModello \} from '\.\.\/\.\.\/components\/session-item\.js'/u);
  assert.match(SORGENTE, /const modelName = nomeModello\(row\.modello\)/u);
  assert.match(SORGENTE, /modelLabel\.textContent = modelName;/u);
  /* A9-2 (blocco 9): nessuna forma di `row.modello` arriva a schermo — anche `String(row.modello)` ingannava la versione di prima */
  assert.doesNotMatch(SORGENTE, /(?:textContent|innerText|innerHTML)\s*=[^;\n]*row\.modello/u);
});
