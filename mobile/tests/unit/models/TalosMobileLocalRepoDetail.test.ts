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
        readme: '# Qwen\n\nThis model is built for long coding sessions with tools and careful instruction following across large repositories.\n\n<img src="https://cdn-uploads.huggingface.co/production/uploads/liquid.png" alt="Liquid AI" />\n\n## Full notes\nThe complete card remains available here.',
        // Restyle Blocco 6 (mockup, item 8): TalosHuggingFaceCard porta
        // anche questi tre campi da quando describeModel() li legge dalla
        // stessa risposta HF di author/license — senza, downloadsLabel
        // formatterebbe `undefined` in «NaN», trovato dalla suite intera.
        downloads: 309_648,
        likes: 234,
        gguf: { parameters: 4_000_000_000, repositoryFileBytes: null, contextLength: 131_072, architecture: 'qwen3' },
    })),
    examine: vi.fn(async () => undefined),
    examineRepo: vi.fn(async () => undefined),
    download: vi.fn(async () => ({ ok: true as const })),
    resume: vi.fn(async () => ({ ok: true as const })),
    // DEBT-MOBILE-014 — stesso store del Centro download (TalosMobileDownloadCenterTrigger.test.ts
    // usa lo stesso pattern): pausa/riprendi/annulla sono comandi reali sul
    // ponte nativo, mockati qui perche' jsdom non ha il plugin Capacitor.
    pauseTransfer: vi.fn(async () => ({ ok: true as const })),
    resumeTransfer: vi.fn(async () => ({ ok: true as const })),
    cancelTransfer: vi.fn(async () => ({ ok: true as const })),
}))

vi.mock('@/stores/modelTransfers', () => ({
    talosPauseManagedModelTransfer: harness.pauseTransfer,
    talosResumeManagedModelTransfer: harness.resumeTransfer,
    talosCancelManagedModelTransfer: harness.cancelTransfer,
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

// Restyle Blocco 6 (mockup, item 5) — l'unica azione dietro "copia link".
const clipboard = vi.hoisted(() => ({ write: vi.fn(async () => undefined) }))
vi.mock('@/services/clipboard', () => ({ writeTalosClipboardText: clipboard.write }))

import TalosMobileLocalRepoDetail from '@/components/talos/models/TalosMobileLocalRepoDetail.vue'
// Le stesse funzioni mockate sopra: importarle qui (dopo vi.mock, che Vitest
// solleva comunque in cima al file) da' la referenza allo stesso vi.fn() che
// il componente chiama, per potervi asserire sopra.
import { talosSetLocalContext, talosSetLocalKvCacheType } from '@/stores/localModels'
import {
    talosCancelManagedModelTransfer,
    talosPauseManagedModelTransfer,
    talosResumeManagedModelTransfer,
} from '@/stores/modelTransfers'

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
        transfer: { items: [], active: false, paused: false, modelName: null, haveBytes: 0, totalBytes: 0, runner: null, networkBound: true, failure: null },
        leftovers: { items: [], totalBytes: 0 },
    }) as never
})

