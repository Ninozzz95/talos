import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWorkflowCatalog} from '../../src/services/workflow-catalog.ts';

function commandResource(relativePath:string,state:'trusted'|'changed'|'added'='trusted'){
  const current='current-'+relativePath;
  return{
    key:'command:'+relativePath,kind:'command',id:relativePath,relativePath,state,
    current:{workspaceIdentityHash:'workspace-1',kind:'command',id:relativePath,relativePath,fingerprint:current},
    currentFingerprint:current,trustedFingerprint:state==='trusted'?current:'old-'+relativePath
  };
}
function snapshot(resources:any[]){
  return{
    trusted:resources.every(row=>row.state==='trusted'),reason:'PROJECT_TRUSTED',storeSchema:'v2',
    migrationRequired:false,rollbackAvailable:false,
    workspace:{canonicalRoot:'/project',identityHash:'workspace-1'},resources,nestedRepositories:[]
  } as any;
}
async function fixture(options:{duplicateReview?:boolean;workflow?:boolean;bad?:boolean}={}){
  const root=await mkdtemp(join(tmpdir(),'talos-workflow-catalog-'));
  const project=join(root,'project');const configRoot=join(root,'config');
  const projectCommands=join(project,'.talos-cli','commands');const userCommands=join(configRoot,'commands');
  await mkdir(projectCommands,{recursive:true});await mkdir(userCommands,{recursive:true});
  await writeFile(join(projectCommands,'review.md'),'---\nname: review\ndescription: Project review\n---\nReview {{arg1}}.');
  if(options.duplicateReview)await writeFile(join(userCommands,'review.md'),'---\nname: review\ndescription: User review\n---\nUser review {{arg1}}.');
  else await writeFile(join(userCommands,'personal.md'),'---\nname: personal\ndescription: Personal\n---\nPersonal {{arg1}}.');
  await writeFile(join(projectCommands,'build.md'),'---\nname: build\ndescription: Build\n---\nBuild {{arg1}}.');
  if(options.workflow){
    const steps=JSON.stringify([
      {type:'prompt',template:'Plan {{arg1}}'},
      {type:'skill',name:'lint-guide'},
      {type:'command',name:'build',args:['{{arg1}}']}
    ]);
    await writeFile(join(projectCommands,'verify.md'),'---\nname: verify\ndescription: Verify\nkind: workflow\nsteps: '+steps+'\n---\n');
  }
  if(options.bad)await writeFile(join(projectCommands,'bad.md'),'---\nname: bad\ndescription: Bad\nevil: yes\n---\nBad');
  return{root,project,configRoot,projectCommands,userCommands};
}
function catalogInput(f:any){return{projectRoot:f.project,repoRoot:'/repo',paths:{configRoot:f.configRoot,trust:{projects:'/trust'}} as any};}
function deps(resources:any[],loadSkills?:()=>Promise<any>){
  return{
    authority:{inspect:async()=>snapshot(resources)} as any,
    loadSkills:loadSkills??(async()=>({skills:[{id:'lint-guide',name:'lint-guide',description:'Lint carefully',corpo:'Skill body {{is inert}}'}]}))
  } as any;
}

test('M8-D RED — one catalog joins project commands user commands skills and workflows with provenance',async()=>{
  const f=await fixture({workflow:true});
  const resources=[
    commandResource('.talos-cli/commands/review.md'),
    commandResource('.talos-cli/commands/build.md'),
    commandResource('.talos-cli/commands/verify.md')
  ];
  const catalog=createWorkflowCatalog(catalogInput(f),deps(resources));
  const rows=await catalog.list();
  const byId=new Map(rows.map((row:any)=>[row.id,row]));
  assert.equal(byId.get('project:review')?.kind,'command');
  assert.equal(byId.get('project:review')?.provenance.scope,'project-command');
  assert.equal(byId.get('project:review')?.trust.state,'trusted');
  assert.equal(byId.get('user:personal')?.provenance.scope,'user-command');
  assert.equal(byId.get('user:personal')?.trust.required,false);
  assert.equal(byId.get('skill:lint-guide')?.kind,'skill');
  assert.equal(byId.get('skill:lint-guide')?.trust.state,'inert-text');
  assert.equal(byId.get('project:verify')?.kind,'workflow');
  assert.equal(byId.get('project:verify')?.executableSteps,1);
  assert.equal(byId.get('project:verify')?.validation.valid,true);
});

test('M8-D RED — malformed command files and skill registry failures remain visible validation failures',async()=>{
  const f=await fixture({bad:true});
  const catalog=createWorkflowCatalog(catalogInput(f),deps([
    commandResource('.talos-cli/commands/review.md'),
    commandResource('.talos-cli/commands/build.md'),
    commandResource('.talos-cli/commands/bad.md','added')
  ],async()=>{throw Object.assign(new Error('broken skill'),{code:'SKILL_MALFORMED'});}));
  const rows=await catalog.list();
  const bad=rows.find((row:any)=>row.id==='project:bad');
  assert.ok(bad);assert.equal(bad.validation.valid,false);assert.match(bad.validation.code,/COMMAND_/u);
  const skillFailure=rows.find((row:any)=>row.id==='skill:registry-error');
  assert.ok(skillFailure);assert.equal(skillFailure.kind,'skill');assert.equal(skillFailure.validation.valid,false);assert.equal(skillFailure.validation.code,'SKILL_MALFORMED');
});

