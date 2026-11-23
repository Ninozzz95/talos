/*
 * 0.6.15, review block 3 (Desktop, 26/10/2026): the folder consent card against approvals and the other dialogs, on the real
 * TuiApp. Ported from the reviewer's tests (R-A, R-A2, R-B, R-C, the ORDER cases, R-E, SCADUTA) and extended for N4, N5, N7.
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {ESC,composerLine,fakeRemote,mountApp,sleep} from './consent-order-fixture.ts';

import {hermeticProfile} from './r1-layout-fixture.ts';
const env=hermeticProfile();after(()=>env.restore());
const CARD=/A device asks for a folder/u;
const APPROVAL=/Shell · npm test/u;
const request=(id:string,now:number)=>({richiestaId:id,device:'Pad di Nino',folder:'C:\\work\\shop-api',expiresAt:now+120_000});
const approval=(id:string,cmd='npm test')=>({requestId:id,action:{tool:'shell',command:cmd,toolCallId:`t-${id}`}});
const waitAnswers=async(list:unknown[],n:number)=>{for(let i=0;i<40&&list.length<n;i++)await sleep(25);};

test('CONTROLLO: approvazione senza carta — dopo la risposta il compositore scrive',async()=>{
  let now=100_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',approval('q1'));
    await app.waitFor('approval',s=>APPROVAL.test(s.text));
    now+=1_000;app.press('1');
    await app.waitFor('approval closed',s=>!APPROVAL.test(s.text));
    app.press('hello');
    await app.waitFor('composer types',s=>/│ › hello/u.test(composerLine(s)));
  }finally{app.unmount();}
});

test('R-A: il consenso scade (o risponde il telefono) mentre un\'approvazione lo copre — dopo l\'approvazione il compositore deve riprendere i tasti',async()=>{
  let now=200_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([request('c1',now)]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',approval('q1'));
    await app.waitFor('approval over the card',s=>APPROVAL.test(s.text)&&!CARD.test(s.text));
    remote.set([]);await sleep(80);
    now+=1_000;app.press('1');
    await app.waitFor('approval closed',s=>!APPROVAL.test(s.text));
    assert.deepEqual(app.answers,[{requestId:'q1',approved:true}]);
    await sleep(120);
    assert.equal(CARD.test((await app.screen()).text),false,'the expired card does not come back');
    app.press('hello');
    await app.waitFor('composer types after the approval',s=>/│ › hello/u.test(composerLine(s)),3_000);
  }finally{app.unmount();}
});

test('R-A2: stessa cosa, approvazione chiusa con Esc',async()=>{
  let now=300_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([request('c1',now)]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',approval('q1'));
    await app.waitFor('approval over the card',s=>APPROVAL.test(s.text));
    remote.set([]);await sleep(80);
    now+=1_000;app.press(ESC);
    await app.waitFor('approval closed',s=>!APPROVAL.test(s.text));
    await sleep(150);
    app.press('hello');
    await app.waitFor('composer types after Esc',s=>/│ › hello/u.test(composerLine(s)),3_000);
  }finally{app.unmount();}
});

test('ORDINE: approvazione durante la grazia della carta, risposta con Esc; la carta torna con grazia NUOVA',async()=>{
  let now=400_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([request('c1',now)]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    now+=100; // dentro la grazia della carta
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',approval('q1'));
    await app.waitFor('approval',s=>APPROVAL.test(s.text));
    now+=1_000;app.press(ESC);
    await app.waitFor('card back',s=>CARD.test(s.text)&&!APPROVAL.test(s.text));
    app.press('\r');await sleep(120);
    assert.deepEqual(remote.answers,[],'an Enter in the new grace never answers the consent');
    now+=1_000;app.press('\r');
    await waitAnswers(remote.answers,1);
    assert.deepEqual(remote.answers,[['c1',false]]);
  }finally{app.unmount();}
});

test('ORDINE: due approvazioni di fila sopra la carta; la carta torna solo alla fine',async()=>{
  let now=500_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([request('c1',now)]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    now+=1_000;
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',approval('q1'));
    await app.waitFor('approval 1',s=>APPROVAL.test(s.text));
    now+=1_000;app.press('1');
    await app.waitFor('approval 1 closed',s=>!APPROVAL.test(s.text));
    app.emit('approval.required',approval('q2','rm -rf build'));
    await app.waitFor('approval 2',s=>s.text.includes('Shell · rm -rf build'));
    now+=1_000;app.press('2');
    await app.waitFor('approval 2 closed',s=>!s.text.includes('Shell · rm -rf build'));
    await app.waitFor('card back',s=>CARD.test(s.text));
    assert.deepEqual(remote.answers,[],'no approval key answered the consent');
    assert.deepEqual(app.answers.map(a=>a.requestId),['q1','q2']);
  }finally{app.unmount();}
});

test('ORDINE: un secondo consenso mentre il primo è nascosto; il primo scade; dopo l\'approvazione si vede il secondo',async()=>{
  let now=600_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([request('c1',now)]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',approval('q1'));
    await app.waitFor('approval',s=>APPROVAL.test(s.text));
    remote.set([request('c1',now),{...request('c2',now),folder:'C:\\work\\second'}]);await sleep(50);
    remote.set([{...request('c2',now),folder:'C:\\work\\second'}]);await sleep(50);
    now+=1_000;app.press('1');
    await app.waitFor('card c2',s=>CARD.test(s.text)&&s.text.includes('C:\\work\\second'));
    app.press('\r');await sleep(100);
    assert.deepEqual(remote.answers,[]);
    now+=1_000;app.press('\r');await waitAnswers(remote.answers,1);
    assert.deepEqual(remote.answers,[['c2',false]]);
  }finally{app.unmount();}
});

test('ORDINE: il giro finisce mentre la carta è nascosta dietro l\'approvazione; la carta torna',async()=>{
  let now=700_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([request('c1',now)]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',approval('q1'));
    await app.waitFor('approval',s=>APPROVAL.test(s.text));
    app.emit('approval.resolved',{requestId:'q1',approved:false});
    app.emit('run.cancelled',{runId:'r1'});
    await app.waitFor('card back after the run ended',s=>CARD.test(s.text)&&!APPROVAL.test(s.text),4_000);
  }finally{app.unmount();}
});

test('R-B: la carta arriva mentre è aperta la conferma «Enable Full access?» — un tasto dato alla carta non deve accendere Full access',async()=>{
  let now=800_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    const SHIFT_TAB=`${ESC}[Z`;
    for(let i=0;i<4;i++){
      app.press(SHIFT_TAB);await sleep(150);
      if((await app.screen()).text.includes('Enable Full access?'))break;
    }
    await app.waitFor('full access prompt',s=>s.text.includes('Enable Full access?'));
    remote.set([request('c1',now)]);
    /* the cure (CLI, 26/10/2026): the card waits while the confirmation holds the keys — never both on screen */
    await sleep(300);
    const during=await app.screen();
    assert.equal(CARD.test(during.text),false,`the card opened while «Enable Full access?» holds the keys\n${during.text}`);
    assert.ok(during.text.includes('Enable Full access?'));
    /* the person cancels the confirmation: the card comes, with a new grace, and its keys are its own */
    now+=1_000;app.press(ESC);
    await app.waitFor('the card after the confirmation',s=>CARD.test(s.text)&&!s.text.includes('Enable Full access?'));
    app.press('\r');await sleep(120);
    assert.deepEqual(remote.answers,[],'an Enter in the card\'s new grace answers nothing');
    now+=1_000;app.press(`${ESC}[C`);await sleep(80);app.press('\r');
    await waitAnswers(remote.answers,1);
    assert.deepEqual(remote.answers,[['c1',true]]);
    const after=await app.screen();
    assert.equal(/ full access · shift\+tab/u.test(after.text),false,`Full access turned on\n${after.text}`);
  }finally{app.unmount();}
});

