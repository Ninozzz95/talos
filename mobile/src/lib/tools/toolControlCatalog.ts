import type { TalosToolAction } from '@/lib/tools/permissionTypes'
import type { TalosAgentToolId } from '@/lib/tools/toolControls'

export type TalosAgentToolGroup = 'library' | 'personal' | 'web' | 'create' | 'models'

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
    { id: 'library_file_origin', group: 'library', actions: ['read'] },
    { id: 'notes_list', group: 'personal', actions: ['read'] },
    { id: 'tasks_list', group: 'personal', actions: ['read'] },
    { id: 'memory_search', group: 'personal', actions: ['read'] },
    { id: 'time_now', group: 'personal', actions: ['read'] },
    { id: 'notes_create', group: 'personal', actions: ['write'] },
    { id: 'notes_update', group: 'personal', actions: ['write'] },
    { id: 'notes_delete', group: 'personal', actions: ['write'] },
    { id: 'tasks_create', group: 'personal', actions: ['write'] },
    { id: 'tasks_complete', group: 'personal', actions: ['write'] },
    { id: 'tasks_delete', group: 'personal', actions: ['write'] },
    { id: 'web_search', group: 'web', actions: ['outbound', 'write'] },
    { id: 'web_read', group: 'web', actions: ['outbound', 'write'] },
    { id: 'document_create', group: 'create', actions: ['write'] },
    { id: 'generate_image', group: 'create', actions: ['write', 'outbound'] },
    { id: 'library_export', group: 'library', actions: ['write', 'read'] },
    { id: 'library_context_policy_update', group: 'library', actions: ['write'] },
    { id: 'local_models_search', group: 'models', actions: ['outbound'] },
    { id: 'local_model_inspect', group: 'models', actions: ['outbound'] },
    { id: 'local_model_download', group: 'models', actions: ['write', 'outbound'] },
    { id: 'local_models_status', group: 'models', actions: ['read'] },
] as const satisfies readonly TalosAgentToolControl[])
