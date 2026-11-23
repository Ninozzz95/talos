import assert from 'node:assert/strict';
import test from 'node:test';
import {earlierRowText} from '../../src/tui/components/earlier-row.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

test('the earlier row says how many messages wait, singular and plural, and what to do', () => {
  assert.equal(earlierRowText({items:1,messages:1},120), '↑ 1 earlier message not loaded · click or scroll up to load');
  assert.equal(earlierRowText({items:480,messages:162},120), '↑ 162 earlier messages not loaded · click or scroll up to load');
});

test('with no message among the waiting items it counts items', () => {
  assert.equal(earlierRowText({items:1,messages:0},120), '↑ 1 earlier item not loaded · click or scroll up to load');
  assert.equal(earlierRowText({items:30,messages:0},120), '↑ 30 earlier items not loaded · click or scroll up to load');
});

test('the row never exceeds the width it is given', () => {
  for (const width of [80, 40, 20, 5, 1]) assert.ok(displayWidth(earlierRowText({items:480,messages:162}, width)) <= width, `width ${width}`);
});
