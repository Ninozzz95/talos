/*
 * 0.6.8 (stress test of 0.6.7, F-P-001, S0, reproduced on the published 0.6.7): `talos -p --protocol v2` decided an approval from
 * the TRANSLATED v2 event, where the kernel's `azione.segreto` is renamed `action.sensitive`. The secret class was lost, the read
 * rule allowed it, and a planted `.env` reached the provider in default, dontAsk and bypass; v1 refused it. The headless runner now
 * decides from the kernel's own event, and the mapping reads both spellings. Each row: the kernel asks to read `.env` inside the
 * project with its secret class; nobody is in front, so the answer must be NO — in every mode, on both protocols.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {collectHeadlessRun} from '../../src/headless/run.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';

function runtime(events:any[]){
  const answered:any[]=[];let sink:((e:any)=>void)|null=null;
  return{answered,r:{start:async()=>'s',subscribe(_id:string,next:(e:any)=>void){sink=next;queueMicrotask(()=>events.forEach(next));return()=>{};},
    answerApproval:async(...x:any[])=>{answered.push(x);queueMicrotask(()=>sink?.({type:'RunFinished'}));},cancel:async()=>{},restore:async()=>({restored:0,total:0}),
    resume:async(x:string)=>x,fork:async()=>'',export:()=>null,close:async()=>{}} as any};
}
const secretRead=(classe:string)=>({type:'ApprovalRequested',requestId:'r1',azione:{tipo:'leggi',percorso:'.env',segreto:{classe,percorso:'.env',frase:'a secret file'}}});

for(const protocolVersion of ['v1','v2'] as const){
  for(const permissionMode of ['default','dontAsk','acceptEdits','bypassPermissions'] as const){
    for(const classe of ['segreto','portachiavi']){
      /* 0.6.8 (owner 16/10/2026, «Come il Desktop: non chiede»): Full access reads it; every other mode refuses it with nobody in front */
      const expected=permissionMode==='bypassPermissions';
      test(`${protocolVersion} · ${permissionMode}: a ${classe} read is ${expected?'allowed in Full access':'never approved with nobody in front'}`,async()=>{
        const f=runtime([secretRead(classe)]);
        await collectHeadlessRun(f.r,{projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode,protocolVersion,permissionRules:{allow:[],ask:[],deny:[]}} as any,()=>{});
        assert.equal(f.answered.length,1,'the approval was answered');
        assert.equal(f.answered[0][2],expected,`the ${classe} read in ${permissionMode} on ${protocolVersion}`);
      });
    }
  }
}

test('the mapping reads the secret class in either spelling, the kernel\'s or the v2 translation\'s',()=>{
  assert.equal(permissionActionFromApproval({azione:{tipo:'leggi',percorso:'.env',segreto:{classe:'segreto'}}}).sensitive,'secret');
  assert.equal(permissionActionFromApproval({action:{tool:'leggi',path:'.env',sensitive:{class:'secret'}}}).sensitive,'secret');
  assert.equal(permissionActionFromApproval({action:{tool:'leggi',path:'.env',sensitive:{class:'keychain'}}}).sensitive,'keychain');
  assert.equal(permissionActionFromApproval({action:{tool:'leggi',path:'.env',sensitive:{}}}).sensitive,'secret','an unknown class is the strictest');
});
