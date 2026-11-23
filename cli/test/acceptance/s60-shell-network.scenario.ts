/**
 * The shell's network (owner 09/10/2026, «Segue il modo + si chiede (Consigliata)»). On the BUILT CLI through ConPTY, with the real
 * sandbox: in the default mode a command that asks for the network shows a card «… with network access», and after the yes the
 * sandbox line of its result says «network allowed»; in Full access a command reaches the network without a card; in `-p`, with
 * nobody to ask, the network stays closed and the command is not run.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {approvalVisible,idleFooter} from './checks.ts';
import {answerApproval,stage,toComposer} from './harness.ts';

const s=stage({name:'s60',files:{'README.md':'# demo\n'}});

test('s60 · default mode: the network for one command is asked, and allowed after the yes',async()=>{
  const t=s.launch([],{cols:120,rows:34});
  try{
    await toComposer(t);
    await t.submit('NETME run it');
    const card=await t.waitFor('the card for the network',x=>approvalVisible(x)&&/with network access/u.test(x.text),{timeout:30_000});
    assert.doesNotMatch(card.text,/always/iu,card.text);
    await answerApproval(t,'1');
    const end=await t.waitFor('the answer after the command',x=>idleFooter(x)&&x.text.includes('Tool said:'),{timeout:60_000});
    assert.match(end.text,/network allowed/u,end.text);
    assert.match(end.text,/net-ok/u,end.text);
  }finally{await t.close();}
});

test('s60 · Full access: a command reaches the network with no card',async()=>{
  const t=s.launch(['--permission-mode','bypassPermissions'],{cols:120,rows:34});
  try{
    await toComposer(t);
    await t.submit('NETPLAIN run it');
    const end=await t.waitFor('the answer after the command',x=>idleFooter(x)&&x.text.includes('Tool said:'),{timeout:60_000});
    assert.match(end.text,/network allowed/u,end.text);
  }finally{await t.close();}
});

test('s60 · -p in the default mode: nobody to ask, the network stays closed and the command is not run',async()=>{
  const r=await s.profile.talos(['-p','NETME run it','--output-format','json']);
  assert.match(r.stdout,/Tool said: REFUSED/u,`${r.stdout}${r.stderr}`);
  assert.match(r.stdout,/NETWORK_NEEDS_PERSON/u,r.stdout);
  // The refusal quotes the command («echo net-ok»); only its output would be a bare «net-ok».
  assert.doesNotMatch(r.stdout,/(?<!echo )net-ok/u,r.stdout);
  assert.doesNotMatch(r.stdout,/network allowed/u,r.stdout);
});
