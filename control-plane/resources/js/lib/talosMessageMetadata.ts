export const TALOS_MESSAGE_METADATA_CONTRACT = 'talos.message.metadata.v2'

export interface TalosMessageAttachment {
    readonly file_id: string
    readonly name: string
    readonly mime_type?: string
    readonly size_bytes?: number
    readonly content_url?: string
}

export interface TalosVisibleReasoning {
    readonly source: 'provider' | 'avm_summary'
    readonly text: string
    readonly duration_ms: number | null
    readonly provider?: string
}

export interface TalosToolActivity {
    readonly id: string
    readonly name: string
    readonly status: 'running' | 'succeeded' | 'failed' | 'cancelled'
    readonly started_at: string
    readonly completed_at: string | null
}

export type TalosMessageMetrics = Readonly<Record<string, number | TalosMessageMetrics>>

export interface TalosMessageMetadataProjection {
    readonly contract: typeof TALOS_MESSAGE_METADATA_CONTRACT | null
    readonly raw: Readonly<Record<string, unknown>>
    readonly attachments: readonly TalosMessageAttachment[]
    readonly visibleReasoning: TalosVisibleReasoning | null
    readonly toolActivities: readonly TalosToolActivity[]
    readonly artifacts: readonly Readonly<Record<string, unknown>>[]
    readonly usage: TalosMessageMetrics | null
    readonly timing: TalosMessageMetrics | null
    readonly browserActivities: readonly Readonly<Record<string, unknown>>[]
    readonly browserFollowUp: Readonly<Record<string, unknown>> | null
    readonly usedBrowserContext: Readonly<Record<string, unknown>> | null
    readonly usedContext: readonly Readonly<Record<string, unknown>>[]
}

const TOOL_STATUSES = new Set<TalosToolActivity['status']>([
    'running',
    'succeeded',
    'failed',
    'cancelled',
])

const PRIVATE_KEYS = new Set([
    'authorization',
    'continuation_state',
    'cookie',
    'encrypted_content',
    'headers',
    'provider_state',
    'raw_tool_arguments',
    'raw_tool_result',
    'redacted_thinking',
    'set_cookie',
    'signature',
    'thought_signature',
])

const TOKEN_METRIC_KEYS = new Set([
    'cached_tokens',
    'completion_tokens',
    'input_tokens',
    'output_tokens',
    'prompt_tokens',
    'reasoning_tokens',
    'token_count',
    'token_estimate',
    'tokens',
    'total_tokens',
])

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizedKey(value: string) {
    return value.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_').replaceAll('.', '_')
}

function isPrivateKey(value: string) {
    const key = normalizedKey(value)
    if (PRIVATE_KEYS.has(key) || TOKEN_METRIC_KEYS.has(key)) return PRIVATE_KEYS.has(key)
    if (key.endsWith('_token_count') || key.endsWith('_token_estimate')) return false
    if (/^(accepted_prediction|audio|cache_creation_input|cache_read_input|cached|completion|image|input|output|prompt|reasoning|rejected_prediction|text|total)_tokens$/.test(key)) return false

    return key === 'token'
        || key.includes('api_key')
        || key.includes('secret')
        || key.includes('password')
        || key.includes('access_token')
        || key.includes('api_token')
        || key.includes('auth_token')
        || key.includes('bearer_token')
        || key.includes('client_token')
        || key.includes('csrf_token')
        || key.includes('id_token')
        || key.includes('refresh_token')
        || key.includes('session_token')
        || key.includes('token_hash')
        || key.includes('token_value')
}

function sanitizeValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sanitizeValue).filter((entry) => entry !== undefined)
    }
    if (isObject(value)) {
        const sanitized: Record<string, unknown> = {}
        for (const [key, entry] of Object.entries(value)) {
            if (isPrivateKey(key)) continue
            const next = sanitizeValue(entry)
            if (next !== undefined) sanitized[key] = next
        }
        return sanitized
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    return undefined
}

function deepFreeze<T>(value: T): T {
    if (Array.isArray(value)) {
        value.forEach(deepFreeze)
        return Object.freeze(value)
    }
    if (isObject(value)) {
        Object.values(value).forEach(deepFreeze)
        return Object.freeze(value) as T
    }
    return value
}

function boundedString(value: unknown, maxLength: number): string | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return normalized && normalized.length <= maxLength ? normalized : null
}

