/*
 * Stage 3, the plan card (owner 02/10: «e» opens the plan in the editor and the model re-proposes it, like Gemini CLI). The
 * edited plan goes back to the MODEL as the correction of «keep planning» (plan-contract.mjs `feedback`): words for the
 * model, in English, never from the screen's dictionary (gate E2), and within the kernel's limit (LIMITI_PIANO.feedbackMax).
 */
export const PLAN_FEEDBACK_MAX=4_000;

/** The correction for an edited plan, or null when it would not fit the kernel's limit (the screen says so instead). */
export function planEditFeedback(editedPlan:string):string|null{
  const feedback='The user edited your plan. Propose this version, unchanged unless something in it is wrong:\n\n'+editedPlan.trim();
  return feedback.length>PLAN_FEEDBACK_MAX?null:feedback;
}
