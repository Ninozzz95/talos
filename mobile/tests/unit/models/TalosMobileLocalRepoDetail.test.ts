// @vitest-environment jsdom

import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    state: null as never,
    open: vi.fn(async () => undefined),
    close: vi.fn(),
    describe: vi.fn(async () => ({
        author: 'unsloth',
        license: 'apache-2.0',
        updatedAt: '2026-08-05T00:00:00Z',
        readme: '# Qwen\n\nThis model is built for long coding sessions with tools and careful instruction following across large repositories.\n\n## Full notes\nThe complete card remains available here.',
    })),
    examine: vi.fn(async () => undefined),
    download: vi.fn(async () => ({ ok: true as const })),
    resume: vi.fn(async () => ({ ok: true as const })),
}))

vi.mock('@/stores/localModels', () => ({
    talosLocalModels: new Proxy({}, { get: (_, key) => harness.state[key as never] }),
    talosOpenModelRepo: harness.open,
    talosCloseModelRepo: harness.close,
    talosDescribeModelRepo: harness.describe,
    talosExamineSet: harness.examine,
    talosDownloadSet: harness.download,
    talosResumeLocalDownload: harness.resume,
    talosSetLocalContext: vi.fn(),
    talosStopLocalDownload: vi.fn(async () => undefined),
    talosRefreshDeviceCapacity: vi.fn(async () => undefined),
    talosRefreshTransfer: vi.fn(async () => undefined),
    talosRefreshLeftovers: vi.fn(async () => undefined),
    talosRefreshHuggingFaceToken: vi.fn(async () => undefined),
}))

import TalosMobileLocalRepoDetail from '@/components/talos/models/TalosMobileLocalRepoDetail.vue'

function modelSet() {
    return {
        label: 'Q4_K_M', quantisation: 'Q4_K_M', paths: ['model-Q4_K_M.gguf'],
        sizes: [2_500_000_000], totalBytes: 2_500_000_000, sha256: ['a'.repeat(64)],
        incomplete: false, expectedShards: 1, foundShards: 1, security: 'safe',
        examination: { state: 'unread' },
    }
}

