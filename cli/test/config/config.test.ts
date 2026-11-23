import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {loadEffectiveConfig,migrateConfigScope,rollbackConfigMigration,writeConfigScope} from '../../src/config/load.ts';
import type {CliPaths} from '../../src/paths.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'talos-cli-config-'));
  const project = join(root, 'repo');
  await mkdir(project, {recursive:true});
  const paths: CliPaths = {
    configRoot:join(root,'config'), dataRoot:join(root,'data'), cacheRoot:join(root,'cache'),
    sessionsRoot:join(root,'data','sessions'), logsRoot:join(root,'data','logs'), projectOverridesRoot:join(root,'data','projects'),
    trust:{hooks:join(root,'data','trust','hooks'),mcp:join(root,'data','trust','mcp'),plugins:join(root,'data','trust','plugins'),projects:join(root,'data','trust','projects')}
  };
  return {root, project, paths};
}

test('P4-CONFIG notifications default auto, persist bell/off and reject invalid values',async()=>{
  const f=await fixture();
  assert.equal((await loadEffectiveConfig({paths:f.paths,projectRoot:f.project})).value.ui?.notifications,'auto');
  for(const value of ['bell','off','auto'] as const){
    await writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'user',patch:{ui:{notifications:value}}});
    assert.equal((await loadEffectiveConfig({paths:f.paths,projectRoot:f.project})).value.ui?.notifications,value);
  }
  for(const value of [true,false,'toast','',null,{},[]])await assert.rejects(()=>writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'user',patch:{ui:{notifications:value}} as any}),/CONFIG_INVALID_UI/u);
});

test('P5-WIDTH-CONFIG full width by default, safe columns or null; invalid values never persist',async()=>{
  const f=await fixture();const options={paths:f.paths,projectRoot:f.project,scope:'project-user' as const};
  assert.equal((await loadEffectiveConfig(options)).value.ui?.maxProseWidth,null);
  for(const maxProseWidth of [40,80,123,null]){
    await writeConfigScope({...options,patch:{ui:{maxProseWidth}}});
    assert.equal((await loadEffectiveConfig(options)).value.ui?.maxProseWidth,maxProseWidth);
  }
  for(const maxProseWidth of [0,39,-1,80.5,'80',true,[],{},Number.MAX_SAFE_INTEGER+1]){
    await assert.rejects(()=>writeConfigScope({...options,patch:{ui:{maxProseWidth}} as any}),/CONFIG_INVALID_UI/u);
    assert.equal((await loadEffectiveConfig(options)).value.ui?.maxProseWidth,null);
  }
});

test('config precedence is default user project project-user cli', async () => {
  const f = await fixture();
  await writeConfigScope({paths:f.paths, projectRoot:f.project, scope:'user', patch:{model:'openai:a'}});
  await writeConfigScope({paths:f.paths, projectRoot:f.project, scope:'project', patch:{model:'anthropic:b'}});
  await writeConfigScope({paths:f.paths, projectRoot:f.project, scope:'project-user', patch:{model:'ollama:c'}});
  const effective = await loadEffectiveConfig({paths:f.paths, projectRoot:f.project, cli:{model:'gemini:d'}});
  assert.equal(effective.value.model, 'gemini:d');
  assert.equal(effective.origins.get('model'), 'cli');
});

test('config rejects secrets recursively', async () => {
  const f = await fixture();
  await assert.rejects(() => writeConfigScope({paths:f.paths, projectRoot:f.project, scope:'project', patch:{providerRuntime:{openai:{apiKey:'secret'}}} as never}), /SECRET_FIELD_FORBIDDEN/);
});

test('project config is created only by explicit write and contains no secret', async () => {
  const f = await fixture();
  await writeConfigScope({paths:f.paths, projectRoot:f.project, scope:'project', patch:{permissionMode:'plan'}});
  const body = await readFile(join(f.project,'.talos-cli','config.json'),'utf8');
  assert.match(body, /"permissionMode": "plan"/);
  assert.doesNotMatch(body, /secret|token|apiKey/i);
});

test('atomic config writes fsync a read-write handle for Windows compatibility', async () => {
  const source = await readFile(new URL('../../src/config/load.ts', import.meta.url), 'utf8');
  assert.match(source, /open\(tmp\s*,\s*['"]r\+['"]\)/, 'temporary config file must be reopened read-write before fsync');
  assert.doesNotMatch(source, /open\(tmp\s*,\s*['"]r['"]\)/, 'read-only fsync can fail with EPERM on Windows');
});


test('M2-D project keymap is ignored while user and project-user overrides retain layered origin',async()=>{
  const f=await fixture();
  await writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'user',patch:{ui:{keymap:{'model-picker':['Alt+M'],'provider-picker':['Alt+P']}}} as any});
  await writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'project',patch:{ui:{keymap:{'model-picker':['Ctrl+Q']}}} as any});
  await writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'project-user',patch:{ui:{keymap:{'model-picker':['Ctrl+L']}}} as any});
  const effective=await loadEffectiveConfig({paths:f.paths,projectRoot:f.project});
  assert.deepEqual((effective.value.ui as any)?.keymap,{
    'model-picker':['Ctrl+L'],
    'provider-picker':['Alt+P'],
  });
  assert.equal(effective.origins.get('ui.keymap.model-picker'),'project-user');
  assert.equal(effective.origins.get('ui.keymap.provider-picker'),'user');
  assert.ok(effective.ignored.some((row:any)=>row.code==='PROJECT_KEYMAP_IGNORED'&&row.path==='ui.keymap'&&row.origin==='project'));
});

