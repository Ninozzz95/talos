/*
 * R2 lane J — gate E11 / Q-R2-6 (owner 2026-09-24): protocol v2 (opt-in, unreleased) speaks English keys; v1 stays byte-frozen.
 * The kernel payloads below are the shapes MEASURED at their emitters, not invented:
 *   RunStarted      agui-events.mjs:29 runStarted + agent-service.mjs:582-590 (contesto) + custom-task.mjs:169 (task)
 *                   + chat-image-attachments.mjs:31 (immagini: id, tipo 'immagine', nome, mimeType, byte, url)
 *                   + session-registry.mjs:3538-3545,4373 (seguito, reindirizzato) + workspace-context.mjs:113 (repoAnnidati)
 *   Approval*       agui-events.mjs:278,306 + talosHarness.mjs:8166-8750 (azione) + path-policy.mjs:351 (segreto)
 *   RunFinished     agent-service.mjs:182 (detto, compattazioni, premesseNegate, usage) + talosHarness.mjs:10268 (usage.giri)
 *                   + session-registry.mjs:2677,2691 (outcome 'fermato'/'concluso')
 *   StateDelta      agui-events.mjs:448 eventoPerUsage + talosHarness.mjs:7843 (conto.giri)
 *   ToolCallResult  agui-events.mjs:213 (durataMs, comando) + talosHarness.mjs:6142 creaRicevutaOperazione (azione, percorso,
 *                   comando, hashContenuto)
 * The three parts of an error (Q-R2-4) ride the v2 envelope as `what`/`todo`/`where` from lane E's `describeError`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {createEventBridge} from '../../src/events/bridge.ts';
import {describeError} from '../../src/i18n/error-view.ts';
import {main} from '../../src/main.ts';
import {encodeV2Result,encodeV2Stream} from '../../src/protocol/v2/codec.ts';
import {createV2EventBridge,createV2FailureEvent,createV2RunResultAccumulator} from '../../src/protocol/v2/events.ts';
import {toolDisplay} from '../../src/tui/tool-display.ts';

const NOW='2026-09-24T09:00:00.000Z';
const IMAGE_ID='0123456789abcdef'.repeat(4);
const clock=()=>NOW;

/** Every Italian key measured in the kernel payloads the v2 bridge passes through (gate §1.6 lists 13; the emitters hold more). */
const MEASURED_ITALIAN_KEYS=[
  'consegna','consegnaCorta','progetto','immagini','nome','byte','seguito','reindirizzato',
  'contesto','cartella','repoAnnidati','modello','permessi',
  'azione','tipo','percorso','comando','formato','segreto','classe','frase','nascosto',
  'approvato',
  'detto','compattazioni','premesseNegate','giri',
  'durataMs','hashContenuto','consentito','motivo',
] as const;

function kernelTranscript(){
  return[
    {type:'RunStarted',_sequenza:1,threadId:'session-1',runId:'run-1',
      input:{consegna:'fix the failing test',consegnaCorta:'fix the failing test',progetto:'demo',immagini:[{id:IMAGE_ID,tipo:'immagine',nome:'a.png',mimeType:'image/png',byte:68,url:'/api/v1/chat-images/'+IMAGE_ID}]},
      contesto:{progetto:'demo',cartella:'C:/work/demo',branch:'main',worktree:null,repoAnnidati:['vendor/lib'],modello:'openai:gpt-5',reasoning:{effort:'high'},permessi:'On request'}},
    {type:'RunStarted',_sequenza:2,threadId:'session-1',runId:'run-2',input:{consegna:'and now the docs',progetto:'demo',seguito:true,reindirizzato:true}},
    {type:'ApprovalRequested',_sequenza:3,requestId:'approval-1',
      azione:{tipo:'shell',toolCallId:'tool-1',comando:'cat ~/.ssh/id_rsa',trifecta:true,segreto:{classe:'segreto',percorso:'~/.ssh/id_rsa',frase:'contains keys',nascosto:true}}},
    {type:'ApprovalResolved',_sequenza:4,requestId:'approval-1',approvato:false},
    {type:'ApprovalRequested',_sequenza:5,requestId:'approval-2',azione:{tipo:'scrivi',toolCallId:'tool-2',percorso:'src/a.ts'}},
    {type:'ApprovalRequested',_sequenza:6,requestId:'approval-3',azione:{tipo:'document_create',toolCallId:'tool-3',formato:'pdf'}},
    {type:'ApprovalResolved',_sequenza:7,requestId:'approval-2',approvato:true},
    {type:'ToolCallResult',_sequenza:8,messageId:'m-1',toolCallId:'tool-2',content:'written',role:'tool',durataMs:12,comando:'npm test',cwd:'C:/work/demo',
      receipt:{schema_version:1,azione:'scrivi',percorso:'src/a.ts',comando:null,toolCallId:'tool-2',consentito:true,via:'livello',motivo:'consentito',status:'succeeded',risk:'R1',
        trifecta:false,action:'write',requiredActions:['write'],hashContenuto:'ab12',verified:true,signature:null,keyId:null}},
    {type:'StateDelta',_sequenza:9,delta:[{op:'replace',path:'/usage',value:{prompt_tokens:120,completion_tokens:30,cached_tokens:40,giri:2}}]},
    {type:'RunFinished',_sequenza:10,threadId:'session-1',runId:'run-2',outcome:{type:'success'},
      result:{detto:'done',compattazioni:1,premesseNegate:0,usage:{prompt_tokens:120,completion_tokens:30,prompt_tokens_details:{cached_tokens:40},giri:2}}},
  ];
}

