/*
 * R5a (coordinator; owner decision 2026-09-24, from the s22 acceptance run): the Context Engine runs only for a window of
 * 64k tokens or more. Measured: TALOS's own instructions and tools are about 11.1k tokens (s22 window stage, `ctx
 * ~11.1k/16.4k` before any conversation); the engine's input limit is the window minus the reserve (a quarter of a small
 * window) minus a 15 % heuristic margin (context-engine profiles.mjs:6), about 0.6 x the window, so a 16k window failed
 * EVERY turn (`CTX_CONTEXT_OVERFLOW`, then `CTX_HISTORY_DIVERGED`) and anything under ~40k would compact at once. Below the
 * threshold TALOS keeps its simple mode, and the screen says so once.
 * 0.6.13 (22/10/2026): the simple mode is the desktop adapter's (80a0d077e), which always installs context hooks, so the bare
 * kernel's fixed 8,000-character cut (talosHarness.mjs `uscitaUtile(…, 8_000, 0.5)`) never runs: a tool result arrives whole, and
 * is shortened only when the conversation would not fit (compattazione-desktop.mjs `accorciaTesto`, «[… N characters omitted to
 * fit the context window …]»).
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {dummyKey,hermetic,REPO_ROOT} from '../provider/first-run-fixture.ts';
import * as profiles from '../../src/runtime/model-profile.ts';
import {composeWithFake,runTurn,startScriptedProvider,textOf,type ChatRequest} from './r5a-r-fixture.ts';

test.after(()=>profiles.resetModelProfiles());
const BIG=Array.from({length:500},(_,i)=>`line ${String(i+1).padStart(4,'0')} ${'x'.repeat(10)}`).join('\n')+'\n';
/* about 60 KB: more than a 16k window can hold, so the adapter must shorten it under pressure */
const HUGE=Array.from({length:1500},(_,i)=>`line ${String(i+1).padStart(4,'0')} ${'x'.repeat(30)}`).join('\n')+'\n';
const readBig={kind:'tool' as const,name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'big.txt'}]};
/* a summary request (no tools offered) is answered in prose, as the simple compaction asks */
const oneRead=(request:ChatRequest)=>!request.tools.length?{kind:'text' as const,text:'Summary: big.txt was read.'}:request.toolResults===0?readBig:{kind:'text' as const,text:'Done.'};
const setWindow=(h:any,models:Record<string,unknown>)=>writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:1,models}));
const kernelBoundary:any=await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','kernel','confine-dati.mjs')).href);
const unframed=(text:string)=>text.replace(/^<<<TALOS_DATA [^\n]*>>>\n/u,'').replace(/\n<<<END_TALOS_DATA id=[0-9a-f]{12}>>>$/u,'');
const toolContents=(requests:ChatRequest[])=>requests.filter(r=>r.tools.length).flatMap(r=>r.body.messages.filter((m:any)=>m.role==='tool').map((m:any)=>String(m.content??'')));

test('R5a: the Context Engine threshold is 64k, exported for the composition and the screen',()=>{
  assert.equal((profiles as any).CONTEXT_ENGINE_MIN_WINDOW,64_000);
});

test('R5a: a 16k window keeps the simple mode, the turn completes, and a result that fits arrives whole',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  writeFileSync(path.join(h.project,'big.txt'),BIG);
  setWindow(h,{'deepseek:deepseek-flash':{contextWindow:16_384}});
  const fake=await startScriptedProvider({goodKey:key,respond:oneRead});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {raw}=await runTurn(context,h,'read big.txt');
    assert.ok(raw.some(e=>e?.type==='RunFinished'),`the turn completed: ${JSON.stringify(raw.filter(e=>e?.type==='RunError'))}`);
    assert.equal(fake.requests[0]!.body.max_tokens,undefined,'the simple mode sends no reserve, as before R5a');
    const tool=String(fake.requests[1]!.body.messages.find((m:any)=>m.role==='tool')?.content??'');
    /* 0.6.13 (22/10/2026): no fixed 8,000-character cut any more: the whole framed result, with no kernel cut marker */
    assert.doesNotMatch(tool,/TALOS cut/u,'no kernel cut marker');
    assert.equal(unframed(tool),BIG,'the whole result reaches the model');
    assert.equal(tool.length,BIG.length+kernelBoundary.avvolgiDati('',{fonte:'leggi big.txt',nonce:'0123456789ab'}).testo.length,'inside the data boundary, whose characters are the only addition');
  }finally{await context.runtime.close?.();await fake.close();}
}));

