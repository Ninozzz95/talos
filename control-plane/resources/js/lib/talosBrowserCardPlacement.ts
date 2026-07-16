import type {
    TalosBrowserActivity,
    TalosBrowserTask,
    TalosMessage,
    TalosPendingToolApproval,
} from './talosTypes'

export type TalosBrowserCardPlacement = {
    task: TalosBrowserTask
    originMessage: TalosMessage
    responseMessage: TalosMessage | null
    anchorMessageId: string
    needsTransientAssistantShell: boolean
}

function compareMessages(left: TalosMessage, right: TalosMessage): number {
    const byTime = left.created_at.localeCompare(right.created_at)
    return byTime !== 0 ? byTime : left.id.localeCompare(right.id)
}

function compareTasks(left: TalosBrowserTask, right: TalosBrowserTask): number {
    const byTime = (left.requested_at ?? left.created_at ?? '').localeCompare(
        right.requested_at ?? right.created_at ?? '',
    )
    return byTime !== 0 ? byTime : left.id.localeCompare(right.id)
}

export function buildTalosBrowserCardPlacements(
    messages: readonly TalosMessage[],
    tasks: readonly TalosBrowserTask[],
): TalosBrowserCardPlacement[] {
    const messagesById = new Map(messages.map((message) => [message.id, message]))

    return [...tasks]
        .sort(compareTasks)
        .flatMap((task): TalosBrowserCardPlacement[] => {
            const originMessage = task.origin_message_id
                ? messagesById.get(task.origin_message_id)
                : undefined
            const runId = originMessage?.run_id?.trim()

            if (!originMessage
                || originMessage.role !== 'user'
                || originMessage.session_id !== task.talos_session_id
                || !runId) {
                return []
            }

            const responseMessage = messages
                .filter((message) => (
                    message.session_id === task.talos_session_id
                    && message.run_id === runId
                    && (message.role === 'assistant' || message.role === 'system')
                ))
                .sort(compareMessages)
                .at(-1) ?? null

            return [{
                task,
                originMessage,
                responseMessage,
                anchorMessageId: responseMessage?.id ?? originMessage.id,
                needsTransientAssistantShell: responseMessage === null,
            }]
        })
}

export function activitiesForBrowserCard(
    placement: TalosBrowserCardPlacement,
    activities: readonly TalosBrowserActivity[],
): TalosBrowserActivity[] {
    const runId = placement.originMessage.run_id?.trim()
    const browserSessionId = placement.task.browser_session_id?.trim()
    if (!runId || !browserSessionId) return []

    const exact = new Map<string, TalosBrowserActivity>()
    for (const activity of activities) {
        if (activity.run_id !== runId || activity.browser_session_id !== browserSessionId) continue
        exact.set(activity.id, activity)
    }

    return [...exact.values()].sort((left, right) => {
        const byTime = left.occurred_at.localeCompare(right.occurred_at)
        return byTime !== 0 ? byTime : left.id.localeCompare(right.id)
    })
}

export function unplacedBrowserActivities(
    placements: readonly TalosBrowserCardPlacement[],
    activities: readonly TalosBrowserActivity[],
    persistedMessageActivityIds: readonly string[],
    activeBrowserSessionId: string | null,
): TalosBrowserActivity[] {
    const browserSessionId = activeBrowserSessionId?.trim()
    if (!browserSessionId) return []

    const ownedIds = new Set(persistedMessageActivityIds)
    for (const placement of placements) {
        for (const activity of activitiesForBrowserCard(placement, activities)) {
            ownedIds.add(activity.id)
        }
    }

    const unplaced = new Map<string, TalosBrowserActivity>()
    for (const activity of activities) {
        if (activity.browser_session_id !== browserSessionId || ownedIds.has(activity.id)) continue
        unplaced.set(activity.id, activity)
    }

    return [...unplaced.values()].sort((left, right) => {
        const byTime = left.occurred_at.localeCompare(right.occurred_at)
        return byTime !== 0 ? byTime : left.id.localeCompare(right.id)
    })
}

export function unplacedBrowserApprovals(
    placements: readonly TalosBrowserCardPlacement[],
    approvals: readonly TalosPendingToolApproval[],
    activeBrowserSessionId: string | null,
): TalosPendingToolApproval[] {
    const browserSessionId = activeBrowserSessionId?.trim()
    if (!browserSessionId) return []

    const ownedIds = new Set<string>()
    for (const placement of placements) {
        const runId = placement.originMessage.run_id?.trim()
        const placementSessionId = placement.task.browser_session_id?.trim()
        if (!runId || !placementSessionId) continue

        for (const approval of approvals) {
            if (approval.run_id === runId && approval.browser_session_id === placementSessionId) {
                ownedIds.add(approval.id)
            }
        }
    }

    const unplaced = new Map<string, TalosPendingToolApproval>()
    for (const approval of approvals) {
        if (approval.browser_session_id !== browserSessionId || ownedIds.has(approval.id)) continue
        unplaced.set(approval.id, approval)
    }

    return [...unplaced.values()]
}
