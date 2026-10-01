import assert from 'node:assert/strict';
import test from 'node:test';
import {accorciaTesto, CARATTERI_MINIMI_RIDUCIBILI, MARCATORE_ACCORCIATO, riduciCodaSottoPressione} from '../src/kernel/compattazione-desktop.mjs';

test('READ23-PROVENANCE: context omission identifies TALOS and cannot be mistaken for a file byte range',()=>{
  const shortened=accorciaTesto('€'.repeat(9000));
  assert.ok(shortened.includes(MARCATORE_ACCORCIATO));
  assert.match(shortened,/TALOS context projection/);
  assert.match(shortened,/not a byte range/);
  assert.match(shortened,/7,400 characters omitted/);
});

test('READ23-RECOVERY: recover retained bytes with read tools, never by repeating a command',()=>{
  const shortened=accorciaTesto('x'.repeat(10000));
  // LEGGI IBRIDA (owner, 30/09 sera): il rimando dice il contratto nuovo, righe più byteOffset, mai i byte di READ22
  assert.match(shortened,/leggi \(offset\/limit are lines; byteOffset continues inside an over-long line\)/);
  assert.doesNotMatch(shortened,/offset\/limit in bytes/);
  assert.match(shortened,/process_output.*outputId.*available/);
  assert.match(shortened,/Do not re-run a command to recover omitted bytes/);
  assert.doesNotMatch(shortened,/re-run the command if you need/);
});

test('READ23-BUDGET: recovery instructions still fit the existing projection and remain idempotent',()=>{
  const original='HEAD\n'+'x'.repeat(10000)+'\nTAIL';
  const shortened=accorciaTesto(original);
  assert.ok(shortened.startsWith('HEAD\n'));assert.ok(shortened.endsWith('\nTAIL'));
  assert.ok(shortened.length<CARATTERI_MINIMI_RIDUCIBILI);
  assert.equal(accorciaTesto(shortened),shortened);
  assert.match(shortened,/Original message kept in session history/);
});

test('READ23-ARCHIVE: pressure shortens only the projection, preserving original tool text and identity',()=>{
  const original=[
    {role:'assistant',content:null,tool_calls:[{id:'read23',type:'function',function:{name:'leggi',arguments:'{"percorso":"file.txt"}'}}]},
    {role:'tool',tool_call_id:'read23',content:'HEAD\n'+'x'.repeat(40000)+'\nTAIL'},
    {role:'assistant',content:'ok'},
  ];
  const before=structuredClone(original);
  const result=riduciCodaSottoPressione(original,{budgetToken:1000,stima:messages=>Math.ceil(JSON.stringify(messages).length/4)});
  assert.deepEqual(original,before);
  assert.equal(result.coda[1].tool_call_id,'read23');
  assert.ok(result.coda[1].content.length<original[1].content.length);
  assert.match(result.coda[1].content,/TALOS context projection/);
  assert.equal(result.alMinimo,false);
});
