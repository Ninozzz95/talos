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
  for(const action of ['history-prev','history-next','history-search']){
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
  for(const action of ['history-prev','history-next','history-search']){
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

test('copy-selection-fast-path RED-C1 — existing local seam expands only to non-destructive copy-selection',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  const base={
    bootPhase:'ready',focus:'composer',modalOwner:false,vimMode:'insert',auxCount:0,
    routed:{kind:'action',action:'copy-selection'},editor:createEditorState('alpha beta'),
  };
  assert.equal(
    composer.composerFastEditorAction(base),
    'copy-selection',
    'copy-selection is now owner-authorized for the local fast path',
  );
  for(const action of ['history-prev','history-next','history-search']){
    assert.equal(composer.composerFastEditorAction({...base,routed:{kind:'action',action}}),null,action+' remains outside this slice');
  }
  assert.equal(composer.composerFastEditorAction({...base,focus:'model-picker'}),null);
  assert.equal(composer.composerFastEditorAction({...base,modalOwner:true}),null);
  assert.equal(composer.composerFastEditorAction({...base,bootPhase:'starting'}),null);
  assert.equal(composer.composerFastEditorAction({...base,vimMode:'normal'}),null);
  assert.equal(composer.composerFastEditorAction({...base,auxCount:1}),null);
});

test('copy-selection-fast-path RED-C2 — application exactly reuses non-destructive editor copy semantics',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  const editor:any=await import('../../src/tui/editor.ts');

  const base=editor.createEditorState('alpha beta');
  const atEnd=editor.moveCursor(base,'end');
  const selected=editor.moveCursor(atEnd,'left',true);
  const expected=editor.copySelection(selected);
  const actual=composer.applyComposerFastEditorAction(selected,'copy-selection');
  assert.deepEqual(actual,expected,'copy-selection must delegate to the existing copySelection helper');
  assert.equal(actual.text,selected.text,'copy must not mutate text');
  assert.equal(actual.cursor,selected.cursor,'copy must not move the cursor');
  assert.equal(actual.selectionAnchor,selected.selectionAnchor,'copy must preserve the selection');
  assert.deepEqual(actual.editHistory,selected.editHistory,'copy must not create an undo step');
  assert.equal(actual.killBuffer,selected.text.slice(Math.min(selected.cursor,selected.selectionAnchor),Math.max(selected.cursor,selected.selectionAnchor)));

  const noSelection=editor.createEditorState('abc');
  assert.equal(
    composer.applyComposerFastEditorAction(noSelection,'copy-selection'),
    noSelection,
    'copy without a selection must preserve exact object identity',
  );
});

test('history-fast-path RED-H1 — direct history navigation preserves exact clamp blank and index semantics',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  assert.equal(typeof composer.planComposerHistoryAction,'function','history fast-path needs a pure synchronous planner before root-render bypass can be safe');
  const history=['newest command','older command'];
  const base={
    bootPhase:'ready',focus:'composer',modalOwner:false,vimMode:'insert',auxCount:0,
    routed:{kind:'action',action:'history-prev'},key:{ctrl:true},
    editor:createEditorState('draft'),history,historyIndex:-1,reverseIndex:7,
  };

  const first=composer.planComposerHistoryAction(base);
  assert.equal(first.historyIndex,0);
  assert.equal(first.reverseIndex,0);
  assert.equal(first.editor.text,'newest command');
  assert.deepEqual(first.editor.editHistory.past,[],'history substitution must keep using replaceEditorText semantics');

  const older=composer.planComposerHistoryAction({...base,editor:first.editor,historyIndex:first.historyIndex,reverseIndex:first.reverseIndex});
  assert.equal(older.historyIndex,1);
  assert.equal(older.editor.text,'older command');

  const clamped=composer.planComposerHistoryAction({...base,editor:older.editor,historyIndex:1,reverseIndex:4});
  assert.equal(clamped.historyIndex,1,'previous-history must clamp at the oldest retained row');
  assert.equal(clamped.editor.text,'older command');
  assert.equal(clamped.reverseIndex,0);

  const newer=composer.planComposerHistoryAction({...base,routed:{kind:'action',action:'history-next'},key:{ctrl:true},editor:older.editor,historyIndex:1,reverseIndex:9});
  assert.equal(newer.historyIndex,0);
  assert.equal(newer.editor.text,'newest command');
  assert.equal(newer.reverseIndex,0);

  const blank=composer.planComposerHistoryAction({...base,routed:{kind:'action',action:'history-next'},key:{ctrl:true},editor:newer.editor,historyIndex:0,reverseIndex:9});
  assert.equal(blank.historyIndex,-1);
  assert.equal(blank.editor.text,'','TALOS currently returns to a blank editor at history index -1; do not silently add draft restoration');
  assert.equal(blank.reverseIndex,0);

  const emptyEditor=createEditorState('keep');
  const empty=composer.planComposerHistoryAction({...base,editor:emptyEditor,history:[],historyIndex:-1,reverseIndex:3});
  assert.equal(empty.editor,emptyEditor,'empty history must be a semantic identity no-op');
  assert.equal(empty.historyIndex,-1);
  assert.equal(empty.reverseIndex,3,'no history means the current reverse index is untouched, matching the early return');

  for(const patch of [
    {focus:'model-picker'},
    {modalOwner:true},
    {vimMode:'normal'},
    {auxCount:1},
    {bootPhase:'starting'},
  ]){
    assert.equal(composer.planComposerHistoryAction({...base,...patch}),null,'ownership guards remain fail closed');
  }
});

