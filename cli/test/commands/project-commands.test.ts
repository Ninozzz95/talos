import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {loadProjectCommands,expandCommand} from '../../src/commands/project-commands.ts';
test('loads strict markdown project command',async()=>{const r=await mkdtemp(join(tmpdir(),'talos-cmd-'));const d=join(r,'.talos-cli','commands');await mkdir(d,{recursive:true});await writeFile(join(d,'review.md'),'---\nname: review-api\ndescription: Review API\narguments: "scope"\n---\nReview {{scope}}.');const c=await loadProjectCommands(r);assert.equal(c[0]?.name,'review-api');assert.equal(expandCommand(c[0]!,{scope:'src'}),'Review src.');});
test('unknown variables fail closed',()=>{assert.throws(()=>expandCommand({name:'x',description:'x',arguments:'',body:'{{evil}}'} as never,{}),/COMMAND_VARIABLE_UNKNOWN/);});
test('loads nested extension commands recursively',async()=>{const r=await mkdtemp(join(tmpdir(),'talos-cmd-nested-'));const d=join(r,'.talos-cli','commands','pkg');await mkdir(d,{recursive:true});await writeFile(join(d,'review.md'),'---\nname: review\ndescription: Review\n---\nReview {{arg1}}.');const c=await loadProjectCommands(r);assert.equal(c[0]?.name,'review');});

test('M8-D RED — legacy command defaults to kind command with byte-compatible rendering',async()=>{
  const r=await mkdtemp(join(tmpdir(),'talos-cmd-legacy-'));const file=join(r,'legacy.md');
  await writeFile(file,'---\nname: legacy\ndescription: Legacy command\n---\nReview {{arg1}}.');
  const {loadCommandFile}=await import('../../src/commands/project-commands.ts');
  const row=await loadCommandFile(file);
  assert.equal(row.kind,'command');assert.deepEqual(row.steps,[]);
  assert.equal(expandCommand(row,{arg1:'src'}),'Review src.');
});

test('M8-D RED — typed workflow accepts only bounded prompt skill and command steps',async()=>{
  const r=await mkdtemp(join(tmpdir(),'talos-workflow-schema-'));const file=join(r,'verify.md');
  const steps=JSON.stringify([
    {type:'prompt',template:'Plan {{arg1}}'},
    {type:'skill',name:'lint-guide'},
    {type:'command',name:'build',args:['{{arg1}}']}
  ]);
  await writeFile(file,'---\nname: verify\ndescription: Verify work\nkind: workflow\nsteps: '+steps+'\n---\n');
  const {loadCommandFile}=await import('../../src/commands/project-commands.ts');
  const row=await loadCommandFile(file);
  assert.equal(row.kind,'workflow');assert.equal(row.steps.length,3);
  assert.deepEqual(row.steps.map((step:any)=>step.type),['prompt','skill','command']);

  for(const bad of [
    {name:'unknown-step',steps:[{type:'shell',command:'npm test'}]},
    {name:'unknown-key',steps:[{type:'prompt',template:'x',extra:true}]},
    {name:'recursive',steps:[{type:'workflow',name:'other'}]}
  ]){
    const badFile=join(r,bad.name+'.md');
    await writeFile(badFile,'---\nname: '+bad.name+'\ndescription: bad\nkind: workflow\nsteps: '+JSON.stringify(bad.steps)+'\n---\n');
    await assert.rejects(()=>loadCommandFile(badFile),(error:any)=>/^WORKFLOW_/u.test(error?.code??error?.message??''));
  }
  const tooMany=join(r,'too-many.md');
  await writeFile(tooMany,'---\nname: too-many\ndescription: bad\nkind: workflow\nsteps: '+JSON.stringify(Array.from({length:65},()=>({type:'prompt',template:'x'})))+'\n---\n');
  await assert.rejects(()=>loadCommandFile(tooMany),(error:any)=>error?.code==='WORKFLOW_TOO_MANY_STEPS');
  const malformed=join(r,'malformed.md');
  await writeFile(malformed,'---\nname: malformed\ndescription: bad\nkind: workflow\nsteps: [{not-json}]\n---\n');
  await assert.rejects(()=>loadCommandFile(malformed),(error:any)=>error?.code==='WORKFLOW_STEPS_INVALID');
});

test('M8-D RED — workflow body is not an untyped hidden execution channel',async()=>{
  const r=await mkdtemp(join(tmpdir(),'talos-workflow-body-'));const file=join(r,'bad.md');
  await writeFile(file,'---\nname: bad\ndescription: bad\nkind: workflow\nsteps: '+JSON.stringify([{type:'prompt',template:'safe'}])+'\n---\nhidden body');
  const {loadCommandFile}=await import('../../src/commands/project-commands.ts');
  await assert.rejects(()=>loadCommandFile(file),(error:any)=>error?.code==='WORKFLOW_BODY_FORBIDDEN');
});