function parseAttachments(value: unknown): readonly TalosMessageAttachment[] {
    if (!Array.isArray(value) || value.length > 20) return []
    const result: TalosMessageAttachment[] = []
    const seen = new Set<string>()
    for (const candidate of value) {
        if (!isObject(candidate)) return []
        const fileId = boundedString(candidate.file_id, 255)
        const name = boundedString(candidate.name, 255)
        if (!fileId || !name || seen.has(fileId)) return []
        seen.add(fileId)

        const mimeType = candidate.mime_type === undefined || candidate.mime_type === null
            ? null
            : boundedString(candidate.mime_type, 120)
        const sizeBytes = candidate.size_bytes === undefined || candidate.size_bytes === null
            ? null
            : candidate.size_bytes
        const contentUrl = candidate.content_url === undefined || candidate.content_url === null
            ? null
            : boundedString(candidate.content_url, 512)
        if ((candidate.mime_type !== undefined && candidate.mime_type !== null && !mimeType)
            || (sizeBytes !== null && (!Number.isInteger(sizeBytes) || (sizeBytes as number) < 0))
            || (candidate.content_url !== undefined
                && candidate.content_url !== null
                && contentUrl !== `/api/talos/files/${fileId}/content`)) {
            return []
        }

        result.push({
            file_id: fileId,
            name,
            ...(mimeType ? { mime_type: mimeType } : {}),
            ...(sizeBytes !== null ? { size_bytes: sizeBytes as number } : {}),
            ...(contentUrl ? { content_url: contentUrl } : {}),
        })
    }
    return deepFreeze(result)
}

function parseVisibleReasoning(value: unknown): TalosVisibleReasoning | null {
    if (!isObject(value)) return null
    const source = value.source
    const text = boundedString(value.text, 20_000)
    const provider = value.provider === undefined || value.provider === null
        ? null
        : boundedString(value.provider, 64)
    const duration = value.duration_ms === undefined || value.duration_ms === null
        ? null
        : value.duration_ms
    if ((source !== 'provider' && source !== 'avm_summary')
        || !text
        || (value.provider !== undefined && value.provider !== null && !provider)
        || (duration !== null && (!Number.isInteger(duration) || (duration as number) < 0))) {
        return null
    }

    return deepFreeze({
        source,
        text,
        duration_ms: duration as number | null,
        ...(provider ? { provider } : {}),
    })
}

function parseIsoDate(value: unknown): string | null {
    const text = boundedString(value, 64)
    if (!text || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return null
    return Number.isNaN(Date.parse(text)) ? null : text
}

function parseToolActivities(value: unknown): readonly TalosToolActivity[] {
    if (!Array.isArray(value) || value.length > 100) return []
    const result: TalosToolActivity[] = []
    const seen = new Set<string>()
    for (const candidate of value) {
        if (!isObject(candidate)) return []
        const id = boundedString(candidate.id, 255)
        const name = boundedString(candidate.name, 160)
        const status = candidate.status
        const startedAt = parseIsoDate(candidate.started_at)
        const completedAt = candidate.completed_at === null || candidate.completed_at === undefined
            ? null
            : parseIsoDate(candidate.completed_at)
        if (!id
            || !name
            || seen.has(id)
            || typeof status !== 'string'
            || !TOOL_STATUSES.has(status as TalosToolActivity['status'])
            || !startedAt
            || (candidate.completed_at !== null && candidate.completed_at !== undefined && !completedAt)
            || (completedAt !== null && Date.parse(completedAt) < Date.parse(startedAt))) {
            return []
        }
        seen.add(id)
        result.push({
            id,
            name,
            status: status as TalosToolActivity['status'],
            started_at: startedAt,
            completed_at: completedAt,
        })
    }
    return deepFreeze(result)
}

function parseMetrics(value: unknown): TalosMessageMetrics | null {
    if (!isObject(value) || Object.keys(value).length > 50) return null
    const result: Record<string, number | TalosMessageMetrics> = {}
    for (const [key, metric] of Object.entries(value)) {
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) return null
        if (isObject(metric)) {
            const nested = parseMetrics(metric)
            if (!nested) return null
            result[key] = nested
            continue
        }
        if (typeof metric !== 'number' || !Number.isFinite(metric) || metric < 0) return null
        result[key] = metric
    }
    return deepFreeze(result)
}

function parseObjectList(value: unknown, maxItems: number): readonly Readonly<Record<string, unknown>>[] {
    if (!Array.isArray(value) || value.length > maxItems || value.some((entry) => !isObject(entry))) return []
    return deepFreeze(value.map((entry) => sanitizeValue(entry) as Record<string, unknown>))
}

function parseObject(value: unknown): Readonly<Record<string, unknown>> | null {
    if (!isObject(value)) return null
    return deepFreeze(sanitizeValue(value) as Record<string, unknown>)
}

export function parseTalosMessageMetadata(value: unknown): TalosMessageMetadataProjection {
    const sanitized = isObject(value)
        ? sanitizeValue(value) as Record<string, unknown>
        : {}
    const raw = deepFreeze(sanitized)

    return deepFreeze({
        contract: raw.contract === TALOS_MESSAGE_METADATA_CONTRACT
            ? TALOS_MESSAGE_METADATA_CONTRACT
            : null,
        raw,
        attachments: parseAttachments(raw.attachments),
        visibleReasoning: parseVisibleReasoning(raw.visible_reasoning),
        toolActivities: parseToolActivities(raw.tool_activities),
        artifacts: parseObjectList(raw.artifacts, 100),
        usage: parseMetrics(raw.usage),
        timing: parseMetrics(raw.timing),
        browserActivities: parseObjectList(raw.browser_activities, 200),
        browserFollowUp: parseObject(raw.browser_follow_up),
        usedBrowserContext: parseObject(raw.used_browser_context),
        usedContext: parseObjectList(raw.used_context, 200),
    })
}
