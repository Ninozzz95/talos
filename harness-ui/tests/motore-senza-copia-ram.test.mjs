/*
 * Owner 01/11/2026: «Riparto senza la copia in RAM», «se regge diventa la regola di serie su PC»; owner 02/11 evening: «subito».
 * It held: 281 runs on 7 families with `--load-mode none`, 0 fallbacks to the processor (`famiglie-notte.jsonl`).
 * Without it llama.cpp mapped the whole file into RAM as well as on the card, and a 17.7 GB copy closed the bench on 01/11.
 * `TALOS_LOCAL_LOAD_MODE=auto` gives the engine's own default back, the way out if a machine needs it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadConfig } from '../src/config.mjs';

test('SCR-1 on by default: the engine opens without the copy of the model in RAM', () => {
  assert.equal(loadConfig({}, import.meta.url).caricamentoMotore, 'none');
});

test('SCR-2 the way back: only the exact value `auto` leaves the choice to the engine', () => {
  assert.equal(loadConfig({ TALOS_LOCAL_LOAD_MODE: 'auto' }, import.meta.url).caricamentoMotore, null);
  for (const valore of ['none', '', '0', 'AUTO', ' auto', 'mmap']) assert.equal(loadConfig({ TALOS_LOCAL_LOAD_MODE: valore }, import.meta.url).caricamentoMotore, 'none', JSON.stringify(valore));
});

test('SCR-4 (CLI review) an engine chosen by hand gets no new option: an older binary would refuse to start, and a person who works today would stop working', () => {
  const aMano = { TALOS_LLAMA_SERVER_PATH: process.execPath };
  assert.equal(loadConfig(aMano, import.meta.url).caricamentoMotore, null);
  assert.equal(loadConfig({ ...aMano, TALOS_LOCAL_LOAD_MODE: 'none' }, import.meta.url).caricamentoMotore, 'none', 'said by hand, it is honoured');
  assert.equal(loadConfig({ ...aMano, TALOS_LLAMA_SERVER_DAL_PACCHETTO: '1' }, import.meta.url).caricamentoMotore, 'none', 'the packaged engine sets the path too: it has the option');
});

test('SCR-3 the choice reaches the engine that the app opens', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(server, /caricamento: config\.caricamentoMotore/u);
  const supervisore = readFileSync(new URL('../src/llama-server-supervisor.mjs', import.meta.url), 'utf8');
  assert.match(supervisore, /\['--load-mode', caricamento\]/u);
});
