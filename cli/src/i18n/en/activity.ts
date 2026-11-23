/* Stage 4 (owner 01/10 + decisions 02/10): the words of the activity line, as the approved mockup writes them (golden
   frames step-02/03/05; `activityRow` in MOCKUP-FASE-UI-2026-10-01.html). One area of its own (R2). The leading
   separators belong to the words: the line is a row of styled segments. */
export const activity={
  'screen.activity.thinking':'Thinking',
  'screen.activity.writing':'Writing the answer',
  'screen.activity.starting':'Starting',
  'screen.activity.tool':'Running a tool',
  'screen.activity.toolTarget':'{verb} {target}',
  'screen.activity.searchTarget':'{verb} for "{target}"',
  'screen.activity.mcp':'Calling the {server} MCP server',
  'screen.activity.delegating.one':'Delegating to {count} agent',
  'screen.activity.delegating.other':'Delegating to {count} agents',
  'screen.activity.tokens':' · ↓ {tokens} tokens',
  'screen.activity.escToStop':' · esc to stop',
  'screen.activity.agentsWatch':' · alt+a to watch',
  'screen.activity.turn':'   turn {time}',
  'screen.activity.waiting':'Waiting for your answer',
  'screen.activity.waitingNote':' · the turn is paused until you answer',
  /* T5: a notification was sent to a paired device for this wait («sent»: the push service accepted it, RFC 8030 §5) */
  'screen.activity.notifiedOne':' · notification sent to “{device}”',
  'screen.activity.notifiedMany':' · notification sent to {count} devices',
  'screen.activity.notifiedShort':' · notification sent',
  'screen.activity.done':'Done in {time}',
  'screen.activity.stopped':'Stopped after {time}',
  'screen.activity.failed':'Failed after {time}',
  /* a turn whose time nobody measured (replayed): the end without a time, never «0s» */
  'screen.activity.doneUnmeasured':'Done',
  'screen.activity.stoppedUnmeasured':'Stopped',
  'screen.activity.failedUnmeasured':'Failed',
  /* the summary after the turn: measured facts only (owner decision 3) */
  'screen.activity.files.one':'{count} file changed',
  'screen.activity.files.other':'{count} files changed',
  'screen.activity.silentOnce':'the model was silent for {time} once',
  'screen.activity.silentMany':'the model was silent {count} times, the longest {time}',
  'screen.activity.denied.edit':'edit denied',
  'screen.activity.denied.command':'command denied',
  'screen.activity.denied.request':'request denied',
  'screen.activity.deniedMany.one':'{count} request denied',
  'screen.activity.deniedMany.other':'{count} requests denied',
} as const;
