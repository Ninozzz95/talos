import assert from 'node:assert/strict';
import test from 'node:test';
import {compileRules, evaluateRules} from '../../src/security/evaluate.ts';

test('bash rule does not use unsafe prefix matching', () => {
  const rules = compileRules({allow:['Bash(npm test:*)'], ask:[], deny:[]});
  assert.equal(evaluateRules(rules,{tool:'Bash',command:'npm test -- --run'},{projectRoot:process.cwd()}).effect,'allow');
  assert.equal(evaluateRules(rules,{tool:'Bash',command:'npm test-malicious'},{projectRoot:process.cwd()}).effect,'ask');
});

test('deny wins over ask and allow', () => {
  const rules = compileRules({allow:['Bash(*)'], ask:['Bash(rm:*)'], deny:['Bash(rm -rf:*)']});
  assert.equal(evaluateRules(rules,{tool:'Bash',command:'rm -rf C:\\'},{projectRoot:process.cwd()}).effect,'deny');
});

test('parent traversal never matches project Read allow', () => {
  const rules = compileRules({allow:['Read(./**)'], ask:[], deny:[]});
  assert.notEqual(evaluateRules(rules,{tool:'Read',resource:'../secret.txt'},{projectRoot:process.cwd()}).effect,'allow');
});

test('read inside project is allowed by default', () => {
  const rules = compileRules({allow:[],ask:[],deny:[]});
  assert.equal(evaluateRules(rules,{tool:'Read',resource:'src/a.ts'},{projectRoot:process.cwd()}).effect,'allow');
});

test('documented read-only shell commands are allowed by default but explicit ask still wins',()=>{
  const open=compileRules({allow:[],ask:[],deny:[]});
  assert.equal(evaluateRules(open,{tool:'Bash',command:'git status'},{projectRoot:process.cwd()}).effect,'allow');
  assert.equal(evaluateRules(open,{tool:'Bash',command:'git diff -- src/a.ts'},{projectRoot:process.cwd()}).effect,'allow');
  assert.equal(evaluateRules(open,{tool:'Bash',command:'ls -la'},{projectRoot:process.cwd()}).effect,'allow');
  assert.equal(evaluateRules(open,{tool:'Bash',command:'rm -rf build'},{projectRoot:process.cwd()}).effect,'ask');
  const guarded=compileRules({allow:[],ask:['Bash(git status)'],deny:[]});
  assert.equal(evaluateRules(guarded,{tool:'Bash',command:'git status'},{projectRoot:process.cwd()}).effect,'ask');
});

test('permission engine ask decision preserves matched rule and reason',async()=>{
  const {createPermissionEngine}=await import('../../src/security/permission-engine.ts');
  const engine=createPermissionEngine({projectRoot:'/p',rules:{allow:[],ask:['Bash(npm test)'],deny:[]},mode:'default'});
  const d=await engine.decide({tool:'Bash',command:'npm test'},{interactive:true,mode:'default'});
  assert.equal(d.kind,'ask');
  if(d.kind==='ask'){assert.equal(d.rule,'Bash(npm test)');assert.equal(d.reason,'matched ask rule');}
});
