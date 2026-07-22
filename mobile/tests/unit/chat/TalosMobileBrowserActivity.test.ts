// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileBrowserActivity from '@/components/chat/TalosMobileBrowserActivity.vue'
import type { TalosMobileBrowserActivityView } from '@/components/chat/mobileChatTypes'

const activity: TalosMobileBrowserActivityView = {
    id: 'tool-1',
    operation: 'snapshot',
    status: 'succeeded',
    occurred_at: '2026-07-22T12:00:00.000Z',
    failure_code: null,
    evidence: {
        contract: 'talos.mobile.browser.evidence.v1',
        source: 'trusted_node',
        activity: {
            id: 'activity-1', operation: 'snapshot', status: 'succeeded', label: 'Page structure captured',
            run_id: 'run-1', browser_session_id: 'browser-1', artifact_ids: [],
            occurred_at: '2026-07-22T12:00:00.000Z',
        },
        artifacts: [],
        snapshot: {
            untrusted: true, format: 'aria', url: 'https://example.com/', title: 'Example',
            text_digest: 'digest', truncated: false,
            nodes: [{ role: 'button', name: 'Accept cookies', ref: 'e1', visible: true }],
        },
        retry: null,
    },
}

describe('TalosMobileBrowserActivity', () => {
    it('shows sanitized browser status while raw snapshot evidence stays collapsed and dev-only', async () => {
        const production = mount(TalosMobileBrowserActivity, {
            props: { activities: [activity], showUntrustedEvidence: false },
        })
        expect(production.text()).toContain('Page structure capture succeeded')
        expect(production.text()).not.toContain('Accept cookies')
        expect(production.find('[data-testid="talos-mobile-browser-raw-trigger"]').exists()).toBe(false)

        const development = mount(TalosMobileBrowserActivity, {
            props: { activities: [activity], showUntrustedEvidence: true },
        })
        const trigger = development.get('[data-testid="talos-mobile-browser-raw-trigger"]')
        expect(trigger.attributes('aria-expanded')).toBe('false')
        await trigger.trigger('click')
        expect(trigger.attributes('aria-expanded')).toBe('true')
        expect(development.text()).toContain('Accept cookies')
    })

    it('renders malformed persisted evidence as a controlled recovery state', () => {
        const wrapper = mount(TalosMobileBrowserActivity, {
            props: {
                activities: [{ ...activity, id: 'invalid', evidence: null, failure_code: 'TALOS_BROWSER_EVIDENCE_INVALID' }],
                showUntrustedEvidence: false,
            },
        })
        expect(wrapper.get('[role="alert"]').text()).toContain('Browser evidence could not be verified')
    })
})