test('M8-D RED — project command execution requires exact existing resource trust while user command does not invent project trust',async()=>{
  const f=await fixture();
  const changed=createWorkflowCatalog(catalogInput(f),deps([
    commandResource('.talos-cli/commands/review.md','changed'),
    commandResource('.talos-cli/commands/build.md')
  ]));
  await assert.rejects(()=>changed.run('project:review',['src']),(error:any)=>error?.code==='WORKFLOW_TRUST_REQUIRED');
  const userResult=await changed.run('user:personal',['src']);
  assert.equal(userResult.prompt,'Personal src.');// body is 'Personal {{arg1}}.' (fixture above)

  const trusted=createWorkflowCatalog(catalogInput(f),deps([
    commandResource('.talos-cli/commands/review.md'),
    commandResource('.talos-cli/commands/build.md')
  ]));
  const projectResult=await trusted.run('project:review',['src']);
  assert.equal(projectResult.prompt,'Review src.');
});

test('M8-D RED — workflow requires its own trust plus independent trust for every executable command step',async()=>{
  const f=await fixture({workflow:true});
  const base=[
    commandResource('.talos-cli/commands/review.md'),
    commandResource('.talos-cli/commands/build.md'),
    commandResource('.talos-cli/commands/verify.md')
  ];
  const catalog=createWorkflowCatalog(catalogInput(f),deps(base));
  const result=await catalog.run('project:verify',['src']);
  assert.equal(result.prompt,'Plan src\n\nSkill body {{is inert}}\n\nBuild src.');
  assert.deepEqual(result.steps.map((step:any)=>step.type),['prompt','skill','command']);

  const workflowChanged=createWorkflowCatalog(catalogInput(f),deps(base.map(row=>row.relativePath.endsWith('verify.md')?commandResource(row.relativePath,'changed'):row)));
  await assert.rejects(()=>workflowChanged.run('project:verify',['src']),(error:any)=>error?.code==='WORKFLOW_TRUST_REQUIRED');

  const commandChanged=createWorkflowCatalog(catalogInput(f),deps(base.map(row=>row.relativePath.endsWith('build.md')?commandResource(row.relativePath,'changed'):row)));
  await assert.rejects(()=>commandChanged.run('project:verify',['src']),(error:any)=>error?.code==='WORKFLOW_STEP_TRUST_REQUIRED');
});

test('M8-D RED — missing or ambiguous references invalidate workflow before execution',async()=>{
  const f=await fixture({workflow:true,duplicateReview:true});
  const verify=join(f.projectCommands,'verify.md');
  await writeFile(verify,'---\nname: verify\ndescription: Verify\nkind: workflow\nsteps: '+JSON.stringify([{type:'command',name:'missing',args:[]}])+'\n---\n');
  const catalog=createWorkflowCatalog(catalogInput(f),deps([
    commandResource('.talos-cli/commands/review.md'),
    commandResource('.talos-cli/commands/build.md'),
    commandResource('.talos-cli/commands/verify.md')
  ]));
  const row=(await catalog.list()).find((entry:any)=>entry.id==='project:verify');
  assert.equal(row?.validation.valid,false);assert.equal(row?.validation.code,'WORKFLOW_COMMAND_NOT_FOUND');
  await assert.rejects(()=>catalog.run('project:verify',[]),(error:any)=>error?.code==='WORKFLOW_COMMAND_NOT_FOUND');
  await assert.rejects(()=>catalog.run('review',['x']),(error:any)=>error?.code==='WORKFLOW_ENTRY_AMBIGUOUS');
  assert.equal((await catalog.run('project:review',['x'])).prompt,'Review x.');
});

test('M8-D RED — workflow command references are ambiguity-checked across provenance scopes',async()=>{
  const f=await fixture({workflow:true,duplicateReview:true});
  await writeFile(join(f.projectCommands,'verify.md'),'---\nname: verify\ndescription: Verify\nkind: workflow\nsteps: '+JSON.stringify([{type:'command',name:'review',args:['{{arg1}}']}])+'\n---\n');
  const catalog=createWorkflowCatalog(catalogInput(f),deps([
    commandResource('.talos-cli/commands/review.md'),
    commandResource('.talos-cli/commands/build.md'),
    commandResource('.talos-cli/commands/verify.md')
  ]));
  const row=(await catalog.list()).find((entry:any)=>entry.id==='project:verify');
  assert.equal(row?.validation.valid,false);assert.equal(row?.validation.code,'WORKFLOW_COMMAND_AMBIGUOUS');
});
