/*
 * Lezione del 17/10 (un'opzione nuova del nucleo si prova lungo tutto il filo: `agent-service` ricostruisce campo per campo): il lettore degli
 * allegati arriva dal registro al nucleo vero. Non si mocka il nucleo: si legge il sorgente del punto in cui `agent-service` lo inoltra.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const agenti = readFileSync(new URL('../src/agent-service.mjs', import.meta.url), 'utf8');
const nucleo = readFileSync(new URL('../src/kernel/talosHarness.mjs', import.meta.url), 'utf8');
const registro = readFileSync(new URL('../src/session-registry.mjs', import.meta.url), 'utf8');

test('FILO-01: registro, agent-service e nucleo parlano dello stesso campo', () => {
  assert.match(registro, /allegatiConversazioneFn: \(\) => allegatiDaEventi\(voce\.eventi\)/u);
  assert.match(agenti, /allegatiConversazioneFn = null,/u);
  assert.match(agenti, /\.\.\.\(typeof allegatiConversazioneFn === 'function' \? \{ allegatiConversazioneFn \} : \{\}\),/u);
  assert.match(nucleo, /allegatiConversazioneFn = null,/u);
});
