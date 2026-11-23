/**
 * R1 lane L — behaviour of the real app in a fake TTY (r1-layout-fixture.ts): the minimum size (Q-R1-8), the transcript
 * keys (E15, Q-R1-7), the anchored view while content grows (E9), the announcement row (Q-R1-9), the idle screen that
 * writes nothing (E5), and the two lane contracts: the exit hint of lane X and `onExit` called exactly once.
 */
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {TOO_SMALL_TEXT} from '../../src/tui/regions/budget.ts';
import {displayWidth} from '../../src/tui/text-width.ts';
import {EXIT_CONFIRM_WINDOW_MS,EXIT_HINT} from '../../src/tui/interrupt.ts';
import {hermeticProfile,KEY,mountApp,sleep,type Screen} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const PROMPT='PROMPT what changed in the build';
const ANSWER=['# Changes','',...Array.from({length:40},(_,i)=>`- change ${i+1} in the build`)].join('\n');
const HISTORY=[
  {type:'run.started',data:{runId:'r0'}},
  {type:'message.started',data:{messageId:'u0',role:'user'}},{type:'message.delta',data:{messageId:'u0',delta:PROMPT}},{type:'message.completed',data:{messageId:'u0'}},
  {type:'message.started',data:{messageId:'a0',role:'assistant'}},{type:'message.delta',data:{messageId:'a0',delta:ANSWER}},{type:'message.completed',data:{messageId:'a0'}},
  {type:'run.completed',data:{runId:'r0'}},
];
const nonEmpty=(s:Screen)=>s.lines.filter(line=>line.trim()!=='');
const dump=(s:Screen)=>s.lines.map((line,index)=>`${String(index).padStart(2)}|${line}`).join('\n');

test('Q-R1-8: below 40×12 the screen is the one line "Terminal too small — need 40×12", and the frame comes back above it',async()=>{
  const app=await mountApp({cols:60,rows:20,root:env.root,paths:env.paths});
  try{
    for(const [cols,rows] of [[39,12],[40,11],[20,5]] as const){
      await app.resize(cols,rows);const small=await app.settle();
      const shown=nonEmpty(small).map(line=>line.trim());
      /* One line whenever the notice fits; narrower than the notice it wraps at a word, never cut. */
      assert.equal(shown.join(' '),TOO_SMALL_TEXT,`${cols}×${rows}: the notice and nothing else\n${dump(small)}`);
      assert.equal(shown.length,displayWidth(TOO_SMALL_TEXT)<=cols?1:2,`${cols}×${rows}: one row when it fits\n${dump(small)}`);
      assert.ok(small.lines[0]!.startsWith('Terminal too small'),`${cols}×${rows}: the notice is the first line\n${dump(small)}`);
    }
    await app.resize(40,12);const back=await app.settle();
    assert.ok(back.lines.some(line=>/^│ ›/u.test(line))&&!back.text.includes('Terminal too small'),`at 40×12 the frame is back\n${dump(back)}`);
  }finally{app.unmount();}
});

test('Q-R1-9/E9: after a long answer the latest prompt is announced; PageUp scrolls, Ctrl+Home reaches the prompt, Ctrl+End returns',async()=>{
  const app=await mountApp({cols:80,rows:20,root:env.root,paths:env.paths,history:HISTORY});
  try{
    const tail=await app.waitFor('the answer',s=>/change 40 in the build/u.test(s.text));
    assert.match(tail.text,/↑ 1 earlier message above · You: PROMPT what changed in the build/u,dump(tail));
    app.press(KEY.pageUp);const up=await app.waitFor('paged up',s=>!/change 40 in the build/u.test(s.text));
    assert.match(up.text,/change \d+ in the build/u,dump(up));
    /* owner 09/10/2026: the pill is the transcript's LAST row, just above the composer, centred */
    const pill=up.lines.findIndex(line=>line.includes('↓ Jump to bottom')),composerTop=up.lines.findIndex(line=>/^╭─/u.test(line));
    /* the transcript's last row: only the turn's own row («✓ Done», the activity row) may stand between it and the composer */
    assert.ok(pill===composerTop-1||(pill===composerTop-2&&/^ [✓■✗] /u.test(up.lines[composerTop-1]!)),`the pill is the transcript's last row\n${dump(up)}`);
    const left=up.lines[pill]!.indexOf('↓')-1,right=80-(left+' ↓ Jump to bottom '.length);
    assert.ok(Math.abs(left-right)<=1,`the pill is centred (${left} | ${right})\n${dump(up)}`);
    app.press(KEY.ctrlHome);const top=await app.waitFor('the top',s=>s.text.includes(PROMPT)&&!/earlier message/u.test(s.text));
    assert.ok(top.lines.some(line=>line.startsWith(' › ')),`the prompt row is on screen\n${dump(top)}`);
    app.press(KEY.ctrlEnd);const back=await app.waitFor('the tail',s=>/change 40 in the build/u.test(s.text));
    assert.match(back.text,/You: PROMPT/u);
  }finally{app.unmount();}
});

