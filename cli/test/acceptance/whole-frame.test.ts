/*
 * A5d (CLI 0.7.0, 19/11/2026): ConPTY lets the last rows of a large frame out AFTER its own synchronized block ends (measured on s02:
 * BSU, 5970 chars, ESU, then the footer's 235 chars 9 ms later), so a screen judged at the block's end can have the composer and not
 * yet the footer. `wholeFrame` judges the screen only once the pty has been quiet for PAINT_GAP_MS. A scripted pty gives the exact
 * byte timing; the composer and footer rows are the ones TALOS draws (checks.ts reads the same shapes).
 */
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import test from 'node:test';
import {PAINT_GAP_MS,toComposer,wholeFrame} from './harness.ts';
import {composerReady,idleFooter} from './checks.ts';
import {ESC,TerminalSession,type PtyLike} from './terminal.ts';

const BSU=`${ESC}[?2026h`,ESU=`${ESC}[?2026l`;
const ready=(s:{lines:string[]})=>composerReady(s as any)&&idleFooter(s as any);
const modelRow=/^ qwen3-coder-test · ollama: checking… · /mu;
/* the top of the frame: the header, the composer box; then the footer's two rows as ConPTY's late tail */
const top=` TALOS  ~/project\r\n\r\n╭──────────────────────────────────────╮\r\n│ › Ask TALOS, / for commands, @ for files │\r\n╰──────────────────────────────────────╯\r\n`;
const tail=` ask before edits · shift+tab · ? keys\r\n qwen3-coder-test · ollama: checking… · ctx ?`;

function scriptedPty(){
  let feed:(data:string)=>void=()=>{};let exited:(e:{exitCode:number})=>void=()=>{};
  const pty:PtyLike={onData:cb=>{feed=cb;},onExit:cb=>{exited=cb;},write:()=>{},resize:()=>{},kill:()=>exited({exitCode:0})};
  return{pty,send:(data:string)=>feed(data)};
}
const session=(fake:ReturnType<typeof scriptedPty>)=>new TerminalSession('fake',[],{cols:60,rows:10,cwd:tmpdir(),env:{},spawn:()=>fake.pty});
const later=(ms:number,run:()=>void)=>new Promise<void>(resolve=>setTimeout(()=>{run();resolve();},ms));

test('the class: a plain wait judges the screen at the end of ConPTY\'s block, before the footer arrives',async()=>{
  const fake=scriptedPty();const t=session(fake);
  try{
    const seen=t.waitFor('the composer is ready',ready,{timeout:5_000});
    fake.send(`${BSU}${top}${ESU}`);
    const screen=await seen;
    assert.doesNotMatch(screen.text,modelRow,'the torn screen already had the footer: the scripted timing does not reproduce the class');
    await later(9,()=>fake.send(tail));
  }finally{await t.close();}
});

test('wholeFrame waits for the footer that ConPTY sends 9 ms after its block',async()=>{
  const fake=scriptedPty();const t=session(fake);
  try{
    const seen=wholeFrame(t,'the composer is ready',ready,{timeout:5_000});
    fake.send(`${BSU}${top}${ESU}`);
    await later(9,()=>fake.send(tail));
    const screen=await seen;
    assert.match(screen.text,modelRow);
  }finally{await t.close();}
});

test('toComposer with whole:true returns the whole frame, and without it keeps today\'s behaviour',async()=>{
  const fake=scriptedPty();const t=session(fake);
  try{
    fake.send(`${BSU} TALOS  ~/project${ESU}`);await t.settled();
    const seen=toComposer(t,{whole:true});
    fake.send(`${BSU}${top}${ESU}`);
    await later(9,()=>fake.send(tail));
    assert.match((await seen).text,modelRow);
  }finally{await t.close();}
});

test('wholeFrame is not looser: a frame that stays without its footer is returned as it is, and the scenario\'s check still fails',async()=>{
  const fake=scriptedPty();const t=session(fake);
  try{
    const seen=wholeFrame(t,'the composer is ready',ready,{timeout:5_000});
    fake.send(`${BSU}${top}${ESU}`);
    const screen=await seen;
    assert.doesNotMatch(screen.text,modelRow);
  }finally{await t.close();}
});

test('wholeFrame judges again after the quiet gap: a screen that stopped matching is waited for again',async()=>{
  const fake=scriptedPty();const t=session(fake);
  try{
    let done=false;
    const seen=wholeFrame(t,'the composer is ready',ready,{timeout:5_000}).then(s=>{done=true;return s;});
    fake.send(`${BSU}${top}${ESU}`);
    /* within the gap the frame is replaced by one without the composer (a card opened): not ready any more */
    await later(5,()=>fake.send(`${ESC}[2J${ESC}[H${BSU} TALOS  ~/project\r\n Allow once?${ESU}`));
    await later(PAINT_GAP_MS*3,()=>{});
    assert.equal(done,false,'a screen that stopped matching during the gap was returned');
    fake.send(`${ESC}[2J${ESC}[H${BSU}${top}${tail}${ESU}`);
    assert.match((await seen).text,modelRow);
  }finally{await t.close();}
});

test('wholeFrame times out with the screen when nothing ever matches',async()=>{
  const fake=scriptedPty();const t=session(fake);
  try{
    fake.send(`${BSU} TALOS  ~/project${ESU}`);
    await assert.rejects(wholeFrame(t,'the composer is ready',ready,{timeout:300}),(error:Error)=>/the composer is ready[^]*timed out[^]*TALOS/u.test(error.message));
  }finally{await t.close();}
});
