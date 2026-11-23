import assert from 'node:assert/strict';
import test from 'node:test';
import {composerSegments,copySelection,createEditorState,deleteBackward,deleteForward,editInsert,moveCursor,selectionRange,yank} from '../../src/tui/editor.ts';

function selectedText(state:ReturnType<typeof createEditorState>){
  const range=selectionRange(state);
  return range?state.text.slice(range.start,range.end):'';
}

test('selection extends only across complete grapheme clusters',()=>{
  let state=createEditorState('Ae\u0301👍🏽Z');
  state=moveCursor(state,'left');
  state=moveCursor(state,'left',true);
  assert.equal(selectedText(state),'👍🏽');
  state=moveCursor(state,'left',true);
  assert.equal(selectedText(state),'e\u0301👍🏽');
});

test('typing and both delete directions replace or delete one active selection atomically',()=>{
  let state=createEditorState('alpha beta');
  state=moveCursor(state,'home');
  for(let i=0;i<5;i++)state=moveCursor(state,'right',true);
  state=editInsert(state,'A');
  assert.equal(state.text,'A beta');
  assert.equal(selectionRange(state),null);

  state=createEditorState('alpha beta');
  state=moveCursor(state,'home');
  for(let i=0;i<5;i++)state=moveCursor(state,'right',true);
  assert.equal(deleteBackward(state).text,' beta');
  assert.equal(deleteForward(state).text,' beta');
});

test('copy selection writes the existing yank buffer without deleting text or stealing Ctrl+C semantics',()=>{
  let state=createEditorState('alpha beta');
  state=moveCursor(state,'home');
  for(let i=0;i<5;i++)state=moveCursor(state,'right',true);
  const copied=copySelection(state);
  assert.equal(copied.text,'alpha beta');
  assert.equal(copied.killBuffer,'alpha');
  assert.deepEqual(selectionRange(copied),{start:0,end:5});

  state=moveCursor(copied,'end');
  state=yank(state);
  assert.equal(state.text,'alpha betaalpha');
});

test('composer marks selected text without expanding an unrelated collapsed paste',async()=>{
  const {insertPaste}=await import('../../src/tui/editor.ts');
  const large=Array.from({length:25},(_,index)=>`row ${index}`).join('\n');
  let state=insertPaste(createEditorState('prefix '),large);
  state={...state,cursor:0};
  for(let i=0;i<6;i++)state=moveCursor(state,'right',true);
  const segments=composerSegments(state);
  assert.equal(segments.filter(segment=>segment.selected).map(segment=>segment.text).join(''),'prefix');
  assert.ok(segments.some(segment=>segment.kind==='paste'&&!segment.selected));
});
