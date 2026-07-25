import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

// F2-T4 — streaming UI: live assistant text replaces the typing dots while
// chunks arrive; the composer send button becomes an honest Stop control.
// R1-5 — the streaming tail moved into TalosMobileStreamingReply, which
// subscribes to the chat store DIRECTLY so token bursts never re-diff the
// message list. The tests drive the store state the component really reads.
const mockChatState = vi.hoisted(() => ({
    state: null as unknown as { sending: boolean; streamingText: string | null },
}))
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ chat: { state: mockChatState.state } }),
}))

import TalosMobileStreamingReply from '@/components/chat/TalosMobileStreamingReply.vue'

const profiles: TalosMobileModelProfileView[] = [{
    id: 'profile-deepseek', provider: 'deepseek', model: 'deepseek-chat', display_name: 'DeepSeek Chat',
    status: 'healthy', has_secret: true, effort_levels: ['low'], supports_thinking: false,
    show_in_composer: true, capabilities: null, probe_ok: true,
}]

const LF = String.fromCharCode(10)

function mountStreaming(sending: boolean, streamingText: string | null) {
    mockChatState.state = reactive({ sending, streamingText })
    return mount(TalosMobileStreamingReply)
}

describe('TalosMobileStreamingReply (F2-T4 / R1-5)', () => {
    it('F5.1 (owner): streaming text renders as PROGRESSIVE MARKDOWN, not plain text', async () => {
        const wrapper = mountStreaming(true, '## Piano' + LF + LF + '- primo punto' + LF + LF + '```ts' + LF + 'const x =')
        // Owner 2026-07-25: the reveal is paced on a frame clock now, so the
        // markdown appears as the letters land, not in one 120ms jump.
        await vi.waitFor(() => {
            const live = wrapper.get('[data-testid="talos-mobile-streaming"]')
            expect(live.find('h2').exists()).toBe(true)
            expect(live.find('li').exists()).toBe(true)
            // The unterminated fence is auto-closed: code renders instead of raw.
            expect(live.find('pre').exists()).toBe(true)
        }, { timeout: 4000 })
        expect(wrapper.get('h2').text()).toBe('Piano')
    })

    it('renders the live streaming text as an in-progress assistant section instead of typing dots', async () => {
        const wrapper = mountStreaming(true, 'Streaming ans')
        await vi.waitFor(() => {
            expect(wrapper.get('[data-testid="talos-mobile-streaming"]').text()).toContain('Streaming ans')
        }, { timeout: 4000 })
        expect(wrapper.find('[data-testid="talos-mobile-typing"]').exists()).toBe(false)
    })

    it('owner 2026-07-25: while printing there are NO typing dots — the caret is the indicator', async () => {
        const wrapper = mountStreaming(true, 'Sto scrivendo una risposta lunga abbastanza da restare in coda.')
        await vi.waitFor(() => {
            expect(wrapper.get('[data-testid="talos-mobile-streaming"]').text()).toContain('Sto scriv')
            const caret = wrapper.find('[data-testid="talos-stream-caret"]')
            expect(caret.exists()).toBe(true)
            // Pin the CLASS: it is what paints the blinking block.
            expect(caret.classes()).toContain('talos-stream-caret')
        }, { timeout: 4000 })
        expect(wrapper.find('.talos-typing-dot').exists()).toBe(false)
    })

    it('owner 2026-07-25: each revealed letter is its own animated node (fluid, not jumpy)', async () => {
        const wrapper = mountStreaming(true, 'Fluido come una macchina da scrivere che non salta mai una lettera.')
        await vi.waitFor(() => {
            expect(wrapper.findAll('.talos-stream-char').length).toBeGreaterThan(0)
        }, { timeout: 4000 })
        const tail = wrapper.get('[data-testid="talos-stream-tail"]')
        // The tail lives INSIDE the rendered markdown, so letters continue the
        // current line instead of dropping to a new one.
        expect(tail.element.closest('.talos-message-content')).not.toBeNull()
    })

    it('owner 2026-07-25: waiting shows the mark ALONE — no bubble, no container', () => {
        const wrapper = mountStreaming(true, null)
        const waiting = wrapper.get('[data-testid="talos-mobile-typing"]')
        expect(wrapper.find('[data-testid="talos-mobile-streaming"]').exists()).toBe(false)
        // "levare il logo di caricamento dal suo container stile bolle,
        // mantenere solo il logo": no border, no panel fill, no bubble radius.
        // Any surface treatment at all re-creates the container the owner asked
        // to remove — match the shape of the utility, not four known names.
        for (const utility of waiting.classes()) {
            expect(utility, `waiting state must stay bare: ${utility}`)
                .not.toMatch(/^(rounded|border|bg-|shadow|ring|backdrop)/)
        }
        expect(waiting.find('svg').exists()).toBe(true)
    })

    it('renders nothing at all when idle', () => {
        const wrapper = mountStreaming(false, null)
        expect(wrapper.find('[data-testid="talos-mobile-typing"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-mobile-streaming"]').exists()).toBe(false)
    })
})

describe('TalosMobileComposer stop control (F2-T4)', () => {
    function mountComposer(sending: boolean) {
        return mount(TalosMobileComposer, {
            props: {
                prompt: '', modelProfiles: profiles, routingProfiles: [],
                selectedModelProfileId: 'profile-deepseek', selectedRoutingProfileId: null,
                selectedEffort: 'low', thinking: false, canSend: true, sending,
                sendDisabledReason: '',
            },
        })
    }

    it('replaces Send with a Stop button while sending, emitting stop on tap', async () => {
        const wrapper = mountComposer(true)
        const stop = wrapper.get('button[aria-label="Stop response"]')
        await stop.trigger('click')
        expect(wrapper.emitted('stop')).toHaveLength(1)
        expect(wrapper.find('button[aria-label="Send message"]').exists()).toBe(false)
    })

    it('shows the Send button when idle', () => {
        const wrapper = mountComposer(false)
        expect(wrapper.find('button[aria-label="Send message"]').exists()).toBe(true)
        expect(wrapper.find('button[aria-label="Stop response"]').exists()).toBe(false)
    })
})
