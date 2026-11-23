/*
 * P15 (owner, 2026-09-25, "vorrei mettere forge come tema principale di default"): a profile that never chose a theme starts
 * in Forge; a theme the person chose stays theirs. The default lives in two places that must agree: the configuration's
 * base (`DEFAULT_CONFIG.ui.theme`, what run.ts receives) and the catalogue (`DEFAULT_THEME_ACCENT`, the fallback).
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {loadEffectiveConfig} from '../../src/config/load.ts';
import {DEFAULT_CONFIG} from '../../src/config/types.ts';
import type {CliPaths} from '../../src/paths.ts';
import {DEFAULT_THEME_ACCENT} from '../../src/tui/theme-catalog.ts';

async function profile(){
  const root=await mkdtemp(join(tmpdir(),'talos-p15-'));const project=join(root,'repo');await mkdir(project,{recursive:true});
  const paths:CliPaths={configRoot:join(root,'config'),dataRoot:join(root,'data'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'data','sessions'),logsRoot:join(root,'data','logs'),projectOverridesRoot:join(root,'data','projects'),queueRoot:join(root,'data','queues'),
    trust:{hooks:join(root,'data','trust','hooks'),mcp:join(root,'data','trust','mcp'),plugins:join(root,'data','trust','plugins'),projects:join(root,'data','trust','projects')}};
  return{project,paths};
}

test('P15: the configuration base and the catalogue say the same default, Forge',()=>{
  assert.equal(DEFAULT_THEME_ACCENT,'forge');
  assert.equal(DEFAULT_CONFIG.ui?.theme,DEFAULT_THEME_ACCENT);
});

test('P15: a profile that never chose a theme starts in Forge; a chosen Calm stays Calm',async()=>{
  const fresh=await profile();
  assert.equal((await loadEffectiveConfig({paths:fresh.paths,projectRoot:fresh.project})).value.ui?.theme,'forge');
  const chosen=await profile();
  await mkdir(chosen.paths.configRoot,{recursive:true});
  await writeFile(join(chosen.paths.configRoot,'config.json'),JSON.stringify({version:2,ui:{theme:'calm'}})+'\n');
  assert.equal((await loadEffectiveConfig({paths:chosen.paths,projectRoot:chosen.project})).value.ui?.theme,'calm');
});
