import type { TalosToolAction } from '@/lib/tools/permissionTypes'
import type { TalosAgentToolId } from '@/lib/tools/toolControls'

export type TalosAgentToolGroup = 'library' | 'personal' | 'web' | 'create'

export interface TalosAgentToolControl {
    id: TalosAgentToolId
    group: TalosAgentToolGroup
    actions: readonly TalosToolAction[]
}

/** Settings-only metadata; executable-factory conformance is test-guarded. */
export const TALOS_AGENT_TOOL_CONTROLS = Object.freeze([
    { id: 'library_list', group: 'library', actions: ['read'] },
    { id: 'library_search', group: 'library', actions: ['read'] },
    { id: 'library_read', group: 'library', actions: ['read'] },
    { id: 'notes_list', group: 'personal', actions: ['read'] },
    { id: 'tasks_list', group: 'personal', actions: ['read'] },
    { id: 'memory_search', group: 'personal', actions: ['read'] },
    { id: 'time_now', group: 'personal', actions: ['read'] },
    { id: 'web_search', group: 'web', actions: ['outbound', 'write'] },
    { id: 'web_read', group: 'web', actions: ['outbound', 'write'] },
    { id: 'document_create', group: 'create', actions: ['write'] },
    { id: 'generate_image', group: 'create', actions: ['write', 'outbound'] },
    { id: 'library_export', group: 'library', actions: ['write', 'read'] },
    { id: 'library_context_policy_update', group: 'library', actions: ['write'] },
] as const satisfies readonly TalosAgentToolControl[])
