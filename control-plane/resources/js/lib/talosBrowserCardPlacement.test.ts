import { describe, expect, it } from 'vitest'
import {
    activitiesForBrowserCard,
    buildTalosBrowserCardPlacements,
    unplacedBrowserActivities,
    unplacedBrowserApprovals,
} from './talosBrowserCardPlacement'
import type {
    TalosBrowserActivity,
    TalosBrowserTask,
    TalosMessage,
    TalosPendingToolApproval,
} from './talosTypes'

function message(overrides: Partial<TalosMessage> = {}): TalosMessage {
    return {
        id: 'message-user-1',
        session_id: 'session-1',
        role: 'user',
        content: 'Inspect the page.',
        run_id: 'run-1',
        metadata: null,
        created_at: '2026-07-16T08:00:00.000Z',
        ...overrides,
    }
}

function task(overrides: Partial<TalosBrowserTask> = {}): TalosBrowserTask {
    return {
        id: 'task-1',
        talos_session_id: 'session-1',
        origin_message_id: 'message-user-1',
        browser_session_id: 'browser-session-1',
        runtime_id: 'worker-session-1',
        active_tab_id: 'tab-1',
        goal: 'Inspect the page.',
        status: 'running',
        autonomy_profile: 'assist',
        budget: {},
        state_version: 3,
        requested_at: '2026-07-16T08:00:00.000Z',
        started_at: '2026-07-16T08:00:01.000Z',
        completed_at: null,
        failed_at: null,
        cancelled_at: null,
        reconciled_at: null,
        created_at: '2026-07-16T08:00:00.000Z',
        updated_at: '2026-07-16T08:00:01.000Z',
        ...overrides,
    }
}

function activity(overrides: Partial<TalosBrowserActivity> = {}): TalosBrowserActivity {
    return {
        id: 'activity-1',
        operation: 'screenshot',
        status: 'succeeded',
        label: 'Screenshot captured',
        run_id: 'run-1',
        browser_session_id: 'browser-session-1',
        artifact_ids: ['artifact-1'],
        occurred_at: '2026-07-16T08:00:02.000Z',
        ...overrides,
    }
}

function approval(overrides: Partial<TalosPendingToolApproval> = {}): TalosPendingToolApproval {
    return {
        id: 'approval-1',
        turn_id: 'turn-1',
        run_id: 'run-1',
        tool_name: 'browser_click',
        risk: 'high',
        capability: 'browser.write',
        status: 'pending',
        actionable: true,
        stale_reason: null,
        plan_hash: 'plan-hash',
        browser_session_id: 'browser-session-1',
        snapshot_artifact_id: 'artifact-1',
        snapshot_id: 'snapshot-1',
        state_version: 1,
        evidence_hash: 'evidence-hash',
        expected_effect: 'Dismiss the cookie banner',
        target: {
            ref: 'button-1',
            role: 'button',
            name: 'Accept',
            visible: true,
        },
        url: 'https://example.test',
        title: 'Example',
        ...overrides,
    }
}

