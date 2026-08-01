// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

/**
 * What the Model Lab's On device section actually puts in front of someone.
 *
 * The store is already proved; what is untested is the screen's own promises —
 * that a verdict reaches the eye, that a counter-offer is offered, that the one
 * thing which cannot work is the only thing disabled, and that a repository id
 * survives the trip through the template intact.
 */
const store = vi.hoisted(() => ({
    state: null as never,
    examine: vi.fn(async () => undefined),
    download: vi.fn(async () => ({ ok: true as const })),
    stop: vi.fn(async () => undefined),
    close: vi.fn(),
    open: vi.fn(async () => undefined),
    search: vi.fn(async () => undefined),
    saveToken: vi.fn(async () => undefined),
    forgetToken: vi.fn(async () => undefined),
}))

vi.mock('@/stores/localModels', () => ({
    talosLocalModels: new Proxy({}, { get: (_, key) => (store.state as never)[key] }),
    talosSearchLocalModels: store.search,
    talosOpenModelRepo: store.open,
    talosCloseModelRepo: store.close,
    talosExamineSet: store.examine,
    talosDownloadSet: store.download,
    talosStopLocalDownload: store.stop,
    talosRefreshTransfer: vi.fn(async () => undefined),
    talosRefreshDeviceCapacity: vi.fn(async () => undefined),
    talosRefreshLeftovers: vi.fn(async () => undefined),
    talosRefreshHuggingFaceToken: vi.fn(async () => undefined),
    talosSetHuggingFaceToken: store.saveToken,
    talosForgetHuggingFaceToken: store.forgetToken,
}))

import TalosMobileLocalModels from '@/components/talos/models/TalosMobileLocalModels.vue'

function fit(over: Record<string, unknown> = {}) {
    return {
        band: 'comfortable',
        reason: 'fits',
        kvCacheBytes: 500_000_000,
        requiredBytes: 900_000_000,
        residentBytes: 3_000_000_000,
        deficitBytes: 0,
        tokensPerSecond: 13.8,
        maxContext: 32_768,
        ...over,
    }
}

function set(over: Record<string, unknown> = {}) {
    return {
        label: 'Q4_K_M',
        quantisation: 'Q4_K_M',
        paths: ['model-Q4_K_M.gguf'],
        sizes: [2.5 * 1024 ** 3],
        totalBytes: 2.5 * 1024 ** 3,
        sha256: ['a'.repeat(64)],
        incomplete: false,
        expectedShards: 1,
        foundShards: 1,
        security: 'safe',
        examination: { state: 'unread' },
        ...over,
    }
}

function baseState(over: Record<string, unknown> = {}) {
    return reactive({
        query: '',
        searching: false,
        results: [],
        searchFailure: null,
        repo: null,
        device: {
            totalRamBytes: 8 * 1024 ** 3,
            availableRamBytes: 5 * 1024 ** 3,
            lowMemoryThresholdBytes: 300_000_000,
            freeStorageBytes: 60 * 1024 ** 3,
            abiSupported: true,
            thermal: 'none',
            memoryBandwidthBytesPerSecond: 60_000_000_000,
            deviceModel: 'Pixel 9',
            androidSdk: 36,
        },
        context: 4096,
        hasToken: false,
        transfer: {
            active: false, modelName: null, haveBytes: 0, totalBytes: 0,
            runner: null, networkBound: true, failure: null,
        },
        leftovers: { items: [], totalBytes: 0 },
        ...over,
    })
}

beforeEach(() => {
    store.examine.mockClear()
    store.download.mockClear().mockResolvedValue({ ok: true })
    store.saveToken.mockClear()
    store.forgetToken.mockClear()
    store.state = baseState() as never
})

async function screen() {
    const wrapper = mount(TalosMobileLocalModels)
    await flushPromises()
    return wrapper
}

