import assert from 'node:assert/strict';
import test from 'node:test';
import {commandMenuItems} from '../../src/tui/components/command-menu.ts';
import {SLASH_COMMANDS} from '../../src/tui/slash-commands.ts';

test('command-menu-fast-path RED-CM1 — local selection store publishes synchronous clamp reset and page semantics',async()=>{
  const menu:any=await import('../../src/tui/components/command-menu.ts');
  assert.equal(typeof menu.createCommandMenuSelectionStore,'function','command-menu selection needs a dedicated synchronous local store before query typing can bypass root rendering');

  const store=menu.createCommandMenuSelectionStore();
  assert.deepEqual(store.getSnapshot(),{query:'',selected:0,pageSize:10});
  let notifications=0;
  const unsubscribe=store.subscribe(()=>{notifications++;});

  store.move(5,'down');
  assert.equal(store.getSnapshot().selected,1);
  assert.equal(notifications,1);

  store.move(25,'page-down');
  assert.equal(store.getSnapshot().selected,11,'page movement must reuse the existing ten-row SelectionState semantics');
  assert.equal(notifications,2);

  store.move(25,'end');
  assert.equal(store.getSnapshot().selected,24);
  assert.equal(notifications,3);

  store.move(3,'down');
  assert.equal(store.getSnapshot().selected,2,'movement must clamp to the newly supplied filtered-row count');
  assert.equal(notifications,4);

  store.reset();
  assert.deepEqual(store.getSnapshot(),{query:'',selected:0,pageSize:10});
  assert.equal(notifications,5);

  store.reset();
  assert.equal(notifications,5,'an identity-equivalent reset must not publish a redundant render');
  unsubscribe();
});

test('command-menu-fast-path RED-CM2 — routed query eligibility is pure and fail-closed',async()=>{
  const menu:any=await import('../../src/tui/components/command-menu.ts');
  assert.equal(typeof menu.commandMenuFastTextInput,'function','command-menu query input needs a pure fail-closed eligibility seam');

  const base={
    bootPhase:'ready',
    focus:'command-menu',
    modalOwner:false,
    key:{ctrl:false,meta:false},
    routed:{kind:'text',text:'m'},
  };

  assert.equal(menu.commandMenuFastTextInput(base),'m');
  assert.equal(menu.commandMenuFastTextInput({...base,routed:{kind:'text',text:'odel'}}),'odel','multi-character IME/paste bursts retain existing command-menu editInsert semantics');

  for(const patch of [
    {bootPhase:'starting'},
    {focus:'composer'},
    {modalOwner:true},
    {key:{ctrl:true,meta:false}},
    {key:{ctrl:false,meta:true}},
    {routed:{kind:'action',action:'picker-down'}},
    {routed:{kind:'ignore'}},
    {routed:{kind:'text',text:''}},
  ]){
    assert.equal(menu.commandMenuFastTextInput({...base,...patch}),null,'ambiguous or semantic input must remain on the coordinator path');
  }
});

test('command-menu-fast-path RED-CM3 — existing TALOS command ranking and description search remain the invariant',()=>{
  const all=commandMenuItems('/');
  assert.equal(all.length,SLASH_COMMANDS.length,'empty slash query must expose the same full command registry');

  const prefix=commandMenuItems('/mod');
  assert.equal(prefix[0]?.command.name,'model','prefix ranking must stay unchanged');

  const description=commandMenuItems('/diagnostics');
  assert.equal(description[0]?.command.name,'doctor','descriptions must remain searchable through the existing filterItems searchText');

  const subsequence=commandMenuItems('/mry');
  assert.ok(subsequence.some(row=>row.command.name==='memory'),'existing subsequence matching must remain available');

  assert.deepEqual(commandMenuItems('/zzzzzz'),[],'non-matches must stay empty');
});