test('history-fast-path RED-H2 — ordinary Up Down preserve multiline and selection behavior before history fallback',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  const editor:any=await import('../../src/tui/editor.ts');
  const history=['history newest','history older'];
  const base={
    bootPhase:'ready',focus:'composer',modalOwner:false,vimMode:'insert',auxCount:0,key:{ctrl:false},
    history,historyIndex:-1,reverseIndex:5,
  };

  const multiline=editor.createEditorState('abcdef\nxy');
  const expectedUp=editor.moveVertical(multiline,-1);
  const localUp=composer.planComposerHistoryAction({...base,routed:{kind:'action',action:'history-prev'},editor:multiline});
  assert.deepEqual(localUp.editor,expectedUp,'Up inside multiline input must remain local cursor movement');
  assert.equal(localUp.historyIndex,-1);
  assert.equal(localUp.reverseIndex,5,'local cursor movement must not rewrite history-search cursors');

  const selected=editor.moveCursor(editor.createEditorState('abc'),'left',true);
  const collapsed=editor.moveVertical(selected,-1);
  const localSelection=composer.planComposerHistoryAction({...base,routed:{kind:'action',action:'history-prev'},editor:selected});
  assert.deepEqual(localSelection.editor,collapsed,'Up at the first line must collapse an existing selection before browsing history');
  assert.equal(localSelection.historyIndex,-1);

  const topBoundary=editor.createEditorState('draft');
  const historyUp=composer.planComposerHistoryAction({...base,routed:{kind:'action',action:'history-prev'},editor:topBoundary});
  assert.equal(historyUp.historyIndex,0,'Up at the top boundary falls through to history');
  assert.equal(historyUp.editor.text,'history newest');
  assert.equal(historyUp.reverseIndex,0);

  const topOfMultiline=editor.moveVertical(editor.createEditorState('abcdef\nxy'),-1);
  const expectedDown=editor.moveVertical(topOfMultiline,1);
  const localDown=composer.planComposerHistoryAction({...base,routed:{kind:'action',action:'history-next'},editor:topOfMultiline});
  assert.deepEqual(localDown.editor,expectedDown,'Down inside multiline input must remain local cursor movement');
  assert.equal(localDown.historyIndex,-1);

  const historyDown=composer.planComposerHistoryAction({...base,routed:{kind:'action',action:'history-next'},editor:createEditorState('history newest'),historyIndex:0,reverseIndex:6});
  assert.equal(historyDown.historyIndex,-1,'Down at the bottom boundary leaves history browsing');
  assert.equal(historyDown.editor.text,'');
  assert.equal(historyDown.reverseIndex,0);
});

test('history-fast-path RED-H3 — reverse search preserves current TALOS query match and miss-reset behavior',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  const history=['deploy prod','fix tests','deploy staging'];
  const base={
    bootPhase:'ready',focus:'composer',modalOwner:false,vimMode:'insert',auxCount:0,
    routed:{kind:'action',action:'history-search'},key:{ctrl:true},history,historyIndex:-1,
  };

  const matched=composer.planComposerHistoryAction({...base,editor:createEditorState('deploy'),reverseIndex:0});
  assert.equal(matched.historyIndex,0);
  assert.equal(matched.reverseIndex,1);
  assert.equal(matched.editor.text,'deploy prod');

  const later=composer.planComposerHistoryAction({...base,editor:createEditorState('deploy'),reverseIndex:1});
  assert.equal(later.historyIndex,2);
  assert.equal(later.reverseIndex,3);
  assert.equal(later.editor.text,'deploy staging');

  const beforeMiss=createEditorState('missing');
  const missed=composer.planComposerHistoryAction({...base,editor:beforeMiss,historyIndex:1,reverseIndex:2});
  assert.equal(missed.editor,beforeMiss,'reverse-search miss must leave the editor untouched');
  assert.equal(missed.historyIndex,1,'reverse-search miss must leave history index untouched');
  assert.equal(missed.reverseIndex,0,'reverse-search miss resets only the reverse-search cursor');
});

