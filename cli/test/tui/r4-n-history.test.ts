/*
 * R4 lane N — Q-R4-9 / gate E9: a recalled paste stays collapsed in the composer and the model still receives exactly what
 * was pasted. History entries carry the paste blocks with the text (Claude Code keeps `display` + `pastedContents` per
 * history record, 2.1.281 bytes, gate §7); the text itself is never rewritten.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {composerSegments,createEditorState,draftOf,editorFromDraft,insertPaste} from '../../src/tui/editor.ts';
import {planComposerHistoryAction,reverseHistoryMatch} from '../../src/tui/components/composer.ts';

const PASTE=Array.from({length:60},(_,i)=>`line ${i+1} of a pasted log\twith a tab`).join('\r\n');
const shown=(editor:ReturnType<typeof createEditorState>)=>composerSegments(editor).map(segment=>segment.text).join('');

test('R4-N a draft keeps its paste blocks and comes back collapsed, byte for byte',()=>{
  const typed=insertPaste(createEditorState('see: '),PASTE);
  const draft=draftOf(typed);
  assert.equal(draft.text,'see: '+PASTE);
  assert.deepEqual(draft.collapsedPastes,[{start:5,end:5+PASTE.length,chars:PASTE.length,lines:60,id:1}]);/* UI Phase 1: pastes are numbered */
  const back=editorFromDraft(draft);
  assert.equal(back.text,typed.text,'the text the model receives is byte-identical');
  assert.equal(back.cursor,back.text.length);
  assert.equal(shown(back),`see: [Pasted text #1 +59 lines] `);
  draft.collapsedPastes[0]!.start=0;
  assert.equal(back.collapsedPastes[0]!.start,5,'the restored editor does not share the history entry');
});

test('R4-N a paste block that no longer fits the text is dropped, never drawn over the wrong characters',()=>{
  const back=editorFromDraft({text:'short',collapsedPastes:[{start:2,end:400,chars:398,lines:30}]});
  assert.deepEqual(back.collapsedPastes,[]);
  assert.equal(editorFromDraft('plain text').text,'plain text');
});

test('R4-N Up recalls the paste collapsed; Down past the newest entry empties the composer',()=>{
  const entry=draftOf(insertPaste(createEditorState(''),PASTE));
  const base={bootPhase:'ready',focus:'composer',modalOwner:false,vimMode:'disabled',auxCount:0,routed:{kind:'action',action:'history-prev'},key:{},editor:createEditorState(''),history:[entry,'older prompt'],historyIndex:-1,reverseIndex:0};
  const up=planComposerHistoryAction(base)!;
  assert.equal(up.historyIndex,0);
  assert.equal(up.editor.text,PASTE);
  assert.equal(shown(up.editor),`[Pasted text #1 +59 lines] `);
  const older=planComposerHistoryAction({...base,editor:up.editor,historyIndex:0,key:{ctrl:true}})!;
  assert.equal(older.editor.text,'older prompt');
  const back=planComposerHistoryAction({...base,routed:{kind:'action',action:'history-next'},key:{ctrl:true},editor:older.editor,historyIndex:1})!;
  assert.equal(shown(back.editor),`[Pasted text #1 +59 lines] `);
  const search=planComposerHistoryAction({...base,routed:{kind:'action',action:'history-search'},editor:createEditorState('line 30'),history:[entry]})!;
  assert.equal(search.editor.text,PASTE);
  assert.equal(shown(search.editor),`[Pasted text #1 +59 lines] `,'reverse search recalls the paste collapsed too');
  assert.deepEqual(reverseHistoryMatch([entry,'deploy'],'deploy',0),{index:1,value:'deploy'});
});
