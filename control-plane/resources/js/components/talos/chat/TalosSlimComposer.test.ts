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

    it('keeps minimal mode to prompt, send, active indicators, and expansion', () => {
        const container = mountComposer('minimal', true)
        const indicators = container.querySelector('[data-testid="talos-composer-minimal-indicators"]')

        expect(container.querySelector('[data-testid="talos-composer-prompt-row"] [aria-label="Send"]')).not.toBeNull()
        expect(indicators?.textContent).toContain('DeepSeek Chat')
        expect(indicators?.textContent).toContain('Browse Active')
        expect(container.querySelector('[aria-label="Use full composer"]')).not.toBeNull()
        expect(container.querySelector('[aria-label="Choose grounding context"]')).toBeNull()
        expect(container.querySelector('[aria-label="Improve prompt"]')).toBeNull()
        expect(container.querySelector('[aria-label="Open settings"]')).toBeNull()
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

    it('labels recovery-required Browse state and exposes a Retry browser action', async () => {
        const restartBrowse = vi.fn()
        const container = mountComposer('full', true, {
            browserMode: {
                enabled: true,
                session_id: 'browser-1',
                status: 'recovery_required',
                capabilities: ['snapshot', 'screenshot'],
            },
            onRestartBrowse: restartBrowse,
        })

        const status = container.querySelector<HTMLButtonElement>('[aria-label="Browse status: Recovery required"]')
        expect(status).not.toBeNull()
        expect(container.querySelector<HTMLButtonElement>('[aria-label="Capture browser screenshot"]')?.disabled).toBe(true)

        status?.click()
        await nextTick()

        const retry = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
            .find((button) => button.textContent?.includes('Retry browser'))
        expect(retry).toBeDefined()
        retry?.click()
        expect(restartBrowse).toHaveBeenCalledOnce()
    })
})
