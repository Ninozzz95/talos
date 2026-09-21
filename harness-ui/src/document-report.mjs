/**
 * document-report.mjs — porto VERBATIM di
 * mobile/src/lib/documents/reportBuilder.ts (letto per intero il 28/8
 * prima di scrivere una riga, piano elegant-spinning-dongarra.md).
 *
 * Solo sintassi TypeScript → JavaScript (tipi rimossi), la LOGICA è
 * identica — incluse le correzioni già pagate sul mobile (canvas a
 * altezza zero, barre negative appiattite, tabelle con celle mancanti,
 * pagine vuote da `pb` consecutivi): riscriverle da zero le avrebbe
 * fatte ripagare qui.
 *
 * Un documento il MODELLO descrive a blocchi semantici (niente
 * coordinate, niente colori) — il layout lo decide questo file, non il
 * chiamante. `pdfmake` fa il lavoro di flusso (interruzioni di pagina,
 * intestazioni di tabella ripetute, piè di pagina che sa il numero).
 */

export const TALOS_REPORT_THEMES = {
    report: { brand: '#3E2723', accent: '#7B9C7B', ink: '#2C2320', muted: '#8A7F79', panel: '#F5F0E8' },
    plain: { brand: '#1F2933', accent: '#3D5A80', ink: '#1F2933', muted: '#7B8794', panel: '#F1F3F5' },
}

const CHART_WIDTH = 460
const CHART_HEIGHT = 170
const ALIGNMENT = { l: 'left', c: 'center', r: 'right' }

/**
 * Un canvas costruito solo da `path` misura altezza zero: il misuratore
 * di pdfmake distingue ellisse/rettangolo/linea/polilinea ma non ha un
 * caso per `path`, quindi una torta non riserva spazio e il blocco dopo
 * ci viene disegnato sopra. Un rettangolo invisibile riserva lo spazio.
 */
function boundingBox(width, height) {
    return { type: 'rect', x: 0, y: 0, w: width, h: height, color: '#FFFFFF', fillOpacity: 0 }
}

function slicePath(cx, cy, radius, from, to) {
    const x1 = cx + radius * Math.cos(from)
    const y1 = cy + radius * Math.sin(from)
    const x2 = cx + radius * Math.cos(to)
    const y2 = cy + radius * Math.sin(to)
    const largeArc = to - from > Math.PI ? 1 : 0
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
}

function paletteFor(theme, index) {
    const wheel = [theme.accent, theme.brand, theme.muted, '#C8B49B', '#A5B8A5', '#6E5B52']
    return wheel[index % wheel.length]
}

