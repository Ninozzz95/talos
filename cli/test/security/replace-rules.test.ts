/*
 * Stage 7.21 (owner 03/10: a rule changed in /permissions is obeyed at once, as Claude Code's and Codex's /permissions): the
 * engine takes the rules read again from the settings, in place — the session's rule set the approval dialog explains from
 * follows — and an unreadable entry throws by name, leaving the rules in force as they were.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import type {RuleSetInput} from '../../src/security/types.ts';

const ROOT=process.platform==='win32'?'C:\\work\\shop':'/work/shop';
const ctx={interactive:true,mode:'default' as const};

test('a rule added, changed or removed is obeyed by the next request',async()=>{
  const rules:RuleSetInput={allow:[],ask:[],deny:[]};
  const engine=createPermissionEngine({projectRoot:ROOT,rules});
  assert.equal((await engine.decide({tool:'Bash',command:'npm test'},ctx)).kind,'ask');
  engine.replaceRules({allow:['Bash(npm test:*)'],ask:[],deny:[]});
  assert.equal((await engine.decide({tool:'Bash',command:'npm test'},ctx)).kind,'allow');
  assert.deepEqual(rules.allow,['Bash(npm test:*)'],'the session\'s rule set follows, in place');
  engine.replaceRules({allow:[],ask:[],deny:['Bash(npm test:*)']});
  assert.equal((await engine.decide({tool:'Bash',command:'npm test'},ctx)).kind,'deny');
  engine.replaceRules({allow:[],ask:[],deny:[]});
  assert.equal((await engine.decide({tool:'Bash',command:'npm test'},ctx)).kind,'ask');
});

test('an unreadable entry throws by name and the rules in force stay',async()=>{
  const engine=createPermissionEngine({projectRoot:ROOT,rules:{allow:['Bash(npm test:*)'],ask:[],deny:[]}});
  assert.throws(()=>engine.replaceRules({allow:['Bash(npm test:*)','Bash('],ask:[],deny:[]}),(error:any)=>typeof error.code==='string'&&error.code.length>0);
  assert.equal((await engine.decide({tool:'Bash',command:'npm test'},ctx)).kind,'allow');
});
