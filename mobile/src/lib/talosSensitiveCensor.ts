export type TalosCensorMatchKind = 'email' | 'api_key' | 'bearer' | 'secret' | 'password'

interface TalosCensorMatch {
    start: number
    end: number
    kind: TalosCensorMatchKind
}

interface TalosCensorDetector {
    kind: TalosCensorMatchKind
    pattern: RegExp
    valueGroup?: number
}

const detectors: TalosCensorDetector[] = [
    { kind: 'password', pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*([^\s<>{}\[\]]{8,})/gi, valueGroup: 1 },
    { kind: 'bearer', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g },
    { kind: 'api_key', pattern: /\b(?:sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/g },
    { kind: 'email', pattern: /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+\b/gi },
    { kind: 'secret', pattern: /\b(?:[A-F0-9]{40,}|[A-Za-z0-9+/_=-]{48,})\b/gi },
]

function matchBounds(match: RegExpExecArray, valueGroup?: number): Pick<TalosCensorMatch, 'start' | 'end'> | null {
    const value = valueGroup === undefined ? match[0] : match[valueGroup]
    if (!value) return null
    const valueOffset = valueGroup === undefined ? 0 : match[0].lastIndexOf(value)
    if (valueOffset < 0) return null
    const start = match.index + valueOffset
    return { start, end: start + value.length }
}

function findMatches(text: string): TalosCensorMatch[] {
    const candidates: TalosCensorMatch[] = []
    for (const detector of detectors) {
        detector.pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = detector.pattern.exec(text)) !== null) {
            const bounds = matchBounds(match, detector.valueGroup)
            if (bounds) candidates.push({ ...bounds, kind: detector.kind })
            if (match[0].length === 0) detector.pattern.lastIndex += 1
        }
    }
    candidates.sort((left, right) => left.start - right.start || right.end - left.end)
    const accepted: TalosCensorMatch[] = []
    for (const candidate of candidates) {
        if (accepted.some((match) => candidate.start < match.end && candidate.end > match.start)) continue
        accepted.push(candidate)
    }
    return accepted.sort((left, right) => left.start - right.start)
}

function isEligibleTextNode(node: Text): boolean {
    const parent = node.parentElement
    if (!parent || !node.data.trim()) return false
    if (parent.closest('.talos-censored')) return false
    return !parent.closest('script, style, noscript, textarea')
}

function kindLabel(kind: TalosCensorMatchKind): string {
    return kind.replace('_', ' ')
}

function createRevealControl(document: Document, text: string, kind: TalosCensorMatchKind): HTMLButtonElement {
    const control = document.createElement('button')
    control.type = 'button'
    control.className = 'talos-censored'
    control.dataset.censoredKind = kind
    control.setAttribute('aria-pressed', 'false')
    control.setAttribute('aria-label', `Reveal sensitive ${kindLabel(kind)}`)
    control.textContent = text
    control.addEventListener('click', () => {
        const revealed = control.dataset.revealed !== 'true'
        if (revealed) control.dataset.revealed = 'true'
        else delete control.dataset.revealed
        control.setAttribute('aria-pressed', String(revealed))
        control.setAttribute('aria-label', `${revealed ? 'Hide' : 'Reveal'} sensitive ${kindLabel(kind)}`)
    })
    return control
}

export function censorSensitiveText(root: HTMLElement): number {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []
    let current = walker.nextNode()
    while (current) {
        if (current instanceof Text && isEligibleTextNode(current)) textNodes.push(current)
        current = walker.nextNode()
    }

    let censoredCount = 0
    for (const textNode of textNodes) {
        const matches = findMatches(textNode.data)
        if (matches.length === 0 || !textNode.parentNode) continue
        const fragment = root.ownerDocument.createDocumentFragment()
        let cursor = 0
        for (const match of matches) {
            if (match.start > cursor) fragment.append(textNode.data.slice(cursor, match.start))
            fragment.append(createRevealControl(root.ownerDocument, textNode.data.slice(match.start, match.end), match.kind))
            cursor = match.end
            censoredCount += 1
        }
        if (cursor < textNode.data.length) fragment.append(textNode.data.slice(cursor))
        textNode.replaceWith(fragment)
    }
    return censoredCount
}
