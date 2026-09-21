import type {
    TalosChatRepository,
    TalosLocalMemory,
} from '@/repositories/chatRepository'

export const TALOS_DISPLAY_NAME_MEMORY_ID = 'talos-profile-display-name'

export async function upsertTalosDisplayNameMemory(
    repository: TalosChatRepository,
    displayName: string,
): Promise<TalosLocalMemory> {
    const normalizedName = displayName.trim()
    if (!normalizedName) throw new Error('TALOS_PROFILE_DISPLAY_NAME_REQUIRED')

    return repository.upsertMemory({
        id: TALOS_DISPLAY_NAME_MEMORY_ID,
        scope_type: 'global',
        scope_id: null,
        kind: 'preference',
        title: 'Display name',
        content: normalizedName,
        source: 'talos_mobile_workspace_setup',
        metadata: {
            system_memory_key: 'profile.display_name',
            created_from: 'talos_mobile_workspace_setup',
        },
        created_at: new Date().toISOString(),
    })
}
