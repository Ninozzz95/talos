/*
 * Reviewer of A5h (19/11/2026): a RESUMED session. The fake runtime replays the history synchronously inside `subscribe`, as the
 * kernel does: the root's run is still open, the root has one marked card waiting, the child has one marked card waiting. After the
 * resume the child's card must arrive through the descendants' watch (with its origin) and the root's through the replay (without).
 * Only fake events, nothing runs. Prints `REV-A5H-RIPRESA {...}`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';
import {approvalChoicesFor} from '../../src/tui/overlays/approval-dialog.ts';

const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
function fakeRuntime(){
  const sinks=new Map<string,Set<(event:any)=>void>>();
  const history=new Map<string,any[]>([
    ['main',[{type:'RunStarted',runId:'r1'},{type:'ApprovalRequested',requestId:'qr',azione:{tipo:'shell',comando:'npm test',sempreNonBasta:true}}]],
    ['child',[{type:'RunStarted',runId:'rc'},{type:'ApprovalRequested',requestId:'qc',azione:{tipo:'shell',comando:'npm test',sempreNonBasta:true}}]],
  ]);
  const rows=[{sessionId:'main',parentId:null,depth:0,outcome:'running'},{sessionId:'child',parentId:'main',depth:1,delegatedTask:'run the tests',outcome:'running'}];
  const r:any={
    restore:async()=>({restored:1,total:1}),listSessions:async()=>rows,export:()=>({eventi:[]}),
    subscribe(id:string,sink:(event:any)=>void){const set=sinks.get(id)??new Set();set.add(sink);sinks.set(id,set);for(const e of history.get(id)??[])sink(e);return()=>set.delete(sink);},
    answerApproval:async()=>{},cancel:async()=>{},close:async()=>{},
  };
  return{r};
}
const out:Record<string,unknown>={};
for(const mode of ['acceptEdits','default','bypassPermissions']){
  test(`resume in ${mode}`,async()=>{
    const f=fakeRuntime();const seen:any[]=[];
    const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode,rules:{allow:[],ask:['Bash(*)'],deny:[]},onEvent:()=>{},onApproval:(p:any)=>{if(p)seen.push(p);}} as any);
    await c.initialize({resume:'main'});
    for(let i=0;i<60&&seen.length<2;i++)await tick(25);
    out[mode]=seen.map(p=>`${p.sessionId}${p.origin?'(origin)':''}:${approvalChoicesFor(p.action).map((x:any)=>x.digit).join('')}`);
    c.close();
    /* A5h cure round 1 (the author, from the reviewer's measure): after a resume the child's card comes with its origin and, in
       acceptEdits and Full access, its three choices; the root's keeps two; in default both keep two */
    const child=mode==='default'?'child(origin):12':'child(origin):123';
    assert.deepEqual([...(out[mode] as string[])].sort(),[child,'main:12'].sort(),mode);
  });
}
test('REPORT',()=>{console.log('REV-A5H-RIPRESA '+JSON.stringify(out));});
