import { readonly, ref } from 'vue'

/**
 * Owner 2026-07-24 — a station rendered in the tool sheet can push a SUB-VIEW
 * onto the sheet header so there is exactly ONE contextual back control and the
 * title reflects the current subsection (e.g. Settings → Account shows
 * "Account" and Back returns to the settings list, not a second arrow).
 *
 * Module singleton: only one tool sheet is open at a time. A station sets a
 * sub-view while in a nested pane and clears it (or unmounts) to return the
 * header to the station default.
 */
export interface TalosSheetSubView {
    title: string
    back(): void
}

const subView = ref<TalosSheetSubView | null>(null)

export function useTalosSheetNav() {
    return {
        subView: readonly(subView),
        setSubView(view: TalosSheetSubView | null): void {
            subView.value = view
        },
        clear(): void {
            subView.value = null
        },
    }
}