function keysOf(value:unknown,out:Set<string>=new Set()):Set<string>{
  if(Array.isArray(value))value.forEach(item=>keysOf(item,out));
  else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){out.add(key);keysOf(item,out);}
  return out;
}

test('E11 RED — run.started carries English input and context keys',()=>{
  const bridge=createV2EventBridge('session-1',clock);
  const [first,second]=kernelTranscript().slice(0,2).map(raw=>bridge.translate(raw));
  assert.deepEqual(first?.data,{
    threadId:'session-1',runId:'run-1',
    input:{prompt:'fix the failing test',shortPrompt:'fix the failing test',project:'demo',images:[{id:IMAGE_ID,type:'image',name:'a.png',mimeType:'image/png',bytes:68,url:'/api/v1/chat-images/'+IMAGE_ID}]},
    context:{project:'demo',folder:'C:/work/demo',branch:'main',worktree:null,nestedRepos:['vendor/lib'],model:'openai:gpt-5',reasoning:{effort:'high'},permissions:'On request'},
  });
  assert.deepEqual(second?.data,{threadId:'session-1',runId:'run-2',input:{prompt:'and now the docs',project:'demo',followUp:true,redirected:true}});
});

test('E11 RED — approvals carry an English action with the display label, and approved',()=>{
  const bridge=createV2EventBridge('session-1',clock);
  const rows=kernelTranscript().slice(2,7).map(raw=>bridge.translate(raw)?.data);
  assert.deepEqual(rows[0],{requestId:'approval-1',action:{
    tool:'shell',displayName:toolDisplay('shell').label,toolCallId:'tool-1',command:'cat ~/.ssh/id_rsa',trifecta:true,
    /* 0.6.8: the class value in English too (it leaked «segreto») */
    sensitive:{class:'secret',path:'~/.ssh/id_rsa',sentence:'contains keys',hidden:true},
  }});
  assert.deepEqual(rows[1],{requestId:'approval-1',approved:false});
  assert.deepEqual(rows[2],{requestId:'approval-2',action:{tool:'scrivi',displayName:toolDisplay('scrivi').label,toolCallId:'tool-2',path:'src/a.ts'}});
  assert.deepEqual(rows[3],{requestId:'approval-3',action:{tool:'document_create',displayName:toolDisplay('document_create').label,toolCallId:'tool-3',format:'pdf'}});
  assert.deepEqual(rows[4],{requestId:'approval-2',approved:true});
});

test('E11 RED — tool receipts and tool details keep no Italian key',()=>{
  const event=createV2EventBridge('session-1',clock).translate(kernelTranscript()[7]);
  assert.deepEqual(event?.data.details,{messageId:'m-1',role:'tool',durationMs:12,command:'npm test',cwd:'C:/work/demo'});
  assert.deepEqual((event?.data.receipt as any).details,{
    schema_version:1,tool:'scrivi',path:'src/a.ts',command:null,toolCallId:'tool-2',trifecta:false,action:'write',requiredActions:['write'],
    contentHash:'ab12',verified:true,signature:null,keyId:null,
  });
});

test('E11 / E-03 RED — usage keeps the token counters and says turns, live and in the final result',()=>{
  const bridge=createV2EventBridge('session-1',clock);
  const accumulator=createV2RunResultAccumulator();
  const events=kernelTranscript().map(raw=>bridge.translate(raw)).filter(event=>event!==null);
  events.forEach(event=>accumulator.add(event!));
  const live=events.find(event=>event!.type==='usage.updated');
  assert.deepEqual(live?.data,{value:{prompt_tokens:120,completion_tokens:30,cached_tokens:40,turns:2}});
  const completed=events.find(event=>event!.type==='run.completed');
  assert.deepEqual(completed?.data,{threadId:'session-1',runId:'run-2',outcome:{type:'success'},
    result:{text:'done',compactions:1,deniedPremises:0,usage:{prompt_tokens:120,completion_tokens:30,prompt_tokens_details:{cached_tokens:40},turns:2}}});
  assert.deepEqual(accumulator.result().result?.usage,{prompt_tokens:120,completion_tokens:30,cached_tokens:40,turns:2});
});

