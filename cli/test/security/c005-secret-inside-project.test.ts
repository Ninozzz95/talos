/*
 * F-P-001 of the stress-test smoke audit (rc.1, 08/10/2026), reproduced here before the cure. The kernel asks the client before a read or a
 * command that touches a secret file (`azione.segreto`, C-005), and the engine answered ALLOW without asking anyone whenever its built-in
 * defaults allowed the action: a read inside the project ("read-only action inside project") and a read-only shell command inside it
 * ("documented read-only shell command"). So `leggi .env` and `cat .env` in the project were approved in every mode — in `talos -p` the
 * tester saw approval.required followed by approvato:true 1 ms later, and the .env value reached the model. The existing C-005 tests only
 * covered secrets OUTSIDE the project, where the defaults already ask.
 * Rule after the cure: what the kernel marked as a secret or the keychain is never approved by a DEFAULT or by a mode (default allow,
 * acceptEdits, bypassPermissions, the auto classifier); a person answers (interactive) or it is refused with the reason (non-interactive);
 * an allow rule the person wrote and a session grant the person gave still count.
 */
import assert from 'node:assert/strict';import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import type {PermissionAction,PermissionMode} from '../../src/security/types.ts';

const root=process.cwd();
const engine=(allow:string[]=[],classifier?:any)=>createPermissionEngine({projectRoot:root,rules:{allow,ask:[],deny:[]},...(classifier?{classifier}:{})});
const readEnv:PermissionAction={tool:'Read',resource:'.env',sensitive:'secret'};
const catEnv:PermissionAction={tool:'Bash',command:'cat .env',sensitive:'secret'};
const keychain:PermissionAction={tool:'Bash',command:'cat notes.txt',sensitive:'keychain'};

/* 0.6.8 (owner 16/10/2026, «Come il Desktop: non chiede»; the desktop's rule of 12/10 «Full access non chiede mai»): Full access no longer asks for a secret or the keychain */
test('F-P-001: a secret inside the project is never approved by a built-in default, in any mode but Full access',async()=>{
  for(const action of [readEnv,catEnv,keychain])for(const interactive of [true,false])
    assert.equal((await engine().decide(action,{interactive,mode:'bypassPermissions'})).kind,'allow',`Full access ${JSON.stringify(action)}`);
  for(const mode of ['default','acceptEdits','dontAsk','plan'] as PermissionMode[]){
    for(const action of [readEnv,catEnv,keychain]){
      const interactive=await engine().decide(action,{interactive:true,mode});
      const headless=await engine().decide(action,{interactive:false,mode});
      assert.notEqual(interactive.kind,'allow',`${mode} interactive ${JSON.stringify(action)}`);
      assert.equal(headless.kind,'deny',`${mode} headless ${JSON.stringify(action)}`);
    }
  }
  const asked=await engine().decide(readEnv,{interactive:true,mode:'default'});
  assert.equal(asked.kind,'ask','with a person there, the person is asked');
});

test('F-P-001: the auto classifier does not decide for a secret; a person does',async()=>{
  const decision=await engine([],async()=>'allow').decide(catEnv,{interactive:true,mode:'auto'});
  assert.equal(decision.kind,'ask');
});

test('F-P-001: acceptEdits does not auto-allow a filesystem command on a secret',async()=>{
  const decision=await engine().decide({tool:'Bash',command:'cp .env .env.bak',sensitive:'secret'},{interactive:true,mode:'acceptEdits'});
  assert.notEqual(decision.kind,'allow');
});

test('F-P-001: what a person decided still counts — an allow rule written for it, and a session grant',async()=>{
  assert.equal((await engine(['Read(.env)']).decide(readEnv,{interactive:false,mode:'default'})).kind,'allow');
  const e=engine();const first=await e.decide(readEnv,{interactive:true,mode:'default'});
  assert.equal(first.kind,'ask');
  if(first.kind==='ask')await e.resolve(first.requestId,'allow-session');
  assert.equal((await e.decide(readEnv,{interactive:true,mode:'default'})).kind,'allow');
});

test('F-P-001: nothing changes for a plain read or a read-only command inside the project',async()=>{
  assert.equal((await engine().decide({tool:'Read',resource:'README.md'},{interactive:false,mode:'default'})).kind,'allow');
  assert.equal((await engine().decide({tool:'Bash',command:'cat README.md'},{interactive:false,mode:'default'})).kind,'allow');
});