test('R5a: in a 16k window a read of about 60 KB reaches the model shortened to fit, and the turn completes',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  writeFileSync(path.join(h.project,'big.txt'),HUGE);
  setWindow(h,{'deepseek:deepseek-flash':{contextWindow:16_384}});
  const fake=await startScriptedProvider({goodKey:key,respond:oneRead});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {raw}=await runTurn(context,h,'read big.txt');
    assert.ok(raw.some(e=>e?.type==='RunFinished'),`the turn completed: ${JSON.stringify(raw.filter(e=>e?.type==='RunError'))}`);
    assert.equal(fake.requests[0]!.body.max_tokens,undefined,'the simple mode sends no reserve');
    const tools=toolContents(fake.requests);
    assert.ok(tools.length>0,'the read result reached the model');
    /* compattazione-desktop.mjs `accorciaTesto`, under pressure only: head and tail kept, the middle said to be omitted */
    const last=tools.at(-1)!;
    /* cure b78f4b29c M1 (candidate bb3c61b4d): TALOS says which lines are missing on a line of its own, BEFORE the data boundary;
       threshold branch c22d02a0b (11/11) had moved M1 and M2 to «trimmed by TALOS» (decision 245); see below for the 0.2.2 core */
    /* CLI 0.6.15 carries the core of TALOS Desktop 0.2.2 (e2578878e), whose system line is avviso-accorciato.mjs:25
       INIZIO_AVVISO_ACCORCIATO «shortened to fit the context». It is the sentence Desktop 0.2.1 already shipped (release 5e9fdc1b9
       has it, from ebf0b600c), so nothing got worse; the «trimmed by TALOS» form of c22d02a0b never reached a release, and CLI 0.6.14
       had neither line. Judge v1959, 16/11/2026.
       CLI 0.6.16 carries the core of TALOS Desktop 0.2.3 (bb6d3799a): its avviso-accorciato.mjs:33 writes «trimmed by TALOS», the
       sentence the desktop 0.2.3 and the phone 0.1.49 ship, and still reads the older one (:34-35). */
    assert.match(last,/^\[TALOS: this result was trimmed by TALOS\. Lines \d+–\d+ of this output \(about [\d,]+ characters\) are NOT shown below\./u,'the system line before the data says which lines are missing');
    assert.match(last,/\n<<<TALOS_DATA /u,'the boundary follows the system line');
    /* «One line», step 3 (11/11/2026): decision 245 (f47c96e3a, «neutral trim markers», now an ancestor of the line) renamed the marker
       inside the data: compattazione-desktop.mjs:1132 MARCATORE_ACCORCIATO */
    assert.match(last,/\[… [\d,]+ characters trimmed by TALOS; the full text is kept/u,'shortened under pressure, and the model is told');
    /* M2: the shortened results of the current request are listed in a note at the tail, outside the tool result */
    const tail=fake.requests[1]!.body.messages.at(-1);
    assert.equal(tail?.role,'user','the note is a user message of its own at the tail (decision 194), never glued to the tool result');
    /* same reason as the system line above: the 0.2.2 core's note is avviso-accorciato.mjs:31 INIZIO_NOTA_DEGLI_ACCORCIATI, identical in
       the Desktop 0.2.1 release (5e9fdc1b9); the «trimmed by TALOS» note was never released.
       CLI 0.6.16 on the core of Desktop 0.2.3 (bb6d3799a): the note is the «trimmed by TALOS» one, as desktop 0.2.3 and phone 0.1.49 */
    assert.match(textOf(tail?.content),/^<talos-note>\n\[TALOS context note: 1 result of the current request is trimmed by TALOS; the full text is kept: big\.txt \(lines \d+–\d+ not shown\)/u);
    assert.ok(last.length<HUGE.length/4,`shortened to fit a 16k window (${last.length} of ${HUGE.length} characters)`);
    assert.ok(last.includes(HUGE.slice(0,200)),'the head of the file is kept');
    assert.ok(tools.every(content=>!/TALOS cut/u.test(content)),'never the kernel\'s fixed cut');
  }finally{await context.runtime.close?.();await fake.close();}
}));

test('R5a: the small-window notice is said for a known window under 64k, never for a larger or unknown one',async()=>{
  const {smallWindowNotice}=await import('../../src/tui/usage-view.ts');
  const notice=smallWindowNotice({windowTokens:16_384,responseReserve:4_096,source:'override',date:null},'ollama:qwen3');
  assert.match(notice??'',/ollama:qwen3 has a 16\.4k-token window: too small for the Context Engine/u);
  assert.match(notice??'',/64k or more \(Ollama: num_ctx\)/u);
  assert.equal(smallWindowNotice({windowTokens:128_000,responseReserve:8_192,source:'models.dev',date:null},'x:y'),null);
  assert.equal(smallWindowNotice(null,'x:y'),null);
});
