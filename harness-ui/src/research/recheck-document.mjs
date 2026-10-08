/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchRecheckDocument.ts (57 righe, 11/09/2026).
 *
 * Il ricontrollo, scritto giù così non si deve pagare due volte.
 *
 * Stesso principio del rapporto: un controllo che non lascia traccia è un
 * controllo che viene rifatto ogni volta che qualcuno se lo chiede e — peggio —
 * non si può confrontare con quello di prima. Archiviato in Libreria accanto al
 * dossier di cui parla.
 *
 * La frase più semplice del file è quella sulle fonti irraggiungibili: la
 * pagina è sparita E il testo è ancora qui. È la frase che nessun concorrente
 * può scrivere, e vale la pena spenderci una riga.
 *
 * ⛔ E porta in coda un blocco che si RILEGGE esatto: la prosa qui sopra è
 * per una persona, e ricavarne i numeri ripassando l'italiano stampato è il
 * modo in cui una misura diventa un'invenzione. Senza, «quanto vale oggi un
 * rapporto di ieri» resta una domanda a cui il file non sa rispondere.
 */

import { talosResearchRecheckStanding } from './recheck.mjs';
import { talosResearchRecheckBlock } from './recheck-history.mjs';

/** @typedef {import('./recheck.mjs').TalosResearchRecheck} TalosResearchRecheck */

/**
 * @param {string} question
 * @param {TalosResearchRecheck} recheck
 * @param {string} runId
 * @returns {string}
 */
export function talosResearchRecheckDocument(question, recheck, runId) {
  const standing = talosResearchRecheckStanding(recheck);

  return [
    `# Recheck — ${question}`,
    '',
    `Recheck date: ${recheck.at}`,
    '',
    `Sources rechecked: ${standing.total}`,
    `- intact: ${standing.intact}`,
    `- changed since research day: ${standing.changed}`,
    `- no longer responding: ${standing.unreachable}`,
    standing.passagesLost > 0
      ? `\n**${standing.passagesLost} cited passages are no longer in their source.**`
      : '\nAll cited passages are still in their sources.',
    standing.unreachable > 0
      ? '\nSources that no longer respond remain readable here: the extracted text\nwas preserved on the day of research.'
      : '',
    '',
    '## Source by source',
    ...recheck.sources.map((source) => {
      const head = source.state === 'unreachable'
        ? `no longer responds${source.reason ? ` (${source.reason})` : ''}`
        : source.state === 'intact'
          ? `intact (${Math.round((source.survived ?? 0) * 100)}% of original text is still there)`
          : `changed (${Math.round((source.survived ?? 0) * 100)}% of original text is still there)`;
      const quotes = source.passagesLost > 0
        ? `  ${source.passagesLost} cited passages are gone, ${source.passagesStanding} still hold`
        : source.passagesStanding > 0
          ? `  the ${source.passagesStanding} cited passages still hold`
          : '';
      return [`- ${source.title} — ${source.url}`, `  ${head}`, quotes].filter(Boolean).join('\n');
    }),
    // Il `filter` qui sotto toglie le righe vuote: la riga bianca prima del
    // blocco va dentro la stringa, se no prosa e recinto si toccano.
    '\n' + talosResearchRecheckBlock(runId, recheck),
  ].filter((line) => line !== '').join('\n');
}