test('SCADUTA: la carta di un consenso già scaduto (0:00) — la risposta fallisce col codice del motore; che cosa vede la persona',async()=>{
  let now=900_000;const remote=fakeRemote();
  remote.failWith(()=>Object.assign(new Error('This request is no longer waiting.'),{code:'CONSENT_NOT_PENDING'}));
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([{...request('c1',now),expiresAt:now-1}]);
    const shown=await app.waitFor('the card',s=>CARD.test(s.text));
    assert.match(shown.text,/answer within 0:00/u);
    now+=1_000;app.press(`${ESC}[C`);await sleep(60);app.press('\r');
    await waitAnswers(remote.answers,1);await sleep(200);
    const after=await app.screen();
    console.log('SCADUTA-SCREEN\n'+after.text);
    assert.deepEqual(remote.answers,[['c1',true]]);
    assert.doesNotMatch(after.text,/CONSENT_NOT_PENDING/u,'the raw kernel code reaches the screen');
    assert.doesNotMatch(after.text,/Try again/u,'«Try again» is false for a request that no longer exists');
    assert.match(after.text,/no longer waiting/u);
  }finally{app.unmount();}
});

test('R-C: la carta arriva con un foglio aperto (/status) — si apre sopra il foglio? e dopo la risposta il foglio torna?',async()=>{
  let now=1_000_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    app.press('/status');await sleep(200);app.press('\r');
    await app.waitFor('the settings sheet',s=>/── Settings/u.test(s.text));
    remote.set([request('c1',now)]);
    await sleep(300);
    const during=await app.screen();
    console.log('R-C-DURING\n'+during.text);
    assert.equal(CARD.test(during.text),false,'the card opened over the settings sheet (the commit says: never over another card or panel)');
  }finally{app.unmount();}
});

