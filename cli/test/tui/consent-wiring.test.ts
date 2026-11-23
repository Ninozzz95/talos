/*
 * 0.6.15, review block 5 of the Desktop (26/10/2026, REVISIONE-BLOCCO-5 pezzo D):
 * - D-1: the agents panel (Ctrl+A with the composer empty) holds ↑↓ and Enter, and the card opened over it — ↓ + Enter meant for the
 *   panel granted the folder. Owner 26/10/2026 «Aspetta che smetti»: the card waits while the panel is in use and opens once idle.
 *   REV-B5-D1 is the reviewer's test, ported.
 * - D-2: four links of `consentCardWaits` in app.ts had no proof (mutants MW2 native scrollback, MW3 «too large», MW4 exit, MW9
 *   panels survived): the predicate was proven alone, not what reaches it. Each test below gives the owner's keys after the grace and
 *   proves they never answer the card.
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {ESC,fakeRemote,mountApp,sleep} from './consent-order-fixture.ts';
import {hermeticProfile} from './r1-layout-fixture.ts';
import {CONSENT_PANEL_IDLE_MS} from '../../src/tui/consent-card.ts';

const env=hermeticProfile();after(()=>env.restore());
const CARD=/A device asks for a folder/u;
const request=(id:string,now:number)=>({richiestaId:id,device:'Pad di Nino',folder:'C:\\work\\shop-api',expiresAt:now+120_000});
const DOWN=`${ESC}[B`;
const CTRL_A='\u0001';
const docked=(text:string)=>/▾ Agents\s/u.test(text);
async function withAgents(app:Awaited<ReturnType<typeof mountApp>>,now:number,status='running'){
  const at=new Date(now).toISOString();
  for(const [id,task] of [['k1','Audit the dependencies'],['k2','Write e2e tests for checkout']] as const)
    app.emit('agent.changed',{childId:id,parentId:'s1',reason:'created',kind:'lifecycle',status,task,startedAt:at});
  await sleep(200);
}

test('REV-B5-D1: the agents panel holds ↑↓ and Enter — the card does not open over it while it is used, and its keys never answer it',async()=>{
  let now=5_000_000;const remote=fakeRemote();
  const app=await mountApp({cols:120,rows:36,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    await sleep(300);await withAgents(app,now);
    app.press(CTRL_A);
    await app.waitFor('the agents card, with the focus',s=>/› ▾ Agents\s/u.test(s.text)&&/Audit the depen/u.test(s.text));
    remote.set([request('c1',now)]);
    await sleep(300);
    assert.equal(CARD.test((await app.screen()).text),false,'the card opened over the panel in use');
    now+=1_000;
    app.press(DOWN);await sleep(100);app.press('\r');await sleep(200);
    assert.deepEqual(remote.answers,[],'the agents panel\'s keys answered the card');
  }finally{app.unmount();}
});

test('D-1, owner «Aspetta che smetti»: a panel left open does not hide the request — the card opens once the panel is idle',async()=>{
  let now=5_100_000;const remote=fakeRemote();
  const app=await mountApp({cols:120,rows:36,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    /* finished agents. Mutant MD4 (the card's own idle tick removed) survives: measured 26/10/2026, the screen redraws about once a
       second even when idle (4 renders in 4 s with this panel open), so the tick is a backstop, not the only way the card comes */
    await sleep(300);await withAgents(app,now,'completed');
    app.press(CTRL_A);
    await app.waitFor('the agents panel',s=>docked(s.text));
    /* the arrow, not only Ctrl+A, renews the use: by Ctrl+A alone the panel would be idle by now (mutant MD3) */
    now+=CONSENT_PANEL_IDLE_MS-100;app.press(DOWN);await sleep(100);
    now+=200;remote.set([request('c1',now)]);await sleep(300);
    assert.equal(CARD.test((await app.screen()).text),false,'the panel is in use: its arrow was 200 ms ago');
    now+=CONSENT_PANEL_IDLE_MS;
    const shown=await app.waitFor('the card once the panel is idle',s=>CARD.test(s.text),CONSENT_PANEL_IDLE_MS+3_000);
    assert.equal(docked(shown.text),true,'the panel stays where it was');
    app.press('\r');await sleep(150);
    assert.deepEqual(remote.answers,[],'an Enter in the card\'s grace answers nothing');
  }finally{app.unmount();}
});

