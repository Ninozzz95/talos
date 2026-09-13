// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileSessionExportSheet from '@/components/chat/TalosMobileSessionExportSheet.vue'

const state = vi.hoisted(() => {
    const session = {
        id: 'session-copy',
        title: 'Transcript da copiare',
        surface: 'chat',
        mode: 'answer_only',
        persistence_mode: 'persistent',
        active_model_profile_id: 'gemini:gemini-live',
        metadata: {},
        created_at: '2026-07-28T08:00:00.000Z',
        updated_at: '2026-07-28T08:01:00.000Z',
    }
    const snapshot = {
        session,
        messages: [
            {
                id: 'user-copy',
                session_id: session.id,
                role: 'user',
                content: 'Mantieni **questo Markdown**.',
                state: 'persisted',
                model_profile_id: null,
                run_id: null,
                ordinal: 0,
                metadata: {},
                created_at: '2026-07-28T08:00:10.000Z',
                updated_at: '2026-07-28T08:00:10.000Z',
            },
            {
                id: 'assistant-copy',
                session_id: session.id,
                role: 'assistant',
                content: 'Riga uno.\n\n- Riga due',
                state: 'persisted',
                model_profile_id: 'gemini:gemini-live',
                run_id: null,
                ordinal: 1,
                metadata: { reasoning: 'Verifica A.\nVerifica B.' },
                created_at: '2026-07-28T08:00:20.000Z',
                updated_at: '2026-07-28T08:00:20.000Z',
            },
        ],
        activities: [],
        attachments: [],
    }
    return {
        writeClipboard: vi.fn(),
        controller: {
            chat: {
                activeSession: { value: session },
                exportSnapshot: vi.fn(async () => snapshot),
            },
            attachments: {
                saveGenerated: vi.fn(),
            },
        },
    }
})

vi.mock('@/stores/chatController', () => ({
    useChatController: () => state.controller,
}))
vi.mock('@/services/clipboard', () => ({
    writeTalosClipboardText: state.writeClipboard,
}))
vi.mock('@/services/sessionExportDelivery', () => ({
    deliverTalosSessionExport: vi.fn(),
}))

function mountSheet() {
    const app = document.createElement('div')
    app.id = 'app'
    document.body.append(app)
    return mount(TalosMobileSessionExportSheet, {
        attachTo: document.body,
        global: { stubs: { Teleport: true } },
    })
}

beforeEach(() => {
    state.writeClipboard.mockReset().mockResolvedValue(undefined)
    state.controller.chat.exportSnapshot.mockClear()
    state.controller.attachments.saveGenerated.mockReset()
})

afterEach(() => {
    document.body.innerHTML = ''
})

describe('P1 Copy Markdown transcript', () => {
    it('COPY-MD-01/02/03 copies the exact generated Markdown and reports success only there', async () => {
        const wrapper = mountSheet()
        expect(wrapper.find('[aria-label="Copy Markdown transcript"]').exists()).toBe(false)

        await wrapper.get('[aria-label="Export Markdown transcript"]').trigger('click')
        await flushPromises()

        const preview = wrapper.get('[data-testid="talos-session-export-preview"]')
        const expected = preview.element.textContent ?? ''
        expect(expected).toContain('# TALOS Session Export')
        expect(expected).toContain('> **Reasoning**')

        await wrapper.get('[aria-label="Copy Markdown transcript"]').trigger('click')
        await flushPromises()

        expect(state.writeClipboard).toHaveBeenCalledTimes(1)
        expect(state.writeClipboard).toHaveBeenCalledWith(expected)
        expect(wrapper.get('[aria-label="Copy Markdown transcript"]').text())
            .toContain('Copied Markdown transcript')
        expect(wrapper.get('[data-testid="talos-export-copy-status"]').text())
            .toBe('Markdown transcript copied.')

        await wrapper.get('[aria-label="Export JSON evidence pack"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[aria-label="Copy Markdown transcript"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('COPY-MD-04 keeps the preview and Share / Save usable after a controlled rejection', async () => {
        state.writeClipboard.mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'))
        const wrapper = mountSheet()
        await wrapper.get('[aria-label="Export Markdown transcript"]').trigger('click')
        await flushPromises()
        await wrapper.get('[aria-label="Copy Markdown transcript"]').trigger('click')
        await flushPromises()

        expect(wrapper.get('[role="alert"]').text()).toBe(
            'TALOS could not copy the Markdown transcript. Use Share / Save instead.',
        )
        expect(wrapper.get('[role="alert"]').text()).not.toContain('NotAllowedError')
        expect(wrapper.get('[data-testid="talos-session-export-preview"]').exists()).toBe(true)
        expect(wrapper.get('[data-testid="talos-export-share"]').attributes('disabled')).toBeUndefined()
        wrapper.unmount()
    })
})
