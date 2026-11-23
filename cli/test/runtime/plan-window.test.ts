/*
 * Review of 0.6.2 (bugfixer, 13/10/2026): the two rules of the ChatGPT plan's window that no test held (runtime/plan-window.ts;
 * chatgpt-plan-context-engine.test.ts measures the signed-in path through the real composition and the fake OpenAI).
 *   · nobody signed in: nothing is asked, ever;
 *   · two prepares at once: ONE request, and the second waits for its answer (RED before the cure: it returned at once, inside the
 *     minute's gate, so a parallel session's first request was prepared without the window, i.e. without the Context Engine).
 * No kernel, no network, no account: the plan is a counter.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPlanWindow,PLAN_LIST_RETRY_MS} from '../../src/runtime/plan-window.ts';

function bench({signedIn=true,list}:{signedIn?:boolean;list?:()=>Promise<readonly unknown[]>}={}){
  const known=new Set<string>();const asked:number[]=[];let clock=1_000_000;let lookedForPlan=0;
  let answer:(rows:readonly unknown[])=>void=()=>{};
  const plan={models:()=>{asked.push(clock);return list?list():new Promise<readonly unknown[]>(resolve=>{answer=resolve;});}};
  const prepare=createPlanWindow({
    known:id=>known.has(id),
    signedInPlan:async()=>{lookedForPlan+=1;return signedIn?plan:null;},
    remember:rows=>{for(const row of rows as Array<{slug:string;context_window?:number}>)if(row.context_window)known.add(row.slug);},
    now:()=>clock,
  });
  return{prepare,known,asked,answer:(rows:readonly unknown[])=>answer(rows),advance:(ms:number)=>{clock+=ms;},looked:()=>lookedForPlan};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('nobody signed in: nothing is sent, at the first prepare or at any later one',async()=>{
  const b=bench({signedIn:false});
  await b.prepare('gpt-5.5');await b.prepare('gpt-5.5');b.advance(PLAN_LIST_RETRY_MS*3);await b.prepare('gpt-5.5');
  assert.deepEqual(b.asked,[],'the account was never asked');
  assert.equal(b.looked(),3,'and signing in later is seen at the next prepare (no minute to wait for)');
});

test('two prepares at once send one request, and both have the window when they go on',async()=>{
  const b=bench();
  let firstDone=false,secondDone=false;
  const first=b.prepare('gpt-5.5').then(()=>{firstDone=true;});
  await tick();
  const second=b.prepare('gpt-5.5').then(()=>{secondDone=true;});
  await tick();await tick();
  assert.equal(b.asked.length,1,'one request for the two of them');
  assert.equal(firstDone,false);
  assert.equal(secondDone,false,'the second prepare went on before the answer: its request is prepared without the window');
  b.answer([{slug:'gpt-5.5',context_window:400_000}]);
  await Promise.all([first,second]);
  assert.equal(b.known.has('gpt-5.5'),true);
  await b.prepare('gpt-5.5');
  assert.equal(b.asked.length,1,'and a known window asks nothing');
});

test('a list that brings no window is not asked again for a minute, then it is',async()=>{
  const b=bench({list:async()=>{throw new Error('down');}});
  await b.prepare('gpt-5.5');await b.prepare('gpt-5.5');
  assert.equal(b.asked.length,1);
  b.advance(PLAN_LIST_RETRY_MS-1);await b.prepare('gpt-5.5');assert.equal(b.asked.length,1);
  b.advance(1);await b.prepare('gpt-5.5');assert.equal(b.asked.length,2);
});
