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
    const withoutFrontmatter = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
    const summary = withoutFrontmatter
        .split(/\r?\n\s*\r?\n/)
        .map((block) => block.trim())
        .filter((block) => block !== '' && !/^(?:```|~~~|\|)/.test(block))
        .map(talosCleanReadmeBlock)
        .find((text) => text.length > 40 && talosReadmeWordCount(text) >= 8)

    if (!summary) return null
    return summary.slice(0, TALOS_README_SUMMARY_MAX_LENGTH).trim()
}
