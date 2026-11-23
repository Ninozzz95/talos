import assert from 'node:assert/strict';
import {mkdir,mkdtemp,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {isPathInsideWorkspace,resolveWorkspaceIdentity} from '../../src/security/workspace-identity.ts';

test('canonical workspace identity is stable across equivalent path forms',async()=>{
  const parent=await mkdtemp(join(tmpdir(),'talos-workspace-'));
  const repo=join(parent,'repo');
  const project=join(repo,'packages','cli-project');
  await mkdir(join(repo,'.git'),{recursive:true});
  await mkdir(project,{recursive:true});
  const first=await resolveWorkspaceIdentity({projectRoot:project});
  const second=await resolveWorkspaceIdentity({projectRoot:join(project,'.')});
  assert.equal(first.canonicalRoot,await realpath(project));
  assert.equal(first.gitRoot,await realpath(repo));
  assert.equal(first.identityHash,second.identityHash);
  assert.equal(first.nestedRepository,false);
  assert.equal(isPathInsideWorkspace(first,join(project,'src','file.ts')),true);
  assert.equal(isPathInsideWorkspace(first,join(parent,'outside.ts')),false);
});

test('workspace identity reports a nested repository without changing the selected project root',async()=>{
  const parent=await mkdtemp(join(tmpdir(),'talos-nested-workspace-'));
  const outer=join(parent,'outer');
  const nested=join(outer,'packages','nested');
  await mkdir(join(outer,'.git'),{recursive:true});
  await mkdir(join(nested,'.git'),{recursive:true});
  const identity=await resolveWorkspaceIdentity({projectRoot:nested});
  assert.equal(identity.canonicalRoot,await realpath(nested));
  assert.equal(identity.gitRoot,await realpath(nested));
  assert.equal(identity.nestedRepository,true);
});
