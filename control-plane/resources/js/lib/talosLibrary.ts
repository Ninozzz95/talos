export const TALOS_LIBRARY_KINDS = ['image', 'file', 'link'] as const
export const TALOS_LIBRARY_ORIGINS = ['uploaded', 'generated', 'browser', 'search'] as const
export const TALOS_LIBRARY_SOURCE_TYPES = ['file', 'document', 'run_artifact', 'browser_artifact'] as const

export type TalosLibraryKind = typeof TALOS_LIBRARY_KINDS[number]
export type TalosLibraryOrigin = typeof TALOS_LIBRARY_ORIGINS[number]
export type TalosLibrarySourceType = typeof TALOS_LIBRARY_SOURCE_TYPES[number]

export interface TalosLibraryBacklink {
    readonly sessionId: string
    readonly title: string
    readonly relation: 'origin' | 'attachment'
    readonly occurredAt: string
}

export interface TalosLibraryItem {
    readonly id: string
    readonly sourceType: TalosLibrarySourceType
    readonly sourceId: string
    readonly kind: TalosLibraryKind
    readonly origin: TalosLibraryOrigin
    readonly title: string
    readonly mimeType: string | null
    readonly byteSize: number | null
    readonly checksum: string | null
    readonly sourceUrl: string | null
    readonly contentUrl: string | null
    readonly trustBoundary: string
    readonly occurredAt: string
    readonly metadata: Readonly<Record<string, unknown>>
    readonly chatCount: number
    readonly backlinks: readonly TalosLibraryBacklink[]
    readonly canAttach: boolean
}

export interface TalosLibraryPage {
    readonly data: readonly TalosLibraryItem[]
    readonly meta: Readonly<{
        count: number
        hasMore: boolean
        nextCursor: string | null
    }>
}

export interface TalosSessionMedia {
    readonly data: readonly TalosLibraryItem[]
    readonly meta: Readonly<{
        count: number
        hasMore: boolean
    }>
}

const ITEM_KEYS = [
    'id',
    'source_type',
    'source_id',
    'kind',
    'origin',
    'title',
    'mime_type',
    'byte_size',
    'checksum',
    'source_url',
    'content_url',
    'trust_boundary',
    'occurred_at',
    'metadata',
    'chat_count',
    'backlinks',
    'can_attach',
] as const

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const actual = Object.keys(value).sort()
    const normalized = [...expected].sort()
    return actual.length === normalized.length
        && actual.every((key, index) => key === normalized[index])
}

function nonEmptyString(value: unknown, name: string, max = 255): string {
    if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
        throw new TypeError(`Invalid TALOS Library ${name}.`)
    }

    return value.trim()
}

function nullableString(value: unknown, name: string, max = 255): string | null {
    return value === null ? null : nonEmptyString(value, name, max)
}

function nonNegativeInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new TypeError(`Invalid TALOS Library ${name}.`)
    }

    return value as number
}

function timestamp(value: unknown, name: string): string {
    const normalized = nonEmptyString(value, name, 48)
    if (!normalized.includes('T') || !normalized.endsWith('Z') || Number.isNaN(Date.parse(normalized))) {
        throw new TypeError(`Invalid TALOS Library ${name}.`)
    }

    return normalized
}

function sourceUrl(value: unknown): string | null {
    if (value === null) return null
    const normalized = nonEmptyString(value, 'source URL', 2048)
    let parsed: URL
    try {
        parsed = new URL(normalized)
    } catch {
        throw new TypeError('Invalid TALOS Library source URL.')
    }
    if (!['http:', 'https:'].includes(parsed.protocol)
        || parsed.username !== ''
        || parsed.password !== ''
        || parsed.hostname === '') {
        throw new TypeError('Invalid TALOS Library source URL.')
    }

    return parsed.href
}

function contentUrl(value: unknown): string | null {
    if (value === null) return null
    const normalized = nonEmptyString(value, 'content URL', 2048)
    if (!normalized.startsWith('/api/talos/')
        || normalized.startsWith('//')
        || normalized.includes('\\')
        || /(?:^|\/)\.\.(?:\/|$)/.test(normalized)) {
        throw new TypeError('Invalid TALOS Library content URL.')
    }
    const parsed = new URL(normalized, 'https://talos.invalid')
    if (parsed.origin !== 'https://talos.invalid'
        || parsed.username !== ''
        || parsed.password !== ''
        || parsed.hash !== '') {
        throw new TypeError('Invalid TALOS Library content URL.')
    }

    return `${parsed.pathname}${parsed.search}`
}

function jsonValue(value: unknown, depth = 0): unknown {
    if (depth > 6) {
        throw new TypeError('TALOS Library metadata is too deeply nested.')
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (Array.isArray(value)) {
        if (value.length > 100) throw new TypeError('TALOS Library metadata array is too large.')
        return Object.freeze(value.map((entry) => jsonValue(entry, depth + 1)))
    }
    if (!isObject(value)) {
        throw new TypeError('TALOS Library metadata must be JSON compatible.')
    }
    const entries = Object.entries(value)
    if (entries.length > 64) throw new TypeError('TALOS Library metadata object is too large.')
    const copy: Record<string, unknown> = {}
    for (const [key, entry] of entries) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) {
            throw new TypeError('TALOS Library metadata contains an unsafe key.')
        }
        copy[key] = jsonValue(entry, depth + 1)
    }

    return Object.freeze(copy)
}

