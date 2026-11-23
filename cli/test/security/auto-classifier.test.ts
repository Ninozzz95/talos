import assert from 'node:assert/strict';import test from 'node:test';import {createLocalAutoClassifier} from '../../src/security/auto-classifier.ts';import {createPermissionEngine} from '../../src/security/permission-engine.ts';
const verified=async()=>({verified:true});
const unverified=async()=>({verified:false,reason:'PROCESS_TREE_PROBE_EXECUTOR_EXITED: exit status 203'});
test('local auto classifier allows project edits and read-only test/status commands',async()=>{const c=createLocalAutoClassifier({shellIsolation:verified});assert.equal(await c({projectRoot:'/p',action:{tool:'Edit',resource:'src/a.ts'}}),'allow');assert.equal(await c({projectRoot:'/p',action:{tool:'Bash',command:'git status'}}),'allow');assert.equal(await c({projectRoot:'/p',action:{tool:'Bash',command:'npm test'}}),'allow');});
test('local auto classifier asks for network and destructive shell',async()=>{const c=createLocalAutoClassifier({shellIsolation:verified});assert.equal(await c({projectRoot:'/p',action:{tool:'WebFetch',resource:'https://example.com'}}),'ask');assert.equal(await c({projectRoot:'/p',action:{tool:'Bash',command:'rm -rf build'}}),'ask');});
/*
 * R0 lane S, S5 — owner decision 2 (2026-09-23): TALOS `auto` on a host whose shell isolation is not verified asks
 * the person for EVERY command; the classifier never auto-allows one. Gate §0.3 D1: Codex prompts ("if … we have no
 * sandbox protection, we should never allow it to run without approval", core/src/exec_policy.rs, 2026-09-01).
 * Edits keep the mode's semantics (amendment 3, Claude Code rule D2): only Bash changes.
 */
test('S5 — with shell isolation unverified, no SAFE_EXACT shell command is auto-allowed, edits are unchanged',async()=>{
  const c=createLocalAutoClassifier({shellIsolation:unverified});
  for(const command of ['npm test','npm run test','npm run lint','npm run typecheck','npx tsc --noEmit','git status','git diff','git log','rg foo','grep -r foo .','ls','dir'])assert.equal(await c({projectRoot:'/p',action:{tool:'Bash',command}}),'ask',command);
  assert.equal(await c({projectRoot:'/p',action:{tool:'Edit',resource:'src/a.ts'}}),'allow');
  assert.equal(await c({projectRoot:'/p',action:{tool:'Read',resource:'src/a.ts'}}),'allow');
});
test('S5 — the classifier asks when nobody told it the isolation state, and when the isolation source fails',async()=>{
  assert.equal(await createLocalAutoClassifier()({projectRoot:'/p',action:{tool:'Bash',command:'npm test'}}),'ask','no source is not a verified sandbox');
  assert.equal(await createLocalAutoClassifier({shellIsolation:async()=>{throw new Error('probe crashed');}})({projectRoot:'/p',action:{tool:'Bash',command:'npm test'}}),'ask','a failing source is not a verified sandbox');
  assert.equal(await createLocalAutoClassifier({shellIsolation:(async()=>true) as any})({projectRoot:'/p',action:{tool:'Bash',command:'npm test'}}),'ask','only {verified:true} counts, not a truthy value');
});
test('S5 — auto mode through the permission engine asks for npm test on an unsandboxed host and allows it on a verified one',async()=>{
  const rules={allow:[],ask:[],deny:[]};
  const unsandboxed=createPermissionEngine({projectRoot:'/p',rules,mode:'auto',classifier:createLocalAutoClassifier({shellIsolation:unverified})});
  const decision=await unsandboxed.decide({tool:'Bash',command:'npm test'},{interactive:true,mode:'auto'});
  assert.equal(decision.kind,'ask');
  assert.equal((await unsandboxed.decide({tool:'Bash',command:'npm test'},{interactive:false,mode:'auto'})).kind,'deny','headless with nobody to answer: denied (gate §0.2 rule 6)');
  const sandboxed=createPermissionEngine({projectRoot:'/p',rules,mode:'auto',classifier:createLocalAutoClassifier({shellIsolation:verified})});
  assert.equal((await sandboxed.decide({tool:'Bash',command:'npm test'},{interactive:true,mode:'auto'})).kind,'allow');
});
