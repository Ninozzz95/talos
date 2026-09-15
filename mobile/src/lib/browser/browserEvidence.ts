import type { TalosBrowserActivity } from '@/lib/talosTypes'
import {
    TALOS_MOBILE_BROWSER_EVIDENCE_CONTRACT,
    type TalosMobileBrowserEvidenceEnvelope,
    type TalosMobileBrowserPresentation,
} from '@/lib/browser/browserContracts'

export interface TalosManualBrowserLifecycleEvent {
    type: 'opening' | 'loaded' | 'navigated' | 'closed' | 'failed'
    url: string
    source: 'native' | 'web_external'
    message?: string
}

export interface TalosManualBrowserActivityContext {
    activityId: string
    browserSessionId: string
    occurredAt: string
    presentation: TalosMobileBrowserPresentation
}

export interface TalosManualBrowserActivityRecord {
    operation: 'session_start' | 'navigate'
    status: 'succeeded' | 'failed'
    payload: Record<string, unknown>
    evidence: TalosMobileBrowserEvidenceEnvelope
}

const URL_CANDIDATE_PATTERN = /https?:\/\/[^\s<>"']+/gi
const TRAILING_SENTENCE_PUNCTUATION = /[.,!;:]+$/

export function normalizeTalosBrowserUrl(value: string): string | null {
    const raw = value.trim()
    if (!raw || raw.length > 2048) return null
    try {
        const url = new URL(raw)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return null
        return url.toString()
    } catch {
        return null
    }
}

function trimNaturalUrlCandidate(value: string): string {
    let candidate = value.replace(TRAILING_SENTENCE_PUNCTUATION, '')
    const pairs: ReadonlyArray<readonly [string, string]> = [['(', ')'], ['[', ']'], ['{', '}']]
    for (const [open, close] of pairs) {
        while (candidate.endsWith(close)
            && candidate.split(close).length > candidate.split(open).length) {
            candidate = candidate.slice(0, -1)
        }
    }
    return candidate
}

export function extractTalosBrowserUrls(text: string, maximum = 8): string[] {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 32) return []
    const result: string[] = []
    const seen = new Set<string>()
    for (const match of text.matchAll(URL_CANDIDATE_PATTERN)) {
        const normalized = normalizeTalosBrowserUrl(trimNaturalUrlCandidate(match[0]))
        if (!normalized || seen.has(normalized)) continue
        seen.add(normalized)
        result.push(normalized)
        if (result.length === maximum) break
    }
    return result
}

export function createTalosManualBrowserActivity(
    event: TalosManualBrowserLifecycleEvent,
    context: TalosManualBrowserActivityContext,
): TalosManualBrowserActivityRecord {
    const url = normalizeTalosBrowserUrl(event.url)
    if (!url) throw new Error('TALOS_BROWSER_URL_INVALID')
    const operation = event.type === 'loaded' || event.type === 'navigated' ? 'navigate' : 'session_start'
    const status = event.type === 'failed' ? 'failed' : 'succeeded'
    const detail = event.message?.trim().slice(0, 300)
    const label = event.type === 'opening'
        ? `Opening ${url} manually`
        : event.type === 'closed'
            ? `Closed manual browser for ${url}`
            : event.type === 'failed'
                ? `Manual browser failed for ${url}${detail ? `: ${detail}` : ''}`
                : `Opened ${url} manually`
    return {
        operation,
        status,
        payload: {
            url,
            event_source: event.source,
            presentation: context.presentation,
            ...(detail ? { message: detail } : {}),
        },
        evidence: {
            contract: TALOS_MOBILE_BROWSER_EVIDENCE_CONTRACT,
            source: 'manual_local',
            activity: {
                id: context.activityId,
                operation,
                status,
                label,
                run_id: null,
                browser_session_id: context.browserSessionId,
                artifact_ids: [],
                occurred_at: context.occurredAt,
            },
            artifacts: [],
            snapshot: null,
            retry: null,
        },
    }
}

function isSuccessfulScreenshot(activity: TalosBrowserActivity): boolean {
    return activity.operation === 'screenshot'
        && activity.status === 'succeeded'
        && activity.artifact_ids.length > 0
}

export function mergePersistedBrowserEvidenceWithCurrentFrame(
    persisted: readonly TalosBrowserActivity[],
    live: readonly TalosBrowserActivity[],
): TalosBrowserActivity[] {
    const result = persisted.filter(isSuccessfulScreenshot)
    const current = [...live].reverse().find(isSuccessfulScreenshot)
    if (!current) return [...result]
    const persistedArtifacts = new Set(result.flatMap((activity) => activity.artifact_ids))
    if (current.artifact_ids.some((artifactId) => persistedArtifacts.has(artifactId))) return [...result]
    return [...result, current]
}
