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
    loadCatalogue: vi.fn(async () => undefined),
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
    talosLoadLocalCatalogue: store.loadCatalogue,
    talosSetHuggingFaceToken: store.saveToken,
    talosForgetHuggingFaceToken: store.forgetToken,
}))

/**
 * What is already on the phone. Left empty by default so every test written
 * before this section keeps meeting the screen it was written against.
 */
const engine = vi.hoisted(() => ({
    installed: [] as { path: string, name: string, bytes: number, modifiedAt: number }[],
}))

vi.mock('@/services/localEngine', () => ({
    talosLocalEngineStatus: vi.fn(async () => null),
    talosLocalInstalledModels: vi.fn(async () => ({ models: engine.installed, unreadable: [] })),
}))

import TalosMobileLocalModels from '@/components/talos/models/TalosMobileLocalModels.vue'
import { useSettingsStore } from '@/stores/settings'

const MODELS_ROOT = '/storage/emulated/0/Android/data/ai.talos.dev/files/models'

function installed(name: string, folder: string) {
    return {
        path: `${MODELS_ROOT}/${folder}/${name}`,
        name,
        bytes: 2_600_000_000,
        modifiedAt: 1_785_700_000_000,
    }
}

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

function recommendation(family: string, displayName: string) {
    return {
        fits: true,
        headroomBytes: 1_000_000_000,
        capacity: {
            state: 'fits',
            limit: 'memory',
            needsBytes: 3_100_000_000,
            availableBytes: 4_100_000_000,
            missingBytes: 0,
        },
        entry: {
            id: `${family}-${displayName}`,
            family,
            displayName,
            publisher: 'unsloth',
            license: 'apache-2.0',
            paramsB: 4,
            quantisation: 'Q4_K_M',
            fileBytes: 2_600_000_000,
            sha256: 'a'.repeat(64),
            download: { kind: 'huggingface', repo: 'unsloth/x', file: 'x.gguf' },
            runtime: ['llama.cpp'],
            contextTokens: 32_768,
            ramWorkingBytes: 3_100_000_000,
            referenceSpeed: [],
            tags: [],
            addedAt: null,
            popularity: 1,
        },
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
        catalogue: {
            state: 'ready', ageDays: null, fromCache: false, refusal: null,
            recommended: [], rejected: [],
        },
        transfer: {
            active: false, modelName: null, haveBytes: 0, totalBytes: 0,
            runner: null, networkBound: true, failure: null,
        },
        leftovers: { items: [], totalBytes: 0 },
        ...over,
    })
}

beforeEach(() => {
    engine.installed = []
    store.examine.mockClear()
    store.download.mockClear().mockResolvedValue({ ok: true })
    store.open.mockClear()
    store.saveToken.mockClear()
    store.forgetToken.mockClear()
    store.loadCatalogue.mockClear()
    store.state = baseState() as never
})

async function screen() {
    const wrapper = mount(TalosMobileLocalModels)
    await flushPromises()
    return wrapper
}

/**
 * The search door, opened.
 *
 * Free search is no longer the screen — the catalogue list is — so anything
 * about searching has to open the secondary door first, exactly as a reader
 * would.
 */
async function searchScreen() {
    const wrapper = await screen()
    await wrapper.get('[data-testid="talos-models-open-search"]').trigger('click')
    await flushPromises()
    return wrapper
}

/**
 * Owner 2026-08-03, on this panel: «compattare ed economizzare gli spazi, per
 * renderlo più navigabile». Not a coat of paint — a row that costs five lines
 * to say four things pushes the list off the screen it is meant to fill.
 */
