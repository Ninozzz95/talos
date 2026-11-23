import assert from 'node:assert/strict';
import test from 'node:test';
import {createEditorState} from '../../src/tui/editor.ts';
import {initialTuiState} from '../../src/tui/state.ts';
import {createTuiAppState} from '../../src/tui/shell-model.ts';
import {deriveShellLayout,pickerWindow} from '../../src/tui/shell-layout.ts';

test('M2-A-RED-2 — shell layout is a deterministic Ink-free view model',()=>{
  const state=initialTuiState({model:'openai:gpt-5-mini',permissionMode:'default'});
  state.running=true;
  state.messages=[{id:'u1',role:'user',text:'hello'}];
  state.streamingAssistant={id:'a1',text:'world'};
  state.reasoning={id:'r1',text:'thinking'};
  state.usage={prompt_tokens:10,completion_tokens:5};
  state.status.contextLabel='10+5';

  const appState=createTuiAppState(createEditorState('draft'));
  appState.reasoningVisible=true;
  const layout=deriveShellLayout({
    state,
    appState,
    viewport:{offset:0,pageSize:12,unseen:2,followingTail:false},
    terminalRows:30,
    terminalColumns:100,
    projectRoot:'C:\\work\\repo',
    currentModelContextWindow:1000,
    queuedActions:[{id:'q1',kind:'follow-up',text:'next task'}],
    busySince:123,
    bullet:'•',
    branch:'└',
  } as any);

  assert.equal(layout.rows,15);
  assert.equal(layout.columns,100);
  assert.equal(layout.desiredPageSize,7);
  assert.equal(layout.messages.length,1);
  assert.equal(layout.live?.id,'a1');
  assert.equal(layout.reasoning,'thinking');
  /* R3 Q-R3-7 (gate E7, review D-08): answer text is streaming here, so the status says `writing` (it said `thinking`). */
  assert.deepEqual(layout.activity,{kind:'writing',startedAt:123});
  assert.match(layout.shortcutLine,/mode manual/u);/* R4 Q-R4-12: the default mode reads `manual` */
  /* R5a Q-R5-2, review D-14: the model is named once, on the status row (the last row), no longer on the roster too. */
  assert.match(layout.footerLine,/model openai:gpt-5-mini/u);
  assert.doesNotMatch(layout.rosterLine,/openai:gpt-5-mini/u);
  /* F-Q1 (owner 03/10, «metterla inline»): no queue line under the composer; the strip keeps the count */
  assert.equal(layout.queueLine,'');
  assert.match(layout.shortcutLine,/queue 1/u);
  assert.equal(Array.isArray(layout.visual),true);
  assert.equal(layout.toolRowsLimit,5);

  assert.deepEqual(pickerWindow(['a','b','c','d'],2,2),{start:1,rows:['b','c']});
});

test('shell layout has no React Ink controller or runtime dependency',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../../src/tui/shell-layout.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/from ['"]react['"]|from ['"]ink['"]|session-controller|CliRuntime/u);
});

test('app consumes the shell layout instead of redeclaring the main derived chrome',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/deriveShellLayout/u);
  assert.doesNotMatch(source,/const statusKind=state\.running/u);
  assert.doesNotMatch(source,/const shortcutLine=terminalShortcutStrip/u);
});
