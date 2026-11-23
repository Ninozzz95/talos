import assert from 'node:assert/strict';
import test from 'node:test';
import {simulatePermission} from '../../src/security/permission-explanation.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';

const rules={allow:['Bash(git:*)'],ask:[],deny:['Bash(git push)']};
const action={tool:'Bash' as const,command:'git push'};

test('dry-run keeps explicit deny dominant over a broader allow',()=>{
  const result=simulatePermission({rules,action,projectRoot:process.cwd()});
  assert.equal(result.effect,'deny');
  assert.equal(result.requiresApproval,false);
  assert.equal(result.explanation.rule,'Bash(git push)');
  assert.equal(result.explanation.precedence,'deny > ask > allow');
});

test('permissive and auto modes cannot bypass the same immutable deny',async()=>{
  let classifierCalls=0;
  const engine=createPermissionEngine({projectRoot:process.cwd(),rules,classifier:async()=>{classifierCalls++;return'allow';}});
  for(const mode of ['bypassPermissions','acceptEdits','auto'] as const){
    const decision=await engine.decide(action,{interactive:true,mode});
    assert.equal(decision.kind,'deny',mode);
  }
  assert.equal(classifierCalls,0,'an explicit deny is decided before any automatic classifier');
});
