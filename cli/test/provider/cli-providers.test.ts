/* 0.6.11: `locale-ospite` («On this device», r4 1a095e087) needs an app hosting the model; the CLI hosts none, so it is left out
   of the CLI's copy of the registry: never listed, never accepted by `model use`. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {PROVIDERS_THE_CLI_CANNOT_SERVE,cliProviderRegistry} from '../../src/provider/cli-providers.ts';

test('the CLI copy of the kernel registry has no locale-ospite and every other provider, and the kernel object is untouched',async()=>{
  const kernel:any=await import(pathToFileURL(join(process.cwd(),'..','harness-ui','src','provider-registry.mjs')).href);
  const registry=kernel.REGISTRO_FORNITORI as Record<string,unknown>;
  assert.ok(Object.hasOwn(registry,'locale-ospite'),'premise: the kernel registry has locale-ospite');
  const cli=cliProviderRegistry(registry);
  assert.equal(Object.hasOwn(cli,'locale-ospite'),false);
  assert.deepEqual(Object.keys(cli).sort(),Object.keys(registry).filter(id=>!PROVIDERS_THE_CLI_CANNOT_SERVE.has(id)).sort());
  assert.ok(Object.hasOwn(registry,'locale-ospite'),'the kernel registry was changed');
  for(const id of ['local','openai','chatgpt','anthropic','zai'])assert.ok(Object.hasOwn(cli,id),id);
});

test('an empty or missing registry gives an empty one',()=>{
  assert.deepEqual(cliProviderRegistry(undefined),{});
  assert.deepEqual(cliProviderRegistry(null),{});
});