function parseBacklink(value: unknown): TalosLibraryBacklink {
    if (!isObject(value)
        || !hasExactKeys(value, ['session_id', 'title', 'relation', 'occurred_at'])
        || !['origin', 'attachment'].includes(String(value.relation))) {
        throw new TypeError('Invalid TALOS Library backlink.')
    }

    return Object.freeze({
        sessionId: nonEmptyString(value.session_id, 'backlink session ID', 64),
        title: nonEmptyString(value.title, 'backlink title'),
        relation: value.relation as 'origin' | 'attachment',
        occurredAt: timestamp(value.occurred_at, 'backlink timestamp'),
    })
}

function parseItem(value: unknown): TalosLibraryItem {
    if (!isObject(value) || !hasExactKeys(value, ITEM_KEYS)) {
        throw new TypeError('Invalid TALOS Library item envelope.')
    }
    if (!TALOS_LIBRARY_SOURCE_TYPES.includes(value.source_type as TalosLibrarySourceType)
        || !TALOS_LIBRARY_KINDS.includes(value.kind as TalosLibraryKind)
        || !TALOS_LIBRARY_ORIGINS.includes(value.origin as TalosLibraryOrigin)
        || typeof value.can_attach !== 'boolean') {
        throw new TypeError('Invalid TALOS Library item vocabulary.')
    }
    if (value.can_attach !== (value.source_type === 'file')) {
        throw new TypeError('Invalid TALOS Library attachment capability.')
    }
    if (!Array.isArray(value.backlinks) || value.backlinks.length > 10) {
        throw new TypeError('Invalid TALOS Library backlinks.')
    }
    const backlinks = value.backlinks.map(parseBacklink)
    if (new Set(backlinks.map((backlink) => backlink.sessionId)).size !== backlinks.length) {
        throw new TypeError('Duplicate TALOS Library backlink.')
    }
    const chatCount = nonNegativeInteger(value.chat_count, 'chat count')
    if (chatCount < backlinks.length) {
        throw new TypeError('Invalid TALOS Library chat count.')
    }
    if (!isObject(value.metadata)) {
        throw new TypeError('Invalid TALOS Library metadata.')
    }

    return Object.freeze({
        id: nonEmptyString(value.id, 'item ID', 64),
        sourceType: value.source_type as TalosLibrarySourceType,
        sourceId: nonEmptyString(value.source_id, 'source ID', 255),
        kind: value.kind as TalosLibraryKind,
        origin: value.origin as TalosLibraryOrigin,
        title: nonEmptyString(value.title, 'title'),
        mimeType: nullableString(value.mime_type, 'MIME type'),
        byteSize: value.byte_size === null ? null : nonNegativeInteger(value.byte_size, 'byte size'),
        checksum: nullableString(value.checksum, 'checksum', 128),
        sourceUrl: sourceUrl(value.source_url),
        contentUrl: contentUrl(value.content_url),
        trustBoundary: nonEmptyString(value.trust_boundary, 'trust boundary', 64),
        occurredAt: timestamp(value.occurred_at, 'timestamp'),
        metadata: jsonValue(value.metadata) as Readonly<Record<string, unknown>>,
        chatCount,
        backlinks: Object.freeze(backlinks),
        canAttach: value.can_attach,
    })
}

function parseItems(value: unknown): readonly TalosLibraryItem[] {
    if (!Array.isArray(value) || value.length > 100) {
        throw new TypeError('Invalid TALOS Library data.')
    }
    const items = value.map(parseItem)
    if (new Set(items.map((item) => item.id)).size !== items.length) {
        throw new TypeError('Duplicate TALOS Library item.')
    }

    return Object.freeze(items)
}

export function parseTalosLibraryPage(value: unknown): TalosLibraryPage {
    if (!isObject(value) || !hasExactKeys(value, ['data', 'meta']) || !isObject(value.meta)) {
        throw new TypeError('Invalid TALOS Library page.')
    }
    if (!hasExactKeys(value.meta, ['count', 'has_more', 'next_cursor'])
        || typeof value.meta.has_more !== 'boolean') {
        throw new TypeError('Invalid TALOS Library page metadata.')
    }
    const data = parseItems(value.data)
    const count = nonNegativeInteger(value.meta.count, 'page count')
    const nextCursor = nullableString(value.meta.next_cursor, 'cursor', 4096)
    if (count !== data.length || value.meta.has_more !== (nextCursor !== null)) {
        throw new TypeError('Inconsistent TALOS Library page metadata.')
    }

    return Object.freeze({
        data,
        meta: Object.freeze({
            count,
            hasMore: value.meta.has_more,
            nextCursor,
        }),
    })
}

export function parseTalosSessionMedia(value: unknown): TalosSessionMedia {
    if (!isObject(value) || !hasExactKeys(value, ['data', 'meta']) || !isObject(value.meta)) {
        throw new TypeError('Invalid TALOS session media.')
    }
    if (!hasExactKeys(value.meta, ['count', 'has_more']) || typeof value.meta.has_more !== 'boolean') {
        throw new TypeError('Invalid TALOS session media metadata.')
    }
    const data = parseItems(value.data)
    const count = nonNegativeInteger(value.meta.count, 'session media count')
    if (count !== data.length) {
        throw new TypeError('Inconsistent TALOS session media metadata.')
    }

    return Object.freeze({
        data,
        meta: Object.freeze({
            count,
            hasMore: value.meta.has_more,
        }),
    })
}

export function parseTalosLibraryRemoval(value: unknown): Readonly<{ removedCount: number }> {
    if (!isObject(value)
        || !hasExactKeys(value, ['data'])
        || !isObject(value.data)
        || !hasExactKeys(value.data, ['removed_count'])) {
        throw new TypeError('Invalid TALOS Library removal response.')
    }

    return Object.freeze({
        removedCount: nonNegativeInteger(value.data.removed_count, 'removed count'),
    })
}