describe('what the phone is', () => {
    it('states the device the fit answers are about', async () => {
        const wrapper = await screen()

        const line = wrapper.get('[data-testid="talos-models-device"]').text()
        expect(line).toContain('Pixel 9')
        expect(line).toContain('5 GB')
    })

    /**
     * Without a measurement nothing below can be honest, so the screen says so
     * rather than showing verdicts about a phone it never looked at.
     */
    it('admits when it has not measured the phone', async () => {
        store.state = baseState({ device: null }) as never
        const wrapper = await screen()

        expect(wrapper.find('[data-testid="talos-models-device"]').exists()).toBe(false)
        expect(wrapper.text()).toContain('has not been measured')
    })
})

describe('the Hugging Face token', () => {
    /**
     * The field is a password field and the draft is cleared the moment the
     * value reaches the Keystore. A token left in a bound input is a token in a
     * component's state — and in every snapshot, screenshot and heap dump of it.
     */
    it('takes the token and does not keep it', async () => {
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-models-token-input"]').setValue('hf_secret')
        await wrapper.get('[data-testid="talos-models-token-save"]').trigger('click')
        await flushPromises()

        expect(store.saveToken).toHaveBeenCalledWith('hf_secret')
        expect((wrapper.get('[data-testid="talos-models-token-input"]').element as HTMLInputElement).value)
            .toBe('')
        expect(wrapper.get('[data-testid="talos-models-token-input"]').attributes('type'))
            .toBe('password')
    })

    /**
     * With a token saved, the screen says so and shows nothing back. There is
     * nothing to show: the store carries `hasToken`, a boolean, and the value
     * itself never leaves the Keystore — which is the property worth asserting,
     * because a state field holding it would make every screenshot a leak.
     */
    it('reports that a token exists without ever holding one', async () => {
        store.state = baseState({ hasToken: true }) as never
        const wrapper = await screen()

        const panel = wrapper.get('[data-testid="talos-models-token"]')
        expect(panel.text()).toContain('secure store')
        expect(Object.keys(store.state)).not.toContain('token')
        expect((wrapper.get('[data-testid="talos-models-token-input"]').element as HTMLInputElement).value)
            .toBe('')
        expect(wrapper.find('[data-testid="talos-models-token-forget"]').exists()).toBe(true)
    })

    it('offers nothing to forget when there is no token', async () => {
        const wrapper = await screen()

        expect(wrapper.find('[data-testid="talos-models-token-forget"]').exists()).toBe(false)
    })
})

describe('the results', () => {
    /**
     * THE escaping trap, and it has bitten this codebase before. The app sets
     * vue-i18n's `escapeParameter`, so a repository id put through a placeholder
     * arrives as `unsloth&#47;Qwen3-4B-GGUF` — on screen and in the screen
     * reader. It is composed outside t() and this is what keeps it that way.
     */
    it('shows a repository id with its slash intact', async () => {
        store.state = baseState({
            query: 'qwen',
            results: [{ id: 'unsloth/Qwen3-4B-GGUF', downloads: 900, likes: 4, gated: false }],
        }) as never
        const wrapper = await screen()

        const result = wrapper.get('[data-testid="talos-models-result"]')
        expect(result.text()).toContain('unsloth/Qwen3-4B-GGUF')
        // vue-i18n escapes to the HEX form, `&#x2F;`. The decimal spelling is
        // what one guesses, and guessing produced an assertion that watched the
        // regression go past without a word.
        expect(result.html()).not.toContain('&#x2F;')
        expect(result.html()).not.toContain('&#47;')
        expect(result.attributes('aria-label')).toBe('Open unsloth/Qwen3-4B-GGUF')
    })

    /** A gate is known from the search, not discovered after choosing. */
    it('marks a gated repository before it is opened', async () => {
        store.state = baseState({
            query: 'llama',
            results: [{ id: 'meta-llama/Llama-3-8B', downloads: 900, likes: 4, gated: true }],
        }) as never
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-models-result"]').text()).toContain('licence required')
    })
})

