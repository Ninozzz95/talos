/*
 * Decision 99 (owner 03/11/2026, item 5 of the 06/11 realignment): the heads of the kernel's refusals.
 *  - «REFUSED: …» is the kernel's brake on a paged listing (decisioneDiSfogliamento): a step of the turn, as in Hermes, NEUTRAL,
 *    never «1 entry» and never red. The PC says «{name}: listing stopped, skipped» (activity.listingStopped).
 *  - «REFUSED [CODE].» of a delegation (rifiutoDellaDelega) is RED like every other no of the kernel. In the CLI the tone does not
 *    come from the text but from the event's fields (events/bridge.ts: `isError`, `allowed`): the kernel marks it `erroreTool`.
 * The sentences are the kernel's own, imported or read from its source, never written here by hand.
 */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {createEventBridge} from '../../src/events/bridge.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {toolRowView} from '../../src/tui/components/tool-row.ts';
import {createTranscriptModel,reduceTranscriptEvent} from '../../src/tui/transcript-model.ts';
import type {ToolRowModel} from '../../src/tui/tools/registry.ts';

let repo=join(process.cwd(),'..');while(!existsSync(join(repo,'harness-ui','src'))&&dirname(repo)!==repo)repo=dirname(repo);
const kernelPath=join(repo,'harness-ui','src','kernel','talosHarness.mjs');
const kernel:any=await import(pathToFileURL(kernelPath).href);
const NOW=1_000_000;
const row=(over:Partial<ToolRowModel>):ToolRowModel=>({id:'t1',name:'elenca',status:'completed',argsText:JSON.stringify({percorso:'src'}),liveOutput:'',finalOutput:'',startedAt:NOW-500,endedAt:NOW-100,outcome:null,...over});

test('the paged listing\'s brake: no count, the PC\'s neutral words, never a failure',()=>{
  assert.ok(Object.hasOwn(kernel.CAMPI_CHE_IDENTIFICANO_LA_DOMANDA,'elenca'),'elenca is a paged listing with the brake');
  const registro=new Map();const ask=(cursor?:string)=>kernel.decisioneDiSfogliamento({nome:'elenca',argomenti:{percorso:'src',...(cursor?{cursor}:{})},registro});
  assert.equal(ask().permesso,true);assert.equal(ask('c2').permesso,true);
  const stop=ask('c2');
  assert.equal(stop.permesso,false,'the same cursor again is braked');
  assert.match(stop.messaggio,/^REFUSED: /u,'the kernel\'s head for the brake');
  const view=toolRowView(row({finalOutput:stop.messaggio}),200,false,NOW);
  assert.match(view.line,/^List folder src · listing stopped, skipped$/u,view.line);
  assert.doesNotMatch(view.line,/entr(?:y|ies)\b/u);
  assert.equal(view.tone,'done','neutral: not failed, not denied');
  for(const head of ['REFUSED. This tool is turned off for this session.','DECLINED. The person said no to this.'])
    assert.doesNotMatch(toolRowView(row({finalOutput:head}),200,false,NOW).line,/listing stopped|entr(?:y|ies)\b/u,head);
  assert.equal(toolRowView(row({finalOutput:'src/a.ts\nsrc/b.ts'}),200,false,NOW).line,'List folder src · 2 entries');
});

test('a delegation\'s «REFUSED [CODE].» is red in v1 and on the screen',()=>{
  const said=kernel.rifiutoDellaDelega({codice:'DELEGATION_NOT_ALLOWED',ritentabile:false,motivo:'the person did not allow a sub-agent here'});
  assert.match(said,/^REFUSED \[DELEGATION_NOT_ALLOWED\]\. /u);
  const source=readFileSync(kernelPath,'utf8');
  assert.match(source,/erroreTool = true\s+rifiutoDellaChiamata = datiDelRifiuto\(\{ codice: 'DELEGATION_NOT_ALLOWED'/u,'the kernel marks the refusal as an error');
  const result={type:'ToolCallResult',toolCallId:'d1',content:said,isError:true};
  const bridge=createEventBridge('s',()=>'2026-11-06T08:00:00.000Z');
  bridge.translate({type:'ToolCallStart',toolCallId:'d1',toolCallName:'delega_sottotask'});
  assert.equal(bridge.translate(result)?.data.status,'failed','v1: not completed');
  const adapter=createTuiEventAdapter([]);adapter.bindSession('s');
  let model=createTranscriptModel();
  for(const raw of [{type:'RunStarted',runId:'r1'},{type:'ToolCallStart',toolCallId:'d1',toolCallName:'delega_sottotask'},{type:'ToolCallArgs',toolCallId:'d1',delta:'{"task":"x"}'},result])
    for(const event of adapter.translateAll(raw))model=reduceTranscriptEvent(model,event);
  const tool=model.items.find(item=>item.kind==='tool') as any;
  assert.ok(tool,JSON.stringify(model.items.map(item=>item.kind)));
  const view=toolRowView(tool,200,false,NOW);
  assert.ok(view.tone==='failed'||view.tone==='denied',`red: ${view.tone} · ${view.line}`);
  assert.doesNotMatch(view.line,/ · done$/u);
});