/* R-D, decided 27/10/2026 on clear research (Mozilla bug 1335985, CVE-2024-2609, Chromium's input protector for keys, Apple HIG): the
   choice made before an interruption is not kept — the card comes back on «Not now» */
test('R-D: la persona sposta su «Allow», arriva un\'approvazione; quando la carta torna, la scelta di serie è di nuovo «Not now»',async()=>{
  let now=1_100_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([request('c1',now)]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    now+=1_000;app.press(`${ESC}[C`);await sleep(100);
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',approval('q1'));
    await app.waitFor('approval',s=>APPROVAL.test(s.text));
    now+=1_000;app.press('4');
    await app.waitFor('card back',s=>CARD.test(s.text)&&!APPROVAL.test(s.text));
    now+=1_000;app.press('\r');
    await waitAnswers(remote.answers,1);
    assert.deepEqual(remote.answers,[['c1',false]],'after an interruption the card comes back on «Allow»: one Enter gives the folder away');
  }finally{app.unmount();}
});

test('R-E: un tasto nella grazia di un\'approvazione arrivata sopra la carta (già oltre la sua grazia) non risponde alla carta nascosta',async()=>{
  let now=1_200_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([request('c1',now)]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    now+=1_000;
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',approval('q1'));
    await app.waitFor('approval',s=>APPROVAL.test(s.text));
    now+=50;app.press('\r');await sleep(150);
    assert.deepEqual(remote.answers,[],'a key in the approval grace answered the hidden consent card');
    assert.deepEqual(app.answers,[],'nor the approval');
  }finally{app.unmount();}
});

/* The three mutants of review block 3 that no test held (N4, N5, N7): the code was right, nothing kept it right. */
test('N4: a double Enter after the grace sends ONE answer',async()=>{
  let now=1_300_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([request('c1',now)]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    now+=1_000;app.press('\r');app.press('\r');
    await waitAnswers(remote.answers,1);await sleep(200);
    assert.deepEqual(remote.answers,[['c1',false]]);
  }finally{app.unmount();}
});

test('N5: a snapshot that changes for another reason (same request) does not start the grace again',async()=>{
  let now=1_400_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([request('c1',now)]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    now+=1_000;
    remote.set([request('c1',now-1_000)]);await sleep(80); /* a new array, the same request: a device went online */
    app.press('\r');
    await waitAnswers(remote.answers,1);
    assert.deepEqual(remote.answers,[['c1',false]],'the Enter after the grace answered');
  }finally{app.unmount();}
});

test('N7: the keys typed in the card\'s grace go to the composer, never to the card',async()=>{
  let now=1_500_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([request('c1',now)]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    app.press('abc');await sleep(120);
    assert.deepEqual(remote.answers,[]);
    now+=1_000;app.press(ESC);
    await waitAnswers(remote.answers,1);
    remote.set([]);
    await app.waitFor('the composer holds the keys typed in the grace',s=>!CARD.test(s.text)&&/│ › abc/u.test(composerLine(s)),3_000);
  }finally{app.unmount();}
});

/* Review 4 of the Desktop (26/10/2026, C-1, C-2, C-3): the slash-command menu, the transcript mode, an owner that arrives AFTER the
   card, and the composer after each way the card answers (ported REV-B4-C1..C3). */
