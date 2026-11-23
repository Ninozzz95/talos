import assert from 'node:assert/strict';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {loadEffectiveConfig,writeConfigScope} from '../../src/config/load.ts';
import type {CliPaths} from '../../src/paths.ts';

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'talos-cli-reasoning-config-'));
  const project=join(root,'repo');await mkdir(project,{recursive:true});
  const paths:CliPaths={
    configRoot:join(root,'config'),dataRoot:join(root,'data'),cacheRoot:join(root,'cache'),
    sessionsRoot:join(root,'data','sessions'),logsRoot:join(root,'data','logs'),projectOverridesRoot:join(root,'data','projects'),queueRoot:join(root,'data','queues'),
    trust:{hooks:join(root,'data','trust','hooks'),mcp:join(root,'data','trust','mcp'),plugins:join(root,'data','trust','plugins'),projects:join(root,'data','trust','projects')},
  };
  return{project,paths};
}

test('M4-D RED — reasoning effort layers user < project-user < cli while project scope is ignored',async()=>{
  const f=await fixture();
  await writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'user',patch:{reasoningEffort:'low'} as any});
  await writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'project',patch:{reasoningEffort:'max'} as any});
  await writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'project-user',patch:{reasoningEffort:'high'} as any});
  const layered=await loadEffectiveConfig({paths:f.paths,projectRoot:f.project});
  assert.equal((layered.value as any).reasoningEffort,'high');
  assert.equal(layered.origins.get('reasoningEffort'),'project-user');
  assert.ok(layered.ignored.some((row:any)=>row.code==='PROJECT_REASONING_EFFORT_IGNORED'&&row.path==='reasoningEffort'&&row.origin==='project'));
  const cli=await loadEffectiveConfig({paths:f.paths,projectRoot:f.project,cli:{reasoningEffort:'xhigh'} as any});
  assert.equal((cli.value as any).reasoningEffort,'xhigh');
  assert.equal(cli.origins.get('reasoningEffort'),'cli');
});

test('M4-D RED — invalid reasoning effort is rejected at the config boundary',async()=>{
  const f=await fixture();
  await assert.rejects(
    ()=>writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'user',patch:{reasoningEffort:'ultra'} as any}),
    /CONFIG_INVALID_REASONING_EFFORT/u,
  );
});