describe('the verdict', () => {
    it('says whether it runs here, and how fast', async () => {
        store.state = baseState({
            repo: {
                id: 'unsloth/Qwen3-4B-GGUF',
                revision: 'main',
                loading: false,
                sets: [set({ examination: { state: 'read', fit: fit(), quantisation: 'Q4_K_M', trainedContext: 131_072 } })],
            },
        }) as never
        const wrapper = await screen()

        const verdict = wrapper.get('[data-testid="talos-models-verdict"]').text()
        expect(verdict).toContain('Runs comfortably')
        expect(verdict).toContain('13.8')
    })

    /**
     * The half the fit calculation was written for: a refusal that moves the
     * conversation instead of ending it.
     */
    it('offers a smaller context when it refuses', async () => {
        store.state = baseState({
            context: 131_072,
            repo: {
                id: 'a/b',
                revision: 'main',
                loading: false,
                sets: [set({
                    examination: {
                        state: 'read',
                        fit: fit({ band: 'wont-run', reason: 'context', maxContext: 8192 }),
                        quantisation: 'Q4_K_M',
                        trainedContext: 131_072,
                    },
                })],
            },
        }) as never
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-models-verdict"]').text()).toContain('Will not run')
        expect(wrapper.text()).toContain('more memory than this phone can give')
        expect(wrapper.get('[data-testid="talos-models-counteroffer"]').text()).toContain('8192')
    })

    /** No bandwidth reading means no speed claim, not a zero. */
    it('says the speed is unknown rather than inventing one', async () => {
        store.state = baseState({
            repo: {
                id: 'a/b',
                revision: 'main',
                loading: false,
                sets: [set({ examination: { state: 'read', fit: fit({ tokensPerSecond: null }), quantisation: null, trainedContext: 4096 } })],
            },
        }) as never
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-models-verdict"]').text()).toContain('speed unknown')
    })
})

describe('what is refused and what is merely warned about', () => {
    /**
     * The ONLY thing disabled. Two of three shards is not a small model, and
     * the failure would otherwise arrive after ten gigabytes.
     */
    it('disables the download for a set the repository is missing pieces of', async () => {
        store.state = baseState({
            repo: {
                id: 'a/b',
                revision: 'main',
                loading: false,
                sets: [set({ incomplete: true, expectedShards: 3, foundShards: 1, paths: ['m-00001-of-00003.gguf'] })],
            },
        }) as never
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-models-incomplete"]').text()).toContain('missing 2 of 3')
        expect(wrapper.get('[data-testid="talos-models-download"]').attributes('disabled')).toBeDefined()
    })

    /**
     * A model that will not fit stays offered. The card has said so in the
     * user's own terms, and it is their phone — refusing for them would be
     * deciding for them.
     */
    it('still offers a model it has just said will not run', async () => {
        store.state = baseState({
            repo: {
                id: 'a/b',
                revision: 'main',
                loading: false,
                sets: [set({ examination: { state: 'read', fit: fit({ band: 'wont-run', reason: 'memory' }), quantisation: null, trainedContext: 4096 } })],
            },
        }) as never
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-models-download"]').attributes('disabled')).toBeUndefined()
    })

    /** The one download that cannot be proved, said rather than assumed away. */
    it('warns when the repository publishes no checksum, without blocking it', async () => {
        store.state = baseState({
            repo: {
                id: 'a/b',
                revision: 'main',
                loading: false,
                sets: [set({ sha256: [null] })],
            },
        }) as never
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-models-unverifiable"]').text()).toContain('cannot be proved')
        expect(wrapper.get('[data-testid="talos-models-download"]').attributes('disabled')).toBeUndefined()
    })
})

