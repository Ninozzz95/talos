import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {KEYBINDINGS} from '../../src/tui/keybindings.ts';

test('M6-D reserves Alt+A for native agent-tree inspection',()=>{
  const binding=KEYBINDINGS.find(row=>row.id==='agent-tree');
  assert.ok(binding);
  assert.deepEqual(binding.keys,['Alt+A']);
  assert.equal(binding.context,'composer');
});

test('app consumes the native M6-C tree without inventing child resume or a second steering transport',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/controller\.agentTree\(\)/u);
  assert.match(source,/agentRosterRows/u);
  /* R1 (Q-R1-3): app.ts renders overlays through lane O's fitted builders (overlays/scroll-window.ts); the *Lines functions stay for their own tests. */
  /* Stage 6a (owner 01/10): the tree list became the agents panel and page (agents-panel.ts, the approved mockup). */
  assert.match(source,/agentsPageRows/u);
  assert.match(source,/agentsCard/u);
  assert.match(source,/action==='agent-tree'/u);
  assert.match(source,/function handleAgentsPageKey[\s\S]{0,240}key\.ctrl[\s\S]{0,180}cancelActiveRun\(\)/u);
  assert.doesNotMatch(source,/agent-tree[\s\S]{0,900}resumeSession\(/u);
});
