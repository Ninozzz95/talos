import type { TalosBrowserActivity, TalosBrowserSnapshotPreview } from '@/lib/talosTypes'
import type { TalosBrowserHmiMode } from '@/lib/talosBrowserHmiPolicy'

export const TALOS_MOBILE_BROWSER_EVIDENCE_CONTRACT = 'talos.mobile.browser.evidence.v1' as const

export type TalosMobileBrowserEvidenceSource = 'manual_local' | 'trusted_node'
export type TalosMobileBrowserPresentation = 'isolated_webview' | 'system_browser'

export interface TalosMobileBrowserEvidenceArtifact {
    readonly id: string
    readonly type: 'screenshot' | 'snapshot'
    readonly media_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'application/json' | 'text/plain'
    readonly preview_uri: string | null
    readonly sha256: string | null
    readonly width: number | null
    readonly height: number | null
    readonly source_url: string | null
    readonly created_at: string
}

export interface TalosMobileBrowserEvidenceRetry {
    readonly status: 'available' | 'superseded' | 'failed'
    readonly current_artifact_id: string | null
    readonly superseded_artifact_id: string | null
    readonly reason: string | null
}

type TalosMobileBrowserEvidenceActivity = Omit<Readonly<TalosBrowserActivity>, 'artifact_ids'> & {
    readonly artifact_ids: readonly string[]
}

type TalosMobileBrowserEvidenceSnapshot = Omit<Readonly<NonNullable<TalosBrowserSnapshotPreview['snapshot']>>, 'nodes'> & {
    readonly nodes: readonly Readonly<NonNullable<TalosBrowserSnapshotPreview['snapshot']>['nodes'][number]>[]
}

export interface TalosMobileBrowserEvidenceEnvelope extends Record<string, unknown> {
    readonly contract: typeof TALOS_MOBILE_BROWSER_EVIDENCE_CONTRACT
    readonly source: TalosMobileBrowserEvidenceSource
    readonly activity: TalosMobileBrowserEvidenceActivity
    readonly artifacts: readonly TalosMobileBrowserEvidenceArtifact[]
    readonly snapshot: TalosMobileBrowserEvidenceSnapshot | null
    readonly retry: TalosMobileBrowserEvidenceRetry | null
}

export interface TalosMobileBrowserPreferences {
    schema_version: 1
    hmi_mode: TalosBrowserHmiMode
    presentation: TalosMobileBrowserPresentation
    suggest_for_urls: boolean
    developer_untrusted_evidence: boolean
}

export const TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES: TalosMobileBrowserPreferences = Object.freeze({
    schema_version: 1,
    hmi_mode: 'confirm_sensitive',
    presentation: 'isolated_webview',
    suggest_for_urls: true,
    developer_untrusted_evidence: false,
})

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/i
const ACTIVITY_OPERATIONS = new Set([
    'session_start', 'navigate', 'snapshot', 'screenshot', 'read', 'click', 'scroll', 'upload', 'wait', 'tabs',
])
const ACTIVITY_STATUSES = new Set(['queued', 'running', 'succeeded', 'failed', 'denied'])
const HMI_MODES = new Set<TalosBrowserHmiMode>(['read_only', 'confirm_sensitive', 'confirm_every_interaction'])
const PRESENTATIONS = new Set<TalosMobileBrowserPresentation>(['isolated_webview', 'system_browser'])
const ARTIFACT_TYPES = new Set<TalosMobileBrowserEvidenceArtifact['type']>(['screenshot', 'snapshot'])
const MEDIA_TYPES = new Set<TalosMobileBrowserEvidenceArtifact['media_type']>([
    'image/png', 'image/jpeg', 'image/webp', 'application/json', 'text/plain',
])

function invalidEvidence(): never {
    throw new Error('TALOS_BROWSER_EVIDENCE_INVALID')
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalidEvidence()
    return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
    const actual = Object.keys(value).sort()
    const expected = [...keys].sort()
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        invalidEvidence()
    }
}

function boundedString(value: unknown, maximum: number, allowEmpty = false): string {
    if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && value.length === 0)) invalidEvidence()
    return value
}

