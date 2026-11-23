/*
 * 0.6.11 MEASURE, not part of the gate (owner 20/10/2026: «Prima misuro, poi ti dico»). The kernel's «deferred tools» bridge
 * (ponte-attrezzi.mjs, the desktop turned it on for itself in 0.1.33) sends the model fewer tools up front. Here: the first
 * request of the same one-line task, on the built CLI and the fake provider, with the bridge off and on — how many tools, how many
 * characters of tools, how many characters in all. Measured 20/10/2026 before the switch: off 51 tools, 52,004 and 54,237
 * characters; on 23 tools, 27,173 and 29,406. The owner then had it on by default («Sì, accendilo di serie»): off is now
 * TALOS_ATTREZZI_DIFFERITI=0, on is the default. Run: node scripts/run-tests.mjs --test-concurrency=1
 * "test/acceptance/m01-deferred-tools.measure.ts". The result is printed.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stage} from './harness.ts';

const off=stage({name:'m01-off',files:{'README.md':'# demo\n'},extraEnv:{TALOS_ATTREZZI_DIFFERITI:'0'}});
const on=stage({name:'m01-on',files:{'README.md':'# demo\n'}});
const results:Record<string,unknown>={};

for(const [label,s] of [['off',off],['on',on]] as const){
  test(`m01 · first request with the deferred tools ${label}`,async()=>{
    const run=await s.profile.talos(['-p','Say hello in one word.','--output-format','json'],120_000);
    assert.equal(run.status,0,run.stderr);
    const first=s.fake.chatRequests()[0];
    assert.ok(first,'the fake received a request');
    results[label]={tools:first!.tools?.length??0,toolsChars:first!.toolsChars??0,bodyChars:first!.bodyChars??0,requests:s.fake.chatRequests().length};
  });
}

test('m01 · result',()=>{
  console.log(`M01 ${JSON.stringify(results)}`);
});
