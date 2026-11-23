/*
 * R5b (owner answer 2026-09-24 "Sì, in configurazione"; R5a open item 6): models.dev — the one outbound request TALOS makes
 * for model sizes and prices (gate E7) — can be turned off in the configuration, `catalog.modelsDev: false`, besides the
 * environment switch `TALOS_MODELS_DEV=off` that R5a added. Either one turns it off; nothing is imported and nothing is sent.
 * `talos doctor` says whether it is on and why, and how to turn it off. Before R5b only the environment variable existed.
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createModelsDevLoader,modelsDevSwitch,MODELS_DEV_URL} from '../../src/runtime/model-profile.ts';
import {writeConfigScope} from '../../src/config/load.ts';
import {catalogLine} from '../../src/commands/system-cli.ts';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';

test('R5b: the switch — on by default; the configuration or the environment turns it off, and says which',()=>{
  assert.deepEqual(modelsDevSwitch({env:{},config:undefined,testProfile:false}),{enabled:true,reason:'on'});
  assert.deepEqual(modelsDevSwitch({env:{},config:{catalog:{modelsDev:false}},testProfile:false}),{enabled:false,reason:'config'});
  assert.deepEqual(modelsDevSwitch({env:{TALOS_MODELS_DEV:'off'},config:{catalog:{modelsDev:true}},testProfile:false}),{enabled:false,reason:'environment'});
  assert.deepEqual(modelsDevSwitch({env:{},config:{catalog:{modelsDev:true}},testProfile:true}),{enabled:false,reason:'test'});
});

test('R5b: with catalog.modelsDev false nothing is imported and nothing is sent',async t=>{
  const root=await mkdtemp(join(tmpdir(),'r5b-models-dev-'));t.after(()=>rm(root,{recursive:true,force:true}));
  let calls=0;const fetchImpl=async()=>{calls+=1;return new Response('{}');};
  const off=createModelsDevLoader({repoRoot:REPO_ROOT,dataRoot:root,env:{},config:{catalog:{modelsDev:false}},fetchImpl,testProfile:false});
  assert.equal(off.enabled,false);await off.load('openrouter');assert.equal(calls,0);
});

test('R5b: catalog accepts only modelsDev, a boolean',async t=>{
  const root=await mkdtemp(join(tmpdir(),'r5b-models-dev-cfg-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const paths={configRoot:join(root,'c'),dataRoot:join(root,'d'),cacheRoot:join(root,'d','cache'),sessionsRoot:join(root,'d','s'),logsRoot:join(root,'d','l'),projectOverridesRoot:join(root,'d','p'),queueRoot:join(root,'d','q'),trust:{hooks:'',mcp:'',plugins:'',projects:''}} as any;
  await mkdir(paths.configRoot,{recursive:true});await writeFile(join(paths.configRoot,'config.json'),'{"version":2}');
  await writeConfigScope({paths,projectRoot:root,scope:'user',patch:{catalog:{modelsDev:false}} as any});
  await assert.rejects(writeConfigScope({paths,projectRoot:root,scope:'user',patch:{catalog:{modelsDev:'no'}} as any}),/CONFIG_INVALID_CATALOG/u);
  await assert.rejects(writeConfigScope({paths,projectRoot:root,scope:'user',patch:{catalog:{other:true}} as any}),/CONFIG_INVALID_CATALOG/u);
});

test('R5b: talos doctor says whether models.dev is used, why not, and how to change it',()=>{
  assert.equal(catalogLine({state:'on',reason:'on',source:MODELS_DEV_URL,cacheHours:4}),'models.dev on: one request to https://models.dev/api.json for model sizes and prices, cached 4 h; talos config set catalog.modelsDev false turns it off');
  assert.equal(catalogLine({state:'off',reason:'config',source:MODELS_DEV_URL,cacheHours:4}),'models.dev off (catalog.modelsDev false in the configuration): nothing is sent');
  assert.equal(catalogLine({state:'off',reason:'environment',source:MODELS_DEV_URL,cacheHours:4}),'models.dev off (TALOS_MODELS_DEV=off): nothing is sent');
});

/* The composed runtime always runs in the test profile here (r5a-r-network.test.ts), where models.dev is off anyway, so the
   wiring is pinned in the source: a weaker proof than a behaviour, said as such. */
test('R5b: the composed runtime hands the loader the effective configuration (source pin)',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../../src/runtime/talos-composition.ts',import.meta.url),'utf8');
  /* c23155be7 (03/11/2026): the configuration of a folder the person did not trust is read without its project layer */
  assert.match(source,/catalogConfig=\(await loadEffectiveConfig\(\{paths,projectRoot,projectTrusted:!projectUntrusted\}\)\)\.value/u);
  assert.match(source,/createModelsDevLoader\(\{[^;]{0,200}config:catalogConfig/u);
});