test('M2-D malformed keymap values fail config validation before TUI resolution',async()=>{
  const f=await fixture();
  await assert.rejects(
    ()=>writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'user',patch:{ui:{keymap:{'model-picker':'Ctrl+L'}}} as any}),
    /CONFIG_INVALID_KEYMAP/u,
  );
  await assert.rejects(
    ()=>writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'user',patch:{ui:{keymap:['Ctrl+L']}} as any}),
    /CONFIG_INVALID_KEYMAP/u,
  );
});


test('M2-E load migrates legacy config in memory without rewriting the file and preserves origins',async()=>{
  const f=await fixture();
  await mkdir(f.paths.configRoot,{recursive:true});
  const file=join(f.paths.configRoot,'config.json');
  const legacy='{"model":"openai:legacy","ui":{"theme":"light"}}\n';
  await writeFile(file,legacy);
  const effective=await loadEffectiveConfig({paths:f.paths,projectRoot:f.project});
  assert.equal(effective.value.version,2);/* R5b D4 (owner decision Q-R5-14): the product's ten dark themes and their own backgrounds; config v2. */
  assert.equal(effective.value.ui?.theme,'calm');
  assert.equal(effective.value.model,'openai:legacy');
  assert.equal(effective.origins.get('model'),'user');
  assert.equal(effective.origins.get('ui.theme'),'user');
  assert.equal(await readFile(file,'utf8'),legacy,'ordinary load must not rewrite legacy config');
});

test('M2-E explicit migration writes an atomic backup and rollback restores the exact prior bytes',async()=>{
  const f=await fixture();
  await mkdir(f.paths.configRoot,{recursive:true});
  const file=join(f.paths.configRoot,'config.json');
  const legacy='{"permissionMode":"plan","ui":{"theme":"auto"}}\r\n';
  await writeFile(file,legacy);

  const migrated=await migrateConfigScope({paths:f.paths,projectRoot:f.project,scope:'user'});
  assert.equal(migrated.changed,true);
  assert.equal(migrated.fromVersion,0);
  /* R5b D4 (owner decision Q-R5-14): the product's ten dark themes and their own backgrounds; config v2. */
  assert.equal(migrated.toVersion,2);
  assert.deepEqual(migrated.steps,['v0-to-v1','v1-to-v2']);
  assert.equal(await readFile(migrated.backupFile!,'utf8'),legacy);
  const current=JSON.parse(await readFile(file,'utf8'));
  assert.equal(current.version,2);
  assert.equal(current.ui.theme,'calm');
  assert.equal(current.permissionMode,'plan');

  const rolled=await rollbackConfigMigration({paths:f.paths,projectRoot:f.project,scope:'user'});
  assert.equal(rolled.restored,true);
  assert.equal(await readFile(file,'utf8'),legacy);
});

test('M2-E rollback fails by name when no migration backup exists',async()=>{
  const f=await fixture();
  await assert.rejects(
    ()=>rollbackConfigMigration({paths:f.paths,projectRoot:f.project,scope:'user'}),
    /CONFIG_MIGRATION_BACKUP_NOT_FOUND/u,
  );
});

test('R2 owner 2026-09-24: a project file cannot choose where TALOS keeps the keys (credentials.store)',async()=>{
  const f=await fixture();
  await writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'project',patch:{credentials:{store:'memory'}} as any});
  const onlyProject=await loadEffectiveConfig({paths:f.paths,projectRoot:f.project});
  assert.equal((onlyProject.value as any).credentials?.store,undefined,'the repository value is dropped, so the default (system) applies');
  assert.ok(onlyProject.ignored.some((row:any)=>row.code==='PROJECT_CREDENTIAL_STORE_IGNORED'&&row.path==='credentials.store'&&row.origin==='project'));
  await writeConfigScope({paths:f.paths,projectRoot:f.project,scope:'project-user',patch:{credentials:{store:'memory'}} as any});
  const personal=await loadEffectiveConfig({paths:f.paths,projectRoot:f.project});
  assert.equal((personal.value as any).credentials?.store,'memory','the project-user file lives in the person\'s profile and keeps its effect');
});
