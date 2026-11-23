/*
 * Stage 7.13 (mockup clear; Claude Code /clear keeps the old conversation in /resume, Gemini CLI's Ctrl+L clears only the
 * screen, Claude Code #45878 asks for a clear that keeps the context): /clear is the mockup's sheet. «Clear the screen» empties
 * the main view and keeps the conversation, which Ctrl+O still shows whole; «Start a new conversation» makes the next message
 * start a new session, the old one left in /resume; «Cancel» leaves everything as it is.
 * Mount: the REAL TuiApp (r5a-s-fixture.ts), a temp profile, no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',DOWN='\x1b[B',CTRL_O='\x0f';
let n=0;const project=()=>{const root=join(env.root,`clear-${++n}`);mkdirSync(root,{recursive:true});return root;};
const flat=(lines:readonly string[])=>lines.map(line=>line.trim()).join(' ');

async function conversation(app:Awaited<ReturnType<typeof mountR5a>>){
  await app.type('Why is the login test flaky?');app.press(ENTER);await sleep(80);
  app.emit('run.started',{runId:'r1'});app.emit('message.started',{messageId:'a1',role:'assistant'});
  app.emit('message.delta',{messageId:'a1',delta:'It waited 500 ms for the session cookie.'});app.emit('message.completed',{messageId:'a1'});app.emit('run.completed',{runId:'r1'});
  await app.waitFor('the answer',x=>/session cookie/u.test(x.text));
}

test('stage 7.13: /clear is the mockup\'s sheet; «Clear the screen» empties the view, Ctrl+O still finds everything',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    await conversation(app);
    await app.type('/clear');app.press(ENTER);
    const sheet=await app.waitFor('the sheet',x=>/── Clear ─/u.test(x.text));
    assert.match(sheet.text,/› Clear the screen/u);
    assert.match(sheet.text,/this one is saved as "Why is the login test flaky\?" in \/resume/u);
    app.press(ENTER);
    const cleared=await app.waitFor('the cleared screen',x=>/Screen cleared · ctrl\+o finds everything/u.test(x.text));
    assert.doesNotMatch(cleared.text,/session cookie/u,'the answer left the main view');
    assert.doesNotMatch(cleared.text,/Why is the login test flaky/u);
    app.press(CTRL_O);
    await app.waitFor('the transcript has it all',x=>/^ Transcript · /mu.test(x.text)&&/session cookie/u.test(x.text)&&/Why is the login test flaky/u.test(x.text));
    app.press(CTRL_O);await app.waitFor('back',x=>/^╭─/mu.test(x.text));
    /* what comes after the clear is drawn as usual */
    app.emit('run.started',{runId:'r2'});app.emit('message.started',{messageId:'a2',role:'assistant'});
    app.emit('message.delta',{messageId:'a2',delta:'A new answer after the clear.'});app.emit('message.completed',{messageId:'a2'});app.emit('run.completed',{runId:'r2'});
    const later=await app.waitFor('the next answer',x=>/A new answer after the clear/u.test(x.text));
    assert.doesNotMatch(later.text,/session cookie/u);
  }finally{app.unmount();}
});

test('stage 7.13: «Start a new conversation» — the next message starts a new session; Cancel changes nothing',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    await conversation(app);
    await app.type('/clear');app.press(ENTER);await app.waitFor('the sheet',x=>/── Clear ─/u.test(x.text));
    app.press(DOWN);app.press(DOWN);app.press(ENTER);
    await app.waitFor('closed',x=>!/── Clear ─/u.test(x.text));await sleep(150);
    assert.match((await app.screen()).text,/session cookie/u,'Cancel leaves the conversation on screen');
    await app.type('/clear');app.press(ENTER);await app.waitFor('the sheet again',x=>/── Clear ─/u.test(x.text));
    app.press(DOWN);app.press(ENTER);
    const fresh=await app.waitFor('the new conversation',x=>/New conversation · the previous one is in \/resume/u.test(flat(x.lines)));
    assert.doesNotMatch(fresh.text,/session cookie/u);
    const before=app.calls.length;
    await app.type('hello again');app.press(ENTER);
    for(let i=0;i<40&&app.calls.length===before;i++)await sleep(25);
    assert.deepEqual(app.calls.slice(before),['start'],'a new session, not a resume of the old one');
  }finally{app.unmount();}
});

test('stage 7.13: /clear typed while a turn runs waits for it (owner 16/09), then the sheet opens and a new conversation starts',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    await conversation(app);
    app.emit('run.started',{runId:'r2'});
    await app.waitFor('the turn runs',x=>/esc to stop/u.test(x.text));
    await app.type('/clear');app.press(ENTER);
    await app.waitFor('queued',x=>/\/clear runs when this turn ends/u.test(x.text));
    assert.doesNotMatch((await app.screen()).text,/── Clear ─/u,'no sheet while the turn runs');
    app.emit('run.completed',{runId:'r2'});
    await app.waitFor('the sheet after the turn',x=>/── Clear ─/u.test(x.text));
    app.press(DOWN);app.press(ENTER);
    await app.waitFor('the new conversation',x=>/New conversation · the previous one is in \/resume/u.test(flat(x.lines)));
  }finally{app.unmount();}
});
