import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute the production function with isolated view/DOM collaborators. No copied implementation.
const source = readFileSync(new URL('../../src/components/impostazioni.js', import.meta.url), 'utf8');
const start = source.indexOf('export function mostraSezioneImpostazioni(');
const end = source.indexOf('export function montaImpostazioni(', start);
assert.ok(start >= 0 && end > start);
const functionSource = source.slice(start, end).replace('export function', 'function');
function fixture(section = 'appearance') {
  const panels = ['appearance', 'providers'].map(id => ({dataset:{settingsPanel:id},hidden:false}));
  const screen = {dataset:{settingsSection:section},querySelectorAll:()=>panels};
  const calls = [], state = {query:'API key'}, views = new WeakMap();
  views.set(screen, {select(id, preserve = false) {calls.push({id,preserve});if (!preserve) state.query='';}});
  const run = runInNewContext(functionSource+'; mostraSezioneImpostazioni;', {views,SEZIONI_IMPOSTAZIONI:[{id:'appearance'},{id:'providers'}]});
  return {run,screen,calls,state,views,panels};
}
test('same-section repaint preserves text typed before late restoration', () => {
  const f=fixture();f.run(f.screen,'appearance');assert.equal(f.state.query,'API key');assert.equal(f.calls[0].preserve,true);
});
test('a different section clears the old query', () => {
  const f=fixture();f.run(f.screen,'providers');assert.equal(f.state.query,'');assert.equal(f.calls[0].preserve,false);assert.equal(f.screen.dataset.settingsSection,'providers');
});
test('unknown section falls back to appearance without preserving a different section query', () => {
  const f=fixture('providers');f.run(f.screen,'unknown');assert.equal(f.state.query,'');assert.equal(f.screen.dataset.settingsSection,'appearance');
});
test('explicit user choice can still clear before selecting the same section', () => {
  const f=fixture();f.state.query='';f.run(f.screen,'appearance');assert.equal(f.state.query,'');
});
test('missing view keeps panel fallback, and missing screen is harmless', () => {
  const f=fixture();f.views.delete(f.screen);f.run(f.screen,'providers');assert.equal(f.panels[0].hidden,true);assert.equal(f.panels[1].hidden,false);f.run(null,'appearance');
});
