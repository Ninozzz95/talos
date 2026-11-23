import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createEditorState,editInsert} from '../../src/tui/editor.ts';
import {keybindingHelp,resolveKeybinding} from '../../src/tui/keybindings.ts';
import {createVimState,handleVimInput,toggleVim,vimModeHint} from '../../src/tui/vim-mode.ts';

const input=(state:ReturnType<typeof createVimState>,editor:ReturnType<typeof createEditorState>,ch:string,key:Record<string,boolean>={})=>
  handleVimInput({state,editor,ch,key});

test('M3-B-RED-1 — Vim mode is disabled by default and explicit toggle enters INSERT',()=>{
  const disabled=createVimState();
  assert.deepEqual(disabled,{enabled:false,mode:'insert'});
  const ignored=input(disabled,createEditorState('abc'),'h');
  assert.equal(ignored.handled,false);
  assert.equal(ignored.editor.text,'abc');

  const enabled=toggleVim(disabled);
  assert.deepEqual(enabled,{enabled:true,mode:'insert'});
  assert.match(vimModeHint(enabled),/VIM INSERT/u);
  assert.equal(toggleVim(enabled).enabled,false);
});

test('M3-B-RED-2 — INSERT Esc enters NORMAL while Ctrl+C remains unconsumed for global safety',()=>{
  let state=toggleVim(createVimState());
  const editor=createEditorState('abc');
  const escaped=input(state,editor,'',{escape:true});
  assert.equal(escaped.handled,true);
  assert.equal(escaped.state.mode,'normal');
  state=escaped.state;

  const interrupt=input(state,editor,'c',{ctrl:true});
  assert.equal(interrupt.handled,false,'Ctrl+C must remain available to the global interrupt route');
  const normalEsc=input(state,editor,'',{escape:true});
  assert.equal(normalEsc.handled,false,'Esc in NORMAL may continue to the existing global route');
});

test('M3-B-RED-3 — NORMAL essentials reuse grapheme-safe TALOS editor primitives',()=>{
  let state={enabled:true,mode:'normal'} as const;
  let editor=createEditorState('A👍🏽 B\nsecond');
  editor={...editor,cursor:editor.text.indexOf(' B')};

  let result=input(state,editor,'h');editor=result.editor;
  assert.equal(editor.text.slice(editor.cursor).startsWith('👍🏽'),true);
  result=input(state,editor,'l');editor=result.editor;
  assert.equal(editor.text.slice(editor.cursor).startsWith(' B'),true);

  result=input(state,editor,'w');editor=result.editor;
  assert.equal(editor.text.slice(editor.cursor).startsWith('B'),true);
  result=input(state,editor,'b');editor=result.editor;
  assert.equal(editor.cursor,0,'b from the start of B must move to the previous word start');

  result=input(state,{...editor,cursor:0},'j');editor=result.editor;
  assert.equal(editor.text.slice(editor.cursor).startsWith('second'),true);
  result=input(state,editor,'k');editor=result.editor;
  assert.equal(editor.cursor,0);

  editor={...createEditorState('one two'),cursor:4};
  assert.equal(input(state,editor,'0').editor.cursor,0);
  assert.equal(input(state,editor,'$').editor.cursor,7);

  editor=createEditorState('A👍🏽B');editor={...editor,cursor:1};
  const deleted=input(state,editor,'x').editor;
  assert.equal(deleted.text,'AB','x must delete one grapheme cluster');

  const unknown=input(state,createEditorState('abc'),'q');
  assert.equal(unknown.handled,true);
  assert.equal(unknown.editor.text,'abc','unknown NORMAL printable input must not insert text');
});

test('M3-B-RED-4 — NORMAL insert-entry commands and undo redo are exact and bounded to TALOS editor state',()=>{
  const normal={enabled:true,mode:'normal'} as const;
  let editor=createEditorState('abc');editor={...editor,cursor:1};

  let result=input(normal,editor,'i');
  assert.equal(result.state.mode,'insert');assert.equal(result.editor.cursor,1);

  result=input(normal,editor,'a');
  assert.equal(result.state.mode,'insert');assert.equal(result.editor.cursor,2);

  result=input(normal,editor,'I');
  assert.equal(result.state.mode,'insert');assert.equal(result.editor.cursor,0);

  result=input(normal,editor,'A');
  assert.equal(result.state.mode,'insert');assert.equal(result.editor.cursor,3);

  editor=editInsert(createEditorState('a'),'b');
  const undone=input(normal,editor,'u');
  assert.equal(undone.editor.text,'a');
  const redone=input(normal,undone.editor,'r',{ctrl:true});
  assert.equal(redone.handled,true);
  assert.equal(redone.editor.text,'ab');
});

test('M3-B-RED-5 — semantic toggle is documented and the app owns modal interception without replacing safety bindings',async()=>{
  assert.equal(resolveKeybinding('v',{meta:true},['composer','global']),'vim-toggle');
  assert.equal(resolveKeybinding('c',{ctrl:true},['composer','global']),'interrupt');
  const help=keybindingHelp();
  assert.match(help,/Alt\+V.*Vim/u);
  assert.match(help,/h\/j\/k\/l/u);
  assert.match(help,/Ctrl\+R/u);

  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/handleVimInput/u);
  assert.match(source,/vimModeHint/u);
  assert.match(source,/action==='vim-toggle'/u);
  assert.match(source,/key\.escape/u);
});