describe('TalosMobileLocalRepoDetail', () => {
    // DEBT-MOBILE-014 (owner 26/8): superato dal contratto sotto — i comandi
    // pausa/riprendi/annulla vivono ORA anche qui, non solo nel Centro
    // download globale. La sola garanzia che resta vera e' che nessun
    // secondo poller nasce: `talos-models-transfer`/`-stop`/`-resume` non
    // sono mai esistiti in questo componente, prima o dopo.
    it('non apre un secondo poller — i comandi restano sullo stesso store del Centro download', async () => {
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

    /**
     * Restyle Blocco 6 (mockup, item 1) — sostituisce il vecchio test sulla
     * `<details>` nativa: il README per intero ora vive nel tab "Scheda
     * modello", non piu' dietro una divulgazione dentro la card. Stessa
     * garanzia di prima (non si monta finche' nessuno lo chiede — un
     * README del Hub arriva a centomila caratteri), il meccanismo che la
     * garantisce e' cambiato da `<details>` a `activeTab`.
     */
    it('mostra un riassunto compatto sopra i tab, e il README intero solo nel tab Scheda modello', async () => {
        const wrapper = mount(TalosMobileLocalRepoDetail, {
            props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
        })
        await flushPromises()

        const summary = wrapper.get('[data-testid="talos-models-readme-summary"]')
        expect(summary.text()).toContain('long coding sessions')
        expect(summary.classes()).toContain('line-clamp-2')
        // Di default siamo su "Quantizzazioni": il README intero non è montato.
        expect(wrapper.find('[data-testid="talos-mobile-message-content"]').exists()).toBe(false)

        await wrapper.get('[data-testid="talos-models-tab-scheda"]').trigger('click')

        const scheda = wrapper.get('[data-testid="talos-models-readme-full"]').get('[data-testid="talos-mobile-message-content"]')
        expect(scheda.text()).toContain('The complete card remains available here.')
        // ⛔ Il difetto che questa prova sorveglia: la scheda si LEGGE. Niente
        // sorgente in un `pre`, e i titoli sono titoli.
        expect(wrapper.find('pre').exists()).toBe(false)
        expect(scheda.find('h2').exists()).toBe(true)
        expect(scheda.text()).not.toContain('## Full notes')
        expect(scheda.find('img').attributes('src')).toBe('https://cdn-uploads.huggingface.co/production/uploads/liquid.png')
    })

    /**
     * Restyle Blocco 6 — sostituisce C45-RED-14. L'elenco verticale
     * divide-y (la scoperta originale di C45) non esiste più su questa
     * pagina di proposito: owner, 24/8, dopo aver confrontato il mockup
     * col Pad vero — "DETTAGLIO E LISTA" andavano riportate al layout del
     * mockup. La rail è il nuovo master del pattern master-detail
     * (ricerca web nel commento del componente), e la variante scelta
     * porta il proprio bottone di download nel pannello di configurazione,
     * non più nella riga. Il bottone stesso porta ora nome e taglia
     * (item 4 della chiusura mockup, 24/8) — non più icona sola.
     */
    it('la rail sostituisce l\'elenco, e il bottone di download porta nome e taglia', async () => {
        const wrapper = mount(TalosMobileLocalRepoDetail, {
            props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
        })
        await flushPromises()

        const rail = wrapper.get('[data-testid="talos-models-variant-rail"]')
        expect(rail.attributes('role')).toBe('radiogroup')
        expect(rail.findAll('[role="radio"]')).toHaveLength(1)

        const download = wrapper.get('[data-testid="talos-models-download"]')
        expect(download.attributes('aria-label')).toContain('Q4_K_M')
        expect(download.classes()).toContain('w-full')
        expect(download.text()).toContain('Q4_K_M')
        // 2_500_000_000 byte formattati da talosFormatBytes: 2.3 GiB, non 2.5 GB decimali.
        expect(download.text()).toContain('2.3 GB')
    })

    it('DEBT-MOBILE-014 RED: the selected download button becomes its live progress bar', async () => {
        harness.state.transfer.items = [{
            id: 'transfer-q4',
            jobId: 101,
            createdAtMs: 1,
            phase: 'running',
            active: true,
            repo: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile',
            revision: 'sha',
            paths: ['model-Q4_K_M.gguf'],
            modelName: 'Qwen Q4_K_M',
            haveBytes: 625_000_000,
            totalBytes: 2_500_000_000,
            runner: 'USER_INITIATED_JOB',
            networkBound: true,
            failure: null,
            resumable: true,
        }]
        const wrapper = mount(TalosMobileLocalRepoDetail, {
            props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
        })
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-models-download"]').exists()).toBe(false)
        const progress = wrapper.get('[data-testid="talos-models-download-progress"]')
        expect(progress.attributes('role')).toBe('progressbar')
        expect(progress.attributes('aria-valuenow')).toBe('25')
        expect(progress.text()).toContain('Q4_K_M')
        expect(progress.text()).toContain('596 MB')
        expect(progress.text()).toContain('2.3 GB')
    })

    describe('DEBT-MOBILE-014 — pausa/riprendi/annulla integrati nel pannello (owner 26/8)', () => {
        function runningTransfer(overrides: Record<string, unknown> = {}) {
            return {
                id: 'transfer-q4',
                jobId: 101,
                createdAtMs: 1,
                phase: 'running',
                active: true,
                repo: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile',
                revision: 'sha',
                paths: ['model-Q4_K_M.gguf'],
                modelName: 'Qwen Q4_K_M',
                haveBytes: 625_000_000,
                totalBytes: 2_500_000_000,
                runner: 'USER_INITIATED_JOB',
                networkBound: true,
                failure: null,
                resumable: true,
                ...overrides,
            }
        }

        beforeEach(() => {
            vi.mocked(talosPauseManagedModelTransfer).mockClear()
            vi.mocked(talosResumeManagedModelTransfer).mockClear()
            vi.mocked(talosCancelManagedModelTransfer).mockClear()
        })

        it('un trasferimento in corso porta il pulsante Pausa, che chiama lo stesso comando del Centro download sullo stesso id', async () => {
            harness.state.transfer.items = [runningTransfer()]
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            expect(wrapper.find('[data-testid="talos-models-download-resume"]').exists()).toBe(false)
            const pause = wrapper.get('[data-testid="talos-models-download-pause"]')
            expect(pause.attributes('aria-label')).toContain('Q4_K_M')

            await pause.trigger('click')
            await flushPromises()

            expect(talosPauseManagedModelTransfer).toHaveBeenCalledWith('transfer-q4')
        })

        it('un trasferimento in pausa porta il pulsante Riprendi al posto di Pausa', async () => {
            harness.state.transfer.items = [runningTransfer({ phase: 'paused', active: false })]
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            expect(wrapper.find('[data-testid="talos-models-download-pause"]').exists()).toBe(false)
            const resume = wrapper.get('[data-testid="talos-models-download-resume"]')
            expect(resume.attributes('aria-label')).toContain('Q4_K_M')

            await resume.trigger('click')
            await flushPromises()

            expect(talosResumeManagedModelTransfer).toHaveBeenCalledWith('transfer-q4')
        })

        it('Annulla chiede conferma prima di chiamare il comando, ed "Continua a conservarlo" lo evita', async () => {
            harness.state.transfer.items = [runningTransfer()]
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            await wrapper.get('[data-testid="talos-models-download-cancel"]').trigger('click')
            await flushPromises()
            expect(wrapper.find('[data-testid="talos-models-download-cancel-warning"]').exists()).toBe(true)
            expect(talosCancelManagedModelTransfer).not.toHaveBeenCalled()

            // "Continua a conservarlo" — primo bottone della conferma — chiude senza annullare.
            await wrapper.get('[data-testid="talos-models-download-cancel-warning"]').get('button').trigger('click')
            await flushPromises()
            expect(wrapper.find('[data-testid="talos-models-download-cancel-warning"]').exists()).toBe(false)
            expect(talosCancelManagedModelTransfer).not.toHaveBeenCalled()

            // Riapre e conferma per davvero questa volta.
            await wrapper.get('[data-testid="talos-models-download-cancel"]').trigger('click')
            await flushPromises()
            await wrapper.get('[data-testid="talos-models-download-cancel-confirm"]').trigger('click')
            await flushPromises()

            expect(talosCancelManagedModelTransfer).toHaveBeenCalledWith('transfer-q4')
        })

        it('senza un trasferimento attivo non mostra alcun comando di pausa/riprendi/annulla', async () => {
            harness.state.transfer.items = []
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            expect(wrapper.find('[data-testid="talos-models-download-pause"]').exists()).toBe(false)
            expect(wrapper.find('[data-testid="talos-models-download-resume"]').exists()).toBe(false)
            expect(wrapper.find('[data-testid="talos-models-download-cancel"]').exists()).toBe(false)
        })
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
                // Restyle Blocco 6 (mockup, item 7): campo aggiunto allo
                // stesso stato "read" dopo che questo fixture era gia'
                // scritto — senza, il tipo risolto sarebbe `undefined` a
                // runtime (i test non passano dal typecheck, tests/** non
                // e' nel suo `include`).
                kvCacheTypeLabel: 'f16' as const,
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

    /**
     * Chiusura mockup, 24/8 — gli otto punti trovati confrontando i
     * mobile veri col mockup ("app reale non è allineata al mockup" →
     * owner, "chiudi tutti i punti"). Un test a testa, sul comportamento
     * osservabile, non sulla classe CSS che li disegna.
     */
    describe('Chiusura mockup 24/8 — otto punti', () => {
        it('item 1: i tre tab esistono, e cambiano cosa si vede sotto', async () => {
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            expect(wrapper.get('[data-testid="talos-models-tab-quant"]').attributes('aria-checked')).toBe('true')
            expect(wrapper.find('[data-testid="talos-models-variant-rail"]').exists()).toBe(true)
            expect(wrapper.find('[data-testid="talos-models-readme-full"]').exists()).toBe(false)
            expect(wrapper.find('[data-testid="talos-models-file-tab"]').exists()).toBe(false)

            await wrapper.get('[data-testid="talos-models-tab-file"]').trigger('click')
            expect(wrapper.find('[data-testid="talos-models-variant-rail"]').exists()).toBe(false)
            const file = wrapper.get('[data-testid="talos-models-file-tab"]')
            // item 1: percorsi VERI (set.paths), non un elenco inventato.
            expect(file.text()).toContain('model-Q4_K_M.gguf')
            wrapper.unmount()
        })

        it('item 2: il riquadro di spiegazione è sempre visibile sopra i tab', async () => {
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            expect(wrapper.get('[data-testid="talos-models-analysis-banner"]').text()).toContain('talosExamineRepo')
        })

        it('item 3: il link a Hugging Face punta al repository vero', async () => {
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            const link = wrapper.get('[data-testid="talos-models-open-hf"]')
            expect(link.attributes('href')).toBe('https://huggingface.co/unsloth/a-very-long-qwen-coder-repository-name-for-mobile')
            expect(link.attributes('target')).toBe('_blank')
            expect(link.attributes('rel')).toContain('noopener')
        })

        // item 4 (nome+taglia sul bottone di download) è già coperto sopra da
        // "la rail sostituisce l'elenco, e il bottone di download porta nome e
        // taglia" — una seconda prova identica sarebbe la copia che diventa un
        // futuro bug, non una garanzia in più.

        it('item 5: copia il link vero negli appunti, e lo conferma a schermo', async () => {
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            await wrapper.get('[data-testid="talos-models-copy-link"]').trigger('click')
            await flushPromises()

            expect(clipboard.write).toHaveBeenCalledWith('https://huggingface.co/unsloth/a-very-long-qwen-coder-repository-name-for-mobile')
            expect(wrapper.find('[data-testid="talos-models-copy-confirm"]').exists()).toBe(true)
        })

        /** AL CONTRARIO del test sopra: quando il copia-appunti fallisce, si dichiara il fallimento, non un successo finto. */
        it('item 5, al contrario: un copia-appunti fallito mostra l\'errore, non una finta conferma', async () => {
            clipboard.write.mockRejectedValueOnce(new Error('TALOS_CLIPBOARD_UNAVAILABLE'))
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            await wrapper.get('[data-testid="talos-models-copy-link"]').trigger('click')
            await flushPromises()

            expect(wrapper.find('[data-testid="talos-models-copy-confirm"]').exists()).toBe(false)
            expect(wrapper.text()).toContain('Could not copy the link')
        })

        it('item 6: lo slider porta le tacche numeriche del range vero (2K…128K)', async () => {
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            const tacche = wrapper.get('[data-testid="talos-models-context-ticks"]').text()
            expect(tacche).toContain('2K')
            expect(tacche).toContain('128K')
        })

        /**
         * Fixture minima e locale a questo blocco: la `letta()` che porta lo
         * stesso ledger a otto righe vive dentro il describe "Model Lab
         * Blocco 4" qui sopra e non è visibile da fuori — questa ne è la
         * forma ridotta, sufficiente per superare `state === 'read'` nel
         * template senza duplicare le otto righe del ledger che qui non
         * servono a nulla.
         */
        function esaminataCon(kvCacheTypeLabel: 'f16' | 'q8_0' | 'other') {
            return {
                state: 'read' as const,
                fit: {
                    band: 'comfortable' as const, reason: 'fits' as const,
                    kvCacheBytes: 268_435_456, requiredBytes: 768_435_456, residentBytes: 6_000_000_000,
                    deficitBytes: 0, tokensPerSecond: 12, maxContext: 32_768,
                },
                ledger: [{ label: 'weights' as const, bytes: 2_500_000_000, provenance: 'exact' as const }],
                kvCacheTypeLabel,
                quantisation: 'Q4_K_M', trainedContext: 131_072, parameterCount: 4_000_000_000,
                tensorTypeHistogram: null, quantizationVersion: null,
            }
        }

        it('item 7: il tipo di cache KV risolto si vede accanto all\'etichetta, anche in AUTOMATICA', async () => {
            harness.state.repo.sets[0].examination = esaminataCon('q8_0')
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            expect(wrapper.get('[data-testid="talos-models-kv-resolved"]').text()).toBe('Q8_0')
        })

        /** AL CONTRARIO: un header con un valore che non è nè F16 nè Q8_0 dichiara "Altro", non mente su uno dei due. */
        it('item 7, al contrario: un tipo KV non riconosciuto si dichiara "Altro", mai una scelta a caso fra F16/Q8_0', async () => {
            harness.state.repo.sets[0].examination = esaminataCon('other')
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            expect(wrapper.get('[data-testid="talos-models-kv-resolved"]').text()).toBe('Other')
        })

        it('item 8: le pillole mostrano parametri, formato, download e like veri', async () => {
            const wrapper = mount(TalosMobileLocalRepoDetail, {
                props: { repoId: 'unsloth/a-very-long-qwen-coder-repository-name-for-mobile', revision: 'sha' },
            })
            await flushPromises()

            expect(wrapper.get('[data-testid="talos-models-card-params"]').text()).toBe('4B')
            expect(wrapper.get('[data-testid="talos-models-card-downloads"]').text()).toContain('309.6K')
            expect(wrapper.text()).toContain('234 ★')
        })
    })
})
