// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

// F2-T4 — streaming UI: live assistant text replaces the typing dots while
// chunks arrive; the composer send button becomes an honest Stop control.
// R1-5 — the streaming tail moved into TalosMobileStreamingReply, which
// subscribes to the chat store DIRECTLY so token bursts never re-diff the
// message list. The tests drive the store state the component really reads.
const mockChatState = vi.hoisted(() => ({
    state: null as unknown as {
        sending: boolean
        streamingText: string | null
        streamingSessionId: string | null
    },
    toolActivity: { value: [] as Array<{ name: string; detail: string | null }> },
}))
vi.mock('@/stores/chatController', () => ({
    // The tool block: the streaming reply now also shows which tools are
    // running, so the mock has to carry that signal too.
    useChatController: () => ({
        chat: {
            state: mockChatState.state,
            // The live reply belongs to a conversation now, so the component
            // needs to know which one is on screen.
            activeSession: { value: { id: 's1', title: 'A' } },
        },
        toolActivity: mockChatState.toolActivity,
    }),
}))
const mockSettings = vi.hoisted(() => ({
    state: { shell: { streaming_animation: 'typewriter' as 'typewriter' | 'fade' } },
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => mockSettings,
}))

import TalosMobileStreamingReply from '@/components/chat/TalosMobileStreamingReply.vue'

const profiles: TalosMobileModelProfileView[] = [{
    id: 'profile-deepseek', provider: 'deepseek', model: 'deepseek-chat', display_name: 'DeepSeek Chat',
    status: 'healthy', has_secret: true, effort_levels: ['low'], supports_thinking: false,
    show_in_composer: true, capabilities: null, probe_ok: true,
}]

const LF = String.fromCharCode(10)

