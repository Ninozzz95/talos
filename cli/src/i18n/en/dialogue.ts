/* Stage 3 (owner 02/10: «dialogo agenti visibile»): the words of the parent↔child dialogue in the transcript. One area (R2). */
export const dialogue={
  'screen.dialogue.childAsks':'{agent} asks: ',
  'screen.dialogue.parentAsks':'TALOS asks {agent}: ',
  'screen.dialogue.answer':'answer: ',
  'screen.dialogue.unnamed':'An agent',
  'screen.dialogue.unnamedObject':'an agent',
  /* why a question was not answered (the kernel's dialogue `reason`) */
  'screen.dialogue.cancelled.recipient':'not answered: the agent closed',
  'screen.dialogue.cancelled.parent':'not answered: TALOS stopped',
  'screen.dialogue.cancelled.delivery':'not answered: it could not be delivered',
  'screen.dialogue.cancelled.journal':'not answered: it could not be saved',
  'screen.dialogue.cancelled.other':'not answered',
} as const;
