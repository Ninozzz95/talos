/*
 * R3 lane SP — the approval dialog and the keys, through the REAL TuiApp (r3-sp-fixture.ts): the grace period of the
 * approval key race (owner decision, binding), Enter on the highlighted Deny vs Esc (Q-R3-6/14), Ctrl+O glued to text
 * (R3-KEYS, coordinator), the persistent safety labels and the (unsandboxed) title (Q-R3-13). A dialog is recognised by
 * its operation line (`Shell · npm test`), which exists before and after R3, so these tests are red on the old code for
 * the behaviour, not for a word.
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {hermeticProfile} from './r1-layout-fixture.ts';
import {composerLine,mountR3App,sleep} from './r3-sp-fixture.ts';

const env=hermeticProfile();
after(()=>env.restore());

test('R3-SP key race (app): a key 50 ms after the dialog opens goes to the composer; one at 350 ms answers',async()=>{
  let now=10_000;
  const app=await mountR3App({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now});
  try{
    app.emit('run.started',{runId:'r1'});
    app.emit('tool.started',{toolCallId:'t1',toolName:'shell'});
    app.emit('approval.required',{requestId:'q1',action:{tool:'shell',command:'npm test',toolCallId:'t1'}});
    await app.waitFor('the approval dialog',s=>s.text.includes('Shell · npm test'));
    now+=50;app.press('1');await sleep(120);
    assert.deepEqual(app.answers,[],'a key typed within the grace answered the approval');
    now+=300;app.press('1');
    await app.waitFor('the dialog closed',s=>!s.text.includes('Shell · npm test'));
    assert.deepEqual(app.answers,[{requestId:'q1',approved:true}]);
    const composer=composerLine(await app.screen());
    assert.match(composer,/^│ › 1\b/u,`the type-ahead key is in the composer: ${JSON.stringify(composer)}`);
  }finally{app.unmount();}
});

test('R3-SP Q-R3-6/14 (app): Enter answers the highlighted Deny and the turn goes on; Esc denies and stops the turn',async()=>{
  let now=50_000;
  const app=await mountR3App({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now});
  try{
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',{requestId:'q1',action:{tool:'shell',command:'npm test',toolCallId:'t1'}});
    await app.waitFor('the approval dialog',s=>s.text.includes('Shell · npm test'));
    now+=1_000;app.press('\r');
    await app.waitFor('the dialog closed',s=>!s.text.includes('Shell · npm test'));
    assert.deepEqual(app.answers,[{requestId:'q1',approved:false}]);
    await sleep(80);assert.equal(app.cancels(),0,'the highlighted Deny does not stop the turn');
    app.emit('approval.required',{requestId:'q2',action:{tool:'shell',command:'rm -rf build',toolCallId:'t2'}});
    await app.waitFor('the second approval',s=>s.text.includes('Shell · rm -rf build'));
    now+=1_000;app.press('\u001b');
    await app.waitFor('the dialog closed',s=>!s.text.includes('Shell · rm -rf build'));
    for(let i=0;i<40&&app.cancels()===0;i++)await sleep(25);
    assert.deepEqual(app.answers.at(-1),{requestId:'q2',approved:false});
    assert.equal(app.cancels(),1,'Esc denies and stops the turn');
  }finally{app.unmount();}
});

test('R3-KEYS (app): Ctrl+O glued to text never reaches the model as U+000F',async()=>{
  const app=await mountR3App({cols:100,rows:30,root:env.root,paths:env.paths});
  try{
    /* stage 7.12: Ctrl+O opens the transcript mode, which takes the text glued after it; nothing reaches the model, and
       never U+000F */
    app.press('\u000fKEYS glued');
    await app.waitFor('the transcript mode',s=>/^ Transcript · /mu.test(s.text));
    app.press('\u001b');await app.waitFor('back',s=>!/^ Transcript · /mu.test(s.text));
    app.press('\r');await sleep(300);
    assert.ok(app.prompts.every(prompt=>!prompt.includes('\u000f')),JSON.stringify(app.prompts));
    assert.deepEqual(app.prompts,[]);
  }finally{app.unmount();}
});

test('R3-SP Q-R3-13 (app): no verified sandbox → persistent "No sandbox" and "(unsandboxed)" on a command approval',async()=>{
  let now=90_000;
  const app=await mountR3App({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,shellIsolation:async()=>({verified:false})});
  try{
    await app.waitFor('the No sandbox label',s=>s.text.includes('no sandbox'));
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',{requestId:'q1',action:{tool:'shell',command:'npm test',toolCallId:'t1'}});
    await app.waitFor('the unsandboxed title',s=>s.text.includes('Permission: Shell (unsandboxed)'));
  }finally{app.unmount();}
  const full=await mountR3App({cols:100,rows:30,root:env.root,paths:env.paths,permissionMode:'bypassPermissions',shellIsolation:async()=>({verified:true})});
  try{
    await full.waitFor('the Full access label',s=>s.text.includes(' full access · '));
    assert.equal((await full.screen()).text.includes('no sandbox'),false);
  }finally{full.unmount();}
});

