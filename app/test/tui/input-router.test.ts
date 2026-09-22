import assert from 'node:assert/strict';
import test from 'node:test';
import {routeInput} from '../../src/tui/input-router.ts';

test('question mark is help only for empty composer',()=>{
  assert.deepEqual(routeInput({ch:'?',key:{},focus:'composer',composerText:'',commandMenuOpen:false}),{kind:'action',action:'help'});
  assert.deepEqual(routeInput({ch:'?',key:{},focus:'composer',composerText:'abc',commandMenuOpen:false}),{kind:'text',text:'?'});
});

test('slash is command menu only at command-expression start',()=>{
  assert.deepEqual(routeInput({ch:'/',key:{},focus:'composer',composerText:'   ',commandMenuOpen:false}),{kind:'action',action:'command-menu'});
  assert.deepEqual(routeInput({ch:'/',key:{},focus:'composer',composerText:'url ',commandMenuOpen:false}),{kind:'text',text:'/'});
});

test('focused approval consumes escape before global interrupt',()=>{
  assert.deepEqual(routeInput({ch:'',key:{escape:true},focus:'approval',composerText:'',commandMenuOpen:false}),{kind:'action',action:'approval-cancel'});
});

test('picker and composer shortcuts route through semantic registry',()=>{
  assert.deepEqual(routeInput({ch:'l',key:{ctrl:true},focus:'composer',composerText:'',commandMenuOpen:false}),{kind:'action',action:'model-picker'});
  assert.deepEqual(routeInput({ch:'p',key:{meta:true},focus:'composer',composerText:'',commandMenuOpen:false}),{kind:'action',action:'provider-picker'});
  assert.deepEqual(routeInput({ch:'',key:{downArrow:true},focus:'model-picker',composerText:'',commandMenuOpen:false}),{kind:'action',action:'picker-down'});
});

test('focused command and searchable pickers still accept printable query text',()=>{
  assert.deepEqual(routeInput({ch:'m',key:{},focus:'command-menu',composerText:'/',commandMenuOpen:true}),{kind:'text',text:'m'});
  assert.deepEqual(routeInput({ch:'g',key:{},focus:'model-picker',composerText:'draft',commandMenuOpen:false}),{kind:'text',text:'g'});
  assert.deepEqual(routeInput({ch:'s',key:{},focus:'session-picker',composerText:'draft',commandMenuOpen:false}),{kind:'text',text:'s'});
});

test('composer can route transcript paging without changing focus',()=>{
  assert.deepEqual(routeInput({ch:'',key:{pageUp:true},focus:'composer',composerText:'draft',commandMenuOpen:false}),{kind:'action',action:'page-up'});
});


test('M2-D input router uses supplied effective keymap instead of global defaults',async()=>{
  const {assertValidKeymap}=await import('../../src/tui/keymap-resolver.ts');
  const keymap=assertValidKeymap({'model-picker':['Alt+M']});
  assert.deepEqual(
    routeInput({ch:'m',key:{meta:true},focus:'composer',composerText:'',commandMenuOpen:false,keymap}),
    {kind:'action',action:'model-picker'},
  );
  assert.deepEqual(
    routeInput({ch:'l',key:{ctrl:true},focus:'composer',composerText:'',commandMenuOpen:false,keymap}),
    {kind:'ignore'},
  );
});


test('M2-D remapping help removes the hard-coded empty-composer question-mark shortcut',async()=>{
  const {assertValidKeymap}=await import('../../src/tui/keymap-resolver.ts');
  const keymap=assertValidKeymap({help:['Alt+H']});
  assert.deepEqual(
    routeInput({ch:'?',key:{},focus:'composer',composerText:'',commandMenuOpen:false,keymap}),
    {kind:'text',text:'?'},
  );
  assert.deepEqual(
    routeInput({ch:'h',key:{meta:true},focus:'composer',composerText:'',commandMenuOpen:false,keymap}),
    {kind:'action',action:'help'},
  );
});
