import MarkdownIt from 'markdown-it'
import { MAX_TALOS_MARKDOWN_SOURCE_LENGTH } from '@/lib/talosMessageMarkdown'

/*
 * ⛔ Revisione del blocco 4 (Desktop), riserve S4: «gli stessi token» valeva quasi. Le regole di `createMarkdownRenderer` in
 * `talosMessageMarkdown.ts` che cambiano i token si COPIANO qui, col loro posto: quel file è una libreria portata dal desktop con
 * l'impronta fissata (`desktopPortedConformance`) e non si tocca. Se cambiano là, si cambiano qui (TRM-07..09 lo controllano).
 */

// `isAllowedLink`, `talosMessageMarkdown.ts:75`: un collegamento che il renderer non ammette resta testo com'è scritto
function isAllowedLink(value: string): boolean {
    const href = value.trim()
    if (href === '' || /^[#/?]/.test(href) || /^\.\.?\//.test(href)) return true
    return /^(https?:|mailto:)/i.test(href)
}

// `ESTENSIONI_DI_FILE` ed `eUnNomeDiFile`, `talosMessageMarkdown.ts:125-140`: «NOTA.md» non è il dominio della Moldova
const ESTENSIONI_DI_FILE = new Set([
    'md', 'markdown', 'txt', 'sh', 'bash', 'zsh', 'ps1', 'py', 'rs', 'go', 'rb', 'pl', 'php', 'js', 'mjs', 'cjs', 'ts',
    'tsx', 'jsx', 'vue', 'kt', 'java', 'cs', 'cc', 'cpp', 'mk', 'ml', 'so', 'json', 'yml', 'yaml', 'toml', 'ini', 'cfg',
    'log', 'csv', 'tsv', 'sql', 'xml', 'html', 'css', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'rtf',
    'zip', 'gz', 'tar', 'rar', '7z', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp3', 'mp4', 'mov', 'wav', 'apk',
])

function eUnNomeDiFile(collegamento: { schema: string, url: string, text: string }): boolean {
    if (collegamento.schema !== '' || /^www\./i.test(collegamento.text)) return false
    try {
        const estensione = new URL(collegamento.url).hostname.split('.').pop()?.toLowerCase() ?? ''
        return ESTENSIONI_DI_FILE.has(estensione)
    } catch {
        return false
    }
}

/**
 * Le opzioni di `createMarkdownRenderer(true)` (a capo singoli tenuti, niente HTML, collegamenti) e le sue regole sui token: i
 * collegamenti ammessi, il filtro dei nomi di file e `<br>` come a capo (`talos_br`, `talosMessageMarkdown.ts` ~170). Esportato
 * solo per la prova di parità col renderer (TRM-08).
 */
export const parserDelTestoReso: MarkdownIt = (() => {
    const md = new MarkdownIt({ breaks: true, html: false, linkify: true, typographer: false })
    md.validateLink = isAllowedLink
    const trovaCollegamenti = md.linkify.match.bind(md.linkify)
    md.linkify.match = (testo: string) => {
        const trovati = trovaCollegamenti(testo)
        return trovati ? trovati.filter((collegamento) => !eUnNomeDiFile(collegamento)) : trovati
    }
    md.inline.ruler.before('text', 'talos_br', (state, silent) => {
        if (state.src.charCodeAt(state.pos) !== 0x3C /* < */) return false
        const match = /^<br\s*\/?>/i.exec(state.src.slice(state.pos))
        if (!match) return false
        if (!silent) state.push('hardbreak', 'br', 0)
        state.pos += match[0].length
        return true
    })
    return md
})()

// la stessa pulizia di `normalizeSource` in `talosMessageMarkdown.ts`: caratteri di controllo e di direzione fuori
function normalizeSource(source: string): string {
    return source
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/[\u061C\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
}

type TokenDelMarkdown = ReturnType<MarkdownIt['parse']>[number]

/**
 * In una cella un a capo (`<br>`) diventa uno spazio: la riga della tabella resta UNA riga, e incollata in un foglio di calcolo non si
 * spezza. Un collegamento scritto (`[testo](indirizzo)`) diventa «testo (indirizzo)», così l'indirizzo non si perde; uno riconosciuto
 * da solo (`linkify`) o tra `<>` è già l'indirizzo, e resta una volta.
 */
function testoInLinea(figli: readonly TokenDelMarkdown[], inCella = false): string {
    let testo = ''
    let collegamento: { href: string, inizio: number } | null = null
    for (const figlio of figli) {
        if (figlio.type === 'softbreak' || figlio.type === 'hardbreak') testo += inCella ? ' ' : '\n'
        else if (figlio.type === 'image') testo += testoInLinea(figlio.children ?? [], inCella)
        else if (figlio.type === 'text' || figlio.type === 'code_inline') testo += figlio.content
        else if (figlio.type === 'link_open' && figlio.markup !== 'linkify' && figlio.markup !== 'autolink') {
            collegamento = { href: figlio.attrGet('href') ?? '', inizio: testo.length }
        } else if (figlio.type === 'link_close' && collegamento) {
            if (collegamento.href && testo.slice(collegamento.inizio) !== collegamento.href) testo += ` (${collegamento.href})`
            collegamento = null
        }
    }
    return testo
}

/**
 * Revisione del blocco 3 (Desktop (3), S4) e owner 24/10/2026 «Testo reso, pulito»: il testo di un messaggio come lo vede chi
 * legge, per il foglio «Seleziona testo». Niente `**`, backtick, `#` né recinti; il codice resta intero; un elenco tiene un segno
 * per voce; una tabella diventa righe con le celle separate da tabulazioni (così si incolla in un foglio di calcolo).
 * ⛔ Gli stessi token di markdown-it con le stesse opzioni del parser che disegna il messaggio (`talosMessageMarkdown.ts`,
 * `createMarkdownRenderer(true)`), non espressioni regolari. Un'istanza sua: quel file è una libreria portata dal desktop con
 * l'impronta fissata (`desktopPortedConformance`) e non si tocca. `remove-markdown` e simili
 * indovinano la sintassi a parte e divergono da markdown-it sui casi limite (recinti, elenchi annidati, `_` negli identificatori).
 */
export function testoResoDelMarkdown(source: string): string {
    const tokens = parserDelTestoReso.parse(normalizeSource(source.slice(0, MAX_TALOS_MARKDOWN_SOURCE_LENGTH)), {})
    const pezzi: Array<{ testo: string, gruppo: string | null }> = []
    const elenchi: Array<{ ordinato: boolean, prossimo: number }> = []
    let gruppi = 0
    let gruppo: string | null = null
    let prefisso = ''
    let celle: string[] | null = null
    for (const token of tokens) {
        switch (token.type) {
            case 'bullet_list_open':
            case 'ordered_list_open':
                if (elenchi.length === 0) gruppo = `elenco-${++gruppi}`
                elenchi.push({ ordinato: token.type === 'ordered_list_open', prossimo: Number(token.attrGet('start') ?? 1) })
                break
            case 'bullet_list_close':
            case 'ordered_list_close':
                elenchi.pop()
                if (elenchi.length === 0) gruppo = null
                break
            case 'list_item_open': {
                const elenco = elenchi.at(-1)
                prefisso = '  '.repeat(Math.max(0, elenchi.length - 1)) + (elenco?.ordinato ? `${elenco.prossimo++}. ` : '• ')
                break
            }
            case 'table_open':
                gruppo = `tabella-${++gruppi}`
                // una tabella prima figlia di una voce: il segno non finisce sulla riga dopo la tabella
                prefisso = ''
                break
            case 'table_close':
                gruppo = null
                break
            case 'tr_open':
                celle = []
                break
            case 'tr_close':
                if (celle) pezzi.push({ testo: celle.join('\t'), gruppo })
                celle = null
                break
            case 'fence':
            case 'code_block':
                // revisione del blocco 4, S4: un recinto prima figlia di una voce porta il segno della voce, che non resta appeso
                pezzi.push({ testo: prefisso + token.content.replace(/\n$/u, ''), gruppo })
                prefisso = ''
                break
            case 'inline': {
                const testo = testoInLinea(token.children ?? [], celle !== null)
                if (celle) celle.push(testo)
                else pezzi.push({ testo: prefisso + testo, gruppo })
                prefisso = ''
                break
            }
        }
    }
    return pezzi.reduce((tutto, pezzo, i) => {
        if (i === 0) return pezzo.testo
        const stessoGruppo = pezzo.gruppo !== null && pezzo.gruppo === pezzi[i - 1]!.gruppo
        return tutto + (stessoGruppo ? '\n' : '\n\n') + pezzo.testo
    }, '')
}
