// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    resume: vi.fn(async () => ({ ok: true as const })),
    close: vi.fn(),
    open: vi.fn(async () => undefined),
    search: vi.fn(async () => undefined),
    saveToken: vi.fn(async () => undefined),
    loadCatalogue: vi.fn(async () => undefined),
    describe: vi.fn(async () => null),
    forgetToken: vi.fn(async () => undefined),
}))

vi.mock('@/stores/localModels', () => ({
    talosLocalModels: new Proxy({}, { get: (_, key) => (store.state as never)[key] }),
    // I filtri e l'apertura del campo si scrivono dallo STORE: lo stato è
    // esposto in sola lettura, quindi il componente non può toccarlo.
    talosSetBrowseFilters: (filters: readonly string[]) => {
        (store.state as never as { browseFilters: string[] }).browseFilters = [...filters]
    },
    talosSetBrowseSearchOpen: (open: boolean) => {
        (store.state as never as { browseSearchOpen: boolean }).browseSearchOpen = open
    },
    talosSetBrowseTab: (tab: string) => {
        (store.state as never as { browseTab: string }).browseTab = tab
    },
    talosSetInstalledFitsOnly: (only: boolean) => {
        (store.state as never as { installedFitsOnly: boolean }).installedFitsOnly = only
    },
    talosSetBrowseProvider: (provider: string) => {
        (store.state as never as { browseProvider: string }).browseProvider = provider
    },
    talosSetBrowseWeightBand: (band: string) => {
        (store.state as never as { browseWeightBand: string }).browseWeightBand = band
    },
    talosSetInstalledQuery: (query: string) => {
        (store.state as never as { installedQuery: string }).installedQuery = query
    },
    talosSearchLocalModels: store.search,
    talosOpenModelRepo: store.open,
    talosCloseModelRepo: store.close,
    talosExamineSet: store.examine,
    talosDownloadSet: store.download,
    talosStopLocalDownload: store.stop,
    talosResumeLocalDownload: store.resume,
    talosRefreshTransfer: vi.fn(async () => undefined),
    talosRefreshDeviceCapacity: vi.fn(async () => undefined),
    talosRefreshLeftovers: vi.fn(async () => undefined),
    talosRefreshHuggingFaceToken: vi.fn(async () => undefined),
    talosLoadLocalCatalogue: store.loadCatalogue,
    talosDescribeModelRepo: store.describe,
    talosSetLocalContext: vi.fn(),
    talosSetHuggingFaceToken: store.saveToken,
    talosForgetHuggingFaceToken: store.forgetToken,
}))

/**
 * What is already on the phone. Left empty by default so every test written
 * before this section keeps meeting the screen it was written against.
 */
const engine = vi.hoisted(() => ({
    installed: [] as { path: string, name: string, bytes: number, modifiedAt: number }[],
    list: vi.fn(),
}))

vi.mock('@/services/localEngine', () => ({
    talosLocalEngineStatus: vi.fn(async () => null),
    talosLocalInstalledModels: engine.list,
}))


import TalosMobileLocalModels from '@/components/talos/models/TalosMobileLocalModels.vue'
import TalosMobileLocalRepoDetail from '@/components/talos/models/TalosMobileLocalRepoDetail.vue'
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

/**
 * Model Lab Blocco 4 — `examination.ledger` è un campo obbligatorio del tipo
 * reale (`TalosSetExamination`, 'read'), ma questo file non è coperto dal
 * typecheck (`tests/**` non è in `tsconfig.app.json`): un fixture "read"
 * senza `ledger` compila silenziosamente qui e crasha solo quando
 * `TalosModelResourceLedger` prova a `.map()`rci sopra — trovato dalla
 * suite intera, non dal typecheck. Valori minimi ma plausibili, nello
 * stesso ordine fisso di `talosResourceLedger()`.
 */
