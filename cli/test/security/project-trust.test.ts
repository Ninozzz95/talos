import assert from 'node:assert/strict';
import {mkdir,mkdtemp,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createProjectTrustService,fingerprintExecutableResource} from '../../src/security/project-trust.ts';
import {resolveWorkspaceIdentity} from '../../src/security/workspace-identity.ts';

test('project trust binds exact resource fingerprints and revoke removes trust',async()=>{
  const parent=await mkdtemp(join(tmpdir(),'talos-project-trust-'));
  const project=join(parent,'project');
  const trustRoot=join(parent,'trust');
  const command=join(project,'.talos-cli','commands','review.md');
  const hook=join(project,'.talos-cli','hooks','after.json');
  await mkdir(join(project,'.git'),{recursive:true});
  await mkdir(join(project,'.talos-cli','commands'),{recursive:true});
  await mkdir(join(project,'.talos-cli','hooks'),{recursive:true});
  await writeFile(command,'review v1','utf8');
  await writeFile(hook,'{"command":"npm test"}','utf8');
  const workspace=await resolveWorkspaceIdentity({projectRoot:project});
  const commandV1=await fingerprintExecutableResource({workspace,kind:'command',id:'review',path:command});
  const hookV1=await fingerprintExecutableResource({workspace,kind:'hook',id:'after',path:hook});
  const service=createProjectTrustService({trustRoot,clock:()=> '2026-09-16T12:00:00.000Z'});
  assert.deepEqual(await service.status(workspace),{trusted:false,reason:'PROJECT_UNTRUSTED'});
  assert.deepEqual(await service.verifyResource(workspace,commandV1),{trusted:false,reason:'PROJECT_UNTRUSTED'});
  await service.trust(workspace,[commandV1,hookV1]);
  assert.deepEqual(await service.verifySnapshot(workspace,[commandV1,hookV1]),{trusted:true,reason:'PROJECT_TRUSTED'});
  assert.deepEqual(await service.verifySnapshot(workspace,[commandV1]),{trusted:false,reason:'RESOURCE_SET_CHANGED'});
  assert.deepEqual(await service.verifyResource(workspace,commandV1),{trusted:true,reason:'RESOURCE_TRUSTED'});
  await writeFile(command,'review v2','utf8');
  const commandV2=await fingerprintExecutableResource({workspace,kind:'command',id:'review',path:command});
  assert.deepEqual(await service.verifySnapshot(workspace,[commandV2,hookV1]),{trusted:false,reason:'RESOURCE_FINGERPRINT_CHANGED'});
  assert.deepEqual(await service.verifyResource(workspace,commandV2),{trusted:false,reason:'RESOURCE_FINGERPRINT_CHANGED'});
  assert.deepEqual(await service.verifyResource(workspace,hookV1),{trusted:true,reason:'RESOURCE_TRUSTED'});
  await service.revoke(workspace);
  assert.deepEqual(await service.status(workspace),{trusted:false,reason:'PROJECT_UNTRUSTED'});
});

test('resource fingerprint rejects a junction that escapes the canonical workspace',async()=>{
  const parent=await mkdtemp(join(tmpdir(),'talos-trust-escape-'));
  const project=join(parent,'project');
  const outside=join(parent,'outside');
  await mkdir(project,{recursive:true});
  await mkdir(outside,{recursive:true});
  await writeFile(join(outside,'tool.md'),'outside','utf8');
  await symlink(outside,join(project,'linked'),'junction');
  const workspace=await resolveWorkspaceIdentity({projectRoot:project});
  await assert.rejects(
    fingerprintExecutableResource({workspace,kind:'command',id:'outside',path:join(project,'linked','tool.md')}),
    (error:any)=>error?.code==='RESOURCE_OUTSIDE_WORKSPACE'
  );
});
