/*
 * Row 224, T1 and the waiting card (from the correctness reviewer of 23/11/2026, its E5). The real permission engine, no kernel, no network.
 *   An «always» that cannot be written as a rule falls back to a yes for this session: answered after a switch to B, it still lands in A,
 *   the conversation that asked. Kills the mutant «the fallback yes goes to the open conversation».
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';

const RULES={allow:[],ask:[],deny:[]};
const ctx=(sessionId:string)=>({interactive:true,mode:'default' as const,sessionId});

test('an «always» that falls back to a yes for this session, answered after a switch: it lands in A, B asks',async()=>{
  const open={id:'A' as string|null};const persisted:unknown[]=[];
  const e=createPermissionEngine({projectRoot:process.cwd(),rules:RULES,mode:'default',conversation:()=>open.id,
    persistRule:async(effect:string,action:unknown)=>{persisted.push([effect,action]);}} as any);
  /* a command with a line break: the rule writer refuses it (parseRule), so the engine keeps a yes for this session */
  const odd=permissionActionFromApproval({tipo:'shell',comando:'npm run lint\nnpm run lint'});
  const d=await e.decide(odd,ctx('A'));
  assert.equal(d.kind,'ask','the command asks');
  open.id='B';await e.resolve((d as any).requestId,'allow-always');
  assert.equal(persisted.length,0,'no rule is written for a command with a line break');
  assert.equal((await e.decide(odd,ctx('B'))).kind,'ask','in B the fallback yes does not count');
  open.id='A';assert.deepEqual(await e.decide(odd,ctx('A')),{kind:'allow',source:'session'},'back in A it counts');
});
