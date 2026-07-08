import type { NodeStatus } from './talosTypes'

type StatusCopy = {
    user: string
    inspector: string
}

export const statusCopy: Record<NodeStatus, StatusCopy> = {
    PENDING: {
        user: 'Waiting for prerequisites',
        inspector: 'Node is waiting for parent success',
    },
    VALIDATED: {
        user: 'Step verified and ready',
        inspector: 'Payload passed schema validation',
    },
    RUNNING: {
        user: 'Step is executing',
        inspector: 'Worker is active',
    },
    SUCCESS: {
        user: 'Step completed and verified',
        inspector: 'Worker completed without fault',
    },
    FAILED: {
        user: 'Step failed safely',
        inspector: 'Worker or logic failed',
    },
    BLOCKED_BY_DEPENDENCY: {
        user: 'Waiting for a failed dependency to be resolved',
        inspector: 'Parent failure blocked this branch',
    },
    RETRYING: {
        user: 'Retry requested',
        inspector: 'HMI or policy retry is queued',
    },
    SKIPPED: {
        user: 'Step skipped by policy',
        inspector: 'Conditional branch not executed',
    },
    PRUNED: {
        user: 'Branch removed',
        inspector: 'Branch was pruned by approved policy',
    },
}

export function getStatusCopy(status: NodeStatus) {
    return statusCopy[status]
}
