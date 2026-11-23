/*
 * UI plan, Phase 1 (27/09): pastes like Claude Code 2.1.283 (over 800 characters or more than 2 line breaks becomes
 * `[Pasted text #N +X lines]`, pasting the same text again expands it) and atomic like Pi (the cursor skips the
 * placeholder, Backspace removes it whole). Owner decisions 27/09 in docs/talos-cli/2026-09-27-ui-improvements-research-and-plan.md §8.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {composerSegments,createEditorState,deleteBackward,deleteForward,draftDisplayText,draftOf,editInsert,insertPaste,moveCursor,moveWord,pasteLabel} from '../../src/tui/editor.ts';
import {historyRowText} from '../../src/tui/overlays/history-picker.ts';
import {composerHints,composerMeasure} from '../../src/tui/regions/views.ts';

const shown=(state:ReturnType<typeof createEditorState>)=>composerSegments(state).map(segment=>segment.text).join('');
const lines=(n:number)=>Array.from({length:n},(_,i)=>`line ${i+1}`).join('\n');

test('P1 paste: over 2 line breaks or over 800 characters it becomes a numbered placeholder; under both it stays text', () => {
  const small=insertPaste(createEditorState(),lines(3));
  assert.equal(small.collapsedPastes.length,0,'3 lines = 2 breaks: stays text');
  const four=insertPaste(createEditorState(),lines(4));
  assert.equal(four.collapsedPastes.length,1);
  assert.equal(pasteLabel(four.collapsedPastes[0]!),'[Pasted text #1 +3 lines]');
  const long=insertPaste(createEditorState(),'x'.repeat(801));
  assert.equal(pasteLabel(long.collapsedPastes[0]!),'[Pasted text #1]','one long line: no line count');
  assert.equal(insertPaste(createEditorState(),'x'.repeat(800)).collapsedPastes.length,0,'800 exactly stays text');
  const two=insertPaste(editInsert(four,' and '),lines(5));
  assert.equal(pasteLabel(two.collapsedPastes[1]!),'[Pasted text #2 +4 lines]','the second paste is #2');
  assert.equal(two.text,lines(4)+' and '+lines(5),'the text keeps every byte');
});

test('P1 paste: the placeholder is one block — the cursor skips it and is never drawn inside it', () => {
  const state=editInsert(insertPaste(createEditorState('see: '),lines(10)),' end');
  const label='[Pasted text #1 +9 lines]';
  assert.equal(shown(state),`see: ${label} end `);
  let at=moveCursor(moveCursor(moveCursor(moveCursor(state,'left'),'left'),'left'),'left');
  assert.equal(at.cursor,5+lines(10).length,'at the end of the paste');
  at=moveCursor(at,'left');
  assert.equal(at.cursor,5,'one step left jumps to its start');
  assert.equal(shown(at),`see: ${label} end`,'still a placeholder with the cursor at its edge');
  at=moveCursor(at,'right');
  assert.equal(at.cursor,5+lines(10).length,'one step right jumps to its end');
  assert.equal(moveWord(at,-1).cursor<=5,true,'a word step never lands inside it');
});

test('P1 paste (owner: Backspace removes it all): Backspace after it, Delete before it, remove the whole paste', () => {
  const pasted=insertPaste(createEditorState('see: '),lines(10));
  const back=deleteBackward(pasted);
  assert.equal(back.text,'see: ');assert.equal(back.collapsedPastes.length,0);
  const before=moveCursor(pasted,'left');
  const forward=deleteForward(before);
  assert.equal(forward.text,'see: ');assert.equal(forward.collapsedPastes.length,0);
});

test('P1 paste (owner: like Claude Code): pasting the same text again right after it expands it in place', () => {
  const pasted=insertPaste(createEditorState(),lines(10));
  const again=insertPaste(pasted,lines(10));
  assert.equal(again.text,lines(10),'nothing inserted twice');
  assert.equal(again.collapsedPastes.length,0,'expanded');
  const other=insertPaste(pasted,lines(12));
  assert.equal(other.collapsedPastes.length,2,'a different text is a new paste');
});

test('P1 paste (owner: the transcript shows the placeholder): the display text and the history row use the label', () => {
  const draft=draftOf(editInsert(insertPaste(createEditorState('explain '),lines(40)),' please'));
  assert.equal(draftDisplayText(draft),'explain [Pasted text #1 +39 lines] please');
  assert.equal(draft.text,'explain '+lines(40)+' please','the model gets all of it');
  assert.equal(historyRowText(draft),'explain [Pasted text #1 +39 lines] please');
  /* a history row written before the ids existed is numbered by its order */
  assert.equal(draftDisplayText({text:'a'+lines(4),collapsedPastes:[{start:1,end:1+lines(4).length,chars:lines(4).length,lines:4}]}),'a[Pasted text #1 +3 lines]');
});

test('P1 paste: with the cursor right after a collapsed paste the composer says "paste again to expand", and counts that row', () => {
  const pasted=insertPaste(createEditorState(),lines(10));
  assert.ok(composerHints(pasted,'').includes('paste again to expand'));
  assert.equal(composerMeasure(pasted,100,'').hints,composerHints(pasted,'').length,'the height budget counts the same rows');
  assert.ok(!composerHints(editInsert(pasted,' more'),'').includes('paste again to expand'),'typing after it: the hint goes');
});
