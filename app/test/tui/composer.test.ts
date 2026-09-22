import assert from 'node:assert/strict';
import test from 'node:test';
import {reverseHistoryMatch} from '../../src/tui/components/composer.ts';
import {createEditorState,editInsert} from '../../src/tui/editor.ts';
import {routeInput} from '../../src/tui/input-router.ts';
import {commandMenuItems} from '../../src/tui/components/command-menu.ts';

test('reverse history search advances through matching entries without mutating history',()=>{
  const history=['deploy prod','fix tests','deploy staging'];
  assert.deepEqual(reverseHistoryMatch(history,'deploy',0),{index:0,value:'deploy prod'});
  assert.deepEqual(reverseHistoryMatch(history,'deploy',1),{index:2,value:'deploy staging'});
  assert.deepEqual(history,['deploy prod','fix tests','deploy staging']);
});

test('command menu fuzzy filters registry descriptions and completes selection',()=>{
  const rows=commandMenuItems('/mod');
  assert.equal(rows[0]?.command.name,'model');
});

test('input-fast-path RED-I1 — composer store publishes synchronous latest snapshots under burst input',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  assert.equal(typeof composer.createComposerStore,'function','the focused composer needs a local external store before root-render bypass can be safe');
  const store=composer.createComposerStore(createEditorState(''));
  let notifications=0;
  const unsubscribe=store.subscribe(()=>{notifications++;});

  store.update((editor:any)=>editInsert(editor,'a'));
  assert.equal(store.getSnapshot().text,'a');
  store.update((editor:any)=>editInsert(editor,'b'));
  assert.equal(store.getSnapshot().text,'ab','the second burst key must observe the first key synchronously');
  store.update((editor:any)=>editInsert(editor,'c'));
  assert.equal(store.getSnapshot().text,'abc','burst handlers must never read the pre-render React value');
  assert.equal(notifications,3,'one notification is emitted for each changed editor object');

  const same=store.getSnapshot();
  store.update(()=>same);
  assert.equal(notifications,3,'identity no-ops must not wake the composer subscriber');

  store.replace(createEditorState('x'));
  assert.equal(store.getSnapshot().text,'x');
  store.update((editor:any)=>editInsert(editor,'y'));
  assert.equal(store.getSnapshot().text,'xy','replace must be immediately visible to the next update');
  assert.equal(notifications,5);
  unsubscribe();
});

test('input-fast-path RED-I2 — only one unambiguous ordinary composer character is eligible',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  assert.equal(typeof composer.composerFastTextInput,'function','fast-path eligibility must be a pure fail-closed seam');
  const ordinary=routeInput({ch:'a',key:{},focus:'composer',composerText:'draft',commandMenuOpen:false});
  const base={
    bootPhase:'ready',focus:'composer',modalOwner:false,vimMode:'insert',auxCount:0,
    key:{ctrl:false,meta:false},routed:ordinary,
  };
  assert.equal(composer.composerFastTextInput(base),'a');

  const slash=routeInput({ch:'/',key:{},focus:'composer',composerText:'',commandMenuOpen:false});
  assert.equal(composer.composerFastTextInput({...base,routed:slash}),null,'leading slash must keep command-menu semantics');
  assert.equal(composer.composerFastTextInput({...base,key:{ctrl:true,meta:false}}),null);
  assert.equal(composer.composerFastTextInput({...base,key:{ctrl:false,meta:true}}),null);
  assert.equal(composer.composerFastTextInput({...base,routed:{kind:'text',text:'paste'}}),null,'multi-character paste remains on the semantic path');
  assert.equal(composer.composerFastTextInput({...base,modalOwner:true}),null);
  assert.equal(composer.composerFastTextInput({...base,vimMode:'normal'}),null);
  assert.equal(composer.composerFastTextInput({...base,auxCount:1}),null);
  assert.equal(composer.composerFastTextInput({...base,bootPhase:'starting'}),null);
  assert.equal(composer.composerFastTextInput({...base,focus:'command-menu'}),null);
});