describe('buildTalosBrowserCardPlacements', () => {
    it('attaches a task only to its exact origin and same-run response after reload reordering', () => {
        const origin = message()
        const response = message({
            id: 'message-assistant-1',
            role: 'assistant',
            content: 'The page is ready.',
            created_at: '2026-07-16T08:00:02.000Z',
        })
        const unrelated = message({
            id: 'message-assistant-other-run',
            role: 'assistant',
            run_id: 'run-2',
            content: 'Unrelated response.',
            created_at: '2026-07-16T08:00:03.000Z',
        })

        const placements = buildTalosBrowserCardPlacements(
            [unrelated, response, origin],
            [task()],
        )

        expect(placements).toHaveLength(1)
        expect(placements[0]).toMatchObject({
            task: { id: 'task-1' },
            originMessage: { id: 'message-user-1' },
            responseMessage: { id: 'message-assistant-1' },
            anchorMessageId: 'message-assistant-1',
            needsTransientAssistantShell: false,
        })
    })

    it('creates a transient assistant placement directly after an exact pending origin', () => {
        const placements = buildTalosBrowserCardPlacements([message()], [task()])

        expect(placements).toHaveLength(1)
        expect(placements[0]).toMatchObject({
            originMessage: { id: 'message-user-1' },
            responseMessage: null,
            anchorMessageId: 'message-user-1',
            needsTransientAssistantShell: true,
        })
    })

    it('keeps multiple tasks distinct and excludes unowned or uncorrelated tasks', () => {
        const origin = message()
        const response = message({ id: 'message-system-1', role: 'system' })
        const placements = buildTalosBrowserCardPlacements(
            [origin, response],
            [
                task(),
                task({ id: 'task-2', active_tab_id: 'tab-2' }),
                task({ id: 'task-other-session', talos_session_id: 'session-other' }),
                task({ id: 'task-missing-origin', origin_message_id: 'missing-message' }),
            ],
        )

        expect(placements.map((placement) => placement.task.id)).toEqual(['task-1', 'task-2'])
        expect(placements.every((placement) => placement.responseMessage?.id === 'message-system-1')).toBe(true)
    })

    it('fails closed when the origin has no persisted run identity', () => {
        const placements = buildTalosBrowserCardPlacements(
            [message({ run_id: null })],
            [task()],
        )

        expect(placements).toEqual([])
    })

    it('keeps only exact run and browser-session activity and deduplicates persisted evidence', () => {
        const placement = buildTalosBrowserCardPlacements(
            [message(), message({ id: 'message-assistant-1', role: 'assistant' })],
            [task()],
        )[0]!
        expect(activitiesForBrowserCard(placement, [
            activity(),
            activity({ label: 'Duplicate projection' }),
            activity({ id: 'wrong-run', run_id: 'run-2' }),
            activity({ id: 'missing-run', run_id: null }),
            activity({ id: 'wrong-session', browser_session_id: 'browser-session-2' }),
            activity({ id: 'activity-2', operation: 'navigate', artifact_ids: [], occurred_at: '2026-07-16T08:00:01.000Z' }),
        ])).toEqual([
            expect.objectContaining({ id: 'activity-2' }),
            expect.objectContaining({ id: 'activity-1', label: 'Duplicate projection' }),
        ])
    })
})

describe('unplaced Browser session ownership', () => {
    it('keeps only current-session activity not owned by a task card or persisted message', () => {
        const placements = buildTalosBrowserCardPlacements([message()], [task()])

        expect(unplacedBrowserActivities(
            placements,
            [
                activity(),
                activity({ id: 'manual-screenshot', run_id: null, artifact_ids: ['artifact-manual'], occurred_at: '2026-07-16T08:00:04.000Z' }),
                activity({ id: 'persisted-screenshot', run_id: 'run-legacy', artifact_ids: ['artifact-persisted'], occurred_at: '2026-07-16T08:00:03.000Z' }),
                activity({ id: 'manual-screenshot', run_id: null, label: 'Duplicate manual projection', artifact_ids: ['artifact-manual'], occurred_at: '2026-07-16T08:00:04.000Z' }),
                activity({ id: 'other-session', run_id: null, browser_session_id: 'browser-session-2' }),
            ],
            ['persisted-screenshot'],
            'browser-session-1',
        )).toEqual([
            expect.objectContaining({ id: 'manual-screenshot', label: 'Duplicate manual projection' }),
        ])
    })

    it('keeps only current-session approvals not owned by an exact task placement', () => {
        const placements = buildTalosBrowserCardPlacements([message()], [task()])

        expect(unplacedBrowserApprovals(
            placements,
            [
                approval(),
                approval({ id: 'manual-approval', run_id: 'run-manual' }),
                approval({ id: 'manual-approval', run_id: 'run-manual', expected_effect: 'Latest projection wins' }),
                approval({ id: 'other-session', run_id: 'run-manual', browser_session_id: 'browser-session-2' }),
            ],
            'browser-session-1',
        )).toEqual([
            expect.objectContaining({ id: 'manual-approval', expected_effect: 'Latest projection wins' }),
        ])
    })

    it('fails closed without an active Browser session', () => {
        const placements = buildTalosBrowserCardPlacements([message()], [task()])

        expect(unplacedBrowserActivities(placements, [activity()], [], null)).toEqual([])
        expect(unplacedBrowserApprovals(placements, [approval()], null)).toEqual([])
    })
})
