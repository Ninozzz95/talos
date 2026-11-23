import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('M4-D RED — model command surface persists reasoning effort only in owner scopes',async()=>{
  const source=await readFile(new URL('../../src/commands/provider-cli.ts',import.meta.url),'utf8');
  assert.match(source,/op===['"]effort['"]/u);
  assert.match(source,/reasoningEffort/u);
  assert.match(source,/project-user/u);
  assert.match(source,/CONFIG_SCOPE_INVALID/u);
  assert.match(source,/configUnset/u);
});
