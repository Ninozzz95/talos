import assert from 'node:assert/strict';
import test from 'node:test';
import {displayWidth,splitGraphemes,truncateDisplay} from '../../src/tui/text-width.ts';

test('display width handles combining marks emoji and CJK',()=>{
  assert.deepEqual(splitGraphemes('A👍🏽界'),['A','👍🏽','界']);
  assert.equal(displayWidth('e\u0301'),1);
  assert.equal(displayWidth('界'),2);
  assert.equal(displayWidth('👍🏽'),2);
  assert.equal(truncateDisplay('ab界cd',5),'ab界…');
});