test('E11 RED — the kernel outcome words become an English enum',()=>{
  const bridge=createV2EventBridge('session-1',clock);
  assert.equal(bridge.translate({type:'RunFinished',_sequenza:1,outcome:'concluso'})?.data.outcome,'completed');
  assert.equal(bridge.translate({type:'RunFinished',_sequenza:2,outcome:'fermato'})?.data.outcome,'stopped');
});

test('E11 RED — no measured Italian key survives anywhere in a full v2 transcript and its result',()=>{
  const bridge=createV2EventBridge('session-1',clock);
  const accumulator=createV2RunResultAccumulator();
  const events=kernelTranscript().map(raw=>bridge.translate(raw)).filter(event=>event!==null);
  events.forEach(event=>accumulator.add(event!));
  const keys=keysOf([events,accumulator.result()]);
  const italian=MEASURED_ITALIAN_KEYS.filter(key=>keys.has(key));
  assert.deepEqual(italian,[],'Italian keys in v2: '+italian.join(', '));
});

test('E11 — v1 is untouched: the same kernel payloads still reach v1 with their frozen keys',()=>{
  const bridge=createEventBridge('session-1',clock);
  const approval=bridge.translate({type:'ApprovalRequested',requestId:'a',azione:{tipo:'shell',comando:'npm test'}});
  const resolved=bridge.translate({type:'ApprovalResolved',requestId:'a',approvato:true});
  const finished=bridge.translate({type:'RunFinished',result:{detto:'ok'}});
  assert.deepEqual(approval?.data,{requestId:'a',azione:{tipo:'shell',comando:'npm test'}});
  assert.deepEqual(resolved?.data,{requestId:'a',approvato:true});
  assert.deepEqual(finished?.data,{result:{detto:'ok'}});
});

function expectedParts(error:unknown){const view=describeError(error);return{what:view.what,todo:view.todo,where:view.where};}

test('Q-R2-4 RED — a v2 run failure carries what, todo and where from describeError; the code is unchanged',()=>{
  const raw={type:'RunError',_sequenza:3,code:'PROVIDER_UNREACHABLE',message:'offline',component:'provider',retryable:true,traceId:'trace-1'};
  const event=createV2EventBridge('session-1',clock).translate(raw);
  const envelope=(event?.data.error as any).envelope;
  assert.equal(envelope.code,'PROVIDER_UNREACHABLE');
  // Owner 2026-09-24: message is the English headline (what); the original, redacted message moves to raw.
  assert.equal((event?.data.error as any).message,envelope.what);
  assert.equal((event?.data.error as any).raw,'offline');
  const {type:_t,_sequenza:_s,...error}=raw;
  assert.deepEqual({what:envelope.what,todo:envelope.todo,where:envelope.where},expectedParts(error));
  assert.equal(typeof envelope.what,'string');
});

test('Q-R2-4 RED — synthetic failures, cancellations and the fallback result carry the same three fields',()=>{
  const failure=createV2FailureEvent({sessionId:'s',error:{code:'PROVIDER_KEY_MISSING',message:'No API key',component:'provider',retryable:false,traceId:'t'},component:'provider',clock});
  const envelope=(failure.data.error as any).envelope;
  assert.equal(envelope.code,'PROVIDER_KEY_MISSING');
  assert.deepEqual({what:envelope.what,todo:envelope.todo,where:envelope.where},expectedParts({code:'PROVIDER_KEY_MISSING',message:'No API key',component:'provider',retryable:false,traceId:'t'}));

  const cancelled=createV2RunResultAccumulator();
  cancelled.add(createV2EventBridge('s',clock).translate({type:'RunCancelled',_sequenza:1,reason:'cancelled by user'})!);
  const cancelledEnvelope=cancelled.result().error!.envelope as any;
  assert.equal(cancelledEnvelope.code,'CANCELLED');
  assert.ok('what' in cancelledEnvelope&&'todo' in cancelledEnvelope&&'where' in cancelledEnvelope);

  const fallback=createV2RunResultAccumulator();
  fallback.add({...failure,data:{}});
  const fallbackEnvelope=fallback.result().error!.envelope as any;
  assert.equal(fallbackEnvelope.code,'AGENT_FAILED');
  assert.ok('what' in fallbackEnvelope&&'todo' in fallbackEnvelope&&'where' in fallbackEnvelope);
});

test('Q-R2-4 — the three fields are redacted like every other v2 string',()=>{
  const secret=['gh','p_',('aB3dE5fG7h').repeat(4)].join('');
  const event=createV2FailureEvent({sessionId:'s',error:new Error('upstream said '+secret),component:'provider',clock});
  assert.equal(JSON.stringify(event).includes(secret),false);
});

