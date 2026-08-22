/**
 * A document the model DESCRIBES, laid out by us.
 *
 * Owner 2026-07-26: he asked for a six-page branded annual report — cover, KPI
 * cards, a bar chart, a pie chart, a table per store, brand colours, a footer on
 * every page — and got HTML, because the PDF path drew wrapped lines of text and
 * nothing else.
 *
 * The research settled two things. A flow engine (pdfmake) does the hard part:
 * page breaks, repeated table headers, footers that know the page number. And
 * the model must NOT emit that engine's own document-definition object — that
 * format is presentational, so every node would restate margins, font sizes and
 * brand colours. In his failing trace the model spent sixty seconds emitting
 * arguments and the call was then refused; a spec that says WHAT the document
 * contains, with the look decided here, is roughly a fifth of those tokens and
 * cannot drift from the brand.
 *
 * So: `blocks` are semantic. No coordinates, no sizes, no colours.
 */
export interface TalosReportTheme {
    brand: string
    accent: string
    ink: string
    muted: string
    panel: string
}

/**
 * Named, never spelled out by the caller. `"report"` costs the model two
 * tokens; a palette restated on every node costs hundreds and gets it wrong.
 */
export const TALOS_REPORT_THEMES: Record<string, TalosReportTheme> = {
    report: { brand: '#3E2723', accent: '#7B9C7B', ink: '#2C2320', muted: '#8A7F79', panel: '#F5F0E8' },
    plain: { brand: '#1F2933', accent: '#3D5A80', ink: '#1F2933', muted: '#7B8794', panel: '#F1F3F5' },
}

export type TalosReportAlign = 'l' | 'c' | 'r'

export type TalosReportBlock =
    | { t: 'cover'; title: string; subtitle?: string; date?: string }
    | { t: 'h'; lvl?: 1 | 2 | 3; x: string }
    | { t: 'p'; x: string }
    | { t: 'note'; x: string }
    | { t: 'list'; items: string[]; ordered?: boolean }
    | { t: 'kpi'; items: Array<{ l: string; v: string; d?: string }> }
    | {
        t: 'table'
        head?: string[]
        rows: string[][]
        align?: TalosReportAlign[]
        total?: string[]
    }
    | {
        t: 'chart'
        kind: 'bar' | 'pie'
        labels: string[]
        series: Array<{ name?: string; data: number[] }>
        unit?: string
    }
    | { t: 'spacer' }
    | { t: 'pb' }

export interface TalosReportSpec {
    meta: { title: string; author?: string; lang?: string }
    theme?: string
    footer?: { text?: string; pageNo?: boolean }
    blocks: TalosReportBlock[]
}

/**
 * What the MODEL sends: the same spec without `meta`.
 *
 * The title lives at the top level of the tool call, so a report never repeats
 * it — one fewer thing to end up subtly different between the file name and the
 * cover.
 */
export type TalosReportInput = Omit<TalosReportSpec, 'meta'>

/** The shape pdfmake consumes. Kept loose: its own types are not published. */
export interface TalosPdfDefinition {
    pageSize: string
    pageOrientation: string
    pageMargins: [number, number, number, number]
    info?: Record<string, string>
    defaultStyle?: Record<string, unknown>
    styles?: Record<string, unknown>
    footer?: unknown
    content: unknown[]
}

const CHART_WIDTH = 460
const CHART_HEIGHT = 170
const ALIGNMENT: Record<TalosReportAlign, string> = { l: 'left', c: 'center', r: 'right' }

/**
 * A canvas built only from `path` measures as zero-height.
 *
 * pdfmake's measurer switches on ellipse/rect/line/polyline and has no case for
 * `path`, so a pie chart reports no height at all and the next block is drawn
 * straight over it. An invisible bounding rectangle is what reserves the space.
 */
function boundingBox(width: number, height: number): Record<string, unknown> {
    return { type: 'rect', x: 0, y: 0, w: width, h: height, color: '#FFFFFF', fillOpacity: 0 }
}

function slicePath(cx: number, cy: number, radius: number, from: number, to: number): string {
    const x1 = cx + radius * Math.cos(from)
    const y1 = cy + radius * Math.sin(from)
    const x2 = cx + radius * Math.cos(to)
    const y2 = cy + radius * Math.sin(to)
    const largeArc = to - from > Math.PI ? 1 : 0
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
}

function paletteFor(theme: TalosReportTheme, index: number): string {
    // Derived from the theme, never asked of the model: a chart whose colours
    // are chosen per call is a chart that stops matching the document.
    const wheel = [theme.accent, theme.brand, theme.muted, '#C8B49B', '#A5B8A5', '#6E5B52']
    return wheel[index % wheel.length]!
}

