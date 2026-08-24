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
    examineRepo: vi.fn(async () => undefined),
    download: vi.fn(async () => ({ ok: true as const })),
    resume: vi.fn(async () => ({ ok: true as const })),
}))

vi.mock('@/stores/localModels', () => ({
    talosLocalModels: new Proxy({}, { get: (_, key) => harness.state[key as never] }),
    talosOpenModelRepo: harness.open,
    talosCloseModelRepo: harness.close,
    talosDescribeModelRepo: harness.describe,
    talosExamineSet: harness.examine,
    talosExamineRepo: harness.examineRepo,
    talosDownloadSet: harness.download,
    talosResumeLocalDownload: harness.resume,
    talosSetLocalContext: vi.fn(),
    talosSetLocalKvCacheType: vi.fn(),
    talosStopLocalDownload: vi.fn(async () => undefined),
    talosRefreshDeviceCapacity: vi.fn(async () => undefined),
    talosRefreshTransfer: vi.fn(async () => undefined),
    talosRefreshLeftovers: vi.fn(async () => undefined),
    talosRefreshHuggingFaceToken: vi.fn(async () => undefined),
}))

import TalosMobileLocalRepoDetail from '@/components/talos/models/TalosMobileLocalRepoDetail.vue'
// Le stesse funzioni mockate sopra: importarle qui (dopo vi.mock, che Vitest
// solleva comunque in cima al file) da' la referenza allo stesso vi.fn() che
// il componente chiama, per potervi asserire sopra.
import { talosSetLocalContext, talosSetLocalKvCacheType } from '@/stores/localModels'

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
    harness.examineRepo.mockClear()
    vi.mocked(talosSetLocalContext).mockClear()
    vi.mocked(talosSetLocalKvCacheType).mockClear()
    harness.state = reactive({
        repo: { id: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha', loading: false, failure: null, sets: [modelSet()] },
        device: { availableRamBytes: 5 * 1024 ** 3, freeStorageBytes: 20 * 1024 ** 3, lowMemoryThresholdBytes: 0 },
        context: 4096,
        kvCacheType: 'auto',
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
        // Restyle Blocco 6: talos-models-set (la vecchia riga) e' sparito
        // con l'elenco verticale — una sola scheda sulla rail e' l'equivalente.
        expect(wrapper.get('[data-testid="talos-models-variant-rail"]').findAll('[role="radio"]')).toHaveLength(1)
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

    /**
     * Restyle Blocco 6 — sostituisce C45-RED-14. L'elenco verticale
     * divide-y (la scoperta originale di C45) non esiste più su questa
     * pagina di proposito: owner, 24/8, dopo aver confrontato il mockup
     * col Pad vero — "DETTAGLIO E LISTA" andavano riportate al layout del
     * mockup. La rail è il nuovo master del pattern master-detail
     * (ricerca web nel commento del componente), e la variante scelta
     * porta il proprio bottone di download nel pannello di configurazione,
     * non più nella riga.
     */
    it('la rail sostituisce l\'elenco, e il bottone di download resta accessibile e minimo', async () => {
        const wrapper = mount(TalosMobileLocalRepoDetail, {
            props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
        })
        await flushPromises()

        const rail = wrapper.get('[data-testid="talos-models-variant-rail"]')
        expect(rail.attributes('role')).toBe('radiogroup')
        expect(rail.findAll('[role="radio"]')).toHaveLength(1)

        const download = wrapper.get('[data-testid="talos-models-download"]')
        expect(download.attributes('aria-label')).toContain('Q4_K_M')
        expect(download.classes()).toContain('size-[var(--talos-touch-target)]')
        expect(download.text()).not.toContain('Download')
    })

    it('un suffisso di backend nel nome resta leggibile per intero nel pannello di configurazione', async () => {
        harness.state.repo.sets[0].label = 'Q4_K_M · HIP optimized'
        const wrapper = mount(TalosMobileLocalRepoDetail, {
            props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
        })
        await flushPromises()

        const identity = wrapper.get('[data-testid="talos-models-variant-identity"]')
        expect(identity.get('[data-testid="talos-models-variant-label"]').text()).toBe('Q4_K_M · HIP optimized')
        expect(identity.find('[data-testid="talos-models-variant-size"]').exists()).toBe(true)
    })

    /**
     * Restyle Blocco 6 — sostituisce C45-RED-14 "behind a disclosure": è
     * l'esatto contrario che l'owner ha chiesto guardando il mockup. Il
     * bottone Esamina/Ricontrolla e il resto della configurazione sono ora
     * SEMPRE visibili per la variante scelta, senza un tocco in più.
     */
    it('il bottone Esamina/Ricontrolla è visibile subito, non dietro una divulgazione', async () => {
        const wrapper = mount(TalosMobileLocalRepoDetail, {
            props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
        })
        await flushPromises()

        const config = wrapper.get('[data-testid="talos-models-runtime-config"]')
        expect(config.find('[data-testid="talos-models-examine"]').exists()).toBe(true)
        expect(wrapper.find('details[data-testid="talos-models-variant-details"]').exists()).toBe(false)
    })

    /**
     * Model Lab Blocco 2 — il controllo globale, non il bottone di
     * controproposta per riga (già coperto sopra da altri test). Vive in
     * `talos-models-global-controls`, una sola volta per pagina, non dentro
     * il `<details>` di ogni variante.
     */
    describe('Model Lab Blocco 2 — controllo globale di contesto e cache KV', () => {
        it('mostra lo slider con i bordi 2K-128K passo 256 e il valore corrente dello store', async () => {
            harness.state.context = 16_384
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            const slider = wrapper.get('[data-testid="talos-models-context-slider"]')
            expect(slider.attributes('type')).toBe('range')
            expect(slider.attributes('min')).toBe('2048')
            expect(slider.attributes('max')).toBe('131072')
            expect(slider.attributes('step')).toBe('256')
            expect((slider.element as HTMLInputElement).value).toBe('16384')
            expect(wrapper.get('[data-testid="talos-models-context-value"]').text()).toBe('16384')
        })

        it('muovere lo slider chiama talosSetLocalContext col nuovo valore, non talosSetLocalKvCacheType', async () => {
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            const slider = wrapper.get('[data-testid="talos-models-context-slider"]')
            const elemento = slider.element as HTMLInputElement
            elemento.value = '32768'
            await slider.trigger('change')

            expect(talosSetLocalContext).toHaveBeenCalledWith(32_768)
            expect(talosSetLocalKvCacheType).not.toHaveBeenCalled()
        })

        it('mostra le tre sole opzioni AUTO/F16/Q8_0, mai Q4_0, con quella corrente marcata aria-checked', async () => {
            harness.state.kvCacheType = 'f16'
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            const gruppo = wrapper.get('[data-testid="talos-models-kv-cache-type"]')
            expect(gruppo.attributes('role')).toBe('radiogroup')
            const opzioni = gruppo.findAll('[role="radio"]')
            expect(opzioni).toHaveLength(3)
            expect(opzioni.map((o) => o.attributes('data-talos-filter-option'))).toEqual(['auto', 'f16', 'q8_0'])
            const attiva = gruppo.get('[data-talos-filter-option="f16"]')
            expect(attiva.attributes('aria-checked')).toBe('true')
            expect(gruppo.get('[data-talos-filter-option="auto"]').attributes('aria-checked')).toBe('false')
        })

        it('scegliere Q8_0 chiama talosSetLocalKvCacheType, non talosSetLocalContext', async () => {
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            await wrapper.get('[data-talos-filter-option="q8_0"]').trigger('click')

            expect(talosSetLocalKvCacheType).toHaveBeenCalledWith('q8_0')
            expect(talosSetLocalContext).not.toHaveBeenCalled()
        })

        it('sparisce quando il repository non ha ancora varianti, invece di mostrare un controllo inutile', async () => {
            harness.state.repo.sets = []
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            expect(wrapper.find('[data-testid="talos-models-global-controls"]').exists()).toBe(false)
        })
    })

    /**
     * Model Lab Blocco 3 — l'esame non aspetta piu' un tocco. `talosExamineRepo`
     * resta mockato in blocco (raggruppamento capofila/eredita' e' gia'
     * coperto, sul vero, da unaLetturaPerModello.test.ts): qui si prova
     * solo che IL COMPONENTE lo richiama da solo e mostra/nasconde
     * l'indicatore nel momento giusto.
     */
    describe('Model Lab Blocco 3 — esame automatico all\'apertura', () => {
        it('chiama talosExamineRepo da solo dopo il caricamento, senza un tocco', async () => {
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            expect(harness.examineRepo).toHaveBeenCalledTimes(1)
            wrapper.unmount()
        })

        it('mostra l\'indicatore di sottofondo mentre gira, lo spegne quando finisce', async () => {
            let sciogli: (() => void) | null = null
            harness.examineRepo.mockImplementationOnce(() => new Promise((resolve) => {
                sciogli = () => resolve(undefined)
            }))
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            expect(wrapper.get('[data-testid="talos-models-examining-repo"]').attributes('role')).toBe('status')

            sciogli?.()
            await flushPromises()

            expect(wrapper.find('[data-testid="talos-models-examining-repo"]').exists()).toBe(false)
            wrapper.unmount()
        })

        /**
         * ⛔ AL CONTRARIO: la riga che prova la guardia di generazione in
         * `examineAutomatically`. Senza `if (generation === loadGeneration)`
         * nel `finally`, un esame VECCHIO che si risolve in ritardo
         * spegnerebbe l'indicatore di un caricamento NUOVO ancora in corso.
         */
        it('un esame vecchio che si risolve in ritardo non spegne l\'indicatore del caricamento nuovo', async () => {
            let sciogliPrimo: (() => void) | null = null
            let sciogliSecondo: (() => void) | null = null
            harness.examineRepo
                .mockImplementationOnce(() => new Promise((resolve) => { sciogliPrimo = () => resolve(undefined) }))
                .mockImplementationOnce(() => new Promise((resolve) => { sciogliSecondo = () => resolve(undefined) }))

            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()
            expect(wrapper.find('[data-testid="talos-models-examining-repo"]').exists()).toBe(true)

            harness.state.repo = { id: 'other/repo', revision: 'sha2', loading: false, failure: null, sets: [] }
            await wrapper.setProps({ repoId: 'other/repo', revision: 'sha2' })
            await flushPromises()
            expect(wrapper.find('[data-testid="talos-models-examining-repo"]').exists()).toBe(true)

            sciogliPrimo?.()
            await flushPromises()
            expect(wrapper.find('[data-testid="talos-models-examining-repo"]').exists()).toBe(true)

            sciogliSecondo?.()
            await flushPromises()
            expect(wrapper.find('[data-testid="talos-models-examining-repo"]').exists()).toBe(false)
            wrapper.unmount()
        })
    })

    /**
     * Model Lab Blocco 4 — il ledger dentro la pagina vera, non isolato.
     * TalosModelResourceLedger.test.ts prova il componente da solo; qui si
     * prova solo che la pagina lo MONTA con le righe giuste quando una
     * variante e' "read", e non lo monta affatto altrimenti.
     */
    describe('Model Lab Blocco 4 — il ledger di provenienza dentro il dettaglio variante', () => {
        function letta() {
            return {
                state: 'read' as const,
                fit: {
                    band: 'comfortable' as const,
                    reason: 'fits' as const,
                    kvCacheBytes: 268_435_456,
                    requiredBytes: 768_435_456,
                    residentBytes: 6_000_000_000,
                    deficitBytes: 0,
                    tokensPerSecond: 12,
                    maxContext: 32_768,
                },
                ledger: [
                    { label: 'weights' as const, bytes: 2_500_000_000, provenance: 'exact' as const },
                    { label: 'kvCache' as const, bytes: 268_435_456, provenance: 'exact' as const },
                    { label: 'compute' as const, bytes: 335_544_320, provenance: 'policy' as const },
                    { label: 'runtime' as const, bytes: 67_108_864, provenance: 'policy' as const },
                    { label: 'safetyMargin' as const, bytes: 268_435_456, provenance: 'policy' as const },
                    { label: 'totalRuntime' as const, bytes: 3_439_523_840, provenance: 'policy' as const },
                    { label: 'availableRam' as const, bytes: 5_000_000_000, provenance: 'exact' as const },
                    { label: 'margin' as const, bytes: 1_291_042_144, provenance: 'policy' as const },
                ],
                quantisation: 'Q4_K_M',
                trainedContext: 131_072,
                parameterCount: 4_000_000_000,
                tensorTypeHistogram: null,
                quantizationVersion: null,
            }
        }

        /**
         * Restyle Blocco 6 — il ledger vive nel proprio pannello, sempre
         * visibile per la variante scelta: niente più `<details>` da
         * aprire prima di poterlo leggere.
         */
        async function repoAperto() {
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()
            return wrapper
        }

        it('monta il ledger con tutte e otto le righe quando la variante e\' gia\' esaminata', async () => {
            harness.state.repo.sets[0].examination = letta()
            const wrapper = await repoAperto()

            const ledger = wrapper.get('[data-testid="talos-model-resource-ledger"]')
            expect(ledger.findAll('[data-testid^="talos-ledger-row-"]')).toHaveLength(8)
            wrapper.unmount()
        })

        it('non monta il ledger quando la variante non e\' ancora stata esaminata', async () => {
            const wrapper = await repoAperto()

            expect(wrapper.find('[data-testid="talos-model-resource-ledger"]').exists()).toBe(false)
            wrapper.unmount()
        })

        /**
         * Trovato guardando lo schermo vero (screenshot 13-variante-reale,
         * Pad, 24/8): la casella "Velocità prevista" mostrava
         * "15.602726935797765 token al secondo" — il numero GREZZO di
         * fit.tokensPerSecond, non quello arrotondato che
         * talosFitVerdict già calcola (Math.round(x*10)/10,
         * presentation.ts). La correzione legge da selectedRow.verdict,
         * non da examination.fit direttamente — questo test prova che non
         * torna a succedere.
         */
        it('la velocità prevista è arrotondata a una cifra, mai il numero grezzo', async () => {
            const esaminata = letta()
            esaminata.fit = { ...esaminata.fit, tokensPerSecond: 15.602726935797765 }
            harness.state.repo.sets[0].examination = esaminata
            const wrapper = await repoAperto()

            const casella = wrapper.get('[data-testid="talos-models-speed-stat"]').text()
            expect(casella).toContain('15.6')
            expect(casella).not.toContain('15.602726935797765')
            wrapper.unmount()
        })
    })
})
