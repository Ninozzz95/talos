// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileDownloadCenterTrigger from '@/components/shell/TalosMobileDownloadCenterTrigger.vue'

const harness = vi.hoisted(() => ({
    state: {
        phase: 'running',
        active: true,
        paused: false,
        repo: 'owner/model',
        revision: 'pinned',
        paths: ['model.gguf'],
        modelName: 'Small test model',
        haveBytes: 512,
        totalBytes: 1024,
        runner: 'USER_INITIATED_JOB',
        networkBound: false,
        failure: null as string | null,
        resumable: true,
        readFailure: null as string | null,
        items: [
            {
                id: 'transfer-a', jobId: 100_101, createdAtMs: 1,
                phase: 'running', active: true,
                repo: 'owner/model-a', revision: 'pinned-a', paths: ['a.gguf'],
                modelName: 'Small test model', haveBytes: 512, totalBytes: 1024,
                runner: 'USER_INITIATED_JOB', networkBound: false,
                failure: null as string | null, resumable: true,
            },
            {
                id: 'transfer-b', jobId: 100_102, createdAtMs: 2,
                phase: 'paused', active: false,
                repo: 'owner/model-b', revision: 'pinned-b', paths: ['b.gguf'],
                modelName: 'Second local model', haveBytes: 256, totalBytes: 1024,
                runner: 'USER_INITIATED_JOB', networkBound: true,
                failure: null as string | null, resumable: true,
            },
        ],
    },
    release: vi.fn(),
    pause: vi.fn(async () => ({ ok: true as const })),
    resume: vi.fn(async () => ({ ok: true as const })),
    cancel: vi.fn(async () => ({ ok: true as const })),
}))

vi.mock('@/stores/modelTransfers', () => ({
    talosModelTransfers: harness.state,
    talosRetainModelTransferObserver: vi.fn(() => harness.release),
    talosPauseManagedModelTransfer: harness.pause,
    talosResumeManagedModelTransfer: harness.resume,
    talosCancelManagedModelTransfer: harness.cancel,
}))

function resetTransfer(overrides: Record<string, unknown> = {}): void {
    Object.assign(harness.state, {
        phase: 'running',
        active: true,
        paused: false,
        repo: 'owner/model',
        revision: 'pinned',
        paths: ['model.gguf'],
        modelName: 'Small test model',
        haveBytes: 512,
        totalBytes: 1024,
        runner: 'USER_INITIATED_JOB',
        networkBound: false,
        failure: null,
        resumable: true,
        readFailure: null,
        items: [
            {
                id: 'transfer-a', jobId: 100_101, createdAtMs: 1,
                phase: 'running', active: true,
                repo: 'owner/model-a', revision: 'pinned-a', paths: ['a.gguf'],
                modelName: 'Small test model', haveBytes: 512, totalBytes: 1024,
                runner: 'USER_INITIATED_JOB', networkBound: false,
                failure: null, resumable: true,
            },
            {
                id: 'transfer-b', jobId: 100_102, createdAtMs: 2,
                phase: 'paused', active: false,
                repo: 'owner/model-b', revision: 'pinned-b', paths: ['b.gguf'],
                modelName: 'Second local model', haveBytes: 256, totalBytes: 1024,
                runner: 'USER_INITIATED_JOB', networkBound: true,
                failure: null, resumable: true,
            },
        ],
        ...overrides,
    })
}

async function mountOpen() {
    const wrapper = mount(TalosMobileDownloadCenterTrigger, { attachTo: document.body })
    await wrapper.get('[data-testid="talos-download-center-trigger"]').trigger('click')
    await flushPromises()
    return wrapper
}

beforeEach(() => {
    resetTransfer()
    vi.clearAllMocks()
})

afterEach(() => {
    document.body.innerHTML = ''
})