test('D-2 (MW2): the native scrollback (/transcript then [) holds the terminal — the card waits, and keys there never answer it',async()=>{
  let now=5_200_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    app.press('/transcript');await sleep(200);app.press('\r');
    await app.waitFor('the transcript mode',s=>/Transcript · /u.test(s.text));
    app.press('[');await sleep(300);
    remote.set([request('c1',now)]);await sleep(300);
    now+=1_000;app.press(DOWN);await sleep(100);app.press('\r');await sleep(200);
    assert.deepEqual(remote.answers,[],'a key in the native scrollback answered the card');
    /* The native scrollback is reached only from the transcript mode (`[`, enterScrollback's one caller), and leaving it goes back
       there: the transcript mode's own link already holds the card, so mutant MW2 (the scrollback's link cut) is equivalent today —
       the field stays as defence in depth. What this proves end to end: after both close, the card opens with a grace of its own,
       and the first keys never answer a card opened unseen behind them. */
    app.press('q');
    await app.waitFor('back in the transcript mode',s=>/Transcript · /u.test(s.text));
    app.press('q');await sleep(150);app.press(DOWN);await sleep(80);app.press('\r');await sleep(200);
    assert.deepEqual(remote.answers,[],'the first keys after the scrollback and the transcript mode answered the card');
    await app.waitFor('the card after the scrollback',s=>CARD.test(s.text));
  }finally{app.unmount();}
});

test('D-2 (MW3): the «too large for this model» dialog holds ↑↓ and Enter — the card waits, and its keys never answer it',async()=>{
  let now=5_300_000;const remote=fakeRemote();
  const app=await mountApp({cols:120,rows:40,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    app.press('please read this huge log');await sleep(150);app.press('\r');
    await app.waitFor('sent',()=>app.prompts.length===1);
    app.emit('run.started',{runId:'r1',input:{prompt:'please read this huge log'}});await sleep(60);
    app.emit('run.failed',{runId:'r1',error:{code:'REQUEST_TOO_LARGE',message:'The request is too large for this model.',envelope:{code:'REQUEST_TOO_LARGE'},requestTooLarge:{request:15600,frame:9000,window:16000,source:'estimate'}}});
    await app.waitFor('the dialog',s=>/The message is too large for this model/u.test(s.text)&&/Enter confirms/u.test(s.text));
    remote.set([request('c1',now)]);await sleep(300);
    assert.equal(CARD.test((await app.screen()).text),false,'the card opened over the dialog');
    now+=1_000;app.press(DOWN);await sleep(100);app.press(ESC);await sleep(200);
    assert.deepEqual(remote.answers,[],'the dialog\'s keys answered the card');
  }finally{app.unmount();}
});

test('D-2 (MW4): the exit confirmation (/exit with agents at work) holds the keys — the card waits, and its keys never answer it',async()=>{
  let now=5_400_000;const remote=fakeRemote();
  const app=await mountApp({cols:120,rows:36,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    await sleep(300);await withAgents(app,now);
    app.press('/exit');await sleep(200);app.press('\r');
    await app.waitFor('the exit confirmation',s=>/agents? (are|is) (still )?working|Stop them and exit|Exit anyway|Keep working/iu.test(s.text));
    remote.set([request('c1',now)]);await sleep(300);
    assert.equal(CARD.test((await app.screen()).text),false,'the card opened over the exit confirmation');
    now+=1_000;app.press(DOWN);await sleep(100);app.press(ESC);await sleep(200);
    assert.deepEqual(remote.answers,[],'the confirmation\'s keys answered the card');
  }finally{app.unmount();}
});

test('D-2 (MW9): a panel (/theme) holds ↑↓ and Enter — the card waits, and its keys never answer it',async()=>{
  let now=5_500_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    const before=(await app.screen()).text;
    app.press('/theme');await sleep(200);app.press('\r');
    await app.waitFor('the theme picker',s=>s.text!==before&&/Forge/u.test(s.text)&&/theme/iu.test(s.text));
    remote.set([request('c1',now)]);await sleep(300);
    assert.equal(CARD.test((await app.screen()).text),false,'the card opened over the panel');
    now+=1_000;app.press(DOWN);await sleep(100);app.press(ESC);await sleep(200);
    assert.deepEqual(remote.answers,[],'the panel\'s keys answered the card');
    /* the picker takes its keys before the card does: the danger is the card opened under it, whose grace is gone when the picker
       closes — the next keys would answer it (mutant MW9) */
    app.press(DOWN);await sleep(80);app.press('\r');await sleep(200);
    assert.deepEqual(remote.answers,[],'the first keys after the panel answered a card opened under it');
  }finally{app.unmount();}
});
