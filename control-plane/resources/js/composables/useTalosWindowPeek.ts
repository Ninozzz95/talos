import { ref, watch, type Ref } from 'vue'
import type { TalosWindowId } from '../lib/talosWindowRegistry'

const TALOS_PEEK_WINDOW_IDS = new Set<TalosWindowId>(['settings', 'theme'])

export function useTalosWindowPeek(visibleWindowIds: Readonly<Ref<readonly TalosWindowId[]>>) {
    const peekedWindowIds = ref<TalosWindowId[]>([])

    function canPeek(id: TalosWindowId): boolean {
        return TALOS_PEEK_WINDOW_IDS.has(id)
    }

    function isPeeked(id: TalosWindowId): boolean {
        return peekedWindowIds.value.includes(id)
    }

    function clearPeek(id: TalosWindowId) {
        peekedWindowIds.value = peekedWindowIds.value.filter((candidate) => candidate !== id)
    }

    function togglePeek(id: TalosWindowId): boolean {
        if (!canPeek(id)) return false

        if (isPeeked(id)) {
            clearPeek(id)
            return false
        }

        peekedWindowIds.value = [...peekedWindowIds.value, id]
        return true
    }

    watch(visibleWindowIds, (visible) => {
        const visibleSet = new Set(visible)
        peekedWindowIds.value = peekedWindowIds.value.filter((id) => visibleSet.has(id))
    })

    return {
        peekedWindowIds,
        canPeek,
        isPeeked,
        clearPeek,
        togglePeek,
    }
}
