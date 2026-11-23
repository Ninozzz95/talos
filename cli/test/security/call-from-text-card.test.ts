/* R-34 part 2 (owner 30/10, yes of Desktop, CLI and Mobile) and decision 121 (03/11): a local model's call written as text reaches
   the CLI as `tipo:'chiamata-dal-testo'` with `semprePersona: true` — a host never answers it by itself. Found on 03/11 reading the
   CLI: the engine answered it in Full access (no person asked), and «for this session» or «always» on one such card covered every
   tool the model wrote as text, since the action carried no tool name. Now only the person answers it, once each time, and the
   card names the tool. Hermes tools/approval.py:2721-2724 and :4028-4033 (an owner override of a Smart DENY offers only
   one-operation approval or denial); Claude Code docs, permissions: a tool set to `ask` «prompts on every call, even in `auto`
   and `bypassPermissions` modes». */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {createApprovalCoordinator} from '../../src/tui/approval.ts';
import {approvalChoicesFor} from '../../src/tui/overlays/approval-dialog.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';

const ROOT=process.platform==='win32'?'C:\\project':'/project';
const card=(nome='scrivi')=>({azione:{tipo:'chiamata-dal-testo',toolCallId:'c1',nome,argomenti:{percorso:'a.txt'},semprePersona:true}});
const action=(nome?:string)=>permissionActionFromApproval(card(nome) as any);
const engine=(rules:any={allow:[],ask:[],deny:[]})=>createPermissionEngine({projectRoot:ROOT,rules,mode:'default'} as any);

test('the card names the tool the model wrote as text',()=>{
  const a=action('scrivi') as any;
  assert.equal(a.personOnly,true);
  assert.match(String(a.detail),/scrivi/u);
  assert.equal((permissionActionFromApproval({action:{tool:'chiamata-dal-testo',name:'comando',alwaysPerson:true}} as any) as any).personOnly,true,'the v2 names too');
  assert.equal((permissionActionFromApproval({azione:{tipo:'scrivi',percorso:'a.txt'}} as any) as any).personOnly,undefined,'a native call is unchanged');
});

test('no rule, mode or grant answers it; a deny rule still refuses; with nobody to ask it is refused',async()=>{
  const allowed=engine({allow:['TalosService(:chiamata-dal-testo)','TalosService(:*)'],ask:[],deny:[]});
  for(const mode of ['default','acceptEdits','bypassPermissions'])assert.equal((await allowed.decide(action(),{interactive:true,mode} as any)).kind,'ask',mode);
  assert.equal((await engine({allow:[],ask:[],deny:['TalosService(:chiamata-dal-testo)']}).decide(action(),{interactive:true,mode:'default'} as any)).kind,'deny');
  const nobody=await allowed.decide(action(),{interactive:false,mode:'bypassPermissions'} as any) as any;
  assert.equal(nobody.kind,'deny');assert.equal(nobody.code,'NEEDS_PERSON');
});

test('a yes covers that call only: no grant for the session, none for another tool',async()=>{
  const e=engine();
  const first:any=await e.decide(action('scrivi'),{interactive:true,mode:'default'} as any);
  await e.resolve(first.requestId,'allow-session');
  assert.equal((await e.decide(action('scrivi'),{interactive:true,mode:'default'} as any)).kind,'ask','the same tool is asked again');
  assert.equal((await e.decide(action('comando'),{interactive:true,mode:'default'} as any)).kind,'ask','another tool is asked');
  /* an «always» arriving from any answer path writes no rule: the next such call is the person's again */
  const written:string[]=[];
  const kept=createPermissionEngine({projectRoot:ROOT,rules:{allow:[],ask:[],deny:[]},mode:'default',persistRule:async(effect:string)=>{written.push(effect);}} as any);
  const asked:any=await kept.decide(action('scrivi'),{interactive:true,mode:'default'} as any);
  await kept.resolve(asked.requestId,'allow-always');
  assert.deepEqual(written,[],'no rule is written');
  assert.equal((await kept.decide(action('scrivi'),{interactive:true,mode:'default'} as any)).kind,'ask');
});

test('the card offers Allow once and Deny, no «session» or «always»',()=>{
  assert.deepEqual(approvalChoicesFor(action()).map(row=>row.action),['approval-once','approval-deny-once']);
});

test('the person\'s yes reaches the kernel as a plain yes',async()=>{
  const answers:any[]=[];
  const coordinator=createApprovalCoordinator({engine:engine(),interactive:true,mode:'bypassPermissions',answer:async(...args:any[])=>{answers.push(args);}} as any);
  const asked:any=await coordinator.request('s','r1',action());
  assert.equal(asked?.pending,true,'Full access asks the person');
  await coordinator.resolve('r1','allow-once');
  assert.deepEqual(answers[0],['s','r1',true]);
});

test('v2 names the mark and the tool in English',()=>{
  const out:any=createV2EventBridge('s',()=>'2026-11-03T21:40:00.000Z').translate({type:'ApprovalRequested',_sequenza:1,requestId:'r',azione:card().azione} as any)?.data;
  const a=JSON.stringify(out);
  assert.match(a,/"alwaysPerson":true/u);assert.match(a,/"name":"scrivi"/u);
  assert.doesNotMatch(a,/semprePersona|"nome"/u);
});
