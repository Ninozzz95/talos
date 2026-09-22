import assert from 'node:assert/strict';
import test from 'node:test';
import {EDITOR_HISTORY_LIMIT} from '../../src/tui/editor-history.ts';
import {createEditorState,editInsert,insertPaste,redoEditor,undoEditor} from '../../src/tui/editor.ts';

test('editor undo history is bounded and stops at the retained boundary',()=>{
  let state=createEditorState('');
  for(let index=0;index<EDITOR_HISTORY_LIMIT+5;index++)state=editInsert(state,String(index%10));
  assert.equal(state.editHistory.past.length,EDITOR_HISTORY_LIMIT);
  for(let index=0;index<EDITOR_HISTORY_LIMIT;index++)state=undoEditor(state);
  const retained=state.text;
  assert.ok(retained.length>0,'the bounded stack must discard the oldest snapshots instead of growing forever');
  assert.equal(undoEditor(state).text,retained);
});

test('redo restores an undone edit and a fresh edit invalidates redo',()=>{
  let state=createEditorState('');
  state=editInsert(state,'a');
  state=editInsert(state,'b');
  state=undoEditor(state);
  assert.equal(state.text,'a');
  state=redoEditor(state);
  assert.equal(state.text,'ab');
  state=undoEditor(state);
  state=editInsert(state,'c');
  assert.equal(state.text,'ac');
  assert.equal(redoEditor(state).text,'ac');
});

test('one collapsed paste is one undo transaction including paste metadata',()=>{
  const pasted=Array.from({length:25},(_,index)=>`line ${index}`).join('\n');
  let state=insertPaste(createEditorState(''),pasted);
  assert.equal(state.collapsedPastes.length,1);
  state=undoEditor(state);
  assert.equal(state.text,'');
  assert.deepEqual(state.collapsedPastes,[]);
  state=redoEditor(state);
  assert.equal(state.text,pasted);
  assert.equal(state.collapsedPastes.length,1);
  assert.equal(state.collapsedPastes[0]?.lines,25);
});
