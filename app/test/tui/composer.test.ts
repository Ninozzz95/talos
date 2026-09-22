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

