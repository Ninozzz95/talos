import assert from 'node:assert/strict';
import test from 'node:test';
import {assertValidKeymap,resolveKeymap} from '../../src/tui/keymap-resolver.ts';

test('M2-D-RED-1 — typed overrides replace only known binding keys after chord canonicalization',()=>{
  const result=resolveKeymap({
    'model-picker':['alt+m'],
    'provider-picker':['Ctrl+P'],
  });
  assert.deepEqual(result.diagnostics,[]);
  assert.deepEqual(result.bindings.find(row=>row.id==='model-picker')?.keys,['Alt+M']);
  assert.deepEqual(result.bindings.find(row=>row.id==='provider-picker')?.keys,['Ctrl+P']);
  assert.equal(result.bindings.find(row=>row.id==='model-picker')?.context,'composer');
});

test('M2-D-RED-2 — unknown ids invalid chords duplicates and same-context conflicts are diagnostics',()=>{
  const result=resolveKeymap({
    'not-a-binding':['Ctrl+Q'],
    'model-picker':['Ctrl+Shift+L','Alt+P','alt+p'],
    'provider-picker':['Alt+P'],
  } as any);
  assert.deepEqual(new Set(result.diagnostics.map(row=>row.code)),new Set([
    'KEYMAP_UNKNOWN_BINDING',
    'KEYMAP_CHORD_INVALID',
    'KEYMAP_DUPLICATE_CHORD',
    'KEYMAP_CONFLICT',
  ]));
  assert.throws(()=>assertValidKeymap({
    'model-picker':['Alt+P'],
    'provider-picker':['Alt+P'],
  }), (error:any)=>error?.code==='KEYMAP_INVALID'&&Array.isArray(error?.details?.diagnostics));
});

test('M2-D-RED-3 — reserved safety chords cannot be removed by overrides',()=>{
  const result=resolveKeymap({
    interrupt:['Esc'],
    exit:['Alt+X'],
    'approval-cancel':['Ctrl+C'],
  });
  const reserved=result.diagnostics.filter(row=>row.code==='KEYMAP_RESERVED_CHORD');
  assert.deepEqual(reserved.map(row=>[row.bindingId,row.chord]),[
    ['interrupt','Ctrl+C'],
    ['exit','Ctrl+D'],
    ['approval-cancel','Esc'],
  ]);
  assert.throws(()=>assertValidKeymap({interrupt:[]}),{code:'KEYMAP_INVALID'});
});

test('default keymap remains valid and unchanged when no override exists',()=>{
  const result=resolveKeymap(undefined);
  assert.deepEqual(result.diagnostics,[]);
  assert.ok(result.bindings.some(row=>row.id==='model-picker'&&row.keys.includes('Alt+P')));
  assert.ok(result.bindings.some(row=>row.id==='interrupt'&&row.keys.includes('Ctrl+C')));
});


test('one semantic binding override applies consistently to every context that owns that action id',()=>{
  const result=resolveKeymap({'picker-up':['Ctrl+P']});
  assert.deepEqual(result.diagnostics,[]);
  const pickerUp=result.bindings.filter(row=>row.id==='picker-up');
  assert.ok(pickerUp.length>=3);
  assert.ok(pickerUp.every(row=>row.keys.length===1&&row.keys[0]==='Ctrl+P'));
});
