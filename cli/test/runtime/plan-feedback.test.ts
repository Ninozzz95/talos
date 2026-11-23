/* Stage 3, the plan card: an edited plan goes back to the model as «keep planning» feedback, within the kernel's limit. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {PLAN_FEEDBACK_MAX,planEditFeedback} from '../../src/runtime/plan-feedback.ts';

test('an edited plan becomes the correction for the model; past the kernel\'s limit it is refused here, not by the kernel',()=>{
  const feedback=planEditFeedback('  1. Do the thing\n2. Check it  ');
  assert.equal(feedback,'The user edited your plan. Propose this version, unchanged unless something in it is wrong:\n\n1. Do the thing\n2. Check it');
  assert.equal(PLAN_FEEDBACK_MAX,4_000,'plan-contract.mjs LIMITI_PIANO.feedbackMax');
  const room=PLAN_FEEDBACK_MAX-planEditFeedback('')!.length;
  assert.ok(planEditFeedback('x'.repeat(room)));
  assert.equal(planEditFeedback('x'.repeat(room+1)),null);
});