function identifier(value: unknown): string {
    const result = boundedString(value, 128)
    if (!ID_PATTERN.test(result)) invalidEvidence()
    return result
}

function nullableIdentifier(value: unknown): string | null {
    return value === null ? null : identifier(value)
}

function isoDate(value: unknown): string {
    const result = boundedString(value, 40)
    if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || Number.isNaN(Date.parse(result))) invalidEvidence()
    return result
}

function safeHttpUrl(value: unknown): string {
    const raw = boundedString(value, 2048)
    try {
        const parsed = new URL(raw)
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) {
            invalidEvidence()
        }
        return parsed.toString()
    } catch {
        return invalidEvidence()
    }
}

function nullableHttpUrl(value: unknown): string | null {
    return value === null ? null : safeHttpUrl(value)
}

function safePreviewUri(value: unknown, mediaType: TalosMobileBrowserEvidenceArtifact['media_type']): string | null {
    if (value === null) return null
    const raw = boundedString(value, 2_097_152)
    if (raw.startsWith('data:')) {
        if (!mediaType.startsWith('image/') || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw)) {
            invalidEvidence()
        }
        return raw
    }
    return safeHttpUrl(raw)
}

function positiveDimension(value: unknown): number | null {
    if (value === null) return null
    if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 16_384) invalidEvidence()
    return Number(value)
}

function parseActivity(value: unknown): TalosBrowserActivity {
    const item = record(value)
    exactKeys(item, [
        'id', 'operation', 'status', 'label', 'run_id', 'browser_session_id', 'artifact_ids', 'occurred_at',
    ])
    const operation = boundedString(item.operation, 64)
    const status = boundedString(item.status, 32)
    if (!ACTIVITY_OPERATIONS.has(operation) || !ACTIVITY_STATUSES.has(status)) invalidEvidence()
    if (!Array.isArray(item.artifact_ids) || item.artifact_ids.length > 8) invalidEvidence()
    const artifactIds = item.artifact_ids.map(identifier)
    if (new Set(artifactIds).size !== artifactIds.length) invalidEvidence()
    return {
        id: identifier(item.id),
        operation,
        status,
        label: boundedString(item.label, 500),
        run_id: nullableIdentifier(item.run_id),
        browser_session_id: identifier(item.browser_session_id),
        artifact_ids: artifactIds,
        occurred_at: isoDate(item.occurred_at),
    }
}

function parseArtifact(value: unknown): TalosMobileBrowserEvidenceArtifact {
    const item = record(value)
    exactKeys(item, [
        'id', 'type', 'media_type', 'preview_uri', 'sha256', 'width', 'height', 'source_url', 'created_at',
    ])
    const type = boundedString(item.type, 32) as TalosMobileBrowserEvidenceArtifact['type']
    const mediaType = boundedString(item.media_type, 64) as TalosMobileBrowserEvidenceArtifact['media_type']
    if (!ARTIFACT_TYPES.has(type) || !MEDIA_TYPES.has(mediaType)) invalidEvidence()
    if (type === 'screenshot' && !mediaType.startsWith('image/')) invalidEvidence()
    if (type === 'snapshot' && mediaType.startsWith('image/')) invalidEvidence()
    const previewUri = safePreviewUri(item.preview_uri, mediaType)
    if (type === 'screenshot' && previewUri === null) invalidEvidence()
    const sha256 = item.sha256 === null ? null : boundedString(item.sha256, 64).toLowerCase()
    if (sha256 !== null && !SHA256_PATTERN.test(sha256)) invalidEvidence()
    const width = positiveDimension(item.width)
    const height = positiveDimension(item.height)
    if ((width === null) !== (height === null)) invalidEvidence()
    if (type === 'screenshot' && (width === null || height === null)) invalidEvidence()
    return {
        id: identifier(item.id),
        type,
        media_type: mediaType,
        preview_uri: previewUri,
        sha256,
        width,
        height,
        source_url: nullableHttpUrl(item.source_url),
        created_at: isoDate(item.created_at),
    }
}