function ledger() {
    return [
        { label: 'weights', bytes: 2.5 * 1024 ** 3, provenance: 'exact' },
        { label: 'kvCache', bytes: 500_000_000, provenance: 'exact' },
        { label: 'compute', bytes: 335_544_320, provenance: 'policy' },
        { label: 'runtime', bytes: 67_108_864, provenance: 'policy' },
        { label: 'safetyMargin', bytes: 268_435_456, provenance: 'policy' },
        { label: 'totalRuntime', bytes: 3_671_088_640, provenance: 'policy' },
        { label: 'availableRam', bytes: 4_000_000_000, provenance: 'exact' },
        { label: 'margin', bytes: 1_000_000_000, provenance: 'policy' },
    ]
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
        sort: 'downloads',
        // Dal 2026-08-06 i filtri del Hub e l'apertura del campo vivono nello
        // store, non nel componente: tornando da una scheda modello si
        // ritrovano com'erano invece di azzerarsi.
        browseFilters: [],
        browseSearchOpen: false,
        browseTab: 'installed',
        installedFitsOnly: false,
        browseProvider: '',
        browseWeightBand: '',
        installedQuery: '',
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
            active: false, paused: false, modelName: null, haveBytes: 0, totalBytes: 0,
            runner: null, networkBound: true, failure: null,
        },
        leftovers: { items: [], totalBytes: 0 },
        ...over,
    })
}

beforeEach(() => {
    engine.installed = []
    engine.list.mockReset().mockImplementation(async () => ({ models: engine.installed, unreadable: [] }))
    store.examine.mockClear()
    store.download.mockClear().mockResolvedValue({ ok: true })
    store.stop.mockClear().mockImplementation(async () => {
        (store.state as { transfer: { paused: boolean } }).transfer.paused = true
    })
    store.resume.mockClear().mockResolvedValue({ ok: true })
    store.open.mockClear()
    store.saveToken.mockClear()
    store.forgetToken.mockClear()
    store.loadCatalogue.mockClear()
    store.state = baseState() as never
})

/**
 * Monta la schermata e si mette sulla tab richiesta.
 *
 * Owner 2026-08-06: la schermata è divisa in due — «questo dispositivo» e
 * «Hugging Face». Il pannello inattivo **non viene montato**, che è il punto
 * delle tab: chi entra per liberare spazio non paga il rendering di un catalogo
 * che non ha chiesto.
 *
 * Il valore predefinito è `hub` perché quasi tutte le prove di questo file
 * parlano del catalogo remoto; quelle sull'installato lo dicono esplicitamente,
 * ed è giusto che si legga nel test quale delle due superfici sta guardando.
 */
/**
 * I montaggi vivi, da smontare fra un test e l'altro.
 *
 * Da quando si monta dentro il documento — serve a Reka per gestire il
 * puntatore sulle tab — i nodi restano nel body e i menu teleportati di un test
 * vengono trovati da quello dopo. Un test che cerca «il primo menu nel
 * documento» diventa allora dipendente dall'ordine, che è il modo peggiore di
 * essere rosso.
 */
const montati: Array<{ unmount: () => void }> = []

afterEach(() => {
    while (montati.length) montati.pop()?.unmount()
    document.body.innerHTML = ''
})

