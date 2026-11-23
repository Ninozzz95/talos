/*
 * P-A (owner 07/10 sera, «Compositore subito»; registro 12 Voce 16): the short boot no longer holds the logo, and a launch that
 * has nothing to load starts on the composer. Q-R4-4 (600 ms hold, owner 02/10) is superseded by this decision; the full boot
 * (first launch, after an update) and the static one (no motion) are unchanged. Competitors read in code before the change:
 * Pi `interactive-mode.ts` init (the editor is focused and accepts text while startup completes), Codex `startup_draft.rs`
 * («keep the first composer editable and bottom-anchored while startup work continues»).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {bootRevealMs,completeBoot,createBootState,initialBootState,markBootReady,SHORT_BOOT_MS,STATIC_BOOT_MS} from '../../src/tui/boot/boot-sequence.ts';
import {TALOS_BOOT_DURATION_MS} from '../../src/tui/boot/cinematic.ts';

test('P-A the short boot holds nothing; the full and the static boot keep their length',()=>{
  assert.equal(SHORT_BOOT_MS,0);
  assert.equal(bootRevealMs({mode:'short',motion:true}),0);
  assert.equal(bootRevealMs({mode:'short',motion:false}),0);
  assert.equal(bootRevealMs({mode:'full',motion:true}),TALOS_BOOT_DURATION_MS);
  assert.equal(bootRevealMs({mode:'full',motion:false}),STATIC_BOOT_MS);
});

test('P-A only a plain short start opens on the composer; a resume, a fork, a prompt and every full boot keep their boot',()=>{
  const plain=initialBootState({mode:'short',plainStart:true,now:1_000});
  assert.equal(plain.phase,'ready');assert.equal(plain.runtimeReady,true);assert.equal(plain.skipped,false);assert.equal(plain.startedAt,1_000);
  assert.deepEqual(initialBootState({mode:'short',plainStart:false,now:1_000}),createBootState(1_000),'something to load: the boot stays until the runtime is ready');
  assert.deepEqual(initialBootState({mode:'full',plainStart:true,now:1_000}),createBootState(1_000),'first launch / after an update: the full boot');
  assert.deepEqual(initialBootState({mode:'full',plainStart:false,now:1_000}),createBootState(1_000));
});

test('P-A a start with something to load: the zero-length reveal ends at once and the composer opens the moment the runtime is ready',()=>{
  const start=initialBootState({mode:'short',plainStart:false,now:0});
  assert.equal(completeBoot(start,0).phase,'waiting','the reveal is over at once; the runtime is not ready yet');
  assert.equal(markBootReady(completeBoot(start,0),250).phase,'ready','the runtime becomes ready: the composer opens at once');
  assert.equal(completeBoot(markBootReady(start,250),250).phase,'ready','a runtime ready before the reveal signalled its end');
});
