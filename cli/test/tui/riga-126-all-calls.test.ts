/*
 * Row 126 of the owner's register, road A (owner 13/11/2026 04:35; judge v1759, approved for the CLI in v2605): one card for the calls of
 * the SAME outside tool in the SAME model answer. The kernel already groups them (talosHarness.mjs `gruppiDelleChiamateDiFuori`) and puts
 * the list on the first card (`gruppo: {totale, chiamate:[{toolCallId, argomenti}], nonMostrate?}`, `gruppoPerLaCarta`); the registry
 * takes «for all» as `{ambito:'risposta'}` from the person, on a card whose `gruppo.totale` is two or more (session-registry.mjs:17129).
 * The CLI drew one card per call and never sent that scope. Here:
 *   - the group card offers «[7] Allow all the same calls of this answer» and LISTS every call with its arguments (judge v1759 a);
 *   - [7] sends `{ambito:'risposta'}` and the engine keeps nothing (an allow once);
 *   - the contrary: no group (or a group of one) → no row; a plain yes covers its call only; «only once» and a call written as text
 *     never offer it; a caller can never pass the scope with a plain yes.
 * That the other members ask no more, and that a member with a forced sign still asks, is the kernel's (its own tests,
 * harness-ui/tests/carte-compiti-lunghi-a-b*.test.mjs); the pty scenario s95 shows the first on the real kernel.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createApprovalCoordinator} from '../../src/tui/approval.ts';
import {approvalChoicesFor,approvalClickChoice,approvalDefaultSelected,approvalDialogModel,approvalDialogViewport,approvalKeyOutcome} from '../../src/tui/overlays/approval-dialog.ts';

const group=(n:number,extra:Record<string,unknown>={})=>({totale:n,chiamate:Array.from({length:Math.min(n,20)},(_,i)=>({toolCallId:`c${i+1}`,argomenti:{label:`bug ${i+1}`}})),...extra});
const card=(azione:Record<string,unknown>)=>({azione:{tipo:'mcp_tool',server:'gh',attrezzo:'add_label',argomenti:{label:'bug 1'},...azione}});
const GROUP=card({gruppo:group(3)});
const ROW='[7] Allow all the same calls of this answer';
function texts(lines:any[]){return lines.flatMap(line=>line.kind==='row'?[line.gutter,...line.commandLines,...line.deciderLines]:[line.text]);}
const view=(raw:{azione:Record<string,unknown>},columns:number,rows:number,expanded=false)=>{
  const pending={requestId:'q1',sessionId:'s1',action:permissionActionFromApproval(raw),rawPayload:raw.azione,reason:'asks'} as any;
  return texts(approvalDialogViewport(approvalDialogModel(pending,{expanded}),{columns,rows,scrollOffset:0}).lines).join('\n');
};
function fakeEngine(){
  const resolved:string[]=[];
  return{resolved,engine:{decide:async(action:any)=>({kind:'ask',requestId:'e1',action,reason:'asks'}),resolve:async(_id:string,choice:string)=>{resolved.push(choice);}} as any};
}

test('row 126: a group card of 3 offers [7] after the five, Deny stays highlighted; a click and Enter answer it',()=>{
  const action=permissionActionFromApproval(GROUP);
  const choices=approvalChoicesFor(action);
  assert.deepEqual(choices.map(row=>row.digit),['1','2','3','4','6','7']);
  assert.equal(choices[approvalDefaultSelected(choices)]?.action,'approval-deny-once');
  assert.equal(approvalClickChoice('aopt:5',choices),'allow-calls');
  assert.deepEqual(approvalKeyOutcome('approval-confirm',{expanded:false,selected:5,escape:false,choices}),{kind:'answer',choice:'allow-calls',stop:false});
});

for(const [columns,rows] of [[80,24],[120,40]] as const){
  test(`row 126 · ${columns}×${rows}: the card lists the 3 calls with their arguments and shows [7] and Deny`,()=>{
    const text=view(GROUP,columns,rows);
    assert.match(text,/The 3 calls this answer covers/u,text);
    for(const n of [1,2,3]){assert.match(text,new RegExp(`Call ${n} of 3`,'u'),text);assert.match(text,new RegExp(`label: bug ${n}(?!\\d)`,'u'),text);}
    assert.ok(text.includes(ROW),text);
    assert.ok(text.includes('[4] Deny'),text);
  });
}

test('row 126: calls the kernel did not list are said, so the person knows [7] covers them too',()=>{
  /* on the card as it opens, not only in the full review: the person answers from here */
  const text=view(card({gruppo:group(25,{nonMostrate:5})}),120,40);
  assert.match(text,/And 5 more calls, not listed here: your answer covers them too\./u,text);
});

test('row 126: [7] sends {ambito:"risposta"} with a yes, and the engine keeps nothing',async()=>{
  const f=fakeEngine();const answers:unknown[][]=[];
  const c=createApprovalCoordinator({engine:f.engine,answer:async(...args:any[])=>{answers.push(args);},interactive:true,mode:'default'});
  await c.request('s1','q1',permissionActionFromApproval(GROUP));
  await c.resolve('q1','allow-calls' as any);
  assert.deepEqual(answers,[['s1','q1',true,{ambito:'risposta'}]]);
  assert.deepEqual(f.resolved,['allow-once']);
});

test('row 126, the contrary: a plain yes covers its call only; the scope never leaves with a plain yes, nor [7] without a group',async()=>{
  for(const [raw,choice,extra] of [[GROUP,'allow-once',undefined],[GROUP,'allow-session',undefined],[GROUP,'allow-once',{ambito:'risposta'}],[card({}),'allow-calls',undefined]] as const){
    const f=fakeEngine();const answers:unknown[][]=[];
    const c=createApprovalCoordinator({engine:f.engine,answer:async(...args:any[])=>{answers.push(args);},interactive:true,mode:'default'});
    await c.request('s1','q1',permissionActionFromApproval(raw));
    try{await c.resolve('q1',choice as any,extra as any);}catch{/* a refused scope is fine: nothing went out with it */}
    assert.ok(answers.every(args=>!JSON.stringify(args).includes('risposta')),`${choice} ${JSON.stringify(extra)}: ${JSON.stringify(answers)}`);
  }
});

test('row 126, the contrary: no [7] and no list on a card without a group, a group of one, «only once», a call written as text, a command',()=>{
  for(const raw of [card({}),card({gruppo:group(1)}),card({gruppo:{totale:'3',chiamate:[]}}),card({gruppo:group(3),soloUnaVolta:true}),
    card({gruppo:group(3),semprePersona:true}),{azione:{tipo:'shell',comando:'npm test',gruppo:group(3)}}]){
    const action=permissionActionFromApproval(raw);
    assert.ok(!approvalChoicesFor(action).some(row=>row.digit==='7'),JSON.stringify(raw));
    const text=view(raw,120,40);
    assert.ok(!text.includes('calls this answer covers'),`${JSON.stringify(raw)}\n${text}`);
  }
});
