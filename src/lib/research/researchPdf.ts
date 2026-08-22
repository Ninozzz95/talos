import type { TalosReportBlock, TalosReportInput } from '@/lib/documents/reportBuilder'
import {
    talosResearchSupportLabel,
    type TalosResearchReportRecord,
} from '@/lib/research/researchReport'

/**
 * Una ricerca che diventa un PDF, in tre toni.
 *
 * Owner 2026-08-03: «quando clicchi per generare il pdf appare un popup che ti
 * fa scegliere il "tono" del pdf tra 3 template».
 *
 * I tre sono documenti DIVERSI, non tre tavolozze sullo stesso testo. Un
 * cambio di colore travestito da scelta e' una domanda posta a vuoto: chi la
 * riceve deve fermarsi a pensare, e qualunque cosa risponda ottiene la stessa
 * cosa.
 *
 * ## Perche' proprio questi tre
 *
 * La ricerca sui concorrenti (2026-08-03) dice che tutti e cinque guidano col
 * volume — «56 siti» — e nessuno dice se quello che affermano ha retto. La sua
 * conclusione: **la vittoria non e' piu' citazioni, e' un conto migliore della
 * relazione fra affermazione e prova**. I tre toni sono tre risposte alla
 * domanda «a chi lo stai dando»:
 *
 * - `report`  — a chi deve leggerlo tutto: copertina, sintesi, ogni
 *               affermazione col suo verdetto e il passaggio, poi le fonti.
 * - `brief`   — a chi ha due minuti: la risposta, cosa regge, cosa NON regge.
 *               Niente passaggi, niente elenco fonti.
 * - `dossier` — a chi deve controllare: affermazione, verdetto, fonte, in
 *               tabella. Nessuna prosa. E' quello che gli altri non hanno.
 *
 * Il modulo e' puro di proposito: il documento si prova senza pdfmake, senza
 * rete e senza telefono.
 */

export const TALOS_RESEARCH_PDF_TONES = ['report', 'brief', 'dossier'] as const
export type TalosResearchPdfTone = (typeof TALOS_RESEARCH_PDF_TONES)[number]

/** Il tono di partenza: quello completo, che non lascia fuori niente. */
export const TALOS_RESEARCH_PDF_DEFAULT_TONE: TalosResearchPdfTone = 'report'

export interface TalosResearchPdfOptions {
    /** Quando e' stata fatta. Passata da fuori: qui dentro non si legge l'ora. */
    readonly date?: string
    /** Il titolo scelto dall'utente, se ne ha messo uno al posto della domanda. */
    readonly title?: string | null
}

function verdetto(claim: TalosResearchReportRecord['claims'][number]): string {
    return talosResearchSupportLabel(claim.checks)
}

function fonteDi(report: TalosResearchReportRecord, index: number): string {
    const source = report.sources[index]
    if (!source) return '—'
    // Il titolo se c'e', altrimenti il dominio: un URL intero in una cella di
    // tabella la sfonda, e nessuno lo legge comunque.
    if (source.title.trim().length > 0) return source.title
    try {
        return new URL(source.url).hostname
    } catch {
        return source.url
    }
}

/** Quante reggono, quante a meta', quante smentite, quante mai verificate. */
export function talosResearchPdfTally(report: TalosResearchReportRecord): {
    supported: number
    partial: number
    contradicted: number
    unverified: number
} {
    const tally = { supported: 0, partial: 0, contradicted: 0, unverified: 0 }
    for (const claim of report.claims) {
        switch (claim.checks.claimSupported) {
            case 'yes': tally.supported += 1; break
            case 'partial': tally.partial += 1; break
            case 'no': tally.contradicted += 1; break
            default: tally.unverified += 1
        }
    }
    return tally
}

/**
 * La riga che dice come e' stato giudicato, o che NON lo e' stato.
 *
 * «Nessun giudice indipendente era disponibile» e «tutte le citazioni hanno
 * fallito il controllo meccanico» sono due fatti diversi, e il record li tiene
 * separati apposta. Un PDF che tace su questo consegna un verdetto senza dire
 * chi l'ha dato.
 */
function nota(report: TalosResearchReportRecord): TalosReportBlock {
    return {
        t: 'note',
        x: report.judge
            ? `Le affermazioni sono state giudicate da ${report.judge}, confrontandole con il passaggio della fonte.`
            : 'Nessun giudice indipendente era disponibile: i verdetti vengono dal solo controllo meccanico della citazione.',
    }
}

function copertina(report: TalosResearchReportRecord, options: TalosResearchPdfOptions): TalosReportBlock {
    return {
        t: 'cover',
        title: options.title?.trim() || report.question,
        subtitle: options.title?.trim() ? report.question : 'Ricerca approfondita TALOS',
        ...(options.date ? { date: options.date } : {}),
    }
}

function bilancio(report: TalosResearchReportRecord): TalosReportBlock {
    const tally = talosResearchPdfTally(report)
    return {
        t: 'kpi',
        items: [
            { l: 'Sostenute', v: String(tally.supported) },
            { l: 'In parte', v: String(tally.partial) },
            { l: 'Smentite', v: String(tally.contradicted) },
            { l: 'Non verificate', v: String(tally.unverified) },
        ],
    }
}

