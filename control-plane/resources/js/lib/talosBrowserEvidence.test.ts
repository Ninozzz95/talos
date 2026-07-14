import { describe, expect, it } from 'vitest'
import { mergePersistedBrowserEvidenceWithCurrentFrame } from './talosBrowserEvidence'
import type { TalosBrowserActivity } from './talosTypes'

function screenshot(id: string, artifactId: string, status: TalosBrowserActivity['status'] = 'succeeded'): TalosBrowserActivity {
    return {
        id,
        operation: 'screenshot',
        status,
        label: `Capture ${id}`,
        run_id: null,
        browser_session_id: 'browser-1',
        artifact_ids: [artifactId],
        occurred_at: `2026-07-13T10:00:0${id.slice(-1)}Z`,
    }
}

describe('TALOS browser evidence merging', () => {
    it('appends the latest successful live frame to persisted message evidence', () => {
        const result = mergePersistedBrowserEvidenceWithCurrentFrame(
            [screenshot('event-1', 'artifact-1')],
            [screenshot('event-2', 'artifact-2'), screenshot('event-3', 'artifact-3')],
        )

        expect(result.map((activity) => activity.artifact_ids[0])).toEqual(['artifact-1', 'artifact-3'])
    })

    it('deduplicates an already persisted current frame and ignores failed captures', () => {
        const current = screenshot('event-2', 'artifact-2')
        expect(mergePersistedBrowserEvidenceWithCurrentFrame(
            [current],
            [screenshot('event-3', 'artifact-3', 'failed'), current],
        )).toEqual([current])
    })
})
