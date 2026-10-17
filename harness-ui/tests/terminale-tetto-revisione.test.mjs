/*
 * Verifica delle cure a 4095c4b4c (07ff7dc92, 16/10/2026): al tetto dei terminali senza sessione si libera il PIÙ VECCHIO
 * senza shell viva. La prova del ramo usa un solo candidato libero, e il mutante «il più recente» sopravvive: qui due liberi
 * con età diverse. Il più recente è di una finestra che con ogni probabilità c'è ancora (il ricaricamento la ritrova).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { creaRegistroSchedeTerminale } from '../src/terminal-registry.mjs';

test('TERM-VER-01 — al tetto si libera il più VECCHIO dei terminali senza shell viva, non il più recente', () => {
  let adesso = Date.parse('2026-10-16T10:00:00Z');
  const vive = new Set();
  const chiuse = [];
  const registro = creaRegistroSchedeTerminale({
    cartellaDiSessione: () => null, cartellaStandalone: 'C:/progetto', schedeMassimePerSessione: 3,
    clock: () => new Date(adesso), statoPtyFn: (id) => ({ viva: vive.has(id) }), chiudiPtyFn: (id) => chiuse.push(id),
  });
  const vecchio = registro.creaStandalone().terminalId; adesso += 60_000;
  const viva = registro.creaStandalone().terminalId; vive.add(viva); adesso += 60_000;
  const recente = registro.creaStandalone().terminalId; adesso += 60_000;
  const nuovo = registro.creaStandalone();
  assert.ok(nuovo.terminalId, 'al tetto con due liberi se ne crea uno');
  assert.deepEqual(chiuse, [vecchio], 'si libera il più vecchio');
  const restano = registro.elencaStandalone().items.map((v) => v.terminalId).sort();
  assert.deepEqual(restano, [viva, recente, nuovo.terminalId].sort(), 'la viva e la recente restano');
});