function rapportoCompleto(report: TalosResearchReportRecord, options: TalosResearchPdfOptions): TalosReportBlock[] {
    const blocks: TalosReportBlock[] = [
        copertina(report, options),
        { t: 'h', lvl: 1, x: 'In breve' },
        { t: 'p', x: report.summary },
        bilancio(report),
        nota(report),
        { t: 'pb' },
        { t: 'h', lvl: 1, x: 'Le affermazioni, una per una' },
    ]
    report.claims.forEach((claim, index) => {
        blocks.push({ t: 'h', lvl: 3, x: `${index + 1}. ${claim.text}` })
        blocks.push({ t: 'p', x: `Verdetto: ${verdetto(claim)} — fonte: ${fonteDi(report, claim.sourceIndex)}` })
        // Il passaggio e' la prova. Senza, «sostenuta» e' una parola che chiede
        // fiducia invece di darla.
        if (claim.passage.trim().length > 0) blocks.push({ t: 'note', x: `«${claim.passage}»` })
    })
    if (report.sources.length > 0) {
        blocks.push({ t: 'pb' }, { t: 'h', lvl: 1, x: 'Le fonti' })
        blocks.push({
            t: 'table',
            head: ['#', 'Titolo', 'Indirizzo', 'Come'],
            align: ['r', 'l', 'l', 'l'],
            rows: report.sources.map((source, index) => [
                String(index + 1),
                source.title || '—',
                source.url,
                source.obtained === 'page' ? 'pagina letta' : 'solo estratto',
            ]),
        })
    }
    return blocks
}

function sintesi(report: TalosResearchReportRecord, options: TalosResearchPdfOptions): TalosReportBlock[] {
    const tally = talosResearchPdfTally(report)
    const regge = report.claims.filter((claim) => claim.checks.claimSupported === 'yes')
    const nonRegge = report.claims.filter((claim) => (
        claim.checks.claimSupported === 'no' || claim.checks.claimSupported === 'partial'
    ))
    /**
     * Niente copertina, e non e' una svista.
     *
     * Misurato sul OnePlus Pad 3 (2026-08-04): con la copertina la sintesi
     * usciva di DUE pagine — il blocco `cover` ha 140 punti di margine in cima
     * e da solo si mangia la prima. La riga nel popup promette «una pagina», e
     * una promessa che il documento non mantiene e' peggio della promessa
     * assente. Un frontespizio serve a precedere un documento lungo: su un
     * foglio solo e' meta' del foglio spesa per dire cosa c'e' nell'altra meta'.
     */
    const blocks: TalosReportBlock[] = [
        { t: 'h', lvl: 1, x: options.title?.trim() || report.question },
        ...(options.title?.trim() ? [{ t: 'note', x: report.question } as TalosReportBlock] : []),
        { t: 'p', x: report.summary },
        bilancio(report),
    ]
    if (regge.length > 0) {
        blocks.push({ t: 'h', lvl: 2, x: 'Quello che regge' })
        // Cinque, non tutte: una sintesi che riporta trenta punti non e' una
        // sintesi, e' il rapporto senza le prove.
        blocks.push({ t: 'list', items: regge.slice(0, 4).map((claim) => claim.text) })
    }
    if (nonRegge.length > 0) {
        blocks.push({ t: 'h', lvl: 2, x: 'Quello che NON regge' })
        blocks.push({
            t: 'list',
            items: nonRegge.slice(0, 4).map((claim) => `${claim.text} — ${verdetto(claim)}`),
        })
    }
    if (tally.unverified > 0) {
        blocks.push({
            t: 'note',
            x: `${tally.unverified} affermazioni non e' stato possibile verificarle: la fonte non e' stata riaperta o il passaggio non c'era.`,
        })
    }
    blocks.push(nota(report))
    return blocks
}

function dossier(report: TalosResearchReportRecord, options: TalosResearchPdfOptions): TalosReportBlock[] {
    return [
        copertina(report, options),
        { t: 'h', lvl: 1, x: 'Affermazioni e prove' },
        nota(report),
        {
            t: 'table',
            head: ['#', 'Affermazione', 'Verdetto', 'Fonte'],
            align: ['r', 'l', 'l', 'l'],
            rows: report.claims.map((claim, index) => [
                String(index + 1),
                claim.text,
                verdetto(claim),
                fonteDi(report, claim.sourceIndex),
            ]),
        },
        {
            t: 'chart',
            kind: 'pie',
            labels: ['Sostenute', 'In parte', 'Smentite', 'Non verificate'],
            series: [{ data: Object.values(talosResearchPdfTally(report)) }],
        },
    ]
}

/**
 * Il documento, nel tono chiesto.
 *
 * Un rapporto senza affermazioni non e' un errore — una ricerca puo' finire
 * senza che nessuna citazione regga — ma un PDF di sole intestazioni vuote non
 * lo dice a nessuno. Quindi si dice.
 */
export function talosResearchPdfSpec(
    report: TalosResearchReportRecord,
    tone: TalosResearchPdfTone,
    options: TalosResearchPdfOptions = {},
): TalosReportInput {
    const blocks = report.claims.length === 0
        ? [
            copertina(report, options),
            { t: 'p', x: report.summary } as TalosReportBlock,
            { t: 'note', x: 'Questa ricerca non ha prodotto affermazioni verificabili.' } as TalosReportBlock,
        ]
        : tone === 'brief'
            ? sintesi(report, options)
            : tone === 'dossier'
                ? dossier(report, options)
                : rapportoCompleto(report, options)

    return {
        // Il dossier vive di tabelle larghe; gli altri due si leggono.
        theme: tone === 'dossier' ? 'plain' : 'report',
        footer: { text: 'TALOS · ricerca approfondita', pageNo: true },
        blocks,
    }
}
