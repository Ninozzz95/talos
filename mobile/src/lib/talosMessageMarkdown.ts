import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

export const MAX_TALOS_MARKDOWN_SOURCE_LENGTH = 100_000

export interface TalosRenderedMessage {
    html: string
    truncated: boolean
    sourceLength: number
}

export interface TalosMarkdownRenderOptions {
    origin?: string
}

const allowedTags = [
    'a', 'blockquote', 'br', 'button', 'code', 'del', 'div', 'em', 'h2', 'h3', 'h4',
    'hr', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th',
    'thead', 'tr', 'ul',
]

const allowedAttributes = [
    'aria-label', 'class', 'data-talos-copy-code', 'href', 'rel', 'role', 'tabindex',
    'target', 'type',
]

function isAllowedLink(value: string): boolean {
    const href = value.trim()
    if (href === '' || /^[#/?]/.test(href) || /^\.\.?\//.test(href)) return true
    return /^(https?:|mailto:)/i.test(href)
}

function resolvedOrigin(options: TalosMarkdownRenderOptions): string {
    if (options.origin) return options.origin
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
    return 'http://localhost'
}

function isExternalHttpLink(href: string, origin: string): boolean {
    if (!/^https?:/i.test(href)) return false
    try {
        return new URL(href, origin).origin !== new URL(origin).origin
    } catch {
        return false
    }
}

function normalizeSource(source: string): string {
    return source
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/[\u061C\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
}

function languageClass(info: string): string {
    const language = info.trim().split(/\s+/u)[0]?.toLowerCase() ?? ''
    return /^[a-z0-9_+-]{1,32}$/u.test(language) ? language : ''
}

function createMarkdownRenderer(): MarkdownIt {
    const md = new MarkdownIt({
        breaks: false,
        html: false,
        linkify: true,
        typographer: false,
    })

    md.validateLink = isAllowedLink
    md.core.ruler.after('inline', 'talos_document_contract', (state) => {
        for (const token of state.tokens) {
            if (token.type === 'heading_open' || token.type === 'heading_close') {
                const level = Number(token.tag.slice(1))
                token.tag = `h${Math.min(4, Math.max(2, level))}`
            }
            if (token.type !== 'inline' || !token.children?.length) continue

            const firstTextIndex = token.children.findIndex((child) => child.type === 'text')
            if (firstTextIndex < 0) continue
            const text = token.children[firstTextIndex]
            const task = text.content.match(/^\[([ xX])\]\s+/u)
            if (!task) continue

            const marker = new state.Token('talos_task_marker', 'span', 0)
            marker.meta = { checked: task[1]!.toLowerCase() === 'x' }
            text.content = text.content.slice(task[0].length)
            token.children.splice(firstTextIndex, 0, marker)
        }
    })

    md.renderer.rules.talos_task_marker = (tokens, index) => {
        const checked = tokens[index]!.meta?.checked === true
        const label = checked ? 'Completed task' : 'Open task'
        const symbol = checked ? '&#9745;' : '&#9744;'
        return `<span class="talos-task-marker" role="img" aria-label="${label}">${symbol}</span> `
    }
    md.renderer.rules.table_open = () => '<div class="talos-message-table-scroll" role="region" aria-label="Scrollable message table" tabindex="0"><table>'
    md.renderer.rules.table_close = () => '</table></div>'
    md.renderer.rules.image = (tokens, index) => {
        const alt = tokens[index]!.content.trim() || 'Image'
        return `<span class="talos-external-image-omitted">External image omitted: ${md.utils.escapeHtml(alt)}</span>`
    }
    md.renderer.rules.fence = (tokens, index) => {
        const token = tokens[index]!
        const language = languageClass(token.info)
        const codeClass = language ? ` class="language-${language}"` : ''
        const languageLabel = language ? md.utils.escapeHtml(language) : 'code'
        const contents = md.utils.escapeHtml(token.content)
        return `<div class="talos-code-block"><div class="talos-code-block-header"><span>${languageLabel}</span><button type="button" data-talos-copy-code aria-label="Copy code">Copy</button></div><pre tabindex="0"><code${codeClass}>${contents}</code></pre></div>`
    }
    md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
        const token = tokens[index]!
        const href = token.attrGet('href') ?? ''
        if (isExternalHttpLink(href, typeof env.origin === 'string' ? env.origin : 'http://localhost')) {
            token.attrSet('target', '_blank')
            token.attrSet('rel', 'noopener noreferrer')
        } else {
            token.attrSet('target', '')
            token.attrSet('rel', '')
            token.attrs = token.attrs?.filter(([name, value]) => value !== '' || (name !== 'target' && name !== 'rel')) ?? null
        }
        return renderer.renderToken(tokens, index, options)
    }

    return md
}

const markdown = createMarkdownRenderer()

export function renderTalosMarkdown(
    source: string,
    options: TalosMarkdownRenderOptions = {},
): TalosRenderedMessage {
    const sourceLength = source.length
    const truncated = sourceLength > MAX_TALOS_MARKDOWN_SOURCE_LENGTH
    const boundedSource = source.slice(0, MAX_TALOS_MARKDOWN_SOURCE_LENGTH)
    const normalized = normalizeSource(truncated
        ? `${boundedSource}\n\n> Message truncated for safe rendering.`
        : boundedSource)
    const html = markdown.render(normalized, { origin: resolvedOrigin(options) })
    const clean = DOMPurify.sanitize(html, {
        ALLOWED_ATTR: allowedAttributes,
        ALLOWED_TAGS: allowedTags,
        ALLOW_DATA_ATTR: false,
        ALLOW_UNKNOWN_PROTOCOLS: false,
    })

    return { html: String(clean), truncated, sourceLength }
}

/**
 * The message, cut into blocks that can be rendered — and left alone — apart.
 *
 * Owner 2026-07-27: the reveal was already paced and the fade still was not
 * smooth. The cause was downstream: the whole body is one `v-html`, re-rendered
 * every 110ms as the markdown is re-parsed, so nine times a second the entire
 * paragraph was destroyed and rebuilt. That snaps whatever is mid-fade and
 * repaints text that had settled. No smoothing upstream survives it.
 *
 * Cut on markdown-it's OWN block tokens rather than on blank lines: a fenced
 * code block contains blank lines and must stay whole, and an ordered list that
 * gets split restarts its numbering. The parser already knows where the seams
 * are — asking it is both correct and cheaper than guessing.
 *
 * The value of this is that earlier blocks come back BYTE-IDENTICAL as the
 * answer grows, which is what lets the renderer skip them entirely.
 */
export function splitTalosMarkdownBlocks(source: string): string[] {
    if (source.trim() === '') return []
    const lines = source.split('\n')
    const blocks: string[] = []
    try {
        for (const token of markdown.parse(source, {})) {
            // Top level only, and only tokens that carry a source range: nested
            // tokens would cut a list into its items.
            if (token.level !== 0 || !token.map) continue
            const [from, to] = token.map
            const text = lines.slice(from, to).join('\n').replace(/\s+$/, '')
            if (text !== '') blocks.push(text)
        }
    } catch {
        // A parser that throws must not cost the message: one block is exactly
        // the behaviour this replaced, so the failure mode is the old one.
        return [source]
    }
    return blocks.length ? blocks : [source]
}

/**
 * The same block, parsed once.
 *
 * Owner 2026-07-27, third round on "l'animazione di rendering non e smooth".
 * Splitting the message into blocks and adding `v-memo` stopped the DOM being
 * rebuilt, but not the PARSING: the component mapped every block through
 * markdown-it on every content change. A twenty-block answer arriving at nine
 * updates a second is a hundred and eighty parses a second on a phone, and all
 * but one of them produce a string identical to the one already on screen.
 *
 * Only the last block actually changes while an answer streams, so every other
 * block is served from here. Returning the SAME string reference also lets
 * `v-memo` short-circuit on identity rather than on comparison.
 *
 * Bounded, because a long conversation would otherwise keep every block of
 * every message alive for the life of the app. Oldest out first; the entries
 * that matter are the ones on screen.
 */
const BLOCK_CACHE_LIMIT = 400
const blockCache = new Map<string, string>()

export function renderTalosMarkdownBlock(source: string): string {
    const hit = blockCache.get(source)
    if (hit !== undefined) {
        // Refresh recency so the blocks being read are the ones that survive.
        blockCache.delete(source)
        blockCache.set(source, hit)
        return hit
    }
    const html = renderTalosMarkdown(source).html
    blockCache.set(source, html)
    if (blockCache.size > BLOCK_CACHE_LIMIT) {
        const oldest = blockCache.keys().next()
        if (!oldest.done) blockCache.delete(oldest.value)
    }
    return html
}
