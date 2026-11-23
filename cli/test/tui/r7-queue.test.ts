/*
 * Stage 7.14 (mockup queue; owner 03/10: a new message goes to the end, Enter at rest sends it now, `c`/`r` stay as
 * /queue clear and /queue run): /queue is the mockup's sheet of the messages waiting for the turn to end. During a turn
 * Enter steers the turn with the message; u moves it up, e edits it in place, d twice deletes it, n adds one at the end.
 * Mount: the REAL TuiApp (r5a-s-fixture.ts), a temp profile, no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import test,{after,beforeEach} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
/* each test starts with no queue kept in the (temporary) profile, so a red one never leaves its queue to the next */
beforeEach(()=>rmSync(env.paths.queueRoot,{recursive:true,force:true}));
const ENTER='\r',DOWN='\x1b[B',ESC='\x1b';
let n=0;const project=()=>{const root=join(env.root,`queue-${++n}`);mkdirSync(root,{recursive:true});return root;};
const flat=(lines:readonly string[])=>lines.map(line=>line.trim()).join(' ');
const sheetRows=(text:string)=>{const lines=text.split('\n');const from=lines.findIndex(line=>line.startsWith('── Queued messages'));return from<0?[]:lines.slice(from,from+4).map(line=>line.trimEnd());};

async function emptyQueue(app:Awaited<ReturnType<typeof mountR5a>>){
  /* the queue is kept in the profile for the session: the next test must not find it restored */
  app.press(ESC);await sleep(80);await app.type('/queue clear');app.press(ENTER);
  await app.waitFor('the queue emptied',x=>/Cleared \d+ queued item|Queue is empty/u.test(flat(x.lines)));
}

async function busyWithTwo(app:Awaited<ReturnType<typeof mountR5a>>){
  await app.type('Why is the login test flaky?');app.press(ENTER);await sleep(80);
  app.emit('run.started',{runId:'r1'});
  await app.waitFor('the turn runs',x=>/esc to stop/u.test(x.text));
  for(const text of ['Also run the auth unit tests','Then draft the commit message']){await app.type(text);app.press(ENTER);await sleep(120);}
  await app.waitFor('two queued',x=>/queue 2\b/u.test(x.text));
}

test('stage 7.14: /queue during a turn — the sheet lists them in order; u, e, d and n change the queue in place',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    await busyWithTwo(app);
    await app.type('/queue');app.press(ENTER);
    let s=await app.waitFor('the sheet',x=>/── Queued messages sent in order when the turn ends/u.test(x.text));
    assert.deepEqual(sheetRows(s.text).slice(1,3),[' › Also run the auth unit tests','   Then draft the commit message']);
    assert.match(s.text,/enter send now \(steer\) {3}u move up {3}n new {3}e edit {3}d delete {3}esc close/u);
    app.press(DOWN);await app.type('u');
    s=await app.waitFor('moved up',x=>sheetRows(x.text)[1]===' › Then draft the commit message');
    assert.equal(sheetRows(s.text)[2],'   Also run the auth unit tests');
    await app.type('e');for(let i=0;i<'message'.length;i++)app.press('\x7f');await app.type('note');app.press(ENTER);
    s=await app.waitFor('edited in place',x=>sheetRows(x.text)[1]===' › Then draft the commit note');
    await app.type('n');await app.type('And update the changelog');app.press(ENTER);
    s=await app.waitFor('added at the end',x=>sheetRows(x.text)[3]==='   And update the changelog');
    await app.type('d');await app.type('d');
    s=await app.waitFor('deleted',x=>sheetRows(x.text)[1]===' › Also run the auth unit tests');
    assert.equal(sheetRows(s.text)[2],'   And update the changelog');
    await emptyQueue(app);
  }finally{app.unmount();}
});

test('stage 7.14: Enter during a turn steers it with the message and takes it off the queue',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    await busyWithTwo(app);
    await app.type('/queue');app.press(ENTER);
    await app.waitFor('the sheet',x=>/── Queued messages/u.test(x.text));
    app.press(ENTER);
    await app.waitFor('steered',x=>/Sent into the current turn/u.test(flat(x.lines)));
    assert.ok(app.calls.includes('steer Also run the auth unit tests'),JSON.stringify(app.calls));
    await app.waitFor('one left',x=>/queue 1\b/u.test(x.text));
    await emptyQueue(app);
  }finally{app.unmount();}
});

test('stage 7.14: a queue restored paused waits for /queue; Enter at rest sends that message now',async()=>{
  const first=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{await busyWithTwo(first);}finally{first.unmount();}
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    const s=await app.waitFor('the notice',x=>/Restored 2 queued items in PAUSED state/u.test(flat(x.lines)));
    assert.doesNotMatch(s.text,/── Queued messages/u,'the sheet opens when asked');
    await app.type('/queue');app.press(ENTER);
    await app.waitFor('the sheet',x=>/── Queued messages/u.test(x.text));
    const before=app.calls.length;
    app.press(ENTER);
    await app.waitFor('sent now',x=>/Sent now/u.test(flat(x.lines)));
    for(let i=0;i<40&&app.calls.length===before;i++)await sleep(25);
    assert.deepEqual(app.calls.slice(before),['resume Also run the auth unit tests']);
    await app.waitFor('one left',x=>/queue 1\b/u.test(x.text));
    await emptyQueue(app);
  }finally{app.unmount();}
});

test('stage 7.14: during a turn a queued command never steers; it says it runs when the turn ends',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    await busyWithTwo(app);
    await app.type('/clear');app.press(ENTER);await app.waitFor('three queued',x=>/queue 3\b/u.test(x.text));
    await app.type('/queue');app.press(ENTER);await app.waitFor('the sheet',x=>/── Queued messages/u.test(x.text));
    app.press(DOWN);app.press(DOWN);app.press(ENTER);
    await app.waitFor('the refusal',x=>/A queued command runs when the turn ends; it cannot steer it/u.test(flat(x.lines)));
    assert.ok(!app.calls.some(call=>call.startsWith('steer')),JSON.stringify(app.calls));
    await emptyQueue(app);
  }finally{app.unmount();}
});

test('stage 7.14: at rest the sheet is empty and says why; n sends the message now',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    await app.type('/queue');app.press(ENTER);
    await app.waitFor('the empty sheet',x=>/Nothing queued\. While TALOS works, what you type waits here\./u.test(x.text));
    await app.type('n');await app.type('hello now');app.press(ENTER);
    await app.waitFor('sent now',x=>/Sent now/u.test(flat(x.lines)));
    for(let i=0;i<40&&!app.calls.some(call=>call.includes('hello now'));i++)await sleep(25);
    assert.ok(app.calls.some(call=>call.includes('hello now')),JSON.stringify(app.calls));
  }finally{app.unmount();}
});
