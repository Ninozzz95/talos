import assert from 'node:assert/strict';
import test from 'node:test';
import {compileRules,evaluateRules} from '../../src/security/evaluate.ts';
import {explainPermission,simulatePermission} from '../../src/security/permission-explanation.ts';

test('deny on any shell segment dominates ask and allow',()=>{
  const rules=compileRules({allow:['Bash(git status)'],ask:['Bash(npm test)'],deny:['Bash(rm -rf:*)']});
  const action={tool:'Bash',command:'git status && npm test && rm -rf build'} as const;
  const evaluated=evaluateRules(rules,action,{projectRoot:process.cwd()});
  assert.equal(evaluated.effect,'deny');
  const explanation=explainPermission(rules,action,{projectRoot:process.cwd()});
  assert.equal(explanation.effect,'deny');
  assert.equal(explanation.precedence,'deny > ask > allow');
  assert.deepEqual(explanation.segments.map(segment=>[segment.command,segment.effect,segment.rule]),[
    ['git status','allow','Bash(git status)'],
    ['npm test','ask','Bash(npm test)'],
    ['rm -rf build','deny','Bash(rm -rf:*)']
  ]);
  assert.equal(explanation.decisiveSegment,2);
});

test('ask segment dominates allowed segments and simulation exposes the matched rule',()=>{
  const rules={allow:['Bash(git status)'],ask:['Bash(npm test)'],deny:[]};
  const action={tool:'Bash',command:'git status && npm test'} as const;
  const simulation=simulatePermission({rules,action,projectRoot:process.cwd()});
  assert.equal(simulation.effect,'ask');
  assert.equal(simulation.requiresApproval,true);
  assert.equal(simulation.explanation.decisiveSegment,1);
  assert.equal(simulation.explanation.rule,'Bash(npm test)');
});

test('unsupported composition is a deterministic deny explanation',()=>{
  const rules=compileRules({allow:['Bash(*)'],ask:[],deny:[]});
  const explanation=explainPermission(rules,{tool:'Bash',command:'cat secret > out'},{projectRoot:process.cwd()});
  assert.equal(explanation.effect,'deny');
  assert.equal(explanation.reason,'unsupported shell composition');
  assert.deepEqual(explanation.segments,[]);
});