const DOWN=`${ESC}[B`;
test('REV-B4-C1: the slash-command menu holds ↑↓ and Enter — the card waits, and the menu\'s keys never answer it',async()=>{
  let now=2_000_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    app.press('/');await sleep(250);
    assert.match((await app.screen()).text,/\/status|\/help|\/model/u,'the command menu is open');
    remote.set([request('c1',now)]);
    await sleep(300);
    assert.equal(CARD.test((await app.screen()).text),false,'the card opened over the command menu');
    now+=1_000;app.press(DOWN);await sleep(80);app.press(ESC);await sleep(120);
    assert.deepEqual(remote.answers,[],'the menu\'s keys answered the card');
    await app.waitFor('the card after the menu closed',s=>CARD.test(s.text));
    app.press('\r');await sleep(120);
    assert.deepEqual(remote.answers,[],'an Enter in the card\'s new grace answers nothing');
  }finally{app.unmount();}
});

test('MC7: an owner that arrives AFTER the card (Shift+Tab in its grace reaches «Enable Full access?») — the card steps aside, then comes back',async()=>{
  let now=2_100_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    remote.set([request('c1',now)]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    /* in the card's grace the key belongs to the composer: Shift+Tab walks the modes up to the Full access confirmation */
    for(let i=0;i<4;i++){app.press(`${ESC}[Z`);await sleep(150);if((await app.screen()).text.includes('Enable Full access?'))break;}
    const during=await app.waitFor('the confirmation',s=>s.text.includes('Enable Full access?'));
    assert.equal(CARD.test(during.text),false,`the card stayed under the confirmation\n${during.text}`);
    now+=1_000;app.press(ESC);await sleep(120);
    assert.deepEqual(remote.answers,[]);
    await app.waitFor('the card back',s=>CARD.test(s.text));
  }finally{app.unmount();}
});

test('MC8: the card never opens over the transcript mode (/transcript), and comes when it closes',async()=>{
  let now=2_200_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    app.press('/transcript');await sleep(200);app.press('\r');
    await app.waitFor('the transcript mode',s=>/Transcript · /u.test(s.text));
    remote.set([request('c1',now)]);await sleep(300);
    assert.equal(CARD.test((await app.screen()).text),false,'the card opened over the transcript mode');
    now+=1_000;app.press('q');
    await app.waitFor('the card after the transcript mode',s=>CARD.test(s.text));
    assert.deepEqual(remote.answers,[]);
  }finally{app.unmount();}
});

test('REV-B4-C2: after the card answers (Allow, Not now, Esc) the composer takes the keys again',async()=>{
  for(const [name,keys] of [['allow',[`${ESC}[C`,'\r']],['not-now',['\r']],['esc',[ESC]]] as const){
    let now=3_000_000;const remote=fakeRemote();
    const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
    try{
      remote.set([request('c1',now)]);
      await app.waitFor('the card',s=>CARD.test(s.text));
      now+=1_000;
      for(const k of keys){app.press(k);await sleep(80);}
      await waitAnswers(remote.answers,1);
      remote.set([]);
      await app.waitFor(`${name}: card gone`,s=>!CARD.test(s.text));
      await sleep(100);app.press('hello');
      await app.waitFor(`${name}: composer types`,s=>/│ › hello/u.test(composerLine(s)),3_000);
    }finally{app.unmount();}
  }
});

test('REV-B4-C3: the card stepped aside for «Enable Full access?» and the consent EXPIRED meanwhile — after Esc the composer types',async()=>{
  let now=4_000_000;const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    const SHIFT_TAB=`${ESC}[Z`;
    for(let i=0;i<4;i++){app.press(SHIFT_TAB);await sleep(150);if((await app.screen()).text.includes('Enable Full access?'))break;}
    await app.waitFor('full access prompt',s=>s.text.includes('Enable Full access?'));
    remote.set([request('c1',now)]);await sleep(200);
    remote.set([]);await sleep(150);
    now+=1_000;app.press(ESC);
    await app.waitFor('prompt closed',s=>!s.text.includes('Enable Full access?'));
    await sleep(120);app.press('hello');
    await app.waitFor('composer types',s=>/│ › hello/u.test(composerLine(s)),3_000);
    assert.equal(CARD.test((await app.screen()).text),false);
  }finally{app.unmount();}
});
