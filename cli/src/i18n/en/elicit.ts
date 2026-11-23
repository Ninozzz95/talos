/* Stage 3 (owner 02/10): the words of the MCP elicitation card and its notices, as the approved mockup writes them
   (step «server MCP che chiedono», golden frames step-17-*). One area of its own (R2). */
export const elicit={
  'screen.elicit.formTitle':' (MCP server) {message}',
  'screen.elicit.urlTitle':' (MCP server) asks you to open a page',
  'screen.elicit.domain':'  domain: ',
  'screen.elicit.domainNote':' · opens in your browser, never inside TALOS',
  'screen.elicit.send':'Review and send',
  'screen.elicit.open':'Open in browser',
  'screen.elicit.decline':'Decline',
  'screen.elicit.formHint':'↑/↓ field · type to edit · space toggle · esc cancel',
  'screen.elicit.urlHint':'enter open · d decline · esc cancel',
  'screen.elicit.yes':'[x] yes',
  'screen.elicit.no':'[ ] no',
  'screen.elicit.missing':'{field} needs a value before sending.',
  /* what the transcript says (mockup notices) */
  'screen.elicit.opened':'Opened {url} in your browser · waiting for {server} to confirm',
  'screen.elicit.declined':'You declined: {server} will not get access.',
  'screen.elicit.cancelled':'Cancelled.',
  /* the exit transcript keeps a form's fields, never its values (review 1, owner 02/10) */
  'screen.elicit.sentField':'{field} · sent',
  'screen.elicit.openFailed':'Could not open the browser: open {url} yourself.',
  'screen.elicit.answerYes':'yes',
  'screen.elicit.answerNo':'no',
} as const;
