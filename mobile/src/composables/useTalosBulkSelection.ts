import { computed, ref, type ComputedRef, type Ref } from 'vue'

/**
 * "Select several, then delete them" — the mode, not the markup.
 *
 * Owner 2026-07-26 asked for mass selection of both media and chats. The two
 * surfaces look nothing alike and behave identically, so the behaviour lives
 * here once: a selection mode that cannot be left, or one that silently
 * outlives the list it selected from, is how people delete the wrong thing.
 */
export interface TalosBulkSelection {
    readonly active: Readonly<Ref<boolean>>
    readonly ids: ComputedRef<string[]>
    readonly count: ComputedRef<number>
    isSelected(id: string): boolean
    /** Turn the mode on. With an id (long-press), that row starts selected. */
    enter(id?: string): void
    exit(): void
    toggle(id: string): void
    /** Tick every id given, or clear them all if they are already ticked. */
    selectAll(ids: readonly string[]): void
    allSelected(ids: readonly string[]): boolean
    /**
     * Drop ids that are no longer in the list, and leave the mode if that empties
     * the selection. Called after a delete: without it, "2 selected" can refer to
     * rows the user can no longer see.
     */
    reconcile(present: readonly string[]): void
}

export function useTalosBulkSelection(): TalosBulkSelection {
    const active = ref(false)
    // An array, not a Set: the order rows were picked in is the order the
    // confirmation lists them, and Vue tracks it without a wrapper.
    const selected = ref<string[]>([])

    return {
        active,
        ids: computed(() => [...selected.value]),
        count: computed(() => selected.value.length),
        isSelected: (id) => selected.value.includes(id),
        enter(id) {
            active.value = true
            selected.value = id === undefined ? [] : [id]
        },
        exit() {
            active.value = false
            selected.value = []
        },
        toggle(id) {
            // A stray tap from a row that has not noticed the mode ended must not
            // build up an invisible selection.
            if (!active.value) return
            selected.value = selected.value.includes(id)
                ? selected.value.filter((entry) => entry !== id)
                : [...selected.value, id]
        },
        selectAll(ids) {
            if (!active.value) return
            const all = ids.every((id) => selected.value.includes(id))
            selected.value = all ? [] : [...ids]
        },
        allSelected(ids) {
            return ids.length > 0 && ids.every((id) => selected.value.includes(id))
        },
        reconcile(present) {
            if (!active.value) return
            const keep = selected.value.filter((id) => present.includes(id))
            selected.value = keep
            if (keep.length === 0) active.value = false
        },
    }
}
