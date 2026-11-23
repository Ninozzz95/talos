import assert from 'node:assert/strict';
import test from 'node:test';
import {CURRENT_CONFIG_VERSION,migrateConfigValue} from '../../src/config/migrations.ts';

test('M2-E-RED-1 — legacy v0 config migrates deterministically to v1 without touching unrelated policy',()=>{
  const legacy={
    model:'openai:gpt-5-mini',
    permissionMode:'plan',
    permissions:{allow:['Read(*)'],ask:[],deny:['Bash(rm:*)']},
    ui:{theme:'dark',markdown:false,keymap:{'model-picker':['Alt+M']}},
  };
  const first=migrateConfigValue(legacy);
  assert.equal(first.fromVersion,0);
  assert.equal(first.toVersion,CURRENT_CONFIG_VERSION);
  assert.equal(first.changed,true);
  /* R5b D4 (owner decision Q-R5-14): the product's ten dark themes and their own backgrounds; config v2. */
  assert.deepEqual(first.steps,['v0-to-v1','v1-to-v2']);
  assert.equal((first.value as any).version,2);
  assert.equal((first.value as any).ui.theme,'calm');
  assert.equal((first.value as any).permissionMode,'plan');
  assert.deepEqual((first.value as any).permissions,legacy.permissions);
  assert.deepEqual((first.value as any).ui.keymap,legacy.ui.keymap);

  const second=migrateConfigValue(first.value);
  assert.equal(second.changed,false);
  assert.equal(second.fromVersion,2);/* R5b D4: config v2 */
  assert.deepEqual(second.value,first.value);
});

test('M2-E-RED-2 — legacy themes converge on the TALOS dark model and current accents survive',()=>{
  for(const legacy of ['auto','dark','light']){
    assert.equal((migrateConfigValue({ui:{theme:legacy}}).value as any).ui.theme,'calm',legacy);
  }
  assert.equal((migrateConfigValue({ui:{theme:'mono'}}).value as any).ui.theme,'mono');
  assert.equal((migrateConfigValue({ui:{theme:'ember'}}).value as any).ui.theme,'ember');
});

test('M2-E-RED-3 — future schema versions fail closed',()=>{
  assert.throws(()=>migrateConfigValue({version:99}),{code:'CONFIG_VERSION_UNSUPPORTED'});
});