function mountStreaming(
    sending: boolean,
    streamingText: string | null,
    // Owner testing 2026-07-26: the activity carries a DETAIL now, because four
    // rows all reading `web_read` told the user nothing about which page.
    tools: Array<{ name: string; detail: string | null }> = [],
) {
    // The live reply now belongs to a conversation: without the owner it is
    // rendered nowhere, which is the point of the fix and would silently make
    // every assertion here vacuous.
    mockChatState.state = reactive({ sending, streamingText, streamingSessionId: 's1' })
    mockChatState.toolActivity = reactive({ value: tools })
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

    it('owner 2026-07-25: newly revealed fragments animate in the inline tail (fluid, not jumpy)', async () => {
        const wrapper = mountStreaming(true, 'Fluido come una macchina da scrivere che non salta mai una lettera.')
        await vi.waitFor(() => {
            expect(wrapper.findAll('.talos-stream-char').length).toBeGreaterThan(0)
        }, { timeout: 4000 })
        const tail = wrapper.get('[data-testid="talos-stream-tail"]')
        // The tail lives INSIDE the rendered markdown, so letters continue the
        // current line instead of dropping to a new one.
        expect(tail.element.closest('.talos-message-content')).not.toBeNull()
    })

    it('P10c: never duplicates already-painted text when the markdown prefix catches up', async () => {
        const initial = 'Primo frammento stabile.'
        const complete = `${initial} Secondo frammento aggiunto.`
        const wrapper = mountStreaming(true, initial)

        await vi.waitFor(() => {
            expect(wrapper.get('.talos-message-content').text()).toBe(initial)
        }, { timeout: 4000 })
        // Let the throttled Markdown prefix absorb the first raw tail before a
        // new provider chunk arrives. The next paint must concatenate, not
        // append another copy of text the parser now owns.
        await new Promise<void>((resolve) => setTimeout(resolve, 150))
        mockChatState.state.streamingText = complete

        await vi.waitFor(() => {
            expect(wrapper.get('.talos-message-content').text()).toBe(complete)
        }, { timeout: 4000 })
        expect(wrapper.get('.talos-message-content').text().match(/Primo frammento/g)).toHaveLength(1)
    })

    it('P10c: Fade paints the fade modifier and never creates the typewriter caret', async () => {
        mockSettings.state.shell.streaming_animation = 'fade'
        try {
            const wrapper = mountStreaming(true, 'Fade pulito senza il cursore da macchina da scrivere.')
            await vi.waitFor(() => {
                expect(wrapper.find('.talos-stream-char--fade').exists()).toBe(true)
            }, { timeout: 4000 })
            expect(wrapper.find('[data-testid="talos-stream-caret"]').exists()).toBe(false)
        } finally {
            mockSettings.state.shell.streaming_animation = 'typewriter'
        }
    })

    it('P10c/R4: Fade holds a provider fragment until its word is complete', async () => {
        mockSettings.state.shell.streaming_animation = 'fade'
        try {
            const wrapper = mountStreaming(true, 'renderiz')
            await new Promise<void>((resolve) => setTimeout(resolve, 250))

            expect(wrapper.text()).not.toContain('renderiz')
            expect(wrapper.find('.talos-stream-char--fade').exists()).toBe(false)

            mockChatState.state.streamingText = 'renderizza '
            await vi.waitFor(() => {
                expect(wrapper.get('[data-testid="talos-mobile-streaming"]').text())
                    .toContain('renderizza')
            }, { timeout: 4000 })
        } finally {
            mockSettings.state.shell.streaming_animation = 'typewriter'
        }
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

/**
 * The tool block: silence while a model searches your Library looks exactly
 * like a hang. These pin that the chat says what it is doing, in words a person
 * reads rather than the wire names the model uses.
 */
describe('tool activity in the streaming reply', () => {
    it('names the running tools in plain language, before any text exists', async () => {
        const wrapper = mountStreaming(true, null, [{ name: 'library_search', detail: null }])
        await flushPromises()
        const activity = wrapper.get('[data-testid="talos-tool-activity"]')
        expect(activity.text()).toContain('Searching your Library')
        // The wire name must not leak into the interface.
        expect(activity.text()).not.toContain('library_search')
    })

    it('shows an unknown tool by name rather than hiding it', async () => {
        const wrapper = mountStreaming(true, null, [{ name: 'some_future_tool', detail: null }])
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-tool-activity"]').text()).toContain('some_future_tool')
    })

    it('says WHICH page it is reading, so repeated rows are distinguishable', async () => {
        const wrapper = mountStreaming(true, null, [
            { name: 'web_read', detail: 'agenziaentrate.gov.it' },
            { name: 'web_read', detail: 'fiscoetasse.com' },
        ])
        await flushPromises()
        const activity = wrapper.get('[data-testid="talos-tool-activity"]')
        expect(activity.text()).toContain('agenziaentrate.gov.it')
        expect(activity.text()).toContain('fiscoetasse.com')
        expect(activity.text()).not.toContain('web_read')
    })

    it('names image generation and device save without wire names', async () => {
        const wrapper = mountStreaming(true, null, [
            { name: 'generate_image', detail: null },
            { name: 'library_export', detail: 'Quarterly Report.pdf' },
        ])
        await flushPromises()
        const activity = wrapper.get('[data-testid="talos-tool-activity"]')
        expect(activity.text()).toContain('Generating an image')
        expect(activity.text()).toContain('Saving a file to your device: Quarterly Report.pdf')
        expect(activity.text()).not.toContain('generate_image')
        expect(activity.text()).not.toContain('library_export')
    })

    it('C45-RED-09D renders memory_write as natural copy instead of the wire id', async () => {
        const wrapper = mountStreaming(true, null, [{ name: 'memory_write', detail: null }])
        await flushPromises()
        const activity = wrapper.get('[data-testid="talos-tool-activity"]')

        expect(activity.text()).toContain('Saving something to memory')
        expect(activity.text()).not.toContain('memory_write')
    })

    it('shows nothing when no tool is running', async () => {
        const wrapper = mountStreaming(true, 'testo')
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-tool-activity"]').exists()).toBe(false)
    })
})
