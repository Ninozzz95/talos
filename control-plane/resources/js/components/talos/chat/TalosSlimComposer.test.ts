// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import type { TalosBrowserMode, TalosComposerMode } from '../../../lib/talosTypes'
import TalosSlimComposer from './TalosSlimComposer.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountComposer(mode: TalosComposerMode, browserEnabled = false, overrides: Record<string, unknown> = {}) {
    const browserMode: TalosBrowserMode = {
        enabled: browserEnabled,
        session_id: browserEnabled ? 'browser-1' : null,
        status: browserEnabled ? 'active' : 'disconnected',
        capabilities: browserEnabled ? ['snapshot', 'screenshot'] : [],
    }
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp({
        render: () => h(TalosSlimComposer, {
            prompt: 'Inspect this workflow',
            'onUpdate:prompt': () => undefined,
            commands: [],
            canSend: true,
            sending: false,
            statusText: 'DeepSeek profile',
            modelLabel: 'DeepSeek Chat',
            contextLabel: 'Audit context',
            temporaryMode: false,
            visibility: {},
            browserMode,
            devBrowserEvidence: false,
            composerMode: mode,
            chatLayoutLocked: false,
            ...overrides,
        }),
    })
    mounted.push(app)
    app.mount(container)
    return container
}

describe('TalosSlimComposer', () => {
    it('routes a non-empty Enter submission through the workspace guard even when availability is blocked', () => {
        const send = vi.fn()
        const container = mountComposer('full', false, {
            canSend: false,
            sendDisabledReason: 'Choose a usable model or routing profile before sending.',
            onSend: send,
        })
        const composer = container.querySelector<HTMLTextAreaElement>('[aria-label="Message TALOS"]')

        composer?.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
        }))

        expect(send).toHaveBeenCalledOnce()
    })

    it('keeps Shift+Enter available for multiline prompts', () => {
        const send = vi.fn()
        const container = mountComposer('full', false, { onSend: send })
        const composer = container.querySelector<HTMLTextAreaElement>('[aria-label="Message TALOS"]')

        composer?.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        }))

        expect(send).not.toHaveBeenCalled()
    })

    it('replaces Send with a real Stop command while a cancellable stream is active', () => {
        const send = vi.fn()
        const cancelStream = vi.fn()
        const container = mountComposer('full', false, {
            sending: true,
            streamingActive: true,
            onSend: send,
            onCancelStream: cancelStream,
        })
        const stop = container.querySelector<HTMLButtonElement>('[aria-label="Stop response"]')
        const composer = container.querySelector<HTMLTextAreaElement>('[aria-label="Message TALOS"]')

        expect(stop).not.toBeNull()
        expect(stop?.disabled).toBe(false)
        expect(container.querySelector('[aria-label="Send"]')).toBeNull()
        expect(composer?.disabled).toBe(true)

        stop?.click()
        composer?.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
        }))

        expect(cancelStream).toHaveBeenCalledOnce()
        expect(send).not.toHaveBeenCalled()
    })

    it('grows a long prompt up to a viewport-safe composer limit', () => {
        const container = mountComposer('full')
        const composer = container.querySelector<HTMLTextAreaElement>('[aria-label="Message TALOS"]')

        expect(composer).not.toBeNull()
        Object.defineProperty(composer!, 'scrollHeight', { configurable: true, value: 220 })
        composer!.dispatchEvent(new Event('input', { bubbles: true }))

        expect(composer?.style.height).toBe('220px')
        expect(composer?.className).toContain('max-h-[min(16rem,35vh)]')
        expect(composer?.className).toContain('overflow-y-auto')
    })

    it('organizes full mode into one prompt row and one quiet capability row', () => {
        const container = mountComposer('full')
        const promptRow = container.querySelector('[data-testid="talos-composer-prompt-row"]')
        const capabilities = container.querySelector('[data-testid="talos-composer-capability-row"]')

        expect(promptRow?.querySelector('[aria-label="Message TALOS"]')).not.toBeNull()
        expect(promptRow?.querySelector('[aria-label="Send"]')).not.toBeNull()
        expect(capabilities?.querySelector('[aria-label="Choose model profile"]')).not.toBeNull()
        expect(capabilities?.querySelector('[aria-label="Choose grounding context"]')).not.toBeNull()
        expect(capabilities?.querySelector('[aria-label="Enable Browse"]')).not.toBeNull()
        expect(capabilities?.querySelector('[aria-label="Improve prompt"]')).not.toBeNull()
        expect(container.querySelector('[data-testid="talos-composer-status"]')?.textContent).toContain('DeepSeek profile')
    })

    it('shows when an attachment has an active per-file authority grant', () => {
        const container = mountComposer('full', false, {
            attachments: [{
                id: 'attachment-1',
                file_id: 'file-1',
                grant_id: 'grant-1',
                name: 'notes.md',
                status: 'available',
                failure_reason: null,
            }],
        })

        expect(container.querySelector('[data-attachment-id="attachment-1"]')?.getAttribute('data-authorized')).toBe('true')
        expect(container.querySelector('[aria-label="Authorized file grant"]')).not.toBeNull()
    })

    it('keeps capability labels desktop-only while preserving accessible icon commands on mobile', () => {
        const container = mountComposer('full')

        for (const testId of [
            'talos-composer-model-label',
            'talos-composer-context-label',
            'talos-composer-browse-label',
        ]) {
            const label = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
            expect(label).not.toBeNull()
            expect(label?.classList.contains('hidden')).toBe(true)
            expect(label?.classList.contains('sm:inline')).toBe(true)
        }

        expect(container.querySelector('[aria-label="Choose model profile"]')).not.toBeNull()
        expect(container.querySelector('[aria-label="Choose grounding context"]')).not.toBeNull()
        expect(container.querySelector('[aria-label="Enable Browse"]')).not.toBeNull()
    })

    it.each(['full', 'minimal'] as const)('does not expose the retired compact composer toggle in %s mode', (mode) => {
        const container = mountComposer(mode, mode === 'minimal')

        expect(container.querySelector('[aria-label="Use minimal composer"]')).toBeNull()
        expect(container.querySelector('[aria-label="Use full composer"]')).toBeNull()
    })

    it('keeps every composer capability available when compact icon density is selected', () => {
        const container = mountComposer('minimal', true)

        expect(container.querySelector('[data-testid="talos-composer-prompt-row"] [aria-label="Send"]')).not.toBeNull()
        expect(container.querySelector('[aria-label="Choose model profile"]')).not.toBeNull()
        expect(container.querySelector('[aria-label="Choose grounding context"]')).not.toBeNull()
        expect(container.querySelector('[aria-label="Temporary chat"]')).not.toBeNull()
        expect(container.querySelector('[aria-label="Browse status: Active"]')).not.toBeNull()
        expect(container.querySelector('[aria-label="Capture browser screenshot"]')).not.toBeNull()
        expect(container.querySelector('[aria-label="Improve prompt"]')).not.toBeNull()
        expect(container.querySelector('[aria-label="Open settings"]')).not.toBeNull()
        expect(container.querySelector('[aria-label="Use full composer"]')).toBeNull()
        expect(container.querySelector('[data-testid="talos-composer-minimal-indicators"]')).toBeNull()

        for (const testId of [
            'talos-composer-model-label',
            'talos-composer-context-label',
            'talos-composer-browse-label',
        ]) {
            const label = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
            expect(label?.classList.contains('hidden')).toBe(true)
            expect(label?.classList.contains('sm:inline')).toBe(false)
        }
    })

    it('shows current-page identity and exposes a real stop command while Browse is active', async () => {
        const stopBrowse = vi.fn()
        const container = mountComposer('full', true, {
            browserCurrentPage: {
                host: 'example.com',
                title: 'Current product',
                url: 'https://example.com/products/42',
            },
            onStopBrowse: stopBrowse,
        })

        container.querySelector<HTMLButtonElement>('[aria-label="Browse status: Active"]')?.click()
        await nextTick()

        expect(container.querySelector('[data-testid="talos-browser-current-page"]')?.textContent).toContain('Current product')
        expect(container.querySelector('[data-testid="talos-browser-current-page"]')?.textContent).toContain('example.com')
        const stop = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
            .find((button) => button.textContent?.includes('Stop browser'))
        expect(stop).toBeDefined()
        stop?.click()
        expect(stopBrowse).toHaveBeenCalledOnce()
    })

    it('keeps screenshot capture available but omits page-structure capture outside the development gate', async () => {
        const container = mountComposer('full', true)

        const screenshot = container.querySelector<HTMLButtonElement>('[aria-label="Capture browser screenshot"]')
        expect(screenshot).not.toBeNull()
        expect(screenshot?.disabled).toBe(false)

        container.querySelector<HTMLButtonElement>('[aria-label="Browse actions"]')?.click()
        await nextTick()

        expect([...container.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent?.includes('Capture page structure'))).toBe(false)
    })

    it('exposes the real page-structure command only inside the development gate', async () => {
        const captureSnapshot = vi.fn()
        const container = mountComposer('full', true, {
            devBrowserEvidence: true,
            onCaptureSnapshot: captureSnapshot,
        })

        container.querySelector<HTMLButtonElement>('[aria-label="Browse actions"]')?.click()
        await nextTick()

        const snapshotCommand = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
            .find((button) => button.textContent?.includes('Capture page structure'))
        expect(snapshotCommand).toBeDefined()
        expect(snapshotCommand?.disabled).toBe(false)

        snapshotCommand?.click()
        expect(captureSnapshot).toHaveBeenCalledOnce()
    })

    it('labels recovery-required Browse state and exposes the exact recover-task action', async () => {
        const recoverBrowse = vi.fn()
        const restartBrowse = vi.fn()
        const container = mountComposer('full', true, {
            browserMode: {
                enabled: true,
                session_id: 'browser-1',
                status: 'recovery_required',
                capabilities: ['snapshot', 'screenshot'],
            },
            browserRecoveryAction: 'recover_task',
            onRecoverBrowse: recoverBrowse,
            onRestartBrowse: restartBrowse,
        })

        const status = container.querySelector<HTMLButtonElement>('[aria-label="Browse status: Recovery required"]')
        expect(status).not.toBeNull()
        expect(container.querySelector<HTMLButtonElement>('[aria-label="Capture browser screenshot"]')?.disabled).toBe(true)

        status?.click()
        await nextTick()

        const recover = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
            .find((button) => button.textContent?.includes('Recover browser task'))
        expect(recover).toBeDefined()
        recover?.click()
        expect(recoverBrowse).toHaveBeenCalledOnce()
        expect(restartBrowse).not.toHaveBeenCalled()
    })

    it('labels terminal or session-only recovery as starting a fresh browser session', async () => {
        const recoverBrowse = vi.fn()
        const container = mountComposer('full', true, {
            browserMode: {
                enabled: true,
                session_id: 'browser-1',
                status: 'stopped',
                capabilities: [],
            },
            browserRecoveryAction: 'start_fresh',
            onRecoverBrowse: recoverBrowse,
        })

        container.querySelector<HTMLButtonElement>('[aria-label="Browse status: Stopped"]')?.click()
        await nextTick()

        const fresh = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
            .find((button) => button.textContent?.includes('Start fresh browser session'))
        expect(fresh).toBeDefined()
        fresh?.click()
        expect(recoverBrowse).toHaveBeenCalledOnce()
    })

    it('arrowup on an empty composer recalls the last user prompt editable', () => {
        const updates: string[] = []
        const container = mountComposer('full', false, {
            prompt: '',
            lastUserPrompt: 'Check the external API workflow',
            'onUpdate:prompt': (value: string) => updates.push(value),
        })
        const composer = container.querySelector<HTMLTextAreaElement>('[aria-label="Message TALOS"]')

        const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
        composer?.dispatchEvent(event)

        expect(updates).toEqual(['Check the external API workflow'])
        expect(event.defaultPrevented).toBe(true)
    })

    it('arrowup with drafted text or without history keeps native behavior', () => {
        const draftedUpdates: string[] = []
        const drafted = mountComposer('full', false, {
            prompt: 'draft in progress',
            lastUserPrompt: 'Check the external API workflow',
            'onUpdate:prompt': (value: string) => draftedUpdates.push(value),
        })
        const draftedArea = drafted.querySelector<HTMLTextAreaElement>('[aria-label="Message TALOS"]')
        const draftedEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
        draftedArea?.dispatchEvent(draftedEvent)
        expect(draftedUpdates).toEqual([])
        expect(draftedEvent.defaultPrevented).toBe(false)

        const emptyUpdates: string[] = []
        const withoutHistory = mountComposer('full', false, {
            prompt: '',
            lastUserPrompt: null,
            'onUpdate:prompt': (value: string) => emptyUpdates.push(value),
        })
        const emptyArea = withoutHistory.querySelector<HTMLTextAreaElement>('[aria-label="Message TALOS"]')
        emptyArea?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
        expect(emptyUpdates).toEqual([])
    })

    it('focusPrompt focuses the enabled message textarea', async () => {
        let exposed: { focusPrompt?: () => void } | null = null
        const container = mountComposer('full', false, {
            ref: (instance: unknown) => { exposed = instance as { focusPrompt?: () => void } },
        })
        await nextTick()

        expect(typeof exposed?.focusPrompt).toBe('function')
        exposed?.focusPrompt?.()
        const field = container.querySelector<HTMLTextAreaElement>('[aria-label="Message TALOS"]')
        expect(field).toBeTruthy()
        expect(document.activeElement).toBe(field)
    })

    it('disabled or sending state produces no invalid focus claim', async () => {
        let exposed: { focusPrompt?: () => void } | null = null
        mountComposer('full', false, {
            sending: true,
            ref: (instance: unknown) => { exposed = instance as { focusPrompt?: () => void } },
        })
        await nextTick()

        exposed?.focusPrompt?.()
        expect(document.activeElement?.getAttribute?.('aria-label')).not.toBe('Message TALOS')
    })

    it('builds the effort ladder from the model effort_levels and selects a level', async () => {
        const selectEffort = vi.fn()
        const container = mountComposer('full', false, {
            selectedEffort: 'high',
            effortLevels: ['high', 'low', 'medium'],
            supportsThinking: false,
            onSelectEffort: selectEffort,
        })

        const chip = container.querySelector<HTMLButtonElement>('[data-testid="talos-composer-effort-chip"]')
        expect(chip).not.toBeNull()
        expect(container.querySelector('[data-testid="talos-composer-effort-label"]')?.textContent).toContain('Effort · High')

        chip?.click()
        await nextTick()

        const levels = [...container.querySelectorAll<HTMLButtonElement>('[data-testid="talos-effort-level"]')]
            .map((button) => button.getAttribute('data-effort-level'))
        // Ordered from effort_levels (never hardcoded) with an implicit Off first.
        expect(levels).toEqual(['off', 'low', 'medium', 'high'])
        expect(container.querySelector('[data-testid="talos-effort-level"][data-effort-level="high"]')?.getAttribute('aria-pressed')).toBe('true')

        container.querySelector<HTMLButtonElement>('[data-effort-level="low"]')?.click()
        await nextTick()
        expect(selectEffort).toHaveBeenCalledWith('low')
        // Popover closes after a choice.
        expect(container.querySelector('[data-testid="talos-effort-popover"]')).toBeNull()
    })

    it('shows the extended-thinking toggle only when the model supports it', async () => {
        const selectThinking = vi.fn()
        const container = mountComposer('full', false, {
            selectedEffort: 'high',
            effortLevels: ['low', 'high'],
            supportsThinking: true,
            thinking: false,
            onSelectThinking: selectThinking,
        })

        container.querySelector<HTMLButtonElement>('[data-testid="talos-composer-effort-chip"]')?.click()
        await nextTick()

        const toggle = container.querySelector<HTMLButtonElement>('[data-testid="talos-thinking-toggle"]')
        expect(toggle).not.toBeNull()
        expect(toggle?.getAttribute('aria-checked')).toBe('false')
        toggle?.click()
        expect(selectThinking).toHaveBeenCalledWith(true)
    })

    it('omits the thinking toggle and exposes only Off for a non-reasoning model', async () => {
        const container = mountComposer('full', false, {
            selectedEffort: 'off',
            effortLevels: [],
            supportsThinking: false,
        })

        container.querySelector<HTMLButtonElement>('[data-testid="talos-composer-effort-chip"]')?.click()
        await nextTick()

        const levels = [...container.querySelectorAll<HTMLButtonElement>('[data-testid="talos-effort-level"]')]
            .map((button) => button.getAttribute('data-effort-level'))
        expect(levels).toEqual(['off'])
        expect(container.querySelector('[data-testid="talos-thinking-toggle"]')).toBeNull()
    })
})
