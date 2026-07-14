// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { TalosPendingToolApproval } from '../../../lib/talosTypes'
import TalosToolApprovalCard from './TalosToolApprovalCard.vue'

function approval(overrides: Partial<TalosPendingToolApproval> = {}): TalosPendingToolApproval {
    return {
        id: 'call-1',
        turn_id: 'turn-1',
        run_id: 'run-1',
        tool_name: 'browser_click',
        risk: 'high',
        capability: 'browser.write',
        status: 'pending',
        actionable: true,
        stale_reason: null,
        plan_hash: `sha256:${'a'.repeat(64)}`,
        browser_session_id: 'browser-1',
        snapshot_artifact_id: 'artifact-1',
        snapshot_id: 'snapshot-1',
        state_version: 4,
        evidence_hash: `sha256:${'b'.repeat(64)}`,
        expected_effect: 'Activate the selected browser control and capture verified post-action evidence.',
        target: { ref: 'r1', role: 'button', name: 'Accept all', visible: true },
        url: 'https://example.com/privacy',
        title: 'Example privacy',
        ...overrides,
    }
}

let app: ReturnType<typeof createApp> | null = null

async function mountCard(item: TalosPendingToolApproval, busy = false) {
    const portal = document.createElement('div')
    portal.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    document.body.append(portal, mountPoint)
    const decisions: Array<'approve' | 'reject'> = []
    app = createApp(TalosToolApprovalCard, {
        approval: item,
        busy,
        onDecide: (decision: 'approve' | 'reject') => decisions.push(decision),
    })
    app.mount(mountPoint)
    await nextTick()
    return { mountPoint, decisions }
}

afterEach(() => {
    app?.unmount()
    app = null
    document.body.replaceChildren()
})

describe('TalosToolApprovalCard', () => {
    it('shows the exact browser target and requires explicit confirmation before approval', async () => {
        const { mountPoint, decisions } = await mountCard(approval())

        expect(mountPoint.textContent).toContain('Browser action requires approval')
        expect(mountPoint.textContent).toContain('Accept all')
        expect(mountPoint.textContent).toContain('button')
        expect(mountPoint.textContent).toContain('example.com')

        mountPoint.querySelector<HTMLButtonElement>('[data-testid="tool-approval-reject"]')?.click()
        expect(decisions).toEqual(['reject'])

        mountPoint.querySelector<HTMLButtonElement>('[data-testid="tool-approval-open-confirm"]')?.click()
        await nextTick()
        document.body.querySelector<HTMLButtonElement>('[data-testid="tool-approval-confirm"]')?.click()
        await nextTick()
        expect(decisions).toEqual(['reject', 'approve'])
    })

    it('renders stale evidence as non-actionable and never emits a decision', async () => {
        const { mountPoint, decisions } = await mountCard(approval({
            status: 'stale',
            actionable: false,
            stale_reason: 'TALOS_BROWSER_STALE_EVIDENCE',
        }))

        expect(mountPoint.querySelector('[data-approval-status="stale"]')).not.toBeNull()
        expect(mountPoint.textContent).toContain('This action is stale')
        expect(mountPoint.textContent).toContain('TALOS_BROWSER_STALE_EVIDENCE')
        expect(mountPoint.querySelector('[data-testid="tool-approval-open-confirm"]')).toBeNull()
        expect(mountPoint.querySelector('[data-testid="tool-approval-reject"]')).toBeNull()
        expect(decisions).toEqual([])
    })
})