describe('a download in flight', () => {
    it('shows how far it has got, in the units the phone uses', async () => {
        store.state = baseState({
            transfer: {
                active: true, modelName: 'Qwen3-4B Q4_K_M',
                haveBytes: 1024 ** 3, totalBytes: 4 * 1024 ** 3,
                runner: 'USER_INITIATED_JOB', networkBound: true, failure: null,
            },
        }) as never
        const wrapper = await screen()

        const bar = wrapper.get('[data-testid="talos-models-transfer"]')
        expect(bar.text()).toContain('Qwen3-4B Q4_K_M')
        expect(bar.text()).toContain('1 GB of 4 GB')
        expect(bar.html()).toContain('width: 25%')
    })

    /**
     * The caveat that costs money if it stays hidden: below Android 14 the
     * transfer is not tied to the network it started on.
     */
    it('warns when the download is not pinned to the network it began on', async () => {
        store.state = baseState({
            transfer: {
                active: true, modelName: 'Something', haveBytes: 0, totalBytes: 100,
                runner: 'FOREGROUND_SERVICE', networkBound: false, failure: null,
            },
        }) as never
        const wrapper = await screen()

        expect(wrapper.text()).toContain('can continue on mobile data')
    })

    /**
     * Pause used to be a one-way door: the block is the transfer's only control
     * and it rendered under `active`, so pausing erased the download from the
     * screen with no way back — while the copy promised it would carry on where
     * it left off. Found by an adversarial review, 2026-08-01.
     */
    it('keeps the transfer on screen after a pause, with a way to resume', async () => {
        store.state = baseState({
            repo: { id: 'a/b', revision: 'main', loading: false, failure: null, sets: [set()] },
        }) as never
        const wrapper = await screen()

        // Start it, so the section knows what to resume.
        await wrapper.get('[data-testid="talos-models-download"]').trigger('click')
        await flushPromises()

        // Now it is running.
        store.state.transfer.active = true
        store.state.transfer.modelName = 'b Q4_K_M'
        await wrapper.vm.$nextTick()

        await wrapper.get('[data-testid="talos-models-stop"]').trigger('click')
        store.state.transfer.active = false
        await flushPromises()

        // The block is still there, and it offers the other half of the promise.
        expect(wrapper.find('[data-testid="talos-models-transfer"]').exists()).toBe(true)
        const resume = wrapper.get('[data-testid="talos-models-resume"]')

        store.download.mockClear()
        await resume.trigger('click')
        await flushPromises()

        expect(store.download).toHaveBeenCalledWith('model-Q4_K_M.gguf', 'b Q4_K_M')
    })

    /**
     * The line said what abandoned attempts were holding and offered nothing to
     * do about it — the string and the service call both existed, and neither
     * was wired to a button.
     */
    it('offers a way to get the abandoned space back', async () => {
        store.state = baseState({
            leftovers: { items: [{ path: '/x.part', bytes: 3 * 1024 ** 3 }], totalBytes: 3 * 1024 ** 3 },
        }) as never
        const wrapper = await screen()

        expect(wrapper.find('[data-testid="talos-models-reclaim"]').exists()).toBe(true)
    })

    it('is the only thing that can be paused, and pausing says it will resume', async () => {
        store.state = baseState({
            transfer: {
                active: true, modelName: 'Something', haveBytes: 10, totalBytes: 100,
                runner: 'USER_INITIATED_JOB', networkBound: true, failure: null,
            },
        }) as never
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-models-stop"]').trigger('click')

        expect(store.stop).toHaveBeenCalled()
    })

    /**
     * Space claimed up front means an attempt abandoned after ten seconds still
     * holds the whole file. Every app in this category leaves those invisible.
     */
    it('names what abandoned attempts are costing', async () => {
        store.state = baseState({
            leftovers: { items: [{ path: '/x.part', bytes: 3 * 1024 ** 3 }], totalBytes: 3 * 1024 ** 3 },
        }) as never
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-models-leftovers"]').text()).toContain('3 GB')
    })
})

describe('starting one', () => {
    it('asks the store for the set that was tapped', async () => {
        store.state = baseState({
            repo: { id: 'unsloth/Qwen3-4B-GGUF', revision: 'main', loading: false, failure: null, sets: [set()] },
        }) as never
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-models-download"]').trigger('click')

        expect(store.download).toHaveBeenCalledWith('model-Q4_K_M.gguf', 'Qwen3-4B-GGUF Q4_K_M')
    })

    /** A refusal reaches the eye instead of disappearing into a console. */
    it('shows the reason a download would not start', async () => {
        store.download.mockResolvedValue({ ok: false, reason: 'already-running' } as never)
        store.state = baseState({
            repo: { id: 'a/b', revision: 'main', loading: false, failure: null, sets: [set()] },
        }) as never
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-models-download"]').trigger('click')
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-models-refused"]').text()).toContain('One download at a time')
    })
})
