import { computed, type Ref } from 'vue'
import type { TalosBrowserMode } from '../lib/talosTypes'

type ComposerAvailabilityOptions = {
    prompt: Readonly<Ref<string>>
    sending: Readonly<Ref<boolean>>
    modelSelectionUsable: Readonly<Ref<boolean>>
    browserMode: Readonly<Ref<TalosBrowserMode>>
    activeBrowserSession: Readonly<Ref<unknown | null>>
}

export function useTalosComposerAvailability(options: ComposerAvailabilityOptions) {
    const browserReadyForSend = computed(() => !options.browserMode.value.enabled || (
        Boolean(options.activeBrowserSession.value)
        && ['ready', 'active'].includes(options.browserMode.value.status)
    ))
    const canSend = computed(() => options.prompt.value.trim().length > 0
        && !options.sending.value
        && options.modelSelectionUsable.value
        && browserReadyForSend.value)
    const sendDisabledReason = computed(() => {
        if (options.sending.value) return 'TALOS is already processing a message.'
        if (!options.prompt.value.trim()) return 'Type a workflow in the composer before sending.'
        if (!options.modelSelectionUsable.value) return 'Choose a usable model or routing profile before sending.'
        if (!browserReadyForSend.value) return 'Wait for Browse to become ready before sending.'
        return ''
    })

    return { browserReadyForSend, canSend, sendDisabledReason }
}