beforeEach(() => {
    harness.open.mockClear()
    harness.close.mockClear()
    harness.describe.mockClear()
    harness.state = reactive({
        repo: { id: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha', loading: false, failure: null, sets: [modelSet()] },
        device: { availableRamBytes: 5 * 1024 ** 3, freeStorageBytes: 20 * 1024 ** 3, lowMemoryThresholdBytes: 0 },
        context: 4096,
        transfer: { active: false, paused: false, modelName: null, haveBytes: 0, totalBytes: 0, runner: null, networkBound: true, failure: null },
        leftovers: { items: [], totalBytes: 0 },
    }) as never
})

describe('TalosMobileLocalRepoDetail', () => {
    it('leaves polling and transfer controls to the global Download Center', async () => {
        harness.state.transfer = {
            active: true,
            paused: false,
            modelName: 'Qwen3-4B Q4_K_M',
            haveBytes: 1024 ** 3,
            totalBytes: 4 * 1024 ** 3,
            runner: 'USER_INITIATED_JOB',
            networkBound: true,
            failure: null,
        }
        const interval = vi.spyOn(globalThis, 'setInterval')
        const wrapper = mount(TalosMobileLocalRepoDetail, {
            props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
        })
        await flushPromises()

        try {
            expect(interval).not.toHaveBeenCalled()
            expect(wrapper.find('[data-testid="talos-models-transfer"]').exists()).toBe(false)
            expect(wrapper.find('[data-testid="talos-models-stop"]').exists()).toBe(false)
            expect(wrapper.find('[data-testid="talos-models-resume"]').exists()).toBe(false)
        } finally {
            wrapper.unmount()
            interval.mockRestore()
        }
    })

    it('opens the routed revision and renders one compact detail without device or body Back duplicates', async () => {
        const wrapper = mount(TalosMobileLocalRepoDetail, {
            props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
        })
        await flushPromises()

        expect(harness.open).toHaveBeenCalledWith('unsloth/a-very-long-qwen-coder-repository-name-for-mobile', 'sha')
        expect(wrapper.get('[data-testid="talos-models-repo-title"]').classes()).toContain('break-words')
        expect(wrapper.find('[data-testid="talos-models-back"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-model-lab-device"]').exists()).toBe(false)
        expect(wrapper.findAll('[data-testid="talos-models-set"]')).toHaveLength(1)
    })

    it('shows a cleaned summary first and keeps the complete README behind a native disclosure', async () => {
        const wrapper = mount(TalosMobileLocalRepoDetail, {
            props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
        })
        await flushPromises()

        const summary = wrapper.get('[data-testid="talos-models-readme-summary"]')
        expect(summary.text()).toContain('long coding sessions')
        expect(summary.classes()).toContain('line-clamp-2')
        const disclosure = wrapper.get('[data-testid="talos-models-readme-full"]')
        expect(disclosure.element.tagName).toBe('DETAILS')
        // Chiusa, la scheda non costa niente: un README del Hub arriva a
        // centomila caratteri e nessuno li ha ancora chiesti.
        expect(disclosure.find('[data-testid="talos-mobile-message-content"]').exists()).toBe(false)

        const dettagli = disclosure.element as HTMLDetailsElement
        dettagli.open = true
        await disclosure.trigger('toggle')

        const scheda = disclosure.get('[data-testid="talos-mobile-message-content"]')
        expect(scheda.text()).toContain('The complete card remains available here.')
        // ⛔ Il difetto che questa prova sorveglia: la scheda si LEGGE. Niente
        // sorgente in un `pre`, e i titoli sono titoli.
        expect(disclosure.find('pre').exists()).toBe(false)
        expect(scheda.find('h2').exists()).toBe(true)
        expect(scheda.text()).not.toContain('## Full notes')
    })

    it('C45-RED-14 renders one continuous variant list with a primary row download', async () => {
        const wrapper = mount(TalosMobileLocalRepoDetail, {
            props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
        })
        await flushPromises()

        const list = wrapper.get('[data-testid="talos-models-variant-list"]')
        const row = wrapper.get('[data-testid="talos-models-set"]')
        expect(list.classes()).toContain('divide-y')
        expect(row.classes()).not.toContain('rounded-[var(--talos-radius-card)]')
        expect(row.classes()).not.toContain('border')

        const download = row.get('[data-testid="talos-models-download"]')
        expect(download.attributes('aria-label')).toContain('Q4_K_M')
        expect(download.classes()).toContain('size-[var(--talos-touch-target)]')
        expect(download.text()).not.toContain('Download')
    })

    it('C45-RED-14C gives a backend suffix the full identity column without increasing the action row', async () => {
        harness.state.repo.sets[0].label = 'Q4_K_M · HIP optimized'
        const wrapper = mount(TalosMobileLocalRepoDetail, {
            props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
        })
        await flushPromises()

        const primary = wrapper.get('[data-testid="talos-models-variant-primary"]')
        expect(primary.classes()).toContain('grid-cols-[minmax(0,1fr)_var(--talos-touch-target)]')
        const identity = primary.get('[data-testid="talos-models-variant-identity"]')
        expect(identity.get('[data-testid="talos-models-variant-label"]').text()).toBe('Q4_K_M · HIP optimized')
        expect(identity.find('[data-testid="talos-models-variant-size"]').exists()).toBe(true)
    })

    it('C45-RED-14 keeps secondary diagnostics behind a per-variant disclosure', async () => {
        const wrapper = mount(TalosMobileLocalRepoDetail, {
            props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
        })
        await flushPromises()

        const disclosure = wrapper.get('[data-testid="talos-models-variant-details"]')
        expect(disclosure.element.tagName).toBe('DETAILS')
        expect(disclosure.attributes('open')).toBeUndefined()
        expect(disclosure.get('summary').text()).toContain('Details')
        expect(disclosure.find('[data-testid="talos-models-examine"]').exists()).toBe(true)
    })
})
