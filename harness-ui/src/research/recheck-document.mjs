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
    `# Ricontrollo — ${question}`,
    '',
    `Data del ricontrollo: ${recheck.at}`,
    '',
    `Fonti ricontrollate: ${standing.total}`,
    `- intatte: ${standing.intact}`,
    `- cambiate dal giorno della ricerca: ${standing.changed}`,
    `- non rispondono più: ${standing.unreachable}`,
    standing.passagesLost > 0
      ? `\n**${standing.passagesLost} passaggi citati non sono più nella loro fonte.**`
      : '\nTutti i passaggi citati sono ancora nelle loro fonti.',
    standing.unreachable > 0
      ? '\nLe fonti che non rispondono più restano leggibili qui: il testo estratto\nè stato conservato il giorno della ricerca.'
      : '',
    '',
    '## Fonte per fonte',
    ...recheck.sources.map((source) => {
      const head = source.state === 'unreachable'
        ? `non risponde più${source.reason ? ` (${source.reason})` : ''}`
        : source.state === 'intact'
          ? `intatta (${Math.round((source.survived ?? 0) * 100)}% del testo di allora è ancora lì)`
          : `cambiata (${Math.round((source.survived ?? 0) * 100)}% del testo di allora è ancora lì)`;
      const quotes = source.passagesLost > 0
        ? `  ${source.passagesLost} passaggi citati non ci sono più, ${source.passagesStanding} reggono ancora`
        : source.passagesStanding > 0
          ? `  i ${source.passagesStanding} passaggi citati reggono ancora`
          : '';
      return [`- ${source.title} — ${source.url}`, `  ${head}`, quotes].filter(Boolean).join('\n');
    }),
    // Il `filter` qui sotto toglie le righe vuote: la riga bianca prima del
    // blocco va dentro la stringa, se no prosa e recinto si toccano.
    '\n' + talosResearchRecheckBlock(runId, recheck),
  ].filter((line) => line !== '').join('\n');
}