test('word-selection-fast-path RED-W1 — existing local seam expands only to authorized word and selection actions',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  assert.equal(typeof composer.composerFastEditorAction,'function','local editor fast-path needs an explicit fail-closed eligibility seam');
  const base={
    bootPhase:'ready',focus:'composer',modalOwner:false,vimMode:'insert',auxCount:0,
    routed:{kind:'action',action:'left'},editor:createEditorState('abc'),
  };
  for(const action of ['backspace','left','right','home','end']){
    assert.equal(composer.composerFastEditorAction({...base,routed:{kind:'action',action}}),action);
  }
  assert.equal(composer.composerFastEditorAction({...base,routed:{kind:'action',action:'delete-forward'}}),'delete-forward');
  assert.equal(composer.composerFastEditorAction({...base,routed:{kind:'action',action:'delete-forward'},editor:createEditorState('')}),null,'empty delete must preserve TALOS global exit/fallback semantics');
  for(const action of ['word-left','word-right','select-left','select-right','select-home','select-end','select-up','select-down','select-word-left','select-word-right']){
    assert.equal(composer.composerFastEditorAction({...base,routed:{kind:'action',action}}),action,action+' is now owner-authorized for the local fast path');
  }
  for(const action of ['copy-selection','history-prev','history-next','history-search']){
    assert.equal(composer.composerFastEditorAction({...base,routed:{kind:'action',action}}),null,action+' remains outside the authorized slice');
  }
  assert.equal(composer.composerFastEditorAction({...base,focus:'model-picker'}),null);
  assert.equal(composer.composerFastEditorAction({...base,modalOwner:true}),null);
  assert.equal(composer.composerFastEditorAction({...base,bootPhase:'starting'}),null);
  assert.equal(composer.composerFastEditorAction({...base,vimMode:'normal'}),null);
  assert.equal(composer.composerFastEditorAction({...base,auxCount:1}),null);
  assert.equal(composer.composerFastEditorAction({...base,routed:{kind:'text',text:'a'}}),null);
});

test('local-editor-fast-path RED-L2 — local application reuses existing immutable grapheme-safe editor semantics',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  assert.equal(typeof composer.applyComposerFastEditorAction,'function','local action application must be a pure seam over the existing editor operations');

  const {deleteBackward,deleteForward,moveCursor}=await import('../../src/tui/editor.ts');
  const family=createEditorState('a👩‍💻b');
  const beforeB=moveCursor(family,'left');
  assert.deepEqual(
    composer.applyComposerFastEditorAction(beforeB,'backspace'),
    deleteBackward(beforeB),
    'Backspace must preserve current grapheme/selection/history behavior exactly',
  );

  const forward=moveCursor(createEditorState('abc'),'home');
  assert.deepEqual(composer.applyComposerFastEditorAction(forward,'delete-forward'),deleteForward(forward));
  assert.deepEqual(composer.applyComposerFastEditorAction(createEditorState('abc'),'left'),moveCursor(createEditorState('abc'),'left'));
  assert.deepEqual(composer.applyComposerFastEditorAction(createEditorState('abc'),'right'),moveCursor(createEditorState('abc'),'right'));
  assert.deepEqual(composer.applyComposerFastEditorAction(createEditorState('a\nb'),'home'),moveCursor(createEditorState('a\nb'),'home'));
  assert.deepEqual(composer.applyComposerFastEditorAction(createEditorState('a\nb'),'end'),moveCursor(createEditorState('a\nb'),'end'));
});


test('word-selection-fast-path RED-W2 — application exactly reuses current word and selection editor semantics',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  const {moveCursor,moveVertical,moveWord}=await import('../../src/tui/editor.ts');

  let wordBase=createEditorState('alpha beta gamma');
  wordBase=moveCursor(wordBase,'end');
  assert.deepEqual(composer.applyComposerFastEditorAction(wordBase,'word-left'),moveWord(wordBase,-1),'word-left must be delegated to the existing moveWord helper');
  assert.deepEqual(composer.applyComposerFastEditorAction(wordBase,'word-right'),moveWord(wordBase,1));

  const cursorBase=moveCursor(createEditorState('alpha beta'),'right');
  for(const [action,direction] of [['select-left','left'],['select-right','right'],['select-home','home'],['select-end','end']] as const){
    const actual=composer.applyComposerFastEditorAction(cursorBase,action);
    const expected=moveCursor(cursorBase,direction,true);
    assert.deepEqual(actual,expected,action+' must preserve selectionAnchor and cursor semantics exactly');
  }

  const verticalBase=moveCursor(createEditorState('abcdef\nxy\n123456'),'end');
  const up=composer.applyComposerFastEditorAction(verticalBase,'select-up');
  assert.deepEqual(up,moveVertical(verticalBase,-1,true));
  assert.equal(up.selectionAnchor,verticalBase.cursor,'first extended vertical move must anchor at the original cursor');
  assert.equal(up.preferredColumn,moveVertical(verticalBase,-1,true).preferredColumn,'vertical preferred column must be preserved');

  const down=composer.applyComposerFastEditorAction(up,'select-down');
  assert.deepEqual(down,moveVertical(up,1,true),'continued vertical selection must retain the existing anchor/preferred-column contract');

  const wordSelectionBase=moveCursor(createEditorState('alpha beta gamma'),'end');
  assert.deepEqual(composer.applyComposerFastEditorAction(wordSelectionBase,'select-word-left'),moveWord(wordSelectionBase,-1,true));
  assert.deepEqual(composer.applyComposerFastEditorAction(wordSelectionBase,'select-word-right'),moveWord(wordSelectionBase,1,true));
});

