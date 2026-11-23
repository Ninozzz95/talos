/* Security (owner 01/10: block, now): a write whose REAL path leaves the project is denied, as an absolute path or `../`
   already is. Before, the check was lexical: `link/x.txt`, with `link` a junction (Windows) or symlink to a folder outside,
   came out "ask, no rule matched" — inside — so accept-edits or an allow rule on the project wrote outside without asking.
   Claude Code checks both the requested and the resolved path (permissions › Symlinks); the desktop kernel judges the real
   path too (F4-03); CWE-59. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compileRules,evaluateRules} from '../../src/security/evaluate.ts';

const NO_RULES={deny:[],ask:[],allow:[]} as any;
function stage(){
  const base=mkdtempSync(join(tmpdir(),'talos-write-link-'));
  const project=join(base,'project'),outside=join(base,'outside'),real=join(base,'real-project');
  mkdirSync(project);mkdirSync(outside);mkdirSync(real);mkdirSync(join(real,'src'));
  const kind=process.platform==='win32'?'junction':'dir';
  symlinkSync(outside,join(project,'link'),kind);
  symlinkSync(real,join(base,'project-through-link'),kind);
  return{base,project,outside,linkedProject:join(base,'project-through-link'),dispose:()=>rmSync(base,{recursive:true,force:true})};
}

test('a write through a link inside the project that leads outside is denied, like an absolute path outside',()=>{
  const s=stage();
  try{
    for(const tool of ['Write','Edit'])for(const resource of ['link/x.txt','link/new/deeper/x.txt',join(s.project,'link','x.txt')]){
      const decision=evaluateRules(NO_RULES,{tool,resource} as any,{projectRoot:s.project});
      assert.equal(decision.effect,'deny',`${tool} ${resource}: ${JSON.stringify(decision)}`);
      assert.match(decision.reason??'',/outside the authorized project/u);
    }
  }finally{s.dispose();}
});

test('an allow rule on the project does not let a write through a link out',()=>{
  const s=stage();
  try{
    const rules=compileRules({allow:['Write(./**)','Edit(./**)'],ask:[],deny:[]});
    const inside=evaluateRules(rules,{tool:'Write',resource:'src/x.txt'} as any,{projectRoot:s.project});
    assert.equal(inside.effect,'allow','the rule does allow a write that stays inside');
    const decision=evaluateRules(rules,{tool:'Write',resource:'link/x.txt'} as any,{projectRoot:s.project});
    assert.equal(decision.effect,'deny',JSON.stringify(decision));
  }finally{s.dispose();}
});

test('a write path that cannot be resolved (a loop of links) is treated as outside and denied',()=>{
  const s=stage();
  try{
    const kind=process.platform==='win32'?'junction':'dir';
    symlinkSync(join(s.base,'loop-b'),join(s.project,'loop-a'),kind);
    symlinkSync(join(s.project,'loop-a'),join(s.base,'loop-b'),kind);
    const decision=evaluateRules(NO_RULES,{tool:'Write',resource:'loop-a/x.txt'} as any,{projectRoot:s.project});
    assert.equal(decision.effect,'deny',JSON.stringify(decision));
  }finally{s.dispose();}
});

test('writes that stay inside are judged as before, also when the project itself is opened through a link',()=>{
  const s=stage();
  try{
    for(const [root,resource] of [[s.project,'src/x.txt'],[s.project,'new/x.txt'],[s.linkedProject,'src/x.txt'],[s.linkedProject,join(s.linkedProject,'src','y.txt')]] as const){
      const decision=evaluateRules(NO_RULES,{tool:'Write',resource} as any,{projectRoot:root});
      assert.notEqual(decision.effect,'deny',`${resource} under ${root}: ${JSON.stringify(decision)}`);
    }
  }finally{s.dispose();}
});
