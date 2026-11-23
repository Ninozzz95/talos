/*
 * Owner 13/10/2026 («Riga duplicate, skipped»): when the model asks for the very same call several times in a row and goes on,
 * the kernel runs it once and discards the copies (kernel/talosHarness.mjs, `annullaAnnunciate(…, 'copia')`); each copy reaches
 * the host as a cancelled tool result with `duplicate: true` (agent-service.mjs). On screen a copy read «interrupted», the word
 * of a tool the person stopped: nobody stopped it. The row now says «duplicate, skipped», and protocol v2 carries the fact.
 *
 * What the others do, read in the clones: Hermes removes the copies and only logs it ("Removed duplicate tool call: %s",
 * run_agent.py:1198-1210, clone of 07/10/2026); OpenCode asks the person at the third identical call (permission `doom_loop`,
 * packages/opencode/src/session/processor.ts:29 and :356-373, clone of 24/09/2026); Goose caps consecutive identical calls
 * (`--max-tool-repetitions`, crates/goose-cli/src/cli.rs:127, clone of 02/10/2026); Cline's loop detector asks the client
 * (sdk/packages/core/src/runtime/orchestration/session-runtime-orchestrator.ts:1251, clone of 23/09/2026).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createEventBridge} from '../../src/events/bridge.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {toolRowView} from '../../src/tui/components/tool-row.ts';
import type {ToolRowModel} from '../../src/tui/tools/registry.ts';
import {createReplayCoalescer} from '../../src/runtime/replay-coalescer.ts';
import {createTranscriptModel,reduceTranscriptEvent,transcriptItemText} from '../../src/tui/transcript-model.ts';
import {formatExitOutput} from '../../src/tui/exit-output.ts';

/*
 * Review of 13/10/2026 (bugfixer): two paths sound by reading and pinned by nothing. A conversation opened again replays its
 * journal through the replay coalescer (talos-composition.ts `subscribeWithCliEvents`), and what the person keeps when TALOS
 * closes is the exit transcript: on both a discarded copy must still read «duplicate, skipped», not «interrupted».
 */
test('a discarded copy still reads «duplicate, skipped» when the conversation is replayed, in the text that is copied and in the exit transcript',()=>{
  const journal=[durable({type:'RunStarted',runId:'r9'}),
    durable({type:'ToolCallStart',toolCallId:'k1',toolCallName:'leggi'}),durable({type:'ToolCallArgs',toolCallId:'k1',delta:'{"percorso":'}),durable({type:'ToolCallArgs',toolCallId:'k1',delta:'"notes.txt"}'}),copy('k1'),
    durable({type:'ToolCallStart',toolCallId:'k2',toolCallName:'leggi'}),durable({type:'ToolCallArgs',toolCallId:'k2',delta:'{"percorso":"other.txt"}'}),stopped('k2'),
    /* the exit transcript is written only for a conversation that holds a message */
    durable({type:'TextMessageStart',messageId:'m9',role:'assistant'}),durable({type:'TextMessageContent',messageId:'m9',delta:'Read it '}),durable({type:'TextMessageContent',messageId:'m9',delta:'once.'}),durable({type:'TextMessageEnd',messageId:'m9'}),
    durable({type:'RunFinished',runId:'r9'})];
  const replayed:unknown[]=[];const replay=createReplayCoalescer(event=>replayed.push(event));
  for(const row of journal)replay.push(row);replay.end();
  assert.ok(replayed.length<journal.length,'the replay really folded something (the two pieces of the arguments)');
  assert.equal((replayed.find((row:any)=>row?.type==='ToolCallResult'&&row.toolCallId==='k1') as any)?.duplicate,true,'the journal row keeps the fact through the replay');
  const adapter=createTuiEventAdapter([]);adapter.bindSession('s9');
  let model=createTranscriptModel();
  for(const row of replayed)for(const event of adapter.translateAll(row))model=reduceTranscriptEvent(model,event);
  const tools=model.items.filter(item=>item.kind==='tool') as any[];
  assert.deepEqual(tools.map(tool=>tool.id),['tool:k1','tool:k2'],JSON.stringify(model.items.map(item=>item.kind)));
  assert.equal(tools[0].facts?.duplicate,true);assert.equal(tools[1].facts?.duplicate,undefined);
  const firstLine=(text:string)=>text.split('\n')[0]!;
  assert.match(firstLine(transcriptItemText(tools[0])),/· duplicate, skipped$/u,'what search and copy read');
  assert.match(firstLine(transcriptItemText(tools[1])),/· interrupted$/u);
  const exit=formatExitOutput({sessionId:'s9',items:model.items});
  const rowOf=(file:string)=>exit.split('\n').find(line=>line.includes(file))??'';
  assert.match(rowOf('notes.txt'),/duplicate, skipped/u,exit);assert.doesNotMatch(rowOf('notes.txt'),/interrupted/u);
  assert.match(rowOf('other.txt'),/interrupted/u,exit);assert.doesNotMatch(rowOf('other.txt'),/duplicate/u);
});

