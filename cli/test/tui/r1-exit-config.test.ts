/* R1 lane X (Q-R1-4): `ui.exitOutput` chooses what exit leaves in the scrollback; the default is the transcript. */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {loadEffectiveConfig} from '../../src/config/load.ts';
import {DEFAULT_CONFIG,UI_EXIT_OUTPUTS} from '../../src/config/types.ts';
import type {CliPaths} from '../../src/paths.ts';

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'talos-cli-r1x-config-'));const project=join(root,'repo');await mkdir(project,{recursive:true});
  const paths:CliPaths={configRoot:join(root,'config'),dataRoot:join(root,'data'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'data','sessions'),logsRoot:join(root,'data','logs'),projectOverridesRoot:join(root,'data','projects'),
    trust:{hooks:join(root,'data','trust','hooks'),mcp:join(root,'data','trust','mcp'),plugins:join(root,'data','trust','plugins'),projects:join(root,'data','trust','projects')}};
  await mkdir(paths.configRoot,{recursive:true});
  return{root,project,paths,user:(value:unknown)=>writeFile(join(paths.configRoot,'config.json'),JSON.stringify({version:1,ui:{exitOutput:value}}),'utf8')};
}

test('R1 X ui.exitOutput defaults to the transcript and accepts only transcript or resume',async()=>{
  const f=await fixture();
  try{
    assert.deepEqual([...UI_EXIT_OUTPUTS],['transcript','resume']);
    assert.equal(DEFAULT_CONFIG.ui?.exitOutput,'transcript');
    assert.equal((await loadEffectiveConfig({paths:f.paths,projectRoot:f.project})).value.ui?.exitOutput,'transcript');
    await f.user('resume');
    const effective=await loadEffectiveConfig({paths:f.paths,projectRoot:f.project});
    assert.equal(effective.value.ui?.exitOutput,'resume');
    assert.equal(effective.origins.get('ui.exitOutput'),'user');
    for(const bad of ['none','Transcript',true,1]){
      await f.user(bad);
      await assert.rejects(loadEffectiveConfig({paths:f.paths,projectRoot:f.project}),/CONFIG_INVALID_EXIT_OUTPUT/u,String(bad));
    }
  }finally{await rm(f.root,{recursive:true,force:true});}
});