test('Q-R2-4 RED — the public v2 JSON result of a failed headless run carries the three fields',async()=>{
  const runtime={
    start:async()=> 'session-1',restore:async()=>({restored:0,total:0}),listSessions:async()=>[],export:()=>null,
    resume:async()=> 'session-1',fork:async()=> 'session-1',
    subscribe(_id:string,sink:(event:any)=>void){queueMicrotask(()=>sink({type:'RunError',_sequenza:1,code:'PROVIDER_UNREACHABLE',message:'offline',component:'provider',traceId:'trace-9'}));return()=>{};},
    answerApproval:async()=>{},cancel:async()=>{},close:async()=>{}
  } as any;
  const io={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''} as any;
  await main(['-p','work','--json','--protocol','v2'],{io,createRuntime:async()=>runtime} as any);
  const result=JSON.parse(io.stdout);
  assert.equal(result.schema,'talos.cli.result.v2');
  assert.equal(result.error.envelope.code,'PROVIDER_UNREACHABLE');
  for(const key of ['what','todo','where'])assert.ok(key in result.error.envelope,key);
});

/*
 * New v2 goldens (gate E11, Q-R2-6). v1 goldens live in ../fixtures/protocol/v1 and are frozen by v1-freeze.test.ts; these
 * are v2's own. The `what`/`todo`/`where` words come from lane E's dictionary: when that wording changes, regenerate with
 *   TALOS_WRITE_V2_GOLDENS=1 node scripts/run-tests.mjs --test-concurrency=1 test/protocol/r2-v2-english.test.ts
 * and review the diff — only those three fields may move.
 */
const GOLDEN_ROOT=new URL('../fixtures/protocol/v2/',import.meta.url);
function goldenOutputs():Record<string,string>{
  const bridge=createV2EventBridge('session-1',clock);
  const accumulator=createV2RunResultAccumulator();
  const raw=[
    ...kernelTranscript().slice(0,8),
    {type:'TextMessageStart',_sequenza:11,messageId:'m-2',role:'assistant'},
    {type:'TextMessageContent',_sequenza:12,messageId:'m-2',delta:'done'},
    {type:'TextMessageEnd',_sequenza:13,messageId:'m-2'},
    ...kernelTranscript().slice(8),
  ];
  const events=raw.map(row=>bridge.translate(row)).filter(event=>event!==null).map(event=>event!);
  events.forEach(event=>accumulator.add(event));
  const failedBridge=createV2EventBridge('session-2',clock);
  const failedEvent=failedBridge.translate({type:'RunError',_sequenza:4,runId:'run-4',code:'PROVIDER_UNREACHABLE',message:'offline',component:'provider',retryable:true,traceId:'trace-1'})!;
  const failed=createV2RunResultAccumulator();failed.add(failedEvent);
  const cancelledEvent=createV2EventBridge('session-3',clock).translate({type:'RunCancelled',_sequenza:5,runId:'run-5',reason:'cancelled by user'})!;
  const cancelled=createV2RunResultAccumulator();cancelled.add(cancelledEvent);
  const cancelledResult=cancelled.result();
  // The cancellation envelope has no native trace id; pin it so the golden is stable (the shape is what is frozen here).
  (cancelledResult.error!.envelope as any).traceId='trace-cancelled';
  return{
    'event-transcript.jsonl':encodeV2Stream(events),
    'result-success.json':encodeV2Result(accumulator.result()),
    'event-failed.jsonl':encodeV2Stream([failedEvent]),
    'result-error.json':encodeV2Result(failed.result()),
    'event-cancelled.jsonl':encodeV2Stream([cancelledEvent]),
    'result-cancelled.json':encodeV2Result(cancelledResult),
  };
}

test('E11 — v2 output is byte-identical to its new English goldens',async()=>{
  const outputs=goldenOutputs();
  if(process.env.TALOS_WRITE_V2_GOLDENS==='1'){
    await mkdir(GOLDEN_ROOT,{recursive:true});
    for(const [name,text] of Object.entries(outputs))await writeFile(new URL(name,GOLDEN_ROOT),text,'utf8');
  }
  assert.deepEqual((await readdir(GOLDEN_ROOT)).sort(),Object.keys(outputs).sort());
  for(const [name,text] of Object.entries(outputs)){
    const golden=await readFile(new URL(name,GOLDEN_ROOT),'utf8');
    assert.equal(text,golden,name);
    for(const line of golden.trim().split('\n')){
      const parsed=JSON.parse(line);
      assert.match(parsed.schema,/^talos\.cli\.(?:event|result)\.v2$/u,name);
      const italian=MEASURED_ITALIAN_KEYS.filter(key=>keysOf(parsed).has(key));
      assert.deepEqual(italian,[],name+': Italian keys '+italian.join(', '));
    }
  }
});