test('kill-undo-fast-path RED-K1 — existing local seam expands only to authorized kill yank undo redo actions',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  const base={
    bootPhase:'ready',focus:'composer',modalOwner:false,vimMode:'insert',auxCount:0,
    routed:{kind:'action',action:'kill-start'},editor:createEditorState('alpha beta'),
  };
  for(const action of ['kill-start','kill-end','kill-word','yank','undo','redo']){
    assert.equal(
      composer.composerFastEditorAction({...base,routed:{kind:'action',action}}),
      action,
      action+' is now owner-authorized for the local fast path',
    );
  }
  for(const action of ['copy-selection','history-prev','history-next','history-search']){
    assert.equal(composer.composerFastEditorAction({...base,routed:{kind:'action',action}}),null,action+' stays on the semantic fallback path');
  }
  assert.equal(composer.composerFastEditorAction({...base,focus:'model-picker'}),null);
  assert.equal(composer.composerFastEditorAction({...base,modalOwner:true}),null);
  assert.equal(composer.composerFastEditorAction({...base,bootPhase:'starting'}),null);
  assert.equal(composer.composerFastEditorAction({...base,vimMode:'normal'}),null);
  assert.equal(composer.composerFastEditorAction({...base,auxCount:1}),null);
});

test('kill-undo-fast-path RED-K2 — application exactly reuses current kill yank undo redo editor semantics',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  const editor:any=await import('../../src/tui/editor.ts');

  let killBase=editor.createEditorState('alpha beta');
  killBase=editor.moveCursor(killBase,'end');
  assert.deepEqual(composer.applyComposerFastEditorAction(killBase,'kill-word'),editor.killWordBackward(killBase));
  assert.deepEqual(composer.applyComposerFastEditorAction(killBase,'kill-start'),editor.killToStart(killBase));

  const middle=editor.moveCursor(editor.moveCursor(editor.createEditorState('alpha beta'),'home'),'right');
  assert.deepEqual(composer.applyComposerFastEditorAction(middle,'kill-end'),editor.killToEnd(middle));

  const selected=editor.moveCursor(editor.moveCursor(editor.createEditorState('alpha beta'),'end'),'left',true);
  assert.deepEqual(
    composer.applyComposerFastEditorAction(selected,'kill-start'),
    editor.killToStart(selected),
    'selection-aware kill must keep using the existing cut/kill-buffer contract',
  );

  const killed=editor.killWordBackward(editor.moveCursor(editor.createEditorState('alpha beta'),'end'));
  assert.equal(killed.killBuffer,'beta');
  assert.deepEqual(composer.applyComposerFastEditorAction(killed,'yank'),editor.yank(killed));

  const edited=editor.editInsert(editor.createEditorState('abc'),'d');
  const expectedUndo=editor.undoEditor(edited);
  const actualUndo=composer.applyComposerFastEditorAction(edited,'undo');
  assert.deepEqual(actualUndo,expectedUndo,'undo must restore the exact existing snapshot/history contract');

  const expectedRedo=editor.redoEditor(expectedUndo);
  const actualRedo=composer.applyComposerFastEditorAction(actualUndo,'redo');
  assert.deepEqual(actualRedo,expectedRedo,'redo must restore the exact existing snapshot/history contract');

  const pasted=editor.insertPaste(editor.createEditorState('seed'),'x'.repeat(4096));
  const pastedUndo=composer.applyComposerFastEditorAction(pasted,'undo');
  assert.deepEqual(pastedUndo,editor.undoEditor(pasted));
  assert.deepEqual(pastedUndo.collapsedPastes,[],'undo must restore collapsed-paste metadata from the editor snapshot');
  const pastedRedo=composer.applyComposerFastEditorAction(pastedUndo,'redo');
  assert.deepEqual(pastedRedo,editor.redoEditor(pastedUndo));
  assert.equal(pastedRedo.collapsedPastes.length,1,'redo must restore collapsed-paste metadata through the existing history');
});

