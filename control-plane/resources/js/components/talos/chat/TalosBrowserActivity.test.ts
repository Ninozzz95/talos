// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import TalosBrowserActivity from './TalosBrowserActivity.vue'
import type { TalosBrowserActivity as TalosBrowserActivityItem, TalosBrowserSnapshotPreview, TalosBrowserTask, TalosPendingToolApproval } from '../../../lib/talosTypes'

const activities: TalosBrowserActivityItem[] = [
    {
        id: 'navigate-1',
        operation: 'navigate',
        status: 'succeeded',
        label: 'Navigated to https://example.com',
        run_id: 'run-1',
        browser_session_id: 'browser-1',
        artifact_ids: [],
        occurred_at: '2026-07-13T10:00:00Z',
    },
    {
        id: 'screenshot-1',
        operation: 'screenshot',
        status: 'succeeded',
        label: 'Captured browser screenshot',
        run_id: 'run-1',
        browser_session_id: 'browser-1',
        artifact_ids: ['artifact-1'],
        occurred_at: '2026-07-13T10:00:01Z',
    },
]

const snapshot: TalosBrowserSnapshotPreview = {
    preview_available: true,
    snapshot: {
        untrusted: true,
        title: 'Captured page',
        url: 'https://example.com',
        text_digest: 'digest',
        nodes: [{ ref: 'r1', role: 'button', name: 'Continue' }],
    },
}

function task(status: TalosBrowserTask['status']): TalosBrowserTask {
    return {
        id: 'task-1',
        talos_session_id: 'chat-1',
        origin_message_id: 'message-1',
        browser_session_id: 'browser-1',
        runtime_id: 'browser-1',
        active_tab_id: 'tab-1',
        goal: 'Inspect the requested page.',
        status,
        autonomy_profile: 'assist',
        budget: {},
        state_version: 2,
        requested_at: '2026-07-16T08:00:00Z',
        started_at: '2026-07-16T08:00:01Z',
        completed_at: null,
        failed_at: null,
        cancelled_at: status === 'cancelled' ? '2026-07-16T08:00:02Z' : null,
        reconciled_at: null,
        created_at: '2026-07-16T08:00:00Z',
        updated_at: '2026-07-16T08:00:02Z',
    }
}

let app: ReturnType<typeof createApp> | null = null

async function mountActivity(devBrowserEvidence: boolean, activityItems = activities) {
    const shell = document.createElement('main')
    shell.className = 'talos-shell'
    const portal = document.createElement('div')
    portal.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    shell.append(portal, mountPoint)
    document.body.append(shell)
    app = createApp(TalosBrowserActivity, {
        activities: activityItems,
        snapshot,
        talosSessionId: 'chat-1',
        devBrowserEvidence,
    })
    app.mount(mountPoint)
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    return mountPoint
}

afterEach(() => {
    app?.unmount()
    app = null
    document.body.replaceChildren()
})

