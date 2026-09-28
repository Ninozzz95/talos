/*
 * ⛔ 24/09/2026 — l'avanzamento della ricerca approfondita (decisione owner «Barra + fase e conteggi», memoria
 * `ricerca-approfondita-barra-di-avanzamento`). I numeri sono quelli della ricerca vera dell'owner 92536781… (2 linee da
 * 1 ricerca + 5 pagine, 7 passi, 1 fallito, 2 parti del rapporto), ridotti ai campi che servono.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { avanzamentoRicerca } from '../src/research/avanzamento.mjs';

const PIANO = [
  { id: 'b1', estimate: { searches: 1, pages: 5, tokens: 9500 } },
  { id: 'b2', estimate: { searches: 1, pages: 5, tokens: 9500 } },
];
const passo = (id, branchId, kind, state, startedAt) => ({ id, branchId, kind, state, startedAt });
const PASSI = [
  passo('b1:search', 'b1', 'search', 'done', '2026-09-24T17:36:47Z'),
  passo('b1:read:1', 'b1', 'read', 'done', '2026-09-24T17:36:56Z'),
  passo('b1:read:2', 'b1', 'read', 'done', '2026-09-24T17:36:57Z'),
  passo('b2:search', 'b2', 'search', 'done', '2026-09-24T17:38:00Z'),
  passo('b2:read:1', 'b2', 'read', 'failed', '2026-09-24T17:38:50Z'),
  passo('b2:read:2', 'b2', 'read', 'running', '2026-09-24T17:38:59Z'),
];

test('RES-PROGRESS-COLLECTING: mentre raccoglie, la barra è passi finiti sui passi stimati dal piano, sotto 0,9', () => {
  const a = avanzamentoRicerca({ piano: PIANO, passi: PASSI, eventi: [], statoGiro: 'collecting', stato: 'running' });
  assert.equal(a.fase, 'ricerca');
  assert.equal(a.passiStimati, 12);
  assert.equal(a.passiFatti, 4);
  assert.equal(a.passiFalliti, 1);
  assert.equal(a.frazione, Math.round(0.9 * (5 / 12) * 1000) / 1000);
  assert.equal(a.lineeTotali, 2);
  assert.equal(a.lineaCorrente, 2, 'la linea del passo partito per ultimo');
  assert.equal(a.fontiLette, 2);
});

test('RES-PROGRESS-WRITING: una parte del rapporto depositata vuol dire che scrive, anche se il giro dice ancora «raccoglie»', () => {
  const eventi = [{ kind: 'deposit_part', indice: 1 }, { kind: 'deposit_part', indice: 2 }];
  const a = avanzamentoRicerca({ piano: PIANO, passi: PASSI, eventi, statoGiro: 'collecting', stato: 'running' });
  assert.equal(a.fase, 'scrittura');
  assert.equal(a.partiRapporto, 2);
  assert.equal(a.frazione, 0.93);
});

test('RES-PROGRESS-NEVER-FULL-WHILE-RUNNING: al contrario, più passi della stima non fanno mai il 100% prima della fine', () => {
  const tanti = Array.from({ length: 30 }, (_, i) => passo('b1:read:' + i, 'b1', 'read', 'done', '2026-09-24T17:40:' + String(i).padStart(2, '0') + 'Z'));
  const a = avanzamentoRicerca({ piano: PIANO, passi: tanti, eventi: [], statoGiro: 'collecting', stato: 'running' });
  assert.ok(a.frazione < 1, `frazione ${a.frazione}`);
  assert.equal(a.frazione, 0.9);
  for (const statoGiro of ['synthesising', 'verifying']) {
    assert.ok(avanzamentoRicerca({ piano: PIANO, passi: tanti, statoGiro, stato: 'running' }).frazione < 1, statoGiro);
  }
  assert.equal(avanzamentoRicerca({ piano: PIANO, passi: tanti, statoGiro: 'done', stato: 'done' }).frazione, 1);
});

test('RES-PROGRESS-UNKNOWN-IS-NULL: senza piano, o ferma, nessuna barra inventata', () => {
  const senzaPiano = avanzamentoRicerca({ piano: [], passi: PASSI, statoGiro: 'collecting', stato: 'running' });
  assert.equal(senzaPiano.frazione, null);
  assert.equal(senzaPiano.passiStimati, null);
  const ferma = avanzamentoRicerca({ piano: PIANO, passi: PASSI, statoGiro: 'paused', stato: 'paused' });
  assert.equal(ferma.fase, 'pausa');
  assert.equal(ferma.frazione, null);
  const vuota = avanzamentoRicerca();
  assert.equal(vuota.frazione, null);
  assert.equal(vuota.lineaCorrente, null);
});
