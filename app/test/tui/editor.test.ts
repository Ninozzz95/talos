import assert from 'node:assert/strict';
import test from 'node:test';
import {createEditorState,editInsert,moveCursor,moveWord,deleteBackward,deleteForward,killToStart,killToEnd,killWordBackward,yank,replaceEditorText,moveVertical} from '../../src/tui/editor.ts';

test('editor inserts at cursor and supports left right home end',()=>{
 let s=createEditorState('ac');s=moveCursor(s,'left');s=editInsert(s,'b');assert.equal(s.text,'abc');assert.equal(s.cursor,2);
 s=moveCursor(s,'home');assert.equal(s.cursor,0);s=moveCursor(s,'end');assert.equal(s.cursor,3);
});

test('editor navigates by word and deletes backward/forward at cursor',()=>{
 let s=createEditorState('one two three');s=moveCursor(s,'end');s=moveWord(s,-1);assert.equal(s.cursor,8);s=deleteForward(s);assert.equal(s.text,'one two hree');s=deleteBackward(s);assert.equal(s.text,'one twohree');assert.equal(s.cursor,7);
});

test('editor kill/yank operations preserve a yank buffer',()=>{
 let s=createEditorState('alpha beta');s=moveCursor(s,'end');s=killWordBackward(s);assert.equal(s.text,'alpha ');assert.equal(s.killBuffer,'beta');s=yank(s);assert.equal(s.text,'alpha beta');
 s=moveCursor(s,'home');s=moveCursor(s,'right');s=killToEnd(s);assert.equal(s.text,'a');assert.equal(s.killBuffer,'lpha beta');s=yank(s);assert.equal(s.text,'alpha beta');
 s=moveCursor(s,'end');s=moveCursor(s,'left');s=killToStart(s);assert.equal(s.text,'a');assert.equal(s.killBuffer,'alpha bet');
});

test('replaceEditorText resets cursor and local edit history',()=>{const state=replaceEditorText(createEditorState('x'),'hello');assert.equal(state.text,'hello');assert.equal(state.cursor,5);assert.equal(state.killBuffer,'');assert.deepEqual(state.collapsedPastes,[]);assert.deepEqual(state.editHistory.past,[]);assert.deepEqual(state.editHistory.future,[]);});


test('vertical navigation preserves the preferred column across short multiline rows',()=>{
 let s=createEditorState('abcdef\nxy\nabcdef');
 s={...s,cursor:5};
 s=moveVertical(s,1);assert.equal(s.cursor,9); // short middle line: clamps after xy
 s=moveVertical(s,1);assert.equal(s.cursor,15); // returns to preferred column 5 on long line
 s=moveVertical(s,-1);assert.equal(s.cursor,9);
 s=moveVertical(s,-1);assert.equal(s.cursor,5);
});

test('vertical navigation stays put at first and last line so history can take over',()=>{
 let top={...createEditorState('a\nb'),cursor:0};
 assert.equal(moveVertical(top,-1).cursor,0);
 let bottom=createEditorState('a\nb');
 assert.equal(moveVertical(bottom,1).cursor,bottom.cursor);
});

test('home end and line kill operations stay on the current multiline row',()=>{
 let s=createEditorState('alpha\nbeta gamma\nomega');
 s={...s,cursor:11}; // beta |gamma, middle row starts at 6
 s=moveCursor(s,'home');assert.equal(s.cursor,6);
 s=moveCursor(s,'end');assert.equal(s.cursor,16);
 s={...s,cursor:11};s=killToStart(s);assert.equal(s.text,'alpha\ngamma\nomega');assert.equal(s.cursor,6);assert.equal(s.killBuffer,'beta ');
 s=createEditorState('alpha\nbeta gamma\nomega');s={...s,cursor:10};s=killToEnd(s);assert.equal(s.text,'alpha\nbeta\nomega');assert.equal(s.cursor,10);assert.equal(s.killBuffer,' gamma');
});

test('cursor movement never splits emoji or combining graphemes',async()=>{
  const {insertPaste,composerSegments,remapCollapsedPastes}=await import('../../src/tui/editor.ts');
  let s=createEditorState('A👍🏽界');
  s=moveCursor(s,'left');assert.equal(s.text.slice(s.cursor),'界');
  s=moveCursor(s,'left');assert.equal(s.text.slice(s.cursor),'👍🏽界');

  const pasted=Array.from({length:40},(_,i)=>`line ${i}`).join('\n');
  const p=insertPaste(createEditorState(''),pasted);assert.equal(p.text,pasted);
  const rendered=composerSegments(p).map(x=>x.text).join('');assert.match(rendered,/40 lines/u);assert.ok(rendered.length<pasted.length);
  const paste={start:10,end:30,chars:20,lines:20};
  assert.deepEqual(remapCollapsedPastes([paste],0,0,2),[{...paste,start:12,end:32}]);
  assert.deepEqual(remapCollapsedPastes([paste],15,1,1),[]);
});