/* UI Phase 0 (owner 27/09, "like Claude Code"): these two tests pinned Q-R3-7's "after the turn the roster says done". The
   footer now lists agents only while a subagent works; the status row keeps the one vocabulary (`✓ done`). */
const row=(over:Record<string,unknown>)=>({id:'s1',sessionId:'s1',name:null,project:null,path:null,model:'m',parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt:null,updatedAt:null,endedAt:null,outcome:'running',interrupted:false,usage:null,approvalWait:null,collisions:[],delegationOutcome:null,delegationEvidence:null,...over});

test('R3-SP one vocabulary (app): with no subagent the footer lists no agent, during or after the turn; the status row says done',async()=>{
  let outcome='running';
  const app=await mountR3App({cols:100,rows:30,root:env.root,paths:env.paths,sessions:()=>[row({outcome})]});
  try{
    app.emit('run.started',{runId:'r1'});
    const busy=await app.waitFor('the turn runs',s=>/^ \S Thinking · \d+s · /mu.test(s.text));
    assert.doesNotMatch(busy.text,/[•›●] main · /u,'no subagent: no agent row while the turn runs');
    outcome='completed';app.emit('run.completed',{runId:'r1'});
    const done=await app.waitFor('the turn ended',s=>/✓ Done in/u.test(s.text));await sleep(200);
    assert.doesNotMatch((await app.screen()).text,/[•›●] main · /u,'no agent row after the turn');
    assert.ok(done);
  }finally{app.unmount();}
});

/*
 * Owner decision (2026-09-24, R3): the sandbox check starts at STARTUP, in the background, and is interruptible. The
 * lazy start of the previous follow-up (at the first command) is withdrawn: R0 decision 4 stands, the `No sandbox` label
 * appears shortly after startup. Neither the first frame nor a key waits for the check.
 */
test('R3-SP Q-R3-13 (app): the check starts at boot in the background; keys work before its verdict, the label follows it',async()=>{
  let calls=0;let answer:(value:{verified:boolean})=>void=()=>{};
  const app=await mountR3App({cols:100,rows:30,root:env.root,paths:env.paths,shellIsolation:()=>{calls++;return new Promise(resolve=>{answer=resolve;});}});
  try{
    for(let i=0;i<40&&calls===0;i++)await sleep(25);
    assert.equal(calls,1,'the check did not start at boot');
    app.press('hello');
    await app.waitFor('the composer takes keys while the check runs',s=>/^│ › hello/mu.test(s.text));
    assert.equal((await app.screen()).text.includes('no sandbox'),false,'no verdict yet, no label');
    answer({verified:false});
    await app.waitFor('the No sandbox label',s=>s.text.includes('no sandbox'));
    assert.equal(calls,1,'asked once');
  }finally{app.unmount();}
});

test('R3-SP Q-R3-13 (app): a check stopped because TALOS is quitting answers nothing — no label',async()=>{
  const app=await mountR3App({cols:100,rows:30,root:env.root,paths:env.paths,shellIsolation:async()=>({verified:false,aborted:true})});
  try{
    await sleep(300);
    assert.equal((await app.screen()).text.includes('no sandbox'),false,'an aborted check was shown as a verdict');
  }finally{app.unmount();}
});

/* FE-048: the row under the composer left, the footer's pill took its place. An agent the kernel announces only after the delegation started
   still reaches the footer while it works, and leaves it when it ends. */
test('a child announced after the delegation started reaches the footer while it works, and leaves it',async()=>{
  const app=await mountR3App({cols:100,rows:30,root:env.root,paths:env.paths,sessions:()=>[row({outcome:'unknown'})]});
  try{
    app.emit('run.started',{runId:'r1'});
    app.emit('tool.started',{toolCallId:'d1',toolName:'delega_sottotask'});
    await app.waitFor('the delegation runs',s=>/^ \S Delegating to 1 agent · /mu.test(s.text));
    await sleep(300);
    const change=(reason:string,status:string)=>app.emit('agent.changed',{childId:'c1',parentId:'s1',reason,kind:'lifecycle',status,task:'late child',startedAt:new Date().toISOString(),...(status==='completed'?{ended:true}:{})});
    change('created','started');
    await app.waitFor('the late child in the footer',s=>/← 1 agent\b/u.test(s.text),5_000);
    change('completed','completed');
    await app.waitFor('it left the footer',s=>!/← 1 agent\b/u.test(s.text),5_000);
  }finally{app.unmount();}
});
