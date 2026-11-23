/* Stage 3 (owner 02/10): the words of the plan card and of the approved plan in the transcript, as the approved mockup writes
   them (step «permessi e piano», golden frames step-04-*), plus the two keys the owner added (a, c). One area of its own (R2). */
export const plan={
  'screen.plan.title':'Plan mode',
  'screen.plan.subtitle':' · TALOS proposes this plan and waits for you',
  'screen.plan.approve':'Approve and start',
  'screen.plan.edit':'Edit the plan',
  'screen.plan.keep':'Keep planning',
  'screen.plan.hint':'enter approve · e edit · esc keep planning',
  'screen.plan.editTooLong':'The edited plan is too long to send back as a correction (at most {max} characters). Shorten it, or press Esc and say what to change.',
  'screen.plan.moreKeys':'a approve and accept edits · c approve in a clean conversation',
  'screen.plan.more.one':'… +{count} more step · e opens the whole plan',
  'screen.plan.more.other':'… +{count} more steps · e opens the whole plan',
  /* the approved plan in the transcript (mockup «▣ Plan proposed · 4 steps») */
  'screen.plan.receipt':'Plan proposed',
  'screen.plan.steps.one':'{count} step',
  'screen.plan.steps.other':'{count} steps',
} as const;
