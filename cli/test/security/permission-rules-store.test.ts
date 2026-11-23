/*
 * Stage 7.21 (mockup permissions «Rules»; owner 03/10: a new rule goes where the person chose; a change goes to every file
 * that lists the rule): the permission rules as /permissions lists and changes them, on the real settings files.
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {ensureCliPaths,projectId,resolveCliPaths} from '../../src/paths.ts';
import {addRule,changeRule,checkedRule,readRuleRows} from '../../src/security/permission-rules-store.ts';

async function where(){
  const r=await mkdtemp(join(tmpdir(),'talos-rules-'));
  const paths=resolveCliPaths({XDG_CONFIG_HOME:join(r,'cfg'),XDG_STATE_HOME:join(r,'state'),XDG_CACHE_HOME:join(r,'cache')},'linux',r);
  await ensureCliPaths(paths);const projectRoot=join(r,'shop');await mkdir(projectRoot,{recursive:true});
  const files={user:join(paths.configRoot,'config.json'),project:join(projectRoot,'.talos-cli','config.json'),projectUser:join(paths.projectOverridesRoot,projectId(projectRoot),'config.json')};
  return{paths,projectRoot,files};
}
const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));

test('each rule says where it takes effect from; a new one goes to the file the person chose',async()=>{
  const w=await where();
  await mkdir(join(w.projectRoot,'.talos-cli'),{recursive:true});
  await writeFile(w.files.project,JSON.stringify({version:2,permissions:{allow:['Bash(npm test:*)']}}));
  await addRule(w,{scope:'project-user',effect:'ask',rule:'  Bash(git push:*) '});
  await addRule(w,{scope:'user',effect:'deny',rule:'Read(.env*)'});
  const {rows,rules}=await readRuleRows(w);
  assert.deepEqual(rows.map(row=>[row.rule,row.effect,row.origin]),[['Bash(npm test:*)','allow','project'],['Bash(git push:*)','ask','project-user'],['Read(.env*)','deny','user']]);
  assert.deepEqual(rules,{allow:['Bash(npm test:*)'],ask:['Bash(git push:*)'],deny:['Read(.env*)']});
  assert.deepEqual((await json(w.files.projectUser)).permissions,{ask:['Bash(git push:*)']},'only the chosen file, the rule trimmed');
});

test('allow/ask/deny, new words and deletion change every file that lists the rule',async()=>{
  const w=await where();
  await addRule(w,{scope:'project-user',effect:'allow',rule:'Read(src/**)'});
  await addRule(w,{scope:'user',effect:'allow',rule:'Read(src/**)'});
  let [row]=(await readRuleRows(w)).rows;
  assert.deepEqual(row!.scopes,['project-user','user']);
  await changeRule(w,row!,{effect:'ask'});
  assert.deepEqual((await json(w.files.user)).permissions,{allow:[],ask:['Read(src/**)']});
  assert.deepEqual((await json(w.files.projectUser)).permissions,{allow:[],ask:['Read(src/**)']});
  [row]=(await readRuleRows(w)).rows;
  await changeRule(w,row!,{rule:'Read(lib/**)'});
  assert.deepEqual((await readRuleRows(w)).rows.map(r=>[r.rule,r.effect]),[['Read(lib/**)','ask']]);
  [row]=(await readRuleRows(w)).rows;
  await changeRule(w,row!,null);
  assert.deepEqual((await readRuleRows(w)).rows,[]);
});

test('a rule that cannot be read is refused by name and nothing is written',async()=>{
  const w=await where();
  assert.throws(()=>checkedRule('   ','allow'),{code:'PERMISSION_RULE_EMPTY'});
  await assert.rejects(addRule(w,{scope:'project-user',effect:'allow',rule:'Bash('}),{code:'PERMISSION_RULE_UNREADABLE'});
  await assert.rejects(readFile(w.files.projectUser,'utf8'),{code:'ENOENT'});
  await assert.rejects(changeRule(w,{rule:'Read(x)',effect:'allow',origin:'default',scopes:['default']},null),{code:'PERMISSION_RULE_READ_ONLY'});
});