test('paste-ime-fast-path RED-Paste1 — ownership and routed multi-char eligibility are fail-closed',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  assert.equal(typeof composer.composerOwnsPaste,'function','explicit paste needs a pure ownership seam before bracketed-paste can bypass root rendering');
  assert.equal(typeof composer.composerFastPasteInput,'function','multi-character useInput needs a distinct fail-closed eligibility seam');

  const context={bootPhase:'ready',focus:'composer',modalOwner:false,vimMode:'insert',auxCount:0};
  assert.equal(composer.composerOwnsPaste(context),true);
  assert.equal(composer.composerOwnsPaste({...context,bootPhase:'starting'}),false);
  assert.equal(composer.composerOwnsPaste({...context,focus:'command-menu'}),false);
  assert.equal(composer.composerOwnsPaste({...context,modalOwner:true}),false);
  assert.equal(composer.composerOwnsPaste({...context,vimMode:'normal'}),false);
  assert.equal(composer.composerOwnsPaste({...context,auxCount:1}),false);

  const base={...context,key:{ctrl:false,meta:false},routed:{kind:'text',text:'hello'}};
  assert.equal(composer.composerFastPasteInput(base),'hello');
  assert.equal(composer.composerFastPasteInput({...base,routed:{kind:'text',text:'会丢失内容'}}),'会丢失内容');
  assert.equal(composer.composerFastPasteInput({...base,routed:{kind:'text',text:'a\nb'}}),'a\nb');
  assert.equal(composer.composerFastPasteInput({...base,routed:{kind:'text',text:'a'}}),null,'one ordinary character remains owned by the existing single-character fast path');
  assert.equal(composer.composerFastPasteInput({...base,routed:{kind:'action',action:'left'}}),null);
  assert.equal(composer.composerFastPasteInput({...base,key:{ctrl:true,meta:false}}),null);
  assert.equal(composer.composerFastPasteInput({...base,key:{ctrl:false,meta:true}}),null);
  assert.equal(composer.composerFastPasteInput({...base,focus:'model-picker'}),null);
  assert.equal(composer.composerFastPasteInput({...base,modalOwner:true}),null);
  assert.equal(composer.composerFastPasteInput({...base,vimMode:'normal'}),null);
  assert.equal(composer.composerFastPasteInput({...base,auxCount:1}),null);
});

test('paste-ime-fast-path RED-Paste2 — paste application is exactly the existing insertPaste semantics',async()=>{
  const composer:any=await import('../../src/tui/components/composer.ts');
  const editor:any=await import('../../src/tui/editor.ts');
  assert.equal(typeof composer.applyComposerFastPasteInput,'function','paste fast path must delegate to the existing insertPaste primitive');

  const simple=editor.createEditorState('ab');
  assert.deepEqual(composer.applyComposerFastPasteInput(simple,'XYZ'),editor.insertPaste(simple,'XYZ'));

  const atEnd=editor.moveCursor(editor.createEditorState('alpha beta'),'end');
  const selected=editor.moveWord(atEnd,-1,true);
  assert.deepEqual(
    composer.applyComposerFastPasteInput(selected,'Ω🙂'),
    editor.insertPaste(selected,'Ω🙂'),
    'selection replacement must preserve the exact current editor contract',
  );

  const multiline='one\ntwo\nthree';
  assert.deepEqual(
    composer.applyComposerFastPasteInput(editor.createEditorState(''),multiline),
    editor.insertPaste(editor.createEditorState(''),multiline),
  );

  const large='x'.repeat(4096);
  const actualLarge=composer.applyComposerFastPasteInput(editor.createEditorState('seed'),large);
  const expectedLarge=editor.insertPaste(editor.createEditorState('seed'),large);
  assert.deepEqual(actualLarge,expectedLarge);
  assert.equal(actualLarge.collapsedPastes.length,1,'4096-char paste must retain collapsed-paste metadata');

  const manyLines=Array.from({length:20},(_,i)=>'line '+i).join('\n');
  const actualLines=composer.applyComposerFastPasteInput(editor.createEditorState(''),manyLines);
  assert.deepEqual(actualLines,editor.insertPaste(editor.createEditorState(''),manyLines));
  assert.equal(actualLines.collapsedPastes.length,1,'20-line paste must retain collapsed-paste metadata');

  for(const exact of ['会丢失内容','A👩‍💻e\u0301界','a\r\nb\rc']){
    const base=editor.createEditorState('>');
    const actual=composer.applyComposerFastPasteInput(base,exact);
    const expectedPaste=editor.insertPaste(base,exact);
    assert.deepEqual(actual,expectedPaste);
    assert.equal(actual.text,'>'+exact,'fast path must preserve the exact input string without trimming or newline normalization');
    assert.deepEqual(actual.editHistory,expectedPaste.editHistory,'edit history must remain byte-for-byte structurally equivalent');
  }
});

