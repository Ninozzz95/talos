/**
 * Owner 09/10/2026 («Sì, con la carta»): the desktop's three tools on OpenRouter's downstream providers come to the CLI. On the
 * BUILT CLI through ConPTY: the model asks to exclude deepinfra, a card shows before → after with only «once» and «deny», the
 * person approves, the tool says it is done, and the person's own door (`talos provider exclusions`) lists it; `allow` undoes
 * it. In `-p` nobody can answer a card, so only the list is offered.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {approvalVisible,idleFooter} from './checks.ts';
import {answerApproval,stage,toComposer} from './harness.ts';

const s=stage({name:'s58',files:{'README.md':'# demo\n'}});

test('s58 · the model asks to exclude a provider: a card says before → after, the person approves, it is done',async()=>{
  const t=s.launch([],{cols:110,rows:34});
  try{
    await toComposer(t);
    await t.submit('EXCLUDEME please');
    const card=await t.waitFor('the card for the exclusion',x=>approvalVisible(x)&&/deepinfra/u.test(x.text),{timeout:30_000});
    assert.match(card.text,/Exclude deepinfra on OpenRouter, for every model/u,card.text);
    assert.match(card.text,/excluded: none → deepinfra/u,card.text);
    assert.doesNotMatch(card.text,/always/iu,'no «always»: every change of the excluded providers is asked');
    await answerApproval(t,'1');
    const end=await t.waitFor('the answer after the change',x=>idleFooter(x)&&x.text.includes('Tool said:'),{timeout:30_000});
    assert.match(end.text,/Tool said: Done\. Excluded for every model: deepinfra/u,end.text);
  }finally{await t.close();}
  const listed=await s.profile.talos(['provider','exclusions']);
  assert.equal(listed.status,0,listed.stderr);
  assert.match(listed.stdout,/Excluded by the person, for every model: deepinfra/u,listed.stdout);
  const allowed=await s.profile.talos(['provider','allow','deepinfra']);
  assert.equal(allowed.status,0,allowed.stderr);
  assert.match(allowed.stdout,/Excluded for every model: none/u,allowed.stdout);
  const excluded=await s.profile.talos(['provider','exclude','together']);
  assert.match(excluded.stdout,/Excluded for every model: together/u,excluded.stdout);
});

test('s58 · in -p only the list of excluded providers is offered',async()=>{
  const r=await s.profile.talos(['-p','PROVIDERTOOLS which tools','--output-format','json']);
  assert.match(r.stdout,/Offered: provider_exclusions_list\./u,`${r.stdout}${r.stderr}`);
});
