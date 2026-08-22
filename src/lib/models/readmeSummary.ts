import { talosStripReadmeFrontmatter } from '@/lib/models/modelCardMarkdown'

const TALOS_README_SUMMARY_MAX_LENGTH = 320

function talosCleanReadmeBlock(block: string): string {
    return block
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/^[#>\s]*/, '')
        .replace(/^[-*+]\s+/gm, '')
        .replace(/[*_`]/g, '')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function talosReadmeWordCount(text: string): number {
    return (text.match(/[\p{L}]{3,}/gu) ?? []).length
}

export function talosReadmeSummary(markdown: string): string | null {
    if (typeof markdown !== 'string' || markdown.trim() === '') return null
    // Lo stesso taglio che usa la scheda intera: il riassunto e la scheda devono
    // essere d'accordo su dove comincia il testo.
    const withoutFrontmatter = talosStripReadmeFrontmatter(markdown)
    const summary = withoutFrontmatter
        .split(/\r?\n\s*\r?\n/)
        .map((block) => block.trim())
        .filter((block) => block !== '' && !/^(?:```|~~~|\|)/.test(block))
        .map(talosCleanReadmeBlock)
        .find((text) => text.length > 40 && talosReadmeWordCount(text) >= 8)

    if (!summary) return null
    return summary.slice(0, TALOS_README_SUMMARY_MAX_LENGTH).trim()
}