const CLOCK=()=>'2026-10-13T00:00:00.000Z';
let seq=0;const durable=(row:Record<string,unknown>)=>({...row,_sequenza:++seq});
/* the kernel's sentence for a discarded copy (talosHarness.mjs) and the result agent-service.mjs makes of it */
const SAID='⛔ Discarded: the model asked 3 times in a row for the very same thing ("leggi" with the same arguments) and kept going — I cannot tell it from a loop. This tool did not run.';
const copy=(id:string)=>durable({type:'ToolCallResult',toolCallId:id,content:SAID,isError:true,outcome:'cancelled',duplicate:true});
const stopped=(id:string)=>durable({type:'ToolCallResult',toolCallId:id,content:'⛔ Stopped before this tool could run.',isError:true,outcome:'cancelled'});

test('the kernel still marks a discarded copy the way this test feeds it',()=>{
  const service=readFileSync(path.join(REPO_ROOT,'harness-ui','src','agent-service.mjs'),'utf8');
  assert.match(service,/\{ outcome: 'cancelled' \}\), \.\.\.\(evento\.causa === 'copia' \? \{ duplicate: true \} : \{\}\)/u);
  const kernel=readFileSync(path.join(REPO_ROOT,'harness-ui','src','kernel','talosHarness.mjs'),'utf8');
  assert.ok(kernel.includes('⛔ Discarded: the model asked ${ripetizione.viste} times in a row for the very same thing'));
});

test('protocol v2 says a cancelled result was a discarded copy; v1 is unchanged',()=>{
  const v2=createV2EventBridge('s1',CLOCK);
  v2.translate(durable({type:'RunStarted',runId:'r1'}));
  v2.translate(durable({type:'ToolCallStart',toolCallId:'c3',toolCallName:'leggi'}));
  const event=v2.translate(copy('c3'))!;
  assert.equal(event.type,'tool.completed');
  assert.equal((event.data as any).status,'cancelled');assert.equal((event.data as any).duplicate,true);
  assert.equal(((event.data as any).details??{}).duplicate,undefined,'a fact of its own, not an unnamed detail');
  v2.translate(durable({type:'ToolCallStart',toolCallId:'c4',toolCallName:'leggi'}));
  assert.equal('duplicate' in (v2.translate(stopped('c4'))!.data as any),false,'a tool the person stopped is not a copy');
  const v1=(rows:unknown[])=>{const bridge=createEventBridge('s1',CLOCK);return JSON.stringify(rows.map(row=>bridge.translate(row)).filter(Boolean));};
  const start=durable({type:'ToolCallStart',toolCallId:'c5',toolCallName:'leggi'});
  const plain=durable({type:'ToolCallResult',toolCallId:'c5',content:SAID,isError:true,outcome:'cancelled'});
  assert.equal(v1([start,{...plain,duplicate:true}]),v1([start,plain]),'v1 is byte-frozen');
});

test('the screen is told, and the row says «duplicate, skipped» instead of «interrupted»',()=>{
  const adapter=createTuiEventAdapter([]);adapter.bindSession('s1');
  const out=[durable({type:'RunStarted',runId:'r1'}),durable({type:'ToolCallStart',toolCallId:'c3',toolCallName:'leggi'}),copy('c3'),
    durable({type:'ToolCallStart',toolCallId:'c4',toolCallName:'leggi'}),stopped('c4')].flatMap(row=>adapter.translateAll(row));
  const facts=out.filter(e=>e.type==='tool.facts') as any[];
  assert.deepEqual(facts.filter(e=>e.toolCallId==='c3').map(e=>e.facts.duplicate),[true]);
  assert.equal(facts.some(e=>e.toolCallId==='c4'&&e.facts.duplicate),false);
  const NOW=1_000_000;
  const row=(over:Partial<ToolRowModel>):ToolRowModel=>({id:'t1',name:'leggi',status:'cancelled',argsText:JSON.stringify({percorso:'notes.txt'}),liveOutput:'',finalOutput:SAID,startedAt:NOW-500,endedAt:NOW-100,outcome:null,...over});
  const line=(model:ToolRowModel)=>toolRowView(model,120,false,NOW).line;
  assert.match(line(row({facts:{duplicate:true}})),/· duplicate, skipped$/u);
  assert.doesNotMatch(line(row({facts:{duplicate:true}})),/interrupted/u,'nobody interrupted it');
  /* a copy has no running time to state, even if its start is old */
  assert.match(line(row({facts:{duplicate:true},startedAt:NOW-9_000})),/· duplicate, skipped$/u);
  assert.match(line(row({})),/· interrupted$/u,'a tool the person stopped reads as before');

  assert.match(toolRowView(row({facts:{duplicate:true}}),120,true,NOW).line,/· duplicate, skipped$/u,'expanded too');
});

/* r4 block 17 (asked by the Mobile): a read lost in a dropped connection is neither done nor cancelled; isError stays */
test('protocol v2 says a tool lost in a dropped connection was interrupted, with no Italian key in its details',()=>{
  const v2=createV2EventBridge('s1',CLOCK);
  v2.translate(durable({type:'RunStarted',runId:'r1'}));
  v2.translate(durable({type:'ToolCallStart',toolCallId:'c6',toolCallName:'leggi'}));
  const data=v2.translate(durable({type:'ToolCallResult',toolCallId:'c6',content:'lost',isError:true,interrotta:true}))!.data as any;
  assert.equal(data.status,'interrupted');
  assert.equal((data.details??{}).interrotta,undefined);
  v2.translate(durable({type:'ToolCallStart',toolCallId:'c7',toolCallName:'leggi'}));
  assert.equal((v2.translate(durable({type:'ToolCallResult',toolCallId:'c7',content:'failed',isError:true}))!.data as any).status,'failed','a plain failure is still a failure');
});
