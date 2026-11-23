import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createEditorState} from '../../src/tui/editor.ts';
import {
  closeOverlay,
  createTuiAppState,
  queuedActionPreview,
  reduceAppAction,
  slashCommandIntent,
  slashCommandToCliArgs,
  togglePlanMode,
} from '../../src/tui/shell-model.ts';

test('M2-A-RED-1 — shell model owns app state and semantic intents without React or Ink',async()=>{
  let state=createTuiAppState(createEditorState('draft'));
  state=reduceAppAction(state,{type:'key-action',action:'model-picker'});
  assert.deepEqual(state.overlay,{kind:'model'});
  assert.equal(state.focus.current,'model-picker');
  assert.equal(state.editor.text,'draft');
  state=closeOverlay(state);
  assert.equal(state.focus.current,'composer');

  assert.deepEqual(slashCommandIntent('/provider'),{kind:'open-overlay',overlay:{kind:'provider'}});
  assert.deepEqual(slashCommandIntent('/resume s1'),{kind:'session-id',action:'resume',id:'s1'});
  assert.deepEqual(slashCommandIntent('/redraw'),{kind:'key-action',action:'redraw'});
  assert.equal(togglePlanMode('default','default'),'plan');
  assert.deepEqual(slashCommandToCliArgs('mcp',[]),['mcp','list']);

  const preview=queuedActionPreview('safe\u001b[2J\u202Ehidden\nnext');
  assert.match(preview,/\\u001b/u);
  assert.match(preview,/\\u202e/u);
  assert.equal(preview.includes('\n'),false);

  const source=await readFile(new URL('../../src/tui/shell-model.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/from ['"]react['"]|from ['"]ink['"]|session-controller|CliRuntime/u);
});

test('app keeps moved shell-model symbols as compatibility re-exports',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/from ['"]\.\/shell-model\.ts['"]/u);
  assert.doesNotMatch(source,/export function createTuiAppState\(/u);
  assert.doesNotMatch(source,/export function slashCommandIntent\(/u);
});
