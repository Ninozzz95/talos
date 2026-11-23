/*
 * Tappa 8 C2 (dossier RICERCA-5x5x5x5-TAPPA8-CONFORMITA-2026-10-07; g-q23 left to stage 8 by
 * cli/test/acceptance/s48-clicks.scenario.ts:156): the «You: …» announcement must name a prompt whose header is
 * NOT visible. The header EXACTLY on the topmost visible row IS visible (hermes viewport.ts:31-41: if a user
 * message is in the visible range, no announcement). Geometry (planTranscriptRows): `firstRowFromBottom` counts
 * the transcript rows strictly below the item's first row; the topmost visible row is the one with
 * `scrollRows + rowBudget - 1` rows below it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {promptStartsAboveView} from '../../src/tui/components/transcript-virtualizer.ts';

test('a prompt whose header is exactly the topmost visible row is not announced',()=>{
  const scrollRows=6,rowBudget=24;
  assert.equal(promptStartsAboveView(scrollRows+rowBudget-1,scrollRows,rowBudget),false);
});

test('a prompt fully above the view is announced; one visible inside the window is not',()=>{
  const scrollRows=6,rowBudget=24;
  assert.equal(promptStartsAboveView(scrollRows+rowBudget,scrollRows,rowBudget),true,'the header is one row above the topmost visible row');
  assert.equal(promptStartsAboveView(scrollRows+rowBudget-2,scrollRows,rowBudget),false,'the header is the second visible row');
  assert.equal(promptStartsAboveView(0,0,24),false,'at the tail the newest prompt is in view');
});