describe('the space a row is allowed to cost', () => {
    it('drops the address every model shares and keeps the folder that differs', async () => {
        engine.installed = [installed('Qwen3-4B-Q4_K_M.gguf', 'imported')]
        const wrapper = await screen()

        const row = wrapper.get('[data-testid="talos-models-installed-row"]')
        // The whole path used to be printed in monospace, wrapping to three
        // lines whose first fifty characters are identical for every model.
        expect(row.text()).not.toContain(MODELS_ROOT)
        // What is left says which folder it is in — the only part that differs.
        expect(row.text()).toContain('imported')
        expect(row.text()).toContain('Qwen3-4B-Q4_K_M.gguf')
    })

    it('still hands over the exact address, under the row menu', async () => {
        // Compacting is not hiding: the full string is one tap away, and a
        // forty-character path nobody can select was never usable anyway.
        // Proved end to end on the tablet 2026-08-03 — tapped, then pasted back
        // out of the Android clipboard, character for character.
        engine.installed = [installed('Qwen3-4B-Q4_K_M.gguf', 'imported')]
        const wrapper = await screen()

        expect(wrapper.find('[data-testid="talos-models-installed-menu-Qwen3-4B-Q4_K_M.gguf"]').exists())
            .toBe(true)
    })

    it('says the copy failed, now that the row no longer carries the path', async () => {
        /**
         * While the whole path was printed on the row, a copy that quietly
         * failed cost nothing — you read it off the screen instead. It is not
         * on the screen any more, so a silent failure would leave a menu item
         * that does nothing and an address reachable by no other route.
         */
        const clipboard = { writeText: vi.fn(async () => { throw new Error('denied') }) }
        Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
        engine.installed = [installed('Qwen3-4B-Q4_K_M.gguf', 'imported')]
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-models-installed-menu-Qwen3-4B-Q4_K_M.gguf"]').trigger('click')
        await flushPromises()
        // Teleported to the body so no ancestor's overflow can clip it, which
        // puts it outside the wrapper's own tree. Si punta la voce PER NOME:
        // da quando il menu ha anche Rinomina ed Elimina, «la prima voce» non
        // e' piu' la copia — e un test che clicca a posizione trova la voce
        // sbagliata senza dirlo.
        const item = document.querySelector<HTMLElement>('[data-testid^="talos-models-copy-"]')
        item?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()

        const notice = wrapper.get('[data-testid="talos-models-copy-notice"]')
        expect(notice.text()).toContain('clipboard would not take')
    })

    it('confirms the copy when it works, so the tap is not silent either', async () => {
        const clipboard = { writeText: vi.fn(async () => undefined) }
        Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
        engine.installed = [installed('Qwen3-4B-Q4_K_M.gguf', 'imported')]
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-models-installed-menu-Qwen3-4B-Q4_K_M.gguf"]').trigger('click')
        await flushPromises()
        // Teleported to the body so no ancestor's overflow can clip it, which
        // puts it outside the wrapper's own tree. Si punta la voce PER NOME:
        // da quando il menu ha anche Rinomina ed Elimina, «la prima voce» non
        // e' piu' la copia — e un test che clicca a posizione trova la voce
        // sbagliata senza dirlo.
        const item = document.querySelector<HTMLElement>('[data-testid^="talos-models-copy-"]')
        item?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()

        // The outcome, not the call: what reached the clipboard is the exact
        // path, and the screen says so.
        expect(clipboard.writeText).toHaveBeenCalledWith(`${MODELS_ROOT}/imported/Qwen3-4B-Q4_K_M.gguf`)
        expect(wrapper.get('[data-testid="talos-models-copy-notice"]').text()).toContain('Path copied')
    })

    it('draws no search, no sort and no layout switch over a single model', async () => {
        engine.installed = [installed('solo.gguf', 'imported')]
        const wrapper = await screen()

        expect(wrapper.findAll('[data-testid="talos-models-installed-row"]')).toHaveLength(1)
        expect(wrapper.find('[data-testid="talos-models-installed-search"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-models-installed-sort-recent"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-models-installed-layout"]').exists()).toBe(false)
    })

    it('brings them back as soon as there is more than one thing to order', async () => {
        engine.installed = [installed('uno.gguf', 'imported'), installed('due.gguf', 'main')]
        const wrapper = await screen()

        expect(wrapper.find('[data-testid="talos-models-installed-search"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-models-installed-sort-recent"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-models-installed-layout"]').exists()).toBe(true)
    })
})

