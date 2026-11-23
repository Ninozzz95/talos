/**
 * s00 — the R1 checks prove they can fail (gate E6, Q-R1-4/7/8/9). Without these, a green s11-s14 could be a meter that
 * sees nothing or a check that accepts anything.
 *
 * 1. Through the real ConPTY, a child that writes DEC 2026 frames with full clears and turns on mouse reporting is seen as
 *    such: frames, `ESC[2J`, `ESC[3J` and the mouse DECSETs are counted, and the idle and mouse checks fail on it.
 * 2. A sequence split across two chunks is counted once.
 * 3. The screen and scrollback checks of s12-s14 accept the decided behaviour and reject today's.
 */
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {test} from 'node:test';
import {TOO_SMALL_NOTICE,assertExitTranscript,assertIdleQuiet,assertNoMouseCapture,assertStickyPrompt,resumeLineIn,tooSmallOnly} from './checks.ts';
import {childEnvironment} from './profile.ts';
import {ESC,OutputMeter,TerminalSession,describeOutput,type PtyLike,type Screen} from './terminal.ts';

const QUIET={ms:5_000,bytes:0,chunks:0,bsu:0,esu:0,eraseDisplay:0,eraseScrollback:0,mouseEnables:[],frameAt:[]};

test('s00 · through ConPTY the meter counts frames, full clears and mouse modes, and the idle and mouse checks fail on them',async ctx=>{
  /* Writes one Ink-like full-clear frame every 150 ms, and asks for mouse reporting once. Raw mode matters: ConPTY
     forwards a mouse DECSET only while the console input is in VT/raw mode, as it is under Ink (measured 2026-09-24:
     without raw mode `ESC[?1000h ESC[?1006h` never reached the pty output; with it they arrive, reordered first). */
  const code=`process.stdin.setRawMode(true);process.stdout.write('\\x1b[?1000h\\x1b[?1006h');let n=0;setInterval(()=>process.stdout.write('\\x1b[?2026h\\x1b[2J\\x1b[3J\\x1b[Hframe '+(++n)+'\\x1b[?2026l'),150);`;
  const t=new TerminalSession(process.execPath,['-e',code],{cols:60,rows:10,cwd:tmpdir(),env:childEnvironment()});
  try{
    await t.waitForText('frame 1',{timeout:15_000});
    const busy=await t.observe(1_500);
    ctx.diagnostic(`a child that frames every 150 ms: ${describeOutput(busy)}`);
    ctx.diagnostic(`whole run: ${describeOutput({...t.output.read(),frameAt:[]})}`);
    assert.ok(busy.esu>=5&&busy.bsu>=5,`frames were not counted: ${describeOutput(busy)}`);
    assert.ok(busy.eraseDisplay>=5,`ESC[2J was not counted: ${describeOutput(busy)}`);
    assert.throws(()=>assertIdleQuiet(busy,QUIET),/R1-IDLE: TALOS kept writing while idle/u);
    assert.throws(()=>assertNoMouseCapture(t.output.read()),/R1-MOUSE: TALOS turned on mouse reporting/u);
  }finally{await t.close();}
});

function scriptedPty(){
  let feed:(data:string)=>void=()=>{};let exited:(e:{exitCode:number})=>void=()=>{};
  const pty:PtyLike={onData:cb=>{feed=cb;},onExit:cb=>{exited=cb;},write:()=>{},resize:()=>{},kill:()=>exited({exitCode:0})};
  return{pty,send:(data:string)=>feed(data)};
}

test('s00 · a sequence split across two chunks is counted once',async()=>{
  const stream=`${ESC}[?2026h${ESC}[2J${ESC}[3J${ESC}[Hé${ESC}[?1000;1006h${ESC}[?25h${ESC}[?2026l`;
  for(let cut=1;cut<stream.length;cut++){
    const m=new OutputMeter();m.feed(stream.slice(0,cut));m.feed(stream.slice(cut));const c=m.stop();
    assert.deepEqual([c.bsu,c.esu,c.eraseDisplay,c.eraseScrollback,c.mouseEnables.length,c.bytes],[1,1,1,1,1,Buffer.byteLength(stream)],`cut at ${cut}`);
  }
  /* The session-wide meter of a terminal sees the same, and a window stops counting when it is stopped. */
  const fake=scriptedPty();
  const t=new TerminalSession('fake',[],{cols:40,rows:10,cwd:tmpdir(),env:{},spawn:()=>fake.pty});
  const window=t.meter();
  fake.send(stream.slice(0,5));fake.send(stream.slice(5));
  const frozen=window.stop();fake.send(stream);
  assert.equal(frozen.esu,1);assert.equal(window.read().esu,1);assert.equal(t.output.read().esu,2);
  await t.close();
});

test('s00 · the too-small, sticky-prompt and exit checks accept the decided screens and reject today\'s',()=>{
  const screen=(lines:string[]):Screen=>({lines,text:lines.join('\n'),buffer:'alternate',cols:39,rows:lines.length});
  assert.equal(tooSmallOnly(screen(['','      '+TOO_SMALL_NOTICE+'   ',''])),true);
  assert.equal(tooSmallOnly(screen([TOO_SMALL_NOTICE,'│>   │'])),false);
  assert.equal(tooSmallOnly(screen(['TALOS · project','  idle','┌───┐','│>  │'])),false);

  const sticky=screen(['↳ MD sticky prompt check','3 earlier messages above','Summary …','┌───┐']);
  assert.doesNotThrow(()=>assertStickyPrompt(sticky,'MD sticky prompt check'));
  assert.throws(()=>assertStickyPrompt(screen(['Summary …','┌───┐']),'MD sticky prompt check'),/R1-STICKY: the latest prompt/u);
  assert.throws(()=>assertStickyPrompt(screen(['↳ MD sticky prompt check','Summary …']),'MD sticky prompt check'),/R1-STICKY: no "N earlier messages above"/u);

  const id='665f7e91-5995-4649-8008-117509d01d91';
  const good=['','You','hello exit transcript','TALOS','OK','',`Resume this session with: talos --resume ${id}`];
  assert.equal(assertExitTranscript(good,{prompt:'hello exit transcript',answer:/^\s*OK\s*$/u}),id);
  assert.equal(resumeLineIn(good),good.at(-1));
  assert.throws(()=>assertExitTranscript(['',''],{prompt:'hello exit transcript',answer:/^OK$/u}),/R1-EXIT: after exit the terminal does not hold the prompt/u);
  assert.throws(()=>assertExitTranscript([`talos --resume ${id}`,'hello exit transcript','OK'],{prompt:'hello exit transcript',answer:/^OK$/u}),/R1-EXIT: no "talos --resume <id>" line after/u);
  assert.throws(()=>assertExitTranscript(['hello exit transcript',`talos --resume ${id}`],{prompt:'hello exit transcript',answer:/^OK$/u}),/R1-EXIT: after exit the answer/u);
  assert.equal(resumeLineIn(['bye']),undefined);
});