describe('TalosMobileDownloadCenterTrigger', () => {
    it('C45-RED-08 is absent only when there is no resumable transfer', async () => {
        resetTransfer({ phase: 'idle', active: false, resumable: false, items: [] })
        const wrapper = mount(TalosMobileDownloadCenterTrigger)
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-download-center-trigger"]').exists()).toBe(false)
        wrapper.unmount()
        expect(harness.release).toHaveBeenCalledOnce()
    })

    it('shows two honest rows with independent status and progress', async () => {
        const wrapper = await mountOpen()
        const content = document.querySelector('[data-testid="talos-download-center-content"]') as HTMLElement
        const first = content.querySelector('[data-transfer-id="transfer-a"]') as HTMLElement
        const second = content.querySelector('[data-transfer-id="transfer-b"]') as HTMLElement
        const progress = first.querySelector('[data-testid="talos-download-center-progress"]') as HTMLElement

        expect(content).toBeTruthy()
        expect(content.textContent).toContain('Download Center')
        expect(content.textContent).toContain('Small test model')
        expect(content.textContent).toContain('Second local model')
        expect(first.querySelector('[role="status"]')?.textContent).toContain('Downloading')
        expect(second.querySelector('[role="status"]')?.textContent).toContain('Paused')
        expect(progress.getAttribute('role')).toBe('progressbar')
        expect(progress.getAttribute('aria-valuenow')).toBe('50')
        expect(progress.getAttribute('aria-valuemax')).toBe('100')
        expect(content.textContent).toContain('mobile data')
        expect(content.querySelectorAll('[data-testid="talos-download-center-item"]')).toHaveLength(2)
        wrapper.unmount()
    })

    it('keeps pause, resume and cancel inside the row they control', async () => {
        const wrapper = await mountOpen()
        const first = document.querySelector('[data-transfer-id="transfer-a"]') as HTMLElement
        const second = document.querySelector('[data-transfer-id="transfer-b"]') as HTMLElement

        ;(first.querySelector('[data-testid="talos-download-center-pause"]') as HTMLElement).click()
        await flushPromises()
        expect(harness.pause).toHaveBeenCalledWith('transfer-a')

        ;(second.querySelector('[data-testid="talos-download-center-resume"]') as HTMLElement).click()
        await flushPromises()
        expect(harness.resume).toHaveBeenCalledWith('transfer-b')

        ;(second.querySelector('[data-testid="talos-download-center-cancel"]') as HTMLElement).click()
        await flushPromises()
        expect(harness.cancel).not.toHaveBeenCalled()
        expect(first.querySelector(
            '[data-testid="talos-download-center-cancel-confirm"]',
        )).toBeNull()
        const confirm = second.querySelector(
            '[data-testid="talos-download-center-cancel-confirm"]',
        ) as HTMLElement
        expect(confirm).toBeTruthy()
        confirm.click()
        await flushPromises()
        expect(harness.cancel).toHaveBeenCalledWith('transfer-b')
        wrapper.unmount()
    })

    it('names repeated row actions with the model they affect', async () => {
        const wrapper = await mountOpen()
        const content = document.querySelector('[data-testid="talos-download-center-content"]') as HTMLElement

        expect(content.querySelector('[data-transfer-id="transfer-a"] [aria-label*="Small test model"]'))
            .toBeTruthy()
        expect(content.querySelector('[data-transfer-id="transfer-b"] [aria-label*="Second local model"]'))
            .toBeTruthy()
        wrapper.unmount()
    })

    it('C45-RED-08G keeps one transfer informative and plural counts grammatical', async () => {
        const only = harness.state.items[0]
        resetTransfer({ items: only ? [only] : [] })
        const one = mount(TalosMobileDownloadCenterTrigger)
        await flushPromises()
        expect(one.get('[data-testid="talos-download-center-trigger"]').attributes('aria-label'))
            .toMatch(/Small test model, 50%/)
        one.unmount()

        resetTransfer()
        const many = mount(TalosMobileDownloadCenterTrigger)
        await flushPromises()
        expect(many.get('[data-testid="talos-download-center-trigger"]').attributes('aria-label'))
            .toBe('Open Download Center, 2 downloads')
        many.unmount()
    })

    it('closes on Escape and returns focus to the icon trigger', async () => {
        const wrapper = await mountOpen()
        const trigger = wrapper.get('[data-testid="talos-download-center-trigger"]').element as HTMLElement
        const content = document.querySelector('[data-testid="talos-download-center-content"]') as HTMLElement
        content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flushPromises()

        expect(document.querySelector('[data-testid="talos-download-center-content"]')).toBeNull()
        expect(document.activeElement).toBe(trigger)
        wrapper.unmount()
    })
})