function barChart(block: Extract<TalosReportBlock, { t: 'chart' }>, theme: TalosReportTheme): unknown {
    const values = block.series[0]?.data ?? []
    if (values.length === 0) return { text: '', margin: [0, 0, 0, 0] }

    // The scale spans zero, so a negative bar goes DOWN from the axis instead of
    // being flattened to a stub. Owner's own prompt has "-2,4%" in it, and three
    // negatives rendered as three identical 2pt marks say nothing at all.
    const low = Math.min(0, ...values)
    const high = Math.max(0, ...values)
    const span = high - low || 1
    const plot = CHART_HEIGHT - 34
    const zeroY = 8 + (high / span) * plot

    // Gap shrinks with the count: past 31 bars a fixed 14pt gap made the width
    // NEGATIVE, and three years of monthly points is an ordinary request.
    const gap = Math.min(14, CHART_WIDTH / (values.length * 4))
    const pitch = CHART_WIDTH / values.length
    const barWidth = Math.max(1, pitch - gap)
    const canvas: Record<string, unknown>[] = [boundingBox(CHART_WIDTH, CHART_HEIGHT)]

    canvas.push({
        type: 'line', x1: 0, y1: zeroY, x2: CHART_WIDTH, y2: zeroY,
        lineWidth: 0.8, lineColor: theme.muted,
    })
    values.forEach((value, index) => {
        const height = Math.abs(value / span) * plot
        canvas.push({
            type: 'rect',
            x: index * pitch + gap / 2,
            y: value >= 0 ? zeroY - height : zeroY,
            w: barWidth,
            h: Math.max(1, height),
            r: 1,
            color: value >= 0 ? paletteFor(theme, index) : theme.muted,
        })
    })

    return {
        // The label row is measured in the SAME track as the bars: fixed
        // columns of `pitch`, not '*' columns filling the page width. They drew
        // on two different tracks before, and by the seventh bar the label sat
        // entirely outside the bar it named.
        stack: [
            { canvas },
            {
                columns: values.map((value, index) => ({
                    width: pitch,
                    stack: [
                        { text: String(value), style: 'chartValue' },
                        { text: String(block.labels[index] ?? ''), style: 'chartLabel' },
                    ],
                })),
                columnGap: 0,
                margin: [0, 2, 0, 0],
            },
        ],
        margin: [0, 4, 0, 12],
    }
}

function pieChart(block: Extract<TalosReportBlock, { t: 'chart' }>, theme: TalosReportTheme): unknown {
    const values = block.series[0]?.data ?? []
    // Only the positive part: summing negatives made the total smaller than a
    // single slice, so two slices each drew a FULL circle, one over the other.
    const total = values.reduce((sum, value) => sum + Math.max(0, value), 0)
    const radius = 68
    const canvas: Record<string, unknown>[] = [boundingBox(170, 150)]
    let angle = -Math.PI / 2

    values.forEach((value, index) => {
        if (total <= 0 || value <= 0) return
        const sweep = (value / total) * Math.PI * 2
        canvas.push({
            type: 'path',
            d: slicePath(78, 74, radius, angle, angle + sweep),
            color: paletteFor(theme, index),
        })
        angle += sweep
    })

    return {
        columns: [
            { width: 180, canvas },
            {
                width: '*',
                stack: values.map((value, index) => ({
                    columns: [
                        { width: 10, canvas: [{ type: 'rect', x: 0, y: 3, w: 8, h: 8, color: paletteFor(theme, index) }] },
                        {
                            width: '*',
                            text: `${block.labels[index] ?? ''} — ${total > 0 ? Math.round((Math.max(0, value) / total) * 100) : 0}%`,
                            style: 'legend',
                        },
                    ],
                    columnGap: 6,
                    margin: [0, 0, 0, 4],
                })),
                margin: [0, 18, 0, 0],
            },
        ],
        margin: [0, 4, 0, 12],
    }
}

