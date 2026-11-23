/*
 * Stage 7.9 (owner 03/10 «foglio subito + patch per il conteggio»): /compact in the real app runs in the mockup's sheet — the
 * conversation read, the summary written (its time), the history replaced — then «Context A → B tokens (−N%)», a notice, and
 * Close. A refusal says where it stopped. Esc closes the sheet while it runs and the compaction goes on.
 * Mount: the REAL TuiApp through Ink into `@xterm/headless` (r5a-s-fixture.ts), a temp profile, no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',ESC='\x1b';
let n=0;const project=()=>{const root=join(env.root,`compact-sheet-${++n}`);mkdirSync(root,{recursive:true});return root;};
const eventi=[{type:'RunStarted',runId:'r1',input:{prompt:'first'}},{type:'TextMessageStart',messageId:'a',role:'assistant'},{type:'TextMessageContent',messageId:'a',delta:'ok'},{type:'TextMessageEnd',messageId:'a'}];

test('stage 7.9 /compact: the steps while the summary is written, then before → after, the notice, and Close',async()=>{
  let release!:(value:unknown)=>void;
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,runtimeExtra:{
    export:(id:string)=>({sessionId:id,eventi}),
    compact:()=>new Promise(resolve=>{release=resolve;}),
  }});
  try{
    await app.type('/compact');app.press(ENTER);
    let s=await app.waitFor('the running sheet',x=>/── Compact summarise to free the context window/u.test(x.text)&&/Writing the summary/u.test(x.text));
    assert.match(s.text,/✓ Reading the conversation +2 messages/u);
    assert.match(s.text,/· Replacing the history/u);
    s=await app.waitFor('its time runs',x=>/Writing the summary +[1-9]s/u.test(x.text),5_000);
    release({ok:true,compattato:true,tokenPrima:61_200,tokenDopo:9_800});
    s=await app.waitFor('the result',x=>/Context 61\.2k → 9\.8k tokens \(−84%\) · the transcript keeps every message/u.test(x.text));
    assert.match(s.text,/✓ Writing the summary +9\.8k tokens/u);assert.match(s.text,/✓ Replacing the history +done/u);
    assert.match(s.text,/Compacted: 61\.2k → 9\.8k tokens/u,'the notice');
    const shown=s.text.match(/Writing the summary +(\S+)/u)?.[1];await sleep(1_300);
    assert.equal((await app.screen()).text.match(/Writing the summary +(\S+)/u)?.[1],shown,'nothing counts after the end');
    app.press(ESC);
    await app.waitFor('closed',x=>!/── Compact/u.test(x.text));
  }finally{app.unmount();}
});

test('stage 7.9 /compact: a refusal says where it stopped; nothing to summarize says so',async()=>{
  let answer:()=>Promise<unknown>=async()=>{throw Object.assign(new Error('La sessione è ancora in corso'),{code:'SESSION_NOT_READY'});};
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,runtimeExtra:{export:(id:string)=>({sessionId:id,eventi}),compact:()=>answer()}});
  try{
    await app.type('/compact');app.press(ENTER);
    let s=await app.waitFor('the failure',x=>/✗ Writing the summary/u.test(x.text));
    assert.match(s.text,/· Replacing the history/u,'nothing was replaced');
    app.press(ESC);await app.waitFor('closed',x=>!/── Compact/u.test(x.text));
    /* 0.6.13 D5 (owner 21/10/2026): a bare `compattato:false` is now a FAILURE (the summary did not come, nothing replaced);
       «Already compact» is only nothing to compact — the kernel's `motivo:'niente-da-compattare'` or CTX_NOTHING_TO_COMPACT */
    answer=async()=>({ok:true,compattato:false,motivo:'niente-da-compattare'});
    await app.type('/compact');app.press(ENTER);
    s=await app.waitFor('already compact',x=>/Already compact/u.test(x.text));
  }finally{app.unmount();}
});

test('stage 7.10 /model: the sheet of the provider\'s models; →, Enter uses the model with that effort',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,modelRow:{reasoning:true,reasoningEfforts:['low','medium','high'],contextWindow:262_144,toolCalling:true,availabilityVerified:true}});
  try{
    await app.type('/model');app.press(ENTER);
    const s=await app.waitFor('the sheet',x=>/── Model /u.test(x.text)&&/Effort  ◆ default/u.test(x.text));
    assert.match(s.text,/Context  262k tokens/u);assert.match(s.text,/Can      tools · reasoning low to high/u);
    assert.match(s.text,/● xhigh/u,'the product\'s whole scale');
    app.press('\x1b[C');await app.waitFor('effort low',x=>/◆ low/u.test(x.text));
    app.press(ENTER);
    await app.waitFor('applied',()=>app.calls.some(call=>call.startsWith('select ollama:qwen3-coder-test')));
    await app.waitFor('the effort',()=>app.calls.some(call=>/effort low/u.test(call)),5_000);
    await app.waitFor('closed',x=>!/── Model /u.test(x.text));
  }finally{app.unmount();}
});

test('stage 7.10b: a paste while a sheet is open goes to the sheet, never to the composer (an API key into its masked row)',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    await app.type('/history');app.press(ENTER);
    await app.waitFor('the history sheet',x=>/── Your messages/u.test(x.text));
    await app.type('/');await sleep(60);
    app.press('\x1b[200~Pasted name\x1b[201~');
    const s=await app.waitFor('the pasted text in the filter',x=>/\/ Pasted name/u.test(x.text));
    assert.ok(!s.lines.some(line=>/^│ › .*Pasted name/u.test(line)),`the composer got the paste:\n${s.text}`);
    app.press(ESC);await sleep(60);app.press(ESC);await app.waitFor('closed',x=>!/── Your messages/u.test(x.text));
    assert.ok(!(await app.screen()).lines.some(line=>/Pasted name/u.test(line)),'nothing of the paste is left in the composer');
  }finally{app.unmount();}
});
