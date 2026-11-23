/* The acceptance fake keys its scripts on what the person typed LAST; toward a local engine the r4 kernel merges a message that
   follows a failed turn, or a /compact summary, into one user message (kernel c722f55c9). */
import assert from 'node:assert/strict';
import test from 'node:test';
import {planResponse,typedLast} from './fake-provider.ts';

test('the fake finds what the person typed last inside a merged user message',()=>{
  assert.equal(typedLast('ERR429 please',[]),'ERR429 please');
  assert.equal(typedLast('ERR404 please\n\nERR429 please',['ERR404 please']),'ERR429 please');
  assert.equal(typedLast('A\n\nB\n\nC',['A','A\n\nB']),'C','the longest earlier text is the prefix');
  assert.equal(typedLast('two\n\nparagraphs',[]),'two\n\nparagraphs','a prompt with a blank line of its own is left whole');
  assert.equal(typedLast('ERR404 please',['ERR404 please']),'ERR404 please','the same text again is not emptied');
  assert.equal(typedLast('[conversation compacted at turn 8: what follows is a summary, not the original history]\n\nOK\n\nContinua 60, grazie.',[]),'Continua 60, grazie.');
});
test('the fake answers the last message, not the failed one before it',()=>{
  const body={messages:[{role:'user',content:'ERR404 please\n\nERR429 please'}]};
  assert.equal(planResponse(body).status,404,'read whole, the first keyword wins: the defect of 13/10/2026');
  assert.equal(planResponse(body,{lastUser:typedLast('ERR404 please\n\nERR429 please',['ERR404 please'])}).status,429);
});