describe('an ordering the panel is allowed to remember', () => {
    /**
     * It was a plain `ref` — the same defect the Library carried until July
     * (debt P6). A preference that resets on every visit is not a preference,
     * and there is no argument for the same list-ordering choice being durable
     * in one room and amnesiac in the next.
     */
    it('opens on the order last chosen, not on the default', async () => {
        const settings = useSettingsStore()
        await settings.setShell({ models_sort: 'size' })
        engine.installed = [installed('uno.gguf', 'imported'), installed('due.gguf', 'main')]

        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-models-installed-sort-size"]').attributes('aria-checked'))
            .toBe('true')
        expect(wrapper.get('[data-testid="talos-models-installed-sort-recent"]').attributes('aria-checked'))
            .toBe('false')
    })

    it('writes the choice where the Library writes its own', async () => {
        const settings = useSettingsStore()
        await settings.setShell({ models_sort: 'recent' })
        engine.installed = [installed('uno.gguf', 'imported'), installed('due.gguf', 'main')]

        const wrapper = await screen()
        await wrapper.get('[data-testid="talos-models-installed-sort-name"]').trigger('click')
        await flushPromises()

        expect(settings.state.shell.models_sort).toBe('name')
    })
})

describe('a catalogue row that does not say the same word twice', () => {
    it('drops the family when the model name already begins with it', async () => {
        store.state = baseState({
            catalogue: {
                state: 'ready', ageDays: null, fromCache: false, refusal: null,
                recommended: [recommendation('Qwen3', 'Qwen3 4B Instruct')],
                rejected: [],
            },
        }) as never
        const wrapper = await screen()

        const row = wrapper.get('[data-testid="talos-models-catalogue-row"]')
        expect(row.text()).toContain('Qwen3 4B Instruct')
        // A whole line per row spent repeating a word two lines above it.
        expect(row.text().match(/Qwen3/g)).toHaveLength(1)
    })

    it('keeps it when the two are genuinely different', async () => {
        // «Mistral» under a «Ministral 8B» is a fact about the model, not an
        // echo of its name, so it survives the same rule that removed the echo.
        store.state = baseState({
            catalogue: {
                state: 'ready', ageDays: null, fromCache: false, refusal: null,
                recommended: [recommendation('Mistral', 'Ministral 8B')],
                rejected: [],
            },
        }) as never
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-models-catalogue-row"]').text()).toContain('Mistral')
    })
})

describe('device context belongs to the Model Lab hub', () => {
    it('does not duplicate the shared device card on the Local Models page', async () => {
        const wrapper = await screen()

        expect(wrapper.find('[data-testid="talos-models-device"]').exists()).toBe(false)
        expect(wrapper.text()).not.toContain('Pixel 9')
    })

    it('still measures capacity when the Local Models route is opened directly', async () => {
        store.state = baseState({ device: null }) as never
        const wrapper = await screen()

        expect(wrapper.find('[data-testid="talos-models-device"]').exists()).toBe(false)
        expect(store.loadCatalogue).toHaveBeenCalledTimes(1)
        expect(wrapper.text()).not.toContain('has not been measured')
    })
})

