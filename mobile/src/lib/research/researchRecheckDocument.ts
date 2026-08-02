import { talosResearchRecheckStanding, type TalosResearchRecheck } from '@/lib/research/researchRecheck'

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
 */
export function talosResearchRecheckDocument(question: string, recheck: TalosResearchRecheck): string {
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
    ].filter((line) => line !== '').join('\n')
}
