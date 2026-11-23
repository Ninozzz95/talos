/*
 * Review R1 of federation, held for every method (Desktop 27/10/2026: `session.context.settings` is the first PATCH a device may send,
 * and «the consent gate covers every non-GET/HEAD»): a device's request forwarded to the window that owns the conversation is
 * checked against the device's folders whatever its method, except the reads and the ways to stop.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {isConversationWrite} from '../../src/remote/federation.ts';

const S='/api/v1/sessions/0b7c2f9e-1d2a-4c3b-9e8f-112233445566';

test('every method but GET and HEAD is a write to check: POST, PATCH, PUT, DELETE, any case',()=>{
  for(const metodo of ['POST','PATCH','put','Delete'])
    for(const percorso of [`${S}/messages`,`${S}/context/settings`,`${S}/settings?x=1`,`${S}/goal`])
      assert.equal(isConversationWrite({metodo,percorso}),true,`${metodo} ${percorso}`);
  for(const metodo of ['GET','head'])assert.equal(isConversationWrite({metodo,percorso:`${S}/context`}),false,metodo);
  assert.equal(isConversationWrite({percorso:`${S}/context`}),false,'no method is a read');
});

test('stopping is never held: stop, close, a process\'s stop, pausing delegation',()=>{
  for(const percorso of [`${S}/stop`,`${S}/close`,`${S}/processes/p1/stop`,`${S}/delegation/pause`])
    assert.equal(isConversationWrite({metodo:'POST',percorso}),false,percorso);
});
