import assert from 'node:assert/strict';import test from 'node:test';import {automaticApproval,createApprovalCoordinator} from '../../src/tui/approval.ts';
test('automatic allow resolves TALOS approval immediately',async()=>{const answers:any[]=[];const c=createApprovalCoordinator({engine:{decide:async()=>({kind:'allow',source:'rule'}),resolve:async()=>{}},answer:async(...x:any[])=>answers.push(x),interactive:true,mode:'default'} as any);const r=await c.request('s','talos-r',{tool:'Bash',command:'npm test'});assert.equal(r.pending,false);assert.deepEqual(answers,[['s','talos-r',true,{motivo:'regola'}]]);});
test('interactive ask correlates TALOS and engine ids and choice',async()=>{const answers:any[]=[];const resolved:any[]=[];const c=createApprovalCoordinator({engine:{decide:async()=>({kind:'ask',requestId:'engine-r',action:{tool:'Bash'}}),resolve:async(...x:any[])=>resolved.push(x)},answer:async(...x:any[])=>answers.push(x),interactive:true,mode:'default'} as any);const r=await c.request('s','talos-r',{tool:'Bash',command:'npm test'});assert.equal(r.pending,true);await c.resolve('talos-r','allow-session');assert.deepEqual(resolved,[['engine-r','allow-session']]);assert.deepEqual(answers,[['s','talos-r',true]]);});

test('interactive ask returns source reason and rule metadata',async()=>{
  const c=createApprovalCoordinator({engine:{decide:async()=>({kind:'ask',requestId:'engine-r',action:{tool:'Bash',command:'npm test'},reason:'matched ask rule',rule:'Bash(npm test)'}),resolve:async()=>{}},answer:async()=>{},interactive:true,mode:'default'} as any);
  assert.deepEqual(await c.request('s','talos-r',{tool:'Bash',command:'npm test'}),{pending:true,allowed:false,action:{tool:'Bash',command:'npm test'},reason:'matched ask rule',rule:'Bash(npm test)'});
});

/* the notifications' contract: a yes nobody gave by hand says who gave it; on a no the field would reach the model as its reason */
test('an automatic yes says who gave it, a yes from the person and any no say nothing',async()=>{
  for(const [source,motivo] of [['rule','regola'],['Bash(npm test)','regola'],['session','regola'],['acceptEdits','modalita'],['bypassPermissions','modalita'],['auto','classificatore']] as const){
    assert.deepEqual(automaticApproval(source),{motivo});
    const answers:any[]=[];
    const c=createApprovalCoordinator({engine:{decide:async()=>({kind:'allow',source}),resolve:async()=>{}},answer:async(...x:any[])=>{answers.push(x);},interactive:true,mode:'default'} as any);
    await c.request('s','r',{tool:'Bash',command:'ls'});
    assert.deepEqual(answers,[['s','r',true,{motivo}]],source);
  }
  const answers:any[]=[];
  const refused=createApprovalCoordinator({engine:{decide:async()=>({kind:'deny',code:'X',message:'no'}),resolve:async()=>{}},answer:async(...x:any[])=>{answers.push(x);},interactive:true,mode:'default'} as any);
  await refused.request('s','r',{tool:'Bash',command:'ls'});
  const person=createApprovalCoordinator({engine:{decide:async()=>({kind:'ask',requestId:'e',action:{tool:'Bash'}}),resolve:async()=>{}},answer:async(...x:any[])=>{answers.push(x);},interactive:true,mode:'default'} as any);
  await person.request('s','p',{tool:'Bash',command:'ls'});await person.resolve('p','allow-once' as any);
  assert.deepEqual(answers,[['s','r',false],['s','p',true]]);
});
