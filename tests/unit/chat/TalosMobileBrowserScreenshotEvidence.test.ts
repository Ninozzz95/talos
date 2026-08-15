// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileBrowserScreenshotEvidence from '@/components/chat/TalosMobileBrowserScreenshotEvidence.vue'
import type { TalosMobileBrowserActivityView } from '@/components/chat/mobileChatTypes'

function screenshot(id: string, artifactId: string, previewUri = 'data:image/png;base64,iVBORw0KGgo='): TalosMobileBrowserActivityView {
    return {
        id,
        operation: 'screenshot',
        status: 'succeeded',
        occurred_at: '2026-07-22T12:00:00.000Z',
        failure_code: null,
        evidence: {
            contract: 'talos.mobile.browser.evidence.v1',
            source: 'trusted_node',
            activity: {
                id: `activity-${id}`, operation: 'screenshot', status: 'succeeded', label: 'Screenshot captured',
                run_id: 'run-1', browser_session_id: 'browser-1', artifact_ids: [artifactId],
                occurred_at: '2026-07-22T12:00:00.000Z',
            },
            artifacts: [{
                id: artifactId, type: 'screenshot', media_type: 'image/png', preview_uri: previewUri,
                sha256: 'a'.repeat(64), width: 1280, height: 800,
                source_url: 'https://example.com/', created_at: '2026-07-22T12:00:00.000Z',
            }],
            snapshot: null,
            retry: null,
        },
    }
}

describe('TalosMobileBrowserScreenshotEvidence', () => {
    it('deduplicates artifacts and renders verified captures inline with bounded layout', async () => {
        const wrapper = mount(TalosMobileBrowserScreenshotEvidence, {
            props: { activities: [screenshot('one', 'artifact-1'), screenshot('two', 'artifact-1')] },
        })
        await flushPromises()

        expect(wrapper.findAll('[data-browser-artifact-id="artifact-1"]')).toHaveLength(1)
        expect(wrapper.get('figure').classes()).toContain('max-w-full')
        expect(wrapper.get('img').classes()).toContain('object-contain')
        expect(wrapper.get('img').attributes('src')).toBe('data:image/png;base64,iVBORw0KGgo=')
    })

    it('opens the selected capture through the interactive frame', async () => {
        const wrapper = mount(TalosMobileBrowserScreenshotEvidence, {
            attachTo: document.body,
            props: { activities: [screenshot('one', 'artifact-1')] },
        })
        await wrapper.get('[data-testid="browser-evidence-open-artifact-1"]').trigger('click')
        await flushPromises()
        expect(document.body.querySelector('[data-testid="talos-mobile-browser-frame"]')).not.toBeNull()
        wrapper.unmount()
    })

    it('does not render unverified or non-image artifacts', () => {
        const invalid = screenshot('bad', 'artifact-bad')
        invalid.evidence!.artifacts[0]!.preview_uri = null
        const wrapper = mount(TalosMobileBrowserScreenshotEvidence, { props: { activities: [invalid] } })
        expect(wrapper.find('figure').exists()).toBe(false)
    })
})
