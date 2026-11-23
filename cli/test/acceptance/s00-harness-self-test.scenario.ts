/**
 * s00 — the harness proves it can fail. Without these, a green acceptance run could be a harness that sees nothing.
 *
 * 1. A wait for text that never appears times out, and the error carries the screen.
 * 2. A predicate is never judged on a torn frame: text inside an open DEC 2026 update only counts after the update ends.
 * 3. The emulator's replies reach the program (a cursor-position request is answered through the pty).
 * 4. The fake provider speaks the OpenAI streaming contract, including the final usage chunk before [DONE].
 * 5. A declared red turns RED when its defect is absent, and stays green only while its own defect is present; the word
 *    list it judges by catches the Italian of the R2 inventory (tool names, argument keys) and not TALOS's English.
 * 6. The border check accepts a healthy TALOS frame and flags the overflowing help frame measured in review D-02.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
import {brokenBorders,italianOn} from './checks.ts';
import {startFakeProvider} from './fake-provider.ts';
import {childEnvironment} from './profile.ts';
import {ESC,TerminalSession,type PtyLike,type Screen} from './terminal.ts';

const nodeScript=(code:string)=>new TerminalSession(process.execPath,['-e',code],{cols:60,rows:10,cwd:tmpdir(),env:childEnvironment()});

test('s00 · a wait for text that never appears times out with a dump of the screen',async()=>{
  const t=nodeScript("process.stdout.write('hello-harness');setTimeout(()=>{},5000)");
  try{
    await t.waitForText('hello-harness',{timeout:15_000});
    await assert.rejects(t.waitForText('never-appears',{timeout:800}),(error:Error)=>/never-appears[^]*timed out after 800 ms[^]*hello-harness/u.test(error.message));
  }finally{await t.close();}
});

/* A scripted pty, so the byte timing is exact: ConPTY itself holds a synchronized update until it ends (measured: a real
   child that paused 600 ms inside BSU … ESU reached the emulator in one piece), so only a fake can split a frame. */
function scriptedPty(){
  let feed:(data:string)=>void=()=>{};let exited:(e:{exitCode:number})=>void=()=>{};const written:string[]=[];
  const pty:PtyLike={onData:cb=>{feed=cb;},onExit:cb=>{exited=cb;},write:data=>{written.push(data);},resize:()=>{},kill:()=>exited({exitCode:0})};
  return{pty,written,send:(data:string)=>feed(data)};
}

test('s00 · text inside an open synchronized update is only judged after the update ends',async()=>{
  const fake=scriptedPty();
  const t=new TerminalSession('fake',[],{cols:40,rows:10,cwd:tmpdir(),env:{},spawn:()=>fake.pty});
  let matched:string|null=null;
  const wait=t.waitForText('TORN-FRAME',{timeout:5_000}).then(x=>{matched=x.text;});
  fake.send(`${ESC}[?2026hTORN-FRAME`);
  await t.settled();await new Promise(r=>setTimeout(r,100));
  assert.equal(matched,null,'the predicate was judged inside an open synchronized update');
  fake.send(` done${ESC}[?2026l`);
  await wait;
  assert.match(matched??'',/TORN-FRAME done/u);
  assert.equal(t.frames.length,1);
  await t.close();
});

