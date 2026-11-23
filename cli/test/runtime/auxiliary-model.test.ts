import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {auxiliaryModelFor,auxiliaryModelId} from '../../src/runtime/auxiliary-model.ts';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';

const registry:any=(await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href)).REGISTRO_FORNITORI;

test('side work runs on the light model of the SAME provider, as the kernel registry declares it',()=>{
  assert.deepEqual(auxiliaryModelFor({provider:'anthropic',model:'claude-sonnet-4-5'},registry),{provider:'anthropic',model:registry.anthropic.modelloAusiliario});
  assert.match(registry.anthropic.modelloAusiliario,/haiku/u,'Anthropic: Haiku');
  assert.equal(auxiliaryModelId('zai:glm-5.3',registry),`zai:${registry.zai.modelloAusiliario}`);
  for(const id of Object.keys(registry)){
    const chosen=auxiliaryModelFor({provider:id,model:'m'},registry);
    assert.equal(chosen.provider,id,`never another provider (${id})`);
  }
});

test('a provider that declares no light model keeps the conversation\'s own model',()=>{
  const none=Object.keys(registry).find(id=>!registry[id].modelloAusiliario)!;
  assert.deepEqual(auxiliaryModelFor({provider:none,model:'their-model'},registry),{provider:none,model:'their-model'});
  assert.equal(auxiliaryModelId('no-colon',registry),'no-colon');
});
