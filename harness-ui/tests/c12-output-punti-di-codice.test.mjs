/*
 * C12 (coda Codex, A15; bugfixer 10/10/2026) — la pagina dell'output di un nodo (`workflow_output`) conta il resto nella STESSA
 * unità del taglio. `offset`/`limit` sono punti di codice (`[...testo]`), ma il resto sottraeva `pagina.length`, cioè unità
 * UTF-16: un'emoji vale 2. Con «😀😀😀» e limit 2 il resto veniva −1 e la pagina non diceva che mancava un carattere: il modello
 * credeva di aver letto tutto. Come Codex (`utils/string/src/truncate.rs`: `chars().count()` e il conteggio del tolto sugli
 * stessi `chars`), il resto si conta in punti di codice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { letturaOutputPerIlModello } from '../src/workflow/per-il-modello.mjs';

const base = { runId: 'run-1', nodeId: 'n', sha256: 'abc', bytes: 12 };

test('C12-01: tre emoji, limit 2 — la pagina dice che ne resta una', () => {
  const testo = letturaOutputPerIlModello({ ...base, testo: '😀😀😀', limit: 2 });
  assert.match(testo, /showing 2 of 3 characters, from offset 0/u);
  assert.match(testo, /😀😀\n\n… and 1 more characters$/u, 'il resto dichiarato, in punti di codice');
});

test('C12-02: la pagina successiva, dal resto dichiarato, porta il carattere che mancava e niente resto', () => {
  const testo = letturaOutputPerIlModello({ ...base, testo: '😀😀😀', offset: 2, limit: 2 });
  assert.match(testo, /showing 1 of 3 characters, from offset 2/u);
  assert.ok(testo.endsWith('\n\n😀'), 'il terzo carattere, intero');
  assert.doesNotMatch(testo, /more characters/u);
});

test('C12-03: testo misto — il resto è quello dei punti di codice, non delle unità UTF-16', () => {
  const testo = letturaOutputPerIlModello({ ...base, testo: `a😀b${'𝔸'.repeat(10)}`, limit: 3 });
  assert.match(testo, /a😀b\n\n… and 10 more characters$/u);
});

test('C12-04, AL CONTRARIO: testo ASCII come prima', () => {
  const testo = letturaOutputPerIlModello({ ...base, testo: 'x'.repeat(5000), limit: 100 });
  assert.match(testo, /showing 100 of 5000 characters, from offset 0/u);
  assert.match(testo, /and 4900 more characters$/u);
  assert.doesNotMatch(letturaOutputPerIlModello({ ...base, testo: 'abc', limit: 3 }), /more characters/u, 'tutto letto: nessun resto');
});