test('s00 · the emulator answers a cursor-position request through the pty',async()=>{
  const fake=scriptedPty();const written=fake.written;
  const t=new TerminalSession('fake',[],{cols:40,rows:10,cwd:tmpdir(),env:{},spawn:()=>fake.pty});
  fake.send(`${ESC}[6n`);
  await t.settled();
  assert.ok(written.some(data=>/\u001B\[\d+;\d+R/u.test(data)),`no cursor report was forwarded: ${JSON.stringify(written)}`);
  await t.close();
});

test('s00 · the fake provider streams SSE with the usage chunk before [DONE]',async()=>{
  const fake=await startFakeProvider();
  try{
    const res=await fetch(`${fake.url}/v1/chat/completions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'x',stream:true,stream_options:{include_usage:true},messages:[{role:'user',content:'hello'}]})});
    const events=(await res.text()).split('\n\n').filter(Boolean).map(e=>e.replace(/^data: /u,''));
    assert.equal(events.at(-1),'[DONE]');
    const usage=JSON.parse(events.at(-2)!);
    assert.deepEqual(usage.choices,[]);
    assert.equal(usage.usage.prompt_tokens,1200);
    assert.equal(fake.chatRequests()[0]?.streamUsage,true);
  }finally{await fake.close();}
});

test('s00 · a declared red turns red when its defect is absent',()=>{
  const dir=mkdtempSync(join(tmpdir(),'talos-acceptance-s00-'));
  const checks=pathToFileURL(join(import.meta.dirname,'checks.ts')).href;
  const run=(text:string)=>{
    const file=join(dir,`probe-${Math.random().toString(36).slice(2)}.test.ts`);
    writeFileSync(file,`import {test} from 'node:test';import {assertEnglishOnly,declaredRed} from ${JSON.stringify(checks)};\ntest('probe',declaredRed('R2','D-05','probe'),()=>{assertEnglishOnly(${JSON.stringify(text)});});\n`);
    /* NODE_TEST_CONTEXT would make the child report to this runner instead of printing its own result. */
    const env={...process.env};delete env.TALOS_ACCEPTANCE_REVEAL_REDS;delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath,['--experimental-strip-types','--test',file],{encoding:'utf8',env,timeout:60_000});
  };
  try{
    const present=run('Run · failed · ⛔ interrotto su richiesta');
    assert.equal(present.status,0,`with the defect present the declared red must pass:\n${present.stdout}`);
    const absent=run('Run · interrupted by you');
    assert.equal(absent.status,1,`with the defect absent the declared red must fail:\n${absent.stdout}`);
    assert.match(absent.stdout,/expected to fail but passed/u);
    /* R2 E10(d): the extended list bites on the review's D-07 row and stays quiet on an English frame. */
    assert.deepEqual(italianOn('elenca · completed / args {"cartella":"."} · ⛔ giri esauriti'),['elenca','cartella','giri']);
    assert.deepEqual(italianOn('List files · . · completed · • main · ready · non-interactive'),[]);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('s00 · the border check accepts a healthy frame and flags the overflowing help frame of review D-02',()=>{
  const screen=(lines:string[]):Screen=>({lines,text:lines.join('\n'),buffer:'alternate',cols:100,rows:lines.length});
  const healthy=screen(['TALOS · project · interactive','  idle','┌────────┐','│>       │','└────────┘','mode default · Shift+Tab cycle','• main · ready']);
  const overflowing=screen(['│Esc / Enter / ? closes helperations  │','╰/tasks [args...] — Tasks operations───╯','┌────────┐','└>  ─────┘']);
  const narrow=screen(['┌────────┐','mode default · Shift+Tab cycle─────┘']);
  assert.deepEqual(brokenBorders(healthy),[]);
  assert.equal(brokenBorders(overflowing).length,2);
  assert.equal(brokenBorders(narrow).length,1);
});

/* CAND033-S12-WAITFOR-BLANK (registered 30/09): the waiter matched a frame, then the final recheck after `settled()` found
   the blank of a repaint (the clear arrives in its own block on Windows) and threw «the process exited» though the process
   was alive. A blank recheck of a live process keeps waiting until the deadline; «exited» is said only when it did. */
test('s00 · a blank repaint right after the match does not end the wait, and is never called an exit',async()=>{
  const fake=scriptedPty();
  const t=new TerminalSession('fake',[],{cols:40,rows:10,cwd:tmpdir(),env:{},spawn:()=>fake.pty});
  /* The clear is sent the moment the predicate first matches: it lands between the match and the final recheck, as the
     repaint's clear did on Windows. */
  let cleared=false;
  const wait=t.waitFor('the ready line',x=>{const ok=x.text.includes('READY-LINE');if(ok&&!cleared){cleared=true;fake.send(`${ESC}[2J${ESC}[H`);}return ok;},{timeout:5_000});
  fake.send('READY-LINE');
  await new Promise(r=>setTimeout(r,150));
  fake.send('READY-LINE again');
  const screen=await wait;
  /* Which of the two frames is returned depends on when the clear is applied; either way the returned screen satisfies the
     request and the wait never ends in an «exited» for a live process. */
  assert.match(screen.text,/READY-LINE/u);
  const never=t.waitForText('NEVER-HERE',{timeout:400});
  fake.send(`${ESC}[2J${ESC}[H`);
  await assert.rejects(never,(error:Error)=>/timed out after 400 ms/u.test(error.message)&&!/exited/u.test(error.message));
  await t.close();
});
