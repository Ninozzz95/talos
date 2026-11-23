/*
 * The person's message as the approved mockup draws it (07/10 `buildItemRows` kind 'user'; owner 08/10 «Tutta la conversazione»):
 * ` › ` then the words, wrapped by words at width-4, continuation rows under three spaces, each row padded to the full width
 * so the band colour fills it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {PROMPT_LEAD,promptRows,wrapWords} from '../../src/tui/components/conversation-rows.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

test('mockup prompt: one row, ` › ` and the words, padded to the width', () => {
  const rows=promptRows('The login e2e test is flaky. Find out why and fix it.',120);
  assert.equal(rows.length,1);
  assert.equal(rows[0]!.trimEnd(),' › The login e2e test is flaky. Find out why and fix it.');
  assert.equal(displayWidth(rows[0]!),120);
  assert.equal(PROMPT_LEAD,' › ');
});

test('mockup prompt: long words wrap by words at width-4; the rows after the first start with three spaces', () => {
  const rows=promptRows('alpha beta gamma delta epsilon',16);
  assert.deepEqual(rows.map(row=>row.trimEnd()),[' › alpha beta',' '.repeat(3)+'gamma delta',' '.repeat(3)+'epsilon']);
  for(const row of rows)assert.equal(displayWidth(row),16);
});

test('mockup wrap: a word longer than the row is cut; empty lines stay; wide characters count two cells', () => {
  assert.deepEqual(wrapWords('abcdefghij',4),['abcd','efgh','ij']);
  assert.deepEqual(wrapWords('one\n\ntwo',10),['one','','two']);
  for(const row of wrapWords('日本語の文章です とても長い',6))assert.ok(displayWidth(row)<=6,row);
});
