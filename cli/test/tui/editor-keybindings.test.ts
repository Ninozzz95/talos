import assert from 'node:assert/strict';
import test from 'node:test';
import {routeInput} from '../../src/tui/input-router.ts';
import {keybindingHelp} from '../../src/tui/keybindings.ts';

const route=(ch:string,key:Record<string,boolean>)=>routeInput({ch,key,focus:'composer',composerText:'draft',commandMenuOpen:false});

test('M3-A routes undo redo selection and selection-copy as semantic composer actions',()=>{
  assert.deepEqual(route('z',{ctrl:true}),{kind:'action',action:'undo'});
  assert.deepEqual(route('z',{ctrl:true,shift:true}),{kind:'action',action:'redo'});
  assert.deepEqual(route('',{leftArrow:true,shift:true}),{kind:'action',action:'select-left'});
  assert.deepEqual(route('',{rightArrow:true,shift:true}),{kind:'action',action:'select-right'});
  assert.deepEqual(route('',{home:true,shift:true}),{kind:'action',action:'select-home'});
  assert.deepEqual(route('',{end:true,shift:true}),{kind:'action',action:'select-end'});
  assert.deepEqual(route('w',{meta:true}),{kind:'action',action:'copy-selection'});
});

test('M3-A leaves the global safety interrupt on Ctrl+C and advertises the new editor actions',()=>{
  assert.deepEqual(route('c',{ctrl:true}),{kind:'action',action:'interrupt'});
  const help=keybindingHelp();
  assert.match(help,/Ctrl\+Z.*Undo/u);
  assert.match(help,/Ctrl\+Shift\+Z.*Redo/u);
  assert.match(help,/Alt\+W.*Copy selection/u);
});
