// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

// F2-T5 — composer mic control: hidden when dictation is unavailable (honest),
// toggles listening with pressed state parity with the desktop composer.
const profiles: TalosMobileModelProfileView[] = [{
    id: 'profile-deepseek', provider: 'deepseek', model: 'deepseek-chat', display_name: 'DeepSeek Chat',
    status: 'healthy', has_secret: true, effort_levels: ['low'], supports_thinking: false,
    show_in_composer: true, capabilities: null, probe_ok: true,
}]

function mountComposer(overrides: Record<string, unknown> = {}) {
    return mount(TalosMobileComposer, {
        props: {
            prompt: '', modelProfiles: profiles, routingProfiles: [],
            selectedModelProfileId: 'profile-deepseek', selectedRoutingProfileId: null,
            selectedEffort: 'low', thinking: false, canSend: true, sending: false,
            sendDisabledReason: '',
            ...overrides,
        },
    })
}

describe('TalosMobileComposer dictation (F2-T5)', () => {
    it('hides the mic entirely when dictation is unsupported', () => {
        const wrapper = mountComposer()
        expect(wrapper.find('[aria-label="Dictate"]').exists()).toBe(false)
        expect(wrapper.find('[aria-label="Stop dictation"]').exists()).toBe(false)
    })

    it('shows the mic when supported and emits toggleDictation on tap', async () => {
        const wrapper = mountComposer({ dictationSupported: true })
        const mic = wrapper.get('button[aria-label="Dictate"]')
        expect(mic.attributes('aria-pressed')).toBe('false')
        await mic.trigger('click')
        expect(wrapper.emitted('toggleDictation')).toHaveLength(1)
    })

    it('reflects the listening state with pressed semantics', () => {
        const wrapper = mountComposer({ dictationSupported: true, dictationListening: true })
        // The composer mic toggle carries aria-pressed; the listening pill's
        // dedicated Stop button (Claude-style) does not — disambiguate.
        const mic = wrapper.get('button[aria-label="Stop dictation"]')
        expect(mic.attributes('aria-pressed')).toBe('true')
    })

    it('shows the Claude-style listening pill with a waveform and a Stop control', () => {
        const wrapper = mountComposer({ dictationSupported: true, dictationListening: true })
        const pill = wrapper.get('[data-testid="talos-dictation-live"]')
        expect(pill.text()).toContain('Listening')
        expect(pill.find('[data-testid="talos-mic-waveform"]').exists()).toBe(true)
        // Re-review 2026-07-25: the pill's control is "Cancel dictation" so it does
        // not share an accessible name with the morphing right button ("Stop dictation").
        expect(pill.find('button[aria-label="Cancel dictation"]').exists()).toBe(true)
    })
})
