/*
 * A5j cure (judge v2325, correctness reviewer): after «[6] No to this tool until your next message» the call's row said «failed» with
 * «REFUSED…», a plain Deny «denied». The kernel rewrites only the plain no into DECLINED and clears its error (talosHarness.mjs:746-756,
 * :21005-21006); the no to the tool keeps REFUSED with the tool's error set (:20801-20803 connector, :20841-20843 plugin, :20883-20885
 * Tool Forge), so «failed» won at transcript-model.ts `terminalTool`. A call the person answered no on its card never runs: the tool is
 * called only in the `else` of those branches (:20806, :20847, :20889). So a «failed» result after the person's no is that no, decided
 * from the FIELD of the person's answer (`ApprovalResolved.approvato:false`, which made the row `denied`), never from the text.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent} from '../../src/tui/transcript-model.ts';
import {createApprovalCoordinator} from '../../src/tui/approval.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';

const REFUSED='REFUSED. the person said no to this tool until their next message, answering on its card themselves: it is not run. The tool "create_pr" of the MCP server "gh" was not called.';
function rowAfter(raw:Array<Record<string,unknown>>){
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  let model=createTranscriptModel();
  for(const event of raw){const translated=adapter.translate(event);if(translated)model=reduceTranscriptEvent(model,translated as any);}
  return model.items.find((item:any)=>item.id==='tool:t1') as any;
}
const start={type:'ToolCallStart',toolCallId:'t1',toolCallName:'mcp__gh__create_pr'};
const asked={type:'ApprovalRequested',requestId:'q1',toolCallId:'t1',azione:{tipo:'mcp_tool',server:'gh',attrezzo:'create_pr',toolCallId:'t1'}};

test('A5j cure: the call answered «No to this tool» stays denied, as a plain Deny',()=>{
  const row=rowAfter([start,asked,{type:'ApprovalResolved',requestId:'q1',approvato:false},{type:'ToolCallResult',toolCallId:'t1',content:REFUSED,isError:true}]);
  assert.equal(row?.status,'denied');
});

test('A5j cure, the other way: a failure with no «no» before it stays failed (no card, or a yes)',()=>{
  assert.equal(rowAfter([start,{type:'ToolCallResult',toolCallId:'t1',content:'MCP tool call failed: boom',isError:true}])?.status,'failed');
  assert.equal(rowAfter([start,asked,{type:'ApprovalResolved',requestId:'q1',approvato:true},{type:'ToolCallResult',toolCallId:'t1',content:'MCP tool call failed: boom',isError:true}])?.status,'failed');
  /* the text alone decides nothing: REFUSED without the person's no on the card stays failed */
  assert.equal(rowAfter([start,{type:'ToolCallResult',toolCallId:'t1',content:REFUSED,isError:true}])?.status,'failed');
  /* only «failed» turns back into the person's no: a stopped turn after the no keeps its own word, as before the cure */
  assert.equal(rowAfter([start,asked,{type:'ApprovalResolved',requestId:'q1',approvato:false},{type:'ToolCallResult',toolCallId:'t1',content:'stopped',outcome:'cancelled'}])?.status,'cancelled');
});

/* Second line (judge, review of d0ec203cc): a provider may send the same toolCallId again (talosHarness.mjs:15940-15941); when that call
   starts, the row is no longer the refused one: it runs, and ends with its own word and text */
const no={type:'ApprovalResolved',requestId:'q1',approvato:false};
test('A5j cure, second line: the same id started again after a no runs, and a success says completed',()=>{
  const running=rowAfter([start,asked,no,start]);
  assert.equal(running?.status,'running');
  assert.equal(running?.finalOutput,'','no «Not run» under a call that is running');
  const row=rowAfter([start,asked,no,start,{type:'ToolCallResult',toolCallId:'t1',content:'PR_CREATED x'}]);
  assert.equal(row?.status,'completed');
});
test('A5j cure, second line: the same id started again after a plain no, then a failure, says failed with its own text',()=>{
  const row=rowAfter([start,asked,no,start,{type:'ToolCallResult',toolCallId:'t1',content:'MCP tool call failed: boom',isError:true}]);
  assert.equal(row?.status,'failed');
  assert.match(String(row?.finalOutput),/boom/u);
});

test('A5j cure, second line, the other way: only a denied row restarts; a row made by early arguments keeps its start as before',()=>{
  const row=rowAfter([{type:'ToolCallArgs',toolCallId:'t1',delta:'{"title":"x"}'},start]);
  assert.equal(row?.name,'mcp__gh__create_pr');
  assert.equal(row?.status,'queued');
});

test('A5j cure: a plain Deny on an outside card never sends the tool\'s scope',async()=>{
  for(const choice of ['deny-once','deny-always'] as const){
    const answers:unknown[][]=[];
    const engine={decide:async(action:any)=>({kind:'ask',requestId:'e1',action,reason:'asks'}),resolve:async()=>{}} as any;
    const c=createApprovalCoordinator({engine,answer:async(...args:any[])=>{answers.push(args);},interactive:true,mode:'default'});
    await c.request('s1','q1',permissionActionFromApproval({azione:{tipo:'mcp_tool',server:'gh',attrezzo:'create_pr'}}));
    await c.resolve('q1',choice);
    assert.deepEqual(answers,[['s1','q1',false]],choice);
  }
});