describe('TalosBrowserActivity raw evidence disclosure', () => {
    it('renders as an embedded body without a second card shell', async () => {
        const shell = document.createElement('main')
        const mountPoint = document.createElement('div')
        shell.append(mountPoint)
        document.body.append(shell)
        app = createApp(TalosBrowserActivity, {
            activities: [],
            snapshot: null,
            talosSessionId: 'chat-1',
            browserTask: task('running'),
            embedded: true,
        })
        app.mount(mountPoint)
        await nextTick()

        const activity = mountPoint.querySelector('[data-testid="talos-browser-activity"]')
        expect(activity?.getAttribute('data-presentation')).toBe('embedded')
        expect(activity?.classList.contains('border')).toBe(false)
        expect(activity?.classList.contains('rounded-md')).toBe(false)
    })

    it('renders accessible compact task state and emits cancellation', async () => {
        const cancelled: string[] = []
        const shell = document.createElement('main')
        const mountPoint = document.createElement('div')
        shell.append(mountPoint)
        document.body.append(shell)
        app = createApp(TalosBrowserActivity, {
            activities: [],
            snapshot: null,
            talosSessionId: 'chat-1',
            browserTask: task('running'),
            onCancelTask: (taskId: string) => cancelled.push(taskId),
        })
        app.mount(mountPoint)
        await nextTick()

        const status = mountPoint.querySelector('[data-testid="talos-browser-task-status"]')
        const button = mountPoint.querySelector<HTMLButtonElement>('[data-testid="talos-browser-task-cancel"]')
        expect(status?.getAttribute('role')).toBe('status')
        expect(status?.getAttribute('aria-live')).toBe('polite')
        expect(status?.textContent).toContain('Browsing in progress')
        expect(status?.querySelector('button')).toBeNull()
        expect(button?.textContent).toContain('Cancel')

        button?.click()
        expect(cancelled).toEqual(['task-1'])
    })

    it('keeps cancelled state after remount without a cancel control', async () => {
        const shell = document.createElement('main')
        const mountPoint = document.createElement('div')
        shell.append(mountPoint)
        document.body.append(shell)
        app = createApp(TalosBrowserActivity, {
            activities: [],
            snapshot: null,
            talosSessionId: 'chat-1',
            browserTask: task('cancelled'),
        })
        app.mount(mountPoint)
        await nextTick()

        expect(mountPoint.textContent).toContain('Browser task cancelled')
        expect(mountPoint.querySelector('[data-testid="talos-browser-task-cancel"]')).toBeNull()
    })

    it('disables a competing task command without presenting the wrong card as cancelling', async () => {
        const shell = document.createElement('main')
        const mountPoint = document.createElement('div')
        shell.append(mountPoint)
        document.body.append(shell)
        app = createApp(TalosBrowserActivity, {
            activities: [],
            snapshot: null,
            talosSessionId: 'chat-1',
            browserTask: task('running'),
            browserTaskBusy: false,
            browserTaskCommandPending: true,
        })
        app.mount(mountPoint)
        await nextTick()

        const button = mountPoint.querySelector<HTMLButtonElement>('[data-testid="talos-browser-task-cancel"]')
        expect(button?.disabled).toBe(true)
        expect(button?.textContent).toContain('Cancel')
        expect(button?.textContent).not.toContain('Cancelling')
    })

    it('shows an actionable cancellation failure without an internal error code', async () => {
        const shell = document.createElement('main')
        const mountPoint = document.createElement('div')
        shell.append(mountPoint)
        document.body.append(shell)
        app = createApp(TalosBrowserActivity, {
            activities: [],
            snapshot: null,
            talosSessionId: 'chat-1',
            browserTask: task('running'),
            browserTaskError: 'The Browser task changed before cancellation. TALOS refreshed its current state.',
        })
        app.mount(mountPoint)
        await nextTick()

        const alert = mountPoint.querySelector('[data-testid="talos-browser-task-error"]')
        expect(alert?.getAttribute('role')).toBe('alert')
        expect(alert?.textContent).toContain('TALOS refreshed its current state')
        expect(alert?.textContent).not.toContain('TALOS_BROWSER_')
    })

    it('keeps an exact procedural approval visible even when no browser activity is present', async () => {
        const pendingApproval: TalosPendingToolApproval = {
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
            state_version: 1,
            evidence_hash: `sha256:${'b'.repeat(64)}`,
            expected_effect: 'Activate the selected browser control and capture verified post-action evidence.',
            target: { ref: 'r1', role: 'button', name: 'Accept all', visible: true },
            url: 'https://example.com',
            title: 'Example',
        }
        const decisions: Array<{ id: string; decision: 'approve' | 'reject' }> = []
        const shell = document.createElement('main')
        shell.className = 'talos-shell'
        const portal = document.createElement('div')
        portal.id = 'talos-portal-root'
        const mountPoint = document.createElement('div')
        shell.append(portal, mountPoint)
        document.body.append(shell)
        app = createApp(TalosBrowserActivity, {
            activities: [],
            snapshot: null,
            talosSessionId: 'chat-1',
            pendingToolApprovals: [pendingApproval],
            onDecideToolApproval: (approval: TalosPendingToolApproval, decision: 'approve' | 'reject') => decisions.push({ id: approval.id, decision }),
        })
        app.mount(mountPoint)
        await nextTick()

        expect(mountPoint.querySelector('[data-testid="talos-browser-activity"]')).not.toBeNull()
        expect(mountPoint.textContent).toContain('Browser action requires approval')
        mountPoint.querySelector<HTMLButtonElement>('[data-testid="tool-approval-reject"]')?.click()
        expect(decisions).toEqual([{ id: 'call-1', decision: 'reject' }])
    })

    it('keeps screenshot evidence while hiding raw activity and snapshot data when the development gate is false', async () => {
        const root = await mountActivity(false)
        await vi.waitFor(() => {
            expect(root.querySelector('[data-testid="talos-browser-screenshot-evidence"]')).not.toBeNull()
        }, { timeout: 5_000, interval: 20 })
        expect(root.querySelector('[data-testid="talos-browser-sanitized-status"]')).not.toBeNull()
        expect(root.textContent).toContain('Page navigation succeeded')
        expect(root.textContent).toContain('Screenshot capture succeeded')
        expect(root.textContent).not.toContain('Browse activity')
        expect(root.textContent).not.toContain('Navigated to https://example.com')
        expect(root.textContent).not.toContain('Untrusted browser evidence')
        expect(root.textContent).not.toContain('Captured page')
        expect(root.textContent).not.toContain('button')
        expect(root.querySelector('[data-testid="talos-browser-snapshot-viewer"]')).toBeNull()
    })

    it('shows a sanitized production status even when no screenshot exists', async () => {
        const root = await mountActivity(false, [activities[0]!])

        expect(root.querySelector('[data-testid="talos-browser-activity"]')).not.toBeNull()
        expect(root.textContent).toContain('Page navigation succeeded')
        expect(root.textContent).not.toContain('https://example.com')
        expect(root.querySelector('[data-testid="talos-browser-screenshot-evidence"]')).toBeNull()
    })

    it('uses the upstream Collapsible and stays closed by default in development', async () => {
        const root = await mountActivity(true)
        const trigger = root.querySelector<HTMLButtonElement>('[data-testid="talos-browser-raw-evidence-trigger"]')
        expect(trigger).not.toBeNull()
        expect(trigger?.getAttribute('aria-expanded')).toBe('false')
        expect(root.textContent).toContain('Untrusted browser evidence')
        expect(root.textContent).not.toContain('Captured page')
        expect(root.textContent).not.toContain('Navigated to https://example.com')

        trigger?.click()
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 120))
        await nextTick()
        expect(trigger?.getAttribute('aria-expanded')).toBe('true')
        expect(root.textContent).toContain('Captured page')
        expect(root.textContent).toContain('Navigated to https://example.com')
        expect(root.querySelector('[data-testid="talos-browser-snapshot-viewer"]')).not.toBeNull()
    })
})
