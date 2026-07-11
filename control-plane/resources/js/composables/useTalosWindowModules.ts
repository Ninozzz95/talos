import { getCurrentScope, markRaw, onScopeDispose, ref, type Component } from 'vue'
import { createTalosWindowLoader, type TalosWindowLoaderState } from '../lib/talosWindowLoader'
import {
    TALOS_WINDOW_IDS,
    TALOS_WINDOW_REGISTRY,
    type TalosWindowDescriptor,
    type TalosWindowId,
} from '../lib/talosWindowRegistry'

export function useTalosWindowModules(
    registry: Record<TalosWindowId, TalosWindowDescriptor> = TALOS_WINDOW_REGISTRY,
) {
    const activeWindowSections = ref<Partial<Record<TalosWindowId, string>>>({})
    const loaders = Object.fromEntries(TALOS_WINDOW_IDS.map((id) => [
        id,
        createTalosWindowLoader<Component>(async () => markRaw((await registry[id].loader()).default)),
    ])) as Record<TalosWindowId, ReturnType<typeof createTalosWindowLoader<Component>>>
    const windowLoadStates = ref<Record<TalosWindowId, TalosWindowLoaderState<Component>>>(Object.fromEntries(
        TALOS_WINDOW_IDS.map((id) => [id, { ...loaders[id].state }]),
    ) as Record<TalosWindowId, TalosWindowLoaderState<Component>>)
    const subscriptions = TALOS_WINDOW_IDS.map((id) => loaders[id].subscribe((state) => {
        windowLoadStates.value = {
            ...windowLoadStates.value,
            [id]: { ...state },
        }
    }))

    function sectionTabsFor(id: TalosWindowId) {
        return registry[id].sections
    }

    function isWindowSectionId(id: TalosWindowId, sectionId: string) {
        return sectionTabsFor(id).some((tab) => tab.id === sectionId)
    }

    function activeSectionFor(id: TalosWindowId) {
        const tabs = sectionTabsFor(id)
        const activeSection = activeWindowSections.value[id]
            ?? registry[id].defaultSection
            ?? tabs[0]?.id
            ?? ''

        return isWindowSectionId(id, activeSection) ? activeSection : (tabs[0]?.id ?? '')
    }

    function setActiveWindowSection(id: TalosWindowId, sectionId: string) {
        if (!isWindowSectionId(id, sectionId)) return
        activeWindowSections.value = {
            ...activeWindowSections.value,
            [id]: sectionId,
        }
    }

    function requestWindowModule(id: TalosWindowId, retry = false) {
        return retry ? loaders[id].retry() : loaders[id].load()
    }

    function windowModuleComponent(id: TalosWindowId) {
        return windowLoadStates.value[id].value
    }

    function windowModuleErrorMessage(id: TalosWindowId) {
        const error = windowLoadStates.value[id].error
        return error instanceof Error && error.message.trim()
            ? error.message
            : 'The module bundle could not be loaded. Check the connection and retry.'
    }

    if (getCurrentScope()) {
        onScopeDispose(() => subscriptions.forEach((unsubscribe) => unsubscribe()))
    }

    return {
        activeWindowSections,
        windowLoadStates,
        sectionTabsFor,
        isWindowSectionId,
        activeSectionFor,
        setActiveWindowSection,
        requestWindowModule,
        windowModuleComponent,
        windowModuleErrorMessage,
    }
}
