import { ref, type Ref } from 'vue'

export type TalosRailPreferences = {
    order: string[]
    collapsedGroups: string[]
    collapsed: boolean
}

type TalosRailPreferenceOptions = {
    load: () => Promise<Partial<TalosRailPreferences> | null>
    persist: (value: TalosRailPreferences) => Promise<void>
    knownItemIds: readonly string[]
}

export function useTalosRailPreferences(options: TalosRailPreferenceOptions): {
    order: Ref<string[]>
    collapsedGroups: Ref<string[]>
    collapsed: Ref<boolean>
    moveItem: (id: string, delta: number) => void
    setOrder: (ids: string[]) => void
    toggleGroup: (groupId: string) => void
    setCollapsed: (value: boolean) => void
    hydrate: () => Promise<void>
} {
    const order = ref<string[]>([...options.knownItemIds])
    const collapsedGroups = ref<string[]>([])
    const collapsed = ref(false)
    // A user interaction fences out any hydrate response that resolves later,
    // mirroring the B7.2-R14 newest-request-wins contract.
    let userRevision = 0

    function clampOrder(candidate: readonly string[]): string[] {
        const known = new Set(options.knownItemIds)
        const seen = new Set<string>()
        const next: string[] = []
        for (const id of candidate) {
            if (known.has(id) && !seen.has(id)) {
                next.push(id)
                seen.add(id)
            }
        }
        for (const id of options.knownItemIds) {
            if (!seen.has(id)) next.push(id)
        }
        return next
    }

    function snapshot(): TalosRailPreferences {
        return {
            order: [...order.value],
            collapsedGroups: [...collapsedGroups.value],
            collapsed: collapsed.value,
        }
    }

    function persistCurrent() {
        userRevision += 1
        void options.persist(snapshot()).catch(() => undefined)
    }

    function moveItem(id: string, delta: number) {
        const index = order.value.indexOf(id)
        const target = index + delta
        if (index === -1 || target < 0 || target >= order.value.length) return
        const next = [...order.value]
        next.splice(index, 1)
        next.splice(target, 0, id)
        order.value = next
        persistCurrent()
    }

    function setOrder(ids: string[]) {
        order.value = clampOrder(ids)
        persistCurrent()
    }

    function toggleGroup(groupId: string) {
        collapsedGroups.value = collapsedGroups.value.includes(groupId)
            ? collapsedGroups.value.filter((id) => id !== groupId)
            : [...collapsedGroups.value, groupId]
        persistCurrent()
    }

    function setCollapsed(value: boolean) {
        if (collapsed.value === value) return
        collapsed.value = value
        persistCurrent()
    }

    async function hydrate() {
        const revisionAtStart = userRevision
        let loaded: Partial<TalosRailPreferences> | null = null
        try {
            loaded = await options.load()
        } catch {
            return
        }
        if (userRevision !== revisionAtStart || !loaded) return

        if (Array.isArray(loaded.order)) order.value = clampOrder(loaded.order)
        if (Array.isArray(loaded.collapsedGroups)) {
            collapsedGroups.value = loaded.collapsedGroups.filter((id) => typeof id === 'string')
        }
        if (typeof loaded.collapsed === 'boolean') collapsed.value = loaded.collapsed
    }

    return { order, collapsedGroups, collapsed, moveItem, setOrder, toggleGroup, setCollapsed, hydrate }
}