function barChart(block, theme) {
    const values = block.series[0]?.data ?? []
    if (values.length === 0) return { text: '', margin: [0, 0, 0, 0] }

    // La scala attraversa lo zero: una barra negativa scende SOTTO
    // l'asse invece di appiattirsi a un puntino — tre valori negativi
    // disegnati come tre segni identici da 2pt non direbbero niente.
    const low = Math.min(0, ...values)
    const high = Math.max(0, ...values)
    const span = high - low || 1
    const plot = CHART_HEIGHT - 34
    const zeroY = 8 + (high / span) * plot

    // Il gap si restringe col numero di barre: oltre le 31 un gap fisso
    // da 14pt rendeva la larghezza NEGATIVA — tre anni di punti mensili
    // è una richiesta ordinaria.
    const gap = Math.min(14, CHART_WIDTH / (values.length * 4))
    const pitch = CHART_WIDTH / values.length
    const barWidth = Math.max(1, pitch - gap)
    const canvas = [boundingBox(CHART_WIDTH, CHART_HEIGHT)]

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
        // La riga delle etichette è misurata sulla STESSA pista delle
        // barre (colonne fisse di `pitch`, non colonne '*'): su due
        // piste diverse, dalla settima barra in poi l'etichetta cadeva
        // fuori dalla barra a cui si riferiva.
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

function pieChart(block, theme) {
    const values = block.series[0]?.data ?? []
    // Solo la parte positiva: sommando i negativi il totale diventava
    // più piccolo di una singola fetta, e due fette disegnavano ognuna
    // un cerchio INTERO, uno sopra l'altro.
    const total = values.reduce((sum, value) => sum + Math.max(0, value), 0)
    const radius = 68
    let angle = -Math.PI / 2
    const slices = []

    values.forEach((value, index) => {
        if (total <= 0 || value <= 0) return
        const sweep = (value / total) * Math.PI * 2
        slices.push(`<path d="${slicePath(78, 74, radius, angle, angle + sweep)}" fill="${paletteFor(theme, index)}"/>`)
        angle += sweep
    })
    /*
     * ⛔⛔⛔ 28/8, trovato dal vivo sul PORTO Node (screenshot del PDF,
     * non solo "si riapre" — la verifica automatica passava lo stesso):
     * il motore pdfmake lato server (`PdfPrinter`/PDFKit, ctx7
     * confermato) misura MALE un `canvas` che contiene un elemento
     * `type:'path'` (le fette della torta), anche con un rettangolo
     * `boundingBox` invisibile davanti come richiesto dal commento
     * originale — provato isolato: un canvas con solo `rect` misura
     * giusto, lo STESSO canvas con anche un `path` misura zero e il
     * blocco dopo ci si sovrappone. ⛔ Una prima ipotesi (il problema
     * erano due blocchi `columns` di fila) si è rivelata SBAGLIATA,
     * corretta con lo stesso test — un `stack` esterno non cambiava
     * niente. La causa vera è il primitivo `path` dentro `canvas`,
     * non la forma del contenitore. Correlato a un difetto noto della
     * libreria sul riuso di elementi canvas (issue #2123 upstream,
     * non identico ma stessa famiglia).
     *
     * ⇒ Cura verificata: le fette diventano un vero elemento `svg`
     * (markup SVG, un percorso diverso nel renderer — non passa dal
     * misuratore canvas rotto). Confermato isolato: stesso scenario
     * KPI→torta, altezza corretta, nessuna sovrapposizione.
     */
    const svg = `<svg width="170" height="150" viewBox="0 0 170 150">${slices.join('')}</svg>`

    return {
        stack: [{
            columns: [
                { width: 170, svg },
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
        }],
        margin: [0, 4, 0, 12],
    }
}

function renderBlock(block, theme) {
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
            // La larghezza si decide PRIMA di costruire il corpo, e ogni
            // riga viene imbottita fino a quella misura — una sola cella
            // mancante in una tabella da sessanta righe lanciava
            // "Malformed table row" fuori da pdfmake, dopo che il
            // modello aveva già scritto l'intero report.
            const columns = Math.max(
                head.length,
                ...block.rows.map((row) => row.length),
                block.total?.length ?? 0,
                1,
            )
            const cells = (row, style) =>
                Array.from({ length: columns }, (_, index) => ({
                    text: row[index] ?? '',
                    style,
                    alignment: ALIGNMENT[block.align?.[index] ?? 'l'],
                }))

            const body = []
            if (head.length) body.push(cells(head, 'th'))
            for (const row of block.rows) body.push(cells(row, 'td'))
            if (block.total?.length) body.push(cells(block.total, 'tdTotal'))

            return [{
                table: {
                    // L'intestazione si ripete su ogni pagina che la
                    // tabella attraversa — il motivo per cui è stato
                    // scelto un motore di flusso.
                    headerRows: head.length ? 1 : 0,
                    widths: Array.from({ length: columns }, (_, index) => (index === 0 ? '*' : 'auto')),
                    body: body.length ? body : [Array.from({ length: columns }, () => '')],
                },
                layout: {
                    hLineWidth: (index) => (index === 0 || index === 1 ? 0.8 : 0.4),
                    vLineWidth: () => 0,
                    hLineColor: (index) => (index <= 1 ? theme.brand : '#E3DCD2'),
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

export function buildTalosReportDefinition(spec) {
    const theme = TALOS_REPORT_THEMES[spec.theme ?? 'report'] ?? TALOS_REPORT_THEMES.report
    const content = []
    let lastWasBreak = true // un'interruzione prima di ogni contenuto sarebbe una pagina vuota

    for (const block of spec.blocks) {
        if (block.t === 'pb') {
            // Interruzioni consecutive sono pagine vuote che nessuno ha chiesto.
            if (lastWasBreak) continue
            lastWasBreak = true
        }
        else {
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
        // Una funzione, perché deve sapere in che pagina si trova — cosa
        // che un'API a coordinate non può dare senza contare le pagine a mano.
        footer: (currentPage, pageCount) => ({
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
