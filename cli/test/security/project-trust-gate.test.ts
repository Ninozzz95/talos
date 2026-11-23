import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {assessProjectTrust,assertProjectTrusted,nestedRepositoriesForProjectTrust,projectTrustFailure,trustProjectAssessment} from '../../src/security/project-trust-gate.ts';
import {createProjectTrustService} from '../../src/security/project-trust.ts';

async function fixture(){const parent=await mkdtemp(join(tmpdir(),'talos-trust-gate-'));const projectRoot=join(parent,'project');const trustRoot=join(parent,'trust');await mkdir(join(projectRoot,'.talos-cli'),{recursive:true});await writeFile(join(projectRoot,'.talos-cli','config.json'),'{}\n');return{projectRoot,trustRoot};}

test('gate requires explicit trust and accepts the exact trusted snapshot',async()=>{
  const f=await fixture();const before=await assessProjectTrust(f);
  assert.equal(before.trusted,false);assert.equal(before.reason,'PROJECT_UNTRUSTED');
  await assert.rejects(()=>assertProjectTrusted(f),(error:any)=>error?.code==='PROJECT_TRUST_REQUIRED');
  await createProjectTrustService({trustRoot:f.trustRoot}).trust(before.workspace,before.resources);
  const after=await assessProjectTrust(f);assert.equal(after.trusted,true);assert.equal(after.reason,'PROJECT_TRUSTED');
  await assert.doesNotReject(()=>assertProjectTrusted(f));
});

test('added, removed, and modified resources invalidate trust',async()=>{
  const f=await fixture();const initial=await assessProjectTrust(f);await createProjectTrustService({trustRoot:f.trustRoot}).trust(initial.workspace,initial.resources);
  await writeFile(join(f.projectRoot,'AGENTS.md'),'new rules');
  assert.equal((await assessProjectTrust(f)).reason,'RESOURCE_SET_CHANGED');
  const added=await assessProjectTrust(f);await createProjectTrustService({trustRoot:f.trustRoot}).trust(added.workspace,added.resources);
  await writeFile(join(f.projectRoot,'AGENTS.md'),'changed rules');
  assert.equal((await assessProjectTrust(f)).reason,'RESOURCE_FINGERPRINT_CHANGED');
});

test('projects without executable or instruction resources require no trust record',async()=>{
  const parent=await mkdtemp(join(tmpdir(),'talos-empty-project-'));const projectRoot=join(parent,'project');await mkdir(projectRoot);
  const assessment=await assessProjectTrust({projectRoot,trustRoot:join(parent,'trust')});
  assert.equal(assessment.trusted,true);assert.equal(assessment.reason,'NO_PROJECT_RESOURCES');
});


test('grant trusts the exact assessment then re-verifies changed bytes before returning',async()=>{
  const f=await fixture();const assessed=await assessProjectTrust(f);const nested=await nestedRepositoriesForProjectTrust(assessed);
  await writeFile(join(f.projectRoot,'.talos-cli','config.json'),'{"changed":true}\n');
  await assert.rejects(()=>trustProjectAssessment({assessment:assessed,trustRoot:f.trustRoot,nestedRepositories:nested}),(error:any)=>error?.code==='PROJECT_TRUST_INVALIDATED'&&error?.reason==='RESOURCE_FINGERPRINT_CHANGED');
  assert.equal((await assessProjectTrust(f)).reason,'RESOURCE_FINGERPRINT_CHANGED');
});

test('a nested repository boundary appearing while consent is open revokes the new grant',async()=>{
  const f=await fixture();const commandDir=join(f.projectRoot,'.talos-cli','commands','nested');await mkdir(commandDir,{recursive:true});await writeFile(join(commandDir,'run.md'),'do the thing\n');
  const assessed=await assessProjectTrust(f);const nested=await nestedRepositoriesForProjectTrust(assessed);assert.deepEqual(nested,[]);
  await mkdir(join(commandDir,'.git'));
  await assert.rejects(()=>trustProjectAssessment({assessment:assessed,trustRoot:f.trustRoot,nestedRepositories:nested}),(error:any)=>error?.code==='PROJECT_TRUST_INVALIDATED'&&error?.reason==='NESTED_REPOSITORY_BOUNDARY_CHANGED');
  assert.equal((await assessProjectTrust(f)).reason,'PROJECT_UNTRUSTED');
});

test('trust failures are actionable and describe invalidation as a changed snapshot',async()=>{
  const f=await fixture();const before=await assessProjectTrust(f);const first=projectTrustFailure(before);
  assert.match(first.message,/talos project status/u);assert.match(first.message,/talos project trust/u);
  await createProjectTrustService({trustRoot:f.trustRoot}).trust(before.workspace,before.resources);await writeFile(join(f.projectRoot,'.talos-cli','config.json'),'{"changed":true}\n');
  const changed=projectTrustFailure(await assessProjectTrust(f));assert.match(changed.message,/snapshot changed/u);assert.doesNotMatch(changed.message,/tamper|attack|compromis/iu);
});
