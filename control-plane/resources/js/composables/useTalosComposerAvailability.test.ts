import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { TalosBrowserMode } from '../lib/talosTypes'
import { useTalosComposerAvailability } from './useTalosComposerAvailability'

describe('useTalosComposerAvailability', () => {
    it('blocks submission until an enabled Browser session is ready', () => {
        const prompt = ref('Inspect the current page')
        const sending = ref(false)
        const modelSelectionUsable = ref(true)
        const browserMode = ref<TalosBrowserMode>({
            enabled: true,
            session_id: null,
            status: 'starting',
            capabilities: [],
        })
        const activeBrowserSession = ref<unknown | null>(null)
        const availability = useTalosComposerAvailability({
            prompt,
            sending,
            modelSelectionUsable,
            browserMode,
            activeBrowserSession,
        })

        expect(availability.canSend.value).toBe(false)
        expect(availability.sendDisabledReason.value).toBe('Wait for Browse to become ready before sending.')

        activeBrowserSession.value = { id: 'browser-ready' }
        browserMode.value = { ...browserMode.value, session_id: 'browser-ready', status: 'ready' }

        expect(availability.canSend.value).toBe(true)
        expect(availability.sendDisabledReason.value).toBe('')
    })
})