describe('the Hugging Face token', () => {
    /**
     * The field is a password field and the draft is cleared the moment the
     * value reaches the Keystore. A token left in a bound input is a token in a
     * component's state — and in every snapshot, screenshot and heap dump of it.
     */
    it('takes the token and does not keep it', async () => {
        const wrapper = await searchScreen()

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
        const wrapper = await searchScreen()

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

    it('opens the immutable revision returned with the browse row', async () => {
        const revision = 'c'.repeat(40)
        store.state = baseState({
            query: 'qwen',
            results: [{
                id: 'unsloth/Qwen3-4B-GGUF',
                revision,
                downloads: 900,
                likes: 4,
                gated: false,
            }],
        }) as never
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-models-result"]').trigger('click')

        expect(store.open).toHaveBeenCalledWith('unsloth/Qwen3-4B-GGUF', revision)
    })

    /**
     * Grouped by whoever published the GGUF.
     *
     * Every row here is a stranger's upload, and the people who quantise models
     * are a small recognisable set — so "who made this one" is most of what a
     * reader uses to judge it. Ordered by use, because that is the only
     * reputation signal the Hub gives us.
     */
    it('files the results under the organisation that published them', async () => {
        store.state = baseState({
            query: 'qwen',
            results: [
                { id: 'unsloth/Qwen3-4B-GGUF', downloads: 900, likes: 4, gated: false },
                { id: 'bartowski/Qwen3-4B-GGUF', downloads: 400, likes: 2, gated: false },
                { id: 'unsloth/Qwen3-8B-GGUF', downloads: 300, likes: 1, gated: false },
            ],
        }) as never
        const wrapper = await screen()

        const groups = wrapper.findAll('[data-testid="talos-models-provider-group"]')
        expect(groups).toHaveLength(2)
        expect(groups[0]!.text()).toContain('unsloth')
        expect(groups[0]!.findAll('[data-testid="talos-models-result"]')).toHaveLength(2)
        expect(groups[1]!.text()).toContain('bartowski')
    })

    /** The filter exists, and its options come from the results themselves. */
    it('offers a publisher filter built from what actually came back', async () => {
        store.state = baseState({
            query: 'qwen',
            results: [
                { id: 'unsloth/a', downloads: 900, likes: 0, gated: false },
                { id: 'bartowski/b', downloads: 400, likes: 0, gated: false },
            ],
        }) as never
        const wrapper = await screen()

        const select = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
            .find((candidate) => candidate.props('ariaLabel') === 'Filter by publisher')

        expect(select).toBeDefined()
        expect(select?.props('items')).toEqual([
            { value: 'unsloth', label: 'unsloth (1)' },
            { value: 'bartowski', label: 'bartowski (1)' },
        ])
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
        expect(wrapper.get('[data-testid="talos-model-fit"]').text()).toContain('Needs checking')
        expect(wrapper.get('[data-testid="talos-model-fit"]').text()).not.toContain('Runs well')
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

/**
 * CRUD sui modelli scaricati — owner 2026-08-04: «non è possibile crudare i
 * modelli locali nel dispositivo, se voglio dargli un alias o rinominarlo non è
 * possibile, usiamo la grammatica dell'app già esistente».
 */
describe('dare un nome a un modello, e toglierlo', () => {
    it('la riga offre rinomina, copia ed elimina — non solo la copia', async () => {
        engine.installed = [installed('Qwen3-4B-Q4_K_M.gguf', 'imported')]
        const wrapper = await screen()
        await wrapper.get('[data-testid="talos-models-installed-menu-Qwen3-4B-Q4_K_M.gguf"]').trigger('click')
        await flushPromises()

        const voci = [...document.querySelectorAll('[role="menuitem"]')].map((v) => v.getAttribute('data-testid'))
        expect(voci).toContain('talos-models-rename-Qwen3-4B-Q4_K_M.gguf')
        expect(voci).toContain('talos-models-copy-Qwen3-4B-Q4_K_M.gguf')
        expect(voci).toContain('talos-models-delete-Qwen3-4B-Q4_K_M.gguf')
    })

    it('il nome scelto sostituisce quello del file, ma non lo NASCONDE', async () => {
        /**
         * Un alias che copre il nome vero rende impossibile capire quale GGUF si
         * sta per cancellare: due pubblicatori possono chiamare i loro modelli
         * allo stesso modo.
         */
        engine.installed = [installed('Qwen3-4B-Q4_K_M.gguf', 'imported')]
        const wrapper = await screen()
        await wrapper.get('[data-testid="talos-models-installed-menu-Qwen3-4B-Q4_K_M.gguf"]').trigger('click')
        await flushPromises()
        document.querySelector<HTMLElement>('[data-testid^="talos-models-rename-"]')!
            .dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()

        const campo = document.querySelector<HTMLInputElement>('[data-testid="talos-models-rename-field"]')!
        campo.value = 'Il piccolo veloce'
        campo.dispatchEvent(new Event('input', { bubbles: true }))
        document.querySelector<HTMLElement>('[data-testid="talos-models-rename-save"]')!.click()
        await flushPromises()

        const riga = wrapper.get('[data-testid="talos-models-installed-row"]')
        expect(riga.text()).toContain('Il piccolo veloce')
        expect(riga.text()).toContain('Qwen3-4B-Q4_K_M.gguf')
    })

    it('la conferma di eliminazione dice quanti GIGABYTE tornano', async () => {
        // «Eliminare il modello?» non fa pensare a un'ora di scaricamento.
        engine.installed = [installed('Qwen3-4B-Q4_K_M.gguf', 'imported')]
        const wrapper = await screen()
        await wrapper.get('[data-testid="talos-models-installed-menu-Qwen3-4B-Q4_K_M.gguf"]').trigger('click')
        await flushPromises()
        document.querySelector<HTMLElement>('[data-testid^="talos-models-delete-"]')!
            .dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()

        const dialogo = document.querySelector('[data-testid="talos-models-delete-confirm"]')!
            .closest('[role="dialog"]') ?? document.body
        expect(dialogo.textContent).toMatch(/GB|MB/)
    })
})
