import type { NodeStatus } from './talosTypes'

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type StatusIconKey =
    | 'clock'
    | 'shield-check'
    | 'loader'
    | 'check-circle'
    | 'alert-triangle'
    | 'ban'
    | 'refresh-cw'
    | 'skip-forward'
    | 'git-prune'

export type StatusToneMeta = {
    tone: StatusTone
    iconKey: StatusIconKey
}

export const statusTone: Record<NodeStatus, StatusToneMeta> = {
    PENDING: {
        tone: 'neutral',
        iconKey: 'clock',
    },
    VALIDATED: {
        tone: 'info',
        iconKey: 'shield-check',
    },
    RUNNING: {
        tone: 'info',
        iconKey: 'loader',
    },
    SUCCESS: {
        tone: 'success',
        iconKey: 'check-circle',
    },
    FAILED: {
        tone: 'danger',
        iconKey: 'alert-triangle',
    },
    BLOCKED_BY_DEPENDENCY: {
        tone: 'warning',
        iconKey: 'ban',
    },
    RETRYING: {
        tone: 'warning',
        iconKey: 'refresh-cw',
    },
    SKIPPED: {
        tone: 'neutral',
        iconKey: 'skip-forward',
    },
    PRUNED: {
        tone: 'neutral',
        iconKey: 'git-prune',
    },
}

export function getStatusTone(status: NodeStatus) {
    return statusTone[status]
}