function renderBlock(block: TalosReportBlock, theme: TalosReportTheme): unknown[] {
    switch (block.t) {
        case 'cover':
            return [{
                stack: [
                    { canvas: [{ type: 'rect', x: 0, y: 0, w: 60, h: 6, r: 3, color: theme.accent }], margin: [0, 140, 0, 18] },
                    { text: block.title, style: 'coverTitle' },
                    ...(block.subtitle ? [{ text: block.subtitle, style: 'coverSubtitle' }] : []),
                    ...(block.date ? [{ text: block.date, style: 'coverDate' }] : []),
                ],
            }]
        case 'h':
            return [{ text: block.x, style: `h${block.lvl ?? 1}` }]
        case 'p':
            return [{ text: block.x, style: 'body' }]
        case 'note':
            return [{ text: block.x, style: 'note' }]
        case 'list':
            return [{
                [block.ordered ? 'ol' : 'ul']: block.items.map((item) => ({ text: item, style: 'body' })),
                margin: [0, 0, 0, 10],
            }]
        case 'kpi':
            return [{
                columns: block.items.map((item) => ({
                    width: '*',
                    stack: [
                        { text: item.v, style: 'kpiValue' },
                        { text: item.l, style: 'kpiLabel' },
                        ...(item.d ? [{ text: item.d, style: 'kpiDelta' }] : []),
                    ],
                    margin: [8, 10, 8, 10],
                })),
                columnGap: 8,
                margin: [0, 4, 0, 14],
            }]
        case 'table': {
            const head = block.head ?? []
            // Width is decided BEFORE the body is built, and every row is
            // padded to it. A single missing cell in a sixty-store table used
            // to throw "Malformed table row" out of pdfmake — after the model
            // had written the entire report.
            const columns = Math.max(
                head.length,
                ...block.rows.map((row) => row.length),
                block.total?.length ?? 0,
                1,
            )
            const cells = (row: readonly string[], style: string): unknown[] =>
                Array.from({ length: columns }, (_, index) => ({
                    text: row[index] ?? '',
                    style,
                    alignment: ALIGNMENT[block.align?.[index] ?? 'l'],
                }))

            const body: unknown[][] = []
            if (head.length) body.push(cells(head, 'th'))
            for (const row of block.rows) body.push(cells(row, 'td'))
            if (block.total?.length) body.push(cells(block.total, 'tdTotal'))

            return [{
                table: {
                    // The header repeats on every page a long table spans —
                    // the reason a flow engine was chosen at all.
                    headerRows: head.length ? 1 : 0,
                    widths: Array.from({ length: columns }, (_, index) => (index === 0 ? '*' : 'auto')),
                    body: body.length ? body : [Array.from({ length: columns }, () => '')],
                },
                layout: {
                    hLineWidth: (index: number) => (index === 0 || index === 1 ? 0.8 : 0.4),
                    vLineWidth: () => 0,
                    hLineColor: (index: number) => (index <= 1 ? theme.brand : '#E3DCD2'),
                    paddingTop: () => 5,
                    paddingBottom: () => 5,
                },
                margin: [0, 2, 0, 14],
            }]
        }
        case 'chart':
            return [block.kind === 'pie' ? pieChart(block, theme) : barChart(block, theme)]
        case 'spacer':
            return [{ text: ' ', margin: [0, 6, 0, 6] }]
        case 'pb':
            return [{ text: '', pageBreak: 'after' }]
        default:
            return []
    }
}

export function buildTalosReportDefinition(spec: TalosReportSpec): TalosPdfDefinition {
    const theme = TALOS_REPORT_THEMES[spec.theme ?? 'report'] ?? TALOS_REPORT_THEMES.report!
    const content: unknown[] = []
    let lastWasBreak = true // a break before any content is a blank first page

    for (const block of spec.blocks) {
        if (block.t === 'pb') {
            // Consecutive breaks are blank pages nobody asked for.
            if (lastWasBreak) continue
            lastWasBreak = true
        } else {
            lastWasBreak = false
        }
        content.push(...renderBlock(block, theme))
    }

    const footerText = spec.footer?.text ?? ''
    const showPage = spec.footer?.pageNo !== false

    return {
        pageSize: 'A4',
        pageOrientation: 'portrait',
        pageMargins: [48, 46, 48, 56],
        info: {
            title: spec.meta.title,
            ...(spec.meta.author ? { author: spec.meta.author } : {}),
        },
        defaultStyle: { font: 'Roboto', fontSize: 10, color: theme.ink, lineHeight: 1.25 },
        styles: {
            coverTitle: { fontSize: 30, bold: true, color: theme.brand, margin: [0, 0, 0, 10] },
            coverSubtitle: { fontSize: 13, color: theme.muted, margin: [0, 0, 0, 26] },
            coverDate: { fontSize: 11, color: theme.accent },
            h1: { fontSize: 18, bold: true, color: theme.brand, margin: [0, 14, 0, 6] },
            h2: { fontSize: 14, bold: true, color: theme.brand, margin: [0, 12, 0, 5] },
            h3: { fontSize: 11, bold: true, color: theme.ink, margin: [0, 10, 0, 4] },
            body: { margin: [0, 0, 0, 8] },
            note: { fontSize: 8.5, color: theme.muted, italics: true, margin: [0, 0, 0, 10] },
            kpiValue: { fontSize: 17, bold: true, color: theme.brand },
            kpiLabel: { fontSize: 8.5, color: theme.muted },
            kpiDelta: { fontSize: 9, color: theme.accent, bold: true },
            th: { bold: true, fontSize: 9.5, color: theme.brand },
            td: { fontSize: 9.5 },
            tdTotal: { fontSize: 9.5, bold: true, color: theme.brand },
            chartValue: { fontSize: 8.5, bold: true, alignment: 'center', color: theme.brand },
            chartLabel: { fontSize: 8.5, alignment: 'center', color: theme.muted },
            legend: { fontSize: 9 },
            footer: { fontSize: 8, color: theme.muted },
        },
        // A function, because it must know which page it is on — the thing a
        // coordinate API cannot give you without counting pages by hand.
        footer: (currentPage: number, pageCount: number) => ({
            columns: [
                { text: footerText, style: 'footer', width: '*' },
                ...(showPage
                    ? [{ text: `${currentPage} / ${pageCount}`, style: 'footer', width: 'auto' }]
                    : []),
            ],
            margin: [48, 16, 48, 0],
        }),
        content,
    }
}