function parseSnapshot(value: unknown): TalosMobileBrowserEvidenceEnvelope['snapshot'] {
    if (value === null) return null
    const item = record(value)
    exactKeys(item, ['untrusted', 'format', 'url', 'title', 'text_digest', 'truncated', 'nodes'])
    if (item.untrusted !== true || typeof item.truncated !== 'boolean' || !Array.isArray(item.nodes) || item.nodes.length > 500) {
        invalidEvidence()
    }
    const nodes = item.nodes.map((candidate) => {
        const node = record(candidate)
        exactKeys(node, ['role', 'name', 'ref', 'visible'])
        if (typeof node.visible !== 'boolean') invalidEvidence()
        return {
            role: boundedString(node.role, 80),
            name: boundedString(node.name, 500, true),
            ref: identifier(node.ref),
            visible: node.visible,
        }
    })
    return {
        untrusted: true,
        format: boundedString(item.format, 80),
        url: nullableHttpUrl(item.url) ?? undefined,
        title: item.title === null ? undefined : boundedString(item.title, 500, true),
        text_digest: item.text_digest === null ? undefined : boundedString(item.text_digest, 256),
        truncated: item.truncated,
        nodes,
    }
}

function parseRetry(value: unknown): TalosMobileBrowserEvidenceRetry | null {
    if (value === null) return null
    const item = record(value)
    exactKeys(item, ['status', 'current_artifact_id', 'superseded_artifact_id', 'reason'])
    const status = boundedString(item.status, 32)
    if (!['available', 'superseded', 'failed'].includes(status)) invalidEvidence()
    return {
        status: status as TalosMobileBrowserEvidenceRetry['status'],
        current_artifact_id: nullableIdentifier(item.current_artifact_id),
        superseded_artifact_id: nullableIdentifier(item.superseded_artifact_id),
        reason: item.reason === null ? null : boundedString(item.reason, 500),
    }
}

export function parseTalosMobileBrowserEvidenceEnvelope(value: unknown): TalosMobileBrowserEvidenceEnvelope {
    const root = record(value)
    exactKeys(root, ['contract', 'source', 'activity', 'artifacts', 'snapshot', 'retry'])
    if (root.contract !== TALOS_MOBILE_BROWSER_EVIDENCE_CONTRACT
        || (root.source !== 'manual_local' && root.source !== 'trusted_node')
        || !Array.isArray(root.artifacts)
        || root.artifacts.length > 8) {
        invalidEvidence()
    }
    const activity = parseActivity(root.activity)
    const artifacts = root.artifacts.map(parseArtifact)
    if (new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length) invalidEvidence()
    const artifactIds = new Set(artifacts.map((artifact) => artifact.id))
    if (activity.artifact_ids.some((id) => !artifactIds.has(id))) invalidEvidence()
    const snapshot = parseSnapshot(root.snapshot)
    if (root.source === 'manual_local'
        && (artifacts.length > 0 || snapshot !== null || !['session_start', 'navigate'].includes(activity.operation))) {
        invalidEvidence()
    }
    return {
        contract: TALOS_MOBILE_BROWSER_EVIDENCE_CONTRACT,
        source: root.source,
        activity,
        artifacts,
        snapshot,
        retry: parseRetry(root.retry),
    }
}

export function parseTalosMobileBrowserPreferences(value: unknown): TalosMobileBrowserPreferences {
    try {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
        const item = value as Record<string, unknown>
        const expected = ['developer_untrusted_evidence', 'hmi_mode', 'presentation', 'schema_version', 'suggest_for_urls']
        const actual = Object.keys(item).sort()
        if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error('invalid')
        if (item.schema_version !== 1
            || !HMI_MODES.has(item.hmi_mode as TalosBrowserHmiMode)
            || !PRESENTATIONS.has(item.presentation as TalosMobileBrowserPresentation)
            || typeof item.suggest_for_urls !== 'boolean'
            || typeof item.developer_untrusted_evidence !== 'boolean') {
            throw new Error('invalid')
        }
        return {
            schema_version: 1,
            hmi_mode: item.hmi_mode as TalosBrowserHmiMode,
            presentation: item.presentation as TalosMobileBrowserPresentation,
            suggest_for_urls: item.suggest_for_urls,
            developer_untrusted_evidence: item.developer_untrusted_evidence,
        }
    } catch {
        return { ...TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES }
    }
}
