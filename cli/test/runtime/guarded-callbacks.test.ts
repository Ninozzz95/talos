/*
 * F-015 (desktop, additive kernel contract): `onArtefatto(titolo, html, { copiaInLibreria })` — false in read-only sessions and
 * in Workflow steps, so a read-only session leaves no copy in the Library. The CLI wraps the kernel's mutating callbacks to take
 * its checkpoint first (talos-composition.ts); the wrapper must hand every argument on unchanged, the third included, or the
 * kernel's choice is lost and the service falls back to its default (a copy). The kernel and the service are proven by the
 * desktop's tests/rev-artifact-readonly-library.test.mjs (4/4 on this vendor); this pins the CLI's own link.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {GUARDED_KERNEL_CALLBACKS,guardKernelCallbacks} from '../../src/runtime/guarded-callbacks.ts';

test('F-015: the checkpoint wrapper hands the artifact\'s copiaInLibreria on unchanged, after the checkpoint',async()=>{
  const order:string[]=[];const received:unknown[][]=[];
  const guarded=guardKernelCallbacks({onArtefatto:async(...args:unknown[])=>{order.push('kernel');received.push(args);return{ok:true};},altro:()=>'x'},
    async(info:{tipo:string})=>{order.push(`checkpoint:${info.tipo}`);});
  const result=await (guarded.onArtefatto as any)('Report','<p>x</p>',{copiaInLibreria:false});
  assert.deepEqual(received,[['Report','<p>x</p>',{copiaInLibreria:false}]],'all three arguments, unchanged');
  assert.deepEqual(order,['checkpoint:onArtefatto','kernel'],'the checkpoint first');
  assert.deepEqual(result,{ok:true});
  assert.equal(Object.hasOwn(guarded,'altro'),false,'only the mutating callbacks are wrapped');
  assert.equal(Object.hasOwn(guarded,'onDelega'),false,'a callback the input does not have is not invented');
  assert.deepEqual([...GUARDED_KERNEL_CALLBACKS],['onDelega','onArtefatto','onAggiornaArtefatto','chiamaToolMcpFn','eseguiToolPluginFn','eseguiToolForgeFn']);
});

/* review 1 of 0.6.14 (A-1, S3): artifact_update writes a new version into the Library (agent-service.mjs onAggiornaArtefatto) and
   took no checkpoint, so a turn with only that tool left `talos checkpoint undo` in CHECKPOINT_CONFLICT on the entry's content and
   earlier turns could not be undone. It is guarded like onArtefatto: the checkpoint first, every argument on unchanged. */
test('A-1: artifact_update takes the checkpoint first and hands its three arguments on unchanged',async()=>{
  const order:string[]=[];const received:unknown[][]=[];
  const guarded=guardKernelCallbacks({onAggiornaArtefatto:async(...args:unknown[])=>{order.push('kernel');received.push(args);return{ok:true,versione:2};}},
    async(info:{tipo:string})=>{order.push(`checkpoint:${info.tipo}`);});
  assert.equal(typeof guarded.onAggiornaArtefatto,'function','onAggiornaArtefatto is wrapped');
  const result=await (guarded.onAggiornaArtefatto as any)('lib-1',{html:'<p>v2</p>'},{titolo:'Chart',copiaInLibreria:false});
  assert.deepEqual(order,['checkpoint:onAggiornaArtefatto','kernel']);
  assert.deepEqual(received,[['lib-1',{html:'<p>v2</p>'},{titolo:'Chart',copiaInLibreria:false}]]);
  assert.deepEqual(result,{ok:true,versione:2});
});
