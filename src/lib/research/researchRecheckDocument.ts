import { talosResearchRecheckStanding, type TalosResearchRecheck } from '@/lib/research/researchRecheck'
import { talosResearchRecheckBlock } from '@/lib/research/researchRecheckHistory'

/**
 * The re-check, written down so it does not have to be paid for twice.
 *
 * Same principle as the report: a check that leaves no trace is a check that
 * gets run again every time somebody wonders, and — worse — cannot be compared
 * with the one before it. Filed in the Library beside the dossier it is about.
 *
 * The plainest sentence in the file is the one about unreachable sources: the
 * page is gone AND the text is still here. That is the sentence no competitor
 * can write, and it is worth spending a line on.
 *
 * ⛔ E porta in coda un blocco che si RILEGGE esatto: la prosa qui sopra è
 * per una persona, e ricavarne i numeri ripassando l’italiano stampato è il
 * modo in cui una misura diventa un’invenzione. Senza, «quanto vale oggi un
 * rapporto di ieri» resta una domanda a cui il file non sa rispondere.
 */
export function talosResearchRecheckDocument(question: string, recheck: TalosResearchRecheck, runId: string): string {
    const standing = talosResearchRecheckStanding(recheck)

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
                    : `cambiata (${Math.round((source.survived ?? 0) * 100)}% del testo di allora è ancora lì)`
            const quotes = source.passagesLost > 0
                ? `  ${source.passagesLost} passaggi citati non ci sono più, ${source.passagesStanding} reggono ancora`
                : source.passagesStanding > 0
                    ? `  i ${source.passagesStanding} passaggi citati reggono ancora`
                    : ''
            return [`- ${source.title} — ${source.url}`, `  ${head}`, quotes].filter(Boolean).join('\n')
        }),
        // Il `filter` qui sotto toglie le righe vuote: la riga bianca prima del
        // blocco va dentro la stringa, se no prosa e recinto si toccano.
        '\n' + talosResearchRecheckBlock(runId, recheck),
    ].filter((line) => line !== '').join('\n')
}
