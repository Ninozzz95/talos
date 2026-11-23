/*
 * Row 126, round 2 (judge v2619, after the strict reviewer's yellow, points 3 and «Lista»):
 *   (a) after [7] the rows of the calls it covered said only «· done» (the reviewer's mutant R5): each row covered by «for all» says who
 *       said yes and that it was for all of them, «you allowed all N calls», the card's own row too. The why is written when the call
 *       ENDS and only if nobody decided it already and it was not refused (as `bypassWhy` does for Full access): a member with a forced
 *       sign asks on its own card, and its row keeps that card's answer — a no is never told as «you allowed all».
 *   (b) a card that carries one of the kernel's other reasons (suspicious content, trifecta…) never offers [7], even with a `gruppo`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {approvalChoicesFor} from '../../src/tui/overlays/approval-dialog.ts';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';
import {composeToolRow} from '../../src/tui/tools/row-format.ts';

const group={totale:3,chiamate:[1,2,3].map(n=>({toolCallId:`c${n}`,argomenti:{label:`all ${n}`}}))};
const azione=(extra:Record<string,unknown>={})=>({tipo:'mcp_tool',server:'gh',attrezzo:'add_label',...extra});
const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
function fakeRuntime(){
  const sinks=new Map<string,Set<(event:any)=>void>>();const answers:any[]=[];
  const r:any={
    restore:async()=>({restored:0,total:0}),start:async()=>'main',listSessions:async()=>[{sessionId:'main',parentId:null,depth:0}],export:()=>({eventi:[]}),
    subscribe(id:string,sink:(event:any)=>void){const set=sinks.get(id)??new Set();set.add(sink);sinks.set(id,set);return()=>set.delete(sink);},
    answerApproval:async(...args:any[])=>{answers.push(args);},cancel:async()=>{},close:async()=>{},
  };
  return{r,answers,emit:(event:any)=>{for(const sink of sinks.get('main')??[])sink(event);}};
}
async function turn(answerSecond:'allow-once'|'deny-once'){
  const f=fakeRuntime();const decisions=new Map<string,any>();let pending:any=null;
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},
    onEvent:(event:any)=>{if(event.type==='tool.decision')decisions.set(event.toolCallId,event.decision);},onApproval:(p:any)=>{pending=p;}} as any);
  await c.initialize({initialPrompt:'SAMECALLS all'});
  f.emit({type:'RunStarted',runId:'r1'});
  for(const n of [1,2,3])f.emit({type:'ToolCallStart',toolCallId:`c${n}`,toolCallName:'mcp__gh__add_label'});
  f.emit({type:'ApprovalRequested',requestId:'q1',azione:azione({toolCallId:'c1',gruppo:group})});
  for(let i=0;i<40&&!pending;i++)await tick(5);
  assert.equal(pending?.requestId,'q1');pending=null;
  await c.resolveApproval('q1','allow-calls' as any);
  f.emit({type:'ApprovalResolved',requestId:'q1',approvato:true,ambito:'risposta'});
  f.emit({type:'ToolCallResult',toolCallId:'c1',content:'LABEL_ADDED all 1'});
  f.emit({type:'ToolCallResult',toolCallId:'c2',content:'LABEL_ADDED all 2'});
  /* c3 carries a forced sign: the kernel asks on its own card */
  f.emit({type:'ApprovalRequested',requestId:'q2',azione:azione({toolCallId:'c3',argomenti:{label:'all 3'},contenutoSospetto:{fonte:'gh'}})});
  for(let i=0;i<40&&!pending;i++)await tick(5);
  assert.equal(pending?.requestId,'q2');
  await c.resolveApproval('q2',answerSecond);
  f.emit({type:'ApprovalResolved',requestId:'q2',approvato:answerSecond==='allow-once'});
  f.emit(answerSecond==='allow-once'?{type:'ToolCallResult',toolCallId:'c3',content:'LABEL_ADDED all 3'}:{type:'ToolCallResult',toolCallId:'c3',content:'Permission denied by the person',isError:true});
  await tick(20);
  return decisions;
}
const why=(decision:any)=>composeToolRow({toolCallId:'x',toolName:'mcp_tool',status:'done',decision} as any,{label:'MCP tool',target:'',result:[],detail:[]},{width:120,expanded:false,now:0}).line;

test('row 126 (a): the rows covered by [7] say «you allowed all 3 calls», the card\'s own row too',async()=>{
  const decisions=await turn('allow-once');
  assert.deepEqual(decisions.get('c1'),{kind:'all',count:3});
  assert.deepEqual(decisions.get('c2'),{kind:'all',count:3});
  assert.match(why(decisions.get('c2')),/ · you allowed all 3 calls · /u);
  assert.deepEqual(decisions.get('c3'),{kind:'once'},'a member asked on its own card keeps that answer');
});

test('row 126 (a), the contrary: a member with a forced sign the person denied is never told «you allowed all»',async()=>{
  const decisions=await turn('deny-once');
  assert.equal(decisions.has('c3'),false,JSON.stringify([...decisions]));
});

test('row 126 (b): a group card with one of the kernel\'s other reasons never offers [7]',()=>{
  for(const extra of [{contenutoSospetto:{fonte:'gh'}},{trifecta:true},{suspiciousContent:{source:'gh'}},{fuoriDalProgetto:{cartella:'x'}}]){
    const action=permissionActionFromApproval({azione:azione({gruppo:group,...extra})});
    assert.equal(action.sameCalls,undefined,JSON.stringify(extra));
    assert.ok(!approvalChoicesFor(action).some(row=>row.digit==='7'),JSON.stringify(extra));
  }
});
