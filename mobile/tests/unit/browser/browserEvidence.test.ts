import { describe, expect, it } from 'vitest'
import {
    createTalosManualBrowserActivity,
    extractTalosBrowserUrls,
    mergePersistedBrowserEvidenceWithCurrentFrame,
    normalizeTalosBrowserUrl,
} from '@/lib/browser/browserEvidence'
import type { TalosBrowserActivity } from '@/lib/talosTypes'

function screenshot(id: string, artifactId: string): TalosBrowserActivity {
    return {
        id,
        operation: 'screenshot',
        status: 'succeeded',
        label: id,
        run_id: 'run-1',
        browser_session_id: 'browser-1',
        artifact_ids: [artifactId],
        occurred_at: `2026-07-22T12:00:0${id.at(-1) ?? '0'}.000Z`,
    }
}

describe('createTalosManualBrowserActivity', () => {
    it('converts native lifecycle events into truthful evidence without page artifacts', () => {
        const activity = createTalosManualBrowserActivity({
            type: 'navigated', url: 'https://example.com/path', source: 'native',
        }, {
            activityId: 'activity-1', browserSessionId: 'browser-1',
            occurredAt: '2026-07-22T12:00:00.000Z', presentation: 'isolated_webview',
        })

        expect(activity).toMatchObject({
            operation: 'navigate', status: 'succeeded',
            payload: {
                url: 'https://example.com/path', event_source: 'native', presentation: 'isolated_webview',
            },
            evidence: {
                contract: 'talos.mobile.browser.evidence.v1', source: 'manual_local',
                artifacts: [], snapshot: null,
                activity: { operation: 'navigate', status: 'succeeded', artifact_ids: [] },
            },
        })
    })

    it('maps failed opens to controlled failed session evidence', () => {
        const activity = createTalosManualBrowserActivity({
            type: 'failed', url: 'https://example.com/', source: 'web_external', message: 'Popup blocked',
        }, {
            activityId: 'activity-failed', browserSessionId: 'browser-failed',
            occurredAt: '2026-07-22T12:00:00.000Z', presentation: 'system_browser',
        })

        expect(activity.status).toBe('failed')
        expect(activity.operation).toBe('session_start')
        expect(activity.evidence.activity.status).toBe('failed')
        expect(JSON.stringify(activity)).toContain('Popup blocked')
    })

    it('records opening as a terminal fact instead of an indefinite pending spinner', () => {
        const activity = createTalosManualBrowserActivity({
            type: 'opening', url: 'https://example.com/', source: 'native',
        }, {
            activityId: 'activity-opening', browserSessionId: 'browser-opening',
            occurredAt: '2026-07-22T12:00:00.000Z', presentation: 'isolated_webview',
        })
        expect(activity.status).toBe('succeeded')
        expect(activity.evidence.activity.status).toBe('succeeded')
    })
})

describe('normalizeTalosBrowserUrl', () => {
    it('normalizes only credential-free HTTP(S) URLs', () => {
        expect(normalizeTalosBrowserUrl(' HTTPS://Example.com/a?b=1 ')).toBe('https://example.com/a?b=1')
        expect(normalizeTalosBrowserUrl('http://example.com')).toBe('http://example.com/')
        expect(normalizeTalosBrowserUrl('https://user:pass@example.com')).toBeNull()
        expect(normalizeTalosBrowserUrl('javascript:alert(1)')).toBeNull()
        expect(normalizeTalosBrowserUrl('file:///etc/passwd')).toBeNull()
        expect(normalizeTalosBrowserUrl('https://')).toBeNull()
    })
})

describe('extractTalosBrowserUrls', () => {
    it('extracts natural URLs, removes sentence punctuation and preserves following words', () => {
        expect(extractTalosBrowserUrls(
            'Apri https://example.com/page, poi dimmi cosa vedi. Anche (https://two.example/path?q=1). Fine.',
        )).toEqual([
            'https://example.com/page',
            'https://two.example/path?q=1',
        ])
    })

    it('deduplicates normalized values, supports upper-case schemes and caps the result', () => {
        const values = Array.from({ length: 12 }, (_, index) => `https://example.com/${index}`).join(' ')
        expect(extractTalosBrowserUrls(`HTTPS://EXAMPLE.COM/0 ${values}`)).toHaveLength(8)
        expect(extractTalosBrowserUrls('https://example.com https://example.com/')).toEqual([
            'https://example.com/',
        ])
    })

    it('drops unsafe or credential-bearing candidates', () => {
        expect(extractTalosBrowserUrls(
            'javascript:alert(1) data:text/html,hi https://u:p@example.com file:///tmp/a',
        )).toEqual([])
    })
})

describe('mergePersistedBrowserEvidenceWithCurrentFrame', () => {
    it('adds only the latest missing successful live screenshot', () => {
        expect(mergePersistedBrowserEvidenceWithCurrentFrame(
            [screenshot('activity-1', 'artifact-1')],
            [screenshot('activity-2', 'artifact-2'), screenshot('activity-3', 'artifact-3')],
        ).map((activity) => activity.id)).toEqual(['activity-1', 'activity-3'])
    })

    it('does not duplicate an artifact already persisted', () => {
        expect(mergePersistedBrowserEvidenceWithCurrentFrame(
            [screenshot('activity-1', 'artifact-1')],
            [screenshot('activity-2', 'artifact-1')],
        )).toHaveLength(1)
    })
})