test('E9: while the person reads above the tail, streamed rows do not move the view',async()=>{
  const app=await mountApp({cols:80,rows:20,root:env.root,paths:env.paths,history:HISTORY});
  try{
    await app.waitFor('the answer',s=>/change 40 in the build/u.test(s.text));
    app.press(KEY.pageUp);await app.waitFor('paged up',s=>!/change 40 in the build/u.test(s.text));
    /* Tappa 8 C1 (mockup :701): the jump pill rides on the transcript window and its label grows with the unseen counter
       while the person reads above the tail — the pill line may change, the CONTENT rows may not. The compared window
       skips the pill line; the announcement and the item rows stay asserted. */
    const content=(frame:{lines:readonly string[]})=>frame.lines.slice(1,8).filter(line=>!line.includes('Jump to bottom')).join('\n');
    const before=await app.settle();const reading=content(before);
    app.emit('run.started',{runId:'r1'});app.emit('message.started',{messageId:'a1',role:'assistant'});
    for(let i=1;i<=12;i++){app.emit('message.delta',{messageId:'a1',delta:`streamed row ${i}\n\n`});await sleep(20);}
    await sleep(500);const during=await app.settle();
    assert.equal(content(during),reading,`the rows being read stayed put\nBEFORE\n${dump(before)}\nAFTER\n${dump(during)}`);
    assert.doesNotMatch(during.text,/streamed row 12/u,'the new rows arrived below the view');
  }finally{app.unmount();}
});

test('E5: an idle screen writes nothing — no frame, no byte — once it has settled',async()=>{
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,history:HISTORY});
  try{
    await app.waitFor('the answer',s=>/change 40 in the build/u.test(s.text));await app.settle();await sleep(300);
    const start=app.bytes();await sleep(1500);
    assert.equal(app.bytes()-start,0,'bytes written in 1.5 s of idle');
  }finally{app.unmount();}
});

test('lane X contract: the first Ctrl+C at idle shows the exit hint for the confirmation window only, then it is gone',async()=>{
  const app=await mountApp({cols:80,rows:20,root:env.root,paths:env.paths});
  try{
    app.press('\u0003');
    const armed=await app.waitFor('the exit hint',s=>s.text.includes(EXIT_HINT));
    assert.ok(armed.lines.some(line=>line.trim()===EXIT_HINT),`the hint is its own status row\n${dump(armed)}`);
    assert.equal(app.exits().length,0,'one press does not exit');
    await sleep(EXIT_CONFIRM_WINDOW_MS+300);
    const cleared=await app.settle();
    assert.ok(!cleared.text.includes(EXIT_HINT),`the hint is cleared after the window\n${dump(cleared)}`);
    const quiet=app.bytes();await sleep(1200);
    assert.equal(app.bytes()-quiet,0,'after the one clear the idle screen writes nothing again');
  }finally{app.unmount();}
});

test('lane X contract: onExit receives the session id and the transcript exactly once when the app exits',async()=>{
  const app=await mountApp({cols:80,rows:20,root:env.root,paths:env.paths,history:HISTORY});
  await app.waitFor('the answer',s=>/change 40 in the build/u.test(s.text));
  app.press('\u0003');await app.waitFor('the exit hint',s=>s.text.includes(EXIT_HINT));
  app.press('\u0003');
  const until=Date.now()+5000;while(app.exits().length===0&&Date.now()<until)await sleep(25);
  app.unmount();await sleep(50);
  assert.equal(app.exits().length,1,'called exactly once');
  const snapshot=app.exits()[0] as {sessionId:string|null;items:ReadonlyArray<{kind:string;role?:string;text?:string}>};
  assert.equal(snapshot.sessionId,'s1');
  assert.ok(snapshot.items.some(item=>item.kind==='message'&&item.role==='user'&&item.text===PROMPT),'the person\'s message is in the snapshot');
  assert.ok(snapshot.items.some(item=>item.kind==='message'&&item.role==='assistant'),'the answer is in the snapshot');
});
