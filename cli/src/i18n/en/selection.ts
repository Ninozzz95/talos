/* Stage 6c (owner 02/10, «selezione della CLI»): what the toast says after a copy, as the approved mockup writes it
   («Copied 3 lines · Windows clipboard», «Copied "budget"»; MOCKUP-FASE-UI-2026-10-01.html:1118-1119). One area (R2). */
export const selection={
  'screen.selection.copiedLines.one':'Copied {count} line · {where}',
  'screen.selection.copiedLines.other':'Copied {count} lines · {where}',
  'screen.selection.copiedWord':'Copied "{word}"',
  'screen.selection.where.windows':'Windows clipboard',
  'screen.selection.where.mac':'clipboard',
  'screen.selection.where.linux':'clipboard',
  'screen.selection.where.terminal':'terminal clipboard',
  'screen.selection.failed':'Not copied: no clipboard was found',
} as const;
