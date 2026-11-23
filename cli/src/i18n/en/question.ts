/* Stage 3 (owner 01-02/10): the words of the question card, its receipt and notices, as the approved mockup writes them
   (step «domande del modello», golden frames step-03-*). One area of its own (R2: one file per area), so no sentence of the
   card is written in code. */
export const question={
  'screen.question.title':'TALOS asks',
  /* stage 6b: a sub-agent's question moved into the card says which agent asks */
  'screen.question.agentTitle':'Agent asks · {task}',
  'screen.question.agentUnnamed':'unnamed task',
  'screen.question.position':' · {n} of {total}',
  'screen.question.unanswered':' · {count} unanswered',
  'screen.question.closesIn':' · closes in {clock}',
  'screen.question.review':'Review',
  'screen.question.ready':'Ready to send your answers?',
  'screen.question.skipped':'— skipped',
  'screen.question.send':'Send answers',
  'screen.question.change':'Change',
  'screen.question.reviewHint':'enter send · ←/→ change · esc cancel',
  'screen.question.hint':'{toggle}enter {next} · tab note · ←/→ questions · ctrl+] skip · esc cancel',
  'screen.question.hint.toggle':'space toggle · ',
  'screen.question.hint.next':'next',
  'screen.question.hint.toReview':'review',
  'screen.question.recommended':'(Recommended)',
  'screen.question.other':'Other',
  'screen.question.other.description':'type your own answer',
  'screen.question.note':'note: ',
  'screen.question.noteAdded':'Note added to this answer',
  'screen.question.preview':'preview',
  /* the receipt in the transcript (mockup «◆ Your answers») and what the transcript says when nobody answered */
  'screen.question.receipt':'Your answers',
  'screen.question.receipt.skipped':'skipped',
  'screen.question.cancelled':'You cancelled the questions; TALOS was told and decides without them.',
  'screen.question.expired':'Nobody answered in time: the questions closed and TALOS went on with its own judgment, saying what it assumed.',
  /* the activity line while the card waits (mockup «? Waiting for your answer · 5s · the turn is paused until you answer») */
  'screen.question.waiting':'Waiting for your answer',
  'screen.question.paused':'the turn is paused until you answer',
} as const;
