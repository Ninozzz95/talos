/*
 * Row 224, the fourth road (from the correctness reviewer of 23/11/2026, rev-cor-224-plan-tui). The REAL TuiApp
 * (r5a-s-fixture.ts) at 80×24 and 120×40, temp profile, no kernel, no network.
 *   A plan approved «in a clean conversation» (plan.resolved{decision:'clean-conversation',newSessionId}) moves the screen to the
 *   new session (app.ts onPlanApproved → changeSession('resume')): nothing of the conversation before stays on screen — not its
 *   tokens, not its agents, not its plan, not its «Done in» — exactly as /clear, /resume and /fork (freshConversationView).
 *   The other way round: a plan approved in the SAME conversation (accept-edits, no new session) keeps the view as it is.
 * Owner, asking for it by name: «se inizio una nuova sessione non rimane altro di un'altra sessione».
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const OUT=process.env.RIGA224_FRAMES;
let n=0;const project=()=>{const root=join(env.root,`plan-clean-${++n}`);mkdirSync(root,{recursive:true});return root;};
const SIZES=[[80,24],[120,40]] as const;
/* what the conversation before leaves on screen, by name */
const leftovers=(text:string)=>[
  /↑91\.2k/u.test(text)?'tokens':'',
  /\d agents? working|← \d agent|Audit the dep/u.test(text)?'agents':'',
  /Move the worker/u.test(text)?'plan':'',
  /Done in/u.test(text)?'Done in':'',
].filter(Boolean);

async function approvePlan({cols,rows,decision,newSessionId}:{cols:number;rows:number;decision:string;newSessionId?:string}){
  const modeCalls:string[]=[];
  const app=await mountR5a({cols,rows,root:project(),paths:env.paths,runtimeExtra:{listSessions:async()=>[{sessionId:'s1'},{sessionId:'s7'}],setPermissionMode:async(id:string)=>{modeCalls.push(id);}}});
  try{
    const at=new Date().toISOString();
    app.emit('run.started',{runId:'r1'});
    app.emit('agent.changed',{childId:'k1',parentId:'s1',reason:'created',kind:'lifecycle',status:'running',task:'Audit the dependencies',startedAt:at});
    app.emit('usage.updated',{value:{promptTokens:91_234,completionTokens:4_321}});
    app.emit('plan.required',{requestId:'p1',hash:'sha256:'+'c'.repeat(64),content:'1. Move the worker',revision:1});
    await sleep(200);app.emit('run.completed',{runId:'r1'});await sleep(200);
    const before=await app.settle();
    app.emit('plan.resolved',{requestId:'p1',status:'approved',decision,...(newSessionId?{newSessionId}:{}),by:'person'});
    await sleep(600);
    const afterApproval=await app.settle();
    if(OUT)writeFileSync(`${OUT}-${decision}-${cols}x${rows}.txt`,`--- before ---\n${before.text}\n--- after ---\n${afterApproval.text}\n`);
    return{before:before.text,after:afterApproval.text,modeCalls};
  }finally{app.unmount();await sleep(50);}
}

for(const [cols,rows] of SIZES){
  const tag=`${cols}x${rows}`;
  test(`row 224 ${tag}: a plan approved in a clean conversation leaves nothing of the conversation before`,async()=>{
    const {before,after:shown,modeCalls}=await approvePlan({cols,rows,decision:'clean-conversation',newSessionId:'s7'});
    /* the scene is real: before the approval the old conversation is on screen (or the check below proves nothing); at 80
       columns the status row has no room for the tokens, at 120 it has */
    const shownBefore=leftovers(before);
    assert.ok(shownBefore.includes('agents')&&shownBefore.includes('Done in')&&(cols<120||shownBefore.includes('tokens')),`the old conversation was never on screen:\n${before}`);
    assert.ok(modeCalls.includes('s7'),`the screen did not move to s7: ${modeCalls.join(',')}`);
    assert.deepEqual(leftovers(shown),[],`the clean conversation still shows: ${leftovers(shown).join(', ')}\n${shown}`);
  });
  test(`row 224 ${tag}, the other way round: a plan approved in the same conversation keeps the view`,async()=>{
    const {before,after:shown,modeCalls}=await approvePlan({cols,rows,decision:'accept-edits'});
    assert.ok(!modeCalls.includes('s7'),`the screen moved to another conversation: ${modeCalls.join(',')}`);
    assert.ok(leftovers(before).includes('agents'),`the conversation was never on screen:\n${before}`);
    /* everything the conversation showed before the approval is still there after it, and its plan too */
    for(const kept of [...leftovers(before),'plan'])assert.ok(leftovers(shown).includes(kept),`the same conversation lost its ${kept}:\n${shown}`);
  });
}
