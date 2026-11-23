import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {resolveCliPaths} from '../../src/paths.ts';
import {createCliRuntimeContext} from '../../src/runtime/create-runtime.ts';

test('direct runtime creation refuses untrusted project before composition',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-direct-runtime-trust-'));const projectRoot=join(root,'project');const repoRoot=join(root,'repo');const home=join(root,'home');
  await mkdir(join(projectRoot,'.talos-cli'),{recursive:true});await mkdir(repoRoot,{recursive:true});await mkdir(home,{recursive:true});await writeFile(join(projectRoot,'.talos-cli','config.json'),'{}\n');
  const paths=resolveCliPaths({XDG_CONFIG_HOME:join(home,'config'),XDG_STATE_HOME:join(home,'state'),XDG_CACHE_HOME:join(home,'cache')},'linux',home);
  await assert.rejects(()=>createCliRuntimeContext({projectRoot,repoRoot,paths}),(error:any)=>error?.code==='PROJECT_TRUST_REQUIRED');
});