async function screen(tab: 'installed' | 'hub' = 'hub') {
    const currentRepo = (store.state as { repo?: { id: string, revision: string } | null }).repo
    const wrapper = mount(currentRepo ? TalosMobileLocalRepoDetail : TalosMobileLocalModels, {
        // Nel documento: Reka gestisce il puntatore sui trigger delle tab e
        // senza un nodo attaccato l'attivazione non arriva mai.
        attachTo: document.body,
        ...(currentRepo ? { props: { repoId: currentRepo.id, revision: currentRepo.revision } } : {}),
        global: {
            stubs: {
                RouterLink: {
                    props: ['to'],
                    template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
                },
            },
        },
    })
    await flushPromises()
    // La pagina di dettaglio di un repository non ha tab: è già una pagina sola.
    if (!currentRepo && tab === 'hub') {
        const trigger = wrapper.find('[data-talos-tab="hub"]')
        if (trigger.exists()) {
            // Reka commette su `pointerdown`: un click nudo non lo raggiunge —
            // stessa tecnica del test delle tab della Diagnostica.
            const nodo = trigger.element as HTMLElement
            nodo.focus()
            nodo.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
            nodo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
            await flushPromises()
        }
    }
    montati.push(wrapper)
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
    it('C45-RED-09C omits the whole installed section after a valid zero scan', async () => {
        engine.installed = []
        // Sulla tab del dispositivo: è lì che vive «aggiungi un modello dal
        // telefono», ed è la cosa che deve restare quando non c'è nient'altro.
        const wrapper = await screen('installed')

        expect(wrapper.find('[data-testid="talos-models-installed"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-models-installed-empty"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-models-import"]').exists()).toBe(true)
    })

    it('C45-RED-09C renders the installed section as soon as one model exists', async () => {
        engine.installed = [installed('Qwen3-4B-Q4_K_M.gguf', 'imported')]
        const wrapper = await screen('installed')

        expect(wrapper.find('[data-testid="talos-models-installed"]').exists()).toBe(true)
        expect(wrapper.findAll('[data-testid="talos-models-installed-row"]')).toHaveLength(1)
    })

    it('C45-RED-12A renders a singular count for one installed model and plural for two', async () => {
        engine.installed = [installed('uno.gguf', 'imported')]
        let wrapper = await screen('installed')

        expect(wrapper.get('[data-testid="talos-models-installed"]').text()).toContain('1 model')
        expect(wrapper.get('[data-testid="talos-models-installed"]').text()).not.toContain('1 models')
        wrapper.unmount()

        engine.installed = [installed('uno.gguf', 'imported'), installed('due.gguf', 'main')]
        wrapper = await screen('installed')
        expect(wrapper.get('[data-testid="talos-models-installed"]').text()).toContain('2 models')
    })

    it('C45-RED-09C does not misreport a failed scan as a valid empty device', async () => {
        engine.list.mockRejectedValueOnce(new Error('filesystem refused'))
        const wrapper = await screen('installed')

        expect(wrapper.find('[data-testid="talos-models-installed-empty"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-models-installed-error"]').attributes('role')).toBe('alert')
    })

    it('drops the address every model shares and keeps the folder that differs', async () => {
        engine.installed = [installed('Qwen3-4B-Q4_K_M.gguf', 'imported')]
        const wrapper = await screen('installed')

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
        const wrapper = await screen('installed')

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
        const wrapper = await screen('installed')

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
        const wrapper = await screen('installed')

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
        const wrapper = await screen('installed')

        expect(wrapper.findAll('[data-testid="talos-models-installed-row"]')).toHaveLength(1)
        expect(wrapper.find('[data-testid="talos-models-installed-search"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-models-installed-sort-recent"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-models-installed-layout"]').exists()).toBe(false)
    })

    it('brings them back as soon as there is more than one thing to order', async () => {
        engine.installed = [installed('uno.gguf', 'imported'), installed('due.gguf', 'main')]
        const wrapper = await screen('installed')

        expect(wrapper.find('[data-testid="talos-models-installed-search"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-models-installed-sort-recent"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-models-installed-layout"]').exists()).toBe(true)
    })

    it('C45-RED-12 groups installed models into one continuous divided surface', async () => {
        engine.installed = [installed('uno.gguf', 'imported'), installed('due.gguf', 'main')]
        const wrapper = await screen('installed')
        const list = wrapper.get('[data-testid="talos-models-installed-list"]')

        expect(list.classes()).toContain('overflow-hidden')
        expect(list.classes()).toContain('border')
        expect(list.classes()).toContain('divide-y')
        for (const row of wrapper.findAll('[data-testid="talos-models-installed-row"]')) {
            expect(row.classes()).not.toContain('rounded-[var(--talos-radius-card)]')
            expect(row.classes()).not.toContain('border')
        }
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

        const wrapper = await screen('installed')

        expect(wrapper.get('[data-testid="talos-models-installed-sort-size"]').attributes('aria-checked'))
            .toBe('true')
        expect(wrapper.get('[data-testid="talos-models-installed-sort-recent"]').attributes('aria-checked'))
            .toBe('false')
    })

    it('writes the choice where the Library writes its own', async () => {
        const settings = useSettingsStore()
        await settings.setShell({ models_sort: 'recent' })
        engine.installed = [installed('uno.gguf', 'imported'), installed('due.gguf', 'main')]

        const wrapper = await screen('installed')
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

describe('the Hugging Face access boundary', () => {
    it('keeps every secret control out of Local Models', async () => {
        const wrapper = await searchScreen()

        expect(wrapper.find('[data-testid="talos-models-token"]').exists()).toBe(false)
        expect(wrapper.find('input[type="password"]').exists()).toBe(false)
        expect(wrapper.html()).not.toContain('hf_secret')
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

    it('routes to the immutable revision returned with the browse row', async () => {
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

        const target = JSON.parse(wrapper.get('[data-testid="talos-models-result"]').attributes('data-to'))
        expect(target).toEqual({
            name: 'settings-models-local-repo',
            params: { owner: 'unsloth', repo: 'Qwen3-4B-GGUF' },
            query: { revision },
        })
        expect(store.open).not.toHaveBeenCalled()
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
        expect(groups[1]!.text()).toContain('1 model')
        expect(groups[1]!.text()).not.toContain('1 models')
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

    it('keeps publisher options from the unfiltered response when a facet removes rows', async () => {
        store.state = baseState({
            results: [
                {
                    id: 'unsloth/chat', downloads: 900, likes: 0, gated: false,
                    tags: ['conversational'], hasChatTemplate: false,
                },
                {
                    id: 'bartowski/plain', downloads: 400, likes: 0, gated: false,
                    tags: [], hasChatTemplate: false,
                },
            ],
        }) as never
        const wrapper = await searchScreen()
        await wrapper.get('[data-testid="talos-models-filter-chat"]').trigger('click')

        const select = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
            .find((candidate) => candidate.props('ariaLabel') === 'Filter by publisher')
        expect(select?.props('items')).toEqual([
            { value: 'unsloth', label: 'unsloth (1)' },
            { value: 'bartowski', label: 'bartowski (1)' },
        ])
    })

    it('keeps controls visible at zero and reset restores the rows', async () => {
        store.state = baseState({
            results: [{
                id: 'bartowski/plain', downloads: 400, likes: 0, gated: false,
                tags: [], hasChatTemplate: false,
            }],
        }) as never
        const wrapper = await searchScreen()
        await wrapper.get('[data-testid="talos-models-filter-chat"]').trigger('click')

        expect(wrapper.find('[data-testid="talos-models-provider-filter"]').exists()).toBe(true)
        expect(wrapper.get('[data-testid="talos-models-filter-empty"]').text()).toContain('0')
        await wrapper.get('[data-testid="talos-models-filter-reset"]').trigger('click')
        expect(wrapper.findAll('[data-testid="talos-models-result"]')).toHaveLength(1)
    })

    it('LOCAL-FILTER-RAIL-01 keeps every complete filter on one horizontally scrolling row', async () => {
        store.state = baseState({
            results: [{ id: 'x/y', downloads: 1, likes: 0, gated: false }],
        }) as never
        const wrapper = await searchScreen()
        const filters = wrapper.get('[data-testid="talos-models-filters"]')

        expect(filters.classes()).toContain('flex-nowrap')
        expect(filters.classes()).toContain('overflow-x-auto')
        expect(filters.classes()).toContain('overscroll-x-contain')
        expect(filters.classes()).not.toContain('flex-wrap')
        for (const chip of filters.findAll('button')) expect(chip.classes()).toContain('shrink-0')
        expect(filters.text()).toContain('Code-oriented')
        expect(filters.text()).toContain('Declared permissive licence')
    })

    it('C45-RED-13 groups each publisher into one compact divided result list', async () => {
        store.state = baseState({
            results: [
                { id: 'unsloth/a', downloads: 900, likes: 4, gated: false },
                { id: 'unsloth/b', downloads: 400, likes: 2, gated: false },
            ],
        }) as never
        const wrapper = await searchScreen()
        const list = wrapper.get('[data-testid="talos-models-provider-list"]')

        expect(list.classes()).toContain('divide-y')
        expect(list.findAll('[data-testid="talos-models-result"]')).toHaveLength(2)
        for (const row of list.findAll('[data-testid="talos-models-result"]')) {
            expect(row.classes()).not.toContain('rounded-[var(--talos-radius-card)]')
            expect(row.classes()).not.toContain('border')
        }
    })

    it('names the rolling download window on every result', async () => {
        store.state = baseState({
            results: [{ id: 'x/y', downloads: 4_900_000, likes: 0, gated: false }],
        }) as never
        const wrapper = await searchScreen()

        expect(wrapper.get('[data-testid="talos-models-result"]').text()).toContain('last 30 days')
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
                sets: [set({ examination: { state: 'read', fit: fit(), ledger: ledger(), kvCacheTypeLabel: 'f16', quantisation: 'Q4_K_M', trainedContext: 131_072 } })],
            },
        }) as never
        const wrapper = await screen()

        // Restyle Blocco 6: la velocità è uscita dalla frase del verdetto,
        // è la sua casella statistica dedicata (mockup: "VELOCITÀ PREVISTA").
        expect(wrapper.get('[data-testid="talos-models-verdict"]').text()).toContain('Memory: room to spare')
        expect(wrapper.get('[data-testid="talos-models-speed-stat"]').text()).toContain('13.8')
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
                        ledger: ledger(),
                        kvCacheTypeLabel: 'f16',
                        quantisation: 'Q4_K_M',
                        trainedContext: 131_072,
                    },
                })],
            },
        }) as never
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-models-verdict"]').text()).toContain('Not enough memory')
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
                sets: [set({ examination: { state: 'read', fit: fit({ tokensPerSecond: null }), ledger: ledger(), kvCacheTypeLabel: 'f16', quantisation: null, trainedContext: 4096 } })],
            },
        }) as never
        const wrapper = await screen()

        // Restyle Blocco 6: stessa mossa del test sopra — la velocità (qui
        // "sconosciuta") è nella casella statistica, non nel verdetto.
        expect(wrapper.get('[data-testid="talos-models-speed-stat"]').text()).toContain('speed unknown')
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
        expect(wrapper.get('[data-testid="talos-model-fit"]').text()).toContain('Not measured')
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
                sets: [set({ examination: { state: 'read', fit: fit({ band: 'wont-run', reason: 'memory' }), ledger: ledger(), kvCacheTypeLabel: 'f16', quantisation: null, trainedContext: 4096 } })],
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
    it('leaves polling and transfer controls to the global Download Center', async () => {
        store.state = baseState({
            transfer: {
                active: true, paused: false, modelName: 'Qwen3-4B Q4_K_M',
                haveBytes: 1024 ** 3, totalBytes: 4 * 1024 ** 3,
                runner: 'USER_INITIATED_JOB', networkBound: true, failure: null,
            },
        }) as never
        const interval = vi.spyOn(globalThis, 'setInterval')
        const wrapper = await screen('installed')

        try {
            /*
             * Non «zero intervalli in tutto il componente»: dal 2026-08-06 la
             * schermata ha due tab, e la striscia ne usa uno suo per far
             * scorrere l'indicatore. Quello che questo test difende è un'altra
             * cosa — che i TRASFERIMENTI non vengano seguiti da qui, perché
             * quel lavoro è del Centro download.
             *
             * Perciò si guarda ciò che conta davvero: nessun comando di
             * trasferimento in questa schermata.
             */
            expect(interval.mock.calls.length).toBeLessThanOrEqual(1)
            expect(wrapper.find('[data-testid="talos-models-transfer"]').exists()).toBe(false)
            expect(wrapper.find('[data-testid="talos-models-stop"]').exists()).toBe(false)
            expect(wrapper.find('[data-testid="talos-models-resume"]').exists()).toBe(false)
        } finally {
            wrapper.unmount()
            interval.mockRestore()
        }
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
    it('C45-RED-12B keeps import and every installed-model dialog action on the 48dp token', async () => {
        engine.installed = [installed('Qwen3-4B-Q4_K_M.gguf', 'imported')]
        const wrapper = await screen('installed')
        const target = 'min-h-touch'

        expect(wrapper.get('[data-testid="talos-models-import"]').classes()).toContain(target)

        await wrapper.get('[data-testid="talos-models-installed-menu-Qwen3-4B-Q4_K_M.gguf"]').trigger('click')
        await flushPromises()
        document.querySelector<HTMLElement>('[data-testid^="talos-models-rename-"]')!
            .dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()
        expect(document.querySelector('[data-testid="talos-models-cancel-rename"]')?.classList).toContain(target)
        expect(document.querySelector('[data-testid="talos-models-rename-save"]')?.classList).toContain(target)
        document.querySelector<HTMLElement>('[data-testid="talos-models-cancel-rename"]')?.click()
        await flushPromises()

        await wrapper.get('[data-testid="talos-models-installed-menu-Qwen3-4B-Q4_K_M.gguf"]').trigger('click')
        await flushPromises()
        document.querySelector<HTMLElement>('[data-testid^="talos-models-delete-"]')!
            .dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()
        expect(document.querySelector('[data-testid="talos-models-cancel-delete"]')?.classList).toContain(target)
        expect(document.querySelector('[data-testid="talos-models-delete-confirm"]')?.classList).toContain(target)
        document.querySelector<HTMLElement>('[data-testid="talos-models-cancel-delete"]')?.click()
        await flushPromises()
    })

    it('la riga offre rinomina, copia ed elimina — non solo la copia', async () => {
        engine.installed = [installed('Qwen3-4B-Q4_K_M.gguf', 'imported')]
        const wrapper = await screen('installed')
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
        const wrapper = await screen('installed')
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
        const wrapper = await screen('installed')
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
